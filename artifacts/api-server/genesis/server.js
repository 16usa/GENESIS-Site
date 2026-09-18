const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const LIVE_CACHE_MS = 10000;
const BUILD = 'GENESIS_LIVE_DASH_V1_6';

const RPC_ENDPOINTS = [
  process.env.SOLANA_RPC_URL,
  'https://rpc.solanatracker.io/public',
  'https://api.mainnet-beta.solana.com',
  'https://api.mainnet.solana.com'
].filter(Boolean).filter((value, index, arr) => arr.indexOf(value) === index);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function readGenesisConfig() {
  const fallback = { mint: '', initialSupply: 1000000000 };
  try {
    const text = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
    const mint = (text.match(/contractAddress:\s*['\"]([^'\"]*)['\"]/) || [])[1] || '';
    const initialSupplyRaw = (text.match(/circulatingSupply:\s*([0-9.]+)/) || [])[1];
    return {
      mint,
      initialSupply: Number(initialSupplyRaw || fallback.initialSupply),
    };
  } catch {
    return fallback;
  }
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(body));
}

async function fetchJson(url, options = {}, timeoutMs = 5500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GENESIS-Live/1.5',
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function rpcAt(endpoint, method, params) {
  const payload = await fetchJson(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  }, 5000);
  if (payload.error) throw new Error(payload.error.message || 'Solana RPC error');
  return payload.result;
}

function sourceName(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'solana-rpc'; }
}

async function getSupply(mint) {
  const errors = [];
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const result = await rpcAt(endpoint, 'getTokenSupply', [mint, { commitment: 'confirmed' }]);
      const value = result && result.value;
      if (!value || value.uiAmountString == null) throw new Error('Token supply unavailable');
      const supply = Number(value.uiAmountString);
      if (!Number.isFinite(supply)) throw new Error('Invalid supply');
      return {
        supply,
        rawAmount: value.amount,
        decimals: Number(value.decimals || 0),
        slot: result.context && result.context.slot,
        source: sourceName(endpoint),
      };
    } catch (error) {
      errors.push(`${sourceName(endpoint)}: ${error && error.message || 'failed'}`);
    }
  }
  const error = new Error('All Solana RPC endpoints failed');
  error.details = errors;
  throw error;
}

function normalizePumpCoin(payload) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0] || null;
  if (payload.coin && typeof payload.coin === 'object') return payload.coin;
  if (payload.data && !Array.isArray(payload.data) && typeof payload.data === 'object') return payload.data;
  return payload;
}

function toUiTokenAmount(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1000000000000 ? n / 1000000 : n;
}

function estimateCurveProgress(coin, totalSupplyRaw) {
  if (coin && coin.complete) return { pct: 100, estimated: false, basis: 'complete' };

  const totalUi = toUiTokenAmount(totalSupplyRaw);
  const realUi = toUiTokenAmount(coin && (coin.real_token_reserves ?? coin.realTokenReserves));

  // Pump marks graduation when real_token_reserves reaches zero. For the standard
  // Pump launch curve, initial real reserves are 79.31% of total supply. We use
  // the live real reserve when available, and label this EST. because the API does
  // not expose the historical Global initial reserve for each token.
  if (Number.isFinite(totalUi) && totalUi > 0 && Number.isFinite(realUi) && realUi >= 0) {
    const initialRealUi = totalUi * 0.7931;
    if (initialRealUi > 0) {
      const pct = Math.max(0, Math.min(100, (1 - (realUi / initialRealUi)) * 100));
      return { pct, estimated: true, basis: 'real-token-reserves' };
    }
  }

  // Fallback for responses where real reserves are omitted.
  const virtualRaw = Number(coin && (coin.virtual_token_reserves ?? coin.virtualTokenReserves));
  const totalRaw = Number(totalSupplyRaw);
  if (!Number.isFinite(virtualRaw) || !Number.isFinite(totalRaw) || virtualRaw <= 0 || totalRaw <= 0) {
    return { pct: null, estimated: true, basis: null };
  }

  const initialVirtual = totalRaw * 1.073;
  const initialReal = totalRaw * 0.7931;
  if (initialReal <= 0) return { pct: null, estimated: true, basis: null };

  const sold = initialVirtual - virtualRaw;
  const pct = Math.max(0, Math.min(100, (sold / initialReal) * 100));
  return { pct, estimated: true, basis: 'virtual-token-reserves' };
}

async function getPumpCoin(mint) {
  const payload = await fetchJson(
    `https://frontend-api-v3.pump.fun/coins-v2/${encodeURIComponent(mint)}`,
    {},
    6000
  );
  const coin = normalizePumpCoin(payload);
  if (!coin || String(coin.mint || mint) !== mint) {
    throw new Error('Pump.fun coin response invalid');
  }

  const marketCapUsd = Number(coin.usd_market_cap ?? coin.usdMarketCap ?? coin.market_cap_usd);
  const marketCapSol = Number(coin.market_cap ?? coin.marketCap);
  const usdPriceDirect = Number(coin.usd_price ?? coin.price_usd ?? coin.priceUsd);
  const totalSupplyRaw = Number(coin.total_supply ?? coin.totalSupply);
  const virtualSolRaw = Number(coin.virtual_sol_reserves ?? coin.virtualSolReserves);
  const virtualTokenRaw = Number(coin.virtual_token_reserves ?? coin.virtualTokenReserves);
  const realTokenRaw = Number(coin.real_token_reserves ?? coin.realTokenReserves);
  const pumpSupplyUi = toUiTokenAmount(totalSupplyRaw);
  const curve = estimateCurveProgress(coin, totalSupplyRaw);

  return {
    name: coin.name || null,
    symbol: coin.symbol || null,
    complete: Boolean(coin.complete),
    bondingCurve: coin.bonding_curve || null,
    associatedBondingCurve: coin.associated_bonding_curve || null,
    pumpSwapPool: coin.pump_swap_pool || null,
    marketCapUsd: Number.isFinite(marketCapUsd) && marketCapUsd > 0 ? marketCapUsd : null,
    marketCapSol: Number.isFinite(marketCapSol) && marketCapSol > 0 ? marketCapSol : null,
    usdPrice: Number.isFinite(usdPriceDirect) && usdPriceDirect > 0 ? usdPriceDirect : null,
    pumpSupplyUi,
    virtualSolReserves: Number.isFinite(virtualSolRaw) && virtualSolRaw > 0 ? virtualSolRaw / 1e9 : null,
    virtualTokenReserves: toUiTokenAmount(virtualTokenRaw),
    realTokenReserves: toUiTokenAmount(realTokenRaw),
    curveProgressPct: curve.pct,
    curveProgressEstimated: curve.estimated,
    curveProgressBasis: curve.basis,
    replyCount: Number.isFinite(Number(coin.reply_count)) ? Number(coin.reply_count) : null,
    lastTradeTimestamp: Number.isFinite(Number(coin.last_trade_timestamp)) ? Number(coin.last_trade_timestamp) : null,
  };
}

async function getPumpSolPrice() {
  const payload = await fetchJson('https://frontend-api-v3.pump.fun/sol-price', {}, 4500);
  const value = Number(payload && (payload.solPrice ?? payload.price ?? payload.usd));
  if (!Number.isFinite(value) || value <= 0) throw new Error('Pump.fun SOL price unavailable');
  return value;
}

let liveCache = { expiresAt: 0, data: null, inflight: null };

async function buildLiveData() {
  const cfg = readGenesisConfig();
  if (!cfg.mint) throw new Error('Mint is not configured');

  const errors = [];
  let pumpData = null;
  let supplyData = null;
  let solPriceUsd = null;

  const [pumpResult, supplyResult, solPriceResult] = await Promise.allSettled([
    getPumpCoin(cfg.mint),
    getSupply(cfg.mint),
    getPumpSolPrice(),
  ]);

  if (pumpResult.status === 'fulfilled') pumpData = pumpResult.value;
  else errors.push(`pump: ${pumpResult.reason && pumpResult.reason.message || 'failed'}`);

  if (supplyResult.status === 'fulfilled') supplyData = supplyResult.value;
  else {
    const reason = supplyResult.reason;
    errors.push(`solana: ${reason && reason.message || 'failed'}`);
    if (reason && Array.isArray(reason.details)) errors.push(...reason.details);
  }

  if (solPriceResult.status === 'fulfilled') solPriceUsd = solPriceResult.value;
  else errors.push(`sol-price: ${solPriceResult.reason && solPriceResult.reason.message || 'failed'}`);

  const currentSupply = supplyData && Number.isFinite(supplyData.supply)
    ? supplyData.supply
    : (pumpData && Number.isFinite(pumpData.pumpSupplyUi) ? pumpData.pumpSupplyUi : null);

  const initialSupply = Number(cfg.initialSupply || 1000000000);
  const burnedTokens = supplyData && currentSupply != null
    ? Math.max(0, initialSupply - currentSupply)
    : null;
  const burnedPct = burnedTokens == null || initialSupply <= 0
    ? null
    : (burnedTokens / initialSupply) * 100;

  let marketCapUsd = pumpData && pumpData.marketCapUsd || null;
  if (!marketCapUsd && pumpData && pumpData.marketCapSol && solPriceUsd) {
    marketCapUsd = pumpData.marketCapSol * solPriceUsd;
  }

  let usdPrice = pumpData && pumpData.usdPrice || null;
  const priceSupply = currentSupply || initialSupply;
  if (!usdPrice && marketCapUsd && priceSupply > 0) {
    usdPrice = marketCapUsd / priceSupply;
  }

  const ok = Boolean(pumpData || supplyData || marketCapUsd || usdPrice);

  return {
    ok,
    build: BUILD,
    mint: cfg.mint,
    name: pumpData && pumpData.name || null,
    symbol: pumpData && pumpData.symbol || null,
    graduated: pumpData ? pumpData.complete : null,
    curveStatus: pumpData ? (pumpData.complete ? 'GRADUATED' : 'ACTIVE') : null,
    curveProgressPct: pumpData && pumpData.curveProgressPct != null ? pumpData.curveProgressPct : null,
    curveProgressEstimated: pumpData ? pumpData.curveProgressEstimated : null,
    curveProgressBasis: pumpData ? pumpData.curveProgressBasis : null,
    bondingCurve: pumpData && pumpData.bondingCurve || null,
    pumpSwapPool: pumpData && pumpData.pumpSwapPool || null,
    usdPrice,
    marketCapUsd,
    marketCapSol: pumpData && pumpData.marketCapSol || null,
    solPriceUsd,
    virtualSolReserves: pumpData && pumpData.virtualSolReserves || null,
    virtualTokenReserves: pumpData && pumpData.virtualTokenReserves || null,
    supply: currentSupply,
    initialSupply,
    burnedTokens,
    burnedPct,
    decimals: supplyData && supplyData.decimals,
    slot: supplyData && supplyData.slot,
    replyCount: pumpData && pumpData.replyCount,
    lastTradeTimestamp: pumpData && pumpData.lastTradeTimestamp,
    sources: {
      market: pumpData ? 'pump.fun' : null,
      supply: supplyData ? supplyData.source : (pumpData && pumpData.pumpSupplyUi != null ? 'pump.fun-fallback' : null),
      solPrice: solPriceUsd ? 'pump.fun' : null,
    },
    errors,
    updatedAt: new Date().toISOString(),
    refreshMs: LIVE_CACHE_MS,
  };
}

async function getLiveData(force = false) {
  const now = Date.now();
  if (!force && liveCache.data && liveCache.expiresAt > now) return liveCache.data;
  if (!force && liveCache.inflight) return liveCache.inflight;

  const promise = buildLiveData()
    .then((data) => {
      liveCache.data = data;
      liveCache.expiresAt = Date.now() + LIVE_CACHE_MS;
      return data;
    });

  if (!force) {
    liveCache.inflight = promise.finally(() => { liveCache.inflight = null; });
    return liveCache.inflight;
  }
  return promise;
}

function safePath(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]);
  const file = clean === '/' ? '/index.html' : clean;
  const resolved = path.normalize(path.join(root, file));
  return resolved.startsWith(root) ? resolved : null;
}

const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);

  if (req.method === 'GET' && (pathname === '/genesis-live' || pathname === '/api/token-live')) {
    try {
      const data = await getLiveData(false);
      json(res, 200, data);
    } catch (error) {
      json(res, 200, {
        ok: false,
        build: BUILD,
        error: error && error.message || 'Live data unavailable',
        errors: error && error.details || [],
        updatedAt: new Date().toISOString(),
        refreshMs: LIVE_CACHE_MS,
      });
    }
    return;
  }

  if (req.method === 'GET' && (pathname === '/genesis-live-debug' || pathname === '/api/live-debug')) {
    try {
      const data = await getLiveData(true);
      json(res, 200, {
        ...data,
        rpcEndpoints: RPC_ENDPOINTS.map(sourceName),
      });
    } catch (error) {
      json(res, 200, {
        ok: false,
        build: BUILD,
        error: error && error.message || 'Live data unavailable',
        errors: error && error.details || [],
        rpcEndpoints: RPC_ENDPOINTS.map(sourceName),
        updatedAt: new Date().toISOString(),
      });
    }
    return;
  }

  if (req.method === 'GET' && (pathname === '/genesis-health' || pathname === '/api/health')) {
    json(res, 200, { ok: true, service: 'genesis', liveData: true, build: BUILD });
    return;
  }

  const filePath = safePath(req.url);
  if (!filePath) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      fs.readFile(path.join(root, 'index.html'), (fallbackErr, data) => {
        if (fallbackErr) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(data);
      });
      return;
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) { res.writeHead(500); res.end('Server error'); return; }
      res.writeHead(200, {
        'Content-Type': types[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`GENESIS live dashboard v1.5 running on 0.0.0.0:${port}`);
});

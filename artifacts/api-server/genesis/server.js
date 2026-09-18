const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const LIVE_CACHE_MS = 12000;

const RPC_ENDPOINTS = [
  process.env.SOLANA_RPC_URL,
  'https://api.mainnet-beta.solana.com',
  'https://api.mainnet.solana.com',
  'https://rpc.ankr.com/solana'
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
        'User-Agent': 'GENESIS-Live/1.1',
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

async function getSupply(mint) {
  const errors = [];
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const result = await rpcAt(endpoint, 'getTokenSupply', [mint, { commitment: 'confirmed' }]);
      const value = result && result.value;
      if (!value || value.uiAmountString == null) throw new Error('Token supply unavailable');
      return {
        supply: Number(value.uiAmountString),
        rawAmount: value.amount,
        decimals: Number(value.decimals || 0),
        slot: result.context && result.context.slot,
        source: endpoint
      };
    } catch (error) {
      errors.push(`${endpoint}: ${error && error.message || 'failed'}`);
    }
  }
  const error = new Error('All Solana RPC endpoints failed');
  error.details = errors;
  throw error;
}

function chooseBestPair(pairs, mint) {
  if (!Array.isArray(pairs) || !pairs.length) return null;
  const candidates = pairs.filter((pair) => {
    if (!pair || pair.chainId !== 'solana') return false;
    const base = pair.baseToken && pair.baseToken.address;
    const quote = pair.quoteToken && pair.quoteToken.address;
    return base === mint || quote === mint;
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0));
  return candidates[0];
}

async function getDexMarket(mint) {
  const url = `https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(mint)}`;
  const payload = await fetchJson(url, {}, 5500);
  const pair = chooseBestPair(payload, mint);
  if (!pair) throw new Error('No Solana market pair found');

  const usdPrice = Number(pair.priceUsd);
  const marketCapUsd = Number(pair.marketCap);
  const fdv = Number(pair.fdv);
  const liquidityUsd = Number(pair.liquidity && pair.liquidity.usd);

  return {
    name: pair.baseToken && pair.baseToken.address === mint ? pair.baseToken.name : pair.quoteToken && pair.quoteToken.name,
    symbol: pair.baseToken && pair.baseToken.address === mint ? pair.baseToken.symbol : pair.quoteToken && pair.quoteToken.symbol,
    usdPrice: Number.isFinite(usdPrice) && usdPrice > 0 ? usdPrice : null,
    marketCapUsd: Number.isFinite(marketCapUsd) && marketCapUsd > 0 ? marketCapUsd : null,
    fdv: Number.isFinite(fdv) && fdv > 0 ? fdv : null,
    liquidityUsd: Number.isFinite(liquidityUsd) && liquidityUsd >= 0 ? liquidityUsd : null,
    dexId: pair.dexId || null,
    pairAddress: pair.pairAddress || null,
  };
}

let liveCache = { expiresAt: 0, data: null, inflight: null };

async function buildLiveData() {
  const cfg = readGenesisConfig();
  if (!cfg.mint) throw new Error('Mint is not configured');

  const errors = [];
  let supplyData = null;
  let marketData = null;

  const [supplyResult, marketResult] = await Promise.allSettled([
    getSupply(cfg.mint),
    getDexMarket(cfg.mint)
  ]);

  if (supplyResult.status === 'fulfilled') {
    supplyData = supplyResult.value;
  } else {
    errors.push(`solana: ${supplyResult.reason && supplyResult.reason.message || 'failed'}`);
    if (supplyResult.reason && supplyResult.reason.details) errors.push(...supplyResult.reason.details);
  }

  if (marketResult.status === 'fulfilled') {
    marketData = marketResult.value;
  } else {
    errors.push(`market: ${marketResult.reason && marketResult.reason.message || 'failed'}`);
  }

  const currentSupply = supplyData && Number.isFinite(supplyData.supply) ? supplyData.supply : null;
  const initialSupply = Number(cfg.initialSupply || 1000000000);
  const burnedTokens = currentSupply == null ? null : Math.max(0, initialSupply - currentSupply);
  const burnedPct = burnedTokens == null || initialSupply <= 0 ? null : (burnedTokens / initialSupply) * 100;

  const usdPrice = marketData && marketData.usdPrice || null;
  const marketCapUsd = marketData && (marketData.marketCapUsd || marketData.fdv) ||
    (usdPrice && currentSupply != null ? usdPrice * currentSupply : null);

  const ok = Boolean(supplyData || usdPrice || marketCapUsd);

  return {
    ok,
    partial: ok && Boolean(errors.length),
    mint: cfg.mint,
    name: marketData && marketData.name || null,
    symbol: marketData && marketData.symbol || null,
    usdPrice,
    marketCapUsd,
    fdv: marketData && marketData.fdv || null,
    liquidityUsd: marketData && marketData.liquidityUsd || null,
    supply: currentSupply,
    initialSupply,
    burnedTokens,
    burnedPct,
    decimals: supplyData && supplyData.decimals,
    slot: supplyData && supplyData.slot,
    sources: {
      supply: supplyData ? 'solana-rpc' : null,
      market: marketData ? 'dexscreener' : null,
      rpc: supplyData && supplyData.source || null,
      dex: marketData && marketData.dexId || null,
    },
    errors,
    updatedAt: new Date().toISOString(),
    refreshMs: LIVE_CACHE_MS,
  };
}

async function getLiveData() {
  const now = Date.now();
  if (liveCache.data && liveCache.expiresAt > now) return liveCache.data;
  if (liveCache.inflight) return liveCache.inflight;
  liveCache.inflight = buildLiveData()
    .then((data) => {
      liveCache.data = data;
      liveCache.expiresAt = Date.now() + LIVE_CACHE_MS;
      return data;
    })
    .finally(() => { liveCache.inflight = null; });
  return liveCache.inflight;
}

function safePath(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]);
  const file = clean === '/' ? '/index.html' : clean;
  const resolved = path.normalize(path.join(root, file));
  return resolved.startsWith(root) ? resolved : null;
}

const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);

  if (req.method === 'GET' && pathname === '/api/token-live') {
    try {
      const data = await getLiveData();
      json(res, data.ok ? 200 : 503, data);
    } catch (error) {
      json(res, 503, {
        ok: false,
        error: error && error.message || 'Live data unavailable',
        updatedAt: new Date().toISOString(),
      });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/live-debug') {
    try {
      const data = await buildLiveData();
      json(res, 200, data);
    } catch (error) {
      json(res, 200, {
        ok: false,
        error: error && error.message || 'debug failed',
        details: error && error.details || null,
        rpcEndpoints: RPC_ENDPOINTS.map((x) => x.replace(/([?&](?:api[-_]?key|key|token)=)[^&]+/ig, '$1***')),
        updatedAt: new Date().toISOString(),
      });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    json(res, 200, { ok: true, service: 'genesis', liveData: true, version: '1.1' });
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
  console.log(`GENESIS live data v1.1 running on 0.0.0.0:${port}`);
});

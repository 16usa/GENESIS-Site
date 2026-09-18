const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet.solana.com';
const LIVE_CACHE_MS = 12000;
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
  const fallback = {
    mint: '',
    initialSupply: 1000000000,
  };
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

async function fetchJson(url, options = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GENESIS-Live/1.0',
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function rpc(method, params) {
  const payload = await fetchJson(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (payload.error) throw new Error(payload.error.message || 'Solana RPC error');
  return payload.result;
}

async function getSupply(mint) {
  const result = await rpc('getTokenSupply', [mint, { commitment: 'confirmed' }]);
  const value = result && result.value;
  if (!value) throw new Error('Token supply unavailable');
  return {
    supply: Number(value.uiAmountString),
    rawAmount: value.amount,
    decimals: Number(value.decimals || 0),
    slot: result.context && result.context.slot,
  };
}

function parseUsdPrice(payload, mint) {
  const record = payload && (
    payload[mint] ||
    (payload.data && payload.data[mint]) ||
    (payload.data && Array.isArray(payload.data) && payload.data.find((x) => x && (x.id === mint || x.mint === mint)))
  );
  if (!record) return null;
  const value = Number(record.usdPrice ?? record.price ?? record.priceUsd ?? record.usd_price);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function getJupiterPrice(mint) {
  const urls = [
    `https://api.jup.ag/price/v3?ids=${encodeURIComponent(mint)}`,
    `https://lite-api.jup.ag/price/v3?ids=${encodeURIComponent(mint)}`
  ];
  let lastError;
  for (const url of urls) {
    try {
      const payload = await fetchJson(url, {}, 4200);
      const price = parseUsdPrice(payload, mint);
      if (price) return { usdPrice: price, source: 'jupiter' };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('USD price unavailable');
}

async function getPumpMarket(mint) {
  const url = `https://frontend-api-v3.pump.fun/coins/${encodeURIComponent(mint)}?sync=true`;
  const coin = await fetchJson(url, {}, 4200);
  const marketCapUsd = Number(coin && (coin.usd_market_cap ?? coin.usdMarketCap ?? coin.market_cap_usd));
  const marketCapSol = Number(coin && (coin.market_cap ?? coin.marketCap));
  const priceUsd = Number(coin && (coin.usd_price ?? coin.price_usd ?? coin.priceUsd));
  return {
    name: coin && coin.name,
    symbol: coin && coin.symbol,
    marketCapUsd: Number.isFinite(marketCapUsd) && marketCapUsd > 0 ? marketCapUsd : null,
    marketCapSol: Number.isFinite(marketCapSol) && marketCapSol > 0 ? marketCapSol : null,
    usdPrice: Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : null,
  };
}

let liveCache = { expiresAt: 0, data: null, inflight: null };

async function buildLiveData() {
  const cfg = readGenesisConfig();
  if (!cfg.mint) throw new Error('Mint is not configured');

  const errors = [];
  let supplyData = null;
  let pumpData = null;
  let jupiterData = null;

  const [supplyResult, pumpResult] = await Promise.allSettled([
    getSupply(cfg.mint),
    getPumpMarket(cfg.mint)
  ]);

  if (supplyResult.status === 'fulfilled') supplyData = supplyResult.value;
  else errors.push(`solana: ${supplyResult.reason && supplyResult.reason.message || 'failed'}`);

  if (pumpResult.status === 'fulfilled') pumpData = pumpResult.value;
  else errors.push(`pump: ${pumpResult.reason && pumpResult.reason.message || 'failed'}`);

  if (!pumpData || !pumpData.usdPrice || !pumpData.marketCapUsd) {
    try {
      jupiterData = await getJupiterPrice(cfg.mint);
    } catch (error) {
      errors.push(`jupiter: ${error.message || 'failed'}`);
    }
  }

  const currentSupply = supplyData && Number.isFinite(supplyData.supply) ? supplyData.supply : null;
  const initialSupply = Number(cfg.initialSupply || 1000000000);
  const burnedTokens = currentSupply == null ? null : Math.max(0, initialSupply - currentSupply);
  const burnedPct = burnedTokens == null || initialSupply <= 0 ? null : (burnedTokens / initialSupply) * 100;

  const usdPrice = (pumpData && pumpData.usdPrice) || (jupiterData && jupiterData.usdPrice) || null;
  const marketCapUsd = (pumpData && pumpData.marketCapUsd) ||
    (usdPrice && currentSupply != null ? usdPrice * currentSupply : null);

  const marketSource = pumpData && (pumpData.marketCapUsd || pumpData.usdPrice) ? 'pump.fun' : (jupiterData ? 'jupiter' : null);

  return {
    ok: Boolean(supplyData || marketCapUsd || usdPrice),
    mint: cfg.mint,
    name: pumpData && pumpData.name || null,
    symbol: pumpData && pumpData.symbol || null,
    usdPrice,
    marketCapUsd,
    marketCapSol: pumpData && pumpData.marketCapSol || null,
    supply: currentSupply,
    initialSupply,
    burnedTokens,
    burnedPct,
    decimals: supplyData && supplyData.decimals,
    slot: supplyData && supplyData.slot,
    sources: {
      supply: supplyData ? 'solana-rpc' : null,
      market: marketSource,
      pump: Boolean(pumpData),
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

  if (req.method === 'GET' && pathname === '/api/health') {
    json(res, 200, { ok: true, service: 'genesis', liveData: true });
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
  console.log(`GENESIS live data running on 0.0.0.0:${port}`);
});

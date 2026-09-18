(() => {
  'use strict';

  const BUILD = 'GENESIS_LIVE_DATA_V1';
  const c = window.GENESIS_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const fmtCompact = (n, digits = 1) => {
    const value = Number(n);
    if (!Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${(value / 1e9).toFixed(digits)}B`;
    if (abs >= 1e6) return `${(value / 1e6).toFixed(digits)}M`;
    if (abs >= 1e3) return `${(value / 1e3).toFixed(digits)}K`;
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  };

  const fmtMoney = (n) => {
    const value = Number(n);
    if (!Number.isFinite(value) || value <= 0) return '—';
    if (value >= 1000) return `$${fmtCompact(value)}`;
    if (value >= 1) return `$${value.toFixed(2)}`;
    if (value >= 0.01) return `$${value.toFixed(4)}`;
    return `$${value.toPrecision(3)}`;
  };

  const mint = String(c.contractAddress || '').trim();
  const burnPercent = $('burnPercent');
  const mintValue = $('mintValue');
  const copyButton = $('copyButton');
  const pumpButton = $('pumpButton');
  const explorerLink = $('explorerLink');
  const toast = $('toast');

  if (burnPercent) burnPercent.textContent = `${Number(c.burnPercent || 0)}%`;
  if (mintValue) mintValue.textContent = mint || 'NOT SET';

  if (copyButton) {
    copyButton.textContent = mint ? `${mint.slice(0, 5)}…${mint.slice(-5)}  ·  COPY` : 'CONTRACT NOT SET';
    if (mint) copyButton.classList.remove('disabled');
  }

  if (pumpButton && c.pumpUrl) {
    pumpButton.href = c.pumpUrl;
    pumpButton.classList.remove('disabled');
    pumpButton.removeAttribute('aria-disabled');
  }

  if (explorerLink && c.explorerUrl) {
    explorerLink.href = c.explorerUrl;
    explorerLink.textContent = 'OPEN TRANSACTION HISTORY ↗';
    explorerLink.classList.remove('disabled');
    explorerLink.removeAttribute('aria-disabled');
    explorerLink.target = '_blank';
    explorerLink.rel = 'noopener noreferrer';
  }

  let toastTimer = 0;
  const showToast = (text) => {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1200);
  };

  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      if (!mint) return;
      try {
        await navigator.clipboard.writeText(mint);
        showToast('CONTRACT COPIED');
      } catch {
        showToast('COPY FAILED');
      }
    });
  }

  const priceValue = $('feesValue');
  const marketCapValue = $('buybackValue');
  const burnedValue = $('burnedValue');
  const updatedValue = $('countdownValue');
  const supplyValue = $('supplyValue');
  const burnRateValue = $('burnRateValue');
  const engineStatus = $('engineStatus');
  const coreLive = $('coreLive');
  const priceNote = $('priceNote');
  const marketNote = $('marketNote');

  let lastUpdatedAt = 0;
  let refreshMs = 15000;
  let liveTimer = 0;
  let ageTimer = 0;

  function setStatus(mode, source) {
    if (!engineStatus) return;
    const label = engineStatus.querySelector('span:last-child');
    if (mode === 'ok') {
      engineStatus.classList.remove('offline');
      if (label) label.textContent = source ? ` LIVE · ${source.toUpperCase()}` : ' LIVE DATA';
    } else {
      engineStatus.classList.add('offline');
      if (label) label.textContent = ' DATA RETRY';
    }
  }

  function updateAge() {
    if (!updatedValue) return;
    if (!lastUpdatedAt) {
      updatedValue.textContent = '—';
      return;
    }
    const sec = Math.max(0, Math.floor((Date.now() - lastUpdatedAt) / 1000));
    updatedValue.textContent = sec < 2 ? 'NOW' : `${sec}S`;
  }

  async function loadLive() {
    try {
      const response = await fetch(`/api/token-live?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data || !data.ok) throw new Error(data && data.error || 'Live data unavailable');

      const source = data.sources && data.sources.market;
      if (priceValue) priceValue.textContent = fmtMoney(data.usdPrice);
      if (marketCapValue) marketCapValue.textContent = fmtMoney(data.marketCapUsd);
      if (burnedValue) burnedValue.textContent = data.burnedTokens == null ? '—' : fmtCompact(data.burnedTokens, 2);
      if (supplyValue) supplyValue.textContent = data.supply == null ? '—' : fmtCompact(data.supply, 2);
      if (burnRateValue) burnRateValue.textContent = data.burnedPct == null ? '—' : `${Number(data.burnedPct).toFixed(4)}%`;
      if (priceNote) priceNote.textContent = source ? `${source} USD` : 'live USD';
      if (marketNote) marketNote.textContent = source ? `${source} market` : 'live USD';
      if (coreLive) coreLive.textContent = data.usdPrice ? fmtMoney(data.usdPrice) : 'SOL · LIVE';

      lastUpdatedAt = Date.parse(data.updatedAt) || Date.now();
      refreshMs = Math.max(10000, Number(data.refreshMs || 15000));
      setStatus('ok', source || (data.sources && data.sources.supply));
      updateAge();
    } catch (error) {
      setStatus('error');
      if (coreLive) coreLive.textContent = 'RETRYING';
    } finally {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(loadLive, refreshMs);
    }
  }

  clearInterval(ageTimer);
  ageTimer = setInterval(updateAge, 1000);
  loadLive();

  document.documentElement.dataset.genesisRuntime = BUILD;
})();

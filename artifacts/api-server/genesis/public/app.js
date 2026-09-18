(() => {
  'use strict';

  const BUILD = 'GENESIS_TRANSPARENCY_V1_8';
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

  const fmtSol = (n) => {
    const value = Number(n);
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value >= 1000) return `${fmtCompact(value)} SOL`;
    return `${value.toFixed(value >= 100 ? 1 : 2)} SOL`;
  };

  const mint = String(c.contractAddress || '').trim();
  const genesisBurnAddress = String(c.genesisBurnAddress || '').trim();
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
  const marketCapSolValue = $('marketCapSolValue');
  const curveValue = $('curveValue');
  const curveNote = $('curveNote');
  const supplyValue = $('supplyValue');
  const supplyReducedValue = $('supplyReducedValue');
  const genesisBurnValue = $('genesisBurnValue');
  const curveStateValue = $('curveStateValue');
  const engineStatus = $('engineStatus');
  const coreLive = $('coreLive');
  const coreSymbol = $('coreSymbol');
  const coreProgress = $('coreProgress');
  const coreState = $('coreState');
  const reactorCore = $('reactorCore');
  const tickerValue = $('tickerValue');
  const trackedTokenLabel = $('trackedTokenLabel');
  const engineMode = $('engineMode');
  const priceNote = $('priceNote');
  const marketNote = $('marketNote');

  if (genesisBurnValue) {
    genesisBurnValue.textContent = genesisBurnAddress ? '—' : 'NOT CONFIGURED';
    genesisBurnValue.title = genesisBurnAddress
      ? `Genesis burn authority: ${genesisBurnAddress}`
      : 'Set GENESIS_CONFIG.genesisBurnAddress to track burns from the Genesis burn mechanism separately.';
  }

  let refreshMs = 10000;
  let liveTimer = 0;

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

  function paintCurve(data) {
    const graduated = data.graduated === true;
    const rawProgress = Number(data.curveProgressPct);
    const hasProgress = Number.isFinite(rawProgress);
    const progress = graduated ? 100 : (hasProgress ? Math.max(0, Math.min(100, rawProgress)) : 0);
    const estimate = Boolean(data.curveProgressEstimated) && !graduated;
    const progressText = hasProgress || graduated
      ? `${progress.toFixed(progress < 10 ? 1 : 0)}%`
      : '—';

    if (reactorCore) reactorCore.style.setProperty('--curve-progress', progress.toFixed(2));
    if (coreProgress) coreProgress.textContent = progressText;

    if (curveValue) curveValue.textContent = graduated ? 'GRADUATED' : 'ACTIVE';
    if (curveNote) {
      curveNote.textContent = graduated
        ? '100% · PumpSwap'
        : (hasProgress ? `${estimate ? 'EST. · ' : ''}${progressText} COMPLETE` : 'bonding curve active');
    }
    if (curveStateValue) curveStateValue.textContent = graduated ? 'GRADUATED' : 'ACTIVE';
    if (coreState) coreState.textContent = graduated ? 'GRADUATED' : (estimate ? 'EST. CURVE' : 'BONDING CURVE');
    if (engineMode) engineMode.textContent = graduated ? 'LIVE PUMP.FUN / PUMPSWAP' : 'LIVE PUMP.FUN / BONDING CURVE';
  }

  function paintTokenIdentity(data) {
    const symbol = String(data.symbol || c.ticker || 'GENESIS').replace(/^\$/, '');
    const name = String(data.name || c.tokenName || 'GENESIS');
    if (tickerValue) tickerValue.textContent = `$${symbol}`;
    if (trackedTokenLabel) {
      trackedTokenLabel.textContent = 'GENESIS / LIVE TOKEN';
      trackedTokenLabel.title = name;
    }
    if (coreSymbol) coreSymbol.textContent = `$${symbol}`;
  }

  async function loadLive() {
    try {
      const response = await fetch(`/genesis-live?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data || !data.ok) throw new Error(data && data.error || 'Live data unavailable');

      const source = data.sources && data.sources.market;
      paintTokenIdentity(data);
      paintCurve(data);

      if (priceValue) priceValue.textContent = fmtMoney(data.usdPrice);
      if (marketCapValue) marketCapValue.textContent = fmtMoney(data.marketCapUsd);
      if (marketCapSolValue) marketCapSolValue.textContent = fmtSol(data.marketCapSol);
      if (supplyValue) supplyValue.textContent = data.supply == null ? '—' : fmtCompact(data.supply, 2);

      // This is total mint-supply reduction versus the configured genesis supply.
      // It is deliberately NOT labelled as a Genesis burn.
      if (supplyReducedValue) {
        supplyReducedValue.textContent = data.burnedPct == null
          ? '—'
          : `${Number(data.burnedPct).toFixed(4)}%`;
        supplyReducedValue.title = data.burnedTokens == null
          ? 'On-chain supply reduction unavailable'
          : `${fmtCompact(data.burnedTokens, 2)} tokens below configured genesis supply`;
      }

      // Do not infer Genesis-specific burns from total supply reduction.
      // A dedicated burn authority/program must be configured and indexed separately.
      if (genesisBurnValue) {
        genesisBurnValue.textContent = genesisBurnAddress ? 'TRACKER PENDING' : 'NOT CONFIGURED';
      }

      if (priceNote) priceNote.textContent = source ? `${source} USD` : 'live USD';
      if (marketNote) marketNote.textContent = source ? `${source} market` : 'live USD';
      if (coreLive) coreLive.textContent = data.marketCapSol != null ? fmtSol(data.marketCapSol) : 'SOL / LIVE';

      refreshMs = Math.max(10000, Number(data.refreshMs || 10000));
      setStatus('ok', source || (data.sources && data.sources.supply));
    } catch (error) {
      setStatus('error');
      if (coreProgress) coreProgress.textContent = '—';
    } finally {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(loadLive, refreshMs);
    }
  }

  loadLive();
  document.documentElement.dataset.genesisRuntime = BUILD;
})();

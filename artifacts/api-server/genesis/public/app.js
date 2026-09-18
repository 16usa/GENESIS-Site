(() => {
  'use strict';

  const BUILD = 'GENESIS_PLATINUM_3D_V2_2';
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
    if (value >= 1000) return `$${fmtCompact(value, 1)}`;
    if (value >= 1) return `$${value.toFixed(2)}`;
    if (value >= 0.01) return `$${value.toFixed(4)}`;
    if (value >= 0.000001) return `$${value.toFixed(6)}`;
    return `$${value.toPrecision(3)}`;
  };

  const fmtSol = (n) => {
    const value = Number(n);
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M SOL`;
    if (value >= 1000) return `${fmtCompact(value, 1)} SOL`;
    return `${value.toFixed(value >= 100 ? 1 : 2)} SOL`;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const logScale = (value, minExp, maxExp) => {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return 0;
    const exp = Math.log10(v);
    return clamp(((exp - minExp) / (maxExp - minExp)) * 100, 0, 100);
  };

  const mint = String(c.contractAddress || '').trim();

  const priceValue = $('priceValue');
  const marketCapValue = $('marketCapValue');
  const marketCapSolValue = $('marketCapSolValue');
  const stateValue = $('stateValue');
  const supplyValue = $('supplyValue');
  const supplyReducedValue = $('supplyReducedValue');
  const copyButton = $('copyButton');
  const copyText = $('copyText');
  const coreSymbol = $('coreSymbol');
  const coreProgress = $('coreProgress');
  const coreState = $('coreState');
  const ringCurve = $('ringCurve');
  const ringMarket = $('ringMarket');
  const ringSol = $('ringSol');
  const ringBurn = $('ringBurn');
  const scene = $('scene');
  const toast = $('toast');

  let liveTimer = 0;
  let refreshMs = 10000;
  let toastTimer = 0;

  const setRing = (el, progress) => {
    if (!el) return;
    el.style.setProperty('--progress', `${clamp(progress, 0, 100).toFixed(2)}%`);
  };

  const setLiveState = (ok) => {
    document.documentElement.dataset.liveState = ok ? 'live' : 'retry';
  };

  const showToast = (text) => {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1100);
  };

  const setMint = () => {
    if (copyText) {
      copyText.textContent = mint ? `${mint.slice(0, 6)}…${mint.slice(-5)}` : 'NOT SET';
    }
  };

  setMint();

  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      if (!mint) return;
      try {
        await navigator.clipboard.writeText(mint);
        showToast('MINT COPIED');
      } catch {
        showToast('COPY FAILED');
      }
    });
  }

  const setIdentity = (data) => {
    const symbol = String(data.symbol || c.ticker || 'GENESIS').replace(/^\$/, '');
    if (coreSymbol) coreSymbol.textContent = `$${symbol}`;
    document.title = `$${symbol} · GENESIS`;
  };

  const setCurve = (data) => {
    const graduated = data.graduated === true;
    const raw = Number(data.curveProgressPct);
    const has = Number.isFinite(raw);
    const progress = graduated ? 100 : (has ? clamp(raw, 0, 100) : 0);
    const estimated = Boolean(data.curveProgressEstimated) && !graduated;

    document.documentElement.dataset.curveState = graduated ? 'graduated' : (has ? 'bonding' : 'sync');

    if (coreProgress) {
      coreProgress.textContent = graduated
        ? '100%'
        : (has ? `${progress.toFixed(progress < 10 ? 1 : 0)}%` : '—');
    }

    if (coreState) {
      coreState.textContent = graduated ? 'GRADUATED' : (estimated ? 'EST. CURVE' : 'BONDING');
    }

    if (stateValue) {
      stateValue.textContent = graduated ? 'PUMPSWAP' : 'CURVE';
    }

    setRing(ringCurve, progress);
    return { graduated, progress };
  };

  const setVisuals = (data, curve) => {
    const mcap = Number(data.marketCapUsd);
    const mcapSol = Number(data.marketCapSol);
    const burnedPct = Number(data.burnedPct);

    const marketVisual = logScale(mcap, 3, 9);
    const solVisual = logScale(mcapSol, 1, 7);
    const burnVisual = Number.isFinite(burnedPct) && burnedPct > 0
      ? clamp(Math.sqrt(burnedPct * 1000) * 10, 6, 100)
      : 0;

    setRing(ringMarket, marketVisual);
    setRing(ringSol, solVisual);
    setRing(ringBurn, burnVisual);

    document.documentElement.style.setProperty('--curve-value', `${curve.progress.toFixed(2)}%`);
    document.documentElement.style.setProperty('--market-value', `${marketVisual.toFixed(2)}%`);
    document.documentElement.style.setProperty('--sol-value', `${solVisual.toFixed(2)}%`);
    document.documentElement.style.setProperty('--burn-value', `${burnVisual.toFixed(2)}%`);
  };

  async function loadLive() {
    try {
      const response = await fetch(`/genesis-live?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data || !data.ok) {
        throw new Error((data && data.error) || 'Live data unavailable');
      }

      setLiveState(true);
      setIdentity(data);
      const curve = setCurve(data);
      setVisuals(data, curve);

      if (priceValue) priceValue.textContent = fmtMoney(data.usdPrice);
      if (marketCapValue) marketCapValue.textContent = fmtMoney(data.marketCapUsd);
      if (marketCapSolValue) marketCapSolValue.textContent = fmtSol(data.marketCapSol);
      if (supplyValue) supplyValue.textContent = data.supply == null ? '—' : fmtCompact(data.supply, 2);
      if (supplyReducedValue) {
        supplyReducedValue.textContent = data.burnedPct == null ? '—' : `${Number(data.burnedPct).toFixed(4)}%`;
      }

      refreshMs = Math.max(10000, Number(data.refreshMs || 10000));
    } catch (error) {
      setLiveState(false);
      document.documentElement.dataset.curveState = 'sync';
      if (coreProgress) coreProgress.textContent = '—';
      if (coreState) coreState.textContent = 'DATA RETRY';
      if (stateValue) stateValue.textContent = 'RETRY';
      if (priceValue) priceValue.textContent = '—';
      if (marketCapValue) marketCapValue.textContent = '—';
      if (marketCapSolValue) marketCapSolValue.textContent = '—';
      if (supplyValue) supplyValue.textContent = '—';
      if (supplyReducedValue) supplyReducedValue.textContent = '—';
      setRing(ringCurve, 0);
      setRing(ringMarket, 0);
      setRing(ringSol, 0);
      setRing(ringBurn, 0);
    } finally {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(loadLive, refreshMs);
    }
  }

  const applyTilt = (x, y) => {
    const nx = clamp(x, -1, 1);
    const ny = clamp(y, -1, 1);
    const tiltX = (nx * 6).toFixed(2);
    const tiltY = (ny * -6).toFixed(2);
    if (scene) {
      scene.style.setProperty('--tilt-x', `${tiltX}deg`);
      scene.style.setProperty('--tilt-y', `${tiltY}deg`);
    }
  };

  if (scene && window.matchMedia('(pointer:fine)').matches) {
    scene.addEventListener('pointermove', (event) => {
      const rect = scene.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      applyTilt(x, y);
    });
    scene.addEventListener('pointerleave', () => applyTilt(0, 0));
  }

  loadLive();
  document.documentElement.dataset.genesisRuntime = BUILD;
})();

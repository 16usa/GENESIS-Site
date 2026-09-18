(() => {
  'use strict';

  const BUILD = 'GENESIS_PLATINUM_3D_V2_1';
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
    if (value >= 1000) return `${fmtCompact(value, 1)} SOL`;
    return `${value.toFixed(value >= 100 ? 1 : 2)} SOL`;
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
  const scene = $('scene');
  const toast = $('toast');

  let liveTimer = 0;
  let refreshMs = 10000;
  let toastTimer = 0;

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

  const setLinks = () => {
    if (copyText) {
      copyText.textContent = mint
        ? `${mint.slice(0, 6)}…${mint.slice(-5)}`
        : 'NOT SET';
    }
  };

  setLinks();

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

  const setCurve = (data) => {
    const graduated = data.graduated === true;
    const raw = Number(data.curveProgressPct);
    const has = Number.isFinite(raw);
    const progress = graduated ? 100 : (has ? Math.max(0, Math.min(100, raw)) : 0);
    const energy = graduated ? 1 : (has ? progress / 100 : 0);
    const estimate = Boolean(data.curveProgressEstimated) && !graduated;

    document.documentElement.style.setProperty('--curve', progress.toFixed(3));
    document.documentElement.style.setProperty('--energy', energy.toFixed(3));
    document.documentElement.dataset.curveState = graduated ? 'graduated' : (has ? 'bonding' : 'sync');

    if (coreProgress) {
      coreProgress.textContent = graduated
        ? '100%'
        : (has ? `${progress.toFixed(progress < 10 ? 1 : 0)}%` : '—');
    }

    if (coreState) {
      coreState.textContent = graduated
        ? 'GRADUATED'
        : (estimate ? 'EST. CURVE' : 'BONDING CURVE');
    }

    if (stateValue) {
      stateValue.textContent = graduated ? 'PUMPSWAP' : 'CURVE';
    }
  };

  const setIdentity = (data) => {
    const symbol = String(data.symbol || c.ticker || 'GENESIS').replace(/^\$/, '');
    if (coreSymbol) coreSymbol.textContent = `$${symbol}`;
    document.title = `$${symbol} · GENESIS`;
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
      setCurve(data);

      if (priceValue) priceValue.textContent = fmtMoney(data.usdPrice);
      if (marketCapValue) marketCapValue.textContent = fmtMoney(data.marketCapUsd);
      if (marketCapSolValue) marketCapSolValue.textContent = fmtSol(data.marketCapSol);
      if (supplyValue) supplyValue.textContent = data.supply == null ? '—' : fmtCompact(data.supply, 2);
      if (supplyReducedValue) {
        supplyReducedValue.textContent = data.burnedPct == null
          ? '—'
          : `${Number(data.burnedPct).toFixed(4)}%`;
      }

      refreshMs = Math.max(10000, Number(data.refreshMs || 10000));
    } catch (error) {
      setLiveState(false);
      document.documentElement.dataset.curveState = 'sync';
      document.documentElement.style.setProperty('--curve', '0');
      document.documentElement.style.setProperty('--energy', '0');
      if (coreProgress) coreProgress.textContent = '—';
      if (coreState) coreState.textContent = 'DATA RETRY';
      if (stateValue) stateValue.textContent = 'RETRY';
      if (priceValue) priceValue.textContent = '—';
      if (marketCapValue) marketCapValue.textContent = '—';
      if (marketCapSolValue) marketCapSolValue.textContent = '—';
    } finally {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(loadLive, refreshMs);
    }
  }

  const applyTilt = (x, y) => {
    const nx = Math.max(-1, Math.min(1, x));
    const ny = Math.max(-1, Math.min(1, y));
    const tiltX = (nx * 4.5).toFixed(2);
    const tiltY = (ny * -3.5).toFixed(2);
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

  if (scene && window.DeviceOrientationEvent) {
    let orientationBound = false;
    const bindOrientation = () => {
      if (orientationBound) return;
      orientationBound = true;
      window.addEventListener('deviceorientation', (event) => {
        if (event.gamma == null || event.beta == null) return;
        applyTilt(event.gamma / 32, (event.beta - 45) / 45);
      }, { passive: true });
    };

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      scene.addEventListener('click', async () => {
        try {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission === 'granted') bindOrientation();
        } catch {}
      }, { once: true });
    } else {
      bindOrientation();
    }
  }

  loadLive();
  document.documentElement.dataset.genesisRuntime = BUILD;
})();

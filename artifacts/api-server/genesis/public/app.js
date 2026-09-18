(() => {
  'use strict';

  const BUILD = 'GENESIS_PLATINUM_3D_V2_0';
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
    if (value >= 1000000) return `$${fmtCompact(value, 1)}`;
    if (value >= 1000) return `$${fmtCompact(value, 1)}`;
    if (value >= 1) return `$${value.toFixed(2)}`;
    if (value >= .01) return `$${value.toFixed(4)}`;
    if (value >= .000001) return `$${value.toFixed(6)}`;
    return `$${value.toPrecision(3)}`;
  };

  const fmtSol = (n) => {
    const value = Number(n);
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value >= 1000) return `${fmtCompact(value, 1)} SOL`;
    return `${value.toFixed(value >= 100 ? 1 : 2)} SOL`;
  };

  const mint = String(c.contractAddress || '').trim();

  const tickerValue = $('tickerValue');
  const engineStatus = $('engineStatus');
  const priceValue = $('priceValue');
  const marketCapValue = $('marketCapValue');
  const marketCapSolValue = $('marketCapSolValue');
  const stateValue = $('stateValue');
  const sourceValue = $('sourceValue');
  const updatedValue = $('updatedValue');
  const supplyValue = $('supplyValue');
  const supplyReducedValue = $('supplyReducedValue');
  const copyButton = $('copyButton');
  const pumpButton = $('pumpButton');
  const explorerLink = $('explorerLink');
  const coreSymbol = $('coreSymbol');
  const coreProgress = $('coreProgress');
  const coreState = $('coreState');
  const scene = $('scene');
  const ringSystem = $('ringSystem');
  const core = $('core');
  const toast = $('toast');

  let liveTimer = 0;
  let ageTimer = 0;
  let refreshMs = 10000;
  let lastUpdated = 0;
  let toastTimer = 0;

  const setStatus = (ok, source) => {
    if (!engineStatus) return;
    engineStatus.classList.toggle('offline', !ok);
    const label = engineStatus.querySelector('span');
    if (label) {
      label.textContent = ok
        ? (source ? `LIVE · ${String(source).toUpperCase()}` : 'LIVE')
        : 'RETRY';
    }
  };

  const showToast = (text) => {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1100);
  };

  const setLinks = () => {
    if (copyButton) {
      copyButton.textContent = mint
        ? `${mint.slice(0, 6)}…${mint.slice(-5)}`
        : 'NOT SET';
    }

    if (pumpButton) {
      if (mint) {
        pumpButton.href = `https://pump.fun/?outputCurrency=${encodeURIComponent(mint)}`;
        pumpButton.classList.remove('disabled');
        pumpButton.removeAttribute('aria-disabled');
      }
    }

    if (explorerLink) {
      if (mint) {
        explorerLink.href = `https://solscan.io/token/${encodeURIComponent(mint)}`;
        explorerLink.classList.remove('disabled');
        explorerLink.removeAttribute('aria-disabled');
        explorerLink.target = '_blank';
        explorerLink.rel = 'noopener noreferrer';
      }
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
    const estimate = Boolean(data.curveProgressEstimated) && !graduated;

    document.documentElement.style.setProperty('--curve', progress.toFixed(3));

    if (coreProgress) {
      coreProgress.textContent = graduated
        ? '100%'
        : (has ? `${progress.toFixed(progress < 10 ? 1 : 0)}%` : 'LIVE');
    }

    if (coreState) {
      coreState.textContent = graduated
        ? 'GRADUATED'
        : (estimate ? 'EST. CURVE' : 'BONDING CURVE');
    }

    if (stateValue) {
      stateValue.textContent = graduated ? 'PUMPSWAP' : 'ACTIVE';
    }
  };

  const setIdentity = (data) => {
    const symbol = String(data.symbol || c.ticker || 'GENESIS').replace(/^\$/, '');
    if (tickerValue) tickerValue.textContent = `$${symbol}`;
    if (coreSymbol) coreSymbol.textContent = `$${symbol}`;
  };

  const updateAge = () => {
    if (!updatedValue) return;
    if (!lastUpdated) {
      updatedValue.textContent = 'SYNC';
      return;
    }
    const seconds = Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000));
    updatedValue.textContent = seconds < 2 ? 'NOW' : `${seconds}S`;
  };

  async function loadLive() {
    try {
      const response = await fetch(`/genesis-live?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data || !data.ok) {
        throw new Error(data && data.error || 'Live data unavailable');
      }

      const source = data.sources && data.sources.market;
      setIdentity(data);
      setCurve(data);
      setStatus(true, source);

      if (priceValue) priceValue.textContent = fmtMoney(data.usdPrice);
      if (marketCapValue) marketCapValue.textContent = fmtMoney(data.marketCapUsd);
      if (marketCapSolValue) marketCapSolValue.textContent = fmtSol(data.marketCapSol);
      if (sourceValue) sourceValue.textContent = data.graduated ? 'PUMPSWAP' : (source || 'PUMP.FUN').toUpperCase();
      if (supplyValue) supplyValue.textContent = data.supply == null ? '—' : fmtCompact(data.supply, 2);
      if (supplyReducedValue) {
        supplyReducedValue.textContent = data.burnedPct == null
          ? '—'
          : `${Number(data.burnedPct).toFixed(4)}%`;
      }

      lastUpdated = Date.parse(data.updatedAt) || Date.now();
      refreshMs = Math.max(10000, Number(data.refreshMs || 10000));
      updateAge();
    } catch (error) {
      setStatus(false);
      if (coreProgress) coreProgress.textContent = '—';
      if (coreState) coreState.textContent = 'DATA RETRY';
      if (stateValue) stateValue.textContent = 'RETRY';
    } finally {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(loadLive, refreshMs);
    }
  }

  clearInterval(ageTimer);
  ageTimer = setInterval(updateAge, 1000);

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

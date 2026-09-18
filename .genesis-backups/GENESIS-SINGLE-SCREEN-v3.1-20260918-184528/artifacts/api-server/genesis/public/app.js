(() => {
  'use strict';

  const BUILD = 'GENESIS_SINGLE_SCREEN_V3';
  const c = window.GENESIS_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const fmtUsd = (n) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0
  }).format(Number(n || 0));
  const fmtNum = (n) => new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  }).format(Number(n || 0));

  const fees = $('feesValue');
  const buyback = $('buybackValue');
  const burnedValue = $('burnedValue');
  const burnPercent = $('burnPercent');
  const ruleMirror = $('rulePercentMirror');
  const feeRouting = $('feeRoutingValue');
  const burnRate = $('burnRateValue');

  if (fees) fees.textContent = fmtUsd(c.totalFeesUsd);
  if (buyback) buyback.textContent = fmtUsd(c.totalBuybackUsd);
  if (burnedValue) burnedValue.textContent = fmtNum(c.burnedTokens);

  const pct = Number(c.burnPercent || 0);
  if (burnPercent) burnPercent.textContent = `${pct}%`;
  if (ruleMirror) ruleMirror.textContent = `${pct}%`;
  if (feeRouting) feeRouting.textContent = `${pct}% → Buyback`;

  const supply = Number(c.circulatingSupply || 0);
  const burned = Number(c.burnedTokens || 0);
  const burnedPct = supply + burned > 0 ? (burned / (supply + burned)) * 100 : 0;
  if (burnRate) burnRate.textContent = `${burnedPct.toFixed(2)}%`;

  const mint = String(c.contractAddress || '').trim();
  const mintValue = $('mintValue');
  const copyButton = $('copyButton');
  if (mintValue) mintValue.textContent = mint || 'NOT SET';
  if (copyButton) {
    copyButton.textContent = mint ? `${mint.slice(0, 5)}…${mint.slice(-5)} · COPY` : 'CONTRACT NOT SET';
    if (mint) copyButton.classList.remove('disabled');
  }

  const pumpButton = $('pumpButton');
  if (pumpButton && c.pumpUrl) {
    pumpButton.href = c.pumpUrl;
    pumpButton.classList.remove('disabled');
    pumpButton.removeAttribute('aria-disabled');
    pumpButton.target = '_blank';
    pumpButton.rel = 'noopener noreferrer';
  }

  const explorerLink = $('explorerLink');
  if (explorerLink && c.explorerUrl) {
    explorerLink.href = c.explorerUrl;
    explorerLink.textContent = 'OPEN TRANSACTION HISTORY ↗';
    explorerLink.classList.remove('disabled');
    explorerLink.removeAttribute('aria-disabled');
    explorerLink.target = '_blank';
    explorerLink.rel = 'noopener noreferrer';
  }

  const toast = $('toast');
  let toastTimer = 0;
  const showToast = (text) => {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1100);
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

  const countdown = $('countdownValue');
  const tick = () => {
    if (!countdown) return;
    if (!c.nextBuybackIso) {
      countdown.textContent = '—';
      return;
    }
    const diff = new Date(c.nextBuybackIso).getTime() - Date.now();
    if (!Number.isFinite(diff) || diff <= 0) {
      countdown.textContent = 'READY';
      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    countdown.textContent = h > 0 ? `${h}H ${m}M` : `${m}M ${String(s).padStart(2, '0')}S`;
  };
  tick();
  setInterval(tick, 1000);

  document.documentElement.dataset.genesisRuntime = BUILD;
})();

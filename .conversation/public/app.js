(() => {
  const c = window.GENESIS_CONFIG || {};
  const fmtUsd = n => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(Number(n || 0));
  const fmtNum = n => new Intl.NumberFormat('en-US', { maximumFractionDigits:0 }).format(Number(n || 0));

  document.getElementById('feesValue').textContent = fmtUsd(c.totalFeesUsd);
  document.getElementById('buybackValue').textContent = fmtUsd(c.totalBuybackUsd);
  document.getElementById('burnedValue').textContent = fmtNum(c.burnedTokens);
  document.getElementById('burnPercent').textContent = `${Number(c.burnPercent || 0)}%`;
  document.getElementById('feeRoutingValue').textContent = `${Number(c.burnPercent || 0)}% → Buyback Engine`;

  const supply = Number(c.circulatingSupply || 0);
  const burned = Number(c.burnedTokens || 0);
  const burnedPct = supply + burned > 0 ? (burned / (supply + burned)) * 100 : 0;
  document.getElementById('burnRateValue').textContent = `${burnedPct.toFixed(2)}%`;

  const mint = (c.contractAddress || '').trim();
  const mintValue = document.getElementById('mintValue');
  const copyButton = document.getElementById('copyButton');
  mintValue.textContent = mint || 'NOT SET';
  copyButton.textContent = mint ? `${mint.slice(0,5)}…${mint.slice(-5)}  ·  COPY` : 'CONTRACT NOT SET';
  if (mint) copyButton.classList.remove('disabled');

  const pumpButton = document.getElementById('pumpButton');
  if (c.pumpUrl) { pumpButton.href = c.pumpUrl; pumpButton.classList.remove('disabled'); pumpButton.removeAttribute('aria-disabled'); }

  const explorerLink = document.getElementById('explorerLink');
  if (c.explorerUrl) { explorerLink.href = c.explorerUrl; explorerLink.textContent = 'Open transaction history ↗'; explorerLink.classList.remove('disabled'); explorerLink.removeAttribute('aria-disabled'); explorerLink.target = '_blank'; explorerLink.rel = 'noopener noreferrer'; }

  const toast = document.getElementById('toast');
  function showToast(text) {
    toast.textContent = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1200);
  }
  copyButton.addEventListener('click', async () => {
    if (!mint) return;
    try { await navigator.clipboard.writeText(mint); showToast('CONTRACT COPIED'); }
    catch { showToast('COPY FAILED'); }
  });

  const countdown = document.getElementById('countdownValue');
  function tick() {
    if (!c.nextBuybackIso) { countdown.textContent = '—'; return; }
    const diff = new Date(c.nextBuybackIso).getTime() - Date.now();
    if (!Number.isFinite(diff) || diff <= 0) { countdown.textContent = 'READY'; return; }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    countdown.textContent = h > 0 ? `${h}H ${m}M` : `${m}M ${String(s).padStart(2,'0')}S`;
  }
  tick(); setInterval(tick, 1000);

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
  }, { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
})();

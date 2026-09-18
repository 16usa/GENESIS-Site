(() => {
  'use strict';

  const BUILD = 'GENESIS_COSMIC_3D_V3_0';
  const c = window.GENESIS_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

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
    if (value >= 1) return `$${value.toFixed(4).replace(/0+$/,'').replace(/\.$/,'')}`;
    if (value >= 0.01) return `$${value.toFixed(4)}`;
    if (value >= 0.000001) return `$${value.toFixed(6)}`;
    return `$${value.toPrecision(3)}`;
  };

  const fmtSol = (n) => {
    const value = Number(n);
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M SOL`;
    if (value >= 1e3) return `${fmtCompact(value, 1)} SOL`;
    return `${value.toFixed(value >= 100 ? 1 : 2)} SOL`;
  };

  const fmtPct = (n) => {
    const value = Number(n);
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value >= 100) return `${value.toFixed(0)}%`;
    if (value >= 10) return `${value.toFixed(1)}%`;
    if (value >= 1) return `${value.toFixed(2)}%`;
    if (value >= 0.01) return `${value.toFixed(3)}%`;
    return `${value.toFixed(4)}%`;
  };

  const logScale = (value, minExp, maxExp) => {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return clamp(((Math.log10(v) - minExp) / (maxExp - minExp)) * 100, 0, 100);
  };

  const priceValue = $('priceValue');
  const marketCapValue = $('marketCapValue');
  const supplyValue = $('supplyValue');
  const marketCapSolValue = $('marketCapSolValue');
  const burnValue = $('burnValue');
  const ringPrice = $('ringPrice');
  const ringMcap = $('ringMcap');
  const ringSupply = $('ringSupply');
  const ringSol = $('ringSol');
  const mintValue = $('mintValue');
  const copyButton = $('copyButton');
  const toast = $('toast');
  const hero = $('hero');
  const orbitalSystem = $('orbitalSystem');

  const mint = String(c.contractAddress || '').trim();
  let liveTimer = 0;
  let refreshMs = 10000;
  let toastTimer = 0;

  const setRing = (el, pct) => {
    if (el) el.style.setProperty('--progress', `${clamp(pct, 0, 100).toFixed(2)}%`);
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

  if (mintValue) mintValue.textContent = mint || 'NOT SET';
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

  async function loadLive() {
    try {
      const response = await fetch(`/genesis-live?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data || !data.ok) throw new Error('Live data unavailable');

      setLiveState(true);

      const price = Number(data.usdPrice);
      const mcap = Number(data.marketCapUsd);
      const mcapSol = Number(data.marketCapSol);
      const supply = Number(data.supply);
      const initialSupply = Number(data.initialSupply || c.circulatingSupply || 1000000000);
      const burnedPct = Number(data.burnedPct);

      if (priceValue) priceValue.textContent = fmtMoney(price);
      if (marketCapValue) marketCapValue.textContent = fmtMoney(mcap);
      if (marketCapSolValue) marketCapSolValue.textContent = fmtSol(mcapSol);
      if (supplyValue) supplyValue.textContent = Number.isFinite(supply) ? fmtCompact(supply, 2) : '—';
      if (burnValue) burnValue.textContent = Number.isFinite(burnedPct) ? fmtPct(burnedPct) : '—';

      const priceVisual = logScale(price, -8, 0);
      const mcapVisual = logScale(mcap, 3, 9);
      const supplyVisual = Number.isFinite(supply) && Number.isFinite(initialSupply) && initialSupply > 0
        ? clamp((supply / initialSupply) * 100, 0, 100)
        : 0;
      const solVisual = logScale(mcapSol, 1, 7);

      setRing(ringPrice, priceVisual);
      setRing(ringMcap, mcapVisual);
      setRing(ringSupply, supplyVisual);
      setRing(ringSol, solVisual);

      refreshMs = Math.max(10000, Number(data.refreshMs || 10000));
    } catch {
      setLiveState(false);
      if (priceValue) priceValue.textContent = '—';
      if (marketCapValue) marketCapValue.textContent = '—';
      if (marketCapSolValue) marketCapSolValue.textContent = '—';
      if (supplyValue) supplyValue.textContent = '—';
      if (burnValue) burnValue.textContent = '—';
      setRing(ringPrice, 0);
      setRing(ringMcap, 0);
      setRing(ringSupply, 0);
      setRing(ringSol, 0);
    } finally {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(loadLive, refreshMs);
    }
  }

  const applyTilt = (x, y) => {
    if (!orbitalSystem) return;
    const nx = clamp(x, -1, 1);
    const ny = clamp(y, -1, 1);
    orbitalSystem.style.setProperty('--tilt-x', `${(nx * 6).toFixed(2)}deg`);
    orbitalSystem.style.setProperty('--tilt-y', `${(ny * -5).toFixed(2)}deg`);
  };

  if (hero && window.matchMedia('(pointer:fine)').matches) {
    hero.addEventListener('pointermove', (event) => {
      const r = hero.getBoundingClientRect();
      applyTilt(((event.clientX - r.left) / r.width) * 2 - 1, ((event.clientY - r.top) / r.height) * 2 - 1);
    });
    hero.addEventListener('pointerleave', () => applyTilt(0, 0));
  }

  function startSpace() {
    const canvas = $('spaceCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stars = [];
    const streaks = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let last = 0;
    let nextStreak = 0;

    const rand = (a, b) => a + Math.random() * (b - a);

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      stars.length = 0;
      const count = Math.round(clamp((w * h) / 7200, 70, 150));
      for (let i = 0; i < count; i += 1) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: rand(.35, 1.25),
          a: rand(.18, .92),
          tw: rand(.0006, .0023),
          phase: rand(0, Math.PI * 2),
          drift: rand(.25, 1.05),
          hue: Math.random() > .83 ? 'gold' : 'blue'
        });
      }
    }

    function spawnStreak(now) {
      streaks.push({
        x: rand(-w * .1, w * .7),
        y: rand(h * .02, h * .6),
        vx: rand(120, 220),
        vy: rand(70, 150),
        life: 0,
        max: rand(700, 1200),
        len: rand(36, 78)
      });
      nextStreak = now + rand(2200, 5200);
    }

    function draw(now) {
      const dt = Math.min(32, now - last || 16);
      last = now;
      ctx.clearRect(0, 0, w, h);

      for (const s of stars) {
        s.y += s.drift * dt * .003;
        if (s.y > h + 4) s.y = -4;
        const alpha = clamp(s.a + Math.sin(now * s.tw + s.phase) * .22, .05, 1);
        ctx.beginPath();
        ctx.fillStyle = s.hue === 'gold' ? `rgba(255,210,149,${alpha})` : `rgba(145,218,255,${alpha})`;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (s.r > .95 && alpha > .65) {
          ctx.fillStyle = s.hue === 'gold' ? `rgba(255,213,155,${alpha * .20})` : `rgba(111,203,255,${alpha * .18})`;
          ctx.fillRect(s.x - 3, s.y, 6, .5);
          ctx.fillRect(s.x, s.y - 3, .5, 6);
        }
      }

      if (!reduced && now > nextStreak && streaks.length < 2) spawnStreak(now);
      for (let i = streaks.length - 1; i >= 0; i -= 1) {
        const s = streaks[i];
        s.life += dt;
        s.x += s.vx * dt / 1000;
        s.y += s.vy * dt / 1000;
        const a = Math.sin(Math.min(1, s.life / s.max) * Math.PI) * .7;
        const mag = Math.hypot(s.vx, s.vy) || 1;
        const ux = s.vx / mag;
        const uy = s.vy / mag;
        const grad = ctx.createLinearGradient(s.x, s.y, s.x - ux * s.len, s.y - uy * s.len);
        grad.addColorStop(0, `rgba(210,242,255,${a})`);
        grad.addColorStop(1, 'rgba(84,170,255,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - ux * s.len, s.y - uy * s.len);
        ctx.stroke();
        if (s.life >= s.max) streaks.splice(i, 1);
      }

      if (!reduced) requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });
    if (reduced) draw(0);
    else requestAnimationFrame(draw);
  }

  startSpace();
  loadLive();
  document.documentElement.dataset.genesisRuntime = BUILD;
})();

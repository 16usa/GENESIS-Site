(() => {
  'use strict';

  const BUILD = 'GENESIS_3D_V2';
  const c = window.GENESIS_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const fmtUsd = (n) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(n || 0));
  const fmtNum = (n) => new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  }).format(Number(n || 0));

  const feesValue = $('feesValue');
  const buybackValue = $('buybackValue');
  const burnedValue = $('burnedValue');
  const burnPercent = $('burnPercent');
  const feeRoutingValue = $('feeRoutingValue');
  const burnRateValue = $('burnRateValue');

  if (feesValue) feesValue.textContent = fmtUsd(c.totalFeesUsd);
  if (buybackValue) buybackValue.textContent = fmtUsd(c.totalBuybackUsd);
  if (burnedValue) burnedValue.textContent = fmtNum(c.burnedTokens);
  if (burnPercent) burnPercent.textContent = `${Number(c.burnPercent || 0)}%`;
  if (feeRoutingValue) feeRoutingValue.textContent = `${Number(c.burnPercent || 0)}% → Buyback Engine`;

  const supply = Number(c.circulatingSupply || 0);
  const burned = Number(c.burnedTokens || 0);
  const burnedPct = supply + burned > 0 ? (burned / (supply + burned)) * 100 : 0;
  if (burnRateValue) burnRateValue.textContent = `${burnedPct.toFixed(2)}%`;

  const mint = (c.contractAddress || '').trim();
  const mintValue = $('mintValue');
  const copyButton = $('copyButton');
  if (mintValue) mintValue.textContent = mint || 'NOT SET';
  if (copyButton) {
    const copyLabel = mint ? `${mint.slice(0, 5)}…${mint.slice(-5)}  ·  COPY` : 'CONTRACT NOT SET';
    const inner = copyButton.querySelector('span');
    if (inner) inner.textContent = copyLabel;
    else copyButton.textContent = copyLabel;
    if (mint) copyButton.classList.remove('disabled');
  }

  const pumpButton = $('pumpButton');
  if (pumpButton && c.pumpUrl) {
    pumpButton.href = c.pumpUrl;
    pumpButton.classList.remove('disabled');
    pumpButton.removeAttribute('aria-disabled');
  }

  const explorerLink = $('explorerLink');
  if (explorerLink && c.explorerUrl) {
    explorerLink.href = c.explorerUrl;
    explorerLink.textContent = 'Open transaction history ↗';
    explorerLink.classList.remove('disabled');
    explorerLink.removeAttribute('aria-disabled');
    explorerLink.target = '_blank';
    explorerLink.rel = 'noopener noreferrer';
  }

  const toast = $('toast');
  let toastTimer = 0;
  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1200);
  }

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
  function tick() {
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
  }
  tick();
  window.setInterval(tick, 1000);

  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.11, rootMargin: '0px 0px -4% 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('visible'));
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (!reducedMotion && precisePointer) {
    document.addEventListener('pointermove', (event) => {
      document.documentElement.style.setProperty('--mx', `${event.clientX}px`);
      document.documentElement.style.setProperty('--my', `${event.clientY}px`);
    }, { passive: true });

    document.querySelectorAll('[data-tilt]').forEach((el) => {
      let frame = 0;
      let nextX = 0;
      let nextY = 0;
      const max = Number(el.getAttribute('data-tilt-max') || 4);

      const paint = () => {
        frame = 0;
        el.style.setProperty('--rx', `${nextX.toFixed(2)}deg`);
        el.style.setProperty('--ry', `${nextY.toFixed(2)}deg`);
      };

      el.addEventListener('pointermove', (event) => {
        const rect = el.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;
        nextX = -py * max * 2;
        nextY = px * max * 2;
        if (!frame) frame = requestAnimationFrame(paint);
      }, { passive: true });

      el.addEventListener('pointerleave', () => {
        nextX = 0;
        nextY = 0;
        if (!frame) frame = requestAnimationFrame(paint);
      }, { passive: true });
    });
  }

  if (!reducedMotion) {
    const scenes = Array.from(document.querySelectorAll('[data-scene]'));
    let ticking = false;

    const renderDepth = () => {
      ticking = false;
      const y = window.scrollY || 0;
      document.documentElement.style.setProperty('--space-shift', `${Math.min(y, 5000)}px`);

      const vh = window.innerHeight || 1;
      scenes.forEach((scene) => {
        const rect = scene.getBoundingClientRect();
        const center = rect.top + rect.height * 0.5;
        const normalized = Math.max(-1, Math.min(1, (center - vh * 0.5) / vh));
        scene.style.setProperty('--scene-y', `${(-normalized * 8).toFixed(2)}px`);
      });
    };

    const scheduleDepth = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(renderDepth);
      }
    };

    window.addEventListener('scroll', scheduleDepth, { passive: true });
    window.addEventListener('resize', scheduleDepth, { passive: true });
    renderDepth();
  }


  // ------------------------------------------------------------------
  // GENESIS 3D V2: lightweight perspective canvas.
  // Pure Canvas 2D projection: no external library, capped DPR/FPS for iPhone.
  // ------------------------------------------------------------------
  const canvas = document.getElementById('genesis3d');
  if (canvas && !reducedMotion) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (ctx) {
      let cw = 0;
      let ch = 0;
      let dpr = 1;
      let lastFrame = 0;
      let scrollPhase = 0;
      const stars = Array.from({ length: 62 }, () => ({
        x: (Math.random() - 0.5) * 1200,
        y: (Math.random() - 0.5) * 900,
        z: 180 + Math.random() * 1400,
        s: 0.45 + Math.random() * 1.25,
      }));

      const resize3D = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        cw = window.innerWidth;
        ch = window.innerHeight;
        canvas.width = Math.max(1, Math.floor(cw * dpr));
        canvas.height = Math.max(1, Math.floor(ch * dpr));
        canvas.style.width = `${cw}px`;
        canvas.style.height = `${ch}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };

      const rotatePoint = (p, ax, ay, az) => {
        let { x, y, z } = p;
        let c = Math.cos(ax), s = Math.sin(ax);
        [y, z] = [y * c - z * s, y * s + z * c];
        c = Math.cos(ay); s = Math.sin(ay);
        [x, z] = [x * c + z * s, -x * s + z * c];
        c = Math.cos(az); s = Math.sin(az);
        [x, y] = [x * c - y * s, x * s + y * c];
        return { x, y, z };
      };

      const project = (p, ox, oy, scale = 1, camera = 520) => {
        const z = p.z + camera;
        const k = camera / Math.max(90, z);
        return { x: ox + p.x * k * scale, y: oy + p.y * k * scale, k, z };
      };

      const stroke3D = (pts, ox, oy, scale, rgba, width = 1) => {
        if (pts.length < 2) return;
        ctx.beginPath();
        pts.forEach((p, i) => {
          const q = project(p, ox, oy, scale);
          if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
        });
        ctx.strokeStyle = rgba;
        ctx.lineWidth = width;
        ctx.stroke();
      };

      const cubeVertices = [
        [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
        [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]
      ].map(([x,y,z]) => ({ x:x*72, y:y*72, z:z*72 }));
      const cubeEdges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

      const drawWireCube = (t, ox, oy, scale, phase = 0) => {
        const pts = cubeVertices.map((p) => rotatePoint(p, t*.00028 + phase, t*.00044 + phase*.7, t*.00017));
        cubeEdges.forEach(([a,b], i) => {
          const pa = project(pts[a], ox, oy, scale);
          const pb = project(pts[b], ox, oy, scale);
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.lineWidth = i % 3 === 0 ? 1.05 : .72;
          ctx.strokeStyle = i % 4 === 0 ? 'rgba(215,255,67,.23)' : 'rgba(255,255,255,.10)';
          ctx.stroke();
        });
      };

      const drawOrbit = (t, ox, oy, radius, rx, ry, alpha = .2) => {
        const pts = [];
        for (let i = 0; i <= 72; i++) {
          const a = (i / 72) * Math.PI * 2;
          const p = { x: Math.cos(a)*radius, y: 0, z: Math.sin(a)*radius };
          pts.push(rotatePoint(p, rx + Math.sin(t*.0002)*.08, ry + t*.00008, .18));
        }
        stroke3D(pts, ox, oy, 1, `rgba(215,255,67,${alpha})`, 1);
      };

      const drawStars = (t) => {
        const rotY = Math.sin(t * .00008) * .12 + scrollPhase * .16;
        const rotX = Math.cos(t * .00006) * .055;
        stars.forEach((star) => {
          const p = rotatePoint(star, rotX, rotY, 0);
          const q = project(p, cw*.5, ch*.5, 1, 560);
          if (q.x < -20 || q.x > cw+20 || q.y < -20 || q.y > ch+20) return;
          const depth = Math.max(.12, Math.min(1, 1.35 - p.z / 1400));
          ctx.beginPath();
          ctx.arc(q.x, q.y, star.s * q.k * 2.2, 0, Math.PI*2);
          ctx.fillStyle = `rgba(255,255,255,${depth*.16})`;
          ctx.fill();
        });
      };

      const drawFrame = (t) => {
        if (document.hidden) return;
        if (t - lastFrame < 31) {
          requestAnimationFrame(drawFrame);
          return;
        }
        lastFrame = t;
        ctx.clearRect(0, 0, cw, ch);
        scrollPhase = (window.scrollY || 0) / Math.max(1, document.documentElement.scrollHeight - ch);

        drawStars(t);
        drawWireCube(t + scrollPhase*4200, cw*.83, ch*.22, cw < 700 ? .62 : .9, .35);
        drawWireCube(t*.82 + 1300, cw*.13, ch*.79, cw < 700 ? .38 : .52, 1.1);
        drawOrbit(t, cw*.80, ch*.58, cw < 700 ? 84 : 125, 1.0, .2 + scrollPhase*.6, .18);
        drawOrbit(t*1.1, cw*.22, ch*.34, cw < 700 ? 56 : 90, .62, 1.25, .12);

        requestAnimationFrame(drawFrame);
      };

      resize3D();
      window.addEventListener('resize', resize3D, { passive: true });
      requestAnimationFrame(drawFrame);
    }
  }

  // Touch devices get scroll-driven scene yaw so the site cannot collapse
  // visually into a flat page just because hover/pointer events do not exist.
  if (!reducedMotion && !precisePointer) {
    const mobileScenes = Array.from(document.querySelectorAll('[data-scene]'));
    let mobileTick = false;
    const paintMobileDepth = () => {
      mobileTick = false;
      const vh = window.innerHeight || 1;
      mobileScenes.forEach((scene, index) => {
        const r = scene.getBoundingClientRect();
        const n = Math.max(-1, Math.min(1, (r.top + r.height*.5 - vh*.5) / vh));
        const sign = index % 2 ? 1 : -1;
        scene.style.setProperty('--mobile-scene-yaw', `${(sign * n * 2.4).toFixed(2)}deg`);
      });
      document.documentElement.style.setProperty('--g3d-scroll', String(window.scrollY || 0));
    };
    const scheduleMobileDepth = () => {
      if (!mobileTick) {
        mobileTick = true;
        requestAnimationFrame(paintMobileDepth);
      }
    };
    window.addEventListener('scroll', scheduleMobileDepth, { passive: true });
    window.addEventListener('resize', scheduleMobileDepth, { passive: true });
    paintMobileDepth();
  }

  document.documentElement.dataset.genesisRuntime = BUILD;
})();

/* VORTEX · Planes: Gratis, Plus (suscriptores de YouTube) e Infinity (cuenta BingX con el código de referido). Nada se cobra.
   · Plus: con tu cuenta de Google se le pregunta a YouTube si estás suscrito al canal (permiso de solo lectura, se pide solo al tocar «Verificar»).
   · Infinity: el servidor VORTEX pregunta a la API de afiliado de BingX si tu UID entró con el código.
   · Lo bloqueado se marca con fondo de galaxia; al tocarlo se abren los planes. Al desbloquearlo se ve normal. */
(function (root) {
  'use strict';
  const YT = 'https://www.youtube.com/@CriptoChaman', YT_SUB = YT + '?sub_confirmation=1';
  const BX = 'https://bingxdao.com/invite/YCXE5W/', BX_CODE = 'YCXE5W', LS = 'cct_plan_v1', YT_HANDLE = 'CriptoChaman', SRV = 'https://vortex-push.soobroon.workers.dev';
  const OWNER = 'a8d56a29aa7c5208d7748a84e75e4b14c713c521136174e8a652b7a76ac19b28'; // sha-256 del correo del dueño (no se publica el correo)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const load = () => { try { return Object.assign({tier: 'free'}, JSON.parse(localStorage.getItem(LS) || '{}')); } catch { return {tier: 'free'}; } };
  const save = s => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch {} };
  let st = load(), owner = false, user = null, ov = null; // owner: solo después de comprobar tu sesión con Google (antes se tomaba lo guardado en el dispositivo y otra cuenta podía ver lo de desarrollador un momento)
  const PV_LS = 'cct_plan_view'; // vista previa TEMPORAL: ver la app como Gratis, Plus o Infinity (solo en este dispositivo)
  let pv = (() => { try { const v = localStorage.getItem(PV_LS) || ''; return ['free', 'plus', 'infinity'].includes(v) ? v : ''; } catch { return ''; } })();

  const TIERS = {
    free: {n: 'Gratis', c: 'free', sub: 'Para todos', ic: '<path d="M12 3.5 14.6 9l6 .7-4.5 4.1 1.2 5.9L12 16.8 6.7 19.7l1.2-5.9L3.4 9.7l6-.7z"/>',
      f: ['Gráfico completo con todas las herramientas de dibujo', 'Indicadores gratuitos', 'Nova LITE · Smart Money Concepts', 'Repetición del mercado y calculadora de riesgo', 'Operar desde el gráfico (cuenta demo)', 'Mi seguimiento, noticias, calendario y panel macro', 'Alertas de precio y de indicador', 'Diseño de un solo gráfico']},
    plus: {n: 'Plus', c: 'plus', sub: 'Suscriptores de YouTube', ic: '<rect x="3" y="6" width="18" height="12" rx="3.5"/><path d="m10.5 9.5 4 2.5-4 2.5z" fill="currentColor"/>',
      f: ['Todo lo de Gratis', 'Análisis del gráfico con IA', 'Briefing del día con IA', 'Laboratorio de indicadores con IA', 'Screener', 'VPVR, canales dinámicos, patrones y Fibonacci automático', 'Varios gráficos a la vez', 'Discord Nova Nexus']},
    infinity: {n: 'Infinity', c: 'inf', sub: 'Cuenta BingX con mi código', ic: '<path d="M6.5 8.5c-2 0-3.5 1.6-3.5 3.5s1.5 3.5 3.5 3.5c3.5 0 7.5-7 11-7 2 0 3.5 1.6 3.5 3.5s-1.5 3.5-3.5 3.5c-3.5 0-7.5-7-11-7z"/>',
      f: ['Todo lo de Plus', 'Todos los indicadores Nova Nexus', 'Mapa de calor de liquidaciones', 'Nexus Pixel', 'Nexus Lens', 'Nova Bot Lab', 'Todas las herramientas nuevas']}
  };
  // qué plan necesita cada herramienta
  const RANK = {free: 0, plus: 1, infinity: 2};
  const FEATURES = {chart: 'free', drawings: 'free', freeInd: 'free', replay: 'free', risk: 'free', trade: 'free', watch: 'free', news: 'free', alerts: 'free', layouts: 'plus', novaLite: 'plus', aiChart: 'plus', aiBrief: 'plus', aiLab: 'plus', screener: 'plus', discord: 'plus', novaNexus: 'infinity', proInd: 'plus', liq: 'infinity', pixel: 'infinity', lens: 'infinity', botlab: 'infinity'};
  const can = f => RANK[current()] >= RANK[FEATURES[f] || 'free'];
  const lastUid = () => { try { return localStorage.getItem('cct_last_uid') || ''; } catch { return ''; } };
  const real = () => { if (!user) return 'free'; if (owner) return 'infinity'; return TIERS[st.tier] && st.uid === user.uid ? st.tier : 'free'; }; // sin sesión iniciada: siempre Gratis (sin desarrollador ni planes guardados en el dispositivo) // sin sesión: Gratis (mientras carga la sesión se usa el último plan de esa cuenta)
  const pvOn = () => (owner && user ? pv : ''); // la vista previa solo existe para el desarrollador (antes cualquiera podía activarla desde el navegador y ver Infinity)
  const current = () => pvOn() || real();
  const svg = (p, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const CHK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';

  /* Qué botón necesita qué función: [lo que se bloquea al tocar, función, lo que lleva el fondo de galaxia (si es otro)].
     Bloqueado = fondo de galaxia (clase gx-lock) y al tocarlo se abren los planes. Desbloqueado = se ve normal. */
  const GATE = [['#liqBtn', 'liq'], ['[data-side="screenerView"], .bottom-nav [data-view="screenerView"], #scrOpen', 'screener'], ['#rrDiscord, #dcOpenFromSettings, #alDiscord', 'discord'],
    ['[data-side="lensView"], .bottom-nav [data-view="lensView"]', 'lens'], ['#rrBotLab', 'botlab'], ['[data-side="aiView"], .bottom-nav [data-view="aiView"]', 'aiChart'], ['#layoutBtn', 'layouts'],
    ['.ib-card[data-pl="plus"] .ib-act', 'proInd', '.ib-card[data-pl="plus"]'],
    ['[data-feat="novaNexus"] .script-btns, .nova-card:has(.prem-tag) .script-btns, .ib-card:has(.prem-tag) .ib-act', 'novaNexus', '[data-feat="novaNexus"], .nova-card:has(.prem-tag), .ib-card:has(.prem-tag)']];
  const below = k => Object.keys(RANK).filter(t => RANK[t] < RANK[k]);
  let lockRaf = 0;
  function markLocks() { // pone o quita el fondo de galaxia en todo lo premium (también en lo que se dibuja después: lo vigila un observador)
    lockRaf = 0; if (typeof document === 'undefined' || !document.body) return;
    for (const [sel, f, style] of GATE) { const lock = !can(f); let els = []; try { els = document.querySelectorAll(style || sel); } catch {} els.forEach(el => { if (el.classList.contains('gx-lock') !== lock) el.classList.toggle('gx-lock', lock); if (lock) el.dataset.gxNeed = TIERS[FEATURES[f]].n; else delete el.dataset.gxNeed; }); }
  }
  const queueLocks = () => { if (!lockRaf) lockRaf = requestAnimationFrame(markLocks); };
  if (typeof document !== 'undefined') {
    const css = below('infinity').map(t => `body[data-tier="${t}"] .px-layer`).join(',') + '{display:none!important}';
    const el = document.createElement('style'); el.id = 'plGate'; el.textContent = css; (document.head || document.documentElement).appendChild(el);
    document.addEventListener('click', e => {
      for (const [sel, f] of GATE) {
        let hit = null; try { hit = e.target.closest(sel); } catch {}
        if (!hit || can(f)) continue;
        e.preventDefault(); e.stopImmediatePropagation();
        const need = TIERS[FEATURES[f]]; toast(`Se desbloquea con el plan ${need.n}`); open(FEATURES[f]); return;
      }
    }, true);
    const watch = () => { try { new MutationObserver(queueLocks).observe(document.body, {childList: true, subtree: true}); } catch {} queueLocks(); };
    if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch);
  }
  function setPreview(t) {
    if (!(owner && user)) return;
    pv = ['free', 'plus', 'infinity'].includes(t) ? t : '';
    try { if (pv) localStorage.setItem(PV_LS, pv); else localStorage.removeItem(PV_LS); } catch {}
    badge(); if (ov && !ov.hidden) render();
    toast(pv ? `Viendo la app como ${TIERS[pv].n}` : 'Volviste a tu plan');
  }
  function applyTier() {
    const b = document.body; if (!b) return; const cur = current();
    b.dataset.tier = cur; const pp = pvOn(); if (pp) b.dataset.pv = pp; else delete b.dataset.pv;
    const liq = document.getElementById('liqBtn'); // bloqueado: fondo de galaxia (lo pone markLocks); desbloqueado: botón normal
    if (liq) { const prem = !can('liq'); liq.classList.remove('prem-btn'); const tg = liq.querySelector('.prem-tag'); if (tg) tg.hidden = true; liq.title = prem ? 'Mapa de calor de liquidaciones · plan Infinity' : 'Mapa de calor de liquidaciones'; }
    markLocks(); if (root.CCT_planChanged) try { root.CCT_planChanged(cur); } catch {}
    document.querySelectorAll('[data-pv]').forEach(x => { if (x !== b) x.setAttribute('aria-pressed', String((x.dataset.pv || '') === pvOn())); });
    let bn = document.getElementById('pvBanner');
    if (pvOn()) {
      if (!bn) { bn = document.createElement('div'); bn.id = 'pvBanner'; bn.className = 'pv-banner'; bn.setAttribute('role', 'status'); document.body.appendChild(bn); }
      bn.innerHTML = `<span>Vista previa · plan <b>${tx(pvOn())}</b></span><button type="button" data-pv="">Salir</button>`;
    } else if (bn) bn.remove();
  }
  if (typeof document !== 'undefined') document.addEventListener('click', e => { const b = e.target.closest('button[data-pv]'); if (b) setPreview(b.dataset.pv); });

  const DEV_IC = '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>', tx = k => `<span class="pl-tx ${TIERS[k] ? TIERS[k].c : k}">${esc(TIERS[k] ? TIERS[k].n : k)}</span>`; // nombre del plan con su efecto (Infinity dorado, Plus estrellado)
  function badge() {
    applyTier();
    const t = TIERS[current()];
    const pv = pvOn(), dev = owner && !!user && !pv; document.querySelectorAll('[data-plan-badge]').forEach(el => { el.className = 'pl-badge ' + (dev ? 'dev' : t.c); el.innerHTML = dev ? svg(DEV_IC, 13) + 'Desarrollador' : svg(t.ic, 13) + esc(t.n); });
    document.querySelectorAll('[data-plan-sub]').forEach(el => { el.innerHTML = pv ? 'Vista previa de ' + tx(pv) + ' · Salir en Vista de membresía' : owner && user ? '<span class="pl-tx dev">Desarrollador</span> · acceso total' : !user ? 'Inicia sesión con Google para ver tu plan' : real() !== 'free' ? 'Plan ' + tx(real()) + ' verificado' : st.bx ? 'UID de BingX pendiente de verificar' : 'Gratis, Plus o Infinity'; });
  }

  function col(k) {
    const t = TIERS[k], cur = current() === k;
    let act = '';
    if (k === 'free') act = `<div class="pl-act"><button type="button" class="pl-btn ghost" disabled>${cur ? 'Tu plan actual' : 'Incluido'}</button></div>`;
    const plusOk = RANK[real()] >= RANK.plus, infOk = real() === 'infinity', login = !user ? `<button type="button" class="pl-btn ghost" data-pl-login>Inicia sesión con Google primero</button>` : '';
    if (k === 'plus') act = plusOk ? `<div class="pl-act"><button type="button" class="pl-btn ghost" disabled>${svg(CHK, 15)} <span class="pl-tx plus">Plus</span> activo</button></div>` : `<ol class="pl-steps"><li><b>Suscríbete a CriptoChaman</b><small>Con la misma cuenta de Google con la que entras a VORTEX. Es gratis.</small><a class="pl-btn plus" href="${YT_SUB}" target="_blank" rel="noopener noreferrer" data-pl-yt>${svg(TIERS.plus.ic, 16)} Suscribirme en YouTube</a></li>
        <li><b>Verifica tu suscripción</b><small>Google te pedirá permiso para que VORTEX vea (solo ver) si sigues el canal.</small>${login || `<button type="button" class="pl-btn ghost" data-pl-ytok>Verificar suscripción</button>`}<small class="pl-msg" data-pl-ytmsg></small></li></ol>`;
    if (k === 'infinity') act = `<ol class="pl-steps"><li><b>Crea tu cuenta en BingX con mi código</b><small>Código de referido <button type="button" class="pl-code" data-pl-copy title="Copiar código">${BX_CODE} ${svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>', 13)}</button></small><a class="pl-btn inf" href="${BX}" target="_blank" rel="noopener noreferrer">${svg(TIERS.infinity.ic, 16)} Abrir cuenta en BingX</a></li>
        <li><b>Escribe tu UID de BingX</b><small>Lo ves en tu perfil de BingX. Solo lo usamos para comprobar que entraste con el código.</small>${login || `<div class="pl-uid"><input inputmode="numeric" autocomplete="off" maxlength="14" placeholder="Ej. 123456789" value="${esc(st.bx || '')}" data-pl-uid aria-label="UID de BingX"><button type="button" class="pl-btn ghost" data-pl-uidok>Verificar</button></div>`}<small class="pl-msg" data-pl-uidmsg>${st.bx && !infOk ? 'UID guardado: pendiente de verificar.' : ''}</small></li></ol>`;
    if (k === 'infinity' && infOk) act = `<div class="pl-act"><button type="button" class="pl-btn ghost" disabled>${svg(CHK, 15)} <span class="pl-tx inf">Infinity</span> activo</button></div>`;
    return `<section class="pl-col ${t.c}${cur ? ' cur' : ''}"><canvas class="pl-bg" data-fx="${k}" aria-hidden="true"></canvas><header><span class="pl-ic">${svg(t.ic, 22)}</span><div><b>${k === 'free' ? t.n : tx(k)}</b><small>${t.sub}</small></div>${cur ? '<em class="pl-now">Tu plan</em>' : ''}</header>
      <ul class="pl-f">${t.f.map(x => `<li>${svg(CHK, 14)}${esc(x)}</li>`).join('')}</ul>${act}</section>`;
  }

  function render() {
    if (!ov) return;
    ov.querySelector('.pl-cols').innerHTML = col('free') + col('plus') + col('infinity');
    fxStart();
  }

  /* ───────── fondos animados: Gratis = constelación tranquila · Plus = brasas que suben · Infinity = galaxia ───────── */
  let fxRaf = 0, fx = [];
  const RM = () => root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fxStart() {
    cancelAnimationFrame(fxRaf); fx = [];
    ov.querySelectorAll('canvas.pl-bg').forEach(cv => fx.push({cv, k: cv.dataset.fx, ps: null, w: 0, h: 0}));
    let t0 = performance.now(); const still = RM();
    const loop = now => { const dt = Math.min(50, now - t0) / 1000; t0 = now; for (const s_ of fx) draw(s_, dt, now / 1000); if (!still && ov && !ov.hidden) fxRaf = requestAnimationFrame(loop); };
    fxRaf = requestAnimationFrame(loop);
  }
  function size(s_) {
    const r = s_.cv.parentNode.getBoundingClientRect(), d = Math.min(2, root.devicePixelRatio || 1), w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === s_.w && h === s_.h) return false; s_.w = w; s_.h = h; s_.cv.width = w * d; s_.cv.height = h * d; s_.cv.getContext('2d').setTransform(d, 0, 0, d, 0, 0); return true;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const SPR = {}; // brasa pre-dibujada (más fluido que crear un degradado por partícula)
  function sprite(c) { if (SPR[c]) return SPR[c]; const cv = document.createElement('canvas'); cv.width = cv.height = 32; const g = cv.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, `rgba(${c},1)`); gr.addColorStop(.35, `rgba(${c},.45)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return (SPR[c] = cv); }
  function seed(s_) { s_.bg = null;
    const {w, h, k} = s_, n = k === 'infinity' ? Math.round(w * h / 900) : k === 'plus' ? Math.round(w * h / 4200) : Math.round(w * h / 9000);
    s_.ps = Array.from({length: Math.min(420, n)}, () => k === 'infinity' ? newStar(s_, true) : k === 'plus'
      ? {x: rnd(0, w), y: rnd(0, h), r: rnd(.8, 2.4), v: rnd(10, 32), sw: rnd(.5, 1.6), ph: rnd(0, 6.3), c: Math.random() < .5 ? '255,92,92' : '255,160,80'}
      : {x: rnd(0, w), y: rnd(0, h), vx: rnd(-6, 6), vy: rnd(-6, 6), r: rnd(.7, 1.6)});
  }
  function newStar(s_, any) { // estrellas que salen del centro hacia afuera (efecto de viaje por el espacio)
    const a = rnd(0, Math.PI * 2), d = any ? rnd(4, Math.hypot(s_.w, s_.h) / 2) : rnd(2, 30);
    return {a, d, v: rnd(8, 26), r: rnd(.4, 1.5), tw: rnd(0, 6.3), c: ['255,255,255', '255,226,150', '200,170,255', '160,200,255'][Math.floor(rnd(0, 4))]};
  }
  function draw(s_, dt, T) {
    const g = s_.cv.getContext('2d'); if (size(s_) || !s_.ps) seed(s_); const {w, h, k, ps} = s_;
    g.clearRect(0, 0, w, h);
    if (k === 'infinity') {
      // nebulosas que giran despacio
      const cx = w / 2, cy = h * .42;
      const neb = [[cx + Math.cos(T * .13) * w * .22, cy + Math.sin(T * .11) * h * .14, w * .62, '180,123,255', .30], [cx + Math.cos(T * .09 + 2) * w * .26, cy + Math.sin(T * .12 + 1) * h * .18, w * .55, '245,196,81', .20], [cx + Math.cos(T * .07 + 4) * w * .2, cy + Math.sin(T * .1 + 3) * h * .2, w * .58, '94,160,255', .24]];
      g.globalCompositeOperation = 'lighter';
      for (const [x, y, r, c, al] of neb) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${c},${al})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
      // fondo de estrellas fijas que titilan
      if (!s_.bg) s_.bg = Array.from({length: Math.round(w * h / 1400)}, () => ({x: rnd(0, w), y: rnd(0, h), r: rnd(.3, 1.1), ph: rnd(0, 6.3), sp: rnd(.6, 2.2)}));
      for (const q of s_.bg) { g.fillStyle = `rgba(255,255,255,${.25 + .5 * (.5 + .5 * Math.sin(T * q.sp + q.ph))})`; g.fillRect(q.x, q.y, q.r, q.r); }
      // núcleo brillante
      { const R = Math.min(w, h) * .32, gr = g.createRadialGradient(cx, cy, 0, cx, cy, R); gr.addColorStop(0, `rgba(255,240,255,${.22 + .05 * Math.sin(T * .8)})`); gr.addColorStop(.25, 'rgba(200,160,255,.12)'); gr.addColorStop(1, 'rgba(160,120,255,0)'); g.fillStyle = gr; g.fillRect(cx - R, cy - R, R * 2, R * 2); }
      // brazo de galaxia: puntitos en espiral
      g.save(); g.translate(cx, cy); g.rotate(T * .05);
      for (let i = 0; i < 260; i++) { const arm = i % 2 ? Math.PI : 0, q = (i >> 1) / 130, j = Math.sin(i * 12.9898) * .35, ang = arm + q * 5.2 + j * .3, rr = q * Math.min(w, h) * .6 + j * 8; g.fillStyle = `rgba(${i % 3 ? '230,210,255' : '255,220,160'},${.45 * (1 - q)})`; g.fillRect(Math.cos(ang) * rr, Math.sin(ang) * rr * .45, 1.4, 1.4); }
      g.restore();
      const maxD = Math.hypot(w, h) / 2 + 20;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]; const k2 = 1 + p.d / 120; p.d += p.v * k2 * dt; if (p.d > maxD) { ps[i] = newStar(s_, false); continue; }
        const x = cx + Math.cos(p.a) * p.d, y = cy + Math.sin(p.a) * p.d, al = Math.min(1, p.d / 60) * (.6 + .4 * Math.sin(T * 3 + p.tw)), len = Math.min(10, p.v * k2 * .05 * (p.d / 40));
        g.strokeStyle = `rgba(${p.c},${al})`; g.lineWidth = p.r * Math.min(1.8, k2 * .8); g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(p.a) * len, y - Math.sin(p.a) * len); g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    } else if (k === 'plus') {
      const gr = g.createLinearGradient(0, h, w, 0), o = (Math.sin(T * .4) + 1) / 2;
      gr.addColorStop(0, `rgba(255,61,90,${.16 + .06 * o})`); gr.addColorStop(.6, 'rgba(255,138,61,.05)'); gr.addColorStop(1, 'rgba(255,138,61,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (const p of ps) { p.y -= p.v * dt; p.x += Math.sin(T * p.sw + p.ph) * 8 * dt; if (p.y < -6) { p.y = h + 6; p.x = rnd(0, w); }
        g.globalAlpha = .3 + .5 * Math.min(1, p.y / h); const sp = sprite(p.c), R = p.r * 4; g.drawImage(sp, p.x - R, p.y - R, R * 2, R * 2); }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    } else {
      for (const p of ps) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1; }
      g.lineWidth = .6;
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const a = ps[i], b = ps[j], d = Math.hypot(a.x - b.x, a.y - b.y); if (d < 70) { g.strokeStyle = `rgba(150,170,200,${.16 * (1 - d / 70)})`; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } }
      for (const p of ps) { g.fillStyle = 'rgba(190,205,230,.4)'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
    }
  }
  function open(focus) {
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'pl-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Planes de VORTEX');
      ov.innerHTML = `<div class="pl-box"><div class="pl-top"><div><small>VORTEX</small><h2>Elige tu plan</h2><p>Nada se cobra: Plus es para los suscriptores del canal de YouTube e Infinity para quien abre su cuenta de BingX con mi código. Lo que tiene fondo de galaxia se desbloquea con un plan.</p></div><button type="button" class="pl-x" data-pl-close aria-label="Cerrar">✕</button></div><div class="pl-cols"></div></div>`;
      ov.addEventListener('click', e => {
        if (e.target === ov || e.target.closest('[data-pl-close]')) return close();
        if (e.target.closest('[data-pl-login]')) { close(); if (root.CCT_signIn) root.CCT_signIn(); return; }
        if (e.target.closest('[data-pl-ytok]')) { verifyYouTube(); return; }
        if (e.target.closest('[data-pl-copy]')) { (navigator.clipboard ? navigator.clipboard.writeText(BX_CODE) : Promise.reject()).then(() => toast('Código ' + BX_CODE + ' copiado'), () => toast('Código: ' + BX_CODE)); return; }
        if (e.target.closest('[data-pl-uidok]')) {
          const v = (ov.querySelector('[data-pl-uid]').value || '').replace(/\D/g, ''), m = ov.querySelector('[data-pl-uidmsg]');
          if (!/^\d{6,14}$/.test(v)) { m.textContent = 'El UID son solo números (de 6 a 14 dígitos).'; m.classList.add('bad'); return; }
          st.bx = v; st.bxAt = Date.now(); save(st); verifyBingx(v); return;
        }
      });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov && !ov.hidden) close(); });
      document.body.appendChild(ov);
    }
    render(); ov.hidden = false; requestAnimationFrame(() => ov.classList.add('open'));
    ov.querySelectorAll('.pl-col').forEach(c => c.classList.toggle('want', !!focus && c.classList.contains(TIERS[focus] ? TIERS[focus].c : '-')));
  }
  function close() { if (!ov) return; ov.classList.remove('open'); ov.hidden = true; cancelAnimationFrame(fxRaf); }
  const toast = m => { if (root.CCT_toast) root.CCT_toast(m); };

  /* ───────── verificación ───────── */
  const msgEl = k => ov && ov.querySelector(k === 'yt' ? '[data-pl-ytmsg]' : '[data-pl-uidmsg]');
  const say = (k, t, bad) => { const m = msgEl(k); if (m) { m.textContent = t; m.classList.toggle('bad', !!bad); } };
  function grant(tier, extra) { // guarda el plan verificado (en este dispositivo y en tu cuenta, para tus otros dispositivos)
    if (RANK[tier] < RANK[st.tier || 'free'] && st.uid === (user && user.uid)) tier = st.tier;
    st = Object.assign(st, extra || {}, {tier, uid: user ? user.uid : '', at: Date.now()}); save(st); persist(); badge(); if (ov && !ov.hidden) render();
  }
  async function verifyYouTube() {
    const fb = root.firebase; if (!user || !fb || !fb.auth) { toast('Inicia sesión con Google primero'); return; }
    say('yt', 'Abriendo Google…');
    try {
      const p = new fb.auth.GoogleAuthProvider(); p.addScope('https://www.googleapis.com/auth/youtube.readonly'); p.setCustomParameters({login_hint: user.email || ''});
      const cu = fb.auth().currentUser; const res = await (cu.reauthenticateWithPopup ? cu.reauthenticateWithPopup(p) : fb.auth().signInWithPopup(p));
      const tok = res && res.credential && res.credential.accessToken; if (!tok) throw Error('Google no dio permiso para ver tus suscripciones');
      say('yt', 'Revisando tu suscripción…');
      const yt = async u => { const r = await fetch('https://www.googleapis.com/youtube/v3/' + u, {headers: {authorization: 'Bearer ' + tok}}); const j = await r.json(); if (!r.ok) throw Error((j.error && j.error.message) || 'YouTube no respondió'); return j; };
      let ch = st.ytCh; if (!ch) { const c = await yt(`channels?part=id&forHandle=${YT_HANDLE}`); ch = c.items && c.items[0] && c.items[0].id; if (!ch) throw Error('No se encontró el canal'); st.ytCh = ch; }
      const sub = await yt(`subscriptions?part=id&mine=true&forChannelId=${ch}`);
      if (sub.items && sub.items.length) { grant('plus', {yt: Date.now()}); toast('Plus activado · gracias por suscribirte'); }
      else say('yt', 'Aún no apareces como suscriptor. Suscríbete con esta misma cuenta y vuelve a verificar.', true);
    } catch (e) { if (!/popup-closed|cancelled-popup/.test(e && e.code || '')) say('yt', 'No se pudo verificar: ' + (e.message || e.code || e), true); else say('yt', ''); }
  }
  async function verifyBingx(uid) {
    say('bx', 'Verificando con BingX…');
    try {
      const r = await fetch(SRV + '/plan/bingx', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({uid})}); const j = await r.json();
      if (j.invited) { grant('infinity', {bx: uid, bxOk: Date.now()}); toast('Infinity activado · bienvenido'); return; }
      persist(); say('bx', j.setup ? 'UID guardado. La verificación con BingX se activará muy pronto.' : j.ok ? 'Ese UID no aparece registrado con el código ' + BX_CODE + '.' : 'BingX no respondió: inténtalo en un rato.', !j.setup);
    } catch { persist(); say('bx', 'UID guardado. No se pudo conectar con el servidor: inténtalo más tarde.', true); }
  }
  const exportPlan = () => ({tier: st.tier || 'free', uid: st.uid || '', at: st.at || 0, yt: st.yt || 0, bx: st.bx || '', bxOk: st.bxOk || 0});
  function persist() { if (root.CCT_planSave) try { root.CCT_planSave(exportPlan()); } catch {} }
  function importSaved(p) { // el plan que viaja en tu cuenta (verificado en otro dispositivo)
    if (!p || typeof p !== 'object' || !TIERS[p.tier] || !user || (p.uid && p.uid !== user.uid)) return;
    if ((+p.at || 0) <= (+st.at || 0) && st.uid === user.uid) return;
    st = Object.assign(st, {tier: p.tier, uid: user.uid, at: +p.at || 0, yt: +p.yt || 0, bx: typeof p.bx === 'string' ? p.bx.slice(0, 14) : '', bxOk: +p.bxOk || 0}); save(st); badge(); if (ov && !ov.hidden) render();
  }
  async function setUser(u) {
    user = u || null; if (user && st.uid && st.uid !== user.uid) st = {tier: 'free'}; // otra cuenta en este dispositivo: empieza en Gratis
    let o = false;
    if (u && u.email && root.crypto && crypto.subtle) try {
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(u.email).trim().toLowerCase()));
      o = [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('') === OWNER;
    } catch {}
    owner = o; st.own = o; save(st); badge(); if (ov && !ov.hidden) render();
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-plans-open]')) open(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', badge); else badge();
  root.CCTPlans = {open, close, current, real, can, setPreview, importSaved, verifyYouTube, get user() { return user; }, get owner() { return owner && !!user; }, get dev() { return owner && !!user && !pv; }, get previewOn() { return pvOn(); }, /* dev: herramientas de desarrollador (no en la vista previa de Gratis/Plus/Infinity) */ get preview() { return pvOn(); }, FEATURES, setUser, TIERS, links: {youtube: YT, bingx: BX, code: BX_CODE}};
})(typeof self !== 'undefined' ? self : this);

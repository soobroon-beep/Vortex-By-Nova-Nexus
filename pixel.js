/* NEXUS PIXEL · tu asistente en TODA la app (PC y celular): se asoma escondido en cualquier sección y, al tocarlo, sale volando.
   En el gráfico dibuja; en Noticias resume; en el Screener elige las mejores entradas; en Alertas las crea; en Lens y en todo lo demás
   te explica y te enseña dónde está cada cosa («no encuentro Fibonacci»). Lo de abajo describe la parte del gráfico:
   Toca el botón del robot (abajo a la derecha del gráfico): sale volando desde un lado y te saluda. Pídele en español
   «dibújame el canal», «marca soportes y resistencias», «el rango», «tendencia», «fibonacci», «línea en 65000» o «borra lo tuyo»:
   calcula los niveles con las velas que ves y vuela hasta el gráfico a trazarlos con su lápiz. Los dibujos quedan como los tuyos
   (se guardan en tu cuenta, los puedes mover o borrar; Ctrl+Z también funciona). Las preguntas libres las responde la IA de VORTEX
   (llm.js); si la IA no responde, igual dibuja lo que entiende. Arrastra al robot de lado a lado para girarlo 360°, tócalo para
   que salude y arrastra la barra de su globo para cambiarlo de lugar. El modelo 3D (pixel-model.js + three.js) solo se descarga al abrirlo. */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search)) return;
  const D = window.NexusPixelDraw, area = document.getElementById('chartArea'); if (!D || !area) return;
  const H = () => window.CCT_pixel, LLM = () => window.CCTLLM;
  const CFG = () => { try { return (window.CCT_pixel && window.CCT_pixel.cfg && window.CCT_pixel.cfg()) || {}; } catch { return {}; } }; // tu personalización (tarjeta de Pixel en la IA)
  const KEY = 'cct_pixel_v1', ls = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } })(), store = () => { try { localStorage.setItem(KEY, JSON.stringify(ls)); } catch {} };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms)), clamp = (v, a, b) => Math.max(a, Math.min(b, v)), mobile = () => innerWidth < 1024;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Cabeza de Nexus Pixel en SVG (ligera, sin 3D): se usa asomándose en el gráfico y en el botón de la IA */
  let hid = 0;
  function headSVG(mode) {
    const i = ++hid, face = mode === 'v'
      ? `<g class="nph-face" filter="url(#npg${i})"><path d="M47 49h7l6 13.5 6-13.5h7l-11 23h-4z" fill="#f3ecff"/><ellipse cx="60" cy="61" rx="23" ry="6.2" transform="rotate(-14 60 61)" fill="none" stroke="#f3ecff" stroke-width="2.2" stroke-dasharray="40 6 60"/><path d="M78 45l1.3 3 3 1.3-3 1.3-1.3 3-1.3-3-3-1.3 3-1.3z" fill="#fff"/></g>`
      : `<g class="nph-face" filter="url(#npg${i})"><g class="nph-eyes"><rect x="41" y="55" width="11" height="15" rx="5.5" fill="#efe6ff"/><rect x="68" y="55" width="11" height="15" rx="5.5" fill="#efe6ff"/></g></g>`;
    return `<svg class="nph" viewBox="0 0 120 110" aria-hidden="true"><defs><linearGradient id="nph${i}" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9cce3"/></linearGradient><radialGradient id="npv${i}" cx=".35" cy=".25" r=".95"><stop offset="0" stop-color="#2b2f4d"/><stop offset=".55" stop-color="#07080f"/></radialGradient><filter id="npg${i}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.8" result="b"/><feFlood flood-color="#b46bff"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <g class="nph-ant l"><path d="M40 30L27 5" stroke="url(#nph${i})" stroke-width="8" stroke-linecap="round"/><path d="M36 22L29 9" stroke="#b46bff" stroke-width="2.4" stroke-linecap="round"/></g><g class="nph-ant r"><path d="M80 30L93 5" stroke="url(#nph${i})" stroke-width="8" stroke-linecap="round"/><path d="M84 22L91 9" stroke="#b46bff" stroke-width="2.4" stroke-linecap="round"/></g>
      <ellipse cx="60" cy="63" rx="47" ry="43" fill="url(#nph${i})"/><circle cx="13" cy="66" r="11" fill="#eceef8"/><circle cx="13" cy="66" r="7" fill="#1b1e38" stroke="#b46bff" stroke-width="2.6"/><circle cx="107" cy="66" r="11" fill="#eceef8"/><circle cx="107" cy="66" r="7" fill="#1b1e38" stroke="#b46bff" stroke-width="2.6"/>
      <rect x="22" y="40" width="76" height="48" rx="24" fill="url(#npv${i})"/><ellipse cx="42" cy="47" rx="11" ry="3.6" fill="#fff" opacity=".18"/>${face}</svg>`;
  }
  window.NexusPixelHead = headSVG;
  document.querySelectorAll('.aivp-bot').forEach(el => { if (!el.querySelector('.nph')) el.insertAdjacentHTML('afterbegin', headSVG('v')); });

  /* ── DOM ── */
  const fab = document.createElement('button'); fab.type = 'button'; fab.className = 'px-peek'; fab.title = 'Nexus Pixel · tócalo para que salga'; fab.setAttribute('aria-label', 'Llamar a Nexus Pixel');
  fab.innerHTML = `<span class="px-peek-in">${headSVG('eyes')}</span>`; // escondido: solo se asoman media cabeza y las antenas
  const ink = document.createElement('canvas'); ink.className = 'px-ink'; ink.setAttribute('aria-hidden', 'true');
  const av = document.createElement('div'); av.className = 'px-av'; av.hidden = true; av.innerHTML = '<canvas class="px-cv" aria-label="Nexus Pixel: arrástralo de lado a lado para girarlo; tócalo para que salude"></canvas><span class="px-spin" aria-hidden="true"></span>';
  const bub = document.createElement('div'); bub.className = 'px-bub'; bub.hidden = true; bub.setAttribute('role', 'dialog'); bub.setAttribute('aria-label', 'Nexus Pixel');
  bub.innerHTML = `<div class="px-hd" title="Arrastra para moverlo"><span class="px-dot"></span><b>Nexus Pixel</b><small class="px-st">IA de VORTEX</small><button type="button" class="px-x" data-px="close" aria-label="Despedir a Nexus Pixel">&times;</button></div>
    <div class="px-msg" aria-live="polite"></div>
    <div class="px-chips">${[['Canal', 'Dibújame el canal'], ['Rango', 'Marca el rango'], ['Soportes y resistencias', 'Marca soportes y resistencias'], ['Tendencia', 'Traza la línea de tendencia'], ['Fibonacci', 'Pon Fibonacci'], ['Análisis completo', 'Análisis completo'], ['Borrar lo mío', 'Borra lo que dibujaste']].map(([t, q]) => `<button type="button" data-q="${esc(q)}">${t}</button>`).join('')}</div>
    <form class="px-in"><input type="text" placeholder="Pídeme algo: «dibuja el canal»…" autocomplete="off" enterkeyhint="send" aria-label="Escríbele a Nexus Pixel"><button type="button" class="px-mic" aria-label="Hablarle a Nexus Pixel" title="Háblale"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><button type="submit" aria-label="Enviar"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></form>`;
  const layer = document.createElement('div'); layer.className = 'px-layer'; layer.append(av, bub, fab); (document.getElementById('app') || document.body).appendChild(layer); area.appendChild(ink); // capa sobre toda la app; la tinta sigue dentro del gráfico
  const tip = document.createElement('button'); tip.type = 'button'; tip.className = 'px-tip'; tip.hidden = true; layer.appendChild(tip);
  const cv = av.querySelector('.px-cv'), msg = bub.querySelector('.px-msg'), input = bub.querySelector('input'), st = bub.querySelector('.px-st');

  /* ── estado ── */
  let M = null, loading = null, open = false, busy = false, pos = {x: 0, y: 0}, lastAct = Date.now(), hist = [], typer = 0;
  const AV = () => mobile() ? {w: 112, h: 132} : {w: 150, h: 176};
  const AW = () => layer.clientWidth || innerWidth, AH = () => layer.clientHeight || innerHeight;
  const ao = () => { const r = area.getBoundingClientRect(), l = layer.getBoundingClientRect(); return {x: r.left - l.left, y: r.top - l.top, w: r.width, h: r.height}; }; // gráfico → capa
  const IW = () => area.clientWidth, IH = () => area.clientHeight; // tamaño del lienzo de tinta (dentro del gráfico)
  const V2 = q => { const o = ao(); return {x: q.x + o.x, y: q.y + o.y}; };
  const onChart = () => !!(H() && (H().desktop() || H().view() === 'chartView'));
  const section = () => { const h = H(); if (!h) return 'chartView'; return h.desktop() ? h.side() : h.view(); }; // lo que tienes abierto (en PC: el panel derecho; el gráfico siempre se ve)
  const navH = () => { const n = document.querySelector('.bottom-nav'); return n && n.offsetParent ? n.getBoundingClientRect().height : 0; };
  function home() {
    const s = AV(), h = ls.home2; if (h && Number.isFinite(h.rx) && Number.isFinite(h.by)) return {x: clamp(AW() - h.rx - s.w, 0, AW() - s.w), y: clamp(AH() - h.by - s.h, 0, AH() - s.h)};
    if (onChart() && area.offsetWidth) { const o = ao(), p = H() && H().plot(), right = p ? p.right + o.x : o.x + o.w - 60, bottom = p ? p.top + p.h + o.y : o.y + o.h - 40; return {x: clamp(right - s.w - 6, 0, AW() - s.w), y: clamp(bottom - s.h - (mobile() ? 10 : 18), 0, AH() - s.h)}; }
    return {x: AW() - s.w - 8, y: clamp(AH() - navH() - s.h - 10, 0, AH() - s.h)}; // otras secciones del celular: abajo a la derecha, sobre el dock
  }
  function placePeek() { // escondido: en el gráfico (PC) o sobre el dock (celular)
    const w = fab.offsetWidth || 54, hgt = fab.offsetHeight || 40;
    if (H() && H().desktop() && area.offsetWidth) { const o = ao(); fab.style.left = (o.x + o.w - 132 - w) + 'px'; fab.style.top = (o.y + o.h - hgt) + 'px'; }
    else { fab.style.left = (AW() - 70 - w) + 'px'; fab.style.top = (AH() - navH() - hgt) + 'px'; }
  }
  function peekSpot() { const r = fab.getBoundingClientRect(), l = layer.getBoundingClientRect(); return r.width ? {x: r.left - l.left + r.width / 2, y: r.top - l.top} : {x: AW() - 90, y: AH() - 40}; }
  function place(x, y) { const s = AV(); pos = {x, y}; av.style.width = s.w + 'px'; av.style.height = s.h + 'px'; av.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; if (!bub.hidden) placeBubble(); }
  function placeBubble() { // a la izquierda del robot; si no cabe, a la derecha; si tampoco, arriba (o abajo)
    const s = AV(), lg = bub.classList.contains('long'), bw = Math.min(lg ? (mobile() ? 380 : 400) : (mobile() ? 260 : 300), AW() - 16); bub.style.width = bw + 'px'; const bh = bub.offsetHeight || 180;
    let x, y, side;
    if (pos.x - bw + 14 >= 8) { x = pos.x - bw + 14; y = pos.y + s.h * .1; side = 'l'; }
    else if (pos.x + s.w - 10 + bw <= AW() - 8) { x = pos.x + s.w - 10; y = pos.y + s.h * .1; side = 'r'; }
    else { x = pos.x + s.w / 2 - bw / 2; y = pos.y - bh + 4; side = 't'; if (y < 6) { y = pos.y + s.h - 4; side = 'b'; } }
    bub.style.transform = `translate3d(${clamp(x, 8, AW() - bw - 8).toFixed(0)}px,${clamp(y, 6, AH() - navH() - bh - 6).toFixed(0)}px,0)`; bub.dataset.side = side; // nunca encima del dock
  }
  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  function flyTo(x, y, ms) {
    const s = AV(); x = clamp(x, -s.w * .25, AW() - s.w * .75); y = clamp(y, -s.h * .2, AH() - s.h * .2);
    const x0 = pos.x, y0 = pos.y, dist = Math.hypot(x - x0, y - y0); ms = ms || clamp(dist * 1.6, 260, 1100); if (REDUCED) ms = 1;
    const far = dist > 90, prev = M ? M.pose : 'idle'; if (M && far) { M.setPose('fly'); M.setYaw(x > x0 ? .55 : -.55); }
    return new Promise(res => { const t0 = performance.now(); let lx = x0, ly = y0;
      const step = now => { const k = Math.min(1, (now - t0) / ms), e = ease(k), nx = x0 + (x - x0) * e, ny = y0 + (y - y0) * e - Math.sin(k * Math.PI) * Math.min(60, dist * .12); if (M) M.setVel((nx - lx) * 12, (ny - ly) * 12); lx = nx; ly = ny; place(nx, ny);
        if (k < 1) requestAnimationFrame(step); else { if (M) { M.setVel(0, 0); M.setYaw(0); if (far) M.setPose(prev === 'fly' ? 'idle' : prev); } res(); } };
      requestAnimationFrame(step); });
  }

  /* ── globo de texto ── */
  function say(text, opts = {}) {
    clearInterval(typer); bub.hidden = false; placeBubble(); bub.classList.toggle('busy', !!opts.busy);
    if (REDUCED || opts.instant) { msg.textContent = text; placeBubble(); return; }
    let i = 0; msg.textContent = ''; typer = setInterval(() => { i += 2; msg.textContent = text.slice(0, i); if (i % 12 === 0) placeBubble(); if (i >= text.length) { clearInterval(typer); placeBubble(); } }, 16);
  }
  const status = t => { st.textContent = t; };
  const mood = (e, p) => { if (!M) return; if (e) M.setExpr(e); if (p) M.setPose(p); };

  /* ── tinta: el trazo que sale de su lápiz ── */
  let inkCtx = null;
  function sizeInk() { const d = Math.min(2, devicePixelRatio || 1); ink.width = Math.round(IW() * d); ink.height = Math.round(IH() * d); inkCtx = ink.getContext('2d'); inkCtx.setTransform(d, 0, 0, d, 0, 0); }
  function segsOf(d) { // el dibujo como tramos de pantalla (funciones: si mueves el gráfico mientras dibuja, el trazo lo sigue)
    const S = pt => () => H().toScreen(pt), pl = () => H().plot();
    if (d.type === 'horizontal') return [[() => ({x: pl().left, y: H().toScreen(d.a).y}), () => ({x: pl().right, y: H().toScreen(d.a).y})]];
    if (d.type === 'trend') return [[S(d.a), S(d.b)]];
    if (d.type === 'rect') { const c1 = {t: d.b.t, p: d.a.p}, c2 = {t: d.a.t, p: d.b.p}; return [[S(d.a), S(c1)], [S(c1), S(d.b)], [S(d.b), S(c2)], [S(c2), S(d.a)]]; }
    if (d.type === 'channel') { const off = d.c.p - (d.a.p + (d.b.p - d.a.p) * (d.c.t - d.a.t) / ((d.b.t - d.a.t) || 1)); return [[S(d.a), S(d.b)], [S({t: d.a.t, p: d.a.p + off}), S({t: d.b.t, p: d.b.p + off})]]; }
    if (d.type === 'fib') { const out = [[S(d.a), S(d.b)]]; for (const lv of [0, .236, .382, .5, .618, .786, 1]) { const p = d.b.p - (d.b.p - d.a.p) * lv, t = Math.min(d.a.t, d.b.t); out.push([() => ({x: H().toScreen({t, p}).x, y: H().toScreen({t, p}).y}), () => ({x: pl().right, y: H().toScreen({t, p}).y})]); } return out; }
    return [];
  }
  async function drawAnimated(d) {
    const segs = segsOf(d); if (!segs.length || !H()) return;
    const col = d.col || '#a78bfa', s = AV(); sizeInk();
    const first = segs[0][0](), hand0 = M ? M.handScreen() : {x: s.w * .8, y: s.h * .55};
    mood('focused', 'point'); { const f = V2(first); await flyTo(f.x - hand0.x, f.y - hand0.y); } mood('focused', 'draw');
    const done = [];
    for (const [fa, fb] of segs) {
      const a0 = fa(), b0 = fb(), len = Math.hypot(b0.x - a0.x, b0.y - a0.y), ms = REDUCED ? 1 : clamp(len * 1.15, 220, 900), t0 = performance.now();
      await new Promise(res => { const step = now => {
        const k = Math.min(1, (now - t0) / ms), e = k < 1 ? 1 - Math.pow(1 - k, 2) : 1, a = fa(), b = fb(), tip = {x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e};
        inkCtx.clearRect(0, 0, IW(), IH()); inkCtx.save(); { const pl = H().plot(); inkCtx.beginPath(); inkCtx.rect(pl.left, pl.top, pl.right - pl.left, pl.h); inkCtx.clip(); } inkCtx.lineCap = 'round'; inkCtx.strokeStyle = col; inkCtx.shadowColor = col; inkCtx.shadowBlur = 14; inkCtx.lineWidth = 2.4;
        for (const [ga, gb] of done) { const p = ga(), q = gb(); inkCtx.beginPath(); inkCtx.moveTo(p.x, p.y); inkCtx.lineTo(q.x, q.y); inkCtx.stroke(); }
        inkCtx.beginPath(); inkCtx.moveTo(a.x, a.y); inkCtx.lineTo(tip.x, tip.y); inkCtx.stroke();
        inkCtx.shadowBlur = 22; inkCtx.fillStyle = '#fff'; inkCtx.beginPath(); inkCtx.arc(tip.x, tip.y, 3.2, 0, 7); inkCtx.fill(); // chispa en la punta del lápiz
        inkCtx.restore();
        const h = M ? M.handScreen() : hand0, tv = V2(tip); place(tv.x - h.x, tv.y - h.y); if (M) M.setVel((b.x - a.x) / ms * 30, (b.y - a.y) / ms * 30);
        if (k < 1) requestAnimationFrame(step); else res(); };
        requestAnimationFrame(step); });
      done.push([fa, fb]);
    }
    H().add([d]); // queda como dibujo real del gráfico
    ink.classList.add('fade'); await sleep(260); inkCtx.clearRect(0, 0, IW(), IH()); ink.classList.remove('fade'); if (M) M.setVel(0, 0);
  }

  /* ── acciones ── */
  async function perform(acts, intro) {
    let h = H(); if (h && !onChart()) { say('Vamos al gráfico…', {busy: true}); h.go('chartView'); await sleep(900); const hm = home(); await flyTo(hm.x, hm.y, 500); }
    h = H(); if (!h || !h.ready()) { say('Abre el gráfico y espera a que carguen las velas; luego te dibujo lo que quieras.'); return; }
    if (acts.some(a => ['style', 'remove', 'move'].includes(a.do))) { await editDrawings(acts.filter(a => ['style', 'remove', 'move'].includes(a.do)), intro); return; }
    if (acts.some(a => a.do === 'clear')) { mood('wink', 'fly'); bub.hidden = true; const p = h.plot(); await flyTo(V2({x: p.left, y: 0}).x, pos.y, 700); const n = h.clearMine(); await flyTo(home().x, home().y); mood('happy', 'thumbs'); say(n ? `Listo, borré ${n} dibujo${n === 1 ? '' : 's'} mío${n === 1 ? '' : 's'}. Los tuyos siguen ahí.` : 'No tenía dibujos míos en este gráfico.'); setTimeout(() => mood('neutral', 'idle'), 1800); return; }
    const cs = h.visible(); if (cs.length < 20) { mood('thinking', 'think'); say('Veo muy pocas velas en pantalla. Aleja un poco el gráfico (pellizca o usa la rueda) y vuelvo a intentarlo.'); return; }
    mood('analyzing', 'think'); say(intro ? intro : 'Analizando tus velas…', {busy: true}); await sleep(REDUCED ? 0 : 750);
    bub.hidden = true; const texts = [];
    const C = CFG(); acts = acts.flatMap(a => a.do === 'full' ? (C.completo && C.completo.length ? C.completo : ['sr', 'trend', 'channel']).map(k => ({do: k})) : [a]);
    for (const a of acts.slice(0, 5)) { const r = D.build(a.do, cs, a.price, {sr: C.sr}), grp = a.do + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); texts.push(r.text); for (const d of r.drawings) { d.grp = grp; if (/^Soporte/.test(d.label || '') && C.colSup) d.col = C.colSup; if (/^Resistencia/.test(d.label || '') && C.colRes) d.col = C.colRes; await drawAnimated(d); } }
    const hm = home(); await flyTo(hm.x, hm.y); mood('happy', 'thumbs');
    say(((intro ? intro + ' ' : '') + texts.filter(Boolean).join(' ')).trim() || 'Listo.'); setTimeout(() => { if (!busy) mood('neutral', 'idle'); }, 2200);
  }

  /* ── editar lo que ya está dibujado: color, grosor, estilo, borrar o mover una pieza ── */
  const TNAME = {channel: ['el canal', 'los canales'], sup: ['el soporte', 'los soportes'], res: ['la resistencia', 'las resistencias'], trend: ['la tendencia', 'las tendencias'], fib: ['el Fibonacci', 'los Fibonacci'], range: ['el rango', 'los rangos'], hline: ['el nivel', 'los niveles'], line: ['la línea', 'las líneas'], last: ['el último dibujo', 'el último dibujo'], all: ['mis dibujos', 'mis dibujos']};
  const CNAME = c => { for (const [k, v] of Object.entries(D.COLORS)) if (v === c) return k; return c; };
  async function editDrawings(acts, intro) {
    const h = H(), out = []; let any = false;
    for (const a of acts.slice(0, 4)) {
      const list = h.list(), ids = D.pickTargets(list, a.target, a.do === 'move' ? a.price : undefined), nm = TNAME[a.target] || ['eso', 'eso'], pl = ids.length > 1 ? nm[1] : nm[0];
      if (!ids.length) { out.push(list.length ? `No encontré ${nm[0]} en el gráfico. ¿Quieres que lo dibuje primero?` : 'Todavía no hay dibujos en este gráfico. Pídeme uno y luego lo cambiamos.'); continue; }
      const d0 = list.find(d => d.id === ids[0]); if (d0 && d0.pts && d0.pts[0]) { const q = h.toScreen(d0.pts[0]); if (q) { const s = AV(), f = V2(q), hd = M ? M.handScreen() : {x: s.w * .8, y: s.h * .55}; bub.hidden = true; mood('focused', 'point'); await flyTo(clamp(f.x - hd.x, 0, AW() - s.w), clamp(f.y - hd.y, 0, AH() - s.h), 650); await sleep(REDUCED ? 0 : 250); } }
      any = true;
      if (a.do === 'remove') { const n = h.remove(ids); out.push(`Listo, quité ${pl}${n > 1 ? ` (${n})` : ''}.`); }
      else if (a.do === 'move') { h.patch(ids, {price: a.price}); out.push(`Moví ${nm[0]} a ${h.fmt ? h.fmt(a.price) : a.price}.`); }
      else { const f = {}; if (a.col) f.col = a.col; if (a.lw) f.lw = a.lw; if (a.ds !== undefined) f.ds = a.ds;
        if (a.col) { if (a.target === 'sup') setCfgSafe({colSup: a.col}); if (a.target === 'res') setCfgSafe({colRes: a.col}); }
        h.patch(ids, f); const bits = [a.col && `en ${CNAME(a.col)}`, a.lw === 3 && 'más gruesa', a.lw === 1 && 'más delgada', a.ds === 'dot' && 'punteada', a.ds === 'dash' && 'discontinua', a.ds === '' && 'sólida'].filter(Boolean);
        out.push(`Listo, puse ${pl} ${bits.join(' y ')}.`); }
    }
    if (any) { mood('happy', 'thumbs'); await sleep(REDUCED ? 0 : 300); const hm = home(); await flyTo(hm.x, hm.y, 600); } else mood('thinking', 'idle');
    say(((intro ? intro + ' ' : '') + out.join(' ')).trim()); setTimeout(() => { if (!busy) mood('neutral', 'idle'); }, 2000);
  }
  function setCfgSafe(o) { try { const h = H(); if (h && h.setCfg) h.setCfg({...CFG(), ...o}); } catch {} } // que los próximos soportes/resistencias salgan del color que pediste
  const SYS = `Eres NEXUS PIXEL, el avatar asistente de trading de VORTEX (by Nova Nexus): un robot amable que flota sobre el gráfico del usuario y puede dibujar en él.
Habla en español, breve (máximo 3 frases), claro y con buena onda, sin prometer ganancias (no es asesoría financiera).
Responde SOLO con un objeto JSON: {"reply":"tu respuesta","actions":[...]}
Acciones posibles (úsalas cuando el usuario pida dibujar o cuando un dibujo ayude a explicar): {"do":"channel"} canal, {"do":"range"} rango/consolidación, {"do":"sr"} soportes y resistencias, {"do":"trend"} línea de tendencia, {"do":"fib"} Fibonacci, {"do":"hline","price":NUMERO} línea horizontal en un precio, {"do":"clear"} borrar tus dibujos.
Para EDITAR lo que ya está dibujado (ver DIBUJOS en los datos) usa: {"do":"style","target":T,"col":"#rrggbb","lw":1|2|3,"ds":"dot"|"dash"|""} (color, grosor, punteada/discontinua/sólida), {"do":"remove","target":T} quitar uno, {"do":"move","target":T,"price":NUMERO} mover un nivel. T es uno de: channel, sup, res, trend, fib, range, hline, line, last.
MUY IMPORTANTE: si el usuario pide cambiar color, grosor o estilo de algo que YA existe, NUNCA dibujes algo nuevo: usa "style". Si no está claro a qué dibujo se refiere, pregúntale cuál (usa los nombres de DIBUJOS) y deja "actions":[].
El usuario ya está viendo su gráfico (en computadora el gráfico está siempre a la izquierda y el panel a la derecha): responde sobre el gráfico.
Los niveles los calcula la app con las velas reales: no inventes precios. Si no hace falta dibujar, deja "actions":[].`;
  function context() {
    const h = H(); if (!h) return {}; const cs = h.visible(), o = {simbolo: h.symbol(), temporalidad: h.interval(), ultimo: h.last(), velasEnPantalla: cs.length};
    if (cs.length) { o.maximoVisible = Math.max(...cs.map(c => c.h)); o.minimoVisible = Math.min(...cs.map(c => c.l)); o.cambioVisiblePct = +((cs[cs.length - 1].c / cs[0].o - 1) * 100).toFixed(2); }
    try { if (h.desktop() && section() !== 'chartView') o.panelDerechoAbierto = (NAMES[section()] || section()) + ': ' + screenText(section()).slice(0, 500); } catch {}
    try { o.dibujos = h.list().slice(-14).map(d => ({tipo: d.type, nombre: d.label || '', color: d.col, mio: d.pix, precio: d.p && d.p.map(v => +(+v).toPrecision(6))})); } catch {}
    try { const c = window.CCT_getAIContext && window.CCT_getAIContext(); if (c) o.indicadores = JSON.stringify(c).slice(0, 1800); } catch {}
    return o;
  }
  function profile() { // lo que el usuario configuró en la tarjeta de Pixel
    const c = CFG(), out = [];
    if (c.nombre) out.push(`El usuario se llama ${c.nombre}: llámalo así.`);
    if (c.estilo) out.push(`Opera ${c.estilo}${c.tfs && c.tfs.length ? ' en ' + c.tfs.join(', ') : ''}, con riesgo ${c.riesgo}.`);
    if (c.reglas) out.push('SUS REGLAS DE TRADING (respétalas y avísale si algo las rompe): ' + c.reglas);
    if (c.notas) out.push('RECUERDA SIEMPRE: ' + c.notas);
    if (c.tono) out.push(`Háblale ${c.tono === 'corto y directo' ? 'corto y directo (máximo 3 frases)' : 'explicando paso a paso (máximo 6 frases)'}, en tono ${c.trato}.`);
    return out.length ? '\nPERFIL DEL USUARIO:\n' + out.join('\n') : '';
  }
  async function llmAsk(text) {
    const L = LLM(); if (!L || !L.chat) throw new Error('sin IA');
    const msgs = [{role: 'system', content: SYS + profile()}, ...hist.slice(-6), {role: 'user', content: `${text}\n\nDATOS DEL GRÁFICO (JSON): ${JSON.stringify(context())}`}];
    const r = await Promise.race([L.chat(msgs, {purpose: 'text', maxTokens: 380}), sleep(28000).then(() => { throw new Error('La IA tardó demasiado'); })]);
    const raw = String(r && r.text || ''), m = raw.match(/\{[\s\S]*\}/); let j = null; try { j = m ? JSON.parse(m[0]) : null; } catch {}
    const reply = j && typeof j.reply === 'string' ? j.reply : raw.replace(/```[\s\S]*?```/g, '').trim();
    const ok = ['channel', 'range', 'sr', 'trend', 'fib', 'hline', 'clear', 'style', 'remove', 'move'], TG = ['channel', 'sup', 'res', 'trend', 'fib', 'range', 'hline', 'line', 'last'], hx = c => /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : (D.COLORS[String(c || '').toLowerCase()] || undefined);
    const actions = (j && Array.isArray(j.actions) ? j.actions : []).filter(a => a && ok.includes(a.do) && ((a.do !== 'hline' && a.do !== 'move') || (Number.isFinite(+a.price) && +a.price > 0)) && (!['style', 'remove', 'move'].includes(a.do) || TG.includes(a.target)))
      .map(a => a.do === 'hline' ? {do: 'hline', price: +a.price} : a.do === 'move' ? {do: 'move', target: a.target, price: +a.price} : a.do === 'remove' ? {do: 'remove', target: a.target} : a.do === 'style' ? {do: 'style', target: a.target, col: hx(a.col), lw: [1, 2, 3].includes(+a.lw) ? +a.lw : undefined, ds: ['dot', 'dash', ''].includes(a.ds) ? a.ds : undefined} : {do: a.do})
      .filter(a => a.do !== 'style' || a.col || a.lw || a.ds !== undefined);
    hist.push({role: 'user', content: text}, {role: 'assistant', content: reply}); if (hist.length > 12) hist.splice(0, hist.length - 12);
    return {reply: reply.slice(0, 600), actions};
  }
  async function ask(text) {
    text = String(text || '').trim(); if (!text || busy) return; busy = true; wake(); input.value = ''; bub.classList.add('working'); big(false);
    try {
      if (await routeApp(text)) return;
      const acts = D.parse(text);
      if (acts.length) await perform(acts);
      else {
        mood('thinking', 'think'); say('Déjame pensarlo…', {busy: true}); status('pensando…');
        try { const r = await llmAsk(text); status('IA de VORTEX'); if (r.actions.length) await perform(r.actions, r.reply); else { mood('happy', 'idle'); say(r.reply || 'Mmm, no tengo una respuesta clara. ¿Quieres que te dibuje soportes, el canal o el rango?'); } }
        catch { status('sin conexión a la IA'); mood('surprised', 'idle'); say('No pude hablar con la IA ahorita, pero sí puedo dibujarte: canal, rango, soportes y resistencias, tendencia, Fibonacci o una línea en el precio que me digas.'); }
      }
    } catch (e) { console.warn('Nexus Pixel', e); try { inkCtx && inkCtx.clearRect(0, 0, IW(), IH()); } catch {} mood('surprised', 'idle'); const h = home(); place(h.x, h.y); say('Uy, algo falló mientras dibujaba. Inténtalo otra vez.'); } finally { busy = false; bub.classList.remove('working'); lastAct = Date.now(); }
  }

  /* ════════ Pixel en toda la app: habilidades por sección ════════ */
  const NAMES = {chartView: 'Gráfico', watchView: 'Mi seguimiento', newsView: 'Noticias', screenerView: 'Screener', alertsView: 'Alertas', aiView: 'IA', lensView: 'Nexus Lens', botLabView: 'Nova Bot Lab', discordView: 'Discord', settingsView: 'Configuración'};
  const nrm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const CHIPS = {
    chartView: [['Canal', 'Dibújame el canal'], ['Rango', 'Marca el rango'], ['Soportes y resistencias', 'Marca soportes y resistencias'], ['Tendencia', 'Traza la línea de tendencia'], ['Fibonacci', 'Pon Fibonacci'], ['Análisis completo', 'Análisis completo'], ['Borrar lo mío', 'Borra lo que dibujaste']],
    newsView: [['Resume las noticias', 'Resume las noticias'], ['¿Qué mueve al mercado?', '¿Qué está moviendo al mercado hoy?'], ['¿Algo de BTC?', '¿Hay noticias importantes de Bitcoin?']],
    screenerView: [['Mejor entrada', '¿Cuál tiene la mejor entrada del screener?'], ['Mejores LONG', '¿Cuáles son las mejores señales LONG del screener?'], ['Mejores SHORT', '¿Cuáles son las mejores señales SHORT del screener?'], ['Más confluencias', '¿Cuál tiene más confluencias para entrar?']],
    alertsView: [['Crear una alerta', 'Quiero crear una alerta'], ['Mis alertas', '¿Qué alertas tengo activas?'], ['¿Cómo funcionan?', '¿Cómo funcionan las alertas?']],
    lensView: [['¿Qué lleno aquí?', '¿Qué tengo que llenar aquí?'], ['¿Dónde saco mi API key?', '¿Dónde encuentro mi API key de BingX?'], ['¿Es seguro?', '¿Es seguro poner mis datos aquí?']],
    botLabView: [['Ayúdame a crear un bot', 'Ayúdame a crear un bot'], ['Consejos', 'Dame consejos para mejorar mis bots'], ['¿Cómo empiezo?', '¿Cómo empiezo con Nova Bot Lab?']],
    watchView: [['¿Cuál se mueve más?', '¿Cuál de mi seguimiento se está moviendo más?'], ['Añadir una cripto', '¿Cómo añado una criptomoneda?'], ['Ordenar mi lista', '¿Cómo ordeno mi lista en secciones?']],
    aiView: [['¿Qué puedes hacer?', '¿Qué puedes hacer en cada sección?'], ['Analiza mi gráfico', 'Análisis completo']],
    settingsView: [['¿Dónde cambio el tema?', '¿Dónde cambio el tema?'], ['Instalar la app', '¿Cómo instalo la app en mi celular?'], ['Avisos con app cerrada', '¿Dónde activo los avisos con la app cerrada?']],
    discordView: [['¿Cómo conecto mi canal?', '¿Cómo conecto mi canal de Discord?']]
  };
  const GENERIC = [['¿Dónde está…?', '¿Dónde encuentro la herramienta de Fibonacci?'], ['¿Qué puedes hacer?', '¿Qué puedes hacer aquí?']];
  function setChips() { const sec0 = section(), dk = !!(H() && H().desktop()); input.placeholder = sec0 === 'chartView' || dk ? 'Pídeme algo: «dibuja el canal»…' : sec0 === 'alertsView' ? 'Ej.: avísame si BTC pasa 70 mil…' : sec0 === 'screenerView' ? '¿Cuál tiene la mejor entrada?…' : 'Pregúntame o pídeme algo…';
    const sec = sec0, c = dk && sec !== 'chartView' ? [...CHIPS.chartView.slice(0, 5), ...(CHIPS[sec] || []).slice(0, 2)] : (CHIPS[sec] || GENERIC); bub.querySelector('.px-chips').innerHTML = c.map(([t, q]) => `<button type="button" data-q="${esc(q)}">${esc(t)}</button>`).join(''); }
  function screenText(sec) { const el = document.getElementById(sec); if (!el) return ''; return el.innerText.replace(/\n{2,}/g, '\n').slice(0, 2600); }

  /* ── señalar en pantalla (buscar herramientas y botones) ── */
  function spot(el, ms = 4200) { if (!el) return; el.classList.add('px-spot'); try { el.scrollIntoView({block: 'center', behavior: REDUCED ? 'auto' : 'smooth'}); } catch {} setTimeout(() => el.classList.remove('px-spot'), ms); }
  async function pointAt(el) {
    if (!el) return; await sleep(350); const r = el.getBoundingClientRect(), l = layer.getBoundingClientRect(), s = AV(); if (!r.width) return;
    const tx = r.left - l.left + r.width / 2, ty = r.top - l.top + r.height / 2, left = tx > AW() / 2, x = clamp(left ? tx - s.w - 16 : tx + 16, 0, AW() - s.w), y = clamp(ty - s.h * .45, 0, AH() - s.h);
    mood('excited', 'point'); M && M.setYaw(left ? .5 : -.5); await flyTo(x, y, 700); spot(el); setTimeout(() => { if (M) M.setYaw(0); }, 2400);
  }
  const PLACES = [ // [palabras, nombre, sección, selector PC, selector celular, explicación]
    [/indicador/, 'Indicadores', 'chartView', '[data-panel="indicators"]', '[data-panel="indicators"]', 'Ahí agregas EMA, RSI, Bollinger, tus scripts Pine y Nova Nexus.'],
    [/plantilla|diseno guardad/, 'Plantilla', 'chartView', '#designsBtn', '#designsBtn', 'Guarda y aplica la configuración completa de tu gráfico.'],
    [/temporalidad|marco de tiempo|timeframe|1h|4h/, 'Temporalidades', 'chartView', '#timeframes', '#tfBtn', 'Cambia entre 1m, 5m, 1h, 4h, 1D…'],
    [/tipo de vela|velas heikin|heikin|linea de precio/, 'Tipo de vela', 'chartView', '#ctypeBtn', '#moreBtn', 'Velas, Heikin Ashi, línea y más.'],
    [/dividir|varios graficos|2 graficos|layout/, 'Dividir el gráfico', 'chartView', '#layoutBtn', '#moreBtn', 'Hasta 5 gráficos a la vez.'],
    [/deshacer/, 'Deshacer', 'chartView', '#undoDraw', '#undoDraw', 'Regresa tu último dibujo.'],
    [/cambiar (de )?(moneda|cripto)|buscar (una )?(moneda|cripto)|otro exchange|bingx|bybit/, 'Buscar activo', 'chartView', '#symbolButton', '#symbolButton', 'Busca cualquier cripto y elige el exchange.'],
    [/anadir|agregar (una )?(cripto|moneda)|seguimiento/, 'Añadir a Mi seguimiento', 'watchView', '#addAsset', '#addAsset', 'Agrega criptos de cualquier exchange.'],
    [/crear (una )?alerta|nueva alerta/, 'Crear alerta', 'alertsView', '#alAdd', '#alAdd', 'O dímelo a mí: «avísame si BTC pasa 70 mil».'],
    [/alerta/, 'Alertas', 'alertsView', '[data-side="alertsView"]', '#topAlertsBtn', 'Tus alertas de precio y de indicador.'],
    [/avisos con la app cerrada|app cerrada|notificacion/, 'Avisos con la app cerrada', 'alertsView', '[data-altab="how"]', '[data-altab="how"]', 'En «Avisos»: enciende «Activar notificaciones».'],
    [/calendario/, 'Calendario económico', 'newsView', '[data-nw-tab="cal"]', '[data-nw-tab="cal"]', 'Eventos pasados, de hoy y futuros.'],
    [/noticia/, 'Noticias', 'newsView', '[data-side="newsView"]', '.bottom-nav [data-view="newsView"]', 'Cripto y bolsa en español.'],
    [/screener|senales/, 'Screener', 'screenerView', '[data-side="screenerView"]', '.bottom-nav [data-view="screenerView"]', 'Señales de Nova Nexus en el top de criptos.'],
    [/lens|mi cuenta de bingx|mis operaciones/, 'Nexus Lens', 'lensView', '[data-side="lensView"]', '.bottom-nav [data-view="lensView"]', 'Tu cuenta, trades abiertos y operaciones.'],
    [/bot lab|crear (un )?bot|backtest|paper/, 'Nova Bot Lab', 'botLabView', '#rrBotLab', null, 'Crea, prueba y simula bots (versión de PC).'],
    [/discord/, 'Discord', 'discordView', '#rrDiscord', '#dcOpenFromSettings', 'Únete a Nova Nexus y manda tus avisos a tu canal.'],
    [/tema|modo oscuro|modo claro/, 'Tema claro/oscuro', null, '#rrTheme', '#themeBtn', 'Cambia entre claro y oscuro.'],
    [/preferencia|zona horaria|formato|decimales/, 'Preferencias', 'settingsView', '#setPrefs', '#setPrefs', 'Hora, fecha y formato de precios.'],
    [/instalar|icono de la app/, 'Instalar la app', 'customView', '#appInstall', '#appInstall', 'Elige el ícono e instálala en tu celular.'],
    [/iniciar sesion|cuenta de google|login/, 'Iniciar sesión', null, '#rrAccount', '#accountBtn', 'Con Google: tu configuración viaja a todos tus dispositivos.'],
    [/saldo/, 'Saldo de la cuenta', null, '[data-acct-open]', '[data-acct-open]', 'La barra que te anima a usar stop loss.'],
    [/configuracion|ajustes/, 'Configuración', 'settingsView', '[data-side="settingsView"]', '#settingsBtn', 'Cuenta, avisos, preferencias, app y datos.'],
    [/\bia\b|briefing|laboratorio/, 'IA', 'aiView', '[data-side="aiView"]', '.bottom-nav [data-view="aiView"]', 'Analizar gráfico, Briefing del día y Laboratorio de indicadores.']
  ];
  async function findThing(t) {
    const h = H(), q = nrm(t), tools = h.tools(), desk = h.desktop();
    const tool = tools.find(x => q.includes(nrm(x.t)) || (/fibo/.test(q) && /fibonacci/i.test(x.t) && !/tiempo|abanico|circul|extension|canal|espiral|cuña/i.test(x.t)) || (/pincel|dibujar a mano/.test(q) && x.k === 'brush') || (/long|short/.test(q) && x.k === (q.includes('short') ? 'short' : 'long')) || (/texto/.test(q) && x.k === 'text'));
    if (tool) {
      h.go('chartView'); await sleep(desk ? 250 : 600); let el = null;
      if (desk) el = document.querySelector(`#toolRail [data-group="${tool.gid}"]`); // solo la señala: no la activa hasta que digas «Sí, actívala»
      else { const b = document.querySelector('[data-panel="tools"]'); if (b) { b.click(); await sleep(450); el = document.querySelector(`.sheet-item[data-tool="${tool.k}"]`); } }
      await pointAt(el); mood('happy', 'point');
      say(`¡Aquí está «${tool.t}»! Está en el grupo ${tool.g}${desk ? ' de la barra de la izquierda (el botón que brilla; toca su flechita para ver todo el grupo)' : ', dentro de «Dibujar»'}. ${tool.d}. ¿La activo?`); setChipsCustom([['Sí, actívala', '__tool:' + tool.k], ['Gracias', 'gracias']]); return true;
    }
    const pl = PLACES.find(x => x[0].test(q)); if (!pl) return false;
    const [, name, sec, selD, selM, why] = pl, sel = desk ? selD : selM;
    if (!sel) { say(`${name} está en la versión de PC: ${why}`); return true; }
    if (sec && !(desk && sec === 'chartView')) { const host = sec === 'chartView' ? 'chartView' : sec; if (!document.querySelector(sel) || !document.querySelector(sel).offsetParent) { h.go(host); await sleep(650); } }
    let el = document.querySelector(sel); if (el && !el.offsetParent && !desk && sel === '#moreBtn') el = document.querySelector('#moreBtn');
    await pointAt(el); mood('happy', 'point'); say(`Aquí está: ${name}. ${why}`); return true;
  }
  function setChipsCustom(list) { bub.querySelector('.px-chips').innerHTML = list.map(([t, q]) => `<button type="button" data-q="${esc(q)}">${esc(t)}</button>`).join(''); }

  /* ── IA con el contexto de la sección ── */
  const SYS_APP = `Eres NEXUS PIXEL, el asistente amigable de VORTEX (by Nova Nexus), una app de trading cripto. Vives en toda la app y ayudas en cada sección.
Secciones: Gráfico (velas, indicadores, dibujos; tú puedes dibujar), Mi seguimiento (lista de criptos), Noticias (cripto y bolsa en español + Calendario económico), Screener (señales LONG/SHORT/RANGO de Nova Nexus; edad = velas desde que salió), Alertas (de precio y de indicador; avisos con la app cerrada y a Discord), IA (Analizar gráfico, Briefing del día, Laboratorio de indicadores), Nexus Lens (ver tu cuenta de BingX: saldo, trades abiertos, historial; usa API key de SOLO LECTURA de BingX), Nova Bot Lab (PC: crear bots en español o constructor visual, backtest, paper trading, riesgo), Discord, Configuración.
Habla en español, claro, breve y con buena onda. No prometas ganancias (no es asesoría financiera). Usa SOLO los datos que te dan; si falta algo, dilo.`;
  async function llmText(sys, user, maxTokens = 650) {
    const L = LLM(); if (!L || !L.chat) throw new Error('sin IA');
    const r = await Promise.race([L.chat([{role: 'system', content: sys + profile()}, ...hist.slice(-4), {role: 'user', content: user}], {purpose: 'text', maxTokens}), sleep(60000).then(() => { throw new Error('tarde'); })]);
    const t = String(r && r.text || '').replace(/```[\s\S]*?```/g, '').trim(); hist.push({role: 'user', content: user.slice(0, 300)}, {role: 'assistant', content: t.slice(0, 600)}); if (hist.length > 12) hist.splice(0, hist.length - 12); return t;
  }
  const big = on => { bub.classList.toggle('long', !!on); if (!bub.hidden) placeBubble(); };

  async function skillNews(t) {
    const items = (window.CCTNews && CCTNews.items() || []).filter(n => n && n.title).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 30);
    if (!items.length) { H().go('newsView'); say('Aún no cargan las noticias. Dame unos segundos y vuelve a pedírmelo.'); return; }
    mood('analyzing', 'think'); say('Leyendo las noticias…', {busy: true});
    const list = items.map(n => `- [${n.t ? new Date(n.t).toLocaleString('es', {hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short'}) : ''}] ${n.title}${n.src ? ' (' + n.src + ')' : ''}${n.desc ? ' — ' + String(n.desc).slice(0, 140) : ''}`).join('\n');
    try { const r = await llmText(SYS_APP + '\nTAREA: resume las noticias que te paso. Máximo 8 viñetas cortas con lo más importante para cripto y bolsa, indicando si es positivo o negativo para el mercado, y al final 1 frase con el sentimiento general.', `${t}\n\nNOTICIAS RECIENTES:\n${list}`, 750); big(true); mood('happy', 'idle'); say(r); }
    catch { big(true); mood('surprised', 'idle'); say('No pude hablar con la IA, pero estos son los titulares más nuevos:\n' + items.slice(0, 6).map(n => '• ' + n.title).join('\n')); }
  }
  async function skillScreener(t) {
    const S = window.CCTScreener; let rows = S ? S.rows() : []; if (section() !== 'screenerView') { H().go('screenerView'); await sleep(700); }
    if (!rows.filter(r => r.sig).length) { if (S && S.open) S.open(); mood('analyzing', 'think'); say('Estoy escaneando las criptos del Screener…', {busy: true}); for (let i = 0; i < 30 && !(S.rows().filter(r => r.sig).length && !S.busy()); i++) await sleep(1000); rows = S.rows(); }
    const sig = rows.filter(r => r.sig); if (!sig.length) { mood('thinking', 'idle'); say('Ahorita ninguna moneda del Screener tiene señal en esta temporalidad. Prueba otra (por ejemplo 15m o 4h) y te digo.'); return; }
    const q = nrm(t), want = /short|venta/.test(q) ? 'sell' : /long|compra/.test(q) ? 'buy' : '';
    const rank = sig.filter(r => !want || r.sig.side === want).map(r => ({r, sc: r.sig.score * 2 + (r.sig.div ? 2 : 0) - r.sig.ago * .6 + (r.sig.range ? -1.5 : 0)})).sort((a, b) => b.sc - a.sc).slice(0, 8);
    if (!rank.length) { say(`No hay señales ${want === 'sell' ? 'SHORT' : 'LONG'} ahorita en el Screener.`); return; }
    const tf = S.tf() || '1h', rowsTxt = rank.map(({r}) => `${r.symbol}: ${r.sig.range ? 'RANGO' : r.sig.side === 'buy' ? 'LONG' : 'SHORT'}, puntaje ${r.sig.score}/5${r.sig.div ? ', con divergencia' : ''}, salió hace ${r.sig.ago} velas (vigente ${r.sig.left} más), cambio 24h ${r.chg != null ? (+r.chg).toFixed(2) + '%' : '—'}, precio ${r.price}`).join('\n');
    mood('analyzing', 'think'); say('Comparando las señales…', {busy: true});
    const best = rank[0].r;
    try { const r = await llmText(SYS_APP + '\nTAREA: eres analista del Screener de Nova Nexus. Con las señales que te paso (ya ordenadas por calidad: puntaje alto, divergencia y señal reciente = mejor), elige la(s) mejor(es) entrada(s) para lo que pide el usuario, explica en 1 línea cada una por qué (confluencias: puntaje, divergencia, qué tan reciente, momentum de 24h) y menciona riesgos. Máximo 6 viñetas. Recomienda confirmar en el gráfico.', `${t}\n\nSEÑALES DEL SCREENER (${tf}):\n${rowsTxt}`, 650); big(true); mood('happy', 'thumbs'); say(r); }
    catch { big(true); mood('happy', 'thumbs'); say('Las mejores señales ahorita (por puntaje, divergencia y qué tan recientes):\n' + rank.slice(0, 5).map(({r}, i) => `${i + 1}. ${r.symbol.replace(/USDT$/, '')} · ${r.sig.side === 'buy' ? 'LONG' : 'SHORT'} · ${r.sig.score}/5${r.sig.div ? ' · div' : ''} · hace ${r.sig.ago} velas`).join('\n')); }
    setChipsCustom([[`Ver ${best.symbol.replace(/USDT$/, '')} en el gráfico`, '__open:' + best.symbol + ':' + tf], ...CHIPS.screenerView.slice(1, 3)]);
  }
  const COINS = {bitcoin: 'BTC', btc: 'BTC', ethereum: 'ETH', eth: 'ETH', ether: 'ETH', solana: 'SOL', sol: 'SOL', xrp: 'XRP', ripple: 'XRP', bnb: 'BNB', doge: 'DOGE', dogecoin: 'DOGE', ada: 'ADA', cardano: 'ADA', pepe: 'PEPE', sui: 'SUI', link: 'LINK', avax: 'AVAX', ton: 'TON', trx: 'TRX', shib: 'SHIB', ltc: 'LTC', dot: 'DOT', near: 'NEAR', apt: 'APT', arb: 'ARB', op: 'OP', wif: 'WIF', bonk: 'BONK', qnt: 'QNT'};
  function numIn(s) { const m = s.match(/(\d[\d.,]*)\s*(k|mil|m\b|millones?)?/); if (!m) return null; let raw = m[1].replace(/[.,]$/, ''); let v = /^\d{1,3}([.,]\d{3})+$/.test(raw) ? +raw.replace(/[.,]/g, '') : +raw.replace(',', '.'); if (m[2] === 'k' || m[2] === 'mil') v *= 1000; else if (m[2] === 'm' || /^millon/.test(m[2] || '')) v *= 1e6; return Number.isFinite(v) && v > 0 ? v : null; }
  async function skillAlert(t) {
    const h = H(), q = nrm(t); let base = null; for (const w of q.split(/[^a-z0-9]+/)) { if (COINS[w]) { base = COINS[w]; break; } const up = w.toUpperCase(); if (/^[A-Z0-9]{2,10}$/.test(up) && h.symbols().some(x => x === up + 'USDT')) { base = up; break; } }
    const sym = (base ? base + 'USDT' : (h.current() || 'BTCUSDT').replace(/[-_]/g, '').replace(/@.*/, '')); if (!/^[A-Z0-9]{3,20}$/.test(sym)) { say('Dime de qué cripto quieres la alerta (por ejemplo «avísame si BTC pasa 70 mil»).'); return; }
    const last = await h.price(sym); const pct = q.match(/(\d+(?:[.,]\d+)?)\s*(%|por ?ciento)/); let price = null;
    if (pct && last) { const k = +pct[1].replace(',', '.') / 100; price = /baj|caig|cae|abajo|desplom|pierd/.test(q) ? last * (1 - k) : last * (1 + k); }
    else { const rest = q.replace(/\b(btc|eth|sol|usdt)\b/g, ' '); price = numIn(rest); }
    if (!price) { h.go('alertsView'); await sleep(500); say(`¿En qué precio pongo la alerta de ${sym.replace(/USDT$/, '')}? ${last ? 'Ahorita está en ' + h.fmt(last) + '.' : ''} Dime por ejemplo «avísame si llega a ${last ? h.fmt(Math.round(last * 1.03)) : '70000'}».`); return; }
    if (!last) { say('No pude leer el precio actual; revisa tu conexión e inténtalo otra vez.'); return; }
    const dir = price > last ? 'up' : 'down', cond = /cruce|cruza/.test(q) ? null : (/(sube|suba|arriba|supere|rompa|pase|pasa|mayor)/.test(q) && dir === 'up') ? 'up' : (/(baje|baja|abajo|caiga|pierda|menor|debajo)/.test(q) && dir === 'down') ? 'down' : null;
    const a = h.addAlert({symbol: sym, price, dir, cond, last, repeat: /siempre|cada vez|todas las veces/.test(q) ? 'every' : 'once', notify: /discord/.test(q) ? (/app|celular|ambos|tambien/.test(q) ? 'both' : 'discord') : 'app', note: 'Creada con Nexus Pixel'});
    if (!a) { say('No pude crear esa alerta. Revisa el precio y la cripto.'); return; }
    h.go('alertsView'); await sleep(500); mood('happy', 'thumbs');
    say(`¡Listo! Te aviso cuando ${sym.replace(/USDT$/, '')} ${dir === 'up' ? 'suba a' : 'baje a'} ${h.fmt(price)} (ahora ${h.fmt(last)})${a.repeat === 'every' ? ', cada vez que pase' : ', una vez'}${a.notify !== 'app' ? ', también en Discord' : ''}.`);
    setChipsCustom([['Deshacer', '__undoalert:' + a.id], ['Otra alerta', 'Quiero crear otra alerta']]);
  }
  async function skillLens(t) {
    const fr = document.getElementById('lensFrame'); let txt = ''; try { txt = fr && fr.contentDocument ? fr.contentDocument.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 3000) : ''; } catch {}
    mood('thinking', 'think'); say('Déjame ver la pantalla de Nexus Lens…', {busy: true});
    try { const r = await llmText(SYS_APP + '\nTAREA: ayuda con Nexus Lens. Explica qué llenar y dónde conseguir cada dato. Para BingX: Perfil → Gestión de API → Crear API, permiso SOLO de lectura (nunca retiros ni trading), copia API Key y Secret Key; la firma se hace en el dispositivo del usuario. Si piden «Proxy URL», es el Worker de Cloudflare que reenvía las consultas de lectura. Responde en pasos cortos.', `${t}\n\nLO QUE SE VE EN NEXUS LENS:\n${txt || '(no se pudo leer la pantalla)'}`, 600); big(true); mood('happy', 'idle'); say(r); }
    catch { big(true); say('Para Nexus Lens necesitas tu API Key y Secret Key de BingX con permiso SOLO de lectura: en BingX ve a Perfil → Gestión de API → Crear API, marca solo lectura y copia las dos claves aquí. Nunca actives retiros.'); }
  }
  async function skillBot(t) {
    const h = H(), B = window.CCTBotLabUI, bots = B ? (B.state().bots || []).filter(b => b.status !== 'archived').map(b => { const r = (b.runs || [])[b.runs.length - 1]; return `${b.name} (${b.status})${r && r.metrics ? `: ${r.metrics.n} op., ${r.metrics.retPct != null ? (+r.metrics.retPct).toFixed(1) : '—'}%, aciertos ${r.metrics.winRate != null ? (+r.metrics.winRate).toFixed(0) : '—'}%, caída ${r.metrics.maxDDPct != null ? (+r.metrics.maxDDPct).toFixed(1) : '—'}%` : ''}`; }) : [];
    mood('thinking', 'think'); say('Pensando en tu bot…', {busy: true});
    const create = /crea|hazme|arma|construy/.test(nrm(t)) && t.length > 25;
    try {
      const r = await llmText(SYS_APP + '\nTAREA: ayuda a crear o mejorar bots de trading en Nova Bot Lab. Si el usuario describe una estrategia, conviértela en una descripción clara para el bot (activo, temporalidad, condiciones de entrada y salida, stop loss y take profit) y da 2-3 consejos de riesgo. Si pide consejos, revisa sus bots (si hay datos) y sugiere mejoras concretas. Recomienda backtest y paper trading antes de dinero real. Máximo 8 viñetas.', `${t}\n\nMIS BOTS:\n${bots.join('\n') || '(aún no tiene bots)'}`, 700);
      big(true); mood('happy', 'idle'); say(r);
    } catch { big(true); say('Para un buen bot: define activo y temporalidad, una condición clara de entrada (p. ej. cruce de EMA + RSI), stop loss y take profit, y riesgo de 1% por operación. Pruébalo con backtest y luego en paper trading antes de usar dinero real.'); }
    if (h.desktop()) setChipsCustom([...(create ? [['Crear este bot en Bot Lab', '__bot:' + t.slice(0, 400)]] : []), ['Abrir Nova Bot Lab', '__go:botLabView'], ['Consejos', 'Dame consejos para mejorar mis bots']]);
    else setChipsCustom([['¿Dónde está Bot Lab?', '¿Dónde encuentro Nova Bot Lab?']]);
  }
  async function skillGeneral(t) {
    const sec = section(); mood('thinking', 'think'); say('Déjame pensarlo…', {busy: true});
    const extra = sec === 'alertsView' ? '\nMIS ALERTAS: ' + JSON.stringify(H().alerts().slice(0, 15)) : '';
    try { const r = await llmText(SYS_APP + `\nEl usuario está en la sección «${NAMES[sec] || sec}». Responde lo que pregunta usando lo que se ve en su pantalla. Si pregunta dónde está algo, dile exactamente el botón y la sección.`, `${t}\n\nLO QUE SE VE EN SU PANTALLA (${NAMES[sec] || sec}):\n${screenText(sec)}${extra}`, 550); big(r.length > 260); mood('happy', 'idle'); say(r); }
    catch { mood('surprised', 'idle'); say('No pude hablar con la IA ahorita. Pero puedo enseñarte dónde está cada cosa: pregúntame «¿dónde está…?».'); }
  }
  /* En PC: palabras que indican que hablas del panel derecho y no del gráfico */
  const SIDE_KW = {watchView: /(seguimiento|watchlist|mi lista|lista de monedas|cual se mueve|panel)/, newsView: /(noticia|titular|resum|panel)/, alertsView: /(alerta|panel)/, lensView: /(lens|bingx|cuenta|panel)/, botLabView: /(\bbots?\b|bot lab|panel)/, aiView: /(panel|esta seccion|aqui)/, settingsView: /(config|ajuste|panel)/, discordView: /(discord|panel)/, screenerView: /(screener|panel)/};
  /* A qué habilidad va cada pedido */
  async function routeApp(text) {
    const q = nrm(text), sec = section();
    if (text.startsWith('__')) { const [k, a, b] = text.split(':'); const h = H();
      if (k === '__tool') { h.pickTool(a); say('Listo, ya está activa. Toca el gráfico para empezar.'); return true; }
      if (k === '__open') { h.openSymbol(a, b); h.go('chartView'); say(`Abrí ${a.replace(/USDT$/, '')} en ${b}. ¿Te dibujo soportes y resistencias?`); setChips(); return true; }
      if (k === '__undoalert') { say(h.removeAlert(a) ? 'Listo, quité esa alerta.' : 'Esa alerta ya no existe.'); setChips(); return true; }
      if (k === '__go') { h.go(a); setTimeout(setChips, 700); say(`Abrí ${NAMES[a] || a}.`); return true; }
      if (k === '__bot') { h.go('botLabView'); await sleep(500); if (window.CCTBotLabUI && CCTBotLabUI.nl) CCTBotLabUI.nl(text.slice(6)); say('Listo: en Nova Bot Lab la IA está convirtiendo tu estrategia en reglas. Revísalas y pruébala con el backtest.'); return true; }
      return true; }
    if (/^(gracias|ok|va|sale|listo)\b/.test(q)) { mood('love', 'wave'); say('¡Para eso estoy! 💜'.replace(' 💜', '')); return true; }
    if (/(donde|no encuentro|como (abro|pongo|activo|uso|cambio|encuentro)|muestrame|ensename|ubica)/.test(q) && await findThing(text)) return true;
    if (/(alerta|avisame|avisa(me)? (si|cuando)|notificame)/.test(q) && /(\d|%|crea|pon|hazme|quiero)/.test(q)) { await skillAlert(text); return true; }
    if (/noticia|resum|que (esta )?pasa|que mueve|mercado hoy|titulares/.test(q) && (sec === 'newsView' || /noticia|titular/.test(q))) { await skillNews(text); return true; }
    const desk = !!(H() && H().desktop()); // en PC el gráfico SIEMPRE está a la vista: el panel derecho solo manda si lo mencionas
    if ((sec === 'screenerView' && (desk ? /(screener|mejor(es)? (entrada|senal)|confluencia)/ : /(mejor|entrada|long|short|confluencia|senal|cual|analiza)/).test(q)) || /screener/.test(q)) { await skillScreener(text); return true; }
    if (/\bbots?\b|estrategia automat|bot lab/.test(q) && !/screener/.test(q)) { await skillBot(text); return true; }
    if (/nexus lens|api key|secret key/.test(q) || (!desk && sec === 'lensView' && !D.parse(text).length)) { await skillLens(text); return true; }
    if (sec !== 'chartView' && !D.parse(text).length && (!desk || (SIDE_KW[sec] && SIDE_KW[sec].test(q) && !/grafic|vela|indicador|\bema\b|rsi|soporte|resistencia|tendencia|dibuj|canal|fibo|linea|color/.test(q)))) { await skillGeneral(text); return true; }
    return false;
  }

  /* ── se asoma de vez en cuando con una sugerencia de la sección (máximo una por sección al día) ── */
  const TIPS = {newsView: ['¿Te resumo las noticias?', 'Resume las noticias'], screenerView: ['¿Te digo cuál tiene la mejor entrada?', '¿Cuál tiene la mejor entrada del screener?'], alertsView: ['¿Te ayudo a crear una alerta?', 'Quiero crear una alerta'], lensView: ['¿Te explico qué llenar aquí?', '¿Qué tengo que llenar aquí?'], botLabView: ['¿Armamos un bot juntos?', 'Ayúdame a crear un bot'], chartView: ['¿Te dibujo soportes y resistencias?', 'Marca soportes y resistencias'], watchView: ['¿Te digo cuál se mueve más?', '¿Cuál de mi seguimiento se está moviendo más?']};
  let lastSec = '', lastTip = 0, tipTimer = 0;
  function maybeTip(sec) {
    if (open || busy || CFG().tips === false || !TIPS[sec] || Date.now() - lastTip < 90000) return; const day = new Date().toDateString(); ls.tips = ls.tips || {}; if (ls.tips[sec] === day) return;
    clearTimeout(tipTimer); tipTimer = setTimeout(() => { if (open || section() !== sec) return; ls.tips[sec] = day; store(); lastTip = Date.now(); tip.textContent = TIPS[sec][0]; tip.dataset.q = TIPS[sec][1]; tip.hidden = false; const r = fab.getBoundingClientRect(), l = layer.getBoundingClientRect(); tip.style.left = clamp(r.left - l.left + r.width / 2 - 110, 8, AW() - 228) + 'px'; tip.style.top = (r.top - l.top - 46) + 'px'; fab.classList.add('peek-up'); setTimeout(() => { tip.hidden = true; fab.classList.remove('peek-up'); }, 6500); }, 2500);
  }
  tip.addEventListener('click', async () => { const q = tip.dataset.q; tip.hidden = true; fab.classList.remove('peek-up'); await show(false); ask(q); });
  setInterval(() => { const sec = section(); if (sec !== lastSec) { lastSec = sec; placePeek(); if (open) { setChips(); if (!busy) { const h = home(); flyTo(h.x, h.y, 500); } } else maybeTip(sec); } }, 1200);

  /* ── abrir / cerrar ── */
  async function ensureModel() {
    if (M) return M; if (loading) return loading;
    av.classList.add('loading');
    loading = import('./pixel-model.js').then(mod => { M = mod.create(cv); try { M.setColor(CFG().color || 'purple'); } catch {} av.classList.remove('loading'); return M; })
      .catch(e => { av.classList.remove('loading'); loading = null; throw e; });
    return loading;
  }
  async function show(greet) {
    if (open) return; open = true; ls.open = true; store(); fab.classList.add('on'); fab.setAttribute('aria-label', 'Nexus Pixel está activo');
    const s = AV(), pk = peekSpot(); place(pk.x - s.w / 2, pk.y + 30); av.hidden = false; fab.classList.add('out'); // sale desde donde se estaba asomando
    try { await ensureModel(); } catch { av.hidden = true; open = false; fab.classList.remove('on', 'out'); try { window.CCT_bot && window.CCT_bot.toast('No se pudo cargar a Nexus Pixel. Revisa tu conexión.'); } catch {} return; }
    mood('excited', 'fly'); const h = home(); await flyTo(h.x, h.y, greet ? 1000 : 500);
    setChips(); const sec = section(), G = {newsView: 'Te puedo resumir las noticias o decirte qué mueve al mercado.', screenerView: 'Te digo cuál tiene la mejor entrada, las mejores LONG o SHORT y cuál tiene más confluencias.', alertsView: 'Dime qué alerta quieres, por ejemplo «avísame si BTC pasa 70 mil», y yo la creo.', lensView: 'Te explico qué llenar y dónde sacar tus datos de BingX.', botLabView: 'Armemos juntos un bot o te doy consejos para mejorar los tuyos.', watchView: 'Te digo cuál se mueve más o te enseño dónde está cada cosa.', aiView: 'Te ayudo en toda la app: pregúntame dónde está algo o qué puedo hacer en cada sección.', settingsView: 'Pregúntame dónde se configura cualquier cosa.'};
    if (greet) { mood('happy', 'wave'); say(`¡Hola${CFG().nombre ? ', ' + CFG().nombre : ''}! Soy Nexus Pixel. ${G[sec] && !(H() && H().desktop()) ? G[sec] : 'Pídeme que te dibuje el canal, el rango, soportes y resistencias… o pregúntame lo que quieras de ' + (H() ? H().symbol() : 'tu gráfico') + '.' + (G[sec] && H() && H().desktop() ? ' ' + G[sec] : '')}`); setTimeout(() => { if (!busy) mood('neutral', 'idle'); }, 2400); }
    else { mood('neutral', 'idle'); say('Aquí sigo. ¿Qué te dibujo?', {instant: true}); }
    lastAct = Date.now();
  }
  async function hide() {
    if (!open) return; stopMic(); open = false; ls.open = false; store(); bub.hidden = true; mood('wink', 'wave'); await sleep(REDUCED ? 0 : 450); mood('happy', 'fly'); { const s = AV(), pk = peekSpot(); await flyTo(pk.x - s.w / 2, pk.y - s.h * .6, 600); await flyTo(pk.x - s.w / 2, pk.y + 20, 260); }
    av.hidden = true; fab.classList.remove('on', 'out'); fab.setAttribute('aria-label', 'Abrir a Nexus Pixel'); if (M) M.pause(true);
  }
  fab.addEventListener('click', () => { if (open) { if (bub.hidden) { bub.hidden = false; placeBubble(); input.focus({preventScroll: true}); } else hide(); } else show(true); });
  bub.addEventListener('click', e => { const q = e.target.closest('[data-q]'); if (q) { ask(q.dataset.q); return; } if (e.target.closest('[data-px=close]')) hide(); });
  bub.querySelector('form').addEventListener('submit', e => { e.preventDefault(); ask(input.value); });
  input.addEventListener('keydown', e => e.stopPropagation());

  /* ── Micrófono: háblale a Pixel. En el celular usa el dictado del navegador (rápido). En PC (y si el dictado falla) graba tu voz
       y la transcribe el servidor de IA de VORTEX: así funciona aunque el navegador o la app de escritorio no traigan dictado. ── */
  const mic = bub.querySelector('.px-mic'), SR = window.SpeechRecognition || window.webkitSpeechRecognition; let rec = null, heard = '', srBroken = !!ls.srBroken;
  const VXURL = 'https://vortex-push.soobroon.workers.dev';
  const useRecorder = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder) && (!SR || srBroken || (H() && H().desktop()));
  let mr = null, mStream = null, mCtx = null, mTimer = 0;
  function micUI(on, msg) { mic.classList.toggle('on', on); bub.classList.toggle('listening', on); input.placeholder = on ? (msg || 'Te escucho… habla ahora (toca el micrófono para terminar)') : 'Pídeme algo: «dibuja el canal»…'; if (on) { input.value = ''; mood('surprised', 'idle'); status('te escucho…'); } }
  function stopMic() { if (rec) { try { rec.stop(); } catch {} } if (mr && mr.state === 'recording') { try { mr.stop(); } catch {} } }
  function relMic() { clearInterval(mTimer); mTimer = 0; try { mStream && mStream.getTracks().forEach(t => t.stop()); } catch {} mStream = null; try { mCtx && mCtx.close(); } catch {} mCtx = null; }
  function toWav(buf) { // 16 kHz mono, 16 bits
    const n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 2)), W = (o, t) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
    W(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); W(8, 'WAVE'); W(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, 16000, true); out.setUint32(28, 32000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); W(36, 'data'); out.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, buf[i])); out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); } return out.buffer;
  }
  const b64 = ab => { const u = new Uint8Array(ab); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  async function transcribe(blob) {
    const AC = window.AudioContext || window.webkitAudioContext, ac = new AC(), dec = await ac.decodeAudioData(await blob.arrayBuffer()); try { ac.close(); } catch {}
    const len = Math.ceil(dec.duration * 16000), off = new OfflineAudioContext(1, Math.max(1, len), 16000), src = off.createBufferSource(); src.buffer = dec; src.connect(off.destination); src.start(); const pcm = (await off.startRendering()).getChannelData(0);
    const body = {model: 'openai-audio', temperature: 0, max_tokens: 300, messages: [{role: 'system', content: 'Eres un transcriptor. Escribe EXACTAMENTE lo que dice la persona en el audio, en español, sin responderle, sin comillas y sin agregar nada. Si no se entiende nada, responde solo: ""'}, {role: 'user', content: [{type: 'text', text: 'Transcribe este audio.'}, {type: 'input_audio', input_audio: {data: b64(toWav(pcm)), format: 'wav'}}]}]};
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
    try { const r = await fetch(VXURL + '/ai', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body), signal: ctl.signal}); if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(), m = j && j.choices && j.choices[0] && j.choices[0].message || {}, t = m.content || (m.audio && m.audio.transcript) || ''; return String(t || '').replace(/^["«“\s]+|["»”\s]+$/g, '').trim(); }
    finally { clearTimeout(to); }
  }
  async function recordVoice() {
    try { mStream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}}); }
    catch (e) { relMic(); say(e && e.name === 'NotFoundError' ? 'No encontré ningún micrófono conectado. Conecta uno y vuelve a intentarlo.' : 'Necesito permiso para usar el micrófono: permítelo en el aviso del navegador (o en el candado de la barra de direcciones) y vuelve a tocarlo.'); return; }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || '';
    const chunks = []; mr = new MediaRecorder(mStream, mime ? {mimeType: mime} : {}); mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    let spoke = false, quietSince = 0; const t0 = Date.now();
    try { const AC = window.AudioContext || window.webkitAudioContext; mCtx = new AC(); const an = mCtx.createAnalyser(); an.fftSize = 1024; mCtx.createMediaStreamSource(mStream).connect(an); const d = new Uint8Array(an.fftSize);
      mTimer = setInterval(() => { an.getByteTimeDomainData(d); let e = 0; for (const v of d) e += (v - 128) * (v - 128); const rms = Math.sqrt(e / d.length) / 128, now = Date.now();
        if (rms > .045) { spoke = true; quietSince = 0; } else if (spoke) { quietSince = quietSince || now; if (now - quietSince > 1500) stopMic(); } // te callas 1.5 s → se manda solo
        if ((!spoke && now - t0 > 8000) || now - t0 > 25000) stopMic(); }, 100); } catch {}
    mr.onstop = async () => { const dur = Date.now() - t0, type = (mr && mr.mimeType) || mime || 'audio/webm'; relMic(); mr = null; micUI(false);
      if (!chunks.length || dur < 600) { mood('neutral', 'idle'); say('No alcancé a escucharte. Toca el micrófono y habla.'); return; }
      busy = true; bub.classList.add('working'); mood('thinking', 'think'); say('Escuchando lo que dijiste…', {busy: true}); status('transcribiendo…');
      let t = ''; try { t = await transcribe(new Blob(chunks, {type})); } catch (e) { console.warn('Pixel voz', e); }
      busy = false; bub.classList.remove('working'); status('IA de VORTEX');
      if (!t || t.length < 2) { mood('surprised', 'idle'); say('No te entendí bien. Intenta de nuevo hablando un poco más cerca del micrófono, o escríbeme.'); return; }
      input.value = t; ask(t); };
    mr.start(250); micUI(true);
  }
  function dictate() { // dictado del navegador (celular)
    rec = new SR(); rec.lang = 'es-MX'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1; heard = ''; let fail = '';
    rec.onstart = () => micUI(true, 'Te escucho… habla ahora');
    rec.onresult = e => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; heard = t.trim(); input.value = heard; };
    rec.onerror = e => { fail = e.error; };
    rec.onend = () => { micUI(false); status('IA de VORTEX'); rec = null; mood('neutral', 'idle'); const t = heard; heard = '';
      if (t) { ask(t); return; }
      if (fail === 'not-allowed') { say('Necesito permiso para usar el micrófono: actívalo en los permisos del navegador (o de VORTEX) y vuelve a tocarlo.'); return; }
      if (fail === 'no-speech' || fail === 'aborted') { say('No te escuché. Toca el micrófono y vuelve a intentarlo.'); return; }
      if (window.MediaRecorder && navigator.mediaDevices) { srBroken = true; ls.srBroken = true; store(); recordVoice(); return; } // el dictado del navegador no funciona aquí: grabo y transcribo en el servidor
      say('El dictado por voz no está disponible en este navegador. Puedes escribirme o usar el micrófono del teclado.'); };
    try { rec.start(); } catch { rec = null; if (window.MediaRecorder) recordVoice(); else say('No se pudo iniciar el micrófono. Inténtalo otra vez.'); }
  }
  mic.addEventListener('click', () => {
    if (rec || (mr && mr.state === 'recording')) { stopMic(); return; }
    if (busy) return; wake();
    if (useRecorder()) { recordVoice(); return; }
    if (SR) { dictate(); return; }
    say('Tu navegador no permite usar el micrófono. Puedes escribirme o usar el micrófono del teclado.');
  });

  /* ── tocar, girar 360° y mover ── */
  let drag = null, taps = 0, tapT = 0;
  cv.addEventListener('pointerdown', e => { e.stopPropagation(); wake(); drag = {x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId}; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (!drag || !M) return; const dx = e.clientX - drag.x; drag.moved += Math.abs(dx); drag.x = e.clientX; M.addYaw(dx * .018); });
  const endDrag = () => { if (!drag) return; const tap = drag.moved < 6; drag = null;
    if (!M) return; if (tap) { const now = Date.now(); taps = now - tapT < 320 ? taps + 1 : 1; tapT = now; if (taps >= 2) { mood('excited', 'celebrate'); setTimeout(() => mood('neutral', 'idle'), 1600); } else { mood(['happy', 'wink', 'love', 'excited'][Math.floor(Math.random() * 4)], 'wave'); if (bub.hidden) { bub.hidden = false; placeBubble(); } setTimeout(() => { if (!busy) mood('neutral', 'idle'); }, 1500); } }
    else setTimeout(() => { if (!drag && M) M.setYaw(Math.round(M.yaw / (Math.PI * 2)) * Math.PI * 2); }, 2200); };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  const hd = bub.querySelector('.px-hd'); let mv = null;
  hd.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; e.stopPropagation(); mv = {x: e.clientX, y: e.clientY, px: pos.x, py: pos.y}; hd.setPointerCapture(e.pointerId); });
  hd.addEventListener('pointermove', e => { if (!mv) return; const s = AV(); place(clamp(mv.px + e.clientX - mv.x, 0, AW() - s.w), clamp(mv.py + e.clientY - mv.y, 0, AH() - s.h)); });
  const endMv = () => { if (!mv) return; mv = null; const s = AV(); ls.home2 = {rx: AW() - pos.x - s.w, by: AH() - pos.y - s.h}; store(); };
  hd.addEventListener('pointerup', endMv); hd.addEventListener('pointercancel', endMv);
  for (const el of [av, bub, fab]) for (const ev of ['pointerdown', 'wheel', 'touchstart', 'contextmenu']) el.addEventListener(ev, e => e.stopPropagation(), {passive: ev !== 'contextmenu'}); // tocar al avatar no mueve el gráfico

  /* ── descanso, visibilidad y tamaño ── */
  function wake() { lastAct = Date.now(); if (M && M.expr === 'sleep') mood('surprised', 'idle'), setTimeout(() => { if (!busy) mood('neutral', 'idle'); }, 900); }
  setInterval(() => {
    if (!M || !open) return; const vis = !document.hidden; M.pause(!vis);
    if (vis && !busy && Date.now() - lastAct > 90000 && M.expr !== 'sleep') mood('sleep', 'idle');
  }, 1000);
  addEventListener('resize', () => { if (!open || busy) return; const h = home(); place(h.x, h.y); });
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { placePeek(); if (open && !busy && !mv) { const h = home(); place(h.x, h.y); } }); ro.observe(area); ro.observe(layer); }
  addEventListener('resize', placePeek); setTimeout(placePeek, 300);
  if (ls.open) setTimeout(() => show(false), 1800);
  addEventListener('cct-pixel-cfg', () => { try { if (M) M.setColor(CFG().color || 'purple'); } catch {} });
  window.NexusPixel = {show, hide, ask, get open() { return open; }};
})();

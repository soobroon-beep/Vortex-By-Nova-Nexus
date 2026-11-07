/* NEXUS PIXEL · avatar de trading que vive flotando en tu gráfico (PC y celular).
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
  area.append(ink, av, bub, fab);
  const cv = av.querySelector('.px-cv'), msg = bub.querySelector('.px-msg'), input = bub.querySelector('input'), st = bub.querySelector('.px-st');

  /* ── estado ── */
  let M = null, loading = null, open = false, busy = false, pos = {x: 0, y: 0}, lastAct = Date.now(), hist = [], typer = 0;
  const AV = () => mobile() ? {w: 112, h: 132} : {w: 150, h: 176};
  const AW = () => area.clientWidth, AH = () => area.clientHeight;
  function home() {
    const s = AV(), p = H() && H().plot(), right = p ? p.right : AW() - 60, bottom = p ? p.top + p.h : AH() - 40;
    const h = ls.home; if (h && Number.isFinite(h.rx) && Number.isFinite(h.by)) return {x: clamp(AW() - h.rx - s.w, 0, AW() - s.w), y: clamp(AH() - h.by - s.h, 0, AH() - s.h)};
    return {x: clamp(right - s.w - 6, 0, AW() - s.w), y: clamp(bottom - s.h - (mobile() ? 10 : 18), 0, AH() - s.h)};
  }
  function peekSpot() { const r = fab.getBoundingClientRect(), a = area.getBoundingClientRect(); return r.width ? {x: r.left - a.left + r.width / 2, y: r.top - a.top} : {x: AW() - 90, y: AH() - 40}; }
  function place(x, y) { const s = AV(); pos = {x, y}; av.style.width = s.w + 'px'; av.style.height = s.h + 'px'; av.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; if (!bub.hidden) placeBubble(); }
  function placeBubble() { // a la izquierda del robot; si no cabe, a la derecha; si tampoco, arriba (o abajo)
    const s = AV(), bw = Math.min(mobile() ? 260 : 300, AW() - 16); bub.style.width = bw + 'px'; const bh = bub.offsetHeight || 180;
    let x, y, side;
    if (pos.x - bw + 14 >= 8) { x = pos.x - bw + 14; y = pos.y + s.h * .1; side = 'l'; }
    else if (pos.x + s.w - 10 + bw <= AW() - 8) { x = pos.x + s.w - 10; y = pos.y + s.h * .1; side = 'r'; }
    else { x = pos.x + s.w / 2 - bw / 2; y = pos.y - bh + 4; side = 't'; if (y < 6) { y = pos.y + s.h - 4; side = 'b'; } }
    bub.style.transform = `translate3d(${clamp(x, 8, AW() - bw - 8).toFixed(0)}px,${clamp(y, 6, AH() - bh - 6).toFixed(0)}px,0)`; bub.dataset.side = side;
  }
  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  function flyTo(x, y, ms) {
    const s = AV(); x = clamp(x, -s.w * .25, AW() - s.w * .75); y = clamp(y, -s.h * .2, AH() - s.h * .8);
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
  function sizeInk() { const d = Math.min(2, devicePixelRatio || 1); ink.width = Math.round(AW() * d); ink.height = Math.round(AH() * d); inkCtx = ink.getContext('2d'); inkCtx.setTransform(d, 0, 0, d, 0, 0); }
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
    mood('focused', 'point'); await flyTo(first.x - hand0.x, first.y - hand0.y); mood('focused', 'draw');
    const done = [];
    for (const [fa, fb] of segs) {
      const a0 = fa(), b0 = fb(), len = Math.hypot(b0.x - a0.x, b0.y - a0.y), ms = REDUCED ? 1 : clamp(len * 1.15, 220, 900), t0 = performance.now();
      await new Promise(res => { const step = now => {
        const k = Math.min(1, (now - t0) / ms), e = k < 1 ? 1 - Math.pow(1 - k, 2) : 1, a = fa(), b = fb(), tip = {x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e};
        inkCtx.clearRect(0, 0, AW(), AH()); inkCtx.save(); { const pl = H().plot(); inkCtx.beginPath(); inkCtx.rect(pl.left, pl.top, pl.right - pl.left, pl.h); inkCtx.clip(); } inkCtx.lineCap = 'round'; inkCtx.strokeStyle = col; inkCtx.shadowColor = col; inkCtx.shadowBlur = 14; inkCtx.lineWidth = 2.4;
        for (const [ga, gb] of done) { const p = ga(), q = gb(); inkCtx.beginPath(); inkCtx.moveTo(p.x, p.y); inkCtx.lineTo(q.x, q.y); inkCtx.stroke(); }
        inkCtx.beginPath(); inkCtx.moveTo(a.x, a.y); inkCtx.lineTo(tip.x, tip.y); inkCtx.stroke();
        inkCtx.shadowBlur = 22; inkCtx.fillStyle = '#fff'; inkCtx.beginPath(); inkCtx.arc(tip.x, tip.y, 3.2, 0, 7); inkCtx.fill(); // chispa en la punta del lápiz
        inkCtx.restore();
        const h = M ? M.handScreen() : hand0; place(tip.x - h.x, tip.y - h.y); if (M) M.setVel((b.x - a.x) / ms * 30, (b.y - a.y) / ms * 30);
        if (k < 1) requestAnimationFrame(step); else res(); };
        requestAnimationFrame(step); });
      done.push([fa, fb]);
    }
    H().add([d]); // queda como dibujo real del gráfico
    ink.classList.add('fade'); await sleep(260); inkCtx.clearRect(0, 0, AW(), AH()); ink.classList.remove('fade'); if (M) M.setVel(0, 0);
  }

  /* ── acciones ── */
  async function perform(acts, intro) {
    const h = H(); if (!h || !h.ready()) { say('Abre el gráfico y espera a que carguen las velas; luego te dibujo lo que quieras.'); return; }
    if (acts.some(a => a.do === 'clear')) { mood('wink', 'fly'); bub.hidden = true; const p = h.plot(); await flyTo(p.left, pos.y, 700); const n = h.clearMine(); await flyTo(home().x, home().y); mood('happy', 'thumbs'); say(n ? `Listo, borré ${n} dibujo${n === 1 ? '' : 's'} mío${n === 1 ? '' : 's'}. Los tuyos siguen ahí.` : 'No tenía dibujos míos en este gráfico.'); setTimeout(() => mood('neutral', 'idle'), 1800); return; }
    const cs = h.visible(); if (cs.length < 20) { mood('thinking', 'think'); say('Veo muy pocas velas en pantalla. Aleja un poco el gráfico (pellizca o usa la rueda) y vuelvo a intentarlo.'); return; }
    mood('analyzing', 'think'); say(intro ? intro : 'Analizando tus velas…', {busy: true}); await sleep(REDUCED ? 0 : 750);
    bub.hidden = true; const texts = [];
    const C = CFG(); acts = acts.flatMap(a => a.do === 'full' ? (C.completo && C.completo.length ? C.completo : ['sr', 'trend', 'channel']).map(k => ({do: k})) : [a]);
    for (const a of acts.slice(0, 5)) { const r = D.build(a.do, cs, a.price, {sr: C.sr}); texts.push(r.text); for (const d of r.drawings) { if (/^Soporte/.test(d.label || '') && C.colSup) d.col = C.colSup; if (/^Resistencia/.test(d.label || '') && C.colRes) d.col = C.colRes; await drawAnimated(d); } }
    const hm = home(); await flyTo(hm.x, hm.y); mood('happy', 'thumbs');
    say(((intro ? intro + ' ' : '') + texts.filter(Boolean).join(' ')).trim() || 'Listo.'); setTimeout(() => { if (!busy) mood('neutral', 'idle'); }, 2200);
  }
  const SYS = `Eres NEXUS PIXEL, el avatar asistente de trading de VORTEX (by Nova Nexus): un robot amable que flota sobre el gráfico del usuario y puede dibujar en él.
Habla en español, breve (máximo 3 frases), claro y con buena onda, sin prometer ganancias (no es asesoría financiera).
Responde SOLO con un objeto JSON: {"reply":"tu respuesta","actions":[...]}
Acciones posibles (úsalas cuando el usuario pida dibujar o cuando un dibujo ayude a explicar): {"do":"channel"} canal, {"do":"range"} rango/consolidación, {"do":"sr"} soportes y resistencias, {"do":"trend"} línea de tendencia, {"do":"fib"} Fibonacci, {"do":"hline","price":NUMERO} línea horizontal en un precio, {"do":"clear"} borrar tus dibujos.
Los niveles los calcula la app con las velas reales: no inventes precios. Si no hace falta dibujar, deja "actions":[].`;
  function context() {
    const h = H(); if (!h) return {}; const cs = h.visible(), o = {simbolo: h.symbol(), temporalidad: h.interval(), ultimo: h.last(), velasEnPantalla: cs.length};
    if (cs.length) { o.maximoVisible = Math.max(...cs.map(c => c.h)); o.minimoVisible = Math.min(...cs.map(c => c.l)); o.cambioVisiblePct = +((cs[cs.length - 1].c / cs[0].o - 1) * 100).toFixed(2); }
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
    const ok = ['channel', 'range', 'sr', 'trend', 'fib', 'hline', 'clear'], actions = (j && Array.isArray(j.actions) ? j.actions : []).filter(a => a && ok.includes(a.do) && (a.do !== 'hline' || (Number.isFinite(+a.price) && +a.price > 0))).map(a => a.do === 'hline' ? {do: 'hline', price: +a.price} : {do: a.do});
    hist.push({role: 'user', content: text}, {role: 'assistant', content: reply}); if (hist.length > 12) hist.splice(0, hist.length - 12);
    return {reply: reply.slice(0, 600), actions};
  }
  async function ask(text) {
    text = String(text || '').trim(); if (!text || busy) return; busy = true; wake(); input.value = ''; bub.classList.add('working');
    try {
      const acts = D.parse(text);
      if (acts.length) await perform(acts);
      else {
        mood('thinking', 'think'); say('Déjame pensarlo…', {busy: true}); status('pensando…');
        try { const r = await llmAsk(text); status('IA de VORTEX'); if (r.actions.length) await perform(r.actions, r.reply); else { mood('happy', 'idle'); say(r.reply || 'Mmm, no tengo una respuesta clara. ¿Quieres que te dibuje soportes, el canal o el rango?'); } }
        catch { status('sin conexión a la IA'); mood('surprised', 'idle'); say('No pude hablar con la IA ahorita, pero sí puedo dibujarte: canal, rango, soportes y resistencias, tendencia, Fibonacci o una línea en el precio que me digas.'); }
      }
    } catch (e) { console.warn('Nexus Pixel', e); try { inkCtx && inkCtx.clearRect(0, 0, AW(), AH()); } catch {} mood('surprised', 'idle'); const h = home(); place(h.x, h.y); say('Uy, algo falló mientras dibujaba. Inténtalo otra vez.'); } finally { busy = false; bub.classList.remove('working'); lastAct = Date.now(); }
  }

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
    const s = AV(), pk = peekSpot(); place(pk.x - s.w / 2, AH() + 4); av.hidden = false; fab.classList.add('out'); // sale desde donde se estaba asomando
    try { await ensureModel(); } catch { av.hidden = true; open = false; fab.classList.remove('on', 'out'); try { window.CCT_bot && window.CCT_bot.toast('No se pudo cargar a Nexus Pixel. Revisa tu conexión.'); } catch {} return; }
    mood('excited', 'fly'); const h = home(); await flyTo(h.x, h.y, greet ? 1000 : 500);
    if (greet) { mood('happy', 'wave'); say(`¡Hola${CFG().nombre ? ', ' + CFG().nombre : ''}! Soy Nexus Pixel. Pídeme que te dibuje el canal, el rango, soportes y resistencias… o pregúntame lo que quieras de ${H() ? H().symbol() : 'tu gráfico'}.`); setTimeout(() => { if (!busy) mood('neutral', 'idle'); }, 2400); }
    else { mood('neutral', 'idle'); say('Aquí sigo. ¿Qué te dibujo?', {instant: true}); }
    lastAct = Date.now();
  }
  async function hide() {
    if (!open) return; stopMic(); open = false; ls.open = false; store(); bub.hidden = true; mood('wink', 'wave'); await sleep(REDUCED ? 0 : 450); mood('happy', 'fly'); { const s = AV(), pk = peekSpot(); await flyTo(pk.x - s.w / 2, AH() - s.h * .35, 600); await flyTo(pk.x - s.w / 2, AH() + 6, 260); }
    av.hidden = true; fab.classList.remove('on', 'out'); fab.setAttribute('aria-label', 'Abrir a Nexus Pixel'); if (M) M.pause(true);
  }
  fab.addEventListener('click', () => { if (open) { if (bub.hidden) { bub.hidden = false; placeBubble(); input.focus({preventScroll: true}); } else hide(); } else show(true); });
  bub.addEventListener('click', e => { const q = e.target.closest('[data-q]'); if (q) { ask(q.dataset.q); return; } if (e.target.closest('[data-px=close]')) hide(); });
  bub.querySelector('form').addEventListener('submit', e => { e.preventDefault(); ask(input.value); });
  input.addEventListener('keydown', e => e.stopPropagation());

  /* ── Micrófono: háblale a Pixel (reconocimiento de voz del navegador, en español). Al terminar de hablar se manda solo. ── */
  const mic = bub.querySelector('.px-mic'), SR = window.SpeechRecognition || window.webkitSpeechRecognition; let rec = null, heard = '';
  function stopMic() { if (rec) { try { rec.stop(); } catch {} } }
  mic.addEventListener('click', () => {
    if (rec) { stopMic(); return; }
    if (!SR) { say('Tu navegador no permite dictar por voz. En Android usa Chrome; en iPhone, Safari actualizado. También puedes usar el micrófono del teclado.'); return; }
    if (busy) return; wake();
    rec = new SR(); rec.lang = 'es-MX'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1; heard = '';
    rec.onstart = () => { mic.classList.add('on'); bub.classList.add('listening'); status('te escucho…'); input.value = ''; input.placeholder = 'Te escucho… habla ahora'; mood('surprised', 'idle'); };
    rec.onresult = e => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; heard = t.trim(); input.value = heard; };
    rec.onerror = e => { const m = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Necesito permiso para usar el micrófono: actívalo en los permisos del navegador (o de VORTEX) y vuelve a tocarlo.' : e.error === 'no-speech' ? 'No te escuché. Toca el micrófono y vuelve a intentarlo.' : e.error === 'network' ? 'El dictado por voz necesita internet.' : ''; if (m) say(m); };
    rec.onend = () => { mic.classList.remove('on'); bub.classList.remove('listening'); status('IA de VORTEX'); input.placeholder = 'Pídeme algo: «dibuja el canal»…'; rec = null; mood('neutral', 'idle'); const t = heard; heard = ''; if (t) ask(t); };
    try { rec.start(); } catch { rec = null; say('No se pudo iniciar el micrófono. Inténtalo otra vez.'); }
  }); // que las teclas no muevan el gráfico mientras escribes

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
  const endMv = () => { if (!mv) return; mv = null; const s = AV(); ls.home = {rx: AW() - pos.x - s.w, by: AH() - pos.y - s.h}; store(); };
  hd.addEventListener('pointerup', endMv); hd.addEventListener('pointercancel', endMv);
  for (const el of [av, bub, fab]) for (const ev of ['pointerdown', 'wheel', 'touchstart', 'contextmenu']) el.addEventListener(ev, e => e.stopPropagation(), {passive: ev !== 'contextmenu'}); // tocar al avatar no mueve el gráfico

  /* ── descanso, visibilidad y tamaño ── */
  function wake() { lastAct = Date.now(); if (M && M.expr === 'sleep') mood('surprised', 'idle'), setTimeout(() => { if (!busy) mood('neutral', 'idle'); }, 900); }
  setInterval(() => {
    if (!M || !open) return; const vis = !document.hidden && (!H() || H().onChart()) && area.offsetWidth > 0; M.pause(!vis);
    if (vis && !busy && Date.now() - lastAct > 90000 && M.expr !== 'sleep') mood('sleep', 'idle');
  }, 1000);
  addEventListener('resize', () => { if (!open || busy) return; const h = home(); place(h.x, h.y); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (open && !busy && !mv) { const h = home(); place(h.x, h.y); } }).observe(area);
  if (ls.open) setTimeout(() => { if (H() && H().onChart() && area.offsetWidth) show(false); else { const t = setInterval(() => { if (H() && H().onChart() && area.offsetWidth) { clearInterval(t); show(false); } }, 1500); } }, 1800);
  addEventListener('cct-pixel-cfg', () => { try { if (M) M.setColor(CFG().color || 'purple'); } catch {} });
  window.NexusPixel = {show, hide, ask, get open() { return open; }};
})();

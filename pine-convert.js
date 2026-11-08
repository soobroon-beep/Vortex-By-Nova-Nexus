/* Convertidor de Pine Script de VORTEX: lee el script, cuenta sus funciones, lo compila, lo ejecuta en las velas del gráfico
   y, si algo no funciona, lo corrige con IA (hasta 3 intentos) conservando la lógica original. Al terminar lo guarda en «Mis indicadores»
   (en tu cuenta, con su imagen) y lo pone en el gráfico. Se puede seguir trabajando mientras convierte: avisa al terminar. */
(function () {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const toast = t => { try { window.CCT_toast ? window.CCT_toast(t) : null; } catch {} };
  const MAX_TRIES = 3;
  const isStrategyMsg = m => /strategy/i.test(m);
  const problems = res => !res ? ['No se pudo ejecutar'] : !res.ok ? [(res.error.line ? 'Línea ' + res.error.line + ': ' : '') + res.error.msg]
    : (res.warnings || []).filter(w => w.level === 'unsupported' && !isStrategyMsg(w.msg)).map(w => (w.line ? 'Línea ' + w.line + ': ' : '') + w.msg);
  const drawsSomething = r => !!r && r.ok && ((r.plots || []).some(p => p.values.some(v => v !== null)) || (r.shapes || []).length || (r.labels || []).length || (r.lines || []).length || (r.boxes || []).length || (r.tables || []).length || (r.polylines || []).length || (r.fills || []).length || (r.candles || []).length || (r.hlines || []).length || [...(r.bgcolors || []), ...(r.barcolors || [])].some(e => e && e.pts && e.pts.length));
  const drawCalls = code => (code.match(/\b(plot|plotshape|plotchar|plotcandle|plotbar|bgcolor|barcolor|fill|hline|line\.new|label\.new|box\.new|table\.new|polyline\.new)\s*\(/g) || []).length;
  const versionOf = code => { const m = /@version\s*=\s*(\d+)/.exec(code); return m ? +m[1] : null; };
  const nameOf = (code, fb) => { const m = code.match(/(?:indicator|strategy|study)\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/); return (m ? m[1] : fb || 'Script de Pine').slice(0, 80); };
  const fnCount = code => (code.match(/^\s*(?:export\s+)?(?:method\s+)?[A-Za-z_]\w*\s*\([^()\n]*\)\s*=>/gm) || []).length;
  const supported = () => { try { return window.CCTPine.supported().filter(x => /^(ta|math|str|array|matrix|map|color|input|label|line|box|table|polyline|linefill|plot|plotshape|plotchar|plotcandle|plotbar|hline|fill|bgcolor|barcolor|nz|na|fixnan|request\.security|timeframe|time|hour|minute|dayof|month|year)/.test(x)).join(', '); } catch { return ''; } };

  let job = null; // una conversión a la vez
  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  function open(code, name, opts) {
    opts = opts || {};
    code = String(code || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (!code.trim()) { toast('El script está vacío'); return; }
    if (job && !job.done) { show(); toast('Ya hay una conversión en curso'); return; }
    const title = nameOf(code, name), v = versionOf(code);
    job = {code, orig: code, name: title, v, lines: code.split('\n').length, t0: Date.now(), steps: [], done: false, bg: false, cancel: false, tries: 0, ctl: null, opts};
    build(); run().catch(e => { fail('Algo salió mal: ' + (e && e.message || e)); });
  }

  /* ───────── Interfaz ───────── */
  let box = null, timer = 0;
  function build() {
    close(true);
    box = el(`<div class="pc-back" role="dialog" aria-modal="true" aria-label="Convertir script de Pine"><div class="pc-dlg">
      <div class="pc-head"><div><b class="pc-title">Convirtiendo ${esc(job.name)}</b><small>Pine ${job.v ? 'v' + job.v : ''} · ${job.lines} líneas → indicador de VORTEX</small></div><span class="pc-time">0:00</span><button class="pc-x" type="button" aria-label="Cerrar">✕</button></div>
      <div class="pc-prog"><i></i><i></i><i></i><i></i></div>
      <div class="pc-body"><ol class="pc-steps"></ol><div class="pc-code"><div class="pc-file">${esc(job.name)}.pine</div><pre class="pc-pre"></pre></div></div>
      <div class="pc-foot"><span class="pc-note">«Seguir trabajando» cierra esto. Te avisamos cuando esté listo.</span><div class="pc-btns"><button class="pc-cancel" type="button">Cancelar</button><button class="pc-go" type="button">Seguir trabajando</button></div></div>
    </div></div>`);
    document.body.appendChild(box);
    box.querySelector('.pc-x').onclick = () => job.done ? close() : background();
    box.querySelector('.pc-cancel').onclick = () => { if (job.done) return close(); job.cancel = true; try { job.ctl && job.ctl.abort(); } catch {} fail('Conversión cancelada'); };
    box.querySelector('.pc-go').onclick = () => job.done ? (job.after ? job.after() : close()) : background();
    showCode(job.code);
    clearInterval(timer); timer = setInterval(() => { if (!box || job.done) return; const s = Math.floor((Date.now() - job.t0) / 1000); box.querySelector('.pc-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
  }
  function show() { if (box) { box.hidden = false; job.bg = false; } }
  function background() { if (box) box.hidden = true; job.bg = true; toast('Sigue convirtiendo en segundo plano; te aviso al terminar'); }
  function close(silent) { clearInterval(timer); if (box) { box.remove(); box = null; } if (!silent && job && job.done) job = null; }
  function showCode(code, live) {
    if (!box) return; const pre = box.querySelector('.pc-pre'), ls = String(code).split('\n'), from = live ? Math.max(0, ls.length - 60) : 0, part = ls.slice(from, from + 400);
    pre.innerHTML = part.map((l, i) => `<span class="pc-ln">${from + i + 1}</span>${esc(l)}`).join('\n') + (ls.length > from + 400 ? `\n<span class="pc-ln">…</span>(${ls.length - from - 400} líneas más)` : '');
    if (live) pre.scrollTop = pre.scrollHeight;
  }
  function step(text, sub, state) { // state: run | ok | warn | err
    const s = {text, sub, state: state || 'run'}; job.steps.push(s); paint(); return s;
  }
  function set(s, state, text, sub) { s.state = state; if (text) s.text = text; if (sub !== undefined) s.sub = sub; paint(); }
  function paint() {
    if (!box) return;
    box.querySelector('.pc-steps').innerHTML = job.steps.map(s => `<li class="pc-st ${s.state}"><span class="pc-ic">${s.state === 'ok' ? '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' : s.state === 'err' ? '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>' : s.state === 'warn' ? '!' : '<i class="pc-spin"></i>'}</span><span><b>${esc(s.text)}</b>${s.sub ? `<small>${esc(s.sub)}</small>` : ''}</span></li>`).join('')
      + (job.done ? '' : PENDING.filter(p => !job.steps.some(s => s.key === p)).map(p => `<li class="pc-st wait"><span class="pc-ic"><i class="pc-dot"></i></span><span><b>${p}</b></span></li>`).join(''));
    const segs = box.querySelectorAll('.pc-prog i'), n = Math.min(4, job.steps.filter(s => s.state === 'ok').length + (job.done ? 4 : 0));
    segs.forEach((g, i) => g.classList.toggle('on', i < n));
  }
  let PENDING = [];

  /* ───────── Proceso ───────── */
  async function run() {
    const A = window.CCT_ai, L = window.CCTLLM;
    PENDING = ['Compilar', 'Comprobar que se ejecuta en tus velas'];
    const s1 = step('Se leyó tu script de Pine', `${job.lines} líneas${job.v ? ', Pine v' + job.v : ''}`, 'ok'); s1.key = 'read';
    await tick(); const nf = fnCount(job.code); step(nf ? `Se encontraron ${nf} funciones` : 'Sin funciones propias', '', 'ok').key = 'fn'; await tick();
    if (job.v && job.v < 4) step('Pine antiguo (v' + job.v + ')', 'Se adapta automáticamente al formato actual', 'warn');
    let s = step('Compilando…'); s.key = 'Compilar'; await tick();
    let res = await A.run(job.code, job.name); if (job.cancel) return;
    if (res && res.ok) { set(s, 'ok', 'Compilado'); }
    else if (res && res.error && /velas/.test(res.error.msg)) { return fail(res.error.msg); }
    else set(s, 'err', 'No compiló', res && res.error ? (res.error.line ? 'Línea ' + res.error.line + ': ' : '') + res.error.msg : '');
    let probs = problems(res);
    if (res && res.ok) { await tick(); const s2 = step('Comprobando en tus velas…'); await tick(); s2.key = 'Comprobar que se ejecuta en tus velas'; set(s2, probs.length ? 'warn' : 'ok', probs.length ? `Funciona, pero ${probs.length} parte(s) no funcionan todavía` : `Se ejecuta en ${res.stats && res.stats.bars || 'todas las'} velas sin errores`, probs.length ? probs[0] : ''); }
    PENDING = [];
    while (probs.length && job.tries < MAX_TRIES) {
      if (job.cancel) return;
      job.tries++;
      const sf = step(`Corrigiendo con IA, intento ${job.tries} de ${MAX_TRIES}`, probs.slice(0, 2).join(' · '));
      let fixed;
      try { fixed = await aiFix(job.code, probs, res, L); } catch (e) { if (job.cancel) return; set(sf, 'err', `Intento ${job.tries}: la IA no respondió`, L && L.friendly ? L.friendly(e) : ''); continue; }
      if (job.cancel) return;
      if (!fixed || fixed === job.code) { set(sf, 'err', `Intento ${job.tries}: sin cambios útiles`); continue; }
      const sc = step('Compilando la versión corregida…'); await tick();
      const r2 = await A.run(fixed, job.name); if (job.cancel) return;
      const p2 = problems(r2);
      if (r2 && r2.ok && p2.length < probs.length + (res && res.ok ? 0 : 1)) { job.code = fixed; res = r2; probs = p2; showCode(fixed); set(sf, 'ok', `Corregido en el intento ${job.tries}`); set(sc, p2.length ? 'warn' : 'ok', p2.length ? `Compilado; quedan ${p2.length} parte(s) por corregir` : 'Compilado y ejecutado sin errores', p2[0] || ''); }
      else { set(sf, 'err', `Intento ${job.tries}: la corrección no funcionó`); set(sc, 'err', 'No compiló la versión corregida', p2[0] || ''); }
    }
    finish(res, probs);
  }
  const tick = () => new Promise(r => setTimeout(r, 380));

  async function aiFix(code, probs, res, L) {
    if (!L) throw new Error('La IA no está disponible');
    const big = code.split('\n').length > 220 || job.tries < MAX_TRIES, sup = supported(); // parches (solo lo que falla); el script completo solo en el último intento de un script corto
    const sys = (L.PINE_GUIDE || '') + (sup ? '\nFUNCIONES DISPONIBLES EN EL MOTOR (usa SOLO estas): ' + sup : '')
      + '\nTAREA: eres un convertidor experto de Pine Script. Te doy un script que funciona en TradingView pero en el motor de VORTEX falla en lo que se indica. Corrígelo para que funcione aquí SIN cambiar su lógica, sus cálculos, sus inputs, sus nombres ni sus colores. '
      + 'Reemplaza solo lo que no existe por código equivalente (por ejemplo, funciones de librerías «import» se reescriben dentro del script con su misma fórmula; request.security con símbolos que no son de Binance se cambia por el símbolo del gráfico). No inventes funciones. NO toques las líneas que no tienen problema: no reordenes argumentos, no cambies comillas, formato ni comentarios.'
      + (big ? '\nEl script es largo: NO lo reescribas completo. Responde SOLO con bloques de cambio con este formato EXACTO:\n<<<<<<< SEARCH\n(líneas exactas del código actual)\n=======\n(líneas nuevas)\n>>>>>>> REPLACE'
             : '\nResponde con 1 línea explicando el cambio y después el script COMPLETO corregido en un bloque ```pine.');
    const lines = code.split('\n'), ctxLines = new Set();
    for (const p of probs) { const m = /^Línea (\d+)/.exec(p); if (m) for (let i = Math.max(1, +m[1] - 3); i <= Math.min(lines.length, +m[1] + 3); i++) ctxLines.add(i); }
    const around = [...ctxLines].sort((a, b) => a - b).map(i => `${i}: ${lines[i - 1]}`).join('\n');
    const user = `PROBLEMAS EN EL MOTOR DE VORTEX:\n- ${probs.slice(0, 8).join('\n- ')}\n` + (around ? `\nLÍNEAS AFECTADAS:\n${around}\n` : '') + `\nSCRIPT ACTUAL:\n\`\`\`pine\n${big ? lines.map((l, i) => l).join('\n') : code}\n\`\`\``;
    job.ctl = new AbortController(); let shown = '';
    const r = await L.chat([{role: 'system', content: sys}, {role: 'user', content: user}], {purpose: 'code', maxTokens: big ? 3000 : 6000, temperature: .1, signal: job.ctl.signal,
      cfg: Object.assign(L.load(), {provider: 'free', lab: 'free'}), budget: 170000,
      onToken: t => { shown = t; if (box && !box.hidden) showCode(t.replace(/^[\s\S]*?```(?:pine)?\n?/, ''), true); }});
    const text = r.text || shown;
    if (big || /<{3,}\s*SEARCH/.test(text)) { const pr = L.applyPatch(code, text); return pr.applied ? pr.code : null; }
    return L.extractCode(text) || null;
  }

  function finish(res, probs) {
    const A = window.CCT_ai; job.done = true;
    if (res && res.ok && !drawsSomething(res)) {
      const dc = drawCalls(job.code);
      step('El script no dibuja nada', dc ? 'Se ejecutó sin errores, pero en estas velas no produjo ninguna línea, forma ni etiqueta.' : `Parece incompleto: no tiene ninguna instrucción que dibuje (plot, label.new, box.new…). ¿Copiaste el código completo? Tiene ${job.lines} líneas.`, 'warn');
    }
    const works = res && res.ok && drawsSomething(res), sid = A.saveConverted(job.code, job.name, works ? res : null, works, job.opts.replaceId);
    const st = step(works ? (probs.length ? 'Listo: funciona con partes aproximadas' : 'Listo: convertido y funcionando') : res && res.ok ? 'Guardado, pero no se ve nada en el gráfico' : 'Guardado, pero todavía no funciona en el gráfico',
      sid ? (works ? 'Se guardó en «Mis indicadores» (en tu cuenta) con su imagen y ya está en el gráfico' : res && res.ok ? 'Se guardó en «Mis indicadores». Pega el código completo y conviértelo de nuevo.' : 'Se guardó en «Mis indicadores» para que no se pierda; puedes reintentarlo después') : 'No se pudo guardar', works ? (probs.length ? 'warn' : 'ok') : 'err');
    st.key = 'done';
    if (box) { const go = box.querySelector('.pc-go'), cn = box.querySelector('.pc-cancel'); go.textContent = works ? 'Ver en el gráfico' : 'Entendido'; cn.textContent = 'Cerrar'; cn.hidden = !works; box.querySelector('.pc-note').textContent = works ? `Listo en ${Math.round((Date.now() - job.t0) / 1000)} s` : 'Puedes abrirlo desde Mis indicadores y probar «Convertir de nuevo».'; }
    job.after = () => { close(); if (works && window.CCT_switchView) { try { window.CCT_switchView('chartView'); } catch {} } };
    paint();
    if (job.bg) { toast(works ? `«${job.name}» convertido y en el gráfico` : `«${job.name}» guardado, pero no se pudo convertir`); try { window.CCT_notify && window.CCT_notify('Convertidor de Pine', works ? `«${job.name}» está listo en tu gráfico` : `«${job.name}» no se pudo convertir`); } catch {} }
  }
  function fail(msg) {
    if (!job) return; job.done = true; step(msg, '', 'err');
    if (box) { box.querySelector('.pc-go').textContent = 'Cerrar'; box.querySelector('.pc-cancel').hidden = true; }
    job.after = () => close(); paint();
  }

  window.CCTConvert = {open, problems, fnCount, nameOf};
})();

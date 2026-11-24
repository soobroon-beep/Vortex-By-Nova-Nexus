/* VORTEX · Trades a Discord (solo el desarrollador).
   Cada vez que entras en un trade (tu exchange conectado y/o la cuenta demo), VORTEX publica sola en el canal de Discord que elijas:
   la captura del gráfico (velas, indicadores y tus dibujos) con las líneas de entrada, stop loss y take profit, la moneda, la
   temporalidad, el apalancamiento, el R:R y una explicación breve hecha con lo que muestra el gráfico (tendencia, RSI, volumen).
   · Espera unos segundos después de abrir (por defecto 20 s) para incluir el TP/SL que pongas justo después.
   · Publica UN dispositivo (el que lo activó) para que no salga repetido si tienes la app abierta en PC y celular.
   · Los trades que ya estaban abiertos al abrir la app no se publican: solo los nuevos.
   El webhook se guarda en tu cuenta (state.tcast), nunca en el código. */
(function () {
  'use strict';
  const W = typeof window !== 'undefined' ? window : globalThis, D = typeof document !== 'undefined' ? document : null;
  const H = () => W.CCT_tradeHost;
  const $ = s => D && D.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const HOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;
  const LS_DEV = 'cct_tc_dev', LS_SEEN = 'cct_tc_seen', localStorage = W.localStorage || {getItem: () => null, setItem: () => {}};
  const cfg = () => (H() && H().get()) || {};
  const devOn = () => { try { return localStorage.getItem(LS_DEV) === '1'; } catch (e) { return false; } };
  const active = () => !!(H() && H().owner() && cfg().on && HOOK.test(cfg().url || '') && devOn());
  let seen = (() => { try { return JSON.parse(localStorage.getItem(LS_SEEN) || '{}') || {}; } catch (e) { return {}; } })();
  const saveSeen = () => { const lim = Date.now() - 30 * 864e5; for (const k of Object.keys(seen)) if (seen[k].t < lim) delete seen[k]; try { localStorage.setItem(LS_SEEN, JSON.stringify(seen)); } catch (e) {} };
  const primed = {real: false, demo: false}, cur = {real: [], demo: []}, pend = {};
  let status = {t: '', c: ''}, open = false, lastSent = null;

  /* ───────── Análisis breve (funciones puras, tests/trade-cast.test.js) ───────── */
  function ema(cs, n) { if (cs.length < n) return NaN; const k = 2 / (n + 1); let e = cs.slice(0, n).reduce((a, c) => a + c.c, 0) / n; for (let i = n; i < cs.length; i++) e = cs[i].c * k + e * (1 - k); return e; }
  function rsi(cs, n = 14) { if (cs.length < n + 1) return NaN; let g = 0, l = 0; for (let i = 1; i <= n; i++) { const d = cs[i].c - cs[i - 1].c; if (d > 0) g += d; else l -= d; } g /= n; l /= n; for (let i = n + 1; i < cs.length; i++) { const d = cs[i].c - cs[i - 1].c; g = (g * (n - 1) + Math.max(0, d)) / n; l = (l * (n - 1) + Math.max(0, -d)) / n; } return l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  function explain(cs, tr) {
    const out = []; if (!cs || cs.length < 30) return out;
    const c = cs[cs.length - 1].c, e20 = ema(cs, 20), e50 = ema(cs, 50), r = rsi(cs), long = tr.side > 0;
    let trend = 0;
    if (Number.isFinite(e50) ? c > e20 && e20 > e50 : c > e20) { trend = 1; out.push('Tendencia alcista: el precio está sobre la EMA 20' + (Number.isFinite(e50) ? ' y la EMA 50.' : '.')); }
    else if (Number.isFinite(e50) ? c < e20 && e20 < e50 : c < e20) { trend = -1; out.push('Tendencia bajista: el precio está debajo de la EMA 20' + (Number.isFinite(e50) ? ' y la EMA 50.' : '.')); }
    else out.push('Tendencia mixta: el precio está entre sus medias (EMA 20 / 50).');
    if (Number.isFinite(r)) out.push(r >= 70 ? `RSI en ${r.toFixed(0)}: zona de sobrecompra.` : r <= 30 ? `RSI en ${r.toFixed(0)}: zona de sobreventa.` : r >= 50 ? `RSI en ${r.toFixed(0)}: domina la fuerza compradora.` : `RSI en ${r.toFixed(0)}: domina la presión vendedora.`);
    const vs = cs.slice(-21, -1).map(x => x.v || 0), av = vs.reduce((a, b) => a + b, 0) / (vs.length || 1), lv = cs[cs.length - 1].v || 0, prevV = cs[cs.length - 2] ? cs[cs.length - 2].v || 0 : 0, vr = av > 0 ? Math.max(lv, prevV) / av : NaN;
    if (Number.isFinite(vr)) { if (vr >= 1.5) out.push(`Volumen ${vr.toFixed(1)}× sobre su promedio.`); else if (vr <= .6) out.push('Volumen bajo por ahora.'); }
    if (trend) out.push(trend === (long ? 1 : -1) ? 'Entrada a favor de la tendencia.' : 'Entrada contra la tendencia: operación de rebote, con más riesgo.');
    return out;
  }
  function rr(tr) { // distancias y R:R con los niveles que tenga
    const e = +tr.entry, sl = +tr.sl, tp = +tr.tp, o = {};
    if (e > 0 && sl > 0) o.risk = Math.abs(e - sl) / e * 100;
    if (e > 0 && tp > 0) o.reward = Math.abs(tp - e) / e * 100;
    if (o.risk > 0 && o.reward > 0) o.rr = o.reward / o.risk;
    return o;
  }
  function payload(tr, info) {
    const long = tr.side > 0, f = info.fmt || (v => String(v)), R = rr(tr), C = cfg();
    const fields = [
      {name: 'Entrada', value: f(tr.entry), inline: true},
      {name: 'Stop loss', value: tr.sl > 0 ? `${f(tr.sl)}${R.risk ? ` (−${R.risk.toFixed(2)} %)` : ''}` : '—', inline: true},
      {name: 'Take profit', value: tr.tp > 0 ? `${f(tr.tp)}${R.reward ? ` (+${R.reward.toFixed(2)} %)` : ''}` : '—', inline: true},
      {name: 'Temporalidad', value: info.tf || '—', inline: true},
      {name: 'Apalancamiento', value: tr.lev > 0 ? 'x' + Math.round(tr.lev) : '—', inline: true},
      {name: 'R:R', value: R.rr ? R.rr.toFixed(2) : '—', inline: true}
    ];
    const desc = [(info.why || []).join(' '), C.note ? '\n' + C.note : ''].join('').trim();
    return {
      username: (C.name || 'VORTEX').slice(0, 32), allowed_mentions: {parse: []},
      embeds: [Object.assign({
        title: `${long ? '🟢 LONG' : '🔴 SHORT'} · ${info.pair}`, color: long ? 0x20bf9f : 0xf06b79,
        description: desc.slice(0, 1800) || undefined, fields,
        footer: {text: `VORTEX · ${tr.src === 'demo' ? 'cuenta demo' : 'trade real'} · no es asesoría financiera`}, timestamp: new Date(tr.t || Date.now()).toISOString()
      }, info.img ? {image: {url: 'attachment://trade.png'}} : {})],
      attachments: info.img ? [{id: 0, filename: 'trade.png'}] : undefined
    };
  }

  /* ───────── Imagen: captura del gráfico (o un gráfico propio si la moneda no está abierta) + encabezado con los niveles ───────── */
  function marksOf(tr) { return [{p: +tr.entry, c: '#548fff', t: 'Entrada'}, {p: +tr.sl, c: '#f06b79', t: 'SL', dash: true}, {p: +tr.tp, c: '#20bf9f', t: 'TP', dash: true}].filter(m => m.p > 0); }
  function mini(cs, marks, fmt) { // gráfico propio: últimas 90 velas, EMA 20/50 y niveles
    const W = 1200, Hh = 620, pad = {l: 14, r: 92, t: 16, b: 26}, v = cs.slice(-90), o = document.createElement('canvas'); o.width = W; o.height = Hh; const g = o.getContext('2d');
    g.fillStyle = '#0b0e11'; g.fillRect(0, 0, W, Hh);
    let lo = Math.min(...v.map(x => x.l), ...marks.map(m => m.p)), hi = Math.max(...v.map(x => x.h), ...marks.map(m => m.p)); const sp = (hi - lo) || hi * .01; lo -= sp * .06; hi += sp * .06;
    const pw = W - pad.l - pad.r, ph = Hh - pad.t - pad.b, X = i => pad.l + (i + .5) * pw / v.length, Yy = p => pad.t + (hi - p) / (hi - lo) * ph, bw = Math.max(2, pw / v.length * .64);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '12px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
    for (let k = 0; k <= 5; k++) { const p = lo + (hi - lo) * k / 5, y = Yy(p); g.beginPath(); g.moveTo(pad.l, y); g.lineTo(W - pad.r, y); g.stroke(); g.fillText(fmt(p), W - pad.r + 8, y); }
    v.forEach((x, i) => { const up = x.c >= x.o, col = up ? '#20bf9f' : '#f06b79'; g.strokeStyle = col; g.fillStyle = col; g.beginPath(); g.moveTo(X(i), Yy(x.h)); g.lineTo(X(i), Yy(x.l)); g.stroke(); const y1 = Yy(Math.max(x.o, x.c)), y2 = Yy(Math.min(x.o, x.c)); g.fillRect(X(i) - bw / 2, y1, bw, Math.max(1, y2 - y1)); });
    for (const [n, col] of [[20, '#e9c36e'], [50, '#a98bff']]) { if (cs.length < n) continue; const k = 2 / (n + 1); let e = cs.slice(0, n).reduce((a, c) => a + c.c, 0) / n; const pts = []; for (let i = n; i < cs.length; i++) { e = cs[i].c * k + e * (1 - k); const j = i - (cs.length - v.length); if (j >= 0) pts.push([X(j), Yy(e)]); } g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); pts.forEach(([a, b], q) => q ? g.lineTo(a, b) : g.moveTo(a, b)); g.stroke(); }
    g.lineWidth = 2;
    for (const m of marks) { const y = Yy(m.p); g.strokeStyle = m.c; g.setLineDash(m.dash ? [8, 6] : []); g.beginPath(); g.moveTo(pad.l, y); g.lineTo(W - pad.r, y); g.stroke(); g.setLineDash([]); const tx = `${m.t} ${fmt(m.p)}`; g.font = '700 13px Inter, system-ui, sans-serif'; const tw = g.measureText(tx).width + 14; g.fillStyle = m.c; g.fillRect(pad.l + 6, y - 11, tw, 22); g.fillStyle = '#fff'; g.fillText(tx, pad.l + 13, y + 1); }
    return o;
  }
  function compose(img, tr, info) {
    const W = Math.max(900, img.width), k = W / img.width, ih = Math.round(img.height * k), HD = 96, FT = 34, o = document.createElement('canvas'); o.width = W; o.height = HD + ih + FT; const g = o.getContext('2d'), long = tr.side > 0, col = long ? '#20bf9f' : '#f06b79', f = info.fmt, R = rr(tr);
    g.fillStyle = '#0b0e11'; g.fillRect(0, 0, W, o.height);
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, long ? 'rgba(32,191,159,.22)' : 'rgba(240,107,121,.22)'); gr.addColorStop(1, 'rgba(11,14,17,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, HD);
    g.textBaseline = 'middle'; g.font = '800 20px Inter, system-ui, sans-serif'; const tag = long ? 'LONG' : 'SHORT', tw = g.measureText(tag).width + 26;
    g.fillStyle = col; g.beginPath(); (g.roundRect ? g.roundRect(22, 18, tw, 34, 9) : g.rect(22, 18, tw, 34)); g.fill(); g.fillStyle = '#fff'; g.fillText(tag, 35, 36);
    g.font = '800 26px Inter, system-ui, sans-serif'; g.fillStyle = '#f1f3f7'; g.fillText(`${info.pair} · ${info.tf}${tr.lev > 0 ? ' · x' + Math.round(tr.lev) : ''}`, 22 + tw + 14, 36);
    g.font = '600 16px Inter, system-ui, sans-serif'; g.fillStyle = 'rgba(241,243,247,.78)';
    g.fillText([`Entrada ${f(tr.entry)}`, tr.sl > 0 ? `SL ${f(tr.sl)}` : '', tr.tp > 0 ? `TP ${f(tr.tp)}` : '', R.rr ? `R:R ${R.rr.toFixed(2)}` : ''].filter(Boolean).join('   ·   '), 24, 74);
    g.drawImage(img, 0, HD, W, ih);
    g.fillStyle = 'rgba(241,243,247,.55)'; g.font = '600 13px Inter, system-ui, sans-serif'; g.fillText('VORTEX · Powered by Nova Nexus', 22, HD + ih + FT / 2);
    const d = new Date(tr.t || Date.now()).toLocaleString('es-MX', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}); g.textAlign = 'right'; g.fillText(d, W - 22, HD + ih + FT / 2); g.textAlign = 'left';
    return o;
  }

  /* ───────── Envío ───────── */
  async function send(tr, test) {
    const h = H(), C = cfg(); if (!h) throw Error('VORTEX aún no está listo');
    const url = C.url; if (!HOOK.test(url || '')) throw Error('Falta el webhook del canal');
    const same = h.cur().base === h.base(tr.key) && h.cur().n > 30, tf = h.tf();
    let cs = []; try { cs = same ? h.candles() : await h.klines(tr.key, tf, 200); } catch (e) { cs = same ? h.candles() : []; }
    const info = {pair: h.pair(tr.key), tf, fmt: h.fmt, why: explain(cs, tr)};
    let blob = null;
    if (C.shot !== false) { try { const marks = marksOf(tr), base = same ? h.shot(marks) : (cs.length > 20 ? mini(cs, marks, h.fmt) : null); if (base) { const cv = compose(base, tr, info); blob = await new Promise(r => cv.toBlob(r, 'image/png')); } } catch (e) { blob = null; } }
    info.img = !!blob;
    const body = payload(tr, info); if (test) body.embeds[0].title = '🧪 Prueba · ' + body.embeds[0].title;
    for (let k = 0; k < 3; k++) {
      const fd = new FormData(); fd.append('payload_json', JSON.stringify(body)); if (blob) fd.append('files[0]', blob, 'trade.png');
      let r; try { r = await fetch(url + '?wait=true', {method: 'POST', body: fd}); } catch (e) { throw Error('Sin conexión con Discord'); }
      if (r.status === 429) { let w = 2; try { w = (await r.json()).retry_after || 2; } catch (e) {} await new Promise(ok => setTimeout(ok, Math.min(10, w) * 1000 + 200)); continue; }
      if (!r.ok) throw Error('Discord respondió ' + r.status);
      lastSent = {t: Date.now(), pair: info.pair, side: tr.side}; return true;
    }
    throw Error('Discord está limitando los envíos; intenta en un minuto');
  }
  async function sendClose(tr) {
    const C = cfg(), h = H(); if (!HOOK.test(C.url || '') || !h) return;
    const body = {username: (C.name || 'VORTEX').slice(0, 32), allowed_mentions: {parse: []}, embeds: [{title: `⏹️ Cerrado · ${tr.side > 0 ? 'LONG' : 'SHORT'} ${h.pair(tr.key)}`, description: `Entrada ${h.fmt(tr.entry)}${tr.exit > 0 ? ` · salida ${h.fmt(tr.exit)} (${(((tr.exit - tr.entry) / tr.entry) * 100 * tr.side).toFixed(2)} %)` : ''}`, color: 0x8a8f98, footer: {text: 'VORTEX · no es asesoría financiera'}, timestamp: new Date().toISOString()}]};
    try { await fetch(C.url + '?wait=false', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)}); } catch (e) {}
  }

  /* ───────── Detección de trades nuevos ───────── */
  function observe(src, list) {
    const ids = new Set(list.map(t => t.id)), prev = cur[src]; cur[src] = list;
    if (!primed[src]) { primed[src] = true; for (const t of list) if (!seen[t.id]) seen[t.id] = {t: Date.now(), pre: 1}; saveSeen(); return; } // los que ya estaban abiertos no se publican
    for (const t of list) if (!seen[t.id]) {
      seen[t.id] = {t: Date.now()}; saveSeen();
      if (!active() || (src === 'real' && cfg().real === false) || (src === 'demo' && !cfg().demo)) continue;
      const wait = (cfg().wait == null ? 20 : cfg().wait) * 1000; clearTimeout(pend[t.id]);
      pend[t.id] = setTimeout(async () => { delete pend[t.id]; const now = cur[src].find(x => x.id === t.id) || t; // con el TP/SL que pusiste después
        try { await send(Object.assign({}, now, {src})); seen[t.id].pub = 1; saveSeen(); H().toast(`Trade publicado en Discord: ${H().pair(now.key)}`); } catch (e) { status = {t: 'No se pudo publicar: ' + e.message, c: 'err'}; paint(); H().toast('Discord: ' + e.message); } }, wait);
    }
    if (cfg().close && active()) for (const t of prev) if (!ids.has(t.id) && seen[t.id] && seen[t.id].pub && !seen[t.id].closed) { seen[t.id].closed = 1; saveSeen(); sendClose(Object.assign({}, t, {exit: t.last || 0})); }
  }
  const realList = trades => (trades || []).map(t => ({id: 'r:' + t.id, key: t.k, side: t.side, entry: +t.entry, lev: +t.lev || 0, tp: +t.tp || 0, sl: +t.sl || 0, t: Date.now()}));
  function hookReal() { if (W.CCTTradeWatch && CCTTradeWatch.onChange) { CCTTradeWatch.onChange(tr => observe('real', realList(tr))); observe('real', realList(CCTTradeWatch.list ? CCTTradeWatch.list() : [])); } }
  function pollDemo() {
    try { const A = W.CCTTrade && CCTTrade.acct ? CCTTrade.acct() : null; if (!A || !Array.isArray(A.pos)) return;
      observe('demo', A.pos.map(p => ({id: 'd:' + p.id, key: p.sym, side: p.side > 0 ? 1 : -1, entry: +p.entry, lev: +p.lev || 0, tp: +(p.tp && (p.tp.price || p.tp)) || 0, sl: +(p.sl && (p.sl.price || p.sl)) || 0, t: +p.t || Date.now()})));
    } catch (e) {}
  }

  /* ───────── Panel (Desarrollador › Trades a Discord) ───────── */
  const sw = (k, on, lbl) => `<button type="button" class="toggle${on ? ' on' : ''}" data-tc-sw="${k}" role="switch" aria-checked="${!!on}" aria-label="${esc(lbl)}"></button>`;
  const row = (t, s, ctl) => `<div class="tc-row"><div><b>${t}</b>${s ? `<small>${s}</small>` : ''}</div>${ctl}</div>`;
  function paint() {
    const box = $('#tcBox'), sub = $('#tcSub'), C = cfg();
    if (sub) sub.textContent = active() ? 'Activo en este dispositivo' : C.on && !devOn() ? 'Activo en otro dispositivo' : 'Captura y niveles de cada trade, automático';
    if (!box) return; box.hidden = !open; if (!open) return;
    box.innerHTML = `<div class="tc-card">
      ${row('Publicar mis trades', 'Cada trade nuevo: captura del gráfico, niveles y una explicación breve', sw('on', C.on && devOn(), 'Publicar mis trades'))}
      <label class="tc-lbl">Webhook del canal de Discord</label>
      <div class="tc-in"><input class="dc-input" id="tcUrl" type="password" placeholder="https://discord.com/api/webhooks/…" value="${esc(C.url || '')}" autocomplete="off" spellcheck="false"><button type="button" class="dc-btn" data-tc="save">Guardar</button></div>
      ${H() && H().discordUrl() && !C.url ? '<button type="button" class="tc-link" data-tc="usedc">Usar el webhook que ya tengo en Discord</button>' : ''}
      <small class="tc-note">En Discord: Ajustes del canal › Integraciones › Webhooks › Nuevo webhook › Copiar URL.</small>
      ${row('Trades reales', 'Tu exchange conectado', sw('real', C.real !== false, 'Trades reales'))}
      ${row('Cuenta demo', 'Operar desde el gráfico en demo', sw('demo', !!C.demo, 'Cuenta demo'))}
      ${row('Captura del gráfico', 'Con tus indicadores, dibujos y las líneas de entrada, SL y TP', sw('shot', C.shot !== false, 'Captura'))}
      ${row('Avisar al cerrar', 'Un mensaje corto cuando el trade se cierra', sw('close', !!C.close, 'Avisar al cerrar'))}
      <label class="tc-lbl">Esperar antes de publicar</label>
      <div class="tc-seg">${[[0, 'Al instante'], [10, '10 s'], [20, '20 s'], [45, '45 s']].map(([v, n]) => `<button type="button" data-tc-wait="${v}" class="${(C.wait == null ? 20 : C.wait) === v ? 'on' : ''}">${n}</button>`).join('')}</div>
      <small class="tc-note">Da tiempo a poner tu TP y SL para que salgan en la publicación.</small>
      <label class="tc-lbl">Nombre del bot y firma (opcional)</label>
      <input class="dc-input" id="tcName" maxlength="32" placeholder="VORTEX" value="${esc(C.name || '')}">
      <textarea class="dc-input tc-note-in" id="tcNote" maxlength="300" rows="2" placeholder="Texto que se agrega a cada trade (por ejemplo: Gestiona tu riesgo 🙏)">${esc(C.note || '')}</textarea>
      <div class="dc-row"><button type="button" class="dc-btn pri" data-tc="savemeta">Guardar</button><button type="button" class="dc-btn" data-tc="test" ${HOOK.test(C.url || '') ? '' : 'disabled'}>Enviar prueba con el gráfico abierto</button></div>
      ${status.t ? `<p class="cx-msg ${status.c}">${esc(status.t)}</p>` : ''}
      ${lastSent ? `<small class="tc-note">Último publicado: ${esc(lastSent.pair)} ${lastSent.side > 0 ? 'LONG' : 'SHORT'} · ${new Date(lastSent.t).toLocaleTimeString('es-MX', {hour: '2-digit', minute: '2-digit'})}</small>` : ''}
      <small class="tc-note">Publica solo este dispositivo (el que lo activó), así no se repite si tienes VORTEX abierto en varios. Los trades que ya estaban abiertos no se publican. No es asesoría financiera.</small></div>`;
  }
  const flash = (t, c) => { status = {t, c}; paint(); };
  if (D) D.addEventListener('click', async e => {
    if (e.target.closest('#setTcast')) { open = !open; status = {t: '', c: ''}; paint(); const b = $('#setTcast'); if (b) b.setAttribute('aria-expanded', String(open)); if (open) setTimeout(() => $('#tcBox') && $('#tcBox').scrollIntoView({block: 'nearest', behavior: 'smooth'}), 30); return; }
    const h = H(); if (!h || !e.target.closest('#tcBox')) return;
    const s = e.target.closest('[data-tc-sw]'); if (s) { const k = s.dataset.tcSw, C = cfg();
      if (k === 'on') { const now = !(C.on && devOn()); if (now && !HOOK.test(C.url || '')) return flash('Primero guarda el webhook del canal.', 'err'); try { localStorage.setItem(LS_DEV, now ? '1' : '0'); } catch (er) {} h.set({on: now}); flash(now ? 'Activado: tus trades nuevos se publicarán solos desde este dispositivo.' : 'Desactivado.', now ? 'ok' : ''); return; }
      h.set({[k]: k === 'real' || k === 'shot' ? C[k] === false : !C[k]}); paint(); return; }
    const wv = e.target.closest('[data-tc-wait]'); if (wv) { h.set({wait: +wv.dataset.tcWait}); paint(); return; }
    const b = e.target.closest('[data-tc]'); if (!b) return; const a = b.dataset.tc;
    if (a === 'save') { const u = $('#tcUrl').value.trim(); if (!HOOK.test(u)) return flash('Ese no parece un webhook de Discord (https://discord.com/api/webhooks/…).', 'err'); h.set({url: u}); flash('Webhook guardado.', 'ok'); }
    else if (a === 'usedc') { h.set({url: h.discordUrl()}); flash('Listo: se usará el mismo webhook de tus avisos de Discord.', 'ok'); }
    else if (a === 'savemeta') { h.set({name: $('#tcName').value.trim(), note: $('#tcNote').value.trim()}); flash('Guardado.', 'ok'); }
    else if (a === 'test') {
      const c = h.cur(), cs = h.candles(); if (!cs.length) return flash('Abre un gráfico y espera a que carguen las velas.', 'err');
      const p = cs[cs.length - 1].c; flash('Enviando prueba…', '');
      try { await send({key: c.key, side: 1, entry: p, sl: +(p * .985).toPrecision(8), tp: +(p * 1.03).toPrecision(8), lev: 10, t: Date.now(), src: 'demo'}, true); flash('Prueba enviada: revisa tu canal de Discord.', 'ok'); } catch (er) { flash('No funcionó: ' + er.message, 'err'); }
    }
  });
  function boot() {
    const z = $('#devZone .sg'); if (z && !$('#setTcast')) {
      z.insertAdjacentHTML('beforeend', `<button class="sg-row dev-glow" id="setTcast" aria-label="Trades a Discord" aria-expanded="false" type="button"><span class="sg-ic" style="--c:#7c87ff"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="13" height="11" rx="2"/><path d="M16 10l5-3v10l-5-3"/><path d="M7 13l2-2 2 2 2-3"/></svg></span><span class="sg-t"><b>Trades a Discord</b><small id="tcSub">Captura y niveles de cada trade, automático</small></span><svg class="sg-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`);
      z.insertAdjacentHTML('afterend', '<div id="tcBox" class="tc" hidden></div>');
    }
    hookReal(); pollDemo(); setInterval(pollDemo, 3000); paint();
  }
  W.CCTTradeCast = {explain, rr, payload, marksOf, send, active, observe: (s, l) => observe(s, l)};
  if (typeof module === 'object' && module.exports) module.exports = W.CCTTradeCast;
  else if (document.readyState === 'complete') boot(); else addEventListener('load', boot);
})();

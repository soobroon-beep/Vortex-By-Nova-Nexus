/* VORTEX · Diario de trading automático.
   Cada operación que cierras en la cuenta demo se anota sola (con captura del gráfico al abrir y al cerrar);
   también puedes anotar operaciones reales a mano. Estadísticas, curva de capital, calendario, etiquetas y notas. */
(function (root) {
  'use strict';
  const LS = 'cct_journal_v1', MAX = 1000, fin = Number.isFinite;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const uid = () => 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let H = {snap: () => null, sym: () => '', base: s => s, fmt: v => String(v), toast: () => {}, go: null};
  let J = load(), ov = null, sel = null, F = {per: '30', side: 'all', tag: ''}, calM = null;

  function load() { try { const j = JSON.parse(localStorage.getItem(LS) || 'null'); if (j && Array.isArray(j.items)) return Object.assign({items: [], seen: [], open: {}, tags: []}, j); } catch {} return {items: [], seen: [], open: {}, tags: []}; }
  const save = () => { cloudMirror(); try { localStorage.setItem(LS, JSON.stringify(J)); } catch { if (J.items.length > 200) { J.items.length = Math.floor(J.items.length * .8); save(); } } };
  /* Copia del diario en tu cuenta (users/<uid>/data/journal), sin capturas: así tus operaciones no se quedan solo en este dispositivo
     y tu cerebro (Neural Brain) puede aprender de ellas. Se mezcla con lo que ya haya en la nube (por id), nunca se pisa. */
  let cloudT = 0;
  const cloudKeep = it => { const o = {}; for (const k of ['id', 'src', 'sym', 'side', 'qty', 'entry', 'exit', 'pnl', 'fees', 'lev', 'why', 'tOpen', 'tClose', 'sl', 'tp', 'r', 'tags', 'note']) if (it[k] != null) o[k] = it[k]; return o; };
  function cloudMirror() {
    clearTimeout(cloudT); cloudT = setTimeout(async () => {
      const C = root.CCTCloudPriv; if (!C || !C.ready()) return;
      try {
        const d = await C.get('journal'); let cloud = []; try { cloud = d && d.items ? JSON.parse(d.items) : []; } catch {}
        const map = new Map(); for (const it of (Array.isArray(cloud) ? cloud : [])) if (it && it.id) map.set(it.id, it); for (const it of J.items) if (it && it.id) map.set(it.id, cloudKeep(it));
        const all = [...map.values()].sort((a, b) => (b.tClose || 0) - (a.tClose || 0)).slice(0, 800), str = JSON.stringify(all);
        if (!d || d.items !== str) await C.set('journal', {items: str, at: Date.now()});
      } catch {}
    }, 4000);
  }

  /* ───────── imágenes en IndexedDB (las capturas no caben en localStorage) ───────── */
  let dbP = null;
  const db = () => dbP || (dbP = new Promise((res, rej) => { if (!root.indexedDB) return rej(new Error('sin IndexedDB')); const r = indexedDB.open('vortex_journal', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const idb = (mode, fn) => db().then(d => new Promise((res, rej) => { const t = d.transaction('img', mode), st = t.objectStore('img'), q = fn(st); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
  const putImg = (k, v) => v ? idb('readwrite', s => s.put(v, k)).catch(() => {}) : Promise.resolve();
  const getImg = k => idb('readonly', s => s.get(k)).catch(() => null);
  const delImg = k => idb('readwrite', s => s.delete(k)).catch(() => {});

  /* ───────── registro automático desde la cuenta demo ───────── */
  function sync(acct) {
    if (!acct) return; let ch = false; const seen = new Set(J.seen), cur = H.sym();
    for (const p of acct.pos) { const k = p.sym + '|' + p.t; if (!J.open[k]) { J.open[k] = {sl: p.sl || null, tp: p.tp || null, entry: p.entry, t: p.t, img: p.sym === cur}; ch = true; if (p.sym === cur) putImg('o:' + k, H.snap()); } else { const o = J.open[k]; if (!o.sl && p.sl) { o.sl = p.sl; ch = true; } if (!o.tp && p.tp) { o.tp = p.tp; ch = true; } } }
    for (const h of acct.hist.slice().reverse()) {
      if (seen.has(h.id)) continue; seen.add(h.id); ch = true;
      const k = h.sym + '|' + h.open, o = J.open[k] || {}, risk = o.sl ? Math.abs(h.entry - o.sl) * h.qty : NaN;
      const it = {id: uid(), src: 'demo', sym: h.sym, side: h.side, qty: h.qty, entry: h.entry, exit: h.exit, pnl: h.pnl, fees: h.fees || 0, lev: h.lev, why: h.why, tOpen: h.open || h.t, tClose: h.t, sl: o.sl || null, tp: o.tp || null, r: fin(risk) && risk > 0 ? h.pnl / risk : null, tags: [], note: '', mood: '', errs: [], imgO: o.img ? 'o:' + k : '', imgC: ''};
      if (h.sym === cur) { it.imgC = 'c:' + it.id; putImg(it.imgC, H.snap()); }
      J.items.unshift(it);
    }
    const live = new Set(acct.pos.map(p => p.sym + '|' + p.t)); for (const k of Object.keys(J.open)) if (!live.has(k) && !J.items.some(i => i.sym + '|' + i.tOpen === k && i.src === 'demo')) delete J.open[k];
    if (ch) { J.seen = [...seen].slice(-3000); if (J.items.length > MAX) J.items.length = MAX; save(); if (ov && !ov.hidden) render(); }
  }

  /* ───────── estadísticas ───────── */
  function filtered() {
    const now = Date.now(), d = F.per === 'all' ? Infinity : +F.per * 864e5;
    return J.items.filter(i => now - i.tClose <= d && (F.side === 'all' || (F.side === 'long' ? i.side > 0 : i.side < 0)) && (!F.tag || (i.tags || []).includes(F.tag)));
  }
  function stats(list) {
    const n = list.length; let w = 0, ls = 0, gp = 0, gl = 0, rs = 0, rn = 0, best = -Infinity, worst = Infinity, cw = 0, cl = 0, mw = 0, ml = 0, dur = 0;
    for (const i of list.slice().reverse()) { if (i.pnl > 0) { w++; gp += i.pnl; cw++; cl = 0; mw = Math.max(mw, cw); } else if (i.pnl < 0) { gl -= i.pnl; ls++; cl++; cw = 0; ml = Math.max(ml, cl); } else { cw = 0; cl = 0; } if (fin(i.r)) { rs += i.r; rn++; } best = Math.max(best, i.pnl); worst = Math.min(worst, i.pnl); dur += Math.max(0, i.tClose - i.tOpen); }
    return {n, win: n ? w / n * 100 : 0, net: gp - gl, pf: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0, exp: n ? (gp - gl) / n : 0, avgW: w ? gp / w : 0, avgL: ls ? gl / ls : 0, r: rn ? rs / rn : null, best: n ? best : 0, worst: n ? worst : 0, mw, ml, dur: n ? dur / n : 0};
  }
  const by = (list, keyFn) => { const m = new Map(); for (const i of list) { const k = keyFn(i); const o = m.get(k) || {n: 0, pnl: 0, w: 0}; o.n++; o.pnl += i.pnl; if (i.pnl > 0) o.w++; m.set(k, o); } return m; };

  /* ───────── interfaz ───────── */
  const usd = (v, s) => fin(v) ? (s && v > 0 ? '+' : v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '—';
  const cls = v => v > 0 ? 'up' : v < 0 ? 'dn' : '';
  const dur = ms => { const m = Math.round(ms / 6e4); return m < 60 ? m + ' min' : m < 1440 ? (m / 60).toFixed(1) + ' h' : (m / 1440).toFixed(1) + ' d'; };
  const dt = t => new Date(t).toLocaleString('es-MX', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'});
  const TAGS = ['Ruptura', 'Retesteo', 'Tendencia', 'Rango', 'Reversión', 'Noticia', 'Scalp', 'Swing'];
  const MOODS = ['Disciplinado', 'Confiado', 'Dudoso', 'Impulsivo', 'Miedo', 'Codicia'];
  const ERRS = ['Entré tarde', 'Sin plan', 'Moví el stop', 'Cerré antes', 'Sobreapalancado', 'Operé por venganza'];

  function equitySvg(list) {
    const pts = list.slice().reverse(); if (pts.length < 2) return '<div class="jr-empty">La curva aparece con 2 operaciones o más.</div>';
    let s = 0; const v = [0, ...pts.map(i => (s += i.pnl))], mn = Math.min(...v), mx = Math.max(...v), W = 600, Hh = 140, X = i => i / (v.length - 1) * W, Y = y => Hh - 8 - (y - mn) / ((mx - mn) || 1) * (Hh - 16);
    const d = v.map((y, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join(' '), col = s >= 0 ? '#20bf9f' : '#f06b79';
    return `<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" class="jr-eq"><defs><linearGradient id="jrG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><line x1="0" x2="${W}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="rgba(255,255,255,.18)" stroke-dasharray="3 4"/><path d="${d} L${W},${Hh} L0,${Hh} Z" fill="url(#jrG)"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function calendar() {
    const now = new Date(), m = calM || new Date(now.getFullYear(), now.getMonth(), 1), y = m.getFullYear(), mo = m.getMonth(), days = new Date(y, mo + 1, 0).getDate(), first = (new Date(y, mo, 1).getDay() + 6) % 7;
    const per = new Map(); for (const i of J.items) { const d = new Date(i.tClose); if (d.getFullYear() === y && d.getMonth() === mo) { const k = d.getDate(), o = per.get(k) || {pnl: 0, n: 0}; o.pnl += i.pnl; o.n++; per.set(k, o); } }
    const mx = Math.max(1, ...[...per.values()].map(o => Math.abs(o.pnl))); let tot = 0; per.forEach(o => tot += o.pnl);
    let cells = ''; for (let i = 0; i < first; i++) cells += '<span class="jr-d off"></span>';
    for (let d = 1; d <= days; d++) { const o = per.get(d), a = o ? .15 + .6 * Math.abs(o.pnl) / mx : 0; cells += `<span class="jr-d ${o ? cls(o.pnl) : ''}" style="${o ? `--a:${a.toFixed(2)}` : ''}" title="${o ? `${o.n} operaciones · ${usd(o.pnl, true)}` : ''}"><b>${d}</b>${o ? `<small>${usd(o.pnl, true).replace('.00', '')}</small>` : ''}</span>`; }
    return `<div class="jr-calh"><button type="button" data-jr-cal="-1">‹</button><b>${(n => n[0].toUpperCase() + n.slice(1))(m.toLocaleString('es-MX', {month: 'long'}))} ${y}</b><span class="${cls(tot)}">${usd(tot, true)}</span><button type="button" data-jr-cal="1">›</button></div><div class="jr-cal">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<em>${x}</em>`).join('')}${cells}</div>`;
  }
  function bars(m, label) {
    const arr = [...m.entries()]; if (!arr.length) return '<div class="jr-empty">Sin datos.</div>';
    const mx = Math.max(...arr.map(([, o]) => Math.abs(o.pnl)), 1);
    return arr.map(([k, o]) => `<div class="jr-bar"><span>${esc(label ? label(k) : k)}</span><div><i class="${cls(o.pnl)}" style="width:${(Math.abs(o.pnl) / mx * 100).toFixed(1)}%"></i></div><b class="${cls(o.pnl)}">${usd(o.pnl, true)}</b><small>${o.n} · ${Math.round(o.w / o.n * 100)}%</small></div>`).join('');
  }
  function render() {
    const L = filtered(), S = stats(L), body = ov.querySelector('.jr-body');
    const card = (t, v, c, sub) => `<div class="jr-k"><span>${t}</span><b class="${c || ''}">${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const tags = [...new Set([...TAGS, ...J.items.flatMap(i => i.tags || [])])];
    body.innerHTML = `<div class="jr-filt"><div class="jr-seg">${[['7', '7 días'], ['30', '30 días'], ['90', '90 días'], ['all', 'Todo']].map(([k, l]) => `<button type="button" data-jr-per="${k}" class="${F.per === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="jr-seg">${[['all', 'Todas'], ['long', 'Long'], ['short', 'Short']].map(([k, l]) => `<button type="button" data-jr-side="${k}" class="${F.side === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <select data-jr-ftag aria-label="Etiqueta"><option value="">Todas las etiquetas</option>${tags.map(t => `<option ${F.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <div class="jr-kpis">${card('Resultado neto', usd(S.net, true), cls(S.net), `${S.n} operaciones`)}${card('% ganadoras', S.n ? S.win.toFixed(1) + '%' : '—', '', `Mejor racha ${S.mw} · peor racha ${S.ml}`)}${card('Factor de beneficio', S.pf === Infinity ? '∞' : S.n ? S.pf.toFixed(2) : '—', S.pf >= 1.5 ? 'up' : S.n && S.pf < 1 ? 'dn' : '')}${card('Esperanza', usd(S.exp, true), cls(S.exp), 'Promedio por operación')}${card('R promedio', S.r == null ? '—' : (S.r >= 0 ? '+' : '') + S.r.toFixed(2) + 'R', cls(S.r || 0), 'Solo con stop puesto')}${card('Ganancia / pérdida media', `<span class="up">${usd(S.avgW)}</span> / <span class="dn">${usd(S.avgL)}</span>`, '', `Mejor ${usd(S.best, true)} · peor ${usd(S.worst, true)}`)}${card('Duración media', S.n ? dur(S.dur) : '—')}</div>
      <div class="jr-grid"><section class="jr-box jr-wide"><h4>Curva de capital</h4>${equitySvg(L)}</section>
        <section class="jr-box"><h4>Calendario</h4>${calendar()}</section>
        <section class="jr-box"><h4>Por activo</h4>${bars(by(L, i => H.base(i.sym)))}</section>
        <section class="jr-box"><h4>Por motivo de cierre</h4>${bars(by(L, i => i.why || 'Manual'))}</section>
        <section class="jr-box"><h4>Por día de la semana</h4>${bars(new Map([...by(L, i => (new Date(i.tClose).getDay() + 6) % 7)].sort((a, b) => a[0] - b[0])), k => ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][k])}</section>
        <section class="jr-box"><h4>Errores más caros</h4>${bars(by(L.filter(i => (i.errs || []).length).flatMap(i => i.errs.map(e => Object.assign({}, i, {_e: e}))), i => i._e))}</section></div>
      <section class="jr-box jr-wide"><h4>Operaciones <small>${L.length}</small></h4>${L.length ? `<div class="jr-list">${L.slice(0, 300).map(i => `<button type="button" class="jr-row" data-jr-open="${i.id}"><span class="jr-side ${i.side > 0 ? 'up' : 'dn'}">${i.side > 0 ? 'Long' : 'Short'}</span><b>${esc(H.base(i.sym))}</b><small>${dt(i.tClose)} · ${esc(i.why || 'Manual')}${i.src === 'manual' ? ' · real' : ''}</small><span class="jr-tags">${(i.tags || []).map(t => `<em>${esc(t)}</em>`).join('')}${i.note ? '<em class="n">nota</em>' : ''}</span><span class="jr-r">${fin(i.r) ? (i.r >= 0 ? '+' : '') + i.r.toFixed(2) + 'R' : ''}</span><b class="${cls(i.pnl)}">${usd(i.pnl, true)}</b></button>`).join('')}</div>` : '<div class="jr-empty">Todavía no hay operaciones. Las que cierres en la cuenta demo (botón Operar) se anotan solas, o agrega una real con «Agregar operación».</div>'}</section>`;
  }
  function detail(i) {
    sel = i; const d = ov.querySelector('.jr-det'); d.hidden = false;
    const chip = (k, v, on) => `<button type="button" class="jr-chip ${on ? 'on' : ''}" data-jr-${k}="${esc(v)}">${esc(v)}</button>`;
    d.innerHTML = `<div class="jr-dh"><div><span class="jr-side ${i.side > 0 ? 'up' : 'dn'}">${i.side > 0 ? 'Long' : 'Short'}</span> <b>${esc(H.base(i.sym))}</b> <small>${i.lev ? i.lev + 'x · ' : ''}${esc(i.why || 'Manual')}</small></div><button type="button" class="jr-x" data-jr-detx aria-label="Cerrar">✕</button></div>
      <div class="jr-dk"><div><span>Resultado</span><b class="${cls(i.pnl)}">${usd(i.pnl, true)}</b></div><div><span>R</span><b>${fin(i.r) ? (i.r >= 0 ? '+' : '') + i.r.toFixed(2) + 'R' : '—'}</b></div><div><span>Entrada → salida</span><b>${H.fmt(i.entry)} → ${H.fmt(i.exit)}</b></div><div><span>Duración</span><b>${dur(i.tClose - i.tOpen)}</b></div><div><span>Stop / objetivo</span><b>${i.sl ? H.fmt(i.sl) : '—'} / ${i.tp ? H.fmt(i.tp) : '—'}</b></div><div><span>Comisiones</span><b>${usd(i.fees)}</b></div></div>
      <div class="jr-imgs"><figure data-jr-img="${esc(i.imgO)}"><figcaption>Al abrir</figcaption></figure><figure data-jr-img="${esc(i.imgC)}"><figcaption>Al cerrar</figcaption></figure></div>
      <h5>Setup</h5><div class="jr-chips">${TAGS.map(t => chip('tag', t, (i.tags || []).includes(t))).join('')}${(i.tags || []).filter(t => !TAGS.includes(t)).map(t => chip('tag', t, true)).join('')}<button type="button" class="jr-chip add" data-jr-newtag>+ Otra</button></div>
      <h5>Cómo me sentí</h5><div class="jr-chips">${MOODS.map(t => chip('mood', t, i.mood === t)).join('')}</div>
      <h5>Errores</h5><div class="jr-chips">${ERRS.map(t => chip('err', t, (i.errs || []).includes(t))).join('')}</div>
      <h5>Notas</h5><textarea data-jr-note rows="4" placeholder="¿Por qué entraste? ¿Qué harías distinto?">${esc(i.note || '')}</textarea>
      <div class="jr-dact">${H.go ? '<button type="button" data-jr-go>Ver en el gráfico</button>' : ''}<button type="button" class="dn" data-jr-del>Borrar del diario</button></div>`;
    d.querySelectorAll('[data-jr-img]').forEach(async f => { const k = f.dataset.jrImg; if (!k) { f.insertAdjacentHTML('afterbegin', '<div class="jr-noimg">Sin captura</div>'); return; } const v = await getImg(k); f.insertAdjacentHTML('afterbegin', v ? `<img src="${v}" alt="Gráfico ${f.textContent.toLowerCase()}" data-jr-zoom>` : '<div class="jr-noimg">Sin captura</div>'); });
  }
  function manual() {
    const d = ov.querySelector('.jr-det'); d.hidden = false; sel = null;
    const now = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    d.innerHTML = `<div class="jr-dh"><div><b>Agregar operación real</b><small>Para anotar lo que operaste en tu exchange</small></div><button type="button" class="jr-x" data-jr-detx aria-label="Cerrar">✕</button></div>
      <form class="jr-form" data-jr-form><label>Activo<input name="sym" value="${esc(H.sym())}" required></label><label>Lado<select name="side"><option value="1">Long</option><option value="-1">Short</option></select></label>
      <label>Entrada<input name="entry" inputmode="decimal" required></label><label>Salida<input name="exit" inputmode="decimal" required></label><label>Cantidad (monedas)<input name="qty" inputmode="decimal" required></label><label>Apalancamiento<input name="lev" inputmode="numeric" value="1"></label>
      <label>Stop (opcional)<input name="sl" inputmode="decimal"></label><label>Comisiones USD<input name="fees" inputmode="decimal" value="0"></label><label>Apertura<input name="t0" type="datetime-local" value="${now}"></label><label>Cierre<input name="t1" type="datetime-local" value="${now}"></label>
      <button type="submit" class="jr-save">Guardar en el diario</button></form>`;
  }
  const num = v => { const n = parseFloat(String(v || '').replace(',', '.')); return fin(n) ? n : NaN; };
  function onSubmit(e) {
    const f = e.target.closest('[data-jr-form]'); if (!f) return; e.preventDefault(); const q = Object.fromEntries(new FormData(f));
    const side = +q.side, entry = num(q.entry), exit = num(q.exit), qty = num(q.qty), sl = num(q.sl), fees = num(q.fees) || 0;
    if (!(entry > 0 && exit > 0 && qty > 0)) { H.toast('Escribe entrada, salida y cantidad'); return; }
    const pnl = (exit - entry) * qty * side - fees, risk = sl > 0 ? Math.abs(entry - sl) * qty : NaN, t0 = Date.parse(q.t0) || Date.now(), t1 = Date.parse(q.t1) || Date.now();
    J.items.unshift({id: uid(), src: 'manual', sym: String(q.sym || '').toUpperCase().trim() || H.sym(), side, qty, entry, exit, pnl, fees, lev: Math.max(1, +q.lev || 1), why: 'Manual', tOpen: Math.min(t0, t1), tClose: Math.max(t0, t1), sl: sl > 0 ? sl : null, tp: null, r: fin(risk) && risk > 0 ? pnl / risk : null, tags: [], note: '', mood: '', errs: [], imgO: '', imgC: ''});
    J.items.sort((a, b) => b.tClose - a.tClose); save(); render(); detail(J.items.find(x => x.pnl === pnl && x.entry === entry) || J.items[0]); H.toast('Operación guardada en el diario');
  }
  function csv() {
    const rows = [['Fecha cierre', 'Fecha apertura', 'Activo', 'Lado', 'Cantidad', 'Entrada', 'Salida', 'Stop', 'Objetivo', 'Apalancamiento', 'Resultado USD', 'Comisiones', 'R', 'Motivo', 'Origen', 'Etiquetas', 'Emoción', 'Errores', 'Nota']];
    for (const i of J.items) rows.push([new Date(i.tClose).toISOString(), new Date(i.tOpen).toISOString(), i.sym, i.side > 0 ? 'Long' : 'Short', i.qty, i.entry, i.exit, i.sl || '', i.tp || '', i.lev, i.pnl.toFixed(2), (i.fees || 0).toFixed(2), fin(i.r) ? i.r.toFixed(2) : '', i.why, i.src === 'manual' ? 'Real' : 'Demo', (i.tags || []).join(' | '), i.mood || '', (i.errs || []).join(' | '), i.note || '']);
    const txt = '﻿' + rows.map(r => r.map(v => /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], {type: 'text/csv'})); a.download = `diario-vortex-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function onClick(e) {
    const t = e.target;
    if (t.closest('[data-jr-close]') || t === ov) return close();
    const p = t.closest('[data-jr-per]'); if (p) { F.per = p.dataset.jrPer; render(); return; }
    const s = t.closest('[data-jr-side]'); if (s) { F.side = s.dataset.jrSide; render(); return; }
    const c = t.closest('[data-jr-cal]'); if (c) { const n = new Date(); const m = calM || new Date(n.getFullYear(), n.getMonth(), 1); calM = new Date(m.getFullYear(), m.getMonth() + +c.dataset.jrCal, 1); render(); return; }
    const o = t.closest('[data-jr-open]'); if (o) { const i = J.items.find(x => x.id === o.dataset.jrOpen); if (i) detail(i); return; }
    if (t.closest('[data-jr-add]')) return manual();
    if (t.closest('[data-jr-csv]')) return csv();
    if (t.closest('[data-jr-detx]')) { ov.querySelector('.jr-det').hidden = true; sel = null; return; }
    const z = t.closest('[data-jr-zoom]'); if (z) { const w = root.open(); if (w) w.document.write(`<title>Captura</title><body style="margin:0;background:#000"><img src="${z.src}" style="width:100%"></body>`); return; }
    if (!sel) return;
    const tg = t.closest('[data-jr-tag]'); if (tg) { const v = tg.dataset.jrTag; sel.tags = (sel.tags || []).includes(v) ? sel.tags.filter(x => x !== v) : [...(sel.tags || []), v]; save(); tg.classList.toggle('on'); render(); return; }
    if (t.closest('[data-jr-newtag]')) { const v = (root.prompt('Nombre de la etiqueta (setup):') || '').trim().slice(0, 24); if (v) { sel.tags = [...new Set([...(sel.tags || []), v])]; save(); render(); detail(sel); } return; }
    const md = t.closest('[data-jr-mood]'); if (md) { sel.mood = sel.mood === md.dataset.jrMood ? '' : md.dataset.jrMood; save(); detail(sel); return; }
    const er = t.closest('[data-jr-err]'); if (er) { const v = er.dataset.jrErr; sel.errs = (sel.errs || []).includes(v) ? sel.errs.filter(x => x !== v) : [...(sel.errs || []), v]; save(); er.classList.toggle('on'); render(); return; }
    if (t.closest('[data-jr-go]')) { const s0 = sel.sym; close(); if (H.go) H.go(s0); return; }
    if (t.closest('[data-jr-del]')) { if (!root.confirm('¿Borrar esta operación del diario?')) return; J.items = J.items.filter(x => x !== sel); if (sel.imgO && !J.items.some(x => x.imgO === sel.imgO)) delImg(sel.imgO); if (sel.imgC) delImg(sel.imgC); save(); ov.querySelector('.jr-det').hidden = true; sel = null; render(); }
  }
  function open() {
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'jr-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Diario de trading');
      ov.innerHTML = `<div class="jr-box0"><div class="jr-top"><div><small>VORTEX</small><h2>Diario de trading</h2><p>Tus operaciones de la cuenta demo se anotan solas, con captura del gráfico. Agrega tus operaciones reales a mano para medir todo junto.</p></div><div class="jr-acts"><button type="button" data-jr-add>+ Agregar operación</button><button type="button" data-jr-csv>Exportar CSV</button><button type="button" class="jr-x" data-jr-close aria-label="Cerrar">✕</button></div></div><div class="jr-body"></div><aside class="jr-det" hidden></aside></div>`;
      ov.addEventListener('click', onClick); ov.addEventListener('submit', onSubmit);
      ov.addEventListener('input', e => { if (e.target.matches('[data-jr-note]') && sel) { sel.note = e.target.value.slice(0, 4000); clearTimeout(ov._t); ov._t = setTimeout(() => { save(); }, 400); } });
      ov.addEventListener('change', e => { if (e.target.matches('[data-jr-ftag]')) { F.tag = e.target.value; render(); } });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov && !ov.hidden) { const d = ov.querySelector('.jr-det'); if (!d.hidden) { d.hidden = true; sel = null; } else close(); } });
      document.body.appendChild(ov);
    }
    ov.hidden = false; render();
  }
  function close() { if (!ov) return; save(); ov.hidden = true; if (sel) { ov.querySelector('.jr-det').hidden = true; sel = null; } }
  function bind(h) { Object.assign(H, h); }
  root.CCTJournal = {bind, sync, open, close, stats, items: () => J.items.slice()};
})(typeof self !== 'undefined' ? self : this);

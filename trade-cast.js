/* VORTEX · Trades a Discord (solo el desarrollador).
   Cada vez que entras en un trade (tu exchange conectado y/o la cuenta demo), VORTEX publica sola en el canal de Discord que elijas:
   la captura del gráfico (velas, indicadores y tus dibujos) con las líneas de entrada, stop loss y take profit, la moneda, la
   temporalidad, el apalancamiento, el R:R y una explicación breve con TUS indicadores: nube de 100, perfil de volumen, Fibonacci, soportes/resistencias, oscilador y money flow.
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
  /* Tus indicadores (no EMA 20/50 ni RSI): nube de 100 periodos, perfil de volumen, Fibonacci, soportes/resistencias, oscilador y money flow */
  function emaArr(v, n) { const k = 2 / (n + 1), o = []; let e = NaN; for (let i = 0; i < v.length; i++) { if (i === n - 1) e = v.slice(0, n).reduce((a, b) => a + b, 0) / n; else if (i >= n) e = v[i] * k + e * (1 - k); o.push(e); } return o; }
  function atr(cs, n) { let a = NaN; const o = []; for (let i = 0; i < cs.length; i++) { const p = i ? cs[i - 1].c : cs[i].o, tr = Math.max(cs[i].h - cs[i].l, Math.abs(cs[i].h - p), Math.abs(cs[i].l - p)); a = i < n ? (i ? (a * i + tr) / (i + 1) : tr) : (a * (n - 1) + tr) / n; o.push(a); } return o; }
  function cloud(cs, n = 100, mult = .6) { if (cs.length < n) return null; const e = emaArr(cs.map(x => x.c), n), a = atr(cs, n), i = cs.length - 1; return {mid: e[i], top: e[i] + a[i] * mult, bot: e[i] - a[i] * mult}; }
  function vprofile(cs, bins = 40) { // perfil de volumen de lo visible (hasta 200 velas): POC y área de valor (70 %)
    const v = cs.slice(-200); if (v.length < 30) return null; const lo = Math.min(...v.map(x => x.l)), hi = Math.max(...v.map(x => x.h)), st = (hi - lo) / bins; if (!(st > 0)) return null;
    const b = new Array(bins).fill(0); for (const x of v) { const a = Math.max(0, Math.floor((x.l - lo) / st)), z = Math.min(bins - 1, Math.floor((x.h - lo) / st)), each = (x.v || 0) / (z - a + 1); for (let k = a; k <= z; k++) b[k] += each; }
    const tot = b.reduce((s, x) => s + x, 0); if (!(tot > 0)) return null; let poc = 0; b.forEach((x, k) => { if (x > b[poc]) poc = k; });
    let L = poc, R = poc, acc = b[poc]; while (acc < tot * .7 && (L > 0 || R < bins - 1)) { const l = L > 0 ? b[L - 1] : -1, r = R < bins - 1 ? b[R + 1] : -1; if (r >= l) acc += b[++R]; else acc += b[--L]; }
    return {poc: lo + (poc + .5) * st, val: lo + L * st, vah: lo + (R + 1) * st};
  }
  function fibo(cs, look = 120) { // último impulso (máximo y mínimo de las últimas velas) y su nivel más cercano al precio
    const v = cs.slice(-look); if (v.length < 30) return null; let hi = 0, lo = 0; v.forEach((x, k) => { if (x.h > v[hi].h) hi = k; if (x.l < v[lo].l) lo = k; });
    const H = v[hi].h, L = v[lo].l, up = lo < hi, c = v[v.length - 1].c, R = [0.236, 0.382, 0.5, 0.618, 0.786];
    const lv = R.map(r => ({r, p: up ? H - (H - L) * r : L + (H - L) * r})); let best = lv[0]; for (const x of lv) if (Math.abs(x.p - c) < Math.abs(best.p - c)) best = x;
    return {up, best, dist: Math.abs(best.p - c) / c * 100, above: c >= best.p};
  }
  function sr(cs, extra) { // soporte y resistencia más cercanos: tus líneas horizontales + pivotes (fractales de 5 velas)
    const v = cs.slice(-150), c = cs[cs.length - 1].c, lv = (extra || []).filter(p => p > 0).slice();
    for (let i = 2; i < v.length - 2; i++) { const x = v[i]; if (x.h >= v[i - 1].h && x.h >= v[i - 2].h && x.h >= v[i + 1].h && x.h >= v[i + 2].h) lv.push(x.h); if (x.l <= v[i - 1].l && x.l <= v[i - 2].l && x.l <= v[i + 1].l && x.l <= v[i + 2].l) lv.push(x.l); }
    const near = c * .0015, sup = lv.filter(p => p < c - near).sort((a, b) => b - a)[0], res = lv.filter(p => p > c + near).sort((a, b) => a - b)[0];
    return {sup, res, c};
  }
  function osc(cs) { // oscilador tipo WaveTrend (10, 21) y money flow ((cierre − apertura) / rango, media 60)
    if (cs.length < 70) return null; const ap = cs.map(x => (x.h + x.l + x.c) / 3), esa = emaArr(ap, 10), d = emaArr(ap.map((x, i) => Math.abs(x - esa[i])).map(x => (Number.isFinite(x) ? x : 0)), 10);
    const ci = ap.map((x, i) => d[i] ? (x - esa[i]) / (0.015 * d[i]) : 0), wt1 = emaArr(ci.map(x => (Number.isFinite(x) ? x : 0)), 21), i = cs.length - 1, wt2 = wt1.slice(i - 3, i + 1).reduce((a, b) => a + b, 0) / 4;
    const mfv = cs.slice(-60).map(x => (x.h - x.l) > 0 ? (x.c - x.o) / (x.h - x.l) * 150 : 0), mf = mfv.reduce((a, b) => a + b, 0) / mfv.length;
    return {wt: wt1[i], wt2, mf};
  }
  function explain(cs, tr, lvls) {
    const out = []; if (!cs || cs.length < 30) return out;
    const c = cs[cs.length - 1].c, long = tr.side > 0, f = v => (Math.abs(v) >= 1000 ? v.toLocaleString('en-US', {maximumFractionDigits: 1}) : +v.toPrecision(6)), pc = v => ((v - c) / c * 100);
    const cl = cloud(cs); let side = 0;
    if (cl) { if (c > cl.top) { side = 1; out.push('Precio **por encima de la nube de 100 periodos**: sesgo alcista.'); } else if (c < cl.bot) { side = -1; out.push('Precio **por debajo de la nube de 100 periodos**: sesgo bajista.'); } else out.push('Precio **dentro de la nube de 100 periodos**: zona de indecisión.'); }
    const vp = vprofile(cs); if (vp) out.push(c > vp.poc ? `Perfil de volumen: el precio está **por encima del POC** (${f(vp.poc)}), la zona de más volumen queda como soporte.` : `Perfil de volumen: el precio está **por debajo del POC** (${f(vp.poc)}), la zona de más volumen queda como resistencia.`);
    const fb = fibo(cs); if (fb) out.push(fb.dist <= 0.6 ? `Fibonacci: precio sobre el **${fb.best.r}** (${f(fb.best.p)}) del último impulso ${fb.up ? 'alcista' : 'bajista'}.` : `Fibonacci: el nivel más cercano es el **${fb.best.r}** (${f(fb.best.p)}), ${fb.above ? 'debajo' : 'arriba'} del precio.`);
    const s = sr(cs, lvls); if (s.sup || s.res) out.push([s.sup ? `Soporte en ${f(s.sup)} (${pc(s.sup).toFixed(2)} %)` : '', s.res ? `resistencia en ${f(s.res)} (+${pc(s.res).toFixed(2)} %)` : ''].filter(Boolean).join(' · ') + '.');
    const o = osc(cs); if (o && Number.isFinite(o.wt)) {
      out.push(o.wt >= 53 ? 'Oscilador en **sobrecompra**.' : o.wt <= -53 ? 'Oscilador en **sobreventa**.' : `Oscilador neutral, ${o.wt >= o.wt2 ? 'girando al alza' : 'girando a la baja'}.`);
      out.push(`Money flow **${o.mf >= 0 ? 'alcista' : 'bajista'}**.`);
    }
    if (side) out.push(side === (long ? 1 : -1) ? 'Entrada a favor de la nube.' : 'Entrada contra la nube: operación de rebote, con más riesgo.');
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
    const desc = [(info.why || []).map(x => '• ' + x).join('\n'), C.note ? '\n' + C.note : ''].join('').trim();
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
  function mini(cs, marks, fmt) { // gráfico propio: últimas 90 velas, nube de 100, POC del perfil de volumen y niveles
    const W = 1200, Hh = 620, pad = {l: 14, r: 92, t: 16, b: 26}, v = cs.slice(-90), o = document.createElement('canvas'); o.width = W; o.height = Hh; const g = o.getContext('2d');
    g.fillStyle = '#0b0e11'; g.fillRect(0, 0, W, Hh);
    let lo = Math.min(...v.map(x => x.l), ...marks.map(m => m.p)), hi = Math.max(...v.map(x => x.h), ...marks.map(m => m.p)); const sp = (hi - lo) || hi * .01; lo -= sp * .06; hi += sp * .06;
    const pw = W - pad.l - pad.r, ph = Hh - pad.t - pad.b, X = i => pad.l + (i + .5) * pw / v.length, Yy = p => pad.t + (hi - p) / (hi - lo) * ph, bw = Math.max(2, pw / v.length * .64);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '12px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
    for (let k = 0; k <= 5; k++) { const p = lo + (hi - lo) * k / 5, y = Yy(p); g.beginPath(); g.moveTo(pad.l, y); g.lineTo(W - pad.r, y); g.stroke(); g.fillText(fmt(p), W - pad.r + 8, y); }
    v.forEach((x, i) => { const up = x.c >= x.o, col = up ? '#20bf9f' : '#f06b79'; g.strokeStyle = col; g.fillStyle = col; g.beginPath(); g.moveTo(X(i), Yy(x.h)); g.lineTo(X(i), Yy(x.l)); g.stroke(); const y1 = Yy(Math.max(x.o, x.c)), y2 = Yy(Math.min(x.o, x.c)); g.fillRect(X(i) - bw / 2, y1, bw, Math.max(1, y2 - y1)); });
    if (cs.length >= 100) { const e = emaArr(cs.map(x => x.c), 100), a = atr(cs, 100), off = cs.length - v.length, top = [], bot = []; for (let j = 0; j < v.length; j++) { const i = j + off; if (Number.isFinite(e[i])) { top.push([X(j), Yy(e[i] + a[i] * .6)]); bot.push([X(j), Yy(e[i] - a[i] * .6)]); } } // nube de 100 periodos
      if (top.length > 1) { const up = v[v.length - 1].c >= e[cs.length - 1]; g.fillStyle = up ? 'rgba(32,191,159,.16)' : 'rgba(240,107,121,.16)'; g.beginPath(); top.forEach(([a1, b1], q) => q ? g.lineTo(a1, b1) : g.moveTo(a1, b1)); bot.slice().reverse().forEach(([a1, b1]) => g.lineTo(a1, b1)); g.closePath(); g.fill(); } }
    { const vp = vprofile(cs); if (vp) { g.strokeStyle = 'rgba(240,185,11,.85)'; g.lineWidth = 1.4; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(pad.l, Yy(vp.poc)); g.lineTo(W - pad.r, Yy(vp.poc)); g.stroke(); g.setLineDash([]); g.fillStyle = 'rgba(240,185,11,.9)'; g.font = '600 11px Inter, system-ui, sans-serif'; g.fillText('POC', W - pad.r - 30, Yy(vp.poc) - 8); } } // perfil de volumen
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
    const info = {pair: h.pair(tr.key), tf, fmt: h.fmt, why: explain(cs, tr, h.levels ? h.levels(tr.key) : [])};
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
  W.CCTTradeCast = {explain, cloud, vprofile, fibo, sr, osc, rr, payload, marksOf, send, active, observe: (s, l) => observe(s, l)};
  if (typeof module === 'object' && module.exports) module.exports = W.CCTTradeCast;
  else if (document.readyState === 'complete') boot(); else addEventListener('load', boot);
})();

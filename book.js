/* VORTEX · Profundidad del libro de órdenes (Binance, datos públicos).
   Panel con compras/ventas agrupadas, spread, desequilibrio, curva de profundidad y muros;
   y barras de profundidad sobre el gráfico (las dibuja app.js con CCTBook.levels()). */
(function (root) {
  'use strict';
  const PROXY = 'https://vortex-push.soobroon.workers.dev/mkt?u=', LSU = 'cct_book_ui_v1';
  const fin = Number.isFinite;
  let H = {sym: () => '', src: () => 'binance', fmt: v => String(v), render: () => {}, toast: () => {}, base: s => s};
  let ui = Object.assign({open: false, overlay: false, step: 0, rows: 14}, (() => { try { return JSON.parse(localStorage.getItem(LSU) || '{}') || {}; } catch { return {}; } })());
  let book = null, bookSym = '', timer = 0, busy = false, viaProxy = false, panel = null, err = '', lastOk = 0;
  const saveUi = () => { try { const {open, overlay, step, rows} = ui; localStorage.setItem(LSU, JSON.stringify({open, overlay, step, rows})); } catch {} };

  // símbolo y mercado de Binance para el activo del gráfico (los futuros si el gráfico es de futuros)
  const CRYPTO = new Set(['binance', 'binancef', 'bybit', 'bybitf', 'okx', 'okxf', 'coinbase', 'bingx', 'bingxf', 'kucoin', 'gate', 'mexc', 'bitget', 'htx', 'kraken']);
  function target() {
    const src = H.src(); if (!CRYPTO.has(src)) return null;
    const [b, q] = H.split(H.sym()); if (!b) return null; const qq = q === 'USD' || !q ? 'USDT' : q;
    const s = String(b).replace(/[^A-Z0-9]/gi, '').toUpperCase() + qq, fut = /f$/.test(src);
    return {s, fut, url: fut ? `https://fapi.binance.com/fapi/v1/depth?symbol=${s}&limit=1000` : `https://api.binance.com/api/v3/depth?symbol=${s}&limit=1000`, label: (fut ? 'Binance Futuros' : 'Binance Spot') + (src === 'binance' || src === 'binancef' ? '' : ' (referencia)')};
  }
  async function get(url) {
    const one = async u => { const c = new AbortController(), to = setTimeout(() => c.abort(), 8000); try { const r = await fetch(u, {signal: c.signal}); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(to); } };
    if (!viaProxy) try { return await one(url); } catch (e) { if (/HTTP 4\d\d/.test(e.message)) throw e; viaProxy = true; }
    return one(PROXY + encodeURIComponent(url));
  }
  async function poll() {
    if (busy || document.hidden || !(ui.open || ui.overlay)) return; const T = target();
    if (!T) { book = null; err = 'Este activo no tiene libro de órdenes en Binance.'; renderPanel(); return; }
    busy = true;
    try {
      const d = await get(T.url); const bids = (d.bids || []).map(x => [+x[0], +x[1]]), asks = (d.asks || []).map(x => [+x[0], +x[1]]);
      if (!bids.length || !asks.length) throw new Error('vacío');
      book = {bids, asks, sym: T.s, label: T.label, at: Date.now()}; bookSym = H.sym(); err = ''; lastOk = Date.now();
    } catch (e) { err = /HTTP 400/.test(e.message) ? 'Este activo no tiene libro de órdenes en Binance.' : 'No se pudo leer el libro ahora; reintentando…'; if (/HTTP 400/.test(e.message)) book = null; }
    busy = false; if (overlayOn()) H.render(); renderPanel();
  }
  function schedule() { clearInterval(timer); timer = setInterval(poll, 2500); poll(); }

  // tamaño del grupo: un número redondo cerca del 0.02 % del precio
  function autoStep(p) { if (!(p > 0)) return 1; const raw = p * .0002, e = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / e; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e; }
  const stepNow = () => { const mid = book ? (book.bids[0][0] + book.asks[0][0]) / 2 : NaN; return ui.step > 0 ? ui.step : autoStep(mid); };
  function group(side, step) { // side: 'bids' o 'asks' → [[precio, cantidad]] agrupado
    if (!book) return []; const m = new Map(), up = side === 'asks';
    for (const [p, q] of book[side]) { const k = +((up ? Math.ceil(p / step - 1e-9) : Math.floor(p / step + 1e-9)) * step).toPrecision(12); m.set(k, (m.get(k) || 0) + q); }
    return [...m.entries()].sort((a, b) => up ? a[0] - b[0] : b[0] - a[0]);
  }
  function stats() {
    if (!book) return null; const bb = book.bids[0][0], ba = book.asks[0][0], mid = (bb + ba) / 2;
    const near = (arr, lim) => arr.reduce((s, [p, q]) => Math.abs(p - mid) / mid <= lim ? s + p * q : s, 0);
    const b1 = near(book.bids, .01), a1 = near(book.asks, .01);
    return {bb, ba, mid, spread: ba - bb, spreadPct: (ba - bb) / mid * 100, bid1: b1, ask1: a1, imb: b1 + a1 > 0 ? (b1 - a1) / (b1 + a1) * 100 : 0};
  }
  // niveles para el gráfico entre dos precios, agrupados en n franjas
  function levels(lo, hi, n) {
    if (!book || !overlayOn() || bookSym !== H.sym() || Date.now() - lastOk > 30e3 || !(hi > lo)) return null;
    const step = (hi - lo) / n, bins = new Array(n).fill(0), side = new Array(n).fill(0);
    for (const [p, q] of book.bids) { if (p < lo || p > hi) continue; const i = Math.min(n - 1, Math.floor((p - lo) / step)); bins[i] += q * p; side[i] = 1; }
    for (const [p, q] of book.asks) { if (p < lo || p > hi) continue; const i = Math.min(n - 1, Math.floor((p - lo) / step)); bins[i] += q * p; side[i] = side[i] === 1 ? 1 : -1; }
    let mx = 0, sum = 0, cnt = 0; for (const v of bins) { if (v > 0) { mx = Math.max(mx, v); sum += v; cnt++; } }
    const avg = cnt ? sum / cnt : 0;
    return {step, lo, max: mx, bins: bins.map((v, i) => ({p: lo + (i + .5) * step, v, side: side[i], wall: v > 0 && v >= avg * 3.5 && v >= mx * .45}))};
  }

  /* ───────── panel ───────── */
  const usdK = v => !fin(v) ? '—' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + ' mil M' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + ' M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + ' K' : '$' + v.toFixed(0);
  const qf = q => q >= 1e6 ? (q / 1e6).toFixed(2) + 'M' : q >= 1e3 ? (q / 1e3).toFixed(2) + 'K' : q >= 100 ? q.toFixed(1) : q >= 1 ? q.toFixed(3) : q.toPrecision(3);
  function shell() {
    panel = document.createElement('div'); panel.className = 'bk-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Libro de órdenes');
    panel.innerHTML = `<div class="bk-head"><div><b>Libro de órdenes</b><small data-bk-src></small></div><button type="button" class="bk-x" data-bk-close aria-label="Cerrar">✕</button></div>
      <div class="bk-tools"><label>Agrupar <select data-bk-step></select></label><label class="bk-ov"><input type="checkbox" data-bk-ov> En el gráfico</label></div>
      <div class="bk-imb" data-bk-imb></div><svg class="bk-depth" data-bk-depth viewBox="0 0 280 70" preserveAspectRatio="none" aria-hidden="true"></svg>
      <div class="bk-cols"><span>Precio</span><span>Cantidad</span><span>Total</span></div>
      <div class="bk-asks" data-bk-asks></div><div class="bk-mid" data-bk-mid></div><div class="bk-bids" data-bk-bids></div>
      <p class="bk-note">Toca un nivel para preparar una orden en ese precio. ★ = muro (mucha liquidez junta).</p>`;
    (document.getElementById('chartArea') || document.body).appendChild(panel);
    panel.addEventListener('pointerdown', e => e.stopPropagation()); panel.addEventListener('wheel', e => e.stopPropagation(), {passive: true});
    panel.addEventListener('click', e => {
      if (e.target.closest('[data-bk-close]')) return toggle(false);
      const r = e.target.closest('[data-bk-p]'); if (r && root.CCTTrade) { CCTTrade.at(r.dataset.bkS === 'a' ? -1 : 1, +r.dataset.bkP); }
    });
    panel.addEventListener('change', e => {
      if (e.target.matches('[data-bk-step]')) { ui.step = +e.target.value || 0; saveUi(); renderPanel(); }
      if (e.target.matches('[data-bk-ov]')) { ui.overlay = e.target.checked; saveUi(); H.render(); if (ui.overlay) schedule(); else if (!ui.open) clearInterval(timer); H.toast(ui.overlay ? 'La profundidad queda en el gráfico aunque cierres el libro' : 'Profundidad quitada del gráfico'); }
    });
  }
  function renderPanel() {
    if (!panel || panel.hidden) return;
    const $ = s => panel.querySelector(s), T = target();
    $('[data-bk-src]').textContent = book ? `${H.base(H.sym())} · ${book.label}` : (T ? T.label : '');
    $('[data-bk-ov]').checked = !!ui.overlay;
    if (!book || bookSym !== H.sym()) { $('[data-bk-asks]').innerHTML = ''; $('[data-bk-bids]').innerHTML = ''; $('[data-bk-imb]').innerHTML = ''; $('[data-bk-depth]').innerHTML = ''; $('[data-bk-mid]').innerHTML = `<span class="bk-msg">${err || 'Cargando libro…'}</span>`; return; }
    const st = stats(), step = stepNow(), a0 = autoStep(st.mid), opts = [0, a0 / 10, a0 / 2, a0, a0 * 5, a0 * 10, a0 * 50].map(v => v && +v.toPrecision(6));
    const sel = $('[data-bk-step]'); const key = opts.join(); if (sel.dataset.k !== key) { sel.dataset.k = key; sel.innerHTML = opts.map(v => `<option value="${v}">${v ? H.fmt(v).replace(/^\$/, '') : 'Auto (' + H.fmt(a0).replace(/^\$/, '') + ')'}</option>`).join(''); } sel.value = String(ui.step && opts.includes(ui.step) ? ui.step : 0);
    const N = ui.rows, asks = group('asks', step).slice(0, N), bids = group('bids', step).slice(0, N);
    const all = [...asks, ...bids].map(x => x[1]), mx = Math.max(...all, 1e-12), avg = all.reduce((s, v) => s + v, 0) / (all.length || 1);
    const row = (p, q, tot, s) => `<button type="button" class="bk-row ${s}${q >= avg * 3 && q >= mx * .5 ? ' wall' : ''}" data-bk-p="${p}" data-bk-s="${s}"><i style="width:${(q / mx * 100).toFixed(1)}%"></i><span>${H.fmt(p)}</span><span>${qf(q)}${q >= avg * 3 && q >= mx * .5 ? ' ★' : ''}</span><span>${usdK(tot)}</span></button>`;
    let ca = 0; const ar = asks.map(([p, q]) => { ca += p * q; return [p, q, ca]; }); let cb = 0; const br = bids.map(([p, q]) => { cb += p * q; return [p, q, cb]; });
    $('[data-bk-asks]').innerHTML = ar.reverse().map(x => row(x[0], x[1], x[2], 'a')).join('');
    $('[data-bk-bids]').innerHTML = br.map(x => row(x[0], x[1], x[2], 'b')).join('');
    $('[data-bk-mid]').innerHTML = `<b>${H.fmt(st.mid)}</b><span>Spread ${H.fmt(st.spread)} · ${st.spreadPct.toFixed(3)}%</span>`;
    const bp = 50 + st.imb / 2;
    $('[data-bk-imb]').innerHTML = `<div class="bk-imbbar"><i style="width:${bp.toFixed(1)}%"></i></div><div class="bk-imbt"><span class="up">Compras ${usdK(st.bid1)}</span><b class="${st.imb >= 0 ? 'up' : 'dn'}">${st.imb >= 0 ? '+' : ''}${st.imb.toFixed(1)}%</b><span class="dn">${usdK(st.ask1)} Ventas</span></div><small>Liquidez a ±1 % del precio</small>`;
    // curva de profundidad acumulada (±1 %)
    const W = 280, Hh = 70, lo = st.mid * .99, hi = st.mid * 1.01, X = p => (p - lo) / (hi - lo) * W;
    const cum = (arr, dir) => { let s = 0; const pts = []; for (const [p, q] of arr) { if (dir < 0 ? p < lo : p > hi) break; s += p * q; pts.push([p, s]); } return pts; };
    const cb2 = cum(book.bids, -1), ca2 = cum(book.asks, 1), top = Math.max(cb2.length ? cb2[cb2.length - 1][1] : 0, ca2.length ? ca2[ca2.length - 1][1] : 0, 1), Y = v => Hh - 2 - v / top * (Hh - 6);
    const path = (pts, x0) => pts.length ? `M${X(x0).toFixed(1)},${Hh} ` + pts.map(([p, v]) => `L${X(p).toFixed(1)},${Y(v).toFixed(1)}`).join(' ') + ` L${X(pts[pts.length - 1][0]).toFixed(1)},${Hh} Z` : '';
    $('[data-bk-depth]').innerHTML = `<path d="${path(cb2, st.bb)}" fill="rgba(32,191,159,.22)" stroke="#20bf9f" stroke-width="1.2"/><path d="${path(ca2, st.ba)}" fill="rgba(240,107,121,.2)" stroke="#f06b79" stroke-width="1.2"/><line x1="${W / 2}" x2="${W / 2}" y1="0" y2="${Hh}" stroke="rgba(255,255,255,.25)" stroke-dasharray="2 3"/>`;
  }
  function toggle(on) {
    if (!panel) shell(); ui.open = on == null ? panel.hidden : !!on; panel.hidden = !ui.open; saveUi();
    const b = document.getElementById('bookBtn'); if (b) { b.classList.toggle('on', ui.open); b.setAttribute('aria-pressed', ui.open); }
    if (ui.open) { schedule(); renderPanel(); } else if (!ui.overlay) clearInterval(timer);
    H.render();
  }
  function bind(h) { Object.assign(H, h); if (ui.open) setTimeout(() => toggle(true), 0); else if (ui.overlay) setTimeout(schedule, 1500); document.addEventListener('visibilitychange', () => { if (!document.hidden && (ui.open || ui.overlay)) poll(); }); }
  function symChanged() { book = null; err = ''; if (panel && !panel.hidden) { renderPanel(); poll(); } else H.render(); }
  const overlayOn = () => !!ui.overlay;
  const api = {bind, toggle, levels, symChanged, overlayOn, stats, group, autoStep, isOpen: () => !!(panel && !panel.hidden), _set: b => { book = b; bookSym = H.sym(); lastOk = Date.now(); }};
  root.CCTBook = api;
})(typeof self !== 'undefined' ? self : this);

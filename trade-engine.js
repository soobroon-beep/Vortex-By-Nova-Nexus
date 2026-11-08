/* Motor de la cuenta demo de VORTEX (funciones puras, se prueban aparte).
   Futuros perpetuos USDT en modo neto (una posición por activo), margen aislado, comisiones de BingX
   (0.02 % límite · 0.05 % mercado), órdenes Límite y Stop, TP/SL por posición y liquidación aproximada. */
(function (root) {
  'use strict';
  const MMR = 0.005, FEE_MK = 0.0002, FEE_TK = 0.0005, MAX_HIST = 200;
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const fin = Number.isFinite;
  const r8 = v => +(+v).toPrecision(10);

  function newAcct(start) { const s = start > 0 ? +start : 10000; return {v: 1, start: s, bal: s, pos: [], ord: [], hist: []}; }
  function san(a) {
    if (!a || typeof a !== 'object' || !(a.start > 0) || !fin(a.bal)) return newAcct();
    const okP = p => p && typeof p.sym === 'string' && (p.side === 1 || p.side === -1) && p.qty > 0 && p.entry > 0 && p.lev >= 1;
    const okO = o => o && typeof o.sym === 'string' && (o.side === 1 || o.side === -1) && o.qty > 0 && o.price > 0 && (o.type === 'limit' || o.type === 'stop');
    return {v: 1, start: +a.start, bal: +a.bal, pos: (a.pos || []).filter(okP).slice(0, 50), ord: (a.ord || []).filter(okO).slice(0, 100), hist: (a.hist || []).filter(h => h && h.sym).slice(0, MAX_HIST)};
  }
  const liqOf = (side, entry, lev) => side > 0 ? entry * (1 - 1 / lev + MMR) : entry * (1 + 1 / lev - MMR);
  const margin = p => p.qty * p.entry / p.lev;
  const upnl = (p, px) => (px - p.entry) * p.qty * p.side;
  const usedMargin = a => a.pos.reduce((s, p) => s + margin(p), 0) + a.ord.reduce((s, o) => s + o.qty * o.price / o.lev, 0);
  function equity(a, priceOf) { let e = a.bal; for (const p of a.pos) { const px = priceOf(p.sym); if (fin(px)) e += upnl(p, px); } return e; }
  const available = (a, priceOf) => equity(a, priceOf) - usedMargin(a);

  function record(a, h) { a.hist.unshift(Object.assign({id: uid('h'), t: Date.now()}, h)); if (a.hist.length > MAX_HIST) a.hist.length = MAX_HIST; }

  // abre, suma, reduce o voltea la posición del activo (modo neto)
  function fill(a, sym, side, qty, price, lev, fee, extra, ev) {
    const cost = qty * price * fee; a.bal -= cost;
    let p = a.pos.find(x => x.sym === sym);
    if (!p) { p = {id: uid('p'), sym, side, qty, entry: price, lev, t: Date.now(), fees: cost, tp: extra.tp || null, sl: extra.sl || null}; p.liq = liqOf(side, price, lev); a.pos.push(p); ev.push({k: 'open', sym, side, qty, price}); return; }
    if (p.side === side) {
      const q = p.qty + qty; p.entry = (p.entry * p.qty + price * qty) / q; p.qty = q; p.fees = (p.fees || 0) + cost; if (extra.tp) p.tp = extra.tp; if (extra.sl) p.sl = extra.sl; p.liq = liqOf(p.side, p.entry, p.lev);
      ev.push({k: 'add', sym, side, qty, price}); return;
    }
    const closeQ = Math.min(p.qty, qty), pnl = (price - p.entry) * closeQ * p.side; a.bal += pnl;
    record(a, {sym, side: p.side, qty: closeQ, entry: p.entry, exit: price, pnl, fees: (p.fees || 0) * closeQ / p.qty + cost, lev: p.lev, why: extra.why || 'Orden opuesta', open: p.t});
    ev.push({k: 'close', sym, side: p.side, qty: closeQ, price, pnl, why: extra.why || 'Orden opuesta'});
    if (closeQ < p.qty - 1e-12) { p.fees = (p.fees || 0) * (1 - closeQ / p.qty); p.qty = r8(p.qty - closeQ); return; }
    a.pos = a.pos.filter(x => x !== p);
    const rest = qty - closeQ; if (rest > 1e-12) fill(a, sym, side, rest, price, lev, 0, {tp: extra.tp, sl: extra.sl}, ev);
  }

  // valida y coloca una orden: type 'market' | 'limit' | 'stop'
  function place(a, o, priceOf) {
    const px = priceOf(o.sym), side = o.side > 0 ? 1 : -1, lev = Math.max(1, Math.min(125, Math.round(+o.lev || 1))), qty = +o.qty;
    if (!(qty > 0)) return {error: 'Escribe la cantidad'};
    if (!fin(px)) return {error: 'Todavía no hay precio de este activo'};
    const type = o.type === 'limit' || o.type === 'stop' ? o.type : 'market', price = type === 'market' ? px : +o.price;
    if (!(price > 0)) return {error: 'Escribe el precio de la orden'};
    const cur = a.pos.find(x => x.sym === o.sym), reducing = cur && cur.side !== side;
    const need = (reducing ? Math.max(0, qty - cur.qty) : qty) * price / lev, avail = available(a, priceOf);
    if (need > avail + 1e-9) return {error: `Margen insuficiente: necesitas ${need.toFixed(2)} USDT y tienes ${Math.max(0, avail).toFixed(2)} disponibles`};
    const tp = +o.tp > 0 ? +o.tp : null, sl = +o.sl > 0 ? +o.sl : null;
    if (tp && (side > 0 ? tp <= price : tp >= price)) return {error: side > 0 ? 'En un Long el TP va arriba de la entrada' : 'En un Short el TP va debajo de la entrada'};
    if (sl && (side > 0 ? sl >= price : sl <= price)) return {error: side > 0 ? 'En un Long el SL va debajo de la entrada' : 'En un Short el SL va arriba de la entrada'};
    if (type === 'limit' && (side > 0 ? price > px : price < px)) return {error: side > 0 ? 'Una compra límite va por debajo del precio actual (usa Stop para comprar más arriba)' : 'Una venta límite va por encima del precio actual (usa Stop para vender más abajo)'};
    if (type === 'stop' && (side > 0 ? price < px : price > px)) return {error: side > 0 ? 'Una compra stop va por encima del precio actual' : 'Una venta stop va por debajo del precio actual'};
    const ev = [];
    if (type === 'market') { fill(a, o.sym, side, qty, price, lev, FEE_TK, {tp, sl}, ev); return {ok: true, ev}; }
    const ord = {id: uid('o'), sym: o.sym, side, type, qty, price, lev, tp, sl, t: Date.now()}; a.ord.push(ord);
    return {ok: true, ord, ev: [{k: 'placed', sym: o.sym, side, qty, price, type}]};
  }

  // el precio se movió: ejecuta órdenes, TP/SL y liquidaciones. lo/hi = rango visto desde el último tick
  function tick(a, sym, lo, hi, last) {
    const ev = []; if (!(lo > 0) || !(hi > 0)) return ev; if (!(last > 0)) last = hi;
    for (const o of a.ord.slice()) {
      if (o.sym !== sym) continue;
      const hit = o.type === 'limit' ? (o.side > 0 ? lo <= o.price : hi >= o.price) : (o.side > 0 ? hi >= o.price : lo <= o.price);
      if (!hit) continue; a.ord = a.ord.filter(x => x !== o);
      fill(a, sym, o.side, o.qty, o.price, o.lev, o.type === 'limit' ? FEE_MK : FEE_TK, {tp: o.tp, sl: o.sl, why: 'Orden ' + (o.type === 'limit' ? 'límite' : 'stop')}, ev);
      ev.push({k: 'filled', sym, side: o.side, qty: o.qty, price: o.price, type: o.type});
    }
    const p = a.pos.find(x => x.sym === sym); if (!p) return ev;
    const L = p.side > 0;
    // el peor caso primero: liquidación, luego SL, luego TP
    const liqHit = L ? lo <= p.liq : hi >= p.liq, slHit = p.sl && (L ? lo <= p.sl : hi >= p.sl), tpHit = p.tp && (L ? hi >= p.tp : lo <= p.tp);
    if (liqHit && (!slHit || (L ? p.liq >= p.sl : p.liq <= p.sl))) {
      const loss = margin(p); a.bal -= loss; a.pos = a.pos.filter(x => x !== p);
      record(a, {sym, side: p.side, qty: p.qty, entry: p.entry, exit: p.liq, pnl: -loss, fees: p.fees || 0, lev: p.lev, why: 'Liquidación', open: p.t});
      ev.push({k: 'liq', sym, side: p.side, qty: p.qty, price: p.liq, pnl: -loss});
    } else if (slHit) fill(a, sym, -p.side, p.qty, p.sl, p.lev, FEE_TK, {why: 'Stop loss'}, ev);
    else if (tpHit) fill(a, sym, -p.side, p.qty, p.tp, p.lev, FEE_MK, {why: 'Take profit'}, ev);
    return ev;
  }

  function closePos(a, id, price, frac) {
    const p = a.pos.find(x => x.id === id); if (!p || !(price > 0)) return [];
    const q = frac > 0 && frac < 1 ? r8(p.qty * frac) : p.qty, ev = [];
    fill(a, p.sym, -p.side, q, price, p.lev, FEE_TK, {why: 'Cierre manual'}, ev); return ev;
  }
  const cancel = (a, id) => { const n = a.ord.length; a.ord = a.ord.filter(o => o.id !== id); return a.ord.length < n; };

  // mover desde el gráfico: precio de una orden, TP o SL
  function move(a, id, kind, price, last) {
    if (!(price > 0)) return {error: 'Precio inválido'};
    if (kind === 'ord') {
      const o = a.ord.find(x => x.id === id); if (!o) return {error: 'La orden ya no existe'};
      if (fin(last)) { const below = price < last; o.type = o.side > 0 ? (below ? 'limit' : 'stop') : (below ? 'stop' : 'limit'); }
      if (o.tp && (o.side > 0 ? o.tp <= price : o.tp >= price)) o.tp = null;
      if (o.sl && (o.side > 0 ? o.sl >= price : o.sl <= price)) o.sl = null;
      o.price = price; return {ok: true};
    }
    const isO = id[0] === 'o', x = isO ? a.ord.find(y => y.id === id) : a.pos.find(y => y.id === id); if (!x) return {error: 'Ya no existe'};
    const ref = isO ? x.price : (fin(last) ? last : x.entry);
    if (kind === 'tp') { if (x.side > 0 ? price <= ref : price >= ref) return {error: x.side > 0 ? 'El TP de un Long va por encima del precio' : 'El TP de un Short va por debajo del precio'}; x.tp = price; return {ok: true}; }
    if (kind === 'sl') { if (x.side > 0 ? price >= ref : price <= ref) return {error: x.side > 0 ? 'El SL de un Long va por debajo del precio' : 'El SL de un Short va por encima del precio'}; if (!isO && (x.side > 0 ? price <= x.liq : price >= x.liq)) return {error: 'Ese SL queda después de tu liquidación'}; x.sl = price; return {ok: true}; }
    return {error: 'No se puede mover'};
  }
  function setTpSl(a, id, tp, sl) { const x = a.pos.find(y => y.id === id) || a.ord.find(y => y.id === id); if (!x) return false; if (tp !== undefined) x.tp = tp > 0 ? tp : null; if (sl !== undefined) x.sl = sl > 0 ? sl : null; return true; }

  function stats(a) {
    const h = a.hist; let w = 0, gp = 0, gl = 0; for (const x of h) { if (x.pnl > 0) { w++; gp += x.pnl; } else gl -= x.pnl; }
    return {n: h.length, win: h.length ? w / h.length * 100 : null, pf: gl > 0 ? gp / gl : (gp > 0 ? Infinity : null), net: a.bal - a.start};
  }

  const api = {newAcct, san, place, tick, closePos, cancel, move, setTpSl, equity, available, upnl, margin, liqOf, stats, FEE_MK, FEE_TK, MMR};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTTradeEngine = api;
})(typeof self !== 'undefined' ? self : this);

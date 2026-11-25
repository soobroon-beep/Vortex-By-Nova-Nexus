/* VORTEX · Liquidaciones reales en vivo (Binance Futures, flujo público «forceOrder»).
   Cada orden de liquidación que publica Binance llega aquí: precio, lado y tamaño en USD. El mapa de calor las dibuja como burbujas
   (rojo = largos liquidados, verde = cortos liquidados) y suma lo liquidado de la última hora. Solo se conecta mientras el mapa está encendido. */
(function (root) {
  'use strict';
  const WS = 'wss://fstream.binance.com/ws/', MAX = 1500, KEEP = 864e5; // hasta 1 500 eventos o 24 h por moneda
  const ev = {}, listeners = []; let sock = null, cur = '', retry = 0, timer = 0, emitT = 0;
  const emit = () => { clearTimeout(emitT); emitT = setTimeout(() => { for (const f of listeners) try { f(cur); } catch {} }, 120); };
  function parse(msg) { // {e:'forceOrder', o:{s, S:'SELL'|'BUY', ap, p, z, q, T}}
    const o = msg && msg.o; if (!o || !o.s) return null;
    const p = +o.ap || +o.p, q = +o.z || +o.q, t = +o.T || Date.now();
    if (!(p > 0) || !(q > 0)) return null;
    return {sym: o.s, t, p, usd: p * q, long: o.S === 'SELL'}; // venta forzada = se liquidó un largo
  }
  function add(e) {
    const a = ev[e.sym] || (ev[e.sym] = []); a.push(e);
    const lim = Date.now() - KEEP; while (a.length && (a.length > MAX || a[0].t < lim)) a.shift();
    emit();
  }
  function open(fs) {
    if (typeof WebSocket === 'undefined') return;
    try { sock = new WebSocket(WS + fs.toLowerCase() + '@forceOrder'); } catch { return; }
    const me = sock;
    sock.onopen = () => { retry = 0; };
    sock.onmessage = m => { try { const e = parse(JSON.parse(m.data)); if (e) add(e); } catch {} };
    sock.onclose = () => { if (me !== sock || !cur) return; sock = null; clearTimeout(timer); timer = setTimeout(() => { if (cur) open(cur); }, Math.min(30000, 1500 * 2 ** retry++)); };
    sock.onerror = () => { try { me.close(); } catch {} };
  }
  /* Conecta al símbolo de futuros (p. ej. BTCUSDT) o desconecta con null */
  function watch(fs) {
    fs = fs ? String(fs).toUpperCase() : '';
    if (fs === cur) return; cur = fs; clearTimeout(timer); retry = 0;
    if (sock) { const s = sock; sock = null; try { s.close(); } catch {} }
    if (fs) open(fs);
  }
  const events = fs => (fs && ev[String(fs).toUpperCase()]) || [];
  function sum(fs, ms) { const lim = Date.now() - ms; let l = 0, s = 0; for (const e of events(fs)) if (e.t >= lim) { if (e.long) l += e.usd; else s += e.usd; } return {l, s}; }
  const api = {watch, events, sum, parse, add, on: f => { listeners.push(f); }, current: () => cur};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTLiqLive = api;
})(typeof self !== 'undefined' ? self : this);

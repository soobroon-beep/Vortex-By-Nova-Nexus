const test = require('node:test'), assert = require('node:assert');
const I = require('../indicators.js');
const mk = (arr) => arr.map((p, i) => ({t: i * 36e5, o: p, h: p * 1.002, l: p * .998, c: p, v: 100}));
test('heatmap: devuelve matriz y la banda de un largo apalancado queda debajo del precio', () => {
  const c = mk(Array.from({length: 60}, (_, i) => 100 + Math.sin(i / 5) * .5));
  const h = I.liquidationHeatmap(c, {rows: 100}); assert.ok(h && h.rows >= 100 && h.data[0].length === 60);
  const last = c.length - 1, rowOf = p => Math.floor((p - h.pMin) / h.step);
  assert.ok(h.data[rowOf(100 * (1 - .02 + .005))][last] > 0, '50x largo ≈ −1.5%');
  assert.ok(h.data[rowOf(100 * (1 + .02 - .005))][last] > 0, '50x corto ≈ +1.5%');
});
test('heatmap: la banda desaparece cuando el precio la toca', () => {
  const p = Array.from({length: 40}, () => 100); p[30] = 80; for (let i = 31; i < 40; i++) p[i] = 80;
  const c = mk(p), h = I.liquidationHeatmap(c, {rows: 200}), r = Math.floor((100 * (1 - .1 + .005) - h.pMin) / h.step);
  assert.ok(h.data[r][20] > 0, 'viva antes del desplome'); assert.equal(h.data[r][35], 0, 'liquidada tras tocar el precio');
});
test('heatmap: pocas velas → null', () => assert.equal(I.liquidationHeatmap(mk([1, 2])), null));
test('heatmap v2: con interés abierto, una caída del OI cierra posiciones (bandas más débiles)', () => {
  const c = mk(Array.from({length: 80}, (_, i) => 100 + Math.sin(i / 6) * .3));
  const up = c.map((_, i) => 1e6 + i * 1e4), cut = up.map((v, i) => i < 60 ? v : up[59] * .5);
  const a = I.liquidationHeatmap(c, {rows: 120, oi: up}), b = I.liquidationHeatmap(c, {rows: 120, oi: cut});
  const tot = m => m.cur.reduce((x, y) => x + y, 0);
  assert.ok(a.oiUsed > 50 && tot(a) > 0); assert.ok(tot(b) < tot(a) * .6, 'el OI bajó a la mitad: quedan menos posiciones por liquidar');
});
test('heatmap v2: perfil vivo separa largos (abajo del precio) y cortos (arriba)', () => {
  const c = mk(Array.from({length: 50}, () => 100)), m = I.liquidationHeatmap(c, {rows: 150}), price = 100;
  let lAbove = 0, sBelow = 0; for (let r = 0; r < m.rows; r++) { const p = m.pMin + (r + .5) * m.step; if (p > price * 1.003) lAbove += m.curL[r]; if (p < price * .997) sBelow += m.curS[r]; }
  assert.equal(lAbove, 0); assert.equal(sBelow, 0);
  const C = I.liqClusters(m, price); assert.ok(C.up.length && C.dn.length); assert.ok(C.up.every(q => q.p > price && q.side === 'short')); assert.ok(C.dn.every(q => q.p < price && q.side === 'long'));
});
test('liquidaciones reales: forceOrder SELL = largo liquidado y suma por hora', () => {
  const L = require('../liq-live.js');
  const e = L.parse({e: 'forceOrder', o: {s: 'BTCUSDT', S: 'SELL', ap: '100000', p: '99990', z: '0.5', q: '0.5', T: Date.now()}});
  assert.ok(e.long && e.usd === 50000); L.add(e); L.add(L.parse({o: {s: 'BTCUSDT', S: 'BUY', ap: '100100', z: '1', T: Date.now()}}));
  const s = L.sum('BTCUSDT', 36e5); assert.equal(s.l, 50000); assert.equal(s.s, 100100);
});

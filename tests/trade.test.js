const test = require('node:test'), assert = require('node:assert');
const E = require('../trade-engine.js');
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);

test('mercado: abre long, comisión y PnL', () => {
  const a = E.newAcct(1000), px = {BTC: 100};
  const r = E.place(a, {sym: 'BTC', side: 1, qty: 10, lev: 10}, s => px[s]); assert.ok(r.ok);
  near(a.bal, 1000 - 10 * 100 * E.FEE_TK); assert.equal(a.pos.length, 1);
  px.BTC = 110; near(E.equity(a, s => px[s]), a.bal + 100);
  near(a.pos[0].liq, 100 * (1 - 0.1 + E.MMR));
});
test('margen insuficiente', () => {
  const a = E.newAcct(100);
  assert.ok(E.place(a, {sym: 'X', side: 1, qty: 10, lev: 1}, () => 100).error);
});
test('límite se ejecuta y luego TP', () => {
  const a = E.newAcct(1000), P = () => 100;
  const r = E.place(a, {sym: 'X', side: 1, qty: 1, type: 'limit', price: 95, lev: 5, tp: 105}, P); assert.ok(r.ok); assert.equal(a.ord.length, 1);
  assert.ok(E.place(a, {sym: 'X', side: 1, qty: 1, type: 'limit', price: 101, lev: 5}, P).error); // límite de compra arriba del precio
  E.tick(a, 'X', 96, 99, 97); assert.equal(a.pos.length, 0);
  E.tick(a, 'X', 94, 96, 95); assert.equal(a.pos.length, 1); assert.equal(a.pos[0].tp, 105);
  E.tick(a, 'X', 104, 106, 106); assert.equal(a.pos.length, 0); assert.equal(a.hist[0].why, 'Take profit'); near(a.hist[0].pnl, 10);
});
test('stop loss y liquidación', () => {
  const a = E.newAcct(1000), P = () => 100;
  E.place(a, {sym: 'X', side: -1, qty: 1, lev: 20, sl: 103}, P);
  E.tick(a, 'X', 100, 103.5, 103.5); assert.equal(a.hist[0].why, 'Stop loss'); near(a.hist[0].pnl, -3);
  E.place(a, {sym: 'X', side: 1, qty: 1, lev: 20}, P); const liq = a.pos[0].liq; const b0 = a.bal;
  E.tick(a, 'X', liq - 1, 100, liq - 1); assert.equal(a.hist[0].why, 'Liquidación'); near(a.bal, b0 - 5);
});
test('neto: orden opuesta reduce y voltea', () => {
  const a = E.newAcct(10000), P = () => 100;
  E.place(a, {sym: 'X', side: 1, qty: 2, lev: 10}, P);
  E.place(a, {sym: 'X', side: -1, qty: 3, lev: 10}, P);
  assert.equal(a.pos.length, 1); assert.equal(a.pos[0].side, -1); near(a.pos[0].qty, 1);
});
test('mover TP/SL y orden desde el gráfico', () => {
  const a = E.newAcct(1000), P = () => 100;
  E.place(a, {sym: 'X', side: 1, qty: 1, lev: 5}, P); const id = a.pos[0].id;
  assert.ok(E.move(a, id, 'tp', 99, 100).error); assert.ok(E.move(a, id, 'tp', 110, 100).ok);
  assert.ok(E.move(a, id, 'sl', 90, 100).ok); assert.ok(E.move(a, id, 'sl', 70, 100).error); // tras la liquidación (5x ≈ 80.5)
  E.place(a, {sym: 'Y', side: 1, qty: 1, type: 'limit', price: 95, lev: 5}, P); const o = a.ord[0];
  E.move(a, o.id, 'ord', 105, 100); assert.equal(o.type, 'stop'); assert.equal(o.price, 105);
});

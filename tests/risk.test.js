'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), R = require('../risk.js');
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(b)), `${a} ≈ ${b}`);
test('long sin comisiones: arriesgar 1 % de 1000 con stop a 1 % → posición de 1000 USDT', () => {
  const r = R.calc({capital: 1000, riskPct: 1, entry: 100, stop: 99, target: 102, leverage: 10, feePct: 0});
  assert.ok(r.ok); assert.ok(r.long); near(r.riskUsd, 10); near(r.qty, 10); near(r.notional, 1000); near(r.margin, 100); near(r.loss, 10); near(r.gain, 20); near(r.rr, 2);
  near(r.liq, 100 * (1 - 0.1 + R.MMR)); assert.equal(r.warn.length, 0);
});
test('short con comisiones: la pérdida en el stop sigue siendo el riesgo elegido', () => {
  const r = R.calc({capital: 500, riskPct: 2, entry: 50000, stop: 50500, target: 49000, leverage: 20, feePct: 0.05});
  assert.ok(r.ok); assert.equal(r.long, false); near(r.loss, 10); assert.ok(r.liq > 50000); assert.ok(r.gain > 0 && r.rr > 1.5);
});
test('avisa si te liquidan antes del stop y si el margen no cabe', () => {
  const r = R.calc({capital: 100, riskPct: 1, entry: 100, stop: 90, leverage: 20, feePct: 0}); assert.ok(r.warn.some(w => /liquidar/.test(w)));
  const r2 = R.calc({capital: 100, riskPct: 1, entry: 100, stop: 99.9, leverage: 1, feePct: 0}); assert.ok(r2.warn.some(w => /margen/.test(w))); assert.ok(R.levFor({capital: 100, riskPct: 1, entry: 100, stop: 99.9, feePct: 0}) >= 10);
});
test('datos incompletos → error claro', () => { assert.equal(R.calc({capital: 0, riskPct: 1, entry: 1, stop: 2}).ok, false); assert.match(R.calc({capital: 10, riskPct: 1, entry: 5, stop: 5}).error, /stop/); });

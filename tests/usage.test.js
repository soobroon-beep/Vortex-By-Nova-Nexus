const test = require('node:test');
const assert = require('node:assert');
const U = require('../scripts/usage.js');
const now = Date.parse('2026-11-24T18:00:00Z'), D = 864e5;

test('plan de cada cuenta', () => {
  assert.strictEqual(U.planOf(null), 'free');
  assert.strictEqual(U.planOf({by: 'creador'}), 'dev');
  assert.strictEqual(U.planOf({payTier: 'plus', payEnd: Date.now() + D}), 'plus');
  assert.strictEqual(U.planOf({payTier: 'plus', payEnd: Date.now() - 3 * D}), 'free');
  assert.strictEqual(U.planOf({refTier: 'infinity', refEnd: 0}), 'infinity');
  assert.strictEqual(U.planOf({tier: 'plus'}), 'plus');
});

test('resumen: cuentas nuevas/activas, dispositivos e historial diario', () => {
  const users = [{uid: 'a', c: now - 2 * 3600e3, s: now - 3600e3}, {uid: 'b', c: now - 10 * D, r: now - 3 * D}, {uid: 'c', c: now - 90 * D, s: now - 60 * D}];
  const pres = [{at: now - 5 * 6e4, first: now - 2 * D, uid: 'a', dev: 'm', pwa: true, tz: 'America/Mexico_City', n: 3}, {at: now - 2 * D, first: now - 20 * D, uid: '', dev: 'pc', pwa: false, tz: 'America/Bogota', n: 1}, {at: now - 40 * D, first: now - 50 * D, uid: '', dev: 'pc', tz: 'x'}];
  const S = U.summarize(users, {a: {by: 'creador'}}, pres, {'2026-11-01': 4}, now);
  assert.deepStrictEqual(S.acc, {total: 3, new1: 1, new7: 1, new30: 2, act1: 1, act7: 2, act30: 2});
  assert.strictEqual(S.plans.dev, 1); assert.strictEqual(S.plans.free, 2);
  assert.strictEqual(S.dev.live, 1); assert.strictEqual(S.dev.d30, 2); assert.strictEqual(S.dev.m, 1); assert.strictEqual(S.dev.pwa, 1); assert.strictEqual(S.dev.anon30, 1); assert.strictEqual(S.dev.ret30, 1);
  assert.strictEqual(S.hist[U.dayKey(now)], 1); assert.strictEqual(S.hist['2026-11-01'], 4);
  assert.strictEqual(S.tzTop[0][1], 1);
});

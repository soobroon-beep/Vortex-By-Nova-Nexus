'use strict';
// Claudia 5 minutos: gemela exacta de Claudio (mismos límites y reglas) en velas de 5 min, con su propia sesión.
const test = require('node:test'), assert = require('node:assert');
const K = require('../claudio-core.js'), C5 = K.claudia, M5 = 3e5, T0 = Date.UTC(2026, 0, 1);
function candles(n, seed, drift, iv) { let x = seed, p = 100; const out = []; const rnd = () => (x = x * 16807 % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { const o = p, c = o * (1 + drift + (rnd() - .5) * 0.012); out.push({t: T0 + i * iv, o, h: Math.max(o, c) * (1 + rnd() * 0.003), l: Math.min(o, c) * (1 - rnd() * 0.003), c, v: 100 + rnd() * 50}); p = c; }
  return out; }
test('Claudia es Claudio en 5 minutos: mismas reglas, otro nombre y otra temporalidad', () => {
  assert.equal(C5.NAME, 'Claudia 5 minutos'); assert.equal(C5.TF, '5m'); assert.equal(C5.IV, M5);
  assert.deepEqual(C5.LIMITS, K.LIMITS); assert.equal(K.TF, '1h'); assert.equal(K.felipe.TF, '1h');
  const s = C5.newSession({startT: T0, symbols: ['X']}); assert.equal(s.adapt, null); assert.equal(s.calib.a, 1.2); // misma calibración (auto-mejora nocturna) que Claudio
});
test('Claudia avanza vela por vela de 5 min y su libro es verificable', async () => {
  const data = {AAAUSDT: candles(900, 7, 0.0008, M5), BBBUSDT: candles(900, 11, -0.0008, M5)}, start = T0 + 400 * M5;
  const s = C5.prepare({enabled: true, capital: 10000}, null, start, Object.keys(data));
  await C5.step(s, {candles: async sym => data[sym].map(c => Object.assign({}, c))}, C5.jevEvaluator({}), T0 + 900 * M5);
  assert.equal(s.agent, 'Claudia 5 minutos'); assert.ok(C5.verify(s)); assert.ok(s.lastT >= T0 + 899 * M5, 'procesó hasta la última vela de 5 min');
});
test('el servidor pide velas de 5m para Claudia y de 1h para Claudio', async () => {
  const {makeFeed} = require('../scripts/claudio-run.js'), urls = [];
  const fx = async u => { urls.push(u); return {ok: true, json: async () => []}; };
  await makeFeed(fx, Date.now(), '5m').candles('BTCUSDT', 300); await makeFeed(fx, Date.now()).candles('BTCUSDT', 300);
  assert.ok(/interval=5m/.test(urls[0])); assert.ok(/interval=1h/.test(urls[1]));
});

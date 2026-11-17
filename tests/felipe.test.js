// Felipe: mismo núcleo que Claudio, otra estrategia (rupturas con volumen), otros límites y aprendizaje propio (umbral y monedas a evitar)
const test = require('node:test'), assert = require('node:assert');
const K = require('../claudio-core.js'), F = K.felipe, H = 36e5, T0 = Date.UTC(2026, 0, 1);
function candles(n, seed, drift) { let x = seed, p = 100; const out = []; const rnd = () => (x = x * 16807 % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { const o = p, c = o * (1 + drift + (rnd() - .5) * 0.012 + (i % 40 === 39 ? 0.02 : 0)); out.push({t: T0 + i * H, o, h: Math.max(o, c) * (1 + rnd() * 0.003), l: Math.min(o, c) * (1 - rnd() * 0.003), c, v: 100 * (i % 40 === 39 ? 3 : 1) * (0.8 + rnd() * 0.4)}); p = c; }
  return out; }
test('Felipe es otro agente: nombre, límites y universo distintos a Claudio', () => {
  assert.equal(F.NAME, 'Felipe'); assert.equal(K.NAME, 'Claudio');
  assert.notEqual(F.LIMITS.minDirConf, K.LIMITS.minDirConf); assert.equal(F.LIMITS.slAtr, 2); assert.equal(K.LIMITS.slAtr, 1.5);
  assert.ok(Object.isFrozen(F.LIMITS)); assert.ok(K.FELIPE.symbols.length >= 8);
});
test('Felipe opera en vivo con su estrategia de rupturas y su libro es inmutable', async () => {
  const data = {AAAUSDT: candles(900, 7, 0.0012), BBBUSDT: candles(900, 11, -0.0012)}, start = T0 + 400 * H;
  const feed = {candles: async sym => data[sym].map(c => Object.assign({}, c))};
  const s = F.prepare({enabled: true, capital: 10000}, null, start, Object.keys(data));
  await F.step(s, feed, F.jevEvaluator({}), T0 + 900 * H);
  assert.equal(s.agent, 'Felipe'); assert.ok(s.adapt && s.adapt.minConf === 0.72);
  assert.ok(s.ledger.length > 0, 'debe operar alguna ruptura'); assert.ok(F.verify(s));
  assert.ok(s.events.some(e => /Felipe encendido/.test(e.text)));
});
test('aprendizaje propio: cambia su umbral solo si mejora fuera de muestra y deja de operar monedas donde predice mal', () => {
  const s = F.newSession({startT: T0, symbols: ['AAAUSDT', 'BBBUSDT']}), done = [];
  for (let i = 0; i < 200; i++) { const conf = 0.6 + (i % 30) / 100, hi = conf > 0.8, o = hi || i % 5 < 3 ? 1 : 0; done.push({t: T0 + i * H, sym: 'AAAUSDT', pUp: conf, z: 1, q: 2, o, ret: hi ? 1.5 : o ? 0.25 : -0.25}); } // con confianza alta gana; con baja apenas acierta y pierde por comisiones
  for (let i = 0; i < 60; i++) done.push({t: T0 + i * H, sym: 'BBBUSDT', pUp: 0.9, z: 2, q: 2, o: 0, ret: -1});
  const rep = F.adaptLearn(s, done, T0 + 300 * H);
  assert.ok(rep.after > 0.72, 'sube el umbral hacia donde sí gana'); assert.ok(s.adapt.muted.BBBUSDT, 'evita BBB'); assert.ok(!s.adapt.muted.AAAUSDT, 'sigue con AAA');
  const d = F.decide('BBBUSDT', {direction: 'long', dirConf: 0.99, quality: 3, riskState: 'safe', toxic: 0, regime: 'trending'}, {f: {px: 1, atr: 1}}, {equity: 1e4, muted: true});
  assert.equal(d.action, 'hold'); assert.match(d.why, /evitar/);
});
test('Claudio no cambia: sin aprendizaje de umbral (solo calibración)', () => { const s = K.newSession({startT: T0, symbols: ['X']}); assert.equal(s.adapt, null); assert.equal(s.calib.a, 1.2); });

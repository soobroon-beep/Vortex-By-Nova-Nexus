// Radar de Nexus Pixel: filtros, resultado de cada oportunidad y aprendizaje
const test = require('node:test'), assert = require('node:assert');
const R = require('../radar.js');
const mk = (n, f) => Array.from({length: n}, (_, i) => { const c = f(i); return {t: i * 36e5, o: c, h: c * 1.004, l: c * .996, c, v: 100 + (i === n - 1 ? 200 : 0)}; });
test('evalúa una señal a favor de la tendencia con buen puntaje', () => {
  const cs = mk(300, i => 100 + i * .1 + Math.sin(i / 4)), htf = mk(400, i => 50 + i * .2);
  const ev = R.evaluate(cs, {side: 'buy', score: 5, ago: 0}, htf, true);
  assert.strictEqual(ev.f.trend, 1); assert.strictEqual(ev.f.fresh, 1); assert.ok(ev.stop < ev.entry && ev.target > ev.entry);
  const w = Object.fromEntries(R.FEATS.map(k => [k, 1])); assert.ok(R.scoreOf(ev.f, w) >= 60);
  const evc = R.evaluate(cs, {side: 'sell', score: 2, ago: 2}, htf, true); assert.ok(R.scoreOf(evc.f, w) < R.scoreOf(ev.f, w));
});
test('sigue la oportunidad hasta el objetivo o el stop y aprende', () => {
  const op = {side: 'buy', t: 0, entry: 100, stop: 98, target: 104, f: {trend: 1, fresh: 1, score: 1, rsi: .8, volume: .5, rr: .6, btc: 1}};
  const up = [{t: 1, h: 101, l: 99.5, c: 100.5}, {t: 2, h: 104.5, l: 100, c: 104}];
  assert.strictEqual(R.resolve(op, up).r, 'win');
  assert.strictEqual(R.resolve(op, [{t: 1, h: 100.5, l: 97, c: 98}]).r, 'loss');
  assert.strictEqual(R.resolve(op, [{t: 1, h: 101, l: 99, c: 100}]), null);
  const st = {min: 70, w: Object.fromEntries(R.FEATS.map(k => [k, 1])), log: []};
  R.learn(st, Object.assign({}, op, {res: 'win'})); assert.ok(st.w.trend > 1, 'sube el peso de lo que funcionó');
  st.log = Array.from({length: 10}, () => ({res: 'loss', f: {}})); R.learn(st, {res: 'loss', f: {trend: 1}}); assert.ok(st.min > 70, 'si pierde mucho, se vuelve más exigente');
  assert.match(R.lessons(st), /ganadas/);
});
test('lee la respuesta de la IA', () => {
  const a = R.parseAI('Aquí va: {"veredicto":"Fuerte","confianza":84,"entrada":1,"stop":0.9,"objetivo":1.3,"razon":"Rompe estructura con volumen"}');
  assert.strictEqual(a.v, 'fuerte'); assert.strictEqual(a.conf, 84);
  assert.strictEqual(R.parseAI('sin json'), null);
});

const test = require('node:test'), assert = require('node:assert');
const P = require('../pixel-draw.js');
const H = 36e5, mk = f => Array.from({length: 120}, (_, i) => { const c = f(i), o = f(i - 1); return {t: 1.7e12 + i * H, o, c, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, v: 1}; });
const upCh = mk(i => 100 + i * .5 + Math.sin(i / 4) * 4), flat = mk(i => i < 60 ? 100 + i : 160 + Math.sin(i) * 2);
test('canal: dirección, piso y techo envuelven las velas', () => {
  const r = P.channel(upCh); assert.equal(r.kind, 'alcista'); assert.ok(r.lo < r.hi);
  const d = r.drawings[0]; assert.equal(d.type, 'channel'); assert.ok(d.a && d.b && d.c); assert.ok(d.c.p > d.a.p);
});
test('rango: encuentra la consolidación reciente', () => {
  const r = P.range(flat); assert.ok(r.bars >= 40 && r.bars <= 70, String(r.bars)); assert.ok(r.hi < 165 && r.lo > 150, r.lo);
  assert.equal(r.drawings[0].type, 'rect');
});
test('soportes y resistencias: debajo y encima del precio', () => {
  const r = P.levels(upCh), last = upCh[upCh.length - 1].c;
  assert.ok(r.sup.every(x => x.p <= last) && r.res.every(x => x.p > last)); assert.ok(r.drawings.every(d => d.type === 'horizontal' && /Soporte|Resistencia/.test(d.label)));
});
test('tendencia y fibonacci', () => {
  const t = P.trend(upCh); assert.equal(t.up, true); assert.ok(t.drawings[0].b.p > t.drawings[0].a.p);
  const f = P.fib(upCh); assert.equal(f.upMove, true); assert.ok(f.drawings[0].b.p > f.drawings[0].a.p);
});
test('entiende lo que escribes en español', () => {
  assert.deepEqual(P.parse('Dibújame el canal'), [{do: 'channel'}]);
  assert.deepEqual(P.parse('marca soportes y resistencias'), [{do: 'sr'}]);
  assert.deepEqual(P.parse('pon una línea en 65.000'), [{do: 'hline', price: 65000}]);
  assert.deepEqual(P.parse('línea en 0.5432'), [{do: 'hline', price: 0.5432}]);
  assert.deepEqual(P.parse('borra lo que dibujaste'), [{do: 'clear'}]);
  assert.deepEqual(P.parse('¿qué opinas del mercado?'), []);
  assert.ok(P.build('channel', upCh).text.includes('canal alcista'));
  assert.ok(/Necesito más velas/.test(P.build('fib', upCh.slice(0, 5)).text));
});

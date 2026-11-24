const test = require('node:test');
const assert = require('node:assert');
const TC = require('../trade-cast.js');

const up = Array.from({length: 200}, (_, i) => ({o: 100 + i, h: 101.5 + i + (i % 7 === 3 ? 2 : 0), l: 99 + i - (i % 7 === 5 ? 2 : 0), c: 100.8 + i, v: 100 + (i % 10) * 20}));

test('explicación con sus indicadores: nube 100, perfil de volumen, Fibonacci, S/R, oscilador y money flow (sin EMA 20/50 ni RSI)', () => {
  const w = TC.explain(up, {side: 1}, [310]);
  const all = w.join(' ');
  assert.match(all, /por encima de la nube de 100 periodos/);
  assert.match(all, /Perfil de volumen: el precio está \*\*por encima del POC\*\*/);
  assert.match(all, /Fibonacci/);
  assert.match(all, /resistencia en 310/);
  assert.match(all, /Oscilador/);
  assert.match(all, /Money flow \*\*alcista\*\*/);
  assert.match(all, /a favor de la nube/);
  assert.doesNotMatch(all, /RSI|EMA 20|EMA 50/);
  assert.match(TC.explain(up, {side: -1}).join(' '), /contra la nube/);
  assert.deepStrictEqual(TC.explain(up.slice(0, 10), {side: 1}), []);
});

test('perfil de volumen y nube', () => {
  const vp = TC.vprofile(up); assert.ok(vp.val <= vp.poc && vp.poc <= vp.vah);
  const cl = TC.cloud(up); assert.ok(cl.bot < cl.mid && cl.mid < cl.top);
  assert.strictEqual(TC.cloud(up.slice(0, 50)), null);
});

test('R:R y mensaje para Discord con niveles', () => {
  const r = TC.rr({entry: 100, sl: 98, tp: 106});
  assert.strictEqual(+r.rr.toFixed(2), 3); assert.strictEqual(+r.risk.toFixed(2), 2);
  const p = TC.payload({side: -1, entry: 100, sl: 102, tp: 95, lev: 20, src: 'real'}, {pair: 'BTC/USDT', tf: '1h', fmt: v => String(v), why: ['Precio debajo de la nube.', 'Money flow bajista.'], img: true});
  const e = p.embeds[0];
  assert.match(e.title, /SHORT · BTC\/USDT/);
  assert.match(e.description, /^• Precio debajo de la nube\.\n• Money flow bajista\./);
  assert.strictEqual(e.image.url, 'attachment://trade.png');
  assert.ok(e.fields.some(f => f.name === 'Apalancamiento' && f.value === 'x20'));
  assert.ok(e.fields.some(f => f.name === 'R:R' && f.value === '2.50'));
});

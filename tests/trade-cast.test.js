const test = require('node:test');
const assert = require('node:assert');
const TC = require('../trade-cast.js');

const up = Array.from({length: 80}, (_, i) => ({o: 100 + i, h: 101 + i, l: 99 + i, c: 100.5 + i, v: i === 79 ? 500 : 100}));

test('explicación breve: tendencia, RSI, volumen y si va a favor', () => {
  const w = TC.explain(up, {side: 1});
  assert.match(w[0], /Tendencia alcista/);
  assert.ok(w.some(x => /RSI en \d+/.test(x)));
  assert.ok(w.some(x => /Volumen 5\.0×/.test(x)));
  assert.ok(w.some(x => /a favor de la tendencia/.test(x)));
  assert.ok(TC.explain(up, {side: -1}).some(x => /contra la tendencia/.test(x)));
  assert.deepStrictEqual(TC.explain(up.slice(0, 10), {side: 1}), []);
});

test('R:R y mensaje para Discord con niveles', () => {
  const r = TC.rr({entry: 100, sl: 98, tp: 106});
  assert.strictEqual(+r.rr.toFixed(2), 3); assert.strictEqual(+r.risk.toFixed(2), 2);
  const p = TC.payload({side: -1, entry: 100, sl: 102, tp: 95, lev: 20, src: 'real'}, {pair: 'BTC/USDT', tf: '1h', fmt: v => String(v), why: ['Tendencia bajista.'], img: true});
  const e = p.embeds[0];
  assert.match(e.title, /SHORT · BTC\/USDT/);
  assert.strictEqual(e.image.url, 'attachment://trade.png');
  assert.deepStrictEqual(p.allowed_mentions, {parse: []});
  assert.ok(e.fields.some(f => f.name === 'Apalancamiento' && f.value === 'x20'));
  assert.ok(e.fields.some(f => f.name === 'R:R' && f.value === '2.50'));
  assert.deepStrictEqual(TC.marksOf({entry: 1, sl: 0, tp: 2}).map(m => m.t), ['Entrada', 'TP']);
});

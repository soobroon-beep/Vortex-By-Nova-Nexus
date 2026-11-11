'use strict';
// Seguimiento de trades abiertos (trade-watch.js): funciones puras que usan la app y el servidor de avisos.
const test = require('node:test'), assert = require('node:assert/strict');
const TW = require('../trade-watch.js');

const mk = o => TW.san(Object.assign({k: 'BTC-USDT@bingxf', b: 'BTC', side: 1, entry: 100, lev: 5, tp: 110, sl: 95, liq: 81, lv: [104]}, o));
const run = (t, prices, step = 10) => { const m = {}, out = []; let now = 1e12; for (const p of prices) { now += 60000; out.push(...TW.evalTrade(t, p, m, now, {step}).msgs.map(x => x.kind)); } return {kinds: out, m}; };

test('san: valida y limpia', () => {
  assert.equal(TW.san({k: 'x', b: 'BTC', side: 1, entry: 0}), null);
  assert.equal(TW.san({k: 'BTCUSDT', b: 'BTC', side: 3, entry: 10}), null);
  const t = mk({lev: 999, lv: [104, 104, -1, 'a']});
  assert.equal(t.lev, 200); assert.deepEqual(t.lv, [104]); assert.equal(t.id, 'BTC:L:100');
});

test('la primera revisión no avisa de lo que ya pasó', () => {
  const {kinds, m} = run(mk(), [106]); // ya va +30 % de ROE
  assert.deepEqual(kinds, []); assert.equal(m.up, 3);
});

test('escalones de ganancia: uno por cada nuevo escalón', () => {
  const {kinds} = run(mk({tp: 0}), [100, 102, 104, 104.5, 102, 108.2]);
  assert.deepEqual(kinds.filter(k => k === 'up').length, 3); // +10 %, +20 %, +40 % (el +30 % se brinca, avisa una vez)
});

test('pérdida, cerca del SL y tocar el SL; luego deja de seguir', () => {
  const {kinds, m} = run(mk({lv: []}), [100, 98, 96.1, 95, 94]);
  assert.ok(kinds.includes('dn')); assert.ok(kinds.includes('slN')); assert.equal(kinds[kinds.length - 1], 'sl'); assert.equal(m.done, 1);
  assert.equal(kinds.filter(k => k === 'sl').length, 1);
});

test('short: gana cuando baja y avisa cerca del TP', () => {
  const t = mk({side: -1, tp: 90, sl: 105, liq: 119, lv: []}), {kinds} = run(t, [100, 98, 91.5]);
  assert.ok(kinds.includes('up')); assert.ok(kinds.includes('tpN'));
});

test('regreso a la entrada después de ir ganando', () => {
  const {kinds} = run(mk({lv: []}), [100, 102.1, 100.05]);
  assert.deepEqual(kinds, ['up', 'be']);
});

test('cerca de liquidación', () => {
  const {kinds} = run(mk({sl: 0, lv: []}), [100, 86]);
  assert.ok(kinds.includes('liqN'));
});

test('cruce de tus niveles con espera entre avisos', () => {
  const {kinds} = run(mk({tp: 0, sl: 0}), [103, 104.5, 103.5, 104.5]);
  assert.equal(kinds.filter(k => k === 'lv').length, 1); // los cruces seguidos dentro de 30 min no repiten aviso
});

test('merge conserva la memoria de los trades que siguen abiertos', () => {
  const a = mk(); a.m = {i: 1, up: 2};
  const r = TW.merge([mk(), mk({b: 'ETH', k: 'ETHUSDT', entry: 3000})], [a]);
  assert.equal(r.length, 2); assert.deepEqual(r[0].m, {i: 1, up: 2}); assert.deepEqual(r[1].m, {});
});

test('keyFor usa el exchange de tu cuenta', () => {
  assert.equal(TW.keyFor('BTC/USDT:USDT', 'bingx', 'swap'), 'BTC-USDT@bingxf');
  assert.equal(TW.keyFor('1000PEPE/USDT:USDT', 'binance', 'swap'), '1000PEPEUSDT@binancef');
  assert.equal(TW.keyFor('SOL/USDT', 'binance', 'spot'), 'SOLUSDT');
  assert.equal(TW.keyFor('ETH/USDT:USDT', 'okx', 'swap'), 'ETH-USDT-SWAP@okxf');
  assert.equal(TW.stripBase('1000PEPE'), 'PEPE');
});

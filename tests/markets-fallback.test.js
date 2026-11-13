// Respaldo de exchanges: si Binance no responde, el mismo par sale de otro exchange (o del almacén de velas de VORTEX).
const test = require('node:test'), assert = require('node:assert');
const M = require('../markets.js');
const now = Date.now(), H = 36e5, base = Math.floor(now / H) * H;
const bybitRows = Array.from({length: 50}, (_, i) => [String(base - (i + 1) * H), '1', '2', '0.5', '1.5', '10']);
test('Binance falla → Bybit con el mismo par', async () => {
  const seen = [];
  global.fetch = async u => { u = String(u); seen.push(u); if (u.includes('binance')) return {ok: false, status: 451}; if (u.includes('bybit.com')) return {ok: true, json: async () => ({result: {list: bybitRows}})}; return {ok: false, status: 500}; };
  M.setStore(null);
  const r = await M.klinesAny('BTCUSDT', '1h', 40, {meta: true});
  assert.equal(r.src, 'bybit'); assert.equal(r.cs.length, 40); assert.ok(seen.some(u => u.includes('symbol=BTCUSDT') && u.includes('bybit')));
});
test('el almacén de VORTEX va antes que los demás exchanges', async () => {
  global.fetch = async () => ({ok: false, status: 451});
  M.setStore(async (sym, tf, n) => Array.from({length: n}, (_, i) => ({t: base - (n - i) * H, o: 1, h: 2, l: 0.5, c: 1, v: 1})));
  const r = await M.klinesAny('ETHUSDT', '1h', 100, {meta: true});
  assert.equal(r.src, 'vortex'); assert.equal(r.cs.length, 100);
  M.setStore(null);
});
test('formato del par para cada exchange', () => {
  assert.equal(M.symFor('okx', 'SOLUSDT'), 'SOL-USDT'); assert.equal(M.symFor('gate', 'SOLUSDT'), 'SOL_USDT'); assert.equal(M.symFor('mexc', 'SOL-USDT'), 'SOLUSDT');
});
test('ninguno responde → error (no inventa velas)', async () => {
  global.fetch = async () => ({ok: false, status: 503}); M.setStore(null);
  await assert.rejects(M.klinesAny('XRPUSDT', '1h', 50));
});

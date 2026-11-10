// Radar de Nexus Pixel en el servidor: elige candidatas del Screener y arma el aviso
const test = require('node:test'), assert = require('node:assert');
test('radar del servidor', async () => {
  const R = await import('../worker/radar-server.mjs');
  const rows = [{symbol: 'AUSDT', sg: {side: 'buy', score: 5, ago: 0}}, {symbol: 'BUSDT', sg: {side: 'sell', score: 2, ago: 0}}, {symbol: 'CUSDT', sg: {side: 'buy', score: 4, ago: 3}}, {symbol: 'DUSDT', sg: {side: 'buy', score: 4, ago: 1, range: true}}];
  assert.deepStrictEqual(R.pickCands(rows).map(r => r.symbol), ['AUSDT']);
  const t = R.opText({symbol: 'SOLUSDT', side: 'buy', tf: '4h', v: 'fuerte', entry: 150, stop: 140, target: 170, ai: 82, why: 'Rompe estructura'});
  assert.match(t.title, /Gran oportunidad · SOL LONG 4h/); assert.match(t.body, /confianza IA 82%/);
  const kv = {m: {}, get: async (k) => kv.m[k] ? JSON.parse(kv.m[k]) : null, put: async (k, v) => { kv.m[k] = v; }};
  const st = await R.loadState({KV: kv}); assert.strictEqual(st.min, 70); assert.ok(Array.isArray(st.log));
});

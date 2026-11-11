// Pruebas del puente con los exchanges (worker/exchange-proxy.mjs)
const test = require('node:test'), assert = require('node:assert');
test('puente de exchanges: destino y origen', async () => {
  const W = await import('../worker/exchange-proxy.mjs');
  const enc = encodeURIComponent('https://open-api.bingx.com/openApi/swap/v2/user/balance?timestamp=1&signature=ab');
  assert.strictEqual(W.targetOf('https://w.dev/?' + enc).hostname, 'open-api.bingx.com');
  assert.strictEqual(W.targetOf('https://w.dev/?https://api.bybit.com/v5/market/time').pathname, '/v5/market/time');
  for (const bad of ['http://api.binance.com/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://a.b.workers.dev/x', 'https://user:p@api.okx.com/', 'https://api.okx.com:8443/']) assert.strictEqual(W.targetOf('https://w.dev/?' + encodeURIComponent(bad + '?a=1')), null, bad);
  assert.strictEqual(W.targetOf('https://w.dev/'), null);
  assert.ok(W.originOk('https://soobroon-beep.github.io', {}));
  assert.ok(W.originOk('http://localhost:5173', {}));
  assert.ok(!W.originOk('https://evil.example', {}));
  const r = await W.default.fetch(new Request('https://w.dev/?https://api.bybit.com/x', {headers: {origin: 'https://evil.example'}}), {});
  assert.strictEqual(r.status, 403);
});

test('el puente solo reenvía a exchanges conocidos (no es un proxy abierto)', async () => {
  const W = await import('../worker/exchange-proxy.mjs');
  for (const ok of ['https://open-api.bingx.com/x', 'https://fapi.binance.com/fapi/v1/time', 'https://api.gateio.ws/api/v4/x', 'https://api.huobi.pro/x']) assert.ok(W.targetOf('https://w.dev/?' + encodeURIComponent(ok)), ok);
  for (const bad of ['https://evil.com/x', 'https://binance.com.evil.com/x', 'https://example.org/']) assert.strictEqual(W.targetOf('https://w.dev/?' + encodeURIComponent(bad)), null, bad);
});

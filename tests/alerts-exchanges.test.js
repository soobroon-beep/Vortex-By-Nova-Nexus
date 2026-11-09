// Alertas de precio en monedas de otros exchanges (HYPEUSDT@binancef…): antes se descartaban y nunca avisaban
const test = require('node:test'), assert = require('node:assert');
test('el servidor acepta y evalúa alertas con exchange', async () => {
  const W = await import('../worker/push-alerts.mjs');
  const a = W.sanAlert({id: 'al1', symbol: 'HYPEUSDT@binancef', price: 80, dir: 'up', notify: 'both'});
  assert.ok(a, 'se conserva');
  const r = W.evalAlerts([a], {'HYPEUSDT@binancef': 81}, Date.now(), true);
  assert.strictEqual(r.fired.length, 1); assert.strictEqual(r.dc.length, 1); assert.match(r.fired[0].body, /^HYPE subió/);
  assert.strictEqual(W.sanAlert({id: 'x', symbol: 'BTC<script>', price: 1, dir: 'up'}), null);
});

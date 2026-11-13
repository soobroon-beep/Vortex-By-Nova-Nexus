// A dónde va cada aviso: app, Discord o ambos (y los interruptores generales)
const test = require('node:test'), assert = require('node:assert');
test('alerta de precio sin elegir destino = app y Discord; con la app apagada, solo Discord', async () => {
  const m = await import('../worker/push-alerts.mjs'), mk = n => [{id: 'a', on: true, symbol: 'BTCUSDT', price: 100, dir: 'up', notify: n}];
  let r = m.evalAlerts(mk(undefined), {BTCUSDT: 101}, Date.now(), true); assert.equal(r.fired.length, 1); assert.equal(r.dc.length, 1);
  r = m.evalAlerts(mk(undefined), {BTCUSDT: 101}, Date.now(), false); assert.equal(r.fired.length, 0); assert.equal(r.dc.length, 1);
  r = m.evalAlerts(mk('app'), {BTCUSDT: 101}, Date.now(), true); assert.equal(r.fired.length, 1); assert.equal(r.dc.length, 0);
  r = m.evalAlerts(mk('discord'), {BTCUSDT: 101}, Date.now(), true); assert.equal(r.fired.length, 0); assert.equal(r.dc.length, 1);
});
test('Discord apagado en Ajustes: nada a Discord', async () => {
  const m = await import('../worker/push-alerts.mjs');
  assert.equal(m.dcAllow({dc: {on: false, price: true, ind: true}}, 'price'), false);
  assert.equal(m.dcAllow({dc: m.sanDc({on: true, price: false}, '')}, 'price'), false);
  assert.equal(m.dcAllow({dc: m.sanDc({on: true}, '')}, 'ind'), true);
});

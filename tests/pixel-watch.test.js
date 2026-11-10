'use strict';
// Nexus Pixel · vigía de reglas: lectura de indicadores, regla que aplica, mensaje de respaldo y limpieza de la respuesta del modelo.
const test = require('node:test'), assert = require('node:assert/strict'), W = require('../pixel-watch.js');
const ctx = (px, nova, lecturas) => ({candles: Array.from({length: 40}, (_, i) => ({t: i, o: px, h: px, l: px, c: px, v: 1})), nova, lecturas});

test('lee nube, oscilador y EMA 200 y saca la lectura general', () => {
  const R = W.read(ctx(95, {top: 102, bot: 100, osc: -20, sig: -10, ema200: 110, adx: 31}));
  assert.equal(R.estado, 'bajista'); assert.equal(R.bias, -4);
  assert.match(R.items[0].t, /DEBAJO de la nube \(bajista\)/); assert.match(R.items[1].t, /modo VENTA/); assert.ok(R.items.some(i => /ADX 31/.test(i.t)));
  const up = W.read(ctx(120, {top: 102, bot: 100, osc: 5, sig: 1, ema200: 110})); assert.equal(up.estado, 'alcista');
  const mid = W.read(ctx(101, {top: 102, bot: 100, osc: 5, sig: 6, ema200: 100})); assert.equal(mid.estado, 'mixto'); assert.match(mid.items[0].t, /DENTRO de la nube/);
  assert.notEqual(R.sig, up.sig, 'la firma cambia cuando cambia el estado'); assert.equal(R.sig, W.read(ctx(94, {top: 102, bot: 100, osc: -25, sig: -10, ema200: 110, adx: 33})).sig, 'y no cambia si el estado es el mismo');
});
test('sin datos suficientes no dice nada', () => {
  assert.equal(W.read(null), null); assert.equal(W.read({candles: []}), null); assert.equal(W.read(ctx(100, {})), null);
});
test('respaldo sin IA: recuerda la regla que aplica y da su lectura', () => {
  const R = W.read(ctx(95, {top: 102, bot: 100, osc: -20, sig: -10})), cfg = {reglas: 'Siempre uso stop loss. Por debajo de la nube es bajista: solo busco ventas. No opero noticias.'};
  assert.equal(W.rule(cfg, R), 'Por debajo de la nube es bajista: solo busco ventas');
  const t = W.local(R, 'BTC', '1h', cfg);
  assert.match(t, /^Recuerda: «Por debajo de la nube es bajista: solo busco ventas»\. Ahora en BTC 1h: el precio está por DEBAJO de la nube \(bajista\) y el oscilador está en modo VENTA\. Yo creo que va a seguir bajando\.$/);
  assert.match(W.local(R, 'BTC', '1h', {}), /^BTC 1h: .*Yo creo que va a seguir bajando\.$/); assert.equal(W.rule({reglas: 'Solo opero de día.'}, R), '');
  const reb = W.read(ctx(95, {top: 102, bot: 100, osc: -20, sig: -10}, {rsi: {ultimo: 24}})); assert.match(W.local(reb, 'BTC', '1h', {}), /rebote/);
});
test('lo que se manda al modelo lleva los hechos y los indicadores; la respuesta se limpia y se acorta', () => {
  const c = ctx(95, {top: 102, bot: 100, osc: -20, sig: -10}, {rsi: {ultimo: 41}}), p = W.prompt(W.read(c), 'BTC', '4h', c);
  assert.match(p, /BTC en 4h/); assert.match(p, /DEBAJO de la nube/); assert.match(p, /"rsi"/); assert.match(W.SYS, /Yo creo que/);
  assert.equal(W.clean('**"Recuerda:** bajo la nube es bajista. Yo creo que seguirá bajando."'), 'Recuerda: bajo la nube es bajista. Yo creo que seguirá bajando.');
  assert.equal(W.clean('{"reply": "x"}'), ''); assert.equal(W.clean('ok'), '');
  const long = W.clean('Primera frase bastante larga para que el corte caiga después de ella y no antes de tiempo, con detalles de sobra para pasar de noventa. ' + 'palabra '.repeat(60)); assert.ok(long.length <= 261); assert.match(long, /noventa\.$/);
});
test('cada cuánto avisa: 15 min por defecto, 0 lo apaga', () => {
  assert.equal(W.every({}), 15); assert.equal(W.every({vigia: 0}), 0); assert.equal(W.every({vigia: 5}), 5); assert.equal(W.every({vigia: 7}), 15); assert.equal(W.every(null), 15);
});

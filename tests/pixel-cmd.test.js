'use strict';
// Nexus Pixel entiende lo que le pides a la APP (pixel-cmd.js) en vez de contestar cosas genéricas.
const test = require('node:test'), assert = require('node:assert/strict'), C = require('../pixel-cmd.js');
const P = t => C.parse(t, {symbols: ['BTCUSDT', 'ETHUSDT', 'ZECUSDT']});
test('cambiar el color de soportes y resistencias sin decir el color: pregunta cuál (no se va a la IA)', () => {
  assert.deepEqual(P('cambia los colores de los soportes y resistencias'), [{do: 'askColor', target: 'sr'}]);
  assert.deepEqual(P('cambia el color del canal'), [{do: 'askColor', target: 'channel'}]);
});
test('con el color dicho, los dibujos los sigue editando pixel-draw (no se roba la orden)', () => {
  assert.deepEqual(P('pon el canal en rojo'), []);
  assert.deepEqual(P('dibuja el canal'), []);
});
test('colores del gráfico: velas, fondo y cuadrícula', () => {
  assert.deepEqual(P('pon las velas alcistas en azul y las bajistas en naranja'), [{do: 'look', key: 'up', col: '#3b82f6'}, {do: 'look', key: 'down', col: '#f97316'}]);
  assert.deepEqual(P('cambia las velas verdes a azul'), [{do: 'look', key: 'up', col: '#3b82f6'}]);
  assert.deepEqual(P('pon el fondo negro'), [{do: 'look', key: 'bg', col: '#000000'}]);
  assert.deepEqual(P('quita la cuadrícula'), [{do: 'look', key: 'grid', on: false}]);
  assert.equal(P('pon las velas en azul')[0].do, 'askColor');
});
test('indicadores, temporalidad, moneda, cursor y tema', () => {
  assert.deepEqual(P('ponme el RSI'), [{do: 'ind', key: 'rsi', on: true}]);
  assert.deepEqual(P('quita el macd'), [{do: 'ind', key: 'macd', on: false}]);
  assert.deepEqual(P('pon la EMA 200'), [{do: 'ind', key: 'ema20', on: true, len: 200}]);
  assert.deepEqual(P('cámbiate a 4 horas'), [{do: 'tf', value: '4h'}]);
  assert.deepEqual(P('abre ETH en 15 minutos'), [{do: 'symbol', value: 'ETH'}, {do: 'tf', value: '15m'}]);
  assert.deepEqual(P('cursor órbita'), [{do: 'cursor', value: 'Órbita'}]);
  assert.deepEqual(P('modo claro'), [{do: 'theme', value: 'light'}]);
});
test('las preguntas NO se convierten en órdenes', () => {
  for (const t of ['¿qué dice el RSI?', '¿long o short?', '¿cómo ves el gráfico?', '¿cierro mi posición?']) assert.deepEqual(P(t), [], t);
});
test('chartish: detecta cuando hablas del gráfico (para no mandarlo a Nexus Lens en la PC)', () => {
  assert.ok(C.chartish('cambia los colores de los soportes'));
  assert.ok(!C.chartish('¿cómo conecto mi exchange?'));
});

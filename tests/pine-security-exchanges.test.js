'use strict';
// request.security con símbolos de otros exchanges (como en TradingView) y syminfo según el exchange del gráfico.
const test = require('node:test'), assert = require('node:assert/strict'), P = require('../pine.js');
const cs = Array.from({length: 120}, (_, i) => { const p = 100 + Math.sin(i / 6) * 10; return {t: i * 36e5, o: p, h: p + 1, l: p - 1, c: p, v: 10}; });
const needs = (expr, opts = {}) => P.run('//@version=5\nindicator("t")\nx = request.security(' + expr + ', close)\nplot(nz(x))', cs, Object.assign({interval: '1h'}, opts)).needs;
test('prefijos de exchange y perpetuos', () => {
  assert.deepEqual(needs('"BINGX:ETHUSDT.P", "240"'), [{symbol: 'ETH-USDT@bingxf', interval: '4h'}]);
  assert.deepEqual(needs('"BYBIT:SOLUSDT", "60"'), [{symbol: 'SOLUSDT@bybit', interval: '1h'}]);
  assert.deepEqual(needs('"BINANCE:BTCUSDT.P", "D"'), [{symbol: 'BTCUSDT@binancef', interval: '1d'}]);
  assert.deepEqual(needs('"COINBASE:BTCUSD", "60"'), [{symbol: 'BTC-USD@coinbase', interval: '1h'}]);
  assert.deepEqual(needs('"GATEIO:XRPUSDT", "60"'), [{symbol: 'XRP_USDT@gate', interval: '1h'}]);
  assert.deepEqual(needs('"ETHUSDT", "240"'), [{symbol: 'ETHUSDT', interval: '4h'}]);
});
test('sin prefijo usa el exchange del gráfico; syminfo.tickerid lo refleja', () => {
  assert.deepEqual(needs('"ETHUSDT", "240"', {symbol: 'BTC-USDT', exch: 'bingxf'}), [{symbol: 'ETH-USDT@bingxf', interval: '4h'}]);
  assert.deepEqual(needs('syminfo.tickerid, "240"', {symbol: 'BTC-USDT', exch: 'bingxf', symKey: 'BTC-USDT@bingxf'}), [{symbol: 'BTC-USDT@bingxf', interval: '4h'}]);
  const r = P.run('//@version=5\nindicator("t", overlay=true)\nplot(close)\nlabel.new(bar_index, close, syminfo.tickerid + " " + syminfo.basecurrency)', cs, {interval: '1h', symbol: 'BTC-USDT', exch: 'bingxf'});
  assert.equal(r.labels.at(-1).text, 'BINGX:BTCUSDT.P BTC');
  assert.ok(!(needs('"FOO:BTCUSDT", "60"') || []).length); // exchange desconocido: aviso, sin pedir velas
});

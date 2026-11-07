const test = require('node:test'), assert = require('node:assert');
const M = require('../markets.js');
test('claves: Binance sin sufijo, otros con @', () => {
  assert.deepEqual(M.parse('BTCUSDT'), {sym: 'BTCUSDT', src: 'binance'});
  assert.deepEqual(M.parse('BTCUSDT@bybit'), {sym: 'BTCUSDT', src: 'bybit'});
  assert.deepEqual(M.parse('BTC-USDT@okx'), {sym: 'BTC-USDT', src: 'okx'});
  assert.equal(M.parse('X@raro').src, 'binance');
  assert.equal(M.mk('BTCUSDT', 'binance'), 'BTCUSDT'); assert.equal(M.mk('BTCUSDT', 'bybit'), 'BTCUSDT@bybit');
});
test('normalizadores de cada exchange', () => {
  assert.equal(M.N.binance([{symbol: 'ETHBTC', lastPrice: '0.05', priceChangePercent: '1', quoteVolume: '10'}, {symbol: 'FOO', lastPrice: '1'}]).length, 1);
  const by = M.N.bybit({result: {list: [{symbol: 'BTCUSDT', lastPrice: '100', price24hPcnt: '0.02', turnover24h: '5'}]}})[0]; assert.equal(by.chg, 2); assert.equal(by.key, 'BTCUSDT@bybit');
  const ok = M.N.okx({data: [{instId: 'BTC-USDT', last: '110', open24h: '100', volCcy24h: '3'}, {instId: 'BTC-USD-SWAP', last: '1', open24h: '1'}]}); assert.equal(ok.length, 1); assert.ok(Math.abs(ok[0].chg - 10) < 1e-9);
  assert.equal(M.N.coinbase([{id: 'BTC-USD', base_currency: 'BTC', quote_currency: 'USD'}, {id: 'X-GBP', base_currency: 'X', quote_currency: 'GBP'}])[0].key, 'BTC-USD@coinbase');
  assert.equal(M.N.bingx({data: {symbols: [{symbol: 'BTC-USDT', status: 1}, {symbol: 'OLD-USDT', status: 0}]}}).length, 1);
});
test('buscador: mismo activo en varios exchanges, ordenado', async () => {
  M.setFetcher(async url => url.includes('bybit') ? {result: {list: [{symbol: 'BTCUSDT', lastPrice: '1', price24hPcnt: '0', turnover24h: '9'}, {symbol: 'ETHUSDT', lastPrice: '1', price24hPcnt: '0', turnover24h: '1'}]}} : url.includes('okx') ? {data: [{instId: 'BTC-USDT', last: '1', open24h: '1', volCcy24h: '1'}]} : url.includes('binance.com/api') ? [{symbol: 'BTCUSDT', lastPrice: '1', priceChangePercent: '0', quoteVolume: '99'}, {symbol: 'BTCUSDC', lastPrice: '1', priceChangePercent: '0', quoteVolume: '9'}] : (() => { throw Error('x'); })());
  for (const s of ['binance', 'bybit', 'okx', 'bingx']) await M.universe(s);
  const r = M.search('btc'); const keys = r.map(x => x.key);
  assert.ok(keys.includes('BTCUSDT') && keys.includes('BTCUSDT@bybit') && keys.includes('BTC-USDT@okx'));
  assert.equal(keys[0], 'BTCUSDT'); assert.ok(!keys.some(k => k.startsWith('ETH')));
  assert.equal(M.search('ethusdt')[0].key, 'ETHUSDT@bybit');
});

test('más exchanges: KuCoin, Gate, MEXC, Bitget, HTX, Kraken y perpetuos de BingX/Bybit/OKX', () => {
  assert.equal(M.N.kucoin({data: {ticker: [{symbol: 'BTC-USDT', last: '100', changeRate: '0.05', volValue: '9'}]}})[0].chg, 5);
  assert.equal(M.N.gate([{currency_pair: 'BTC_USDT', last: '1', change_percentage: '-2', quote_volume: '3'}])[0].key, 'BTC_USDT@gate');
  assert.ok(Math.abs(M.N.mexc([{symbol: 'ETHUSDT', lastPrice: '110', openPrice: '100', quoteVolume: '1'}])[0].chg - 10) < 1e-9);
  assert.equal(M.N.bitget({data: [{symbol: 'SOLUSDT', lastPr: '1', change24h: '0.01', quoteVolume: '1'}]})[0].chg, 1);
  assert.equal(M.N.htx({data: [{symbol: 'btcusdt', open: 100, close: 120, vol: 5}]})[0].key, 'BTCUSDT@htx');
  const kr = M.N.kraken({result: {XXBTZUSD: {wsname: 'XBT/USD', altname: 'XBTUSD'}, 'XXBTZUSD.d': {wsname: 'XBT/USD'}}}, {result: {XXBTZUSD: {c: ['110'], o: '100', v: ['1', '2']}}});
  assert.equal(kr.length, 1); assert.equal(kr[0].key, 'BTC-USD@kraken'); assert.equal(kr[0].alt, 'XBTUSD');
  const bxf = M.N.bingxf({data: [{symbol: 'BTC-USDT', lastPrice: '1', priceChangePercent: '1.5', quoteVolume: '7'}]})[0]; assert.equal(bxf.key, 'BTC-USDT@bingxf'); assert.equal(bxf.chg, 1.5);
  assert.equal(M.N.bingx({data: [{symbol: 'BTC-USDT', lastPrice: '2', priceChangePercent: '3%'}]})[0].chg, 3);
  assert.equal(M.N.okxf({data: [{instId: 'BTC-USDT-SWAP', last: '1', open24h: '1', volCcy24h: '1'}, {instId: 'BTC-USD-250101', last: '1'}]})[0].key, 'BTC-USDT@okxf');
  assert.equal(M.N.bybitf({result: {list: [{symbol: 'BTCUSDT', lastPrice: '1', price24hPcnt: '0', turnover24h: '1'}]}})[0].key, 'BTCUSDT@bybitf');
  assert.ok(M.isPerp('bingxf') && !M.isPerp('bingx')); assert.equal(M.ORDER.length, 16);
  for (const s of M.ORDER) assert.ok(M.EXCH[s] && M.SHORT[s], s);
});
test('velas de KuCoin y Gate quedan en orden y con sus campos', async () => {
  M.setFetcher(async url => url.includes('kucoin') ? {data: [['1700000060', '2', '3', '4', '1', '10'], ['1700000000', '1', '2', '3', '0.5', '9']]} : [['1700000000', '9', '2', '3', '0.5', '1', '7']]);
  const k = await M.klines('kucoin', 'BTC-USDT', '1m'); assert.deepEqual(k.map(c => c.t), [1700000000000, 1700000060000]); assert.equal(k[1].c, 3); assert.equal(k[1].h, 4);
  const g = await M.klines('gate', 'BTC_USDT', '1h'); assert.deepEqual(g[0], {t: 1700000000000, c: 2, h: 3, l: 0.5, o: 1, v: 7});
  M.setFetcher(null);
});

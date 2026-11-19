'use strict';
// Nexus Lens: CCTExchange.history() normaliza el historial de cada exchange a una sola forma (sin red: exchanges falsos)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'exchange.js'), 'utf8').replace("(typeof self !== 'undefined' ? self : this)", '(window)');
const now = Date.now();
function load(id, methods, has) {
  class Fake { constructor() { this.has = Object.assign({fetchPositionsHistory: false, fetchMyTrades: false}, has); this.markets = {}; } async loadMarkets() { return this.markets; } }
  Object.assign(Fake.prototype, methods);
  const store = {cct_exchange_v1: JSON.stringify({id, apiKey: 'k', secret: 's', market: 'swap'})};
  const win = {ccxt: {[id]: Fake}, localStorage: {getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; }}, addEventListener() {}, dispatchEvent() {}};
  global.localStorage = win.localStorage; global.document = {addEventListener() {}, visibilityState: 'hidden'}; global.CustomEvent = class {};
  const st = global.setTimeout; global.setTimeout = () => 0; try { new Function('window', SRC)(win); } finally { global.setTimeout = st; }
  return win.CCTExchange;
}
test('BingX: órdenes con ganancia → long/short, lev y comisión', async () => {
  const X = load('bingx', {swapV2PrivateGetTradeAllOrders: async p => ({data: {orders: p.endTime > now - 60000 ? [
    {symbol: 'BTC-USDT', orderId: 1, side: 'SELL', positionSide: 'LONG', status: 'FILLED', profit: '12.5', avgPrice: '96000', executedQty: '0.01', commission: '-0.4', updateTime: now - 5000, leverage: '10X'},
    {symbol: 'ETH-USDT', orderId: 2, side: 'BUY', positionSide: 'BOTH', status: 'FILLED', profit: '-3.1', avgPrice: '3500', executedQty: '0.2', updateTime: now - 8000},
    {symbol: 'ETH-USDT', orderId: 3, side: 'BUY', positionSide: 'LONG', status: 'FILLED', profit: '0', updateTime: now - 9000}] : []}})});
  const r = await X.history({days: 90});
  assert.equal(r.src, 'bingx'); assert.equal(r.trades.length, 2);
  assert.deepEqual(r.trades.map(t => [t.sym, t.side, t.pnl]), [['ETH', 'short', -3.1], ['BTC', 'long', 12.5]]);
  assert.equal(r.trades[1].lev, 10); assert.equal(r.trades[1].fee, 0.4);
});
test('BingX sin «profit»: usa los ingresos REALIZED_PNL', async () => {
  const X = load('bingx', {swapV2PrivateGetTradeAllOrders: async () => ({data: {orders: []}}), swapV2PrivateGetUserIncome: async () => ({data: [{symbol: 'SOL-USDT', income: '4.2', time: now - 1000, tranId: 9}]})});
  const r = await X.history(); assert.equal(r.trades.length, 1); assert.equal(r.trades[0].sym, 'SOL'); assert.equal(r.trades[0].pnl, 4.2);
});
test('Binance: ingresos + lado de los fills, fills de una orden se juntan', async () => {
  const X = load('binance', {fapiPrivateGetIncome: async () => [{symbol: 'BTCUSDT', income: '5', time: now - 4000, tradeId: 't1'}, {symbol: 'BTCUSDT', income: '2', time: now - 3500, tradeId: 't2'}, {symbol: 'XRPUSDT', income: '-1.5', time: now - 1000, tradeId: 'x1'}],
    async loadMarkets() { this.markets = {'BTC/USDT:USDT': {id: 'BTCUSDT', swap: true, symbol: 'BTC/USDT:USDT'}}; }, fetchMyTrades: async () => [{id: 't1', order: 'o1', side: 'sell', price: 96000, amount: .01, info: {}}, {id: 't2', order: 'o1', side: 'sell', price: 96010, amount: .005, info: {}}]});
  const r = await X.history(); assert.equal(r.src, 'binance');
  assert.deepEqual(r.trades.map(t => [t.sym, t.side, t.pnl]), [['BTC', 'long', 7], ['XRP', '', -1.5]]);
});
test('Bybit: historial de posiciones por ventanas de 7 días, sin duplicados', async () => {
  const X = load('bybit', {fetchPositionsHistory: async () => [{symbol: 'SOL/USDT:USDT', side: 'short', realizedPnl: 7.2, lastUpdateTimestamp: now - 3000, timestamp: now - 90000, entryPrice: 210, contracts: 2, notional: 410, leverage: 5, info: {positionId: 'p1', avgExitPrice: '205'}}]}, {fetchPositionsHistory: true});
  const r = await X.history({days: 30}); assert.equal(r.src, 'positions'); assert.equal(r.trades.length, 1);
  const t = r.trades[0]; assert.equal(t.side, 'short'); assert.equal(t.exit, 205); assert.equal(t.entry, 210); assert.equal(t.lev, 5);
});
test('Clave rechazada: mensaje claro en español', async () => {
  const X = load('okx', {fetchPositionsHistory: async () => { throw new Error('AuthenticationError Invalid API key'); }}, {fetchPositionsHistory: true});
  await assert.rejects(X.history(), /rechazó tu API Key/);
});

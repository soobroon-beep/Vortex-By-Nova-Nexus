// Historial hacia atrás: el gráfico pide bloques de velas más viejas hasta llegar a la primera vela del exchange (como en TradingView).
const test = require('node:test'), assert = require('node:assert');
const M = require('../markets.js');
const PD = require('../pine-draw.js').CCTPineDraw;
const H = 36e5, LIST = Date.UTC(2017, 7, 17), NOW = Math.floor(Date.UTC(2026, 10, 26) / H) * H; // «listado» de la moneda → hoy
const all = []; for (let t = LIST; t <= NOW; t += H) all.push(t);
const row = t => [t, '1', '2', '0.5', '1.5', '10'];
const q = (u, k) => { const m = new RegExp('[?&]' + k + '=([^&]+)').exec(u); return m ? decodeURIComponent(m[1]) : null; };
// Exchanges simulados con su paginación real: Binance/MEXC (endTime, viejo→nuevo), Bybit (end, nuevo→viejo), OKX (after, 100 por página), Gate (from/to en segundos)
function fakeFetch(seen) {
  return async url => {
    url = String(url); if (url.includes('/mkt?u=')) url = decodeURIComponent(url.split('/mkt?u=')[1]); seen && seen.push(url);
    const lim = +(q(url, 'limit') || 1000), body = x => ({ok: true, json: async () => x});
    if (url.includes('binance') || url.includes('mexc')) { const e = +q(url, 'endTime'); return body(all.filter(t => t <= e).slice(-lim).map(row)); }
    if (url.includes('bybit')) { const e = +q(url, 'end'); return body({retCode: 0, result: {list: all.filter(t => t <= e).slice(-lim).reverse().map(t => row(t).map(String))}}); }
    if (url.includes('okx')) { const a = +q(url, 'after'); return body({code: '0', data: all.filter(t => t < a).slice(-Math.min(100, lim)).reverse().map(t => row(t).map(String))}); }
    if (url.includes('gateio')) { const f = +q(url, 'from') * 1000, to = +q(url, 'to') * 1000; return body(all.filter(t => t >= f && t <= to).map(t => [String(t / 1000), '10', '1.5', '2', '0.5', '1', '10'])); }
    if (url.includes('bingx')) { const e = +q(url, 'endTime'); return body({code: 0, data: all.filter(t => t <= e).slice(-lim).map(row)}); }
    return {ok: false, status: 404};
  };
}
async function walk(src, sym) { // como el gráfico: empieza con las últimas 1000 y va pidiendo hacia atrás hasta que no haya más
  let cs = all.slice(-1000).map(t => ({t})), guard = 0;
  for (;;) { const old = await M.klinesBefore(src, sym, '1h', cs[0].t, 1000); if (!old.length) break; assert.ok(old[old.length - 1].t < cs[0].t, 'solo velas anteriores'); cs = old.concat(cs); if (++guard > 200) throw Error('no termina'); }
  return cs;
}
for (const [src, sym] of [['binance', 'BTCUSDT'], ['bybit', 'BTCUSDT'], ['okx', 'BTC-USDT'], ['bingx', 'BTC-USDT'], ['mexc', 'BTCUSDT'], ['gate', 'BTC_USDT']]) {
  test(`${src}: llega hasta la primera vela de la moneda, sin huecos ni repetidas`, async () => {
    global.fetch = fakeFetch(); M.setFetcher(null);
    const cs = await walk(src, sym);
    assert.equal(cs[0].t, LIST); assert.equal(cs.length, all.length);
    for (let i = 1; i < cs.length; i++) assert.equal(cs[i].t - cs[i - 1].t, H);
  });
}
test('Binance: la consulta lleva endTime justo antes de la primera vela cargada', async () => {
  const seen = []; global.fetch = fakeFetch(seen);
  const end = all[all.length - 1000], r = await M.klinesBefore('binance', 'BTCUSDT', '1h', end, 1000);
  assert.equal(r.length, 1000); assert.equal(r[r.length - 1].t, end - H); assert.ok(seen.some(u => u.includes('endTime=' + (end - 1))));
});
test('antes del listado ya no hay velas → [] (fin de la historia)', async () => {
  global.fetch = fakeFetch();
  assert.deepEqual(await M.klinesBefore('binance', 'BTCUSDT', '1h', LIST, 1000), []);
  assert.deepEqual(await M.klinesBefore('okx', 'BTC-USDT', '1h', LIST, 1000), []);
});
test('exchange caído → error (el gráfico reintenta, no marca fin de historia)', async () => {
  global.fetch = async () => ({ok: false, status: 503});
  await assert.rejects(M.klinesBefore('binance', 'BTCUSDT', '1h', NOW, 1000));
});

test('pine: los dibujos se recorren con las velas nuevas del inicio (no parpadean ni se mueven de lugar)', () => {
  const res = {ok: true, plots: [{values: [1, 2, 3], ci: [0, 0, 1]}], fills: [{ci: [0, 1, 1]}], candles: [], bgcolors: [{pts: [[2, 0]]}], barcolors: [], shapes: [{pts: [[1, 5, 0, 0, '']]}],
    labels: [{x: 2, y: 1}], lines: [{x1: 0, x2: 2}], boxes: [{l: 1, r: 2}], polylines: [{pts: [[0, 1], [2, 3]]}], linefills: [{a: [0, 1, 2, 1], b: [0, 2, 2, 2]}], alerts: [{bars: [2], msgs: {2: 'x'}}],
    strategy: {equity: [1, 2, 3], trades: [[1, 1, 1, 10, 0, 11, 2, 1, '']], open: [], marks: [{bar: 2}]}, stats: {bars: 3, ms: 5}};
  const r = PD.shift(res, 1000);
  assert.equal(r.plots[0].values.length, 1003); assert.equal(r.plots[0].values[1002], 3); assert.equal(r.plots[0].values[0], null); assert.equal(r.plots[0].ci[1002], 1);
  assert.equal(r.fills[0].ci.length, 1003); assert.deepEqual(r.bgcolors[0].pts[0], [1002, 0]); assert.equal(r.shapes[0].pts[0][0], 1001);
  assert.equal(r.labels[0].x, 1002); assert.deepEqual([r.lines[0].x1, r.lines[0].x2], [1000, 1002]); assert.deepEqual([r.boxes[0].l, r.boxes[0].r], [1001, 1002]);
  assert.deepEqual(r.polylines[0].pts[1], [1002, 3]); assert.deepEqual(r.linefills[0].a, [1000, 1, 1002, 1]); assert.deepEqual(r.alerts[0].bars, [1002]); assert.equal(r.alerts[0].msgs['1002'], 'x');
  assert.equal(r.strategy.equity.length, 1003); assert.equal(r.strategy.trades[0][4], 1000); assert.equal(r.strategy.trades[0][6], 1002); assert.equal(r.strategy.marks[0].bar, 1002); assert.equal(r.stats.bars, 1003);
  assert.equal(res.plots[0].values.length, 3, 'el original no se toca');
});

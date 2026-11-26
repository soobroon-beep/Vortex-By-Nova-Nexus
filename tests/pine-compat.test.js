'use strict';
// Compatibilidad amplia con los indicadores de TradingView: cada caso salió de pasar miles de indicadores reales por el motor.
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../pine.js');
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const walk = (n, ms = 36e5, t0 = Date.UTC(2025, 0, 1)) => { let p = 100; return Array.from({length: n}, (_, i) => { const o = p, c = o + (rnd() - .5) * 3; p = c; return {t: t0 + i * ms, o, h: Math.max(o, c) + rnd(), l: Math.min(o, c) - rnd(), c, v: 50 + rnd() * 50}; }); };
const run = (code, cs, opts) => { const r = P.run(code, cs || walk(120), opts || {interval: '1h'}); assert.ok(r.ok, JSON.stringify(r.error)); return r; };
const v5 = '//@version=5\nindicator("t")\n', v6 = '//@version=6\nindicator("t")\n';
const last = (r, i = 0) => r.plots[i].values[r.plots[i].values.length - 1];

test('type, method y enum también sirven como nombres de variables y parámetros', () => {
  const r = run(v5 + 'method = input.string("EMA", "M", options=["SMA","EMA"])\ntype = "SMA"\nma(src, len, type) =>\n    switch type\n        "SMA" => ta.sma(src, len)\n        => ta.ema(src, len)\nplot(ma(close, 5, type))\nplot(ma(close, 5, method))\nf(simple int method) => method * 2\nplot(f(3))');
  assert.equal(last(r, 2), 6); assert.ok(last(r, 0) !== null);
});
test('función de una línea con var y varias sentencias separadas por coma', () => {
  const r = run('//@version=4\nstudy("t")\nf(_t) => var _l = label.new(bar_index, na, _t), label.set_x(_l, bar_index), _l\nf("hola")\nplot(close)');
  assert.equal(r.labels.length, 1);
});
test('Pine v1-v4: type=integer, style=line, obv y colores sueltos', () => {
  const r = run('//@version=3\nstudy("o")\nlen = input(title="L", type=integer, defval=5)\nb = input(true, type=bool)\nplot(sma(close, len), color=aqua, style=line)\nplot(obv, style=histogram)\nplot(accdist, style=area)');
  assert.equal(r.plots[0].style, 'line'); assert.equal(r.plots[1].style, 'histogram'); assert.ok(last(r, 1) !== null && last(r, 2) !== null);
});
test('un bloque como valor (switch) seguido de una tupla en la línea siguiente', () => {
  const r = run(v6 + 'tf = input.string("D")\nvar string per = switch\n    true => tf\n    => "W"\n[lo, hi] = request.security(syminfo.tickerid, per, [low, high])\nplot(lo)', walk(60, 864e5), {interval: '1d'});
  assert.equal(r.plots.length, 1);
});
test('import TradingView/ta: dema, tema, t3, aroon… y bibliotecas no incluidas no rompen el script', () => {
  const r = run(v5 + 'import TradingView/ta/7\nimport PineCoders/Time/4 as PCt\nplot(ta.dema(close, 5))\nplot(ta.tema(close, 5))\nplot(ta.t3(close, 5))\n[u, d] = ta.aroon(10)\nplot(u)\nplot(ta.sma(close, 3))\nplot(nz(PCt.secondsSince(true), -1))');
  for (let i = 0; i < 5; i++) assert.ok(last(r, i) !== null, 'plot ' + i);
  assert.equal(last(r, 5), -1); assert.equal(r.complete, false);
  assert.ok(r.warnings.some(w => w.level === 'unsupported' && /PineCoders\/Time/.test(w.msg)));
});
test('request.security_lower_tf devuelve el array de las velas menores (y tuplas de arrays)', () => {
  const t0 = Date.UTC(2025, 0, 1), h = Array.from({length: 20}, (_, i) => ({t: t0 + i * 36e5, o: i, h: i + 1, l: i - 1, c: i, v: 4})), m = Array.from({length: 80}, (_, i) => ({t: t0 + i * 9e5, o: i, h: i + 1, l: i - 1, c: i, v: 1}));
  const code = v6 + '[cs, vs] = request.security_lower_tf(syminfo.tickerid, "15", [close, volume])\nplot(array.size(cs))\nplot(array.sum(cs))\nplot(array.sum(vs))';
  let r = run(code, h); assert.deepEqual(r.needs, [{symbol: 'BTCUSDT', interval: '15m'}]);
  r = run(code, h, {interval: '1h', sec: {'BTCUSDT|15m': m}});
  assert.deepEqual([r.plots[0].values[1], r.plots[1].values[1], r.plots[2].values[1]], [4, 4 + 5 + 6 + 7, 4]);
});
test('fill con degradado (top_value/bottom_value/top_color/bottom_color)', () => {
  const r = run(v5 + 'o = ta.rsi(close, 5) - 50\np1 = plot(o)\np2 = plot(0)\nfill(p1, p2, top_value = math.max(o, 0), bottom_value = math.min(o, 0), top_color = color.green, bottom_color = color.red)');
  assert.equal(r.fills.length, 1); assert.ok(r.fills[0].cc !== undefined || r.fills[0].ci.some(x => x !== null));
});
test('modo tolerante: un error de datos (índice fuera del array) no tumba todo el indicador', () => {
  const r = run(v5 + 'a = array.new_float(0)\nx = array.get(a, 0)\nplot(close)\nplot(nz(x, 7))');
  assert.equal(last(r, 0) !== null, true); assert.equal(last(r, 1), 7); assert.equal(r.complete, false);
  assert.ok(r.warnings.some(w => w.level === 'unsupported' && /fuera del array/.test(w.msg) && w.line === 4));
  const e = P.run(v5 + 'runtime.error("solo en SPY")\nplot(close)', walk(5)); assert.equal(e.ok, false); assert.match(e.error.msg, /SPY/); // runtime.error sí detiene
  const u = P.run(v5 + 'plot(noexiste)', walk(5)); assert.equal(u.ok, false); // y un nombre inexistente también (es del código, no de los datos)
});
test('chart.point: .index/.time/.price y métodos de objetos aún na', () => {
  const r = run(v6 + 'p = chart.point.from_index(bar_index, close)\np.price := p.price + 1\nvar line l = na\nplot(p.price - close)\nplot(nz(l.get_y1(), 3))\nl.set_x2(bar_index)');
  assert.equal(last(r, 0), 1); assert.equal(last(r, 1), 3);
});
test('una declaración puede leer su propio historial y varip dentro de type', () => {
  const r = run(v6 + 'float ji = nz(ji[1]) + 1\ntype T\n    int a = 0\n    varip int b = -1\nvar t = T.new()\nt.a += 1\nplot(ji)\nplot(t.a)');
  assert.equal(last(r, 0), 120); assert.equal(last(r, 1), 120);
});
test('request.security a bolsa, índices, divisas, dominancia y otros exchanges de cripto', () => {
  const r = run(v5 + 'a = request.security("NASDAQ:QQQ", "D", close)\nb = request.security("TVC:DXY", "D", close)\nc = request.security("CRYPTOCAP:USDT.D", "D", close)\nd = request.security("CME_MINI:ES1!", "D", close)\ne = request.security("FX:EURUSD", "D", close)\nf = request.security("BITSTAMP:ETHUSD", "D", close)\nplot(a)', walk(30, 864e5), {interval: '1d'});
  assert.deepEqual(r.needs.map(n => n.symbol), ['QQQ@yh', 'DX-Y.NYB@yh', 'USDT.D@dom', 'ES=F@yh', 'EURUSD=X@yh', 'ETHUSDT']);
});
test('funciones de v6: footprint, pivot_point_levels, rci y datos de acciones sin romper', () => {
  const r = run(v6 + 'fp = request.footprint(100)\nplot(not na(fp) ? fp.total_volume() : na)\nplot(not na(fp) ? fp.poc().up_price() : na)\nlv = ta.pivot_point_levels("Traditional", timeframe.change("D"))\nplot(array.get(lv, 0))\nplot(ta.rci(close, 9))\nplot(nz(request.dividends("NASDAQ:AAPL"), 1))', walk(80));
  const cs = walk(80); assert.ok(Math.abs(last(r, 0) - r.plots[0].values[79]) < 1e-9);
  assert.ok(last(r, 1) !== null); assert.ok(last(r, 2) !== null); assert.ok(last(r, 3) >= -100 && last(r, 3) <= 100); assert.equal(last(r, 4), 1);
  assert.ok(!r.warnings.some(w => w.level === 'unsupported'), JSON.stringify(r.warnings));
});

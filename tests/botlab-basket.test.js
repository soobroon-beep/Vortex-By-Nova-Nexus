const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../botlab-engine.js'), T = require('../botlab-pine.js'), N = require('../botlab-notify.js'), Pine = require('../pine.js');
function rng(s) { return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function walk(n, seed) { const r = rng(seed), o = []; let p = 100; for (let i = 0; i < n; i++) { const op = p, c = op * (1 + (r() - .48) * .02); o.push({t: Date.UTC(2025, 0, 1) + i * 36e5, o: op, h: Math.max(op, c) * 1.004, l: Math.min(op, c) * .996, c, v: 1000 + r() * 900}); p = c; } return o; }

test('bots «Seguro»: válidos, largos en tendencia alcista y cortos en bajista, riesgo bajo y cesta de 5 monedas grandes', () => {
  for (const k of ['safe1h', 'safe4h']) { const s = B.PRESETS[k](); assert.ok(B.validateSpec(s).ok); assert.equal(s.sides, 'both'); assert.ok(s.entry.short.length && s.exit.short.length); assert.deepEqual(s.basket, ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']); assert.ok(s.risk.riskPct <= 0.5 && s.risk.maxDrawdownPct <= 10 && s.risk.sl); }
  assert.equal(B.PRESETS.safe4h().interval, '4h'); assert.ok(!B.validateSpec(Object.assign(B.PRESETS.safe1h(), {basket: ['BTCUSDT']})).ok);
});

test('cesta: cada moneda opera con su parte del capital y el resultado suma exactamente', () => {
  const sp = B.PRESETS.safe1h(), by = {}; sp.basket.forEach((s, i) => { by[s] = walk(2500, i + 3); }); const r = B.backtestBasket(by, sp);
  const solo = sp.basket.map(sym => { const x = JSON.parse(JSON.stringify(sp)); x.symbol = sym; delete x.basket; x.risk.capital = 2000; return B.backtest(by[sym], x); });
  assert.equal(r.trades.length, solo.reduce((a, x) => a + x.trades.length, 0)); const net = solo.reduce((a, x) => a + (x.equity[x.equity.length - 1].e - 2000), 0);
  assert.ok(Math.abs(r.metrics.net - net) < 1e-6); assert.ok(r.trades.every(t => sp.basket.includes(t.sym))); assert.equal(r.perSymbol.length, 5); assert.ok(r.verdict && r.segments.test);
});

test('señales al gráfico: el indicador generado corre en el motor del gráfico y marca casi las mismas entradas que el bot', () => {
  const C = walk(1500, 7);
  for (const k of ['emaRsi', 'macdTrend', 'safe1h']) { const sp = B.PRESETS[k](); sp.symbol = 'BTCUSDT'; delete sp.basket; const {code} = T.toPine(sp), res = Pine.run(code, C, {interval: '1h', symbol: 'BTCUSDT', name: 'x'});
    assert.ok(res.ok, k + ': ' + JSON.stringify(res.error)); const buys = res.labels.filter(l => l.text === 'COMPRA').map(l => l.x), from = Math.min(...buys), bt = B.backtest(C, sp).trades.filter(t => t.side === 'long').map(t => C.findIndex(c => c.t === t.entryT) - 1).filter(i => i >= from);
    assert.ok(buys.length > 0 && bt.filter(i => buys.includes(i)).length >= bt.length * .7, k);
    assert.ok(!res.plots.length && !res.shapes.length, k + ': solo cajitas y niveles, sin líneas de plot'); assert.ok(res.lines.length > 0, k + ': niveles de entrada/SL/TP'); }
  const nova = B.PRESETS.novaNexus(); assert.throws(() => T.toPine(nova), /Nova/);
});

test('avisos: la primera vez no manda el historial y después avisa cada operación una sola vez', () => {
  const s = {spec: {symbol: 'BTCUSDT', interval: '1h'}, ledger: [{side: 'long', entry: 1, exit: 2, net: 5, entryT: 1, exitT: 2}], open: null};
  assert.equal(N.pending(s).length, 0); s.open = {side: 'long', entry: 3, entryT: 9}; assert.deepEqual(N.pending(s).map(e => e.kind), ['open']); assert.equal(N.pending(s).length, 0);
  s.ledger.push({side: 'long', entry: 3, exit: 2.5, net: -4, entryT: 9, exitT: 12}); s.open = null; const ev = N.pending(s); assert.deepEqual(ev.map(e => e.kind), ['close']);
  const em = N.embed({name: 'X'}, s, ev[0]); assert.ok(/CIERRE/.test(em.title) && em.color === 0xf06b79);
});

test('bots Nova Nexus v2.7 (4h ambos lados, 1h cortos): válidos, cesta de 8, riesgo 2 % y apalancamiento máx. 5', () => {
  for (const k of ['nova27x4h', 'nova27x1h']) { const s = B.PRESETS[k](); assert.ok(B.validateSpec(s).ok, k); assert.equal(s.basket.length, 8); assert.equal(s.risk.riskPct, 2); assert.equal(s.risk.maxLeverage, 5); }
  assert.equal(B.PRESETS.nova27x4h().sides, 'both'); assert.equal(B.PRESETS.nova27x1h().sides, 'short');
  const v = B.novaVolBoth(B.PRESETS.novaNexus()); assert.equal(v.sides, 'both'); assert.ok(B.validateSpec(v).ok);
});

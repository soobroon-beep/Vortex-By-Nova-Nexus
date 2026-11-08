const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../botlab-engine.js'), C = require('../botlab-coach.js');
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function walk(n, seed = 1) { const r = rng(seed), out = []; let p = 100; const t0 = Date.UTC(2025, 0, 1); for (let i = 0; i < n; i++) { const o = p, c = o * (1 + (r() - .5) * .02 + Math.sin(i / 40) * .002); out.push({t: t0 + i * 3600e3, o, h: Math.max(o, c) * 1.004, l: Math.min(o, c) * .996, c, v: 1000 + r() * 900}); p = c; } return out; }
const base = () => { const s = B.defaultSpec(); s.entry.long = [{a: {k: 'ema', n: 10}, op: 'crossUp', b: {k: 'ema', n: 30}}]; s.exit.long = [{a: {k: 'ema', n: 10}, op: 'crossDown', b: {k: 'ema', n: 30}}]; return s; };

test('sin backtest: resumen honesto y solo el consejo de stop loss si falta', () => {
  const s = base(); s.risk.sl = null; s.risk.tp = null; s.risk.sizePct = 10;
  assert.equal(C.summary(s, null).level, 'sin-datos'); const t = C.tips(s, null); assert.deepEqual(t.map(x => x.id), ['sl']); assert.ok(B.validateSpec(C.apply(s, t[0].patch)).ok);
});

test('con backtest real: cada consejo es aplicable, válido y cambia algo concreto del bot', () => {
  const C1 = walk(3000, 4), s = base(), run = B.backtest(C1, s), ts = C.tips(s, run, {rows: [{symbol: 'ETHUSDT', interval: '1h', n: 40, retPct: 999, win: 60}]});
  assert.ok(ts.length >= 2, 'debe haber consejos'); assert.ok(ts.some(t => t.id === 'asset'));
  for (const t of ts) { const sp = C.apply(s, t.patch); assert.ok(B.validateSpec(sp).ok, t.id); assert.notEqual(JSON.stringify(sp), JSON.stringify(B.normalizeSpec(s)), t.id); assert.ok(t.why.length > 20); assert.ok(C.validTip(s, t)); }
  const sum = C.summary(s, run); assert.ok(['bien', 'regular', 'mal'].includes(sum.level)); assert.ok(sum.lines[0].includes(String(run.metrics.n)));
});

test('el filtro de tendencia se añade sin borrar las reglas existentes y el filtro de horario excluye ese bloque', () => {
  const s = base(), run = {metrics: {n: 40, winRate: 30, rr: 1.2, maxDDPct: 8, retPct: -3, net: -300, fees: 50}, segments: {train: {n: 20, net: 1}, val: {n: 10, net: -1}, test: {n: 10, net: -1}}, buyHold: {retPct: 2},
    breakdown: {trend: {bajista: {n: 12, net: -400, wins: 2}}, hour: {8: {n: 9, net: -250, wins: 2}}, vol: {}, side: {}}};
  const ts = C.tips(s, run), tr = ts.find(t => t.id === 'trend'), hr = ts.find(t => t.id === 'hours');
  const sp = C.apply(s, tr.patch); assert.equal(sp.entry.long.length, 2); assert.deepEqual(sp.entry.long[0], s.entry.long[0]); assert.equal(sp.entry.long[1].b.n, 200);
  assert.deepEqual(hr.patch.filters.hoursUtc, [12, 8]);
  const C2 = walk(800, 9), res = B.backtest(C2, C.apply(s, hr.patch));
  assert.ok(res.trades.every(t => { const h = new Date(t.entryT - 3600e3).getUTCHours(); return !(h >= 8 && h < 12); }));
  assert.ok(!C.validTip(s, {patch: {symbol: 'x'}})); assert.ok(!C.validTip(s, {patch: {}}));
});

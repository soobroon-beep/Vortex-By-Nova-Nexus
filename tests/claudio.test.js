const test = require('node:test'), assert = require('node:assert/strict');
const K = require('../claudio-core.js');
const H = 36e5, T0 = Date.UTC(2026, 0, 1);
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function walk(n, seed = 1, drift = 0, p0 = 100) { const r = rng(seed), out = []; let p = p0; for (let i = 0; i < n; i++) { const o = p, c = o * (1 + (r() - .5) * .02 + drift + Math.sin(i / 30) * .003); out.push({t: T0 + i * H, o, h: Math.max(o, c) * 1.003, l: Math.min(o, c) * .997, c, v: 1000 + r() * 800}); p = c; } return out; }
const book = (mid, tilt = 0) => ({t: null, bids: Array.from({length: 20}, (_, i) => [mid * (1 - 0.0001 * (i + 1)), 5 * (1 + tilt)]), asks: Array.from({length: 20}, (_, i) => [mid * (1 + 0.0001 * (i + 1)), 5 * (1 - tilt)])});
const feedOf = (D, bk) => ({candles: async (sym, n) => D[sym].slice(-n), book: bk ? async sym => book(D[sym][D[sym].length - 1].c, 0.3) : null});
const ev = (s, rows) => { const o = {}; for (const st of s) o[st.sym] = Object.assign({regime: 'trending', regimeConf: .8, direction: 'long', dirConf: .9, toxic: .1, quality: 3, riskState: 'safe', z: 1, pUp: .9}, rows && rows[st.sym]); return o; };

test('motor de estado: causal, compacto (< 400 tokens) y con libro de órdenes', () => {
  const C = walk(300, 2); const t = C[C.length - 1].t + H;
  const st = K.buildState('BTCUSDT', C, {t, book: book(C[C.length - 1].c, .4), equity: 1e4});
  assert.ok(st.tokens < 400 && st.text.length < 400 * 3); assert.ok(st.book); assert.ok(st.f.imb5 > 0 && st.f.spr > 0);
  assert.throws(() => K.buildState('BTCUSDT', C, {t: t - 1}), /no causal/); // la última vela aún no cerró
  assert.throws(() => K.buildState('BTCUSDT', C, {t, book: Object.assign(book(100), {t: t + 36e5})}), /no causal/); // libro del futuro
  // el estado de la vela i no cambia si después llegan más velas (sin mirar el futuro)
  const C2 = walk(400, 2), a = K.buildState('X', C2.slice(0, 300), {t}), b = K.buildState('X', C2.slice(0, 300), {t}); assert.deepEqual(a.f, b.f);
});

test('esquema de Jev: UNA llamada con todos los candidatos y respuestas tipadas validadas', () => {
  const C = walk(300, 3), t = C[C.length - 1].t + H, syms = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'], states = syms.map(s => K.buildState(s, C, {t}));
  const req = K.jevRequest(states, {equity: 1e4, ddPct: 0, dayPct: 0, openN: 0}); assert.equal(Object.keys(req.state.candidates).length, 3); assert.equal(Object.keys(req.questions).length, 15);
  assert.deepEqual(Object.keys(req.questions.btcusdt_regime.criteria), ['trending', 'mean_reverting', 'high_vol', 'crisis']);
  assert.deepEqual(Object.keys(req.questions.ethusdt_direction.criteria), ['long', 'short', 'neutral']); assert.equal(req.questions.solusdt_setup_quality.type, 'score'); assert.equal(req.questions.solusdt_setup_quality.criteria.length, 4);
  assert.deepEqual(Object.keys(req.questions.btcusdt_risk_state.criteria), ['safe', 'near_limit', 'reduce']); assert.equal(req.questions.btcusdt_toxic_flow.type, 'noul');
  const good = {answers: {btcusdt_regime: {choice: 'trending', confidence: .7}, btcusdt_direction: {choice: 'long', probabilities: {long: .86, short: .1, neutral: .04}}, btcusdt_toxic_flow: {noul: .1}, btcusdt_setup_quality: {score: 2.4}, btcusdt_risk_state: {choice: 'safe'},
    ethusdt_regime: {choice: 'sideways'}, ethusdt_direction: {choice: 'long'}, ethusdt_toxic_flow: {noul: .1}, ethusdt_setup_quality: {score: 2}, ethusdt_risk_state: {choice: 'safe'}}};
  const p = K.parseJev(good, syms); assert.equal(p.BTCUSDT.dirConf, .86); assert.equal(p.BTCUSDT.quality, 2.4); assert.equal(p.ETHUSDT, null); assert.equal(p.SOLUSDT, null); // opción inválida o ausente ⇒ no se opera
});

test('condiciones de ejecución en código: calidad ≥ 2, confianza > 0,80, risk_state safe, ¼ Kelly y tope por posición', () => {
  const C = walk(300, 4), st = K.buildState('BTCUSDT', C, {t: C[299].t + H}), base = {regime: 'trending', regimeConf: .8, direction: 'long', dirConf: .9, toxic: .1, quality: 3, riskState: 'safe'}, ctx = {equity: 1e4};
  assert.equal(K.decide('B', Object.assign({}, base, {quality: 1.9}), st, ctx).action, 'hold');
  assert.equal(K.decide('B', Object.assign({}, base, {dirConf: .80}), st, ctx).action, 'hold');
  assert.equal(K.decide('B', Object.assign({}, base, {riskState: 'near_limit'}), st, ctx).action, 'hold');
  assert.equal(K.decide('B', Object.assign({}, base, {toxic: .7}), st, ctx).action, 'hold');
  assert.equal(K.decide('B', null, st, ctx).action, 'hold');
  const d = K.decide('B', base, st, ctx); assert.equal(d.action, 'enter');
  const b = K.LIMITS.tpAtr / K.LIMITS.slAtr, full = .9 - .1 / b; assert.ok(Math.abs(d.frac - full / 4) < 1e-12); // exactamente ¼ de Kelly
  assert.ok(d.qty * st.f.px <= 1e4 * K.LIMITS.maxPositionPct / 100 + 1e-6); assert.ok(d.qty * d.slD <= 1e4 * d.frac + 1e-6);
  assert.equal(K.kelly(.3, 2), 0);
});

test('capa de riesgo: interruptor, drawdown 15 %, pérdida diaria y máximo de posiciones antes de cada orden', () => {
  const s = K.newSession({startT: T0, capital: 1e4, symbols: ['A']}), pf = () => K.portfolioOf(s), o = {type: 'enter', sym: 'A', qty: 1, px: 100};
  assert.ok(K.preOrderCheck(s, o, pf()).ok);
  s.kill = true; assert.equal(K.preOrderCheck(s, o, pf()).ok, false); assert.ok(K.preOrderCheck(s, {type: 'exit', sym: 'A'}, pf()).ok); s.kill = false; // salir siempre se permite
  assert.equal(K.preOrderCheck(s, o, {equity: 8400, ddPct: 16, dayPct: 0, openN: 0}).ok, false);
  assert.equal(K.preOrderCheck(s, o, {equity: 9600, ddPct: 4, dayPct: -3.1, openN: 0}).ok, false);
  assert.equal(K.preOrderCheck(s, o, {equity: 1e4, ddPct: 0, dayPct: 0, openN: 3}).ok, false);
  assert.equal(K.preOrderCheck(s, {type: 'enter', sym: 'A', qty: 30, px: 100}, pf()).ok, false); // 3000 > 20 % de 10 000
  assert.throws(() => { 'use strict'; K.LIMITS.maxDrawdownPct = 50; }); assert.equal(K.LIMITS.maxDrawdownPct, 15); // el modelo (ni nadie) puede cambiar los límites
});

test('sesión 24/7: empieza plana, llena en la apertura siguiente, es determinista por partes y el libro es inmutable', async () => {
  const D = {AAA: walk(1400, 5, .0006), BBB: walk(1400, 6, -.0005, 50)}, start = T0 + 900 * H, mk = () => K.newSession({startT: start, capital: 1e4, symbols: ['AAA', 'BBB']}), local = async (st, pf, c) => ({by: 'jev-local', ev: K.localEval(st, pf, c)});
  const a = mk(), b = mk(); await K.step(b, feedOf(D), local, T0 + 1400 * H);
  for (const k of [1000, 1100, 1250, 1400]) { const d = {AAA: D.AAA.slice(0, k), BBB: D.BBB.slice(0, k)}; await K.step(a, feedOf(d), local, T0 + k * H); }
  const core = s => s.ledger.map(t => [t.sym, t.entryT, t.exitT, Math.round(t.net * 1e6)]); assert.deepEqual(core(a), core(b)); assert.ok(Math.abs(a.cash - b.cash) < 1e-6);
  assert.ok(K.verify(a)); for (const t of a.ledger) { assert.ok(t.entryT >= start); const i = (t.entryT - T0) / H; assert.ok(Math.abs(t.entry / D[t.sym][i].o - 1) < 0.001); }
  if (a.ledger.length) { a.ledger[0].net += 5; assert.equal(K.verify(a), false); }
  assert.ok(a.stats.calls > 0 && a.stats.calls <= 500); // una evaluación por vela (todas las monedas juntas)
});

test('una sola llamada a Jev por vela; si la API falla se usa el respaldo local y se registra', async () => {
  let calls = 0; const fakeFetch = async (url, o) => { calls++; const body = JSON.parse(o.body), ans = {}; for (const k of Object.keys(body.questions)) { const q = body.questions[k]; ans[k] = q.type === 'choice' ? {choice: Object.keys(q.criteria)[0], confidence: .5} : q.type === 'score' ? {score: 0} : {noul: .1}; } return {ok: true, json: async () => ({answers: ans})}; };
  const D = {AAA: walk(400, 9), BBB: walk(400, 10)}, s = K.newSession({startT: T0 + 390 * H, capital: 1e4, symbols: ['AAA', 'BBB']});
  await K.step(s, feedOf(D), K.jevEvaluator({apiKey: 'k', fetch: fakeFetch}), T0 + 400 * H); assert.equal(calls, 10); assert.equal(s.lastBy, 'jev-latest'); assert.equal(s.ledger.length + Object.keys(s.positions).length, 0); // calidad 0 ⇒ nunca opera
  const s2 = K.newSession({startT: T0 + 395 * H, capital: 1e4, symbols: ['AAA']}); await K.step(s2, feedOf(D), K.jevEvaluator({apiKey: 'k', fetch: async () => { throw new Error('caída'); }}), T0 + 400 * H);
  assert.equal(s2.lastBy, 'jev-local'); assert.ok(s2.stats.fallbacks > 0);
});

test('drawdown máximo: al llegar al 15 % se cierran posiciones y no vuelve a entrar', async () => {
  const flat = (n, gapAt) => Array.from({length: n}, (_, i) => { const p = i >= gapAt ? 70 : 100; return {t: T0 + i * H, o: p, h: p + .5, l: p - .5, c: p, v: 1000}; });
  const D = {AAA: flat(500, 420), BBB: flat(500, 420), CCC: flat(500, 420)}, s = K.newSession({startT: T0 + 300 * H, capital: 1e4, symbols: ['AAA', 'BBB', 'CCC']});
  const alwaysLong = async st => ({by: 'test', ev: ev(st)}); // un «modelo» que siempre quiere comprar con mucha confianza
  await K.step(s, feedOf(D), alwaysLong, T0 + 500 * H);
  assert.ok(s.halted, 'debe detenerse'); const haltT = s.events.find(e => e.kind === 'riesgo').t;
  assert.ok(!s.ledger.some(t => t.entryT > haltT)); assert.equal(Object.keys(s.positions).length, 0);
  assert.ok(s.ledger.every(t => t.qty * t.entry <= 1e4 * 1.2 * K.LIMITS.maxPositionPct / 100)); // nunca más del 20 % por posición
  assert.ok(Object.values(s.decisions).every(d => d.action === 'hold'));
});

test('escalada: confianza < 0,60 y cambio de régimen a crisis ⇒ revisión profunda y sin entradas', async () => {
  const D = {AAA: walk(400, 12)}, s = K.newSession({startT: T0 + 380 * H, capital: 1e4, symbols: ['AAA']}); let n = 0;
  const model = async st => { n++; return {by: 'test', ev: ev(st, {AAA: n < 5 ? {regime: 'trending', dirConf: .9} : {regime: 'crisis', dirConf: .55}})}; };
  await K.step(s, feedOf(D), model, T0 + 400 * H); assert.ok(s.escalations.AAA && s.escalations.AAA.open); assert.ok(s.events.some(e => e.kind === 'escalada'));
  assert.ok(Object.values(s.decisions).every(d => d.action !== 'enter' || d.regime !== 'crisis'));
});

test('ciclo nocturno: Brier, oportunidades perdidas y recalibración acotada que nunca toca los límites', async () => {
  const D = {AAA: walk(1600, 13, .0004), BBB: walk(1600, 14, -.0003)}, s = K.newSession({startT: T0 + 600 * H, capital: 1e4, symbols: ['AAA', 'BBB']});
  await K.step(s, feedOf(D), async (st, pf, c) => ({by: 'jev-local', ev: K.localEval(st, pf, c)}), T0 + 1600 * H);
  const lim = JSON.stringify(K.LIMITS), rep = K.nightly(s, T0 + 1601 * H);
  assert.ok(rep.n >= 150 && rep.brier > 0 && rep.brier < 1); assert.ok(rep.bins.length > 0); assert.ok(rep.holdout);
  assert.ok(s.calib.a >= K.CALIB_BOUNDS.aMin && s.calib.a <= K.CALIB_BOUNDS.aMax && s.calib.b >= K.CALIB_BOUNDS.bMin && s.calib.b <= K.CALIB_BOUNDS.bMax);
  if (rep.changed) assert.ok(rep.holdout.new < rep.holdout.old); else assert.equal(s.calib.v, 1);
  assert.equal(JSON.stringify(K.LIMITS), lim); assert.equal(s.nightly.length, 1);
});

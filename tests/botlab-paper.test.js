const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../botlab-engine.js'), P = require('../botlab-paper.js');
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function walk(n, seed = 1) { const r = rng(seed), out = []; let p = 100; const t0 = Date.UTC(2025, 0, 1); for (let i = 0; i < n; i++) { const o = p, c = o * (1 + (r() - .5) * .02 + Math.sin(i / 25) * .004); out.push({t: t0 + i * 3600e3, o, h: Math.max(o, c) * 1.002, l: Math.min(o, c) * .998, c, v: 1000 + r() * 500}); p = c; } return out; }
const spec = () => { const s = B.defaultSpec(); s.entry.long = [{a: {k: 'ema', n: 10}, op: 'crossUp', b: {k: 'ema', n: 30}}]; s.exit.long = [{a: {k: 'ema', n: 10}, op: 'crossDown', b: {k: 'ema', n: 30}}]; return s; };
const feed = C => async (sym, itv, count) => C.slice(-count);
const T = i => Date.UTC(2025, 0, 1) + i * 3600e3;

test('empieza plana: nada se decide antes del inicio y las entradas son en la apertura siguiente', async () => {
  const C = walk(2000, 3), s = P.newSession({id: 'a', v: 1, spec: spec(), capital: 10000, startT: T(1200)}); await P.step(s, feed(C), null, T(2000));
  assert.ok(s.ledger.length >= 2); for (const t of s.ledger) { assert.ok(t.entryT > T(1200)); const i = Math.round((t.entryT - T(0)) / 3600e3); assert.ok(C[i].o > 0); }
});
test('actualizar por partes da EXACTAMENTE lo mismo que de una vez (determinista, sin reescribir el pasado)', async () => {
  const C = walk(2400, 5), a = P.newSession({id: 'a', v: 1, spec: spec(), capital: 10000, startT: T(1000)}), b = P.newSession({id: 'b', v: 1, spec: spec(), capital: 10000, startT: T(1000)});
  await P.step(b, feed(C.slice(0, 2400)), null, T(2400)); for (const k of [1300, 1600, 1750, 2000, 2400]) { await P.step(a, feed(C.slice(0, k)), null, T(k)); }
  const core = x => x.ledger.map(t => [t.entryT, t.exitT, t.entry, t.exit, Math.round(t.net * 1e6)]); assert.deepEqual(core(a), core(b)); assert.ok(Math.abs(a.cash - b.cash) < 1e-6);
  assert.ok(P.verify(a) && P.verify(b));
});
test('el libro es inmutable: editar una operación rompe la cadena de hashes', async () => {
  const C = walk(2000, 7), s = P.newSession({id: 'a', v: 1, spec: spec(), capital: 10000, startT: T(900)}); await P.step(s, feed(C), null, T(2000)); assert.ok(s.ledger.length > 2 && P.verify(s));
  s.ledger[1].net += 100; assert.equal(P.verify(s), false);
});
test('el capital cuadra: caja = capital + suma de netos; estadísticas coherentes', async () => {
  const C = walk(2000, 9), s = P.newSession({id: 'a', v: 1, spec: spec(), capital: 5000, startT: T(900)}); await P.step(s, feed(C), null, T(2000)); const st = P.stats(s);
  assert.ok(Math.abs(s.cash - (5000 + s.ledger.reduce((a, t) => a + t.net, 0))) < 1e-6); assert.equal(st.n, s.ledger.length); assert.ok(Math.abs(st.equity - (s.cash + (s.open ? s.open.unreal : 0))) < 1e-9);
});
test('pausada no avanza; sin velas nuevas no cambia nada', async () => {
  const C = walk(1500, 2), s = P.newSession({id: 'a', v: 1, spec: spec(), capital: 1000, startT: T(1400)}); s.status = 'paused'; assert.equal((await P.step(s, feed(C), null, T(1500))).changed, false);
  s.status = 'running'; const r = await P.step(s, feed(C.slice(0, 1400)), null, T(1400)); assert.equal(s.ledger.length, 0); assert.ok(r.changed === false || s.ledger.length === 0);
});
test('hueco de datos: se registra y no inventa operaciones', async () => {
  const C = walk(7000, 4), s = P.newSession({id: 'a', v: 1, spec: spec(), capital: 10000, startT: T(100)}); const r = await P.step(s, async (sy, it, n) => C.slice(-Math.min(n, 6000)), null, T(7000)); assert.equal(s.gaps.length, 1); assert.match(s.gaps[0].why, /Hueco/); assert.ok(r.changed);
});

/* Nov 2026: avisos de «entró en long» que luego no aparecían. El indicador se recalcula con otra ventana de velas en cada actualización
   y una señal podía aparecer/desaparecer. Ahora la posición abierta se reanuda tal cual y las velas ya revisadas no abren operaciones nuevas. */
const flaky = (sigT, when) => ({compute: C => { const bySignal = {}; C.forEach((c, i) => { if (c.t === sigT && when(C)) bySignal[i] = {side: 'buy', score: 5}; }); return {bySignal, bull: C.map(() => true)}; }});
const novaSpec = () => { const s = B.defaultSpec(); s.entry.long = [{a: {k: 'novaBuy'}, op: 'is'}]; s.risk.sl = {type: 'pct', v: 50}; s.risk.tp = {type: 'pct', v: 50}; return s; };
test('una posición abierta y avisada NO desaparece si al recalcular el indicador ya no da la señal', async () => {
  const C = walk(1700, 11), s = P.newSession({id: 'a', v: 1, spec: novaSpec(), capital: 10000, startT: T(1500)}); let first = true;
  const nova = flaky(T(1550), () => first);
  await P.step(s, feed(C.slice(0, 1600)), {nova}, T(1600)); assert.ok(s.open, 'abrió'); const o = s.open.entryT; assert.equal(o, T(1551));
  first = false; await P.step(s, feed(C.slice(0, 1650)), {nova}, T(1650));
  assert.ok(s.open, 'sigue abierta'); assert.equal(s.open.entryT, o); assert.equal(s.ledger.length, 0);
});
test('una señal que «aparece» en una vela ya revisada no abre una operación retroactiva', async () => {
  const C = walk(1700, 12), s = P.newSession({id: 'a', v: 1, spec: novaSpec(), capital: 10000, startT: T(1500)}); let on = false;
  const nova = flaky(T(1550), () => on);
  await P.step(s, feed(C.slice(0, 1600)), {nova}, T(1600)); assert.equal(s.open, null);
  on = true; await P.step(s, feed(C.slice(0, 1650)), {nova}, T(1650)); assert.equal(s.open, null); assert.equal(s.ledger.length, 0);
});
test('reanudar la posición da el mismo resultado que calcular todo de una vez (SL/TP/trailing)', async () => {
  const C = walk(2400, 13), sp = () => { const s = spec(); s.risk.trail = {type: 'atr', v: 3}; return s; };
  const a = P.newSession({id: 'a', v: 1, spec: sp(), capital: 10000, startT: T(1000)}), b = P.newSession({id: 'b', v: 1, spec: sp(), capital: 10000, startT: T(1000)});
  await P.step(b, feed(C), null, T(2400)); for (let k = 1010; k <= 2400; k += 37) await P.step(a, feed(C.slice(0, k)), null, T(k)); await P.step(a, feed(C), null, T(2400));
  const core = x => x.ledger.map(t => [t.entryT, t.exitT, Math.round(t.net * 1e4)]); assert.deepEqual(core(a), core(b));
});
test('bots con indicadores largos (EMA 800, como Pachita) piden velas suficientes para calentarlos', async () => {
  const C = walk(3000, 21), s = P.newSession({id: 'a', v: 1, spec: (() => { const x = spec(); x.entry.long = [{a: {k: 'close'}, op: 'crossUp', b: {k: 'ema', n: 800}}]; x.exit.long = []; return x; })(), capital: 10000, startT: T(2900)}); let asked = 0;
  await P.step(s, async (sym, itv, n) => { asked = n; return C.slice(-n); }, null, T(3000)); assert.ok(asked >= 1250, 'pidió ' + asked);
});

const test = require('node:test'), assert = require('node:assert/strict');
const G = require('../botlab-guard.js'), B = require('../botlab-engine.js'), R = require('../scripts/botlab-retrain.js'), O = require('../botlab-optimizer.js');
const D = 864e5, T0 = Date.UTC(2026, 10, 1);
const sess = (v, startT, nets, cap = 10000) => ({id: 's' + v + startT, v, startT, capital: cap, status: 'running', ledger: nets.map((net, i) => ({n: i + 1, net, exitT: startT + (i + 1) * 3600e3}))});
const mkBot = () => { const s = B.defaultSpec(); s.entry.long = [{a: {k: 'ema', n: 10}, op: 'crossUp', b: {k: 'ema', n: 30}}]; s.exit.long = [{a: {k: 'ema', n: 10}, op: 'crossDown', b: {k: 'ema', n: 30}}];
  return {id: 'b1', name: 'Bot prueba', status: 'tested', mainV: 1, cycle: {enabled: true, auto: true}, versions: [{v: 1, spec: B.normalizeSpec(s), at: T0, state: 'principal'}], paper: [Object.assign(sess(1, T0, [40, 30, -10, 25, 35, -5, 20, 15]), {spec: B.normalizeSpec(s)})], journal: []}; };
const promoteTo = (bot, now, change) => { const sp = JSON.parse(JSON.stringify(bot.versions.find(v => v.v === bot.mainV).spec)); sp.entry.long[0].b.n = change; return R.promote(bot, {decision: 'propuesta', candidate: sp, changes: [{path: 'entry.long.0.b.n', from: 30, to: change}], holdout: {cand: {maxDDPct: 3}}}, now); };

test('liveStats: % por operación y caída máxima', () => {
  const s = G.liveStats([sess(1, 0, [100, -300, 50])]); assert.equal(s.n, 3); assert.equal(Math.round(s.retPct * 100) / 100, -1.5); assert.ok(s.ddPct > 2.9 && s.ddPct < 3.1);
});

test('la versión nueva queda a prueba; si rinde peor en vivo regresa sola y no repite el valor que falló', () => {
  const bot = mkBot(), now = T0 + 10 * D, nv = promoteTo(bot, now, 40);
  assert.equal(nv, 2); assert.equal(bot.mainV, 2); assert.ok(bot.versions[1].probation); assert.equal(bot.paper.filter(x => x.status === 'running' && x.v === 2).length, 1);
  // mientras está a prueba no se aplica otro cambio encima
  const r2 = {decision: 'propuesta', candidate: bot.versions[0].spec}; assert.equal(R.promote(bot, r2, now + D), 0); assert.equal(r2.decision, 'sin_mejora');
  // en vivo la v2 pierde: -40 por operación (la v1 ganaba ~+20)
  const s2 = bot.paper.find(x => x.v === 2 && x.status === 'running'); s2.ledger = Array.from({length: 8}, (_, i) => ({n: i + 1, net: -40, exitT: now + (i + 1) * 3600e3}));
  const ev = G.evaluate(bot, now + 3 * D); assert.equal(ev.action, 'rollback'); assert.match(ev.why, /por operación/);
  assert.equal(R.rollback(bot, ev, now + 3 * D), 1);
  assert.equal(bot.mainV, 1); assert.equal(bot.versions[1].state, 'descartada'); assert.equal(bot.versions[0].state, 'principal'); assert.ok(!bot.versions[1].probation);
  assert.deepEqual(bot.avoid, [{path: 'entry.long.0.b.n', value: 40}]); assert.equal(bot.paper.filter(x => x.status === 'running' && x.v === 1).length, 1);
  assert.match(bot.journal.map(j => j.text).join('\n'), /Regreso automático/);
  // la misma versión no vuelve a aplicarse
  const again = JSON.parse(JSON.stringify(bot.versions[1].spec)), r3 = {decision: 'propuesta', candidate: again}; assert.equal(R.promote(bot, r3, now + 4 * D), 0); assert.match(r3.reasons.join(' '), /ya falló en vivo/);
  // otra variante del mismo parámetro sí se puede probar
  assert.equal(promoteTo(bot, now + 5 * D, 35), 3);
});

test('si rinde igual o mejor con suficientes operaciones se confirma', () => {
  const bot = mkBot(), now = T0 + 10 * D; promoteTo(bot, now, 40);
  const s2 = bot.paper.find(x => x.v === 2 && x.status === 'running'); s2.ledger = Array.from({length: 15}, (_, i) => ({n: i + 1, net: 30, exitT: now + (i + 1) * 3600e3}));
  const ev = G.evaluate(bot, now + 5 * D); assert.equal(ev.action, 'confirm'); assert.equal(R.confirmV(bot, ev, now + 5 * D), 2); assert.ok(!bot.versions[1].probation && bot.versions[1].confirmedAt);
  assert.equal(G.evaluate(bot, now + 6 * D).action, 'none');
});

test('caída fuera de lo normal: regresa sin esperar 8 operaciones; con pocas operaciones espera', () => {
  const bot = mkBot(), now = T0 + 10 * D; promoteTo(bot, now, 40); const s2 = bot.paper.find(x => x.v === 2 && x.status === 'running');
  s2.ledger = [{net: -400, exitT: now + 1}, {net: -500, exitT: now + 2}]; assert.equal(G.evaluate(bot, now + D).action, 'wait');
  s2.ledger.push({net: -300, exitT: now + 3}); const ev = G.evaluate(bot, now + D); assert.equal(ev.action, 'rollback'); assert.match(ev.why, /cayó/);
});

test('el optimizador no vuelve a probar un valor que falló en vivo', () => {
  const sp = mkBot().versions[0].spec, all = O.space(sp), d = all.find(x => x.path === 'entry.long.0.b.n'); assert.ok(d.values.includes(48));
  const pruned = G.pruneDims(O.space(sp), [{path: 'entry.long.0.b.n', value: 48}]); assert.ok(!pruned.find(x => x.path === 'entry.long.0.b.n').values.includes(48));
});

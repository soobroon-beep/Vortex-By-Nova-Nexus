// Caja inteligente con la app cerrada: el motor (scripts/ind-alerts.js · smartJob) y el servidor de avisos (mergeInd / sanInd)
const test = require('node:test'), assert = require('node:assert');
const SM = require('../smart-box.js'), IA = require('../scripts/ind-alerts.js');
const W = () => import('../worker/push-alerts.mjs');
const bars = (t0, ps) => ps.map((p, i) => ({t: t0 + i * 6e4, o: i ? ps[i - 1] : p, h: Math.max(p, i ? ps[i - 1] : p) + .05, l: Math.min(p, i ? ps[i - 1] : p) - .05, c: p, v: 1}));
test('motor: avisa la entrada, el stop a la entrada y guarda el avance', async () => {
  const t0 = 1.7e12, spec = SM.toSpec({side: 1, entry: 100, stop: 98, target: 110}, {phase: 'wait'});
  let cs = bars(t0, Array.from({length: 40}, () => 101)); const getK = async () => cs;
  let r = await IA.smartJob({id: 'smA', symbol: 'BTCUSDT', spec}, getK); assert.ok(r.save && !r.hit && r.spec.at === cs[39].t, 'empieza a vigilar desde ahora');
  cs = cs.concat(bars(cs[39].t + 6e4, [100.8, 100, 100.4])); r = await IA.smartJob({id: 'smA', symbol: 'BTCUSDT', spec: r.spec}, getK);
  assert.ok(r.hit && /entrada \(100/.test(r.info) && r.spec.ph === 'live', r.info);
  cs = cs.concat(bars(cs[cs.length - 1].t + 6e4, [101, 102.2, 102.5])); r = await IA.smartJob({id: 'smA', symbol: 'BTCUSDT', spec: r.spec}, getK);
  assert.ok(r.hit && /mueve tu stop a la entrada/.test(r.info) && r.spec.s >= 100, r.info);
  assert.ok(JSON.stringify(r.spec).length <= 400);
});
test('servidor: acepta cajas y su avance gana mientras no cambies el plan', async () => {
  const {sanInd, mergeInd} = await W(), plan = SM.toSpec({side: 1, entry: 100, stop: 98, target: 110}, {phase: 'wait'});
  const a = {id: 'smB', symbol: 'BTCUSDT', interval: '1m', src: 'smart', spec: plan, on: true, firedAt: 0};
  assert.ok(sanInd(a)); const srv = Object.assign({}, sanInd(a), {spec: Object.assign({}, plan, {s: 100.1, ph: 'live', at: 5}), firedAt: 9, firedInfo: 'x'});
  const m1 = mergeInd([a], [srv], 1); assert.equal(m1.ind[0].spec.s, 100.1); assert.equal(m1.back.length, 1); assert.equal(m1.back[0].spec.ph, 'live');
  const edited = Object.assign({}, a, {spec: Object.assign({}, plan, {t: 120})}), m2 = mergeInd([edited], [srv], 1); assert.equal(m2.ind[0].spec.t, 120); assert.equal(m2.ind[0].spec.ph, 'wait');
});

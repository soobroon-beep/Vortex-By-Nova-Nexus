const test = require('node:test'), assert = require('node:assert');
const S = require('../smart-box.js');
const bar = (t, o, h, l, c) => ({t, o, h, l, c, v: 100});
function series() { // baja a un mínimo en 95, rebota a 101, retrocede a 98 (mínimo más alto) y sube; resistencia previa en 106
  const p = []; for (let i = 0; i < 40; i++) p.push(110 - i * .1); for (let i = 0; i < 10; i++) p.push(106 - i * 1.1); for (let i = 0; i < 8; i++) p.push(95 + i * .8); for (let i = 0; i < 5; i++) p.push(101 - i * .7); for (let i = 0; i < 6; i++) p.push(98 + i * .5);
  return p.map((c, i) => bar(i * 36e5, i ? p[i - 1] : c, Math.max(c, i ? p[i - 1] : c) + .3, Math.min(c, i ? p[i - 1] : c) - .3, c));
}
test('sugerencia en largo: stop debajo de un mínimo, objetivo arriba con al menos 1.5R', () => {
  const c = series(), E = c[c.length - 1].c, s = S.suggest(c, {side: 1, entry: E});
  assert.ok(s.stop < E && s.target > E, JSON.stringify(s)); assert.ok(s.rr >= 1.5 - 1e-9); assert.ok(s.why.length >= 2); assert.ok(s.t2 > s.target);
});
test('sugerencia en corto: todo al revés', () => {
  const c = series(), E = c[c.length - 1].c, s = S.suggest(c, {side: -1, entry: E}); assert.ok(s.stop > E && s.target < E);
});
test('gestión: espera la entrada, mueve a entrada en +1R, sigue al precio y sale con ganancia', () => {
  const box = {side: 1, entry: 100, stop: 98, target: 110}, t0 = 1e12; let st = {at: t0}, stop = box.stop, all = [];
  const run = k => { const r = S.manage([k], {...box, stop}, st); st = r.st; stop = r.stop; all.push(...r.events.map(e => e.k)); };
  run(bar(t0, 101, 101.5, 100.5, 101)); assert.equal(st.phase, 'wait');
  run(bar(t0 + 1, 101, 101, 99.8, 100.2)); assert.equal(st.phase, 'live');
  run(bar(t0 + 2, 100.2, 102.3, 100.1, 102.1)); assert.ok(stop >= 100, 'stop en la entrada tras +1R');
  run(bar(t0 + 3, 102, 106, 101.9, 105.8)); assert.ok(stop > 100.5, 'el stop siguió al precio');
  const locked = stop; run(bar(t0 + 4, 105.8, 105.9, locked - .1, locked)); assert.equal(st.phase, 'out'); assert.equal(st.res, 'trail');
  assert.deepStrictEqual(all.filter(k => k === 'in' || k === 'be' || k === 'exit').slice(0, 3), ['in', 'be', 'exit']);
});
test('gestión: el stop nunca se mueve en contra y avisa cerca del stop', () => {
  const box = {side: 1, entry: 100, stop: 98, target: 110}; let st = {at: 1}, stop = 98, ev = [];
  for (const k of [bar(1, 100, 100.4, 99.9, 100), bar(2, 100, 100, 98.5, 98.5)]) { const r = S.manage([k], {...box, stop}, st); st = r.st; stop = r.stop; ev.push(...r.events.map(e => e.k)); }
  assert.equal(stop, 98); assert.ok(ev.includes('near'));
  const r = S.manage([bar(3, 98.5, 98.6, 97.9, 98)], {...box, stop}, st); assert.equal(r.st.res, 'sl');
});
test('gestión: revisar la misma vela varias veces no cierra la caja por un mínimo de antes de subir el stop', () => {
  const box = {side: 1, entry: 100, stop: 98, target: 120}, t = 5; let st = {at: t}, stop = 98;
  const run = k => { const r = S.manage([k], {...box, stop}, st); st = r.st; stop = r.stop; };
  run(bar(t, 100, 100.2, 99.9, 100.1)); assert.equal(st.phase, 'live');
  run(bar(t, 100, 102.4, 99.9, 102.2)); assert.ok(stop >= 100, 'stop en la entrada'); // misma vela, subió
  run(bar(t, 100, 102.5, 99.9, 102.3)); assert.equal(st.phase, 'live', 'el mínimo viejo (99.9) no cuenta');
  run(bar(t, 100, 102.5, 99.5, 99.6)); assert.equal(st.phase, 'out', 'un mínimo NUEVO sí la cierra');
});

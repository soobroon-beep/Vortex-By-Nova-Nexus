// Vigía de VORTEX: unión de hallazgos con tus decisiones y resumen para Discord
const test = require('node:test'), assert = require('node:assert');
const V = require('../scripts/vigia.js');
const f = (t, x = {}) => Object.assign({area: 'Botones', kind: 'dead', sev: 'baja', title: t, ev: 'e'}, x);

test('hallazgo nuevo, repetido, descartado y resuelto', () => {
  let r = V.merge([], [f('El botón «A» no hace nada'), f('Error X', {kind: 'js', area: 'Código', sev: 'alta'})], 1);
  assert.equal(r.items.length, 2); assert.equal(r.fresh.length, 2);
  const a = r.items.find(x => x.title.includes('«A»')); a.status = 'descartado';
  r = V.merge(r.items, [f('El botón «A» no hace nada'), f('Error X', {kind: 'js', area: 'Código', sev: 'alta'})], 2);
  assert.equal(r.fresh.length, 0, 'lo repetido no es nuevo');
  assert.equal(r.items.find(x => x.id === a.id).status, 'descartado', 'lo descartado no vuelve');
  assert.equal(r.items.find(x => x.kind === 'js').seen, 2);
  r = V.merge(r.items, [], 3); r = V.merge(r.items, [], 4);
  assert.equal(r.items.find(x => x.kind === 'js').status, 'resuelto', 'si deja de aparecer se marca resuelto');
  r = V.merge(r.items, [f('Error X', {kind: 'js', area: 'Código'})], 5);
  assert.equal(r.items.find(x => x.kind === 'js').status, 'nuevo', 'si reaparece vuelve a nuevo'); assert.equal(r.fresh.length, 1);
});

test('la clave ignora números y direcciones que cambian', () => {
  assert.equal(V.keyOf(f('x', {sig: 'fallo en https://a.b/c?1 línea 33'})), V.keyOf(f('x', {sig: 'fallo en https://a.b/d?2 línea 41'})));
});

test('aprendizaje y mensaje de Discord', () => {
  const items = [{id: '1', area: 'Botones', status: 'descartado', title: 'Botón Z', sev: 'baja'}, {id: '2', area: 'Código', status: 'aprobado', title: 'Error', sev: 'alta'}, {id: '3', area: 'Código', status: 'nuevo', title: 'Otro', sev: 'alta'}];
  const l = V.learnOf(items); assert.deepEqual(l.by.Botones, {ok: 0, no: 1}); assert.deepEqual(l.dismissed, ['Botón Z']);
  const p = V.discordPayload({at: Date.now(), items, summary: 'Bien'}, [items[2]], '');
  assert.match(p.embeds[0].description, /Pendientes por decidir: \*\*1\*\*/); assert.equal(p.username, 'Vigía de VORTEX');
  assert.ok(V.SKIP.test('Borrar todo') && V.SKIP.test('Comprar') && !V.SKIP.test('Indicadores'));
});

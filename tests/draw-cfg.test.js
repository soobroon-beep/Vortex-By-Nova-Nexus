'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), C = require('../draw-cfg.js');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('todas las herramientas del catálogo tienen ajustes propios', () => {
  const tools = [...app.matchAll(/^\s+\['([a-z0-9]+)', '[^']+', '[^']*', IC\.[a-z0-9]+\]/gm)].map(m => m[1]);
  assert.ok(tools.length >= 50, 'catálogo leído: ' + tools.length);
  for (const k of tools) { const d = k === 'highlighter' ? {type: 'brush', hl: true} : {type: k}; assert.ok(C.schema(d).some(f => f.k), 'sin ajustes: ' + k); }
});
test('los valores de fábrica dejan los dibujos anteriores como estaban', () => {
  assert.deepEqual(C.levelsOf({type: 'fib'}), [0, .236, .382, .5, .618, .786, 1]);
  assert.deepEqual(C.levelsOf({type: 'fibext'}), [0, .618, 1, 1.272, 1.618, 2.618]);
  assert.equal(C.get({type: 'fib'}, 'xr'), true); assert.equal(C.get({type: 'fib'}, 'fo'), 6); assert.equal(C.get({type: 'fib'}, 'mc'), false);
  assert.equal(C.get({type: 'rect'}, 'fo'), 13); assert.equal(C.get({type: 'long'}, 'rr'), 2); assert.equal(C.get({type: 'short'}, 'zo'), 16);
  assert.equal(C.get({type: 'brush'}, 'op'), 100); assert.equal(C.get({type: 'brush', hl: true}, 'op'), 35); assert.equal(C.get({type: 'text'}, 'bo'), true);
  assert.equal(C.get({type: 'rect'}, 'lv'), undefined); assert.equal(C.get({type: 'trend'}, 'fl'), undefined);
});
test('set guarda solo lo que cambia y no modifica el dibujo', () => {
  const d = {type: 'fib'};
  const o = C.set(d, 'lv', [1, .5, 0, .5]); assert.deepEqual(o, {lv: [0, .5, 1]}); assert.equal(d.o, undefined);
  assert.equal(C.set({type: 'fib', o}, 'lv', [0, .236, .382, .5, .618, .786, 1]), null);
  assert.deepEqual(C.set({type: 'rect'}, 'fl', false), {fl: false}); assert.equal(C.set({type: 'rect', o: {fl: false}}, 'fl', true), null);
  assert.deepEqual(C.set({type: 'fib', o: {mc: true}}, 'lk', {'0.5': '#ff0000'}), {mc: true, lk: {'0.5': '#ff0000'}});
  assert.deepEqual(C.levelsOf({type: 'gannbox', o: {lv: []}}), []);
});
test('color de cada nivel: propio > paleta por nivel > color del dibujo', () => {
  assert.equal(C.levelColor({type: 'fib'}, .618, '#abcdef'), '#abcdef');
  assert.equal(C.levelColor({type: 'fib', o: {mc: true}}, .618, '#abcdef'), '#089981');
  assert.equal(C.levelColor({type: 'fib', o: {mc: true, lk: {'0.618': '#111111'}}}, .618, '#abcdef'), '#111111');
  assert.match(C.levelColor({type: 'fib', o: {mc: true, lv: [0, .886, 1]}}, .886, '#abcdef'), /^#[0-9a-f]{6}$/);
  assert.equal(C.levelLabel({type: 'gannfan'}, 1), '1x1'); assert.equal(C.levelLabel({type: 'gannfan'}, .3333), '1x3'); assert.equal(C.levelLabel({type: 'fib'}, .5), '0.5');
});
test('sanitize descarta lo que no sea un ajuste simple', () => {
  assert.equal(C.sanitize(null), null); assert.equal(C.sanitize([1]), null); assert.equal(C.sanitize({}), null);
  assert.deepEqual(C.sanitize({fl: false, fo: 20, fc: '#00ff00', lp: 'r', lv: [1, 0, 'x', .5, .5, Infinity], lk: {'0.5': '#ff0000', 'x': '#ff0000', '1': 'rojo'}, 'BAD-KEY': 1, fn: () => 1, big: 1e9, s: '<script>'}),
    {fl: false, fo: 20, fc: '#00ff00', lp: 'r', lv: [0, .5, 1], lk: {'0.5': '#ff0000'}});
});
test('app.js usa el esquema: saneado, plantillas, última configuración y vista previa', () => {
  assert.match(app, /if \(o\.o != null\) \{ const x = CCTDrawCfg\.sanitize\(o\.o\)/);
  assert.match(app, /if \(d\.o\) o\.o = d\.o; return o; \};/);
  assert.match(app, /withLastStyle\(\{id: '_', type: drawTool\}\)/);
});

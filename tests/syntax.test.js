'use strict';
// Cada archivo de la app debe compilar en el navegador (p. ej. sin nombres declarados dos veces): si no, la app no carga.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..'), html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="([^"]+\.js)"/g)].map(m => m[1]).filter(f => fs.existsSync(path.join(root, f)));
test('index.html carga scripts que existen', () => assert.ok(files.length > 10));
for (const f of files) test(`compila: ${f}`, () => { assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(root, f), 'utf8'), {filename: f})); });

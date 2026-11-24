const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const app = fs.readFileSync(__dirname + '/../app.js', 'utf8');

test('varias listas de seguimiento: saneado, sincronización y botón «Listas»', () => {
  assert.match(app, /wlists: \[\], wlCur: ''/);                       // valores por defecto
  assert.match(app, /o\.wlists = wl; o\.wlCur = /);                     // saneado
  assert.match(app, /K_SKIP = new Set\(\[[^\]]*'wlists', 'wlCur'/);    // viajan con la lista (listRev), no por partes
  assert.match(app, /const sameList = \(L\.wlCur \|\| ''\) === \(remote\.wlCur \|\| ''\)/); // no se mezclan monedas de listas distintas
  assert.match(app, /function wlSwitch\(id\)/);
  assert.match(app, /id = 'wlListsBtn'/);
  assert.match(app, /!o\.symbols\.length && !o\.wlists\.length/);       // una lista nueva puede quedar vacía
});

test('niveles exactos en los ajustes de cada herramienta', () => {
  assert.match(app, /function dLevelKeys\(d\)/);
  assert.match(app, /\['a', 'Entrada', d\.a\.p\], \['sp', 'Stop loss', st\], \['b', 'Take profit \(objetivo\)', d\.b\.p\]/);
  assert.match(app, /if \(k === 'lvok'\) \{ dApplyLevels\(\); return; \}/);
});

test('hasta 10 gráficos con asistente (moneda y plantilla de cada uno)', () => {
  assert.match(app, /const LAY_PANES = \{[^}]*'10': 9\}/);
  assert.match(app, /const BIG_GRID = \{'6': \[3, false\], '7': \[4, true\], '8': \[4, false\], '9': \[5, true\], '10': \[5, false\]\}/);
  assert.match(app, /function paneWizard\(ly\)/);
  assert.match(app, /e\.data\.cct !== 'paneSetup'/);
  assert.match(app, /Math\.min\(10, Math\.max\(2/);
});

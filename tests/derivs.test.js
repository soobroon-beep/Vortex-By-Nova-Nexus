const test = require('node:test'), assert = require('node:assert');
const D = require('../derivs.js');
test('periodo según temporalidad', () => { assert.equal(D.periodFor(6e4), '5m'); assert.equal(D.periodFor(36e5), '1h'); assert.equal(D.periodFor(864e5 * 7), '1d'); assert.equal(D.periodFor(3 * 36e5), '2h'); });
test('align no mira al futuro y rellena dentro del periodo', () => {
  const iv = 36e5, c = [0, 1, 2, 3].map(i => ({t: i * iv})), pts = [[0, 10], [2 * iv + 1000, 20]];
  assert.deepEqual(D.align(pts, c, iv, 36e5 * 4), [10, 10, 20, 20]);
  assert.deepEqual(D.align([[5 * iv, 1]], c, iv), [null, null, null, null]);
});
test('lectura educativa', () => {
  assert.match(D.reading({oiChg: 3, fund: .01, ls: 1}, 2), /dinero nuevo/);
  assert.match(D.reading({oiChg: -3, fund: -.05, ls: .5}, 2), /shorts/);
});

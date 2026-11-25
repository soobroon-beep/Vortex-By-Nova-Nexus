const test = require('node:test'), assert = require('node:assert');
const M = require('../market-map.js');
test('radar: el acomodo llena el área sin huecos ni encimarse', () => {
  const items = [500, 300, 120, 80, 40, 30, 20, 10, 5, 2].map((v, i) => ({id: i, v}));
  const R = M.layout(items, 0, 0, 400, 300); assert.equal(R.length, items.length);
  const area = R.reduce((a, r) => a + r.w * r.h, 0); assert.ok(Math.abs(area - 400 * 300) < 1, 'suma de áreas = área total');
  for (const r of R) { assert.ok(r.x >= -1e-6 && r.y >= -1e-6 && r.x + r.w <= 400 + 1e-6 && r.y + r.h <= 300 + 1e-6); }
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], b = R[j], ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); assert.ok(ox <= 1e-6 || oy <= 1e-6, 'sin encimarse'); }
  const big = R.find(r => r.id === 0); assert.ok(big.w / big.h < 3 && big.h / big.w < 3, 'cuadros casi cuadrados');
});
test('radar: área proporcional al valor', () => {
  const R = M.layout([{id: 'a', v: 3}, {id: 'b', v: 1}], 0, 0, 100, 100), a = R.find(r => r.id === 'a'), b = R.find(r => r.id === 'b');
  assert.ok(Math.abs(a.w * a.h / (b.w * b.h) - 3) < 1e-6);
});
test('radar: color según el cambio (verde sube, rojo baja, gris sin dato)', () => {
  assert.match(M.tint(5, '24h'), /var\(--green\)/); assert.match(M.tint(-5, '24h'), /var\(--red\)/); assert.match(M.tint(null, '24h'), /var\(--muted\)/);
  const pct = s => +s.match(/(\d+)%/)[1]; assert.ok(pct(M.tint(9, '24h')) > pct(M.tint(1, '24h')), 'más movimiento = más intenso');
});

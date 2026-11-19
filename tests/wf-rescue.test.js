// Rescate de tareas: el Motor lanza el Taller de la Sala cuando GitHub se salta su horario.
const test = require('node:test'), assert = require('node:assert');
const WR = require('../scripts/wf-rescue.js');
const H = 36e5, NOW = Date.UTC(2026, 10, 19, 19, 38), iso = t => new Date(t).toISOString();
const EVERY = 190 * 6e4;

test('lleva más de 3 h 10 min sin lanzarse: toca', () => {
  assert.strictEqual(WR.due([{created_at: iso(NOW - 8.2 * H), status: 'completed'}], NOW, EVERY), true);
});
test('corrió hace poco: no toca', () => {
  assert.strictEqual(WR.due([{created_at: iso(NOW - 2 * H), status: 'completed'}], NOW, EVERY), false);
});
test('hay una en cola o corriendo: no se lanza otra', () => {
  assert.strictEqual(WR.due([{created_at: iso(NOW - 9 * H), status: 'queued'}], NOW, EVERY), false);
  assert.strictEqual(WR.due([{created_at: iso(NOW - 9 * H), status: 'in_progress'}], NOW, EVERY), false);
});
test('nunca ha corrido: toca', () => { assert.strictEqual(WR.due([], NOW, EVERY), true); });

test('rescue: pide la lista y lanza solo cuando toca', async () => {
  const calls = [];
  global.fetch = async (u, o = {}) => { calls.push([o.method || 'GET', String(u), o.body]);
    if (String(u).endsWith('/runs?per_page=5')) return {ok: true, json: async () => ({workflow_runs: [{created_at: iso(NOW - 8.2 * H), status: 'completed'}]})};
    return {ok: true, status: 204}; };
  assert.strictEqual(await WR.rescue('o/r', 'tok', 'sala-taller.yml', EVERY, NOW), 204);
  assert.deepStrictEqual(calls[1], ['POST', 'https://api.github.com/repos/o/r/actions/workflows/sala-taller.yml/dispatches', '{"ref":"main"}']);
  calls.length = 0;
  global.fetch = async u => { calls.push(String(u)); return {ok: true, json: async () => ({workflow_runs: [{created_at: iso(NOW - H), status: 'completed'}]})}; };
  assert.strictEqual(await WR.rescue('o/r', 'tok', 'sala-taller.yml', EVERY, NOW), null);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(await WR.rescue('', 'tok', 'x.yml', EVERY, NOW), null);
});

test('diaria: ya pasó su hora de hoy y no ha corrido → toca; si ya corrió hoy, no', () => {
  const rule = {daily: [6, 15]}, today = Date.UTC(2026, 10, 19, 6, 15);
  assert.strictEqual(WR.due([{created_at: iso(today - 15 * H), status: 'completed'}], today + 20 * 6e4, rule), true);
  assert.strictEqual(WR.due([{created_at: iso(today + 16 * 6e4), status: 'completed'}], today + 9 * H, rule), false);
  assert.strictEqual(WR.due([{created_at: iso(today - 15 * H), status: 'completed'}], today + 5 * 6e4, rule), false); // margen para que GitHub cumpla
  assert.strictEqual(WR.due([{created_at: iso(today - 15 * H), status: 'completed'}], today - H, rule), false); // aún no es su hora
});
test('todas las tareas vigiladas existen y se pueden lanzar a mano', () => {
  const fs = require('fs'), path = require('path');
  for (const j of WR.JOBS) {
    const y = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', j.wf), 'utf8');
    assert.match(y, /workflow_dispatch/, j.wf);
    assert.ok(j.every > 0 || (Array.isArray(j.daily) && j.daily.length === 2), j.wf);
  }
});
test('rescueAll: una tarea que falla no detiene a las demás', async () => {
  let n = 0; global.fetch = async u => { n++; if (String(u).includes('brain-sync')) throw new Error('red'); return {ok: false}; };
  const logs = []; await WR.rescueAll('o/r', 'tok', NOW, 'main', m => logs.push(m));
  assert.strictEqual(n, WR.JOBS.length); assert.ok(logs.some(l => l.startsWith('brain-sync.yml')));
});

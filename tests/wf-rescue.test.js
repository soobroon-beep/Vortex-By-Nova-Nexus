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

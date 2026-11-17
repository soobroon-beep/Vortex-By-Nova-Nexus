// Memoria compartida (worker/memoria.mjs): operaciones, MCP y rutas con llave
'use strict';
const test = require('node:test'), assert = require('node:assert');
const load = () => import('../worker/memoria.mjs');
function kv() { const m = new Map(); return {get: async (k, t) => { const v = m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, put: async (k, v) => { m.set(k, v); }, m}; }
const TOK = 'a'.repeat(40), req = (url, init) => new Request('https://x.dev' + url, init), post = (url, o) => req(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(o)});
test('guardar sesión, proyectos y contexto', async () => {
  const M = await load(), d = M.empty();
  M.addSession(d, {ia: 'ChatGPT-4o', proyecto: 'Vortex', resumen: 'Se agregó el heatmap\nmás texto', decisiones: '- premium\n- solo PC'}, 1000);
  M.upsertProject(d, {nombre: 'vortex', estado: 'activo', nota: 'falta móvil'}, 2000);
  assert.equal(d.log[0].ia, 'chatgpt'); assert.equal(d.log[0].proyecto, 'vortex'); assert.deepEqual(d.log[0].decisiones, ['premium', 'solo PC']); assert.equal(d.proyectos.length, 1);
  const t = M.contextText(d); assert.match(t, /Se agregó el heatmap/); assert.match(t, /falta móvil/); assert.equal(M.search(d, 'heatmap').length, 1);
  assert.throws(() => M.addSession(d, {ia: 'claude'}, 1), /resumen/);
});
test('MCP: initialize, tools/list y tools/call', async () => {
  const M = await load(), d = M.empty();
  const i = await M.mcpHandle({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18'}}, d, 1); assert.equal(i.reply.result.serverInfo.name, 'memoria-compartida'); assert.match(i.reply.result.instructions, /leer_contexto/);
  assert.equal((await M.mcpHandle({jsonrpc: '2.0', method: 'notifications/initialized'}, d, 1)).reply, null);
  const l = await M.mcpHandle({jsonrpc: '2.0', id: 2, method: 'tools/list'}, d, 1); assert.deepEqual(l.reply.result.tools.map(x => x.name), ['leer_contexto', 'guardar_sesion', 'actualizar_proyecto', 'buscar_memoria']);
  const s = await M.mcpHandle({jsonrpc: '2.0', id: 3, method: 'tools/call', params: {name: 'guardar_sesion', arguments: {ia: 'claude', proyecto: 'Sala', resumen: 'Sala rehecha'}}}, d, 5); assert.ok(s.changed); assert.match(s.reply.result.content[0].text, /Guardado/);
  const r = await M.mcpHandle({jsonrpc: '2.0', id: 4, method: 'tools/call', params: {name: 'leer_contexto', arguments: {}}}, d, 6); assert.match(r.reply.result.content[0].text, /Sala rehecha/);
  const bad = await M.mcpHandle({jsonrpc: '2.0', id: 5, method: 'tools/call', params: {name: 'nada'}}, d, 6); assert.equal(bad.reply.error.code, -32602);
});
test('rutas: llave obligatoria, init único, MCP por HTTP y contexto', async () => {
  const M = await load(), env = {KV: kv()};
  assert.equal((await M.memRoute(req(`/mem/${TOK}/contexto`), env, `/mem/${TOK}/contexto`)).status, 403);
  assert.equal((await M.memRoute(post('/mem/init', {token: TOK}), env, '/mem/init')).status, 200);
  assert.equal((await M.memRoute(post('/mem/init', {token: 'b'.repeat(40)}), env, '/mem/init')).status, 409, 'nadie más puede registrar otra llave');
  const r = await M.memRoute(post(`/mem/${TOK}/mcp`, {jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'guardar_sesion', arguments: {ia: 'gemini', resumen: 'Idea de logo'}}}), env, `/mem/${TOK}/mcp`);
  assert.equal(r.status, 200); assert.match((await r.json()).result.content[0].text, /Gemini/);
  const n = await M.memRoute(post(`/mem/${TOK}/mcp`, {jsonrpc: '2.0', method: 'notifications/initialized'}), env, `/mem/${TOK}/mcp`); assert.equal(n.status, 202);
  const c = await M.memRoute(req(`/mem/${TOK}/contexto`), env, `/mem/${TOK}/contexto`); assert.match(await c.text(), /Idea de logo/);
  const a = await M.memRoute(post(`/mem/${TOK}/api`, {op: 'perfil', perfil: 'Tatuador y dev'}), env, `/mem/${TOK}/api`); assert.equal((await a.json()).data.perfil, 'Tatuador y dev');
  assert.equal((await M.memRoute(req(`/mem/${'c'.repeat(40)}/api`), env, `/mem/${'c'.repeat(40)}/api`)).status, 403);
});

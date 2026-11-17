/* MEMORIA COMPARTIDA · el mismo contexto para Claude, ChatGPT y Gemini (y la Sala de agentes).
   Vive en el Worker vortex-push (KV). Todo va detrás de una llave secreta en la dirección: /mem/<llave>/…
   · /mem/<llave>/mcp       — servidor MCP (conector personalizado de Claude y de ChatGPT en modo desarrollador)
   · /mem/<llave>/contexto  — tu contexto en texto, para pegarle la dirección a cualquier IA (Gemini)
   · /mem/<llave>/api       — lo usa la Sala de agentes (ver, editar proyectos, agregar resúmenes a mano)
   · /mem/init              — la Sala registra la llave la primera vez (solo se guarda su huella; después ya no se puede cambiar sin la llave)
   Nunca se guardan conversaciones completas: cada IA guarda un RESUMEN de la sesión (qué se hizo, decisiones, pendientes). */
const KEY_HASH = 'mem:hash', KEY_DATA = 'mem:data', MAX_LOG = 400, MAX_TXT = 4000;
export const IAS = {claude: 'Claude', chatgpt: 'ChatGPT', gemini: 'Gemini', yo: 'Tú', sala: 'Sala de agentes', otra: 'Otra IA'};
const sha = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t))))].map(b => b.toString(16).padStart(2, '0')).join('');
const clip = (s, n) => String(s == null ? '' : s).replace(/\u0000/g, '').trim().slice(0, n || MAX_TXT);
const list = (a, n) => (Array.isArray(a) ? a : typeof a === 'string' && a.trim() ? a.split(/\n+/) : []).map(x => clip(String(x).replace(/^[-•*\s]+/, ''), 400)).filter(Boolean).slice(0, n || 12);
const slug = s => clip(s, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general';
export const empty = () => ({v: 1, perfil: '', proyectos: [], log: [], at: 0});
const iaOf = x => { const k = String(x || '').toLowerCase().replace(/[^a-z]/g, ''); return IAS[k] ? k : /claude|anthropic/.test(k) ? 'claude' : /gpt|openai/.test(k) ? 'chatgpt' : /gemini|google|bard/.test(k) ? 'gemini' : 'otra'; };

/* ───────── Operaciones (puras: se prueban en tests/memoria.test.js) ───────── */
export function upsertProject(d, p, now) {
  const id = p.id ? slug(p.id) : slug(p.nombre || p.name); let x = d.proyectos.find(q => q.id === id || slug(q.nombre) === id);
  if (!x) { x = {id, nombre: clip(p.nombre || p.name || id, 60), descripcion: '', estado: 'activo', notas: [], creado: now, actualizado: now}; d.proyectos.push(x); }
  if (p.nombre) x.nombre = clip(p.nombre, 60); if (p.descripcion != null) x.descripcion = clip(p.descripcion, 800); if (p.estado) x.estado = clip(p.estado, 40);
  if (p.nota) { x.notas.unshift({at: now, t: clip(p.nota, 600)}); x.notas = x.notas.slice(0, 20); }
  x.actualizado = now; return x;
}
export function addSession(d, s, now) {
  const resumen = clip(s.resumen || s.summary, MAX_TXT); if (!resumen) throw new Error('Falta el resumen');
  const proj = s.proyecto ? upsertProject(d, {nombre: s.proyecto}, now) : null;
  const e = {id: now.toString(36) + Math.random().toString(36).slice(2, 6), at: now, ia: iaOf(s.ia), proyecto: proj ? proj.id : '', titulo: clip(s.titulo || s.title || resumen.split('\n')[0], 120), resumen, decisiones: list(s.decisiones), pendientes: list(s.pendientes)};
  d.log.unshift(e); d.log = d.log.slice(0, MAX_LOG); return e;
}
export function search(d, q, n) { const w = clip(q, 100).toLowerCase().split(/\s+/).filter(Boolean); return d.log.filter(e => w.every(x => (e.titulo + ' ' + e.resumen + ' ' + e.proyecto + ' ' + e.decisiones.join(' ')).toLowerCase().includes(x))).slice(0, n || 10); }
const fmtDate = t => new Date(t).toISOString().slice(0, 10);
export function contextText(d, o) {
  o = o || {}; const pid = o.proyecto ? slug(o.proyecto) : '', L = [];
  L.push('# Contexto compartido de Payi (memoria para Claude, ChatGPT y Gemini)', 'Úsalo para saber qué estamos creando, en qué va cada proyecto y qué se decidió en otras IAs. No le vuelvas a pedir este contexto al usuario.');
  if (d.perfil) L.push('', '## Quién soy y cómo trabajo', d.perfil);
  const ps = d.proyectos.filter(p => !pid || p.id === pid).sort((a, b) => b.actualizado - a.actualizado);
  if (ps.length) { L.push('', '## Proyectos'); for (const p of ps) { L.push(`- **${p.nombre}** (${p.estado}, actualizado ${fmtDate(p.actualizado)})${p.descripcion ? ': ' + p.descripcion : ''}`); for (const n of p.notas.slice(0, pid ? 8 : 2)) L.push(`  - ${fmtDate(n.at)}: ${n.t}`); } }
  const lg = d.log.filter(e => !pid || e.proyecto === pid).slice(0, o.n || (pid ? 20 : 12));
  if (lg.length) { L.push('', '## Últimas sesiones (lo más reciente primero)'); for (const e of lg) { L.push(`### ${fmtDate(e.at)} · ${IAS[e.ia] || e.ia}${e.proyecto ? ' · ' + e.proyecto : ''} — ${e.titulo}`, e.resumen); if (e.decisiones.length) L.push('Decisiones: ' + e.decisiones.join('; ')); if (e.pendientes.length) L.push('Pendientes: ' + e.pendientes.join('; ')); } }
  if (!ps.length && !lg.length) L.push('', '(Todavía no hay nada guardado.)');
  return L.join('\n');
}

/* ───────── MCP (Streamable HTTP, respuestas JSON) ───────── */
const INSTR = 'Memoria compartida de Payi entre Claude, ChatGPT y Gemini. AL EMPEZAR una conversación de trabajo llama a leer_contexto (con el proyecto si lo sabes) para saber qué estamos creando sin preguntarle. AL TERMINAR algo importante (decisiones, avances, cambios, pendientes) llama a guardar_sesion con un resumen claro en español. Si cambia el estado de un proyecto usa actualizar_proyecto.';
export const TOOLS = [
  {name: 'leer_contexto', description: 'Lee el contexto compartido de Payi: quién es, sus proyectos y las últimas sesiones guardadas por Claude, ChatGPT y Gemini. Úsalo al iniciar cualquier conversación de trabajo.', inputSchema: {type: 'object', properties: {proyecto: {type: 'string', description: 'Nombre del proyecto para ver solo ese (opcional)'}}}, annotations: {readOnlyHint: true}},
  {name: 'guardar_sesion', description: 'Guarda en la memoria compartida un RESUMEN de lo trabajado en esta conversación para que las otras IAs lo sepan.', inputSchema: {type: 'object', properties: {ia: {type: 'string', enum: ['claude', 'chatgpt', 'gemini', 'otra'], description: 'Qué IA eres'}, proyecto: {type: 'string', description: 'Proyecto (ej.: Vortex, Nova Hub, Neural Brain, Sala de agentes)'}, titulo: {type: 'string'}, resumen: {type: 'string', description: 'Qué se hizo y en qué quedó (claro, en español)'}, decisiones: {type: 'array', items: {type: 'string'}}, pendientes: {type: 'array', items: {type: 'string'}}}, required: ['ia', 'resumen']}},
  {name: 'actualizar_proyecto', description: 'Crea o actualiza un proyecto: descripción, estado (activo, en pausa, terminado) o una nota corta.', inputSchema: {type: 'object', properties: {nombre: {type: 'string'}, descripcion: {type: 'string'}, estado: {type: 'string'}, nota: {type: 'string'}}, required: ['nombre']}},
  {name: 'buscar_memoria', description: 'Busca en las sesiones guardadas por palabras.', inputSchema: {type: 'object', properties: {texto: {type: 'string'}}, required: ['texto']}, annotations: {readOnlyHint: true}}
];
export async function mcpCall(d, name, args, now) {
  args = args || {}; let changed = false, text;
  if (name === 'leer_contexto') text = contextText(d, {proyecto: args.proyecto});
  else if (name === 'guardar_sesion') { const e = addSession(d, args, now); changed = true; text = `Guardado en la memoria compartida (${IAS[e.ia]}${e.proyecto ? ', proyecto ' + e.proyecto : ''}): «${e.titulo}».`; }
  else if (name === 'actualizar_proyecto') { const p = upsertProject(d, args, now); changed = true; text = `Proyecto «${p.nombre}» actualizado (${p.estado}).`; }
  else if (name === 'buscar_memoria') { const r = search(d, args.texto, 10); text = r.length ? r.map(e => `${fmtDate(e.at)} · ${IAS[e.ia]} · ${e.titulo}\n${e.resumen}`).join('\n\n') : 'Sin resultados.'; }
  else throw Object.assign(new Error('Herramienta desconocida: ' + name), {code: -32602});
  return {changed, result: {content: [{type: 'text', text}]}};
}
export async function mcpHandle(msg, d, now) { // un mensaje JSON-RPC → {reply, changed}
  const id = msg.id, ok = result => ({jsonrpc: '2.0', id, result}), err = (code, message) => ({jsonrpc: '2.0', id, error: {code, message}});
  if (msg.id === undefined) return {reply: null, changed: false}; // notificaciones (notifications/initialized…)
  if (msg.method === 'initialize') return {reply: ok({protocolVersion: (msg.params && msg.params.protocolVersion) || '2025-06-18', capabilities: {tools: {listChanged: false}}, serverInfo: {name: 'memoria-compartida', title: 'Memoria compartida de Payi', version: '1.0.0'}, instructions: INSTR})};
  if (msg.method === 'ping') return {reply: ok({})};
  if (msg.method === 'tools/list') return {reply: ok({tools: TOOLS})};
  if (msg.method === 'tools/call') { try { const r = await mcpCall(d, msg.params && msg.params.name, msg.params && msg.params.arguments, now); return {reply: ok(r.result), changed: r.changed}; } catch (e) { return {reply: e.code ? err(e.code, e.message) : ok({content: [{type: 'text', text: 'Error: ' + e.message}], isError: true})}; } }
  if (msg.method === 'resources/list') return {reply: ok({resources: []})};
  if (msg.method === 'prompts/list') return {reply: ok({prompts: []})};
  return {reply: err(-32601, 'Método no soportado: ' + msg.method)};
}

/* ───────── HTTP ───────── */
const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, mcp-session-id, mcp-protocol-version', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-expose-headers': 'mcp-session-id'};
const J = (o, s = 200) => new Response(JSON.stringify(o), {status: s, headers: {...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}});
async function load(env) { return (await env.KV.get(KEY_DATA, 'json')) || empty(); }
async function store(env, d) { d.at = Date.now(); await env.KV.put(KEY_DATA, JSON.stringify(d)); }
const hits = new Map(); function allowed(ip, now = Date.now()) { const h = (hits.get(ip) || []).filter(t => now - t < 60000); if (h.length >= 60) return false; h.push(now); hits.set(ip, h); if (hits.size > 2000) hits.clear(); return true; }

export async function memRoute(req, env, path) {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: CORS});
  if (!allowed(req.headers.get('cf-connecting-ip') || 'x')) return J({error: 'Demasiadas consultas; espera un minuto'}, 429);
  if (path === '/mem/init' && req.method === 'POST') { // primera vez: la Sala registra tu llave
    let b; try { b = await req.json(); } catch { return J({error: 'JSON inválido'}, 400); }
    const t = String(b.token || ''); if (!/^[A-Za-z0-9_-]{32,80}$/.test(t)) return J({error: 'Llave inválida'}, 400);
    const have = await env.KV.get(KEY_HASH); if (have) return J({error: 'La memoria ya tiene llave', ya: true}, have === await sha(t) ? 200 : 409);
    await env.KV.put(KEY_HASH, await sha(t)); return J({ok: true});
  }
  const m = /^\/mem\/([A-Za-z0-9_-]{32,80})\/(mcp|contexto|api)\/?$/.exec(path); if (!m) return J({error: 'No encontrado'}, 404);
  const have = await env.KV.get(KEY_HASH); if (!have || have !== await sha(m[1])) return J({error: 'Llave no válida'}, 403);
  const now = Date.now(), part = m[2];
  if (part === 'contexto') { const d = await load(env), q = new URL(req.url).searchParams; return new Response(contextText(d, {proyecto: q.get('proyecto') || ''}), {headers: {...CORS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex'}}); }
  if (part === 'mcp') {
    if (req.method === 'GET') return new Response('Usa POST (MCP Streamable HTTP).', {status: 405, headers: {...CORS, allow: 'POST'}});
    if (req.method === 'DELETE') return new Response(null, {status: 204, headers: CORS});
    if (req.method !== 'POST') return J({error: 'Método no permitido'}, 405);
    let body; try { body = await req.json(); } catch { return J({jsonrpc: '2.0', id: null, error: {code: -32700, message: 'JSON inválido'}}, 400); }
    const d = await load(env), batch = Array.isArray(body), out = []; let changed = false;
    for (const msg of batch ? body : [body]) { const r = await mcpHandle(msg || {}, d, now); if (r.reply) out.push(r.reply); changed = changed || r.changed; }
    if (changed) await store(env, d);
    if (!out.length) return new Response(null, {status: 202, headers: CORS});
    return J(batch ? out : out[0]);
  }
  /* api de la Sala */
  const d = await load(env);
  if (req.method === 'GET') return J({ok: true, data: d});
  let b; try { b = await req.json(); } catch { return J({error: 'JSON inválido'}, 400); }
  try {
    if (b.op === 'sesion') { const e = addSession(d, b, now); await store(env, d); return J({ok: true, entry: e, data: d}); }
    if (b.op === 'proyecto') { upsertProject(d, b, now); await store(env, d); return J({ok: true, data: d}); }
    if (b.op === 'perfil') { d.perfil = clip(b.perfil, 3000); await store(env, d); return J({ok: true, data: d}); }
    if (b.op === 'borrar') { d.log = d.log.filter(e => e.id !== b.id); if (b.proyecto) d.proyectos = d.proyectos.filter(p => p.id !== b.proyecto); await store(env, d); return J({ok: true, data: d}); }
    if (b.op === 'llave') { const t = String(b.token || ''); if (!/^[A-Za-z0-9_-]{32,80}$/.test(t)) return J({error: 'Llave inválida'}, 400); await env.KV.put(KEY_HASH, await sha(t)); return J({ok: true}); } // cambiar la llave (la vieja deja de servir)
  } catch (e) { return J({error: e.message}, 400); }
  return J({error: 'Operación desconocida'}, 400);
}

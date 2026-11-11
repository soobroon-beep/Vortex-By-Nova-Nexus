/* NOVA BOT LAB · el «cerebro» de un bot (lo usa el reentrenamiento programado, scripts/botlab-retrain.js).
   Un bot conectado a un cerebro de Neural Brain se mejora solo cada noche:
   1) Lee lo que sabe su cerebro: tus reglas maestras, estrategias, lecciones y lo que aprendió de los experimentos anteriores.
   2) Arma ideas: los consejos del entrenador (botlab-coach) + 1-2 ideas de la IA guiadas por el cerebro + la del optimizador.
   3) Prueba cada idea con velas reales y solo la propone si gana FUERA DE MUESTRA (validación y prueba), sin más caída
      y sin romper tus límites (nunca sube riesgo, tamaño ni apalancamiento; respeta los máximos de tus reglas maestras).
   4) Recuerda qué se probó y cómo salió, para no repetir lo que ya falló. La propuesta entra como versión CANDIDATA:
      nunca reemplaza a la principal ni opera con dinero real; tú la apruebas en la app.
   Puro salvo la llamada a la IA (inyectable). Pruebas: tests/botlab-brain.test.js */
'use strict';
const B = require('./botlab-engine.js'), CO = require('./botlab-coach.js');
const GEN_URL = 'https://gen.pollinations.ai/v1/chat/completions', POLLEN_KEY = 'sk_1XvEYtOmiFixsgMve0FAqQz5ghhy7FFT', FREE_URL = 'https://text.pollinations.ai/openai';
const MEM_DAYS = 21, MAX_IDEAS = 8;
const clone = o => JSON.parse(JSON.stringify(o));
const hashOf = o => { const s = JSON.stringify(o); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const r2 = x => Math.round(x * 100) / 100;

/* Límites que salen de tus reglas maestras: «riesgo máximo 2 %», «apalancamiento máximo 5x»… */
function limitsFrom(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), out = {};
  const rk = t.match(/riesgo[^.\n%]{0,40}?(\d+(?:[.,]\d+)?)\s*%/) || t.match(/(\d+(?:[.,]\d+)?)\s*%[^.\n]{0,25}riesgo/); if (rk) out.riskPct = +rk[1].replace(',', '.');
  const lv = t.match(/(?:apalancamiento|leverage)[^.\n]{0,30}?(\d+(?:[.,]\d+)?)\s*x/) || t.match(/(\d+(?:[.,]\d+)?)\s*x[^.\n]{0,20}(?:apalancamiento|max)/); if (lv) out.maxLeverage = +lv[1].replace(',', '.');
  return out;
}
/* Una idea solo puede tocar reglas de entrada/salida, filtros, lado y stop/objetivo/trailing/tiempo máximo. Jamás tamaño ni apalancamiento. */
function cleanPatch(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null; const o = {};
  for (const k of ['entry', 'exit', 'filters', 'sides']) if (p[k] != null) o[k] = p[k];
  if (p.risk && typeof p.risk === 'object') { const r = {}; for (const k of ['sl', 'tp', 'trail', 'maxBars', 'atrLen', 'maxDailyLossPct', 'maxDrawdownPct']) if (p.risk[k] !== undefined) r[k] = p.risk[k]; if (Object.keys(r).length) o.risk = r; }
  return Object.keys(o).length ? o : null;
}
function withinLimits(base, sp, lim) {
  const a = base.risk, b = sp.risk;
  if (b.riskPct > a.riskPct + 1e-9 || b.sizePct > a.sizePct + 1e-9 || b.maxLeverage > a.maxLeverage + 1e-9) return 'sube el riesgo';
  if (lim.riskPct != null && b.riskPct > lim.riskPct + 1e-9) return `pasa tu riesgo máximo (${lim.riskPct} %)`;
  if (lim.maxLeverage != null && b.maxLeverage > lim.maxLeverage + 1e-9) return `pasa tu apalancamiento máximo (${lim.maxLeverage}x)`;
  if (sp.symbol !== base.symbol || sp.interval !== base.interval) return 'cambia la moneda o la temporalidad';
  if (b.maxDrawdownPct === 0 && a.maxDrawdownPct > 0) return 'quita el freno de caída máxima';
  if (b.maxDailyLossPct === 0 && a.maxDailyLossPct > 0) return 'quita el freno de pérdida diaria';
  return '';
}
const oosOf = res => ({net: res.segments.val.net + res.segments.test.net, val: res.segments.val.net, test: res.segments.test.net, n: res.segments.val.n + res.segments.test.n, dd: res.metrics.maxDDPct, win: res.metrics.winRate, ret: res.metrics.retPct});
/* ¿Gana de verdad? Mejor en conjunto fuera de muestra, sin empeorar ningún tramo, sin más caída y con muestra suficiente. */
function judge(b, c, capital) {
  const minGain = Math.max(capital * 0.0025, Math.abs(b.net) * 0.05);
  if (c.n < 10) return {ok: false, why: `pocas operaciones fuera de muestra (${c.n})`};
  if (c.net - b.net < minGain) return {ok: false, why: c.net <= b.net ? 'no mejora fuera de muestra' : 'mejora demasiado pequeña'};
  if (c.val < b.val - capital * 0.001 || c.test < b.test - capital * 0.001) return {ok: false, why: 'empeora en validación o en prueba'};
  if (c.dd > Math.max(b.dd * 1.15, b.dd + 2)) return {ok: false, why: 'aumenta la caída máxima'};
  return {ok: true, why: `fuera de muestra ${c.net >= 0 ? '+' : ''}${r2(c.net)} vs ${b.net >= 0 ? '+' : ''}${r2(b.net)}`};
}

async function llm(messages, fetchF) {
  const f = fetchF || globalThis.fetch; let last;
  for (const model of ['openai', 'mistral']) for (const [url, key] of [[GEN_URL, POLLEN_KEY], [FREE_URL, '']]) {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 90000);
      const r = await f(url, {method: 'POST', signal: ctl.signal, headers: Object.assign({'content-type': 'application/json'}, key ? {authorization: 'Bearer ' + key} : {}), body: JSON.stringify({model, messages, max_tokens: 900, temperature: .4})}); clearTimeout(t);
      if (!r.ok) { last = new Error('IA ' + r.status); continue; } const j = await r.json(), x = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content; if (x) return String(x);
    } catch (e) { last = e; }
  }
  throw last || new Error('Sin respuesta de la IA');
}
function parseIdeas(text) {
  const m = String(text || '').match(/\[[\s\S]*\]/); if (!m) return []; let arr; try { arr = JSON.parse(m[0]); } catch { return []; }
  return (Array.isArray(arr) ? arr : []).slice(0, 2).map(x => ({id: 'ia', title: String(x && x.title || 'Idea de la IA').slice(0, 90), why: String(x && x.why || '').slice(0, 300), patch: cleanPatch(x && x.patch)})).filter(x => x.patch);
}
async function aiIdeas(spec, base, guide, memory, fetchF) {
  const tried = (memory || []).slice(-12).map(m => `- ${m.title}: ${m.ok ? 'FUNCIONÓ' : 'falló (' + m.why + ')'}`).join('\n') || '(nada aún)';
  const sys = `Eres el cerebro de un bot de trading de Nova Bot Lab. Respondes SOLO con un arreglo JSON de 1 o 2 ideas: [{"title": "...", "why": "...", "patch": {...}}]. Sin texto extra.
Un "patch" es un fragmento de la especificación del bot que se mezcla sobre la actual (objetos se combinan; listas se reemplazan completas). Solo puedes usar: "entry", "exit" (listas por lado "long"/"short" de condiciones {"a": operando, "op": "gt|lt|gte|lte|crossUp|crossDown", "b": operando}), "filters" ({"minVolRatio","minAtrPct","maxAtrPct","hoursUtc":[desde,hasta]}), "sides" ("long"|"short"|"both") y en "risk" solo "sl","tp" ({"type":"atr|pct|rr","v":n}), "trail" (null o {"type":"atr|pct","v":n}), "maxBars".
Operandos válidos: {"k":"close"}, {"k":"ema","n":N}, {"k":"sma","n":N}, {"k":"rsi","n":N}, {"k":"adx","n":N}, {"k":"atr","n":N}, {"k":"volRatio","n":20}, {"k":"bbUp","n":20,"d":2}, {"k":"bbLo","n":20,"d":2}, {"k":"novaBull"} (1 = precio sobre la nube de Nova Nexus), {"k":"novaRange"} (1 = mercado en rango), {"k":"novaOsc"}, {"k":"num","v":N}. Si la entrada usa operandos {"k":"user"...} (indicadores propios) o {"k":"nova"...}, cópialos tal cual: no los inventes.
NUNCA cambies riesgo por operación, tamaño, apalancamiento, moneda ni temporalidad. No repitas ideas que ya fallaron. Prefiere cambios pequeños y que sigan las reglas del usuario.`;
  const user = `ESPECIFICACIÓN ACTUAL:\n${JSON.stringify(spec).slice(0, 3500)}\n\nRESULTADO ACTUAL: ${base.n} operaciones fuera de muestra, neto fuera de muestra ${r2(base.net)}, aciertos ${base.win == null ? '—' : r2(base.win) + '%'}, caída máx ${r2(base.dd)}%.\n\nLO QUE SABE SU CEREBRO (reglas del usuario y lecciones):\n${String(guide || '(vacío)').slice(0, 3500)}\n\nYA PROBADO:\n${tried}`;
  try { return parseIdeas(await llm([{role: 'system', content: sys}, {role: 'user', content: user}], fetchF)); } catch { return []; }
}

/* Una noche de mejora. ctx = {candles, spec, ropts, base (backtest de la principal), opt (resultado del optimizador), link, memory, now, fetch, ai} */
async function improve(ctx) {
  const spec = B.normalizeSpec(ctx.spec), lim = Object.assign({}, limitsFrom(ctx.link && ctx.link.rules), ctx.link && ctx.link.limits), now = ctx.now || Date.now(), cap = spec.risk.capital;
  const base = oosOf(ctx.base), memory = (ctx.memory || []).filter(m => now - m.at < MEM_DAYS * 864e5), tried = [], seen = new Set(memory.filter(m => !m.ok).map(m => m.h));
  let ideas = [];
  try { ideas = CO.tips(spec, ctx.base, null).filter(t => !['ivUp', 'ivDown', 'asset'].includes(t.id)).map(t => ({id: 'coach:' + t.id, title: t.title, why: t.why, patch: cleanPatch(t.patch), from: 'entrenador'})); } catch {}
  if (ctx.ai !== false) ideas = ideas.concat((await aiIdeas(spec, base, ctx.link && ctx.link.guide, memory, ctx.fetch)).map(x => Object.assign(x, {from: 'cerebro (IA)'})));
  if (ctx.opt && ctx.opt.decision === 'propuesta' && ctx.opt.candidate) ideas.push({id: 'opt', title: 'Ajuste fino de parámetros (optimizador)', why: (ctx.opt.changes || []).map(c => `${c.path} ${c.from}→${c.to}`).join('; '), full: B.normalizeSpec(ctx.opt.candidate), from: 'optimizador'});
  let best = null;
  for (const idea of ideas.slice(0, MAX_IDEAS)) {
    const sp = idea.full || (idea.patch ? CO.apply(spec, idea.patch) : null); if (!sp) continue; const h = hashOf(sp);
    const row = {title: idea.title, from: idea.from, why: idea.why, h};
    if (JSON.stringify(sp) === JSON.stringify(spec)) continue;
    if (seen.has(h)) { row.skip = 'ya se probó y falló'; tried.push(row); continue; }
    const v = B.validateSpec(sp); if (!v.ok) { row.skip = 'no es válida: ' + v.errors[0]; tried.push(row); continue; }
    const lw = withinLimits(spec, sp, lim); if (lw) { row.skip = 'no se probó: ' + lw; tried.push(row); continue; }
    let res; try { res = B.backtest(ctx.candles, sp, ctx.ropts || {}); } catch (e) { row.skip = 'falló la prueba'; tried.push(row); continue; }
    const c = oosOf(res), j = judge(base, c, cap); Object.assign(row, {ok: j.ok, verdict: j.why, oos: r2(c.net), base: r2(base.net), dd: r2(c.dd), win: c.win == null ? null : r2(c.win), n: c.n}); tried.push(row);
    if (j.ok && (!best || c.net > best.c.net)) best = {idea, sp, c, row};
  }
  const mem = memory.concat(tried.filter(t => t.ok != null).map(t => ({h: t.h, at: now, ok: t.ok, title: t.title, why: t.verdict}))).slice(-60);
  const brain = {at: now, brainId: ctx.link && ctx.link.brainId, brainName: ctx.link && ctx.link.brainName, limits: lim, base: {oos: r2(base.net), dd: r2(base.dd), win: base.win == null ? null : r2(base.win), n: base.n}, tried, best: best ? {title: best.idea.title, from: best.idea.from, oos: r2(best.c.net)} : null};
  return {brain, memory: mem, candidate: best ? best.sp : null, note: best ? `Cerebro: ${best.idea.title} (${best.idea.from}) · ${best.row.verdict}` : ''};
}

module.exports = {improve, limitsFrom, cleanPatch, withinLimits, judge, parseIdeas, oosOf, hashOf};

// Rescate de tareas con horario: GitHub retrasa o se salta los horarios (cron) de este repo, a veces 8-9 h.
// El Motor (siempre encendido) llama a rescue() y, si a una tarea ya le tocaba y no se ha lanzado (ni está en cola/corriendo), la lanza él.
// Reglas: {every: ms} → cada cierto tiempo · {daily: [hora UTC, minuto UTC]} → una vez al día a esa hora (con 15 min de margen para GitHub).
'use strict';
const H = 36e5, M = 6e4, GRACE = 15 * M;
// Las tareas que el Motor vigila (minutos con margen sobre su horario, para no duplicar cuando GitHub sí cumple)
const JOBS = [
  {wf: 'sala-taller.yml', every: 190 * M},     // Sala · Taller automático, cada 3 h
  {wf: 'sala-revision.yml', every: 130 * M},   // Sala · Revisión de apps, cada 2 h
  {wf: 'brain-sync.yml', every: 40 * M},       // Cerebro · conector de VORTEX, cada 30 min
  {wf: 'news.yml', every: 190 * M},            // Noticias y calendario, cada 3 h
  {wf: 'claudio-nightly.yml', daily: [6, 15]}, // Claudio · revisión nocturna, 00:15 Ciudad de México
  {wf: 'brain-learn.yml', daily: [9, 20]},     // Cerebro · aprendizaje nocturno, 3:20 a. m.
  {wf: 'backup-firestore.yml', daily: [9, 41]} // Respaldo cifrado, 3:41 a. m.
];
const lastAt = runs => runs.reduce((m, r) => Math.max(m, Date.parse(r && r.created_at) || 0), 0);
// ¿Toca lanzarla? runs = últimas ejecuciones de la tarea (de la API de GitHub)
function due(runs, now, rule) {
  const list = Array.isArray(runs) ? runs : [];
  if (list.some(r => r && r.status && r.status !== 'completed')) return false; // ya hay una en cola o corriendo
  if (typeof rule === 'number') rule = {every: rule};
  if (rule.daily) {
    const d = new Date(now), target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), rule.daily[0], rule.daily[1]);
    return now >= target + GRACE && lastAt(list) < target; // ya pasó su hora de hoy y no ha corrido desde entonces
  }
  return now - lastAt(list) >= rule.every;
}
async function rescue(repo, tok, wf, rule, now = Date.now(), ref = 'main') {
  if (!repo || !tok) return null;
  const h = {authorization: 'Bearer ' + tok, accept: 'application/vnd.github+json'};
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wf}/runs?per_page=5`, {headers: h});
  if (!r.ok) return null;
  if (!due((await r.json()).workflow_runs, now, rule)) return null;
  const d = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wf}/dispatches`, {method: 'POST', headers: Object.assign({'content-type': 'application/json'}, h), body: JSON.stringify({ref})});
  return d.status;
}
// Revisa todas las tareas; log(texto) anota cada una que se lanzó
async function rescueAll(repo, tok, now = Date.now(), ref = 'main', log = () => {}) {
  const out = [];
  for (const j of JOBS) {
    try { const s = await rescue(repo, tok, j.wf, j, now, ref); if (s) { out.push([j.wf, s]); log(`${j.wf} lanzada (GitHub se saltó su horario) → ${s}`); } }
    catch (e) { log(`${j.wf}: ${String(e.message || e).slice(0, 120)}`); }
  }
  return out;
}
module.exports = {JOBS, due, rescue, rescueAll};

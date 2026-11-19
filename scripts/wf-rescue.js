// Rescate de tareas con horario: GitHub retrasa o se salta los horarios (cron) de este repo, a veces 8-9 h.
// El Motor (siempre encendido) llama a rescue() y, si la tarea no se ha lanzado en su intervalo (ni está en cola/corriendo), la lanza él.
'use strict';
// ¿Toca lanzarla? runs = últimas ejecuciones de la tarea (de la API de GitHub, la más nueva primero)
function due(runs, now, everyMs) {
  const list = Array.isArray(runs) ? runs : [];
  if (list.some(r => r && r.status && r.status !== 'completed')) return false; // ya hay una en cola o corriendo
  const last = list.reduce((m, r) => Math.max(m, Date.parse(r && r.created_at) || 0), 0);
  return now - last >= everyMs;
}
async function rescue(repo, tok, wf, everyMs, now = Date.now(), ref = 'main') {
  if (!repo || !tok) return null;
  const h = {authorization: 'Bearer ' + tok, accept: 'application/vnd.github+json'};
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wf}/runs?per_page=5`, {headers: h});
  if (!r.ok) return null;
  if (!due((await r.json()).workflow_runs, now, everyMs)) return null;
  const d = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wf}/dispatches`, {method: 'POST', headers: Object.assign({'content-type': 'application/json'}, h), body: JSON.stringify({ref})});
  return d.status;
}
module.exports = {due, rescue};

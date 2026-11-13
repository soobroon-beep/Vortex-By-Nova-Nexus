// VORTEX · Motor del servidor: mantiene corriendo lo que GitHub no corre a tiempo con sus horarios (las tareas «cada hora» llegaban cada 6-8 h).
// Una ejecución dura ~5 h 40 min y al terminar se vuelve a lanzar sola (.github/workflows/motor.yml). Mientras corre:
//   · cada minuto: alertas con indicador (scripts/ind-alerts.js)
//   · cada 15 min (minuto 2, 17, 32, 47): paper trading de tus bots (scripts/botlab-retrain.js MODE=paper; cada sesión avanza solo si cerró su vela)
//   · cada hora (minuto 8): Claudio (scripts/claudio-run.js MODE=tick)
//   · al cerrar cada vela de 1h/4h: el Screener a Discord + celulares + radar (scripts/discord-screener.js · motorRound)
//   · una vez al día (7:17 a. m. Veracruz): lanza el Vigía si GitHub se saltó su horario
// Cada tarea corre por separado: si una falla, las demás siguen.
'use strict';
const {spawn} = require('child_process'), path = require('path');
const IA = require('./ind-alerts.js'), DS = require('./discord-screener.js'), CS = require('./candle-store.js'), MK = require('../markets.js');
const REPO = process.env.GITHUB_REPOSITORY || '', VIGIA_UTC = {h: 13, m: 17}; // Vigía: 7:17 a. m. en Veracruz
async function vigiaDue(day) { // ¿ya corrió hoy el Vigía de la mañana? (GitHub se salta su horario: aquí se lanza desde el Motor)
  const tok = process.env.GH_TOKEN; if (!REPO || !tok) return false;
  const since = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), VIGIA_UTC.h, 0)).toISOString().slice(0, 19);
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/vigia.yml/runs?per_page=20&created=${encodeURIComponent('>=' + since)}`, {headers: {authorization: 'Bearer ' + tok, accept: 'application/vnd.github+json'}});
  if (!r.ok) return false; const j = await r.json();
  return !(j.workflow_runs || []).some(x => x.event === 'workflow_dispatch' || x.event === 'schedule');
}
async function vigiaRun() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/vigia.yml/dispatches`, {method: 'POST', headers: {authorization: 'Bearer ' + process.env.GH_TOKEN, accept: 'application/vnd.github+json', 'content-type': 'application/json'}, body: JSON.stringify({ref: process.env.GITHUB_REF_NAME || 'main'})});
  return r.status;
}
const RUN_MS = Math.max(1, +(process.env.RUN_MINUTES || 340)) * 60000, sleep = ms => new Promise(r => setTimeout(r, ms));
const child = (script, env) => new Promise(res => {
  const t0 = Date.now(), p = spawn(process.execPath, [path.join(__dirname, script)], {env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe']});
  let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  const kill = setTimeout(() => p.kill('SIGKILL'), 25 * 60000);
  p.on('close', code => { clearTimeout(kill); const last = out.trim().split('\n').filter(l => !/DeprecationWarning|trace-deprecation/.test(l)).slice(-3).join(' | '); console.log(`${new Date().toISOString()} · ${script} ${env.MODE || ''} → ${code === 0 ? 'ok' : 'código ' + code} en ${Math.round((Date.now() - t0) / 1000)} s · ${last.slice(0, 300)}`); res(code); });
});
(async () => {
  const st = IA.setup(); if (!st) { console.log('FIREBASE_SERVICE_ACCOUNT no está configurado: no hay nada que hacer.'); return; }
  const end = Date.now() + RUN_MS; let lastHour = -1, lastQ = -1, vigiaDay = '';
  // franjas del Screener ya enviadas (en Firestore, para no repetirlas al relanzarse el Motor)
  let db = null, scr = {}; try { db = require('firebase-admin').firestore(); const d = await db.doc('server/motor').get(); scr = (d.exists && d.data().scr) || {}; } catch (e) { console.log('estado del Screener:', String(e.message || e).slice(0, 120)); }
  if (db) MK.setStore(CS.reader(db)); // si los exchanges fallan, alertas y Screener usan las velas guardadas por VORTEX
  const memC = {}; let retrainAt = 0, beatKey = -1;
  console.log(`Motor encendido hasta ${new Date(end).toISOString()}`);
  while (Date.now() < end) {
    const t0 = Date.now(), d = new Date(), hourKey = Math.floor(t0 / 36e5);
    try { await IA.round(st.key, st.getScript); } catch (e) { console.log('alertas:', String(e.message || e).slice(0, 200)); }
    try { if (await DS.motorRound(scr, st.key, Date.now(), m => console.log(`${new Date().toISOString()} · ${m}`)) && db) await db.doc('server/motor').set({scr, at: Date.now()}, {merge: true}); } catch (e) { console.log('screener:', String(e.message || e).slice(0, 200)); }
    { const dk = d.toISOString().slice(0, 10); if (vigiaDay !== dk && (d.getUTCHours() > VIGIA_UTC.h || (d.getUTCHours() === VIGIA_UTC.h && d.getUTCMinutes() >= VIGIA_UTC.m))) { vigiaDay = dk; try { if (await vigiaDue(d)) console.log(`${d.toISOString()} · Vigía de la mañana lanzado (${await vigiaRun()})`); } catch (e) { console.log('vigía:', String(e.message || e).slice(0, 120)); } } }
    if (db) { const syms = [...new Set(DS.MAJORS.concat(DS.top().slice(0, 30).map(t => t.symbol)))]; try { await CS.round(db, syms, Date.now(), memC, m => console.log(`${new Date().toISOString()} · ${m}`)); } catch (e) { console.log('velas:', String(e.message || e).slice(0, 160)); } }
    if (Date.now() - retrainAt > 6 * 36e5 && d.getUTCMinutes() >= 40) { retrainAt = Date.now(); await child('botlab-retrain.js', {MODE: 'retrain'}); await child('brain-sync.js', {MODE: 'cerebro', BRAIN_APP: 'vortex', BRAIN_NO_COMMITS: '1'}); } // y el análisis de cada bot sube a Neural Brain enseguida // reentrenamiento (cada bot decide si ya le toca; GitHub se saltaba su horario) · en fila con el paper trading para que no se pisen
    if (db && Math.floor(t0 / 6e5) !== beatKey) { beatKey = Math.floor(t0 / 6e5); db.doc('server/motor').set({beat: Date.now()}, {merge: true}).catch(() => {}); } // latido cada 10 min: el Vigía revisa que el Motor siga vivo
    const qKey = Math.floor(t0 / 9e5);
    if (qKey !== lastQ && d.getUTCMinutes() % 15 >= 2) { // cada 15 min (2 min después del cierre): bots de 15 m como Pachita; los de 1 h/4 h solo avanzan cuando cerró su vela
      lastQ = qKey;
      await child('botlab-retrain.js', {MODE: 'paper'});
    }
    if (hourKey !== lastHour && d.getUTCMinutes() >= 8) { // Claudio, cada hora
      lastHour = hourKey;
      await child('claudio-run.js', {MODE: 'tick'});
    }
    const wait = 60000 - (Date.now() - t0); if (Date.now() + wait >= end) break; await sleep(Math.max(1000, wait));
  }
  console.log('Motor: fin de esta vuelta, se vuelve a lanzar solo.');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });

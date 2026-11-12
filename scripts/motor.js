// VORTEX · Motor del servidor: mantiene corriendo lo que GitHub no corre a tiempo con sus horarios (las tareas «cada hora» llegaban cada 6-8 h).
// Una ejecución dura ~5 h 40 min y al terminar se vuelve a lanzar sola (.github/workflows/motor.yml). Mientras corre:
//   · cada minuto: alertas con indicador (scripts/ind-alerts.js)
//   · cada hora (minuto 8): paper trading de tus bots (scripts/botlab-retrain.js MODE=paper) y Claudio (scripts/claudio-run.js MODE=tick)
// Cada tarea corre por separado: si una falla, las demás siguen.
'use strict';
const {spawn} = require('child_process'), path = require('path');
const IA = require('./ind-alerts.js');
const RUN_MS = Math.max(1, +(process.env.RUN_MINUTES || 340)) * 60000, sleep = ms => new Promise(r => setTimeout(r, ms));
const child = (script, env) => new Promise(res => {
  const t0 = Date.now(), p = spawn(process.execPath, [path.join(__dirname, script)], {env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe']});
  let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  const kill = setTimeout(() => p.kill('SIGKILL'), 25 * 60000);
  p.on('close', code => { clearTimeout(kill); const last = out.trim().split('\n').filter(l => !/DeprecationWarning|trace-deprecation/.test(l)).slice(-3).join(' | '); console.log(`${new Date().toISOString()} · ${script} ${env.MODE || ''} → ${code === 0 ? 'ok' : 'código ' + code} en ${Math.round((Date.now() - t0) / 1000)} s · ${last.slice(0, 300)}`); res(code); });
});
(async () => {
  const st = IA.setup(); if (!st) { console.log('FIREBASE_SERVICE_ACCOUNT no está configurado: no hay nada que hacer.'); return; }
  const end = Date.now() + RUN_MS; let lastHour = -1;
  console.log(`Motor encendido hasta ${new Date(end).toISOString()}`);
  while (Date.now() < end) {
    const t0 = Date.now(), d = new Date(), hourKey = Math.floor(t0 / 36e5);
    try { await IA.round(st.key, st.getScript); } catch (e) { console.log('alertas:', String(e.message || e).slice(0, 200)); }
    if (hourKey !== lastHour && d.getUTCMinutes() >= 8) { // las velas de 1 h ya cerraron (y las de 4 h a su hora)
      lastHour = hourKey;
      await child('botlab-retrain.js', {MODE: 'paper'});
      await child('claudio-run.js', {MODE: 'tick'});
    }
    const wait = 60000 - (Date.now() - t0); if (Date.now() + wait >= end) break; await sleep(Math.max(1000, wait));
  }
  console.log('Motor: fin de esta vuelta, se vuelve a lanzar solo.');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });

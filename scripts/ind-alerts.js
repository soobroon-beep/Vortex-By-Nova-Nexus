// VORTEX · Alertas con indicador con la app CERRADA.
// Corre en GitHub Actions (.github/workflows/ind-alerts.yml). En cada vuelta (cada minuto, durante unos minutos por ejecución):
//   1) pide al servidor de avisos (Worker «vortex-push») las alertas con indicador encendidas de cada celular;
//   2) descarga las velas CERRADAS de cada moneda y temporalidad (Binance) y revisa la condición con alert-eval.js,
//      la misma lógica que usa la app: indicadores comunes, Nova Nexus o tu script Pine (leído de tu cuenta);
//   3) le devuelve al servidor qué velas revisó y cuáles saltaron; el servidor manda la notificación (y Discord si lo elegiste).
// La llave se deriva de FIREBASE_SERVICE_ACCOUNT (scripts/bot-push-key.js): no hay secretos nuevos.
'use strict';
const AE = require('../alert-eval.js'), M = require('../markets.js');
const {botPushKey} = require('./bot-push-key.js');
let Pine = null; try { Pine = require('../pine.js'); } catch {}
try { require('../nova-nexus.js'); } catch {}
const PUSH_URL = process.env.PUSH_URL || 'https://vortex-push.soobroon.workers.dev';
const RUN_MS = Math.max(0, +(process.env.RUN_MINUTES || 4.5)) * 60000, EVERY_MS = 60000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function klines(key, itv, limit = 1000) { // velas cerradas del exchange de la moneda (BTCUSDT, BTC-USDT@bingxf, SOLUSDT@bybit…); sin respuesta → mismo par en Binance Spot
  const r = await M.klinesAny(key, itv, limit, {meta: true}); if (r.src !== M.srcOf(key)) console.log(`${key} ${itv}: ${M.EXCH[M.srcOf(key)] || ''} no respondió, se usó Binance Spot`); return r.cs;
}
async function post(path, body) {
  const r = await fetch(PUSH_URL + path, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(path + ': ' + (j.error || r.status)); return j;
}

/* Scripts Pine de cada cuenta: tus scripts (Firestore users/<uid>/data/scripts), los del catálogo y los PRO (colección «pro») */
function catalog() { try { const vm = require('vm'), fs = require('fs'), ctx = {}; vm.runInNewContext(fs.readFileSync(require('path').join(__dirname, '..', 'catalog.js'), 'utf8'), ctx); return ctx.CCTCatalog || []; } catch { return []; } }
function makeScripts(db) {
  const cat = catalog(), byUid = new Map(), pro = new Map();
  return async (uid, sid) => {
    if (sid.startsWith('cat:')) {
      const id = sid.slice(4), c = cat.find(x => x.id === id); if (c && c.code) return {code: c.code, name: c.name};
      if (!db) return null; if (!pro.has(id)) { try { const sn = await db.collection('pro').doc(id).get(); pro.set(id, sn.exists ? sn.data().code : ''); } catch { pro.set(id, ''); } }
      return pro.get(id) ? {code: pro.get(id), name: (c && c.name) || id} : null;
    }
    if (!db || !uid) return null;
    if (!byUid.has(uid)) { let list = []; try { const sn = await db.doc(`users/${uid}/data/scripts`).get(); if (sn.exists) { const v = JSON.parse(sn.data().items || '[]'); list = Array.isArray(v) ? v : (v.items || []); } } catch {} byUid.set(uid, list); }
    const s = byUid.get(uid).find(x => x && x.id === sid); return s && s.code ? {code: s.code, name: s.name} : null;
  };
}
async function pineRun(code, cs, opts, getK) { // igual que la app: si el script pide otra moneda/temporalidad (request.security) se descargan esas velas y se vuelve a correr
  let res = Pine.run(code, cs, Object.assign({timeLimitMs: 60000, alertCap: 30000}, opts));
  if (res && res.ok && res.needs && res.needs.length) {
    const sec = {}; for (const n of res.needs.slice(0, 40)) { try { sec[n.symbol + '|' + n.interval] = await getK(n.symbol, n.interval); } catch {} }
    res = Pine.run(code, cs, Object.assign({timeLimitMs: 90000, alertCap: 30000, sec}, opts));
  }
  return res;
}

/* Una vuelta: revisa todas las alertas pendientes y devuelve los resultados */
async function round(key, getScript) {
  const jobs = await post('/ind/jobs', {key}), out = [], kc = new Map(), runs = new Map();
  const getK = async (s, i) => { const k = s + '|' + i; if (!kc.has(k)) kc.set(k, klines(s, i).catch(e => { kc.delete(k); throw e; })); return kc.get(k); };
  let checked = 0, hits = 0;
  for (const dv of jobs.devs || []) for (const a of dv.alerts || []) {
    let cs; try { cs = await getK(a.symbol, a.interval); } catch (e) { console.log('velas', a.symbol, a.interval, e.message); continue; }
    if (cs.length < 3) continue; const k = cs.length - 1, lc = cs[k].t; if (!(lc > (a.lastBar || 0))) continue; // esa vela ya se revisó
    const bars = AE.barsToCheck(cs, k, a.lastBar); let info = null; checked++;
    try {
      if (a.src === 'std') { for (const i of bars) if (AE.stdHit(cs, i, a.spec)) info = fmt(cs[i].c); }
      else if (a.src === 'nova') {
        if (!globalThis.NovaNexus) continue; const nk = 'nova|' + a.symbol + '|' + a.interval + '|' + JSON.stringify(a.nopt || {});
        if (!runs.has(nk)) runs.set(nk, globalThis.NovaNexus.compute(cs, a.nopt || {}));
        const nova = runs.get(nk); for (const i of bars) { const sg = nova.bySignal[i]; if (sg && (a.spec.side === 'any' || sg.side === a.spec.side) && sg.score >= (a.spec.minScore || 0)) info = `${sg.side === 'buy' ? 'COMPRA' : 'VENTA'} ★${sg.score} @ ${fmt(sg.price)}`; }
      } else if (a.src === 'pine') {
        if (!Pine) continue; const sc = await getScript(dv.uid, a.sid); if (!sc) { console.log('script no encontrado', a.sid); continue; }
        const rk = [dv.uid, a.sid, a.symbol, a.interval, JSON.stringify(a.inputs || {})].join('|');
        if (!runs.has(rk)) runs.set(rk, await pineRun(sc.code, cs, {inputs: a.inputs || {}, interval: a.interval, symbol: M.symOf(a.symbol), exch: M.srcOf(a.symbol), symKey: a.symbol, name: sc.name}, getK));
        const res = runs.get(rk); if (!res || !res.ok) { console.log('Pine falló', a.sid, res && res.error && res.error.msg); continue; }
        for (const i of bars) { const r = AE.pineHit(res, a.spec, cs, i); if (r.hit) info = r.msg || ''; }
      }
    } catch (e) { console.log('alerta', a.id, String(e.message || e).slice(0, 160)); continue; }
    if (info !== null) hits++;
    out.push({dev: dv.dev, id: a.id, lastBar: lc, hit: info !== null, info: info || ''});
  }
  if (out.length) { const r = await post('/ind/report', {key, results: out}); console.log(`${new Date().toISOString()} · revisadas ${checked} · saltaron ${hits} · avisos enviados ${r.sent || 0}`); }
  return {checked, hits};
}
function fmt(v) { const a = Math.abs(v); return (+v).toLocaleString('en-US', {maximumFractionDigits: a >= 1000 ? 2 : a >= 1 ? 4 : 8}); }

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT, key = botPushKey(raw);
  if (!key) { console.log('FIREBASE_SERVICE_ACCOUNT no está configurado: no hay nada que hacer.'); return; }
  let db = null; try { const admin = require('firebase-admin'); admin.initializeApp({credential: admin.credential.cert(JSON.parse(raw))}); db = admin.firestore(); } catch (e) { console.log('Sin Firestore (solo indicadores comunes y Nova Nexus):', e.message); }
  const getScript = makeScripts(db), end = Date.now() + RUN_MS;
  do {
    const t0 = Date.now();
    try { await round(key, getScript); } catch (e) { console.log('vuelta:', String(e.message || e).slice(0, 200)); }
    const wait = EVERY_MS - (Date.now() - t0); if (Date.now() + wait > end) break; await sleep(Math.max(1000, wait));
  } while (Date.now() < end);
}
if (require.main === module) main().then(() => process.exit(0)).catch(e => { console.error('Error:', String(e.message || e).slice(0, 200)); process.exit(1); });
module.exports = {round, klines, makeScripts};

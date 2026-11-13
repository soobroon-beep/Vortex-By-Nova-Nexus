#!/usr/bin/env node
/* NOVA BOT LAB · reentrenamiento programado (GitHub Actions, sin depender de tu navegador).
   Para cada bot con «ciclo automático» activado: descarga velas cerradas, re-evalúa la versión principal con datos recientes (monitoreo)
   y corre el optimizador walk-forward (ajusta solo con entrenamiento y valida en tramos que no vio).
   · NUNCA cambia la versión principal ni toca tus bots: solo escribe sus resultados en users/<uid>/data/botlab_server.
   · La app te muestra la propuesta (si hay) y tú decides.
   · Sin la variable FIREBASE_SERVICE_ACCOUNT no hace nada (sale sin error). Nunca imprime secretos ni datos de usuarios. */
'use strict';
const BR = require('../botlab-brain.js'), NT = require('../botlab-notify.js'), B = require('../botlab-engine.js'), O = require('../botlab-optimizer.js'), P = require('../botlab-paper.js'), RK = require('../botlab-risk.js');
try { require('../nova-nexus.js'); } catch {}
let Pine = null; try { Pine = require('../pine.js'); } catch {}
/* Indicadores incluidos en la app (catálogo: Nova Nexus, Señales iA 2.7…): los bots los usan como 'cat:<id>' y no viven en data/scripts */
function catalogScripts() { try { const vm = require('vm'), fs = require('fs'), ctx = {}; vm.runInNewContext(fs.readFileSync(require('path').join(__dirname, '..', 'catalog.js'), 'utf8'), ctx); return (ctx.CCTCatalog || []).map(c => ({id: 'cat:' + c.id, name: c.name, code: c.code, builtin: true})); } catch { return []; } }
const BASES = ['https://data-api.binance.vision/api/v3', 'https://api.binance.com/api/v3']; // los runners de GitHub no siempre llegan a api.binance.com

async function history(sym, itv, count) { // velas CERRADAS, paginadas hacia atrás
  const want = Math.min(8000, Math.max(200, count | 0)), out = []; let end = Date.now();
  while (out.length < want) {
    let raw = null; for (const base of BASES) { try { const r = await fetch(`${base}/klines?symbol=${encodeURIComponent(sym)}&interval=${itv}&limit=1000&endTime=${end}`); if (r.ok) { raw = await r.json(); break; } } catch {} }
    if (!raw) { // Binance no responde: velas guardadas por VORTEX o el mismo par de otro exchange (Bybit, OKX, BingX, MEXC…)
      if (out.length) break; try { const M = require('../markets.js'); return (await M.klinesAny(sym, itv, Math.min(1000, want))).slice(-want); } catch { throw new Error('No se pudieron descargar velas de ' + sym); } }
    if (!raw.length) break;
    out.unshift(...raw.map(d => ({t: d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5], ct: d[6]}))); end = raw[0][0] - 1; if (raw.length < 1000) break;
  }
  return out.filter(c => c.ct < Date.now()).slice(-want).map(({ct, ...c}) => c);
}
const userOps = sp => { const o = []; for (const g of [sp.entry, sp.exit]) for (const s of ['long', 'short']) for (const c of g[s] || []) for (const x of [c.a, c.b]) if (x && x.k === 'user') o.push(x); return o; };
function userSeries(spec, candles, scripts) { // ejecuta tus indicadores Pine sobre las velas (mismo motor que la app)
  const uo = userOps(spec), user = {}; if (!uo.length) return user; if (!Pine) throw new Error('Motor Pine no disponible en el servidor');
  for (const sid of [...new Set(uo.map(x => x.sid))]) {
    const sc = scripts.find(x => x.id === sid); if (!sc || !sc.code) throw new Error('El indicador «' + (uo.find(x => x.sid === sid).sname || sid) + '» ya no existe en tu cuenta');
    const res = Pine.run(sc.code, candles, {interval: spec.interval, symbol: spec.symbol, name: sc.name, timeLimitMs: 90000, alertCap: 30000, logLabels: true}); if (!res.ok) throw new Error('Tu indicador falló en el servidor: ' + ((res.error && res.error.msg) || ''));
    const src = O.extractSources(res, candles.length);
    for (const x of uo.filter(y => y.sid === sid)) { const f = O.pickSource(src, x, candles.length); if (!f) throw new Error('El indicador «' + (x.sname || sid) + '» ya no tiene la línea «' + (x.sl || x.src) + '»'); user[sid + '|' + x.src] = f.series; }
  }
  return user;
}
async function retrainBot(bot, scripts, getCandles, now, brainCtx) {
  const v = bot.versions.find(x => x.v === bot.mainV); if (!v) return {at: now, status: 'error', reason: 'Sin versión principal'};
  const spec = B.normalizeSpec(v.spec), cyc = bot.cycle || {}, bars = Math.min(8000, Math.max(1500, cyc.bars || 4000));
  try {
    const candles = await getCandles(spec.symbol, spec.interval, bars); if (candles.length < 300) throw new Error('Pocas velas disponibles (' + candles.length + ')');
    const user = userSeries(spec, candles, scripts), ropts = {nova: globalThis.NovaNexus, user: Object.keys(user).length ? user : null};
    const res = B.backtest(candles, spec, {nova: ropts.nova, user: ropts.user || undefined}), m = res.metrics;
    const opt = await O.optimize(candles, spec, {seed: O.hash(bot.id + new Date(now).toISOString().slice(0, 10)), budget: cyc.budget || 60, ropts});
    let br = null; // bot conectado a un cerebro de Neural Brain: además prueba las ideas del cerebro y elige la mejor que gane fuera de muestra
    if (brainCtx) { try { br = await BR.improve({candles, spec, ropts: {nova: ropts.nova, user: ropts.user || undefined}, base: res, opt, link: brainCtx.link, memory: brainCtx.memory, now}); brainCtx.out = br; } catch (e) { brainCtx.out = {brain: {at: now, error: String(e.message || e).slice(0, 200)}, memory: brainCtx.memory || []}; } }
    if (br && br.candidate && opt.decision !== 'propuesta' || br && br.candidate && br.brain.best && br.brain.best.from !== 'optimizador') { opt.decision = 'propuesta'; opt.candidate = br.candidate; opt.changes = []; opt.oos = null; opt.holdout = null; opt.folds = []; opt.reasons = (opt.reasons || []).concat([br.note]); }
    return {at: now, note: br && br.candidate ? br.note : undefined, brain: br ? br.brain : undefined, v: bot.mainV, status: 'ok', symbol: spec.symbol, interval: spec.interval, bars: candles.length, from: candles[0].t, to: candles[candles.length - 1].t,
      monitor: {n: m.n, net: m.net, retPct: m.retPct, maxDDPct: m.maxDDPct, winRate: m.winRate, val: res.segments.val.retPct, test: res.segments.test.retPct, buyHold: res.buyHold.retPct, verdict: res.verdict.level},
      decision: opt.decision, reasons: opt.reasons, changes: opt.changes, folds: opt.folds, oos: opt.oos, holdout: opt.holdout, candidate: opt.candidate, dims: opt.dims};
  } catch (e) { return {at: now, v: bot.mainV, status: 'error', reason: String(e.message || e).slice(0, 300)}; }
}
const PUSH_URL = process.env.PUSH_URL || 'https://vortex-push.soobroon.workers.dev';
async function botPush(uid, msgs) { // avisos de los bots a tus celulares (Worker «vortex-push», con la llave derivada de FIREBASE_SERVICE_ACCOUNT)
  const key = require('./bot-push-key.js').botPushKey(process.env.FIREBASE_SERVICE_ACCOUNT); if (!key) return;
  try { const r = await fetch(PUSH_URL + '/bot-push', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({key, uid, msgs: msgs.slice(-6)})}); const j = await r.json().catch(() => ({})); console.log(`avisos al celular: ${j.sent || 0} enviados a ${j.devices || 0} dispositivo(s)${j.error ? ' · ' + j.error : ''}`); } catch (e) { console.log('avisos al celular: ' + String(e.message || e).slice(0, 120)); }
}
async function postDiscord(url, embeds) { try { const r = await fetch(url + '?wait=false', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({username: 'VORTEX', embeds: embeds.slice(0, 10), allowed_mentions: {parse: []}})}); return r.ok; } catch { return false; } }
async function paperBot(bot, scripts, getCandles, now, gateF, notify, pushOut) { // avanza las sesiones de paper trading activas (mismo motor que la app; no envía órdenes)
  const out = []; for (const sess of bot.paper || []) {
    if (sess.status !== 'running') continue; const iv = B.IV_MS[sess.spec.interval]; if (sess.last && now < sess.last.t + 2 * iv) continue; const ropts = {nova: globalThis.NovaNexus, user: null, gate: gateF ? gateF(sess) : null};
    try { await P.step(sess, async (sym, itv, count) => { const C = await getCandles(sym, itv, count); const u = userSeries(sess.spec, C, scripts); ropts.user = Object.keys(u).length ? u : null; return C; }, ropts, now); sess.err = null; sess.checkedAt = now; sess.by = 'servidor'; }
    catch (e) { sess.err = String(e.message || e).slice(0, 200); sess.checkedAt = now; sess.by = 'servidor'; }
    const evs = NT.pending(sess); if (evs.length && pushOut && bot.notify !== false) for (const e of evs.slice(-6)) pushOut.push(NT.push(bot, sess, e)); // también a tu celular (servidor de avisos)
    const HK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\//, own = bot.dcDest === 'own' && HK.test(bot.dcHook || '') ? bot.dcHook : null; // canal propio del bot
    const dUrl = own || (notify && notify.url && notify.bots !== false && HK.test(notify.url) ? notify.url : null);
    if (evs.length && dUrl && bot.notify !== false) await postDiscord(dUrl, evs.slice(-6).map(e => NT.embed(bot, sess, e)));
    const L = sess.ledger; for (let i = 0; i < L.length - 300; i++) { delete L[i].reasonIn; delete L[i].ctx; delete L[i].sl; delete L[i].tp; } out.push(sess);
  } return out;
}
const due = (bot, prev, now, force, linked) => { const c = linked ? Object.assign({enabled: true, everyHours: 24}, bot.cycle, {enabled: true}) : bot.cycle; if (!c || !c.enabled || bot.status === 'paused' || bot.status === 'archived') return false; if (force) return true; const every = Math.max(6, Math.min(24 * 14, c.everyHours || 24)) * 36e5; return !prev || now - (prev.at || 0) >= every - 30 * 6e4; };

/* La app comprime tus scripts cuando son grandes («gz1:» + base64 gzip): sin esto el servidor no los encontraba («ya no existe en tu cuenta») */
function unpackStr(v) { return typeof v === 'string' && v.startsWith('gz1:') ? require('zlib').gunzipSync(Buffer.from(v.slice(4), 'base64')).toString('utf8') : v; }
/* Si el servidor ya había avanzado una sesión más que la copia de la app (la app estuvo cerrada), se sigue desde la del servidor:
   así no se repiten operaciones ni avisos. Solo si es el MISMO libro (cadena de hashes), igual que hace la app al juntar. */
function adoptServer(b, srvPaper) {
  for (const lo of b.paper || []) {
    if (lo.status !== 'running') continue; const sv = (srvPaper || []).find(x => x.id === lo.id); if (!sv || !Array.isArray(sv.ledger) || !Array.isArray(lo.ledger)) continue;
    const n = Math.min(lo.ledger.length, sv.ledger.length); let same = true; for (let i = 0; i < n; i++) if (lo.ledger[i].h !== sv.ledger[i].h) { same = false; break; } if (!same) continue;
    if (sv.ledger.length > lo.ledger.length || (sv.last && (!lo.last || sv.last.t > lo.last.t)) || (sv.nN != null && lo.nN == null)) for (const k of ['ledger', 'cash', 'peak', 'anchorT', 'curve', 'open', 'last', 'gaps', 'notes', 'halted', 'err', 'checkedAt', 'nN', 'oN', 'by']) if (k in sv) lo[k] = sv[k];
  }
}
async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT; if (!raw) { console.log('FIREBASE_SERVICE_ACCOUNT no está configurado: no hay nada que hacer. (Ver INSTALL.md → Reentrenamiento programado)'); return; }
  const MODE = process.env.MODE || 'all'; // retrain | paper | all
  let admin; try { admin = require('firebase-admin'); } catch { console.log('Falta firebase-admin (npm i --no-save firebase-admin)'); process.exit(1); }
  admin.initializeApp({credential: admin.credential.cert(JSON.parse(raw))}); const db = admin.firestore(), now = Date.now(); try { require('../markets.js').setStore(require('./candle-store.js').reader(db)); } catch {}
  const force = process.env.FORCE === '1', cache = new Map();
  const getCandles = async (s, i, n) => { const k = s + '|' + i + '|' + n; if (!cache.has(k)) cache.set(k, await history(s, i, n)); return cache.get(k); };
  const users = await db.collection('users').listDocuments(); let nb = 0, nr = 0, np = 0, nps = 0, nbr = 0;
  for (const u of users) {
    const bd = await u.collection('data').doc('botlab').get(); if (!bd.exists) continue; let S; try { S = JSON.parse(bd.data().items || '{}'); } catch { continue; }
    let links = {}; try { const bb = await u.collection('data').doc('brain_bots').get(); links = (bb.exists && bb.data().bots) || {}; } catch {} const linked = b => links[b.id] && links[b.id].auto !== false;
    const all = S.bots || [], cyc = MODE !== 'paper' ? all.filter(b => b && ((b.cycle && b.cycle.enabled) || linked(b))) : [], pap = MODE !== 'retrain' ? all.filter(b => b && (b.paper || []).some(x => x.status === 'running')) : []; if (!cyc.length && !pap.length) continue;
    const sd = await u.collection('data').doc('botlab_server').get(), prev = sd.exists ? sd.data() : {}, results = Object.assign({}, prev.results || {}), paper = Object.assign({}, prev.paper || {}), brainMem = Object.assign({}, prev.brainMem || {}); let scripts = null, changed = false;
    const loadScripts = async () => { if (scripts !== null) return; try { const s = await u.collection('data').doc('scripts').get(); scripts = s.exists ? JSON.parse(unpackStr(s.data().items || '[]')) : []; if (!Array.isArray(scripts)) scripts = scripts.items || []; } catch { scripts = []; } scripts = scripts.concat(catalogScripts().filter(c => c.code && !scripts.some(x => x.id === c.id))); try { const pro = await db.collection('pro').get(); for (const d of pro.docs) if (!scripts.some(x => x.id === 'cat:' + d.id)) scripts.push({id: 'cat:' + d.id, name: d.id, code: d.data().code, builtin: true}); } catch {} }; // los Nova Nexus PRO ya no están en el repo: se leen de Firestore
    for (const b of cyc) { nb++; if (!due(b, results[b.id], now, force, linked(b))) continue; await loadScripts(); const bc = linked(b) ? {link: links[b.id], memory: brainMem[b.id] || []} : null; const r = await retrainBot(b, scripts, getCandles, now, bc); if (bc && bc.out) { brainMem[b.id] = JSON.parse(JSON.stringify(bc.out.memory || [])); nbr++; } results[b.id] = JSON.parse(JSON.stringify(r)); changed = true; nr++; console.log(`· bot ${nr}${bc ? ' (con cerebro)' : ''}: ${r.status}${r.status === 'error' ? ' · ' + String(r.reason || '').slice(0, 120) : ' · ' + r.decision + (r.brain ? ` · ideas probadas: ${(r.brain.tried || []).length}` : '')}`); if (r.decision === 'propuesta') np++; }
    const gateF = RK.gateFor(S.risk, all.flatMap(x => x.status === 'archived' ? [] : x.paper || []), now);
    const pushOut = [];
    for (const b of pap) { await loadScripts(); adoptServer(b, (prev.paper || {})[b.id]); const ss = await paperBot(b, scripts, getCandles, now, gateF, S.notify, pushOut); if (ss.length) { paper[b.id] = (b.paper || []).filter(x => x.status === 'running').map(x => x); changed = true; nps += ss.length; } }
    if (pushOut.length) await botPush(u.id, pushOut);
    if (changed) { for (const id of Object.keys(results)) if (!all.some(b => b.id === id)) delete results[id]; for (const id of Object.keys(paper)) if (!all.some(b => b.id === id)) delete paper[id]; for (const id of Object.keys(brainMem)) if (!all.some(b => b.id === id)) delete brainMem[id]; const clean = o => JSON.parse(JSON.stringify(o || {})); // Firestore no acepta «undefined» (p. ej. ctx de una posición abierta): antes el guardado fallaba y los bots no avanzaban
      await u.collection('data').doc('botlab_server').set({results: clean(results), paper: clean(paper), brainMem: clean(brainMem), updatedAt: admin.firestore.FieldValue.serverTimestamp()}); }
  }
  console.log(`Modo ${MODE} · ciclos: ${nb} · reentrenados: ${nr} · con cerebro: ${nbr} · con propuesta: ${np} · sesiones paper avanzadas: ${nps}`);
}
if (require.main === module) main().catch(e => { console.error('Error:', String(e.message || e).slice(0, 200)); process.exit(1); });
module.exports = {retrainBot, paperBot, due, history, userSeries};

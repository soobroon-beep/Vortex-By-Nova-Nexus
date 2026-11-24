#!/usr/bin/env node
/* USO DE VORTEX · resumen para el panel del desarrollador (GitHub Actions, cada hora).
   Junta, con la cuenta de servicio:
     · las cuentas (Firebase Auth): cuántas hay, cuándo se crearon y cuándo usaron la app por última vez;
     · el plan de cada una (plans/{uid});
     · los «latidos» de cada dispositivo (presence/{id}): visitantes con y sin cuenta, celular o PC, app instalada, zona horaria;
   y lo guarda en users/<uid del creador>/data/usage (solo el creador lo puede leer).
   También guarda el historial diario de dispositivos activos y borra latidos de más de 120 días.
   El repositorio es público: el registro solo imprime conteos (nunca correos ni nombres). */
'use strict';
const crypto = require('crypto');
const OWNER = 'a8d56a29aa7c5208d7748a84e75e4b14c713c521136174e8a652b7a76ac19b28'; // sha-256 del correo del creador (el mismo de plans.js)
const TZ = 'America/Mexico_City', DAY = 864e5, MAX_LIST = 1500;

/* ───────── funciones puras (tests/usage.test.js) ───────── */
const dayKey = (t, tz = TZ) => new Date(t).toLocaleDateString('en-CA', {timeZone: tz}); // AAAA-MM-DD en hora de México
function planOf(p) {
  if (!p) return 'free'; const now = Date.now();
  if (p.by === 'creador') return 'dev';
  const pay = p.payTier && p.payEnd > now - DAY ? p.payTier : '', ref = p.refTier && (!p.refEnd || p.refEnd > now) ? p.refTier : '';
  const legacy = !('payTier' in p) && !('refTier' in p) ? p.tier : '';
  const r = {free: 0, plus: 1, infinity: 2}; let best = 'free';
  for (const t of [pay, ref, legacy]) if (r[t] > r[best]) best = t;
  return best;
}
function summarize(users, plans, pres, prevHist, now) {
  const since = d => now - d * DAY, acc = {total: users.length, new1: 0, new7: 0, new30: 0, act1: 0, act7: 0, act30: 0};
  const signups = {}, planCount = {free: 0, plus: 0, infinity: 0, dev: 0};
  for (const u of users) {
    if (u.c >= since(1)) acc.new1++; if (u.c >= since(7)) acc.new7++; if (u.c >= since(30)) acc.new30++;
    const last = Math.max(u.s || 0, u.r || 0, u.seen || 0); if (last >= since(1)) acc.act1++; if (last >= since(7)) acc.act7++; if (last >= since(30)) acc.act30++;
    if (u.c >= since(60)) { const k = dayKey(u.c); signups[k] = (signups[k] || 0) + 1; }
    planCount[u.p = planOf(plans[u.uid])] = (planCount[u.p] || 0) + 1;
  }
  const dv = {d1: 0, d7: 0, d30: 0, live: 0, anon30: 0, logged30: 0, pc: 0, m: 0, tab: 0, pwa: 0, newDev7: 0, newDev30: 0, ret30: 0}, tz = {}, today = dayKey(now), firsts = {};
  for (const p of pres) {
    if (p.at >= now - 12 * 6e4) dv.live++;
    if (p.at >= since(1)) dv.d1++; if (p.at >= since(7)) dv.d7++;
    if (p.at < since(30)) continue;
    dv.d30++; if (p.uid) dv.logged30++; else dv.anon30++;
    dv[p.dev] = (dv[p.dev] || 0) + 1; if (p.pwa) dv.pwa++; if ((p.n || 1) > 1) dv.ret30++;
    if (p.first >= since(7)) dv.newDev7++; if (p.first >= since(30)) { dv.newDev30++; const k = dayKey(p.first); firsts[k] = (firsts[k] || 0) + 1; }
    const z = p.tz || '—'; tz[z] = (tz[z] || 0) + 1;
  }
  const hist = Object.assign({}, prevHist || {}); // dispositivos activos por día (se guarda cada hora: el máximo del día)
  const todayN = pres.filter(p => dayKey(p.at) === today).length; hist[today] = Math.max(hist[today] || 0, todayN);
  for (const k of Object.keys(hist)) if (k < dayKey(now - 120 * DAY)) delete hist[k];
  const tzTop = Object.entries(tz).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {acc, signups, plans: planCount, dev: dv, hist, firsts, tzTop};
}

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.SA; if (!raw) { console.log('Falta FIREBASE_SERVICE_ACCOUNT: no se hace nada.'); return; }
  const admin = require('firebase-admin'); admin.initializeApp({credential: admin.credential.cert(JSON.parse(raw))}); const db = admin.firestore();
  const now = Date.now(), users = []; let page, ownerUid = null;
  do { const r = await admin.auth().listUsers(1000, page); page = r.pageToken;
    for (const u of r.users) {
      if (u.email && crypto.createHash('sha256').update(u.email.trim().toLowerCase()).digest('hex') === OWNER) ownerUid = u.uid;
      const t = s => (s ? Date.parse(s) || 0 : 0);
      users.push({uid: u.uid, n: (u.displayName || '').slice(0, 60), e: (u.email || '').slice(0, 90), ph: (u.photoURL || '').slice(0, 300), c: t(u.metadata.creationTime), s: t(u.metadata.lastSignInTime), r: t(u.metadata.lastRefreshTime), pv: (u.providerData[0] || {}).providerId || ''});
    }
  } while (page);
  if (!ownerUid) { console.log('No se encontró la cuenta del creador.'); return; }
  const plans = {}; (await db.collection('plans').get()).forEach(d => { plans[d.id] = d.data(); });
  const pres = [], old = [], ts = v => (v && v.toMillis ? v.toMillis() : +v || 0);
  (await db.collection('presence').get()).forEach(d => { const x = d.data(), p = {id: d.id, at: ts(x.at), first: ts(x.first), uid: x.uid || '', dev: x.dev || 'pc', pwa: !!x.pwa, tz: x.tz || '', n: x.n || 1, ver: x.ver || '', src: x.src || ''}; if (p.at < now - 120 * DAY) old.push(d.ref); else pres.push(p); });
  for (let i = 0; i < old.length; i += 400) { const b = db.batch(); old.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit(); }
  const byUid = {}; for (const p of pres) if (p.uid) { const o = byUid[p.uid] || (byUid[p.uid] = {seen: 0, dev: {}, pwa: false}); o.seen = Math.max(o.seen, p.at); o.dev[p.dev] = 1; if (p.pwa) o.pwa = true; }
  for (const u of users) { const b = byUid[u.uid]; if (b) { u.seen = b.seen; u.d = Object.keys(b.dev).join(','); u.pwa = b.pwa; } }
  const ref = db.collection('users').doc(ownerUid).collection('data').doc('usage'), prev = (await ref.get()).data() || {};
  const S = summarize(users, plans, pres, prev.hist, now);
  const list = users.map(u => ({uid: u.uid, n: u.n, e: u.e, ph: u.ph, c: u.c, l: Math.max(u.s || 0, u.r || 0, u.seen || 0), p: u.p, d: u.d || '', pwa: !!u.pwa, pv: u.pv.replace('.com', '')}))
    .sort((a, b) => b.l - a.l).slice(0, MAX_LIST);
  const srcs = {}; for (const p of pres) if (p.src && p.first >= now - 30 * DAY) srcs[p.src] = (srcs[p.src] || 0) + 1;
  await ref.set({at: now, v: 1, ...S, src: Object.entries(srcs).sort((a, b) => b[1] - a[1]).slice(0, 8), list});
  console.log(`Cuentas: ${S.acc.total} · activas 7 d: ${S.acc.act7} · dispositivos 30 d: ${S.dev.d30} · en línea: ${S.dev.live} · latidos borrados: ${old.length}`);
}
if (require.main === module) main().catch(e => { console.log('ERROR: ' + (e.message || e)); process.exit(1); });
module.exports = {summarize, planOf, dayKey};

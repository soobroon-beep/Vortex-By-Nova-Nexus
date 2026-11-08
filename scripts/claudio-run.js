#!/usr/bin/env node
/* CLAUDIO · ejecución 24/7 en GitHub Actions (no depende de que tengas VORTEX abierto).
   MODE=tick    → cada hora: descarga velas 1 h cerradas y el libro de órdenes de Binance, pide a Jev UNA decisión por vela para todos los candidatos y avanza la sesión.
   MODE=nightly → cada noche: Brier, oportunidades perdidas y recalibración (solo probabilidades; los límites de riesgo no se tocan).
   · Lee users/<uid>/data/claudio (lo escribe la app: encendido, interruptor de emergencia, capital) y escribe users/<uid>/data/claudio_server.
   · Simulación con capital virtual: NO envía órdenes a ningún exchange ni usa claves de exchange.
   · Sin FIREBASE_SERVICE_ACCOUNT no hace nada. JEV_API_KEY (opcional) activa Jev real; sin ella usa el evaluador local con el mismo esquema. Nunca imprime secretos. */
'use strict';
const K = require('../claudio-core.js'), R = require('../claudio-candidates.js');
const BASES = ['https://data-api.binance.vision/api/v3', 'https://api.binance.com/api/v3'];
const MAX_DOC = 900000;

async function get(path, fx) {
  fx = fx || fetch; let last = null;
  for (const b of BASES) { try { const r = await fx(b + path); if (r.ok) return await r.json(); last = 'HTTP ' + r.status; if (r.status === 400) break; } catch (e) { last = e.message; } }
  throw new Error(last || 'sin respuesta');
}
function makeFeed(fx, now) {
  const cache = new Map();
  return {
    candles: async (sym, n) => { const k = sym + n; if (!cache.has(k)) { const raw = await get(`/klines?symbol=${encodeURIComponent(sym)}&interval=1h&limit=${Math.min(1000, Math.max(100, n | 0))}`, fx); cache.set(k, raw.filter(d => d[6] < (now || Date.now())).map(d => ({t: d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]}))); } return cache.get(k); },
    book: async sym => { const d = await get(`/depth?symbol=${encodeURIComponent(sym)}&limit=20`, fx); return {t: Date.now(), bids: d.bids.map(x => [+x[0], +x[1]]), asks: d.asks.map(x => [+x[0], +x[1]])}; }
  };
}
function compact(s) { // mantiene el documento bajo el tope de Firestore (1 MiB) sin tocar el libro de operaciones
  let str = JSON.stringify(s); while (str.length > MAX_DOC && s.preds.length > 300) { s.preds.splice(0, Math.ceil(s.preds.length / 4)); str = JSON.stringify(s); }
  return str;
}
function summary(s) { const st = K.stats(s); return {equity: st.equity, retPct: st.retPct, ddPct: st.ddPct, open: st.open, trades: st.n, lastT: s.lastT, by: s.lastBy, kill: !!s.kill, halted: !!s.halted, calibV: s.calib.v}; }
/* Una sesión: cfg = documento «claudio» de la app; prev = sesión anterior (o null). Devuelve la sesión avanzada. */
async function runOne(cfg, prev, mode, deps) {
  const now = deps.now || Date.now(), s = K.prepare(cfg, prev, now, R.symbols());
  if (mode === 'nightly') K.nightly(s, now);
  else await K.step(s, deps.feed, deps.evaluate, now);
  return s;
}
async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT, MODE = process.env.MODE === 'nightly' ? 'nightly' : 'tick';
  if (!raw) { console.log('FIREBASE_SERVICE_ACCOUNT no está configurado: no hay nada que hacer. (Ver INSTALL.md → Claudio)'); return; }
  let admin; try { admin = require('firebase-admin'); } catch { console.log('Falta firebase-admin (npm i --no-save firebase-admin)'); process.exit(1); }
  admin.initializeApp({credential: admin.credential.cert(JSON.parse(raw))}); const db = admin.firestore(), now = Date.now();
  const feed = makeFeed(null, now), evaluate = K.jevEvaluator({apiKey: process.env.JEV_API_KEY || '', model: process.env.JEV_MODEL || 'jev-latest'});
  let n = 0;
  for (const u of await db.collection('users').listDocuments()) {
    // La configuración y la copia del navegador viajan dentro de tu documento «botlab» (botlab.claudio); el documento «claudio» se mantiene por compatibilidad.
    let app = null; try { const bd = await u.collection('data').doc('botlab').get(); if (bd.exists) app = (JSON.parse(bd.data().items || '{}') || {}).claudio || null; } catch {}
    let legacy = null; try { const cd = await u.collection('data').doc('claudio').get(); if (cd.exists) legacy = cd.data(); } catch {}
    const cfg = app && app.cfg && (!legacy || (app.cfg.at || 0) >= (legacy.at || 0)) ? app.cfg : (legacy || {}); if (!cfg.enabled) continue;
    const sd = await u.collection('data').doc('claudio_server').get(); let prev = null; if (sd.exists) { try { prev = JSON.parse(sd.data().s || 'null'); } catch {} }
    prev = K.newer(prev, app && app.s);
    try {
      const s = await runOne(cfg, prev, MODE, {feed, evaluate, now}), str = compact(s);
      await u.collection('data').doc('claudio_server').set({s: str, summary: summary(s), updatedAt: admin.firestore.FieldValue.serverTimestamp()}); n++;
      const sm = summary(s); console.log(`Sesión ${n}: ${MODE} · patrimonio ${sm.equity.toFixed(2)} · ${sm.trades} operaciones · ${sm.open} abiertas · evaluador ${sm.by || '—'}${sm.kill ? ' · KILL' : ''}${sm.halted ? ' · DETENIDO' : ''}`);
    } catch (e) { console.log('Error en una sesión: ' + e.message); }
  }
  console.log(`Claudio ${MODE}: ${n} sesión(es) actualizada(s).`);
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = {makeFeed, runOne, compact, summary};

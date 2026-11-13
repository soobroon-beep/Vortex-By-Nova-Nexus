// VORTEX · Velas propias (almacén en Firestore: candles/<SIMBOLO>_<temporalidad>).
// El Motor del servidor guarda aquí, al cerrar cada vela, las velas de las monedas principales y las de tus bots. Las toma de Binance y,
// si Binance no responde, del mismo par en otro exchange (markets.js · respaldo automático). Así VORTEX siempre tiene sus propias velas:
// la app, el Screener, las alertas y los bots las usan cuando los exchanges fallan.
// Formato: {d: '[[t,o,h,l,c,v],…]' (texto, la app lo lee con una sola petición), src, at, n}. Máx. 1000 velas por documento (~60 KB).
'use strict';
const M = require('../markets.js');
const TFS = ['15m', '1h', '4h'], KEEP = 1000, IV = {'15m': 9e5, '1h': 36e5, '4h': 144e5};
const docId = (sym, tf) => `${M.norm(sym)}_${tf}`;
const pack = cs => JSON.stringify(cs.map(c => [c.t, c.o, c.h, c.l, c.c, c.v]));
const unpack = s => { try { return JSON.parse(s).map(a => ({t: +a[0], o: +a[1], h: +a[2], l: +a[3], c: +a[4], v: +a[5]})); } catch { return []; } };
function merge(old, add, keep = KEEP) { const m = new Map(); for (const c of old || []) m.set(c.t, c); for (const c of add || []) m.set(c.t, c); return [...m.values()].sort((a, b) => a.t - b.t).slice(-keep); }
// lector para markets.js (setStore): solo velas CERRADAS guardadas, y solo si están al día (si no, mejor que siga buscando en exchanges)
function reader(db) {
  return async (sym, tf, n) => {
    if (!IV[tf]) return null; const d = await db.doc('candles/' + docId(sym, tf)).get(); if (!d.exists) return null;
    const cs = unpack(d.data().d); if (!cs.length || Date.now() - cs[cs.length - 1].t > 3 * IV[tf]) return null; return cs.slice(-n);
  };
}
/* Ronda del Motor: para cada temporalidad cuya vela acaba de cerrar, actualiza las monedas de la lista. mem = caché en memoria (evita lecturas). */
async function round(db, syms, now = Date.now(), mem = {}, log = () => {}) {
  let wrote = 0, fails = 0; const used = {};
  for (const tf of TFS) {
    const slot = Math.floor(now / IV[tf]); if ((now - slot * IV[tf]) < 50e3) continue; // 50 s para que el exchange cierre la vela
    if (mem['slot_' + tf] === slot) continue; mem['slot_' + tf] = slot;
    for (const sym of syms) {
      const k = docId(sym, tf); let have = mem[k];
      if (!have) { try { const d = await db.doc('candles/' + k).get(); have = d.exists ? unpack(d.data().d) : []; } catch { have = []; } }
      const need = have.length && now - have[have.length - 1].t < 50 * IV[tf] ? 20 : KEEP;
      try {
        const r = await M.klinesAny(M.norm(sym), tf, need, {meta: true, noStore: true}); // cerradas; con respaldo de exchanges
        const cs = merge(have, r.cs); mem[k] = cs; used[r.src] = (used[r.src] || 0) + 1;
        await db.doc('candles/' + k).set({d: pack(cs), src: r.src, at: now, n: cs.length}); wrote++;
      } catch (e) { fails++; }
    }
  }
  if (wrote || fails) log(`Velas de VORTEX: ${wrote} guardadas${fails ? ` · ${fails} sin datos` : ''} · fuentes: ${Object.entries(used).map(([s, n]) => s + ' ' + n).join(', ') || '—'}`);
  return {wrote, fails, used};
}
module.exports = {round, reader, merge, pack, unpack, docId, TFS};

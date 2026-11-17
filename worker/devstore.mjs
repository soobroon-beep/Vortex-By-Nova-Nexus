/* VORTEX · Dónde viven los celulares registrados para avisos (Worker «vortex-push»).
   · Con la base D1 «vortex-push-db» (enlace DB): miles de dispositivos. Cada fila guarda el dispositivo y unas banderas
     (active = tiene algo que revisar cada minuto, radar, scr, ind, uid) para que cada ronda lea SOLO los que la necesitan.
   · Sin D1 (respaldo, o en las pruebas): el KV como antes (lista «devs» + «dev:<id>»), con un tope bajo porque el plan gratis
     del KV solo permite 100 000 lecturas y 1000 escrituras al día.
   La primera vez que corre con D1, copia solos los dispositivos que había en el KV (no se pierde ningún registro). */

export const TRADE_TTL = 72 * 3600e3;
export const MAX_DEVICES_D1 = 50000, MAX_DEVICES_KV = 40, MAX_PER_UID = 10, MAX_NEW_PER_IP_DAY = 30;

export function flags(d, now = Date.now()) {
  const sub = !!(d && d.sub);
  const trades = (d.trades || []).some(t => !(t.m && t.m.done)) && now - (d.syncAt || 0) < TRADE_TTL;
  const active = sub && ((d.alerts || []).some(a => a && a.on) || !!(d.move && d.move.on) || trades || !!d.testAt);
  const s = d.scr || {}, scr = sub && s.on ? (s.h1 !== false ? 1 : 0) | (s.h4 !== false ? 2 : 0) : 0;
  // syms: lo que hay que pedir de precios para este dispositivo (alertas encendidas + trades abiertos); mv: movimientos bruscos
  const syms = !active ? '' : [...new Set([...(d.alerts || []).filter(a => a && a.on && typeof a.symbol === 'string').map(a => a.symbol), ...(trades ? (d.trades || []).filter(t => !(t.m && t.m.done) && typeof t.k === 'string').map(t => t.k) : [])])].join(',').slice(0, 4000);
  return {active: active ? 1 : 0, radar: sub && d.radar ? 1 : 0, scr, ind: sub && (d.ind || []).some(a => a && a.on) ? 1 : 0, uid: typeof d.uid === 'string' ? d.uid : '', syms, mv: active && d.move && d.move.on ? 1 : 0};
}
const parse = s => { try { return JSON.parse(s); } catch { return null; } };
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, uid TEXT NOT NULL DEFAULT '', data TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0, radar INTEGER NOT NULL DEFAULT 0, scr INTEGER NOT NULL DEFAULT 0, ind INTEGER NOT NULL DEFAULT 0, syms TEXT NOT NULL DEFAULT '', mv INTEGER NOT NULL DEFAULT 0, iph TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0)",
  'CREATE INDEX IF NOT EXISTS dev_active ON devices(active) WHERE active = 1',
  'CREATE INDEX IF NOT EXISTS dev_radar ON devices(radar) WHERE radar = 1',
  'CREATE INDEX IF NOT EXISTS dev_scr ON devices(scr) WHERE scr > 0',
  'CREATE INDEX IF NOT EXISTS dev_ind ON devices(ind) WHERE ind = 1',
  "CREATE INDEX IF NOT EXISTS dev_uid ON devices(uid) WHERE uid <> ''",
  'CREATE INDEX IF NOT EXISTS dev_iph ON devices(iph, created)',
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER NOT NULL DEFAULT 0)'
];

/* ───────── D1 ───────── */
const ready = new WeakMap(); // por base: el esquema y la copia desde el KV se revisan una vez por instancia
function d1Store(db, kv) {
  async function init() {
    if (ready.get(db)) return ready.get(db);
    const p = (async () => {
      await db.batch(SCHEMA.map(s => db.prepare(s)));
      const m = await db.prepare("SELECT v FROM meta WHERE k = 'kv_migrated'").first();
      if (!m && kv) { // primera vez con D1: se copian los dispositivos del KV
        const ids = (await kv.get('devs', 'json')) || [], now = Date.now(), rows = [];
        for (const id of ids) { const d = await kv.get('dev:' + id, 'json'); if (d && d.sub) rows.push([id, d]); }
        for (const part of chunk(rows, 40)) await db.batch(part.map(([id, d]) => { const f = flags(d, now); return db.prepare('INSERT OR IGNORE INTO devices (id, uid, data, active, radar, scr, ind, syms, mv, iph, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, f.uid, JSON.stringify(d), f.active, f.radar, f.scr, f.ind, f.syms, f.mv, '', now, d.updated || now); }));
        await db.prepare("INSERT OR REPLACE INTO meta (k, v, exp) VALUES ('kv_migrated', ?, 0)").bind(String(rows.length)).run();
      }
      return true;
    })();
    ready.set(db, p); try { return await p; } catch (e) { ready.delete(db); throw e; }
  }
  const upsert = (id, d, extra = {}) => {
    const f = flags(d), now = Date.now();
    return db.prepare('INSERT INTO devices (id, uid, data, active, radar, scr, ind, syms, mv, iph, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET uid = excluded.uid, data = excluded.data, active = excluded.active, radar = excluded.radar, scr = excluded.scr, ind = excluded.ind, syms = excluded.syms, mv = excluded.mv, updated = excluded.updated')
      .bind(id, f.uid, JSON.stringify(d), f.active, f.radar, f.scr, f.ind, f.syms, f.mv, extra.iph || '', now, now);
  };
  return {
    kind: 'd1', max: MAX_DEVICES_D1,
    async get(id) { await init(); const r = await db.prepare('SELECT data FROM devices WHERE id = ?').bind(id).first(); return r ? parse(r.data) : null; },
    async getMany(ids) {
      await init(); const out = [];
      for (const part of chunk(ids, 90)) { const r = await db.prepare(`SELECT id, data FROM devices WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part).all(); for (const x of r.results || []) { const d = parse(x.data); if (d) out.push([x.id, d]); } }
      return out;
    },
    async has(id) { await init(); return !!(await db.prepare('SELECT 1 AS x FROM devices WHERE id = ?').bind(id).first()); },
    async put(id, d, extra) { await init(); await upsert(id, d, extra).run(); },
    async putMany(list) { await init(); for (const part of chunk(list, 40)) await db.batch(part.map(([id, d]) => upsert(id, d))); },
    async del(id) { await init(); await db.prepare('DELETE FROM devices WHERE id = ?').bind(id).run(); },
    async delMany(ids) { await init(); for (const part of chunk(ids, 90)) await db.prepare(`DELETE FROM devices WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part).run(); },
    /* ids de lo que necesita cada ronda (sin leer los datos) */
    async ids(what, arg) {
      await init();
      const q = what === 'active' ? 'SELECT id FROM devices WHERE active = 1' : what === 'radar' ? 'SELECT id FROM devices WHERE radar = 1'
        : what === 'scr' ? 'SELECT id FROM devices WHERE scr > 0 AND (scr & ?) <> 0' : what === 'ind' ? 'SELECT id FROM devices WHERE ind = 1'
        : what === 'uid' ? 'SELECT id FROM devices WHERE uid = ? ORDER BY updated ASC' : 'SELECT id FROM devices';
      const st = db.prepare(q), r = await (what === 'scr' ? st.bind(arg === '4h' ? 2 : 1) : what === 'uid' ? st.bind(String(arg || '')) : st).all();
      return (r.results || []).map(x => x.id);
    },
    /* para la ronda de cada minuto: solo id + monedas a revisar (sin leer los datos completos) */
    async activeRows() { await init(); const r = await db.prepare('SELECT id, syms, mv FROM devices WHERE active = 1').all(); return (r.results || []).map(x => ({id: x.id, syms: x.syms ? String(x.syms).split(',') : [], mv: !!x.mv})); },
    async any(what) { await init(); const r = await db.prepare(what === 'radar' ? 'SELECT id FROM devices WHERE radar = 1 LIMIT 1' : 'SELECT id FROM devices LIMIT 1').first(); return !!r; },
    async count() { await init(); const r = await db.prepare('SELECT COUNT(*) AS n FROM devices').first(); return r ? +r.n : 0; },
    async newFromIp(iph, since) { await init(); if (!iph) return 0; const r = await db.prepare('SELECT COUNT(*) AS n FROM devices WHERE iph = ? AND created > ?').bind(iph, since).first(); return r ? +r.n : 0; },
    /* dispositivos abandonados: sin sincronizar en mucho tiempo y sin nada encendido */
    async prune(before) { await init(); const r = await db.prepare("DELETE FROM devices WHERE updated < ? AND active = 0 AND radar = 0 AND scr = 0 AND ind = 0 AND uid = ''").bind(before).run(); return (r.meta && r.meta.changes) || 0; },
    async mget(k) { await init(); const r = await db.prepare('SELECT v, exp FROM meta WHERE k = ?').bind(k).first(); if (!r || (r.exp && r.exp < Date.now())) return null; return parse(r.v); },
    async mset(k, v, ttlMs) { await init(); await db.prepare('INSERT OR REPLACE INTO meta (k, v, exp) VALUES (?, ?, ?)').bind(k, JSON.stringify(v), ttlMs ? Date.now() + ttlMs : 0).run(); }
  };
}

/* ───────── KV (respaldo) ───────── */
function kvStore(kv) {
  const list = async () => (await kv.get('devs', 'json')) || [];
  const all = async () => { const ids = await list(); return (await Promise.all(ids.map(id => kv.get('dev:' + id, 'json').then(d => d ? [id, d] : null)))).filter(Boolean); };
  const mem = new Map(); // límites por IP solo en memoria (no gasta escrituras)
  return {
    kind: 'kv', max: MAX_DEVICES_KV,
    get: id => kv.get('dev:' + id, 'json'),
    async getMany(ids) { return (await Promise.all(ids.map(id => kv.get('dev:' + id, 'json').then(d => d ? [id, d] : null)))).filter(Boolean); },
    async has(id) { return (await list()).includes(id); },
    async put(id, d) { await kv.put('dev:' + id, JSON.stringify(d)); const ids = await list(); if (!ids.includes(id)) await kv.put('devs', JSON.stringify([...ids, id])); },
    async putMany(l) { for (const [id, d] of l) await kv.put('dev:' + id, JSON.stringify(d)); },
    async del(id) { await kv.delete('dev:' + id); const ids = await list(); if (ids.includes(id)) await kv.put('devs', JSON.stringify(ids.filter(x => x !== id))); },
    async delMany(gone) { if (!gone.length) return; for (const id of gone) await kv.delete('dev:' + id); const ids = await list(); await kv.put('devs', JSON.stringify(ids.filter(x => !gone.includes(x)))); },
    async ids(what, arg) {
      const now = Date.now(), rows = await all();
      return rows.filter(([, d]) => { const f = flags(d, now); return what === 'active' ? f.active : what === 'radar' ? f.radar : what === 'scr' ? f.scr & (arg === '4h' ? 2 : 1) : what === 'ind' ? f.ind : what === 'uid' ? f.uid && f.uid === arg : true; })
        .sort((a, b) => (a[1].updated || 0) - (b[1].updated || 0)).map(([id]) => id);
    },
    async any(what) { return (await this.ids(what)).length > 0; },
    async activeRows() { const now = Date.now(); return (await all()).map(([id, d]) => [id, flags(d, now)]).filter(([, f]) => f.active).map(([id, f]) => ({id, syms: f.syms ? f.syms.split(',') : [], mv: !!f.mv})); },
    async count() { return (await list()).length; },
    async newFromIp(iph, since) { const h = (mem.get(iph) || []).filter(t => t > since); mem.set(iph, h); return h.length; },
    noteIp(iph) { if (iph) mem.set(iph, [...(mem.get(iph) || []), Date.now()]); },
    async prune() { return 0; },
    async mget(k) { const v = await kv.get('meta:' + k, 'json'); return v && (!v.exp || v.exp > Date.now()) ? v.v : null; },
    async mset(k, v, ttlMs) { await kv.put('meta:' + k, JSON.stringify({v, exp: ttlMs ? Date.now() + ttlMs : 0})); }
  };
}

const cache = new WeakMap();
export function storeOf(env) {
  const key = env.DB || env.KV; if (cache.has(key)) return cache.get(key);
  const s = env.DB ? d1Store(env.DB, env.KV) : kvStore(env.KV); cache.set(key, s); return s;
}

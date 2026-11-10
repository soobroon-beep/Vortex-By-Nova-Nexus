// Dominancia de mercado (USDT.D y BTC.D) para VORTEX, con la MISMA fórmula que CRYPTOCAP (la que usan TradingView y openmarket):
//   moneda.D = capitalización de la moneda / TOTAL × 100, donde TOTAL = suma de la capitalización de las 125 criptomonedas más grandes.
// Lo ejecuta .github/workflows/dominance.yml y guarda dominance-data.json; la app lo lee como archivo estático.
// Datos reales de CoinGecko (API pública): capitalización de cada moneda. Nunca se inventan puntos:
// · cada 15 min: una muestra con las 125 más grandes de ese momento. GitHub corre sus tareas programadas cuando quiere (a veces cada 5–9 h),
//   así que el servidor de Cloudflare (worker/push-alerts.mjs) toma la muestra puntual y aquí se juntan las suyas: no quedan huecos.
// · Historial (solo si el archivo aún usa la fórmula anterior, o a mano con BACKFILL=1): por partes y reanudable. CoinGecko limita las consultas,
//   así que se va despacio, el avance se guarda en .cache/ y, si no alcanza el tiempo, la siguiente ejecución sigue donde se quedó.
// · BACKFILL=1: historial con la capitalización real de cada una de esas 125 monedas — por hora (90 días) y por día (1 año).
//   Único supuesto: para el pasado se usan las 125 monedas más grandes de HOY (una moneda que aún no existía cuenta 0).
const fs = require('fs'), path = require('path'), C = require('../dominance-core.js');
const {top125, domOf, isDeriv, TOP, METHOD} = C;
const FILE = path.join(__dirname, '..', 'dominance-data.json'), API = 'https://api.coingecko.com/api/v3';
const CACHE = process.env.DOM_CACHE || path.join(__dirname, '..', '.cache'), PROG = path.join(CACHE, 'dominance-backfill.json'), F_SAVE = path.join(CACHE, 'dominance-save'), F_PENDING = path.join(CACHE, 'dominance-pending');
const SRV = process.env.DOM_SRV == null ? 'https://vortex-push.soobroon.workers.dev' : process.env.DOM_SRV; // servidor que toma la muestra puntual cada 15 min
const Q = 900e3, HR = 3600e3, D = 86400e3, KEEP_Q = 30 * D, KEEP_HR = 120 * D, KEEP_D = 3000 * D;
const PACE = +process.env.DOM_PACE_MS || 13000, BUDGET = (+process.env.DOM_BUDGET_MIN || 75) * 6e4, PROG_MAX_AGE = 12 * HR, MAX_ROUNDS = 6, T0 = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url, tries = 5) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {headers: {accept: 'application/json', 'user-agent': 'VORTEX-Dominance/1.0'}, signal: AbortSignal.timeout(30000)});
      if (r.status === 429) { err = new Error('HTTP 429 (límite de CoinGecko)'); const ra = +r.headers.get('retry-after'); await sleep(Math.min(120, ra > 0 ? ra + 2 : 20 * (i + 1)) * 1000); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status} en ${url.replace(API, '')}`);
      return await r.json();
    } catch (e) { err = e; await sleep(2000); }
  }
  throw err;
}
const load = () => { try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (j && j.series) return j; } catch {} return {series: {}, note: ''}; };
const clean = a => (Array.isArray(a) ? a : []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > 0 && p[1] < 100);
function daily(h) { const m = new Map(); for (const [t, v] of h) m.set(Math.floor(t / D) * D, v); return [...m.entries()].sort((a, b) => a[0] - b[0]); }
function merge(old, add, keep, bucket) { // une series [t,v] sin repetir hueco (bucket ms) y recorta lo muy antiguo
  const m = new Map(); for (const [t, v] of [...old, ...add]) m.set(Math.floor(t / bucket) * bucket, v);
  const lim = Date.now() - keep;
  return [...m.entries()].filter(([t]) => t >= lim).sort((a, b) => a[0] - b[0]).map(([t, v]) => [t, +v.toFixed(4)]);
}
async function markets() { const a = await getJSON(`${API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1`); if (!Array.isArray(a) || a.length < 150) throw new Error('CoinGecko devolvió muy pocas monedas'); return a; }

/* Suma, hueco por hueco, la capitalización de todas las monedas (si a una le falta un hueco se usa su último dato; antes de existir cuenta 0) */
function combine(seriesById, bucket) {
  const maps = {}, all = new Set();
  for (const [id, pts] of Object.entries(seriesById)) { const m = new Map(); for (const [t, v] of pts) if (v > 0) { const k = Math.floor(t / bucket) * bucket; m.set(k, v); all.add(k); } maps[id] = m; }
  const ts = [...all].sort((a, b) => a - b), last = {}, out = {'USDT.D': [], 'BTC.D': []};
  for (const t of ts) {
    let tot = 0; for (const id of Object.keys(maps)) { const v = maps[id].get(t); if (v != null) last[id] = v; tot += last[id] || 0; }
    if (!(tot > 0) || !(last.tether > 0) || !(last.bitcoin > 0)) continue;
    out['USDT.D'].push([t, last.tether / tot * 100]); out['BTC.D'].push([t, last.bitcoin / tot * 100]);
  }
  return out;
}
/* Avance del historial (se guarda en .cache/ y el flujo lo conserva entre ejecuciones) */
const flag = (f, on) => { try { if (on) { fs.mkdirSync(CACHE, {recursive: true}); fs.writeFileSync(f, '1'); } else fs.rmSync(f, {force: true}); } catch {} };
function loadProgress() { try { const j = JSON.parse(fs.readFileSync(PROG, 'utf8')); if (j && j.v === METHOD && !j.done && Date.now() - j.at < PROG_MAX_AGE && j.day && j.hr) return j; } catch {} return {v: METHOD, at: Date.now(), rounds: 0, day: {}, hr: {}}; }
function saveProgress(pg) { fs.mkdirSync(CACHE, {recursive: true}); fs.writeFileSync(PROG, JSON.stringify(pg)); }
const caps = j => (j && Array.isArray(j.market_caps) ? j.market_caps : []).filter(p => Array.isArray(p) && p[1] > 0).map(p => [p[0], Math.round(p[1])]);
/* Devuelve {pending: true} si no alcanzó el tiempo o faltan monedas (la siguiente ejecución sigue); si no, las series listas. */
async function backfill(list) {
  const pg = loadProgress(); pg.rounds = (pg.rounds || 0) + 1; flag(F_SAVE, true);
  if (pg.rounds > MAX_ROUNDS) { saveProgress({v: METHOD, done: true, at: Date.now()}); throw new Error(`El historial no se completó en ${MAX_ROUNDS} intentos (CoinGecko no responde): se vuelve a intentar desde cero en la próxima ejecución`); }
  const done = () => list.filter(c => c.id in pg.day && c.id in pg.hr).length; let n = 0;
  console.log(`historial: intento ${pg.rounds}, ${done()}/${list.length} monedas ya descargadas`);
  for (const c of list) {
    if (c.id in pg.day && c.id in pg.hr) continue;
    if (Date.now() - T0 > BUDGET) break;
    if (!(c.id in pg.day)) { try { pg.day[c.id] = caps(await getJSON(`${API}/coins/${c.id}/market_chart?vs_currency=usd&days=365`)); } catch (e) { pg.day[c.id] = []; console.warn('sin historial diario:', c.id, e.message); } await sleep(PACE); }
    if (!(c.id in pg.hr)) { try { pg.hr[c.id] = caps(await getJSON(`${API}/coins/${c.id}/market_chart?vs_currency=usd&days=90`)); } catch (e) { pg.hr[c.id] = []; console.warn('sin historial por hora:', c.id, e.message); } await sleep(PACE); }
    if (++n % 10 === 0) { saveProgress(pg); console.log(`historial ${done()}/${list.length}`); }
  }
  const ids = list.map(c => c.id), full = o => ids.filter(id => (o[id] || []).length > 1), okD = full(pg.day), okH = full(pg.hr);
  if (done() < list.length || !okD.includes('tether') || !okD.includes('bitcoin') || okD.length < list.length * .9) {
    for (const o of [pg.day, pg.hr]) for (const id of Object.keys(o)) if (!o[id].length) delete o[id]; // lo que falló se vuelve a pedir en la siguiente ejecución
    saveProgress(pg); console.log(`historial a medias (${okD.length}/${list.length} monedas): continúa en la siguiente ejecución`); return {pending: true};
  }
  const pickSeries = (o, ok) => Object.fromEntries(ok.map(id => [id, o[id]]));
  const out = {d: combine(pickSeries(pg.day, okD), D), hh: okH.length >= list.length * .9 && okH.includes('tether') && okH.includes('bitcoin') ? combine(pickSeries(pg.hr, okH), HR) : null, coins: okD.length};
  saveProgress({v: METHOD, done: true, at: Date.now()}); return out;
}
/* Muestras puntuales de cada 15 min que guarda el servidor (misma fórmula). Si no contesta, se sigue sin ellas. */
async function serverSamples() {
  if (!SRV) return null;
  try { const j = await getJSON(SRV + '/dom', 2); if (j && j.method === METHOD && j.series) return j.series; } catch (e) { console.warn('servidor de muestras sin respuesta:', e.message); }
  return null;
}

async function main() {
  const db = load(), mk = await markets(), list = top125(mk), cur = domOf(list), now = Date.now(), t = Math.floor(now / Q) * Q;
  flag(F_SAVE, false); flag(F_PENDING, false);
  if (process.env.DIAG === '1') { const all = domOf(top125(mk, false)); let g = null; try { g = (await getJSON(`${API}/global`)).data.market_cap_percentage; } catch {}
    console.log(`USDT.D top125 sin envueltas: ${cur.usdt.toFixed(3)}% · top125 con todo: ${all.usdt.toFixed(3)}% · CoinGecko global: ${g ? g.usdt.toFixed(3) : '?'}%`);
    console.log(`BTC.D  top125 sin envueltas: ${cur.btc.toFixed(3)}% · top125 con todo: ${all.btc.toFixed(3)}% · CoinGecko global: ${g ? g.btc.toFixed(3) : '?'}%`);
    const sv = await serverSamples(); console.log('Muestras del servidor:', sv ? Object.entries(sv).map(([k, a]) => `${k} ${a.length}${a.length ? ' (última ' + new Date(a[a.length - 1][0]).toISOString() + ')' : ''}`).join(' · ') : 'sin respuesta');
    console.log('Excluidas (envueltas):', mk.slice(0, 200).filter(isDeriv).map(c => c.id).join(', ')); console.log('Top125:', list.map(c => c.symbol).join(' ')); return; }
  if (!(cur.usdt > 0 && cur.btc > 0)) throw new Error('No se pudo calcular la dominancia');
  const S = db.series, oldMethod = db.method !== METHOD;
  if (process.env.BACKFILL === '1' || oldMethod) { // el archivo con la fórmula anterior se reconstruye solo, sin tener que lanzarlo a mano
    const b = await backfill(list);
    if (b.pending) { flag(F_PENDING, true); if (oldMethod) return; } // sin historial nuevo no se mezclan muestras de la fórmula nueva con la anterior
    else {
      for (const k of ['USDT.D', 'BTC.D']) S[k] = {h: oldMethod ? [] : clean((S[k] || {}).h), hh: b.hh ? merge([], b.hh[k], KEEP_HR, HR) : [], d: merge([], b.d[k], KEEP_D, D)};
      db.method = METHOD; db.note = `Fórmula CRYPTOCAP: moneda / suma de las ${TOP} criptomonedas más grandes. Historial con la capitalización real de ${b.coins} monedas (por hora 90 días, por día 1 año); muestras cada 15 min.`;
    }
  }
  const sv = await serverSamples();
  for (const [k, v] of [['USDT.D', cur.usdt], ['BTC.D', cur.btc]]) {
    const s = S[k] = S[k] || {h: [], hh: [], d: []}, add = [...clean(sv && sv[k]), [t, v]];
    s.h = merge(clean(s.h), add, KEEP_Q, Q);
    s.hh = merge(clean(s.hh), add, KEEP_HR, HR);
    s.d = merge(clean(s.d), add, KEEP_D, D);
  }
  db.updated = new Date(now).toISOString(); db.source = 'CoinGecko (capitalización por moneda) · fórmula CRYPTOCAP top-125';
  fs.writeFileSync(FILE, JSON.stringify(db)); console.log(`USDT.D ${cur.usdt.toFixed(3)}% · BTC.D ${cur.btc.toFixed(3)}% · ${S['USDT.D'].d.length} días · ${S['USDT.D'].hh.length} horas · ${S['USDT.D'].h.length} muestras de 15 min${sv ? ' (con las del servidor)' : ''}`);
}
if (require.main === module) main().catch(e => { console.error('Error:', e.message); process.exit(1); });
module.exports = {daily, merge, clean, combine, top125, domOf, isDeriv, backfill, main};

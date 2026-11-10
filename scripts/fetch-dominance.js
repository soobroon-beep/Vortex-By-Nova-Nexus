// Dominancia de mercado (USDT.D y BTC.D) para VORTEX, con la MISMA fórmula que CRYPTOCAP (la que usan TradingView y openmarket):
//   moneda.D = capitalización de la moneda / TOTAL × 100, donde TOTAL = suma de la capitalización de las 125 criptomonedas más grandes.
// Lo ejecuta .github/workflows/dominance.yml y guarda dominance-data.json; la app lo lee como archivo estático.
// Datos reales de CoinGecko (API pública): capitalización de cada moneda. Nunca se inventan puntos:
// · cada 15 min: una muestra con las 125 más grandes de ese momento.
// · BACKFILL=1 (a mano): historial con la capitalización real de cada una de esas 125 monedas — por hora (90 días) y por día (1 año).
//   Único supuesto: para el pasado se usan las 125 monedas más grandes de HOY (una moneda que aún no existía cuenta 0).
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', 'dominance-data.json'), API = 'https://api.coingecko.com/api/v3';
const Q = 900e3, HR = 3600e3, D = 86400e3, KEEP_Q = 30 * D, KEEP_HR = 120 * D, KEEP_D = 3000 * D, TOP = 125, METHOD = 'cryptocap-top125-v1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Fichas que solo «envuelven» a otra (wBTC, stETH, WETH, puentes…): no son criptomonedas aparte y contarlas duplicaría capitalización
const DERIV = /(^|-)(wrapped|staked|restaked|bridged|binance-peg|liquid-staking)(-|$)|^(weth|wbtc|steth|wsteth|weeth|reth|cbbtc|cbeth|lbtc|solvbtc|ezeth|rseth|meth|jitosol|msol|bnsol|susde|susds|usdtb|wbeth|tbtc|sweth|oseth|ethx|lseth|pumpbtc|fbtc|clbtc|ebtc|unibtc|jupsol|bbsol|wbnb|usdt0|kbtc)$|staked-|-staked|wrapped-|-wrapped|-bridged|rocket-pool-eth|lido-staked|coinbase-wrapped|kelp-dao|renzo-restaked|ether-fi-staked|mantle-staked|binance-staked|jito-staked|marinade-staked|lombard-staked|solv-protocol|ethena-staked/i;
// Fondos y valores tokenizados (bonos del Tesoro, créditos…): no son criptomonedas y no están en el listado de monedas que usa CRYPTOCAP
const FUNDS = /^(figr_heloc|buidl|usyc|ustb|jaaa|jtrsy|eutbl|ousg|benji|usdtb|ustbl|tbill|wtgxx|fobxx|ylds)$/i;
const isDeriv = c => DERIV.test(c.id || '') || DERIV.test(String(c.symbol || '').toLowerCase()) || FUNDS.test(String(c.symbol || ''));

async function getJSON(url) {
  let err;
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(url, {headers: {accept: 'application/json', 'user-agent': 'VORTEX-Dominance/1.0'}});
      if (r.status === 429) { err = new Error('HTTP 429 (límite de CoinGecko)'); await sleep(25000 * (i + 1)); continue; }
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
/* Las 125 más grandes (sin fichas envueltas) y la dominancia de ese momento */
function top125(markets, skipDeriv = true) { return markets.filter(c => c && c.market_cap > 0 && !(skipDeriv && isDeriv(c))).sort((a, b) => b.market_cap - a.market_cap).slice(0, TOP); }
function domOf(list) { const tot = list.reduce((a, c) => a + c.market_cap, 0), cap = id => (list.find(c => c.id === id) || {}).market_cap || 0; return {total: tot, usdt: cap('tether') / tot * 100, btc: cap('bitcoin') / tot * 100}; }
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
async function backfill(list) {
  const dayS = {}, hrS = {}; let n = 0;
  for (const c of list) {
    n++;
    try { const j = await getJSON(`${API}/coins/${c.id}/market_chart?vs_currency=usd&days=365`); dayS[c.id] = j.market_caps || []; } catch (e) { console.warn('sin historial diario:', c.id, e.message); }
    await sleep(7000);
    try { const j = await getJSON(`${API}/coins/${c.id}/market_chart?vs_currency=usd&days=90`); hrS[c.id] = j.market_caps || []; } catch (e) { console.warn('sin historial por hora:', c.id, e.message); }
    await sleep(7000);
    if (n % 10 === 0) console.log(`historial ${n}/${list.length}`);
  }
  if (!dayS.tether || !dayS.bitcoin || Object.keys(dayS).length < list.length * .9) throw new Error(`Historial incompleto (${Object.keys(dayS).length}/${list.length} monedas): no se guarda nada`);
  return {d: combine(dayS, D), hh: Object.keys(hrS).length >= list.length * .9 && hrS.tether ? combine(hrS, HR) : null, coins: Object.keys(dayS).length};
}

async function main() {
  const db = load(), mk = await markets(), list = top125(mk), cur = domOf(list), now = Date.now(), t = Math.floor(now / Q) * Q;
  if (process.env.DIAG === '1') { const all = domOf(top125(mk, false)); let g = null; try { g = (await getJSON(`${API}/global`)).data.market_cap_percentage; } catch {}
    console.log(`USDT.D top125 sin envueltas: ${cur.usdt.toFixed(3)}% · top125 con todo: ${all.usdt.toFixed(3)}% · CoinGecko global: ${g ? g.usdt.toFixed(3) : '?'}%`);
    console.log(`BTC.D  top125 sin envueltas: ${cur.btc.toFixed(3)}% · top125 con todo: ${all.btc.toFixed(3)}% · CoinGecko global: ${g ? g.btc.toFixed(3) : '?'}%`);
    console.log('Excluidas (envueltas):', mk.slice(0, 200).filter(isDeriv).map(c => c.id).join(', ')); console.log('Top125:', list.map(c => c.symbol).join(' ')); return; }
  if (!(cur.usdt > 0 && cur.btc > 0)) throw new Error('No se pudo calcular la dominancia');
  if (db.method !== METHOD && process.env.BACKFILL !== '1') { console.log('El archivo usa el método anterior: ejecuta el flujo con backfill=1 para reconstruirlo con la fórmula CRYPTOCAP.'); return; }
  const S = db.series;
  if (process.env.BACKFILL === '1') {
    const b = await backfill(list);
    for (const k of ['USDT.D', 'BTC.D']) S[k] = {h: [], hh: b.hh ? merge([], b.hh[k], KEEP_HR, HR) : [], d: merge([], b.d[k], KEEP_D, D)};
    db.method = METHOD; db.note = `Fórmula CRYPTOCAP: moneda / suma de las ${TOP} criptomonedas más grandes. Historial con la capitalización real de ${b.coins} monedas (por hora 90 días, por día 1 año); muestras cada 15 min.`;
  }
  for (const [k, v] of [['USDT.D', cur.usdt], ['BTC.D', cur.btc]]) {
    const s = S[k] = S[k] || {h: [], hh: [], d: []};
    s.h = merge(clean(s.h), [[t, v]], KEEP_Q, Q);
    s.hh = merge(clean(s.hh), [[t, v]], KEEP_HR, HR);
    s.d = merge(clean(s.d), [[t, v]], KEEP_D, D);
  }
  db.updated = new Date(now).toISOString(); db.source = 'CoinGecko (capitalización por moneda) · fórmula CRYPTOCAP top-125';
  fs.writeFileSync(FILE, JSON.stringify(db)); console.log(`USDT.D ${cur.usdt.toFixed(3)}% · BTC.D ${cur.btc.toFixed(3)}% · ${S['USDT.D'].d.length} días · ${S['USDT.D'].hh.length} horas`);
}
if (require.main === module) main().catch(e => { console.error('Error:', e.message); process.exit(1); });
module.exports = {daily, merge, clean, combine, top125, domOf, isDeriv};

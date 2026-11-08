// VORTEX · Screener programado dentro del servidor (Cloudflare). Antes lo mandaba GitHub Actions, pero GitHub corre sus
// tareas programadas cuando quiere (a veces cada 4–7 h), por eso los avisos llegaban «a veces sí, a veces no».
// Cloudflare sí respeta el cron de cada minuto: al empezar cada hora (UTC) se analiza el top por volumen de Binance Spot
// con la misma regla del Screener de la app y se manda a Discord (#vortex) y como notificación a los celulares que lo activaron.
// · El plan gratis da 10 ms de CPU por llamada: el trabajo se reparte en llamadas internas pequeñas (unas cuantas monedas cada una).
import '../nova-nexus.js';
import F from '../discord-format.js';

const NN = globalThis.NovaNexus;
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api1.binance.com'];
const STABLE = new Set(['USDC', 'FDUSD', 'TUSD', 'USDP', 'DAI', 'BUSD', 'USDE', 'USDS', 'USD1', 'XUSD', 'PYUSD', 'BFUSD', 'EUR', 'AEUR', 'EURI', 'UST', 'USTC']);
export const SIG_BARS = 5, TOP_N = 50, CHUNK = 3, LIMIT = 501;
export const SLOT_MS = {'1h': 36e5, '4h': 144e5};
export const WINDOW_MIN = 20; // el servidor lo intenta en los primeros 20 min de la franja; después, GitHub queda de respaldo
export const slotOf = (tf, now = Date.now()) => Math.floor(now / SLOT_MS[tf]);
const HOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;

async function getJSON(path) {
  let err; for (const h of HOSTS) { try { const r = await fetch(h + path, {headers: {'user-agent': 'VORTEX-Screener/2.0'}}); if (r.ok) return await r.json(); err = new Error(h + ' HTTP ' + r.status); } catch (e) { err = e; } }
  throw err;
}
export async function topSymbols(n = TOP_N) {
  const d = await getJSON('/api/v3/ticker/24hr?type=MINI'); // versión ligera: menos CPU al leerla
  return d.filter(t => /^[A-Z0-9]{2,12}USDT$/.test(t.symbol) && !STABLE.has(t.symbol.replace(/USDT$/, '')) && +t.quoteVolume > 2e6 && +t.lastPrice > 0)
    .sort((a, b) => +b.quoteVolume - +a.quoteVolume).slice(0, n).map(t => ({symbol: t.symbol, price: +t.lastPrice}));
}
// misma regla que el Screener de la app: última señal sin enfriamiento, vigente SIG_BARS velas (solo velas cerradas)
export function signalOf(cs) {
  if (!cs || cs.length < 60) return null;
  const r = NN.compute(cs, {cooldown: 0, minScore: 1, hl2Range: true}), sg = r.last; if (!sg) return null;
  const ago = cs.length - 1 - sg.i; if (ago >= SIG_BARS) return null;
  return {side: sg.side, range: !!sg.range, div: !!sg.div, score: sg.score, age: ago + 1, ago};
}
export async function scanOne(sym, tf, now = Date.now()) {
  const raw = await getJSON(`/api/v3/klines?symbol=${sym}&interval=${tf}&limit=${LIMIT}`);
  const cs = raw.filter(k => k[6] < now).map(k => ({t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5]}));
  const sg = signalOf(cs); if (sg) sg.price = cs.length ? cs[cs.length - 1].c : NaN; return sg;
}
export const sortRows = rows => rows.sort((a, b) => (a.sg.ago - b.sg.ago) || (b.sg.score - a.sg.score));

// texto corto para la notificación del celular
export function pushText(tf, rows) {
  const L = rows.filter(r => !r.sg.range && r.sg.side === 'buy'), S = rows.filter(r => !r.sg.range && r.sg.side !== 'buy'), R = rows.filter(r => r.sg.range);
  const names = a => a.slice(0, 6).map(r => F.baseOf(r.symbol)).join(', ') + (a.length > 6 ? ` +${a.length - 6}` : '');
  const parts = []; if (L.length) parts.push(`🟢 LONG: ${names(L)}`); if (S.length) parts.push(`🔴 SHORT: ${names(S)}`); if (R.length) parts.push(`🟣 RANGO: ${names(R)}`);
  return {title: `VORTEX · Screener ${tf} · ${rows.length} con señal`, body: parts.join('\n')};
}
// qué temporalidad toca ahora (una por llamada, para no pasar el límite de llamadas por ejecución)
export function dueTf(state, now = Date.now()) {
  for (const tf of ['1h', '4h']) {
    const slot = slotOf(tf, now), mins = (now - slot * SLOT_MS[tf]) / 6e4;
    if ((+state[tf] || 0) >= slot) continue; if (mins < 1 || mins > WINDOW_MIN) continue; // se espera 1 min a que Binance cierre la vela
    return tf;
  }
  return null;
}

export async function postDiscord(url, embeds) {
  if (!url || !HOOK.test(url) || !embeds.length) return false;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url + '?wait=false', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({username: 'VORTEX', embeds: embeds.slice(0, 10), allowed_mentions: {parse: []}})});
    if (r.status === 429) { let w = 2000; try { w = Math.ceil(((await r.json()).retry_after || 2) * 1000); } catch {} await new Promise(s => setTimeout(s, Math.min(w, 10000))); continue; }
    if (!r.ok) throw new Error('Discord HTTP ' + r.status); return true;
  }
  throw new Error('Discord limitó el envío');
}
export {F};

// VORTEX · Notificaciones push con la app CERRADA (Cloudflare Worker gratuito).
// Cada minuto (cron) revisa tus alertas de precio y los movimientos bruscos del top 5 con precios de Binance
// y, si alguna se cumple, manda una notificación Web Push a tu celular aunque VORTEX no esté abierta.
// · La app le manda tus alertas y la suscripción de tu celular a /sync (solo alertas de PRECIO; las de indicador siguen en la app).
// · Las claves VAPID se crean solas la primera vez y se guardan en el KV: no hay secretos que configurar.
// · Solo escribe en el KV cuando algo cambia (el plan gratis permite 1000 escrituras al día).
// Se publica solo con .github/workflows/deploy-push-worker.yml (configuración en worker/wrangler-push.toml). Secretos opcionales: BINGX_AGENT_KEY / BINGX_AGENT_SECRET (plan Infinity), GROQ_KEY (IA gratis) y GEMINI_KEY / MISTRAL_KEY / OPENROUTER_KEY (IA gratis extra para Nexus Pixel).

import {memRoute} from './memoria.mjs'; // Memoria compartida entre Claude, ChatGPT y Gemini (/mem/<llave>/…)
import {storeOf, MAX_PER_UID, MAX_NEW_PER_IP_DAY} from './devstore.mjs'; // celulares registrados: base D1 (miles) o KV de respaldo
import {verifyIdToken, saOf, syncPlan, fsGet} from './fbauth.mjs'; // sesión de Firebase verificada y Firestore con la cuenta de servicio
import * as SCR from './screener.mjs';
import {radarInternal, loadState as radarState} from './radar-server.mjs';
import DOM from '../dominance-core.js';
import TWM from '../trade-watch.js';
const TW = globalThis.CCTTradeWatch || TWM; // seguimiento de tus trades abiertos (misma lógica que la app)
const TRADE_TTL = 72 * 3600e3; // si la app no manda tus posiciones en 3 días, se dejan de seguir (pudiste cerrarlas con la app cerrada)
const DEFAULT_ORIGINS = 'https://soobroon-beep.github.io,https://vortex-nexus.pages.dev,https://dev.vortex-nexus.pages.dev';
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api1.binance.com'];
const MOVE_TOP = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT'];
const MOVE_WIN = [[5, '5 min', 1], [60, '1 h', 2.5]], MOVE_COOL = 15 * 60000;
const MAX_ALERTS = 50, APP_URL = 'https://vortex-nexus.pages.dev/';
const TICK_BATCH = 10, PUSH_BATCH = 10, FAN_DIRECT = 25; // dispositivos por llamada interna (cada llamada tiene su propio límite de CPU y de subpeticiones)

/* ───────── Plan Infinity: comprobar el referido de BingX ─────────
   Usa la API de afiliado (agente) de BingX con TU llave: secretos BINGX_AGENT_KEY y BINGX_AGENT_SECRET del Worker (solo lectura).
   Sin esos secretos contesta {setup: true} y la app deja el UID guardado como pendiente. */
export async function bingxInvite(env, uid, fetchFn = fetch) {
  uid = String(uid == null ? '' : uid).replace(/\D/g, ''); if (!/^\d{6,14}$/.test(uid)) return {error: 'UID inválido'};
  const key = env.BINGX_AGENT_KEY, sec = env.BINGX_AGENT_SECRET; if (!key || !sec) return {ok: false, setup: true};
  const q = `uid=${uid}&timestamp=${Date.now()}`;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(sec), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(q)))].map(x => x.toString(16).padStart(2, '0')).join('');
  try {
    const r = await fetchFn(`https://open-api.bingx.com/openApi/agent/v1/account/inviteRelationCheck?${q}&signature=${sig}`, {headers: {'X-BX-APIKEY': key}});
    const j = await r.json(); if (j.code !== 0) return {ok: false, invited: false, msg: String(j.msg || 'BingX no respondió')};
    const d = j.data || {}, bal = parseFloat(d.balanceVolume); return {ok: true, invited: d.inviteResult === true || d.inviteResult === 'true', deposit: !!d.deposit, trade: !!d.trade, bal: Number.isFinite(bal) ? Math.round(bal * 100) / 100 : null}; // balanceVolume = activos netos del referido en USDT
  } catch { return {ok: false, invited: false, msg: 'BingX sin respuesta'}; }
}

/* ¿Operó en los últimos días? Para renovar Infinity cada mes basta con que la cuenta siga activa: al menos una operación en los últimos 7 días
   (volumen diario del referido en la API de afiliado; BingX lo publica con ~1 día de retraso, por eso se miran 8 días). */
export async function bingxRecentTrade(env, uid, days = 7, fetchFn = fetch, now = Date.now()) {
  uid = String(uid == null ? '' : uid).replace(/\D/g, ''); if (!/^\d{6,14}$/.test(uid)) return {error: 'UID inválido'};
  const key = env.BINGX_AGENT_KEY, sec = env.BINGX_AGENT_SECRET; if (!key || !sec) return {ok: false, setup: true};
  const ymd = t => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
  const q = `endTime=${ymd(now)}&pageIndex=1&pageSize=100&startTime=${ymd(now - (days + 1) * 864e5)}&timestamp=${now}&uid=${uid}`;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(sec), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(q)))].map(x => x.toString(16).padStart(2, '0')).join('');
  try {
    const r = await fetchFn(`https://open-api.bingx.com/openApi/agent/v2/reward/commissionDataList?${q}&signature=${sig}`, {headers: {'X-BX-APIKEY': key}});
    const j = await r.json(); if (j.code !== 0) return {ok: false, msg: String(j.msg || 'BingX no respondió')};
    const list = (j.data && j.data.list) || [], hit = list.filter(x => String(x.uid) === uid && parseFloat(x.tradingVolume) > 0);
    const last = hit.reduce((m, x) => Math.max(m, +x.commissionTime || 0), 0);
    return {ok: true, traded: hit.length > 0, last: last || null};
  } catch { return {ok: false, msg: 'BingX sin respuesta'}; }
}

/* ───────── utilidades ───────── */
const enc = new TextEncoder();
export const b64u = buf => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const unb64u = str => { const s = String(str).replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '='.repeat((4 - s.length % 4) % 4)); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const concat = (...arrs) => { const n = arrs.reduce((a, x) => a + x.length, 0), out = new Uint8Array(n); let o = 0; for (const x of arrs) { out.set(x, o); o += x.length; } return out; };
const baseOf = s => String(s).split('@')[0].replace(/(USDT|USDC|FDUSD|BUSD|BTC|ETH|EUR|TRY|BRL)$/, '') || s;
export function fmt(p) { // mismo estilo que la app: más decimales en precios pequeños
  if (!Number.isFinite(p)) return '—'; const a = Math.abs(p), d = a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 6 : 8;
  return '$' + p.toLocaleString('en-US', {minimumFractionDigits: Math.min(2, d), maximumFractionDigits: d});
}

/* ───────── limpieza de lo que manda la app ───────── */
export function sanAlert(a) {
  if (!a || typeof a.id !== 'string' || a.id.length > 40 || a.kind === 'ind' || !/^[A-Z0-9][A-Z0-9_-]{1,24}(@[a-z]{2,12})?$/.test(a.symbol)) return null; // BTCUSDT (Binance) o BTCUSDT@bybit, HYPEUSDT@binancef…
  if (!(+a.price > 0) || (a.dir !== 'up' && a.dir !== 'down')) return null;
  const o = {id: a.id, symbol: a.symbol, on: a.on !== false, price: +a.price, dir: a.dir, note: String(a.note || '').slice(0, 140), firedAt: +a.firedAt || 0, firedPrice: Number.isFinite(+a.firedPrice) && a.firedPrice !== null ? +a.firedPrice : null};
  if (a.cond === 'up' || a.cond === 'down') o.cond = a.cond;
  if (a.repeat === 'every') o.repeat = 'every'; if (a.wait === true) o.wait = true;
  if (+a.exp > 0) o.exp = Math.round(+a.exp); if (a.expired === true) o.expired = true;
  if (['app', 'discord', 'both'].includes(a.notify)) o.notify = a.notify;
  return o;
}
/* Alertas con indicador (indicadores comunes, Nova Nexus o scripts Pine): las revisa scripts/ind-alerts.js en GitHub Actions
   al cerrar cada vela y el aviso sale por aquí aunque la app esté cerrada. */
const IV_OK = new Set(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']);
const jsonOk = (o, max) => { try { return o && typeof o === 'object' && !Array.isArray(o) && JSON.stringify(o).length <= max; } catch { return false; } };
export function sanInd(a) {
  if (!a || typeof a.id !== 'string' || a.id.length > 40 || !/^[A-Z0-9][A-Z0-9_-]{1,24}(@[a-z]{2,12})?$/.test(a.symbol) || !IV_OK.has(a.interval) || !['pine', 'std', 'nova'].includes(a.src) || !jsonOk(a.spec, 400)) return null;
  const o = {id: a.id, symbol: a.symbol, interval: a.interval, src: a.src, sid: typeof a.sid === 'string' ? a.sid.slice(0, 40) : '', spec: a.spec, label: String(a.label || '').slice(0, 120), note: String(a.note || '').slice(0, 140),
    on: a.on !== false, repeat: a.repeat === 'every' ? 'every' : 'once', lastBar: +a.lastBar || 0, firedAt: +a.firedAt || 0, firedInfo: String(a.firedInfo || '').slice(0, 200)};
  if (['app', 'discord', 'both'].includes(a.notify)) o.notify = a.notify;
  if (a.src === 'pine' && jsonOk(a.inputs, 4000)) o.inputs = a.inputs;
  if (a.src === 'nova' && jsonOk(a.nopt, 3000)) o.nopt = a.nopt;
  return o;
}
/* Igual que mergeAlerts: si el servidor la disparó después de la última sincronización de la app, gana el servidor; la vela revisada nunca retrocede */
export function mergeInd(incoming, server, since = 0) {
  const byId = new Map((server || []).map(a => [a.id, a])), out = [], back = [];
  for (const a of (Array.isArray(incoming) ? incoming : []).map(sanInd).filter(Boolean)) {
    const s = byId.get(a.id);
    if (s && s.firedAt > (+since || 0) && s.firedAt > a.firedAt) { const m = Object.assign({}, a, {on: s.on, firedAt: s.firedAt, firedInfo: s.firedInfo, lastBar: Math.max(a.lastBar, s.lastBar || 0)}); out.push(m); back.push({id: m.id, on: m.on, firedAt: m.firedAt, firedInfo: m.firedInfo, lastBar: m.lastBar}); }
    else out.push(s ? Object.assign(a, {lastBar: Math.max(a.lastBar, s.lastBar || 0)}) : a);
  }
  return {ind: out.slice(0, MAX_ALERTS), back};
}
export function sanScr(x) { const q = x && typeof x === 'object' ? x : {}; return {on: q.on === true, h1: q.h1 !== false, h4: q.h4 !== false}; }
export function sanMove(m) { const q = m && typeof m === 'object' ? m : {}; return {on: q.on !== false, pct: Math.max(0.5, Math.min(25, +q.pct || 2))}; }
/* Solo servicios push reales (Chrome/Android, Firefox, Edge/Windows, Safari/iPhone): el servidor nunca le manda nada a otra dirección */
export const PUSH_HOSTS = /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com)$/;
export function sanSub(s) {
  if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000) return null;
  try { const u = new URL(s.endpoint); if (u.protocol !== 'https:' || u.port || u.username || !PUSH_HOSTS.test(u.hostname)) return null; } catch { return null; }
  const k = s.keys || {}; if (typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 60) return null;
  return {endpoint: s.endpoint, keys: {p256dh: k.p256dh, auth: k.auth}};
}
/* Une lo que manda la app con lo que el servidor ya sabe. since = hora (del servidor) de la última sincronización que recibió la app.
   Si el servidor disparó una alerta DESPUÉS de eso, la app aún no lo sabe: se queda la versión del servidor y se le devuelve para que se actualice.
   Si no, manda la app (por ejemplo, la reactivaste o la editaste). */
export function mergeAlerts(incoming, server, since = 0) {
  const byId = new Map((server || []).map(a => [a.id, a])), out = [], back = [];
  for (const a of incoming) { const s = byId.get(a.id); if (s && s.firedAt > (+since || 0) && s.firedAt > a.firedAt) { out.push(s); back.push(s); } else out.push(a); }
  return {alerts: out.slice(0, MAX_ALERTS), back};
}

/* ───────── Discord: el interruptor «Enviar avisos a Discord» de Ajustes manda sobre todo ───────── */
// dc = {on, price, ind}. Apps viejas no mandan «dc»: solo traían dcUrl cuando Discord estaba encendido.
export function sanDc(dc, dcUrl) {
  if (dc && typeof dc === 'object') { const on = dc.on === true; return {on, price: on && dc.price !== false, ind: on && dc.ind !== false}; }
  const on = typeof dcUrl === 'string' && dcUrl.length > 0; return {on, price: on, ind: on};
}
export const dcAllow = (d, kind) => { const c = d && d.dc ? d.dc : sanDc(null, d && d.dcUrl); return !!(c.on && (kind === 'on' || c[kind])); };

/* ───────── lógica de alertas (idéntica a checkAlerts/fireAlert de app.js) ───────── */
export function evalAlerts(alerts, prices, now = Date.now(), priceOn = true) {
  const fired = [], dc = []; let changed = false;
  for (const a of alerts) {
    if (!a.on) continue; const price = prices[a.symbol]; if (!Number.isFinite(price)) continue;
    if (a.exp && now > a.exp) { a.on = false; a.expired = true; changed = true; continue; }
    const past = a.dir === 'up' ? price >= a.price : price <= a.price;
    if (a.wait) { if (!past) { a.wait = false; changed = true; } continue; }
    if (!past) continue;
    const dir0 = a.dir; a.firedAt = now; a.firedPrice = price; changed = true;
    if (a.repeat === 'every') { if (a.cond) a.wait = true; else a.dir = a.dir === 'up' ? 'down' : 'up'; } else a.on = false;
    const nt = a.notify || 'both'; // igual que la app: sin elegir = app y Discord
    if (nt === 'discord' || nt === 'both') dc.push(`${baseOf(a.symbol)} ${dir0 === 'up' ? 'subió a' : 'bajó a'} ${fmt(a.price)} (ahora ${fmt(price)})${a.note ? ' · ' + a.note : ''}`); // Discord también con la app cerrada
    if (priceOn && nt !== 'discord') fired.push({title: 'VORTEX · Alerta', body: `${baseOf(a.symbol)} ${dir0 === 'up' ? 'subió a' : 'bajó a'} ${fmt(a.price)} (ahora ${fmt(price)})${a.note ? ' · ' + a.note : ''}`, tag: 'al-' + a.id, url: APP_URL + '#alerts'});
  }
  return {fired, changed, dc};
}
// closes: precios de cierre de velas de 1 minuto (la última es la actual). Devuelve los avisos y actualiza last (enfriamiento por moneda y sentido)
export function moveCheck(sym, closes, pct, last, now = Date.now()) {
  const out = [], price = closes[closes.length - 1]; if (!Number.isFinite(price)) return out;
  for (const [mins, lbl, mult] of MOVE_WIN) {
    const start = closes[closes.length - 1 - mins]; if (!Number.isFinite(start) || !(start > 0)) continue;
    const ch = (price / start - 1) * 100; if (Math.abs(ch) < pct * mult) continue;
    const dir = ch > 0 ? 'up' : 'down', k = sym + '|' + dir; if (now - (last[k] || 0) < MOVE_COOL) continue;
    last[k] = now; out.push({title: 'VORTEX · Movimiento brusco', body: `${baseOf(sym)} ${dir === 'up' ? 'sube' : 'cae'} ${Math.abs(ch).toFixed(1)}% en ${lbl} · ${fmt(price)}`, tag: 'mv-' + sym + '-' + dir, url: APP_URL + '#alerts'});
    break;
  }
  return out;
}

/* ───────── Web Push: VAPID (RFC 8292) + cifrado aes128gcm (RFC 8291) ───────── */
let vapidMem = null; // en memoria: no se lee el KV en cada aviso
async function vapidKeys(env) {
  if (vapidMem && vapidMem.kv === env.KV) return vapidMem.v;
  let v = await env.KV.get('vapid', 'json');
  if (!v) {
    const kp = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
    v = {pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), jwk: await crypto.subtle.exportKey('jwk', kp.privateKey)};
    await env.KV.put('vapid', JSON.stringify(v));
  }
  vapidMem = {kv: env.KV, v}; return v;
}
export async function vapidHeader(endpoint, v, now = Date.now()) {
  const key = await crypto.subtle.importKey('jwk', v.jwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({typ: 'JWT', alg: 'ES256'})));
  const body = b64u(enc.encode(JSON.stringify({aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: APP_URL})));
  const sig = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, key, enc.encode(head + '.' + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`;
}
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt, info}, k, len * 8));
}
export async function encryptPayload(sub, text) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const local = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name: 'ECDH', public: uaKey}, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce}, key, concat(enc.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
export async function sendPush(sub, msg, v) {
  const body = await encryptPayload(sub, JSON.stringify(msg));
  const r = await fetch(sub.endpoint, {method: 'POST', headers: {'content-type': 'application/octet-stream', 'content-encoding': 'aes128gcm', ttl: '43200', urgency: 'high', topic: String(msg.tag || 'vortex').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32), authorization: await vapidHeader(sub.endpoint, v)}, body});
  return r.status;
}

/* ───────── precios ───────── */
/* Binance bloquea las IP de Cloudflare (HTTP 403/451): por eso las alertas de precio y los movimientos bruscos no avisaban.
   Si Binance no responde, los precios y las velas de 1 min se piden a MEXC (mismos símbolos BTCUSDT y mismo formato). */
let binanceDownUntil = 0;
export function mexcPath(path) {
  const u = new URL('https://x' + path);
  if (u.pathname === '/api/v3/ticker/price') return '/api/v3/ticker/price'; // MEXC: la lista completa (luego se filtra)
  if (u.pathname === '/api/v3/klines' && u.searchParams.get('interval') === '1m') return path;
  return null;
}
async function getJSON(path) {
  let err;
  if (Date.now() >= binanceDownUntil) {
    for (const h of HOSTS) { try { const r = await fetch(h + path, {headers: {'user-agent': 'VORTEX-Push/1.0'}}); if (r.ok) return await r.json(); err = new Error(h + ' HTTP ' + r.status); } catch (e) { err = e; } }
    binanceDownUntil = Date.now() + 10 * 6e4; // no se insiste cada minuto: se vuelve a probar en 10 min
  }
  const mp = mexcPath(path);
  if (mp) { try { const r = await fetch('https://api.mexc.com' + mp, {headers: {'user-agent': 'VORTEX-Push/1.0'}}); if (r.ok) return await r.json(); err = new Error('MEXC HTTP ' + r.status); } catch (e) { err = e; } }
  throw err || new Error('Binance no disponible');
}
async function spotPrices(syms) { // solo las monedas con alerta; si Binance rechaza la lista (símbolo raro), se piden todas
  if (!syms.length) return {};
  if (syms.length <= 60) { try { const d = await getJSON('/api/v3/ticker/price?symbols=' + encodeURIComponent(JSON.stringify(syms))), o = {}; for (const t of d) o[t.symbol] = +t.price; return o; } catch {} }
  return allPrices();
}
async function allPrices() { const d = await getJSON('/api/v3/ticker/price'), o = {}; for (const t of d) o[t.symbol] = +t.price; return o; }
/* Precios de otros exchanges y futuros (clave «SIMBOLO@exchange», como en la app). Un solo pedido por exchange. */
const nk = s => String(s).toUpperCase().replace(/[-_/]/g, '').replace(/SWAP$/, '');
const SRC_PRICES = {
  binancef: async ks => ks && ks.length <= 12 ? (await Promise.all(ks.map(async k => { const t = await (await fetch('https://fapi.binance.com/fapi/v1/ticker/price?symbol=' + encodeURIComponent(k.split('@')[0]))).json(); return [t.symbol, t.price]; }))) : (await (await fetch('https://fapi.binance.com/fapi/v1/ticker/price')).json()).map(t => [t.symbol, t.price]),
  bybit: async () => (await (await fetch('https://api.bybit.com/v5/market/tickers?category=spot')).json()).result.list.map(t => [t.symbol, t.lastPrice]),
  bybitf: async () => (await (await fetch('https://api.bybit.com/v5/market/tickers?category=linear')).json()).result.list.map(t => [t.symbol, t.lastPrice]),
  okx: async () => (await (await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT')).json()).data.map(t => [t.instId, t.last]),
  okxf: async () => (await (await fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP')).json()).data.map(t => [t.instId, t.last]),
  bingx: async () => (await (await fetch('https://open-api.bingx.com/openApi/spot/v1/ticker/24hr?timestamp=' + Date.now())).json()).data.map(t => [t.symbol, t.lastPrice]),
  bingxf: async () => (await (await fetch('https://open-api.bingx.com/openApi/swap/v2/quote/ticker')).json()).data.map(t => [t.symbol, t.lastPrice]),
  mexc: async () => (await (await fetch('https://api.mexc.com/api/v3/ticker/price')).json()).map(t => [t.symbol, t.price]),
  gate: async () => (await (await fetch('https://api.gateio.ws/api/v4/spot/tickers')).json()).map(t => [t.currency_pair, t.last]),
  bitget: async () => (await (await fetch('https://api.bitget.com/api/v2/spot/market/tickers')).json()).data.map(t => [t.symbol, t.lastPr]),
  kucoin: async () => (await (await fetch('https://api.kucoin.com/api/v1/market/allTickers')).json()).data.ticker.map(t => [t.symbol, t.last]),
  htx: async () => (await (await fetch('https://api.huobi.pro/market/tickers')).json()).data.map(t => [t.symbol, t.close])
};
export async function otherPrices(keys) { // keys: ['HYPEUSDT@binancef', …] → {'HYPEUSDT@binancef': 75.1, …}
  const by = {}; for (const k of keys) { const i = k.indexOf('@'); if (i > 0) (by[k.slice(i + 1)] = by[k.slice(i + 1)] || []).push(k); }
  const out = {};
  await Promise.all(Object.entries(by).map(async ([src, ks]) => {
    if (!SRC_PRICES[src]) return;
    try { const m = new Map((await SRC_PRICES[src](ks)).map(([sym, p]) => [nk(sym), +p])); for (const k of ks) { const p = m.get(nk(k.split('@')[0])); if (Number.isFinite(p)) out[k] = p; } } catch (e) { console.warn('precios', src, e.message); }
  }));
  return out;
}
async function closes1m(sym) { const d = await getJSON(`/api/v3/klines?symbol=${sym}&interval=1m&limit=61`); return d.map(k => +k[4]); }

/* ───────── ronda programada (cada minuto) ─────────
   1) Se leen solo los dispositivos con algo encendido (id + monedas), se piden los precios UNA vez.
   2) Se reparten en tandas pequeñas (/int/tickbatch), cada una en su propia llamada: así aguanta miles de celulares
      sin pasar el límite de CPU ni de subpeticiones de cada llamada del plan gratis. */
const chunkArr = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
async function tick(env, now = Date.now()) {
  const S = storeOf(env), rows = await S.activeRows();
  { const hb = (await env.KV.get('hb', 'json')) || {}; if (now - (hb.at || 0) > 15 * 6e4) await env.KV.put('hb', JSON.stringify({at: now, devices: rows.length, store: S.kind})); } // latido: la app puede ver que el servidor sí está revisando
  if (!rows.length) return {devices: 0, batches: 0, sent: 0, gone: 0, errors: 0};
  const keys = [...new Set(rows.flatMap(r => r.syms))], spot = keys.filter(k => !k.includes('@')), other = keys.filter(k => k.includes('@'));
  const prices = spot.length ? await spotPrices(spot).catch(() => ({})) : {};
  if (other.length) Object.assign(prices, await otherPrices(other).catch(() => ({})));
  const moves = {}; if (rows.some(r => r.mv)) await Promise.all(MOVE_TOP.map(s => closes1m(s).then(c => { moves[s] = c; }).catch(() => {})));
  const job = list => { const p = {}; for (const r of list) for (const k of r.syms) if (k in prices) p[k] = prices[k]; return {ids: list.map(r => r.id), prices: p, moves: list.some(r => r.mv) ? moves : {}, now}; };
  const batches = chunkArr(rows, TICK_BATCH);
  const res = batches.length <= FAN_DIRECT
    ? await pool(batches, 6, b => self(env, '/int/tickbatch', job(b)))
    : (await pool(chunkArr(rows, TICK_BATCH * 20), 6, g => self(env, '/int/tickgroup', job(g)))).flatMap(r => r && r.res ? r.res : [r]);
  const sum = k => res.reduce((a, r) => a + (r && +r[k] || 0), 0);
  return {devices: rows.length, batches: batches.length, sent: sum('sent'), gone: sum('gone'), errors: res.filter(r => r && r.error).length};
}
/* Una tanda de la ronda: evalúa las alertas, movimientos y trades de unos pocos dispositivos y manda sus avisos */
async function tickBatch(env, b) {
  const S = storeOf(env), now = +b.now || Date.now(), prices = b.prices || {}, moves = b.moves || {};
  const devs = (await S.getMany((b.ids || []).slice(0, 40))).filter(([, d]) => d && d.sub);
  const liveTrades = d => (d.trades || []).filter(t => !(t.m && t.m.done)).length && now - (d.syncAt || 0) < TRADE_TTL ? d.trades.filter(t => !(t.m && t.m.done)) : [];
  let sent = 0; const gone = [], changedList = [];
  for (const [id, d] of devs) {
    const msgs = [], r = evalAlerts(d.alerts || [], prices, now, d.priceOn !== false); msgs.push(...r.fired); let changed = r.changed;
    if (r.dc.length && dcAllow(d, 'price')) { const hook = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\//.test(d.dcUrl || '') ? d.dcUrl : String(env.DISCORD_WEBHOOK || '').trim(); if (hook) for (const m of r.dc.slice(0, 2)) { try { await fetch(hook, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({username: 'VORTEX', embeds: [{title: 'Alerta de precio', description: m, color: 0x548fff}]})}); } catch (e) { console.warn('discord', e.message); } } }
    if (d.move && d.move.on) { d.moveLast = d.moveLast || {}; for (const s of MOVE_TOP) if (moves[s]) { const m = moveCheck(s, moves[s], d.move.pct, d.moveLast, now); if (m.length) { msgs.push(...m); changed = true; } } }
    for (const t of liveTrades(d)) { // tus trades abiertos: escalones de ganancia/pérdida, cerca de TP/SL/liquidación, breakeven y tus niveles
      t.m = t.m || {}; const r2 = TW.evalTrade(t, prices[t.k], t.m, now, {step: d.tradeStep, fmt, url: APP_URL});
      if (r2.changed) changed = true; msgs.push(...r2.msgs);
    }
    if (d.testAt) { msgs.push({title: 'VORTEX · Prueba con la app cerrada', body: 'Si ves esto con VORTEX cerrada, tus avisos funcionan ✅', tag: 'test2', url: APP_URL + '#alerts'}); delete d.testAt; changed = true; }
    if (msgs.length) { // el cifrado de cada aviso corre en su propia llamada interna
      let sts = []; try { sts = (await self(env, '/int/push', {id, sub: d.sub, msgs: msgs.slice(0, 8)})).sts || []; } catch (e) { sts = ['err: ' + String(e.message).slice(0, 60)]; }
      sent += sts.filter(x => x >= 200 && x < 300).length; if (sts.some(x => x === 404 || x === 410)) gone.push(id);
      d.lastPush = {at: now, st: sts[sts.length - 1], n: msgs.length, title: String(msgs[0].title || '').slice(0, 60)}; changed = true;
    }
    if (changed && !gone.includes(id)) { d.updated = now; changedList.push([id, d]); }
  }
  if (changedList.length) await S.putMany(changedList);
  if (gone.length) await S.delMany(gone); // suscripción vencida (se desinstaló la app o se quitó el permiso)
  return {devices: devs.length, sent, gone: gone.length};
}
/* Reparte una lista de dispositivos en llamadas internas de «size» (y, si son muchísimos, en grupos que a su vez reparten) */
const FAN_PATHS = new Set(['/int/pushmany', '/int/tickbatch', '/int/indbatch']);
async function fanout(env, ids, size, path, extra = {}) {
  const batches = chunkArr(ids, size);
  if (batches.length <= FAN_DIRECT) return pool(batches, 6, b => self(env, path, {...extra, ids: b}));
  return (await pool(chunkArr(ids, size * 20), 6, g => self(env, '/int/fan', {ids: g, size, path, extra}))).flatMap(r => r && r.res ? r.res : [r]);
}
const sumOf = (res, k) => (res || []).reduce((a, r) => a + (r && +r[k] || 0), 0);

/* ───────── IA de VORTEX (Pollinations con TU clave secreta) ─────────
   La clave de Pollinations (producto gratuito) va aquí fija: cualquier persona usa la IA sin escribir claves ni datos.
   La app le pide la IA a /ai y este Worker la reenvía a gen.pollinations.ai (con límite por IP para que nadie abuse). */
const POLLEN_KEY = 'sk_1XvEYtOmiFixsgMve0FAqQz5ghhy7FFT';
const AI_KEY_HASH = '2ab4147ae8ba67933529aa916c753628bd1374ba24387f4cfdaabb0a25a9bcb6';
const AI_URL = 'https://gen.pollinations.ai/v1/chat/completions', AI_MODELS = 'https://gen.pollinations.ai/text/models', AI_MAX_BODY = 1600000, AI_MAX_TOKENS = 4000;
const AI_MODELS_OK = ['openai', 'openai-fast', 'openai-large', 'mistral', 'gemini', 'gemini-fast', 'deepseek', 'qwen-coder', 'claude-fast', 'grok', 'openai-audio', 'gpt-5.4-mini', 'grok-fast']; // openai-audio: transcribe tu voz (dictado en la PC)
const sha256 = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('');
const aiHits = new Map(); // límite por IP (por instancia): evita que alguien gaste tus créditos a lo loco
function aiAllowed(ip, now = Date.now()) { const h = (aiHits.get(ip) || []).filter(t => now - t < 60000); if (h.length >= 20) return false; h.push(now); aiHits.set(ip, h); if (aiHits.size > 5000) aiHits.clear(); return true; }
/* ───────── IA open source y gratis (sin créditos): Cloudflare Workers AI → Groq → Pollinations ─────────
   Cada uso tiene su modelo: chat (Nexus Pixel, briefing), vision (Analizar gráfico con captura) y code (Laboratorio de Pine).
   Workers AI usa el cupo diario gratis de tu cuenta de Cloudflare (enlace «AI» del Worker). Groq se usa si existe el secreto GROQ_KEY (cuenta gratis). */
export const OPEN_AI = {
  chat: {wai: ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-4-scout-17b-16e-instruct'], groq: ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b']},
  vision: {wai: ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/google/gemma-4-26b-a4b-it'], groq: []},
  code: {wai: ['@cf/qwen/qwen2.5-coder-32b-instruct', '@cf/openai/gpt-oss-120b'], groq: ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b']},
  /* Nexus Pixel (el avatar del gráfico): su propia cadena de IA gratis, separada de los bots.
     Antes usaba «qwen/qwen3.6-27b» (ese nombre ya no existe en Groq) y GPT-OSS 120B, cuyo cupo diario gratis (200 000 tokens) se lo
     acaban los bots, el Vigía y las salas: por la noche ya no quedaba nada, Pixel caía en Pollinations y contestaba «sin créditos».
     Ahora: Qwen 3.x (el más nuevo que haya) → GPT-OSS 120B → Kimi K2 → Llama 3.3 70B → GPT-OSS 20B en Groq (cada modelo tiene su PROPIO cupo diario),
     luego Gemini 2.5 Flash / Mistral / OpenRouter gratis si pusiste su clave (GEMINI_KEY, MISTRAL_KEY, OPENROUTER_KEY), y al final Cloudflare.
     Los nombres de Groq se buscan solos en su lista de modelos, así un cambio de versión ya no la rompe.
     «see» = sus ojos: un modelo con visión describe la captura del gráfico y luego el modelo que razona decide. */
  pixel: {groq: [/^qwen\/qwen3/, 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b', /kimi-k2/, 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b'], gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'], mistral: ['mistral-medium-latest', 'mistral-small-latest'], openrouter: ['openai/gpt-oss-120b:free', 'deepseek/deepseek-chat-v3.1:free', 'qwen/qwen3-235b-a22b:free'], wai: ['@cf/openai/gpt-oss-120b', '@cf/zai-org/glm-4.7-flash', '@cf/google/gemma-4-26b-a4b-it'], json: true, cap: 30000, budget: 75000},
  see: {gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'], mistral: ['mistral-small-latest'], groq: [/^qwen\/qwen3/], wai: ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/google/gemma-4-26b-a4b-it', '@cf/mistralai/mistral-small-3.1-24b-instruct'], order: ['Gemini', 'Mistral', 'Cloudflare', 'Groq'], cap: 22000, budget: 32000}
};
export const AI_TASKS = Object.keys(OPEN_AI);
const OPEN_NAME = m => m.replace(/^@cf\/[^/]+\//, '').replace(/^(openai|meta-llama|qwen)\//, '');
export const hasImg = msgs => (msgs || []).some(m => Array.isArray(m.content) && m.content.some(p => p && p.type === 'image_url'));
export const noImg = msgs => (msgs || []).map(m => Array.isArray(m.content) ? {role: m.role, content: m.content.filter(p => p && p.type === 'text').map(p => p.text).join('\n') + '\n(La captura no se pudo analizar: usa los datos numéricos del gráfico.)'} : m);
export function aiText(j) { // respuesta de Workers AI o de una API tipo OpenAI → texto
  if (!j) return ''; if (typeof j === 'string') return j;
  const r = j.result || j; if (typeof r.response === 'string') return r.response;
  const c = r.choices && r.choices[0]; if (c) return (c.message && (typeof c.message.content === 'string' ? c.message.content : Array.isArray(c.message.content) ? c.message.content.map(x => x.text || '').join('') : '')) || c.text || '';
  if (typeof r.output_text === 'string') return r.output_text;
  if (Array.isArray(r.output)) return r.output.filter(o => o && o.type === 'message').flatMap(o => o.content || []).map(x => x.text || '').join('');
  return '';
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('tiempo')), ms))]);
/* Parámetros propios de cada modelo de Groq: los que razonan esconden su razonamiento (solo llega la respuesta) */
export function groqExtra(m, task) {
  if (/^qwen\//.test(m)) return {reasoning_format: 'hidden'};
  if (/gpt-oss/.test(m)) return {reasoning_effort: task === 'pixel' || task === 'code' ? 'medium' : 'low', include_reasoning: false};
  return {};
}
/* Lista real de modelos de Groq (se guarda 6 h): los nombres cambian con cada versión y uno viejo daba error 404 */
let groqList = null;
export async function groqModels(env, fetchFn = fetch) {
  if (groqList && Date.now() - groqList.t < 6 * 3600e3) return groqList.ids;
  try { const r = await fetchFn('https://api.groq.com/openai/v1/models', {headers: {authorization: 'Bearer ' + env.GROQ_KEY}, signal: AbortSignal.timeout(5000)}); if (r.ok) { const j = await r.json(), ids = (j.data || []).map(x => x && x.id).filter(Boolean); if (ids.length) { groqList = {t: Date.now(), ids}; return ids; } } } catch {}
  return groqList ? groqList.ids : null;
}
export const resetGroqList = () => { groqList = null; };
/* Preferencias (texto exacto o patrón) → nombres que de verdad existen. Sin lista: solo los nombres exactos. */
export function resolveModels(prefs, ids) {
  const out = [];
  for (const p of prefs || []) {
    if (typeof p === 'string') { if (!ids || ids.includes(p)) out.push(p); continue; }
    if (!ids) continue; const hit = ids.filter(id => p.test(id) && !/guard|safeguard|tts|whisper|embed/.test(id)).sort().reverse()[0]; if (hit) out.push(hit);
  }
  return [...new Set(out)];
}
/* Proveedores gratis compatibles con OpenAI (cada uno solo si existe su clave) */
const OAI = {
  Groq: {url: 'https://api.groq.com/openai/v1/chat/completions', key: e => e.GROQ_KEY},
  Gemini: {url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: e => e.GEMINI_KEY},
  Mistral: {url: 'https://api.mistral.ai/v1/chat/completions', key: e => e.MISTRAL_KEY},
  OpenRouter: {url: 'https://openrouter.ai/api/v1/chat/completions', key: e => e.OPENROUTER_KEY}
};
export function providerExtra(who, m, task) {
  if (who === 'Groq') return groqExtra(m, task);
  if (who === 'Gemini' && /2\.5/.test(m)) return {reasoning_effort: task === 'pixel' ? 'low' : 'none'}; // piensa un poco (Pixel) sin comerse los tokens
  return {};
}
export async function openChain(env, task, messages, opts = {}, fetchFn = fetch) {
  const T = OPEN_AI[task] || OPEN_AI.chat, max_tokens = Math.min(+opts.max_tokens || 1600, AI_MAX_TOKENS), temperature = Number.isFinite(+opts.temperature) ? +opts.temperature : .4, tried = [];
  const end = Date.now() + (T.budget || 120000), left = () => end - Date.now(), cap = ms => Math.max(4000, Math.min(T.cap || ms, ms, left()));
  const clean = t => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*?<\/think>/, '').trim();
  const viaOai = who => async (m, msgs) => {
    const P = OAI[who], base = {model: m, messages: msgs, max_tokens, temperature, ...providerExtra(who, m, task)}, json = T.json && opts.json ? {response_format: {type: 'json_object'}} : {};
    const go = b => fetchFn(P.url, {method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer ' + P.key(env)}, body: JSON.stringify(b), signal: AbortSignal.timeout(cap(45000))});
    let r = await go({...base, ...json});
    if (!r.ok && r.status === 400) { const lite = {model: m, messages: msgs, max_tokens, temperature}; r = await go(json.response_format ? {...base} : lite); if (!r.ok && r.status === 400) r = await go(lite); } // el modelo no acepta algún parámetro (modo JSON o de razonamiento): se pide normal
    if (!r.ok) throw new Error(who.toLowerCase() + ' ' + r.status); return clean(aiText(await r.json()));
  };
  const viaWai = async (m, msgs) => clean(aiText(await withTimeout(env.AI.run(m, {messages: msgs, max_tokens, temperature}), cap(55000))));
  const routes = []; const add = (who, list, fn) => { for (const m of list || []) routes.push([who, m, fn]); };
  for (const who of T.order || ['Groq', 'Gemini', 'Mistral', 'OpenRouter', 'Cloudflare']) { // Groq primero si tienes clave: es el más rápido
    if (who === 'Cloudflare') { if (env.AI) add('Cloudflare', T.wai, viaWai); continue; }
    if (!OAI[who].key(env) || !(T[who.toLowerCase()] || []).length) continue;
    const list = T[who.toLowerCase()], ids = who === 'Groq' && list.some(p => typeof p !== 'string') ? await groqModels(env, fetchFn) : null;
    add(who, who === 'Groq' ? resolveModels(list, ids) : list, viaOai(who));
  }
  for (const [who, m, fn] of routes) {
    if (left() < 4000) break;
    try { const text = await fn(m, messages); if (text && text.length > 1 && !NO_CREDIT.test(text.slice(0, 300))) return {text, model: OPEN_NAME(m) + ' · ' + who}; tried.push(m + ': vacío'); }
    catch (e) { tried.push(m + ': ' + String(e && e.message || e).slice(0, 60)); }
  }
  if ((task === 'vision' || task === 'pixel') && hasImg(messages) && left() > 6000) { const r = await openChain(env, task === 'pixel' ? 'pixel' : 'chat', noImg(messages), opts, fetchFn); if (r) return Object.assign(r, {image: false}); } // sin visión disponible: analiza con los datos
  return null;
}
const NO_CREDIT = /enough credits|top up|paid pollen|insufficient (balance|credits|funds|quota)|requires? (a )?paid|out of credits|quota exceeded|exceeded your (current )?quota/i;
async function aiKey(env) { return env.POLLEN_KEY || (await env.KV.get('ai:pollen')) || POLLEN_KEY; }
async function aiRoute(req, env, path, json, cors) {
  if (path === '/ai/status') return json({ok: true, ready: !!(await aiKey(env))});
  if (path === '/ai/key' && req.method === 'POST') {
    let b; try { b = JSON.parse(await req.text()); } catch { return json({error: 'JSON inválido'}, 400); }
    const k = String(b.key || '').trim(); if (!/^sk_[\w-]{10,}$/.test(k) || await sha256(k) !== AI_KEY_HASH) return json({error: 'Esa no es la clave autorizada para este servidor'}, 403);
    await env.KV.put('ai:pollen', k); return json({ok: true, ready: true});
  }
  const freeAI = !!(env.AI || env.GROQ_KEY || env.GEMINI_KEY || env.MISTRAL_KEY || env.OPENROUTER_KEY);
  const key = await aiKey(env); if (!key && !freeAI) return json({error: 'El servidor aún no tiene la clave de IA', kind: 'nokey'}, 503);
  if (!aiAllowed(req.headers.get('cf-connecting-ip') || 'x')) return json({error: 'Demasiadas consultas seguidas; espera un minuto'}, 429);
  if (path === '/ai/models') { const r = await fetch(AI_MODELS, {headers: {authorization: 'Bearer ' + key}}); return new Response(r.body, {status: r.status, headers: {...cors, 'content-type': 'application/json', 'cache-control': 'max-age=1800'}}); }
  if (path === '/ai' && req.method === 'POST') {
    const raw = await req.text(); if (raw.length > AI_MAX_BODY) return json({error: 'La consulta es demasiado grande'}, 413);
    let b; try { b = JSON.parse(raw); } catch { return json({error: 'JSON inválido'}, 400); }
    const want = String(b.model || 'openai'), model = AI_MODELS_OK.includes(want) ? want : 'openai'; // solo modelos de chat (nunca filtros tipo qwen3guard)
    if (model !== 'openai-audio' && freeAI) { // IA open source y gratis primero (Workers AI / Groq); si no contesta, sigue con Pollinations
      const msgs = Array.isArray(b.messages) ? b.messages.slice(-16) : [], task = AI_TASKS.includes(b.task) ? b.task : hasImg(msgs) ? 'vision' : 'chat';
      try { const r = await openChain(env, task === 'chat' && hasImg(msgs) ? 'vision' : task, msgs, b); if (r) return json({object: 'chat.completion', model: r.model, image: r.image !== false && hasImg(msgs), choices: [{index: 0, message: {role: 'assistant', content: r.text}, finish_reason: 'stop'}]}); } catch {}
      if (task === 'pixel' || task === 'see') return json({error: 'La IA gratis no respondió', kind: 'busy'}, 502); // Pixel: no gastar créditos de Pollinations; la app reintenta por su lado
    }
    const body = {model, messages: Array.isArray(b.messages) ? b.messages.slice(-16) : [], temperature: Number.isFinite(+b.temperature) ? +b.temperature : .4, max_tokens: Math.min(+b.max_tokens || 1200, AI_MAX_TOKENS), stream: !!b.stream};
    if (model === 'openai-audio') body.modalities = ['text']; // dictado: solo queremos el texto, no una respuesta hablada
    const r = await fetch(AI_URL, {method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer ' + key}, body: JSON.stringify(body)});
    return new Response(r.body, {status: r.status, headers: {...cors, 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store'}});
  }
  return json({error: 'No encontrado'}, 404);
}

/* ───────── HTTP ───────── */
const MKT_HOSTS = new Set(['open-api.bingx.com', 'api.kucoin.com', 'api.mexc.com', 'api.gateio.ws', 'api.bitget.com', 'api.huobi.pro', 'api.kraken.com', 'api.bybit.com', 'www.okx.com', 'api.exchange.coinbase.com', 'api.binance.com', 'fapi.binance.com']);

/* ───────── Panel macro: índices, materias primas, bonos, miedo/codicia y dominancia (datos públicos, con caché) ───────── */
const MACRO_SYMS = [['dxy', 'DX-Y.NYB'], ['spx', '^GSPC'], ['ndx', '^IXIC'], ['gold', 'GC=F'], ['oil', 'CL=F'], ['us10y', '^TNX'], ['vix', '^VIX']];
async function yahoo(sym) {
  for (const host of ['query1', 'query2']) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d`, {headers: {'user-agent': 'Mozilla/5.0 (VORTEX)', accept: 'application/json'}, cf: {cacheTtl: 300, cacheEverything: true}});
      if (!r.ok) continue; const j = await r.json(), res = j && j.chart && j.chart.result && j.chart.result[0]; if (!res) continue;
      const q = res.indicators.quote[0], t = res.timestamp || [], pts = [];
      for (let i = 0; i < t.length; i++) if (Number.isFinite(q.close[i])) pts.push([t[i] * 1000, q.close[i]]);
      const m = res.meta || {}, last = Number.isFinite(m.regularMarketPrice) ? m.regularMarketPrice : (pts.length ? pts[pts.length - 1][1] : NaN);
      if (!Number.isFinite(last) || pts.length < 2) continue;
      const day = t => Math.floor(t / 864e5), dd = []; // una vela por día (Yahoo a veces repite la última)
      for (const p of pts) { if (dd.length && day(dd[dd.length - 1][0]) === day(p[0])) dd[dd.length - 1] = p; else dd.push(p); }
      pts.length = 0; pts.push(...dd); if (pts.length) pts[pts.length - 1][1] = last;
      const prev = pts.length >= 2 ? pts[pts.length - 2][1] : NaN, wk = pts.length >= 6 ? pts[pts.length - 6][1] : NaN, mo = pts.length >= 22 ? pts[pts.length - 22][1] : NaN;
      return {last, prev, d1: (last / prev - 1) * 100, w1: (last / wk - 1) * 100, m1: (last / mo - 1) * 100, at: (m.regularMarketTime || 0) * 1000, state: m.marketState || '', spark: pts.slice(-60).map(p => +p[1].toFixed(4))};
    } catch {}
  }
  return null;
}
async function macroData() {
  const out = {at: Date.now()};
  await Promise.all([
    ...MACRO_SYMS.map(async ([k, s]) => { out[k] = await yahoo(s); }),
    (async () => { try { const r = await fetch('https://api.alternative.me/fng/?limit=60', {cf: {cacheTtl: 900, cacheEverything: true}}), j = await r.json(), d = (j.data || []).map(x => +x.value).filter(Number.isFinite);
      if (d.length) out.fng = {last: d[0], prev: d[1], w1: d[7], label: (j.data[0] || {}).value_classification || '', spark: d.slice(0, 60).reverse()}; } catch {} })(),
    (async () => { try { const r = await fetch('https://api.coingecko.com/api/v3/global', {headers: {accept: 'application/json', 'user-agent': 'VORTEX-Market/1.0'}, cf: {cacheTtl: 600, cacheEverything: true}}), j = await r.json(), g = j && j.data;
      if (g) out.dom = {btc: g.market_cap_percentage.btc, eth: g.market_cap_percentage.eth, usdt: g.market_cap_percentage.usdt, usdc: g.market_cap_percentage.usdc, cap: g.total_market_cap.usd, capChg: g.market_cap_change_percentage_24h_usd}; } catch {}
      if (!out.dom) try { const r = await fetch('https://api.coinpaprika.com/v1/global', {cf: {cacheTtl: 600, cacheEverything: true}}), g = await r.json();
        if (g && Number.isFinite(g.bitcoin_dominance_percentage)) out.dom = {btc: g.bitcoin_dominance_percentage, cap: g.market_cap_usd, capChg: g.market_cap_change_24h, partial: true}; } catch {} })()
  ]);
  return out;
}
async function macroRoute(env, json, cors) {
  const cache = caches.default, key = new Request('https://vortex-cache.local/macro-v2');
  const hit = await cache.match(key); if (hit) { const b = await hit.text(); return new Response(b, {headers: {...cors, 'content-type': 'application/json', 'x-cache': 'hit'}}); }
  const d = await macroData(), body = JSON.stringify(d);
  const good = MACRO_SYMS.filter(([k]) => d[k]).length;
  if (good >= 3) await cache.put(key, new Response(body, {headers: {'content-type': 'application/json', 'cache-control': 'public, max-age=300'}}));
  return new Response(body, {headers: {...cors, 'content-type': 'application/json', 'x-cache': 'miss'}});
}

export default {
  async fetch(req, env) {
    const allowed = String(env.ALLOWED_ORIGIN || DEFAULT_ORIGINS).split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.headers.get('origin') || '', ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = {'access-control-allow-origin': ok ? origin : 'null', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400', vary: 'origin'};
    const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {...cors, 'content-type': 'application/json'}});
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    const path = new URL(req.url).pathname;
    if (path.startsWith('/mem/')) return memRoute(req, env, path); // va con su propia llave secreta, desde cualquier IA (sin origen)
    if (req.method === 'GET' && path === '/') return json({ok: true, app: 'VORTEX push', note: 'Notificaciones de alertas con la app cerrada'});
    if (req.method === 'GET' && path === '/scr/state') { const st = (await env.KV.get('scr', 'json')) || {}; return json({ok: true, '1h': st['1h'] || 0, '4h': st['4h'] || 0, last: st.last || {}, lock: st.lock || 0, err: st.err || null, kick: st.kick || null, now: Date.now()}); }
    if (req.method === 'GET' && path === '/dom') { const st = (await env.KV.get('dom', 'json')) || {}; return json({ok: true, method: DOM.METHOD, at: st.at || 0, err: st.err || null, series: st.h || {}, now: Date.now()}); } // muestras de dominancia de cada 15 min (las juntan la app y el flujo de GitHub)
    if (path.startsWith('/scr/') && req.method === 'POST') return scrInternal(req, env, path);
    if ((path.startsWith('/radar/') || path.startsWith('/int/')) && req.method === 'POST') return scrInternal(req, env, path); // Radar de Nexus Pixel (llamadas internas)
    if (req.method === 'GET' && path === '/radar/state') { const st = await radarState(env); return json({ok: true, at: st.at || 0, note: st.note || '', min: st.min, log: st.log.slice(0, 30).map(o => ({symbol: o.symbol, tf: o.tf, side: o.side, at: o.at, entry: o.entry, stop: o.stop, target: o.target, ai: o.ai, v: o.v, why: o.why, res: o.res, resAt: o.resAt}))}); }
    if (req.method === 'GET' && path === '/scr/diag') { // diagnóstico: qué servidores de Binance contestan desde Cloudflare
      const urls = ['https://api.mexc.com/api/v3/klines?symbol=BTCUSDT&interval=60m&limit=2', 'https://api.mexc.com/api/v3/ticker/24hr', 'https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=BTC_USDT&interval=1h&limit=2', 'https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=1hour', 'https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1H&limit=2', 'https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=60&limit=2', 'https://api.bitget.com/api/v2/spot/market/candles?symbol=BTCUSDT&granularity=1h&limit=2', 'https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=2', 'https://min-api.cryptocompare.com/data/v2/histohour?fsym=BTC&tsym=USDT&e=Binance&limit=2', 'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=2', 'https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=2'], out = {};
      await Promise.all(urls.map(async u => { try { const r = await fetch(u, {headers: {'user-agent': 'Mozilla/5.0 (compatible; VORTEX/2.0)', accept: 'application/json'}}); const t = await r.text(); out[u.split('?')[0]] = r.status + ' ' + t.slice(0, 80); } catch (e) { out[u] = 'err ' + e.message; } }));
      return json({colo: (req.cf && req.cf.colo) || '', out});
    }
    if (req.method === 'POST' && path === '/bot-push') return botPush(req, env);
    if (req.method === 'POST' && path === '/ext/scr') return scrExt(req, env); // el Motor (GitHub Actions) calculó el Screener con Binance: aquí se aparta la franja y se avisa a los celulares + radar
    if (req.method === 'POST' && (path === '/ind/jobs' || path === '/ind/report')) return indRoute(req, env, path); // alertas con indicador (GitHub Actions) // Nova Bot Lab (GitHub Actions): avisos de tus bots a tus celulares
    if (!ok) return json({error: 'Origen no permitido'}, 403);
    if (path === '/ai' || path.startsWith('/ai/')) return aiRoute(req, env, path, json, cors);
    if (req.method === 'GET' && path === '/macro') return macroRoute(env, json, cors);
    if (req.method === 'GET' && path === '/mkt') { // datos PÚBLICOS de exchanges que bloquean CORS (BingX, KuCoin, MEXC…): solo GET, sin llaves, solo hosts permitidos
      let t; try { t = new URL(new URL(req.url).searchParams.get('u') || ''); } catch { return json({error: 'URL inválida'}, 400); }
      if (t.protocol !== 'https:' || !MKT_HOSTS.has(t.host)) return json({error: 'Exchange no permitido'}, 403);
      try {
        const r = await fetch(t.href, {headers: {'user-agent': 'VORTEX-Market/1.0', accept: 'application/json'}, cf: {cacheTtl: /symbols|AssetPairs|common/.test(t.pathname) ? 300 : 5, cacheEverything: true}});
        return new Response(r.body, {status: r.status, headers: {...cors, 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store'}});
      } catch (e) { return json({error: 'Exchange sin respuesta'}, 502); }
    }
    if (req.method === 'GET' && path === '/vapid') return json({key: (await vapidKeys(env)).pub});
    if (req.method !== 'POST') return json({error: 'Método no permitido'}, 405);
    const raw = await req.text(); if (raw.length > 60000) return json({error: 'Demasiado grande'}, 413);
    let b; try { b = JSON.parse(raw); } catch { return json({error: 'JSON inválido'}, 400); }
    if (!b || typeof b !== 'object') return json({error: 'JSON inválido'}, 400);
    if (path === '/plan/bingx') return planRoute(req, env, path, b, json);
    if (path === '/vault/seal' || path === '/vault/open') return vaultRoute(env, path, b, json);
    const id = String(b.id || ''); if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) return json({error: 'id inválido'}, 400); // id aleatorio del dispositivo (hace de contraseña)
    const S = storeOf(env);
    if (path === '/sync') {
      if (b.off) { await S.del(id); return json({ok: true, off: true}); }
      const prev = await S.get(id), cur = prev || {}, now = Date.now();
      const sub = sanSub(b.sub) || cur.sub; if (!sub) return json({error: 'Falta la suscripción push'}, 400);
      /* La cuenta del dispositivo SOLO se toma de un token de sesión verificado (antes cualquiera podía decir «soy tal uid»).
         Sin token se conserva la que ya estaba verificada, y si la app dice otra cuenta o que cerraste sesión, se quita. */
      const who = typeof b.idToken === 'string' && b.idToken ? await verifyIdToken(b.idToken) : null;
      let uid = typeof cur.uid === 'string' ? cur.uid : '';
      if (who) uid = who.uid; else if (typeof b.uid === 'string' && b.uid !== uid) uid = '';
      if (b.subOnly) { if (!prev || !prev.sub) return json({ok: false, error: 'Dispositivo sin registrar'}, 404); cur.sub = sub; cur.uid = uid; cur.updated = now; await S.put(id, cur); return json({ok: true}); } // el celular renovó su suscripción: se conservan alertas y ajustes
      let iph = '';
      if (!prev) { // dispositivo nuevo: límites para que nadie llene el servidor con registros falsos
        if (await S.count() >= S.max) return json({error: 'El servidor de avisos está lleno por ahora; inténtalo más tarde'}, 503);
        iph = (await sha256('vx-ip:' + (req.headers.get('cf-connecting-ip') || ''))).slice(0, 24);
        if (await S.newFromIp(iph, now - 864e5) >= MAX_NEW_PER_IP_DAY) return json({error: 'Demasiados registros nuevos desde tu red hoy; inténtalo mañana'}, 429);
      }
      if (uid && uid !== cur.uid) { // tope de dispositivos por cuenta: se suelta el más viejo (cambiaste de celular o de navegador)
        const mine = (await S.ids('uid', uid)).filter(x => x !== id); if (mine.length >= MAX_PER_UID) await S.delMany(mine.slice(0, mine.length - MAX_PER_UID + 1));
      }
      const incoming = (Array.isArray(b.alerts) ? b.alerts : []).map(sanAlert).filter(Boolean).slice(0, MAX_ALERTS);
      const m = mergeAlerts(incoming, cur.alerts, b.since);
      const d = {sub, lastPush: cur.lastPush, alerts: m.alerts, move: sanMove(b.move), scr: b.scr ? sanScr(b.scr) : sanScr(cur.scr), radar: b.radar == null ? !!cur.radar : b.radar === true, priceOn: b.priceOn !== false, dc: sanDc(b.dc, b.dcUrl), dcUrl: typeof b.dcUrl === 'string' && b.dcUrl.length < 300 && /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/[\w/-]+$/.test(b.dcUrl) ? b.dcUrl : '', moveLast: cur.moveLast || {}, updated: cur.updated || Date.now(),
        uid, bots: b.bots == null ? cur.bots !== false : b.bots !== false,
        trades: TW.merge(b.trades, cur.trades), indOn: b.indOn == null ? cur.indOn !== false : b.indOn !== false, tradeStep: TW.STEPS.includes(+b.tradeStep) ? +b.tradeStep : TW.DEF_STEP, syncAt: cur.syncAt || 0};
      if (cur.testAt) d.testAt = cur.testAt; // una prueba «con la app cerrada» pendiente no se pierde al sincronizar
      const mi = b.ind === undefined ? {ind: cur.ind || [], back: []} : mergeInd(b.ind, cur.ind, b.since); d.ind = mi.ind;
      if (d.trades.length && now - d.syncAt > 12 * 3600e3) d.syncAt = now; // la app sigue viendo esos trades abiertos (se renueva cada 12 h para no gastar escrituras)
      const noBar = x => ({...x, updated: 0, ind: (x.ind || []).map(a => ({...a, lastBar: 0}))}), barMoved = (d.ind || []).some(a => { const c = (cur.ind || []).find(y => y.id === a.id); return !c || a.lastBar - (c.lastBar || 0) > 6 * 3600e3; });
      const same = prev && !barMoved && JSON.stringify(noBar(d)) === JSON.stringify(noBar(cur)); // la vela revisada de las alertas con indicador cambia a cada rato: solo se guarda si cambió algo más
      if (!same) { d.updated = now; await S.put(id, d, {iph}); if (!prev && S.noteIp) S.noteIp(iph); }
      const hb = (await env.KV.get('hb', 'json')) || {};
      return json({ok: true, back: m.back, backInd: mi.back, now, verified: !!who, srv: {hb: hb.at || 0, lastPush: cur.lastPush || null}});
    }
    if (path === '/pull') { const cur = await S.get(id); return json({ok: true, active: !!cur, alerts: cur ? cur.alerts : [], now: Date.now()}); }
    if (path === '/test') {
      const cur = await S.get(id); if (!cur || !cur.sub) return json({error: 'Este dispositivo no está registrado'}, 404);
      if (b.later) { cur.testAt = Date.now(); await S.put(id, cur); return json({ok: true, later: true}); } // la manda la próxima revisión del servidor (≤1 min): da tiempo de cerrar la app
      if (!testAllowed(id)) return json({error: 'Espera un momento antes de otra prueba'}, 429);
      const st = await sendPush(cur.sub, {title: 'VORTEX · Prueba', body: 'Las notificaciones con la app cerrada funcionan ✅', tag: 'test', url: APP_URL + '#alerts'}, await vapidKeys(env));
      return json({ok: st >= 200 && st < 300, status: st});
    }
    return json({error: 'No encontrado'}, 404);
  },
  async scheduled(event, env, ctx) {
    const now = event.scheduledTime || Date.now();
    ctx.waitUntil(tick(env, now).then(r => console.log('ronda', JSON.stringify(r))).catch(e => console.error('ronda', e.message)));
    ctx.waitUntil(scrKick(env, now).catch(e => console.error('screener', e.message)));
    ctx.waitUntil(domKick(env, now).catch(e => console.error('dominancia', e.message)));
    if (new Date(now).getUTCHours() === 9 && new Date(now).getUTCMinutes() === 17) ctx.waitUntil(storeOf(env).prune(now - 60 * 864e5).then(n => console.log('limpieza', n)).catch(e => console.error('limpieza', e.message))); // una vez al día: registros abandonados (60 días sin abrir la app y sin nada encendido)
  }
};
export {tick, tickBatch, domKick, domRun};

/* ───────── Dominancia puntual cada 15 min (USDT.D, BTC.D) ─────────
   GitHub corre «Actualizar dominancia» cuando quiere (a veces cada 5–9 h), así que la muestra de cada cuarto de hora se toma aquí,
   con la misma fórmula (dominance-core.js). Se guardan 4 días en el KV; el flujo de GitHub las pasa a dominance-data.json y la app las lee de /dom. */
const DOM_Q = 900e3, DOM_KEEP = 4 * 864e5, DOM_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1';
async function domKick(env, now = Date.now()) {
  if (Math.floor(now / 6e4) % 15 > 5) return null; // se intenta en los primeros minutos de cada cuarto de hora (si CoinGecko falla, se reintenta al minuto siguiente)
  const st = (await env.KV.get('dom', 'json')) || {}; if (st.slot === Math.floor(now / DOM_Q) * DOM_Q) return null;
  return self(env, '/int/dom', {now}); // en su propia llamada: leer 250 monedas tiene su propio límite de CPU y no estorba a las alertas
}
async function domRun(env, now = Date.now()) {
  const slot = Math.floor(now / DOM_Q) * DOM_Q, st = (await env.KV.get('dom', 'json')) || {}; if (st.slot === slot) return {ok: true, skip: 'ya tomada'};
  let cur = null, why = '';
  try { const r = await fetch(DOM_URL, {headers: {accept: 'application/json', 'user-agent': 'VORTEX-Dominance/1.0'}}); if (r.ok) cur = DOM.sample(await r.json()); else why = 'CoinGecko HTTP ' + r.status; } catch (e) { why = String(e && e.message || e).slice(0, 120); }
  if (!cur) { if (Math.floor(now / 6e4) % 15 === 5) { st.err = {at: now, why: why || 'respuesta incompleta'}; await env.KV.put('dom', JSON.stringify(st)); } return {ok: false, why: why || 'respuesta incompleta'}; } // el fallo solo se anota en el último intento (pocas escrituras)
  const h = st.h || {}; for (const [k, v] of [['USDT.D', cur.usdt], ['BTC.D', cur.btc]]) h[k] = DOM.mergeSamples(h[k], [[slot, v]], DOM_Q, now - DOM_KEEP);
  await env.KV.put('dom', JSON.stringify({slot, at: now, h}));
  return {ok: true, usdt: +cur.usdt.toFixed(4), btc: +cur.btc.toFixed(4)};
}

/* ───────── Planes verificados en el servidor ─────────
   El plan ya no lo decide la app: el servidor comprueba tu sesión (token de Firebase), verifica con BingX (el pago lo verifica vortex-pay)
   y escribe el resultado en plans/{uid} de Firestore (las reglas no dejan que nadie más lo escriba).
   Con ese plan Firestore deja leer el código de los indicadores Nova Nexus PRO, y la app lo lee para desbloquear lo demás. */
const hitsMem = new Map(); // límites por cuenta/IP en memoria (no gastan escrituras)
function allowHit(key, max, winMs, now = Date.now()) { const h = (hitsMem.get(key) || []).filter(t => now - t < winMs); if (h.length >= max) { hitsMem.set(key, h); return false; } h.push(now); hitsMem.set(key, h); if (hitsMem.size > 20000) hitsMem.clear(); return true; }
const testAllowed = id => allowHit('test:' + id, 3, 60e3);
export const BX_MIN_USD = 100;
export async function planRoute(req, env, path, b, json, fetchFn = fetch) {
  const who = await verifyIdToken(b.idToken, {fetchFn}); if (!who) return json({ok: false, error: 'Inicia sesión con Google para verificar tu plan', login: true}, 401);
  if (!allowHit('plan:' + who.uid, 6, 60e3)) return json({ok: false, error: 'Demasiados intentos; espera un minuto'}, 429);
  const sa = saOf(env); if (!sa) return json({ok: false, setup: true, error: 'El servidor aún no puede guardar planes'}, 503);
  const S = storeOf(env);
  if (path === '/plan/bingx') {
    const bx = String(b.uid == null ? '' : b.uid).replace(/\D/g, ''); if (!/^\d{6,14}$/.test(bx)) return json({ok: false, error: 'UID inválido'}, 400);
    const claim = await S.mget('bx:' + bx); if (claim && claim.uid && claim.uid !== who.uid) return json({ok: false, invited: false, taken: true, error: 'Ese UID de BingX ya activó Infinity en otra cuenta'}, 409);
    const r = await bingxInvite(env, bx, fetchFn); if (r.error) return json({ok: false, error: r.error}, 400);
    if (!r.ok || !r.invited) return json(r);
    /* Saldo mínimo: Infinity gratis pide al menos $100 en la cuenta de BingX (el dinero es del usuario, para que haga trading;
       solo evita que se creen cuentas vacías una y otra vez). Se vuelve a revisar cada mes (refEnd). Mientras junta el saldo: 7 días de Plus, una sola vez. */
    const now = Date.now(), MIN = BX_MIN_USD, bal = r.bal;
    // Renovación (ya tuvo Infinity con esta cuenta): no se piden los $100 otra vez, solo que la cuenta siga activa (un trade en los últimos 7 días)
    if (claim && claim.uid === who.uid && (claim.inf || (!claim.chk && !claim.trial))) { // (los que ya tenían Infinity antes de esta regla también renuevan así)
      const a = await bingxRecentTrade(env, bx, 7, fetchFn, now); if (!a.ok) return json({ok: false, invited: true, error: a.msg || 'BingX no respondió; inténtalo en un rato'}, 502);
      if (a.traded) {
        await S.mset('bx:' + bx, Object.assign({}, claim, {chk: now, bal}));
        const tier = await syncPlan(sa, who.uid, {refTier: 'infinity', bx, bxOk: now, refEnd: now + 31 * 864e5, bxBal: bal}, fetchFn);
        return json({ok: true, invited: true, renewed: true, tier, refEnd: now + 31 * 864e5});
      }
      const cur = await fsGet(sa, 'plans/' + who.uid, fetchFn), left = cur && +cur.refEnd > now ? +cur.refEnd : 0; // sigue con Infinity hasta su fecha; después, hasta que vuelva a operar
      return json({ok: true, invited: true, inactive: true, tier: left ? 'infinity' : 'free', refEnd: left});
    }
    if (bal != null && bal >= MIN) {
      await S.mset('bx:' + bx, {uid: who.uid, at: (claim && claim.at) || now, chk: now, bal, trial: claim && claim.trial || 0, inf: now});
      const tier = await syncPlan(sa, who.uid, {refTier: 'infinity', bx, bxOk: now, refEnd: now + 31 * 864e5, bxBal: bal}, fetchFn);
      return json({ok: true, invited: true, tier, bal, min: MIN, refEnd: now + 31 * 864e5});
    }
    if (bal == null) return json({ok: false, invited: true, error: 'BingX no dio el saldo de tu cuenta; inténtalo en un rato'}, 502);
    const tr = await S.mget('trial:' + who.uid), used = !!(tr || (claim && claim.trial)), trialEnd = tr ? +tr.end || 0 : used ? 0 : now + 7 * 864e5; // la prueba se da una vez por cuenta y por UID
    if (!used) await S.mset('trial:' + who.uid, {end: trialEnd, bx});
    await S.mset('bx:' + bx, {uid: who.uid, at: (claim && claim.at) || now, chk: now, bal, trial: (claim && claim.trial) || now});
    const tier = await syncPlan(sa, who.uid, Object.assign({refTier: 'free', bx, bxBal: bal, refEnd: 0}, used ? {} : {trialTier: 'plus', trialEnd}), fetchFn);
    return json({ok: true, invited: true, need: true, bal, min: MIN, tier, trialEnd, trialUsed: !!used});
  }
  return json({error: 'No encontrado'}, 404);
}

/* ───────── Bóveda de claves de exchange ─────────
   Tu API Key y Secret se guardan en tu cuenta CIFRADOS (AES-256-GCM) con una llave que solo vive en este servidor y atados a tu uid:
   en Firestore ya no queda la clave en texto plano (ni la ven los procesos automáticos ni nadie que viera la base).
   Para abrirlos hay que tener tu sesión de Google verificada. */
let vaultMem = null;
function vaultKey(env) {
  if (vaultMem && vaultMem.kv === env.KV) return vaultMem.p;
  const p = (async () => {
    let raw = env.VAULT_KEY || await env.KV.get('vault');
    if (!raw) { raw = b64u(crypto.getRandomValues(new Uint8Array(32))); await env.KV.put('vault', raw); }
    return crypto.subtle.importKey('raw', unb64u(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
  })();
  vaultMem = {kv: env.KV, p}; p.catch(() => { if (vaultMem && vaultMem.p === p) vaultMem = null; }); return p;
}
export async function vaultRoute(env, path, b, json, fetchFn = fetch) {
  const who = await verifyIdToken(b.idToken, {fetchFn}); if (!who) return json({ok: false, error: 'Sesión no válida', login: true}, 401);
  if (!allowHit('vault:' + who.uid, 20, 60e3)) return json({ok: false, error: 'Demasiadas consultas; espera un minuto'}, 429);
  const key = await vaultKey(env), aad = enc.encode('vortex-vault-v1:' + who.uid);
  if (path === '/vault/seal') {
    const data = typeof b.data === 'string' ? b.data : ''; if (!data || data.length > 8000) return json({ok: false, error: 'Datos inválidos'}, 400);
    const iv = crypto.getRandomValues(new Uint8Array(12)), ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad}, key, enc.encode(data));
    return json({ok: true, box: 'v1.' + b64u(iv) + '.' + b64u(ct)});
  }
  const m = /^v1\.([\w-]{16})\.([\w-]{20,12000})$/.exec(String(b.box || '')); if (!m) return json({ok: false, error: 'Caja inválida'}, 400);
  try { const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64u(m[1]), additionalData: aad}, key, unb64u(m[2])); return json({ok: true, data: new TextDecoder().decode(pt)}); }
  catch { return json({ok: false, error: 'No se pudo abrir (¿otra cuenta?)'}, 403); }
}

/* ───────── Nova Bot Lab: avisos de tus bots con la app cerrada ─────────
   El paper trading de tus bots corre cada hora en GitHub Actions (scripts/botlab-retrain.js). Cuando un bot compra, vende o cierra,
   el script llama aquí con la llave BOT_PUSH_KEY (secreto del Worker que se deriva de FIREBASE_SERVICE_ACCOUNT al publicarlo)
   y se avisa a los celulares en los que iniciaste sesión con esa cuenta (la app manda tu uid al registrar el celular). */
export function sameKey(a, b) { a = String(a || ''); b = String(b || ''); if (!a || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }
async function botPush(req, env) {
  let b; try { b = JSON.parse((await req.text()).slice(0, 20000)); } catch { return J({error: 'JSON inválido'}, 400); }
  if (!env.BOT_PUSH_KEY || !sameKey(b && b.key, env.BOT_PUSH_KEY)) return J({error: 'No autorizado'}, 401);
  const uid = String(b.uid || ''); if (!/^[A-Za-z0-9]{10,64}$/.test(uid)) return J({error: 'uid inválido'}, 400);
  const msgs = (Array.isArray(b.msgs) ? b.msgs : []).slice(0, 6).map(m => ({title: String(m.title || 'VORTEX').slice(0, 80), body: String(m.body || '').slice(0, 300), tag: String(m.tag || 'bot').slice(0, 80), url: APP_URL + '#bots'})).filter(m => m.body);
  if (!msgs.length) return J({ok: true, sent: 0});
  const S = storeOf(env); let sent = 0, devices = 0;
  for (const [id, d] of await S.getMany(await S.ids('uid', uid))) { // solo los celulares donde esa cuenta inició sesión (uid verificado)
    if (!d || !d.sub || d.uid !== uid || d.bots === false) continue; devices++;
    try { const sts = (await self(env, '/int/push', {id, sub: d.sub, msgs})).sts || []; sent += sts.filter(x => x >= 200 && x < 300).length; } catch (e) { console.warn('bot-push', e.message); }
  }
  return J({ok: true, devices, sent});
}

/* ───────── Screener calculado por el Motor del servidor (GitHub Actions) ─────────
   Binance bloquea las IP de Cloudflare, así que el Screener lo calcula el Motor (scripts/motor.js) con los mismos datos que la app.
   Antes de mandarlo a Discord llama aquí: si la franja ya salió, contesta skip (no se duplica); si no, la aparta, avisa a los
   celulares que activaron las señales y le pasa las señales al radar de Nexus Pixel. */
async function scrExt(req, env) {
  let b; try { b = JSON.parse((await req.text()).slice(0, 200000)); } catch { return J({error: 'JSON inválido'}, 400); }
  if (!env.BOT_PUSH_KEY || !sameKey(b && b.key, env.BOT_PUSH_KEY)) return J({error: 'No autorizado'}, 401);
  const tf = b.tf === '4h' ? '4h' : '1h', now = Date.now(), slot = SCR.slotOf(tf, now);
  if (+b.slot !== slot) return J({ok: false, why: 'franja vencida'});
  const st = (await env.KV.get('scr', 'json')) || {};
  if ((+st[tf] || 0) >= slot) return J({ok: true, skip: 'ya enviado'});
  const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 60).filter(r => r && /^[A-Z0-9]{2,20}$/.test(r.symbol) && r.sg && typeof r.sg === 'object')
    .map(r => ({symbol: r.symbol, price: +r.price || 0, sg: {side: r.sg.side === 'buy' ? 'buy' : 'sell', range: !!r.sg.range, div: !!r.sg.div, score: +r.sg.score || 0, age: +r.sg.age || 1, ago: +r.sg.ago || 0}}));
  st[tf] = slot; st.lock = 0; st.err = null; st.last = Object.assign(st.last || {}, {[tf]: {at: now, n: rows.length, of: +b.of || 0, discord: rows.length > 0, pushed: 0, by: 'motor'}});
  await env.KV.put('scr', JSON.stringify(st));
  let pushed = 0, radar = null;
  if (rows.length) { try { const t = SCR.pushText(tf, rows); pushed = (await self(env, '/scr/push', {tf, msg: {title: t.title, body: t.body, tag: 'scr-' + tf, url: APP_URL + '#screener'}})).sent; } catch (e) { console.error('push', e.message); } }
  if (pushed) { st.last[tf].pushed = pushed; await env.KV.put('scr', JSON.stringify(st)); }
  try { radar = await self(env, '/radar/run', {tf, now, rows: rows.map(r => ({symbol: r.symbol, sg: r.sg}))}); } catch (e) { radar = {error: e.message}; }
  return J({ok: true, claimed: true, pushed, radar: radar && (radar.error || 'ok')});
}

/* ───────── Alertas con indicador con la app cerrada (las calcula scripts/ind-alerts.js en GitHub Actions) ───────── */
async function indRoute(req, env, path) {
  let b; try { b = JSON.parse((await req.text()).slice(0, 400000)); } catch { return J({error: 'JSON inválido'}, 400); }
  if (!env.BOT_PUSH_KEY || !sameKey(b && b.key, env.BOT_PUSH_KEY)) return J({error: 'No autorizado'}, 401);
  const S = storeOf(env);
  if (path === '/ind/jobs') { // alertas encendidas de cada celular (con el uid verificado de la cuenta para leer sus scripts Pine), por páginas
    const all = await S.ids('ind'), from = Math.max(0, +b.from || 0), lim = b.from == null ? all.length : Math.min(150, Math.max(1, +b.limit || 100));
    const devs = []; for (const [id, d] of await S.getMany(all.slice(from, from + lim))) { if (!d || !d.sub) continue; const alerts = (d.ind || []).filter(a => a.on); if (alerts.length) devs.push({dev: id, uid: d.uid || '', alerts}); }
    return J({ok: true, devs, next: from + lim < all.length ? from + lim : null, total: all.length, now: Date.now()});
  }
  // /ind/report: {results: [{dev, id, lastBar, hit, info}]} → se reparte por dispositivo en tandas (cada una guarda la vela revisada y avisa)
  const by = new Map(); for (const r of (Array.isArray(b.results) ? b.results : []).slice(0, 2000)) if (r && typeof r.dev === 'string') (by.get(r.dev) || by.set(r.dev, []).get(r.dev)).push(r);
  const ids = [...by.keys()]; if (!ids.length) return J({ok: true, fired: 0, sent: 0});
  const res = await fanout(env, ids, PUSH_BATCH, '/int/indbatch', {rs: Object.fromEntries(by)});
  return J({ok: true, fired: sumOf(res, 'fired'), sent: sumOf(res, 'sent')});
}
async function indBatch(env, b) {
  const S = storeOf(env), now = Date.now(), all = b.rs || {}; let sent = 0, fired = 0; const changedList = [];
  for (const [id, d] of await S.getMany((b.ids || []).slice(0, 40))) {
    if (!d || !d.sub) continue; const rs = Array.isArray(all[id]) ? all[id] : [], msgs = [], dc = []; let changed = false;
    for (const r of rs) {
      const a = (d.ind || []).find(x => x.id === r.id); if (!a || !a.on || !(+r.lastBar > (a.lastBar || 0))) continue; // la app ya revisó esa vela (o la alerta se apagó)
      if (!r.hit) { if (+r.lastBar - (a.lastBar || 0) > 6 * 3600e3) { a.lastBar = +r.lastBar; changed = true; } continue; } // sin aviso: solo se anota de vez en cuando (pocas escrituras)
      a.lastBar = +r.lastBar; a.firedAt = now; a.firedInfo = String(r.info || '').slice(0, 200); if (a.repeat === 'once') a.on = false; changed = true; fired++;
      const text = `${baseOf(a.symbol)} ${a.interval} · ${a.label}${a.firedInfo ? ' · ' + a.firedInfo : ''}${a.note ? ' · ' + a.note : ''}`, n = a.notify || 'both';
      if (n !== 'discord' && d.indOn !== false) msgs.push({title: 'VORTEX · Alerta', body: text, tag: 'in-' + a.id, url: APP_URL + '#alerts'});
      if (n !== 'app' && dcAllow(d, 'ind')) dc.push(text);
    }
    if (msgs.length) { try { const sts = (await self(env, '/int/push', {id, sub: d.sub, msgs})).sts || []; sent += sts.filter(x => x >= 200 && x < 300).length; } catch (e) { console.warn('ind push', e.message); } }
    if (dc.length) { const hook = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\//.test(d.dcUrl || '') ? d.dcUrl : String(env.DISCORD_WEBHOOK || '').trim(); if (hook) for (const m of dc.slice(0, 2)) { try { await fetch(hook, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({username: 'VORTEX', embeds: [{title: 'Alerta con indicador', description: m, color: 0xb07cff}]})}); } catch {} } }
    if (changed) { d.updated = now; changedList.push([id, d]); }
  }
  if (changedList.length) await S.putMany(changedList);
  return {fired, sent};
}

/* ───────── Screener programado (ver worker/screener.mjs) ───────── */
const J = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json'}});
let intMem = null; // en memoria: no se lee el KV en cada llamada interna
function intToken(env) { // una sola promesa por instancia: varias llamadas a la vez no crean tokens distintos
  if (intMem && intMem.kv === env.KV) return intMem.p;
  const p = (async () => { let t = await env.KV.get('int'); if (!t) { t = b64u(crypto.getRandomValues(new Uint8Array(24))); await env.KV.put('int', t); } return t; })();
  intMem = {kv: env.KV, p}; p.catch(() => { if (intMem && intMem.p === p) intMem = null; }); return p;
}
// llamada interna: por el enlace a sí mismo (cada llamada tiene su propio límite de CPU); si no existe, en la misma ejecución
async function self(env, path, body) {
  const tok = await intToken(env), init = {method: 'POST', headers: {'content-type': 'application/json', 'x-vx-int': tok}, body: JSON.stringify(body || {})};
  const r = env.SELF ? await env.SELF.fetch('https://vortex-push.internal' + path, init) : await scrInternal(new Request('https://x' + path, init), env, path);
  if (!r.ok) throw new Error(path + ' HTTP ' + r.status); return r.json();
}
async function scrKick(env, now = Date.now()) {
  const st = (await env.KV.get('scr', 'json')) || {}, tf = SCR.dueTf(st, now); if (!tf) return null;
  if (st.lock && now - st.lock < 4 * 6e4) return null; // otra ronda ya está trabajando
  st.lock = now; st.kick = {at: now, tf}; await env.KV.put('scr', JSON.stringify(st));
  try { return await self(env, '/scr/run', {tf, now}); }
  catch (e) { const s2 = (await env.KV.get('scr', 'json')) || st; s2.lock = 0; s2.err = {at: Date.now(), tf, why: 'run: ' + String(e && e.message || e).slice(0, 200)}; await env.KV.put('scr', JSON.stringify(s2)); throw e; }
}
async function pool(items, n, fn) { const out = []; let k = 0; await Promise.all(Array.from({length: Math.min(n, items.length)}, async () => { while (k < items.length) { const i = k++; out[i] = await fn(items[i]).catch(e => ({error: e.message})); } })); return out; }
async function scrInternal(req, env, path) {
  if (!sameKey(req.headers.get('x-vx-int'), await intToken(env))) return J({error: 'No autorizado'}, 403);
  let b = {}; try { b = await req.json(); } catch {}
  const tf = b.tf === '4h' ? '4h' : '1h', now = +b.now || Date.now();
  if (path === '/int/dom') return J(await domRun(env, now));
  if (path === '/int/push') { // manda los avisos de UN dispositivo (la suscripción viene en la llamada; si no, se lee)
    const sub = (b.sub && sanSub(b.sub)) || ((await storeOf(env).get(String(b.id || ''))) || {}).sub; if (!sub) return J({sts: [404]});
    const v = await vapidKeys(env), sts = []; for (const m of (b.msgs || []).slice(0, 8)) { try { const st = await sendPush(sub, m, v); sts.push(st); if (st === 404 || st === 410) break; } catch (e) { sts.push('err: ' + String(e.message).slice(0, 60)); } }
    return J({sts});
  }
  if (path === '/int/tickbatch') return J(await tickBatch(env, b));
  if (path === '/int/tickgroup') { const res = await pool(chunkArr(b.ids || [], TICK_BATCH), 6, ids => self(env, '/int/tickbatch', {ids, prices: b.prices, moves: b.moves, now: b.now})); return J({res}); }
  if (path === '/int/indbatch') return J(await indBatch(env, b));
  if (path === '/int/fan') { if (!FAN_PATHS.has(b.path)) return J({error: 'ruta'}, 400); const res = await pool(chunkArr(b.ids || [], Math.max(1, +b.size || PUSH_BATCH)), 6, ids => self(env, b.path, {...(b.extra || {}), ids})); return J({res}); }
  if (path === '/int/pushmany') { // un mismo aviso a una tanda de dispositivos
    const S = storeOf(env), v = await vapidKeys(env), gone = []; let sent = 0;
    for (const [id, d] of await S.getMany((b.ids || []).slice(0, 40))) { if (!d || !d.sub) continue; try { const s0 = await sendPush(d.sub, b.msg, v); if (s0 < 300) sent++; else if (s0 === 404 || s0 === 410) gone.push(id); } catch {} }
    if (gone.length) await S.delMany(gone);
    return J({sent, gone: gone.length});
  }
  if (path === '/radar/push') { // grandes oportunidades: solo a los celulares que encendieron el radar
    const res = await fanout(env, await storeOf(env).ids('radar'), PUSH_BATCH, '/int/pushmany', {msg: b.msg});
    return J({sent: sumOf(res, 'sent')});
  }
  if (path.startsWith('/radar/')) {
    const h = {self: (p, body) => self(env, p, body), pool, appUrl: APP_URL, aiKey: () => aiKey(env),
      anyRadarDc: async () => { const S = storeOf(env); for (const part of chunkArr(await S.ids('radar'), 30)) for (const [, d] of await S.getMany(part)) if (d && d.radar && dcAllow(d, 'on')) return true; return false; },
      anyRadar: async () => storeOf(env).any('radar'),
      discord: async (t, op) => { if (!(await h.anyRadarDc())) return false; return SCR.postDiscord(String(env.DISCORD_WEBHOOK || '').trim(), [{title: '🛰️ ' + t.title, description: t.body + '\n_Radar de Nexus Pixel · no es asesoría financiera._', color: op.side === 'buy' ? 0x089981 : 0xf23645, timestamp: new Date().toISOString()}]); }};
    try { const r = await radarInternal(path, b, env, h); return r ? J(r) : J({error: 'No encontrado'}, 404); } catch (e) { return J({error: String(e && e.message || e).slice(0, 200)}, 500); }
  }
  if (path === '/scr/top') return J({top: await SCR.topSymbols(SCR.TOP_N)});
  if (path === '/scr/chunk') { // unas cuantas monedas por llamada para no pasar los 10 ms de CPU
    const rows = [], fail = [];
    for (const t of (b.syms || []).slice(0, 6)) { try { const sg = await SCR.scanOne(t.symbol, tf, now); if (sg) rows.push({symbol: t.symbol, price: Number.isFinite(sg.price) ? sg.price : t.price, sg}); } catch (e) { fail.push(t); } }
    return J({rows, fail});
  }
  if (path === '/scr/push') { // notificación a los celulares que activaron las señales del Screener (en tandas: aguanta miles)
    const res = await fanout(env, await storeOf(env).ids('scr', tf), PUSH_BATCH, '/int/pushmany', {msg: b.msg});
    return J({sent: sumOf(res, 'sent')});
  }
  if (path === '/scr/run') {
    const st = (await env.KV.get('scr', 'json')) || {}, slot = SCR.slotOf(tf, now);
    const release = async (why) => { st.lock = 0; st.err = {at: Date.now(), tf, why}; await env.KV.put('scr', JSON.stringify(st)); return J({ok: false, why}); };
    if ((+st[tf] || 0) >= slot) return J({ok: true, skip: 'ya enviado'});
    let top, c = await env.KV.get('scrtop', 'json'); // la lista del top se guarda 3 h (leerla de Binance es lo que más CPU gasta)
    if (c && Date.now() - c.at < 3 * 36e5 && Array.isArray(c.top) && c.top.length >= 10) top = c.top;
    else { try { top = (await self(env, '/scr/top', {tf})).top; if (top && top.length >= 10) await env.KV.put('scrtop', JSON.stringify({at: Date.now(), top})); } catch (e) { return release('top: ' + e.message); } }
    if (!top || top.length < 10) return release('top vacío');
    const chunks = []; for (let i = 0; i < top.length; i += SCR.CHUNK) chunks.push(top.slice(i, i + SCR.CHUNK));
    const res = await pool(chunks, 6, c => self(env, '/scr/chunk', {tf, now, syms: c}));
    let rows = [], retry = [];
    res.forEach((r, i) => { if (r && !r.error) { rows.push(...r.rows); retry.push(...r.fail); } else retry.push(...chunks[i]); });
    if (retry.length) { const r2 = await pool(retry.map(t => [t]), 6, c => self(env, '/scr/chunk', {tf, now, syms: c})); r2.forEach((r, i) => { if (r && !r.error) { rows.push(...r.rows); if (r.fail.length) retry[i] = null; else retry[i] = 'ok'; } }); }
    const failed = retry.filter(x => x !== 'ok').length, done = top.length - failed;
    if (done < top.length * .6) return release(`solo ${done}/${top.length} monedas`);
    SCR.sortRows(rows);
    let discord = false, pushed = 0;
    if (rows.length) {
      try { discord = await SCR.postDiscord(String(env.DISCORD_WEBHOOK || '').trim(), SCR.F.signalEmbeds(tf, rows, top.map(t => t.symbol))); } catch (e) { console.error('discord', e.message); }
      try { const t = SCR.pushText(tf, rows); pushed = (await self(env, '/scr/push', {tf, msg: {title: t.title, body: t.body, tag: 'scr-' + tf, url: APP_URL + '#screener'}})).sent; } catch (e) { console.error('push', e.message); }
    }
    st[tf] = slot; st.lock = 0; st.err = null; st.last = Object.assign(st.last || {}, {[tf]: {at: Date.now(), n: rows.length, of: done, discord, pushed}});
    await env.KV.put('scr', JSON.stringify(st));
    let radar = null; try { radar = await self(env, '/radar/run', {tf, now, rows: rows.map(r => ({symbol: r.symbol, sg: r.sg}))}); } catch (e) { radar = {error: e.message}; } // el radar revisa lo que encontró el Screener
    return J({ok: true, tf, n: rows.length, of: done, discord, pushed, radar});
  }
  return J({error: 'No encontrado'}, 404);
}
export {scrKick, scrInternal};

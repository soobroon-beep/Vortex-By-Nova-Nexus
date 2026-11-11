// VORTEX · Notificaciones push con la app CERRADA (Cloudflare Worker gratuito).
// Cada minuto (cron) revisa tus alertas de precio y los movimientos bruscos del top 5 con precios de Binance
// y, si alguna se cumple, manda una notificación Web Push a tu celular aunque VORTEX no esté abierta.
// · La app le manda tus alertas y la suscripción de tu celular a /sync (solo alertas de PRECIO; las de indicador siguen en la app).
// · Las claves VAPID se crean solas la primera vez y se guardan en el KV: no hay secretos que configurar.
// · Solo escribe en el KV cuando algo cambia (el plan gratis permite 1000 escrituras al día).
// Se publica solo con .github/workflows/deploy-push-worker.yml (configuración en worker/wrangler-push.toml). Plan Infinity: secretos BINGX_AGENT_KEY / BINGX_AGENT_SECRET.

import * as SCR from './screener.mjs';
import {radarInternal, loadState as radarState} from './radar-server.mjs';
import DOM from '../dominance-core.js';
const DEFAULT_ORIGINS = 'https://soobroon-beep.github.io,https://vortex-nexus.pages.dev,https://dev.vortex-nexus.pages.dev';
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api1.binance.com'];
const MOVE_TOP = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT'];
const MOVE_WIN = [[5, '5 min', 1], [60, '1 h', 2.5]], MOVE_COOL = 15 * 60000;
const MAX_ALERTS = 50, MAX_DEVICES = 20, APP_URL = 'https://vortex-nexus.pages.dev/';

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
    const d = j.data || {}; return {ok: true, invited: d.inviteResult === true || d.inviteResult === 'true', deposit: !!d.deposit, trade: !!d.trade};
  } catch { return {ok: false, invited: false, msg: 'BingX sin respuesta'}; }
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
  if (!a || typeof a.id !== 'string' || a.id.length > 40 || a.kind === 'ind' || !/^[A-Z0-9]{2,20}(@[a-z]{2,12})?$/.test(a.symbol)) return null; // BTCUSDT (Binance) o BTCUSDT@bybit, HYPEUSDT@binancef…
  if (!(+a.price > 0) || (a.dir !== 'up' && a.dir !== 'down')) return null;
  const o = {id: a.id, symbol: a.symbol, on: a.on !== false, price: +a.price, dir: a.dir, note: String(a.note || '').slice(0, 140), firedAt: +a.firedAt || 0, firedPrice: Number.isFinite(+a.firedPrice) && a.firedPrice !== null ? +a.firedPrice : null};
  if (a.cond === 'up' || a.cond === 'down') o.cond = a.cond;
  if (a.repeat === 'every') o.repeat = 'every'; if (a.wait === true) o.wait = true;
  if (+a.exp > 0) o.exp = Math.round(+a.exp); if (a.expired === true) o.expired = true;
  if (['app', 'discord', 'both'].includes(a.notify)) o.notify = a.notify;
  return o;
}
export function sanScr(x) { const q = x && typeof x === 'object' ? x : {}; return {on: q.on === true, h1: q.h1 !== false, h4: q.h4 !== false}; }
export function sanMove(m) { const q = m && typeof m === 'object' ? m : {}; return {on: q.on !== false, pct: Math.max(0.5, Math.min(25, +q.pct || 2))}; }
function sanSub(s) {
  if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000) return null;
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
    if (a.notify === 'discord' || a.notify === 'both' || a.dc) dc.push(`${baseOf(a.symbol)} ${dir0 === 'up' ? 'subió a' : 'bajó a'} ${fmt(a.price)} (ahora ${fmt(price)})${a.note ? ' · ' + a.note : ''}`); // Discord también con la app cerrada
    if (priceOn && a.notify !== 'discord') fired.push({title: 'VORTEX · Alerta', body: `${baseOf(a.symbol)} ${dir0 === 'up' ? 'subió a' : 'bajó a'} ${fmt(a.price)} (ahora ${fmt(price)})${a.note ? ' · ' + a.note : ''}`, tag: 'al-' + a.id, url: APP_URL + '#alerts'});
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
async function vapidKeys(env) {
  let v = await env.KV.get('vapid', 'json');
  if (!v) {
    const kp = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
    v = {pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), jwk: await crypto.subtle.exportKey('jwk', kp.privateKey)};
    await env.KV.put('vapid', JSON.stringify(v));
  }
  return v;
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
async function getJSON(path) {
  let err; for (const h of HOSTS) { try { const r = await fetch(h + path, {headers: {'user-agent': 'VORTEX-Push/1.0'}}); if (r.ok) return await r.json(); err = new Error(h + ' HTTP ' + r.status); } catch (e) { err = e; } }
  throw err;
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

/* ───────── ronda programada ───────── */
async function tick(env, now = Date.now()) {
  const ids = (await env.KV.get('devs', 'json')) || []; if (!ids.length) return {devices: 0};
  const devs = (await Promise.all(ids.map(id => env.KV.get('dev:' + id, 'json').then(d => d && d.sub ? [id, d] : null)))).filter(Boolean);
  if (!devs.length) return {devices: 0};
  const needPrices = devs.some(([, d]) => (d.alerts || []).some(a => a.on)), needMoves = devs.some(([, d]) => d.move && d.move.on);
  const spot = [...new Set(devs.flatMap(([, d]) => (d.alerts || []).filter(a => a.on && !a.symbol.includes('@')).map(a => a.symbol)))];
  const prices = needPrices ? await spotPrices(spot).catch(() => ({})) : {};
  if (needPrices) { const other = [...new Set(devs.flatMap(([, d]) => (d.alerts || []).filter(a => a.on && a.symbol.includes('@')).map(a => a.symbol)))]; if (other.length) Object.assign(prices, await otherPrices(other).catch(() => ({}))); }
  const moves = {}; if (needMoves) await Promise.all(MOVE_TOP.map(s => closes1m(s).then(c => { moves[s] = c; }).catch(() => {})));
  let sent = 0, gone = [];
  { const hb = (await env.KV.get('hb', 'json')) || {}; if (now - (hb.at || 0) > 15 * 6e4) await env.KV.put('hb', JSON.stringify({at: now, devices: devs.length})); } // latido: la app puede ver que el servidor sí está revisando
  for (const [id, d] of devs) {
    const msgs = [], r = evalAlerts(d.alerts || [], prices, now, d.priceOn !== false); msgs.push(...r.fired); let changed = r.changed;
    if (r.dc.length && d.priceOn !== false) { const hook = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\//.test(d.dcUrl || '') ? d.dcUrl : String(env.DISCORD_WEBHOOK || '').trim(); if (hook) for (const m of r.dc.slice(0, 5)) { try { await fetch(hook, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({username: 'VORTEX', embeds: [{title: 'Alerta de precio', description: m, color: 0x548fff}]})}); } catch (e) { console.warn('discord', e.message); } } }
    if (d.move && d.move.on) { d.moveLast = d.moveLast || {}; for (const s of MOVE_TOP) if (moves[s]) { const m = moveCheck(s, moves[s], d.move.pct, d.moveLast, now); if (m.length) { msgs.push(...m); changed = true; } } }
    if (d.testAt) { msgs.push({title: 'VORTEX · Prueba con la app cerrada', body: 'Si ves esto con VORTEX cerrada, tus avisos funcionan ✅', tag: 'test2', url: APP_URL + '#alerts'}); delete d.testAt; changed = true; }
    if (msgs.length) { // el cifrado de cada aviso corre en su propia llamada interna
      let sts = []; try { sts = (await self(env, '/int/push', {id, msgs: msgs.slice(0, 8)})).sts || []; } catch (e) { sts = ['err: ' + String(e.message).slice(0, 60)]; }
      sent += sts.filter(x => x >= 200 && x < 300).length; if (sts.some(x => x === 404 || x === 410)) gone.push(id);
      d.lastPush = {at: now, st: sts[sts.length - 1], n: msgs.length, title: String(msgs[0].title || '').slice(0, 60)}; changed = true;
    }
    if (changed) { d.updated = now; await env.KV.put('dev:' + id, JSON.stringify(d)); }
  }
  if (gone.length) { // suscripción vencida (se desinstaló la app o se quitó el permiso)
    for (const id of gone) await env.KV.delete('dev:' + id);
    await env.KV.put('devs', JSON.stringify(ids.filter(x => !gone.includes(x))));
  }
  return {devices: devs.length, sent, gone: gone.length};
}

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
async function aiKey(env) { return env.POLLEN_KEY || (await env.KV.get('ai:pollen')) || POLLEN_KEY; }
async function aiRoute(req, env, path, json, cors) {
  if (path === '/ai/status') return json({ok: true, ready: !!(await aiKey(env))});
  if (path === '/ai/key' && req.method === 'POST') {
    let b; try { b = JSON.parse(await req.text()); } catch { return json({error: 'JSON inválido'}, 400); }
    const k = String(b.key || '').trim(); if (!/^sk_[\w-]{10,}$/.test(k) || await sha256(k) !== AI_KEY_HASH) return json({error: 'Esa no es la clave autorizada para este servidor'}, 403);
    await env.KV.put('ai:pollen', k); return json({ok: true, ready: true});
  }
  const key = await aiKey(env); if (!key) return json({error: 'El servidor aún no tiene la clave de IA', kind: 'nokey'}, 503);
  if (!aiAllowed(req.headers.get('cf-connecting-ip') || 'x')) return json({error: 'Demasiadas consultas seguidas; espera un minuto'}, 429);
  if (path === '/ai/models') { const r = await fetch(AI_MODELS, {headers: {authorization: 'Bearer ' + key}}); return new Response(r.body, {status: r.status, headers: {...cors, 'content-type': 'application/json', 'cache-control': 'max-age=1800'}}); }
  if (path === '/ai' && req.method === 'POST') {
    const raw = await req.text(); if (raw.length > AI_MAX_BODY) return json({error: 'La consulta es demasiado grande'}, 413);
    let b; try { b = JSON.parse(raw); } catch { return json({error: 'JSON inválido'}, 400); }
    const want = String(b.model || 'openai'), model = AI_MODELS_OK.includes(want) ? want : 'openai'; // solo modelos de chat (nunca filtros tipo qwen3guard)
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
    if (req.method === 'POST' && path === '/plan/bingx') { // plan Infinity: ¿este UID abrió su cuenta de BingX con tu código? (API de afiliado; la llave nunca sale del servidor)
      let b; try { b = JSON.parse((await req.text()).slice(0, 400)); } catch { return json({error: 'JSON inválido'}, 400); }
      const r = await bingxInvite(env, b && b.uid); return json(r, r.error ? 400 : 200);
    }
    if (req.method !== 'POST') return json({error: 'Método no permitido'}, 405);
    const raw = await req.text(); if (raw.length > 60000) return json({error: 'Demasiado grande'}, 413);
    let b; try { b = JSON.parse(raw); } catch { return json({error: 'JSON inválido'}, 400); }
    const id = String(b.id || ''); if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) return json({error: 'id inválido'}, 400); // id aleatorio del dispositivo (hace de contraseña)
    const ids = (await env.KV.get('devs', 'json')) || [];
    if (path === '/sync') {
      if (b.off) { await env.KV.delete('dev:' + id); if (ids.includes(id)) await env.KV.put('devs', JSON.stringify(ids.filter(x => x !== id))); return json({ok: true, off: true}); }
      const cur = (await env.KV.get('dev:' + id, 'json')) || {};
      const sub = sanSub(b.sub) || cur.sub; if (!sub) return json({error: 'Falta la suscripción push'}, 400);
      if (b.subOnly) { if (!cur.sub) return json({ok: false, error: 'Dispositivo sin registrar'}, 404); cur.sub = sub; cur.updated = Date.now(); await env.KV.put('dev:' + id, JSON.stringify(cur)); if (!ids.includes(id)) await env.KV.put('devs', JSON.stringify([...ids, id])); return json({ok: true}); } // el celular renovó su suscripción: se conservan alertas y ajustes
      const incoming = (Array.isArray(b.alerts) ? b.alerts : []).map(sanAlert).filter(Boolean).slice(0, MAX_ALERTS);
      const m = mergeAlerts(incoming, cur.alerts, b.since);
      const d = {sub, lastPush: cur.lastPush, alerts: m.alerts, move: sanMove(b.move), scr: b.scr ? sanScr(b.scr) : sanScr(cur.scr), radar: b.radar == null ? !!cur.radar : b.radar === true, priceOn: b.priceOn !== false, dcUrl: typeof b.dcUrl === 'string' && b.dcUrl.length < 300 && /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/[\w/-]+$/.test(b.dcUrl) ? b.dcUrl : '', moveLast: cur.moveLast || {}, updated: cur.updated || Date.now()};
      const same = JSON.stringify({...d, updated: 0}) === JSON.stringify({...cur, updated: 0});
      if (!same) { d.updated = Date.now(); await env.KV.put('dev:' + id, JSON.stringify(d)); } // sin cambios no se escribe (el plan gratis permite 1000 escrituras al día)
      if (!ids.includes(id)) { if (ids.length >= MAX_DEVICES) return json({error: 'Demasiados dispositivos'}, 429); await env.KV.put('devs', JSON.stringify([...ids, id])); }
      const hb = (await env.KV.get('hb', 'json')) || {};
      return json({ok: true, back: m.back, now: Date.now(), srv: {hb: hb.at || 0, lastPush: cur.lastPush || null}});
    }
    if (path === '/pull') { const cur = await env.KV.get('dev:' + id, 'json'); return json({ok: true, active: !!cur, alerts: cur ? cur.alerts : [], now: Date.now()}); }
    if (path === '/test') {
      const cur = await env.KV.get('dev:' + id, 'json'); if (!cur || !cur.sub) return json({error: 'Este dispositivo no está registrado'}, 404);
      if (b.later) { cur.testAt = Date.now(); await env.KV.put('dev:' + id, JSON.stringify(cur)); return json({ok: true, later: true}); } // la manda la próxima revisión del servidor (≤1 min): da tiempo de cerrar la app
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
  }
};
export {tick, domKick, domRun};

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

/* ───────── Screener programado (ver worker/screener.mjs) ───────── */
const J = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {'content-type': 'application/json'}});
async function intToken(env) { let t = await env.KV.get('int'); if (!t) { t = b64u(crypto.getRandomValues(new Uint8Array(24))); await env.KV.put('int', t); } return t; }
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
  if (req.headers.get('x-vx-int') !== await intToken(env)) return J({error: 'No autorizado'}, 403);
  let b = {}; try { b = await req.json(); } catch {}
  const tf = b.tf === '4h' ? '4h' : '1h', now = +b.now || Date.now();
  if (path === '/int/dom') return J(await domRun(env, now));
  if (path === '/int/push') { // manda los avisos de UN dispositivo
    const d = await env.KV.get('dev:' + b.id, 'json'); if (!d || !d.sub) return J({sts: [404]});
    const v = await vapidKeys(env), sts = []; for (const m of (b.msgs || []).slice(0, 8)) { try { const st = await sendPush(d.sub, m, v); sts.push(st); if (st === 404 || st === 410) break; } catch (e) { sts.push('err: ' + String(e.message).slice(0, 60)); } }
    return J({sts});
  }
  if (path === '/radar/push') { // grandes oportunidades: solo a los celulares que encendieron el radar
    const ids = (await env.KV.get('devs', 'json')) || []; let sent = 0; const v = await vapidKeys(env);
    for (const id of ids) { const d = await env.KV.get('dev:' + id, 'json'); if (!d || !d.sub || !d.radar) continue; try { const s0 = await sendPush(d.sub, b.msg, v); if (s0 < 300) sent++; } catch {} }
    return J({sent});
  }
  if (path.startsWith('/radar/')) {
    const h = {self: (p, body) => self(env, p, body), pool, appUrl: APP_URL, aiKey: () => aiKey(env),
      anyRadar: async () => { const ids = (await env.KV.get('devs', 'json')) || []; for (const id of ids) { const d = await env.KV.get('dev:' + id, 'json'); if (d && d.radar) return true; } return false; },
      discord: (t, op) => SCR.postDiscord(String(env.DISCORD_WEBHOOK || '').trim(), [{title: '🛰️ ' + t.title, description: t.body + '\n_Radar de Nexus Pixel · no es asesoría financiera._', color: op.side === 'buy' ? 0x089981 : 0xf23645, timestamp: new Date().toISOString()}])};
    try { const r = await radarInternal(path, b, env, h); return r ? J(r) : J({error: 'No encontrado'}, 404); } catch (e) { return J({error: String(e && e.message || e).slice(0, 200)}, 500); }
  }
  if (path === '/scr/top') return J({top: await SCR.topSymbols(SCR.TOP_N)});
  if (path === '/scr/chunk') { // unas cuantas monedas por llamada para no pasar los 10 ms de CPU
    const rows = [], fail = [];
    for (const t of (b.syms || []).slice(0, 6)) { try { const sg = await SCR.scanOne(t.symbol, tf, now); if (sg) rows.push({symbol: t.symbol, price: Number.isFinite(sg.price) ? sg.price : t.price, sg}); } catch (e) { fail.push(t); } }
    return J({rows, fail});
  }
  if (path === '/scr/push') { // notificación a los celulares que activaron las señales del Screener
    const ids = (await env.KV.get('devs', 'json')) || []; let sent = 0; const v = await vapidKeys(env), msg = b.msg;
    for (const id of ids) { const d = await env.KV.get('dev:' + id, 'json'); if (!d || !d.sub || !d.scr || !d.scr.on || d.scr[tf === '1h' ? 'h1' : 'h4'] === false) continue; try { const s0 = await sendPush(d.sub, msg, v); if (s0 < 300) sent++; } catch {} }
    return J({sent});
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

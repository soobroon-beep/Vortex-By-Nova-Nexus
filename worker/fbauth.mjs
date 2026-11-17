/* VORTEX · Identidad verificada en el servidor (Cloudflare Worker).
   · verifyIdToken: comprueba que el token de sesión de Firebase (el que da el inicio de sesión con Google en la app) es auténtico,
     de este proyecto y vigente. Solo así el servidor sabe de verdad quién es la cuenta: el uid que mande la app por su cuenta NO se cree.
   · Firestore con la cuenta de servicio (secreto FB_SA del Worker): para escribir el plan verificado en plans/{uid}
     (las reglas no dejan que la app lo escriba) y leerlo. */

export const PROJECT = 'criptochart-bd774';
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const enc = new TextEncoder(), dec = new TextDecoder();

export const b64u = buf => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const unb64u = str => { const s = String(str).replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '='.repeat((4 - s.length % 4) % 4)); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

/* Llaves públicas de Google para los tokens de Firebase (se guardan en memoria el tiempo que Google indica, máx. 6 h) */
let jwks = null; // {at, ttl, keys: Map(kid → CryptoKey)}
export function _resetJwks() { jwks = null; }
async function keyFor(kid, fetchFn, now) {
  if (!jwks || now - jwks.at > jwks.ttl || !jwks.keys.has(kid)) {
    if (jwks && jwks.keys.has(kid) && now - jwks.at <= jwks.ttl) return jwks.keys.get(kid);
    if (jwks && !jwks.keys.has(kid) && now - jwks.at < 60e3) return null; // kid desconocido: no se vuelve a pedir la lista a cada rato
    const r = await fetchFn(JWKS_URL); if (!r.ok) throw new Error('Google JWKS HTTP ' + r.status);
    const j = await r.json(), m = /max-age=(\d+)/.exec(r.headers && r.headers.get ? r.headers.get('cache-control') || '' : '');
    const keys = new Map();
    for (const k of (j.keys || [])) { if (k.kty !== 'RSA' || !k.kid) continue; try { keys.set(k.kid, await crypto.subtle.importKey('jwk', {kty: 'RSA', n: k.n, e: k.e, alg: 'RS256', ext: true}, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify'])); } catch {} }
    jwks = {at: now, ttl: Math.min(6 * 3600e3, Math.max(60e3, (m ? +m[1] : 3600) * 1000)), keys};
  }
  return jwks.keys.get(kid) || null;
}

/* → {uid, email, emailVerified} o null si el token no es válido. Nunca lanza por un token malo (solo devuelve null). */
export async function verifyIdToken(token, {project = PROJECT, fetchFn = fetch, now = Date.now()} = {}) {
  try {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const parts = token.split('.'); if (parts.length !== 3) return null;
    const head = JSON.parse(dec.decode(unb64u(parts[0]))), p = JSON.parse(dec.decode(unb64u(parts[1])));
    if (head.alg !== 'RS256' || !head.kid) return null;
    const t = Math.floor(now / 1000), skew = 300;
    if (p.aud !== project || p.iss !== 'https://securetoken.google.com/' + project) return null;
    if (typeof p.sub !== 'string' || !p.sub || p.sub.length > 128) return null;
    if (!(p.exp > t - skew) || !(p.iat <= t + skew) || (p.auth_time != null && !(p.auth_time <= t + skew))) return null;
    const key = await keyFor(head.kid, fetchFn, now); if (!key) return null;
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64u(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    return {uid: p.sub, email: typeof p.email === 'string' ? p.email : '', emailVerified: p.email_verified === true};
  } catch { return null; }
}

/* ───────── Firestore con la cuenta de servicio ───────── */
export function saOf(env) {
  const raw = env && (env.FB_SA || env.FIREBASE_SERVICE_ACCOUNT); if (!raw) return null;
  try { const sa = typeof raw === 'string' ? JSON.parse(raw) : raw; return sa && sa.private_key && sa.client_email ? sa : null; } catch { return null; }
}
let tokCache = null;
export async function accessToken(sa, fetchFn = fetch, now = Date.now()) {
  if (tokCache && tokCache.exp - 120 > now / 1000 && tokCache.email === sa.client_email) return tokCache.tok;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['sign']);
  const iat = Math.floor(now / 1000), exp = iat + 3600;
  const unsigned = b64u(enc.encode(JSON.stringify({alg: 'RS256', typ: 'JWT'}))) + '.' + b64u(enc.encode(JSON.stringify({iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat, exp})));
  const jwt = unsigned + '.' + b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned)));
  const r = await fetchFn('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt});
  const j = await r.json(); if (!r.ok || !j.access_token) throw new Error('OAuth: ' + (j.error_description || j.error || r.status));
  tokCache = {tok: j.access_token, exp, email: sa.client_email}; return j.access_token;
}
export function encode(v) {
  if (v === null || v === undefined) return {nullValue: null};
  if (typeof v === 'boolean') return {booleanValue: v};
  if (typeof v === 'number') return Number.isInteger(v) ? {integerValue: String(v)} : {doubleValue: v};
  if (typeof v === 'string') return {stringValue: v};
  if (Array.isArray(v)) return {arrayValue: {values: v.map(encode)}};
  if (typeof v === 'object') { const fields = {}; for (const [k, x] of Object.entries(v)) if (x !== undefined) fields[k] = encode(x); return {mapValue: {fields}}; }
  return {stringValue: String(v)};
}
export function decode(v) {
  if (!v || typeof v !== 'object') return undefined;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = decode(x); return o; }
  return undefined;
}
const docUrl = (sa, path) => `https://firestore.googleapis.com/v1/projects/${sa.project_id || PROJECT}/databases/(default)/documents/${path}`;
export async function fsGet(sa, path, fetchFn = fetch) {
  const r = await fetchFn(docUrl(sa, path), {headers: {authorization: 'Bearer ' + await accessToken(sa, fetchFn)}});
  if (r.status === 404) return null; const j = await r.json(); if (!r.ok) throw new Error('Firestore get: ' + JSON.stringify(j.error || j).slice(0, 160));
  const o = {}; for (const [k, v] of Object.entries(j.fields || {})) o[k] = decode(v); return o;
}
/* Escribe (fusiona) solo los campos dados */
export async function fsMerge(sa, path, data, fetchFn = fetch) {
  const fields = {}; for (const [k, v] of Object.entries(data)) if (v !== undefined) fields[k] = encode(v);
  const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetchFn(docUrl(sa, path) + '?' + mask, {method: 'PATCH', headers: {authorization: 'Bearer ' + await accessToken(sa, fetchFn), 'content-type': 'application/json'}, body: JSON.stringify({fields})});
  if (!r.ok) { let j = {}; try { j = await r.json(); } catch {} throw new Error('Firestore write: ' + JSON.stringify(j.error || j).slice(0, 160)); }
  return true;
}

/* ───────── plan de cada cuenta en plans/{uid} ─────────
   Fuentes: by='creador' (lo pone pro-catalog para el dueño), refTier (Infinity por el referido de BingX, lo verifica vortex-push)
   y payTier + payEnd (plan pagado con Stripe, lo verifica vortex-pay). «tier» es el mejor vigente; las reglas de Firestore
   además revisan payEnd, así que un pago vencido deja de abrir el código PRO aunque nadie actualice el documento. */
export const PLAN_RANK = {free: 0, plus: 1, infinity: 2};
export function planTier(d, now = Date.now()) {
  if (!d) return 'free'; if (d.by === 'creador') return 'infinity';
  const ref = PLAN_RANK[d.refTier] ? d.refTier : 'free', pay = PLAN_RANK[d.payTier] && +d.payEnd > now - 864e5 ? d.payTier : 'free';
  return PLAN_RANK[pay] > PLAN_RANK[ref] ? pay : ref;
}
export async function syncPlan(sa, uid, patch, fetchFn = fetch) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('uid inválido');
  const cur = (await fsGet(sa, 'plans/' + uid, fetchFn)) || {}, tier = planTier(Object.assign({}, cur, patch));
  if (cur.tier === tier && Object.entries(patch).every(([k, v]) => JSON.stringify(cur[k]) === JSON.stringify(v))) return tier; // nada cambió: no se escribe
  await fsMerge(sa, 'plans/' + uid, Object.assign({}, patch, {tier, at: Date.now()}), fetchFn);
  return tier;
}

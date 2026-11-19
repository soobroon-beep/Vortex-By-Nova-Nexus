import {saOf, syncPlan} from './fbauth.mjs'; // plan pagado → plans/{uid} (Firestore, con la cuenta de servicio)
// VORTEX · Pagos de los planes Plus e Infinity (Cloudflare Worker «vortex-pay» + Stripe).
// · La app manda tu sesión de Google (token de Firebase); aquí se comprueba con las llaves públicas de Google: nadie puede pagar ni consultar por otra cuenta.
// · Cobro mensual automático en la moneda de tu país (MXN, USD, EUR…; ver «precio en la moneda de tu país») con Stripe Checkout (tarjeta de crédito/débito, Apple Pay, Google Pay). Se cancela cuando quieras.
// · Tu plan pagado lo dice SIEMPRE el servidor (se pregunta a Stripe), no lo guardado en el dispositivo.
// · Secretos del Worker (los pone .github/workflows/deploy-pay-worker.yml desde los secretos de GitHub):
//     STRIPE_SECRET_KEY      (obligatorio para cobrar; sk_test_… para probar, sk_live_… para cobrar de verdad)
//     STRIPE_WEBHOOK_SECRET  (lo crea solo el flujo: avisos instantáneos de Stripe; sin él igual funciona preguntando a Stripe)
// Precios: variables PRICE_PLUS y PRICE_INFINITY de worker/wrangler-pay.toml (pesos al mes).

const FB_PROJECT = 'criptochart-bd774';
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const STRIPE = 'https://api.stripe.com/v1', STRIPE_VER = '2024-06-20';
const DEFAULT_ORIGINS = 'https://vortex-nexus.pages.dev,https://dev.vortex-nexus.pages.dev,https://soobroon-beep.github.io';
export const PLANS = ['plus', 'infinity'];
const OK_STATUS = new Set(['active', 'trialing', 'past_due']); // past_due: Stripe reintenta el cobro unos días; mientras, se respeta el plan
const RANK = {free: 0, plus: 1, infinity: 2};
const STALE = 6 * 3600e3; // cada 6 h se vuelve a preguntar a Stripe (por si se canceló o falló el cobro y no llegó el aviso)

export const prices = env => ({plus: Math.max(10, Math.round(+env.PRICE_PLUS || 99)), infinity: Math.max(10, Math.round(+env.PRICE_INFINITY || 249))});

/* ───────── precio en la moneda de tu país ─────────
   El precio base está en pesos (MXN). Fuera de México se muestra y se COBRA en tu moneda: el precio en pesos se convierte con el tipo de cambio
   del día (se guarda 12 h) y se redondea a un precio «bonito» (4.99, 12.99, 21 900, 4 990…). El país lo da Cloudflare (req.cf.country).
   Monedas: MXN, USD, EUR, GBP, CAD, COP, CLP y PEN; cualquier otro país paga en dólares. Una vez que pagas, tu suscripción sigue en su moneda. */
const EURO = new Set('AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'.split(' '));
const BY_COUNTRY = {US: 'usd', PR: 'usd', EC: 'usd', SV: 'usd', PA: 'usd', CA: 'cad', GB: 'gbp', CO: 'cop', CL: 'clp', PE: 'pen'};
export const CURRENCIES = ['mxn', 'usd', 'eur', 'gbp', 'cad', 'cop', 'clp', 'pen'];
export function currencyOf(country) { const c = String(country || '').toUpperCase(); if (!c || c === 'MX') return 'mxn'; return EURO.has(c) ? 'eur' : BY_COUNTRY[c] || 'usd'; }
const FX0 = {usd: 18.6, eur: 21.6, gbp: 24.9, cad: 13.3, cop: 0.0049, clp: 0.0197, pen: 5.5}; // pesos por unidad (respaldo si no responde el tipo de cambio)
const ZERO_DEC = new Set(['clp']); // monedas sin centavos en Stripe
export const unitAmount = (cur, amt) => ZERO_DEC.has(cur) ? Math.round(amt) : Math.round(amt * 100);
export function nice(cur, v) {
  if (cur === 'clp') return Math.max(990, Math.round(v / 100) * 100 - 10);
  if (cur === 'cop') return Math.max(9900, Math.round(v / 1000) * 1000 - 100);
  return Math.max(0.99, Math.round(v) - 0.01);
}
async function fxRates(env, fetchFn) {
  try { const c = env.KV && await env.KV.get('pay:fx', 'json'); if (c && Date.now() - c.at < 12 * 3600e3) return c.r; } catch {}
  try {
    const r = await fetchFn('https://open.er-api.com/v6/latest/MXN'), j = await r.json(), out = {};
    for (const k of Object.keys(FX0)) { const per = j && j.rates && +j.rates[k.toUpperCase()]; if (per > 0) out[k] = 1 / per; }
    if (Object.keys(out).length === Object.keys(FX0).length) { try { await env.KV.put('pay:fx', JSON.stringify({at: Date.now(), r: out})); } catch {} return out; }
  } catch {}
  return FX0;
}
export function localPrices(env, cur, fx) {
  const pr = prices(env); if (!cur || cur === 'mxn' || !fx || !fx[cur]) return {currency: 'mxn', plus: pr.plus, infinity: pr.infinity};
  return {currency: cur, plus: nice(cur, pr.plus / fx[cur]), infinity: nice(cur, pr.infinity / fx[cur])};
}

/* ───────── sesión de Google (token de Firebase) ───────── */
const unb64u = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); const b = atob(s + '='.repeat((4 - s.length % 4) % 4)); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; };
const jsonPart = s => JSON.parse(new TextDecoder().decode(unb64u(s)));
let jwkCache = null;
async function googleKeys(fetchFn, force) {
  if (!force && jwkCache && jwkCache.exp > Date.now()) return jwkCache.keys;
  const r = await fetchFn(JWK_URL); if (!r.ok) throw Error('Google sin respuesta');
  const j = await r.json(), m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  jwkCache = {keys: j.keys || [], exp: Date.now() + Math.min(6 * 3600e3, (m ? +m[1] : 3600) * 1000)}; return jwkCache.keys;
}
export async function verifyIdToken(tok, {fetchFn = fetch, now = Date.now(), project = FB_PROJECT, keys} = {}) {
  const p = String(tok || '').split('.'); if (p.length !== 3) throw Error('Sesión inválida');
  const h = jsonPart(p[0]), c = jsonPart(p[1]), t = now / 1000;
  if (h.alg !== 'RS256' || !h.kid) throw Error('Sesión inválida');
  if (c.aud !== project || c.iss !== 'https://securetoken.google.com/' + project) throw Error('Sesión de otra app');
  if (!(c.exp > t - 60) || !(c.iat < t + 300) || !c.sub || c.sub.length > 128) throw Error('Sesión vencida: vuelve a entrar');
  let list = keys || await googleKeys(fetchFn), jwk = list.find(k => k.kid === h.kid);
  if (!jwk && !keys) { list = await googleKeys(fetchFn, true); jwk = list.find(k => k.kid === h.kid); }
  if (!jwk) throw Error('Sesión inválida');
  const key = await crypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64u(p[2]), new TextEncoder().encode(p[0] + '.' + p[1]));
  if (!ok) throw Error('Sesión inválida');
  return {uid: c.sub, email: c.email_verified !== false ? String(c.email || '') : '', name: String(c.name || '')};
}

/* ───────── Stripe ───────── */
export function form(obj, pre = '', out = []) { // {a: {b: 1}, c: [x]} → a[b]=1&c[0]=x (formato que pide Stripe)
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue; const key = pre ? `${pre}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out.join('&');
}
function stripe(env, fetchFn = fetch) {
  const call = async (method, path, body) => {
    const r = await fetchFn(STRIPE + path, {method, headers: {authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'stripe-version': STRIPE_VER, 'content-type': 'application/x-www-form-urlencoded'}, body: body ? form(body) : undefined});
    const j = await r.json().catch(() => ({})); if (!r.ok) { const e = Error((j.error && j.error.message) || 'Stripe HTTP ' + r.status); e.status = r.status; throw e; } return j;
  };
  return {get: p => call('GET', p), post: (p, b) => call('POST', p, b || {}), del: p => call('DELETE', p)};
}
async function ensurePrices(env, S) { // crea (una sola vez) el producto y el precio mensual de cada plan; si cambias el precio se crea uno nuevo
  const pr = prices(env), out = {prod: {}};
  const keys = PLANS.map(k => `vortex_${k}_mxn_${pr[k]}`);
  const found = await S.get('/prices?active=true&limit=10&' + keys.map(k => 'lookup_keys[]=' + k).join('&'));
  for (const k of PLANS) {
    const lk = `vortex_${k}_mxn_${pr[k]}`, have = (found.data || []).find(p => p.lookup_key === lk);
    if (have) { out[k] = have.id; out.prod[k] = typeof have.product === 'string' ? have.product : have.product && have.product.id; continue; }
    const p = await S.post('/prices', {currency: 'mxn', unit_amount: pr[k] * 100, recurring: {interval: 'month'}, lookup_key: lk, transfer_lookup_key: 'true', metadata: {plan: k},
      product_data: {name: k === 'plus' ? 'VORTEX Plus' : 'VORTEX Infinity', metadata: {plan: k}}});
    out[k] = p.id; out.prod[k] = typeof p.product === 'string' ? p.product : p.product && p.product.id;
  }
  return out;
}

/* ───────── estado del plan pagado ───────── */
export function fromSub(s) { // suscripción de Stripe → lo que guarda VORTEX
  if (!s || !s.id) return null;
  const md = s.metadata || {}, item = s.items && s.items.data && s.items.data[0], pmd = (item && item.price && item.price.metadata) || {};
  const plan = PLANS.includes(md.plan) ? md.plan : PLANS.includes(pmd.plan) ? pmd.plan : 'plus';
  const end = (+s.current_period_end || (item && +item.current_period_end) || 0) * 1000;
  return {sub: s.id, cus: typeof s.customer === 'string' ? s.customer : s.customer && s.customer.id || '', plan, status: s.status, end, cancel: !!s.cancel_at_period_end, uid: md.uid || ''};
}
export function tierOf(rec, now = Date.now()) { return rec && OK_STATUS.has(rec.status) && rec.end > now - 864e5 ? rec.plan : 'free'; } // 1 día de gracia por el horario del cobro
const pub = (rec, env, loc) => ({...(loc ? {local: loc} : {}), ok: true, ready: !!env.STRIPE_SECRET_KEY, tier: tierOf(rec), status: rec ? rec.status : '', end: rec ? rec.end : 0, cancel: !!(rec && rec.cancel), plan: rec ? rec.plan : '', prices: prices(env)});
const best = list => list.map(fromSub).filter(Boolean).sort((a, b) => (OK_STATUS.has(b.status) - OK_STATUS.has(a.status)) || RANK[b.plan] - RANK[a.plan] || b.end - a.end)[0] || null;

async function refresh(env, S, uid, rec, sid) {
  let next = null;
  if (sid) { // regreso de la página de pago: la sesión de pago debe ser de ESTA cuenta
    const cs = await S.get('/checkout/sessions/' + encodeURIComponent(sid) + '?expand[]=subscription');
    if (cs.client_reference_id === uid && cs.subscription) next = fromSub(typeof cs.subscription === 'string' ? await S.get('/subscriptions/' + cs.subscription) : cs.subscription);
  }
  if (!next && rec && rec.sub) { try { next = fromSub(await S.get('/subscriptions/' + rec.sub)); } catch (e) { if (e.status !== 404) throw e; } if (next && next.uid && next.uid !== uid) next = null; }
  if (!next || !OK_STATUS.has(next.status)) { // ¿tiene otra suscripción activa con esta cuenta?
    const q = await S.get('/subscriptions/search?limit=10&query=' + encodeURIComponent(`metadata['uid']:'${uid}'`));
    next = best((q.data || []).filter(x => (x.metadata || {}).uid === uid)) || next; // solo las de ESTA cuenta
  }
  const out = Object.assign({}, next || {plan: '', status: '', end: 0, cancel: false, sub: '', cus: rec && rec.cus || ''}, {uid, at: Date.now()});
  if (!out.cus && rec && rec.cus) out.cus = rec.cus;
  return out;
}
const same = (a, b) => a && b && ['sub', 'cus', 'plan', 'status', 'end', 'cancel'].every(k => a[k] === b[k]);
async function store(env, uid, rec, prev) {
  if (!same(rec, prev) || !prev || Date.now() - (prev.at || 0) > STALE) await env.KV.put('pay:' + uid, JSON.stringify(rec)); // pocas escrituras
  // el plan pagado también va a plans/{uid} de Firestore: con eso Infinity puede abrir el código Nova Nexus PRO (lo exigen las reglas)
  const sa = saOf(env); if (sa && (!same(rec, prev) || !prev)) { try { await syncPlan(sa, uid, {payTier: tierOf(rec), payEnd: +rec.end || 0}); } catch (e) { console.error('plans/' + uid, e.message); } }
}

/* ───────── aviso de Stripe (webhook) ───────── */
export async function checkSig(raw, header, secret, now = Date.now(), tol = 300) {
  const parts = Object.fromEntries(String(header || '').split(',').map(x => x.split('=')).filter(x => x.length === 2).map(([k, v]) => [k.trim(), v]));
  const sigs = String(header || '').split(',').filter(x => x.startsWith('v1=')).map(x => x.slice(3));
  const t = +parts.t; if (!t || !sigs.length || Math.abs(now / 1000 - t) > tol) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(t + '.' + raw)))].map(b => b.toString(16).padStart(2, '0')).join('');
  return sigs.some(s => s.length === mac.length && [...s].reduce((x, c, i) => x | (c.charCodeAt(0) ^ mac.charCodeAt(i)), 0) === 0);
}
async function webhook(req, env, fetchFn) {
  const raw = await req.text(); if (raw.length > 200000) return new Response('grande', {status: 413});
  if (!env.STRIPE_WEBHOOK_SECRET || !await checkSig(raw, req.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET)) return new Response('firma', {status: 400});
  let ev; try { ev = JSON.parse(raw); } catch { return new Response('json', {status: 400}); }
  const o = ev.data && ev.data.object || {}, S = stripe(env, fetchFn);
  let subId = '';
  if (ev.type === 'checkout.session.completed') subId = o.subscription; else if (/^customer\.subscription\./.test(ev.type)) subId = o.id; else if (/^invoice\./.test(ev.type)) subId = o.subscription;
  if (subId) {
    const rec = fromSub(await S.get('/subscriptions/' + subId)); // se vuelve a pedir a Stripe: lo que vale es lo que dice Stripe
    if (rec && /^[A-Za-z0-9]{10,128}$/.test(rec.uid)) { const prev = await env.KV.get('pay:' + rec.uid, 'json'); const keep = prev && prev.sub && prev.sub !== rec.sub && OK_STATUS.has(prev.status) && !OK_STATUS.has(rec.status); if (!keep) await store(env, rec.uid, Object.assign({}, rec, {at: Date.now()}), null); }
  }
  return new Response('ok');
}

export default {
  async fetch(req, env, ctx, fetchFn = fetch) {
    const allowed = String(env.ALLOWED_ORIGIN || DEFAULT_ORIGINS).split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.headers.get('origin') || '', okOrigin = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = {'access-control-allow-origin': okOrigin ? origin : 'null', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400', vary: 'origin'};
    const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {...cors, 'content-type': 'application/json', 'cache-control': 'no-store'}});
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    const path = new URL(req.url).pathname, cur = currencyOf(req.cf && req.cf.country);
    const loc = path === '/pay/webhook' ? null : localPrices(env, cur, cur === 'mxn' ? null : await fxRates(env, fetchFn)); // precio en tu moneda
    if (req.method === 'GET' && path === '/') return json({ok: true, app: 'VORTEX pay', ready: !!env.STRIPE_SECRET_KEY, webhook: !!env.STRIPE_WEBHOOK_SECRET, prices: prices(env), local: loc});
    if (req.method === 'POST' && path === '/pay/webhook') return webhook(req, env, fetchFn);
    if (!okOrigin) return json({error: 'Origen no permitido'}, 403);
    if (req.method !== 'POST' || !path.startsWith('/pay/')) return json({error: 'No encontrado'}, 404);
    let b; try { b = JSON.parse((await req.text()).slice(0, 8000)); } catch { return json({error: 'JSON inválido'}, 400); }
    let me; try { me = await verifyIdToken(b.token, {fetchFn}); } catch (e) { return json({error: e.message || 'Inicia sesión con Google'}, 401); }
    const prev = await env.KV.get('pay:' + me.uid, 'json');
    if (!env.STRIPE_SECRET_KEY) return json(Object.assign(pub(prev, env, loc), {setup: true}));
    const S = stripe(env, fetchFn);
    try {
      if (path === '/pay/status') {
        let rec = prev;
        if (b.refresh || b.sid || !rec || Date.now() - (rec.at || 0) > STALE || (rec.end && rec.end < Date.now() && OK_STATUS.has(rec.status))) { rec = await refresh(env, S, me.uid, prev, typeof b.sid === 'string' ? b.sid.slice(0, 200) : ''); await store(env, me.uid, rec, prev); }
        return json(pub(rec, env, loc));
      }
      if (path === '/pay/checkout') {
        const plan = b.plan; if (!PLANS.includes(plan)) return json({error: 'Plan inválido'}, 400);
        const ids = await ensurePrices(env, S);
        let rec = prev && prev.sub ? await refresh(env, S, me.uid, prev, '') : prev;
        if (rec && rec.sub && OK_STATUS.has(rec.status)) { // ya paga: se cambia de plan en la misma suscripción (Stripe cobra o abona la diferencia)
          if (rec.plan === plan) { if (rec.cancel) { await S.post('/subscriptions/' + rec.sub, {cancel_at_period_end: 'false'}); rec.cancel = false; } await store(env, me.uid, Object.assign(rec, {at: Date.now()}), prev); return json(Object.assign(pub(rec, env, loc), {changed: true})); }
          const s = await S.get('/subscriptions/' + rec.sub), it = s.items.data[0];
          const scur = String(s.currency || 'mxn').toLowerCase(), sl = localPrices(env, scur, scur === 'mxn' ? null : await fxRates(env, fetchFn)); // misma moneda con la que ya pagas
          const item = scur === 'mxn' || !ids.prod[plan] || sl.currency !== scur ? {id: it.id, price: ids[plan]} : {id: it.id, price_data: {currency: scur, product: ids.prod[plan], unit_amount: unitAmount(scur, sl[plan]), recurring: {interval: 'month'}}};
          const up = await S.post('/subscriptions/' + rec.sub, {items: [item], proration_behavior: 'always_invoice', cancel_at_period_end: 'false', metadata: {uid: me.uid, plan}});
          rec = Object.assign(fromSub(up), {uid: me.uid, at: Date.now()}); await store(env, me.uid, rec, prev);
          return json(Object.assign(pub(rec, env, loc), {changed: true}));
        }
        const back = allowed.includes(origin) ? origin + '/' : 'https://vortex-nexus.pages.dev/';
        let ccur = loc.currency, cl = loc; // si ya pagaste antes, Stripe exige la misma moneda para tu cliente
        if (rec && rec.cus) { try { const cu = await S.get('/customers/' + rec.cus); if (cu && cu.currency && cu.currency !== ccur) { ccur = String(cu.currency).toLowerCase(); cl = localPrices(env, ccur, ccur === 'mxn' ? null : await fxRates(env, fetchFn)); } } catch {} }
        const line = ccur === 'mxn' || !ids.prod[plan] || cl.currency !== ccur ? {price: ids[plan], quantity: 1} : {price_data: {currency: ccur, product: ids.prod[plan], unit_amount: unitAmount(ccur, cl[plan]), recurring: {interval: 'month'}}, quantity: 1};
        const cs = await S.post('/checkout/sessions', {mode: 'subscription', line_items: [line], client_reference_id: me.uid, locale: 'es-419', allow_promotion_codes: 'true',
          ...(rec && rec.cus ? {customer: rec.cus} : me.email ? {customer_email: me.email} : {}),
          metadata: {uid: me.uid, plan}, subscription_data: {metadata: {uid: me.uid, plan}, description: 'VORTEX ' + (plan === 'plus' ? 'Plus' : 'Infinity')},
          success_url: back + '?pay=ok&sid={CHECKOUT_SESSION_ID}', cancel_url: back + '?pay=back'});
        return json({ok: true, url: cs.url});
      }
      if (path === '/pay/cancel' || path === '/pay/resume') {
        const rec = await refresh(env, S, me.uid, prev, ''); if (!rec.sub || !OK_STATUS.has(rec.status)) return json(Object.assign(pub(rec, env, loc), {error: 'No tienes un plan pagado activo'}), 400);
        const up = await S.post('/subscriptions/' + rec.sub, {cancel_at_period_end: path === '/pay/cancel' ? 'true' : 'false'});
        const nr = Object.assign(fromSub(up), {uid: me.uid, at: Date.now()}); await store(env, me.uid, nr, prev); return json(pub(nr, env, loc));
      }
      if (path === '/pay/portal') { // cambiar tarjeta y ver facturas en la página segura de Stripe
        const rec = prev && prev.cus ? prev : await refresh(env, S, me.uid, prev, ''); if (!rec.cus) return json({error: 'Aún no tienes pagos registrados'}, 400);
        let cfg = await env.KV.get('pay:portal');
        if (!cfg) { const c = await S.post('/billing_portal/configurations', {business_profile: {headline: 'VORTEX · tu plan'}, features: {payment_method_update: {enabled: 'true'}, invoice_history: {enabled: 'true'}, subscription_cancel: {enabled: 'true', mode: 'at_period_end'}}}); cfg = c.id; await env.KV.put('pay:portal', cfg); }
        const back = allowed.includes(origin) ? origin + '/' : 'https://vortex-nexus.pages.dev/';
        const ps = await S.post('/billing_portal/sessions', {customer: rec.cus, return_url: back + '?pay=portal', configuration: cfg});
        return json({ok: true, url: ps.url});
      }
    } catch (e) { return json({error: 'Pagos: ' + String(e.message || e).slice(0, 200)}, 502); }
    return json({error: 'No encontrado'}, 404);
  }
};

// Pruebas del Worker de pagos (worker/pay.mjs): sesión de Google, firma de Stripe, estado del plan y flujo de cobro con Stripe simulado.
const test = require('node:test'), assert = require('node:assert');
const {subtle} = globalThis.crypto;
const W = () => import('../worker/pay.mjs');
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function makeToken(claims, {kid = 'k1'} = {}) {
  const kp = await subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  const jwk = Object.assign(await subtle.exportKey('jwk', kp.publicKey), {kid, alg: 'RS256', use: 'sig'});
  const sign = async c => { const h = b64u(JSON.stringify({alg: 'RS256', kid})), p = b64u(JSON.stringify(c)); const s = await subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(h + '.' + p)); return h + '.' + p + '.' + b64u(new Uint8Array(s)); };
  return {jwk, tok: await sign(claims), sign};
}
const now = () => Math.floor(Date.now() / 1000);
const claims = (o = {}) => Object.assign({aud: 'criptochart-bd774', iss: 'https://securetoken.google.com/criptochart-bd774', sub: 'UserUid1234567890', email: 'a@b.com', email_verified: true, iat: now() - 10, exp: now() + 3600}, o);

test('form: formato anidado de Stripe', async () => {
  const {form} = await W();
  assert.strictEqual(form({mode: 'subscription', line_items: [{price: 'p_1', quantity: 1}], metadata: {uid: 'x y'}}), 'mode=subscription&line_items%5B0%5D%5Bprice%5D=p_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Buid%5D=x%20y');
});

test('verifyIdToken acepta solo tokens válidos de este proyecto', async () => {
  const {verifyIdToken} = await W();
  const {jwk, tok, sign} = await makeToken(claims());
  const me = await verifyIdToken(tok, {keys: [jwk]});
  assert.strictEqual(me.uid, 'UserUid1234567890'); assert.strictEqual(me.email, 'a@b.com');
  await assert.rejects(verifyIdToken(await sign(claims({aud: 'otro'})), {keys: [jwk]}));
  await assert.rejects(verifyIdToken(await sign(claims({exp: now() - 4000})), {keys: [jwk]}));
  const parts = tok.split('.'); parts[1] = b64u(JSON.stringify(claims({sub: 'Atacante123456789'})));
  await assert.rejects(verifyIdToken(parts.join('.'), {keys: [jwk]}), /inválida/);
  const otra = await makeToken(claims()); // firmado con otra llave
  await assert.rejects(verifyIdToken(otra.tok, {keys: [jwk]}));
});

test('checkSig: firma del webhook de Stripe', async () => {
  const {checkSig} = await W();
  const raw = '{"id":"evt_1"}', sec = 'whsec_test', t = now();
  const k = await subtle.importKey('raw', new TextEncoder().encode(sec), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const mac = Buffer.from(await subtle.sign('HMAC', k, new TextEncoder().encode(t + '.' + raw))).toString('hex');
  assert.ok(await checkSig(raw, `t=${t},v1=${mac}`, sec));
  assert.ok(!await checkSig(raw + ' ', `t=${t},v1=${mac}`, sec));
  assert.ok(!await checkSig(raw, `t=${t - 1000},v1=${mac}`, sec));
  assert.ok(!await checkSig(raw, '', sec));
});

test('fromSub / tierOf', async () => {
  const {fromSub, tierOf} = await W();
  const end = Math.floor(Date.now() / 1000) + 86400 * 20;
  const r = fromSub({id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: end, cancel_at_period_end: true, metadata: {uid: 'U', plan: 'infinity'}});
  assert.deepStrictEqual([r.plan, r.cancel, r.cus, tierOf(r)], ['infinity', true, 'cus_1', 'infinity']);
  assert.strictEqual(tierOf({...r, status: 'canceled'}), 'free');
  assert.strictEqual(tierOf({...r, end: Date.now() - 3 * 864e5}), 'free');
  assert.strictEqual(tierOf(null), 'free');
});

function kv() { const m = new Map(); return {m, get: async (k, t) => { const v = m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, put: async (k, v) => { m.set(k, v); }}; }
function fakeStripe(jwk) {
  const calls = [], subs = {};
  const fn = async (url, opt = {}) => {
    const u = String(url), body = new URLSearchParams(opt.body || '');
    if (u.includes('googleapis.com')) return new Response(JSON.stringify({keys: [jwk]}), {headers: {'cache-control': 'max-age=100'}});
    calls.push([opt.method || 'GET', u.replace('https://api.stripe.com/v1', ''), Object.fromEntries(body)]);
    const ok = o => new Response(JSON.stringify(o));
    if (u.includes('/prices?')) return ok({data: []});
    if (u.endsWith('/prices')) return ok({id: 'price_' + body.get('metadata[plan]')});
    if (u.endsWith('/checkout/sessions')) return ok({id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1'});
    if (u.includes('/checkout/sessions/cs_1')) { subs.sub_1 = {id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: now() + 30 * 86400, metadata: {uid: 'UserUid1234567890', plan: 'plus'}, items: {data: [{id: 'si_1', price: {metadata: {plan: 'plus'}}}]}}; return ok({client_reference_id: 'UserUid1234567890', subscription: subs.sub_1}); }
    if (u.includes('/subscriptions/search')) return ok({data: Object.values(subs)});
    const m = /\/subscriptions\/(sub_\w+)$/.exec(u);
    if (m) { const s = subs[m[1]]; if (opt.method === 'POST') { if (body.get('cancel_at_period_end')) s.cancel_at_period_end = body.get('cancel_at_period_end') === 'true'; if (body.get('metadata[plan]')) s.metadata.plan = body.get('metadata[plan]'); } return ok(s); }
    return new Response('{}', {status: 404});
  };
  return {fn, calls, subs};
}
const post = (path, b, origin = 'https://dev.vortex-nexus.pages.dev') => new Request('https://vortex-pay.x.workers.dev' + path, {method: 'POST', headers: {origin, 'content-type': 'application/json'}, body: JSON.stringify(b)});

test('flujo: sin llave de Stripe → setup; pagar Plus, regresar, mejorar a Infinity y cancelar', async () => {
  const mod = await W(), wk = mod.default;
  const {jwk, tok} = await makeToken(claims());
  const st = fakeStripe(jwk), env = {KV: kv(), PRICE_PLUS: '99', PRICE_INFINITY: '249'};
  let r = await (await wk.fetch(post('/pay/status', {token: tok}), env, {}, st.fn)).json();
  assert.strictEqual(r.setup, true); assert.strictEqual(r.tier, 'free'); assert.deepStrictEqual(r.prices, {plus: 99, infinity: 249});
  r = await (await wk.fetch(post('/pay/status', {token: 'basura'}), env, {}, st.fn)); assert.strictEqual(r.status, 401);
  r = await wk.fetch(post('/pay/status', {token: tok}, 'https://malo.com'), env, {}, st.fn); assert.strictEqual(r.status, 403);

  env.STRIPE_SECRET_KEY = 'sk_test_x';
  r = await (await wk.fetch(post('/pay/checkout', {token: tok, plan: 'plus'}), env, {}, st.fn)).json();
  assert.strictEqual(r.url, 'https://checkout.stripe.com/c/pay/cs_1');
  const cs = st.calls.find(c => c[1] === '/checkout/sessions')[2];
  assert.strictEqual(cs.client_reference_id, 'UserUid1234567890'); assert.strictEqual(cs['line_items[0][price]'], 'price_plus');
  assert.strictEqual(cs.success_url, 'https://dev.vortex-nexus.pages.dev/?pay=ok&sid={CHECKOUT_SESSION_ID}'); assert.strictEqual(cs.customer_email, 'a@b.com');
  assert.strictEqual(st.calls.find(c => c[1] === '/prices' && c[2]['metadata[plan]'] === 'infinity')[2].unit_amount, '24900');

  r = await (await wk.fetch(post('/pay/status', {token: tok, sid: 'cs_1'}), env, {}, st.fn)).json();
  assert.strictEqual(r.tier, 'plus'); assert.ok(r.end > Date.now());

  r = await (await wk.fetch(post('/pay/checkout', {token: tok, plan: 'infinity'}), env, {}, st.fn)).json(); // ya paga Plus: se cambia en la misma suscripción
  assert.strictEqual(r.changed, true); assert.strictEqual(r.tier, 'infinity');
  const up = st.calls.filter(c => c[0] === 'POST' && c[1] === '/subscriptions/sub_1').pop()[2];
  assert.strictEqual(up['items[0][price]'], 'price_infinity'); assert.strictEqual(up['items[0][id]'], 'si_1');

  r = await (await wk.fetch(post('/pay/cancel', {token: tok}), env, {}, st.fn)).json();
  assert.strictEqual(r.cancel, true); assert.strictEqual(r.tier, 'infinity'); // sigue activo hasta el fin del mes pagado
  r = await (await wk.fetch(post('/pay/resume', {token: tok}), env, {}, st.fn)).json();
  assert.strictEqual(r.cancel, false);
});

test('regreso con la sesión de pago de OTRA cuenta no da el plan', async () => {
  const wk = (await W()).default;
  const {jwk, tok} = await makeToken(claims({sub: 'OtraCuenta1234567'}), {kid: 'k2'});
  const st = fakeStripe(jwk), env = {KV: kv(), STRIPE_SECRET_KEY: 'sk_test_x'};
  const r = await (await wk.fetch(post('/pay/status', {token: tok, sid: 'cs_1'}), env, {}, st.fn)).json();
  assert.strictEqual(r.tier, 'free');
});

test('el plan pagado también queda en plans/{uid} de Firestore (para abrir Nova Nexus PRO)', async () => {
  const mod = await W(), wk = mod.default, {jwk, tok} = await makeToken(claims()), st = fakeStripe(jwk);
  const kp = await subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign']);
  const sa = JSON.stringify({project_id: 'criptochart-bd774', client_email: 'sa@x', private_key: '-----BEGIN PRIVATE KEY-----\n' + Buffer.from(await subtle.exportKey('pkcs8', kp.privateKey)).toString('base64') + '\n-----END PRIVATE KEY-----\n'});
  const env = {KV: kv(), PRICE_PLUS: '99', PRICE_INFINITY: '249', STRIPE_SECRET_KEY: 'sk_test_x', FB_SA: sa}, docs = new Map(), real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({access_token: 't'}));
    const m = /documents\/(plans\/[^?]+)/.exec(url); if (!m) throw new Error('fetch inesperado ' + url);
    if ((init.method || 'GET') === 'GET') return docs.has(m[1]) ? new Response(JSON.stringify({fields: docs.get(m[1])})) : new Response('{}', {status: 404});
    docs.set(m[1], Object.assign({}, docs.get(m[1]) || {}, JSON.parse(init.body).fields)); return new Response('{}');
  };
  try {
    await wk.fetch(post('/pay/checkout', {token: tok, plan: 'plus'}), env, {}, st.fn);
    const r = await (await wk.fetch(post('/pay/status', {token: tok, sid: 'cs_1'}), env, {}, st.fn)).json(); assert.strictEqual(r.tier, 'plus');
    const d = docs.get('plans/UserUid1234567890'); assert.ok(d, 'se escribió el plan'); assert.deepStrictEqual(d.payTier, {stringValue: 'plus'}); assert.deepStrictEqual(d.tier, {stringValue: 'plus'}); assert.ok(+d.payEnd.integerValue > Date.now());
  } finally { globalThis.fetch = real; }
});

test('precio en la moneda del país: México en pesos, EE. UU. en dólares, Chile sin centavos', async () => {
  const mod = await W();
  assert.strictEqual(mod.currencyOf('MX'), 'mxn'); assert.strictEqual(mod.currencyOf(''), 'mxn'); assert.strictEqual(mod.currencyOf('US'), 'usd'); assert.strictEqual(mod.currencyOf('ES'), 'eur'); assert.strictEqual(mod.currencyOf('CO'), 'cop'); assert.strictEqual(mod.currencyOf('JP'), 'usd');
  const env = {PRICE_PLUS: '99', PRICE_INFINITY: '249'}, fx = {usd: 18.6, eur: 21.6, clp: 0.0197, cop: 0.0049};
  assert.deepStrictEqual(mod.localPrices(env, 'mxn', fx), {currency: 'mxn', plus: 99, infinity: 249});
  assert.deepStrictEqual(mod.localPrices(env, 'usd', fx), {currency: 'usd', plus: 4.99, infinity: 12.99});
  const cl = mod.localPrices(env, 'clp', fx); assert.strictEqual(cl.plus % 10, 0); assert.ok(cl.plus > 4000 && cl.plus < 6000);
  assert.strictEqual(mod.unitAmount('usd', 4.99), 499); assert.strictEqual(mod.unitAmount('clp', 4990), 4990);
});

test('desde EE. UU. se cobra en dólares y el cambio de plan sigue en dólares', async () => {
  const wk = (await W()).default, {jwk, tok} = await makeToken(claims(), {kid: 'k-usd'}), st = fakeStripe(jwk);
  const fn = async (url, opt = {}) => {
    const u = String(url);
    if (u.includes('open.er-api.com')) return new Response(JSON.stringify({rates: {USD: 1 / 18.6, EUR: 1 / 21.6, GBP: 1 / 24.9, CAD: 1 / 13.3, COP: 1 / 0.0049, CLP: 1 / 0.0197, PEN: 1 / 5.5}}));
    if (u.endsWith('/v1/prices')) { const r = await st.fn(url, opt), j = await r.json(); return new Response(JSON.stringify(Object.assign(j, {product: 'prod_' + new URLSearchParams(opt.body).get('metadata[plan]')}))); }
    return st.fn(url, opt);
  };
  const us = (path, b) => { const r = post(path, b); Object.defineProperty(r, 'cf', {value: {country: 'US'}}); return r; };
  const env = {KV: kv(), PRICE_PLUS: '99', PRICE_INFINITY: '249', STRIPE_SECRET_KEY: 'sk_test_x'};
  let r = await (await wk.fetch(us('/pay/status', {token: tok}), env, {}, fn)).json();
  assert.deepStrictEqual(r.local, {currency: 'usd', plus: 4.99, infinity: 12.99}); assert.deepStrictEqual(r.prices, {plus: 99, infinity: 249});
  await wk.fetch(us('/pay/checkout', {token: tok, plan: 'plus'}), env, {}, fn);
  const cs = st.calls.find(c => c[1] === '/checkout/sessions')[2];
  assert.strictEqual(cs['line_items[0][price_data][currency]'], 'usd'); assert.strictEqual(cs['line_items[0][price_data][unit_amount]'], '499'); assert.strictEqual(cs['line_items[0][price_data][product]'], 'prod_plus');
  await wk.fetch(us('/pay/status', {token: tok, sid: 'cs_1'}), env, {}, fn); st.subs.sub_1.currency = 'usd';
  r = await (await wk.fetch(us('/pay/checkout', {token: tok, plan: 'infinity'}), env, {}, fn)).json();
  const up = st.calls.filter(c => c[0] === 'POST' && c[1] === '/subscriptions/sub_1').pop()[2];
  assert.strictEqual(up['items[0][price_data][currency]'], 'usd'); assert.strictEqual(up['items[0][price_data][unit_amount]'], '1299');
});

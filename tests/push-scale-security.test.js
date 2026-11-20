// Seguridad y escala del servidor de avisos (worker/push-alerts.mjs + devstore.mjs + fbauth.mjs):
// · miles de celulares en la base D1 (aquí una SQLite real en memoria) sin tope global de 20
// · la cuenta de un celular solo sale de un token de sesión verificado
// · límites por IP y por cuenta, copia automática KV → D1
// · plan por referido y bóveda de claves verificados en el servidor
const test = require('node:test'), assert = require('node:assert');
const {DatabaseSync} = require('node:sqlite');
const FB = require('./fb-token-helper.js');
const W = () => import('../worker/push-alerts.mjs');
const {subtle} = globalThis.crypto;

function memKV() { const m = new Map(); return {m, get: async (k, t) => { const v = m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); }}; }
// D1 de mentira con SQLite de verdad (misma sintaxis que la D1 de Cloudflare)
function memD1() {
  const db = new DatabaseSync(':memory:'); let queries = 0;
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async first() { queries++; return db.prepare(sql).get(...args) || null; },
    async all() { queries++; return {results: db.prepare(sql).all(...args)}; },
    async run() { queries++; const r = db.prepare(sql).run(...args); return {meta: {changes: r.changes}}; },
    _exec() { const st = db.prepare(sql); return /^\s*(select)/i.test(sql) ? {results: st.all(...args)} : (st.run(...args), {}); }
  });
  return {prepare: sql => stmt(sql), async batch(list) { queries++; db.exec('BEGIN'); try { const out = list.map(s => s._exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } }, db, get queries() { return queries; }};
}
async function fakeSub(n) {
  const kp = await subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const b = x => Buffer.from(x).toString('base64url');
  return {endpoint: 'https://fcm.googleapis.com/fcm/send/dev' + n, keys: {p256dh: b(await subtle.exportKey('raw', kp.publicKey)), auth: b(globalThis.crypto.getRandomValues(new Uint8Array(16)))}};
}
const ORIGIN = 'https://vortex-nexus.pages.dev';
const caller = (w, env) => (path, body, ip = '1.2.3.4') => w.default.fetch(new Request('https://x.workers.dev' + path, {method: 'POST', headers: {origin: ORIGIN, 'cf-connecting-ip': ip}, body: JSON.stringify(body)}), env).then(async r => ({status: r.status, j: await r.json()}));
const devId = n => 'dev_' + String(n).padStart(20, '0');

test('con D1 aguanta cientos de celulares (ya no hay tope de 20) y la ronda reparte en tandas', async () => {
  const w = await W(), env = {KV: memKV(), DB: memD1()}, call = caller(w, env), sub = await fakeSub(0), N = 260;
  for (let i = 0; i < N; i++) {
    const r = await call('/sync', {id: devId(i), sub: {...sub, endpoint: 'https://fcm.googleapis.com/fcm/send/d' + i}, alerts: [{id: 'a' + i, symbol: 'BTCUSDT', on: true, price: 100, dir: 'up'}], move: {on: false}}, '10.0.' + Math.floor(i / 20) + '.' + i);
    assert.strictEqual(r.status, 200, JSON.stringify(r.j));
  }
  assert.strictEqual(+env.DB.db.prepare('SELECT COUNT(*) AS n FROM devices').get().n, N);
  const pushes = new Set(), real = globalThis.fetch;
  globalThis.fetch = async url => { url = String(url); if (url.includes('/ticker/price')) return new Response(JSON.stringify([{symbol: 'BTCUSDT', price: '105'}])); if (url.includes('fcm.googleapis.com')) { pushes.add(url); return new Response('', {status: 201}); } throw new Error('fetch inesperado ' + url); };
  try {
    const r = await w.tick(env, 1e12);
    assert.strictEqual(r.devices, N); assert.strictEqual(r.sent, N); assert.strictEqual(r.errors, 0); assert.strictEqual(r.batches, Math.ceil(N / 10));
    assert.strictEqual(pushes.size, N, 'cada celular recibe su aviso');
    assert.strictEqual(+env.DB.db.prepare('SELECT COUNT(*) AS n FROM devices WHERE active = 1').get().n, 0, 'las alertas «una vez» quedan apagadas y ya no se revisan');
    assert.strictEqual((await w.tick(env, 1e12 + 6e4)).sent, 0);
  } finally { globalThis.fetch = real; }
});

test('Screener y radar llegan a todos los suscritos aunque sean cientos (en tandas)', async () => {
  const w = await W(), env = {KV: memKV(), DB: memD1()}, call = caller(w, env), sub = await fakeSub(1), N = 120;
  for (let i = 0; i < N; i++) { const r = await call('/sync', {id: devId(i), sub: {...sub, endpoint: 'https://fcm.googleapis.com/fcm/send/s' + i}, scr: {on: true, h1: i % 2 === 0, h4: true}, radar: i < 30, move: {on: false}}, '10.1.' + Math.floor(i / 20) + '.' + i); assert.strictEqual(r.status, 200, JSON.stringify(r.j)); }
  const sent = [], real = globalThis.fetch; globalThis.fetch = async url => { sent.push(String(url)); return new Response('', {status: 201}); };
  try {
    const st = await import('../worker/devstore.mjs'), S = st.storeOf(env);
    assert.strictEqual((await S.ids('scr', '1h')).length, N / 2); assert.strictEqual((await S.ids('scr', '4h')).length, N); assert.strictEqual((await S.ids('radar')).length, 30);
    env.KV.m.set('int', 'i'.repeat(32)); // token de las llamadas internas
    const tok = await env.KV.get('int'), post = (path, body, t = tok) => w.default.fetch(new Request('https://x' + path, {method: 'POST', headers: {'x-vx-int': t}, body: JSON.stringify(body)}), env).then(r => r.json().then(j => ({status: r.status, j})));
    assert.strictEqual((await post('/scr/push', {tf: '4h', msg: {title: 't', body: 'b'}}, 'mala')).status, 403);
    assert.strictEqual((await post('/scr/push', {tf: '4h', msg: {title: 't', body: 'b'}})).j.sent, N);
    sent.length = 0; assert.strictEqual((await post('/scr/push', {tf: '1h', msg: {title: 't', body: 'b'}})).j.sent, N / 2);
    assert.strictEqual((await post('/radar/push', {msg: {title: 'r', body: 'b'}})).j.sent, 30);
  } finally { globalThis.fetch = real; }
});

test('la cuenta del celular solo se acepta con token verificado; sin token se conserva o se quita, nunca se cree', async () => {
  const w = await W(), env = {KV: memKV(), DB: memD1()}, call = caller(w, env), sub = await fakeSub(2), real = globalThis.fetch;
  globalThis.fetch = FB.withJwks(() => { throw new Error('sin red'); });
  const uidOf = id => env.DB.db.prepare('SELECT uid FROM devices WHERE id = ?').get(id).uid;
  try {
    await call('/sync', {id: devId(1), sub, uid: 'Victima123', move: {on: false}}); assert.strictEqual(uidOf(devId(1)), '', 'solo decir el uid no basta');
    await call('/sync', {id: devId(1), sub, uid: 'Victima123', idToken: (await FB.mint('Victima123')).slice(0, -4) + 'AAAA', move: {on: false}}); assert.strictEqual(uidOf(devId(1)), '', 'firma alterada');
    await call('/sync', {id: devId(1), sub, uid: 'Victima123', idToken: await FB.mint('Victima123', {exp: Math.floor(Date.now() / 1000) - 3600}), move: {on: false}}); assert.strictEqual(uidOf(devId(1)), '', 'token vencido');
    await call('/sync', {id: devId(1), sub, uid: 'Victima123', idToken: await FB.mint('Victima123', {aud: 'otro'}), move: {on: false}}); assert.strictEqual(uidOf(devId(1)), '', 'otro proyecto');
    const ok = await call('/sync', {id: devId(1), sub, uid: 'Yo12345', idToken: await FB.mint('Yo12345'), move: {on: false}}); assert.strictEqual(ok.j.verified, true); assert.strictEqual(uidOf(devId(1)), 'Yo12345');
    await call('/sync', {id: devId(1), uid: 'Yo12345', move: {on: true}}); assert.strictEqual(uidOf(devId(1)), 'Yo12345', 'sin token (al cerrar la app) se conserva la verificada');
    await call('/sync', {id: devId(1), uid: 'Otro999', move: {on: true}}); assert.strictEqual(uidOf(devId(1)), '', 'si dice otra cuenta sin token, se quita');
  } finally { globalThis.fetch = real; }
});

test('límites: máx. 10 celulares por cuenta (se suelta el más viejo) y registros nuevos por IP', async () => {
  const w = await W(), env = {KV: memKV(), DB: memD1()}, call = caller(w, env), sub = await fakeSub(3), real = globalThis.fetch;
  globalThis.fetch = FB.withJwks(() => { throw new Error('sin red'); });
  try {
    for (let i = 0; i < 12; i++) { const r = await call('/sync', {id: devId(100 + i), sub, uid: 'Cuenta1', idToken: await FB.mint('Cuenta1'), move: {on: false}}, '9.9.9.' + i); assert.strictEqual(r.status, 200); }
    const mine = env.DB.db.prepare("SELECT id FROM devices WHERE uid = 'Cuenta1'").all().map(x => x.id);
    assert.strictEqual(mine.length, 10); assert.ok(!mine.includes(devId(100)) && mine.includes(devId(111)));
    let last; for (let i = 0; i < 32; i++) last = await call('/sync', {id: devId(500 + i), sub, move: {on: false}}, '7.7.7.7');
    assert.strictEqual(last.status, 429, 'una sola IP no puede registrar cientos de celulares falsos');
    assert.strictEqual((await call('/sync', {id: devId(500), sub, move: {on: true}}, '7.7.7.7')).status, 200, 'los ya registrados siguen sincronizando');
  } finally { globalThis.fetch = real; }
});

test('solo se aceptan servicios push reales (el servidor no le manda nada a otras direcciones)', async () => {
  const {sanSub} = await W(), k = {p256dh: 'B'.repeat(87), auth: 'A'.repeat(22)};
  for (const ok of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=x', 'https://web.push.apple.com/QAbc']) assert.ok(sanSub({endpoint: ok, keys: k}), ok);
  for (const bad of ['https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'https://169.254.169.254/latest', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x']) assert.strictEqual(sanSub({endpoint: bad, keys: k}), null, bad);
});

test('con D1 se copian solos los celulares que había en el KV (no se pierde ninguno)', async () => {
  const w = await W(), KV = memKV(), sub = await fakeSub(4);
  KV.m.set('devs', JSON.stringify([devId(1), devId(2)]));
  KV.m.set('dev:' + devId(1), JSON.stringify({sub, alerts: [{id: 'a', symbol: 'ETHUSDT', on: true, price: 1, dir: 'up'}], uid: 'Yo', updated: 5}));
  KV.m.set('dev:' + devId(2), JSON.stringify({sub, scr: {on: true, h1: true, h4: true}}));
  const env = {KV, DB: memD1()}, S = (await import('../worker/devstore.mjs')).storeOf(env);
  assert.strictEqual(await S.count(), 2); assert.deepStrictEqual(await S.ids('active'), [devId(1)]); assert.deepStrictEqual(await S.ids('uid', 'Yo'), [devId(1)]);
  assert.deepStrictEqual((await S.activeRows())[0].syms, ['ETHUSDT']);
  await S.count(); assert.strictEqual(await S.count(), 2, 'no se duplica');
});

test('sin D1 (respaldo) funciona con el KV y con un tope bajo para no pasar el límite gratis', async () => {
  const {storeOf, MAX_DEVICES_KV} = await import('../worker/devstore.mjs'), S = storeOf({KV: memKV()});
  assert.strictEqual(S.kind, 'kv'); assert.strictEqual(S.max, MAX_DEVICES_KV);
  await S.put(devId(1), {sub: {}, radar: true}); assert.deepStrictEqual(await S.ids('radar'), [devId(1)]); await S.del(devId(1)); assert.strictEqual(await S.count(), 0);
});

// ───────── planes ─────────
function fakeFirestore() {
  const docs = new Map(), calls = [];
  const handler = async (url, init = {}) => {
    url = String(url); calls.push({url, method: init.method || 'GET'});
    if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({access_token: 'tok', expires_in: 3600}));
    const m = /documents\/(plans\/[^?]+)/.exec(url);
    if (m) {
      if ((init.method || 'GET') === 'GET') return docs.has(m[1]) ? new Response(JSON.stringify({fields: docs.get(m[1])})) : new Response('{}', {status: 404});
      const body = JSON.parse(init.body); docs.set(m[1], Object.assign({}, docs.get(m[1]) || {}, body.fields)); return new Response('{}');
    }
    return null;
  };
  return {docs, calls, handler};
}
async function saJson() {
  const kp = await subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  const der = Buffer.from(await subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
  return JSON.stringify({project_id: 'criptochart-bd774', client_email: 'sa@x.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\n' + der + '\n-----END PRIVATE KEY-----\n'});
}

test('plan Infinity por BingX: lo verifica y lo escribe el servidor; un UID no sirve para dos cuentas; sin sesión no', async () => {
  const w = await W(), fs = fakeFirestore(), env = {KV: memKV(), DB: memD1(), FB_SA: await saJson(), BINGX_AGENT_KEY: 'k', BINGX_AGENT_SECRET: 's'}, call = caller(w, env), real = globalThis.fetch;
  globalThis.fetch = FB.withJwks(async (url, init) => { const r = await fs.handler(url, init); if (r) return r; if (String(url).includes('bingx')) return new Response(JSON.stringify({code: 0, data: {inviteResult: true, existInvitee: true, balanceVolume: '150.5'}})); throw new Error('fetch inesperado ' + url); });
  try {
    assert.strictEqual((await call('/plan/bingx', {uid: '12345678'})).status, 401, 'sin sesión no se da ningún plan');
    const r = await call('/plan/bingx', {uid: '12345678', idToken: await FB.mint('Ana111')});
    assert.strictEqual(r.j.invited, true, JSON.stringify(r.j)); assert.strictEqual(r.j.tier, 'infinity');
    assert.deepStrictEqual(fs.docs.get('plans/Ana111').tier, {stringValue: 'infinity'}); assert.deepStrictEqual(fs.docs.get('plans/Ana111').refTier, {stringValue: 'infinity'});
    const r2 = await call('/plan/bingx', {uid: '12345678', idToken: await FB.mint('Beto222')});
    assert.strictEqual(r2.status, 409); assert.ok(!fs.docs.has('plans/Beto222'));
    assert.strictEqual((await call('/plan/bingx', {uid: '12345678', idToken: await FB.mint('Ana111')})).j.invited, true, 'la misma cuenta puede volver a verificar');
  } finally { globalThis.fetch = real; }
});

test('Infinity por BingX pide $100 de saldo: con menos se dan 7 días de Plus (una sola vez) y al recargar pasa a Infinity', async () => {
  const w = await W(), fs = fakeFirestore(), env = {KV: memKV(), DB: memD1(), FB_SA: await saJson(), BINGX_AGENT_KEY: 'k', BINGX_AGENT_SECRET: 's'}, call = caller(w, env), real = globalThis.fetch;
  let bal = '35.2', vol = [];
  globalThis.fetch = FB.withJwks(async (url, init) => { const r = await fs.handler(url, init); if (r) return r; if (String(url).includes('commissionDataList')) return new Response(JSON.stringify({code: 0, data: {list: vol}})); if (String(url).includes('bingx')) return new Response(JSON.stringify({code: 0, data: {inviteResult: true, balanceVolume: bal}})); throw new Error('fetch inesperado ' + url); });
  try {
    const r = await call('/plan/bingx', {uid: '87654321', idToken: await FB.mint('Caro333')});
    assert.strictEqual(r.j.need, true, JSON.stringify(r.j)); assert.strictEqual(r.j.bal, 35.2); assert.strictEqual(r.j.min, 100); assert.strictEqual(r.j.tier, 'plus', 'prueba de Plus');
    assert.ok(r.j.trialEnd > Date.now() + 6.9 * 864e5 && r.j.trialEnd < Date.now() + 7.1 * 864e5, '7 días');
    assert.deepStrictEqual(fs.docs.get('plans/Caro333').refTier, {stringValue: 'free'});
    const again = await call('/plan/bingx', {uid: '87654321', idToken: await FB.mint('Caro333')});
    assert.strictEqual(again.j.trialUsed, true); assert.strictEqual(again.j.trialEnd, r.j.trialEnd, 'la prueba no se reinicia');
    bal = '120';
    const ok = await call('/plan/bingx', {uid: '87654321', idToken: await FB.mint('Caro333')});
    assert.strictEqual(ok.j.tier, 'infinity'); assert.ok(ok.j.refEnd > Date.now() + 30 * 864e5, 'se vuelve a revisar en un mes');
    bal = '3'; // renovar: ya no se piden los $100, solo actividad en los últimos 7 días
    const idle = await call('/plan/bingx', {uid: '87654321', idToken: await FB.mint('Caro333')});
    assert.strictEqual(idle.j.inactive, true, JSON.stringify(idle.j)); assert.strictEqual(idle.j.tier, 'infinity', 'sigue con Infinity hasta su fecha');
    vol = [{uid: 87654321, commissionTime: Date.now() - 2 * 864e5, tradingVolume: '850.2'}];
    const ren = await call('/plan/bingx', {uid: '87654321', idToken: await FB.mint('Caro333')});
    assert.strictEqual(ren.j.renewed, true, JSON.stringify(ren.j)); assert.strictEqual(ren.j.tier, 'infinity');
  } finally { globalThis.fetch = real; }
});

test('plans/{uid}: el plan vigente sale del creador, el referido o un pago no vencido', async () => {
  const {planTier} = await import('../worker/fbauth.mjs'), now = Date.now();
  assert.strictEqual(planTier({by: 'creador'}), 'infinity');
  assert.strictEqual(planTier({refTier: 'infinity'}), 'infinity');
  assert.strictEqual(planTier({payTier: 'plus', payEnd: now + 864e5}), 'plus');
  assert.strictEqual(planTier({payTier: 'infinity', payEnd: now - 3 * 864e5}), 'free', 'pago vencido');
  assert.strictEqual(planTier({refTier: 'infinity', payTier: 'plus', payEnd: now + 864e5}), 'infinity', 'el mejor de los dos');
  assert.strictEqual(planTier(null), 'free');
  assert.strictEqual(planTier({refTier: 'infinity', refEnd: now - 1000}), 'free', 'referido sin revisar en el mes');
  assert.strictEqual(planTier({refTier: 'free', trialTier: 'plus', trialEnd: now + 864e5}), 'plus', 'prueba vigente');
  assert.strictEqual(planTier({trialTier: 'plus', trialEnd: now - 1}), 'free', 'prueba vencida');
});

test('bóveda: cifra tus claves atadas a tu cuenta; otra cuenta no las puede abrir', async () => {
  const w = await W(), env = {KV: memKV(), DB: memD1()}, call = caller(w, env), real = globalThis.fetch;
  globalThis.fetch = FB.withJwks(() => { throw new Error('sin red'); });
  try {
    const secret = JSON.stringify({ex: 'bingx', key: 'AK123', secret: 'SECRETO-MUY-PRIVADO'});
    assert.strictEqual((await call('/vault/seal', {data: secret})).status, 401);
    const s = await call('/vault/seal', {data: secret, idToken: await FB.mint('Fer666')}); assert.match(s.j.box, /^v1\./); assert.ok(!s.j.box.includes('SECRETO'));
    assert.strictEqual((await call('/vault/open', {box: s.j.box, idToken: await FB.mint('Fer666')})).j.data, secret);
    assert.strictEqual((await call('/vault/open', {box: s.j.box, idToken: await FB.mint('Ladron7')})).status, 403);
    assert.strictEqual((await call('/vault/open', {box: s.j.box.slice(0, -3) + 'AAA', idToken: await FB.mint('Fer666')})).status, 403, 'caja alterada');
  } finally { globalThis.fetch = real; }
});

test('verifyIdToken rechaza tokens raros sin tronar', async () => {
  const {verifyIdToken} = await import('../worker/fbauth.mjs'), fetchFn = FB.withJwks(() => { throw new Error('x'); });
  for (const t of [null, '', 'a.b', 'a.b.c', 'x'.repeat(5000), await FB.mint('A', {iss: 'https://evil'})]) assert.strictEqual(await verifyIdToken(t, {fetchFn}), null);
  assert.strictEqual((await verifyIdToken(await FB.mint('A1'), {fetchFn})).uid, 'A1');
});

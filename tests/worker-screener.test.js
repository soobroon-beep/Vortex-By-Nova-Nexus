const test = require('node:test'), assert = require('node:assert');
const load = () => import('../worker/push-alerts.mjs'), loadS = () => import('../worker/screener.mjs');
function kv() { const m = new Map(); let writes = 0; return {m, get writes() { return writes; }, async get(k, t) { const v = m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v) { writes++; m.set(k, v); }, async delete(k) { m.delete(k); }}; }
function candles(n, iv, seed) { let p = 100, s = seed; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280; const now = Math.floor(Date.now() / iv) * iv, out = []; for (let i = n - 1; i >= 0; i--) { const t = now - i * iv, o = p; p *= 1 + (r() - .5) * .03 + Math.sin(i / 25) * .004; out.push([t, o, Math.max(o, p) * 1.003, Math.min(o, p) * .997, p, 1000 + r() * 400, t + iv - 1]); } return out; }
test('dueTf: franjas y ventana de 20 minutos', async () => {
  const S = await loadS(), h = 36e5, base = Math.floor(Date.now() / (4 * h)) * 4 * h;
  assert.equal(S.dueTf({}, base + 30e3), null); // aún no cierra la vela (espera 1 min)
  assert.equal(S.dueTf({}, base + 2 * 6e4), '1h');
  assert.equal(S.dueTf({'1h': S.slotOf('1h', base)}, base + 2 * 6e4), '4h');
  assert.equal(S.dueTf({'1h': S.slotOf('1h', base), '4h': S.slotOf('4h', base)}, base + 2 * 6e4), null);
  assert.equal(S.dueTf({}, base + 25 * 6e4), null); // fuera de ventana: lo toma el respaldo
  assert.equal(S.dueTf({}, base + h + 5 * 6e4), '1h');
});
test('ronda completa del screener: analiza, manda a Discord y al celular, y no repite la franja', async () => {
  const W = await load(), env = {KV: kv(), DISCORD_WEBHOOK: 'https://discord.com/api/webhooks/123456789/abcdefghijklmnopqrstuvwxyz_123'};
  const calls = {discord: 0, kl: 0, push: 0}; const real = globalThis.fetch;
  globalThis.fetch = async (u, init) => { u = String(u);
    if (/ticker\/24hr/.test(u)) return new Response(JSON.stringify(Array.from({length: 60}, (_, i) => ({symbol: 'C' + i + 'USDT', quoteVolume: String(1e9 - i * 1e6), lastPrice: '100'}))));
    if (/klines/.test(u)) { calls.kl++; const m = /symbol=C(\d+)USDT/.exec(u); return new Response(JSON.stringify(candles(501, 36e5, +m[1] + 1))); }
    if (/discord/.test(u)) { calls.discord++; return new Response(null, {status: 204}); }
    if (/push\.example/.test(u)) { calls.push++; return new Response('', {status: 201}); }
    throw new Error('sin red: ' + u); };
  try {
    // un dispositivo con las señales del screener activadas
    const {b64u} = W; const kp = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
    const p256 = b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), auth = b64u(crypto.getRandomValues(new Uint8Array(16)));
    await env.KV.put('devs', JSON.stringify(['dev1234567890abcdef'])); await env.KV.put('dev:dev1234567890abcdef', JSON.stringify({sub: {endpoint: 'https://push.example/x', keys: {p256dh: p256, auth}}, alerts: [], scr: {on: true, h1: true, h4: true}}));
    const now = Math.floor(Date.now() / 36e5) * 36e5 + 3 * 6e4 + (Math.floor(Date.now() / 36e5) % 4 === 0 ? 36e5 : 0);
    const r = await W.scrKick(env, now); console.log(JSON.stringify(r));
    assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.of, 50); assert.equal(calls.kl, 50);
    if (r.n) { assert.equal(r.discord, true); assert.equal(calls.discord, 1); assert.equal(calls.push, 1); assert.equal(r.pushed, 1); }
    const st = await env.KV.get('scr', 'json'); assert.equal(st['1h'], Math.floor(now / 36e5)); assert.equal(st.lock, 0);
    assert.equal(await W.scrKick(env, now + 6e4), null); // misma franja: no se repite
  } finally { globalThis.fetch = real; }
});

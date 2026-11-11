'use strict';
// Alertas con indicador con la app cerrada: scripts/ind-alerts.js (GitHub Actions) + /ind/jobs y /ind/report del Worker.
const test = require('node:test'), assert = require('node:assert/strict');
const AE = require('../alert-eval.js'), IA = require('../scripts/ind-alerts.js');

const series = n => { const cs = []; for (let i = 0; i < n; i++) { const p = 100 + Math.sin(i / 6) * 10; cs.push({t: i * 3600e3, o: p, h: p + 1, l: p - 1, c: p, v: 10}); } return cs; };
test('alert-eval: cruces de indicadores comunes en una vela cerrada', () => {
  const cs = series(300), c = cs.map(x => x.c), e = AE.ema(c, 20), up = [];
  for (let k = 1; k < cs.length; k++) if (AE.stdHit(cs, k, {k: 'px_ema20_up'})) up.push(k);
  assert.ok(up.length > 3); for (const k of up) assert.ok(c[k - 1] <= e[k - 1] && c[k] > e[k]);
  assert.deepEqual(AE.barsToCheck(cs, 299, cs[296].t), [297, 298, 299]);
});

test('round: revisa la última vela cerrada, reporta y no repite', async () => {
  const cs = series(300); let k = 1; for (let i = 299; i > 0; i--) if (AE.stdHit(cs, i, {k: 'px_ema20_up'})) { k = i; break; }
  const cut = cs.slice(0, k + 1), now = Date.now(), off = now - (cut.length + 1) * 3600e3, raw = cut.map(x => [x.t + off, x.o, x.h, x.l, x.c, x.v, x.t + off + 3599e3]);
  const alert = {id: 'a1', symbol: 'BTCUSDT', interval: '1h', src: 'std', spec: {k: 'px_ema20_up'}, label: 'Precio cruza EMA 20', on: true, lastBar: raw[raw.length - 2][0]};
  const posts = [], real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { url = String(url);
    if (url.includes('/klines')) return new Response(JSON.stringify(raw));
    if (url.endsWith('/ind/jobs')) return new Response(JSON.stringify({ok: true, devs: [{dev: 'd1', uid: '', alerts: [alert]}]}));
    if (url.endsWith('/ind/report')) { posts.push(JSON.parse(init.body)); return new Response(JSON.stringify({ok: true, sent: 1})); }
    throw new Error('fetch ' + url); };
  try {
    const r = await IA.round('k', async () => null);
    assert.equal(r.hits, 1); assert.equal(posts[0].results[0].hit, true); assert.equal(posts[0].results[0].lastBar, raw[raw.length - 1][0]);
    alert.lastBar = raw[raw.length - 1][0]; posts.length = 0; const r2 = await IA.round('k', async () => null); assert.equal(r2.checked, 0); assert.equal(posts.length, 0);
  } finally { globalThis.fetch = real; }
});

test('Worker: /ind/report avisa una vez y la app se entera al sincronizar', async () => {
  const w = await import('../worker/push-alerts.mjs'); const m = new Map(), KV = {get: async (k, t) => { const v = m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); }};
  const env = {KV, BOT_PUSH_KEY: 'z'.repeat(64)}, ID = 'dev_iiiiiiiiiiiiiiiiiiii';
  const sub = {endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: {p256dh: 'BOr' + 'a'.repeat(84), auth: 'a'.repeat(22)}};
  const ind = [{id: 'a1', symbol: 'BTCUSDT', interval: '1h', src: 'std', spec: {k: 'rsi_up', lvl: 70}, label: 'RSI', on: true, lastBar: 1000, repeat: 'once'}];
  const sync = body => w.default.fetch(new Request('https://x/sync', {method: 'POST', headers: {origin: 'https://soobroon-beep.github.io'}, body: JSON.stringify(body)}), env).then(r => r.json());
  await sync({id: ID, sub, move: {on: false}, ind});
  const call = (p, b) => w.default.fetch(new Request('https://x' + p, {method: 'POST', body: JSON.stringify(Object.assign({key: 'z'.repeat(64)}, b))}), env).then(r => r.json());
  const jobs = await call('/ind/jobs', {}); assert.equal(jobs.devs[0].alerts[0].id, 'a1');
  const real = globalThis.fetch; let pushed = 0; globalThis.fetch = async u => { if (String(u).includes('fcm')) { pushed++; return new Response('', {status: 201}); } throw new Error(String(u)); };
  try {
    const r = await call('/ind/report', {results: [{dev: ID, id: 'a1', lastBar: 2000, hit: true, info: '71'}]}); assert.equal(r.fired, 1);
    const r2 = await call('/ind/report', {results: [{dev: ID, id: 'a1', lastBar: 2000, hit: true, info: '71'}]}); assert.equal(r2.fired, 0); // no repite
  } finally { globalThis.fetch = real; }
  const d = JSON.parse(m.get('dev:' + ID)); assert.equal(d.ind[0].on, false); assert.equal(d.ind[0].lastBar, 2000);
  const back = await sync({id: ID, sub, move: {on: false}, ind, since: 1}); assert.equal(back.backInd[0].on, false); assert.equal(back.backInd[0].firedInfo, '71');
});

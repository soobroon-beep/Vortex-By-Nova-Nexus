'use strict';
// Dominancia (USDT.D, BTC.D): fórmula compartida, muestra puntual del servidor e historial reanudable del flujo de GitHub.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const C = require('../dominance-core.js');
const coins = (n = 200) => Array.from({length: n}, (_, i) => ({id: i === 0 ? 'bitcoin' : i === 2 ? 'tether' : i === 5 ? 'wrapped-bitcoin' : 'coin' + i, symbol: i === 5 ? 'wbtc' : 'c' + i, market_cap: (i === 0 ? 6000 : i === 2 ? 700 : i === 5 ? 500 : 3000 / (i + 1)) * 1e9}));
const memKV = () => { const m = new Map(); return {m, get: async (k, t) => { const v = m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); }}; };

test('fórmula: moneda / suma de las 125 más grandes, sin fichas envueltas', () => {
  const mk = coins(), list = C.top125(mk), cur = C.sample(mk);
  assert.equal(list.length, 125); assert.ok(!list.some(c => c.id === 'wrapped-bitcoin'));
  const tot = list.reduce((a, c) => a + c.market_cap, 0);
  assert.ok(Math.abs(cur.usdt - 700e9 / tot * 100) < 1e-9); assert.ok(Math.abs(cur.btc - 6000e9 / tot * 100) < 1e-9);
  assert.equal(C.sample(coins(100)), null, 'respuesta incompleta: no se inventa la muestra'); assert.equal(C.sample({error: 'x'}), null);
});
test('mergeSamples: un punto por hueco, gana el más nuevo y se recorta lo antiguo', () => {
  const Q = 900e3, a = C.mergeSamples([[Q, 5], [2 * Q, 6]], [[2 * Q + 5, 7], [3 * Q, 8], [4 * Q, 0], ['x', 1], [5 * Q, 120]], Q, 2 * Q);
  assert.deepEqual(a, [[2 * Q, 7], [3 * Q, 8]]);
});
test('servidor: toma una muestra por cada cuarto de hora y la sirve en /dom', async () => {
  const W = await import('../worker/push-alerts.mjs'), env = {KV: memKV()}, Q = 900e3, t0 = Math.floor(Date.UTC(2026, 10, 10, 12, 0) / Q) * Q, real = globalThis.fetch; let calls = 0;
  globalThis.fetch = async u => { calls++; assert.match(String(u), /coingecko\.com\/api\/v3\/coins\/markets/); return new Response(JSON.stringify(coins()), {status: 200}); };
  try {
    assert.equal(await W.domKick(env, t0 + 7 * 6e4), null, 'fuera de los primeros minutos no se intenta'); assert.equal(calls, 0);
    const r = await W.domKick(env, t0 + 6e4); assert.ok(r.ok && r.usdt > 0 && r.btc > 0); assert.equal(calls, 1);
    assert.equal(await W.domKick(env, t0 + 2 * 6e4), null, 'ese cuarto de hora ya está tomado'); assert.equal(calls, 1);
    await W.domKick(env, t0 + Q + 1000); assert.equal(calls, 2);
    const res = await W.default.fetch(new Request('https://x/dom', {headers: {origin: 'https://soobroon-beep.github.io'}}), env), j = await res.json();
    assert.equal(j.method, C.METHOD); assert.deepEqual(j.series['USDT.D'].map(p => p[0]), [t0, t0 + Q]); assert.equal(j.series['BTC.D'].length, 2);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://soobroon-beep.github.io');
    globalThis.fetch = async () => new Response('{}', {status: 429});
    const bad = await W.domRun(env, t0 + 2 * Q + 5 * 6e4); assert.equal(bad.ok, false); assert.match((await env.KV.get('dom', 'json')).err.why, /429/);
    assert.equal((await env.KV.get('dom', 'json')).h['USDT.D'].length, 2, 'un fallo no borra ni inventa muestras');
  } finally { globalThis.fetch = real; }
});
test('historial reanudable: sigue donde se quedó y solo pide lo que falta', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dom-')), real = globalThis.fetch, list = C.top125(coins()), day = 864e5, now = Date.now();
  const mod = budget => { process.env.DOM_CACHE = dir; process.env.DOM_PACE_MS = '1'; process.env.DOM_BUDGET_MIN = String(budget); delete require.cache[require.resolve('../scripts/fetch-dominance.js')]; return require('../scripts/fetch-dominance.js'); };
  const asked = []; globalThis.fetch = async u => { const m = /coins\/([^/]+)\/market_chart.*days=(\d+)/.exec(String(u)); asked.push(m[1] + ':' + m[2]); const c = list.find(x => x.id === m[1]); return new Response(JSON.stringify({market_caps: [[now - 2 * day, c.market_cap], [now - day, c.market_cap], [now, c.market_cap]]}), {status: 200}); };
  try {
    const r1 = await mod(1e-9).backfill(list); assert.deepEqual(r1, {pending: true}); assert.equal(asked.length, 0, 'sin tiempo: no pide nada y queda pendiente');
    const pg = JSON.parse(fs.readFileSync(path.join(dir, 'dominance-backfill.json'), 'utf8')); // como si la ejecución anterior hubiera bajado 100 monedas
    for (const c of list.slice(0, 100)) { pg.day[c.id] = [[now - day, c.market_cap], [now, c.market_cap]]; pg.hr[c.id] = [[now - day, c.market_cap], [now, c.market_cap]]; }
    fs.writeFileSync(path.join(dir, 'dominance-backfill.json'), JSON.stringify(pg));
    const r2 = await mod(60).backfill(list); assert.equal(asked.length, 50, 'solo las 25 monedas que faltaban (día y hora)'); assert.ok(!asked.some(a => a.startsWith(list[0].id + ':')));
    assert.equal(r2.coins, 125); assert.ok(r2.d['USDT.D'].length >= 2 && r2.hh['BTC.D'].length >= 2);
    const tot = list.reduce((a, c) => a + c.market_cap, 0), last = r2.d['USDT.D'][r2.d['USDT.D'].length - 1][1]; assert.ok(Math.abs(last - 700e9 / tot * 100) < 1e-6);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'dominance-backfill.json'), 'utf8')).done, true, 'al terminar no queda avance que reanudar');
  } finally { globalThis.fetch = real; delete process.env.DOM_CACHE; delete process.env.DOM_PACE_MS; delete process.env.DOM_BUDGET_MIN; fs.rmSync(dir, {recursive: true, force: true}); }
});

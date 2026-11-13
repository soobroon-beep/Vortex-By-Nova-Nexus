// El Screener que manda el Motor: aparta la franja en el servidor, no repite y no manda franjas viejas.
const test = require('node:test'), assert = require('node:assert');
const DS = require('../scripts/discord-screener.js');
const HOOK = 'https://discord.com/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz0123';
function mock(srv, claim) {
  const calls = []; let n = 0;
  global.fetch = async (u, o) => {
    u = String(u); calls.push(u);
    if (u.endsWith('/scr/state')) return {ok: true, json: async () => srv};
    if (u.endsWith('/ext/scr')) return {ok: true, json: async () => claim};
    if (u.includes('ticker/24hr')) return {ok: true, json: async () => Array.from({length: 12}, (_, i) => ({symbol: 'C' + i + 'USDT', quoteVolume: 9e6, lastPrice: 1}))};
    if (u.includes('klines')) return {ok: true, json: async () => []};
    if (u.startsWith(HOOK)) { n++; return {ok: true, status: 204, json: async () => ({})}; }
    throw new Error('url inesperada ' + u);
  };
  return {calls, posts: () => n};
}
test('el servidor ya mandó la franja: no se repite', async () => {
  process.env.DISCORD_WEBHOOK = HOOK; const now = Date.UTC(2026, 10, 13, 18, 2), st = {};
  const m = mock({'1h': DS.slotOf('1h', now), '4h': 0}, {ok: true});
  await DS.motorRound(st, 'k', now, () => {});
  assert.equal(st['1h'], DS.slotOf('1h', now)); assert.ok(!m.calls.some(u => u.endsWith('/ext/scr')));
});
test('franja vieja (más de 30 min): se marca sin mandar', async () => {
  process.env.DISCORD_WEBHOOK = HOOK; const now = Date.UTC(2026, 10, 13, 18, 45), st = {'4h': DS.slotOf('4h', now)};
  const m = mock({'1h': 0, '4h': 0}, {ok: true});
  assert.equal(await DS.motorRound(st, 'k', now, () => {}), true);
  assert.equal(st['1h'], DS.slotOf('1h', now)); assert.equal(m.calls.filter(u => u.includes('klines')).length, 0);
});
test('el servidor responde skip: no se manda a Discord', async () => {
  process.env.DISCORD_WEBHOOK = HOOK; const now = Date.UTC(2026, 10, 13, 18, 3), st = {'4h': DS.slotOf('4h', now)};
  const m = mock({'1h': 0, '4h': 0}, {ok: true, skip: 'ya enviado'});
  await DS.motorRound(st, 'k', now, () => {});
  assert.equal(st['1h'], DS.slotOf('1h', now)); assert.equal(m.posts(), 0);
});
test('minuto 0: espera a que cierre la vela', async () => {
  process.env.DISCORD_WEBHOOK = HOOK; const now = Date.UTC(2026, 10, 13, 18, 0, 20), st = {'4h': DS.slotOf('4h', now)};
  mock({}, {});
  assert.equal(await DS.motorRound(st, 'k', now, () => {}), false);
});

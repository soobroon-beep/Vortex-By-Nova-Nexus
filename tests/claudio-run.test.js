const test = require('node:test'), assert = require('node:assert/strict');
const RUN = require('../scripts/claudio-run.js'), K = require('../claudio-core.js'), R = require('../claudio-candidates.js');
const H = 36e5, T0 = Date.UTC(2026, 9, 1);
function klines(n, seed, p0) { let s = seed, p = p0; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296, out = []; for (let i = 0; i < n; i++) { const o = p, c = o * (1 + (rnd() - .5) * .015); out.push([T0 + i * H, String(o), String(Math.max(o, c) * 1.002), String(Math.min(o, c) * .998), String(c), String(900 + rnd() * 300), T0 + (i + 1) * H - 1]); p = c; } return out; }
function fakeBinance(n) { // imita data-api.binance.vision: klines + depth; HYPEUSDT no listado (400)
  const calls = []; return {calls, fx: async url => { calls.push(url); const sym = /symbol=([A-Z]+)/.exec(url)[1]; if (sym === 'HYPEUSDT') return {ok: false, status: 400};
    if (url.includes('/klines')) { const lim = +/limit=(\d+)/.exec(url)[1]; return {ok: true, json: async () => klines(n, sym.length * 7 + sym.charCodeAt(0), 100).slice(-lim)}; }
    const mid = 100; return {ok: true, json: async () => ({bids: Array.from({length: 20}, (_, i) => [String(mid - i * .01 - .01), '3']), asks: Array.from({length: 20}, (_, i) => [String(mid + i * .01 + .01), '3'])})}; }};
}
test('ejecución horaria: arranca plana, avanza con datos de Binance (simulados), omite monedas no listadas y respeta el interruptor', async () => {
  const B = fakeBinance(1200), now0 = T0 + 1000 * H + 60e3, evaluate = K.jevEvaluator({}); // sin clave ⇒ jev-local
  let s = await RUN.runOne({enabled: true, capital: 5000}, null, 'tick', {feed: RUN.makeFeed(B.fx, now0), evaluate, now: now0});
  assert.equal(s.capital, 5000); assert.deepEqual(s.symbols, R.symbols()); assert.equal(s.ledger.length, 0); assert.equal(s.stats.calls, 0); // la primera vela aún no cierra tras el inicio
  const now1 = T0 + 1100 * H + 60e3; s = await RUN.runOne({enabled: true, capital: 5000}, JSON.parse(JSON.stringify(s)), 'tick', {feed: RUN.makeFeed(B.fx, now1), evaluate, now: now1});
  assert.equal(s.stats.calls, 100); assert.ok(s.events.some(e => /HYPEUSDT/.test(e.text))); assert.ok(K.verify(s)); assert.equal(s.lastBy, 'jev-local');
  assert.ok(Object.keys(s.decisions).length === R.symbols().length - 1); assert.ok(Object.values(s.decisions).some(d => d.book)); // la última vela usa el libro de órdenes
  s = await RUN.runOne({enabled: true, capital: 5000, kill: true}, s, 'tick', {feed: RUN.makeFeed(B.fx, now1 + 3 * H), evaluate, now: now1 + 3 * H});
  assert.ok(s.kill); assert.equal(Object.keys(s.positions).length, 0); assert.ok(Object.values(s.decisions).every(d => d.action === 'hold'));
  const rep = (await RUN.runOne({enabled: true, kill: true}, s, 'nightly', {now: now1 + 4 * H})).nightly.pop(); assert.ok(rep && typeof rep.note === 'string');
  assert.ok(RUN.compact(s).length < 900000);
});
test('reiniciar desde la app crea una sesión nueva', async () => {
  const B = fakeBinance(1200), now = T0 + 1000 * H; const s = await RUN.runOne({enabled: true}, null, 'tick', {feed: RUN.makeFeed(B.fx, now), evaluate: K.jevEvaluator({}), now});
  const s2 = await RUN.runOne({enabled: true, capital: 777, resetAt: now + 1}, s, 'tick', {feed: RUN.makeFeed(B.fx, now + 2), evaluate: K.jevEvaluator({}), now: now + 2}); assert.equal(s2.capital, 777); assert.notEqual(s2.createdAt, s.createdAt);
});

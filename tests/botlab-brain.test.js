const assert = require('assert'), B = require('../botlab-engine.js'), BR = require('../botlab-brain.js');
assert.deepStrictEqual(BR.limitsFrom('Nunca abro operación sin stop loss. Riesgo máximo 2% por operación y apalancamiento máximo 5x.'), {riskPct: 2, maxLeverage: 5});
assert.deepStrictEqual(BR.cleanPatch({risk: {riskPct: 9, maxLeverage: 20, sl: {type: 'atr', v: 3}}, symbol: 'ETHUSDT', filters: {minVolRatio: 1.2}}), {filters: {minVolRatio: 1.2}, risk: {sl: {type: 'atr', v: 3}}});
assert.strictEqual(BR.parseIdeas('bla [{"title":"x","why":"y","patch":{"risk":{"tp":{"type":"rr","v":3}}}}] fin').length, 1);
// velas sintéticas con tendencias y rangos
let p = 100, t = Date.UTC(2026, 0, 1), seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const C = []; for (let i = 0; i < 3000; i++) { const drift = Math.sin(i / 160) * 0.0012; const o = p; p = Math.max(5, p * (1 + drift + (rnd() - .5) * .018)); const h = Math.max(o, p) * (1 + rnd() * .006), l = Math.min(o, p) * (1 - rnd() * .006); C.push({t, o, h, l, c: p, v: 1000 + rnd() * 900}); t += 36e5; }
const spec = B.normalizeSpec({name: 'Prueba', symbol: 'BTCUSDT', interval: '1h', sides: 'both', entry: {long: [{a: {k: 'ema', n: 9}, op: 'crossUp', b: {k: 'ema', n: 21}}], short: [{a: {k: 'ema', n: 9}, op: 'crossDown', b: {k: 'ema', n: 21}}]}, exit: {long: [], short: []},
  risk: {capital: 10000, riskPct: 2, sizePct: 10, maxLeverage: 5, atrLen: 14, sl: {type: 'atr', v: 2}, tp: {type: 'rr', v: 2}, trail: null, maxBars: 0, maxDailyLossPct: 6, maxDrawdownPct: 25}});
assert(B.validateSpec(spec).ok, B.validateSpec(spec).errors.join());
const base = B.backtest(C, spec, {});
(async () => {
  const fakeAI = async () => ({ok: true, json: async () => ({choices: [{message: {content: '[{"title":"Sube el apalancamiento","why":"x","patch":{"risk":{"maxLeverage":20}}},{"title":"Objetivo 3R","why":"deja correr","patch":{"risk":{"tp":{"type":"rr","v":3}}}}]'}}]})});
  const out = await BR.improve({candles: C, spec, base, opt: null, link: {rules: 'Riesgo máximo 2% y apalancamiento máximo 5x', guide: 'reglas'}, memory: [], now: Date.now(), fetch: fakeAI});
  assert(out.brain.tried.length >= 1, 'probó ideas');
  assert(!out.brain.tried.some(t => /apalancamiento/i.test(t.title) && t.ok), 'nunca acepta subir apalancamiento');
  if (out.candidate) { assert(out.candidate.risk.maxLeverage <= 5 && out.candidate.risk.riskPct <= 2); const c = BR.oosOf(B.backtest(C, out.candidate, {})), b = BR.oosOf(base); assert(c.net > b.net, 'la candidata gana fuera de muestra'); }
  // memoria: lo que falló no se repite
  const again = await BR.improve({candles: C, spec, base, opt: null, link: {rules: ''}, memory: out.memory, now: Date.now(), fetch: fakeAI});
  const failed = out.brain.tried.filter(t => t.ok === false).map(t => t.h);
  assert(again.brain.tried.filter(t => failed.includes(t.h)).every(t => t.skip === 'ya se probó y falló'), 'no repite lo que falló');
  console.log('botlab-brain: OK ·', out.brain.tried.map(t => (t.ok ? '✓ ' : t.skip ? '· ' : '✗ ') + t.title + ' [' + (t.skip || t.verdict) + ']').join(' | '));
})().catch(e => { console.error(e); process.exit(1); });

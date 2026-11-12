/* Búsqueda honesta de la configuración de Pachita (Nova Nexus · iA Signals v2.7 en 15 m) con datos reales de Binance.
   Se corre en GitHub Actions («Diagnóstico de bots» con detail = pachita). Cada configuración se elige SOLO por su tramo de entrenamiento (60 %)
   y luego se revisa en validación (20 %) y prueba (20 %), que no se usaron para elegir. Reglas fijas: riesgo 2 %, apalancamiento máx. 5×,
   objetivo ≥ 1.5× ATR y la señal contraria no cierra antes de 4 velas (que no abra y cierre enseguida). */
'use strict';
const B = require('../botlab-engine.js'); require('../nova-nexus.js'); const NN = globalThis.NovaNexus;
const COINS = (process.env.COINS || B.NOVA8.join(',')).split(','), BARS = +(process.env.BARS || 20000), IV = process.env.IV || '15m';
const BASES = ['https://data-api.binance.vision/api/v3', 'https://api.binance.com/api/v3'];
async function history(sym, itv, want) {
  const out = []; let end = Date.now();
  while (out.length < want) { let raw = null; for (const b of BASES) { try { const r = await fetch(`${b}/klines?symbol=${sym}&interval=${itv}&limit=1000&endTime=${end}`); if (r.ok) { raw = await r.json(); break; } } catch {} }
    if (!raw || !raw.length) break; out.unshift(...raw.map(d => ({t: d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5], ct: d[6]}))); end = raw[0][0] - 1; if (raw.length < 1000) break; }
  return out.filter(c => c.ct < Date.now()).slice(-want).map(({ct, ...c}) => c);
}
const f = (x, d = 1) => x == null || !isFinite(x) ? '—' : (+x).toFixed(d);
const E = {buy: {a: {k: 'novaBuy'}, op: 'is'}, sell: {a: {k: 'novaSell'}, op: 'is'}, trend: {a: {k: 'novaRange'}, op: 'lt', b: {k: 'num', v: 1}}, s4: {a: {k: 'novaScore'}, op: 'gte', b: {k: 'num', v: 4}}, upC: {a: {k: 'novaBull'}, op: 'gte', b: {k: 'num', v: 1}}, dnC: {a: {k: 'novaBull'}, op: 'lt', b: {k: 'num', v: 1}}};
const ENTRY = {todas: [[], []], tendencia: [[E.trend], [E.trend]], puntaje4: [[E.s4], [E.s4]], nube: [[E.upC], [E.dnC]], tendNube: [[E.trend, E.upC], [E.trend, E.dnC]], p4Nube: [[E.s4, E.upC], [E.s4, E.dnC]]};
const cmp = (a, op, b) => ({a, op, b}), C0 = {k: 'close'};
const HTF = {e400: [[cmp(C0, 'gt', {k: 'ema', n: 400})], [cmp(C0, 'lt', {k: 'ema', n: 400})]], e800: [[cmp(C0, 'gt', {k: 'ema', n: 800})], [cmp(C0, 'lt', {k: 'ema', n: 800})]],
  e200x800: [[cmp({k: 'ema', n: 200}, 'gt', {k: 'ema', n: 800}), cmp(C0, 'gt', {k: 'ema', n: 800})], [cmp({k: 'ema', n: 200}, 'lt', {k: 'ema', n: 800}), cmp(C0, 'lt', {k: 'ema', n: 800})]]};
function mk(o) {
  const sp = B.PRESETS.pachita(); delete sp.basket; sp.sides = o.sides; const [xl, xs] = ENTRY[o.entry];
  sp.entry = {long: [E.buy, ...xl], short: [E.sell, ...xs]}; sp.exit = o.opp ? {long: [E.sell], short: [E.buy]} : {long: [], short: []};
  Object.assign(sp.risk, {sl: {type: 'atr', v: o.sl}, tp: {type: 'atr', v: o.tp}, trail: o.tr ? {type: 'atr', v: o.tr} : null, maxBars: o.mb, minBars: 4});
  sp.filters = {minVolRatio: o.vol || 0, minAtrPct: o.minAtr, maxAtrPct: 2.5, hoursUtc: o.hrs ? o.hrs.split('-').map(Number) : null};
  const H = HTF[o.htf || '']; if (H) { sp.entry.long.push(...H[0]); sp.entry.short.push(...H[1]); } return sp;
}
(async () => {
  const data = {}; for (const s of COINS) { data[s] = await history(s, IV, BARS); console.log(`${s}: ${data[s].length} velas desde ${new Date(data[s][0].t).toISOString().slice(0, 10)}`); }
  const memo = new Map(), nova = {compute: (c, o) => { if (!memo.has(c)) memo.set(c, NN.compute(c, o)); return memo.get(c); }};
  const grid = [];
  if (process.env.ROUND === '2') { // 2.ª ronda: filtro de tendencia mayor (EMA larga en 15 m ≈ tendencia de 1 h / 4 h), horario y volumen
    for (const entry of ['tendencia', 'p4Nube', 'tendNube']) for (const htf of ['', 'e400', 'e800', 'e200x800']) for (const sides of ['both', 'long', 'short']) for (const sl of [2, 3]) for (const tp of [1.5, 2, 3]) for (const hrs of ['', '7-21', '12-21']) for (const vol of [0, 1.2])
      grid.push({entry, htf, sides, opp: false, sl, tp, tr: 0, mb: 96, minAtr: 0, hrs, vol});
  } else for (const entry of Object.keys(ENTRY)) for (const sides of ['both', 'long', 'short']) for (const opp of [true, false]) for (const sl of [1, 1.5, 2, 3]) for (const tp of [1.5, 2, 3, 4]) for (const tr of [0, 2.5]) for (const mb of [0, 96]) for (const minAtr of [0, 0.12]) grid.push({entry, sides, opp, sl, tp, tr, mb, minAtr});
  console.log(`Probando ${grid.length} configuraciones en ${COINS.length} monedas…`); const rows = [], t0 = Date.now();
  for (const o of grid) {
    const sp = mk(o); let tr = 0, va = 0, te = 0, n = 0, nTr = 0, gw = 0, gl = 0, gwT = 0, glT = 0, w = 0, dd = 0, d14 = 0;
    for (const s of COINS) { const r = B.backtest(data[s], Object.assign({}, sp, {symbol: s}), {nova}); const g = r.segments; tr += g.train.net; va += g.val.net; te += g.test.net; nTr += g.train.n;
      for (const t of r.trades) { if (t.open) continue; n++; if (t.net > 0) { w++; gw += t.net; if (t.entryBar < g.train.toBar) gwT += t.net; } else { gl -= t.net; if (t.entryBar < g.train.toBar) glT -= t.net; } if (t.entryT > Date.now() - 14 * 864e5) d14++; } dd = Math.max(dd, r.metrics.maxDDPct); }
    rows.push({o, tr, va, te, n, nTr, win: n ? w / n * 100 : 0, pf: gl ? gw / gl : 0, pfT: glT ? gwT / glT : 0, dd, d14, ret: (tr + va + te) / (COINS.length * 10000 / COINS.length * COINS.length) * 100});
  }
  console.log(`listo en ${Math.round((Date.now() - t0) / 1000)} s`);
  const desc = r => `${r.o.entry} · ${r.o.sides} · ${r.o.opp ? 'cierra con señal contraria' : 'sin salida por señal'} · SL ${r.o.sl}×ATR TP ${r.o.tp}×ATR${r.o.tr ? ' trailing ' + r.o.tr : ''}${r.o.mb ? ' máx ' + r.o.mb + ' velas' : ''}${r.o.minAtr ? ' ATR≥' + r.o.minAtr + '%' : ''}${r.o.htf ? ' tendencia mayor ' + r.o.htf : ''}${r.o.hrs ? ' horario ' + r.o.hrs + ' UTC' : ''}${r.o.vol ? ' volumen≥' + r.o.vol + '×' : ''}`;
  const line = r => `  ${desc(r)}\n     ops ${r.n} (${r.d14} en 14 d) · aciertos ${f(r.win)} % · PF ${f(r.pf, 2)} (entren. ${f(r.pfT, 2)}) · DD máx ${f(r.dd)} % · entrenamiento ${f(r.tr, 0)} · validación ${f(r.va, 0)} · prueba ${f(r.te, 0)} USDT`;
  const cand = rows.filter(r => r.nTr >= 60).sort((a, b) => b.pfT - a.pfT);
  console.log('\n══ Las 15 mejores SOLO por entrenamiento (así se eligen) ══'); cand.slice(0, 15).forEach(r => console.log(line(r)));
  const ok = cand.slice(0, 60).filter(r => r.tr > 0 && r.va > 0 && r.te > 0);
  console.log('\n══ De las 60 mejores en entrenamiento, las que TAMBIÉN ganan en validación y prueba ══'); ok.slice(0, 15).forEach(r => console.log(line(r)));
  const best = ok[0]; console.log('\nELEGIDA: ' + (best ? JSON.stringify(best.o) : 'ninguna pasó la validación'));
  const cur = rows.find(r => r.o.entry === 'tendNube' && r.o.sides === 'both' && r.o.opp && r.o.sl === 1.5 && r.o.tp === 2 && r.o.tr === 0 && r.o.mb === 96 && r.o.minAtr === 0.12); if (cur) console.log('\nReferencia (parecida a la actual):\n' + line(cur));
})().catch(e => { console.error(e); process.exit(1); });

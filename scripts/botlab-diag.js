/* Diagnóstico de Nova Bot Lab (se corre a mano en GitHub Actions: «Diagnóstico de bots»).
   1) Por qué los bots «Seguro 1h/4h» y «Nova Nexus + volumen» no operan: qué condición los frena en las últimas semanas.
   2) Optimización honesta del indicador Nova Nexus · iA Signals v2.7 como bot: prueba SL/TP, filtros y salidas en varias monedas y
      temporalidades, y solo da por buena una configuración si también gana FUERA de la muestra de entrenamiento (validación + prueba). */
const B = require('../botlab-engine.js'); require('../nova-nexus.js'); const NN = globalThis.NovaNexus;
const {history} = require('./botlab-retrain.js');
const COINS = (process.env.COINS || 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,AVAXUSDT,LINKUSDT,SUIUSDT').split(',');
const BARS = {'15m': 6000, '1h': 6000, '4h': 3000};
const f = (x, d = 1) => x == null || !isFinite(x) ? '—' : (+x).toFixed(d);
const memo = new Map(), novaFor = C => ({compute: (c, o) => { const k = c; if (!memo.has(k)) memo.set(k, NN.compute(c, o)); return memo.get(k); }});

function why(spec, C) { // qué condición de entrada se cumple y cuál no en las últimas 14 días
  const ctx = {cache: {}, nova: novaFor(C)}, iv = B.IV_MS[spec.interval], from = Math.max(1, C.length - Math.round(14 * 864e5 / iv)), L = spec.entry.long.length ? spec.entry.long : spec.entry.short;
  const hits = L.map(() => 0); let all = 0, lastAll = null;
  for (let i = from; i < C.length; i++) { let ok = true; L.forEach((cd, k) => { const s = B.series(C, cd.a, ctx); if (condOkPub(cd, i, C, ctx)) hits[k]++; else ok = false; }); if (ok) { all++; lastAll = C[i].t; } }
  const n = C.length - from; return {n, cond: L.map((cd, k) => `${B.condText(cd)}: ${f(hits[k] / n * 100, 0)} %`), all, lastAll};
}
function condOkPub(cd, i, C, ctx) { const a = B.series(C, cd.a, ctx), av = a[i]; if (av == null) return false; if (cd.op === 'is') return av > 0; const b = B.series(C, cd.b, ctx), bv = b[i]; if (bv == null) return false;
  return cd.op === 'gt' ? av > bv : cd.op === 'lt' ? av < bv : cd.op === 'gte' ? av >= bv : cd.op === 'lte' ? av <= bv : cd.op === 'crossUp' ? a[i - 1] <= b[i - 1] && av > bv : cd.op === 'crossDown' ? a[i - 1] >= b[i - 1] && av < bv : false; }

function pool(rs) { // junta las operaciones de varias monedas (cada una con su capital) en métricas comunes
  const T = rs.flatMap(r => r.trades.filter(t => !t.open)), n = T.length, w = T.filter(t => t.net > 0), gw = w.reduce((a, t) => a + t.net, 0), gl = -T.filter(t => t.net <= 0).reduce((a, t) => a + t.net, 0);
  const seg = k => rs.reduce((a, r) => a + r.segments[k].net, 0), segN = k => rs.reduce((a, r) => a + r.segments[k].n, 0);
  return {n, win: n ? w.length / n * 100 : 0, pf: gl ? gw / gl : (gw ? 99 : 0), ret: rs.reduce((a, r) => a + r.metrics.retPct, 0) / rs.length, dd: Math.max(...rs.map(r => r.metrics.maxDDPct)), tr: seg('train'), va: seg('val'), te: seg('test'), nVa: segN('val'), nTe: segN('test'), avgR: n ? T.reduce((a, t) => a + (t.r || 0), 0) / n : 0, perDay: 0};
}

(async () => {
  if (process.env.DETAIL === '2') { // prueba final de los bots tal como quedan configurados
    const list = [['pachita'], ['safe1h'], ['safe4h'], ['nova27x4h'], ['nova27x1h'], ['lucas1h'], ['lucas4h'], ['novaVol', B.novaVolBoth(B.PRESETS.novaNexus())]];
    for (const [k, sp0] of list) { const sp = sp0 || B.PRESETS[k](), syms = sp.basket || [sp.symbol], by = {}, n = sp.interval === '4h' ? 3000 : sp.interval === '15m' ? 8000 : 6000; for (const s of syms) by[s] = await history(s, sp.interval, n);
      const r = sp.basket ? B.backtestBasket(by, sp, {nova: NN}) : B.backtest(by[sp.symbol], sp, {nova: NN}), m = r.metrics, g = r.segments, d14 = r.trades.filter(t => t.entryT > Date.now() - 14 * 864e5).length;
      console.log(`\n${sp.name} · ${sp.interval} · ${syms.length} monedas · ${m.days} días\n  ops ${m.n} (${d14} en los últimos 14 d; ${r.trades.filter(t => t.side === 'long').length} compras / ${r.trades.filter(t => t.side === 'short').length} ventas) · aciertos ${f(m.winRate)} % · PF ${f(m.profitFactor, 2)} · retorno ${f(m.retPct)} % · DD máx ${f(m.maxDDPct)} %\n  entrenamiento ${f(g.train.net, 0)} · validación ${f(g.val.net, 0)} · prueba ${f(g.test.net, 0)} USDT · veredicto: ${r.verdict.level}`); }
    return;
  }
  const data = {}; for (const iv of Object.keys(BARS)) for (const s of COINS) { try { data[s + iv] = await history(s, iv, BARS[iv]); } catch (e) { console.log('sin velas', s, iv, e.message); } }
  const D = (s, iv) => data[s + iv];

  if (!process.env.DETAIL) {
  console.log('\n══════ 1) DIAGNÓSTICO DE LOS BOTS ACTUALES (últimos 14 días) ══════');
  for (const [k, sp0] of [['safe1h', B.PRESETS.safe1h()], ['safe4h', B.PRESETS.safe4h()]]) {
    console.log(`\n· ${sp0.name}`);
    for (const s of sp0.basket) { const C = D(s, sp0.interval); if (!C) continue; const w = why(sp0, C), sp = JSON.parse(JSON.stringify(sp0)); sp.symbol = s; delete sp.basket; const r = B.backtest(C, sp, {nova: novaFor(C)}); const last14 = r.trades.filter(t => t.entryT > Date.now() - 14 * 864e5).length;
      console.log(`  ${s}: entradas con TODO cumplido en 14 d = ${w.all} (última ${w.lastAll ? new Date(w.lastAll).toISOString().slice(0, 16) : 'nunca'}) · ops en histórico ${r.trades.length} (${last14} en 14 d) · precio ${C[C.length - 1].c}`); console.log('     ' + w.cond.join(' | ')); }
  }
  { const sp = B.PRESETS.novaNexus(), C = D('BTCUSDT', '1h'); const w = why(sp, C), r = B.backtest(C, sp, {nova: novaFor(C)}); console.log(`\n· ${sp.name} (BTCUSDT 1h): entradas posibles en 14 d = ${w.all} · ops histórico ${r.trades.length}`); console.log('     ' + w.cond.join(' | '));
    const sig = NN.compute(C).signals.filter(x => x.t > Date.now() - 14 * 864e5); console.log(`     señales Nova Nexus en 14 d: ${sig.length} (${sig.filter(x => x.side === 'buy').length} compra / ${sig.filter(x => x.side === 'sell').length} venta)`); }

  console.log('\n══════ 2) SEÑALES v2.7 POR MONEDA Y TEMPORALIDAD (últimos 30 días) ══════');
  for (const iv of Object.keys(BARS)) console.log(iv + ': ' + COINS.map(s => { const C = D(s, iv); if (!C) return s + ' —'; const g = NN.compute(C).signals.filter(x => x.t > Date.now() - 30 * 864e5); return s.replace('USDT', '') + ' ' + g.length; }).join(' · '));

  }
  console.log('\n══════ 3) OPTIMIZACIÓN v2.7 (cesta de ' + COINS.length + ' monedas; riesgo 1 %/op; comisión 0.05 % + slippage 0.03 %) ══════');
  const DETAIL = process.env.DETAIL === '1', IVS = DETAIL ? ['1h', '4h'] : Object.keys(BARS);
  const SL = DETAIL ? [2, 2.5, 3, 4] : [1, 1.5, 2, 3], TP = [['atr', 1], ['atr', 1.5], ['atr', 2.5], ['atr', 4], ['rr', 1], ['rr', 2]], SC = [1, 3, 4], REG = ['all', 'trend', 'range'], SIDES = ['both', 'long', 'short'], EX = ['opp', 'none'], TR = [null, 2];
  for (const iv of IVS) {
    const rows = [];
    for (const sides of SIDES) for (const sc of SC) for (const reg of REG) for (const ex of EX) for (const sl of SL) for (const [tt, tv] of TP) for (const tr of TR) {
      const extra = c => { const o = []; if (sc > 1) o.push({a: {k: 'novaScore'}, op: 'gte', b: {k: 'num', v: sc}}); if (reg === 'trend') o.push({a: {k: 'novaRange'}, op: 'lt', b: {k: 'num', v: 1}}); if (reg === 'range') o.push({a: {k: 'novaRange'}, op: 'is'}); return o; };
      const spec = Object.assign(B.defaultSpec(), {name: 'opt', interval: iv, sides, entry: {long: [{a: {k: 'novaBuy'}, op: 'is'}, ...extra()], short: [{a: {k: 'novaSell'}, op: 'is'}, ...extra()]},
        exit: {long: ex === 'opp' ? [{a: {k: 'novaSell'}, op: 'is'}] : [], short: ex === 'opp' ? [{a: {k: 'novaBuy'}, op: 'is'}] : []},
        risk: {capital: 10000, riskPct: 1, sizePct: 10, maxLeverage: 5, atrLen: 14, sl: {type: 'atr', v: sl}, tp: {type: tt, v: tv}, trail: tr ? {type: 'atr', v: tr} : null, maxBars: 0, maxDailyLossPct: 0, maxDrawdownPct: 0}, costs: {feePct: 0.05, slipPct: 0.03}});
      if (tr && tt === 'atr' && tv <= 1.5) continue;
      const rs = []; for (const s of COINS) { const C = D(s, iv); if (!C) continue; const sp = JSON.parse(JSON.stringify(spec)); sp.symbol = s; try { rs.push(B.backtest(C, sp, {nova: novaFor(C)})); } catch (e) {} }
      if (!rs.length) continue; const p = pool(rs); p.cfg = `${sides} · score≥${sc} · ${reg} · SL ${sl}×ATR · TP ${tv}${tt === 'rr' ? 'R' : '×ATR'}${tr ? ' · trailing ' + tr + '×ATR' : ''} · salida ${ex === 'opp' ? 'señal contraria' : 'solo SL/TP'}`; rows.push(p);
    }
    const days = Math.round(BARS[iv] * B.IV_MS[iv] / 864e5);
    const good = rows.filter(r => r.n >= 40 && r.va > 0 && r.te > 0 && r.pf >= 1.15 && r.nVa >= 5 && r.nTe >= 5);
    const show = (t, list) => { console.log(`\n  ${iv} (${days} días) · ${t}`); for (const r of list.slice(0, 8)) console.log(`   ${r.cfg}\n      ops ${r.n} (${f(r.n / days, 2)}/día) · aciertos ${f(r.win)} % · PF ${f(r.pf, 2)} · retorno prom. ${f(r.ret)} % · DD máx ${f(r.dd)} % · fuera de muestra: val ${f(r.va, 0)} / prueba ${f(r.te, 0)} USDT`); };
    show('MEJOR BALANCE (gana también fuera de muestra) ordenado por profit factor', good.slice().sort((a, b) => b.pf - a.pf));
    show('MÁS ACIERTOS (gana también fuera de muestra)', good.slice().sort((a, b) => b.win - a.win));
    console.log(`  (${good.length} de ${rows.length} combinaciones pasan la validación)`);
    if (DETAIL) for (const sd of ['long', 'short', 'both']) show('TOP ' + sd + ' por resultado FUERA de muestra (val+prueba), pase o no', rows.filter(r => r.cfg.startsWith(sd + ' ') && r.n >= 30).sort((a, b) => (b.va + b.te) - (a.va + a.te)));
  }
})().catch(e => { console.error(e); process.exit(1); });

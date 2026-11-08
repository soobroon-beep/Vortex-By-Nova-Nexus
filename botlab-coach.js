/* NOVA BOT LAB · entrenador de cada bot (puro, sin DOM; se prueba en tests/botlab-coach.test.js).
   Lee las reglas EXACTAS del bot y su último backtest (más el análisis en otras monedas si existe) y devuelve:
   · summary(): cómo va el bot, en lenguaje sencillo.
   · tips(): consejos concretos para ESE bot, cada uno con un «patch» aplicable (fragmento de la especificación) y el motivo con sus números reales.
   Nada se aplica solo: la app crea una versión nueva con el consejo, la prueba y solo la deja como principal si no empeora fuera de muestra. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./botlab-engine.js')); else root.CCTBotCoach = factory(root.CCTBotLab);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (B) {
  'use strict';
  const IVS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d'];
  const clone = o => JSON.parse(JSON.stringify(o)), n1 = x => (Math.round(x * 10) / 10).toLocaleString('es'), n0 = x => Math.round(x).toLocaleString('es');
  const money = x => (x < 0 ? '−$' : '$') + Math.abs(x).toLocaleString('es', {maximumFractionDigits: 0});
  /* Mezcla un patch sobre la especificación: los objetos se combinan; listas y valores se sustituyen completos. */
  function merge(a, p) { if (p === null || typeof p !== 'object' || Array.isArray(p)) return p; const o = Object.assign({}, a && typeof a === 'object' && !Array.isArray(a) ? a : {}); for (const k of Object.keys(p)) o[k] = merge(o[k], p[k]); return o; }
  function apply(spec, patch) { return B.normalizeSpec(merge(clone(B.normalizeSpec(spec)), patch || {})); }
  const sideLists = s => s.sides === 'short' ? ['short'] : s.sides === 'long' ? ['long'] : ['long', 'short'];
  const hasCond = (list, f) => (list || []).some(f);
  const isEma200 = c => c && c.a && c.a.k === 'close' && c.b && c.b.k === 'ema' && c.b.n === 200;
  const isRsi = c => c && c.a && c.a.k === 'rsi';

  function summary(spec, run, live) {
    const s = B.normalizeSpec(spec);
    if (!run) return {level: 'sin-datos', title: 'Aún no hay datos', lines: ['Este bot todavía no se ha probado. Toca «Probar» y en segundos verás cómo le habría ido con velas reales.']};
    const m = run.metrics, sg = run.segments, bh = run.buyHold, L = [];
    L.push(`En ${run.bars} velas de ${s.symbol} ${s.interval} hizo ${m.n} operaciones: ${m.retPct >= 0 ? 'ganó' : 'perdió'} ${n1(Math.abs(m.retPct))} % (${money(m.net)}), con ${m.winRate == null ? '—' : n0(m.winRate) + ' %'} de aciertos y una caída máxima de ${n1(m.maxDDPct)} %.`);
    L.push(m.retPct > bh.retPct ? `Le ganó a simplemente comprar y mantener (${bh.retPct >= 0 ? '+' : ''}${n1(bh.retPct)} %).` : `No le ganó a comprar y mantener (${bh.retPct >= 0 ? '+' : ''}${n1(bh.retPct)} %).`);
    const oos = [sg.val, sg.test].filter(x => x.n > 0);
    if (oos.length) L.push(oos.every(x => x.net > 0) ? 'En los datos que no usó para armarse (validación y prueba) también gana: buena señal.' : 'En los datos que no usó para armarse (validación y prueba) pierde: el resultado podría ser casualidad o sobreajuste.');
    if (m.n < 30) L.push(`Con solo ${m.n} operaciones todavía es muy pronto para fiarse.`);
    if (live && live.n) L.push(`En vivo (simulado) lleva ${live.n} operaciones cerradas: ${live.retPct >= 0 ? '+' : ''}${n1(live.retPct)} %${live.winRate != null ? `, ${n0(live.winRate)} % de aciertos` : ''}.`);
    const level = m.net <= 0 ? 'mal' : run.verdict && run.verdict.level === 'consistente' ? 'bien' : 'regular';
    return {level, title: level === 'bien' ? 'Va bien' : level === 'mal' ? 'Va mal' : 'Va regular', lines: L};
  }

  /* Consejos para ESTE bot. sweeps = {rows:[{symbol, interval, n, retPct, win}]} del análisis en otros mercados (opcional). */
  function tips(spec, run, sweeps) {
    const s = B.normalizeSpec(spec), out = [], add = t => { const sp = apply(s, t.patch); if (JSON.stringify(sp) === JSON.stringify(s)) return; if (!B.validateSpec(sp).ok) return; if (!out.some(x => x.id === t.id)) out.push(t); };
    const r = s.risk, f = s.filters, sides = sideLists(s);
    if (!r.sl) add({id: 'sl', kind: 'riesgo', title: 'Ponle un stop loss', why: 'Ahora no tiene stop loss: una sola operación mala puede llevarse mucho capital. Un stop de 2× ATR se adapta a la volatilidad.', patch: {risk: {sl: {type: 'atr', v: 2}}}});
    if (!run) return out;
    const m = run.metrics, sg = run.segments, bd = run.breakdown || {}, wr = m.winRate, rr = m.rr;
    // tendencia: pierde contra la tendencia de fondo ⇒ filtro EMA 200
    const tr = bd.trend || {}, against = sides.length === 1 && sides[0] === 'long' ? tr.bajista : sides[0] === 'short' && sides.length === 1 ? tr.alcista : null;
    if ((against && against.n >= 5 && against.net < 0) || (wr != null && wr < 45 && m.n >= 15)) {
      const p = {entry: {}}; for (const k of sides) { if (hasCond(s.entry[k], isEma200)) continue; p.entry[k] = s.entry[k].concat([{a: {k: 'close'}, op: k === 'long' ? 'gt' : 'lt', b: {k: 'ema', n: 200}}]); }
      if (Object.keys(p.entry).length) add({id: 'trend', kind: 'reglas', title: 'Opera solo a favor de la tendencia', why: against && against.n >= 5 && against.net < 0 ? `Las ${against.n} entradas contra la tendencia de fondo perdieron ${money(against.net)}. Exigir que el precio esté del lado correcto de la EMA 200 las evita.` : `Acierta solo ${n0(wr)} %. Filtrar con la EMA 200 suele quitar entradas de baja calidad y subir el porcentaje de aciertos.`, patch: p});
    }
    // confirmación de fuerza con RSI para subir aciertos
    if (wr != null && wr < 50 && m.n >= 15) {
      const p = {entry: {}}; for (const k of sides) { if (hasCond(s.entry[k], isRsi)) continue; p.entry[k] = s.entry[k].concat([{a: {k: 'rsi', n: 14}, op: k === 'long' ? 'gt' : 'lt', b: {k: 'num', v: 50}}]); }
      if (Object.keys(p.entry).length) add({id: 'rsi', kind: 'reglas', title: 'Pide confirmación de fuerza (RSI 14 sobre 50)', why: `Con ${n0(wr)} % de aciertos le conviene entrar solo cuando el impulso acompaña. Es el cambio más directo para subir el win rate, a cambio de operar menos.`, patch: p});
    }
    // objetivo vs aciertos
    if (r.sl && wr != null && wr < 35 && rr != null && rr > 2 && m.n >= 15) add({id: 'tpNear', kind: 'riesgo', title: 'Toma ganancias antes (objetivo 1,5× el riesgo)', why: `Acierta solo ${n0(wr)} % pero cuando gana, gana ${n1(rr)} veces lo que pierde. Un objetivo más cercano se alcanza más seguido: sube el win rate aunque cada ganancia sea menor.`, patch: {risk: {tp: {type: 'rr', v: 1.5}}}});
    if (r.sl && wr != null && wr > 55 && rr != null && rr < 1 && m.n >= 15) { const v = r.tp && r.tp.type === 'rr' ? Math.max(1.5, Math.round(r.tp.v * 15) / 10) : 2; add({id: 'tpFar', kind: 'riesgo', title: `Deja correr las ganancias (objetivo ${n1(v)}× el riesgo)`, why: `Acierta ${n0(wr)} %, pero la ganancia media es menor que la pérdida media (ratio ${n1(rr)}). Un objetivo más lejano equilibra la cuenta.`, patch: {risk: {tp: {type: 'rr', v}}}}); }
    // riesgo
    if (m.maxDDPct > 20) add({id: 'dd', kind: 'riesgo', title: 'Baja el riesgo por operación a la mitad', why: `Su caída máxima fue ${n1(m.maxDDPct)} %. Arriesgar ${n1(r.riskPct / 2)} % en lugar de ${n1(r.riskPct)} % la reduce casi a la mitad${r.maxDailyLossPct ? '' : ' y además se pausa el día si pierde 3 %'}.`, patch: {risk: Object.assign({riskPct: Math.max(0.1, Math.round(r.riskPct * 5) / 10)}, r.maxDailyLossPct ? {} : {maxDailyLossPct: 3})}});
    // horario que pierde
    const hrs = Object.entries(bd.hour || {}).filter(([, v]) => v.n >= 5 && v.net < 0).sort((a, c) => a[1].net - c[1].net)[0];
    if (hrs && !f.hoursUtc) { const h = +hrs[0]; add({id: 'hours', kind: 'filtro', title: `Evita operar de ${h}:00 a ${h + 4}:00 UTC`, why: `En ese horario hizo ${hrs[1].n} operaciones y perdió ${money(hrs[1].net)} (${n0(hrs[1].wins / hrs[1].n * 100)} % de aciertos).`, patch: {filters: {hoursUtc: [(h + 4) % 24, h]}}}); }
    // volatilidad que pierde
    const vb = (bd.vol || {}).baja, va = (bd.vol || {}).alta;
    if (vb && vb.n >= 5 && vb.net < 0 && !f.minAtrPct) add({id: 'volLow', kind: 'filtro', title: 'No operes cuando el mercado está dormido', why: `Con volatilidad baja hizo ${vb.n} operaciones y perdió ${money(vb.net)}. Exigir un ATR mínimo de 0,3 % del precio las evita.`, patch: {filters: {minAtrPct: 0.3}}});
    if (va && va.n >= 5 && va.net < 0 && !f.maxAtrPct) add({id: 'volHigh', kind: 'filtro', title: 'Apártate cuando el mercado está muy nervioso', why: `Con volatilidad alta hizo ${va.n} operaciones y perdió ${money(va.net)}. Un ATR máximo de 1,5 % del precio las evita.`, patch: {filters: {maxAtrPct: 1.5}}});
    if (!f.minVolRatio && wr != null && wr < 50 && m.n >= 20) add({id: 'volume', kind: 'filtro', title: 'Entra solo con volumen por encima de lo normal', why: 'Las rupturas con poco volumen fallan más seguido. Pedir volumen 1,2× su media filtra señales débiles.', patch: {filters: {minVolRatio: 1.2}}});
    // un lado pierde
    const sd = bd.side || {}; if (s.sides === 'both' && sd.long && sd.short) { const lose = sd.long.net < 0 && sd.short.net > 0 ? 'long' : sd.short.net < 0 && sd.long.net > 0 ? 'short' : null; if (lose && sd[lose].n >= 5) add({id: 'side', kind: 'reglas', title: lose === 'long' ? 'Quédate solo con las ventas (cortos)' : 'Quédate solo con las compras (largos)', why: `Las ${lose === 'long' ? 'compras' : 'ventas'} perdieron ${money(sd[lose].net)} en ${sd[lose].n} operaciones mientras el otro lado ganó.`, patch: {sides: lose === 'long' ? 'short' : 'long'}}); }
    // sobreajuste
    if (sg.train.net > 0 && sg.val.n + sg.test.n >= 5 && (sg.val.net <= 0 || sg.test.net <= 0)) for (const k of sides) if (s.entry[k].length > 1) { add({id: 'simplify', kind: 'reglas', title: 'Simplifica la entrada (quita la última condición)', why: 'Gana con los datos con los que se armó pero pierde en los que no vio: suele ser sobreajuste. Menos condiciones = reglas más robustas.', patch: {entry: {[k]: s.entry[k].slice(0, -1)}}}); break; }
    // temporalidad
    const ii = IVS.indexOf(s.interval);
    if (m.n >= 20 && m.fees > Math.abs(m.net) * 0.5 && ii >= 0 && ii < IVS.length - 1) add({id: 'ivUp', kind: 'temporalidad', title: `Pásalo a ${IVS[ii + 1]}`, why: `Las comisiones (${money(m.fees)}) se comen gran parte del resultado. En ${IVS[ii + 1]} opera menos y cada operación vale más.`, patch: {interval: IVS[ii + 1]}});
    else if (m.n < 30 && ii > 0) add({id: 'ivDown', kind: 'temporalidad', title: `Pruébalo en ${IVS[ii - 1]} para tener más muestra`, why: `Solo ${m.n} operaciones: muy pocas para saber si funciona. En ${IVS[ii - 1]} tendrá más señales con el mismo historial.`, patch: {interval: IVS[ii - 1]}});
    // activos: del análisis en otros mercados
    const rows = (sweeps && sweeps.rows || []).filter(x => !x.err && x.n >= 20 && x.retPct > Math.max(0, m.retPct) && !(x.symbol === s.symbol && x.interval === s.interval)).sort((a, c) => c.retPct - a.retPct);
    if (rows[0]) { const x = rows[0]; add({id: 'asset', kind: 'activo', title: `Llévalo a ${x.symbol.replace('USDT', '')} ${x.interval}`, why: `En el análisis en otros mercados, ${x.symbol} ${x.interval} rindió ${x.retPct >= 0 ? '+' : ''}${n1(x.retPct)} % con ${x.n} operaciones${x.win != null ? ` y ${n0(x.win)} % de aciertos` : ''}, mejor que ${s.symbol} ${s.interval} (${m.retPct >= 0 ? '+' : ''}${n1(m.retPct)} %).`, patch: {symbol: x.symbol, interval: x.interval}}); }
    return out;
  }
  /* Valida consejos que vengan de la IA: solo pasan los que producen una especificación válida y distinta. */
  function validTip(spec, t) { if (!t || !t.patch || typeof t.patch !== 'object') return false; try { const s = B.normalizeSpec(spec), sp = apply(s, t.patch); return B.validateSpec(sp).ok && JSON.stringify(sp) !== JSON.stringify(s); } catch { return false; } }
  return {summary, tips, apply, merge, validTip, IVS};
});

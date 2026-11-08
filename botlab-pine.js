/* NOVA BOT LAB · convierte un bot en un indicador para el gráfico de VORTEX (con el mismo motor de scripts del gráfico).
   Dibuja las señales del bot: ▲ C = compra, ▼ V = venta (corto), ● X = salida (regla, stop o objetivo). Sigue la posición como el bot: no repite entradas mientras está dentro.
   Limitaciones honestas: con indicadores Nova o tus indicadores propios no se puede convertir; en una cesta, el indicador se aplica a la moneda que tengas abierta. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./botlab-engine.js')); else root.CCTBotPine = factory(root.CCTBotLab);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (B) {
  'use strict';
  function toPine(specIn) {
    const s = B.normalizeSpec(specIn), pre = [], seen = new Map(); let k = 0;
    const v = name => { if (!seen.has(name)) seen.set(name, null); return name; };
    const val = o => {
      const P = Object.assign({}, (B.OPERANDS[o.k] || {}).p || {}, o);
      switch (o.k) {
        case 'close': case 'open': case 'high': case 'low': case 'volume': return o.k;
        case 'num': return String(+P.v);
        case 'ema': case 'sma': { const n = `${o.k}_${P.n}`; if (!seen.has(n)) { pre.push(`${n} = ta.${o.k}(close, ${P.n})`); v(n); } return n; }
        case 'rsi': { const n = `rsi_${P.n}`; if (!seen.has(n)) { pre.push(`${n} = ta.rsi(close, ${P.n})`); v(n); } return n; }
        case 'atr': { const n = `atr_${P.n}`; if (!seen.has(n)) { pre.push(`${n} = ta.atr(${P.n})`); v(n); } return n; }
        case 'adx': { const n = `adx_${P.n}`; if (!seen.has(n)) { pre.push(`[dip_${P.n}, dim_${P.n}, ${n}] = ta.dmi(${P.n}, ${P.n})`); v(n); } return n; }
        case 'macd': case 'macdSignal': case 'macdHist': { const b = `m_${P.f}_${P.s}_${P.g}`; if (!seen.has(b)) { pre.push(`[${b}_l, ${b}_s, ${b}_h] = ta.macd(close, ${P.f}, ${P.s}, ${P.g})`); v(b); } return b + (o.k === 'macd' ? '_l' : o.k === 'macdSignal' ? '_s' : '_h'); }
        case 'bbUp': case 'bbMid': case 'bbLo': { const b = `bb_${P.n}_${String(P.d).replace('.', '_')}`; if (!seen.has(b)) { pre.push(`[${b}_m, ${b}_u, ${b}_l] = ta.bb(close, ${P.n}, ${P.d})`); v(b); } return b + (o.k === 'bbUp' ? '_u' : o.k === 'bbMid' ? '_m' : '_l'); }
        case 'volRatio': { const n = `vr_${P.n}`; if (!seen.has(n)) { pre.push(`${n} = volume / ta.sma(volume, ${P.n})`); v(n); } return n; }
        case 'hh': { const n = `hh_${P.n}`; if (!seen.has(n)) { pre.push(`${n} = ta.highest(high, ${P.n})`); v(n); } return n; }
        case 'll': { const n = `ll_${P.n}`; if (!seen.has(n)) { pre.push(`${n} = ta.lowest(low, ${P.n})`); v(n); } return n; }
      }
      throw new Error(o.k === 'user' || /^nova/.test(o.k) ? 'Este bot usa indicadores Nova o tuyos: no se puede convertir en indicador. Usa «Ver en el gráfico».' : 'Indicador no soportado: ' + o.k);
    };
    const cond = c => { const a = val(c.a); if (c.op === 'is') return `(${a} > 0)`; const b = val(c.b); return {gt: `(${a} > ${b})`, lt: `(${a} < ${b})`, gte: `(${a} >= ${b})`, lte: `(${a} <= ${b})`, crossUp: `ta.crossover(${a}, ${b})`, crossDown: `ta.crossunder(${a}, ${b})`}[c.op]; };
    const all = l => l.length ? l.map(cond).join(' and ') : 'false', any = l => l.length ? l.map(cond).join(' or ') : 'false';
    const r = s.risk, f = s.filters, L = s.sides !== 'short', S = s.sides !== 'long';
    const eL = all(s.entry.long), xL = any(s.exit.long), eS = all(s.entry.short), xS = any(s.exit.short);
    const flt = []; if (f.minVolRatio) flt.push(`volume / ta.sma(volume, 20) >= ${f.minVolRatio}`); if (f.minAtrPct) flt.push(`atrv / close * 100 >= ${f.minAtrPct}`); if (f.maxAtrPct) flt.push(`atrv / close * 100 <= ${f.maxAtrPct}`);
    if (f.hoursUtc) { const [a, b] = f.hoursUtc; flt.push(a <= b ? `(hour(time, "UTC") >= ${a} and hour(time, "UTC") < ${b})` : `(hour(time, "UTC") >= ${a} or hour(time, "UTC") < ${b})`); }
    const slD = r.sl ? (r.sl.type === 'atr' ? `atrv * ${r.sl.v}` : `close * ${r.sl.v / 100}`) : null;
    const tpD = r.tp ? (r.tp.type === 'rr' ? (slD ? `(${slD}) * ${r.tp.v}` : null) : r.tp.type === 'atr' ? `atrv * ${r.tp.v}` : `close * ${r.tp.v / 100}`) : null;
    const name = ('Bot · ' + s.name).replace(/["\\\n]/g, '').slice(0, 60);
    const code = [`//@version=5`, `indicator("${name}", overlay=true)`, `// Señales del bot «${s.name.replace(/\n/g, ' ')}» de Nova Bot Lab (${s.interval}). Se evalúan con la vela cerrada, igual que el bot.`,
      `atrv = ta.atr(${r.atrLen})`, ...pre, `okFilters = ${flt.length ? flt.join(' and ') : 'true'}`,
      `longIn = ${L ? eL : 'false'}`, `longOut = ${L ? xL : 'false'}`, `shortIn = ${S ? eS : 'false'}`, `shortOut = ${S ? xS : 'false'}`,
      `var int pos = 0`, `var float sl = na`, `var float tp = na`, `var int bars = 0`, `buySig = false`, `sellSig = false`, `exitSig = false`,
      `if pos != 0`, `    bars += 1`, `    hitSL = not na(sl) and (pos == 1 ? low <= sl : high >= sl)`, `    hitTP = not na(tp) and (pos == 1 ? high >= tp : low <= tp)`, `    hitT = ${r.maxBars ? `bars >= ${r.maxBars}` : 'false'}`,
      `    if hitSL or hitTP or hitT or (pos == 1 and longOut) or (pos == -1 and shortOut)`, `        exitSig := true`, `        pos := 0`,
      `if pos == 0 and not exitSig and okFilters`, `    if longIn`, `        pos := 1`, `        bars := 0`, `        buySig := true`, `        sl := ${slD ? `close - ${slD}` : 'na'}`, `        tp := ${tpD ? `close + ${tpD}` : 'na'}`,
      `    else if shortIn`, `        pos := -1`, `        bars := 0`, `        sellSig := true`, `        sl := ${slD ? `close + ${slD}` : 'na'}`, `        tp := ${tpD ? `close - ${tpD}` : 'na'}`,
      `plotshape(buySig, "Compra", shape.triangleup, location.belowbar, color.new(#20bf9f, 0), size = size.small, text = "C", textcolor = color.new(#20bf9f, 0))`,
      `plotshape(sellSig, "Venta", shape.triangledown, location.abovebar, color.new(#f06b79, 0), size = size.small, text = "V", textcolor = color.new(#f06b79, 0))`,
      `plotshape(exitSig, "Salida", shape.circle, location.abovebar, color.new(#f0b90b, 0), size = size.tiny, text = "X", textcolor = color.new(#f0b90b, 0))`,
      `plot(pos != 0 ? sl : na, "Stop", color.new(#f06b79, 40), style = plot.style_linebr)`, `plot(pos != 0 ? tp : na, "Objetivo", color.new(#20bf9f, 40), style = plot.style_linebr)`].join('\n');
    return {code, name};
  }
  return {toPine};
});

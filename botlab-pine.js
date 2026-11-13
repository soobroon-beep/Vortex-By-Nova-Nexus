/* NOVA BOT LAB · convierte un bot en un indicador para el gráfico de VORTEX (con el mismo motor de scripts del gráfico).
   Dibuja las señales del bot como cajitas COMPRA / VENTA (como IA Signals de Nova Nexus) y, mientras la operación sigue abierta, su entrada, stop (SL) y objetivo (TP); al cerrar marca TP, SL o Cierre. Sigue la posición como el bot: no repite entradas mientras está dentro.
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
    const code = [`//@version=5`, `indicator("${name}", overlay=true, max_labels_count=500, max_lines_count=500)`, `// Señales del bot «${s.name.replace(/\n/g, ' ')}» de Nova Bot Lab (${s.interval}), como cajitas COMPRA / VENTA (estilo IA Signals) con su entrada, stop (SL) y objetivo (TP). Se evalúan con la vela cerrada, igual que el bot.`,
      `atrv = ta.atr(${r.atrLen})`, ...pre, `okFilters = ${flt.length ? flt.join(' and ') : 'true'}`,
      `longIn = ${L ? eL : 'false'}`, `longOut = ${L ? xL : 'false'}`, `shortIn = ${S ? eS : 'false'}`, `shortOut = ${S ? xS : 'false'}`,
      `var int pos = 0`, `var float sl = na`, `var float tp = na`, `var float ent = na`, `var int bars = 0`, `var line lE = na`, `var line lS = na`, `var line lT = na`, `var label tS = na`, `var label tT = na`,
      `exitNow = false`, `why = ""`,
      `if pos != 0`, `    bars += 1`, `    hitSL = not na(sl) and (pos == 1 ? low <= sl : high >= sl)`, `    hitTP = not na(tp) and (pos == 1 ? high >= tp : low <= tp)`, `    hitT = ${r.maxBars ? `bars >= ${r.maxBars}` : 'false'}`,
      `    line.set_x2(lE, bar_index)`, `    line.set_x2(lS, bar_index)`, `    line.set_x2(lT, bar_index)`, `    label.set_x(tS, bar_index)`, `    label.set_x(tT, bar_index)`,
      `    if hitSL or hitTP or hitT or (pos == 1 and longOut) or (pos == -1 and shortOut)`, `        exitNow := true`, `        px = hitSL ? sl : hitTP ? tp : close`, `        rp = (px / ent - 1) * 100 * pos`, `        why := (hitSL ? "SL" : hitTP ? "TP" : "Cierre") + " " + (rp >= 0 ? "+" : "") + str.tostring(rp, "#.#") + "%"`,
      `        label.new(bar_index, pos == 1 ? high : low, why, yloc = pos == 1 ? yloc.abovebar : yloc.belowbar, style = pos == 1 ? label.style_label_down : label.style_label_up, color = color.new(hitTP ? #20bf9f : hitSL ? #f06b79 : #6f7b8f, 25), textcolor = color.white, size = size.tiny)`,
      `        pos := 0`,
      `if pos == 0 and not exitNow and okFilters and (longIn or shortIn)`, `    dir = longIn ? 1 : -1`, `    pos := dir`, `    bars := 0`, `    ent := close`,
      `    sl := ${slD ? `close - dir * (${slD})` : 'na'}`, `    tp := ${tpD ? `close + dir * (${tpD})` : 'na'}`,
      `    label.new(bar_index, dir == 1 ? low : high, dir == 1 ? "COMPRA" : "VENTA", yloc = dir == 1 ? yloc.belowbar : yloc.abovebar, style = dir == 1 ? label.style_label_up : label.style_label_down, color = dir == 1 ? #20bf9f : #f06b79, textcolor = color.white, size = size.small)`,
      `    lE := line.new(bar_index, ent, bar_index, ent, color = color.new(#9aa1ad, 30), style = line.style_dashed)`,
      `    lS := na(sl) ? na : line.new(bar_index, sl, bar_index, sl, color = #f06b79, width = 1)`,
      `    lT := na(tp) ? na : line.new(bar_index, tp, bar_index, tp, color = #20bf9f, width = 1)`,
      `    tS := na(sl) ? na : label.new(bar_index, sl, "SL", style = label.style_label_left, color = #f06b79, textcolor = color.white, size = size.tiny)`,
      `    tT := na(tp) ? na : label.new(bar_index, tp, "TP", style = label.style_label_left, color = #20bf9f, textcolor = color.white, size = size.tiny)`].join('\n');
    return {code, name};
  }
  return {toPine};
});

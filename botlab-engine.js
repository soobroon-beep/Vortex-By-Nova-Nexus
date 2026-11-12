/* NOVA BOT LAB · motor de estrategias y backtest (puro, sin DOM; se prueba en tests/botlab.test.js).
   Reglas de honestidad del motor:
   · Las señales se evalúan SOLO con velas ya cerradas (índice i) y la orden se ejecuta en la APERTURA de la vela siguiente (i+1): no hay look-ahead.
   · Stop loss / take profit se simulan dentro de la vela; si en una misma vela se tocan ambos, se asume que se tocó primero el STOP (caso conservador).
   · Se descuentan comisión por lado y deslizamiento (slippage) en cada ejecución. Sin apalancamiento por defecto. Las posiciones cortas se simulan sin costo de financiación.
   · Los indicadores usados son causales (cada valor solo usa datos hasta su vela). Los de Nova Nexus se leen con un adaptador de solo lectura.
   · El histórico se divide por tiempo en entrenamiento (60 %) / validación (20 %) / prueba (20 %); las métricas se reportan por tramo. Un resultado en datos históricos NO es una predicción ni una ganancia real. */
(function (root) {
  'use strict';
  const NA = null, isNum = x => typeof x === 'number' && Number.isFinite(x);
  const IV_MS = {'1m': 6e4, '3m': 18e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '2h': 72e5, '4h': 144e5, '6h': 216e5, '8h': 288e5, '12h': 432e5, '1d': 864e5, '3d': 2592e5, '1w': 6048e5};

  /* ───────── Indicadores causales ───────── */
  function ema(v, n) { const o = new Array(v.length).fill(NA), k = 2 / (n + 1); let e = NA, c = 0, s = 0; for (let i = 0; i < v.length; i++) { if (!isNum(v[i])) continue; if (e === NA) { s += v[i]; c++; if (c === n) { e = s / n; o[i] = e; } } else { e = v[i] * k + e * (1 - k); o[i] = e; } } return o; }
  function sma(v, n) { const o = new Array(v.length).fill(NA); let s = 0, c = 0; const q = []; for (let i = 0; i < v.length; i++) { if (!isNum(v[i])) { s = 0; c = 0; q.length = 0; continue; } q.push(v[i]); s += v[i]; if (q.length > n) s -= q.shift(); if (q.length === n) o[i] = s / n; } return o; }
  function rma(v, n) { const o = new Array(v.length).fill(NA); let r = NA, c = 0, s = 0; for (let i = 0; i < v.length; i++) { if (!isNum(v[i])) continue; if (r === NA) { s += v[i]; c++; if (c === n) { r = s / n; o[i] = r; } } else { r = (r * (n - 1) + v[i]) / n; o[i] = r; } } return o; }
  function rsi(cl, n) { const g = [NA], l = [NA]; for (let i = 1; i < cl.length; i++) { const d = cl[i] - cl[i - 1]; g.push(Math.max(d, 0)); l.push(Math.max(-d, 0)); } const ag = rma(g, n), al = rma(l, n); return cl.map((_, i) => ag[i] === NA || al[i] === NA ? NA : al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i])); }
  const trueRange = c => c.map((x, i) => i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)));
  const atr = (c, n) => rma(trueRange(c), n);
  function macd(cl, f, s, g) { const ef = ema(cl, f), es = ema(cl, s), line = cl.map((_, i) => ef[i] !== NA && es[i] !== NA ? ef[i] - es[i] : NA), first = line.findIndex(isNum), sig = new Array(cl.length).fill(NA); if (first >= 0) { const e = ema(line.slice(first), g); e.forEach((x, i) => { sig[first + i] = x; }); } return {line, sig, hist: line.map((x, i) => x !== NA && sig[i] !== NA ? x - sig[i] : NA)}; }
  function bb(cl, n, d) { const m = sma(cl, n), up = [], lo = []; for (let i = 0; i < cl.length; i++) { if (m[i] === NA) { up.push(NA); lo.push(NA); continue; } let s = 0; for (let j = i - n + 1; j <= i; j++) s += (cl[j] - m[i]) ** 2; const sd = Math.sqrt(s / n); up.push(m[i] + d * sd); lo.push(m[i] - d * sd); } return {mid: m, up, lo}; }
  function adx(c, n) { const N = c.length, pdm = [0], mdm = [0]; for (let i = 1; i < N; i++) { const up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l; pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0); } const tr = rma(trueRange(c), n), p = rma(pdm, n), m = rma(mdm, n); const dx = c.map((_, i) => tr[i] === NA || !tr[i] ? NA : (() => { const pi = 100 * p[i] / tr[i], mi = 100 * m[i] / tr[i]; return pi + mi === 0 ? 0 : 100 * Math.abs(pi - mi) / (pi + mi); })()); return rma(dx.map(x => x === NA ? NA : x), n); }
  function highest(v, n) { return v.map((_, i) => i < n - 1 ? NA : Math.max(...v.slice(i - n + 1, i + 1))); }
  function lowest(v, n) { return v.map((_, i) => i < n - 1 ? NA : Math.min(...v.slice(i - n + 1, i + 1))); }

  /* ───────── Operandos (lo que puede compararse en una condición) ───────── */
  const OPERANDS = { // etiqueta, parámetros por defecto
    close: {label: 'Precio de cierre'}, open: {label: 'Apertura'}, high: {label: 'Máximo'}, low: {label: 'Mínimo'}, volume: {label: 'Volumen'},
    ema: {label: 'EMA', p: {n: 20}}, sma: {label: 'SMA', p: {n: 50}}, rsi: {label: 'RSI', p: {n: 14}}, atr: {label: 'ATR', p: {n: 14}}, adx: {label: 'ADX', p: {n: 14}},
    macd: {label: 'MACD (línea)', p: {f: 12, s: 26, g: 9}}, macdSignal: {label: 'MACD (señal)', p: {f: 12, s: 26, g: 9}}, macdHist: {label: 'MACD (histograma)', p: {f: 12, s: 26, g: 9}},
    bbUp: {label: 'Banda de Bollinger superior', p: {n: 20, d: 2}}, bbMid: {label: 'Banda de Bollinger media', p: {n: 20, d: 2}}, bbLo: {label: 'Banda de Bollinger inferior', p: {n: 20, d: 2}},
    volRatio: {label: 'Volumen ÷ su media', p: {n: 20}}, hh: {label: 'Máximo de las últimas N velas', p: {n: 20}}, ll: {label: 'Mínimo de las últimas N velas', p: {n: 20}}, num: {label: 'Número', p: {v: 0}},
    novaBuy: {label: 'Señal de COMPRA de Nova Nexus (1 = hay señal en esa vela)', nova: true}, novaSell: {label: 'Señal de VENTA de Nova Nexus (1 = hay señal)', nova: true},
    user: {label: 'Indicador mío (señal o serie)', user: true},
    novaScore: {label: 'Puntaje de la señal de Nova Nexus (1–5; 0 = sin señal)', nova: true}, novaRange: {label: 'Nova Nexus: mercado en RANGO (ADX < 25; 1 = sí)', nova: true}, novaOsc: {label: 'Nova Oscillator', nova: true}, novaFlux: {label: 'Flujo de dinero de Nova Nexus', nova: true}, novaAdx: {label: 'ADX de Nova Nexus', nova: true}, novaBull: {label: 'Nova Nexus: precio sobre la nube EMA (1 = sí)', nova: true}
  };
  const OPS = {gt: 'es mayor que', lt: 'es menor que', gte: 'es mayor o igual que', lte: 'es menor o igual que', crossUp: 'cruza hacia ARRIBA a', crossDown: 'cruza hacia ABAJO a', is: 'está activa'};
  const key = o => o.k + ':' + JSON.stringify(Object.keys(o).filter(x => x !== 'k').sort().map(x => [x, o[x]]));

  function series(C, o, ctx) { // serie del operando sobre todas las velas (cacheada por contexto)
    const id = key(o); if (ctx.cache[id]) return ctx.cache[id]; let s;
    const cl = () => C.map(x => x.c), P = Object.assign({}, (OPERANDS[o.k] || {}).p || {}, o);
    switch (o.k) {
      case 'close': s = cl(); break; case 'open': s = C.map(x => x.o); break; case 'high': s = C.map(x => x.h); break; case 'low': s = C.map(x => x.l); break; case 'volume': s = C.map(x => x.v); break;
      case 'ema': s = ema(cl(), P.n); break; case 'sma': s = sma(cl(), P.n); break; case 'rsi': s = rsi(cl(), P.n); break; case 'atr': s = atr(C, P.n); break; case 'adx': s = adx(C, P.n); break;
      case 'macd': s = macd(cl(), P.f, P.s, P.g).line; break; case 'macdSignal': s = macd(cl(), P.f, P.s, P.g).sig; break; case 'macdHist': s = macd(cl(), P.f, P.s, P.g).hist; break;
      case 'bbUp': s = bb(cl(), P.n, P.d).up; break; case 'bbMid': s = bb(cl(), P.n, P.d).mid; break; case 'bbLo': s = bb(cl(), P.n, P.d).lo; break;
      case 'volRatio': { const m = sma(C.map(x => x.v), P.n); s = C.map((x, i) => m[i] ? x.v / m[i] : NA); break; }
      case 'hh': s = highest(C.map(x => x.h), P.n); break; case 'll': s = lowest(C.map(x => x.l), P.n); break; case 'num': s = C.map(() => +P.v); break;
      case 'user': { const u = ctx.user && ctx.user[o.sid + '|' + o.src]; if (!u) throw new Error('Falta la serie del indicador «' + (o.sname || o.sid) + '». Ejecuta el backtest desde el laboratorio.'); s = u; break; }
      default:
        if (/^nova/.test(o.k)) {
          const nn = ctx.nova && ctx.nova.compute; if (!nn) throw new Error('Nova Nexus no está disponible en este entorno');
          const r = ctx.novaRes || (ctx.novaRes = nn(C, ctx.novaOpts || {})), flat = a => C.map((_, i) => isNum(a && a[i]) ? a[i] : NA);
          s = o.k === 'novaBuy' ? C.map((_, i) => (r.bySignal[i] && r.bySignal[i].side === 'buy') ? 1 : 0) : o.k === 'novaSell' ? C.map((_, i) => (r.bySignal[i] && r.bySignal[i].side === 'sell') ? 1 : 0)
            : o.k === 'novaScore' ? C.map((_, i) => r.bySignal[i] ? r.bySignal[i].score : 0) : o.k === 'novaRange' ? C.map((_, i) => isNum(r.adx && r.adx[i]) ? (r.adx[i] < 25 ? 1 : 0) : NA) : o.k === 'novaOsc' ? flat(r.osc) : o.k === 'novaFlux' ? flat(r.flux) : o.k === 'novaAdx' ? flat(r.adx) : C.map((_, i) => r.bull[i] ? 1 : 0);
        } else throw new Error('Operando desconocido: ' + o.k);
    }
    return (ctx.cache[id] = s);
  }
  function condOk(cond, i, C, ctx) { // ¿se cumple la condición en la vela CERRADA i?
    const a = series(C, cond.a, ctx), av = a[i]; if (!isNum(av)) return false;
    if (cond.op === 'is') return av > 0;
    const b = series(C, cond.b, ctx), bv = b[i]; if (!isNum(bv)) return false;
    switch (cond.op) {
      case 'gt': return av > bv; case 'lt': return av < bv; case 'gte': return av >= bv; case 'lte': return av <= bv;
      case 'crossUp': return i > 0 && isNum(a[i - 1]) && isNum(b[i - 1]) && a[i - 1] <= b[i - 1] && av > bv;
      case 'crossDown': return i > 0 && isNum(a[i - 1]) && isNum(b[i - 1]) && a[i - 1] >= b[i - 1] && av < bv;
    }
    return false;
  }

  /* ───────── Especificación de estrategia ───────── */
  const opText = o => { const d = OPERANDS[o.k] || {label: o.k}; if (o.k === 'user') return `${o.sname || 'Indicador mío'} · ${o.sl || o.src}`; if (o.k === 'num') return String(o.v); const P = Object.assign({}, d.p || {}, o); if (/^(ema|sma|rsi|atr|adx|volRatio|hh|ll)$/.test(o.k)) return `${d.label} ${P.n}`; if (/^macd/.test(o.k)) return `${d.label} (${P.f},${P.s},${P.g})`; if (/^bb/.test(o.k)) return `${d.label} (${P.n}, ${P.d}σ)`; return d.label; };
  const condText = c => c.op === 'is' ? `${opText(c.a)}` : `${opText(c.a)} ${OPS[c.op]} ${opText(c.b)}`;
  function defaultSpec() {
    return {v: 1, name: 'Mi bot', symbol: 'BTCUSDT', interval: '1h', sides: 'long', entry: {long: [], short: []}, exit: {long: [], short: []},
      filters: {minVolRatio: 0, minAtrPct: 0, maxAtrPct: 0, hoursUtc: null},
      risk: {capital: 10000, riskPct: 1, sizePct: 10, maxLeverage: 1, atrLen: 14, sl: {type: 'atr', v: 2}, tp: {type: 'rr', v: 2}, trail: null, maxBars: 0, minBars: 0, maxDailyLossPct: 0, maxDrawdownPct: 0},
      costs: {feePct: 0.1, slipPct: 0.05}};
  }
  function normalizeSpec(s) { const d = defaultSpec(), o = Object.assign({}, d, s || {}); o.filters = Object.assign({}, d.filters, o.filters); o.risk = Object.assign({}, d.risk, o.risk); o.costs = Object.assign({}, d.costs, o.costs); o.entry = Object.assign({long: [], short: []}, o.entry); o.exit = Object.assign({long: [], short: []}, o.exit); return o; }
  function validateSpec(spec) {
    const s = normalizeSpec(spec), er = [], chkOp = (o, where) => { if (!o || !OPERANDS[o.k]) er.push(`${where}: indicador desconocido`); else if (o.k === 'user' && !(typeof o.sid === 'string' && o.sid && typeof o.src === 'string' && o.src)) er.push(`${where}: elige el indicador y su señal`); else for (const [k, v] of Object.entries(Object.assign({}, OPERANDS[o.k].p || {}, o))) if (k !== 'k' && typeof v === 'number' && (!Number.isFinite(v) || (k !== 'v' && k !== 'd' && v < 1) || v > 5000)) er.push(`${where}: valor fuera de rango (${k} = ${v})`); };
    const chk = (list, where) => list.forEach((c, i) => { if (!OPS[c.op]) er.push(`${where} #${i + 1}: operador inválido`); chkOp(c.a, `${where} #${i + 1}`); if (c.op !== 'is') chkOp(c.b, `${where} #${i + 1}`); });
    if (!/^[A-Z0-9]{5,20}$/.test(s.symbol)) er.push('Símbolo inválido (ej. BTCUSDT)'); if (s.basket != null && (!Array.isArray(s.basket) || s.basket.length < 2 || s.basket.length > 8 || s.basket.some(x => !/^[A-Z0-9]{5,20}$/.test(x)) || new Set(s.basket).size !== s.basket.length)) er.push('La cesta debe tener de 2 a 8 monedas distintas (ej. BTCUSDT, ETHUSDT)'); if (!IV_MS[s.interval]) er.push('Temporalidad no soportada');
    if (!['long', 'short', 'both'].includes(s.sides)) er.push('Dirección inválida');
    const wantL = s.sides !== 'short', wantS = s.sides !== 'long';
    if (wantL && !s.entry.long.length) er.push('Falta al menos una condición de ENTRADA para compras (largos)'); if (wantS && !s.entry.short.length) er.push('Falta al menos una condición de ENTRADA para ventas (cortos)');
    chk(s.entry.long, 'Entrada larga'); chk(s.entry.short, 'Entrada corta'); chk(s.exit.long, 'Salida larga'); chk(s.exit.short, 'Salida corta');
    const r = s.risk; if (!(r.capital >= 10)) er.push('Capital inicial inválido'); if (!(r.riskPct > 0 && r.riskPct <= 20)) er.push('Riesgo por operación debe estar entre 0 y 20 %'); if (!(r.maxLeverage >= 1 && r.maxLeverage <= 10)) er.push('Apalancamiento máximo entre 1 y 10');
    if (!r.sl && !(r.sizePct > 0 && r.sizePct <= 100)) er.push('Sin stop loss hace falta un tamaño de posición (% del capital)');
    if (r.sl && !(r.sl.v > 0)) er.push('Stop loss inválido'); if (r.tp && !(r.tp.v > 0)) er.push('Take profit inválido'); if (r.trail && !(r.trail.v > 0)) er.push('Trailing stop inválido'); if (r.minBars != null && !(r.minBars >= 0 && r.minBars <= 500)) er.push('Velas mínimas antes de cerrar por señal: entre 0 y 500');
    if (!(s.costs.feePct >= 0 && s.costs.feePct <= 2) || !(s.costs.slipPct >= 0 && s.costs.slipPct <= 5)) er.push('Comisión o slippage fuera de rango');
    return {ok: !er.length, errors: er};
  }
  function describeSpec(spec) { // texto en español con EXACTAMENTE lo que hará el bot (para que el usuario lo confirme antes de probarlo)
    const s = normalizeSpec(spec), L = [], list = (a, sep) => a.length ? a.map(condText).join(sep) : '— (ninguna)', r = s.risk;
    L.push(`**${s.name}** · ${Array.isArray(s.basket) && s.basket.length ? 'cesta de ' + s.basket.length + ' monedas (' + s.basket.map(x => x.replace(/USDT$/, '')).join(', ') + '), el capital se reparte por igual' : s.symbol} · ${s.interval} · ${s.sides === 'long' ? 'solo compras (largos)' : s.sides === 'short' ? 'solo ventas (cortos)' : 'compras y ventas'}`);
    if (s.sides !== 'short') { L.push(`**Compra** cuando se cumplan TODAS: ${list(s.entry.long, ' Y ')}.`); L.push(`**Cierra la compra** cuando se cumpla ALGUNA: ${s.exit.long.length ? list(s.exit.long, ' O ') : 'solo por stop loss / take profit / trailing' + (r.maxBars ? ' / tiempo máximo' : '')}.`); }
    if (s.sides !== 'long') { L.push(`**Vende (corto)** cuando se cumplan TODAS: ${list(s.entry.short, ' Y ')}.`); L.push(`**Cierra el corto** cuando se cumpla ALGUNA: ${s.exit.short.length ? list(s.exit.short, ' O ') : 'solo por stop loss / take profit / trailing' + (r.maxBars ? ' / tiempo máximo' : '')}.`); }
    const f = s.filters, ev = []; if (f.minVolRatio) ev.push(`volumen < ${f.minVolRatio}× su media`); if (f.minAtrPct) ev.push(`volatilidad (ATR) < ${f.minAtrPct} % del precio`); if (f.maxAtrPct) ev.push(`volatilidad (ATR) > ${f.maxAtrPct} % del precio`); if (f.hoursUtc) ev.push(`fuera del horario ${f.hoursUtc[0]}:00–${f.hoursUtc[1]}:00 UTC`);
    L.push(`**Evita operar** cuando: ${ev.length ? ev.join('; ') : 'no hay filtros (opera siempre que se cumplan las condiciones)'}.`);
    L.push(`**Riesgo:** capital inicial ${r.capital} USDT · ${r.sl ? `arriesga ${r.riskPct} % por operación` : `usa ${r.sizePct} % del capital por operación`} · stop loss ${r.sl ? (r.sl.type === 'atr' ? `${r.sl.v}× ATR(${r.atrLen})` : `${r.sl.v} %`) : 'ninguno'} · take profit ${r.tp ? (r.tp.type === 'rr' ? `${r.tp.v}× el riesgo` : r.tp.type === 'atr' ? `${r.tp.v}× ATR` : `${r.tp.v} %`) : 'ninguno'} · trailing ${r.trail ? (r.trail.type === 'atr' ? `${r.trail.v}× ATR` : `${r.trail.v} %`) : 'no'}${r.maxBars ? ` · máx. ${r.maxBars} velas por operación` : ''}${r.minBars ? ` · la señal contraria solo cierra después de ${r.minBars} velas (el stop y el objetivo siempre están activos)` : ''}${r.maxDailyLossPct ? ` · pausa el día si pierde ${r.maxDailyLossPct} %` : ''}${r.maxDrawdownPct ? ` · se detiene si el drawdown llega a ${r.maxDrawdownPct} %` : ''}.`);
    L.push(`**Costos simulados:** comisión ${s.costs.feePct} % por lado y slippage ${s.costs.slipPct} %. Las señales usan velas cerradas y se ejecutan en la apertura de la siguiente.`);
    return L.join('\n');
  }

  /* ───────── Backtest ───────── */
  const utcDay = t => Math.floor(t / 864e5);
  function backtest(candles, specIn, opts) {
    opts = opts || {}; const spec = normalizeSpec(specIn), v = validateSpec(spec); if (!v.ok) throw new Error('Estrategia inválida: ' + v.errors.join('; '));
    const C = candles, N = C.length, r = spec.risk, fee = spec.costs.feePct / 100, slip = spec.costs.slipPct / 100, ctx = {cache: {}, nova: opts.nova || root.NovaNexus, novaOpts: opts.novaOpts, user: opts.user || null};
    if (N < 60) throw new Error('Hacen falta al menos 60 velas para evaluar una estrategia');
    const atrS = series(C, {k: 'atr', n: r.atrLen}, ctx), ema200 = series(C, {k: 'ema', n: 200}, ctx), volR = series(C, {k: 'volRatio', n: 20}, ctx);
    const trades = [], avoid = [], eq = new Array(N).fill(0), warnings = []; let cash = r.capital, pos = null, pend = null, peak = opts.peak || r.capital, halted = false, tradeFrom = opts.tradeFrom | 0, dayKey = -1, dayStartCash = cash, dayBlocked = false, start = -1;
    /* carry (paper trading): posición que YA estaba abierta al terminar la actualización anterior. Se reanuda EXACTAMENTE como quedó en la vela
       carry.lastT (sin volver a decidir su entrada): así una operación avisada no «desaparece» aunque el indicador dé otro resultado al recalcular. */
    const carry = opts.carry && isNum(opts.carry.entry) && isNum(opts.carry.qty) ? opts.carry : null, carryAt = carry ? C.findIndex(x => x.t === carry.lastT) : -1;
    if (carry && carryAt >= 0) tradeFrom = Math.max(tradeFrom, carryAt);
    const wouldEnter = i => (spec.sides !== 'short' && spec.entry.long.length && spec.entry.long.every(cd => condOk(cd, i, C, ctx))) ? 'long' : (spec.sides !== 'long' && spec.entry.short.length && spec.entry.short.every(cd => condOk(cd, i, C, ctx))) ? 'short' : null; // para marcar señales que se DESCARTARON
    const entryReason = side => (side === 'long' ? spec.entry.long : spec.entry.short).map(condText).join(' Y ');
    const close = (px, i, why, flagOpen) => { // cierra la posición con costos
      const dir = pos.side === 'long' ? 1 : -1, exitFee = px * pos.qty * fee, gross = (px - pos.entry) * pos.qty * dir; cash += gross - exitFee;
      const net = gross - pos.fee - exitFee, risk = pos.risk;
      trades.push({id: trades.length + 1, side: pos.side, entryBar: pos.bar, exitBar: i, entryT: pos.entryT != null ? pos.entryT : C[pos.bar].t, exitT: C[i].t, entry: pos.entry, exit: px, qty: pos.qty, sl: pos.sl0, tp: pos.tp, gross, fees: pos.fee + exitFee, net, r: risk ? net / risk : null, retPct: net / (pos.entry * pos.qty) * 100, bars: i - pos.bar, why, reasonIn: pos.reason, open: !!flagOpen, ctx: pos.ctx,
        st: flagOpen ? {sl: pos.sl, hi: pos.hi, lo: pos.lo, fee: pos.fee, risk: pos.risk} : undefined}); // st: estado exacto de la posición abierta (paper trading la reanuda tal cual)
      pos = null;
    };
    for (let i = 1; i < N; i++) {
      const c = C[i], dk = utcDay(c.t); if (dk !== dayKey) { dayKey = dk; dayStartCash = cash; dayBlocked = false; }
      // 1) órdenes pendientes (decididas con la vela cerrada i-1) se ejecutan en la APERTURA de i
      if (pend) {
        if (pend.type === 'exit' && pos) close(pos.side === 'long' ? c.o * (1 - slip) : c.o * (1 + slip), i, pend.why);
        else if (pend.type === 'enter' && !pos && !halted) {
          const long = pend.side === 'long', px = long ? c.o * (1 + slip) : c.o * (1 - slip), a = pend.atr;
          const slD = r.sl ? (r.sl.type === 'atr' ? (a ? a * r.sl.v : NaN) : px * r.sl.v / 100) : NaN;
          if (r.sl && !(slD > 0)) { /* sin ATR válido: no se opera */ }
          else {
            const sl = r.sl ? (long ? px - slD : px + slD) : NA, tpD = r.tp ? (r.tp.type === 'rr' ? (r.sl ? slD * r.tp.v : NaN) : r.tp.type === 'atr' ? a * r.tp.v : px * r.tp.v / 100) : NaN, tp = isNum(tpD) && tpD > 0 ? (long ? px + tpD : px - tpD) : NA;
            let qty = r.sl ? (cash * r.riskPct / 100) / Math.abs(px - sl) : (cash * r.sizePct / 100) / px; const maxQty = cash * r.maxLeverage / (px * (1 + fee)); if (qty > maxQty) qty = maxQty;
            if (qty > 0 && isFinite(qty)) { const f = px * qty * fee; cash -= f; pos = {side: pend.side, entry: px, qty, sl, sl0: sl, tp, bar: i, fee: f, risk: r.sl ? Math.abs(px - sl) * qty : null, reason: pend.reason, hi: c.h, lo: c.l, ctx: pend.ctx}; if (start < 0) start = i; }
          }
        }
        pend = null;
      }
      // 2) SL / TP dentro de la vela i (si ambos: primero el stop)
      if (pos) {
        const long = pos.side === 'long';
        if (isNum(pos.sl) && (long ? c.l <= pos.sl : c.h >= pos.sl)) close(long ? Math.min(pos.sl, c.o) * (1 - slip) : Math.max(pos.sl, c.o) * (1 + slip), i, pos.sl === pos.sl0 ? 'Stop loss' : 'Trailing stop');
        else if (isNum(pos.tp) && (long ? c.h >= pos.tp : c.l <= pos.tp)) close(long ? Math.max(pos.tp, Math.min(c.o, c.h)) : Math.min(pos.tp, Math.max(c.o, c.l)), i, 'Take profit');
        else if (r.maxBars && i - pos.bar >= r.maxBars) { /* se cierra en la apertura de i+1 vía señal de tiempo */ }
      }
      if (i === carryAt && !pos) { // reanuda la posición abierta (su SL/TP de esta vela ya se revisó en la actualización anterior)
        const st = carry.st || {}, eb = C.findIndex(x => x.t === carry.entryT), f = isNum(st.fee) ? st.fee : carry.entry * carry.qty * fee; cash -= f;
        pos = {side: carry.side, entry: carry.entry, qty: carry.qty, sl: isNum(st.sl) ? st.sl : (isNum(carry.sl) ? carry.sl : NA), sl0: isNum(carry.sl) ? carry.sl : NA, tp: isNum(carry.tp) ? carry.tp : NA, bar: eb >= 0 ? eb : i, entryT: carry.entryT, fee: f,
          risk: isNum(st.risk) ? st.risk : (isNum(carry.sl) ? Math.abs(carry.entry - carry.sl) * carry.qty : null), reason: carry.reasonIn, hi: isNum(st.hi) ? st.hi : c.h, lo: isNum(st.lo) ? st.lo : c.l, ctx: carry.ctx}; if (start < 0) start = i;
      }
      // 3) valor de la cuenta al cierre de la vela
      let unreal = 0; if (pos) unreal = (c.c - pos.entry) * pos.qty * (pos.side === 'long' ? 1 : -1);
      if (i === N - 1 && pos) { close(c.c, i, 'Fin de los datos (posición aún abierta)', true); unreal = 0; }
      eq[i] = cash + unreal; if (eq[i] > peak) peak = eq[i];
      if (r.maxDrawdownPct && !halted && (peak - eq[i]) / peak * 100 >= r.maxDrawdownPct) { halted = true; warnings.push(`El bot se detuvo el ${new Date(c.t).toISOString().slice(0, 10)}: el drawdown alcanzó ${r.maxDrawdownPct} %.`); if (pos) pend = {type: 'exit', why: 'Límite de drawdown'}; }
      if (r.maxDailyLossPct && (dayStartCash - cash) / dayStartCash * 100 >= r.maxDailyLossPct) dayBlocked = true;
      if (pos && !pos.moved && false) {}
      // 4) trailing: usa los extremos hasta la vela i; rige desde la i+1
      if (pos) {
        pos.hi = Math.max(pos.hi, c.h); pos.lo = Math.min(pos.lo, c.l);
        if (r.trail) { const d = r.trail.type === 'atr' ? (atrS[i] ? atrS[i] * r.trail.v : NaN) : c.c * r.trail.v / 100; if (d > 0) { if (pos.side === 'long') pos.sl = isNum(pos.sl) ? Math.max(pos.sl, pos.hi - d) : pos.hi - d; else pos.sl = isNum(pos.sl) ? Math.min(pos.sl, pos.lo + d) : pos.lo + d; } }
      }
      // 5) señales con la vela cerrada i → orden para la apertura de i+1
      if (i < N - 1 && !pend && i >= tradeFrom) { // tradeFrom: paper trading (no se decide nada antes del inicio de la sesión)
        if (pos) {
          const ex = pos.side === 'long' ? spec.exit.long : spec.exit.short, hit = r.minBars && i + 1 - pos.bar < r.minBars ? null : ex.find(cd => condOk(cd, i, C, ctx)); // minBars: evita abrir y cerrar enseguida por una señal contraria
          if (hit) pend = {type: 'exit', why: 'Regla de salida: ' + condText(hit)}; else if (r.maxBars && i + 1 - pos.bar >= r.maxBars) pend = {type: 'exit', why: `Tiempo máximo (${r.maxBars} velas)`};
        } else if (!halted && !dayBlocked) {
          const f = spec.filters, hr = new Date(c.t).getUTCHours(), ap = atrS[i] ? atrS[i] / c.c * 100 : null;
          const blocked = (f.minVolRatio && !(volR[i] >= f.minVolRatio)) || (f.minAtrPct && !(ap >= f.minAtrPct)) || (f.maxAtrPct && !(ap <= f.maxAtrPct)) || (f.hoursUtc && !(f.hoursUtc[0] <= f.hoursUtc[1] ? hr >= f.hoursUtc[0] && hr < f.hoursUtc[1] : hr >= f.hoursUtc[0] || hr < f.hoursUtc[1]));
          if (!blocked) {
            const tryS = side => { const L = side === 'long' ? spec.entry.long : spec.entry.short; return L.length && L.every(cd => condOk(cd, i, C, ctx)); };
            const mk = side => ({type: 'enter', side, atr: atrS[i], reason: entryReason(side), ctx: {trend: isNum(ema200[i]) ? (c.c > ema200[i] ? 'alcista' : 'bajista') : 'sin dato', vol: ap == null ? 'sin dato' : ap < .3 ? 'baja' : ap < .8 ? 'media' : 'alta', hour: hr}});
            const sd = (spec.sides !== 'short' && tryS('long')) ? 'long' : (spec.sides !== 'long' && tryS('short')) ? 'short' : null;
            if (sd) { const why = opts.gate ? opts.gate(c.t, sd) : null; if (why) { if (avoid.length < 400 && i >= tradeFrom) avoid.push([c.t, 'Riesgo global: ' + why, sd]); } else pend = mk(sd); } // gate: veto del módulo de riesgo independiente (paper trading)
          } else if (avoid.length < 400 && i >= tradeFrom) { const w = wouldEnter(i); if (w) avoid.push([c.t, f.minVolRatio && !(volR[i] >= f.minVolRatio) ? 'Volumen por debajo del mínimo' : (f.minAtrPct && !(ap >= f.minAtrPct)) || (f.maxAtrPct && !(ap <= f.maxAtrPct)) ? 'Volatilidad fuera de rango' : 'Fuera del horario permitido', w]); }
        } else if (avoid.length < 400 && i >= tradeFrom) { const w = wouldEnter(i); if (w) avoid.push([c.t, halted ? 'Bot detenido por límite de drawdown' : 'Límite de pérdida diaria alcanzado', w]); }
      }
    }
    if (start < 0) start = Math.min(N - 1, 1);
    if (tradeFrom > start) start = Math.min(N - 1, tradeFrom);
    const out = {avoid, spec, bars: N, from: C[0].t, to: C[N - 1].t, trades, equity: eq.map((e, i) => ({t: C[i].t, e: i === 0 ? r.capital : e})), warnings, halted, capital: r.capital, interval: spec.interval, symbol: spec.symbol};
    out.metrics = metrics(trades, out.equity, r.capital, C, start); out.segments = segments(C, trades, out.equity, r.capital, start); out.buyHold = buyHold(C, start, r.capital, fee, slip); out.daily = dailyStats(out.equity, trades); out.breakdown = breakdown(trades);
    if (trades.length < 30) warnings.push(`Solo ${trades.length} operaciones: la muestra es demasiado pequeña para sacar conclusiones fiables.`);
    out.verdict = verdict(out); return out;
  }
  function maxDD(curve) { let pk = -Infinity, mdd = 0, mddPct = 0; for (const e of curve) { if (e > pk) pk = e; const d = pk - e; if (d > mdd) { mdd = d; mddPct = pk ? d / pk * 100 : 0; } } return {abs: mdd, pct: mddPct}; }
  function tradeStats(trades, capital) { // métricas calculadas SOLO con las operaciones (sirven por tramo)
    const n = trades.length, w = trades.filter(t => t.net > 0), l = trades.filter(t => t.net <= 0), gw = w.reduce((a, t) => a + t.net, 0), gl = -l.reduce((a, t) => a + t.net, 0), net = trades.reduce((a, t) => a + t.net, 0);
    let run = capital, curve = [capital]; for (const t of trades) { run += t.net; curve.push(run); } const dd = maxDD(curve);
    return {n, wins: w.length, losses: l.length, winRate: n ? w.length / n * 100 : null, net, retPct: net / capital * 100, profitFactor: gl > 0 ? gw / gl : (gw > 0 ? null : null), pfInf: gl === 0 && gw > 0, avgWin: w.length ? gw / w.length : null, avgLoss: l.length ? -gl / l.length : null,
      rr: w.length && l.length ? (gw / w.length) / (gl / l.length) : null, expectancy: n ? net / n : null, fees: trades.reduce((a, t) => a + t.fees, 0), maxDD: dd.abs, maxDDPct: dd.pct};
  }
  function metrics(trades, equity, capital, C, start) {
    const m = tradeStats(trades, capital), dd = maxDD(equity.map(x => x.e)), last = equity[equity.length - 1].e;
    return Object.assign(m, {capital, finalEquity: last, net: last - capital, retPct: (last - capital) / capital * 100, maxDD: dd.abs, maxDDPct: dd.pct, bars: C.length - start, days: Math.max(1, Math.round((C[C.length - 1].t - C[start].t) / 864e5)),
      exposurePct: C.length - start > 0 ? trades.reduce((a, t) => a + t.bars, 0) / (C.length - start) * 100 : 0, slipEst: null});
  }
  function segments(C, trades, equity, capital, start) { // temporal: entrenamiento 60 % · validación 20 % · prueba 20 %
    const N = C.length, span = N - start, b1 = start + Math.floor(span * .6), b2 = start + Math.floor(span * .8), mk = (name, a, b) => { const tr = trades.filter(t => t.entryBar >= a && t.entryBar < b); return Object.assign({name, from: C[a].t, to: C[b - 1].t, fromBar: a, toBar: b}, tradeStats(tr, capital)); };
    return {train: mk('Entrenamiento', start, b1), val: mk('Validación', b1, b2), test: mk('Prueba', b2, N)};
  }
  function buyHold(C, start, capital, fee, slip) {
    const e = C[Math.min(C.length - 1, start)].o * (1 + slip), x = C[C.length - 1].c * (1 - slip), qty = capital * (1 - fee) / e, final = qty * x * (1 - fee); let pk = -Infinity, mdd = 0; for (let i = start; i < C.length; i++) { const v = qty * C[i].c; if (v > pk) pk = v; if ((pk - v) / pk * 100 > mdd) mdd = (pk - v) / pk * 100; }
    return {final, retPct: (final - capital) / capital * 100, maxDDPct: mdd};
  }
  function dailyStats(equity, trades) {
    const days = new Map(); for (const p of equity) { const k = utcDay(p.t); const d = days.get(k) || {first: p.e, last: p.e, trades: 0}; d.last = p.e; days.set(k, d); } for (const t of trades) { const d = days.get(utcDay(t.exitT)); if (d) d.trades++; }
    let prev = equity[0].e, pos = 0, neg = 0, flat = 0; const ret = []; for (const [, d] of days) { const ch = d.last - prev; prev = d.last; ret.push({ch}); if (d.trades === 0 && Math.abs(ch) < 1e-9) flat++; else if (ch > 0) pos++; else if (ch < 0) neg++; else flat++; }
    return {days: days.size, pos, neg, flat};
  }
  function breakdown(trades) { // rendimiento por horario y condiciones de mercado (solo con operaciones reales del backtest)
    const g = (f) => { const m = {}; for (const t of trades) { const k = f(t); (m[k] = m[k] || {n: 0, net: 0, wins: 0}); m[k].n++; m[k].net += t.net; if (t.net > 0) m[k].wins++; } return m; };
    return {hour: g(t => Math.floor((t.ctx ? t.ctx.hour : new Date(t.entryT).getUTCHours()) / 4) * 4), trend: g(t => t.ctx ? t.ctx.trend : 'sin dato'), vol: g(t => t.ctx ? t.ctx.vol : 'sin dato'), side: g(t => t.side)};
  }
  function verdict(res) { // etiqueta honesta: diferencia lo histórico de lo confirmado fuera de muestra
    const s = res.segments, n = res.trades.length;
    if (n < 30) return {level: 'insuficiente', text: 'Muestra insuficiente (menos de 30 operaciones). No se puede concluir nada.'};
    const oos = [s.val, s.test].filter(x => x.n >= 5);
    if (!oos.length) return {level: 'insuficiente', text: 'Muy pocas operaciones fuera de entrenamiento para validar.'};
    const okV = oos.every(x => x.net > 0 && (x.profitFactor == null || x.profitFactor >= 1.1)), loss = oos.some(x => x.net <= 0);
    if (res.metrics.net <= 0) return {level: 'pierde', text: 'La estrategia pierde dinero en este histórico.'};
    if (okV) return {level: 'consistente', text: 'Positiva también en validación y prueba (fuera de entrenamiento). Sigue sin ser una garantía: confírmala en paper trading.'};
    return {level: 'no-confirmada', text: loss ? 'Gana en el histórico total pero NO se confirma en validación/prueba: posible sobreajuste.' : 'Resultado fuera de muestra débil.'};
  }

  /* ───────── Cesta: las mismas reglas en varias monedas a la vez (capital repartido por igual; cada moneda opera de forma independiente) ───────── */
  function backtestBasket(bySym, specIn, opts) {
    const spec = normalizeSpec(specIn), syms = spec.basket, n = syms.length, cap = spec.risk.capital, parts = [];
    for (const sym of syms) { const C = bySym[sym]; if (!C || C.length < 60) throw new Error('Faltan velas de ' + sym); const sp = JSON.parse(JSON.stringify(spec)); sp.symbol = sym; delete sp.basket; sp.risk.capital = cap / n; const r = backtest(C, sp, opts && opts.per ? opts.per(sym) : opts); r.trades.forEach(t => { t.sym = sym; }); r.avoid.forEach(z => z.push(sym)); parts.push(r); }
    const times = [...new Set(parts.flatMap(r => r.equity.map(p => p.t)))].sort((a, b) => a - b), last = parts.map(r => r.capital), idx = parts.map(() => 0);
    const equity = times.map(t => { let e = 0; parts.forEach((r, k) => { while (idx[k] < r.equity.length && r.equity[idx[k]].t <= t) { last[k] = r.equity[idx[k]].e; idx[k]++; } e += last[k]; }); return {t, e}; });
    const trades = parts.flatMap(r => r.trades).sort((a, b) => a.entryT - b.entryT); trades.forEach((t, i) => { t.id = i + 1; });
    const dd = maxDD(equity.map(x => x.e)), fin = equity[equity.length - 1].e, from = times[0], to = times[times.length - 1];
    const m = Object.assign(tradeStats(trades, cap), {capital: cap, finalEquity: fin, net: fin - cap, retPct: (fin - cap) / cap * 100, maxDD: dd.abs, maxDDPct: dd.pct, bars: Math.max(...parts.map(r => r.metrics.bars)), days: Math.max(1, Math.round((to - from) / 864e5)), exposurePct: parts.reduce((a, r) => a + r.metrics.exposurePct, 0) / n, slipEst: null});
    const span = to - from, b1 = from + span * .6, b2 = from + span * .8, mk = (name, a, b) => Object.assign({name, from: a, to: b, fromBar: 0, toBar: 0}, tradeStats(trades.filter(t => t.entryT >= a && t.entryT < b + (b === to ? 1 : 0)), cap));
    const segs = {train: mk('Entrenamiento', from, b1), val: mk('Validación', b1, b2), test: mk('Prueba', b2, to)};
    const sumMap = key => { const o = {}; for (const r of parts) for (const [k, v] of Object.entries(r.breakdown[key] || {})) { const x = o[k] || (o[k] = {n: 0, net: 0, wins: 0}); x.n += v.n; x.net += v.net; x.wins += v.wins; } return o; };
    const out = {avoid: parts.flatMap(r => r.avoid).sort((a, b) => a[0] - b[0]).slice(-400), spec, bars: m.bars, from, to, trades, equity, warnings: [...new Set(parts.flatMap(r => r.warnings).filter(w => !/^Solo \d+ operaciones/.test(w)))], halted: parts.some(r => r.halted), capital: cap, interval: spec.interval, symbol: syms.join(','), basket: syms,
      metrics: m, segments: segs, buyHold: {final: cap * (1 + parts.reduce((a, r) => a + r.buyHold.retPct, 0) / n / 100), retPct: parts.reduce((a, r) => a + r.buyHold.retPct, 0) / n, maxDDPct: Math.max(...parts.map(r => r.buyHold.maxDDPct))},
      daily: {days: Math.max(...parts.map(r => r.daily.days)), pos: 0, neg: 0, flat: 0}, breakdown: {hour: sumMap('hour'), trend: sumMap('trend'), vol: sumMap('vol'), side: sumMap('side')}, perSymbol: parts.map((r, k) => ({symbol: syms[k], n: r.metrics.n, retPct: r.metrics.retPct, winRate: r.metrics.winRate, maxDDPct: r.metrics.maxDDPct}))};
    if (trades.length < 30) out.warnings.push(`Solo ${trades.length} operaciones en total: la muestra es demasiado pequeña para sacar conclusiones fiables.`);
    out.verdict = verdict(out); return out;
  }

  /* ───────── Plantillas para empezar ───────── */
  function safeSpec(name, interval, maxBars, both) {
    const sp = safeSpec0(name, interval, maxBars); if (!both) return sp;
    sp.sides = 'both'; sp.entry.short = [{a: {k: 'close'}, op: 'lt', b: {k: 'ema', n: 200}}, {a: {k: 'ema', n: 50}, op: 'lt', b: {k: 'ema', n: 200}}, {a: {k: 'adx', n: 14}, op: 'gt', b: {k: 'num', v: 20}}, {a: {k: 'rsi', n: 14}, op: 'crossDown', b: {k: 'num', v: 55}}];
    sp.exit.short = [{a: {k: 'close'}, op: 'crossUp', b: {k: 'ema', n: 200}}]; return sp;
  }
  function safeSpec0(name, interval, maxBars) {
    return Object.assign(defaultSpec(), {name, symbol: 'BTCUSDT', basket: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'], interval, sides: 'long',
      entry: {long: [{a: {k: 'close'}, op: 'gt', b: {k: 'ema', n: 200}}, {a: {k: 'ema', n: 50}, op: 'gt', b: {k: 'ema', n: 200}}, {a: {k: 'adx', n: 14}, op: 'gt', b: {k: 'num', v: 20}}, {a: {k: 'rsi', n: 14}, op: 'crossUp', b: {k: 'num', v: 45}}], short: []},
      exit: {long: [{a: {k: 'close'}, op: 'crossDown', b: {k: 'ema', n: 200}}], short: []},
      filters: {minVolRatio: 0, minAtrPct: 0, maxAtrPct: interval === '1h' ? 2.5 : 5, hoursUtc: null},
      risk: {capital: 10000, riskPct: 0.5, sizePct: 10, maxLeverage: 1, atrLen: 14, sl: {type: 'atr', v: 2}, tp: {type: 'rr', v: 1}, trail: null, maxBars, maxDailyLossPct: 2, maxDrawdownPct: 10}});
  }
  const NOVA8 = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT'];
  /* Nova Nexus + volumen ahora en ambos sentidos (antes solo compraba y casi todas las señales recientes eran de venta) */
  const novaVolBoth = sp => { sp = JSON.parse(JSON.stringify(sp)); sp.sides = 'both'; sp.entry.short = [{a: {k: 'novaSell'}, op: 'is'}, {a: {k: 'volRatio', n: 20}, op: 'gt', b: {k: 'num', v: 1}}]; sp.exit.short = [{a: {k: 'novaBuy'}, op: 'is'}]; return sp; };
  function lucasSpec(name, itv, n, T, sl, tr) {
    const s = defaultSpec(), up = {k: 'bbUp', n, d: 2.5}, lo = {k: 'bbLo', n, d: 2.5}, e = {k: 'ema', n: T};
    Object.assign(s, {name, symbol: 'BTCUSDT', basket: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT'], interval: itv, sides: 'both'});
    s.entry = {long: [{a: {k: 'close'}, op: 'crossUp', b: up}, {a: {k: 'close'}, op: 'gt', b: e}], short: [{a: {k: 'close'}, op: 'crossDown', b: lo}, {a: {k: 'close'}, op: 'lt', b: e}]};
    s.risk = Object.assign(s.risk, {capital: 10000, riskPct: 1, maxLeverage: 3, atrLen: 14, sl: {type: 'atr', v: sl}, tp: {type: 'rr', v: 2}, trail: {type: 'atr', v: tr}, maxBars: 0, maxDailyLossPct: 0, maxDrawdownPct: 25});
    s.costs = {feePct: 0.05, slipPct: 0.05}; return s;
  }
  const PRESETS = {
    emaRsi: () => Object.assign(defaultSpec(), {name: 'EMA 20/50 + RSI', entry: {long: [{a: {k: 'ema', n: 20}, op: 'crossUp', b: {k: 'ema', n: 50}}, {a: {k: 'rsi', n: 14}, op: 'gt', b: {k: 'num', v: 50}}], short: []}, exit: {long: [{a: {k: 'ema', n: 20}, op: 'crossDown', b: {k: 'ema', n: 50}}], short: []}}),
    novaNexus: () => Object.assign(defaultSpec(), {name: 'Nova Nexus + volumen', entry: {long: [{a: {k: 'novaBuy'}, op: 'is'}, {a: {k: 'volRatio', n: 20}, op: 'gt', b: {k: 'num', v: 1}}], short: []}, exit: {long: [{a: {k: 'novaSell'}, op: 'is'}], short: []}}),
    /* «Seguro»: solo compras, solo en tendencia alcista confirmada, entrando en un retroceso que ya se recupera; stop amplio, objetivo cercano (más aciertos), riesgo bajo y freno de pérdidas. Opera poco a propósito. */
    safe1h: () => safeSpec('Seguro 1h · BTC ETH SOL BNB XRP', '1h', 36, true),
    safe4h: () => safeSpec('Seguro 4h · BTC ETH SOL BNB XRP', '4h', 18, true),
    /* Nova Nexus · iA Signals v2.7 como bot (optimizado con validación fuera de muestra en 8 monedas; ver scripts/botlab-diag.js).
       4h: compras y ventas con puntaje ≥ 4; objetivo cercano (1× ATR) y stop amplio (4× ATR): muchos aciertos y pérdidas raras pero más grandes. */
    nova27x4h: () => Object.assign(defaultSpec(), {name: 'Nova Nexus v2.7 · 4h', symbol: 'BTCUSDT', basket: NOVA8.slice(), interval: '4h', sides: 'both',
      entry: {long: [{a: {k: 'novaBuy'}, op: 'is'}, {a: {k: 'novaScore'}, op: 'gte', b: {k: 'num', v: 4}}], short: [{a: {k: 'novaSell'}, op: 'is'}, {a: {k: 'novaScore'}, op: 'gte', b: {k: 'num', v: 4}}]}, exit: {long: [], short: []},
      risk: {capital: 10000, riskPct: 2, sizePct: 10, maxLeverage: 5, atrLen: 14, sl: {type: 'atr', v: 4}, tp: {type: 'atr', v: 1}, trail: null, maxBars: 0, maxDailyLossPct: 6, maxDrawdownPct: 25}, costs: {feePct: 0.05, slipPct: 0.03}}),
    /* 1h: solo ventas (en 1 h las compras de la señal no pasaron la validación); solo en tendencia (ADX ≥ 25), cierra en la señal contraria o en SL/TP */
    nova27x1h: () => Object.assign(defaultSpec(), {name: 'Nova Nexus v2.7 · 1h cortos', symbol: 'BTCUSDT', basket: NOVA8.slice(), interval: '1h', sides: 'short',
      entry: {long: [], short: [{a: {k: 'novaSell'}, op: 'is'}, {a: {k: 'novaRange'}, op: 'lt', b: {k: 'num', v: 1}}]}, exit: {long: [], short: [{a: {k: 'novaBuy'}, op: 'is'}]},
      risk: {capital: 10000, riskPct: 2, sizePct: 10, maxLeverage: 5, atrLen: 14, sl: {type: 'atr', v: 4}, tp: {type: 'atr', v: 2.5}, trail: null, maxBars: 0, maxDailyLossPct: 6, maxDrawdownPct: 25}, costs: {feePct: 0.05, slipPct: 0.03}}),
    /* LUCAS (nov 2026, auditado con Claude): ruptura de Bollinger a favor de la tendencia, compras y ventas, 8 monedas.
       Elegido entre ~770 combinaciones (EMA, MACD, RSI, Bollinger, reversión a la media) con datos de Binance 2020-2026, validado fuera de muestra.
       Histórico 1 % riesgo: 4H +43.9 % (DD 7.1 %, PF 1.28) · 1H +37.2 % (DD 10.6 %, PF 1.16). Últimos 12 meses negativos en ambos: NO es una garantía. */
    lucas4h: () => lucasSpec('Lucas 4H', '4h', 40, 100, 2, 3.5),
    lucas1h: () => lucasSpec('Lucas 1H', '1h', 120, 400, 3, 5),
    /* PACHITA (nov 2026, con Claude): Nova Nexus · iA Signals v2.7 en 15 minutos, compras y ventas, 8 monedas.
       Entra solo con la señal del indicador EN TENDENCIA (ADX ≥ 25: ahí la señal ya exige estar del lado correcto de la EMA 200, flujo de dinero a favor y puntaje ≥ 4)
       y del mismo lado de la nube EMA de Nova Nexus. Zonas: stop 1.5× ATR (más allá del SL de 1× ATR del indicador, para que el ruido de 15 m no la saque),
       objetivo 2.5× ATR (el TP2 del indicador), trailing 2× ATR que asegura ganancia cuando avanza, y cierre por la señal contraria solo después de 4 velas (1 h).
       Máx. 48 velas (12 h) por operación. No opera con el mercado muerto (ATR < 0.12 %) ni en latigazos (ATR > 2.5 %). Riesgo 2 %, apalancamiento máx. 5×. */
    pachita: () => Object.assign(defaultSpec(), {name: 'Pachita', symbol: 'BTCUSDT', basket: NOVA8.slice(), interval: '15m', sides: 'both',
      entry: {long: [{a: {k: 'novaBuy'}, op: 'is'}, {a: {k: 'novaRange'}, op: 'lt', b: {k: 'num', v: 1}}, {a: {k: 'novaBull'}, op: 'gte', b: {k: 'num', v: 1}}],
        short: [{a: {k: 'novaSell'}, op: 'is'}, {a: {k: 'novaRange'}, op: 'lt', b: {k: 'num', v: 1}}, {a: {k: 'novaBull'}, op: 'lt', b: {k: 'num', v: 1}}]},
      exit: {long: [{a: {k: 'novaSell'}, op: 'is'}], short: [{a: {k: 'novaBuy'}, op: 'is'}]},
      filters: {minVolRatio: 0, minAtrPct: 0.12, maxAtrPct: 2.5, hoursUtc: null},
      risk: {capital: 10000, riskPct: 2, sizePct: 10, maxLeverage: 5, atrLen: 14, sl: {type: 'atr', v: 1.5}, tp: {type: 'atr', v: 2.5}, trail: {type: 'atr', v: 2}, maxBars: 48, minBars: 4, maxDailyLossPct: 6, maxDrawdownPct: 25}, costs: {feePct: 0.05, slipPct: 0.03}}),
    macdTrend: () => Object.assign(defaultSpec(), {name: 'Tendencia + MACD', entry: {long: [{a: {k: 'close'}, op: 'gt', b: {k: 'ema', n: 200}}, {a: {k: 'macd'}, op: 'crossUp', b: {k: 'macdSignal'}}], short: []}, exit: {long: [{a: {k: 'macd'}, op: 'crossDown', b: {k: 'macdSignal'}}], short: []}})
  };

  /* ¿La configuración hace que el bot abra y cierre enseguida? (objetivo pegado, trailing muy corto o salida por señal sin espera mínima)
     Devuelve la especificación corregida y la lista de cambios, o null si está bien. Lo usa la app una sola vez por cuenta. */
  function fixQuickClose(specIn) {
    const sp = JSON.parse(JSON.stringify(normalizeSpec(specIn))), r = sp.risk, ch = [];
    if (r.tp && r.tp.type === 'atr' && r.tp.v < 1.5) { ch.push(`objetivo ${r.tp.v}× ATR → 1.5× ATR`); r.tp.v = 1.5; }
    if (r.tp && r.tp.type === 'rr' && r.tp.v < 1) { ch.push(`objetivo ${r.tp.v}R → 1R`); r.tp.v = 1; }
    if (r.tp && r.tp.type === 'pct' && r.tp.v < 0.5) { ch.push(`objetivo ${r.tp.v} % → 0.5 %`); r.tp.v = 0.5; }
    if (r.sl && r.sl.type === 'atr' && r.sl.v < 1) { ch.push(`stop ${r.sl.v}× ATR → 1× ATR`); r.sl.v = 1; }
    if (r.sl && r.sl.type === 'pct' && r.sl.v < 0.3) { ch.push(`stop ${r.sl.v} % → 0.3 %`); r.sl.v = 0.3; }
    if (r.trail && r.trail.type === 'atr' && r.trail.v < 1.5) { ch.push(`trailing ${r.trail.v}× ATR → 1.5× ATR`); r.trail.v = 1.5; }
    if (r.trail && r.trail.type === 'pct' && r.trail.v < 0.5) { ch.push(`trailing ${r.trail.v} % → 0.5 %`); r.trail.v = 0.5; }
    if (r.maxBars && r.maxBars < 3) { ch.push(`tiempo máximo ${r.maxBars} → 3 velas`); r.maxBars = 3; }
    if ((sp.exit.long.length || sp.exit.short.length) && !r.minBars) { r.minBars = /^(1m|3m|5m|15m)$/.test(sp.interval) ? 4 : 2; ch.push(`la señal contraria cierra solo después de ${r.minBars} velas`); }
    return ch.length ? {spec: sp, changes: ch} : null;
  }

  for (const k of Object.keys(PRESETS)) { const f0 = PRESETS[k]; PRESETS[k] = () => { const sp = f0(), f = fixQuickClose(sp); return f ? Object.assign(f.spec, {name: sp.name}) : sp; }; } // ninguna plantilla abre y cierra enseguida

  const api = {fixQuickClose, novaVolBoth, NOVA8, IV_MS, OPERANDS, OPS, ema, sma, rsi, atr, macd, bb, adx, backtest, backtestBasket, verdict, tradeStats, defaultSpec, normalizeSpec, validateSpec, describeSpec, condText, opText, PRESETS, series, maxDD};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTBotLab = api;
})(typeof self !== 'undefined' ? self : this);

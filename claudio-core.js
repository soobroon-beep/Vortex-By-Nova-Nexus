/* CLAUDIO · agente de trading autónomo de VORTEX (núcleo puro, sin DOM; se prueba en tests/claudio.test.js).
   Arquitectura en dos capas (nunca se mezclan):
   · CEREBRO (investigación, estrategia, código, revisión nocturna): vive fuera del bucle de velas. Su trabajo queda escrito en este archivo,
     en claudio-candidates.js y en el informe nocturno. Nada de lo que decide el cerebro puede saltarse los límites de riesgo.
   · REFLEJO (Jev, modelo «System One» de TypeSafe AI): en cada vela recibe un estado NO estructurado (texto compacto) y devuelve decisiones TIPADAS
     (régimen, dirección, flujo tóxico, calidad del setup, estado de riesgo) para TODOS los candidatos en UNA sola llamada. Jev solo evalúa:
     umbrales, tamaño de posición, órdenes y efectos secundarios los controla este código.
   Garantías verificables:
   · Causalidad: el estado de la vela i usa solo velas cerradas ≤ i (y el libro de órdenes de ese instante). La orden se llena en la APERTURA de i+1.
   · Riesgo determinista e inmodificable por el modelo: LIMITS está congelado; la auto-mejora nocturna solo recalibra probabilidades (Platt) dentro de topes.
   · Interruptor de emergencia + drawdown máx. 15 % + pérdida diaria máx. + tamaño máx. por posición se comprueban ANTES de cada orden (preOrderCheck).
   · Libro de operaciones inmutable (cadena de hashes). Simulación con capital virtual: este núcleo NO envía órdenes a ningún exchange. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.CCTClaudio = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '1.0.0', IV = 36e5, TF = '1h';
  /* ───────── Límites de riesgo (código, no modelo) ───────── */
  const LIMITS = Object.freeze({
    maxDrawdownPct: 15,     // drawdown máximo de la cuenta: al tocarlo se cierran posiciones y se bloquean entradas
    maxPositionPct: 20,     // valor nocional máximo por posición (% del patrimonio)
    maxDailyLossPct: 3,     // pérdida máxima por día UTC: sin entradas nuevas hasta el día siguiente
    maxOpen: 3,             // posiciones simultáneas
    kellyFraction: 0.25,    // Kelly fraccionado: como máximo ¼ de Kelly
    minQuality: 2,          // setup_quality mínimo (escala 0–3)
    minDirConf: 0.80,       // confianza mínima (calibrada) en la dirección
    escalateBelow: 0.60,    // confianza por debajo de esto + paso a «crisis» ⇒ se escala a revisión profunda
    maxToxic: 0.5,          // probabilidad máxima de flujo tóxico
    feePct: 0.1, slipPct: 0.05, slAtr: 1.5, tpAtr: 3, maxBars: 48,
    maxStateTokens: 400     // presupuesto del estado por candidato y vela
  });
  const CALIB_BOUNDS = Object.freeze({aMin: 0.3, aMax: 3, bMin: -1, bMax: 1});
  const REGIMES = ['trending', 'mean_reverting', 'high_vol', 'crisis'], DIRS = ['long', 'short', 'neutral'], RISK = ['safe', 'near_limit', 'reduce'];
  const isNum = x => typeof x === 'number' && Number.isFinite(x), clamp = (x, a, b) => Math.max(a, Math.min(b, x)), r = (x, d = 2) => isNum(x) ? Math.round(x * 10 ** d) / 10 ** d : null;
  const sig = x => 1 / (1 + Math.exp(-x)), day = t => Math.floor(t / 864e5), iso = t => new Date(t).toISOString().slice(0, 16) + 'Z';
  const fnv = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
  const estTokens = s => Math.ceil(String(s).length / 3.2); // estimación conservadora (más tokens de los reales)

  /* ───────── Indicadores causales (cada valor usa datos hasta su vela) ───────── */
  function emaArr(v, n) { const o = new Array(v.length).fill(null), k = 2 / (n + 1); let e = null, s = 0; for (let i = 0; i < v.length; i++) { if (e === null) { s += v[i]; if (i === n - 1) { e = s / n; o[i] = e; } } else { e = v[i] * k + e * (1 - k); o[i] = e; } } return o; }
  function rsiLast(cl, n) { if (cl.length < n + 1) return null; let g = 0, l = 0; for (let i = 1; i <= n; i++) { const d = cl[i] - cl[i - 1]; g += Math.max(d, 0); l += Math.max(-d, 0); } g /= n; l /= n; for (let i = n + 1; i < cl.length; i++) { const d = cl[i] - cl[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; } return l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  function atrArr(C, n) { const o = new Array(C.length).fill(null); let a = null, s = 0; for (let i = 0; i < C.length; i++) { const c = C[i], tr = i ? Math.max(c.h - c.l, Math.abs(c.h - C[i - 1].c), Math.abs(c.l - C[i - 1].c)) : c.h - c.l; if (a === null) { s += tr; if (i === n - 1) { a = s / n; o[i] = a; } } else { a = (a * (n - 1) + tr) / n; o[i] = a; } } return o; }
  const median = a => { const b = a.filter(isNum).sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };

  /* ───────── Motor de estado: libro + velas → representación numérica compacta (< 400 tokens) ───────── */
  function bookFeatures(book, px) {
    if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks) || !book.bids.length || !book.asks.length) return null;
    const bb = +book.bids[0][0], ba = +book.asks[0][0]; if (!(bb > 0 && ba > bb)) return null;
    const mid = (bb + ba) / 2, sum = (s, n) => s.slice(0, n).reduce((a, x) => a + (+x[1]) * (+x[0]), 0), imb = n => { const b = sum(book.bids, n), a = sum(book.asks, n); return b + a > 0 ? (b - a) / (b + a) : 0; };
    const band = mid * 0.005, depth = book.bids.filter(x => +x[0] >= mid - band).reduce((a, x) => a + x[0] * x[1], 0) + book.asks.filter(x => +x[0] <= mid + band).reduce((a, x) => a + x[0] * x[1], 0);
    return {mid, spr: (ba - bb) / mid * 1e4, imb5: imb(5), imb20: imb(20), dep: depth > 0 ? Math.log10(depth) : 0, drift: px ? (mid / px - 1) * 100 : 0};
  }
  /* C: velas CERRADAS ascendentes ({t:apertura,o,h,l,c,v}); t: instante de decisión (≥ cierre de la última vela). pos/equity: inventario actual. */
  function buildState(sym, C, opt) {
    opt = opt || {}; const t = opt.t, N = C.length; if (N < 60) return null;
    const last = C[N - 1]; if (!isNum(t) || last.t + IV > t) throw new Error('Estado no causal: la última vela de ' + sym + ' aún no cerró en t');
    if (opt.book && isNum(opt.book.t) && opt.book.t > t + 5 * 6e4) throw new Error('Estado no causal: libro de órdenes posterior a la decisión');
    const cl = C.map(x => x.c), px = last.c, ret = k => N > k ? (px / cl[N - 1 - k] - 1) * 100 : null;
    const e20 = emaArr(cl, 20), e50 = emaArr(cl, 50), at = atrArr(C, 14), atrPct = at[N - 1] / px * 100, atrHist = at.slice(-200).map((a, i, arr) => a / C[N - arr.length + i].c * 100);
    const lr = []; for (let i = Math.max(1, N - 24); i < N; i++) lr.push(Math.log(cl[i] / cl[i - 1])); const mu = lr.reduce((a, x) => a + x, 0) / lr.length, rv = Math.sqrt(lr.reduce((a, x) => a + (x - mu) ** 2, 0) / lr.length) * 100;
    const vols = C.slice(-21, -1).map(x => x.v), vAvg = vols.reduce((a, x) => a + x, 0) / vols.length, hi20 = Math.max(...C.slice(-20).map(x => x.h)), lo20 = Math.min(...C.slice(-20).map(x => x.l)), hi200 = Math.max(...C.slice(-200).map(x => x.h));
    const bk = bookFeatures(opt.book, px), pos = opt.pos || null, eq = opt.equity || 0;
    const f = {px, r1: r(ret(1)), r4: r(ret(4)), r24: r(ret(24)), ema: r((e20[N - 1] / e50[N - 1] - 1) * 100, 3), rsi: r(rsiLast(cl.slice(-200), 14), 1), atr: r(atrPct, 3), atrRel: r(atrPct / (median(atrHist) || atrPct), 2), rv: r(rv, 3),
      vol: r(vAvg > 0 ? last.v / vAvg : 1), hi20: r((px / hi20 - 1) * 100), lo20: r((px / lo20 - 1) * 100), dd200: r((px / hi200 - 1) * 100),
      spr: bk ? r(bk.spr, 2) : null, imb5: bk ? r(bk.imb5, 3) : null, imb20: bk ? r(bk.imb20, 3) : null, dep: bk ? r(bk.dep, 2) : null,
      inv: pos && eq > 0 ? r((pos.side === 'long' ? 1 : -1) * pos.qty * px / eq, 3) : 0, upnl: pos ? r(((px - pos.entry) / pos.entry) * 100 * (pos.side === 'long' ? 1 : -1)) : 0};
    const text = `${sym} t=${iso(t)} px=${+px.toPrecision(6)} r1=${f.r1} r4=${f.r4} r24=${f.r24} ema20/50=${f.ema}% rsi=${f.rsi} atr=${f.atr}% atrRel=${f.atrRel} rv24=${f.rv}% vol=${f.vol}x hi20=${f.hi20}% lo20=${f.lo20}% dd200=${f.dd200}%`
      + (bk ? ` spr=${f.spr}bp imb5=${f.imb5} imb20=${f.imb20} dep=${f.dep}` : ' book=na') + ` inv=${f.inv} upnl=${f.upnl}%`;
    if (estTokens(text) >= LIMITS.maxStateTokens) throw new Error('Estado demasiado grande para ' + sym);
    return {sym, t, f, text, tokens: estTokens(text), book: !!bk};
  }

  /* ───────── Esquema de decisión de Jev (una sola llamada con todos los candidatos) ───────── */
  const Q = sym => sym.toLowerCase().replace(/[^a-z0-9]/g, '');
  function jevSchema(syms) {
    const q = {};
    for (const s of syms) {
      const k = Q(s);
      q[k + '_regime'] = {type: 'choice', instructions: `Market regime of \`candidates.${s}\` right now (closed candles only).`, criteria: {trending: 'Persistent directional move; pullbacks are bought/sold.', mean_reverting: 'Range-bound; moves fade back to the mean.', high_vol: 'Volatility well above its norm without a clear direction.', crisis: 'Disorderly selling or liquidity stress; preserving capital comes first.'}};
      q[k + '_direction'] = {type: 'choice', instructions: `Best positioning for \`candidates.${s}\` over the next 4 hourly candles.`, criteria: {long: 'Price is more likely to rise enough to beat costs.', short: 'Price is more likely to fall enough to beat costs.', neutral: 'No edge after costs.'}};
      q[k + '_toxic_flow'] = {type: 'noul', instructions: `Is the order flow of \`candidates.${s}\` toxic (wide spread, one-sided book, likely adverse selection)?`};
      q[k + '_setup_quality'] = {type: 'score', instructions: `Quality of the trade setup for \`candidates.${s}\`.`, criteria: ['0: no setup', '1: weak', '2: good', '3: excellent']};
      q[k + '_risk_state'] = {type: 'choice', instructions: `Given \`portfolio\` and \`candidates.${s}\`, how close is the account to its risk limits?`, criteria: {safe: 'Far from limits.', near_limit: 'Approaching drawdown or daily-loss limits.', reduce: 'Exposure should be reduced now.'}};
    }
    return q;
  }
  function portfolioText(p) { return `equity=${r(p.equity)} dd=${r(p.ddPct)}% (max ${LIMITS.maxDrawdownPct}%) day=${r(p.dayPct)}% (max -${LIMITS.maxDailyLossPct}%) open=${p.openN}/${LIMITS.maxOpen} kill=${p.kill ? 1 : 0}`; }
  function jevRequest(states, portfolio, model) {
    const cand = {}; for (const s of states) cand[s.sym] = s.text;
    return {model: model || 'jev-latest', state: {portfolio: portfolioText(portfolio), candidates: cand}, questions: jevSchema(states.map(s => s.sym))};
  }
  /* Normaliza la respuesta de la API (answers.* o choices/scores/nouls del SDK) y la valida estrictamente. Lo que no pasa la validación ⇒ null (no se opera). */
  function parseJev(resp, syms) {
    const A = Object.assign({}, resp && resp.answers, resp && resp.choices, resp && resp.scores, resp && resp.nouls), out = {};
    const conf = a => { if (!a) return null; if (a.probabilities && isNum(a.probabilities[a.choice])) return a.probabilities[a.choice]; if (isNum(a.confidence)) return a.confidence; if (isNum(a.probability)) return a.probability; return null; };
    for (const s of syms) {
      const k = Q(s), g = n => A[k + '_' + n];
      const re = g('regime'), di = g('direction'), tx = g('toxic_flow'), sq = g('setup_quality'), rs = g('risk_state');
      const ok = re && REGIMES.includes(re.choice) && di && DIRS.includes(di.choice) && tx && isNum(tx.noul) && sq && isNum(sq.score) && rs && RISK.includes(rs.choice);
      out[s] = ok ? {regime: re.choice, regimeConf: conf(re), direction: di.choice, dirConf: conf(di), toxic: clamp(tx.noul, 0, 1), quality: clamp(sq.score, 0, 3), riskState: rs.choice, z: null, pUp: di.probabilities && isNum(di.probabilities.long) ? di.probabilities.long : null} : null;
    }
    return out;
  }

  /* ───────── Evaluador local «jev-local» (respaldo determinista sin clave de API; mismo esquema y mismas reglas) ───────── */
  function localEval(states, portfolio, calib) {
    const c = Object.assign({a: 1.2, b: 0}, calib || {}), out = {};
    for (const s of states) {
      const f = s.f, crisis = (f.r24 < -7) || (f.atrRel > 2.5 && f.r24 < -3) || (f.dd200 < -25 && f.atrRel > 1.8), hv = f.atrRel > 1.6, tr = Math.abs(f.ema) > 0.35 && Math.abs(f.r24) > 1.2 * f.atr;
      const regime = crisis ? 'crisis' : hv ? 'high_vol' : tr ? 'trending' : 'mean_reverting';
      const regimeConf = crisis ? clamp(0.6 + Math.abs(f.r24) / 40, 0.6, 0.95) : hv ? clamp(0.5 + (f.atrRel - 1.6) / 3, 0.5, 0.9) : tr ? clamp(0.5 + Math.abs(f.ema) / 2, 0.5, 0.9) : 0.55;
      const imb = isNum(f.imb5) ? f.imb5 : 0;
      const z = regime === 'mean_reverting'
        ? -0.9 * Math.tanh((f.rsi - 50) / 12) - 0.5 * Math.tanh((f.hi20 + f.lo20) / Math.max(0.5, 2 * f.atr)) + 0.4 * imb
        : 0.9 * Math.tanh(f.ema / 0.6) + 0.6 * Math.tanh(f.r24 / 3) + 0.4 * Math.tanh(f.r4 / 1.5) + 0.5 * imb + 0.3 * (f.rsi - 50) / 20;
      const pUp = sig(c.a * z + c.b), edge = Math.abs(2 * pUp - 1), direction = edge < 0.1 ? 'neutral' : pUp > 0.5 ? 'long' : 'short', dirConf = direction === 'neutral' ? 1 - edge : Math.max(pUp, 1 - pUp);
      const sgn = direction === 'long' ? 1 : direction === 'short' ? -1 : 0;
      const agree = sgn === 0 ? 0 : [Math.sign(f.ema) === sgn, Math.sign(f.r4) === sgn, isNum(f.imb5) ? Math.sign(f.imb5) === sgn : false, f.vol >= 1, sgn > 0 ? f.rsi < 72 : f.rsi > 28].filter(Boolean).length;
      const quality = clamp(Math.round(agree * 3 / 5), 0, 3);
      const toxic = clamp((isNum(f.spr) ? sig((f.spr - 8) / 3) : 0.2) + (sgn && isNum(f.imb5) && f.imb5 * sgn < -0.5 ? 0.5 : 0), 0, 1);
      const riskState = portfolio.ddPct >= 0.8 * LIMITS.maxDrawdownPct || portfolio.dayPct <= -0.8 * LIMITS.maxDailyLossPct ? 'reduce' : portfolio.ddPct >= 0.5 * LIMITS.maxDrawdownPct || portfolio.dayPct <= -0.5 * LIMITS.maxDailyLossPct ? 'near_limit' : 'safe';
      out[s.sym] = {regime, regimeConf: r(regimeConf, 3), direction, dirConf: r(dirConf, 4), toxic: r(toxic, 3), quality, riskState, z: r(z, 4), pUp: r(pUp, 4)};
    }
    return out;
  }
  /* Evaluador remoto: una llamada a la API de TypeSafe con todos los candidatos. fetchFn inyectable (pruebas). Si falla ⇒ respaldo local y se registra. */
  function jevEvaluator(o) {
    const key = o && o.apiKey, url = (o && o.url) || 'https://api.typesafe.ai/v1/systemone', model = (o && o.model) || 'jev-latest', fx = (o && o.fetch) || (typeof fetch === 'function' ? fetch : null), timeout = (o && o.timeoutMs) || 4000;
    return async function evaluate(states, portfolio, calib) {
      const local = localEval(states, portfolio, calib);
      if (!key || !fx) return {by: 'jev-local', ev: local, ms: 0};
      const t0 = Date.now();
      try {
        const ctl = typeof AbortController === 'function' ? new AbortController() : null, tm = ctl ? setTimeout(() => ctl.abort(), timeout) : 0;
        const res = await fx(url, {method: 'POST', headers: {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, body: JSON.stringify(jevRequest(states, portfolio, model)), signal: ctl ? ctl.signal : undefined});
        if (tm) clearTimeout(tm); if (!res.ok) throw new Error('HTTP ' + res.status);
        const parsed = parseJev(await res.json(), states.map(s => s.sym)), ev = {};
        for (const s of states) { const p = parsed[s.sym]; ev[s.sym] = p ? Object.assign(p, {z: local[s.sym].z, pUp: isNum(p.pUp) ? p.pUp : (p.direction === 'long' ? p.dirConf : p.direction === 'short' ? 1 - p.dirConf : 0.5)}) : null; }
        return {by: model, ev, ms: Date.now() - t0};
      } catch (e) { return {by: 'jev-local', ev: local, ms: Date.now() - t0, error: String(e && e.message || e)}; }
    };
  }

  /* ───────── Capa de riesgo (determinista; se comprueba ANTES de cada orden) ───────── */
  function portfolioOf(s, marks) {
    let unreal = 0, openN = 0; for (const [sym, p] of Object.entries(s.positions)) { openN++; const px = marks && marks[sym] || p.last || p.entry; unreal += (px - p.entry) * p.qty * (p.side === 'long' ? 1 : -1); }
    const equity = s.cash + unreal, peak = Math.max(s.peak, equity);
    return {equity, peak, ddPct: peak > 0 ? (peak - equity) / peak * 100 : 0, dayPct: s.dayStart > 0 ? (equity - s.dayStart) / s.dayStart * 100 : 0, openN, kill: !!s.kill, halted: !!s.halted};
  }
  function preOrderCheck(s, order, pf) {
    if (order.type === 'exit') return {ok: true}; // reducir riesgo siempre está permitido
    if (s.kill) return {ok: false, why: 'Interruptor de emergencia activado'};
    if (s.halted || pf.ddPct >= LIMITS.maxDrawdownPct) return {ok: false, why: `Drawdown ${r(pf.ddPct)} % ≥ ${LIMITS.maxDrawdownPct} %`};
    if (pf.dayPct <= -LIMITS.maxDailyLossPct) return {ok: false, why: `Pérdida diaria ${r(pf.dayPct)} % ≥ ${LIMITS.maxDailyLossPct} %`};
    if (pf.openN >= LIMITS.maxOpen) return {ok: false, why: `Ya hay ${pf.openN} posiciones (máx. ${LIMITS.maxOpen})`};
    if (s.positions[order.sym]) return {ok: false, why: 'Ya hay posición en ' + order.sym};
    if (!(order.qty > 0) || order.qty * order.px > pf.equity * LIMITS.maxPositionPct / 100 * 1.0001) return {ok: false, why: 'Tamaño fuera del límite por posición'};
    return {ok: true};
  }
  /* Kelly fraccionado con la probabilidad calibrada de Jev. b = ganancia/pérdida (TP/SL). Devuelve fracción del patrimonio a ARRIESGAR (≤ ¼ Kelly). */
  function kelly(p, b) { const f = p - (1 - p) / b; return f > 0 ? f * LIMITS.kellyFraction : 0; }
  function sizeOrder(px, atr, p, equity) {
    const slD = atr * LIMITS.slAtr, b = LIMITS.tpAtr / LIMITS.slAtr, fr = kelly(p, b); if (!(slD > 0) || fr <= 0) return null;
    const qty = Math.min(equity * fr / slD, equity * LIMITS.maxPositionPct / 100 / px); return qty > 0 ? {qty, slD, frac: fr} : null;
  }
  /* Condiciones de ejecución (código): solo entra con setup_quality ≥ 2, confianza > 0,80, risk_state = safe y sin flujo tóxico. */
  function decide(sym, e, st, ctx) {
    const pos = ctx.pos, out = {sym, action: 'hold', why: ''};
    if (!e) return Object.assign(out, {why: 'Evaluación inválida o ausente'});
    if (pos) {
      const opp = pos.side === 'long' ? 'short' : 'long';
      if (e.regime === 'crisis' && e.regimeConf >= 0.6) return Object.assign(out, {action: 'exit', why: 'Régimen de crisis: reducir exposición'});
      if (e.direction === opp && e.dirConf > LIMITS.minDirConf) return Object.assign(out, {action: 'exit', why: `Jev invierte la dirección (${opp} ${r(e.dirConf * 100, 0)} %)`});
      if (e.riskState === 'reduce') return Object.assign(out, {action: 'exit', why: 'risk_state = reduce'});
      return Object.assign(out, {why: 'Mantener posición'});
    }
    if (ctx.escalated) return Object.assign(out, {why: 'Escalado a revisión profunda: sin entradas'});
    if (e.direction === 'neutral') return Object.assign(out, {why: 'Dirección neutral'});
    if (e.quality < LIMITS.minQuality) return Object.assign(out, {why: `setup_quality ${r(e.quality, 1)} < ${LIMITS.minQuality}`});
    if (!(e.dirConf > LIMITS.minDirConf)) return Object.assign(out, {why: `confianza ${r(e.dirConf * 100, 0)} % ≤ ${LIMITS.minDirConf * 100} %`});
    if (e.riskState !== 'safe') return Object.assign(out, {why: 'risk_state = ' + e.riskState});
    if (e.toxic > LIMITS.maxToxic) return Object.assign(out, {why: 'Flujo tóxico'});
    if (e.regime === 'crisis') return Object.assign(out, {why: 'Régimen de crisis'});
    const sz = sizeOrder(st.f.px, st.f.atr / 100 * st.f.px, e.dirConf, ctx.equity); if (!sz) return Object.assign(out, {why: 'Kelly ≤ 0'});
    return Object.assign(out, {action: 'enter', side: e.direction, qty: sz.qty, slD: sz.slD, frac: sz.frac, why: `${e.direction === 'long' ? 'Compra' : 'Venta'} · ${e.regime} · conf ${r(e.dirConf * 100, 1)} % · calidad ${r(e.quality, 1)} · ¼ Kelly ${r(sz.frac * 100, 1)} % (tope ${LIMITS.maxPositionPct} % nocional)`});
  }

  /* ───────── Sesión 24/7 (simulación hacia adelante con capital virtual) ───────── */
  function newSession(o) {
    o = o || {}; const cap = o.capital || 10000;
    return {v: 1, core: VERSION, startT: o.startT, lastT: o.startT, capital: cap, cash: cap, peak: cap, dayKey: day(o.startT || 0), dayStart: cap, positions: {}, pending: {}, ledger: [], preds: [], decisions: {}, events: [], escalations: {}, nightly: [], curve: [[o.startT, cap]],
      calib: {a: 1.2, b: 0, v: 1, at: o.startT}, kill: false, halted: false, symbols: (o.symbols || []).slice(), lastBy: null, stats: {calls: 0, ms: 0, fallbacks: 0}};
  }
  const ev = (s, t, kind, text, extra) => { s.events.push(Object.assign({t, kind, text}, extra || {})); if (s.events.length > 400) s.events.splice(0, s.events.length - 400); };
  const core = t => `${t.sym}|${t.side}|${t.entryT}|${t.exitT}|${t.entry}|${t.exit}|${Math.round(t.net * 1e6)}`;
  function verify(s) { let h = '0'; for (const t of s.ledger) { h = fnv(h + core(t)); if (t.h !== h) return false; } return true; }
  function closePos(s, sym, px, t, why) {
    const p = s.positions[sym], dir = p.side === 'long' ? 1 : -1, fee = px * p.qty * LIMITS.feePct / 100, gross = (px - p.entry) * p.qty * dir, net = gross - p.fee - fee; s.cash += gross - fee;
    const h = fnv((s.ledger.length ? s.ledger[s.ledger.length - 1].h : '0') + core({sym, side: p.side, entryT: p.entryT, exitT: t, entry: p.entry, exit: px, net}));
    s.ledger.push({n: s.ledger.length + 1, sym, side: p.side, entryT: p.entryT, exitT: t, entry: p.entry, exit: px, qty: p.qty, sl: p.sl, tp: p.tp, net, fees: p.fee + fee, r: p.risk ? net / p.risk : null, why, reasonIn: p.why, h});
    delete s.positions[sym]; ev(s, t, 'cierre', `${sym} ${p.side === 'long' ? 'largo' : 'corto'} cerrado (${why}) · neto ${r(net)} USDT`);
  }
  const thin = (a, n) => { while (a.length > n) { const o = [a[0]]; for (let i = 1; i < a.length - 1; i += 2) o.push(a[i]); o.push(a[a.length - 1]); a = o; } return a; };
  /* Avanza la sesión hasta la última vela cerrada.
     feed.candles(sym, count) → velas 1h CERRADAS ascendentes · feed.book(sym) → libro actual o null · evaluate(states, portfolio, calib) → {by, ev}. */
  async function step(s, feed, evaluate, now) {
    now = now || Date.now(); const syms = s.symbols; if (!syms.length) return {bars: 0};
    const need = Math.min(1000, Math.ceil((now - s.lastT) / IV) + 260), data = {};
    s.skip = s.skip || {};
    for (const sym of syms) { if (s.skip[sym] && now - s.skip[sym] < 864e5) continue; try { const C = await feed.candles(sym, need); if (C && C.length >= 80) { data[sym] = C.filter(c => c.t + IV <= now); delete s.skip[sym]; } } catch (e) { s.skip[sym] = now; ev(s, now, 'datos', `Sin velas de ${sym} (${e.message}); se reintenta en 24 h.`); } }
    const avail = Object.keys(data); if (!avail.length) return {bars: 0};
    const times = [...new Set(avail.flatMap(sym => data[sym].map(c => c.t)))].filter(t => t + IV > s.lastT).sort((a, b) => a - b); // se procesan TODAS en orden (nunca se salta velas)
    if (times.length && times[0] > s.lastT + 1) { ev(s, times[0], 'datos', `Hueco de datos: no hay velas entre ${iso(s.lastT)} y ${iso(times[0])}; las posiciones se valoran al siguiente precio disponible.`); }
    const idx = {}; for (const sym of avail) { idx[sym] = new Map(data[sym].map((c, i) => [c.t, i])); }
    const lastTs = Math.max(...avail.map(sym => data[sym][data[sym].length - 1].t)), books = {};
    for (const sym of avail) if (feed.book && data[sym][data[sym].length - 1].t === lastTs) { try { books[sym] = await feed.book(sym); } catch { books[sym] = null; } }
    let bars = 0;
    for (const T of times) {
      const closeT = T + IV; if (closeT <= s.lastT) continue; bars++;
      // 1) día UTC
      if (day(T) !== s.dayKey) { s.dayKey = day(T); s.dayStart = portfolioOf(s).equity; }
      // 2) órdenes pendientes → apertura de esta vela (preOrderCheck antes de CADA orden)
      for (const sym of Object.keys(s.pending)) {
        const i = idx[sym] && idx[sym].get(T); if (i == null) continue; const c = data[sym][i], o = s.pending[sym]; delete s.pending[sym];
        const pf = portfolioOf(s); if (o.type === 'enter') o.qty = Math.min(o.qty, pf.equity * LIMITS.maxPositionPct / 100 / (c.o * (1 + LIMITS.slipPct / 100))); // ajusta al precio real de apertura
        const chk = preOrderCheck(s, Object.assign({}, o, {px: c.o}), pf);
        if (!chk.ok) { ev(s, T, 'veto', `${sym}: orden bloqueada por riesgo — ${chk.why}`); continue; }
        if (o.type === 'exit' && s.positions[sym]) { const p = s.positions[sym]; closePos(s, sym, p.side === 'long' ? c.o * (1 - LIMITS.slipPct / 100) : c.o * (1 + LIMITS.slipPct / 100), T, o.why); }
        else if (o.type === 'enter') {
          const long = o.side === 'long', px = long ? c.o * (1 + LIMITS.slipPct / 100) : c.o * (1 - LIMITS.slipPct / 100), qty = Math.min(o.qty, pf.equity * LIMITS.maxPositionPct / 100 / px), fee = px * qty * LIMITS.feePct / 100;
          s.cash -= fee; s.positions[sym] = {side: o.side, entry: px, qty, sl: long ? px - o.slD : px + o.slD, tp: long ? px + o.slD * LIMITS.tpAtr / LIMITS.slAtr : px - o.slD * LIMITS.tpAtr / LIMITS.slAtr, entryT: T, fee, risk: o.slD * qty, why: o.why, last: c.o};
          ev(s, T, 'entrada', `${sym} ${long ? 'COMPRA' : 'VENTA'} ${+qty.toPrecision(4)} @ ${+px.toPrecision(6)} · ${o.why}`);
        }
      }
      // 3) SL / TP / tiempo dentro de la vela (si ambos en la misma vela: primero el stop)
      for (const sym of Object.keys(s.positions)) {
        const i = idx[sym] && idx[sym].get(T); if (i == null) continue; const c = data[sym][i], p = s.positions[sym], long = p.side === 'long';
        if (long ? c.l <= p.sl : c.h >= p.sl) closePos(s, sym, long ? Math.min(p.sl, c.o) * (1 - LIMITS.slipPct / 100) : Math.max(p.sl, c.o) * (1 + LIMITS.slipPct / 100), T, 'Stop loss');
        else if (long ? c.h >= p.tp : c.l <= p.tp) closePos(s, sym, long ? Math.max(p.tp, c.o) : Math.min(p.tp, c.o), T, 'Take profit');
        else { p.last = c.c; if ((T - p.entryT) / IV >= LIMITS.maxBars) s.pending[sym] = {type: 'exit', sym, why: `Tiempo máximo (${LIMITS.maxBars} velas)`}; }
      }
      // 4) valoración al cierre y drawdown (interruptor automático)
      const marks = {}; for (const sym of avail) { const i = idx[sym].get(T); if (i != null) marks[sym] = data[sym][i].c; }
      let pf = portfolioOf(s, marks); if (pf.equity > s.peak) s.peak = pf.equity;
      if (!s.halted && pf.ddPct >= LIMITS.maxDrawdownPct) { s.halted = true; ev(s, closeT, 'riesgo', `Drawdown ${r(pf.ddPct)} % alcanzó el máximo (${LIMITS.maxDrawdownPct} %): se cierran posiciones y se detienen las entradas.`); for (const sym of Object.keys(s.positions)) s.pending[sym] = {type: 'exit', sym, why: 'Límite de drawdown'}; }
      if (s.kill) for (const sym of Object.keys(s.positions)) s.pending[sym] = {type: 'exit', sym, why: 'Interruptor de emergencia'};
      // 5) decisión al cierre: estado causal de TODOS los candidatos → UNA llamada a Jev
      const states = [];
      for (const sym of avail) { const i = idx[sym].get(T); if (i == null || i < 80) continue; try { const st = buildState(sym, data[sym].slice(Math.max(0, i - 299), i + 1), {t: closeT, book: T === lastTs ? books[sym] : null, pos: s.positions[sym], equity: pf.equity}); if (st) states.push(st); } catch (e) { ev(s, closeT, 'datos', e.message); } }
      if (states.length) {
        const res = await evaluate(states, pf, s.calib); s.stats.calls++; s.stats.ms += res.ms || 0; if (res.error) s.stats.fallbacks++; s.lastBy = res.by;
        for (const st of states) {
          const e = res.ev[st.sym], prevReg = (s.decisions[st.sym] || {}).regime;
          if (e && isNum(e.pUp)) { s.preds.push({t: closeT, sym: st.sym, pUp: e.pUp, z: e.z, regime: e.regime, q: e.quality, dir: e.direction, conf: e.dirConf, px: st.f.px, atr: st.f.atr, act: null, o: null}); }
          // escalada: confianza baja + cambio de régimen a crisis ⇒ revisión profunda (Opus) y sin entradas en ese símbolo
          if (e && e.dirConf < LIMITS.escalateBelow && e.regime === 'crisis' && prevReg && prevReg !== 'crisis' && !s.escalations[st.sym]) { s.escalations[st.sym] = {t: closeT, from: prevReg, conf: e.dirConf, open: true}; ev(s, closeT, 'escalada', `${st.sym}: confianza ${r(e.dirConf * 100, 0)} % y régimen ${prevReg} → crisis. Se escala a revisión profunda (Opus 5.5); sin entradas hasta que se revise.`); }
          const d = s.kill || s.halted ? {sym: st.sym, action: 'hold', why: s.kill ? 'Interruptor de emergencia' : 'Detenido por drawdown'} : decide(st.sym, e, st, {pos: s.positions[st.sym], equity: pf.equity, escalated: !!(s.escalations[st.sym] && s.escalations[st.sym].open)});
          if (s.preds.length && s.preds[s.preds.length - 1].sym === st.sym && s.preds[s.preds.length - 1].t === closeT) s.preds[s.preds.length - 1].act = d.action;
          s.decisions[st.sym] = Object.assign({t: closeT, by: res.by, px: st.f.px, tokens: st.tokens, book: st.book, state: st.text}, e || {}, {action: d.action, why: d.why});
          if (d.action === 'enter') s.pending[st.sym] = {type: 'enter', sym: st.sym, side: d.side, qty: d.qty, slD: d.slD, why: d.why};
          else if (d.action === 'exit' && s.positions[st.sym]) s.pending[st.sym] = {type: 'exit', sym: st.sym, why: d.why};
        }
      }
      s.lastT = closeT; pf = portfolioOf(s, marks); s.curve.push([closeT, Math.round(pf.equity * 100) / 100]);
    }
    resolvePreds(s, data); if (s.preds.length > 2500) s.preds.splice(0, s.preds.length - 2500); s.curve = thin(s.curve, 500);
    return {bars};
  }
  function resolvePreds(s, data) { // resultado a 4 velas: ¿subió el precio? (para la puntuación de Brier)
    for (const p of s.preds) { if (p.o !== null) continue; const C = data[p.sym]; if (!C) continue; const i = C.findIndex(c => c.t + IV === p.t); if (i < 0 || i + 4 >= C.length) continue; p.ret = (C[i + 4].c / C[i].c - 1) * 100; p.o = p.ret > 0 ? 1 : 0; }
  }
  function stats(s) {
    const pf = portfolioOf(s), n = s.ledger.length, w = s.ledger.filter(t => t.net > 0), gw = w.reduce((a, t) => a + t.net, 0), gl = -s.ledger.filter(t => t.net <= 0).reduce((a, t) => a + t.net, 0);
    let pk = s.capital, mdd = 0; for (const [, e] of s.curve) { if (e > pk) pk = e; mdd = Math.max(mdd, (pk - e) / pk * 100); }
    return {equity: pf.equity, net: pf.equity - s.capital, retPct: (pf.equity / s.capital - 1) * 100, ddPct: pf.ddPct, dayPct: pf.dayPct, maxDDPct: mdd, n, winRate: n ? w.length / n * 100 : null, profitFactor: gl > 0 ? gw / gl : null, open: pf.openN, fees: s.ledger.reduce((a, t) => a + t.fees, 0)};
  }

  /* ───────── Auto-mejora nocturna: Brier, oportunidades perdidas y recalibración (solo probabilidades, nunca límites) ───────── */
  const brier = a => a.length ? a.reduce((x, p) => x + (p.pUp - p.o) ** 2, 0) / a.length : null;
  function fitPlatt(rows, a0, b0) { // minimiza log-loss de sig(a·z+b) con descenso de gradiente acotado
    let a = a0, b = b0; for (let it = 0; it < 400; it++) { let ga = 0, gb = 0; for (const p of rows) { const q = sig(a * p.z + b), d = q - p.o; ga += d * p.z; gb += d; } a = clamp(a - 0.5 * ga / rows.length, CALIB_BOUNDS.aMin, CALIB_BOUNDS.aMax); b = clamp(b - 0.5 * gb / rows.length, CALIB_BOUNDS.bMin, CALIB_BOUNDS.bMax); }
    return {a, b};
  }
  function nightly(s, now) {
    now = now || Date.now(); const done = s.preds.filter(p => p.o !== null && isNum(p.z)), rep = {t: now, n: done.length, brier: r(brier(done), 4), base: 0.25, byRegime: {}, bins: [], trades: stats(s), missed: [], calib: Object.assign({}, s.calib), changed: false, note: ''};
    for (const g of REGIMES) { const a = done.filter(p => p.regime === g); if (a.length) rep.byRegime[g] = {n: a.length, brier: r(brier(a), 4)}; }
    for (let k = 0; k < 10; k++) { const a = done.filter(p => p.pUp >= k / 10 && p.pUp < (k + 1) / 10 + (k === 9 ? 1e-9 : 0)); if (a.length) rep.bins.push({p: (k + 0.5) / 10, n: a.length, hit: r(a.reduce((x, p) => x + p.o, 0) / a.length, 3)}); }
    rep.missed = done.filter(p => p.act === 'hold' && isNum(p.ret) && isNum(p.atr) && Math.abs(p.ret) > 1.5 * p.atr && (p.ret > 0) === (p.pUp > 0.5)).sort((a, b) => Math.abs(b.ret) - Math.abs(a.ret)).slice(0, 8).map(p => ({t: p.t, sym: p.sym, ret: r(p.ret), pUp: p.pUp, q: p.q, conf: p.conf}));
    if (done.length >= 150) { // recalibración con validación temporal 70/30: solo se adopta si mejora Brier fuera de muestra
      const cut = Math.floor(done.length * 0.7), tr = done.slice(0, cut), ho = done.slice(cut), cand = fitPlatt(tr, s.calib.a, s.calib.b);
      const bOld = ho.reduce((x, p) => x + (sig(s.calib.a * p.z + s.calib.b) - p.o) ** 2, 0) / ho.length, bNew = ho.reduce((x, p) => x + (sig(cand.a * p.z + cand.b) - p.o) ** 2, 0) / ho.length;
      rep.holdout = {old: r(bOld, 4), new: r(bNew, 4), n: ho.length};
      if (bNew < bOld - 5e-4) { s.calib = {a: r(cand.a, 4), b: r(cand.b, 4), v: s.calib.v + 1, at: now}; rep.changed = true; rep.note = `Esquema de Jev v${s.calib.v} desplegado: calibración a=${s.calib.a}, b=${s.calib.b} (Brier fuera de muestra ${r(bOld, 4)} → ${r(bNew, 4)}).`; }
      else rep.note = 'La recalibración no mejoró fuera de muestra: se mantiene la versión actual.';
    } else rep.note = `Muestra insuficiente para recalibrar (${done.length}/150 predicciones resueltas).`;
    for (const [sym, x] of Object.entries(s.escalations)) if (x.open && now - x.t > 864e5) { x.open = false; x.closedAt = now; ev(s, now, 'escalada', `${sym}: la escalada se cerró tras la revisión nocturna (24 h sin reactivar).`); }
    rep.calibAfter = Object.assign({}, s.calib); s.nightly.push(rep); if (s.nightly.length > 30) s.nightly.splice(0, s.nightly.length - 30); ev(s, now, 'nocturno', rep.note);
    return rep;
  }
  return {VERSION, TF, IV, LIMITS, CALIB_BOUNDS, REGIMES, buildState, bookFeatures, jevSchema, jevRequest, parseJev, localEval, jevEvaluator, kelly, sizeOrder, decide, preOrderCheck, portfolioOf, newSession, step, stats, nightly, verify, estTokens};
});

/* NOVA BOT LAB · vigilante de mejoras («con conciencia»).
   Cuando el servidor aplica sola una versión nueva de un bot, esa versión queda «a prueba» en la simulación en vivo (paper trading).
   El vigilante compara cómo le va EN VIVO contra cómo le iba a la versión anterior:
     · Si rinde peor (o se cae más de lo normal) → regresa sola a la versión que sí funcionaba y anota qué cambio falló,
       para que el optimizador pruebe OTRA variante de ese mismo filtro (p. ej. otro valor del RCI) y no repita la que falló.
     · Si rinde igual o mejor con suficientes operaciones → la confirma.
   Funciones puras: las usa scripts/botlab-retrain.js (servidor) y se prueban en tests/botlab-guard.test.js. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.BotGuard = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const RULES = {
    minTrades: 8,        // operaciones cerradas mínimas para juzgar a la versión nueva
    confirmTrades: 15,   // con estas (y sin rendir peor) se confirma
    fastTrades: 3,       // con una caída fuera de lo normal se juzga desde aquí
    maxDays: 21,         // a los 21 días se decide con lo que haya
    tolPct: .05,         // tolerancia en % del capital por operación (ruido)
    prevWindow: 30       // cuántas operaciones de la versión anterior se usan para comparar
  };
  const DAY = 864e5;

  /* Rendimiento en vivo de un grupo de sesiones de paper: operaciones, neto, % por operación y caída máxima */
  function liveStats(sessions, opts) {
    opts = opts || {}; const ss = (sessions || []).filter(Boolean); let cap = 0, net = 0, n = 0, dd = 0, trades = [];
    for (const s of ss) {
      cap += +s.capital || 0;
      let L = (s.ledger || []).filter(t => Number.isFinite(+t.net)); if (opts.before) L = L.filter(t => (t.exitT || 0) < opts.before);
      trades = trades.concat(L.map(t => ({net: +t.net, t: t.exitT || 0, cap: +s.capital || 0})));
      let eq = +s.capital || 0, pk = eq; for (const t of L) { eq += +t.net; if (eq > pk) pk = eq; const d = pk > 0 ? (pk - eq) / pk * 100 : 0; if (d > dd) dd = d; }
    }
    trades.sort((a, b) => a.t - b.t); if (opts.last) trades = trades.slice(-opts.last);
    for (const t of trades) { net += t.net; n++; }
    const capAvg = ss.length ? cap / ss.length : 0, retPct = cap > 0 ? net / cap * 100 : 0;
    return {n, net, retPct, perTrade: n ? retPct / n : 0, ddPct: dd, capital: capAvg};
  }

  /* ¿Qué hacer con la versión a prueba? → {action: 'rollback' | 'confirm' | 'wait', why, live, prev} */
  function evaluate(bot, now, rules) {
    const R = Object.assign({}, RULES, rules || {}), mv = (bot.versions || []).find(v => v.v === bot.mainV), pr = mv && mv.probation;
    if (!mv || !pr) return {action: 'none'};
    const paper = bot.paper || [], since = pr.since || mv.at || 0;
    const mine = paper.filter(s => s.v === mv.v && (s.startT || 0) >= since - 6e4);
    const old = paper.filter(s => s.v === pr.prevV);
    const live = liveStats(mine), prev = liveStats(old, {before: since, last: R.prevWindow}), days = (now - since) / DAY;
    const prevKnown = prev.n >= 5, worse = live.perTrade < (prevKnown ? prev.perTrade : 0) - R.tolPct;
    const fmt = x => (x >= 0 ? '+' : '') + (Math.round(x * 100) / 100) + ' %';
    const cmp = prevKnown ? ` contra ${fmt(prev.perTrade)} por operación de la v${pr.prevV}` : '';
    // 1) caída fuera de lo normal: no se espera a juntar más operaciones
    const ddLimit = Math.max(8, (prevKnown ? prev.ddPct : (pr.expectDD || 0)) * 1.5 + 2);
    if (live.n >= R.fastTrades && live.ddPct > ddLimit && live.net < 0) return {action: 'rollback', why: `en vivo cayó ${Math.round(live.ddPct * 10) / 10} % (límite ${Math.round(ddLimit)} %) en ${live.n} operaciones`, live, prev, days};
    // 2) con operaciones suficientes: si rinde peor y pierde → regresar; si no → confirmar al llegar a confirmTrades
    if (live.n >= R.minTrades && worse && live.net < 0) return {action: 'rollback', why: `en vivo rinde ${fmt(live.perTrade)} por operación en ${live.n} operaciones${cmp}`, live, prev, days};
    if (live.n >= R.confirmTrades && !worse) return {action: 'confirm', why: `en vivo rinde ${fmt(live.perTrade)} por operación en ${live.n} operaciones${cmp}`, live, prev, days};
    // 3) se acabó el tiempo de prueba
    if (days >= R.maxDays) {
      if (live.n >= 4 && live.net < 0 && worse) return {action: 'rollback', why: `después de ${Math.round(days)} días pierde (${fmt(live.retPct)} en ${live.n} operaciones)${cmp}`, live, prev, days};
      return {action: 'confirm', why: live.n ? `después de ${Math.round(days)} días no rinde peor (${fmt(live.retPct)} en ${live.n} operaciones)` : `después de ${Math.round(days)} días sin operaciones que la contradigan`, live, prev, days};
    }
    return {action: 'wait', why: `a prueba: ${live.n} de ${R.minTrades} operaciones`, live, prev, days};
  }

  /* Cambios que fallaron en vivo → lista de «no repetir» (ruta del parámetro + valor) para el optimizador */
  function avoidFrom(changes) {
    return (changes || []).filter(c => c && c.path && Number.isFinite(+c.to)).map(c => ({path: c.path, value: +c.to}));
  }
  function mergeAvoid(list, add, max) {
    const out = (list || []).slice(); for (const a of add || []) if (!out.some(x => x.path === a.path && +x.value === +a.value)) out.push(a);
    return out.slice(-(max || 40));
  }
  /* Quita del espacio de búsqueda los valores que ya fallaron (se queda el valor actual) */
  function pruneDims(dims, avoid) {
    if (!Array.isArray(avoid) || !avoid.length) return dims;
    for (const d of dims) d.values = d.values.filter(v => v === d.base || !avoid.some(a => a.path === d.path && Math.abs(+a.value - v) < 1e-9));
    return dims.filter(d => d.values.length > 1);
  }
  return {RULES, liveStats, evaluate, avoidFrom, mergeAvoid, pruneDims};
});

/* VORTEX · Evaluación de alertas con indicador (indicadores comunes, Nova Nexus y scripts Pine) sobre una vela CERRADA.
   Funciones puras: las usa la app (app.js) y el servidor (scripts/ind-alerts.js, en GitHub Actions) para que la alerta
   salte igual con la app abierta o cerrada. */
(function (root) {
  'use strict';
  const T0 = () => (root.CCTIndicators || (typeof require === 'function' ? (() => { try { return require('./indicators.js'); } catch { return null; } })() : null));
  const crossUp = (a, b, k) => k > 0 && a[k] != null && b[k] != null && a[k - 1] != null && b[k - 1] != null && a[k - 1] <= b[k - 1] && a[k] > b[k];
  const crossDn = (a, b, k) => k > 0 && a[k] != null && b[k] != null && a[k - 1] != null && b[k - 1] != null && a[k - 1] >= b[k - 1] && a[k] < b[k];
  function ema(xs, n) {
    const out = Array(xs.length).fill(null); if (xs.length < n) return out;
    const k = 2 / (n + 1); let e = xs.slice(0, n).reduce((a, b) => a + b, 0) / n; out[n - 1] = e;
    for (let i = n; i < xs.length; i++) { e = xs[i] * k + e * (1 - k); out[i] = e; }
    return out;
  }
  function sma(xs, n) {
    const out = Array(xs.length).fill(null); let s = 0;
    for (let i = 0; i < xs.length; i++) { s += xs[i]; if (i >= n) s -= xs[i - n]; if (i >= n - 1) out[i] = s / n; }
    return out;
  }
  function rsi(xs, n = 14) {
    const out = Array(xs.length).fill(null); if (xs.length <= n) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= n; i++) { const d = xs[i] - xs[i - 1]; gain += Math.max(0, d); loss += Math.max(0, -d); }
    gain /= n; loss /= n; out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    for (let i = n + 1; i < xs.length; i++) {
      const d = xs[i] - xs[i - 1];
      gain = (gain * (n - 1) + Math.max(0, d)) / n; loss = (loss * (n - 1) + Math.max(0, -d)) / n;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
    return out;
  }
  function stdHit(cs, k, spec) {
    const c = cs.map(x => x.c), T = T0(), K = spec.k, flat = v => c.map(() => v);
    if (K === 'ema_x_up' || K === 'ema_x_dn') { const a = ema(c, 20), b = ema(c, 50); return (K === 'ema_x_up' ? crossUp : crossDn)(a, b, k); }
    if (K === 'px_ema20_up' || K === 'px_ema20_dn') return (K.endsWith('up') ? crossUp : crossDn)(c, ema(c, 20), k);
    if (K === 'px_sma200_up' || K === 'px_sma200_dn') return (K.endsWith('up') ? crossUp : crossDn)(c, sma(c, 200), k);
    if (K === 'rsi_up' || K === 'rsi_dn') { const r = rsi(c, 14), L = Number.isFinite(+spec.lvl) ? +spec.lvl : (K === 'rsi_up' ? 70 : 30); return (K === 'rsi_up' ? crossUp : crossDn)(r, flat(L), k); }
    if (K === 'macd_up' || K === 'macd_dn') { if (!T) return false; const m = T.macd(c); return (K === 'macd_up' ? crossUp : crossDn)(m.macd || m.line, m.signal || m.sig, k); }
    if (K === 'bb_up' || K === 'bb_dn') { const m = sma(c, 20), band = i => { if (i < 19 || m[i] == null) return null; let s = 0; for (let q = i - 19; q <= i; q++) { const d = c[q] - m[i]; s += d * d; } return Math.sqrt(s / 20) * 2; }, d1 = band(k), d0 = band(k - 1); if (d1 === null || d0 === null) return false; return K === 'bb_up' ? (c[k] > m[k] + d1 && c[k - 1] <= m[k - 1] + d0) : (c[k] < m[k] - d1 && c[k - 1] >= m[k - 1] - d0); } // primer cierre fuera de la banda
    if (K === 'st_up' || K === 'st_dn') { if (!T) return false; const st = T.supertrend(cs, 10, 3), d = st && st.dir; if (!d || k < 1 || d[k] == null || d[k - 1] == null) return false; return K === 'st_up' ? (d[k] < 0 && d[k - 1] >= 0) : (d[k] > 0 && d[k - 1] <= 0); } // en Supertrend dir = -1 es tendencia alcista
    return false;
  }
  function pineSeriesAt(res, s, cs, k) { // s: {p: idPlot} | {price:1} | {n: número}
    if (s.price) return cs[k] ? cs[k].c : null;
    if (s.n !== undefined) return +s.n;
    const pl = res.plots.find(x => x.id === s.p); const v = pl && pl.values ? pl.values[k] : null; return v === undefined || v === null || Number.isNaN(v) ? null : v;
  }
  function pineHit(res, spec, cs, k) { // → {hit, msg}
    if (spec.t === 'ac') {
      const it = (res.alerts || []).find(x => x.kind === spec.kind && x.title === spec.title) || (res.alerts || [])[spec.i];
      if (!it) return {hit: false}; const hit = it.bars.includes(k); return {hit, msg: hit ? (it.msgs[k] || it.message || it.title) : ''};
    }
    if (spec.t === 'sh') { const sh = res.shapes.find(x => x.title === spec.title && x.kind === spec.kind) || res.shapes[spec.i]; const hit = !!(sh && sh.pts.some(p => p[0] === k)); return {hit, msg: hit ? (sh.title || 'Señal') : ''}; }
    if (spec.t === 'x') {
      const A = i => pineSeriesAt(res, spec.a, cs, i), B = i => pineSeriesAt(res, spec.b, cs, i), a0 = A(k - 1), a1 = A(k), b0 = B(k - 1), b1 = B(k);
      if ([a0, a1, b0, b1].some(v => v === null)) return {hit: false};
      const hit = spec.dir === 'up' ? (a0 <= b0 && a1 > b1) : (a0 >= b0 && a1 < b1); return {hit, msg: ''};
    }
    return {hit: false};
  }
  function closedIdx(cs, lastClosedT) { for (let i = cs.length - 1; i >= 0; i--) if (cs[i].t === lastClosedT) return i; return -1; }
  /* Velas que toca revisar: las cerradas después de lastBar, hasta 5 hacia atrás (como la app) */
  function barsToCheck(cs, k, lastBar) { const out = []; for (let i = Math.max(1, k - 4); i <= k; i++) if (cs[i].t > (lastBar || 0)) out.push(i); return out; }
  const api = {stdHit, pineHit, pineSeriesAt, closedIdx, barsToCheck, ema, sma, rsi, crossUp, crossDn};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTAlertEval = api;
})(typeof self !== 'undefined' ? self : this);

/* VORTEX · Datos de derivados en vivo (futuros perpetuos USDT de Binance, datos públicos).
   Funding, interés abierto, ratio long/short (cuentas y top traders), volumen comprador/vendedor agresivo y prima mark/índice.
   Si el navegador no llega directo a Binance, se pide por el servidor VORTEX (/mkt). */
(function (root) {
  'use strict';
  const F = 'https://fapi.binance.com', PROXY = 'https://vortex-push.soobroon.workers.dev/mkt?u=';
  const PERIODS = ['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'];
  const PER_MS = {'5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '2h': 72e5, '4h': 144e5, '6h': 216e5, '12h': 432e5, '1d': 864e5};
  const sum = {}, ser = {}, bad = {}; let listeners = [], viaProxy = false;
  const fin = Number.isFinite;

  async function get(path) {
    const url = F + path, tryOne = async u => { const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000); try { const r = await fetch(u, {signal: ctl.signal}); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(to); } };
    if (!viaProxy) try { return await tryOne(url); } catch (e) { if (/HTTP 4\d\d/.test(e.message)) throw e; viaProxy = true; }
    return tryOne(PROXY + encodeURIComponent(url));
  }
  // periodo de los datos históricos según la temporalidad del gráfico (Binance solo guarda 30 días)
  function periodFor(ivMs) { let best = '5m'; for (const p of PERIODS) if (PER_MS[p] <= ivMs) best = p; return best; }
  const emit = () => { for (const f of listeners) try { f(); } catch {} };

  // resumen en vivo: funding, cuenta regresiva, interés abierto y su cambio 24 h, ratio L/S, prima
  async function loadSummary(fs) {
    if (!fs || bad[fs]) return null;
    try {
      const [pi, oi, h1, ls] = await Promise.all([
        get(`/fapi/v1/premiumIndex?symbol=${fs}`), get(`/fapi/v1/openInterest?symbol=${fs}`),
        get(`/futures/data/openInterestHist?symbol=${fs}&period=1h&limit=25`).catch(() => null),
        get(`/futures/data/globalLongShortAccountRatio?symbol=${fs}&period=5m&limit=1`).catch(() => null)]);
      const mark = +pi.markPrice, idx = +pi.indexPrice, oiQ = +oi.openInterest, a = Array.isArray(h1) ? h1 : [];
      const oiUsd = oiQ * mark, old = a.length ? +a[0].sumOpenInterestValue : NaN;
      sum[fs] = {at: Date.now(), fund: +pi.lastFundingRate * 100, next: +pi.nextFundingTime, mark, idx, basis: (mark / idx - 1) * 100,
        oi: oiQ, oiUsd, oiChg: fin(old) && old > 0 ? (oiUsd / old - 1) * 100 : NaN, ls: ls && ls[0] ? +ls[0].longShortRatio : NaN, longPct: ls && ls[0] ? +ls[0].longAccount * 100 : NaN};
      emit(); return sum[fs];
    } catch (e) { if (/HTTP 400/.test(e.message)) bad[fs] = true; return null; }
  }
  // series para los paneles: se piden solo las que estén activas
  async function loadSeries(fs, ivMs, keys) {
    if (!fs || bad[fs]) return; const per = periodFor(ivMs), k0 = fs + '|' + per, S = ser[k0] || (ser[k0] = {at: {}});
    const want = keys.filter(k => !S.at[k] || Date.now() - S.at[k] > 5 * 6e4); if (!want.length) return;
    const jobs = want.map(async k => {
      try {
        if (k === 'oi') S.oi = (await get(`/futures/data/openInterestHist?symbol=${fs}&period=${per}&limit=500`)).map(x => [+x.timestamp, +x.sumOpenInterestValue]);
        else if (k === 'lsr') { const [a, b] = await Promise.all([get(`/futures/data/globalLongShortAccountRatio?symbol=${fs}&period=${per}&limit=500`), get(`/futures/data/topLongShortPositionRatio?symbol=${fs}&period=${per}&limit=500`)]); S.lsr = a.map(x => [+x.timestamp, +x.longShortRatio]); S.top = b.map(x => [+x.timestamp, +x.longShortRatio]); }
        else if (k === 'taker') S.taker = (await get(`/futures/data/takerlongshortRatio?symbol=${fs}&period=${per}&limit=500`)).map(x => [+x.timestamp, (+x.buyVol - +x.sellVol)]);
        else if (k === 'funding') S.funding = (await get(`/fapi/v1/fundingRate?symbol=${fs}&limit=1000`)).map(x => [+x.fundingTime, +x.fundingRate * 100]);
        S.at[k] = Date.now();
      } catch (e) { if (/HTTP 400/.test(e.message)) bad[fs] = true; }
    });
    await Promise.all(jobs); emit();
  }
  // una muestra por vela: el último dato publicado hasta el cierre de esa vela (sin mirar al futuro)
  function align(points, candles, ivMs, perMs) {
    const n = candles.length, out = new Array(n).fill(null); if (!points || !points.length || !n) return out;
    const P = points.slice().sort((a, b) => a[0] - b[0]); let j = -1;
    const lagOk = perMs ? perMs * 3 : Infinity;
    for (let i = 0; i < n; i++) {
      const tEnd = candles[i].t + ivMs; while (j + 1 < P.length && P[j + 1][0] < tEnd) j++;
      if (j >= 0 && candles[i].t - P[j][0] <= lagOk) out[i] = P[j][1];
    }
    return out;
  }
  function series(fs, ivMs, key, candles) {
    const per = periodFor(ivMs), S = ser[fs + '|' + per]; if (!S) return null;
    if (key === 'funding') return S.funding ? align(S.funding, candles, ivMs, 8 * 36e5) : null;
    if (key === 'taker') { if (!S.taker) return null; // delta de cada periodo sumado en la vela donde empieza
      const out = new Array(candles.length).fill(null), P = S.taker.slice().sort((x, y) => x[0] - y[0]); let i = 0;
      for (const [t, v] of P) { while (i < candles.length && candles[i].t + ivMs <= t) i++; if (i >= candles.length) break; if (candles[i].t <= t) out[i] = (out[i] || 0) + v; }
      return out; }
    if (key === 'lsr') return S.lsr ? {acc: align(S.lsr, candles, ivMs, PER_MS[per]), top: align(S.top || [], candles, ivMs, PER_MS[per])} : null;
    if (key === 'oi') return S.oi ? align(S.oi, candles, ivMs, PER_MS[per]) : null;
    return null;
  }
  // lectura educativa del momento (precio vs. interés abierto, funding y posicionamiento)
  function reading(s, priceChg) {
    if (!s) return '';
    const out = [];
    if (fin(s.oiChg) && fin(priceChg)) {
      if (priceChg > .3 && s.oiChg > 1) out.push('Precio e interés abierto suben: entra dinero nuevo a la subida.');
      else if (priceChg > .3 && s.oiChg < -1) out.push('Sube el precio pero baja el interés abierto: se están cerrando shorts.');
      else if (priceChg < -.3 && s.oiChg > 1) out.push('Baja el precio y sube el interés abierto: se abren shorts nuevos.');
      else if (priceChg < -.3 && s.oiChg < -1) out.push('Bajan precio e interés abierto: se cierran largos (desapalancamiento).');
    }
    if (fin(s.fund)) { if (s.fund >= .05) out.push('Funding muy alto: muchos largos pagando; riesgo de barrida hacia abajo.'); else if (s.fund <= -.02) out.push('Funding negativo: dominan los shorts; ojo con un squeeze al alza.'); }
    if (fin(s.ls)) { if (s.ls >= 2.5) out.push('La mayoría de cuentas está en largo.'); else if (s.ls <= .7) out.push('La mayoría de cuentas está en corto.'); }
    return out.join(' ');
  }
  const api = {loadSummary, loadSeries, series, summary: fs => sum[fs] || null, periodFor, align, reading, unsupported: fs => !!bad[fs], on: f => { listeners.push(f); }, PER_MS};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTDerivs = api;
})(typeof self !== 'undefined' ? self : this);

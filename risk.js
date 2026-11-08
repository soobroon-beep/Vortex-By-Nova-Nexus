/* Calculadora de riesgo de VORTEX (funciones puras, se prueban aparte).
   Con tu capital, el % que quieres arriesgar, la entrada y el stop calcula el tamaño de la posición,
   el margen con tu apalancamiento, lo que pierdes en el stop y ganas en el objetivo (con comisiones),
   el R:R y un precio de liquidación aproximado (margen aislado). No es asesoría financiera. */
(function (root) {
  'use strict';
  const MMR = 0.005; // margen de mantenimiento típico (0.5 %) de perpetuos USDT en el primer tramo
  function calc(o) {
    const cap = +o.capital, risk = +o.riskPct, entry = +o.entry, stop = +o.stop, target = +o.target, lev = Math.max(1, Math.min(200, +o.leverage || 1)), fee = Math.max(0, +o.feePct || 0) / 100;
    const out = {ok: false, warn: []};
    if (!(cap > 0) || !(risk > 0) || !(entry > 0) || !(stop > 0) || entry === stop) { out.error = !(cap > 0) ? 'Escribe tu capital' : !(entry > 0) ? 'Falta el precio de entrada' : !(stop > 0) || entry === stop ? 'El stop debe ser distinto a la entrada' : 'Falta el % de riesgo'; return out; }
    const long = stop < entry, dist = Math.abs(entry - stop), riskUsd = cap * risk / 100;
    // pérdida por unidad en el stop = distancia + comisión de entrada y de salida
    const perUnitLoss = dist + entry * fee + stop * fee, qty = riskUsd / perUnitLoss, notional = qty * entry, margin = notional / lev;
    const liq = long ? entry * (1 - 1 / lev + MMR) : entry * (1 + 1 / lev - MMR);
    const hasT = target > 0 && (long ? target > entry : target < entry);
    const gain = hasT ? qty * Math.abs(target - entry) - qty * (entry + target) * fee : null;
    Object.assign(out, {ok: true, long, qty, notional, margin, riskUsd, loss: qty * perUnitLoss, gain, rr: hasT ? gain / (qty * perUnitLoss) : null, liq, lev, distPct: dist / entry * 100, fees: qty * (entry + stop) * fee});
    if (long ? stop <= liq : stop >= liq) out.warn.push('Te liquidarían antes de tocar el stop: baja el apalancamiento o acerca el stop.');
    if (margin > cap) out.warn.push('El margen necesario es mayor que tu capital: sube el apalancamiento o arriesga menos.');
    if (target > 0 && !hasT) out.warn.push('El objetivo está del lado del stop.');
    if (risk > 3) out.warn.push('Arriesgar más del 2-3 % por operación vacía la cuenta rápido en una mala racha.');
    return out;
  }
  const levFor = (o) => { const r = calc(Object.assign({}, o, {leverage: 1})); return r.ok ? Math.max(1, Math.ceil(r.notional / +o.capital)) : null; }; // apalancamiento mínimo para que el margen quepa en el capital
  const api = {calc, levFor, MMR};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTRisk = api;
})(typeof self !== 'undefined' ? self : this);

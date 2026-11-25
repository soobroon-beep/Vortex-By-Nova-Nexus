/* VORTEX · Caja inteligente de Long/Short — te ayuda a poner un buen stop, un objetivo realista y a no correr en pérdidas.
   suggest(): stop detrás de la estructura (último mínimo/máximo relevante + colchón de volatilidad ATR), nunca demasiado
              pegado ni demasiado lejos; objetivo en la siguiente resistencia/soporte (o zona de liquidaciones) que dé al menos 1.5R.
   manage():  gestión vela a vela de una caja activa: espera a que el precio toque la entrada, mueve el stop a la entrada
              al llegar a +1R, lo va subiendo detrás del precio (trailing por estructura y ATR) y avisa si se acerca al stop,
              si toca el objetivo o si sale por el stop. El stop SOLO se mueve a favor, nunca en contra.
   Funciones puras (sin DOM): se prueban en tests/smart-box.test.js. No es asesoría financiera. */
(function (root) {
  'use strict';
  const fin = Number.isFinite;
  function atr(c, n = 14) { if (c.length < 2) return 0; let a = 0; for (let i = 1; i < c.length; i++) { const k = c[i], p = c[i - 1], tr = Math.max(k.h - k.l, Math.abs(k.h - p.c), Math.abs(k.l - p.c)); a = i <= n ? (a * (i - 1) + tr) / i : (a * (n - 1) + tr) / n; } return a; }
  /* pivotes: mínimo/máximo con L velas a cada lado más bajas/altas */
  function swings(c, L = 3, from = 0) {
    const lo = [], hi = [];
    for (let i = Math.max(L, from); i < c.length - L; i++) {
      let isL = true, isH = true;
      for (let j = 1; j <= L && (isL || isH); j++) { if (c[i - j].l <= c[i].l || c[i + j].l < c[i].l) isL = false; if (c[i - j].h >= c[i].h || c[i + j].h > c[i].h) isH = false; }
      if (isL) lo.push({i, p: c[i].l}); if (isH) hi.push({i, p: c[i].h});
    }
    return {lo, hi};
  }
  const round = (v, ref) => { if (!fin(v)) return v; const d = ref >= 1000 ? 1 : ref >= 10 ? 2 : ref >= 1 ? 4 : ref >= .01 ? 6 : 8; return +v.toFixed(d); };

  /* Sugerencia de stop y objetivo para una caja.
     o: {side: 1 largo | -1 corto, entry, extra: [{p, why}] niveles opcionales (zonas de liquidación, POC…)} */
  function suggest(c, o) {
    const n = c.length; if (n < 30 || !(o.entry > 0)) return null;
    const dir = o.side > 0 ? 1 : -1, E = o.entry, A = atr(c.slice(-120)) || E * .01, S = swings(c, 3, Math.max(0, n - 200)), why = [];
    // 1) STOP: el pivote más reciente del lado contrario que esté a más de 0.5 ATR de la entrada
    const prot = (dir > 0 ? S.lo : S.hi).filter(s => (E - s.p) * dir > A * .5).sort((a, b) => b.i - a.i);
    let stop, kind;
    if (prot.length && Math.abs(E - prot[0].p) <= A * 3.2) { stop = prot[0].p - dir * A * .25; kind = 'estructura'; why.push(`Stop ${dir > 0 ? 'debajo del último mínimo' : 'arriba del último máximo'} (${round(prot[0].p, E)}) con un colchón de ¼ ATR para que una mecha no te saque.`); }
    else { stop = E - dir * A * 1.5; kind = 'volatilidad'; why.push(prot.length ? 'La estructura queda muy lejos: stop a 1.5 ATR para no arriesgar de más.' : 'No hay un mínimo/máximo claro cerca: stop a 1.5 ATR (volatilidad normal de la moneda).'); }
    if (Math.abs(E - stop) < A * .6) { stop = E - dir * A * .6; why.push('Se separó a 0.6 ATR: más pegado, el ruido normal te sacaría.'); }
    const R = Math.abs(E - stop);
    // 2) OBJETIVOS: resistencias (largo) o soportes (corto) en el camino, más los niveles extra
    const lv = [...(dir > 0 ? S.hi : S.lo).map(s => ({p: s.p, why: dir > 0 ? 'resistencia (máximo previo)' : 'soporte (mínimo previo)'})), ...(o.extra || []).filter(x => x && fin(x.p))]
      .filter(x => (x.p - E) * dir > 0).sort((a, b) => (a.p - b.p) * dir);
    const front = x => x.p - dir * A * .1; // un poco antes del nivel: ahí suelen frenar
    let t1 = lv.find(x => (front(x) - E) * dir >= R * 1.5), target, t2;
    if (t1) { target = front(t1); why.push(`Objetivo justo antes de la ${t1.why} en ${round(t1.p, E)}.`); }
    else { target = E + dir * R * 2; why.push('No hay un nivel claro en el camino: objetivo a 2R.'); }
    const blocker = lv.find(x => (x.p - E) * dir > 0 && (x.p - E) * dir < R * 1.5); // un nivel ANTES del objetivo puede frenar el precio
    if (blocker) why.push(`Ojo: hay ${blocker.why} en ${round(blocker.p, E)}, antes del objetivo; puede rebotar ahí.`);
    const t2l = lv.find(x => (front(x) - E) * dir >= Math.max(R * 2.5, Math.abs(target - E) * 1.3)); t2 = t2l ? front(t2l) : E + dir * Math.max(R * 3, Math.abs(target - E) * 1.5);
    const rr = Math.abs(target - E) / R;
    return {stop: round(stop, E), target: round(target, E), t2: round(t2, E), rr, atr: A, kind, why, riskPct: R / E * 100};
  }

  /* Gestión de una caja activa. st = estado guardado en el dibujo:
     {phase: 'wait'|'live'|'out', s0, ext, at, warned, be, trail, res}; box = {side, entry, stop, target}; c = velas (la última puede estar en curso).
     Devuelve {st, stop, events: [{k, txt}]} — stop es el nuevo stop (o el mismo). */
  function manage(c, box, st) {
    const n = c.length, dir = box.side > 0 ? 1 : -1, E = box.entry, ev = [], s = Object.assign({phase: 'wait', s0: box.stop, ext: E, warned: false}, st || {}); let stop = box.stop;
    if (!n || s.phase === 'out') return {st: s, stop, events: ev};
    const R0 = Math.abs(E - (s.s0 || box.stop)) || Math.abs(E - stop) || E * .01, A = atr(c.slice(-120)) || R0, since = s.at || 0;
    const bars = since ? c.filter(k => k.t >= since) : [c[n - 1]]; if (!bars.length) return {st: s, stop, events: ev}; // la vela en curso se revisa en cada dato; las cerradas, una sola vez
    for (const k0 of bars) {
      // la vela en curso se revisa varias veces: solo cuentan los extremos NUEVOS desde la última revisión
      // (si no, un mínimo de antes de subir el stop lo «tocaría» y cerraría la caja por error)
      const seen = k0.t === s.at && fin(s.bh) && fin(s.bl), k = seen ? {t: k0.t, o: k0.o, c: k0.c, h: k0.h > s.bh ? k0.h : -Infinity, l: k0.l < s.bl ? k0.l : Infinity} : k0;
      s.bh = seen ? Math.max(s.bh, k0.h) : k0.h; s.bl = seen ? Math.min(s.bl, k0.l) : k0.l; s.at = k0.t;
      if (s.phase === 'wait') {
        if (k0.l <= E && k0.h >= E) { s.phase = 'live'; s.ext = E; ev.push({k: 'in', txt: 'El precio tocó tu entrada: la caja está activa.'}); }
        else continue;
      }
      // salida primero (conservador: si en la misma vela toca stop y objetivo, cuenta el stop)
      if ((dir > 0 && k.l <= stop) || (dir < 0 && k.h >= stop)) { s.phase = 'out'; s.res = (stop - E) * dir >= -R0 * .05 ? (Math.abs(stop - E) < R0 * .1 ? 'be' : 'trail') : 'sl'; ev.push({k: s.res === 'sl' ? 'sl' : 'exit', txt: s.res === 'sl' ? 'Tocó el stop: pérdida controlada (1R). Bien por respetarlo.' : s.res === 'be' ? 'Salió en la entrada: sin perder.' : 'Salió con el stop que fue siguiendo al precio: ganancia asegurada.'}); break; }
      if ((dir > 0 && k.h >= box.target) || (dir < 0 && k.l <= box.target)) { s.phase = 'out'; s.res = 'tp'; ev.push({k: 'tp', txt: 'Llegó al objetivo.'}); break; }
      s.ext = dir > 0 ? Math.max(s.ext, k0.h) : Math.min(s.ext, k0.l);
      const prog = (s.ext - E) * dir / R0, cur = (k0.c - E) * dir / R0;
      if (s.be !== false && prog >= 1 && (stop - E) * dir < 0) { stop = E + dir * R0 * .05; ev.push({k: 'be', txt: 'Llegó a +1R: stop movido a la entrada (ya no puedes perder).'}); }
      if (s.trail !== false && prog >= 1.5) {
        const cand = s.ext - dir * Math.max(A * 1.5, R0 * .8);
        if ((cand - stop) * dir > R0 * .1 && (k0.c - cand) * dir > A * .3) { stop = cand; ev.push({k: 'trail', txt: `Stop subido detrás del precio: aseguras ${((stop - E) * dir / R0).toFixed(1)}R.`}); }
      }
      if (!s.warned && cur <= -.7 && (stop - E) * dir < 0) { s.warned = true; ev.push({k: 'near', txt: 'El precio está cerca de tu stop. Respeta el plan: no lo muevas en contra.'}); }
      if (cur > -.3) s.warned = false;
    }
    return {st: s, stop, events: ev};
  }
  const api = {suggest, manage, swings, atr};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTSmart = api;
})(typeof self !== 'undefined' ? self : this);

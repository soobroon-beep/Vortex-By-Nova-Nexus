/* NEXUS PIXEL · motor de dibujo. Calcula con las velas (las que ves en pantalla) los niveles que el avatar dibuja en tu gráfico:
   canal (regresión + extremos), rango (consolidación reciente), soportes y resistencias (pivotes agrupados por toques),
   línea de tendencia (dos pivotes en la dirección del mercado), Fibonacci (último impulso) y líneas horizontales en un precio.
   Devuelve dibujos con el MISMO formato que los del usuario ({type, a:{t,p}, b, c, col, label, ds}), así quedan en tu gráfico,
   se guardan en tu cuenta y los puedes mover o borrar. Funciones puras: se prueban en tests/pixel-draw.test.js. También lee lo
   que escribes en español («dibújame el canal», «marca soportes», «línea en 65000», «borra lo tuyo»). */
(function (root) {
  'use strict';
  const COL = {channel: '#a78bfa', range: '#38bdf8', sup: '#20bf9f', res: '#f06b79', trend: '#f0b90b', fib: '#c084fc', line: '#e9edf5'};
  const fmtN = p => { try { if (root.CCT_pixel && root.CCT_pixel.fmt) return root.CCT_pixel.fmt(p); } catch {} const a = Math.abs(p), d = a >= 1000 ? 2 : a >= 1 ? 2 : a >= .01 ? 4 : 6; return Number(p).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d}); }; // mismo formato de precio que el gráfico

  function atr(cs, n = 14) { if (cs.length < 2) return 0; let s = 0, k = 0; for (let i = Math.max(1, cs.length - n); i < cs.length; i++) { const c = cs[i], pc = cs[i - 1].c; s += Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc)); k++; } return k ? s / k : 0; }
  function pivots(cs, k) { // máximos/mínimos locales con k velas a cada lado
    const hi = [], lo = [];
    for (let i = k; i < cs.length - k; i++) {
      let H = true, L = true;
      for (let j = i - k; j <= i + k; j++) { if (j === i) continue; if (cs[j].h > cs[i].h) H = false; if (cs[j].l < cs[i].l) L = false; if (!H && !L) break; }
      if (H) hi.push({i, t: cs[i].t, p: cs[i].h}); if (L) lo.push({i, t: cs[i].t, p: cs[i].l});
    }
    return {hi, lo};
  }
  function regression(cs) { const n = cs.length; let sx = 0, sy = 0, sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { const y = cs[i].c; sx += i; sy += y; sxy += i * y; sxx += i * i; } const m = (n * sxy - sx * sy) / ((n * sxx - sx * sx) || 1), b = (sy - m * sx) / n; return {m, b, at: i => b + m * i}; }
  const tOf = (cs, i, iv) => i < cs.length ? cs[Math.max(0, i)].t : cs[cs.length - 1].t + (i - cs.length + 1) * iv;
  const ivOf = cs => cs.length > 1 ? (cs[cs.length - 1].t - cs[0].t) / (cs.length - 1) : 60000;

  function channel(cs) {
    if (cs.length < 20) return null; const r = regression(cs), n = cs.length, iv = ivOf(cs); let up = -Infinity, dn = Infinity;
    for (let i = 0; i < n; i++) { const L = r.at(i); up = Math.max(up, cs[i].h - L); dn = Math.min(dn, cs[i].l - L); }
    const mid = Math.round(n / 2), slopePct = r.m * n / Math.abs(r.at(0) || 1) * 100, kind = Math.abs(slopePct) < 1.5 ? 'lateral' : slopePct > 0 ? 'alcista' : 'bajista';
    const last = cs[n - 1].c, lo = r.at(n - 1) + dn, hi = r.at(n - 1) + up, pos = (last - lo) / ((hi - lo) || 1);
    return {kind, pos, lo, hi, drawings: [
      {type: 'channel', a: {t: cs[0].t, p: r.at(0) + dn}, b: {t: tOf(cs, n - 1, iv), p: r.at(n - 1) + dn}, c: {t: cs[mid].t, p: r.at(mid) + up}, col: COL.channel, label: 'Canal ' + kind},
      {type: 'trend', a: {t: cs[0].t, p: r.at(0) + (up + dn) / 2}, b: {t: tOf(cs, n - 1, iv), p: r.at(n - 1) + (up + dn) / 2}, col: COL.channel, ds: 'dash', lw: 1}
    ]};
  }
  function range(cs) {
    if (cs.length < 15) return null; const a = atr(cs) || (cs[cs.length - 1].c * .01), n = cs.length, iv = ivOf(cs);
    let hi = -Infinity, lo = Infinity, start = n;
    let core = 0; // altura de las últimas 12 velas: el rango puede crecer hasta 1.6 veces eso (o 3 ATR) y ahí termina
    for (let i = n - 1; i >= 0; i--) { const h2 = Math.max(hi, cs[i].h), l2 = Math.min(lo, cs[i].l); if (n - i === 12) core = h2 - l2; if (n - i > 12 && h2 - l2 > Math.max(core * 1.6, a * 3)) break; hi = h2; lo = l2; start = i; }
    if (n - start < 12) { start = Math.max(0, n - 40); hi = Math.max(...cs.slice(start).map(c => c.h)); lo = Math.min(...cs.slice(start).map(c => c.l)); }
    const bars = n - start, mid = (hi + lo) / 2;
    return {hi, lo, bars, drawings: [
      {type: 'rect', a: {t: cs[start].t, p: hi}, b: {t: tOf(cs, n - 1 + Math.max(3, Math.round(bars * .15)), iv), p: lo}, col: COL.range, label: `Rango · ${bars} velas`},
      {type: 'trend', a: {t: cs[start].t, p: mid}, b: {t: tOf(cs, n - 1 + Math.max(3, Math.round(bars * .15)), iv), p: mid}, col: COL.range, ds: 'dot', lw: 1}
    ]};
  }
  function levels(cs, max = 3) { // soportes y resistencias: pivotes agrupados (tolerancia ~0.6 ATR), ordenados por toques
    if (cs.length < 20) return null; const a = atr(cs) || cs[cs.length - 1].c * .01, k = Math.max(2, Math.round(cs.length / 45)), pv = pivots(cs, k), tol = a * .6, last = cs[cs.length - 1].c;
    const pts = [...pv.hi, ...pv.lo].sort((x, y) => x.p - y.p), cl = [];
    for (const p of pts) { const g = cl[cl.length - 1]; if (g && p.p - g.max <= tol) { g.items.push(p); g.max = p.p; } else cl.push({items: [p], max: p.p}); }
    const lv = cl.map(g => ({p: g.items.reduce((s, x) => s + x.p, 0) / g.items.length, n: g.items.length, lastI: Math.max(...g.items.map(x => x.i))})).map(x => Object.assign(x, {score: x.n * 2 + x.lastI / cs.length}));
    const res = lv.filter(x => x.p > last).sort((x, y) => y.score - x.score).slice(0, max).sort((x, y) => x.p - y.p);
    const sup = lv.filter(x => x.p <= last).sort((x, y) => y.score - x.score).slice(0, max).sort((x, y) => y.p - x.p);
    const mk = (x, s) => ({type: 'horizontal', a: {t: cs[x.lastI].t, p: x.p}, col: s ? COL.sup : COL.res, label: `${s ? 'Soporte' : 'Resistencia'} · ${x.n} ${x.n === 1 ? 'toque' : 'toques'}`, lw: Math.min(3, 1 + (x.n - 1) * .5)});
    return {sup, res, drawings: [...res.map(x => mk(x, false)), ...sup.map(x => mk(x, true))]};
  }
  function trend(cs) {
    if (cs.length < 20) return null; const r = regression(cs), up = r.m >= 0, k = Math.max(2, Math.round(cs.length / 40)), pv = pivots(cs, k), arr = up ? pv.lo : pv.hi, iv = ivOf(cs), n = cs.length;
    let A = null, B = null;
    for (let j = arr.length - 1; j > 0 && !B; j--) for (let i = j - 1; i >= 0; i--) { const ok = up ? arr[j].p > arr[i].p : arr[j].p < arr[i].p; if (ok && arr[j].i - arr[i].i >= k * 2) { A = arr[i]; B = arr[j]; break; } }
    if (!A) { const ex = up ? cs.reduce((m, c, i) => c.l < cs[m].l ? i : m, 0) : cs.reduce((m, c, i) => c.h > cs[m].h ? i : m, 0); A = {i: ex, t: cs[ex].t, p: up ? cs[ex].l : cs[ex].h}; B = {i: n - 1, t: cs[n - 1].t, p: up ? cs[n - 1].l : cs[n - 1].h}; }
    const slope = (B.p - A.p) / ((B.i - A.i) || 1), endI = n - 1 + Math.round(n * .12);
    return {up, drawings: [{type: 'trend', a: {t: A.t, p: A.p}, b: {t: tOf(cs, endI, iv), p: A.p + slope * (endI - A.i)}, col: COL.trend, label: up ? 'Tendencia alcista' : 'Tendencia bajista', lw: 2}]};
  }
  function fib(cs) {
    if (cs.length < 20) return null; let hiI = 0, loI = 0; cs.forEach((c, i) => { if (c.h > cs[hiI].h) hiI = i; if (c.l < cs[loI].l) loI = i; });
    const upMove = loI < hiI, a = upMove ? {t: cs[loI].t, p: cs[loI].l} : {t: cs[hiI].t, p: cs[hiI].h}, b = upMove ? {t: cs[hiI].t, p: cs[hiI].h} : {t: cs[loI].t, p: cs[loI].l};
    return {upMove, drawings: [{type: 'fib', a, b, col: COL.fib, label: upMove ? 'Fibonacci del impulso alcista' : 'Fibonacci de la caída'}]};
  }
  const hline = (cs, p) => ({drawings: [{type: 'horizontal', a: {t: cs[cs.length - 1].t, p}, col: COL.line, label: 'Nivel ' + fmtN(p)}]});

  /* Explica en español lo que dibujó (respuesta inmediata, sin depender de la IA). */
  function describe(kind, r, last) {
    if (!r) return 'Necesito más velas en pantalla para dibujar eso. Aleja un poco el gráfico.';
    if (kind === 'channel') return `Te marqué un canal ${r.kind} entre ${fmtN(r.lo)} y ${fmtN(r.hi)}. El precio está en la parte ${r.pos > .7 ? 'alta (cerca del techo)' : r.pos < .3 ? 'baja (cerca del piso)' : 'media'} del canal.`;
    if (kind === 'range') return `Este es el rango de las últimas ${r.bars} velas: techo ${fmtN(r.hi)} y piso ${fmtN(r.lo)}. La línea punteada es la mitad (${fmtN((r.hi + r.lo) / 2)}).`;
    if (kind === 'sr' && !r.res.length) return `El precio está en máximos de lo que ves: no hay resistencias arriba. Te marqué ${r.sup.length} soporte${r.sup.length === 1 ? '' : 's'}${r.sup.length ? ' (' + r.sup.map(x => fmtN(x.p)).join(', ') + ')' : ''}.`;
    if (kind === 'sr' && !r.sup.length) return `El precio está en mínimos de lo que ves: no hay soportes abajo. Te marqué ${r.res.length} resistencia${r.res.length === 1 ? '' : 's'} (${r.res.map(x => fmtN(x.p)).join(', ')}).`;
    if (kind === 'sr') return `Marqué ${r.res.length} resistencia${r.res.length === 1 ? '' : 's'}${r.res.length ? ' (' + r.res.map(x => fmtN(x.p)).join(', ') + ')' : ''} y ${r.sup.length} soporte${r.sup.length === 1 ? '' : 's'}${r.sup.length ? ' (' + r.sup.map(x => fmtN(x.p)).join(', ') + ')' : ''}. Las más gruesas tienen más toques.`;
    if (kind === 'trend') return `Tracé la línea de tendencia ${r.up ? 'alcista uniendo mínimos crecientes' : 'bajista uniendo máximos decrecientes'}. Si el precio la rompe con fuerza, la tendencia pierde fuerza.`;
    if (kind === 'fib') return `Puse Fibonacci sobre ${r.upMove ? 'el último impulso alcista: los retrocesos 0.5 y 0.618 suelen actuar como soporte' : 'la última caída: los rebotes suelen frenarse en 0.5 y 0.618'}.`;
    if (kind === 'hline') return `Listo, línea en ${fmtN(r.drawings[0].a.p)}.`;
    return '';
  }
  const RUN = {channel, range, sr: (cs, o) => levels(cs, o && o.sr || 3), trend, fib};
  function build(kind, cs, arg, o) { const r = kind === 'hline' ? hline(cs, arg) : RUN[kind] ? RUN[kind](cs, o) : null; return {r, drawings: r ? r.drawings : [], text: describe(kind, r, cs.length ? cs[cs.length - 1].c : 0)}; }

  /* Lo que pides en español → acciones. «todo» / «análisis completo» dibuja varias cosas. */
  function parse(text) {
    const s = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), out = [];
    if (/\b(borra|limpia|quita|elimina)\b/.test(s)) return [{do: 'clear'}];
    if (/analisis completo|todo\b|completo|haz tu magia|analizalo|analiza el grafico/.test(s)) return [{do: 'full'}]; // qué dibuja lo decide tu personalización (por defecto soportes/resistencias, tendencia y canal)
    if (/canal/.test(s)) out.push({do: 'channel'});
    if (/rango|lateral|consolida|caja/.test(s)) out.push({do: 'range'});
    if (/soporte|resistencia|niveles|s\/r|zonas/.test(s)) out.push({do: 'sr'});
    if (/tendencia|directriz|trendline/.test(s)) out.push({do: 'trend'});
    if (/fibo|fib\b|retroceso/.test(s)) out.push({do: 'fib'});
    const m = s.match(/(?:linea|nivel|precio|marca|en)\s*(?:en|a|de)?\s*\$?\s*([0-9][0-9.,]*)/);
    if (m && /linea|nivel|marca/.test(s)) { const raw = m[1].replace(/[.,]$/, ''), v = parseFloat(/^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, '') : raw.replace(/,(?=\d{3}\b)/g, '').replace(',', '.')); if (Number.isFinite(v) && v > 0) out.push({do: 'hline', price: v}); }
    return out;
  }
  root.NexusPixelDraw = {parse, build, channel, range, levels, trend, fib, pivots, regression, atr, describe, COL};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NexusPixelDraw;
})(typeof window !== 'undefined' ? window : globalThis);

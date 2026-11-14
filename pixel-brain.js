/* NEXUS PIXEL · su «cerebro» (funciones puras, se prueban en tests/pixel-brain.test.js).
   Antes Pixel solo recibía unos cuantos números recortados (el JSON de indicadores se cortaba a 1 800 letras y casi nunca
   alcanzaba a ver Nova Nexus) y cualquier pregunta con «soporte» o «niveles» la convertía en dibujar soportes y resistencias.
   Aquí se arma lo que necesita un trader para opinar en serio, en texto compacto para la IA:
   · lectura técnica de TODAS las velas cargadas: EMA 20/50/200, RSI, MACD, ATR, volumen relativo
   · estructura de mercado: puntos de giro P1…Pn (máximos/mínimos con HH/HL/LH/LL), sesgo y último quiebre (BOS)
   · niveles clave con su distancia en %, últimas velas y lo que se ve en pantalla
   · TUS indicadores tal como están en el gráfico (Nova Nexus: nube, oscilador, flujo, ADX, señal; tus scripts Pine y los comunes)
   · TU posición: la real del exchange, la de la cuenta demo y tus dibujos Long/Short
   Además: entiende si le PREGUNTAS algo («¿cierro mi long?») o le pides DIBUJAR, y convierte los dibujos libres que propone
   la IA (rectángulos, flechas, texto, Fibonacci entre dos puntos, canales, Long/Short con entrada, stop y objetivo, patrones…)
   en dibujos reales del gráfico. No es asesoría financiera. */
(function (root) {
  'use strict';
  const fin = Number.isFinite;
  const nz = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const R = x => !fin(+x) ? null : +(+x).toPrecision(Math.abs(+x) >= 1000 ? 6 : 5);
  const fmt = p => { try { if (root.CCT_pixel && root.CCT_pixel.fmt) return root.CCT_pixel.fmt(p); } catch {} if (!fin(p)) return '—'; const a = Math.abs(p), d = a >= 1000 ? 2 : a >= 1 ? 3 : a >= .01 ? 5 : 7; return (+p).toLocaleString('en-US', {maximumFractionDigits: d}); };
  const pct = (a, b) => fin(a) && fin(b) && b ? (a / b - 1) * 100 : null;
  const sgn = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  const D = () => root.NexusPixelDraw || (typeof require === 'function' ? (() => { try { return require('./pixel-draw.js'); } catch { return null; } })() : null);

  /* ───────── Indicadores básicos (sobre todas las velas cargadas) ───────── */
  function ema(v, n) { const out = new Array(v.length).fill(null), k = 2 / (n + 1); let e = null; for (let i = 0; i < v.length; i++) { const x = v[i]; if (!fin(x)) continue; e = e == null ? x : x * k + e * (1 - k); if (i >= n - 1) out[i] = e; } return out; }
  function rsi(cs, n = 14) { const out = new Array(cs.length).fill(null); let g = 0, l = 0; for (let i = 1; i < cs.length; i++) { const d = cs[i].c - cs[i - 1].c, up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up / n; l += dn / n; if (i === n) out[i] = l ? 100 - 100 / (1 + g / l) : 100; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out[i] = l ? 100 - 100 / (1 + g / l) : 100; } } return out; }
  function atrArr(cs, n = 14) { const out = new Array(cs.length).fill(null); let a = null; for (let i = 1; i < cs.length; i++) { const c = cs[i], pc = cs[i - 1].c, tr = Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc)); a = a == null ? tr : (a * (n - 1) + tr) / n; if (i >= n) out[i] = a; } return out; }
  function macd(cl) { const f = ema(cl, 12), s = ema(cl, 26), line = cl.map((_, i) => f[i] != null && s[i] != null ? f[i] - s[i] : null), first = line.findIndex(x => x != null), sig = new Array(cl.length).fill(null); if (first >= 0) { const e = ema(line.slice(first), 9); for (let i = 0; i < e.length; i++) sig[first + i] = e[i]; } return {line, sig, hist: line.map((x, i) => x != null && sig[i] != null ? x - sig[i] : null)}; }
  const lastOf = a => { for (let i = a.length - 1; i >= 0; i--) if (fin(a[i])) return a[i]; return null; };
  const ago = (a, k) => { const v = a[a.length - 1 - k]; return fin(v) ? v : null; };

  /* ───────── Estructura: puntos de giro alternados (máximo, mínimo, máximo…) con HH/HL/LH/LL ───────── */
  function swings(cs, k) {
    k = k || Math.max(2, Math.min(6, Math.round(cs.length / 40)));
    const raw = [];
    for (let i = k; i < cs.length - 1; i++) {
      const lo = Math.max(0, i - k), hi = Math.min(cs.length - 1, i + k); let H = true, L = true;
      for (let j = lo; j <= hi; j++) { if (j === i) continue; if (cs[j].h > cs[i].h) H = false; if (cs[j].l < cs[i].l) L = false; if (!H && !L) break; }
      if (H) raw.push({i, kind: 'max', p: cs[i].h}); if (L) raw.push({i, kind: 'min', p: cs[i].l});
    }
    const alt = []; // dos máximos (o mínimos) seguidos: se queda el más extremo
    for (const s of raw) { const t = alt[alt.length - 1]; if (t && t.kind === s.kind) { if ((s.kind === 'max' && s.p >= t.p) || (s.kind === 'min' && s.p <= t.p)) alt[alt.length - 1] = s; } else alt.push(s); }
    let pH = null, pL = null;
    for (const s of alt) { if (s.kind === 'max') { s.tag = pH == null ? '' : s.p > pH ? 'HH' : 'LH'; pH = s.p; } else { s.tag = pL == null ? '' : s.p > pL ? 'HL' : 'LL'; pL = s.p; } }
    return alt;
  }
  function structure(cs) {
    const sw = swings(cs), n = cs.length, his = sw.filter(s => s.kind === 'max'), los = sw.filter(s => s.kind === 'min');
    const h2 = his.slice(-2), l2 = los.slice(-2); let bias = 'lateral o indefinida';
    if (h2.length === 2 && l2.length === 2) { const up = h2[1].p > h2[0].p && l2[1].p > l2[0].p, dn = h2[1].p < h2[0].p && l2[1].p < l2[0].p; bias = up ? 'ALCISTA (máximos y mínimos crecientes)' : dn ? 'BAJISTA (máximos y mínimos decrecientes)' : h2[1].p < h2[0].p && l2[1].p > l2[0].p ? 'en compresión (triángulo: máximos bajan y mínimos suben)' : 'en expansión / rango amplio'; }
    let bos = null; // último quiebre de estructura: cierre por arriba del máximo previo o por debajo del mínimo previo
    for (let i = n - 1; i > 0 && !bos && i > n - 120; i--) {
      const ph = his.filter(s => s.i < i - 1).pop(), pl = los.filter(s => s.i < i - 1).pop();
      if (ph && cs[i].c > ph.p && cs[i - 1].c <= ph.p) bos = {dir: 'alcista', lvl: ph.p, bars: n - 1 - i};
      else if (pl && cs[i].c < pl.p && cs[i - 1].c >= pl.p) bos = {dir: 'bajista', lvl: pl.p, bars: n - 1 - i};
    }
    const recent = sw.slice(-10).reverse().map((s, j) => ({id: 'P' + (j + 1), kind: s.kind, i: s.i, t: cs[s.i].t, bars: n - 1 - s.i, p: s.p, tag: s.tag}));
    return {bias, bos, swings: recent};
  }

  /* ───────── Foto técnica del gráfico ───────── */
  function snapshot(cs, o) {
    o = o || {}; if (!Array.isArray(cs) || cs.length < 30) return null;
    const n = cs.length, cl = cs.map(c => c.c), px = cl[n - 1], iv = (cs[n - 1].t - cs[0].t) / ((n - 1) || 1);
    const e20 = ema(cl, 20), e50 = ema(cl, 50), e200 = ema(cl, 200), r = rsi(cs), m = macd(cl), at = atrArr(cs);
    const vAvg = cs.slice(-21, -1).reduce((a, c) => a + (c.v || 0), 0) / 20;
    const E = (a, name) => { const v = lastOf(a), v5 = ago(a, 5); return v == null ? null : {name, v, slope: v5 == null ? 'plana' : v > v5 * 1.0004 ? 'sube' : v < v5 * .9996 ? 'baja' : 'plana', dist: pct(px, v)}; };
    const emas = [E(e20, 'EMA 20'), E(e50, 'EMA 50'), E(e200, 'EMA 200')].filter(Boolean);
    let align = 'mixta'; if (emas.length === 3) { const [a, b, c] = emas.map(x => x.v); align = px > a && a > b && b > c ? 'ALCISTA (precio > EMA20 > EMA50 > EMA200)' : px < a && a < b && b < c ? 'BAJISTA (precio < EMA20 < EMA50 < EMA200)' : 'mixta'; }
    const vis = Array.isArray(o.visible) && o.visible.length >= 20 ? o.visible : cs.slice(-Math.min(n, 150));
    const Dr = D(), lv = Dr ? Dr.levels(vis.length >= 20 ? vis : cs, 3) : null;
    const st = structure(cs.slice(-Math.min(n, 300))), off = n - Math.min(n, 300); st.swings.forEach(s => { s.i += off; });
    const a = lastOf(at);
    return {
      n, px, iv, t: cs[n - 1].t, emas, align, rsi: {v: lastOf(r), v5: ago(r, 5)}, macd: {hist: lastOf(m.hist), hist3: ago(m.hist, 3), line: lastOf(m.line), sig: lastOf(m.sig)},
      atr: a, atrPct: a && px ? a / px * 100 : null, volRel: vAvg ? (cs[n - 1].v || 0) / vAvg : null,
      chg: {b10: pct(px, cs[Math.max(0, n - 11)].c), b50: pct(px, cs[Math.max(0, n - 51)].c)},
      vis: {n: vis.length, hi: Math.max(...vis.map(c => c.h)), lo: Math.min(...vis.map(c => c.l)), chg: pct(vis[vis.length - 1].c, vis[0].o), pos: null},
      st, levels: lv ? {res: lv.res.map(x => ({p: x.p, n: x.n, d: pct(x.p, px)})), sup: lv.sup.map(x => ({p: x.p, n: x.n, d: pct(x.p, px)}))} : {res: [], sup: []},
      last: cs.slice(-16).map((c, j, arr) => ({bars: arr.length - 1 - j, o: c.o, h: c.h, l: c.l, c: c.c, vr: vAvg ? (c.v || 0) / vAvg : null}))
    };
  }

  /* ───────── Tus indicadores (CCT_getAIContext) en texto compacto ───────── */
  function indText(ctx) {
    if (!ctx) return ''; const out = [], px = ctx.candles && ctx.candles.length ? ctx.candles[ctx.candles.length - 1].c : null;
    const nv = ctx.nova;
    if (nv) {
      const bits = [];
      if (fin(nv.top) && fin(nv.bot)) { const hi = Math.max(nv.top, nv.bot), lo = Math.min(nv.top, nv.bot), w = px > hi ? 'ARRIBA de la nube (alcista)' : px < lo ? 'DEBAJO de la nube (bajista)' : 'DENTRO de la nube (indeciso)'; bits.push(`nube ${fmt(lo)}–${fmt(hi)} (base ${fmt(nv.base)}): precio ${w}`); }
      if (fin(nv.osc)) bits.push(`oscilador ${R(nv.osc)}${fin(nv.sig) ? ` vs señal ${R(nv.sig)} → ${nv.osc > nv.sig ? 'modo COMPRA' : 'modo VENTA'}` : ''}`);
      if (fin(nv.flux)) bits.push(`flujo ${R(nv.flux)} (${nv.flux > 0 ? 'comprador' : 'vendedor'})`);
      if (fin(nv.adx)) bits.push(`ADX ${Math.round(nv.adx)} (${nv.adx >= 25 ? 'tendencia con fuerza' : nv.adx < 18 ? 'rango / sin fuerza' : 'fuerza media'})`);
      if (fin(nv.ema200)) bits.push(`EMA 200 ${fmt(nv.ema200)} (precio ${px >= nv.ema200 ? 'arriba' : 'abajo'})`);
      if (nv.smcTrend) bits.push(`SMC ${nv.smcTrend > 0 ? 'alcista' : 'bajista'}`);
      if (nv.last) { const L = nv.last; bits.push(`última señal ${L.side === 'buy' ? 'LONG' : 'SHORT'} hace ${L.ago} velas (puntaje ${L.score}/5${L.div ? ', con divergencia' : ''}; entrada ${fmt(L.price)}, SL ${fmt(L.sl)}, TP1 ${fmt(L.tp1)}, TP2 ${fmt(L.tp2)}, TP3 ${fmt(L.tp3)})`); }
      out.push('· Nova Nexus: ' + bits.join('; '));
    }
    const L = ctx.lecturas || {};
    const ser = (name, o) => { if (!o || typeof o !== 'object') return null; if (fin(o.ultimo)) { const b = [`${name} ${R(o.ultimo)}`]; if (o.pendiente) b.push(o.pendiente); if (o.precio_vs_linea) b.push(o.precio_vs_linea); if (o.zona) b.push(o.zona); if (o.tendencia) b.push(o.tendencia); if (o.ultimo_cruce_del_precio) b.push(`el precio ${o.ultimo_cruce_del_precio.tipo} hace ${o.ultimo_cruce_del_precio.hace_velas} velas`); if (fin(o.relacion)) b.push(`volumen ${R(o.relacion)}x el promedio`); return b.join(', '); }
      if (fin(o.ultima_vela)) return `${name}: última vela ${R(o.relacion)}x el promedio de 20`;
      if ('rapida_sobre_lenta' in o) return `${name}: la rápida está ${o.rapida_sobre_lenta ? 'ARRIBA' : 'DEBAJO'} de la lenta${o.ultimo_cruce ? ` (cruzó hace ${o.ultimo_cruce.hace_velas} velas)` : ''}`;
      const parts = []; for (const [k, v] of Object.entries(o).slice(0, 6)) { if (v && typeof v === 'object' && fin(v.ultimo)) parts.push(`${k} ${R(v.ultimo)}${v.pendiente ? ' (' + v.pendiente + ')' : ''}`); else if (v && typeof v === 'object' && v.tipo) parts.push(`${k.replace(/_/g, ' ')}: ${v.tipo} hace ${v.hace_velas} velas`); else if (fin(v)) parts.push(`${k.replace(/_/g, ' ')} ${R(v)}`); else if (typeof v === 'string') parts.push(v); }
      return parts.length ? `${name}: ${parts.join(', ')}` : null; };
    for (const [k, v] of Object.entries(L).slice(0, 14)) { const t = ser(k, v); if (t) out.push('· ' + t.slice(0, 220)); }
    for (const p of (ctx.pine || []).slice(0, 5)) { const pl = (p.plots || []).filter(x => x.value != null).slice(0, 6).map(x => `${x.title || 'valor'} ${x.value}`).join(', '), tb = (p.table || []).slice(0, 8).join(' | '); if (pl || tb) out.push(`· Script «${p.name}»: ${pl}${tb ? (pl ? ' · tabla: ' : 'tabla: ') + tb : ''}`.slice(0, 420)); }
    if (ctx.zones && (ctx.zones.sup.length || ctx.zones.res.length)) out.push(`· Zonas de soporte/resistencia del indicador: soportes ${ctx.zones.sup.map(z => fmt(z.bot) + '–' + fmt(z.top)).join(', ') || '—'}; resistencias ${ctx.zones.res.map(z => fmt(z.bot) + '–' + fmt(z.top)).join(', ') || '—'}`);
    if (ctx.vp && fin(ctx.vp.poc)) out.push(`· Perfil de volumen: POC ${fmt(ctx.vp.poc)} (rango ${fmt(ctx.vp.lo)}–${fmt(ctx.vp.hi)})`);
    return out.join('\n');
  }

  /* ───────── Tu posición: real (exchange), demo (Operar) y tus dibujos Long/Short ───────── */
  const baseOf = s => String(s || '').toUpperCase().replace(/[:/].*$/, '').replace(/[-_ ]/g, '').replace(/(USDT|USDC|FDUSD|BUSD|USD|PERP)$/, '');
  function positions(src, sym, px) {
    src = src || {}; const want = baseOf(sym), out = [];
    for (const p of src.real || []) {
      if (!p || baseOf(p.symbol) !== want) continue; const side = /short|sell/i.test(p.side) ? 'SHORT' : 'LONG', entry = +p.entryPrice, mark = +p.markPrice || px;
      const move = fin(entry) && fin(mark) ? pct(mark, entry) * (side === 'LONG' ? 1 : -1) : null;
      out.push({src: 'REAL (exchange)', side, entry, mark, lev: +p.leverage || null, size: +p.contracts || null, pnl: +p.unrealizedPnl, roe: fin(+p.percentage) ? +p.percentage : null, move, liq: +p.liquidationPrice || null, sl: +p.stopLossPrice || null, tp: +p.takeProfitPrice || null});
    }
    for (const p of src.demo || []) {
      if (!p || baseOf(p.sym) !== want) continue; const side = p.side > 0 ? 'LONG' : 'SHORT', move = pct(px, p.entry) * (p.side > 0 ? 1 : -1);
      out.push({src: 'DEMO (Operar)', side, entry: p.entry, mark: px, lev: p.lev, size: p.qty, move, roe: fin(move) ? move * (p.lev || 1) : null, sl: p.sl || null, tp: p.tp || null});
    }
    for (const d of src.draws || []) {
      if (!d || (d.type !== 'long' && d.type !== 'short') || d.hide || !d.p || d.p.length < 2) continue; const side = d.type === 'long' ? 'LONG' : 'SHORT', entry = d.p[0], tp = d.p[1], sl = d.stop;
      out.push({src: 'dibujo en el gráfico (su plan)', side, entry, mark: px, tp, sl, move: pct(px, entry) * (side === 'LONG' ? 1 : -1), rr: fin(sl) && entry !== sl ? Math.abs(tp - entry) / Math.abs(entry - sl) : null});
    }
    return out.slice(0, 5);
  }
  function posText(list, px) {
    if (!list || !list.length) return 'No tiene posición abierta en este activo (ni real, ni demo, ni dibujo Long/Short).';
    return list.map(p => {
      const b = [`${p.src}: ${p.side} desde ${fmt(p.entry)}`];
      if (fin(p.lev)) b.push(`apalancamiento ${p.lev}x`); if (fin(p.move)) b.push(`va ${sgn(p.move)} a su favor${fin(p.roe) ? ` (${sgn(p.roe)} con apalancamiento)` : ''}`); if (fin(p.pnl)) b.push(`PnL ${p.pnl >= 0 ? '+' : ''}${p.pnl.toFixed(2)} USDT`);
      if (fin(p.sl) && p.sl > 0) b.push(`stop ${fmt(p.sl)} (${sgn(pct(p.sl, px))} del precio)`); else b.push('SIN stop loss');
      if (fin(p.tp) && p.tp > 0) b.push(`objetivo ${fmt(p.tp)} (${sgn(pct(p.tp, px))})`); if (fin(p.liq) && p.liq > 0) b.push(`liquidación ${fmt(p.liq)}`); if (fin(p.rr)) b.push(`R:R ${p.rr.toFixed(1)}`);
      return '· ' + b.join(', ');
    }).join('\n');
  }

  /* ───────── Todo junto: lo que lee la IA ───────── */
  function brief(s, x) {
    x = x || {}; if (!s) return 'No hay velas suficientes en el gráfico.';
    const L = [], tfName = x.tf || '';
    L.push(`ACTIVO: ${x.sym || ''}${x.exchange ? ' (' + x.exchange + ')' : ''} · temporalidad ${tfName} · precio ${fmt(s.px)}${fin(x.chg24) ? ' · 24 h ' + sgn(+x.chg24) : ''} · últimas 10 velas ${sgn(s.chg.b10 || 0)}, últimas 50 ${sgn(s.chg.b50 || 0)}`);
    L.push(`EN PANTALLA: ${s.vis.n} velas, máximo ${fmt(s.vis.hi)}, mínimo ${fmt(s.vis.lo)}, cambio ${sgn(s.vis.chg || 0)}; el precio está al ${Math.round((s.px - s.vis.lo) / ((s.vis.hi - s.vis.lo) || 1) * 100)}% del rango visible`);
    L.push(`TENDENCIA (medias): ${s.emas.map(e => `${e.name} ${fmt(e.v)} (${e.slope}, precio ${e.dist >= 0 ? 'arriba' : 'abajo'} ${Math.abs(e.dist).toFixed(2)}%)`).join('; ')} → alineación ${s.align}`);
    L.push(`MOMENTUM: RSI 14 = ${R(s.rsi.v)} (hace 5 velas ${R(s.rsi.v5)}; ${s.rsi.v >= 70 ? 'SOBRECOMPRA' : s.rsi.v <= 30 ? 'SOBREVENTA' : 'neutral'}) · MACD histograma ${R(s.macd.hist)} (hace 3 velas ${R(s.macd.hist3)} → ${Math.abs(s.macd.hist) > Math.abs(s.macd.hist3 || 0) ? 'se fortalece' : 'se debilita'}; MACD ${s.macd.line > s.macd.sig ? 'sobre' : 'bajo'} su señal)`);
    L.push(`VOLATILIDAD: ATR 14 = ${fmt(s.atr)} (${s.atrPct ? s.atrPct.toFixed(2) : '—'}% por vela) · volumen de la última vela ${s.volRel ? s.volRel.toFixed(2) : '—'}x el promedio`);
    L.push(`ESTRUCTURA: ${s.st.bias}${s.st.bos ? `; último quiebre (BOS) ${s.st.bos.dir} en ${fmt(s.st.bos.lvl)} hace ${s.st.bos.bars} velas` : '; sin quiebre reciente'}`);
    L.push('PUNTOS DE GIRO (P1 = el más reciente; úsalos para dibujar): ' + s.st.swings.map(p => `${p.id} ${p.kind === 'max' ? 'máximo' : 'mínimo'}${p.tag ? ' ' + p.tag : ''} ${fmt(p.p)} hace ${p.bars} velas`).join(' · '));
    L.push(`NIVELES CLAVE: resistencias ${s.levels.res.map(r => `${fmt(r.p)} (${r.n} toques, ${sgn(r.d)})`).join(', ') || 'ninguna arriba (precio en máximos de lo visible)'}; soportes ${s.levels.sup.map(r => `${fmt(r.p)} (${r.n} toques, ${sgn(r.d)})`).join(', ') || 'ninguno abajo (precio en mínimos de lo visible)'}`);
    L.push('ÚLTIMAS VELAS [hace: apertura/máximo/mínimo/cierre, volumen vs promedio]: ' + s.last.map(c => `${c.bars}: ${fmt(c.o)}/${fmt(c.h)}/${fmt(c.l)}/${fmt(c.c)}${c.vr != null ? ' v' + c.vr.toFixed(1) : ''}`).join(' | '));
    const it = indText(x.ind); L.push('SUS INDICADORES EN EL GRÁFICO:\n' + (it || '· (no tiene indicadores visibles además de las velas)'));
    L.push('SU POSICIÓN:\n' + posText(x.pos, s.px));
    if (x.draws && x.draws.length) L.push('DIBUJOS EN EL GRÁFICO: ' + x.draws.slice(-14).map(d => `${d.type}${d.label ? ' «' + String(d.label).slice(0, 30) + '»' : ''} ${(d.p || []).map(fmt).join('→')}${d.pix ? ' (tuyo)' : ''}`).join(' · '));
    if (x.seen) L.push('LO QUE SE VE EN LA CAPTURA DEL GRÁFICO (descrito por tus ojos de IA):\n' + String(x.seen).slice(0, 1400));
    return L.join('\n');
  }

  /* ───────── ¿Te pregunta o te pide dibujar? ───────── */
  const DRAW_RE = /\b(dibuja(me|r|lo|la)?|traza(me|r)?|marca(me|r|lo|la)?|senala(me)?|pon(me|le|er)?|agrega(me)?|anade(me)?|crea(me)?|haz(me)?|muestra(me)?|ensena(me)?|pinta(me)?|grafica(me)?|resalta(me)?|ubica(me)?)\b/;
  const ASK_RE = /[?¿]|\b(deberia|debo|conviene|me conviene|crees|opinas|que (opinas|piensas|ves|dices|hago|harias|significa|indica|me dice|pasa)|como (ves|esta|va|lo ves|interpreto|leo)|cierro|cerrar|cerrarlo|salgo|salir|mantengo|mantener|aguanto|entro|entrar|abro|abrir|compro|vendo|sigo|es buen|es momento|vale la pena|por que|explica(me)?|analiza(me)?|lee(me)?|interpreta|mi long|mi short|mi posicion|mi operacion|mi trade|estoy en|tengo un)\b/;
  const DECIDE_RE = /\b(deberia|debo|conviene|cierro|cerrar|salgo|salir|mantengo|aguanto|entro|entrar|abro|compro|vendo|long o short|short o long|mi long|mi short|mi posicion|mi operacion|mi trade|que harias|que hago)\b/;
  function intent(text) {
    const s = nz(text), draw = DRAW_RE.test(s), ask = ASK_RE.test(s);
    return {draw, ask, decide: DECIDE_RE.test(s), see: /\b(que ves|como (lo )?ves|mira|lee(me)? (mi|el) grafico|lo que (ves|se ve|dibuje)|esta (figura|forma)|este patron|que patron|que figura|en la (imagen|captura)|como se ve)\b/.test(s)};
  }
  /* Lo que el motor local NO sabe dibujar bien: mejor que lo decida la IA (rectángulos en una zona concreta, flechas, texto, posiciones, patrones…) */
  const needsAI = text => /\b(rectangulo|caja|cajon|recuadro|zona|zonas|area|flecha|texto|escribe|nota|vertical|long|short|posicion|entrada|stop|objetivo|take profit|\btp\b|\bsl\b|patron|figura|hch|cabeza|hombro|triangulo|cuna|bandera|banderin|elliott|onda|abcd|xabcd|desde|hasta|ultim[oa]s?|maximo|minimo|ayer|hoy|semana|oferta|demanda|order ?block|bloque|fvg|imbalance|liquidez|plan|ese|eso|esa|lo que)\b/.test(nz(text));

  /* «rectángulo / caja / zona entre 64 000 y 65 000» → zona sin esperar a la IA */
  function numsIn(s) { const out = []; const re = /(\d[\d.,]*)\s*(k|mil)?\b/g; let m; while ((m = re.exec(s))) { if (/^\d+\s*(m|h|d|w)\b/.test(s.slice(m.index, m.index + 4)) && !m[2]) continue; const raw = m[1].replace(/[.,]$/, ''); let v = /^\d{1,3}([.,]\d{3})+$/.test(raw) ? +raw.replace(/[.,]/g, '') : +raw.replace(/,(?=\d{3}\b)/g, '').replace(',', '.'); if (m[2]) v *= 1000; if (fin(v) && v > 0) out.push(v); } return out; }
  function parseZone(text, ref) {
    const s = nz(text); if (!/\b(rectangulo|caja|cajon|recuadro|zona|area|box)\b/.test(s) || !/\b(entre|de|desde)\b/.test(s)) return null;
    const ns = numsIn(s.replace(/\b\d+\s*(velas?|minutos?|horas?|dias?)\b/g, ' ')).filter(v => !ref || (v > ref.lo * .3 && v < ref.hi * 3)); if (ns.length < 2) return null;
    const hi = Math.max(ns[0], ns[1]), lo = Math.min(ns[0], ns[1]); if (hi === lo) return null;
    const back = ref && ref.visN ? Math.max(10, Math.min(ref.visN - 1, 120)) : 40;
    const col = /demanda|soporte|compra/.test(s) ? '#20bf9f' : /oferta|resistencia|venta/.test(s) ? '#f06b79' : '#38bdf8';
    return [{do: 'draw', shape: 'rect', p: [[back, hi], [-8, lo]], col, label: /demanda/.test(s) ? 'Zona de demanda' : /oferta/.test(s) ? 'Zona de oferta' : 'Zona ' + fmt(lo) + ' – ' + fmt(hi)}];
  }

  /* ───────── Dibujos libres de la IA → dibujos reales del gráfico ───────── */
  const SHAPES = {rect: 2, rectangle: 2, zone: 2, zona: 2, box: 2, trend: 2, line: 2, ray: 2, extended: 2, arrow: 2, ellipse: 2, measure: 2, pricerange: 2, hline: 1, horizontal: 1, hray: 1, vline: 1, vertical: 1, text: 1, note: 1, arrowup: 1, arrowdown: 1, flag: 1, check: 1, xmark: 1, star: 1, fib: 2, fibext: 3, channel: 3, triangle: 3, pitchfork: 3, abcd: 4, xabcd: 5, abc: 4, impulse: 6, hs: 7, long: 0, short: 0};
  const ALIAS = {rectangle: 'rect', zone: 'rect', zona: 'rect', box: 'rect', line: 'trend', hline: 'horizontal', vline: 'vertical'};
  const MULTI = ['abcd', 'xabcd', 'abc', 'impulse', 'hs'];
  const DEF_COL = {rect: '#38bdf8', trend: '#f0b90b', ray: '#f0b90b', extended: '#f0b90b', arrow: '#e9edf5', ellipse: '#c084fc', horizontal: '#e9edf5', hray: '#e9edf5', vertical: '#9ca3af', text: '#e9edf5', note: '#a78bfa', arrowup: '#20bf9f', arrowdown: '#f06b79', fib: '#c084fc', fibext: '#c084fc', channel: '#a78bfa', triangle: '#38bdf8', pitchfork: '#a78bfa'};
  function toDrawings(act, cs, st) {
    if (!act || act.do !== 'draw' || !Array.isArray(cs) || cs.length < 2) return {drawings: [], err: 'sin datos'};
    let shape = String(act.shape || act.type || '').toLowerCase(); if (!(shape in SHAPES)) return {drawings: [], err: 'figura desconocida: ' + shape};
    const type = ALIAS[shape] || shape, n = cs.length, iv = (cs[n - 1].t - cs[0].t) / ((n - 1) || 1), px = cs[n - 1].c;
    const hi = Math.max(...cs.map(c => c.h)), lo = Math.min(...cs.map(c => c.l)), okP = p => fin(p) && p > 0 && p > lo * .25 && p < hi * 4;
    const tAt = bars => { const b = Math.round(+bars); if (!fin(b)) return null; const i = n - 1 - Math.max(-400, Math.min(n - 1, b)); return i <= n - 1 ? cs[Math.max(0, i)].t + (i < 0 ? i * iv : 0) : cs[n - 1].t + (i - n + 1) * iv; };
    const sw = (st && st.swings) || [], swing = id => sw.find(s => s.id.toUpperCase() === String(id).toUpperCase());
    const pt = q => { // [hace, precio] · {bars, price} · "P3"
      if (typeof q === 'string') { const s = swing(q.trim()); return s ? {t: s.t != null ? s.t : cs[s.i].t, p: s.p} : null; }
      if (Array.isArray(q) && q.length >= 2) { const t = tAt(q[0]), p = +q[1]; return t != null && okP(p) ? {t, p} : null; }
      if (q && typeof q === 'object') { const t = tAt(q.bars != null ? q.bars : q.hace), p = +(q.price != null ? q.price : q.precio); return t != null && okP(p) ? {t, p} : null; }
      return null;
    };
    const col = (c => { if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase(); const Dr = D(), k = nz(c); return (Dr && Dr.COLORS[k]) || null; })(act.col || act.color);
    const label = act.label ? String(act.label).slice(0, 60) : '', text = String(act.text || act.label || '').slice(0, 80);
    const base = o => Object.assign(o, col || DEF_COL[type] ? {col: col || DEF_COL[type]} : {}, label && !['text', 'note'].includes(type) ? {label} : {});
    if (type === 'long' || type === 'short') {
      const e = +(act.entry != null ? act.entry : px), sl = +act.sl, tp = +act.tp; if (![e, sl, tp].every(okP)) return {drawings: [], err: 'faltan entrada, stop u objetivo'};
      if (type === 'long' ? !(tp > e && sl < e) : !(tp < e && sl > e)) return {drawings: [], err: 'el stop y el objetivo no cuadran con un ' + type};
      const from = tAt(act.bars != null ? act.bars : 0), to = tAt(-Math.max(12, Math.min(80, Math.round(n * .08))));
      return {drawings: [base({type, a: {t: from, p: e}, b: {t: to, p: tp}, sp: sl})]};
    }
    let P = Array.isArray(act.p) ? act.p : Array.isArray(act.points) ? act.points : [];
    if (type === 'horizontal' || type === 'hray') { const v = typeof P[0] === 'number' ? P[0] : act.price != null ? +act.price : Array.isArray(P[0]) ? P[0][1] : null, b = Array.isArray(P[0]) ? P[0][0] : 0; if (!okP(+v)) return {drawings: [], err: 'precio fuera del gráfico'}; return {drawings: [base({type, a: {t: tAt(type === 'hray' ? b : 0), p: +v}})]}; }
    if (type === 'vertical') { const b = typeof P[0] === 'number' ? P[0] : Array.isArray(P[0]) ? P[0][0] : act.bars; const t = tAt(b); if (t == null) return {drawings: [], err: 'vela inválida'}; return {drawings: [base({type, a: {t, p: px}})]}; }
    if (type === 'channel' && P.length === 2 && fin(+act.width)) { const a = pt(P[0]), b = pt(P[1]); if (a && b) P = [P[0], P[1], [Math.round((n - 1) - ((a.t + b.t) / 2 - cs[0].t) / iv), (a.p + b.p) / 2 + +act.width]]; }
    const need = SHAPES[shape], Q = P.slice(0, Math.max(need, 1)).map(pt);
    if (Q.length < need || Q.some(q => !q)) return {drawings: [], err: `faltan puntos para ${type} (necesita ${need})`};
    if (need >= 2 && Q.every(q => q.t === Q[0].t && q.p === Q[0].p)) return {drawings: [], err: 'puntos repetidos'};
    let d;
    if (MULTI.includes(type)) d = {type, pts: Q, a: Q[0], b: Q[Q.length - 1]};
    else if (type === 'text' || type === 'note') { if (!text) return {drawings: [], err: 'texto vacío'}; d = {type, a: Q[0], text}; }
    else { d = {type, a: Q[0]}; if (Q[1]) d.b = Q[1]; if (Q[2]) d.c = Q[2]; }
    if (type === 'rect' && d.a.t === d.b.t) d.b = {t: d.b.t + iv * 10, p: d.b.p};
    return {drawings: [base(d)]};
  }

  /* La respuesta de la IA → {reply, actions}. Aguanta bloques ```json, texto antes/después y comas de sobra. */
  function parseReply(raw) {
    raw = String(raw || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(); let j = null;
    const body = (raw.match(/```(?:json)?\s*([\s\S]*?)```/i) || [])[1] || raw, i = body.indexOf('{');
    if (i >= 0) { let depth = 0, inS = false, esc = false, end = -1; for (let k = i; k < body.length; k++) { const c = body[k]; if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue; } if (c === '"') inS = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) { end = k; break; } } }
      const chunk = body.slice(i, end > 0 ? end + 1 : undefined); for (const t of [chunk, chunk.replace(/,\s*([}\]])/g, '$1')]) { try { j = JSON.parse(t); break; } catch {} } }
    let reply = j && typeof j.reply === 'string' ? j.reply : j && typeof j.respuesta === 'string' ? j.respuesta : '';
    if (!reply) { const m = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/); reply = m ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : raw.replace(/```[\s\S]*?```/g, '').replace(/\{[\s\S]*\}/, '').trim(); }
    const actions = j && Array.isArray(j.actions) ? j.actions : j && Array.isArray(j.acciones) ? j.acciones : [];
    return {reply: reply.replace(/\*\*/g, '').trim(), actions: actions.filter(a => a && typeof a === 'object').slice(0, 8)};
  }

  const SYS = `Eres NEXUS PIXEL, el copiloto de trading de VORTEX (by Nova Nexus): un robot que flota sobre el gráfico del usuario, LEE su gráfico y sus indicadores y puede dibujar en él.
Piensas como un trader profesional con años de experiencia en cripto: lees estructura de mercado, tendencia, momentum, volumen, niveles de liquidez y el contexto de sus indicadores (sobre todo Nova Nexus: nube, oscilador, flujo, ADX y señales). Hablas en español de México, claro, directo y con buena onda, sin relleno.

CÓMO RESPONDER
- Usa SOLO los datos que te paso (DATOS DEL GRÁFICO). Nunca inventes precios, indicadores ni noticias. Si falta algo, dilo.
- Cita números concretos (precios, % de distancia, valores de indicadores) para justificar.
- Preguntas de DECISIÓN («¿cierro mi long?», «¿entro en short?», «¿long o short?»): da una lectura concreta en este orden: 1) tu veredicto en una frase (mantener / cerrar / cerrar una parte y subir el stop / esperar / entrar / no entrar), 2) por qué: 2-4 razones con datos (estructura, nube/oscilador de Nova Nexus, EMAs, RSI/MACD, niveles), 3) el plan: nivel de invalidación (stop), objetivos y qué confirmación esperar. Si tiene posición, tómala en cuenta (entrada, stop, ganancia actual) y si no tiene stop, recomiéndale uno. Si las señales se contradicen, dilo y recomienda esperar. Recuerda que es tu opinión, no asesoría financiera (una sola vez, al final, muy breve).
- Preguntas de LECTURA («¿cómo ves el gráfico?», «¿qué dicen mis indicadores?»): resume tendencia, momentum, niveles clave y qué esperar, indicador por indicador si lo pide.
- Respuestas: máximo 8 renglones cortos (usa saltos de línea; sin markdown, sin **). Charla simple: 1-2 frases.

CUÁNDO DIBUJAR
- DIBUJA solo si el usuario lo pide (dibuja, marca, traza, pon, muéstrame…) o si responde «sí» a que dibujes. Si solo pregunta, NO dibujes: deja "actions":[] y, si ayuda, ofrécele dibujar el plan.
- Nunca dibujes soportes y resistencias si no los pidió.
- Para editar dibujos que YA existen usa style/remove/move; nunca dibujes algo nuevo para cambiar un color.

FORMATO: responde SOLO un objeto JSON válido: {"reply":"tu respuesta","actions":[...]}
ACCIONES:
- Automáticas (la app calcula con las velas): {"do":"sr"} soportes y resistencias · {"do":"channel"} canal · {"do":"range"} rango · {"do":"trend"} línea de tendencia · {"do":"fib"} Fibonacci del último impulso.
- Dibujo LIBRE con coordenadas exactas: {"do":"draw","shape":FIGURA,"p":[PUNTO,PUNTO,...],"label":"texto corto opcional","col":"#rrggbb opcional"}
  PUNTO = [hace, precio]: «hace» = velas hacia atrás desde la última (0 = vela actual, 20 = hace 20 velas, -10 = 10 velas hacia el FUTURO). También puedes usar el nombre de un punto de giro, p. ej. "P2".
  FIGURAS: "rect" (2 puntos = esquinas opuestas; para una zona/caja/rectángulo; extiéndela al futuro con hace negativo) · "trend" / "ray" / "extended" / "arrow" / "ellipse" (2 puntos) · "hline" ("p":[precio]) · "hray" ("p":[[hace,precio]]) · "vline" ("p":[hace]) · "text" (1 punto + "text":"...") · "arrowup" / "arrowdown" (1 punto) · "fib" (2 puntos: inicio y fin del movimiento) · "fibext" (3) · "channel" (3: dos puntos de la línea base y uno del lado opuesto) · "triangle" (3) · "abcd" (4) · "xabcd" (5) · "abc" (4) · "impulse" (6) · "hs" (7, hombro-cabeza-hombro).
  Posición: {"do":"draw","shape":"long"|"short","entry":PRECIO,"sl":PRECIO,"tp":PRECIO}
- Editar lo existente (ver DIBUJOS): {"do":"style","target":T,"col":"#rrggbb","lw":1|2|3,"ds":"dot"|"dash"|""} · {"do":"remove","target":T} · {"do":"move","target":T,"price":N} · {"do":"clear"} (borra tus dibujos). T: channel, sup, res, trend, fib, range, hline, line, last.
Ejemplo zona: {"do":"draw","shape":"rect","p":[[45,64850],[-10,64200]],"label":"Zona de oferta","col":"#f06b79"}`;

  const SEE = 'Eres los ojos de un analista de trading. Describe en español, en máximo 8 renglones, SOLO lo que se ve en la captura del gráfico: tendencia, figuras o patrones (canales, triángulos, banderas, dobles techos/suelos, HCH), velas importantes recientes, dónde está el precio respecto a las líneas/nubes/indicadores visibles y los dibujos del usuario (rectángulos, líneas, Long/Short) con sus precios si se leen en la escala. No des recomendaciones ni inventes números que no se lean.';

  const api = {ema, rsi, atrArr, macd, swings, structure, snapshot, indText, positions, posText, brief, intent, needsAI, parseZone, numsIn, toDrawings, parseReply, baseOf, SYS, SEE, SHAPES};
  root.NexusPixelBrain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

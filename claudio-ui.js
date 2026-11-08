/* CLAUDIO · panel dentro de Nova Bot Lab (solo PC). Muestra lo que hace el agente 24/7: régimen, decisiones de Jev por vela, posiciones,
   riesgo frente a sus límites, informe nocturno (Brier) e investigación. El agente corre en GitHub Actions (scripts/claudio-run.js) y escribe en tu cuenta;
   sin sesión iniciada funciona en «modo local» (solo avanza con la app abierta). Simulación con capital virtual: no envía órdenes reales. */
(function () {
  'use strict';
  const K = window.CCTClaudio, RS = window.CCTClaudioResearch; if (!K || !RS) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const num = (x, d = 2) => x == null || !Number.isFinite(+x) ? '—' : (+x).toLocaleString('es', {maximumFractionDigits: d, minimumFractionDigits: 0});
  const pct = (x, d = 2) => x == null || !Number.isFinite(+x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + num(Math.abs(x), d) + ' %', cls = x => x > 0 ? 'pos' : x < 0 ? 'neg' : '';
  const dt = t => t ? new Date(t).toLocaleString('es', {dateStyle: 'short', timeStyle: 'short'}) : '—', ago = t => { if (!t) return 'nunca'; const m = Math.round((Date.now() - t) / 6e4); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
  const H = () => window.CCT_bot || {}, LKEY = 'cct_claudio_local_v1';
  const REG = {trending: 'Tendencia', mean_reverting: 'Rango', high_vol: 'Alta volatilidad', crisis: 'Crisis'}, DIR = {long: 'Largo', short: 'Corto', neutral: 'Neutral'}, RST = {safe: 'Seguro', near_limit: 'Cerca del límite', reduce: 'Reducir'}, ACT = {enter: 'ENTRA', exit: 'SALE', hold: 'espera'};
  const FACE = `<svg viewBox="0 0 48 48" width="42" height="42" aria-hidden="true"><defs><linearGradient id="clg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#20bf9f"/></linearGradient></defs><rect x="6" y="10" width="36" height="30" rx="10" fill="url(#clg)"/><rect x="11" y="17" width="26" height="14" rx="7" fill="#05070c"/><circle cx="18.5" cy="24" r="2.6" fill="#7cf3d6"/><circle cx="29.5" cy="24" r="2.6" fill="#7cf3d6"/><path d="M24 10V5" stroke="#9fb3ff" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="4.5" r="2.4" fill="#f0b90b"/><path d="M19 35h10" stroke="#05070c" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  let st = {mode: null, cfg: null, s: null, at: null, busy: false, err: '', tab: 'live', loaded: 0}, root = null, head = null, timer = 0;

  /* ───────── Datos ─────────
     La configuración (encendido, interruptor, capital) y la sesión viven en tu documento de Nova Bot Lab (se guarda en tu cuenta igual que tus bots).
     El navegador avanza a Claudio mientras VORTEX está abierto; el servidor (GitHub Actions, cada hora) lo avanza cuando no lo está. Siempre se usa la copia más avanzada. */
  const LAB = () => window.CCTBotLabUI && window.CCTBotLabUI.claudio ? window.CCTBotLabUI : null;
  const cloud = () => { try { return H().claudio && H().claudio(); } catch { return null; } };
  const readLegacy = () => { try { return JSON.parse(localStorage.getItem(LKEY) || 'null'); } catch { return null; } };
  function persist() { const L = LAB(); if (L) L.claudio({cfg: st.cfg, s: K.slim(st.s)}); }
  async function load() {
    if (st.loading) return; st.loading = true; st.err = '';
    const L = LAB(), saved = (L && L.claudio()) || readLegacy() || {cfg: {enabled: false, capital: 10000, at: 0}, s: null};
    st.cfg = Object.assign({enabled: false, capital: 10000, at: 0}, saved.cfg); st.s = K.newer(st.s, saved.s);
    const c = cloud(); st.mode = c ? 'cuenta' : 'local';
    if (c) { try { const srv = await c.server(); if (srv && srv.s) { const n = K.newer(st.s, srv.s); if (n === srv.s) st.at = srv.at; st.s = n; } } catch {} }
    st.loaded = Date.now(); st.loading = false; persist(); paint(); if (!(root && root.querySelector('.cl-view')) && typeof UI.onChange === 'function') UI.onChange();
    if (st.cfg.enabled) tick();
  }
  const binBook = async sym => { const r = await fetch(`https://api.binance.com/api/v3/depth?symbol=${encodeURIComponent(sym)}&limit=20`); if (!r.ok) throw new Error('HTTP ' + r.status); const d = await r.json(); return {t: Date.now(), bids: d.bids.map(x => [+x[0], +x[1]]), asks: d.asks.map(x => [+x[0], +x[1]])}; };
  const binCandles = async (sym, n) => { if (H().history) return H().history(sym, '1h', n); const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(sym)}&interval=1h&limit=${Math.min(1000, n)}`); if (!r.ok) throw new Error('HTTP ' + r.status); const now = Date.now(); return (await r.json()).filter(d => d[6] < now).map(d => ({t: d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]})); };
  async function tick() { // el mismo núcleo que el servidor, en tu navegador (solo PC)
    if (st.busy || !st.cfg.enabled || !matchMedia('(min-width:1024px)').matches) return; st.busy = true; paint();
    try {
      const now = Date.now(), s = K.prepare(st.cfg, st.s, now, RS.symbols());
      await K.step(s, {candles: binCandles, book: binBook}, K.jevEvaluator({}), now);
      if (!s.nightly.length || now - s.nightly[s.nightly.length - 1].t > 864e5) K.nightly(s, now);
      st.s = s; st.at = now; persist();
    } catch (e) { st.err = 'No se pudo leer el mercado: ' + e.message; }
    st.busy = false; paint(); if (!(root && root.querySelector('.cl-view')) && typeof UI.onChange === 'function') UI.onChange();
  }
  async function setCfg(patch) {
    st.cfg = Object.assign({}, st.cfg, patch, {at: Date.now()}); persist(); paint();
    if (st.cfg.enabled) tick();
  }
  const toast = t => { try { (H().toast || window.toast || (() => {}))(t); } catch {} };

  /* ───────── Vistas ───────── */
  function status() {
    const s = st.s, c = st.cfg || {};
    if (!c.enabled) return ['off', 'Apagado'];
    if (c.kill || (s && s.kill)) return ['kill', 'Interruptor activado'];
    if (s && s.halted) return ['halt', 'Detenido por drawdown'];
    if (!s) return ['on', 'Encendido'];
    return ['on', 'Operando 24/7 (simulación)'];
  }
  const AV = (size, live) => `<span class="bl-avw"><span class="bl-av" style="--av:#7c5cff;width:${size}px;height:${size}px"><img src="icons/bots/robot.png" width="${size}" height="${size}" alt="" draggable="false"></span>${live == null ? '' : `<span class="bl-dot d-${live ? 'live' : 'draft'}"></span>`}</span>`;
  /* Claudio en la lista: un bot más, con el mismo aspecto que los demás */
  function card() {
    const s = st.s, [k, label] = status(), stt = s ? K.stats(s) : null, on = k === 'on';
    if (!st.loaded || Date.now() - st.loaded > 6e4) setTimeout(load, 0);
    const pts = s && s.curve && s.curve.length > 1 ? s.curve.map(p => [p[0], (p[1] / s.capital - 1) * 100]) : null, col = stt && stt.retPct < 0 ? '#f06b79' : '#20bf9f';
    const sp = pts ? (() => { const w = 60, h = 26, a = pts.length > 40 ? pts.filter((_, i) => i % Math.ceil(pts.length / 40) === 0).concat([pts[pts.length - 1]]) : pts, ys = a.map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), t0 = a[0][0], t1 = a[a.length - 1][0] || t0 + 1, d = a.map((p, i) => (i ? 'L' : 'M') + ((p[0] - t0) / (t1 - t0 || 1) * w).toFixed(1) + ' ' + (h - 2 - (p[1] - lo) / (hi - lo || 1) * (h - 4)).toFixed(1)).join(''); return `<svg class="bd-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${col}" stroke-width="1.6"/></svg>`; })() : '';
    const ps = s && s.positions ? Object.entries(s.positions) : [], sh = ps.length && ps[0][1].side === 'short';
    const openB = ps.length ? `<em class="bl-open s-${sh ? 'short' : 'long'}" title="${esc(ps.map(([k, p]) => `${p.side === 'short' ? 'SHORT' : 'LONG'} abierta en ${k.replace('USDT', '')}`).join(' · '))}"><i></i>${ps.length > 1 ? ps.length + ' abiertas' : sh ? 'Short' : 'Long'}</em>` : '';
    return `<div class="bl-row"><button type="button" class="bl-row-m" data-a="claudio">${AV(34, on)}<span class="bl-row-n"><b>Claudio${openB}</b><small>${RS.CANDIDATES.length} monedas · 1h · ${esc(on ? 'En vivo' : label)}</small></span>${sp}<span class="bl-row-v ${stt ? cls(stt.retPct) : ''}">${stt ? pct(stt.retPct) : '—'}</span><span class="bl-row-go">›</span></button><button type="button" class="bl-tg ${(st.cfg || {}).enabled && !(st.cfg || {}).kill ? 'on' : ''}" data-a="clToggle" title="Encender / apagar" aria-pressed="${!!(st.cfg || {}).enabled}"><i></i></button></div>`;
  }
  function liveRow() { // para el Torneo de bots
    const s = st.s; if (!s || !(st.cfg && st.cfg.enabled) || st.cfg.kill) return null; const x = K.stats(s);
    return {id: 'claudio', name: 'Claudio', av: AV(30), col: '#7c5cff', ret: x.retPct, n: x.n, win: x.winRate, since: s.startT, curve: (s.curve || []).map(p => [p[0], (p[1] / s.capital - 1) * 100]), open: 'claudio'};
  }
  const gauge = (lab, v, max, unit, invert) => { const p = Math.max(0, Math.min(100, (v || 0) / max * 100)), col = p > 80 ? '#f06b79' : p > 50 ? '#f0b90b' : '#20bf9f'; return `<div class="cl-g"><div class="cl-g-h"><small>${lab}</small><b>${num(v, 2)}${unit} <i>/ ${max}${unit}</i></b></div><div class="cl-g-b"><i style="width:${p.toFixed(1)}%;background:${col}"></i></div></div>`; };
  function curve(s) {
    const pts = (s.curve || []).filter(p => p[0] != null); if (pts.length < 2) return '<div class="bd-empty">La curva aparece después de las primeras velas.</div>';
    const W = Math.max(280, Math.min(1100, (root.clientWidth || 380) - 40)), Hh = 150, t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1, ys = pts.map(p => p[1]), lo = Math.min(...ys, s.capital), hi = Math.max(...ys, s.capital), X = t => 6 + (t - t0) / (t1 - t0 || 1) * (W - 52), Y = v => 8 + (hi - v) / (hi - lo || 1) * (Hh - 26);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(''), up = ys[ys.length - 1] >= s.capital, col = up ? '#20bf9f' : '#f06b79';
    return `<svg class="cl-curve" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}"><line x1="6" x2="${W - 46}" y1="${Y(s.capital)}" y2="${Y(s.capital)}" class="bd-zero"/><text x="${W - 42}" y="${Y(s.capital) + 4}" class="bd-ax">${num(s.capital, 0)}</text><path d="${d}L${X(t1)} ${Hh - 18}L${X(t0)} ${Hh - 18}Z" fill="${col}" opacity=".12"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2"/><text x="6" y="${Hh - 4}" class="bd-ax">${dt(t0)}</text><text x="${W - 46}" y="${Hh - 4}" class="bd-ax" text-anchor="end">${dt(t1)}</text></svg>`;
  }
  function tabLive(s) {
    const pf = K.portfolioOf(s), stt = K.stats(s), L = K.LIMITS, dec = RS.CANDIDATES.map(c => [c, s.decisions[c.sym]]);
    const pos = Object.entries(s.positions), esc8 = Object.entries(s.escalations || {}).filter(([, x]) => x.open), last = s.nightly[s.nightly.length - 1];
    return `<div class="bd-kpis">
        <div class="bd-kpi"><div><small>Patrimonio virtual</small><b>${num(stt.equity)} USDT</b><em class="${cls(stt.retPct)}">${pct(stt.retPct)} desde ${dt(s.startT)}</em></div></div>
        <div class="bd-kpi"><div><small>Operaciones</small><b>${stt.n}</b><em>${stt.winRate == null ? 'sin cierres aún' : `aciertos ${num(stt.winRate, 0)} % · F. benef. ${stt.profitFactor == null ? '—' : num(stt.profitFactor, 2)}`}</em></div></div>
        <div class="bd-kpi"><div><small>Reflejo (Jev)</small><b>${esc(s.lastBy || '—')}</b><em>${s.stats.calls} llamadas · ${s.stats.calls ? num(s.stats.ms / s.stats.calls, 0) : '—'} ms prom.${s.stats.fallbacks ? ` · ${s.stats.fallbacks} respaldos` : ''}</em></div></div>
        <div class="bd-kpi"><div><small>Calibración</small><b>v${s.calib.v}</b><em>${last && last.brier != null ? `Brier ${num(last.brier, 4)} (azar = 0,25)` : 'sin informe nocturno aún'}</em></div></div></div>
      <div class="bl-box"><h4>Riesgo frente a sus límites (código, no modelo)</h4><div class="cl-gs">${gauge('Drawdown', pf.ddPct, L.maxDrawdownPct, ' %')}${gauge('Pérdida del día', Math.max(0, -pf.dayPct), L.maxDailyLossPct, ' %')}${gauge('Posiciones', pf.openN, L.maxOpen, '')}</div>
        <small class="bl-dim">Máx. ${L.maxPositionPct} % nocional por posición · ¼ de Kelly · interruptor de emergencia comprobado antes de cada orden.</small></div>
      <div class="bl-box"><h4>Curva de capital</h4>${curve(s)}</div>
      ${esc8.length ? `<div class="bl-box cl-warn"><h4>Escalado a revisión profunda</h4>${esc8.map(([sym, x]) => `<p><b>${esc(sym)}</b>: confianza ${num(x.conf * 100, 0)} % y régimen ${esc(REG[x.from] || x.from)} → crisis (${dt(x.t)}). Sin entradas en esta moneda hasta revisarla.</p>`).join('')}<small class="bl-dim">Pídele a Claude (Opus 5.5) que revise el caso; la revisión nocturna lo cierra a las 24 h si no se reactiva.</small></div>` : ''}
      <div class="bl-box"><h4>Posiciones abiertas</h4>${pos.length ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Moneda</th><th>Lado</th><th>Entrada</th><th>SL</th><th>TP</th><th>Desde</th></tr></thead><tbody>${pos.map(([sym, p]) => `<tr><td>${esc(sym)}</td><td class="${p.side === 'long' ? 'pos' : 'neg'}">${DIR[p.side]}</td><td>${num(p.entry, 6)}</td><td>${num(p.sl, 6)}</td><td>${num(p.tp, 6)}</td><td>${dt(p.entryT)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="bl-dim">Sin posiciones. Claudio solo entra con calidad ≥ 2, confianza > 80 % y riesgo «seguro».</p>'}</div>
      <div class="bl-box"><h4>Decisiones de la última vela</h4><div class="bl-scroll"><table class="bl-t cl-dec"><thead><tr><th>Moneda</th><th>Régimen</th><th>Dirección</th><th>Conf.</th><th>Calidad</th><th>Tóxico</th><th>Riesgo</th><th>Acción</th><th>Motivo</th></tr></thead><tbody>${dec.map(([c, d]) => d ? `<tr title="${esc(d.state || '')}"><td><b>${esc(c.sym.replace('USDT', ''))}</b><small>${dt(d.t)}</small></td><td>${esc(REG[d.regime] || '—')}</td><td class="${d.direction === 'long' ? 'pos' : d.direction === 'short' ? 'neg' : ''}">${esc(DIR[d.direction] || '—')}</td><td>${d.dirConf == null ? '—' : num(d.dirConf * 100, 1) + ' %'}</td><td>${d.quality == null ? '—' : num(d.quality, 1)}</td><td>${d.toxic == null ? '—' : num(d.toxic * 100, 0) + ' %'}</td><td>${esc(RST[d.riskState] || '—')}</td><td><span class="cl-act a-${d.action}">${ACT[d.action] || d.action}</span></td><td class="cl-why">${esc(d.why || '')}</td></tr>` : `<tr><td><b>${esc(c.sym.replace('USDT', ''))}</b></td><td colspan="8" class="bl-dim">${s.skip && s.skip[c.sym] ? 'Sin datos en Binance Spot (se reintenta cada 24 h)' : 'Aún sin vela evaluada'}</td></tr>`).join('')}</tbody></table></div>
        <small class="bl-dim">Pasa el cursor por una fila para ver el estado exacto que recibió Jev (≈ ${num(Math.max(0, ...Object.values(s.decisions).map(d => d.tokens || 0)), 0)} tokens máx. por moneda).</small></div>`;
  }
  function tabLedger(s) {
    const rows = s.ledger.slice().reverse().slice(0, 200);
    return `<div class="bl-box"><h4>Libro de operaciones ${K.verify(s) ? '<span class="cl-chip k-on">cadena de hashes íntegra</span>' : '<span class="cl-chip k-kill">¡libro alterado!</span>'}</h4>${rows.length ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>#</th><th>Moneda</th><th>Lado</th><th>Entrada</th><th>Salida</th><th>Neto</th><th>R</th><th>Motivo</th></tr></thead><tbody>${rows.map(t => `<tr><td>${t.n}</td><td>${esc(t.sym)}</td><td>${DIR[t.side]}</td><td>${dt(t.entryT)}<small>${num(t.entry, 6)}</small></td><td>${dt(t.exitT)}<small>${num(t.exit, 6)}</small></td><td class="${cls(t.net)}">${num(t.net)}</td><td>${t.r == null ? '—' : num(t.r, 2)}</td><td class="cl-why">${esc(t.why)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="bl-dim">Aún no hay operaciones cerradas.</p>'}</div>
      <div class="bl-box"><h4>Actividad</h4><div class="bd-feed">${s.events.slice(-60).reverse().map(e => `<div class="bd-ev"><i class="cl-ev-${esc(e.kind)}"></i><div><span class="bd-kind">${esc(e.kind)}</span><small>${esc(e.text)}</small></div><time>${dt(e.t)}</time></div>`).join('') || '<p class="bl-dim">Sin actividad.</p>'}</div></div>`;
  }
  function tabNight(s) {
    const n = s.nightly.slice().reverse();
    if (!n.length) return '<div class="bl-box"><h4>Revisión nocturna</h4><p class="bl-dim">Cada noche a las 00:15 (hora de México) Claudio mide su calibración con la puntuación de Brier, busca oportunidades perdidas y recalibra la probabilidad de Jev solo si mejora fuera de muestra. Aún no hay informes.</p></div>';
    const r = n[0];
    return `<div class="bl-box"><h4>Última revisión · ${dt(r.t)}</h4><p>${esc(r.note)}</p>
        <div class="bd-kpis"><div class="bd-kpi"><div><small>Brier</small><b>${r.brier == null ? '—' : num(r.brier, 4)}</b><em>${r.n} predicciones · azar = 0,25 · menor es mejor</em></div></div>${r.holdout ? `<div class="bd-kpi"><div><small>Fuera de muestra</small><b>${num(r.holdout.old, 4)} → ${num(r.holdout.new, 4)}</b><em>${r.changed ? 'adoptada' : 'descartada'}</em></div></div>` : ''}<div class="bd-kpi"><div><small>Calibración</small><b>a ${num(r.calibAfter.a, 3)} · b ${num(r.calibAfter.b, 3)}</b><em>esquema v${r.calibAfter.v}</em></div></div></div>
        ${Object.keys(r.byRegime).length ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Régimen</th><th>Predicciones</th><th>Brier</th></tr></thead><tbody>${Object.entries(r.byRegime).map(([g, x]) => `<tr><td>${esc(REG[g] || g)}</td><td>${x.n}</td><td>${num(x.brier, 4)}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${r.bins.length ? `<h4>Fiabilidad (probabilidad prevista vs. acierto real)</h4><div class="cl-bins">${r.bins.map(b => `<div title="${b.n} predicciones"><i style="height:${(b.hit * 100).toFixed(0)}%"></i><small>${num(b.p * 100, 0)}</small></div>`).join('')}</div><small class="bl-dim">Barra = % de veces que subió; eje = probabilidad que dio Jev. Bien calibrado ⇒ la barra sube en diagonal.</small>` : ''}
        <h4>Oportunidades perdidas</h4>${r.missed.length ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Vela</th><th>Moneda</th><th>Movimiento 4 h</th><th>P(sube)</th><th>Calidad</th></tr></thead><tbody>${r.missed.map(m => `<tr><td>${dt(m.t)}</td><td>${esc(m.sym)}</td><td class="${cls(m.ret)}">${pct(m.ret)}</td><td>${num(m.pUp * 100, 0)} %</td><td>${num(m.q, 1)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="bl-dim">Ninguna relevante.</p>'}</div>
      ${n.length > 1 ? `<div class="bl-box"><h4>Historial</h4><div class="bl-scroll"><table class="bl-t"><thead><tr><th>Noche</th><th>Brier</th><th>Predicciones</th><th>Cambio</th></tr></thead><tbody>${n.slice(1).map(x => `<tr><td>${dt(x.t)}</td><td>${x.brier == null ? '—' : num(x.brier, 4)}</td><td>${x.n}</td><td>${x.changed ? 'v' + x.calibAfter.v : '—'}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  }
  function tabResearch() {
    const R = RS.REGIME;
    return `<div class="bl-box"><h4>Régimen: ${esc(R.label)} <small class="bl-dim">· investigación del ${esc(RS.ASOF)}</small></h4><ul class="cl-ul">${R.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul><p><b>Postura:</b> ${esc(R.stance)}</p></div>
      ${RS.CANDIDATES.map(c => `<details class="bl-box cl-cand"><summary><b>${esc(c.name)}</b> <small>${esc(c.sym)}</small><span class="cl-chip">${esc(c.bias)}</span></summary><p>${esc(c.thesis)}</p>
        <div class="cl-cols"><div><h5>Catalizadores</h5><ul class="cl-ul">${c.catalysts.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div><h5>Argumentos bajistas</h5><ul class="cl-ul">${c.bear.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
        <p><b>¿El valor repercute en el token?</b> ${esc(c.value)}</p><p><b>Se invalida si:</b> ${esc(c.invalid)}</p><p class="bl-dim">Confirmado: ${esc(c.confirmed.join(' · '))} — Especulativo: ${esc(c.speculative.join(' · '))}</p></details>`).join('')}
      <div class="bl-box cl-warn"><h4>¿EN QUÉ PODRÍA ESTAR EQUIVOCADO?</h4><ol class="cl-ul">${RS.WRONG.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>
      <div class="bl-box"><h4>Límites fijos</h4><p class="bl-dim">Drawdown máx. ${K.LIMITS.maxDrawdownPct} % · pérdida diaria máx. ${K.LIMITS.maxDailyLossPct} % · ${K.LIMITS.maxPositionPct} % nocional por posición · ${K.LIMITS.maxOpen} posiciones · ¼ de Kelly · entra solo con calidad ≥ ${K.LIMITS.minQuality}, confianza > ${K.LIMITS.minDirConf * 100} % y riesgo «seguro» · escalada si confianza < ${K.LIMITS.escalateBelow * 100} % y pasa a crisis · stop ${K.LIMITS.slAtr}× ATR, objetivo ${K.LIMITS.tpAtr}× ATR, máx. ${K.LIMITS.maxBars} velas · comisión ${K.LIMITS.feePct} % + deslizamiento ${K.LIMITS.slipPct} %.</p></div>
      <div class="bl-box"><h4>Fuentes</h4><ul class="cl-ul">${RS.SOURCES.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')}</ul></div>`;
  }
  function paint() {
    if (!root || !root.isConnected || !root.querySelector('.cl-view')) return; const box = root.querySelector('.cl-view'), s = st.s, c = st.cfg || {}, [k, label] = status();
    const ctl = `<div class="cl-ctl"><span class="cl-chip k-${k}">${esc(label)}</span><small class="bl-dim">${st.mode === 'cuenta' ? 'Guardado en tu cuenta · corre en tu navegador con VORTEX abierto y en el servidor cada hora' : 'Sin sesión iniciada: solo avanza con VORTEX abierto en esta PC'} · ${s && s.lastT ? 'última vela ' + ago(s.lastT) + ' · próxima decisión en ' + Math.max(1, Math.ceil((Math.floor(Date.now() / 36e5) * 36e5 + 36e5 - Date.now()) / 6e4)) + ' min' : 'primera decisión al cerrar la vela de 1 h'}</small>
      <div class="cl-btns">${c.enabled ? `<button class="bl-btn ghost" data-cl="off">Apagar</button>` : `<button class="bl-btn" data-cl="on">Encender a Claudio</button>`}
      ${c.enabled ? (c.kill ? `<button class="bl-btn ghost" data-cl="unkill">Quitar interruptor</button>` : `<button class="bl-btn cl-kill" data-cl="kill">Interruptor de emergencia</button>`) : ''}
      ${s && s.halted ? `<button class="bl-btn ghost" data-cl="resume">Reanudar tras drawdown</button>` : ''}<button class="bl-btn ghost" data-cl="reset">Reiniciar</button>${c.enabled ? `<button class="bl-btn ghost" data-cl="tick" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Leyendo el mercado…' : 'Actualizar ahora'}</button>` : `<button class="bl-btn ghost" data-cl="reload">Actualizar</button>`}</div></div>`;
    const tabs = [['live', 'En vivo'], ['ledger', 'Operaciones'], ['night', 'Revisión nocturna'], ['res', 'Investigación']];
    box.innerHTML = ctl + (st.err ? `<p class="bl-dim warn">${esc(st.err)}</p>` : '') + `<div class="bl-tabs" role="tablist">${tabs.map(([x, l]) => `<button role="tab" class="${st.tab === x ? 'on' : ''}" data-cl="tab" data-k="${x}">${l}</button>`).join('')}</div>`
      + (st.tab === 'res' ? tabResearch() : !s ? `<div class="bd-hero"><div class="bd-hero-ic">${FACE}</div><h3>${c.enabled ? 'Claudio está encendido' : 'Claudio está listo'}</h3><p>${c.enabled ? 'Leyendo el mercado… Empieza sin operaciones y solo decide con velas que cierren después de encenderlo.' : 'Agente autónomo 24/7: investiga, evalúa cada vela con Jev en una sola llamada y opera con capital virtual bajo límites de riesgo fijos.'}</p></div>`
        : st.tab === 'ledger' ? tabLedger(s) : st.tab === 'night' ? tabNight(s) : tabLive(s))
      + '<p class="bl-foot">Simulación con capital virtual: Claudio no envía órdenes reales ni usa tus claves de exchange. Los resultados simulados no garantizan resultados reales. No es asesoría financiera.</p>';
  }
  function view(r, headFn) {
    root = r; head = headFn; r.innerHTML = headFn('Claudio', `Bot · ${RS.CANDIDATES.length} monedas · 1h`, 'lib', '', AV(36)) + '<div class="cl-view"></div>';
    if (!r.__clBound) { r.__clBound = true; r.addEventListener('click', onClick); }
    paint(); if (!st.loaded || Date.now() - st.loaded > 6e4) load();
    clearInterval(timer); timer = setInterval(() => { if (!root || !root.querySelector('.cl-view')) return clearInterval(timer); tick(); }, 5 * 6e4);
  }
  async function onClick(e) {
    const el = e.target.closest('[data-cl]'); if (!el || !root.contains(el) || el.disabled) return; e.preventDefault(); const a = el.dataset.cl;
    if (a === 'tab') { st.tab = el.dataset.k; return paint(); }
    if (a === 'on') { const cap = +prompt('Capital virtual para Claudio (USDT):', String(st.cfg && st.cfg.capital || 10000)); if (!(cap >= 100)) return; return setCfg({enabled: true, kill: false, capital: cap, resetAt: st.s ? Date.now() : (st.cfg && st.cfg.resetAt) || 0}); }
    if (a === 'off') return setCfg({enabled: false});
    if (a === 'kill') { if (!confirm('¿Activar el interruptor de emergencia? Claudio cerrará sus posiciones en la próxima vela y no abrirá nuevas.')) return; return setCfg({kill: true}); }
    if (a === 'unkill') return setCfg({kill: false});
    if (a === 'resume') { if (!confirm('¿Reanudar después del límite de drawdown? El nuevo pico será el patrimonio actual.')) return; return setCfg({resume: Date.now()}); }
    if (a === 'reset') { const cap = +prompt('Reiniciar a Claudio desde cero. Capital virtual (USDT):', String(st.cfg && st.cfg.capital || 10000)); if (!(cap >= 100)) return; return setCfg({enabled: true, kill: false, capital: cap, resetAt: Date.now()}); }
    if (a === 'tick') return tick();
    if (a === 'reload') return load();
  }
  /* Estilos propios (mínimos, sobre las clases de Nova Bot Lab) */
  const css = document.createElement('style'); css.textContent = `
    .cl-card{display:flex;align-items:center;gap:12px;margin:10px 0 12px;padding:14px;border-radius:16px;border:1px solid rgba(124,92,255,.45);background:linear-gradient(120deg,rgba(124,92,255,.16),rgba(32,191,159,.08)),var(--glass,var(--surface));cursor:pointer;transition:transform .2s,border-color .2s}
    .cl-card:hover{transform:translateY(-1px);border-color:#7c5cff}.cl-card-m{flex:1;min-width:0}.cl-card-t{display:flex;align-items:center;gap:8px}.cl-card-t b{font-size:15px}.cl-card small{color:var(--muted);display:block;margin:2px 0 4px}.cl-card-s{font-size:12px}.cl-go{color:#9fb3ff;font-weight:700;font-size:12px}
    .cl-chip{font-size:10px;border-radius:99px;padding:3px 8px;background:var(--raised);color:var(--muted);white-space:nowrap;font-weight:700}.cl-chip.k-on{background:rgba(32,191,159,.16);color:#20bf9f}.cl-chip.k-kill,.cl-chip.k-halt{background:rgba(240,107,121,.16);color:#f06b79}.cl-chip.k-wait{background:rgba(240,185,11,.14);color:#f0b90b}
    .cl-ctl{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin:4px 0 12px}.cl-btns{display:flex;flex-wrap:wrap;gap:6px;width:100%}.cl-btns .bl-btn{margin:0;padding:8px 12px;font-size:12px}.bl-btn.cl-kill{background:#f06b79;border-color:#f06b79}
    .cl-gs{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:6px 0 8px}.cl-g-h{display:flex;justify-content:space-between;align-items:baseline}.cl-g-h i{color:var(--muted);font-style:normal;font-weight:400}.cl-g-b{height:7px;border-radius:9px;background:var(--line);overflow:hidden;margin-top:5px}.cl-g-b i{display:block;height:100%;border-radius:9px;transition:width .5s}
    .cl-curve{display:block;max-width:100%}.cl-dec td small,.bl-t td small{display:block;color:var(--muted);font-size:10px}.cl-why{white-space:normal;min-width:180px;color:var(--muted)}
    .cl-act{font-size:10px;font-weight:800;border-radius:6px;padding:2px 6px;background:var(--raised);color:var(--muted)}.cl-act.a-enter{background:rgba(32,191,159,.18);color:#20bf9f}.cl-act.a-exit{background:rgba(240,185,11,.16);color:#f0b90b}
    .cl-warn{border-color:rgba(240,185,11,.4)!important}.cl-ul{margin:6px 0;padding-left:18px;line-height:1.5;font-size:12.5px}.cl-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.cl-cols h5{margin:6px 0 0;font-size:12px}
    .cl-cand summary{cursor:pointer;display:flex;align-items:center;gap:8px}.cl-cand summary small{color:var(--muted)}.cl-cand summary .cl-chip{margin-left:auto}
    .cl-bins{display:flex;align-items:flex-end;gap:4px;height:90px;margin:8px 0}.cl-bins div{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}.cl-bins i{display:block;width:100%;background:linear-gradient(#7c5cff,#20bf9f);border-radius:4px 4px 0 0;min-height:2px}.cl-bins small{font-size:9px;color:var(--muted)}
    .bd-ev i.cl-ev-entrada{background:#20bf9f}.bd-ev i.cl-ev-cierre{background:#548fff}.bd-ev i.cl-ev-riesgo,.bd-ev i.cl-ev-veto{background:#f06b79}.bd-ev i.cl-ev-escalada{background:#f0b90b}.bd-ev i.cl-ev-nocturno{background:#c084fc}.bd-ev i.cl-ev-inicio,.bd-ev i.cl-ev-datos{background:#8796ab}`;
  document.head.appendChild(css);
  async function toggle() { if (!st.loaded) await load(); const on = !(st.cfg && st.cfg.enabled && !st.cfg.kill); await setCfg(on ? {enabled: true, kill: false, capital: (st.cfg && st.cfg.capital) || 10000} : {enabled: false}); if (typeof UI.onChange === 'function') UI.onChange(); }
  setInterval(() => { if (st.loaded) load(); }, 5 * 6e4); // sigue avanzando aunque el panel esté cerrado
  setTimeout(() => { if (!st.loaded) load(); }, 6000);
  const UI = window.CCTClaudioUI = {card, liveRow, view, state: () => st, load, toggle, isOn: () => !!(st.cfg && st.cfg.enabled && !st.cfg.kill), onChange: null};
})();

/* VORTEX · Radar de Nexus Pixel — busca GRANDES oportunidades en las monedas del Screener y aprende de sus resultados.
   1) Cada hora (al cerrar la vela de 1h, y la de 4h cuando toca) revisa el top 50 por volumen con las señales de Nova Nexus.
   2) Filtros propios: señal reciente (1-2 velas), puntaje, tendencia de la temporalidad mayor, RSI, volumen y relación riesgo/beneficio.
   3) Solo lo que pasa TODO va a la IA (la misma de Nexus Pixel) con el contexto completo; responde si es fuerte, buena, débil o descartar.
   4) Si es fuerte o buena: notificación (app + celular abierto + Discord si lo activaste) y Nexus Pixel sale a contarlo.
   5) Aprende: cada oportunidad se sigue hasta tocar su objetivo o su stop. Con esos resultados ajusta los pesos de cada filtro,
      sube o baja la exigencia mínima y le pasa a la IA un resumen de «lo que ha funcionado y lo que no».
   Funciona mientras VORTEX esté abierta (PC o celular). No es asesoría financiera. Las funciones puras se prueban en tests/radar.test.js. */
(function (root) {
  'use strict';
  const LS = 'cct_radar_v1', TFS = ['1h', '4h'], HTF = {'1h': '4h', '4h': '1d'}, MAX_LOG = 120, EXPIRE_BARS = 48;
  const FEATS = ['fresh', 'score', 'trend', 'rsi', 'volume', 'rr', 'btc'];
  const DEF = {on: false, min: 70, w: Object.fromEntries(FEATS.map(f => [f, 1])), log: [], last: {}, seen: {}};
  const load = () => { try { const o = JSON.parse(localStorage.getItem(LS) || 'null'); return o ? Object.assign({}, DEF, o, {w: Object.assign({}, DEF.w, o.w || {})}) : JSON.parse(JSON.stringify(DEF)); } catch { return JSON.parse(JSON.stringify(DEF)); } };
  let S = typeof localStorage !== 'undefined' ? load() : JSON.parse(JSON.stringify(DEF)), busy = false, timer = 0, status = '';
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch {} cloudSave(); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const base = s => String(s).split('@')[0].replace(/(USDT|USDC|FDUSD)$/, '');

  /* ───────── Indicadores (puros) ───────── */
  function ema(a, n) { const k = 2 / (n + 1), o = []; let e; for (let i = 0; i < a.length; i++) { e = e == null ? a[i] : a[i] * k + e * (1 - k); o.push(e); } return o; }
  function rsi(c, n = 14) { let g = 0, l = 0; const o = Array(c.length).fill(50); for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up / n; l += dn / n; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; } if (i >= n) o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return o; }
  function atr(cs, n = 14) { let a = 0; const o = []; for (let i = 0; i < cs.length; i++) { const k = cs[i], p = cs[i - 1], tr = p ? Math.max(k.h - k.l, Math.abs(k.h - p.c), Math.abs(k.l - p.c)) : k.h - k.l; a = i < n ? (a * i + tr) / (i + 1) : (a * (n - 1) + tr) / n; o.push(a); } return o; }

  /* Filtros: cada uno da 0..1; el puntaje final (0-100) es el promedio ponderado con los pesos aprendidos */
  function evaluate(cs, sig, htf, btcUp) {
    const c = cs.map(k => k.c), last = cs[cs.length - 1], long = sig.side === 'buy', A = atr(cs)[cs.length - 1], R = rsi(c)[c.length - 1];
    const vAvg = cs.slice(-21, -1).reduce((a, k) => a + k.v, 0) / 20, vNow = Math.max(cs[cs.length - 1].v, cs[cs.length - 2].v);
    let trendUp = null; if (htf && htf.length > 210) { const hc = htf.map(k => k.c), e50 = ema(hc, 50), e200 = ema(hc, 200); trendUp = e50[e50.length - 1] > e200[e200.length - 1] && hc[hc.length - 1] > e50[e50.length - 1] ? true : e50[e50.length - 1] < e200[e200.length - 1] && hc[hc.length - 1] < e50[e50.length - 1] ? false : null; }
    const entry = last.c, stop = long ? Math.min(...cs.slice(-6).map(k => k.l)) - A * .3 : Math.max(...cs.slice(-6).map(k => k.h)) + A * .3, risk = Math.abs(entry - stop) || A;
    const target = long ? entry + risk * 2 : entry - risk * 2, room = long ? Math.max(...c.slice(-120)) - entry : entry - Math.min(...c.slice(-120)), rr = room / risk;
    const f = {
      fresh: sig.ago <= 0 ? 1 : sig.ago === 1 ? .8 : sig.ago === 2 ? .45 : 0,
      score: Math.max(0, Math.min(1, (sig.score - 2) / 3)),
      trend: trendUp == null ? .45 : (trendUp === long ? 1 : 0),
      rsi: long ? (R < 35 ? 1 : R < 60 ? .8 : R < 70 ? .4 : 0) : (R > 65 ? 1 : R > 40 ? .8 : R > 30 ? .4 : 0),
      volume: vAvg > 0 ? Math.max(0, Math.min(1, (vNow / vAvg - .8) / 1.2)) : .5,
      rr: Math.max(0, Math.min(1, (rr - 1) / 2)),
      btc: btcUp == null ? .5 : (btcUp === long ? 1 : .2)
    };
    return {f, entry, stop, target, rsi: R, atr: A, trendUp, rr, volX: vAvg > 0 ? vNow / vAvg : 1, risk};
  }
  function scoreOf(f, w) { let s = 0, t = 0; for (const k of FEATS) { const wk = Math.max(.2, w[k] || 1); s += (f[k] || 0) * wk; t += wk; } return Math.round(s / t * 100); }

  /* ───────── Aprendizaje (puro) ───────── */
  function resolve(op, cs) { // cs: velas desde la oportunidad. Devuelve 'win' | 'loss' | 'exp' | null (sigue abierta)
    const long = op.side === 'buy'; let n = 0;
    for (const k of cs) { if (k.t <= op.t) continue; n++; const hitS = long ? k.l <= op.stop : k.h >= op.stop, hitT = long ? k.h >= op.target : k.l <= op.target; if (hitS) return {r: 'loss', at: k.t, px: op.stop}; if (hitT) return {r: 'win', at: k.t, px: op.target}; if (n >= EXPIRE_BARS) { const ok = long ? k.c > op.entry : k.c < op.entry; return {r: ok ? 'exp+' : 'exp-', at: k.t, px: k.c}; } }
    return null;
  }
  function learn(st, op) { // ajusta pesos y exigencia con cada resultado
    const good = op.res === 'win' || op.res === 'exp+', lr = .08;
    for (const k of FEATS) { const v = (op.f || {})[k]; if (v == null) continue; const dir = good ? (v - .5) : (.5 - v); st.w[k] = Math.max(.2, Math.min(3, (st.w[k] || 1) * (1 + lr * dir * 2))); }
    const done = st.log.filter(o => o.res).slice(0, 20); if (done.length >= 8) { const wr = done.filter(o => o.res === 'win' || o.res === 'exp+').length / done.length; if (wr < .45) st.min = Math.min(88, st.min + 2); else if (wr > .6) st.min = Math.max(62, st.min - 1); }
    return st;
  }
  function lessons(st) {
    const done = st.log.filter(o => o.res), n = done.length; if (!n) return 'Aún no hay resultados: es el primer aprendizaje.';
    const wins = done.filter(o => o.res === 'win' || o.res === 'exp+').length, by = (fn, a, b) => { const x = done.filter(fn), y = x.filter(o => o.res === 'win' || o.res === 'exp+').length; return x.length >= 3 ? `${a}: ${y}/${x.length} ganadas` : null; };
    const ws = Object.entries(st.w).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
    return [`Historial del radar: ${wins}/${n} ganadas (${Math.round(wins / n * 100)}%). Exigencia actual ${st.min}/100.`, by(o => (o.f || {}).trend === 1, 'a favor de la tendencia mayor'), by(o => (o.f || {}).trend === 0, 'contra la tendencia mayor'), by(o => o.tf === '1h', 'en 1h'), by(o => o.tf === '4h', 'en 4h'), by(o => (o.ai || 0) >= 80, 'con confianza IA ≥80'), `Pesos aprendidos: ${ws}.`].filter(Boolean).join(' ');
  }

  /* ───────── IA ───────── */
  const SYS = 'Eres Nexus Pixel, analista de trading de VORTEX. Evalúas UNA oportunidad que ya pasó filtros técnicos. Sé exigente: solo «fuerte» si todo el contexto acompaña. Responde SOLO un JSON válido, sin texto extra: {"veredicto":"fuerte|buena|debil|descartar","confianza":0-100,"entrada":numero,"stop":numero,"objetivo":numero,"razon":"máx 220 caracteres en español"}.';
  function buildPrompt(c, st) { // también lo usa el servidor (worker/radar-server.mjs)
    return {sys: SYS, user: `Moneda: ${base(c.symbol)} · temporalidad ${c.tf} · señal Nova Nexus ${c.side === 'buy' ? 'COMPRA (long)' : 'VENTA (short)'} puntaje ${c.sig.score}/5, hace ${c.sig.ago} velas${c.sig.div ? ', con divergencia' : ''}.
Precio ${c.ev.entry}. Stop técnico ${c.ev.stop.toPrecision(6)} · objetivo 2R ${c.ev.target.toPrecision(6)} · espacio hasta el extremo de 120 velas ${c.ev.rr.toFixed(2)}R.
RSI14 ${c.ev.rsi.toFixed(1)} · ATR ${c.ev.atr.toPrecision(4)} · volumen ${c.ev.volX.toFixed(2)}× el promedio · tendencia ${HTF[c.tf]}: ${c.ev.trendUp == null ? 'lateral' : c.ev.trendUp ? 'alcista' : 'bajista'} · BTC ${c.btcUp == null ? 'lateral' : c.btcUp ? 'alcista' : 'bajista'}.
Cambio 24h ${(+c.chg || 0).toFixed(2)}%. Últimos 24 cierres: ${c.closes.map(x => +x.toPrecision(5)).join(', ')}.
Puntaje de filtros ${c.score}/100 (${Object.entries(c.ev.f).map(([k, v]) => k + ' ' + v.toFixed(2)).join(', ')}).
Aprendizaje previo: ${lessons(st)}`};
  }
  async function askAI(c) {
    const L = root.CCTLLM; if (!L) return null; const P = buildPrompt(c, S);
    try { const r = await L.chat([{role: 'system', content: P.sys}, {role: 'user', content: P.user}], {purpose: 'radar', temperature: .2, maxTokens: 300}); return parseAI(r && r.text); } catch { return null; }
  }
  function parseAI(t) { const m = String(t || '').match(/\{[\s\S]*\}/); if (!m) return null; try { const o = JSON.parse(m[0]), v = String(o.veredicto || o.verdict || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return {v: ['fuerte', 'buena', 'debil', 'descartar'].includes(v) ? v : 'debil', conf: Math.max(0, Math.min(100, +o.confianza || 0)), entry: +o.entrada || null, stop: +o.stop || null, target: +o.objetivo || null, why: String(o.razon || '').slice(0, 240)}; } catch { return null; } }

  /* ───────── Ronda ───────── */
  const PUSH_SRV = 'https://vortex-push.soobroon.workers.dev';
  const serverMode = () => !!(root.VortexPush && root.VortexPush.on); // con «Activar notificaciones» (push) el radar trabaja en el servidor, aunque la app y el celular estén cerrados
  let srv = null;
  async function pullServer() { try { const r = await fetch(PUSH_SRV + '/radar/state'); if (r.ok) { srv = await r.json(); paint(); } } catch {} }
  async function run(force) {
    if (serverMode()) { await pullServer(); return; }
    const h = root.CCT_host, SC = root.CCTScreener; if (!S.on || busy || !h || !SC || (typeof document !== 'undefined' && document.hidden && !force)) return;
    busy = true; status = 'Revisando el top 50…'; paint();
    try {
      await followUp(h);
      let btcUp = null; try { const b = await h.klines('BTCUSDT', '4h'), bc = b.map(k => k.c), e50 = ema(bc, 50), e200 = ema(bc, 200); btcUp = e50[e50.length - 1] > e200[e200.length - 1] ? true : e50[e50.length - 1] < e200[e200.length - 1] ? false : null; } catch {}
      const top = await h.top(50), now = Date.now(), cands = [];
      for (const tf of TFS) {
        const ms = tf === '1h' ? 36e5 : 144e5, slot = Math.floor(now / ms); if (!force && S.last[tf] === slot) continue; S.last[tf] = slot;
        let k = 0; const work = async () => { while (k < top.length) { const t = top[k++]; try { const cs = await h.klines(t.symbol, tf), sig = SC.signalOf(cs); if (!sig || sig.range || sig.ago > 2) continue; const key = `${t.symbol}|${tf}|${cs[cs.length - 1 - sig.ago].t}`; if (S.seen[key]) continue; let htf = null; try { htf = await h.klines(t.symbol, HTF[tf]); } catch {} const ev = evaluate(cs, sig, htf, btcUp), score = scoreOf(ev.f, S.w); if (score >= S.min) cands.push({symbol: t.symbol, tf, sig, side: sig.side, ev, score, key, chg: t.chg, btcUp, closes: cs.slice(-24).map(x => x.c), t: cs[cs.length - 1].t}); } catch {} } };
        await Promise.all(Array.from({length: 4}, work));
      }
      cands.sort((a, b) => b.score - a.score);
      let sent = 0;
      for (const c of cands.slice(0, 4)) {
        status = `La IA revisa ${base(c.symbol)} (${c.tf})…`; paint();
        const ai = await askAI(c); S.seen[c.key] = now;
        if (!ai || !(ai.v === 'fuerte' || ai.v === 'buena') || ai.conf < 70) continue;
        const op = {id: 'r' + now.toString(36) + sent, symbol: c.symbol, tf: c.tf, side: c.side, t: c.t, at: now, entry: c.ev.entry, stop: sane(ai.stop, c, 'stop'), target: sane(ai.target, c, 'target'), score: c.score, ai: ai.conf, v: ai.v, why: ai.why, f: c.ev.f};
        S.log.unshift(op); S.log = S.log.slice(0, MAX_LOG); sent++; notify(op);
      }
      for (const k of Object.keys(S.seen)) if (now - S.seen[k] > 3 * 864e5) delete S.seen[k];
      status = `Última revisión ${new Date().toLocaleTimeString('es-MX', {hour: '2-digit', minute: '2-digit'})} · ${cands.length} candidata${cands.length === 1 ? '' : 's'} pasaron los filtros · ${sent} gran${sent === 1 ? '' : 'des'} oportunidad${sent === 1 ? '' : 'es'}`;
    } catch (e) { status = 'No pude revisar ahora: ' + (e && e.message || e); }
    finally { busy = false; save(); paint(); }
  }
  const sane = (v, c, k) => { const long = c.side === 'buy', e = c.ev.entry; if (!(v > 0)) return c.ev[k]; if (k === 'stop' && (long ? v >= e : v <= e)) return c.ev.stop; if (k === 'target' && (long ? v <= e : v >= e)) return c.ev.target; return v; };
  async function followUp(h) { // revisa cómo terminaron las oportunidades abiertas y aprende
    for (const op of S.log.filter(o => !o.res).slice(0, 12)) {
      try { const cs = await h.klines(op.symbol, op.tf), r = resolve(op, cs); if (r) { op.res = r.r; op.resAt = r.at; op.resPx = r.px; learn(S, op); } } catch {}
    }
  }
  function notify(op) {
    const H = root.CCT_radarHost, long = op.side === 'buy', title = `${op.v === 'fuerte' ? 'Gran oportunidad' : 'Buena oportunidad'} · ${base(op.symbol)} ${long ? 'LONG' : 'SHORT'} ${op.tf}`;
    const body = `Entrada ~${fmt(op.entry)} · stop ${fmt(op.stop)} · objetivo ${fmt(op.target)} · confianza IA ${op.ai}%. ${op.why}`;
    if (H) H.notify(title, body, 'radar-' + op.id);
    if (H && H.discord()) try { root.CCTDiscord && root.CCTDiscord.send([{title: '🛰️ ' + title, description: body + '\n_No es asesoría financiera._', color: long ? 0x089981 : 0xf23645, footer: {text: 'VORTEX · Radar de Nexus Pixel'}, timestamp: new Date().toISOString()}]); } catch {}
    try { if (root.NexusPixel && root.NexusPixel.say) root.NexusPixel.say(`¡Encontré algo! ${base(op.symbol)} ${long ? 'LONG' : 'SHORT'} en ${op.tf}: ${op.why}`); } catch {}
  }
  const fmt = v => { v = +v; if (!Number.isFinite(v)) return '—'; const a = Math.abs(v); return v.toLocaleString('en-US', {maximumFractionDigits: a >= 1000 ? 1 : a >= 1 ? 3 : 6}); };

  /* ───────── Pantalla (Alertas › Historial) ───────── */
  function paint() {
    const box = typeof document !== 'undefined' && document.getElementById('radarBox'); if (!box) return;
    const R = serverMode() && srv && Array.isArray(srv.log) ? srv : S, LOG = R.log || [], done = LOG.filter(o => o.res), wins = done.filter(o => o.res === 'win' || o.res === 'exp+').length;
    const lbl = {win: 'Objetivo', loss: 'Stop', 'exp+': 'Cerró a favor', 'exp-': 'Cerró en contra'};
    box.innerHTML = `<div class="section-label">RADAR DE NEXUS PIXEL</div>`
      + (S.on ? `<p class="small-note">${serverMode() ? 'Trabaja en el servidor cada hora, aunque la app y el celular estén cerrados' + (srv && srv.at ? ' · última revisión ' + new Date(srv.at).toLocaleString('es-MX', {hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short'}) + (srv.note ? ' · ' + esc(srv.note) : '') : '') : esc(status || 'Revisa cada hora las 50 monedas con más volumen (con la app abierta; activa las notificaciones para que trabaje en el servidor).')}${done.length ? ` · Aprendizaje: ${wins}/${done.length} ganadas · exigencia ${R.min || S.min}/100` : ''}</p>` : '<p class="small-note">Apagado. Enciéndelo en Configuración › Avisos › «Grandes oportunidades».</p>')
      + LOG.slice(0, 10).map(o => `<div class="setting-row move-row ${o.side === 'buy' ? 'up' : 'down'}"><div><b>${esc(base(o.symbol))} ${o.side === 'buy' ? 'LONG' : 'SHORT'} · ${esc(o.tf)} · IA ${o.ai}%${o.res ? ` · <span class="${o.res === 'win' || o.res === 'exp+' ? 'positive' : 'negative'}">${lbl[o.res]}</span>` : ' · en curso'}</b><small>${new Date(o.at).toLocaleString('es-MX', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'})} · entrada ${fmt(o.entry)} · stop ${fmt(o.stop)} · objetivo ${fmt(o.target)} · ${esc(o.why)}</small></div></div>`).join('')
      + (S.on ? `<button type="button" class="small-button" data-radar-now ${busy ? 'disabled' : ''}>${busy ? 'Revisando…' : 'Revisar ahora'}</button>` : '');
  }
  async function cloudSave() { const C = root.CCTCloudPriv; if (!C || !C.ready()) return; clearTimeout(cloudSave.t); cloudSave.t = setTimeout(() => C.set('radar', {s: JSON.stringify({on: S.on, min: S.min, w: S.w, log: S.log.slice(0, 60)}), at: Date.now()}).catch(() => {}), 3000); }
  async function cloudLoad() { const C = root.CCTCloudPriv; if (!C || !C.ready()) return; try { const d = await C.get('radar'), o = d && d.s ? JSON.parse(d.s) : null; if (o && Array.isArray(o.log) && o.log.length >= S.log.length) { S = Object.assign(S, {min: o.min || S.min, w: Object.assign({}, S.w, o.w), log: o.log}); if (o.on && !S.on) S.on = true; localStorage.setItem(LS, JSON.stringify(S)); paint(); start(); } } catch {} }
  function start() { clearInterval(timer); if (!S.on) return; timer = setInterval(() => run(false), 5 * 60e3); setTimeout(() => run(false), 20e3); }
  function setOn(on) { S.on = !!on; save(); start(); paint(); try { root.VortexPush && root.VortexPush.sync(true); } catch {} if (on) setTimeout(() => run(true), 1500); }
  if (typeof document !== 'undefined') { document.addEventListener('click', e => { if (e.target.closest('[data-radar-now]')) run(true); }); setTimeout(() => { paint(); start(); }, 4000); }
  const api = {on: () => !!S.on, setOn, run, paint, cloudLoad, evaluate, scoreOf, resolve, learn, lessons, parseAI, buildPrompt, ema, FEATS, HTF, DEF, _state: () => S};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTRadar = api;
})(typeof self !== 'undefined' ? self : this);

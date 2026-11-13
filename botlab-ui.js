/* NOVA BOT LAB · interfaz. Usa botlab-engine.js (motor real de backtest) y llm.js (IA con modelos abiertos y gratuitos).
   Todo lo que se muestra sale de backtests reales sobre velas cerradas de Binance; sin datos suficientes se dice claramente. Fase 1: backtest + validación por tramos + biblioteca + gráfico.
   No ejecuta órdenes reales ni toca fondos. */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search)) return;
  const B = window.CCTBotLab, LLM = window.CCTLLM; if (!B) return;
  const $ = (s, e) => (e || document).querySelector(s), $$ = (s, e) => [...(e || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const H = new Proxy({}, {get: (_, k) => (window.CCT_bot || {})[k]}), uidOf = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const num = (x, d = 2) => x == null || !Number.isFinite(x) ? '—' : (+x).toLocaleString('es', {maximumFractionDigits: d, minimumFractionDigits: 0}), money = x => x == null ? '—' : (x < 0 ? '−' : '') + '$' + num(Math.abs(x), 2), pct = (x, d = 1) => x == null || !Number.isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + num(Math.abs(x), d) + ' %', pf = m => m.pfInf ? '∞' : m.profitFactor == null ? '—' : num(m.profitFactor, 2);
  const cls = x => x > 0 ? 'pos' : x < 0 ? 'neg' : '', dt = t => new Date(t).toLocaleString('es', {dateStyle: 'short', timeStyle: 'short'}), dd = t => new Date(t).toLocaleDateString('es', {day: '2-digit', month: 'short', year: '2-digit'});
  const ICON = d => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {back: ICON('<path d="M15 6l-6 6 6 6"/>'), plus: ICON('<path d="M12 5v14M5 12h14"/>'), expand: ICON('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'), shrink: ICON('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'), robot: ICON('<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V4.5"/><circle cx="9.3" cy="13" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.7" cy="13" r="1.2" fill="currentColor" stroke="none"/><path d="M9.5 16.5h5"/>'), play: ICON('<path d="M7 5l12 7-12 7z"/>'), pause: ICON('<path d="M8 5v14M16 5v14"/>'), step: ICON('<path d="M6 5l9 7-9 7zM18 5v14"/>')};

  /* ───────── Almacenamiento (local + cuenta) ───────── */
  let S = {v: 1, bots: [], deleted: {}, risk: null}, cloudTimer = 0, cloudStr = '';
  let cloudFn = null; // si cierras la app justo después de cambiar un bot, el cambio sube a tu cuenta al instante (no se pierde)
  const flushCloud = () => { if (cloudTimer && cloudFn) { clearTimeout(cloudTimer); cloudTimer = 0; cloudFn(); } };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushCloud(); }); window.addEventListener('pagehide', flushCloud);
  const readLocal = () => { try { const o = JSON.parse(localStorage.getItem(H.key ? H.key() : 'cct_botlab_v1') || 'null'); if (o && Array.isArray(o.bots)) return o; } catch {} return {v: 1, bots: [], deleted: {}}; };
  function merge(a, b) { // une dos copias: gana la versión más reciente de cada bot; los borrados se respetan
    const del = Object.assign({}, a.deleted, b.deleted), map = new Map(); for (const x of [...a.bots, ...b.bots]) { const y = map.get(x.id); if (!y || (x.updatedAt || 0) > (y.updatedAt || 0)) map.set(x.id, x); }
    const ra = a.risk, rb = b.risk, risk = !ra ? rb : !rb ? ra : ((rb.updatedAt || 0) > (ra.updatedAt || 0) ? rb : ra);
    const ca = a.claudio, cb = b.claudio, CK = window.CCTClaudio, claudio = !ca ? cb : !cb ? ca : {cfg: ((cb.cfg || {}).at || 0) > ((ca.cfg || {}).at || 0) ? cb.cfg : ca.cfg, s: CK ? CK.newer(ca.s, cb.s) : ca.s};
    return dedupe({v: 1, bots: [...map.values()].filter(x => !(del[x.id] >= (x.updatedAt || 0))), deleted: del, risk: risk || null, claudio: claudio || null, seeded: Object.assign({}, a.seeded, b.seeded)});
  }
  /* Bots repetidos: los bots que crea Nova Bot Lab (Seguro, Nova v2.7, Lucas…) se creaban otra vez cuando un dispositivo los sembraba antes de recibir los de tu cuenta.
     Se queda UNO por plantilla (el que más ha operado en simulado; si empatan, el más antiguo) y los demás se marcan como borrados en todos tus dispositivos. */
  function dedupe(o) {
    const act = b => (b.paper || []).reduce((n, x) => n + ((x.ledger || []).length), 0), by = new Map(), now = Date.now(); let gone = 0;
    for (const b of o.bots) { if (!b.preset) continue; const k = b.preset, y = by.get(k); if (!y) { by.set(k, b); continue; }
      const keep = act(b) > act(y) || (act(b) === act(y) && (b.createdAt || 0) < (y.createdAt || 0)) ? b : y, drop = keep === b ? y : b; by.set(k, keep); o.deleted[drop.id] = Math.max(now, (drop.updatedAt || 0) + 1); gone++; }
    if (gone) o.bots = o.bots.filter(b => !o.deleted[b.id] || o.deleted[b.id] < (b.updatedAt || 0));
    return o;
  }
  window.CCTBotLabSave = () => save(); // al cambiar el interruptor de Discord, se recalcula a dónde avisan los bots
  function save() {
    try { const D = window.CCT_discordStore && window.CCT_discordStore.get(); S.notify = D && D.url && !(window.CCT_discordOn && !window.CCT_discordOn()) ? {url: D.url, bots: (D.on || {}).bots !== false} : null; } catch {}
    const str = JSON.stringify(S); try { localStorage.setItem(H.key ? H.key() : 'cct_botlab_v1', str); } catch { H.toast && H.toast('No se pudo guardar en este dispositivo (almacenamiento lleno)'); }
    clearTimeout(cloudTimer); cloudTimer = setTimeout(cloudFn = async () => { cloudTimer = 0; const c = H.cloud && H.cloud(); if (!c) return; const s2 = cloudCopy(); if (s2 === cloudStr) return; if (s2.length > 990000) { if (!save.warned) { save.warned = 1; toast('Tus bots ocupan demasiado para guardarse completos en tu cuenta: archiva o elimina algunos.'); } return; } try { await c.set(s2); cloudStr = s2; save.warned = 0; } catch (e) { if (!save.err) { save.err = 1; toast('No se pudieron guardar tus bots en tu cuenta: ' + (e.message || e)); } } }, 1500);
  }
  /* Copia ligera para tu cuenta: guarda TODO lo que importa (versiones, ediciones, consejos aplicados, simulaciones, apariencia, historial) y recorta lo que se puede recalcular (detalle de backtests viejos). */
  function cloudCopy() {
    const lite = (lvl) => JSON.stringify(Object.assign({}, S, {bots: S.bots.map(b => { const main = runOf(b); return Object.assign({}, b, {chat: (b.chat || []).slice(-30), journal: (b.journal || []).slice(-150),
      runs: (b.runs || []).slice(-6).map(r => r === main && lvl < 2 ? Object.assign({}, r, {trades: r.trades.slice(-(lvl ? 120 : 400)), avoid: (r.avoid || []).slice(-(lvl ? 40 : 300))}) : Object.assign({}, r, {trades: [], avoid: [], bh: [], equity: r === main ? r.equity : []})),
      paper: (b.paper || []).map(x => Object.assign({}, x, {ledger: x.ledger.slice(-(lvl ? 150 : 400)), curve: x.curve.slice(-(lvl ? 200 : 400))}))}); })}));
    let str = lite(0); if (str.length > 900000) str = lite(1); if (str.length > 900000) str = lite(2); return str;
  }
  async function pullCloud() {
    const c = H.cloud && H.cloud(); if (!c) return; let got = false; try { const str = await c.get(); got = true; if (str) { cloudStr = str; const m = merge(readLocal(), JSON.parse(str)); S = m; save(); } } catch {}
    try { if (c.server) { const r = await c.server(); if (r) { mergeServer(r.results); mergePaper(r.paper); } } } catch {} if (got) { seedSafe(); fixNov26(); seedLucas(); learnOn(); fixQuick(); seedPachita(); healBots(); } if (view === 'lib') render();
  }

  /* ───────── Modelo de bot ───────── */
  const ST = {draft: 'Borrador', tested: 'Probado', paused: 'Pausado', archived: 'Archivado', running: 'Evaluando'};
  const CHECK = '<svg viewBox="0 0 36 36" width="30" height="30"><circle cx="18" cy="18" r="15" fill="none" stroke="#20bf9f" stroke-width="3" class="ck-c"/><path d="M11 18.5l5 5 9-10" fill="none" stroke="#20bf9f" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" class="ck-p"/></svg>';
  const LK = window.CCTBotLook, CO = window.CCTBotCoach; let newLook = null, tchart = null, freshV = null; // freshV: aviso «nueva versión aplicada» visible solo hasta que cambias de pestaña o de vista
  const lookOf = b => LK ? LK.of(b) : {color: '#548fff', icon: 'planeta'}, avOf = (b, sz) => LK ? LK.avatar(lookOf(b), sz) : '';
  const tipsOf = b => { try { return CO && b.status !== 'archived' ? CO.tips(mainSpec(b), runOf(b), b.sweeps).filter(t => !ignoredTip(b, t)) : []; } catch { return []; } }; // sin los consejos que ignoraste
  function newBot(spec, method, desc) {
    const now = Date.now(); const sp = B.normalizeSpec(spec);
    const id = uidOf(), look = newLook ? Object.assign({}, newLook) : (LK ? LK.of({id}) : null); newLook = null;
    return {id, look, name: sp.name, desc: desc || '', status: 'draft', method, createdAt: now, updatedAt: now, lastRunAt: null, mainV: 1,
      versions: [{v: 1, spec: sp, at: now, note: 'Versión inicial', origin: 'usuario', state: 'principal'}], runs: [], chat: [], journal: [{t: now, kind: 'creación', text: `Bot creado (${method === 'nl' ? 'lenguaje natural' : method === 'nova' ? 'indicadores Nova' : method === 'indicador' ? 'un indicador propio' : 'constructor visual'}).`}], sweeps: {}};
  }
  const ver = (bot, v) => bot.versions.find(x => x.v === (v || bot.mainV)), mainSpec = bot => ver(bot).spec;
  const runOf = (bot, v) => { for (let i = bot.runs.length - 1; i >= 0; i--) if (bot.runs[i].v === (v || bot.mainV)) return bot.runs[i]; return null; };
  const log = (bot, kind, text) => { bot.journal.push({t: Date.now(), kind, text}); if (bot.journal.length > 300) bot.journal.splice(0, bot.journal.length - 300); };
  const touch = bot => { bot.updatedAt = Date.now(); save(); };
  const getBot = id => S.bots.find(b => b.id === id);

  /* ───────── Datos y ejecución ───────── */
  const histCache = new Map();
  async function candlesFor(sym, itv, bars) { const k = sym + '|' + itv + '|' + bars, h = histCache.get(k); if (h && Date.now() - h.at < 300e3) return h.c; const c = await H.history(sym, itv, bars); histCache.set(k, {at: Date.now(), c}); return c; }
  const compact = (arr, n) => { if (arr.length <= n) return arr; const out = [], k = (arr.length - 1) / (n - 1); for (let i = 0; i < n; i++) out.push(arr[Math.round(i * k)]); return out; };
  function summarize(res, v, bars) {
    return {id: uidOf(), v, at: Date.now(), avoid: (res.avoid || []).slice(-300), symbol: res.symbol, interval: res.interval, bars: res.bars, reqBars: bars, from: res.from, to: res.to, metrics: res.metrics, segments: res.segments, verdict: res.verdict, buyHold: res.buyHold, daily: res.daily, breakdown: res.breakdown, warnings: res.warnings, halted: res.halted,
      trades: res.trades.slice(-400).map(t => ({id: t.id, side: t.side, entryT: t.entryT, exitT: t.exitT, entry: t.entry, exit: t.exit, sl: t.sl, tp: t.tp, net: t.net, fees: t.fees, r: t.r, bars: t.bars, why: t.why, reasonIn: t.reasonIn, ctx: t.ctx, open: t.open})), tradesTotal: res.trades.length,
      equity: compact(res.equity, 240).map(p => [p.t, Math.round(p.e * 100) / 100]), bh: (res.bhCurve || []).map(p => [p[0], Math.round(p[1] * 100) / 100]), ext: ext(res)};
  }
  /* ───────── Indicadores del usuario (Pine) → señales por vela ───────── */
  const NAN = NaN, userCache = new Map();
  const extractSources = (res, n) => window.CCTBotOpt.extractSources(res, n);
  async function userSources(sid, sym, itv, bars) { // ejecuta el script del usuario sobre el historial (no toca el gráfico)
    const candles = await candlesFor(sym, itv, bars), key = [sid, sym, itv, candles.length, candles[candles.length - 1].t].join('|'), hit = userCache.get(key); if (hit) return hit;
    if (!H.runPine) throw new Error('Esta versión no puede ejecutar indicadores propios'); const res = await H.runPine(sid, sym, itv, candles);
    if (!res || !res.ok) throw new Error('Tu indicador no se pudo ejecutar: ' + ((res && res.error && res.error.msg) || 'error desconocido')); const r = {sources: extractSources(res, candles.length), warnings: res.warnings || [], complete: res.complete !== false, n: candles.length}; userCache.set(key, r); if (userCache.size > 12) userCache.delete(userCache.keys().next().value); return r;
  }
  const userOps = sp => { const o = []; for (const g of [sp.entry, sp.exit]) for (const side of ['long', 'short']) for (const c of g[side] || []) for (const x of [c.a, c.b]) if (x && x.k === 'user') o.push(x); return o; };
  async function execute(spec, bars, extra) { // descarga velas cerradas y corre el backtest (en el navegador, sin tocar el gráfico)
    const sp = B.normalizeSpec(spec);
    if (Array.isArray(sp.basket) && sp.basket.length) { if (userOps(sp).length) throw new Error('Una cesta de monedas no puede usar tus indicadores propios (aún)'); const by = {}; for (const sym of sp.basket) by[sym] = await candlesFor(sym, sp.interval, bars); await new Promise(r => setTimeout(r, 20)); return B.backtestBasket(by, sp, Object.assign({nova: window.NovaNexus}, extra || {})); }
    const candles = await candlesFor(sp.symbol, sp.interval, bars); if (candles.length < 60) throw new Error(`Binance devolvió solo ${candles.length} velas de ${sp.symbol} ${sp.interval}`);
    const uo = userOps(sp), user = {}, uw = []; for (const sid of [...new Set(uo.map(x => x.sid))]) { const r = await userSources(sid, sp.symbol, sp.interval, bars); for (const x of uo.filter(y => y.sid === sid)) { const f = window.CCTBotOpt.pickSource(r.sources, x, r.n); if (!f) throw new Error(`Tu indicador «${x.sname || sid}» ya no tiene la línea «${x.sl || x.src}» en ${sp.symbol} ${sp.interval}`); if (f.none) uw.push(`La señal «${x.sl || x.src}» de tu indicador no apareció en estas velas.`); user[sid + '|' + x.src] = f.series; } if (!r.complete) uw.push(`Tu indicador «${(uo.find(y => y.sid === sid) || {}).sname || sid}» no se pudo ejecutar por completo (funciones no soportadas): sus señales pueden faltar.`); }
    await new Promise(r => setTimeout(r, 20)); const res = B.backtest(candles, sp, Object.assign({nova: window.NovaNexus, user}, extra || {})); if (uo.length) res.warnings.push(...uw, `Este bot usa tu indicador «${uo[0].sname || uo[0].sid}». Cada señal se toma en la vela donde nace, sin mirar al futuro, pero el laboratorio no puede comprobar que tu script no repinte ni que no use datos futuros (por ejemplo con request.security). Confírmalo en paper trading antes de fiarte del resultado.`); const t0 = res.equity[0].t, cs = candles.filter(c => c.t >= t0); if (cs.length) res.bhCurve = compact(cs.map(c => [c.t, sp.risk.capital * c.c / cs[0].o]), 240); return res;
  }
  async function runBot(bot, v, bars) {
    const vv = ver(bot, v), prevSt = bot.status; bot.status = 'running'; save(); render();
    try { const res = await execute(vv.spec, bars), run = summarize(res, vv.v, bars); bot.runs.push(run); if (bot.runs.length > 12) bot.runs.splice(0, bot.runs.length - 12); for (let i = 0; i < bot.runs.length - 3; i++) { bot.runs[i].trades = bot.runs[i].trades.slice(0, 0); bot.runs[i].equity = []; } // solo las 3 últimas guardan el detalle
      bot.status = prevSt === 'paused' || prevSt === 'archived' ? prevSt : 'tested'; bot.lastRunAt = Date.now();
      log(bot, 'backtest', `Backtest v${vv.v}: ${run.metrics.n} operaciones, neto ${money(run.metrics.net)} (${pct(run.metrics.retPct)}), drawdown ${num(run.metrics.maxDDPct, 1)} %. ${run.verdict.text}`); touch(bot); return run;
    } catch (e) { bot.status = prevSt === 'running' ? 'draft' : prevSt; touch(bot); throw e; }
  }

  /* ───────── Estado de la interfaz ───────── */
  let root, view = 'lib', cur = null, tab = 'sum', wide = false, sel = new Set(), showArch = false, draft = null, draftMeta = null, nl = {hist: [], spec: null, busy: false, msgs: []}, replay = {on: false, timer: 0, t: null, speed: 1, seg: 'all', show: {arrows: true, levels: true, avoid: true}}, cmp = null, busyMsg = '', toastT = 0;
  const note = (t, c) => `<p class="bl-dim ${c || ''}">${esc(t)}</p>`;
  const toast = m => { if (H.toast) H.toast(m); };
  const bot = () => getBot(cur);

  /* ───────── Gráficos (canvas) ───────── */
  function css(n, d) { return getComputedStyle(document.body).getPropertyValue(n).trim() || d; }
  function prep(cv) { const w = cv.clientWidth || 300, h = +cv.dataset.h || 150, d = window.devicePixelRatio || 1; cv.width = w * d; cv.height = h * d; const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h); return {g, w, h}; }
  function lineChart(cv, series, o) {
    o = o || {}; const {g, w, h} = prep(cv), pad = {l: 44, r: 8, t: 8, b: 18}, pts = series.flatMap(s => s.pts); if (!pts.length) return;
    let x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1])); if (o.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); } if (y0 === y1) { y0 -= 1; y1 += 1; } const X = x => pad.l + (x - x0) / ((x1 - x0) || 1) * (w - pad.l - pad.r), Y = y => pad.t + (y1 - y) / (y1 - y0) * (h - pad.t - pad.b), mu = css('--muted', '#8a93a6'), ln = css('--line', '#242b3a');
    g.font = '10px system-ui'; g.fillStyle = mu; g.strokeStyle = ln; g.lineWidth = 1; for (let i = 0; i <= 3; i++) { const y = y0 + (y1 - y0) * i / 3, py = Y(y); g.beginPath(); g.moveTo(pad.l, py); g.lineTo(w - pad.r, py); g.stroke(); g.textAlign = 'right'; g.fillText((o.yfmt || num)(y), pad.l - 4, py + 3); }
    g.textAlign = 'center'; [0, .5, 1].forEach(f => { g.fillText(dd(x0 + (x1 - x0) * f), pad.l + (w - pad.l - pad.r) * f, h - 4); });
    for (const s of series) { g.strokeStyle = s.color; g.lineWidth = s.w || 1.6; g.setLineDash(s.dash || []); g.beginPath(); s.pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.stroke(); g.setLineDash([]); if (s.fill) { g.lineTo(X(s.pts[s.pts.length - 1][0]), Y(o.zero ? 0 : y0)); g.lineTo(X(s.pts[0][0]), Y(o.zero ? 0 : y0)); g.closePath(); g.globalAlpha = .12; g.fillStyle = s.color; g.fill(); g.globalAlpha = 1; } }
  }
  function barChart(cv, bars, o) {
    o = o || {}; const {g, w, h} = prep(cv), pad = {l: 44, r: 8, t: 8, b: 30}; if (!bars.length) return; const mu = css('--muted', '#8a93a6'), ln = css('--line', '#242b3a'); let y0 = Math.min(0, ...bars.map(b => b.v)), y1 = Math.max(0, ...bars.map(b => b.v)); if (y0 === y1) y1 = y0 + 1; const Y = y => pad.t + (y1 - y) / (y1 - y0) * (h - pad.t - pad.b), bw = (w - pad.l - pad.r) / bars.length;
    g.font = '10px system-ui'; g.fillStyle = mu; g.strokeStyle = ln; for (let i = 0; i <= 2; i++) { const y = y0 + (y1 - y0) * i / 2, py = Y(y); g.beginPath(); g.moveTo(pad.l, py); g.lineTo(w - pad.r, py); g.stroke(); g.textAlign = 'right'; g.fillText((o.yfmt || num)(y), pad.l - 4, py + 3); }
    bars.forEach((b, i) => { const x = pad.l + i * bw + bw * .15, bw2 = bw * .7, yy = Y(b.v), y00 = Y(0); g.fillStyle = b.color || (b.v >= 0 ? '#17c964' : '#f31260'); g.fillRect(x, Math.min(yy, y00), bw2, Math.max(1, Math.abs(yy - y00))); g.fillStyle = mu; g.textAlign = 'center'; if (bars.length <= 14) g.fillText(String(b.label).slice(0, 9), x + bw2 / 2, h - 16); if (b.sub) g.fillText(b.sub, x + bw2 / 2, h - 5); });
  }
  const chartBox = (id, title, h, hint) => `<div class="bl-chart"><h4>${esc(title)}</h4>${hint ? note(hint) : ''}<canvas id="${id}" data-h="${h || 150}" style="width:100%;height:${h || 150}px"></canvas></div>`;

  /* ───────── Vistas ───────── */
  const head = (title, sub, back, extra, av) => `<div class="bl-head">${back ? `<button class="bl-ib" data-a="${back}" aria-label="Volver">${IC.back}</button>` : `<span class="bl-logo">${IC.robot}</span>`}${av || ''}<div class="bl-title"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>${extra || ''}<button class="bl-ib bl-exp" data-a="wide" aria-label="${wide ? 'Reducir' : 'Expandir'}" title="${wide ? 'Volver al tamaño normal' : 'Expandir el laboratorio'}">${wide ? IC.shrink : IC.expand}</button></div>`;
  const desk = () => matchMedia('(min-width:1024px)').matches; // Nova Bot Lab es solo para la versión de PC
  function render() {
    if (!root || !desk()) return; stopReplayIf(); const keep = root.scrollTop; document.body.classList.toggle('botlab-wide', wide && matchMedia('(min-width:1024px)').matches); // antes de dibujar: las gráficas del dashboard usan el ancho real
    if (view === 'lib') libView(); else if (view === 'new') newView(); else if (view === 'edit') editView(); else if (view === 'bot') botView(); else if (view === 'tourn') tournView(); else if (view === 'cmp') cmpView(); else if (view === 'risk') riskView(); else if (view === 'claudio' && window.CCTClaudioUI) window.CCTClaudioUI.view(root, head);
    root.scrollTop = view === 'lib' ? keep : root.scrollTop; document.body.classList.toggle('botlab-wide', wide && matchMedia('(min-width:1024px)').matches);
  }
  const stopReplayIf = () => { if (replay.timer && view !== 'bot') { clearInterval(replay.timer); replay.timer = 0; replay.on = false; } };

  function miniStats(b) { const r = runOf(b); if (!r) return '<span class="bl-dim">Sin pruebas todavía</span>'; const m = r.metrics; return `<span class="${cls(m.net)}">${pct(m.retPct)}</span> · ${m.n} op. · aciertos ${m.winRate == null ? '—' : num(m.winRate, 0) + ' %'} · DD ${num(m.maxDDPct, 1)} %`; }
  /* ───────── Dashboard visual (arriba de la biblioteca): KPIs, curvas de capital interactivas, ranking, riesgo vs. retorno, paper en vivo y actividad ─────────
     Todo sale de los backtests y sesiones de paper guardados; no inventa datos. Pasa el cursor (o el dedo) por las gráficas para ver los valores. */
  const PAL = ['#548fff', '#20bf9f', '#f0b90b', '#c084fc', '#f06b79', '#38bdf8', '#fb923c', '#a3e635', '#f472b6', '#2dd4bf'];
  const dash = {mode: 'bt', off: new Set(), ser: []};
  const colOf = id => { const b = S.bots.find(x => x.id === id); if (b && LK) return lookOf(b).color; const i = S.bots.findIndex(x => x.id === id); return PAL[(i < 0 ? 0 : i) % PAL.length]; };
  function dashSeries() {
    const out = [];
    for (const b of S.bots) {
      if (b.status === 'archived') continue; const col = colOf(b.id);
      if (dash.mode === 'bt') { const r = runOf(b); if (!r || !r.equity || r.equity.length < 2) continue; const cap = ((mainSpec(b).risk || {}).capital) || r.equity[0][1] || 1; out.push({k: b.id, id: b.id, name: b.name, col, m: r.metrics, pts: r.equity.map(p => [p[0], (p[1] / cap - 1) * 100])}); }
      else for (const s of b.paper || []) { if (!s.curve || s.curve.length < 2 || s.status === 'stopped') continue; const st = PP() ? PP().stats(s) : null; out.push({k: s.id, id: b.id, name: b.name + ((b.paper || []).length > 1 ? ' · v' + s.v : ''), col, m: st, sess: s, pts: s.curve.map(p => [p[0], (p[1] / s.capital - 1) * 100])}); }
    }
    return out;
  }
  const ring = (v, col) => { const p = Math.max(0, Math.min(100, v || 0)), c = 2 * Math.PI * 15; return `<svg class="bd-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15" fill="none" stroke="var(--line)" stroke-width="5"/><circle cx="20" cy="20" r="15" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 20 20)"/></svg>`; };
  /* Curvas suaves (estilo TradingView): se promedia el ruido escalonado y se traza con curvas monótonas (sin pasarse de los valores reales) */
  const thinXY = (xy, n) => { if (xy.length <= n) return xy; const o = [], k = xy.length / n; for (let i = 0; i < n; i++) { const a = Math.floor(i * k), b = Math.max(a + 1, Math.floor((i + 1) * k)); let sx = 0, sy = 0; for (let j = a; j < b; j++) { sx += xy[j][0]; sy += xy[j][1]; } o.push([sx / (b - a), sy / (b - a)]); } o[0] = xy[0]; o[o.length - 1] = xy[xy.length - 1]; return o; };
  function smoothD(xy) {
    const n = xy.length; if (n < 3) return xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    const dx = [], m = [], t = []; for (let i = 0; i < n - 1; i++) { dx.push(xy[i + 1][0] - xy[i][0] || 1e-6); m.push((xy[i + 1][1] - xy[i][1]) / dx[i]); }
    t[0] = m[0]; t[n - 1] = m[n - 2]; for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : 3 * (dx[i - 1] + dx[i]) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
    let d = 'M' + xy[0][0].toFixed(1) + ' ' + xy[0][1].toFixed(1); for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += `C${(xy[i][0] + h).toFixed(1)} ${(xy[i][1] + t[i] * h).toFixed(1)} ${(xy[i + 1][0] - h).toFixed(1)} ${(xy[i + 1][1] - t[i + 1] * h).toFixed(1)} ${xy[i + 1][0].toFixed(1)} ${xy[i + 1][1].toFixed(1)}`; } return d;
  }
  let gradN = 0;
  const spark = (pts, col, w = 120, h = 34) => { if (!pts || pts.length < 2) return ''; const ys = pts.map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1, X = t => (t - t0) / (t1 - t0 || 1) * w, Y = v => h - 2 - (v - lo) / (hi - lo || 1) * (h - 4); const d = smoothD(thinXY(pts.map(p => [X(p[0]), Y(p[1])]), 30)); return `<svg class="bd-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}L${w} ${h}L0 ${h}Z" fill="${col}" opacity=".14"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`; };
  function eqChart(W, H) {
    const vis = dash.ser.filter(x => !dash.off.has(x.k)); if (!vis.length) return `<div class="bd-empty">${dash.ser.length ? 'Activa algún bot en la leyenda para ver su curva.' : dash.mode === 'bt' ? 'Prueba un bot (backtest) para ver aquí su curva de capital.' : 'Inicia paper trading en un bot para verlo aquí en vivo.'}</div>`;
    const all = vis.flatMap(s => s.pts); let t0 = Math.min(...all.map(p => p[0])), t1 = Math.max(...all.map(p => p[0])); if (t1 <= t0) t1 = t0 + 1;
    let y0 = Math.min(0, ...all.map(p => p[1])), y1 = Math.max(0, ...all.map(p => p[1])); const pad = (y1 - y0) * .1 || 1; y0 -= pad; y1 += pad;
    const pl = 8, pr = 46, pt = 10, pb = 22, X = t => pl + (t - t0) / (t1 - t0) * (W - pl - pr), Y = v => pt + (y1 - v) / (y1 - y0) * (H - pt - pb);
    const step = (() => { const r = (y1 - y0) / 4, m = Math.pow(10, Math.floor(Math.log10(r))); return [1, 2, 2.5, 5, 10].map(x => x * m).find(x => x >= r) || r; })();
    let grid = ''; for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) grid += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" class="${Math.abs(v) < step / 1e3 ? 'bd-zero' : 'bd-grid'}"/><text x="${W - pr + 6}" y="${Y(v) + 3.5}" class="bd-ax">${Math.abs(v) < step / 1e3 ? '0' : (v > 0 ? '+' : '') + num(v, step < 1 ? 1 : 0)}%</text>`;
    for (let i = 0; i <= 3; i++) { const t = t0 + (t1 - t0) * i / 3; grid += `<text x="${X(t)}" y="${H - 6}" class="bd-ax" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}">${dd(t)}</text>`; }
    const lines = vis.map((s, i) => { const xy = thinXY(s.pts.map(p => [X(p[0]), Y(p[1])]), Math.max(40, Math.round(W / 5))), d = smoothD(xy), last = s.pts[s.pts.length - 1], g = 'eqg' + (++gradN);
      return `${i === 0 ? `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.col}" stop-opacity=".32"/><stop offset="1" stop-color="${s.col}" stop-opacity="0"/></linearGradient></defs><path d="${d}L${xy[xy.length - 1][0].toFixed(1)} ${H - pb}L${xy[0][0].toFixed(1)} ${H - pb}Z" fill="url(#${g})"/>` : ''}<path d="${d}" fill="none" stroke="${s.col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" class="bd-line"/><circle cx="${X(last[0])}" cy="${Y(last[1])}" r="4" fill="${s.col}" stroke="var(--bg)" stroke-width="2"/>`; }).join('');
    dash.geo = {X, Y, t0, t1, pl, pr, W, H, vis};
    return `<div class="bd-eqwrap"><svg class="bd-eq" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${grid}${lines}<g class="bd-cross" visibility="hidden"><line class="bd-cl" y1="${pt}" y2="${H - pb}"/>${vis.map(s => `<circle r="4.5" fill="${s.col}" stroke="var(--bg)" stroke-width="2"/>`).join('')}</g></svg><div class="bd-tip" hidden></div></div>`;
  }
  function dashHtml() {
    dash.ser = dashSeries();
    const act = S.bots.filter(b => b.status !== 'archived'), runs = act.map(b => ({b, r: runOf(b)})).filter(x => x.r), sess = act.flatMap(b => (b.paper || []).filter(s => s.status === 'running').map(s => ({b, s, st: PP() ? PP().stats(s) : null})));
    if (!act.length) return `<div class="bd-hero"><div class="bd-hero-ic">${IC.robot}</div><h3>Tu laboratorio de bots</h3><p>Crea un bot en español, con el constructor visual o con tus indicadores. Pruébalo con datos reales (backtest), simúlalo en vivo (paper) y aquí verás todo en gráficas.</p><div class="bd-steps"><span><b>1</b>Crear</span><i></i><span><b>2</b>Probar</span><i></i><span><b>3</b>Simular</span><i></i><span><b>4</b>Mejorar</span></div><button class="bl-btn" data-a="new">${IC.plus}Crear mi primer bot</button></div>`;
    const best = runs.slice().sort((a, b) => b.r.metrics.retPct - a.r.metrics.retPct)[0], wr = runs.filter(x => x.r.metrics.winRate != null), avgWr = wr.length ? wr.reduce((a, x) => a + x.r.metrics.winRate, 0) / wr.length : null;
    const worstDD = runs.length ? Math.max(...runs.map(x => x.r.metrics.maxDDPct || 0)) : null, papNet = sess.reduce((a, x) => a + ((x.st && x.st.net) || 0), 0), pos = runs.filter(x => x.r.metrics.net > 0).length;
    const kpi = (lab, val, sub, extra, c) => `<div class="bd-kpi ${c || ''}">${extra || ''}<div><small>${lab}</small><b>${val}</b>${sub ? `<em>${sub}</em>` : ''}</div></div>`;
    const kpis = `<div class="bd-kpis">`
      + kpi('Bots', act.length, `${runs.length} probados · ${sess.length} en vivo`)
      + kpi('Mejor bot', best ? `<span class="${cls(best.r.metrics.retPct)}">${pct(best.r.metrics.retPct)}</span>` : '—', best ? esc(best.b.name) : 'Sin pruebas', '', best ? 'click' : '').replace('class="bd-kpi click"', best ? `class="bd-kpi click" data-a="open" data-id="${best.b.id}"` : 'class="bd-kpi"')
      + kpi('Aciertos promedio', avgWr == null ? '—' : num(avgWr, 0) + ' %', `${pos}/${runs.length} bots ganan`, ring(avgWr, avgWr >= 50 ? '#20bf9f' : '#f0b90b'))
      + kpi('Peor caída', worstDD == null ? '—' : num(worstDD, 1) + ' %', 'drawdown máximo', ring(Math.min(100, (worstDD || 0) * 2), (worstDD || 0) > 25 ? '#f06b79' : (worstDD || 0) > 12 ? '#f0b90b' : '#20bf9f'))
      + kpi('Paper en vivo', sess.length ? `<span class="${cls(papNet)}">${money(papNet)}</span>` : '—', sess.length ? `${sess.length} sesión${sess.length === 1 ? '' : 'es'} simulando` : 'sin simulaciones')
      + `</div>`;
    const legend = dash.ser.map(s => `<button type="button" class="bd-leg ${dash.off.has(s.k) ? 'off' : ''}" data-dleg="${esc(s.k)}"><i style="background:${s.col}"></i>${esc(s.name)}<span class="${cls(s.m && s.m.retPct)}">${s.m ? pct(s.m.retPct) : ''}</span></button>`).join('');
    const W = Math.max(280, Math.min(1400, (root.clientWidth || 360) - 34)); dash.w = root.clientWidth;
    const board = runs.slice().sort((a, b) => b.r.metrics.retPct - a.r.metrics.retPct), mx = Math.max(1, ...board.map(x => Math.abs(x.r.metrics.retPct)));
    const lb = board.map((x, i) => { const m = x.r.metrics, w = Math.abs(m.retPct) / mx * 50; return `<button type="button" class="bd-row" data-a="open" data-id="${x.b.id}"><span class="bd-pos">${i + 1}</span><span class="bd-nm"><b>${esc(x.b.name)}</b><small>${esc(mainSpec(x.b).symbol)} · ${esc(mainSpec(x.b).interval)} · ${m.n} op. · ${m.winRate == null ? '—' : num(m.winRate, 0) + ' %'} aciertos</small></span><span class="bd-bar"><i class="${m.retPct >= 0 ? 'up' : 'dn'}" style="${m.retPct >= 0 ? 'left:50%' : 'right:50%'};width:${w.toFixed(1)}%"></i></span><span class="bd-val ${cls(m.retPct)}">${pct(m.retPct)}</span></button>`; }).join('');
    const SW = Math.max(280, Math.min(W, Math.round(W > 700 ? W / 2 - 40 : W))), SH = 200, mdd = Math.max(5, ...runs.map(x => x.r.metrics.maxDDPct || 0)) * 1.1, rr = runs.map(x => x.r.metrics.retPct), ry0 = Math.min(0, ...rr) * 1.15 - 1, ry1 = Math.max(0, ...rr) * 1.15 + 1;
    const sX = v => 30 + v / mdd * (SW - 44), sY = v => 10 + (ry1 - v) / (ry1 - ry0) * (SH - 34);
    const scatter = runs.length ? `<svg class="bd-sc" viewBox="0 0 ${SW} ${SH}" width="${SW}" height="${SH}"><rect x="30" y="10" width="${(sX(mdd / 2) - 30).toFixed(1)}" height="${(sY(0) - 10).toFixed(1)}" class="bd-ideal"/><text x="36" y="${(sY(0) - 6).toFixed(1)}" class="bd-ax bd-idl">Zona ideal: gana con poco riesgo</text><line x1="30" x2="${SW - 14}" y1="${sY(0)}" y2="${sY(0)}" class="bd-zero"/><line x1="30" x2="30" y1="10" y2="${SH - 24}" class="bd-grid"/><text x="${SW - 14}" y="${SH - 6}" class="bd-ax" text-anchor="end">Caída máxima → más riesgo</text><text x="4" y="14" class="bd-ax">Gana</text><text x="4" y="${SH - 26}" class="bd-ax">Pierde</text>`
      + runs.map(x => { const m = x.r.metrics, r = Math.max(5, Math.min(13, 4 + Math.sqrt(m.n || 1))); return `<g class="bd-pt" data-a="open" data-id="${x.b.id}"><circle cx="${sX(m.maxDDPct || 0).toFixed(1)}" cy="${sY(m.retPct).toFixed(1)}" r="${r.toFixed(1)}" fill="${colOf(x.b.id)}" fill-opacity=".75" stroke="${colOf(x.b.id)}"/><title>${esc(x.b.name)}: ${pct(m.retPct)} · caída ${num(m.maxDDPct, 1)} % · ${m.n} operaciones</title></g>`; }).join('') + `</svg><p class="bd-note">Cada burbuja es un bot; más grande = más operaciones. Toca una para abrirlo.</p>` : `<div class="bd-empty">Prueba tus bots para compararlos aquí.</div>`;
    const live = sess.map(({b, s, st}) => { const o = s.open; return `<button type="button" class="bd-live" data-a="open" data-id="${b.id}"><div class="bd-live-h"><span class="bd-dot ${problem(b) ? 'err' : ''}"></span><b>${esc(b.name)}</b><small>${esc(s.spec.symbol)} · ${esc(s.spec.interval)}</small></div><div class="bd-live-m"><span class="bd-pos-chip ${o ? (o.side === 'long' ? 'long' : 'short') : 'flat'}">${o ? (o.side === 'long' ? 'COMPRADO' : 'VENDIDO') : 'SIN POSICIÓN'}</span><b class="${cls(st && st.net)}">${st ? money(st.net) : '—'}</b><small>${st ? pct(st.retPct) : ''}</small></div>${spark(s.curve, colOf(b.id), 220, 40)}<small class="bd-live-f">${st ? `${st.nClosed} operaciones cerradas · ${num(st.days, 1)} días` : ''}${o ? ` · abierta ${o.unreal >= 0 ? '+' : '−'}$${num(Math.abs(o.unreal), 2)}` : ''}</small></button>`; }).join('');
    const feed = act.flatMap(b => (b.journal || []).slice(-6).map(j => ({b, j}))).sort((a, b) => b.j.t - a.j.t).slice(0, 7).map(({b, j}) => `<div class="bd-ev"><i style="background:${colOf(b.id)}"></i><div><b>${esc(b.name)}</b> <span class="bd-kind">${esc(j.kind)}</span><small>${esc(String(j.text).slice(0, 140))}</small></div><time>${dt(j.t)}</time></div>`).join('');
    return `<div class="bd">${kpis}
      <div class="bd-card"><div class="bd-ch"><h4>Curva de capital</h4><div class="bd-seg"><button type="button" data-dmode="bt" aria-pressed="${dash.mode === 'bt'}">Backtest</button><button type="button" data-dmode="paper" aria-pressed="${dash.mode === 'paper'}">Paper en vivo</button></div></div>
        <div class="bd-legs">${legend}</div>${eqChart(W, 230)}</div>
      ${sess.length ? `<div class="bd-card"><div class="bd-ch"><h4>Simulando ahora</h4><small>${sess.length} en vivo</small></div><div class="bd-lives">${live}</div></div>` : ''}
      <div class="bd-cols"><div class="bd-card"><div class="bd-ch"><h4>Ranking por rentabilidad</h4><small>último backtest</small></div>${lb || '<div class="bd-empty">Aún no hay bots probados.</div>'}</div>
      <div class="bd-card"><div class="bd-ch"><h4>Riesgo vs. retorno</h4></div>${scatter}</div></div>
      ${feed ? `<div class="bd-card"><div class="bd-ch"><h4>Actividad reciente</h4></div><div class="bd-feed">${feed}</div></div>` : ''}
      <h4 class="bd-sub">Tus bots</h4></div>`;
  }
  function dashBind() { // cruz y tooltip de la curva de capital (ratón o dedo)
    const svg = root.querySelector('.bd-eq'), tip = root.querySelector('.bd-tip'); if (!svg || !dash.geo) return;
    const G = dash.geo, cross = svg.querySelector('.bd-cross'), cl = svg.querySelector('.bd-cl'), dots = [...cross.querySelectorAll('circle')];
    const at = (pts, t) => { let lo = 0, hi = pts.length - 1; if (t <= pts[0][0]) return null; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] <= t) lo = m; else hi = m; } return t > pts[pts.length - 1][0] ? pts[pts.length - 1] : pts[lo]; };
    const move = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * G.W / r.width; if (x < G.pl || x > G.W - G.pr) { hide(); return; }
      const t = G.t0 + (x - G.pl) / (G.W - G.pl - G.pr) * (G.t1 - G.t0); cross.setAttribute('visibility', 'visible'); cl.setAttribute('x1', x); cl.setAttribute('x2', x);
      const rows = G.vis.map((s, i) => { const p = at(s.pts, t); if (!p) { dots[i].setAttribute('visibility', 'hidden'); return ''; } dots[i].setAttribute('visibility', 'visible'); dots[i].setAttribute('cx', G.X(p[0])); dots[i].setAttribute('cy', G.Y(p[1])); return `<div><i style="background:${s.col}"></i>${esc(s.name)}<b class="${cls(p[1])}">${pct(p[1], 2)}</b></div>`; }).join('');
      tip.innerHTML = `<small>${dt(t)}</small>${rows}`; tip.hidden = false; const left = (x / G.W) * r.width; tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, left + 14 + tip.offsetWidth > r.width ? left - tip.offsetWidth - 14 : left + 14)) + 'px'; };
    const hide = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; };
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move); svg.addEventListener('pointerleave', hide);
  }
  let dashRO = null; // si cambias el ancho del panel (o lo expandes), se vuelven a dibujar las gráficas a su tamaño
  function dashWatch() { if (dashRO || !window.ResizeObserver || !root) return; let t = 0; dashRO = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { if (view === 'lib' && root.clientWidth && Math.abs(root.clientWidth - (dash.w || 0)) > 24) render(); }, 160); }); dashRO.observe(root); }
  function dashClick(e) {
    const m = e.target.closest('[data-dmode]'); if (m && root.contains(m)) { dash.mode = m.dataset.dmode; render(); return true; }
    const l = e.target.closest('[data-dleg]'); if (l && root.contains(l)) { const k = l.dataset.dleg; dash.off.has(k) ? dash.off.delete(k) : dash.off.add(k); render(); return true; }
    return false;
  }
  /* ───────── Torneo: todos los bots encendidos (incluido Claudio) compitiendo en vivo desde que se encendieron ───────── */
  function tournRows() {
    const rows = S.bots.filter(b => b.status !== 'archived').map(b => { const lv = liveOf(b); return lv ? {id: b.id, name: b.name, av: avOf(b, 30), col: lookOf(b).color, ret: lv.retPct, n: lv.nClosed, win: lv.winRate, since: lv.startT, curve: lv.curve.map(p => [p[0], (p[1] / lv.capital - 1) * 100]), open: 'open'} : null; }).filter(Boolean);
    const C = window.CCTClaudioUI && window.CCTClaudioUI.liveRow && window.CCTClaudioUI.liveRow(); if (C) rows.push(C);
    return rows.sort((a, c) => c.ret - a.ret);
  }
  function tournView() {
    const rows = tournRows(), medal = i => `<span class="tn-m m${i}">${i + 1}</span>`;
    dash.ser = rows.filter(r => r.curve.length > 1).map(r => ({k: r.id, id: r.id, name: r.name, col: r.col, pts: r.curve})); const W = Math.max(280, Math.min(1400, (root.clientWidth || 360) - 34)); dash.w = root.clientWidth;
    root.innerHTML = head('Torneo de bots', 'Todos los bots encendidos compitiendo en vivo (simulación) desde que los encendiste', 'lib') +
      (rows.length ? `<div class="tn-pod">${rows.slice(0, 3).map((r, i) => `<button type="button" class="tn-p p${i}" data-a="${r.open}" data-id="${r.id}">${medal(i)}${r.av}<b>${esc(r.name)}</b><span class="${cls(r.ret)}">${pct(r.ret)}</span><small>${r.n} op.${r.win != null ? ' · ' + num(r.win, 0) + ' % aciertos' : ''}</small></button>`).join('')}</div>
      <div class="bd-card"><div class="bd-ch"><h4>Clasificación</h4><small>${rows.length} compitiendo</small></div>${rows.map((r, i) => `<button type="button" class="tn-r" data-a="${r.open}" data-id="${r.id}">${medal(i)}${r.av}<span class="tn-n"><b>${esc(r.name)}</b><small>desde ${dd(r.since)} · ${r.n} operaciones${r.win != null ? ' · ' + num(r.win, 0) + ' % aciertos' : ''}</small></span><span class="tn-v ${cls(r.ret)}">${pct(r.ret)}</span></button>`).join('')}</div>
      ${dash.ser.length ? `<div class="bd-card"><div class="bd-ch"><h4>Curvas en vivo</h4><small>% desde que se encendió cada uno</small></div><div class="bd-legs">${dash.ser.map(x => `<button type="button" class="bd-leg ${dash.off.has(x.k) ? 'off' : ''}" data-dleg="${esc(x.k)}"><i style="background:${x.col}"></i>${esc(x.name)}</button>`).join('')}</div>${eqChart(W, 230)}</div>` : ''}
      <p class="bl-foot">Cada bot empieza en cero al encenderlo; compara solo lo que pasó en vivo. Pocas operaciones = todavía es pronto para elegir ganador.</p>`
      : `<div class="bd-hero"><div class="bd-hero-ic">${IC.robot}</div><h3>Aún no hay bots compitiendo</h3><p>Enciende varios bots con su interruptor en la lista y aquí verás quién va ganando en vivo.</p><button class="bl-btn" data-a="lib">Ir a mis bots</button></div>`);
    dashBind();
  }

  /* ───────── Biblioteca minimalista: solo acciones + tus bots. Todo el detalle (curva, ranking, operaciones) vive dentro de cada bot ───────── */
  let pick = false; // modo «elegir para comparar»
  const botCurve = b => { const lv = liveOf(b); if (lv) { const pts = ds(lv.curve.map(p => [p[0], (p[1] / lv.capital - 1) * 100])); return {pts: pts.length > 1 ? pts : [[lv.startT, 0], [Date.now(), lv.retPct]], live: true, last: lv.retPct}; } const r = runOf(b); if (r && r.equity && r.equity.length > 1) { const cap = ((mainSpec(b).risk || {}).capital) || r.equity[0][1] || 1; return {pts: ds(r.equity.map(p => [p[0], (p[1] / cap - 1) * 100])), live: false}; } return null; };
  const ds = (a, n = 40) => { if (a.length <= n) return a; const o = []; for (let i = 0; i < n; i++) o.push(a[Math.round(i * (a.length - 1) / (n - 1))]); return o; }; // curva resumida para la miniatura
  const isLive = b => (b.paper || []).some(x => x.status === 'running');
  /* En vivo agrupado: una cesta tiene una sesión por moneda (mismo «grupo»); aquí se suman como un solo bot */
  function liveOf(b) {
    const run = (b.paper || []).filter(x => x.status === 'running'); if (!run.length || !PP()) return null; const g = run[run.length - 1].grp, ss = g ? run.filter(x => x.grp === g) : [run[run.length - 1]];
    const sts = ss.map(x => PP().stats(x)), cap = ss.reduce((a, x) => a + x.capital, 0), eq = sts.reduce((a, x) => a + x.equity, 0), led = ss.flatMap(x => x.ledger.map(t => Object.assign({sym: x.spec.symbol, iv: x.spec.interval}, t))).sort((a, c) => a.entryT - c.entryT), wins = led.filter(t => t.net > 0).length;
    const open = ss.filter(x => x.open).map(x => Object.assign({sym: x.spec.symbol, iv: x.spec.interval}, x.open)), times = [...new Set(ss.flatMap(x => x.curve.map(p => p[0])))].sort((a, c) => a - c), lastE = ss.map(x => x.capital), ix = ss.map(() => 0);
    const curve = times.map(t => { let e = 0; ss.forEach((x, k) => { while (ix[k] < x.curve.length && x.curve[ix[k]][0] <= t) { lastE[k] = x.curve[ix[k]][1]; ix[k]++; } e += lastE[k]; }); return [t, e]; });
    return {ss, startT: Math.min(...ss.map(x => x.startT)), v: ss[0].v, capital: cap, equity: eq, retPct: (eq / cap - 1) * 100, nClosed: led.length, winRate: led.length ? wins / led.length * 100 : null, ledger: led, open, curve, interval: [...new Set(ss.map(x => x.spec.interval))].join(' · '), ivs: [...new Set(ss.map(x => x.spec.interval))], symbols: [...new Set(ss.map(x => x.spec.symbol))]};
  }
  /* Enciende la simulación en vivo: una sesión por moneda si es cesta (capital repartido). Lo anterior en pausa pasa al historial: siempre empieza de cero. */
  const ivsOf = sp => { const l = (Array.isArray(sp.intervals) && sp.intervals.length ? sp.intervals : [sp.interval]).filter(i => B.IV_MS[i]); return l.length ? [...new Set(l)] : [sp.interval]; };
  /* Si el bot estaba en vivo y cambiaste la versión principal (otra temporalidad, monedas o reglas), arranca de nuevo con la nueva */
  function relive(b) { if (!isLive(b)) return; const run = (b.paper || []).filter(x => x.status === 'running'); if (run.every(x => x.v === b.mainV)) return; for (const x of run) { x.status = 'stopped'; x.pausedAt = Date.now(); } log(b, 'paper', `La simulación en vivo se reinició con la v${b.mainV} (cambiaste las reglas).`); startLive(b, b.mainV, mainSpec(b).risk.capital); }
  function startLive(b, v, cap) {
    const sp = ver(b, v).spec, syms = Array.isArray(sp.basket) && sp.basket.length ? sp.basket : [sp.symbol], ivs = ivsOf(sp), now = Date.now(), grp = uidOf(), out = [], n = syms.length * ivs.length;
    for (const x of (b.paper || []).filter(y => y.status === 'paused')) x.status = 'stopped';
    for (const iv of ivs) for (const sym of syms) { const s2 = JSON.parse(JSON.stringify(sp)); s2.symbol = sym; s2.interval = iv; delete s2.basket; delete s2.intervals; const sess = PP().newSession({id: uidOf(), v, spec: s2, capital: cap / n, startT: now}); sess.grp = grp; (b.paper = b.paper || []).push(sess); out.push(sess); }
    if (b.status === 'paused') b.status = runOf(b) ? 'tested' : 'draft';
    log(b, 'paper', `Simulación en vivo iniciada con la v${v}${syms.length > 1 ? ` en ${syms.length} monedas` : ''}${ivs.length > 1 ? ` y ${ivs.length} temporalidades (${ivs.join(', ')})` : ''} (capital virtual ${money(cap)}). Empieza en cero y sigue encendida hasta que la pauses.`); touch(b); render(); out.forEach(x => paperUpdate(b, x, true)); return out;
  }
  function botRow(b) {
    const v = mainSpec(b), nt = tipsOf(b).length, c = botCurve(b), last = c ? (c.live ? c.last : c.pts[c.pts.length - 1][1]) : null, live = isLive(b), col = last == null ? '#8796ab' : last >= 0 ? '#20bf9f' : '#f06b79';
    const bad = problem(b), state = bad ? ['err', 'Problema'] : live ? ['live', 'En vivo'] : b.status === 'archived' ? ['arch', 'Archivado'] : b.status === 'paused' ? ['pause', 'Pausado'] : runOf(b) ? ['ok', 'Probado'] : ['draft', 'Borrador'];
    const opn = (b.paper || []).filter(x => x && x.status === 'running' && x.open), side = opn.length ? String(opn[0].open.side || '').toLowerCase() : '', sideL = /short|sell/.test(side) ? 'short' : 'long';
    const openB = opn.length ? `<em class="bl-open s-${sideL}" title="${esc(opn.map(x => `${String(x.open.side || '').toUpperCase()} abierta en ${String(x.spec.symbol || '').replace('USDT', '')} desde ${dt(x.open.entryT)}`).join(' · '))}"><i></i>${opn.length > 1 ? opn.length + ' abiertas' : sideL === 'short' ? 'Short' : 'Long'}</em>` : ''; // operación abierta: marca discreta junto al nombre
    return `<div class="bl-row ${b.status === 'archived' ? 'arch' : ''}">${pick ? `<label class="bl-pick"><input type="checkbox" data-sel="${b.id}" ${sel.has(b.id) ? 'checked' : ''}></label>` : ''}<button type="button" class="bl-row-m" data-a="open" data-id="${b.id}"><span class="bl-avw">${avOf(b, 34)}<span class="bl-dot d-${state[0]}" title="${state[1]}"></span></span><span class="bl-row-n"><b>${esc(b.name)}${openB}${b.upAt && Date.now() - b.upAt < 48 * 36e5 ? '<em class="bl-up" title="Mejoró solo con el reentrenamiento">🚀 Mejoró</em>' : ''}</b><small>${esc(Array.isArray(v.basket) && v.basket.length ? v.basket.length + ' monedas' : v.symbol.replace('USDT', ''))} · ${esc(v.interval)} · ${state[1]}${nt ? ` · <em class="bl-tipb">${nt} mejora${nt === 1 ? '' : 's'}</em>` : ''}</small></span>${c ? spark(c.pts, col, 60, 26) : ''}<span class="bl-row-v ${cls(last)}">${last == null ? '—' : pct(last)}</span><span class="bl-row-go">›</span></button><button type="button" class="bl-tg ${live ? 'on' : ''} ${bad ? 'err' : ''}" data-a="rowSim" data-id="${b.id}" title="${live ? 'Pausar simulación en vivo' : 'Encender simulación en vivo'}" aria-pressed="${live}"><i></i></button></div>`;
  }
  function seedSafe() { // los dos bots «Seguro» (1 h y 4 h) se crean una sola vez por cuenta; si los borras no vuelven
    S.seeded = S.seeded || {}; if (S.seeded.safe || !B.PRESETS.safe1h) return; S.seeded.safe = Date.now();
    for (const [k, color, icon] of [['safe1h', '#20bf9f', 'astronauta'], ['safe4h', '#548fff', 'satelite']]) { if (S.bots.some(b => b.preset === k)) continue; newLook = {color, icon}; const b = newBot(B.PRESETS[k](), 'visual', 'Solo compras en tendencia alcista confirmada, en BTC, ETH, SOL, BNB y XRP. Opera poco, con riesgo bajo y objetivo cercano para buscar más aciertos.'); b.preset = k; S.bots.push(b); log(b, 'creación', 'Bot «Seguro» creado por Nova Bot Lab: pruébalo y enciéndelo para verlo en vivo.'); }
    save();
  }
  /* Ajuste único (nov 2026): los «Seguro» solo compraban y el «Nova Nexus» solo compraba en BTC 1h; con el mercado bajista no entraban nunca.
     Pasan a operar en ambos sentidos (nueva versión principal, se guarda la anterior) y se crean los bots Nova Nexus v2.7 optimizados. Todos quedan en vivo (paper). */
  function fixNov26() {
    S.seeded = S.seeded || {}; if (S.seeded.nov26 || !B.PRESETS.nova27x4h || !PP()) return; S.seeded.nov26 = Date.now();
    const bump = (b, sp, note) => { const nv = Math.max(...b.versions.map(x => x.v)) + 1; b.versions.forEach(x => { if (x.v === b.mainV) x.state = 'anterior'; }); b.versions.push({v: nv, spec: B.normalizeSpec(sp), at: Date.now(), note, origin: 'Nova Bot Lab', state: 'principal'}); b.mainV = nv; if (sp.name) b.name = sp.name; log(b, 'versión', note + ` (v${nv}).`); };
    const goLive = b => { if (b.status === 'archived') return; const run = (b.paper || []).filter(x => x.status === 'running'); for (const x of run) { x.status = 'stopped'; x.pausedAt = Date.now(); } if (b.status === 'paused') b.status = 'draft'; startLive(b, b.mainV, mainSpec(b).risk.capital); };
    for (const b of S.bots) {
      if (b.status === 'archived') continue;
      if (b.preset === 'safe1h' || b.preset === 'safe4h') { bump(b, B.PRESETS[b.preset](), 'Ahora también vende (cortos) en tendencia bajista: antes solo compraba y con el mercado bajista no entraba nunca'); goLive(b); continue; }
      const sp = mainSpec(b), usesNova = JSON.stringify(sp.entry || {}).includes('"novaBuy"');
      if (usesNova && sp.sides === 'long' && !b.preset) { const n = B.novaVolBoth(sp); bump(b, n, 'Ahora también vende con la señal de VENTA de Nova Nexus: antes solo compraba y casi todas las señales recientes eran de venta'); goLive(b); }
    }
    for (const [k, color, icon, desc] of [['nova27x4h', '#a78bfa', 'vortice', 'Señales de Nova Nexus · iA Signals v2.7 en 4h, compras y ventas con puntaje ≥ 4, en 8 monedas. Cierra solo: take profit a 1.5× ATR y stop loss a 4× ATR. Riesgo 2 % por operación, apalancamiento máx. 5×.'], ['nova27x1h', '#f06b79', 'cometa', 'Señales de VENTA de Nova Nexus v2.7 en 1h, solo en tendencia (ADX ≥ 25), en 8 monedas. Cierra en la señal de compra contraria o en SL 4× ATR / TP 2.5× ATR. Riesgo 2 %, apalancamiento máx. 5×.']]) {
      if (S.bots.some(b => b.preset === k)) continue; newLook = {color, icon}; const b = newBot(B.PRESETS[k](), 'nova', desc); b.preset = k; S.bots.push(b); log(b, 'creación', 'Bot creado por Nova Bot Lab a partir de tu indicador Nova Nexus v2.7, optimizado con validación fuera de muestra.'); goLive(b);
    }
    save(); toast('Nova Bot Lab: tus bots ya operan en ambos sentidos y se crearon los bots Nova Nexus v2.7 (en vivo, simulado)');
  }
  function learnOn() { // una sola vez por cuenta: todos tus bots con reentrenamiento diario y mejora automática (luego puedes apagarlo en cada bot)
    S.seeded = S.seeded || {}; if (S.seeded.learn) return; S.seeded.learn = Date.now();
    for (const b of S.bots) { if (b.status === 'archived') continue; const c = cyc(b); if (!c.enabled) c.enabledAt = Date.now(); c.enabled = true; c.auto = true; log(b, 'ciclo', 'Aprendizaje activado: reentrenamiento diario y mejora automática.'); }
    save();
  }
  function seedLucas() { // Lucas 1H y 4H (creados con Claude): una sola vez por cuenta, encendidos en paper trading; si los borras no vuelven
    S.seeded = S.seeded || {}; if (S.seeded.lucas || !B.PRESETS.lucas4h || !PP()) return; S.seeded.lucas = Date.now();
    for (const [k, color, icon] of [['lucas4h', '#548fff', 'astronauta'], ['lucas1h', '#20bf9f', 'cohete']]) {
      if (S.bots.some(b => b.preset === k)) continue; newLook = {color, icon}; const sp = B.PRESETS[k]();
      const b = newBot(sp, 'visual', `Ruptura de Bollinger (${sp.entry.long[0].b.n}, 2.5σ) a favor de la tendencia (EMA ${sp.entry.long[1].b.n}), compras y ventas en 8 monedas. SL ${sp.risk.sl.v}× ATR, TP 2R, trailing ${sp.risk.trail.v}× ATR. Riesgo 1 %, apalancamiento máx. 3×.`);
      b.preset = k; S.bots.push(b);
      log(b, 'creación', k === 'lucas4h' ? 'Lucas 4H creado con Claude. Histórico nov-2020→nov-2026: 1.964 operaciones, 38 % aciertos, PF 1.28, +43.9 %, DD máx. 7.1 %. Últimos 12 meses −3.6 %: veredicto no confirmado, se vigila en paper trading.' : 'Lucas 1H creado con Claude. Histórico nov-2020→nov-2026: 3.075 operaciones, 36 % aciertos, PF 1.16, +37.2 %, DD máx. 10.6 %. Últimos 12 meses −5.6 %: veredicto no confirmado, se vigila en paper trading.');
      startLive(b, b.mainV, sp.risk.capital);
    }
    save(); toast('Nova Bot Lab: Lucas 1H y Lucas 4H ya están en vivo (simulado)');
  }
  /* Pachita (nov 2026, creada con Claude): Nova Nexus · iA Signals v2.7 en 15 m. Una sola vez por cuenta, encendida en paper trading,
     con reentrenamiento diario y mejora automática como los demás; su cerebro en Neural Brain lo crea el conector (brain-links.json). */
  function seedPachita() {
    S.seeded = S.seeded || {}; if (S.seeded.pachita || !B.PRESETS.pachita || !PP()) return; S.seeded.pachita = Date.now();
    if (S.bots.some(b => b.preset === 'pachita')) return save(); newLook = {color: '#f472b6', icon: 'estrella'}; const sp = B.PRESETS.pachita();
    const b = newBot(sp, 'nova', 'Señales de Nova Nexus · iA Signals v2.7 en 15 minutos, compras y ventas en 8 monedas, solo en tendencia, del lado correcto de la nube EMA y a favor de la tendencia mayor (EMA 200 vs EMA 800). SL 3× ATR, TP 3× ATR, máx. 24 h por operación. Riesgo 1 %, apalancamiento máx. 5×.');
    b.preset = 'pachita'; S.bots.push(b); const c = cyc(b); c.enabled = true; c.auto = true; c.enabledAt = Date.now();
    log(b, 'creación', 'Pachita creada con Claude a partir de tu indicador Nova Nexus · iA Signals v2.7 (15 m). Probada con datos reales abr→nov 2026 en 8 monedas: 359 operaciones, 54 % aciertos, PF 0.96; gana en los últimos meses pero no en los primeros. En 15 m la señal no quedó confirmada: experimento en paper trading con mejora automática.');
    startLive(b, b.mainV, sp.risk.capital); save(); toast('Nova Bot Lab: Pachita (15 m) ya está en vivo (simulado)');
  }
  /* Ajuste único (nov 2026): bots que abrían y cerraban enseguida (objetivo pegado, trailing muy corto o cierre por la señal contraria a la vela siguiente).
     Nueva versión principal con la corrección (la anterior queda en Versiones) y, si estaba en vivo, la simulación sigue con la nueva. */
  /* Arreglo automático al abrir: los errores de «tu indicador ya no produce la señal…» ya no detienen a los bots (una señal que no salió en esas velas
     es solo «no hubo señal»); se limpian solos. Y los bots Nova Nexus · iA Signals v2.7 que quedaron apagados por eso vuelven a encenderse (una vez). */
  function healBots() {
    if (!PP()) return; let ch = false; S.seeded = S.seeded || {};
    for (const b of S.bots) { if (b.status === 'archived') continue;
      for (const x of b.paper || []) if (x.status === 'running' && x.err && /ya no produce la señal|ya no tiene la línea|Value for argument|not a valid Firestore/i.test(x.err)) { x.err = null; ch = true; touch(b); }
    }
    if (!S.seeded.nova27on) { S.seeded.nova27on = Date.now(); ch = true;
      for (const b of S.bots) { if (b.status === 'archived' || !/^nova27/.test(b.preset || '')) continue; if (b.status === 'paused') b.status = 'tested';
        if (!isLive(b)) { const paused = (b.paper || []).filter(x => x.status === 'paused'); if (paused.length) { for (const x of paused) { x.status = 'running'; x.pausedAt = null; x.err = null; } log(b, 'paper', 'Reactivado: la simulación en vivo sigue corriendo.'); touch(b); } else { try { startLive(b, b.mainV, mainSpec(b).risk.capital); log(b, 'paper', 'Reactivado: simulación en vivo encendida de nuevo.'); } catch {} } } }
    }
    if (ch) save();
  }
  function fixQuick() {
    S.seeded = S.seeded || {}; if (S.seeded.quick2 || !B.fixQuickClose || !PP()) return; S.seeded.quick2 = Date.now(); let n = 0;
    for (const b of S.bots) {
      if (b.status === 'archived') continue; const f = B.fixQuickClose(mainSpec(b)); if (!f) { relive(b); continue; } n++; // relive: si la simulación seguía con una versión vieja (p. ej. aplicaste un consejo), pasa a la principal
      const nv = Math.max(...b.versions.map(x => x.v)) + 1, note = 'Corrección para que no abra y cierre enseguida: ' + f.changes.join('; ');
      b.versions.forEach(x => { if (x.v === b.mainV) x.state = 'anterior'; }); b.versions.push({v: nv, spec: f.spec, at: Date.now(), note, origin: 'Nova Bot Lab', state: 'principal'}); b.mainV = nv; log(b, 'versión', note + ` (v${nv}).`);
      const run = (b.paper || []).filter(x => x.status === 'running'); if (run.length) { for (const x of run) { x.status = 'stopped'; x.pausedAt = Date.now(); } startLive(b, nv, run.reduce((a, x) => a + x.capital, 0) || f.spec.risk.capital); }
    }
    save(); if (n) toast(`Nova Bot Lab: ${n} bot${n === 1 ? '' : 's'} corregido${n === 1 ? '' : 's'} para que no cierren enseguida`);
  }
  function libView() {
    const act = S.bots.filter(b => b.status !== 'archived').sort((a, b) => (isLive(b) - isLive(a)) || (b.updatedAt - a.updatedAt)), arch = S.bots.filter(b => b.status === 'archived');
    const list = showArch ? act.concat(arch) : act;
    root.innerHTML = head('NOVA BOT LAB', 'Crea, prueba y simula bots sin dinero real') + `<div class="bl-actions bl-acts4"><button class="bl-btn" data-a="new">${IC.plus}Crear nuevo bot</button><button class="bl-btn ghost" data-a="import">Importar</button><button class="bl-btn ghost" data-a="risk">Panel de riesgo</button><button class="bl-btn ghost ${pick ? 'on' : ''}" data-a="cmp" ${S.bots.length >= 2 ? '' : 'disabled'}>${pick ? (sel.size >= 2 ? `Comparar ${sel.size} ›` : `Elige ${2 - Math.min(2, sel.size)} más`) : 'Comparar'}</button></div>
      ${pick ? '<p class="bl-dim bl-pickhint">Marca los bots que quieres comparar. <a href="#" data-a="cmpCancel">Cancelar</a></p>' : ''}
      ${(() => { const tr = tournRows(); return `<button type="button" class="tn-ban" data-a="tourn"><span class="tn-ic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/></svg></span><span><b>Torneo de bots</b><small>${tr.length ? `${tr.length} compitiendo · va ganando ${esc(tr[0].name)} (${pct(tr[0].ret)})` : 'Enciende varios bots para que compitan en vivo'}</small></span><span class="bl-row-go">›</span></button>`; })()}
      <div class="bl-list"><div class="bl-list-h"><span>Tus bots</span><small>${act.filter(isLive).length + (window.CCTClaudioUI && window.CCTClaudioUI.isOn() ? 1 : 0)} encendidos</small></div>
      ${(() => { const rows = list.map(botRow), cl = window.CCTClaudioUI ? window.CCTClaudioUI.card() : ''; if (cl) rows.splice(window.CCTClaudioUI.isOn() ? list.filter(isLive).length : list.filter(isLive).length, 0, cl); return rows.join(''); })()}
      ${list.length || window.CCTClaudioUI ? '' : `<div class="bl-empty0">${IC.robot}<p>Aún no tienes bots.</p><button class="bl-btn" data-a="new">${IC.plus}Crear mi primer bot</button></div>`}</div>
      ${arch.length ? `<button type="button" class="bl-link" data-a="toggleArch">${showArch ? 'Ocultar archivados' : `Ver archivados (${arch.length})`}</button>` : ''}
      <p class="bl-foot">Simulación y datos históricos: no se ejecutan órdenes reales.</p>`;
  }

  /* ----- Crear ----- */
  const NL_SYS = `Eres un asistente que convierte estrategias de trading escritas en español en una ESPECIFICACIÓN JSON ejecutable. Responde SOLO con un objeto JSON (sin texto extra) de UNA de estas dos formas:
1) Si falta información importante o hay ambigüedad (no inventes reglas): {"questions":["pregunta 1","pregunta 2"]} con máximo 4 preguntas cortas.
2) Si está claro: {"spec":{...}} con este esquema:
{"name":"...","symbol":"BTCUSDT","interval":"15m","sides":"long|short|both","entry":{"long":[COND],"short":[COND]},"exit":{"long":[COND],"short":[COND]},"filters":{"minVolRatio":0,"minAtrPct":0,"maxAtrPct":0,"hoursUtc":null},"risk":{"capital":10000,"riskPct":1,"sizePct":10,"maxLeverage":1,"atrLen":14,"sl":{"type":"atr|pct","v":2}|null,"tp":{"type":"rr|atr|pct","v":2}|null,"trail":{"type":"atr|pct","v":2}|null,"maxBars":0,"minBars":0,"maxDailyLossPct":0,"maxDrawdownPct":0},"costs":{"feePct":0.1,"slipPct":0.05}}
COND = {"a":OPERANDO,"op":"gt|lt|gte|lte|crossUp|crossDown|is","b":OPERANDO}  (con "is" no hay "b"; sirve para señales 1/0). Las condiciones de una lista se cumplen TODAS (AND) en entrada y basta UNA (OR) en salida.
OPERANDO = {"k":"close|open|high|low|volume|ema|sma|rsi|atr|adx|macd|macdSignal|macdHist|bbUp|bbMid|bbLo|volRatio|hh|ll|num|novaBuy|novaSell|novaOsc|novaFlux|novaAdx|novaBull", ...parámetros}. Parámetros: ema/sma/rsi/atr/adx/volRatio/hh/ll → "n"; macd* → "f","s","g"; bb* → "n","d"; num → "v".
Reglas: símbolos de Binance Spot terminados en USDT; temporalidades 1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w. Si el usuario no da stop loss o take profit, pregunta. Usa "sides":"long" salvo que pida ventas/cortos. Pon en "name" un nombre corto.`;
  function newView() {
    const ic = d => `<span class="bl-mic"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;
    if (!newLook && LK) newLook = LK.of({id: uidOf()});
    root.innerHTML = head('Crear nuevo bot', '¿Cómo quieres armarlo?', 'lib') + (LK ? `<p class="bl-sec">1 · Elige su color e icono</p>${LK.picker(newLook)}<p class="bl-sec">2 · ¿Cómo quieres armarlo?</p>` : '') + `<div class="bl-methods bl-methods2">
      <button class="bl-method" data-a="mA">${ic('<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>')}<b>Escríbelo en español <em>Recomendado</em></b><small>Ej.: «compra BTC en 1h cuando la EMA 20 cruce arriba de la 50, stop 2 %». La IA lo convierte en reglas y te las muestra antes de probar.</small></button>
      <button class="bl-method" data-a="mB">${ic('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><path d="M16.5 13v7M13 16.5h7"/>')}<b>Arma las reglas tú</b><small>Elige indicadores, condiciones, stop loss y take profit sin programar.</small></button>
      <button class="bl-method" data-a="mC">${ic('<path d="M4 18l5-6 4 3 7-9"/><circle cx="20" cy="6" r="1.6" fill="currentColor"/>')}<b>Usa un indicador</b><small>Opera con las señales de compra/venta de tus indicadores (como tu Signals) o de Nova Nexus.</small></button></div>
      <p class="bl-sec">O empieza con una plantilla</p><div class="bl-presets">${[['emaRsi', 'EMA 20/50 + RSI', 'Sigue la tendencia con confirmación de fuerza'], ['novaNexus', 'Nova Nexus + volumen', 'Señales de Nova Nexus con volumen alto'], ['macdTrend', 'Tendencia + MACD', 'Entra a favor de la tendencia con MACD']].map(x => `<button data-a="preset" data-k="${x[0]}"><b>${x[1]}</b><small>${x[2]}</small></button>`).join('')}</div>`;
  }
  function nlView() {
    root.innerHTML = head('Método A · Estrategia en español', 'La IA interpreta; tú confirmas antes de probar', 'newBack') + `<div class="bl-chat" id="blNl">${nl.msgs.map(m => `<div class="bl-msg ${m.role}">${m.html}</div>`).join('') || `<div class="bl-msg bot"><p>Cuéntame tu estrategia. Ejemplo: <i>«Bot para BTCUSDT en 15 minutos con EMA 20, EMA 50, RSI y volumen. Entra cuando se confirme una tendencia alcista, con stop loss y take profit dinámicos»</i>.</p></div>`}</div>
      ${nl.spec ? `<div class="bl-box"><h4>Esto es exactamente lo que haría el bot</h4>${mdLite(B.describeSpec(nl.spec))}<div class="bl-actions"><button class="bl-btn" data-a="nlOk">Confirmar y crear bot</button><button class="bl-btn ghost" data-a="nlEdit">Ajustar en el constructor</button></div></div>` : ''}
      <form class="bl-form" id="blNlForm"><textarea id="blNlIn" rows="3" placeholder="Describe tu estrategia o responde a mis preguntas…" maxlength="1500"></textarea><button class="bl-send" ${nl.busy ? 'disabled' : ''}>${nl.busy ? '…' : 'Enviar'}</button></form>`;
    const c = $('#blNl'); if (c) c.scrollTop = c.scrollHeight;
  }
  const mdLite = t => '<div class="bl-md">' + esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n').map(l => `<p>${l}</p>`).join('') + '</div>';
  function parseJSON(t) { const m = /\{[\s\S]*\}/.exec(String(t || '')); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } }
  async function nlSend(text) {
    text = String(text || '').trim(); if (!text || nl.busy) return; nl.busy = true; nl.msgs.push({role: 'user', html: `<p>${esc(text)}</p>`}); nl.hist.push({role: 'user', content: text}); nlView();
    try {
      let spec = null, out = null;
      for (let t = 0; t < 2 && !spec; t++) {
        const r = await LLM.chat([{role: 'system', content: NL_SYS}, ...nl.hist.slice(-8)], {maxTokens: 1400, temperature: .1, timeout: 90000}); out = parseJSON(r.text); nl.hist.push({role: 'assistant', content: r.text});
        if (out && out.questions && out.questions.length) { nl.msgs.push({role: 'bot', html: `<p><b>Antes de crear las reglas necesito aclarar:</b></p><ul>${out.questions.slice(0, 4).map(q => `<li>${esc(q)}</li>`).join('')}</ul><p class="bl-dim">Respóndeme en un mensaje (o dime «tú decides» solo si aceptas que elija un valor razonable).</p>`}); break; }
        if (out && out.spec) { const sp = B.normalizeSpec(out.spec), v = B.validateSpec(sp); if (v.ok) { spec = sp; break; } nl.hist.push({role: 'user', content: 'La especificación tiene errores: ' + v.errors.join('; ') + '. Corrígela y devuelve solo el JSON.'}); out = null; }
      }
      if (spec) { nl.spec = spec; nl.msgs.push({role: 'bot', html: '<p>Entendí la estrategia. Revisa abajo las reglas exactas; si algo no es lo que querías, ajústalo o dímelo.</p>'}); }
      else if (!(out && out.questions)) nl.msgs.push({role: 'bot', html: '<p>No pude convertirlo en reglas válidas. Intenta ser más específico (indicadores, condiciones de entrada y salida) o usa el constructor visual.</p>'});
    } catch (e) { nl.msgs.push({role: 'bot', html: `<p><b>No pude consultar la IA.</b> ${esc(LLM.friendly(e))} Puedes usar el constructor visual (método B), que no necesita IA.</p>`}); }
    nl.busy = false; nlView();
  }

  /* ----- Método C: indicadores propios ----- */
  let ind = {sym: 'BTCUSDT', itv: '1h', sid: '', busy: false, err: '', res: null, buy: '', sell: '', short: false};
  const guess = (list, re, hint) => (list.find(x => x.kind === 'señal' && re.test(x.label)) || list.find(x => x.kind === 'señal' && x.hint === hint) || {}).src || '';
  function indView() {
    const sc = (H.scripts && H.scripts()) || [], r = ind.res, sig = r ? r.sources.filter(x => x.kind === 'señal') : [], opt = (sel, none) => `<option value="">${none}</option>` + sig.map(x => `<option value="${esc(x.src)}" ${x.src === sel ? 'selected' : ''}>${esc(x.label)} · ${x.count} señales</option>`).join('');
    root.innerHTML = head('Método C · Con indicadores', 'Usa las señales de tus indicadores; no se modifican', 'newBack') +
      `<div class="bl-box"><h4>1 · Elige tu indicador</h4>${sc.length ? `<div class="bl-grid">${fld('Indicador', `<select id="indSid"><option value="">Elige uno…</option>${[[true, 'Mis indicadores'], [false, 'Catálogo de Vortex']].map(([o, t]) => sc.some(x => x.own === o) ? `<optgroup label="${t}">${sc.filter(x => x.own === o).map(x => `<option value="${esc(x.id)}" ${x.id === ind.sid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>` : '').join('')}</select>`)}${fld('Moneda', `<input id="indSym" list="blCoins2" value="${esc(ind.sym)}"><datalist id="blCoins2">${COINS.map(c => `<option value="${c}">`).join('')}</datalist>`)}${fld('Temporalidad', `<select id="indItv">${INTS.map(i => `<option ${i === ind.itv ? 'selected' : ''}>${i}</option>`).join('')}</select>`)}</div><div class="bl-actions"><button class="bl-btn" data-a="indScan" ${ind.busy || !ind.sid ? 'disabled' : ''}>${ind.busy ? 'Ejecutando tu indicador…' : 'Analizar sus señales'}</button></div>${note('Se ejecuta tu indicador sobre 3.000 velas históricas de Binance para ver qué señales produce. No se cambia nada en tu gráfico.')}` : note('Aún no tienes indicadores propios guardados en Vortex. Importa o crea uno en la sección de scripts/IA y vuelve aquí.')}${ind.err ? `<div class="bl-err">${esc(ind.err)}</div>` : ''}</div>` +
      (r ? `<div class="bl-box"><h4>2 · Señales detectadas</h4>${r.sources.length ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Fuente</th><th>Tipo</th><th>Cuántas</th></tr></thead><tbody>${r.sources.map(x => `<tr><td>${esc(x.label)}</td><td>${x.kind}</td><td>${x.count}</td></tr>`).join('')}</tbody></table></div>` : note('Tu indicador no produjo ninguna señal, etiqueta, forma ni línea en este historial.')}${!r.complete ? note('⚠ Tu indicador usa funciones que el motor de Pine aún no soporta del todo: puede faltar información.', 'warn') : ''}</div>
      ${sig.length ? `<div class="bl-box"><h4>3 · ¿Cuál es compra y cuál es venta?</h4><div class="bl-grid">${fld('Señal de COMPRA (entra largo)', `<select id="indBuy">${opt(ind.buy, 'Elige…')}</select>`)}${fld('Señal de VENTA (cierra el largo)', `<select id="indSell">${opt(ind.sell, 'Ninguna: saldrá por SL/TP')}</select>`)}</div><label class="bl-chk"><input type="checkbox" id="indShort" ${ind.short ? 'checked' : ''}> También operar en corto: vender con la señal de VENTA y cerrar con la de COMPRA</label>${note('Sugerí una asignación por los nombres; revísala. Stop loss y take profit empiezan en 2 ATR y 2R: puedes cambiarlos en el constructor.')}<div class="bl-actions"><button class="bl-btn" data-a="indOk" ${ind.buy ? '' : 'disabled'}>Crear bot y probar</button><button class="bl-btn ghost" data-a="indEdit" ${ind.buy ? '' : 'disabled'}>Ajustar en el constructor</button></div></div>` : ''}` : '');
  }
  function indSpec() {
    const sc = (H.scripts() || []).find(x => x.id === ind.sid) || {name: 'Mi indicador'}, mkOp = src => { const f = ind.res.sources.find(x => x.src === src); return {k: 'user', sid: ind.sid, src, sname: sc.name, sl: f ? f.label : src}; }, sp = B.defaultSpec();
    sp.name = sc.name + ' · bot'; sp.symbol = ind.sym; sp.interval = ind.itv; sp.sides = ind.short ? 'both' : 'long'; sp.entry.long = [{a: mkOp(ind.buy), op: 'is'}]; if (ind.sell) sp.exit.long = [{a: mkOp(ind.sell), op: 'is'}];
    if (ind.short && ind.sell) { sp.entry.short = [{a: mkOp(ind.sell), op: 'is'}]; sp.exit.short = [{a: mkOp(ind.buy), op: 'is'}]; } return B.normalizeSpec(sp);
  }
  async function indScan() {
    ind.busy = true; ind.err = ''; ind.res = null; indView();
    try { ind.sym = String(ind.sym).toUpperCase().replace(/[^A-Z0-9]/g, ''); const r = await userSources(ind.sid, ind.sym, ind.itv, 3000); ind.res = r; ind.buy = guess(r.sources, /compra|buy|long|alcista|bull|up\b/i, 'buy'); ind.sell = guess(r.sources, /venta|sell|short|bajista|bear|down/i, 'sell'); if (ind.sell === ind.buy) ind.sell = ''; }
    catch (e) { ind.err = String(e.message || e); } ind.busy = false; indView();
  }
  /* ----- Extras de métricas (calculadas de la curva de capital completa) ----- */
  function ext(res) {
    const days = new Map(); for (const p of res.equity) days.set(Math.floor(p.t / 864e5), p.e); const keys = [...days.keys()].sort((a, b) => a - b), rets = []; let prev = res.capital;
    for (const k of keys) { const e = days.get(k); rets.push([k * 864e5, (e - prev) / prev * 100]); prev = e; }
    const r = rets.map(x => x[1]), n = r.length || 1, mean = r.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / n), dsd = Math.sqrt(r.filter(x => x < 0).reduce((a, b) => a + b * b, 0) / n), ok = r.length >= 20;
    let cw = 0, cl = 0, mw = 0, ml = 0; for (const t of res.trades) { if (t.net > 0) { cw++; cl = 0; } else { cl++; cw = 0; } mw = Math.max(mw, cw); ml = Math.max(ml, cl); }
    const nets = res.trades.map(t => t.net);
    return {sharpe: ok && sd > 0 ? mean / sd * Math.sqrt(365) : null, sortino: ok && dsd > 0 ? mean / dsd * Math.sqrt(365) : null, maxWinStreak: mw, maxLossStreak: ml, avgBars: res.trades.length ? res.trades.reduce((a, t) => a + t.bars, 0) / res.trades.length : null, best: nets.length ? Math.max(...nets) : null, worst: nets.length ? Math.min(...nets) : null, dailyRet: rets.slice(-400)};
  }

  /* ----- Constructor visual (método B) ----- */
  const INTS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w'], COINS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT'];
  const getP = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o), setP = (o, p, v) => { const ks = p.split('.'), l = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[l] = v; };
  const short = l => String(l).replace(/ \(.*/, '');
  function opndHTML(path, o) {
    const def = B.OPERANDS[o.k] || {}, nova = !window.NovaNexus && def.nova;
    if (o.k === 'user') return `<span class="bl-opnd"><span class="bl-usr" title="Indicador propio (solo lectura)">${esc(o.sname || 'Indicador')} · ${esc(o.sl || o.src)}</span></span>`;
    return `<span class="bl-opnd"><select data-p="${path}.k" data-re="k" aria-label="Indicador">${Object.entries(B.OPERANDS).filter(([k]) => k !== 'user').map(([k, v]) => `<option value="${k}" ${k === o.k ? 'selected' : ''}>${esc(short(v.label))}</option>`).join('')}</select>${def.p ? Object.keys(def.p).map(pk => `<input type="number" step="any" data-p="${path}.${pk}" data-n="1" value="${o[pk] != null ? o[pk] : def.p[pk]}" aria-label="${pk}" title="${pk}">`).join('') : ''}${nova ? '<small class="bl-dim">Nova no cargado</small>' : ''}</span>`;
  }
  function condRows(list, path) {
    const L = getP(draft, path) || []; return L.map((c, i) => `<div class="bl-cond">${opndHTML(`${path}.${i}.a`, c.a)}<select data-p="${path}.${i}.op" data-re="op">${Object.entries(B.OPS).map(([k, v]) => `<option value="${k}" ${c.op === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>${c.op === 'is' ? '' : opndHTML(`${path}.${i}.b`, c.b || {k: 'num', v: 0})}<button class="bl-ib sm" data-a="rmc" data-list="${path}" data-i="${i}" aria-label="Quitar condición">✕</button></div>`).join('') || '<p class="bl-dim">Sin condiciones.</p>';
  }
  const listBlock = (title, path, hint) => `<div class="bl-box"><h4>${title}</h4>${hint ? note(hint) : ''}${condRows(null, path)}<button class="bl-mini" data-a="addc" data-list="${path}">+ Añadir condición</button></div>`;
  const fld = (label, inner) => `<label class="bl-f"><span>${label}</span>${inner}</label>`;
  const nin = (path, extra) => `<input type="number" step="any" data-p="${path}" data-n="1" value="${getP(draft, path) == null ? '' : getP(draft, path)}" ${extra || ''}>`;
  const lvl = (k, lab) => { const v = draft.risk[k]; return fld(lab, `<span class="bl-two"><select data-rk="${k}" data-part="type"><option value="none" ${!v ? 'selected' : ''}>Sin ${lab.toLowerCase()}</option>${(k === 'tp' ? [['rr', 'Múltiplo del riesgo (R)'], ['atr', 'Múltiplos de ATR'], ['pct', '% del precio']] : [['atr', 'Múltiplos de ATR'], ['pct', '% del precio']]).map(([a, b]) => `<option value="${a}" ${v && v.type === a ? 'selected' : ''}>${b}</option>`).join('')}</select>${v ? `<input type="number" step="any" data-rk="${k}" data-part="v" value="${v.v}">` : ''}</span>`);
  };
  function editView() {
    const d = draft, hrs = d.filters.hoursUtc;
    root.innerHTML = head(draftMeta.id ? 'Nueva versión de la estrategia' : 'Constructor visual', draftMeta.id ? 'Se guarda como versión candidata; la principal no cambia hasta que tú lo apruebes' : 'Define las reglas; se probarán con datos históricos reales', draftMeta.id ? 'backBot' : 'newBack') +
      (LK ? `<div class="bl-box"><h4>Personaje y color</h4><div class="bl-edlook">${LK.picker(draftMeta.id ? lookOf(getBot(draftMeta.id)) : (newLook = newLook || lookOf({id: uidOf()})))}</div></div>` : '') +
      `<div class="bl-box"><h4>General</h4><div class="bl-grid">${fld('Nombre', `<input type="text" data-p="name" value="${esc(d.name)}" maxlength="60">`)}${fld('Varias monedas (opcional, separadas por coma)', `<input type="text" data-basket="1" placeholder="Ej.: BTC, ETH, SOL" value="${esc((d.basket || []).map(x => x.replace(/USDT$/, '')).join(', '))}">`)}${fld('Moneda', `<input type="text" data-p="symbol" list="blCoins" value="${esc(d.symbol)}"><datalist id="blCoins">${COINS.map(c => `<option value="${c}">`).join('')}</datalist>`)}${fld('Temporalidades (puedes elegir varias)', `<div class="bl-tfs" role="group" aria-label="Temporalidades">${INTS.map(i => `<button type="button" data-a="tfPick" data-k="${i}" class="${ivsOf(d).includes(i) ? 'on' : ''}" aria-pressed="${ivsOf(d).includes(i)}">${i}</button>`).join('')}</div>`)}${fld('Operar en', `<select data-p="sides" data-re="op">${[['long', 'Solo compras (largos)'], ['short', 'Solo ventas (cortos)'], ['both', 'Compras y ventas']].map(([a, b]) => `<option value="${a}" ${d.sides === a ? 'selected' : ''}>${b}</option>`).join('')}</select>`)}</div></div>` +
      (d.sides !== 'short' ? listBlock('Entrada en COMPRA (se deben cumplir TODAS)', 'entry.long', 'Se evalúa al cierre de la vela; la orden simulada entra en la apertura de la siguiente.') + listBlock('Salida de la compra (basta UNA)', 'exit.long') : '') +
      (d.sides !== 'long' ? listBlock('Entrada en VENTA en corto (TODAS)', 'entry.short', 'El corto se simula sin tasas de financiación.') + listBlock('Salida del corto (basta UNA)', 'exit.short') : '') +
      `<div class="bl-box"><h4>Filtros de mercado</h4><div class="bl-grid">${fld('Volumen mínimo (× su media)', nin('filters.minVolRatio', 'min="0"'))}${fld('Volatilidad mínima (ATR % del precio)', nin('filters.minAtrPct', 'min="0"'))}${fld('Volatilidad máxima (ATR %)', nin('filters.maxAtrPct', 'min="0"'))}${fld('Horario UTC (opcional)', `<span class="bl-two"><input type="number" min="0" max="23" data-hr="0" value="${hrs ? hrs[0] : ''}" placeholder="desde"><input type="number" min="0" max="23" data-hr="1" value="${hrs ? hrs[1] : ''}" placeholder="hasta"></span>`)}</div><p class="bl-dim">0 = sin filtro.</p></div>` +
      `<div class="bl-box"><h4>Riesgo y capital</h4><div class="bl-grid">${fld('Capital inicial ($)', nin('risk.capital', 'min="10"'))}${fld('Riesgo por operación (% del capital)', nin('risk.riskPct', 'min="0.01" max="100"'))}${fld('Tamaño máximo (% del capital)', nin('risk.sizePct', 'min="1" max="100"'))}${lvl('sl', 'Stop loss')}${lvl('tp', 'Take profit')}${lvl('trail', 'Trailing stop')}${fld('Tiempo máximo (velas, 0 = sin límite)', nin('risk.maxBars', 'min="0"'))}${fld('Velas mínimas antes de cerrar por señal contraria (0 = sin espera)', nin('risk.minBars', 'min="0" max="500"'))}${fld('Pérdida diaria máxima (%, 0 = sin límite)', nin('risk.maxDailyLossPct', 'min="0"'))}${fld('Drawdown máximo antes de parar (%, 0 = sin límite)', nin('risk.maxDrawdownPct', 'min="0"'))}</div></div>` +
      `<div class="bl-box"><h4>Costes simulados</h4><div class="bl-grid">${fld('Comisión por lado (%)', nin('costs.feePct', 'min="0" step="0.01"'))}${fld('Deslizamiento (%)', nin('costs.slipPct', 'min="0" step="0.01"'))}</div><p class="bl-dim">Sin apalancamiento. Los resultados incluyen estos costes.</p></div>
      <div id="blErr" class="bl-err" hidden></div><div class="bl-actions"><button class="bl-btn" data-a="saveDraft">${draftMeta.id ? 'Guardar como versión candidata y probar' : 'Crear bot y probar'}</button><button class="bl-btn ghost" data-a="showDesc">Ver reglas en texto</button></div><div id="blDesc"></div>`;
  }
  function onField(el) {
    if (view !== 'edit' || !draft) return;
    if (el.dataset.rk) { const k = el.dataset.rk, part = el.dataset.part; if (part === 'type') draft.risk[k] = el.value === 'none' ? null : {type: el.value, v: draft.risk[k] ? draft.risk[k].v : 2}; else draft.risk[k] = Object.assign({}, draft.risk[k], {v: +el.value}); return part === 'type' ? editView() : 0; }
    if (el.dataset.basket) { const L = [...new Set(String(el.value).toUpperCase().split(/[\s,;]+/).map(x => x.replace(/[^A-Z0-9]/g, '')).filter(Boolean).map(x => /USDT$/.test(x) ? x : x + 'USDT'))]; if (L.length >= 2) { draft.basket = L.slice(0, 8); draft.symbol = draft.basket[0]; } else delete draft.basket; return; }
    if (el.dataset.hr != null) { const a = $$('[data-hr]', root).map(x => x.value); draft.filters.hoursUtc = a[0] !== '' && a[1] !== '' ? [+a[0], +a[1]] : null; return; }
    const p = el.dataset.p; if (!p) return; let v = el.dataset.n ? +el.value : el.value; if (p === 'symbol') v = String(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (el.dataset.re === 'k') { const base = p.slice(0, -2), def = B.OPERANDS[v] || {}; setP(draft, base, Object.assign({k: v}, def.p || {})); return editView(); }
    setP(draft, p, v); if (el.dataset.re === 'op') editView();
  }
  function startDraft(spec, meta) { draft = JSON.parse(JSON.stringify(B.normalizeSpec(spec))); draftMeta = meta || {id: null, method: 'visual'}; view = 'edit'; render(); }
  function saveDraft() {
    const sp = B.normalizeSpec(draft), v = B.validateSpec(sp), er = $('#blErr');
    if (!v.ok) { er.hidden = false; er.innerHTML = '<b>Revisa esto antes de continuar:</b><ul>' + v.errors.map(e => `<li>${esc(e)}</li>`).join('') + '</ul>'; er.scrollIntoView({block: 'center'}); return; }
    if (draftMeta.id) { const b = getBot(draftMeta.id); if (sp.name && sp.name !== b.name) b.name = sp.name; cur = b.id; tab = 'est'; sub.est = 'tips'; view = 'bot'; render(); testTip(b, {title: draftMeta.note || 'Edición manual de las reglas', spec: sp, manual: true}); } // tu edición manda: pasa a principal aunque rinda menos
    else { const b = newBot(sp, draftMeta.method, draftMeta.desc); S.bots.push(b); touch(b); cur = b.id; tab = 'sum'; view = 'bot'; render(); runAndShow(b, 1); }
  }
  async function runAndShow(b, v, bars) {
    bars = bars || (runOf(b) && runOf(b).reqBars) || 3000; busyMsg = 'Descargando velas de Binance y ejecutando el backtest…'; render();
    try { await runBot(b, v, bars); busyMsg = ''; } catch (e) { busyMsg = ''; toast('No se pudo ejecutar el backtest: ' + (e.message || e)); log(b, 'error', 'Backtest fallido: ' + (e.message || e)); touch(b); }
    if (view === 'bot' && cur === b.id) render();
  }

  /* ----- Panel del bot ----- */
  /* Pestañas agrupadas: 5 principales; las avanzadas viven como sub-pestañas para no saturar */
  const TABS = [['sum', 'Resumen'], ['diary', 'Operaciones'], ['est', 'Mejorar'], ['pap', 'En vivo'], ['more', 'IA']];
  const SUBS = {est: [['est', 'Reglas'], ['tips', 'Consejos y mejoras'], ['ver', 'Versiones']], more: [['ai', 'Asistente IA'], ['rob', 'Robustez'], ['cic', 'Reentrenar'], ['gr', 'Gráficos avanzados']]}, sub = {est: 'est', more: 'ai'};
  const metric = (l, v, c, tip) => `<div class="bl-m ${c || ''}" ${tip ? `title="${esc(tip)}"` : ''}><small>${l}</small><b>${v}</b></div>`;
  function botView() {
    const b = bot(); if (!b) { view = 'lib'; return render(); } const sp = mainSpec(b), run = runOf(b), live = isLive(b), bad = problem(b);
    if (!TABS.some(t => t[0] === tab)) { const g = Object.keys(SUBS).find(k => SUBS[k].some(x => x[0] === tab)); if (g) { sub[g] = tab; tab = g; } else tab = 'sum'; }
    const more = `<details class="bl-more"><summary aria-label="Más opciones">⋯</summary><div>${LK ? `<button class="bl-mini" data-a="lookOpen">Icono y color</button>` : ''}<button class="bl-mini" data-a="dup" data-id="${b.id}">Duplicar</button><button class="bl-mini" data-a="pause" data-id="${b.id}">${b.status === 'paused' ? 'Reanudar' : 'Pausar'}</button><button class="bl-mini" data-a="arch" data-id="${b.id}">${b.status === 'archived' ? 'Restaurar' : 'Archivar'}</button><button class="bl-mini" data-a="exp" data-id="${b.id}">Exportar</button><button class="bl-mini danger" data-a="del" data-id="${b.id}">Eliminar</button></div></details>`;
    const ntips = tipsOf(b).length;
    root.innerHTML = head(b.name, `${Array.isArray(sp.basket) && sp.basket.length ? sp.basket.map(x => x.replace('USDT', '')).join(' ') : sp.symbol} · ${ivsOf(sp).join(' · ')} · v${b.mainV}${live ? (bad ? ' · problema' : ' · en vivo') : (b.status === 'paused' ? ' · pausado' : '')}`, 'lib', more, avOf(b, 36)) +
      `<div class="bl-qa"><button class="bl-qbtn" data-a="quickRun" ${busyMsg ? 'disabled' : ''}><svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>${run ? 'Volver a probar' : 'Probar'}</button><button class="bl-qbtn" data-a="goImprove"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2.2 4.6 5 .7-3.6 3.5.9 5L12 14.5 7.5 16.8l.9-5L4.8 8.3l5-.7z"/></svg>Mejorar</button><button class="bl-qbtn ${live ? 'on' : ''} ${bad ? 'err' : ''}" data-a="quickSim"><span class="bl-dot d-${bad ? 'err' : live ? 'live' : 'draft'}"></span>${bad ? 'Problema · ver' : live ? 'En vivo' : 'Simular en vivo'}</button><button class="bl-qbtn ${b.sigOn ? 'on' : ''}" data-a="toChart" title="Pone las señales del bot en tu gráfico: cajitas COMPRA / VENTA con entrada, SL y TP"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19h16M6 15l3-4 3 2 4-6"/><path d="M17 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="currentColor"/></svg>${b.sigOn ? 'Quitar señales del gráfico' : 'Convertir bot a señales'}</button></div>` +
      `<div class="bl-qa2"><button class="bl-qbtn sm dc ${b.notify !== false ? 'on' : ''}" data-a="bell" title="Avisos de este bot a tu Discord"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>Avisos a Discord: ${b.notify !== false ? (b.dcDest === 'own' && HOOK_RE.test(b.dcHook || '') ? 'su canal' : 'sí') : 'no'}</button></div>` + (dcPanel === b.id ? dcBox(b) : '') + (lookPanel === b.id && LK ? `<div class="bl-box bl-lookbox open"><div class="bl-dc-h"><b>Icono y color de ${esc(b.name)}</b><button class="bl-mini" data-a="lookOpen">Listo</button></div>${LK.picker(lookOf(b))}</div>` : '') +
      (freshV && freshV.id === b.id && b.lastApply && b.lastApply.promoted ? `<div class="bl-newv"><span class="bl-ck">${CHECK}</span><div><b>Nueva versión aplicada: v${b.lastApply.v}</b><small>${esc(b.lastApply.title)}</small></div></div>` : '') +
      (busyMsg ? `<div class="bl-busy"><span class="bl-spin"></span>${esc(busyMsg)}</div>` : '') + (marksOn ? replayBar() : '') +
      `<div class="bl-tabs bl-tabs5" role="tablist">${TABS.map(([k, l]) => `<button role="tab" class="${tab === k ? 'on' : ''}" data-a="tab" data-k="${k}">${l}${k === 'est' && ntips ? '<i class="bl-tabdot"></i>' : ''}</button>`).join('')}</div>` +
      (tab === 'more' ? '<h3 class="bl-aih"><span>IA</span>Mejorar con IA</h3>' : '') + (SUBS[tab] ? `<div class="bl-subs">${SUBS[tab].map(([k, l]) => `<button class="${sub[tab] === k ? 'on' : ''}" data-a="sub" data-k="${k}">${l}</button>`).join('')}</div>` : '') + `<div id="blTab"></div>`;
    const k = SUBS[tab] ? sub[tab] : tab;
    ({sum: tabSum, gr: tabGr, rob: tabRob, diary: tabDiary, ver: tabVer, pap: tabPap, cic: tabCic, ai: tabAi, est: tabRules, tips: tabEst}[k] || tabSum)(b, run);
    if (tab === 'sum') { dashBind(); countUp(); }
  }
  /* ───────── Línea de producción del bot (vista «fábrica») ─────────
     El bot como una maquinaria: el motor arranca (engranes) → opera (cuántas operaciones y si hay una abierta) → resultados (rendimiento y aciertos)
     → mejora (versiones y reentrenamiento). Las estaciones se conectan con hilos animados; cada estación abre su pestaña. Solo datos guardados. */
  /* Salud del bot: qué le falta o qué está fallando y cómo componerlo. Si hay un error, la máquina se ve apagada hasta que se arregle. */
  function health(b) {
    const out = [], sp = mainSpec(b); let v = {ok: true, errors: []}; try { v = B.validateSpec(sp); } catch (e) { v = {ok: false, errors: [String(e.message || e)]}; }
    const fixOf = e => /ENTRADA/i.test(e) ? ['Agrega en Editar al menos una regla de cuándo entrar (por ejemplo «RSI cruza arriba de 30»).', 'vedit'] : /indicador desconocido|user/i.test(e) ? ['Una regla usa un indicador que ya no está: cámbialo por otro o bórrala en Editar.', 'vedit']
      : /stop|tamaño|riesgo|apalanc|capital|take profit|trailing/i.test(e) ? ['En Editar › Riesgo pon un stop loss (o un % del capital por operación) con valores válidos.', 'vedit'] : /símbolo|moneda|basket|canasta/i.test(e) ? ['Elige una moneda válida en Editar (por ejemplo BTCUSDT).', 'vedit'] : ['Ábrelo en Editar y corrige ese dato.', 'vedit'];
    for (const e of v.errors.slice(0, 5)) { const [fix, a] = fixOf(e); out.push({lvl: 'err', t: e, fix, a}); }
    for (const x of (b.paper || []).filter(x => x.status === 'running')) {
      if (x.err) out.push({lvl: 'err', t: `En vivo (${x.spec.symbol.replace('USDT', '')} ${x.spec.interval}) se trabó: ${String(x.err).slice(0, 140)}`, fix: 'Toca «Arreglarlo»: lo vuelvo a intentar y corrijo solo lo que se pueda (por ejemplo, una señal que no salió en estas velas ya no detiene al bot).', a: 'pap'});
      { const iv = B.IV_MS[x.spec.interval] || 36e5, lastT = (x.last && x.last.t) || x.anchorT || x.startT || 0, late = Date.now() - (lastT + iv); // ¿de verdad está avanzando?
        if (!x.err && lastT && late > 3 * iv + 20 * 6e4) out.push({lvl: 'err', t: `En vivo (${x.spec.symbol.replace('USDT', '')} ${x.spec.interval}) no ha avanzado desde hace ${late > 864e5 ? Math.round(late / 864e5) + ' día(s)' : Math.max(1, Math.round(late / 36e5)) + ' h'}.`, fix: 'Toca «Arreglarlo»: lo pongo al día con las velas que faltan.', a: 'pap'}); }
      if (x.halted) out.push({lvl: 'warn', t: 'El control de riesgo detuvo sus entradas.', fix: 'Revisa el riesgo de tu cartera; cuando baje, vuelve a operar solo.', a: 'pap'});
    }
    if (v.ok && !runOf(b)) out.push({lvl: 'warn', t: 'Todavía no lo has probado.', fix: 'Toca «Probar» para ver cómo le habría ido con velas reales.', a: 'quickRun'});
    return out;
  }
  /* «Arreglarlo»: vuelve a intentar lo que se trabó con la corrección automática (una señal que no salió en estas velas ya no es error;
     una línea que cambió de nombre se busca sola). Si no se puede solo, dice exactamente qué hacer. */
  async function fixBot(b) {
    const ss = (b.paper || []).filter(x => x.status === 'running' && (x.err || Date.now() - (((x.last && x.last.t) || x.startT || 0) + (B.IV_MS[x.spec.interval] || 36e5)) > 3 * (B.IV_MS[x.spec.interval] || 36e5) + 20 * 6e4)); busyMsg = 'Arreglando…'; render(); let left = [];
    for (const x of ss) { x.err = null; try { await paperUpdate(b, x, true); } catch {} if (x.err) left.push(x.err); }
    if (!ss.length) { const v = B.validateSpec(mainSpec(b)); if (!v.ok) left = v.errors; }
    busyMsg = ''; touch(b); render();
    toast(!left.length ? 'Listo: ya funciona otra vez.' : /ya no existe|No encuentro ese indicador/i.test(left[0]) ? 'Ese indicador ya no está en tu cuenta: vuelve a agregarlo o cambia esa regla en Mejorar › Reglas.' : 'Todavía falla: ' + String(left[0]).slice(0, 160));
  }
  const problem = b => isLive(b) && health(b).some(x => x.lvl === 'err' || (x.lvl === 'warn' && x.a !== 'quickRun')); // en vivo pero con algo mal → naranja
  function healthBox(b, H) {
    if (!H.length) return ''; const bad = H.some(x => x.lvl === 'err'), btn = a => a === 'vedit' ? `<button class="bl-mini pri" data-a="vedit" data-v="${b.mainV}">Componerlo</button>` : a === 'quickRun' ? `<button class="bl-mini" data-a="quickRun">Probar</button>` : a === 'pap' ? `<button class="bl-mini pri" data-a="fixBot" ${busyMsg ? 'disabled' : ''}>Arreglarlo</button>` : `<button class="bl-mini" data-a="tab" data-k="${a}">Ver</button>`;
    return `<div class="bh ${bad ? 'err' : 'warn'}"><div class="bh-h"><span class="bh-ic">${bad ? '!' : 'i'}</span><div><b>${bad ? 'La máquina está detenida' : 'Le falta algo'}</b><small>${bad ? 'Arregla esto y vuelve a arrancar sola.' : 'Funciona, pero conviene revisarlo.'}</small></div></div>
      <ul>${H.map(x => `<li class="${x.lvl}"><div><b>${esc(x.t)}</b><small>Cómo componerlo: ${esc(x.fix)}</small></div>${btn(x.a)}</li>`).join('')}</ul></div>`;
  }
  function factory(b, run) {
    const live = isLive(b), lv = liveOf(b), m = run && run.metrics, ops = lv ? lv.nClosed : m ? m.n : 0, open = lv ? lv.open.length : 0;
    const res = lv ? lv.retPct : m ? m.retPct : null, wr = lv ? lv.winRate : m ? m.winRate : null, nV = b.versions.length;
    const prev = b.versions.filter(v => v.v !== b.mainV && v.v < b.mainV && v.state !== 'descartada' && v.state !== 'prueba' && runOf(b, v.v)).slice(-1)[0], rPrev = prev && runOf(b, prev.v), imp = m && rPrev ? m.retPct - rPrev.metrics.retPct : null;
    const HL = health(b), broken = HL.some(x => x.lvl === 'err') || (live && HL.some(x => x.lvl === 'warn' && x.a !== 'quickRun')), st = broken ? 'broken' : live ? 'on' : b.status === 'paused' ? 'pause' : 'off', col = colOf(b.id), pc = c => c == null ? '' : c >= 0 ? 'up' : 'dn';
    const lv2 = b.versions.filter(v => v.v > 1).slice(-1)[0], oh = (b.optHistory || []).slice(-1)[0], lesson = (oh && (!lv2 || oh.at > lv2.at)) ? (decText[oh.decision] || [oh.decision])[0] : lv2 ? `v${lv2.v}: ${String(lv2.note || 'nueva versión').replace(/^Consejo: /, '')}${lv2.state === 'descartada' ? ' (no mejoró, la descartó)' : ''}` : '';
    const gear = (r, cx, cy, cls) => { let d = ''; const n = 8, ro = r, ri = r * .74; for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, rr = i % 2 ? ri : ro, a2 = (i + 1) / (n * 2) * Math.PI * 2; d += `${i ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}L${(cx + rr * Math.cos(a2)).toFixed(1)} ${(cy + rr * Math.sin(a2)).toFixed(1)}`; } return `<g class="bf-gear ${cls}" style="transform-origin:${cx}px ${cy}px"><path d="${d}Z"/><circle cx="${cx}" cy="${cy}" r="${(r * .32).toFixed(1)}" class="bf-hole"/></g>`; };
    const wire = i => `<svg class="bf-wire" viewBox="0 0 60 20" preserveAspectRatio="none" style="--d:${.25 + i * .35}s"><path class="bf-w0" d="M0 10 C20 10 40 10 60 10"/><path class="bf-w1" d="M0 10 C20 10 40 10 60 10"/><circle class="bf-spark" r="2.2" cy="10" opacity="0"><animate attributeName="cx" from="0" to="60" dur="1.6s" begin="${(.3 + i * .45).toFixed(2)}s" repeatCount="${st === 'on' ? 'indefinite' : '2'}"/><animate attributeName="opacity" values="0;1;1;0" dur="1.6s" begin="${(.3 + i * .45).toFixed(2)}s" repeatCount="${st === 'on' ? 'indefinite' : '2'}"/></circle></svg>`;
    const ring2 = v => { const p = Math.max(0, Math.min(100, v || 0)), c = 2 * Math.PI * 17; return `<svg class="bf-ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" class="bf-rb"/><circle cx="20" cy="20" r="17" class="bf-rf ${p >= 50 ? 'up' : 'mid'}" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 20 20)"/><text x="20" y="24">${v == null ? '—' : Math.round(v)}</text></svg>`; };
    return `<div class="bf-wrap"><div class="bf bf-${st}" style="--bc:${col}">
      <button type="button" class="bf-st bf-motor" data-a="tab" data-k="pap" style="--i:0" title="Motor del bot: En vivo">
        <svg class="bf-gears" viewBox="0 0 64 48">${gear(15, 22, 26, 'g1')}${gear(10, 45, 16, 'g2')}${gear(8, 47, 37, 'g3')}</svg>
        <div class="bf-mt"><span class="bf-av">${avOf(b, 26)}</span><b>${esc(b.name)}</b></div>
        <span class="bf-led"><i></i>${broken ? 'Problema' : live ? 'Encendido' : st === 'pause' ? 'En pausa' : 'Apagado'}</span>
      </button>${wire(0)}
      <button type="button" class="bf-st" data-a="tab" data-k="diary" style="--i:1" title="Operaciones">
        <svg class="bf-ic" viewBox="0 0 24 24"><path d="M4 18 9 12l4 3 7-8"/><path d="M15 7h5v5"/></svg>
        <b class="bf-big" data-cu="${ops}">${ops}</b><small>operaciones${lv ? ' en vivo' : m ? ' (prueba)' : ''}</small>
        ${open ? `<span class="bf-open"><i></i>${open} abierta${open > 1 ? 's' : ''}</span>` : `<span class="bf-sub">${live ? 'esperando señal' : '—'}</span>`}
      </button>${wire(1)}
      <button type="button" class="bf-st" data-a="tab" data-k="gr" style="--i:2" title="Resultados">
        ${ring2(wr)}<b class="bf-big ${pc(res)}" ${res == null ? '' : `data-cu="${res.toFixed(1)}" data-dec="1" data-pre="${res >= 0 ? '+' : ''}" data-suf=" %"`}>${res == null ? '—' : (res >= 0 ? '+' : '') + num(res, 1) + ' %'}</b><small>resultado · aciertos ${wr == null ? '—' : Math.round(wr) + ' %'}</small>
      </button>${wire(2)}
      <button type="button" class="bf-st" data-a="tab" data-k="ver" style="--i:3" title="Mejora">
        <svg class="bf-ic" viewBox="0 0 24 24"><path d="M12 3l2.2 4.6 5 .7-3.6 3.5.9 5L12 14.5 7.5 16.8l.9-5L4.8 8.3l5-.7z"/></svg>
        <b class="bf-big">v${b.mainV}</b><small>${nV} versión${nV === 1 ? '' : 'es'}${imp != null ? ` · <span class="${pc(imp)}">${imp >= 0 ? '+' : ''}${num(imp, 1)} % vs v${prev.v}</span>` : ''}</small>
        <span class="bf-sub">se mejora solo cada día</span>
      </button>
    </div>
    <button type="button" class="bf-back bf-${st}" data-a="tab" data-k="ver" style="--bc:${col}" title="Lo que aprende vuelve al bot">
      <svg class="bf-loop" viewBox="0 0 1000 34" preserveAspectRatio="none"><path class="bf-l0" d="M880 0 V12 Q880 26 866 26 H134 Q120 26 120 12 V0"/><path class="bf-l1" d="M880 0 V12 Q880 26 866 26 H134 Q120 26 120 12 V0"/>
        <circle class="bf-lsp" r="3.2"><animateMotion dur="3.6s" repeatCount="indefinite" path="M880 0 V12 Q880 26 866 26 H134 Q120 26 120 12 V0"/></circle></svg>
      <span class="bf-lesson"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/></svg><b>Aprende de sí mismo</b>${lesson ? `<em>${esc(lesson)}</em>` : '<em>sus operaciones regresan como experiencia</em>'}</span>
    </button>${healthBox(b, HL)}</div>`;
  }
  /* Versiones que salieron de un consejo, reentrenamiento u optimización */
  const isTip = v => /consejo|asistente|reentren|optimiz|mejora autom|servidor/i.test(String(v.origin || '') + ' ' + String(v.note || ''));
  /* Consejos que decidiste ignorar: no vuelven a salir (y dejan lugar a otros) */
  const tipKey = t => String(t.title || '') + '|' + JSON.stringify(t.patch || {});
  /* Un consejo ignorado vuelve si el bot sigue fallando en eso: la IA lo vuelve a proponer con datos nuevos (otra prueba o reentrenamiento)
     o ya cerró 15 operaciones en vivo más desde que lo ignoraste. */
  const liveClosed = b => (b.paper || []).reduce((a, x) => a + (x.ledger || []).length, 0);
  const ignRec = (b, t) => (b.ignoredTips || []).map(x => typeof x === 'string' ? {k: x} : x).find(x => x.k === tipKey(t));
  const tipBack = (b, t) => { const r = ignRec(b, t); if (!r) return false; const run = runOf(b); return (run && r.run !== run.id) || liveClosed(b) - (r.n || 0) >= 15; };
  const ignoredTip = (b, t) => !!ignRec(b, t) && !tipBack(b, t);
  /* ───────── Operaciones fáciles de ver: línea de precio con cada operación marcada (dónde compró, dónde vendió y cuánto ganó) ───────── */
  function simpleTrades(host, C, trades, open, opts) {
    const W = Math.max(280, host.clientWidth || 600), H = 220, P = {l: 8, r: 58, t: 14, b: 22}; if (!C || C.length < 2) { host.innerHTML = note('Sin velas para dibujar.'); return; }
    const t0 = Math.min(C[0].t, ...trades.map(t => t.entryT).filter(Number.isFinite)), C2 = C.filter(c => c.t >= t0 - 1), cs = C2.length > 1 ? C2 : C, tA = cs[0].t, tB = cs[cs.length - 1].t;
    const lo = Math.min(...cs.map(c => c.l)), hi = Math.max(...cs.map(c => c.h)), X = t => P.l + (t - tA) / Math.max(1, tB - tA) * (W - P.l - P.r), Y = p => P.t + (hi - p) / Math.max(1e-9, hi - lo) * (H - P.t - P.b);
    const step = Math.max(1, Math.floor(cs.length / 400)), line = cs.filter((c, i) => i % step === 0 || i === cs.length - 1).map((c, i) => `${i ? 'L' : 'M'}${X(c.t).toFixed(1)} ${Y(c.c).toFixed(1)}`).join('');
    const vis = trades.filter(t => t.exitT >= tA).slice(-60), fmtP = v => num(v, v >= 100 ? 2 : 4);
    const segs = vis.map((t, i) => { const x1 = X(t.entryT), x2 = X(t.exitT), y1 = Y(t.entry), y2 = Y(t.exit), w = t.net > 0, lg = !/short|sell/i.test(t.side);
      return `<g class="st-t ${w ? 'w' : 'l'}" style="--i:${i}"><title>${lg ? 'Compró' : 'Vendió en corto'} a ${fmtP(t.entry)} · ${lg ? 'vendió' : 'recompró'} a ${fmtP(t.exit)} · ${money(t.net)}</title><rect x="${x1.toFixed(1)}" y="${P.t}" width="${Math.max(1, x2 - x1).toFixed(1)}" height="${H - P.t - P.b}" class="st-band"/><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="st-seg"/><path class="st-in ${lg ? 'lg' : 'sh'}" d="${lg ? `M${x1.toFixed(1)} ${(y1 + 3).toFixed(1)} l-5 8 h10z` : `M${x1.toFixed(1)} ${(y1 - 3).toFixed(1)} l-5 -8 h10z`}"/><circle class="st-out" cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="3.5"/></g>`; }).join('');
    const op = open ? (() => { const x1 = X(open.entryT), y1 = Y(open.entry), lg = !/short|sell/i.test(open.side); return `<g class="st-open"><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${(W - P.r).toFixed(1)}" y2="${y1.toFixed(1)}"/><path class="st-in ${lg ? 'lg' : 'sh'}" d="${lg ? `M${x1.toFixed(1)} ${(y1 + 3).toFixed(1)} l-5 8 h10z` : `M${x1.toFixed(1)} ${(y1 - 3).toFixed(1)} l-5 -8 h10z`}"/><text x="${(W - P.r + 4).toFixed(1)}" y="${(y1 + 4).toFixed(1)}">abierta</text></g>`; })() : '';
    const ax = [hi, (hi + lo) / 2, lo].map(p => `<text class="st-ax" x="${(W - P.r + 4).toFixed(1)}" y="${(Y(p) + 4).toFixed(1)}">${fmtP(p)}</text>`).join('');
    const wins = vis.filter(t => t.net > 0).length, last = vis.slice(-6).reverse();
    host.innerHTML = `<div class="st-legend"><span><i class="lg"></i>compra</span><span><i class="sh"></i>venta en corto</span><span><i class="ot"></i>salida</span><span class="st-sum"><b class="pos">${wins}</b> ganadas · <b class="neg">${vis.length - wins}</b> perdidas</span></div>
      <svg class="st" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path class="st-line" d="${line}"/>${segs}${op}${ax}</svg>
      <div class="st-cards">${last.map(t => { const lg = !/short|sell/i.test(t.side), ch = (t.exit / t.entry - 1) * 100 * (lg ? 1 : -1), hrs = (t.exitT - t.entryT) / 36e5; return `<div class="st-c ${t.net > 0 ? 'w' : 'l'}"><span class="st-side">${lg ? 'Compró' : 'Corto'}</span><div class="st-pr"><b>${fmtP(t.entry)}</b><i>→</i><b>${fmtP(t.exit)}</b></div><div class="st-res"><b class="${cls(t.net)}">${pct(ch)}</b><small>${money(t.net)} · ${hrs >= 24 ? num(hrs / 24, 1) + ' d' : num(hrs, 1) + ' h'}</small></div></div>`; }).join('')}</div>
      ${opts && opts.candles ? `<button type="button" class="bl-mini st-candles" data-a="tcCandles">Ver con velas</button>` : ''}`;
  }
  /* ───────── Cómo aprende el bot: el ciclo que se repite (opera → recuerda → analiza → prueba variantes → se queda con la mejor → vuelve a operar)
     con una luz que lo recorre, sus números reales y lo último que aprendió. Todo sale de lo guardado (versiones, experimentos, reentrenamiento). */
  function learnLoop(b, run) {
    const c = cyc(b), lv = liveOf(b), m = run && run.metrics, trades = lv ? lv.nClosed : m ? m.n : 0, exps = (b.optHistory || []).length, nV = b.versions.length;
    const firstRun = b.versions.map(v => runOf(b, v.v)).find(Boolean), gain = m && firstRun && firstRun !== run ? m.retPct - firstRun.metrics.retPct : null;
    const every = c.everyHours >= 168 ? 'cada semana' : c.everyHours >= 72 ? 'cada 3 días' : 'cada día', last = b.server && b.server.at;
    const N = [['Opera', `${trades} op.`, 'diary'], ['Recuerda', `${(b.journal || []).length} notas`, 'diary'], ['Analiza', c.enabled ? every : 'apagado', 'cic'], ['Prueba variantes', `${exps} pruebas`, 'cic'], ['Se queda con la mejor', `v${b.mainV} de ${nV}`, 'ver']];
    const R = 104, C = 150, pt = i => { const a = (-90 + i * 72) * Math.PI / 180; return [C + R * Math.cos(a), C + R * Math.sin(a)]; };
    const ICS = ['<path d="M-7 4 -2-1l3 2 6-6"/>', '<rect x="-6" y="-7" width="12" height="14" rx="2"/><path d="M-3-2h6M-3 2h6"/>', '<circle r="5"/><path d="M4 4l4 4"/>', '<path d="M-6 6V-1M0 6V-6M6 6V2"/>', '<path d="M0-7l2 4.5 5 .5-3.7 3.3 1 5L0 3.6-4.3 6.3l1-5L-7-2l5-.5z"/>'];
    const nodes = N.map(([t, v, k], i) => { const [x, y] = pt(i), lx = x + (x > C + 5 ? 27 : x < C - 5 ? -27 : 0), ly = y + (y < C - 50 ? -44 : y > C + 50 ? 36 : 4), anc = x > C + 5 ? 'start' : x < C - 5 ? 'end' : 'middle';
      return `<g class="ll-n" data-a="tab" data-k="${k}" style="--i:${i}"><circle class="ll-halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="23"/><circle class="ll-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="19"/><g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" class="ll-ic">${ICS[i]}</g><text class="ll-t" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anc}">${esc(t)}</text><text class="ll-v" x="${lx.toFixed(1)}" y="${(ly + 14).toFixed(1)}" text-anchor="${anc}">${esc(v)}</text></g>`; }).join('');
    const ring = `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - .01} ${C - R}`;
    const ev = b.versions.filter(v => v.v > 1).map(v => ({at: v.at, txt: `v${v.v} · ${v.note || 'nueva versión'}`, k: v.v === b.mainV ? 'on' : v.state === 'descartada' ? 'off' : ''}))
      .concat((b.optHistory || []).map(h => ({at: h.at, txt: (decText[h.decision] || [h.decision])[0] + (h.oos != null ? ` · candidata ${money(h.oos)} vs actual ${money(h.base)}` : ''), k: h.decision === 'propuesta' ? 'on' : ''})))
      .sort((a, z) => (z.at || 0) - (a.at || 0)).slice(0, 5);
    const feed = ev.length ? ev.map((e, i) => `<li class="ll-e ${e.k}" style="--i:${i}"><i></i><div><b>${esc(e.txt)}</b><small>${e.at ? dt(e.at) : ''}</small></div></li>`).join('') : '<li class="ll-e" style="--i:0"><i></i><div><b>Todavía no aprende nada nuevo</b><small>En cuanto opere y corra su primer reentrenamiento, aquí verás qué cambió.</small></div></li>';
    return `<div class="ll-wrap"><div class="ll ${health(b).some(x => x.lvl === 'err') || problem(b) ? 'll-broken' : isLive(b) ? 'll-live' : ''}" style="--bc:${colOf(b.id)}">
      <div class="ll-h"><h4>Cómo aprende</h4><small>${c.enabled ? `se reentrena ${every}${last ? ' · último ' + dt(last) : ''}` : 'ciclo automático apagado (actívalo en IA › Reentrenar)'}</small></div>
      <div class="ll-body"><svg class="ll-svg" viewBox="-95 -10 490 330"><path class="ll-ring" d="${ring}"/><path class="ll-ring2" d="${ring}"/>
        <circle class="ll-run" r="5"><animateMotion dur="7s" repeatCount="indefinite" path="${ring}"/></circle><circle class="ll-run t" r="3"><animateMotion dur="7s" begin="-.18s" repeatCount="indefinite" path="${ring}"/></circle>
        ${nodes}
        <g class="ll-core"><circle cx="${C}" cy="${C}" r="44"/><text x="${C}" y="${C - 6}" class="ll-ct">${gain == null ? 'v' + b.mainV : (gain >= 0 ? '+' : '') + num(gain, 1) + ' %'}</text><text x="${C}" y="${C + 12}" class="ll-cs">${gain == null ? 'versión actual' : 'desde su v1'}</text></g></svg>
        <div class="ll-side"><p class="ll-why">Cada ciclo usa sus propias operaciones: revisa qué le funcionó y qué no, prueba ajustes (stop, objetivo, filtros) con datos que no vio y solo se queda con un cambio si gana. Así lo que aprende <b>regresa a él</b> en la siguiente operación.</p>
          <h5>Lo último que aprendió</h5><ul class="ll-feed">${feed}</ul></div></div></div></div>`;
  }
  /* Números que suben solos al abrir (operaciones, versiones…) */
  function countUp() { if (!root) return; root.querySelectorAll('[data-cu]').forEach(el => { const to = +el.dataset.cu, pre = el.dataset.pre || '', suf = el.dataset.suf || '', dec = +el.dataset.dec || 0; if (!Number.isFinite(to)) return; const t0 = performance.now(), D = 900; const f = t => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3), v = to * e; el.textContent = pre + (to >= 0 && pre === '±' ? '+' : '') + v.toLocaleString('es', {minimumFractionDigits: dec, maximumFractionDigits: dec}) + suf; if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); }); }
  /* Vista general visual del bot: rendimiento grande, curva de capital interactiva (backtest y/o en vivo), ranking y actividad */
  function overview(b, run) {
    const col = colOf(b.id), ser = [];
    if (run && run.equity && run.equity.length > 1) { const cap = ((mainSpec(b).risk || {}).capital) || run.equity[0][1] || 1; ser.push({k: 'bt', id: b.id, name: 'Backtest', col, pts: run.equity.map(p => [p[0], (p[1] / cap - 1) * 100])}); }
    { const lv0 = liveOf(b); if (lv0 && lv0.curve.length > 1) ser.push({k: 'live', id: b.id, name: 'En vivo v' + lv0.v, col: '#f0b90b', pts: lv0.curve.map(p => [p[0], (p[1] / lv0.capital - 1) * 100])}); }
    dash.ser = ser; const W = Math.max(280, Math.min(1400, (root.clientWidth || 360) - 34)); dash.w = root.clientWidth;
    const m = run && run.metrics, lv = liveOf(b), st = lv;
    const big = m ? {lab: 'Historia (backtest)', v: m.retPct, sub: `${dd(run.from)} – ${dd(run.to)} · ${run.bars} velas`} : null, so = lv;
    const kpi = (lab, val, ring2) => `<div class="bo-k">${ring2 || ''}<div><small>${lab}</small><b>${val}</b></div></div>`;
    const ranked = S.bots.filter(x => x.status !== 'archived' && runOf(x)).map(x => ({b: x, r: runOf(x).metrics.retPct})).sort((a, c) => c.r - a.r), pos = ranked.findIndex(x => x.b.id === b.id), mx = Math.max(1, ...ranked.map(x => Math.abs(x.r)));
    const rank = ranked.length > 1 && pos >= 0 ? `<div class="bd-card"><div class="bd-ch"><h4>Ranking</h4><small>#${pos + 1} de ${ranked.length}</small></div>${ranked.slice(0, 6).concat(pos >= 6 ? [ranked[pos]] : []).map(x => `<button type="button" class="bo-rk ${x.b.id === b.id ? 'me' : ''}" data-a="open" data-id="${x.b.id}"><span>${ranked.indexOf(x) + 1}</span><b>${esc(x.b.name)}</b><i><em class="${x.r >= 0 ? 'up' : 'dn'}" style="width:${(Math.abs(x.r) / mx * 100).toFixed(0)}%"></em></i><span class="${cls(x.r)}">${pct(x.r)}</span></button>`).join('')}</div>` : '';
    const feed = (b.journal || []).slice(-8).reverse().map(j => `<div class="bd-ev"><i style="background:${col}"></i><div><span class="bd-kind">${esc(j.kind)}</span><small>${esc(String(j.text).slice(0, 140))}</small></div><time>${dt(j.t)}</time></div>`).join('');
    const liveBox = st ? `<div class="bo-live"><div class="bo-live-h"><span class="bl-dot d-${problem(b) ? 'err' : 'live'}"></span><b>${problem(b) ? 'Con problema · ' : ''}En vivo desde ${dt(so.startT)}</b><small>empezó en cero · v${so.v}${so.symbols.length > 1 ? ' · ' + so.symbols.map(x => x.replace('USDT', '')).join(', ') : ''}</small></div><div class="bo-ks">${kpi('Resultado', `<span class="${cls(st.retPct)}">${pct(st.retPct)}</span>`)}${kpi('Operaciones cerradas', st.nClosed)}${kpi('Aciertos', st.winRate == null ? '—' : num(st.winRate, 0) + ' %')}${kpi('Posición', so.open.length ? `<span class="pos">${so.open.length} abierta${so.open.length === 1 ? '' : 's'}</span>` : 'Esperando señal')}</div>${st.nClosed === 0 ? '<small class="bl-dim">Solo cuenta lo que pasa DESPUÉS de encenderlo; abajo está su historia (backtest), que es otra cosa.</small>' : ''}</div>` : '';
    const vers = b.versions.slice().reverse().slice(0, 6).map(v => { const r = runOf(b, v.v), on = v.v === b.mainV; return `<div class="bo-ver ${on ? 'on' : ''}"><span class="bo-vn">${/consejo|edición/i.test(v.origin || '') && v.state !== 'descartada' ? '<i class="bo-ck">✓</i>' : ''}v${v.v}</span><div><b>${esc(v.note || 'Versión')}</b><small>${dt(v.at)} · ${esc(v.origin || '')}${on ? ' · <em>principal</em>' : v.state === 'descartada' ? ' · descartada' : ''}</small></div>${r ? `<span class="${cls(r.metrics.retPct)}">${pct(r.metrics.retPct)}<small>${r.metrics.winRate == null ? '—' : num(r.metrics.winRate, 0) + ' %'} aciertos</small></span>` : '<span class="bl-dim">sin probar</span>'}</div>`; }).join('');
    const updates = b.versions.length > 1 ? `<div class="bd-card"><div class="bd-ch"><h4>Cambios aplicados</h4><small>${b.versions.length} versiones</small></div>${vers}</div>` : '';
    if (!big) return factory(b, run) + learnLoop(b, run) + liveBox + `<div class="bo-hero empty"><div class="bd-hero-ic">${IC.robot}</div><h3>Pruébalo para ver sus resultados</h3><p>Toca <b>Probar</b>: se ejecuta con velas reales de Binance y aquí verás su curva de capital, aciertos y caída máxima.</p><button class="bl-btn" data-a="quickRun" ${busyMsg ? 'disabled' : ''}>Probar ahora</button></div>`;
    return factory(b, run) + learnLoop(b, run) + liveBox + `<div class="bo-hero"><div class="bo-big"><small>${big.lab}</small><b class="${cls(big.v)}">${pct(big.v)}</b><em>${big.sub}</em></div>${run ? verdictChip(run.verdict) : ''}</div>
      ${m ? `<div class="bo-ks">${kpi('Operaciones', m.n)}${kpi('Aciertos', m.winRate == null ? '—' : num(m.winRate, 0) + ' %', ring(m.winRate, m.winRate >= 50 ? '#20bf9f' : '#f0b90b'))}${kpi('Caída máx.', num(m.maxDDPct, 1) + ' %', ring(Math.min(100, (m.maxDDPct || 0) * 2), (m.maxDDPct || 0) > 25 ? '#f06b79' : (m.maxDDPct || 0) > 12 ? '#f0b90b' : '#20bf9f'))}${kpi('vs. comprar y mantener', `<span class="${cls(m.retPct - run.buyHold.retPct)}">${pct(m.retPct - run.buyHold.retPct)}</span>`)}</div>` : ''}
      <div class="bd-card"><div class="bd-ch"><h4>Curva de capital</h4><small>pasa el cursor para ver valores</small></div>${ser.length > 1 ? `<div class="bd-legs">${ser.map(x => `<button type="button" class="bd-leg ${dash.off.has(x.k) ? 'off' : ''}" data-dleg="${esc(x.k)}"><i style="background:${x.col}"></i>${esc(x.name)}</button>`).join('')}</div>` : ''}${eqChart(W, 210)}</div>
      ${updates}${rank}${feed ? `<div class="bd-card"><div class="bd-ch"><h4>Actividad</h4></div><div class="bd-feed">${feed}</div></div>` : ''}`;
  }
  const verdictChip = v => `<span class="bl-verdict v-${v.level}">${esc({insuficiente: 'Muestra insuficiente', pierde: 'Pierde en el histórico', consistente: 'Consistente fuera de muestra', 'no-confirmada': 'No confirmada fuera de muestra'}[v.level] || v.level)}</span>`;
  function segTable(r) {
    const rows = [['train', 'Entrenamiento (60 %)', 'En muestra'], ['val', 'Validación (20 %)', 'Fuera de muestra'], ['test', 'Prueba (20 %)', 'Fuera de muestra']];
    return `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Tramo</th><th>Periodo</th><th>Op.</th><th>Neto</th><th>Aciertos</th><th>F. benef.</th><th>DD</th></tr></thead><tbody>${rows.map(([k, n, tag]) => { const s = r.segments[k]; return `<tr><td>${n}<br><small class="bl-dim">${tag}</small></td><td>${dd(s.from)} – ${dd(s.to)}</td><td>${s.n}</td><td class="${cls(s.net)}">${money(s.net)}</td><td>${s.winRate == null ? '—' : num(s.winRate, 0) + ' %'}</td><td>${pf(s)}</td><td>${num(s.maxDDPct, 1)} %</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function tabSum(b, run) {
    const T = $('#blTab'), vs = b.versions.filter(v => v.state !== 'descartada');
    const ctl = `<div class="bl-box"><div class="bl-runbar"><label>Versión<select id="blRunV">${vs.map(v => `<option value="${v.v}" ${v.v === b.mainV ? 'selected' : ''}>v${v.v}${v.v === b.mainV ? ' (principal)' : ' (' + v.state + ')'}</option>`).join('')}</select></label><label>Historial<select id="blRunBars">${[[1000, '1.000 velas'], [3000, '3.000 velas'], [6000, '6.000 velas']].map(([n, l]) => `<option value="${n}" ${((run && run.reqBars) || 3000) === n ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button class="bl-btn" data-a="run" ${busyMsg ? 'disabled' : ''}>${run ? 'Volver a probar' : 'Ejecutar backtest'}</button></div></div>`;
    if (!run) { T.innerHTML = overview(b, run) + tfBox(b); return; }
    const m = run.metrics, x = run.ext || {}, bh = run.buyHold, dur = x.avgBars != null ? x.avgBars * (B.IV_MS[run.interval] || 0) : null;
    const durTxt = dur ? (dur >= 864e5 ? num(dur / 864e5, 1) + ' d' : dur >= 36e5 ? num(dur / 36e5, 1) + ' h' : num(dur / 6e4, 0) + ' min') : '—';
    T.innerHTML = overview(b, run) + tfBox(b) + `<details class="bl-det"><summary>Ver todas las métricas y opciones de prueba</summary>` + ctl + `<div class="bl-box"><div class="bl-vrow">${verdictChip(run.verdict)}<small class="bl-dim">v${run.v} · ${run.bars} velas ${run.interval} · ${dd(run.from)} – ${dd(run.to)}</small></div><p>${esc(run.verdict.text)}</p>${(run.warnings || []).map(w => note('⚠ ' + w, 'warn')).join('')}${run.halted ? note('⚠ El módulo de riesgo detuvo el bot: ' + run.halted, 'warn') : ''}</div>
      <div class="bl-metrics">${metric('Resultado neto', money(m.net), cls(m.net))}${metric('Rendimiento', pct(m.retPct), cls(m.retPct))}${metric('Operaciones', m.n)}${metric('Tasa de aciertos', m.winRate == null ? '—' : num(m.winRate, 1) + ' %')}${metric('Factor de beneficio', pf(m), '', 'Ganancias brutas ÷ pérdidas brutas')}${metric('Expectativa por op.', money(m.expectancy))}${metric('Ganancia media', money(m.avgWin), 'pos')}${metric('Pérdida media', money(m.avgLoss == null ? null : -m.avgLoss), 'neg')}${metric('Ratio ganancia/pérdida', m.rr == null ? '—' : num(m.rr, 2))}${metric('Drawdown máximo', num(m.maxDDPct, 1) + ' %', 'neg', money(-m.maxDD))}${metric('Sharpe (diario, anualizado)', x.sharpe == null ? '—' : num(x.sharpe, 2), '', 'Necesita ≥ 20 días con datos')}${metric('Sortino', x.sortino == null ? '—' : num(x.sortino, 2))}${metric('Calmar (rend. ÷ DD)', m.maxDDPct > 0 ? num(m.retPct / m.maxDDPct, 2) : '—')}${metric('Exposición al mercado', num(m.exposurePct, 0) + ' %')}${metric('Duración media', durTxt)}${metric('Comisiones pagadas', money(-m.fees))}${metric('Racha ganadora máx.', x.maxWinStreak == null ? '—' : x.maxWinStreak)}${metric('Racha perdedora máx.', x.maxLossStreak == null ? '—' : x.maxLossStreak)}${metric('Mejor operación', money(x.best), 'pos')}${metric('Peor operación', money(x.worst), 'neg')}${metric('Días ganadores', run.daily.pos, 'pos')}${metric('Días perdedores', run.daily.neg, 'neg')}${metric('Días sin operar', run.daily.flat)}</div>
      <div class="bl-box"><h4>Comparación con comprar y mantener</h4><div class="bl-cmp2"><div><small>Este bot</small><b class="${cls(m.retPct)}">${pct(m.retPct)}</b><small>DD ${num(m.maxDDPct, 1)} %</small></div><div><small>Comprar y mantener</small><b class="${cls(bh.retPct)}">${pct(bh.retPct)}</b><small>DD ${num(bh.maxDDPct, 1)} %</small></div></div>${note(m.retPct > bh.retPct ? 'Supera a comprar y mantener en este periodo.' : 'No supera a comprar y mantener en este periodo.')}</div>
      <div class="bl-box"><h4>Validación por tramos</h4>${note('El bot no se ajusta con estos datos (aún no hay optimizador): los tramos muestran si el resultado se sostiene en el tiempo. Solo validación y prueba cuentan como fuera de muestra.')}${segTable(run)}</div></details>`;
  }
  function tabGr(b, run) {
    const T = $('#blTab'); if (!run || !run.equity.length) { T.innerHTML = `<div class="bl-empty"><p><b>Sin gráficos todavía.</b></p><p class="bl-dim">${run ? 'El detalle de curvas solo se conserva para las 3 pruebas más recientes; vuelve a ejecutar el backtest.' : 'Ejecuta un backtest para generar datos reales.'}</p></div>`; return; }
    T.innerHTML = chartBox('c1', '1 · Curva de capital vs comprar y mantener', 190) + chartBox('c2', '2 · Drawdown (%)', 130) +
      `<div class="bl-chart"><div class="bl-h4row"><h4>3 · Rendimiento por periodo</h4><select id="blPer"><option value="d">Diario</option><option value="w">Semanal</option><option value="m">Mensual</option></select></div>${note('Suma simple de rendimientos diarios (aproximación).')}<canvas id="c3" data-h="150" style="width:100%;height:150px"></canvas></div>` +
      chartBox('c4', '4 · Distribución de ganancias y pérdidas por operación ($)', 140) + chartBox('c5', '5 · Resultado por horario de entrada (UTC)', 130) + chartBox('c6', '6 · Resultado según tendencia (EMA 200)', 130) + chartBox('c7', '7 · Resultado según volatilidad', 130) + chartBox('c8', '8 · Entrenamiento / validación / prueba (rendimiento %)', 130, 'Si cae en validación y prueba, es señal de sobreajuste.') + chartBox('c9', '9 · Comparación de versiones (rendimiento %)', 130) + chartBox('c10', '10 · Resultado por lado (compras vs ventas)', 120);
    const ar = a => a.map(p => [p[0], p[1]]); const eq = run.equity.map(p => [p[0], p[1]]);
    lineChart($('#c1'), [{pts: eq, color: '#4c8dff', w: 1.8, fill: 1}].concat(run.bh && run.bh.length ? [{pts: run.bh, color: '#8a93a6', dash: [4, 3], w: 1.2}] : []), {yfmt: v => '$' + num(v, 0)});
    let pk = -Infinity; lineChart($('#c2'), [{pts: eq.map(p => { pk = Math.max(pk, p[1]); return [p[0], -(pk - p[1]) / pk * 100]; }), color: '#f31260', fill: 1}], {zero: 1, yfmt: v => num(v, 0) + '%'});
    const per = () => { const k = $('#blPer').value, d = (run.ext && run.ext.dailyRet) || []; if (!d.length) return []; if (k === 'd') return d.slice(-30).map(p => ({v: p[1], label: dd(p[0]).slice(0, 6)})); const m = new Map(); for (const p of d) { const dt = new Date(p[0]), key = k === 'm' ? dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') : String(Math.floor((p[0] / 864e5 + 3) / 7)); m.set(key, (m.get(key) || 0) + p[1]); } return [...m].slice(-16).map(([key, v]) => ({v, label: k === 'm' ? key.slice(2) : 'S' + key.slice(-2)})); };
    const dr = () => barChart($('#c3'), per(), {yfmt: v => num(v, 1) + '%'}); dr(); $('#blPer').onchange = dr;
    const tr = run.trades; if (tr.length) { const nets = tr.map(t => t.net), lo = Math.min(...nets), hi = Math.max(...nets), nb = 12, w = (hi - lo) / nb || 1, bins = Array.from({length: nb}, (_, i) => ({v: 0, label: num(lo + w * i, 0), color: lo + w * (i + .5) >= 0 ? '#17c964' : '#f31260'})); nets.forEach(x => bins[Math.min(nb - 1, Math.floor((x - lo) / w))].v++); barChart($('#c4'), bins, {yfmt: v => num(v, 0)}); } else barChart($('#c4'), []);
    const bd = run.breakdown || {}, bar = o => Object.entries(o || {}).map(([k, v]) => ({v: v.net, label: k, sub: v.n + ' op.'})); barChart($('#c5'), bar(bd.hour).sort((a, b) => a.label - b.label).map(x => ({...x, label: x.label + 'h'})), {yfmt: v => '$' + num(v, 0)}); barChart($('#c6'), bar(bd.trend), {yfmt: v => '$' + num(v, 0)}); barChart($('#c7'), bar(bd.vol), {yfmt: v => '$' + num(v, 0)});
    barChart($('#c8'), ['train', 'val', 'test'].map(k => ({v: run.segments[k].retPct, label: {train: 'Entren.', val: 'Valid.', test: 'Prueba'}[k], sub: run.segments[k].n + ' op.'})), {yfmt: v => num(v, 1) + '%'});
    barChart($('#c9'), b.versions.map(v => { const r = runOf(b, v.v); return r ? {v: r.metrics.retPct, label: 'v' + v.v, sub: v.v === b.mainV ? 'principal' : ''} : null; }).filter(Boolean), {yfmt: v => num(v, 1) + '%'});
    barChart($('#c10'), bar(bd.side).map(x => ({...x, label: x.label === 'long' ? 'Compras' : 'Ventas'})), {yfmt: v => '$' + num(v, 0)});
  }
  const SWEEP_COINS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'], SWEEP_INTS = ['15m', '1h', '4h'];
  function tabRob(b, run) {
    const T = $('#blTab'), sw = b.sweeps && b.sweeps.rows;
    T.innerHTML = `<div class="bl-box"><h4>Análisis por criptomoneda y temporalidad</h4>${note('Prueba la MISMA estrategia, sin cambiar nada, en otras monedas y temporalidades. Una estrategia sólida no depende de una sola moneda.')}<button class="bl-btn" data-a="sweep" ${busyMsg ? 'disabled' : ''}>Ejecutar análisis de robustez (${SWEEP_COINS.length + SWEEP_INTS.length - 1} pruebas)</button></div>` +
      (sw ? `<div class="bl-box"><small class="bl-dim">Ejecutado ${dt(b.sweeps.at)} · ${b.sweeps.bars} velas por prueba · v${b.sweeps.v}</small><div class="bl-scroll"><table class="bl-t"><thead><tr><th>Moneda</th><th>TF</th><th>Op.</th><th>Rend.</th><th>Comprar y mant.</th><th>DD</th><th>Aciertos</th></tr></thead><tbody>${sw.map(r => r.err ? `<tr><td>${esc(r.symbol)}</td><td>${r.interval}</td><td colspan="5" class="bl-dim">${esc(r.err)}</td></tr>` : `<tr><td>${esc(r.symbol.replace('USDT', ''))}</td><td>${r.interval}</td><td>${r.n}</td><td class="${cls(r.retPct)}">${pct(r.retPct)}</td><td class="${cls(r.bh)}">${pct(r.bh)}</td><td>${num(r.dd, 1)} %</td><td>${r.win == null ? '—' : num(r.win, 0) + ' %'}</td></tr>`).join('')}</tbody></table></div>${(() => { const ok = sw.filter(r => !r.err && r.n >= 10), pos = ok.filter(r => r.retPct > 0); return note(ok.length ? `Positiva en ${pos.length} de ${ok.length} pruebas con ≥ 10 operaciones. ${pos.length / ok.length < .5 ? 'Funciona en pocos mercados: probable ajuste a un caso concreto.' : 'Resultado más sólido si se mantiene en la mayoría.'}` : 'Pocas operaciones por prueba: no se puede concluir.'); })()}</div>` : '') +
      (run ? `<div class="bl-box"><h4>Costes: sensibilidad</h4>${note('Rendimiento de la última prueba con costes más altos. Si desaparece, la ventaja era frágil.')}<button class="bl-mini" data-a="costs">Probar con el doble de comisión y deslizamiento</button><div id="blCosts"></div></div>` : '');
  }
  async function doTfTest(b) { // backtest de la versión principal en CADA temporalidad y moneda que elegiste
    const sp = mainSpec(b), bars = Math.min((runOf(b) && runOf(b).reqBars) || 3000, 3000), syms = Array.isArray(sp.basket) && sp.basket.length ? sp.basket : [sp.symbol], jobs = []; for (const iv of ivsOf(sp)) for (const sym of syms) jobs.push([sym, iv]); const rows = [];
    for (let i = 0; i < jobs.length; i++) { const [symbol, interval] = jobs[i]; busyMsg = `Probando ${symbol.replace('USDT', '')} ${interval} (${i + 1}/${jobs.length})…`; if (view === 'bot') render();
      try { const res = await execute(Object.assign({}, sp, {symbol, interval, basket: undefined, intervals: undefined}), bars); rows.push({symbol, interval, n: res.metrics.n, retPct: res.metrics.retPct, dd: res.metrics.maxDDPct, win: res.metrics.winRate}); } catch (e) { rows.push({symbol, interval, err: String(e.message || e).slice(0, 80)}); } }
    b.tfRuns = {at: Date.now(), v: b.mainV, rows}; busyMsg = ''; touch(b); if (view === 'bot') render();
  }
  function tfBox(b) {
    const sp = mainSpec(b), ivs = ivsOf(sp), syms = Array.isArray(sp.basket) && sp.basket.length ? sp.basket : [sp.symbol]; if (ivs.length < 2 && syms.length < 2) return '';
    const R = b.tfRuns && b.tfRuns.v === b.mainV ? b.tfRuns.rows : null;
    const by = ivs.map(iv => { const rs = (R || []).filter(r => r.interval === iv && !r.err), n = rs.reduce((a, r) => a + r.n, 0), ret = rs.length ? rs.reduce((a, r) => a + r.retPct, 0) / rs.length : null; return `<div class="bl-part"><b>${iv}</b>${ret == null ? '<small>sin probar</small>' : `<span class="${cls(ret)}">${pct(ret)}</span><small>${n} op. · DD máx ${num(Math.max(0, ...rs.map(r => r.dd)), 1)} %</small>`}</div>`; }).join('');
    const tbl = R ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Moneda</th><th>TF</th><th>Op.</th><th>Rend.</th><th>DD</th><th>Aciertos</th></tr></thead><tbody>${R.map(r => r.err ? `<tr><td>${r.symbol.replace('USDT', '')}</td><td>${r.interval}</td><td colspan="4" class="bl-dim">${esc(r.err)}</td></tr>` : `<tr><td>${r.symbol.replace('USDT', '')}</td><td>${r.interval}</td><td>${r.n}</td><td class="${cls(r.retPct)}">${pct(r.retPct)}</td><td>${num(r.dd, 1)} %</td><td>${r.win == null ? '—' : num(r.win, 0) + ' %'}</td></tr>`).join('')}</tbody></table></div>` : '';
    return `<div class="bl-box"><h4>Por temporalidad${syms.length > 1 ? ' y moneda' : ''}</h4>${note(`Prueba histórica de la v${b.mainV} en ${ivs.join(', ')}${syms.length > 1 ? ' · ' + syms.map(x => x.replace('USDT', '')).join(', ') : ''}.`)}<div class="bl-parts">${by}</div>${tbl}<div class="bl-actions"><button class="bl-mini" data-a="tfTest">${R ? 'Volver a probar' : 'Probar cada temporalidad'}</button></div></div>`;
  }
  async function doSweep(b) {
    const sp = mainSpec(b), bars = (runOf(b) && runOf(b).reqBars) || 3000, jobs = [...SWEEP_COINS.map(s => [s, sp.interval]), ...SWEEP_INTS.filter(i => i !== sp.interval).map(i => [sp.symbol, i])], rows = [];
    for (let i = 0; i < jobs.length; i++) { busyMsg = `Analizando ${jobs[i][0]} ${jobs[i][1]} (${i + 1}/${jobs.length})…`; if (view === 'bot') render(); const [symbol, interval] = jobs[i];
      try { const res = await execute(Object.assign({}, sp, {symbol, interval, basket: undefined}), Math.min(bars, 3000)); rows.push({symbol, interval, n: res.metrics.n, retPct: res.metrics.retPct, bh: res.buyHold.retPct, dd: res.metrics.maxDDPct, win: res.metrics.winRate}); } catch (e) { rows.push({symbol, interval, err: String(e.message || e).slice(0, 80)}); } }
    b.sweeps = {at: Date.now(), bars: Math.min(bars, 3000), v: b.mainV, rows}; busyMsg = ''; log(b, 'robustez', `Análisis en ${rows.length} mercados: positiva en ${rows.filter(r => !r.err && r.retPct > 0).length}.`); touch(b); if (view === 'bot') render();
  }
  let diaryMode = null;
  function tabDiary(b, run) {
    const so = liveOf(b);
    if (!so) diaryMode = 'bt'; else if (!diaryMode || diaryMode === 'auto') diaryMode = 'live';
    const seg = so ? `<div class="bl-seg2"><button class="${diaryMode === 'live' ? 'on' : ''}" data-a="dmode" data-k="live"><span class="bl-dot d-live"></span>Cerradas (${so.ledger.length})</button><button class="${diaryMode === 'bt' ? 'on' : ''}" data-a="dmode" data-k="bt">Backtest${run ? ` (${run.tradesTotal != null ? run.tradesTotal : run.trades.length})` : ''}</button></div>` : '';
    if (so && diaryMode === 'live') return tabLive(b, so, seg);
    tabDiaryBt(b, run, seg);
  }
  let tcSym = null;
  const symBar = (syms, cur, trades) => { if (syms.length < 2) return ''; const n = {}; for (const t of trades || []) if (t.sym) n[t.sym] = (n[t.sym] || 0) + 1; return `<div class="bl-subs tc-syms">${syms.map(x => `<button class="${x === cur ? 'on' : ''} ${n[x] ? '' : 'none'}" data-a="tcSym" data-k="${x}">${x.replace('USDT', '')}${n[x] ? `<i class="tc-n">${n[x]}</i>` : ''}</button>`).join('')}</div>`; };
  /* Cada operación cerrada como una barra (verde ganó, roja perdió) y la línea de lo acumulado */
  function pnlBars(tr) {
    const L = (tr || []).slice(-60); if (L.length < 2) return '';
    const mx = Math.max(1e-9, ...L.map(t => Math.abs(t.net || 0))); let acc = 0; const cum = L.map(t => (acc += t.net || 0)), cm = Math.max(1e-9, ...cum.map(Math.abs)), W = L.length;
    const best = L.reduce((a, t) => (t.net > a.net ? t : a), L[0]), worst = L.reduce((a, t) => (t.net < a.net ? t : a), L[0]), wins = L.filter(t => t.net > 0).length;
    return `<div class="bl-box ph"><h4>Ganó o perdió en cada operación</h4><div class="ph-k"><span><b class="pos">${wins}</b> ganadas</span><span><b class="neg">${L.length - wins}</b> perdidas</span><span>mejor <b class="pos">${money(best.net)}</b></span><span>peor <b class="neg">${money(worst.net)}</b></span><span>total <b class="${cls(acc)}">${money(acc)}</b></span></div>
      <svg class="ph-svg" viewBox="0 0 ${W * 10} 100" preserveAspectRatio="none"><line x1="0" y1="50" x2="${W * 10}" y2="50" class="ph-z"/>${L.map((t, i) => { const h = Math.abs(t.net || 0) / mx * 44; return `<rect class="${t.net > 0 ? 'w' : 'l'}" style="--i:${i}" x="${i * 10 + 2}" y="${t.net > 0 ? 50 - h : 50}" width="6" height="${Math.max(1, h)}" rx="1.5"><title>${dt(t.exitT)} · ${money(t.net)}</title></rect>`; }).join('')}
      <polyline class="ph-cum" points="${cum.map((c, i) => `${i * 10 + 5},${(50 - c / cm * 46).toFixed(1)}`).join(' ')}"/></svg><div class="ph-leg"><span><i class="w"></i>ganó</span><span><i class="l"></i>perdió</span><span><i class="c"></i>acumulado</span></div></div>`;
  }
  function tabLive(b, so, seg) {
    const T = $('#blTab'), L = so.ledger.slice().reverse(), multi = so.symbols.length > 1; if (!so.symbols.includes(tcSym)) tcSym = so.symbols[0];
    const part = (key, lab, onlyOpen) => { const g = {}; for (const x of so.ss) { const k = key(x), st = PP().stats(x), o = g[k] = g[k] || {cap: 0, eq: 0, n: 0, w: 0, open: 0}; o.cap += x.capital; o.eq += st.equity; o.n += x.ledger.length; o.w += x.ledger.filter(t => t.net > 0).length; if (x.open) o.open++; } const ks = Object.keys(g).filter(k => !onlyOpen || g[k].open); if (onlyOpen ? !ks.length : ks.length < 2) return '';
      return `<div class="bl-box"><h4>${lab}</h4><div class="bl-parts">${ks.map(k => { const o = g[k], r = (o.eq / o.cap - 1) * 100; return `<div class="bl-part"><b>${esc(k.replace('USDT', ''))}</b><span class="${cls(r)}">${pct(r)}</span><small>${o.n} op.${o.n ? ' · ' + num(o.w / o.n * 100, 0) + ' % aciertos' : ''}${o.open ? ' · ' + o.open + ' abierta' + (o.open > 1 ? 's' : '') : ''}</small></div>`; }).join('')}</div></div>`; };
    const parts = part(x => x.spec.interval, 'Cómo va en cada temporalidad') + part(x => x.spec.symbol, 'Abiertas ahora en cada moneda', true);
    T.innerHTML = seg + `<div class="bl-box"><h4>Historial: dónde compró y dónde vendió</h4><p class="bl-dim" style="margin:-2px 0 8px">Operaciones que ya cerró desde que lo encendiste. Las abiertas ahora están en la pestaña <b>En vivo</b>.</p>${symBar(so.symbols, tcSym, so.ledger)}<div id="blTC" class="tc"><p class="bl-dim">Cargando velas…</p></div></div>${pnlBars(so.ledger)}<div class="bl-box"><h4>Resumen del historial</h4>${note(`Desde ${dt(so.startT)} (empezó en cero) · v${so.v} · ${so.symbols.map(x => x.replace('USDT', '')).join(', ')} · ${so.interval}. Solo cuenta lo que pasó después de encenderlo.`)}
      ${L.length ? `<details class="pv-what"><summary>Ver la lista completa (${L.length})</summary><div class="bl-scroll"><table class="bl-t"><thead><tr><th>Entrada</th>${multi || so.ivs.length > 1 ? '<th>Mercado</th>' : ''}<th></th><th>Precio</th><th>Salida</th><th>Neto</th><th>Motivo</th></tr></thead><tbody>${L.slice(0, 150).map(t => `<tr><td>${dt(t.entryT)}</td>${multi || so.ivs.length > 1 ? `<td>${t.sym.replace('USDT', '')} ${t.iv}</td>` : ''}<td>${t.side === 'long' ? 'Compra' : 'Venta'}</td><td>${num(t.entry, 4)}→${num(t.exit, 4)}</td><td>${dt(t.exitT)}</td><td class="${cls(t.net)}">${money(t.net)}</td><td class="bl-why">${esc(t.why || '')}</td></tr>`).join('')}</tbody></table></div></details>` : `<p class="bl-dim">Todavía sin operaciones cerradas: va en cero y espera su primera señal.</p>`}</div>`;

    const sess = so.ss.find(x => x.spec.symbol === tcSym) || so.ss[0];
    (async () => { const host = $('#blTC'); if (!host || !window.CCTTradeChart) return; try { const iv = B.IV_MS[sess.spec.interval], n = Math.min(1500, Math.max(120, Math.ceil((Date.now() - sess.startT) / iv) + 100)), C = await candlesFor(sess.spec.symbol, sess.spec.interval, n); if (!host.isConnected) return; host._tc = {candles: C, trades: [], live: sess.ledger, iv, height: 300}; tchart = null; simpleTrades(host, C, sess.ledger, null, {candles: true}); } catch (e) { host.innerHTML = note('No se pudieron cargar las velas: ' + (e.message || e), 'warn'); } })();
  }
  function tabDiaryBt(b, run, seg) {
    const T = $('#blTab'), tr = run ? run.trades.slice().reverse() : [];
    const av = run && run.avoid || [], avBy = {}; for (const z of av) avBy[z[1]] = (avBy[z[1]] || 0) + 1;
    T.innerHTML = (seg || '') + pnlBars(run ? run.trades : []) + `<div class="bl-box"><h4>Diario de operaciones (backtest)</h4>${run ? note(`${run.tradesTotal} operaciones en el backtest v${run.v}${run.tradesTotal > run.trades.length ? ` (se guardan las últimas ${run.trades.length})` : ''}. Toca una para verla en el gráfico.`) : note('Sin operaciones: ejecuta un backtest.')}${tr.length ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Entrada</th><th></th><th>Precio</th><th>Salida</th><th>Neto</th><th>Motivo</th><th></th></tr></thead><tbody>${tr.slice(0, 120).map((t, i) => `<tr><td>${dt(t.entryT)}</td><td>${t.side === 'long' ? 'Compra' : 'Venta'}</td><td>${num(t.entry, 4)}→${num(t.exit, 4)}</td><td>${t.open ? 'abierta' : dt(t.exitT)}</td><td class="${cls(t.net)}">${money(t.net)}</td><td class="bl-why" title="${esc(t.reasonIn || '')}">${esc(t.why || '')}</td><td><button class="bl-mini" data-a="seeTrade" data-i="${run.trades.length - 1 - i}">Ver</button></td></tr>`).join('')}</tbody></table></div>` : ''}</div>
      ${av.length ? `<div class="bl-box"><h4>Señales descartadas</h4>${note('Veces que las reglas pedían entrar y no se entró (últimas ' + av.length + '):')}<ul class="bl-log">${Object.entries(avBy).map(([k, n]) => `<li>${esc(k)}: <b>${n}</b></li>`).join('')}</ul></div>` : ''}<div class="bl-box"><h4>Dónde compró y dónde vendió</h4>${run && run.basket ? symBar(run.basket, tcSym && run.basket.includes(tcSym) ? tcSym : run.basket[0], run.trades) : ''}<div id="blTC" class="tc"><p class="bl-dim">${run ? 'Cargando velas…' : 'Prueba el bot para ver aquí dónde compró y dónde vendió.'}</p></div></div><div class="bl-box"><h4>Historial del bot</h4><ul class="bl-log">${b.journal.slice().reverse().slice(0, 60).map(j => `<li><small>${dt(j.t)} · ${esc(j.kind)}</small><br>${esc(j.text)}</li>`).join('')}</ul></div>`;
    mountTC(b, run);
  }
  async function mountTC(b, run) {
    tchart = null; const host = $('#blTC'); if (!host || !run || !window.CCTTradeChart) return; const sp = ver(b, run.v).spec, sym = run.basket ? (run.basket.includes(tcSym) ? tcSym : run.basket[0]) : sp.symbol;
    try { const C = await candlesFor(sym, sp.interval, run.reqBars || 3000); if (!host.isConnected) return;
      const live = (b.paper || []).filter(x => x.status !== 'stopped' && x.spec.symbol === sym && x.spec.interval === sp.interval).flatMap(x => x.ledger.concat(x.open ? [Object.assign({open: true}, x.open)] : []));
      host._tc = {candles: C, trades: run.trades.filter(t => !t.sym || t.sym === sym), live, iv: B.IV_MS[sp.interval], height: 320}; tchart = null;
      simpleTrades(host, C, host._tc.trades, null, {candles: true});
    } catch (e) { host.innerHTML = note('No se pudieron cargar las velas: ' + (e.message || e), 'warn'); }
  }
  function cmpRows(a, bb) { return a && bb ? [['Rendimiento', pct(a.metrics.retPct), pct(bb.metrics.retPct)], ['Drawdown', num(a.metrics.maxDDPct, 1) + ' %', num(bb.metrics.maxDDPct, 1) + ' %'], ['Operaciones', a.metrics.n, bb.metrics.n], ['F. de beneficio', pf(a.metrics), pf(bb.metrics)], ['Validación', pct(a.segments.val.retPct), pct(bb.segments.val.retPct)], ['Prueba', pct(a.segments.test.retPct), pct(bb.segments.test.retPct)]] : []; }
  function worse(c, m) { return c.segments.test.retPct < m.segments.test.retPct || c.metrics.maxDDPct > m.metrics.maxDDPct * 1.25 || c.segments.val.retPct < m.segments.val.retPct; }
  /* Mejorar › Versiones: cuál fue la mejor (en los datos que no vio), qué cambió respecto a la anterior, qué hace y volver a cualquiera */
  const specLines = sp => { try { return String(B.describeSpec(sp)).split('\n').map(x => x.replace(/^[\s>*•-]+/, '').replace(/\*\*/g, '').trim()).filter(Boolean); } catch { return []; } };
  function tabVer(b) {
    const T = $('#blTab'), main = runOf(b), vs = b.versions.filter(v => v.state !== 'prueba');
    const sc = v => { const r = runOf(b, v.v); return r && r.metrics.n >= 5 ? oosOf(r) : null; }, scored = vs.map(v => [v, sc(v)]).filter(x => x[1] != null), best = scored.length > 1 ? scored.reduce((a2, x) => x[1] > a2[1] + .5 ? x : a2, scored.find(x => x[0].v === b.mainV) || scored[0])[0] : null; // empate: se queda la que está en uso
    const diff = v => { const prev = b.versions.filter(x => x.v < v.v && x.state !== 'prueba').slice(-1)[0]; if (!prev) return null; const A = specLines(prev.spec), Z = specLines(v.spec); return {add: Z.filter(x => !A.includes(x)).slice(0, 6), del: A.filter(x => !Z.includes(x)).slice(0, 6), from: prev.v}; };
    const stLab = v => v.v === b.mainV ? 'en uso' : {candidata: 'probada, sin aplicar', descartada: 'descartada', anterior: 'anterior'}[v.state] || v.state;
    T.innerHTML = `<div class="bl-box vb-top">${best ? `<div class="vb-best"><span class="vb-crown"><svg viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg></span><div><b>La mejor hasta ahora: v${best.v}</b><small>${best.v === b.mainV ? 'Es la que está en uso.' : 'No es la que está en uso: puedes restaurarla.'} Se mide con lo que ganó en los datos que no vio (validación + prueba).</small></div>${best.v !== b.mainV ? `<button class="bl-mini pri" data-a="vmain" data-v="${best.v}">Restaurar v${best.v}</button>` : ''}</div>` : note('Cuando tenga dos o más versiones probadas, aquí verás cuál ha sido la mejor.')}</div>` +
      vs.slice().reverse().map(v => { const r = runOf(b, v.v), isMain = v.v === b.mainV, d = diff(v), s0 = sc(v), sm = main ? oosOf(main) : null;
        return `<div class="bl-box vb ${isMain ? 'main' : ''} ${best && best.v === v.v ? 'best' : ''} s-${v.state}"><div class="vb-h"><b class="vb-v">v${v.v}</b><span class="vb-st">${stLab(v)}</span>${best && best.v === v.v ? '<span class="vb-badge">la mejor</span>' : ''}<small>${dt(v.at)}</small></div>
          <p class="vb-note">${esc(String(v.note || 'Versión ' + v.v).replace(/^Consejo: /, 'Consejo: '))}<span> · ${esc(v.origin || '')}</span></p>
          ${r ? `<div class="vb-ks"><span><small>Datos que no vio</small><b class="${cls(oosOf(r))}">${pct(oosOf(r))}</b></span><span><small>Todo el periodo</small><b class="${cls(r.metrics.retPct)}">${pct(r.metrics.retPct)}</b></span><span><small>Aciertos</small><b>${r.metrics.winRate == null ? '—' : num(r.metrics.winRate, 0) + ' %'}</b></span><span><small>Caída máx.</small><b>${num(r.metrics.maxDDPct, 1)} %</b></span><span><small>Operaciones</small><b>${r.metrics.n}</b></span></div>${!isMain && s0 != null && sm != null ? `<p class="vb-cmp ${s0 > sm + .5 ? 'pos' : s0 < sm - .5 ? 'neg' : ''}">${s0 > sm + .5 ? `Mejor que la que está en uso (+${num(s0 - sm, 1)} puntos en lo que no vio)` : s0 < sm - .5 ? `Peor que la que está en uso (${num(s0 - sm, 1)} puntos en lo que no vio)` : 'Prácticamente igual a la que está en uso'}</p>` : ''}` : note('Sin prueba todavía.')}
          ${d && (d.add.length || d.del.length) ? `<div class="vb-diff"><small>Qué cambió respecto a la v${d.from}</small>${d.add.map(x => `<p class="add">+ ${esc(x)}</p>`).join('')}${d.del.map(x => `<p class="del">− ${esc(x)}</p>`).join('')}</div>` : ''}
          <details class="pv-what"><summary>Qué hace esta versión</summary><div class="vb-rules">${mdLite(B.describeSpec(v.spec))}</div></details>
          <div class="bl-card-b">${isMain ? '' : `<button class="bl-mini ${best && best.v === v.v ? 'pri' : ''}" data-a="vmain" data-v="${v.v}">${v.v < b.mainV || v.state === 'descartada' || v.state === 'anterior' ? 'Restaurar esta versión' : 'Usar esta versión'}</button>`}<button class="bl-mini" data-a="vrun" data-v="${v.v}">${r ? 'Volver a probar' : 'Probar'}</button><button class="bl-mini" data-a="vedit" data-v="${v.v}">Editar una copia</button></div></div>`; }).join('');
  }
  /* Mejorar › Reglas: plegadas en un botón; al abrir se ven y se editan */
  function tabRules(b) {
    const sp = mainSpec(b), T = $('#blTab');
    T.innerHTML = `<details class="bl-box bl-rules"><summary><span class="bl-rules-ic"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg></span><div><b>Reglas del bot</b><small>v${b.mainV} · toca para verlas o editarlas</small></div><i class="bl-rules-ch"></i></summary><div class="bl-rules-b">${mdLite(B.describeSpec(sp))}<div class="bl-actions"><button class="bl-btn ghost" data-a="vedit" data-v="${b.mainV}">Editar a mano (crea versión candidata)</button></div></div></details>
      ${note('Los indicadores Nova se usan en solo lectura: el bot nunca los modifica.')}`;
  }
  /* Mejorar › Consejos y mejoras: cada consejo (o cambio tuyo) se PRUEBA primero con velas reales contra la versión actual en los mismos datos;
     ves el veredicto y tú decides si aplicarlo. Se pueden mandar varios a probar: van en fila, uno tras otro. */
  /* Qué hacer ahora con el bot: dejarlo correr, probarlo más, cambios mínimos o cambiarlo (y avisa si se le está cambiando demasiado) */
  function stance(b) {
    const run = runOf(b); if (!run) return null; const m = run.metrics, oos = oosOf(run), pf = m.profitFactor == null ? (m.pfInf ? 9 : 0) : m.profitFactor, lv = liveOf(b), ln = lv ? lv.nClosed : 0;
    const wk = Date.now() - 7 * 864e5, changes = b.versions.filter(v => v.v > 1 && v.at > wk && (v.state === 'principal' || v.state === 'anterior')).length;
    const drift = lv && ln >= 15 && ((lv.winRate != null && m.winRate != null && m.winRate - lv.winRate > 15) || (lv.retPct < 0 && m.retPct > 0));
    if (changes >= 2) return ['calma', 'Déjalo correr: ya no le cambies por ahora', `Lleva ${changes} cambios en los últimos 7 días. Cada cambio reinicia lo que sabemos de él: deja correr la v${b.mainV} al menos ${Math.max(20, ln + 15)} operaciones en vivo antes de tocarlo otra vez.`];
    if (oos < 0 && m.retPct < 0) return ['cambiar', 'Necesita cambios', `Pierde en todo el periodo (${pct(m.retPct)}) y en los datos que no vio (${pct(oos)}). Prueba los consejos de abajo, de uno en uno, y quédate solo con los que de verdad mejoren.`];
    if (m.n < 30 || (lv && ln < 15)) return ['probar', 'Pruébalo más antes de cambiarlo', `${lv ? `En vivo lleva ${ln} operación(es) cerrada(s)` : `En la prueba hizo ${m.n} operaciones`}: todavía es poco para saber si funciona. Déjalo correr${lv ? '' : ' en vivo'} hasta unas ${lv ? 20 : 30} operaciones antes de hacer cambios grandes.`];
    if (drift) return ['revisar', 'En vivo va peor que en la prueba: solo cambios mínimos', `En vivo acierta ${lv.winRate == null ? '—' : Math.round(lv.winRate) + ' %'} contra ${m.winRate == null ? '—' : Math.round(m.winRate) + ' %'} en la prueba. Ajusta solo stop u objetivo y vuelve a revisar en unos días; no cambies las reglas de entrada todavía.`];
    if (oos > 0 && pf >= 1.3) return ['correr', 'Va bien: déjalo correr así', `Gana también en los datos que no vio (${pct(oos)}) con factor de beneficio ${num(pf, 2)}. No le muevas nada; revisa otra vez cuando lleve más operaciones${lv ? ` (ahora ${ln} en vivo)` : ''}.`];
    return ['minimo', 'Funciona, pero justo: solo cambios mínimos', `Gana poco o con poco margen (datos que no vio: ${pct(oos)}, factor de beneficio ${num(pf, 2)}). Si pruebas algo, que sean ajustes chicos de stop u objetivo, de uno en uno.`];
  }
  function tabEst(b) {
    const sp = mainSpec(b), run = runOf(b), T = $('#blTab'), st = (b.paper || []).find(x => x.status === 'running'), live = st && PP() ? PP().stats(st) : null;
    const sm = CO ? CO.summary(sp, run, live) : null, tips = tipsOf(b), ai = b.coach && run && (b.coach.runId === run.id || b.coach.v === b.mainV) ? b.coach : null;
    const tested = b.tipTests || {}, inTest = t => tested[tipKey(t)] || TQ.has(b.id + '|' + tipKey(t));
    const aiTips = ai && CO ? (ai.tips || []).filter(t => CO.validTip(sp, t) && !tips.some(x => JSON.stringify(x.patch) === JSON.stringify(t.patch)) && !ignoredTip(b, t)) : [];
    const card = (t, k) => `<div class="bl-tip k-${esc(t.kind || 'ia')}"><div class="bl-tip-h"><span class="bl-tip-k">${esc({reglas: 'Reglas', riesgo: 'Riesgo', filtro: 'Filtro', temporalidad: 'Temporalidad', activo: 'Activo'}[t.kind] || 'IA')}</span><b>${esc(t.title)}</b>${ignRec(b, t) ? '<span class="bl-tip-back">Volvió: sigue fallando en esto</span>' : ''}</div><p>${esc(t.why)}</p><div class="bl-tip-b"><button class="bl-btn" data-a="tip" data-k="${k}">Probar este consejo</button><button class="bl-btn ghost" data-a="tipIgnore" data-k="${k}" title="Quitar este consejo para que salgan otros">Ignorar consejo</button></div></div>`;
    T._tips = tips.concat(aiTips).filter(t => !inTest(t));
    const pend = [...TQ.values()].filter(x => x.bid === b.id), done = Object.entries(tested).sort((x, z) => (z[1].at || 0) - (x[1].at || 0));
    const L = {mejora: ['Sí mejora', 'up'], igual: ['Casi igual', 'eq'], empeora: ['Empeora', 'dn'], malo: ['No sirve así', 'dn']};
    const res = ([k, x]) => x.auto ? `<details class="tt tt-auto ${(L[x.lvl] || L.igual)[1]}"><summary><span class="tt-v">${(L[x.lvl] || L.igual)[0]}</span><b>${esc(x.title)}</b><small>se quedó la v${x.base}</small></summary><p class="tt-say">${esc(x.say || '')}</p><ul class="tt-why">${(x.why || []).map(w => `<li><span>${esc(w[0])}</span><b class="${w[3] || ''}">${esc(w[1])} → ${esc(w[2])}</b></li>`).join('')}</ul><div class="bl-card-b"><button class="bl-mini" data-a="tipApply" data-k="${esc(k)}">Aplicar de todos modos</button><button class="bl-mini" data-a="tipDrop" data-k="${esc(k)}">Quitar de la lista</button></div></details>` : `<div class="tt ${(L[x.lvl] || L.igual)[1]}"><div class="tt-h"><span class="tt-v">${(L[x.lvl] || L.igual)[0]}</span><b>${esc(x.title)}</b><small>v${x.v} · probado ${dt(x.at)}</small></div>
      <p class="tt-say">${esc(x.say || '')}</p><ul class="tt-why">${(x.why || []).map(w => `<li><span>${esc(w[0])}</span><b class="${w[3] || ''}">${esc(w[1])} → ${esc(w[2])}</b></li>`).join('')}</ul>
      <div class="bl-card-b"><button class="bl-mini ${x.lvl === 'mejora' ? 'pri' : ''}" data-a="tipApply" data-k="${esc(k)}">${x.lvl === 'mejora' ? `Aplicar (v${x.v} pasa a principal)` : 'Aplicar de todos modos'}</button><button class="bl-mini" data-a="tipDrop" data-k="${esc(k)}">Descartar</button></div></div>`;
    const ap = b.versions.filter(v => v.v > 1 && isTip(v) && v.state !== 'prueba' && v.state !== 'candidata' && !(v.base != null && v.state === 'descartada')).slice(-6).reverse();
    T.innerHTML = `<div class="bl-box bl-coach"><div class="bl-coach-h"><span class="bl-coach-ic">${IC.robot}</span><div><h4>Consejos y mejoras</h4><small class="bl-dim">Cada consejo se prueba primero con velas reales contra la versión actual, en los mismos datos. Si de verdad mejora en los datos que no vio, queda listo para que lo apliques; si no, se queda la versión actual.</small></div></div>
        ${(() => { const x = stance(b); return x ? `<div class="sa sa-${x[0]}"><span class="sa-ic">${{calma: '⏸', cambiar: '✎', probar: '⏳', revisar: '⚠', correr: '▶', minimo: '≈'}[x[0]]}</span><div><small>Qué hacer ahora</small><b>${esc(x[1])}</b><p>${esc(x[2])}</p></div></div>` : ''; })()}
        ${pend.length ? `<div class="tt-q">${pend.map(x => `<div class="tt-qi ${x.st}"><span class="bl-spin"></span><b>${esc(x.title)}</b><small>${x.st === 'probando' ? esc(x.msg || 'Probando con velas reales…') : 'En fila para probar'}</small></div>`).join('')}</div>` : ''}
        ${done.length ? `<div class="tt-list">${done.filter(x => !x[1].auto).map(res).join('')}${done.some(x => x[1].auto) ? `<small class="tt-sub">Probados que no mejoraron (se quedó la versión actual)</small>${done.filter(x => x[1].auto).map(res).join('')}` : ''}</div>` : ''}
        ${ap.length ? `<div class="bl-tapp"><small>Consejos aplicados</small><div>${ap.map(v => `<span class="bl-tapp-c ${v.state === 'descartada' ? 'off' : 'on'}" title="${esc(dt(v.at))}"><i></i>v${v.v} · ${esc(String(v.note || '').replace(/^Consejo: /, ''))}</span>`).join('')}</div></div>` : ''}
        ${sm ? `<div class="bl-sum l-${sm.level}"><b>${esc(sm.title)}</b>${sm.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>` : ''}
        ${ai && ai.text ? `<div class="bl-aisum"><small>Lo que vio la IA</small>${mdLite(ai.text)}</div>` : ''}
        ${T._tips.length ? `<div class="bl-tips">${T._tips.map(card).join('')}</div>` : (run && !done.length && !pend.length ? '<p class="bl-dim">Con sus resultados actuales no veo un cambio claro que valga la pena. Puedes pedir un análisis a la IA o probarlo en otras monedas.</p>' : '')}
        <div class="bl-actions">${run ? `<button class="bl-btn ghost" data-a="coachAi" ${b.coachBusy ? 'disabled' : ''}>${b.coachBusy ? 'La IA está analizando…' : ai ? 'Pedir más consejos a la IA' : 'Analizar a fondo con IA'}</button>` : `<button class="bl-btn" data-a="quickRun">Probar para recibir consejos</button>`}${run && !b.sweeps ? `<button class="bl-btn ghost" data-a="sweep">¿En qué monedas funciona mejor?</button>` : ''}</div>
        ${b.coachErr ? note('⚠ ' + b.coachErr, 'warn') : ''}</div>`;
    if (run && CO && LLM && !ai && !b.coachBusy && b.coachTried !== b.mainV) { b.coachTried = b.mainV; coachAi(b, true); }
  }
  /* ───────── Probar antes de aplicar ─────────
     1) Vuelve a correr la versión actual con las velas de hoy (si su prueba es vieja) para comparar en los MISMOS datos.
     2) Corre la variante. 3) Juzga sobre todo con los datos que no se usaron para armarla (validación + prueba), sin castigar diferencias mínimas.
     La variante queda como «candidata»: solo pasa a principal si tú la aplicas. */
  const TQ = new Map(); let tipChain = Promise.resolve();
  const oosOf = r => ((r.segments && r.segments.val && r.segments.val.retPct) || 0) + ((r.segments && r.segments.test && r.segments.test.retPct) || 0);
  const seg = (x, k) => (x.segments && x.segments[k] && x.segments[k].retPct) || 0;
  function judge(r, m) {
    const rm = r.metrics, mm = m.metrics, dO = oosOf(r) - oosOf(m), dAll = rm.retPct - mm.retPct, dDD = rm.maxDDPct - mm.maxDDPct, pfx = x => x.profitFactor == null ? (x.pfInf ? '∞' : '—') : num(x.profitFactor, 2);
    const c = (d, inv) => Math.abs(d) < .05 ? '' : (inv ? d < 0 : d > 0) ? 'pos' : 'neg';
    const why = [['Datos que no vio', pct(oosOf(m)), pct(oosOf(r)), c(dO)], ['Todo el periodo', pct(mm.retPct), pct(rm.retPct), c(dAll)], ['Caída máxima', num(mm.maxDDPct, 1) + ' %', num(rm.maxDDPct, 1) + ' %', c(dDD, true)],
      ['Aciertos', mm.winRate == null ? '—' : num(mm.winRate, 0) + ' %', rm.winRate == null ? '—' : num(rm.winRate, 0) + ' %', c((rm.winRate || 0) - (mm.winRate || 0))], ['Factor de beneficio', pfx(mm), pfx(rm), ''], ['Operaciones', String(mm.n), String(rm.n), '']];
    const ddTol = Math.max(1.5, mm.maxDDPct * .3);
    let lvl, say;
    if (rm.n < Math.max(5, mm.n * .25)) { lvl = 'malo'; say = `Casi deja de operar (${rm.n} operaciones contra ${mm.n}): el resultado no es confiable.`; }
    else if (dO >= .5 && dDD <= ddTol && dAll > -2 && seg(r, 'val') - seg(m, 'val') > -1 && seg(r, 'test') - seg(m, 'test') > -1) { lvl = 'mejora'; say = `Gana ${num(dO, 1)} puntos más en los datos que no vio${dAll > 0 ? ` y ${num(dAll, 1)} más en todo el periodo` : ''}, sin subir mucho la caída máxima.`; }
    else if (dO <= -.5 || dDD > ddTol * 1.5) { lvl = 'empeora'; say = dO <= -.5 ? `Pierde ${num(-dO, 1)} puntos en los datos que no vio${dAll > 0 ? ' (aunque en el periodo completo se vea mejor: eso suele ser sobreajuste)' : ''}.` : `La caída máxima sube ${num(dDD, 1)} puntos: más riesgo.`; }
    else if (dO >= .5) { lvl = 'igual'; say = 'Gana más en total, pero no en las dos partes de los datos que no vio (validación y prueba): parece suerte de un tramo, no una mejora real.'; }
    else { lvl = 'igual'; say = `La diferencia es muy chica (${dO >= 0 ? '+' : '−'}${num(Math.abs(dO), 1, 1)} puntos en lo que no vio): no vale la pena el cambio salvo que te guste por otra razón.`; }
    return {lvl, say, why};
  }
  function testTip(b, t) {
    const key = t.manual ? 'manual:' + Date.now() : tipKey(t), qk = b.id + '|' + key; if (TQ.has(qk)) return;
    let sp; try { sp = t.spec ? B.normalizeSpec(t.spec) : CO.apply(mainSpec(b), t.patch); } catch (e) { return toast('El consejo no es aplicable: ' + (e.message || e)); } const v = B.validateSpec(sp); if (!v.ok) return toast('No se puede probar: ' + v.errors[0]);
    const job = {bid: b.id, key, title: t.title, st: 'cola'}; TQ.set(qk, job); render();
    tipChain = tipChain.then(async () => {
      job.st = 'probando'; if (view === 'bot' && cur === b.id) render();
      try {
        const m0 = runOf(b), bars = (m0 && m0.reqBars) || 3000, iv = B.IV_MS[mainSpec(b).interval] || 36e5;
        let m = m0; if (!m || Date.now() - (m.t || 0) > iv) { job.msg = 'Actualizando la versión actual con las velas de hoy…'; if (view === 'bot' && cur === b.id) render(); m = await runBot(b, b.mainV, bars); }
        const nv = Math.max(...b.versions.map(x => x.v)) + 1; b.versions.push({v: nv, spec: sp, at: Date.now(), note: t.manual ? t.title : 'Consejo: ' + t.title, origin: t.manual ? 'edición tuya' : 'consejo de la IA', state: 'prueba', base: b.mainV});
        job.msg = 'Probando el cambio con velas reales…'; if (view === 'bot' && cur === b.id) render();
        const r = await runBot(b, nv, bars), J = judge(r, m), good = J.lvl === 'mejora'; ver(b, nv).state = good ? 'candidata' : 'descartada'; J.auto = !good;
        if (!good && !t.manual) { const k2 = tipKey(t), rr = runOf(b); b.ignoredTips = (b.ignoredTips || []).filter(z => (typeof z === 'string' ? z : z.k) !== k2); b.ignoredTips.push({k: k2, at: Date.now(), run: rr && rr.id, n: liveClosed(b)}); }
        (b.tipTests = b.tipTests || {})[key] = Object.assign({v: nv, base: b.mainV, title: t.title, at: Date.now(), tip: t.manual ? null : t}, J);
        log(b, t.manual ? 'edición' : 'consejo', `Probado «${t.title}» (v${nv}): ${({mejora: 'sí mejora, listo para aplicar', igual: 'casi igual, se queda la versión actual', empeora: 'empeora, se queda la versión actual', malo: 'no sirve así, se queda la versión actual'})[J.lvl]}.`);
        const ks = Object.entries(b.tipTests).filter(([, y]) => y.auto).sort((a2, z) => (z[1].at || 0) - (a2[1].at || 0)); for (const [k3] of ks.slice(5)) delete b.tipTests[k3]; touch(b);
      } catch (e) { b.versions.forEach(z => { if (z.state === 'prueba') z.state = 'descartada'; }); touch(b); toast('No se pudo probar «' + t.title + '»: ' + (e.message || e)); }
      TQ.delete(qk); if (view === 'bot' && cur === b.id) render();
    });
  }
  function applyTested(b, key) {
    const x = (b.tipTests || {})[key]; if (!x || !ver(b, x.v)) return; const old = b.mainV, m = runOf(b), r = runOf(b, x.v);
    b.versions.forEach(z => { if (z.v === b.mainV) z.state = 'anterior'; }); ver(b, x.v).state = 'principal'; b.mainV = x.v; log(b, 'versión', `La v${x.v} («${x.title}») pasó a ser la principal.`); relive(b);
    const k = z => z && {ret: z.metrics.retPct, win: z.metrics.winRate, dd: z.metrics.maxDDPct}; b.lastApply = {title: x.title, v: x.v, prev: old, promoted: true, before: k(m), after: k(r), at: Date.now()}; freshV = {id: b.id, v: x.v};
    delete b.tipTests[key]; for (const [k2, y] of Object.entries(b.tipTests)) if (y.base !== b.mainV) { const vv = ver(b, y.v); if (vv && vv.state === 'candidata') vv.state = 'descartada'; delete b.tipTests[k2]; } // las otras pruebas se compararon contra la versión anterior
    touch(b); render(); toast(`Aplicado: v${x.v} es la principal.`);
  }
  /* Consejo aplicado: versión nueva → backtest → principal solo si no empeora fuera de muestra (si empeora, lo decides tú) */
  async function applyTip(b, t, force) {
    const old = b.mainV, m = runOf(b), sp = t.spec ? B.normalizeSpec(t.spec) : CO.apply(mainSpec(b), t.patch), v = B.validateSpec(sp); if (!v.ok) return toast('El consejo no es aplicable: ' + v.errors[0]);
    const nv = Math.max(...b.versions.map(x => x.v)) + 1; b.versions.push({v: nv, spec: sp, at: Date.now(), note: t.manual ? t.title : 'Consejo: ' + t.title, origin: t.manual ? 'edición tuya' : 'consejo de la IA (aplicado por ti)', state: 'candidata'}); log(b, t.manual ? 'edición' : 'consejo', t.manual ? `Editaste las reglas: nueva v${nv}.` : `Aplicaste el consejo «${t.title}» como v${nv}.`); touch(b);
    busyMsg = 'Probando el consejo con velas reales…'; render(); let r = null; try { r = await runBot(b, nv, (m && m.reqBars) || 3000); } catch (e) { toast('No se pudo probar: ' + (e.message || e)); } busyMsg = '';
    if (!r) { render(); return; }
    const promote = force || !m || !worse(r, m); if (promote) { b.versions.forEach(x => { if (x.v === b.mainV) x.state = 'anterior'; }); ver(b, nv).state = 'principal'; b.mainV = nv; log(b, 'versión', `La v${nv} (consejo «${t.title}») pasó a ser la principal.`);  relive(b); }
    const k = x => x && {ret: x.metrics.retPct, win: x.metrics.winRate, dd: x.metrics.maxDDPct}; b.lastApply = {title: t.title, v: nv, prev: old, promoted: promote, before: k(m), after: k(r), tip: t, at: Date.now()}; freshV = {id: b.id, v: nv}; touch(b); if (view === 'bot' && cur === b.id) render();
  }
  const COACH_SYS = `Eres el entrenador de UN bot de trading concreto dentro de un laboratorio de backtesting. Hablas en español sencillo. Usa SOLO las reglas y números del contexto; no inventes resultados ni prometas ganancias. Responde SOLO con JSON:
{"resumen":"3-5 frases: cómo va este bot, qué viste en sus resultados y su mayor debilidad","tips":[{"titulo":"acción corta","por_que":"motivo con los números del contexto","patch":{...}}]}
Máximo 4 tips, enfocados en subir el porcentaje de aciertos y la robustez fuera de muestra. "patch" es un fragmento de la especificación del bot con el MISMO esquema (solo los campos que cambian; las listas de condiciones se sustituyen completas, así que incluye también las condiciones que se conservan). Puedes cambiar symbol (Binance Spot terminado en USDT) o interval si recomiendas otro activo o temporalidad.`;
  async function coachAi(b, quiet) {
    const run = runOf(b); if (!run || !LLM || b.coachBusy) return; b.coachBusy = true; b.coachErr = ''; if (view === 'bot' && cur === b.id && sub.est === 'tips' && tab === 'est') render();
    try {
      const sw = b.sweeps ? '\n\nANÁLISIS EN OTROS MERCADOS:\n' + JSON.stringify(b.sweeps.rows.filter(x => !x.err).map(x => [x.symbol, x.interval, x.n, Math.round(x.retPct * 10) / 10, x.win == null ? null : Math.round(x.win)])) : '';
      const ctx = ctxOf(b, run) + '\n\nDESGLOSE (por horario UTC de 4 h, tendencia, volatilidad y lado):\n' + JSON.stringify(run.breakdown || {}) + sw;
      const r = await LLM.chat([{role: 'system', content: COACH_SYS}, {role: 'user', content: ctx}], {maxTokens: 1100, temperature: .2, timeout: 90000, noOwn: !!quiet});
      const raw = (/```json\s*([\s\S]*?)```/.exec(r.text) || [null, r.text])[1], j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      b.coach = {runId: run.id, v: b.mainV, at: Date.now(), text: String(j.resumen || '').slice(0, 1200), tips: (j.tips || []).slice(0, 4).map(t => ({kind: 'ia', title: String(t.titulo || 'Consejo de la IA').slice(0, 90), why: String(t.por_que || '').slice(0, 400), patch: t.patch}))};
      log(b, 'consejo', 'La IA analizó el bot y dejó ' + b.coach.tips.length + ' sugerencia(s).');
    } catch (e) { b.coachErr = quiet ? '' : 'La IA no respondió (' + (LLM.friendly ? LLM.friendly(e) : e.message) + '). Los consejos de arriba se calculan sin IA con tus datos.'; }
    b.coachBusy = false; touch(b); if (view === 'bot' && cur === b.id && tab === 'est') render();
  }



  /* ----- Paper trading (simulación hacia adelante; sin órdenes reales) ----- */
  const PP = () => window.CCTBotPaper;
  function trimLedger(sess) { const L = sess.ledger; for (let i = 0; i < L.length - 300; i++) { delete L[i].reasonIn; delete L[i].ctx; delete L[i].sl; delete L[i].tp; } }
  async function paperStep(b, sess) {
    const uo = userOps(sess.spec), ropts = {nova: window.NovaNexus, user: null, gate: window.CCTBotRisk ? window.CCTBotRisk.gateFor(S.risk, allSessions(), Date.now())(sess) : null};
    const getC = async (sym, itv, count) => { const C = await H.history(sym, itv, count); if (uo.length) { const user = {}; for (const sid of [...new Set(uo.map(x => x.sid))]) { const res = await H.runPine(sid, sym, itv, C); if (!res || !res.ok) throw new Error('Tu indicador falló: ' + ((res && res.error && res.error.msg) || '')); const src = window.CCTBotOpt.extractSources(res, C.length); for (const x of uo.filter(y => y.sid === sid)) { const f = window.CCTBotOpt.pickSource(src, x, C.length); if (!f) throw new Error('Tu indicador «' + (x.sname || sid) + '» ya no tiene la línea «' + (x.sl || x.src) + '»'); user[sid + '|' + x.src] = f.series; } } ropts.user = user; } return C; };
    const before = sess.ledger.length, r = await PP().step(sess, getC, ropts); notify(b, sess); if (r.changed) { trimLedger(sess); for (const t of sess.ledger.slice(before)) log(b, 'paper', `Paper v${sess.v}: ${t.side === 'long' ? 'compra' : 'venta'} cerrada ${t.net >= 0 ? '+' : '−'}$${num(Math.abs(t.net), 2)} · ${t.why || ''}`); } sess.checkedAt = Date.now(); touch(b); return r;
  }
  const paperBusy = new Set();
  const discordOk = () => { try { const D = window.CCT_discordStore && window.CCT_discordStore.get(); return !!(D && D.url && (D.on || {}).bots !== false && !(window.CCT_discordOn && !window.CCT_discordOn())); } catch { return false; } };
  function notify(b, sess) {
    const N = window.CCTBotNotify; if (!N) return; const evs = N.pending(sess); if (!evs.length || b.notify === false) return;
    if (window.CCT_botNotify && N.push) for (const e of evs.slice(-3)) { const m = N.push(b, sess, e); window.CCT_botNotify(m.title, m.body, m.tag); } // aviso en la app y en el celular (misma etiqueta que el servidor)
    if (!window.CCTDiscord) return; const em = evs.slice(-6).map(e => N.embed(b, sess, e));
    if (b.dcDest === 'own' && HOOK_RE.test(b.dcHook || '') && window.CCTDiscord.sendTo) window.CCTDiscord.sendTo(b.dcHook, em); else if (discordOk()) window.CCTDiscord.send(em);
  }
  async function paperUpdate(b, sess, quiet) {
    if (paperBusy.has(sess.id)) return; paperBusy.add(sess.id);
    try { await paperStep(b, sess); sess.err = null; } catch (e) { sess.err = String(e.message || e); if (!quiet) toast('Paper trading: ' + sess.err); touch(b); }
    paperBusy.delete(sess.id); if (view === 'bot' && cur === b.id && /^(pap|sum|diary)$/.test(tab) && !(document.activeElement && root.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) render(); else if (view === 'lib' || view === 'tourn') render();
  }
  function paperTick(force) { // pone al día las sesiones activas cuando cierra una vela nueva
    if (!H.history || !desk()) return; const now = Date.now(); riskTick();
    for (const b of S.bots) for (const s of b.paper || []) { if (s.status !== 'running') continue; const iv = B.IV_MS[s.spec.interval]; if (force || !s.last || now >= s.last.t + 2 * iv) paperUpdate(b, s, true); }
  }
  function tabPap(b) {
    const T = $('#blTab'), ss = b.paper || [], vs = b.versions.filter(v => v.state !== 'descartada');
    T.innerHTML = `<div class="bl-box"><h4>Nueva simulación en vivo</h4><details class="pv-what"><summary>¿Qué es esto?</summary>${note('Prueba hacia adelante con capital virtual: el bot opera con velas que cierran DESPUÉS de empezar, con comisiones y deslizamiento. No envía órdenes reales ni toca fondos. Es la prueba que un backtest no puede dar. Congela la versión elegida; la sesión empieza plana.')}</details>
      <div class="bl-grid">${fld('Versión a probar', `<select id="papV">${vs.map(v => `<option value="${v.v}" ${v.v === b.mainV ? 'selected' : ''}>v${v.v} ${v.v === b.mainV ? '(principal)' : '(' + v.state + ')'}</option>`).join('')}</select>`)}${fld('Capital virtual ($)', `<input id="papCap" type="number" min="100" step="100" value="${mainSpec(b).risk.capital}">`)}</div>
      <div class="bl-actions"><button class="bl-btn" data-a="papStart">Iniciar simulación en vivo</button></div><details class="pv-what"><summary>¿Cuánto tiempo sigue?</summary>${note('Una vez encendida sigue simulando hasta que tú la pauses o la termines (pausar el bot también la pausa). Se actualiza al abrir el laboratorio y cada vez que cierra una vela mientras lo tienes abierto; al volver después de días se pone al día con las velas reales. Con la cuenta iniciada y el flujo de GitHub «Paper trading de bots» activo, también avanza cada hora sin la app abierta.')}</details></div>` +
      (ss.length ? ss.slice().reverse().sort((x, z) => pvRank(z) - pvRank(x)).map(s => pvRank(s) === 2 ? paperCard(b, s) : paperMini(b, s)).join('') : `<div class="bl-empty"><p><b>Sin sesiones todavía.</b></p><p class="bl-dim">Inicia una para ver cómo se comporta el bot en vivo, sin riesgo.</p></div>`);
    setTimeout(() => paperTick(), 50); const drawPc = s => { const cv = $('#pc' + s.id); if (cv && cv.offsetWidth && s.curve.length > 1) lineChart(cv, [{pts: s.curve, color: '#4c8dff', w: 1.8, fill: 1}], {yfmt: v => '$' + num(v, 0)}); };
    ss.forEach(drawPc); ss.filter(x => x.open && x.status === 'running').forEach(x => mountOpen(x)); T.querySelectorAll('.pv-mini').forEach(d => { if (miniOpen.has(d.dataset.pid)) { d.open = true; drawPc(ss.find(x => x.id === d.dataset.pid)); } d.addEventListener('toggle', () => { const x = ss.find(z => z.id === d.dataset.pid); if (d.open) { miniOpen.add(d.dataset.pid); drawPc(x); } else miniOpen.delete(d.dataset.pid); }); });
  }
  /* Sesión en vivo (paper) explicada con dibujos: resultado grande, estado, la posición abierta en una barra (stop · entrada · ahora · objetivo),
     números clave como fichas y backtest vs vivo en barras pareadas. El detalle técnico queda plegado. */
  /* Posición abierta en vivo: el precio de las últimas velas con la entrada, el stop (rojo), el objetivo (verde) y dónde va ahora */
  async function mountOpen(sess) {
    const host = $('#pvc' + sess.id); if (!host) return; let C; try { C = await candlesFor(sess.spec.symbol, sess.spec.interval, 90); } catch { return; } if (!host.isConnected || !C || C.length < 3) return;
    const o = sess.open; if (!o) return; { const ie = C.findIndex(c => c.t >= o.entryT); C = C.slice(Math.max(0, Math.min(C.length - 30, (ie < 0 ? C.length : ie) - 25))); } const W = Math.max(280, host.clientWidth || 600), H = 170, P = {l: 6, r: 104, t: 10, b: 10};
    const lvls = [o.sl, o.entry, o.tp].filter(Number.isFinite), lo = Math.min(...C.map(c => c.l), ...lvls), hi = Math.max(...C.map(c => c.h), ...lvls), tA = C[0].t, tB = C[C.length - 1].t;
    const X = t => P.l + (t - tA) / Math.max(1, tB - tA) * (W - P.l - P.r), Y = p => P.t + (hi - p) / Math.max(1e-9, hi - lo) * (H - P.t - P.b), fp = v => num(v, v >= 100 ? 2 : 4), lg = o.side === 'long';
    const xe = Math.max(P.l, X(o.entryT)), now = C[C.length - 1].c, line = C.map((c, i) => `${i ? 'L' : 'M'}${X(c.t).toFixed(1)} ${Y(c.c).toFixed(1)}`).join('');
    const zone = (a, b2, k) => Number.isFinite(a) && Number.isFinite(b2) ? `<rect class="oc-z ${k}" x="${xe.toFixed(1)}" y="${Math.min(Y(a), Y(b2)).toFixed(1)}" width="${(W - P.r - xe).toFixed(1)}" height="${Math.abs(Y(a) - Y(b2)).toFixed(1)}"/>` : '';
    const lv = (v, k, lab) => Number.isFinite(v) ? `<line class="oc-l ${k}" x1="${xe.toFixed(1)}" x2="${(W - P.r).toFixed(1)}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><g class="oc-tag ${k}" transform="translate(${(W - P.r + 3).toFixed(1)} ${Y(v).toFixed(1)})"><rect x="0" y="-8" width="${P.r - 4}" height="16" rx="4"/><text x="5" y="4">${lab} ${fp(v)}</text></g>` : '';
    host.innerHTML = `<svg class="oc" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${zone(o.entry, o.tp, 'tp')}${zone(o.entry, o.sl, 'sl')}<path class="oc-p" d="${line}"/>${lv(o.sl, 'sl', 'SL')}${lv(o.tp, 'tp', 'TP')}${lv(o.entry, 'en', lg ? 'Compra' : 'Venta')}
      <path class="oc-in ${lg ? 'lg' : 'sh'}" d="${lg ? `M${xe.toFixed(1)} ${(Y(o.entry) + 4).toFixed(1)}l-6 9h12z` : `M${xe.toFixed(1)} ${(Y(o.entry) - 4).toFixed(1)}l-6 -9h12z`}"/><circle class="oc-now" cx="${X(tB).toFixed(1)}" cy="${Y(now).toFixed(1)}" r="4"/></svg>`;
  }
  /* ───────── Señales de bots en el gráfico (también los que usan indicadores Nova o tuyos, que no se pueden pasar a script) ─────────
     El bot se corre sobre la moneda y temporalidad que tengas abierta y el gráfico dibuja sus cajitas COMPRA / VENTA con entrada, SL y TP. */
  const sigCache = new Map(); let sigBusy = false, sigWant = null;
  const sigLayers = () => S.bots.filter(b => b.sigOn && b.status !== 'archived');
  function sigPush() { if (!H.sigs) return; const out = []; for (const b of sigLayers()) for (const [k, v] of sigCache) if (k.startsWith(b.id + '|') && v.trades) out.push({id: b.id, name: b.name, col: colOf(b.id), symbol: v.symbol, interval: v.interval, trades: v.trades}); H.sigs(out); }
  async function sigNeed(sym, iv) {
    const L = sigLayers(); if (!L.length) { if (sigCache.size) { sigCache.clear(); sigPush(); } return; } sigWant = [sym, iv]; if (sigBusy) return; sigBusy = true;
    try { for (const b of L) { const [sy, it] = sigWant, k = `${b.id}|${sy}|${it}|v${b.mainV}`, c = sigCache.get(k), ivm = B.IV_MS[it] || 36e5; if (c && Date.now() - c.at < Math.min(ivm / 3, 15 * 6e4)) continue;
        try { const sp = Object.assign(JSON.parse(JSON.stringify(mainSpec(b))), {symbol: sy, interval: it}); delete sp.basket; delete sp.intervals;
          const C = await candlesFor(sy, it, 700), uo = userOps(sp), user = {};
          for (const sid of [...new Set(uo.map(x => x.sid))]) { const r = await userSources(sid, sy, it, 700); for (const x of uo.filter(y => y.sid === sid)) { const f = window.CCTBotOpt.pickSource(r.sources, x, r.n); if (f) user[sid + '|' + x.src] = f.series; else throw new Error('falta la línea ' + (x.sl || x.src)); } }
          const res = B.backtest(C, B.normalizeSpec(sp), {nova: window.NovaNexus, user}); for (const kk of [...sigCache.keys()]) if (kk.startsWith(b.id + '|') && kk !== k) sigCache.delete(kk);
          sigCache.set(k, {at: Date.now(), symbol: sy, interval: it, trades: res.trades.slice(-150).map(t => ({side: t.side, entryT: t.entryT, exitT: t.exitT, entry: t.entry, exit: t.exit, sl: t.sl, tp: t.tp, net: t.net, why: t.why, open: !!t.open}))});
        } catch (e) { sigCache.set(k, {at: Date.now(), symbol: sy, interval: it, trades: [], err: String(e.message || e)}); } }
      sigPush();
    } finally { sigBusy = false; }
  }
  window.CCTBotSig = {need: (sym, iv) => { sigNeed(sym, iv); }, has: () => sigLayers().length > 0};
  const miniOpen = new Set(), pvRank = s => s.status === 'running' ? (s.open ? 2 : 1) : 0;
  /* Avisos a Discord de cada bot: encender/apagar y elegir el canal (tu canal de VORTEX o uno solo para este bot, con su webhook) */
  const HOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;
  let dcPanel = null, lookPanel = null;
  function dcBox(b) {
    const on = b.notify !== false, own = b.dcDest === 'own', has = HOOK_RE.test(b.dcHook || ''), main = discordOk();
    return `<div class="bl-dc"><div class="bl-dc-h"><b>Avisos a Discord de ${esc(b.name)}</b><button type="button" class="bl-dctg ${on ? 'on' : ''}" data-a="dcOn" aria-pressed="${on}"><i></i></button></div>
      <p class="bl-dim">Cuando compra, vende o cierra una operación en vivo.</p>
      <div class="bl-dc-opts ${on ? '' : 'off'}">
        <button type="button" class="bl-dc-o ${!own ? 'on' : ''}" data-a="dcDest" data-k="main"><span class="bl-dc-r"></span><div><b>Mi canal de VORTEX</b><small>${main ? 'conectado · el mismo de tus otros avisos' : 'todavía sin configurar'}</small></div></button>
        <button type="button" class="bl-dc-o ${own ? 'on' : ''}" data-a="dcDest" data-k="own"><span class="bl-dc-r"></span><div><b>Un canal solo para ${esc(b.name)}</b><small>${has ? 'conectado' : 'crea un canal y pega su webhook'}</small></div></button>
      </div>
      ${on && !own && !main ? `<div class="bl-actions"><button class="bl-btn ghost" data-a="dcCfg">Configurar mi canal</button></div>` : ''}
      ${on && own ? `<div class="bl-dc-own">${has ? `<p class="bl-dc-ok">✓ Conectado a su canal</p><div class="bl-actions"><button class="bl-btn ghost" data-a="dcDel">Quitar este canal</button></div><details class="pv-what"><summary>Cambiar de canal</summary>` : ''}
        <ol class="bl-dc-steps"><li>En tu servidor de Discord crea un canal nuevo (por ejemplo <b>#${esc(String(b.name).toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, '-'))}</b>) y ponlo privado.</li><li>En el canal: <b>Editar canal › Integraciones › Webhooks › Nuevo webhook › Copiar URL</b>.</li><li>Pégala aquí:</li></ol>
        <div class="bl-dc-in"><input id="dcHookIn" type="url" placeholder="https://discord.com/api/webhooks/…" autocomplete="off"><button class="bl-btn" data-a="dcSave">Guardar y probar</button></div>${has ? '</details>' : ''}</div>` : ''}
    </div>`;
  }
  /* Sesión sin posición abierta: tarjeta pequeña; al tocarla se despliega completa */
  function paperMini(b, s) {
    const st = PP().stats(s), run = s.status === 'running', iv0 = B.IV_MS[s.spec.interval] || 36e5, prob = run && (s.err || s.halted || Date.now() - (((s.last && s.last.t) || s.startT || 0) + iv0) > 3 * iv0 + 20 * 6e4), lab = run ? (prob ? 'Con problema' : 'Esperando señal') : s.status === 'paused' ? 'En pausa' : 'Terminada';
    return `<details class="pv-mini ${prob ? 'prob' : run ? 'on' : 'off'}" data-pid="${s.id}"><summary><span class="pv-mdot"></span><b>v${s.v} · ${esc(s.spec.symbol.replace('USDT', ''))} ${s.spec.interval}</b><span class="pv-mlab">${lab}</span><span class="pv-mn">${st.nClosed} op.</span><b class="pv-mr ${cls(st.net)}">${pct(st.retPct)}</b><i class="pv-mch"></i></summary>${paperCard(b, s)}</details>`;
  }
  function paperCard(b, s) {
    const st = PP().stats(s), ok = PP().verify(s), bt = runOf(b, s.v), btm = bt && bt.metrics, per = Math.max(1, st.days), run = s.status === 'running';
    const iv0 = B.IV_MS[s.spec.interval] || 36e5, stale = run && Date.now() - (((s.last && s.last.t) || s.startT || 0) + iv0) > 3 * iv0 + 20 * 6e4, prob = run && (s.err || s.halted || stale);
    const chip = run ? (s.err ? 'Con problema' : stale ? 'Atrasado' : s.halted ? 'Detenido por riesgo' : 'Simulando') : s.status === 'paused' ? 'En pausa' : 'Terminada';
    const drift = btm && st.n >= 20 && ((st.winRate != null && btm.winRate != null && Math.abs(st.winRate - btm.winRate) > 15) || (st.net < 0 && btm.net > 0));
    const fp = v => num(v, v >= 100 ? 2 : 4), o = s.open, now = s.last && s.last.c;
    const posBar = o ? (() => { const lg = o.side === 'long', pts = [['Stop', o.sl, 'sl'], ['Entrada', o.entry, 'en'], ['Ahora', now, 'nw'], ['Objetivo', o.tp, 'tp']].filter(x => Number.isFinite(x[1]));
      const lo = Math.min(...pts.map(x => x[1])), hi = Math.max(...pts.map(x => x[1])), P = v => hi > lo ? (v - lo) / (hi - lo) * 100 : 50;
      return `<div class="pv-pos"><div class="pv-oc" id="pvc${s.id}" data-sym="${esc(s.spec.symbol)}" data-iv="${esc(s.spec.interval)}"></div><div class="pv-pos-h"><span class="pv-side ${lg ? 'lg' : 'sh'}">${lg ? 'Compró' : 'Vendió en corto'}</span><b class="${cls(o.unreal)}">${money(o.unreal)}</b><small>abierta desde ${dt(o.entryT)}</small></div>
        <div class="pv-track">${Number.isFinite(now) ? `<i class="pv-fill ${cls(o.unreal)}" style="left:${Math.min(P(o.entry), P(now)).toFixed(1)}%;width:${Math.abs(P(now) - P(o.entry)).toFixed(1)}%"></i>` : ''}${pts.map(([l, v, k]) => `<span class="pv-mk ${k}" style="left:${P(v).toFixed(1)}%"><i></i><b>${l}</b><small>${fp(v)}</small></span>`).join('')}</div>${o.reasonIn ? `<p class="pv-why">${esc(o.reasonIn)}</p>` : ''}</div>`; })()
      : `<div class="pv-wait"><span class="pv-radar"><i></i></span><div><b>${run ? 'Esperando la próxima señal' : 'Sin posición abierta'}</b><small>${run ? 'revisa el mercado cada vez que cierra una vela' : ''}</small></div></div>`;
    const chipK = (ic, lab, val, c) => `<div class="pv-k"><span class="pv-ki">${ic}</span><div><small>${lab}</small><b class="${c || ''}">${val}</b></div></div>`;
    const pair = (lab, a, bb, fmt, inv) => { const mx = Math.max(1e-9, Math.abs(a || 0), Math.abs(bb || 0)); return `<div class="pv-pair"><span>${lab}</span><div class="pv-pb"><i class="bt" style="width:${(Math.abs(a || 0) / mx * 100).toFixed(0)}%"></i><em>${fmt(a)}</em></div><div class="pv-pb"><i class="lv ${inv ? '' : ''}" style="width:${(Math.abs(bb || 0) / mx * 100).toFixed(0)}%"></i><em>${fmt(bb)}</em></div></div>`; };
    const ring = v => { const p = Math.max(0, Math.min(100, v || 0)), c = 2 * Math.PI * 22; return `<svg class="pv-ring" viewBox="0 0 54 54"><circle cx="27" cy="27" r="22" class="b"/><circle cx="27" cy="27" r="22" class="f ${p >= 50 ? 'pos' : 'mid'}" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 27 27)"/><text x="27" y="31">${v == null ? '—' : Math.round(v) + '%'}</text></svg>`; };
    const IC2 = {n: '<svg viewBox="0 0 24 24"><path d="M4 18 9 12l4 3 7-8"/></svg>', pf: '<svg viewBox="0 0 24 24"><path d="M12 3v18M6 9h12M6 15h12"/></svg>', dd: '<svg viewBox="0 0 24 24"><path d="M4 6l6 6 4-3 6 9"/></svg>', ex: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>', fee: '<svg viewBox="0 0 24 24"><path d="M6 18 18 6M8 7h.01M16 17h.01"/></svg>'};
    return `<div class="bl-box pv ${run ? 'pv-on' : ''}"><div class="pv-top"><div class="pv-res"><small>${chip} · v${s.v} · ${esc(s.spec.symbol.replace('USDT', ''))} ${s.spec.interval}</small><b class="${cls(st.net)}">${pct(st.retPct)}</b><em>${money(st.equity)} <span>de ${money(s.capital)}</span></em></div>${ring(st.winRate)}<span class="pv-state s-${prob ? 'prob' : run ? 'on' : s.status}"><i></i>${chip}</span></div>
      ${s.err ? note('⚠ ' + s.err, 'warn') : ''}${!ok ? note('⚠ El libro de operaciones no pasa la verificación de integridad (fue modificado).', 'warn') : ''}${(s.gaps || []).map(g => note(`⚠ ${g.why} (${dd(g.from)} – ${dd(g.to)})`, 'warn')).join('')}${(s.notes || []).map(n => note('⚠ ' + n.text, 'warn')).join('')}
      ${posBar}
      <div class="pv-ks">${chipK(IC2.n, 'Operaciones', st.nClosed)}${chipK(IC2.pf, 'Factor de beneficio', pf(st))}${chipK(IC2.dd, 'Caída máx.', num(st.maxDDPct, 1) + ' %', 'neg')}${chipK(IC2.ex, 'Por operación', money(st.expectancy), cls(st.expectancy))}${chipK(IC2.fee, 'Comisiones', money(-st.fees))}</div>
      ${s.curve.length > 1 ? `<div class="bl-chart"><h4>Cómo va su capital</h4><canvas id="pc${s.id}" data-h="140" style="width:100%;height:140px"></canvas></div>` : ''}
      ${btm ? `<div class="pv-cmp"><h4>Lo que prometió vs. lo que está haciendo</h4><div class="pv-leg"><span><i class="bt"></i>Backtest</span><span><i class="lv"></i>En vivo</span></div>${pair('Aciertos', btm.winRate, st.winRate, v => v == null ? '—' : num(v, 0) + ' %')}${pair('Por operación', btm.expectancy, st.expectancy, money)}${pair('Operaciones al día', btm.n / Math.max(1, btm.days), st.nClosed / per, v => num(v, 2))}${pair('Caída máx.', btm.maxDDPct, st.maxDDPct, v => num(v, 1) + ' %')}${drift ? `<p class="pv-alert">Se está alejando de lo que mostró el backtest: revisa si el mercado cambió.</p>` : ''}</div>` : ''}
      ${s.ledger.length ? `<details><summary class="bl-dim">Libro de operaciones (${s.ledger.length})</summary><div class="bl-scroll"><table class="bl-t"><thead><tr><th>#</th><th>Entrada</th><th></th><th>Precio</th><th>Neto</th><th>Motivo</th></tr></thead><tbody>${s.ledger.slice(-60).reverse().map(t => `<tr><td>${t.n}</td><td>${dt(t.entryT)}</td><td>${t.side === 'long' ? 'Compra' : 'Venta'}</td><td>${num(t.entry, 4)}→${num(t.exit, 4)}</td><td class="${cls(t.net)}">${money(t.net)}</td><td class="bl-why">${esc(t.why || '')}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      <small class="bl-dim">Desde ${dt(s.startT)} · ${num(st.days, 1)} días${s.checkedAt ? ' · actualizado ' + dt(s.checkedAt) + (s.by === 'servidor' ? ' (servidor)' : '') : ''}</small>
      <div class="bl-card-b"><button class="bl-mini" data-a="papUpd" data-id="${s.id}" ${!run ? 'disabled' : ''}>Actualizar ahora</button>${run ? `<button class="bl-mini" data-a="papPause" data-id="${s.id}">Pausar</button>` : s.status === 'paused' ? `<button class="bl-mini" data-a="papResume" data-id="${s.id}">Reanudar</button>` : ''}${s.status !== 'stopped' ? `<button class="bl-mini danger" data-a="papStop" data-id="${s.id}">Terminar</button>` : ''}</div></div>`;
  }


  /* ----- Panel de riesgo independiente (cartera) ----- */
  const allSessions = () => S.bots.flatMap(b => (b.status === 'archived' ? [] : b.paper || []));
  const RK = () => window.CCTBotRisk;
  function riskTick() { // detecta cambios de estado del riesgo global y los deja en el registro
    if (!RK()) return; const r = S.risk = RK().norm(S.risk), p = RK().portfolio(allSessions(), r, Date.now()), rules = p.breaches.map(b => b.rule).join(','); let ch = false;
    if (p.sessions && p.equity > (r.peak || 0)) { r.peak = p.equity; ch = true; }
    if ((r.lastRules || '') !== rules) { r.log.push({t: Date.now(), text: p.breaches.length ? 'ENTRADAS BLOQUEADAS: ' + p.breaches.map(b => b.text).join(' · ') : 'Riesgo normal: entradas permitidas de nuevo'}); if (r.log.length > 60) r.log.shift(); r.lastRules = rules; ch = true; }
    if (ch) { r.updatedAt = Date.now(); save(); } return p;
  }
  function riskView() {
    const r = S.risk = RK().norm(S.risk), p = riskTick(), run = allSessions().filter(s => s.status === 'running');
    const inp = (k, lab, hint) => fld(lab, `<input type="number" min="0" step="any" data-rk2="${k}" value="${r[k] || ''}" placeholder="0 = sin límite">`);
    root.innerHTML = head('Panel de riesgo', 'Vigila todos tus bots a la vez y puede vetar entradas nuevas', 'lib') +
      `<div class="bl-box ${p.blocked ? 'bl-alert' : ''}"><div class="bl-vrow"><span class="bl-verdict ${p.blocked ? 'v-pierde' : 'v-consistente'}">${p.blocked ? 'Entradas BLOQUEADAS' : 'Riesgo dentro de los límites'}</span></div>${p.breaches.map(b => `<p class="neg">${esc(b.text)}</p>`).join('')}${note('El módulo es independiente de cada bot: solo veta entradas NUEVAS en paper trading; nunca cierra posiciones ni cambia versiones. Aún no existen órdenes reales.')}</div>
      <div class="bl-metrics">${metric('Sesiones activas', p.sessions)}${metric('Capital virtual', money(p.capital))}${metric('Patrimonio', money(p.equity), cls(p.equity - p.capital))}${metric('Resultado de hoy', pct(p.dayPct, 2), cls(p.dayPnl))}${metric('Drawdown total', num(p.dd, 2) + ' %', 'neg')}${metric('Posiciones abiertas', p.openN)}${metric('Exposición total', num(p.expo, 0) + ' %')}</div>
      <div class="bl-box"><h4>Límites globales</h4><div class="bl-grid">${inp('maxDailyLossPct', 'Pérdida diaria total máxima (%)')}${inp('maxDrawdownPct', 'Drawdown total máximo (%)')}${inp('maxOpen', 'Posiciones abiertas máximas')}${inp('maxExposurePct', 'Exposición total máxima (% del capital)')}</div>
        <label class="bl-chk" style="margin-top:8px"><input type="checkbox" id="rkKill" ${r.kill ? 'checked' : ''}> <span><b>Interruptor de emergencia</b>: bloquear TODAS las entradas nuevas</span></label>
        <div class="bl-actions"><button class="bl-mini" data-a="rkPeak">Reiniciar el pico de patrimonio</button></div>${note('Se evalúa cada vez que se actualiza una sesión (app o servidor), no dentro de la vela, y no puede bloquear con efecto retroactivo velas procesadas en una puesta al día. El drawdown usa el pico de patrimonio registrado al actualizar.')}</div>
      <div class="bl-box"><h4>Sesiones vigiladas</h4>${run.length ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Bot</th><th>Mercado</th><th>Posición</th><th>Patrimonio</th></tr></thead><tbody>${S.bots.flatMap(b => (b.paper || []).filter(s => s.status === 'running' && b.status !== 'archived').map(s => `<tr><td>${esc(b.name)} v${s.v}</td><td>${esc(s.spec.symbol)} ${s.spec.interval}</td><td>${s.open ? (s.open.side === 'long' ? 'Compra' : 'Venta') + ' · ' + money(s.open.entry * s.open.qty) : '—'}</td><td>${money(s.cash + (s.open ? s.open.unreal : 0))}</td></tr>`)).join('')}</tbody></table></div>` : note('No hay sesiones de paper trading activas.')}</div>
      <div class="bl-box"><h4>Registro de eventos de riesgo</h4>${r.log.length ? `<ul class="bl-log">${r.log.slice().reverse().slice(0, 25).map(x => `<li><small>${dt(x.t)}</small><br>${esc(x.text)}</li>`).join('')}</ul>` : note('Sin eventos todavía.')}</div>`;
  }
  /* ----- Reentrenamiento: ciclo automático (servidor) + optimizar ahora (navegador) ----- */
  const CYC = {enabled: true, everyHours: 24, bars: 4000, auto: true}; // todos los bots: reentrenamiento diario y mejora automática (se puede apagar por bot)
  const cyc = b => b.cycle || (b.cycle = Object.assign({}, CYC));
  function pathLabel(spec, path) {
    const fx = {'risk.sl.v': 'Stop loss', 'risk.tp.v': 'Take profit', 'risk.trail.v': 'Trailing stop', 'risk.maxBars': 'Tiempo máximo (velas)', 'filters.minVolRatio': 'Volumen mínimo', 'filters.minAtrPct': 'Volatilidad mínima', 'filters.maxAtrPct': 'Volatilidad máxima'}; if (fx[path]) return fx[path];
    const m = /^(entry|exit)\.(long|short)\.(\d+)\.(a|b)\.(\w+)$/.exec(path); if (!m) return path; const c = getP(spec, `${m[1]}.${m[2]}.${m[3]}`), o = c && c[m[4]]; if (o && o.k === 'num') { const ot = c[m[4] === 'a' ? 'b' : 'a']; return `Umbral de ${ot && B.OPERANDS[ot.k] ? short(B.OPERANDS[ot.k].label) : 'indicador'} (${m[1] === 'entry' ? 'entrada' : 'salida'} ${m[2] === 'long' ? 'compra' : 'venta'} #${+m[3] + 1})`; } return `${o && B.OPERANDS[o.k] ? short(B.OPERANDS[o.k].label) : 'Indicador'} (${m[1] === 'entry' ? 'entrada' : 'salida'} ${m[2] === 'long' ? 'compra' : 'venta'} #${+m[3] + 1}) · ${m[5] === 'n' ? 'periodo' : m[5] === 'd' ? 'desviaciones' : m[5]}`;
  }
  const decText = {propuesta: ['Propuesta lista para tu revisión', 'pos'], sin_mejora: ['Sin mejora comprobada: no se propone nada', ''], no_aplica: ['No aplicable', ''], error: ['No se pudo ejecutar', 'neg']};
  function resultCard(b, r, who) {
    if (!r) return '';
    if (r.status === 'error') return `<div class="bl-box"><h4>Último intento (${who})</h4><small class="bl-dim">${dt(r.at)}</small><p class="neg">${esc(r.reason || 'Error')}</p></div>`;
    const sp = mainSpec(b), d = decText[r.decision] || [r.decision, '']; const mo = r.monitor;
    return `<div class="bl-box"><h4>Último reentrenamiento (${who})</h4><small class="bl-dim">${dt(r.at)} · ${r.bars} velas ${esc(r.interval || '')} · sobre la v${r.v}</small>
      <div class="bl-vrow"><span class="bl-verdict ${r.decision === 'propuesta' ? 'v-consistente' : 'v-insuficiente'}">${esc(d[0])}</span></div>
      ${mo ? `<p class="bl-dim">Versión actual con datos recientes: ${pct(mo.retPct)} · ${mo.n} op. · DD ${num(mo.maxDDPct, 1)} % · validación ${pct(mo.val)} · prueba ${pct(mo.test)} (comprar y mantener ${pct(mo.buyHold)}).</p>` : ''}
      ${(r.reasons || []).length ? `<ul class="bl-log">${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${r.brain && !r.brain.error ? `<h4>Experimentos del cerebro${r.brain.brainName ? ' «' + esc(r.brain.brainName) + '»' : ''}</h4><p class="bl-dim">Versión actual fuera de muestra: ${money(r.brain.base.oos)} (${r.brain.base.n} op., DD ${num(r.brain.base.dd, 1)} %)${r.brain.limits && (r.brain.limits.riskPct != null || r.brain.limits.maxLeverage != null) ? ` · tus límites: ${[r.brain.limits.riskPct != null ? 'riesgo ≤ ' + r.brain.limits.riskPct + ' %' : '', r.brain.limits.maxLeverage != null ? 'apalancamiento ≤ ' + r.brain.limits.maxLeverage + 'x' : ''].filter(Boolean).join(', ')}` : ''}.</p><ul class="bl-log">${(r.brain.tried || []).map(t => `<li><b class="${t.ok ? 'pos' : t.skip ? '' : 'neg'}">${t.ok ? 'Gana' : t.skip ? 'Omitida' : 'No gana'}</b> · ${esc(t.title)} <small class="bl-dim">(${esc(t.from || '')})</small><br><small class="bl-dim">${esc(t.skip || `fuera de muestra ${money(t.oos)} vs ${money(t.base)} · ${t.n} op. · DD ${num(t.dd, 1)} % · ${t.verdict || ''}`)}</small></li>`).join('') || '<li>Sin ideas nuevas esta vez.</li>'}</ul>` : ''}
      ${(r.changes || []).length ? `<h4>Cambios propuestos</h4><ul class="bl-log">${r.changes.map(c => `<li>${esc(pathLabel(sp, c.path))}: <b>${num(c.from, 2)}</b> → <b>${num(c.to, 2)}</b></li>`).join('')}</ul>` : ''}
      ${r.oos ? `<h4>Evidencia fuera de muestra</h4><p class="bl-dim">Procedimiento (ajustar con entrenamiento y medir en el tramo siguiente que no vio), ${r.oos.folds} tramos: candidata <b class="${cls(r.oos.cand.net)}">${money(r.oos.cand.net)}</b> (${r.oos.cand.n} op.) frente a la versión actual <b class="${cls(r.oos.base.net)}">${money(r.oos.base.net)}</b> (${r.oos.base.n} op.). Mejoró en ${r.oos.winsVsBase} de ${r.oos.folds}.</p>${r.holdout ? `<p class="bl-dim">Tramo reservado más reciente (${dd(r.holdout.from)} – ${dd(r.holdout.to)}, nunca usado para ajustar): candidata ${money(r.holdout.cand.net)} (${r.holdout.cand.n} op., DD ${num(r.holdout.cand.maxDDPct, 1)} %) · actual ${money(r.holdout.base.net)} (${r.holdout.base.n} op., DD ${num(r.holdout.base.maxDDPct, 1)} %).</p>` : ''}` : ''}
      ${(r.folds || []).length ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Tramo de prueba</th><th>Ajuste (solo entrenamiento)</th><th>Candidata</th><th>Actual</th></tr></thead><tbody>${r.folds.map(f => `<tr><td>${dd(f.testFrom)} – ${dd(f.testTo)}</td><td>${f.params.length ? f.params.map(c => `${esc(pathLabel(sp, c.path))} ${num(c.to, 2)}`).join('<br>') : 'sin cambios'}</td><td class="${cls(f.cand.net)}">${money(f.cand.net)} <small>(${f.cand.n})</small></td><td class="${cls(f.base.net)}">${money(f.base.net)} <small>(${f.base.n})</small></td></tr>`).join('')}</tbody></table></div>` : ''}
      ${r.decision === 'propuesta' ? note('La candidata se agregó en la pestaña Versiones. No reemplaza a la principal: pruébala y decide tú.') : ''}</div>`;
  }
  function tabCic(b) {
    const c = cyc(b), sv = b.server, lc = b.local, waiting = c.enabled && !sv && c.enabledAt && Date.now() - c.enabledAt > 48 * 36e5;
    $('#blTab').innerHTML = (Array.isArray(mainSpec(b).basket) && mainSpec(b).basket.length ? note('Este bot opera una cesta de monedas: el reentrenamiento ajusta los parámetros usando solo ' + mainSpec(b).symbol + ' (la primera de la cesta).', 'warn') : '') + `<div class="bl-box"><h4>Ciclo de reentrenamiento automático</h4>${note('Cada día, un trabajo programado en GitHub Actions (no depende de que tengas la app abierta) descarga velas recientes, re-evalúa la versión principal y busca mejoras con validación walk-forward: ajusta solo con datos de entrenamiento y mide en tramos que no vio. Si no hay mejora comprobada, no cambia nada. Con la mejora automática, la versión que gana pasa a ser la principal sola, la simulación sigue con ella y te avisa; la anterior queda en Versiones para regresar.')}
      <label class="bl-chk"><input type="checkbox" id="cycOn" ${c.enabled ? 'checked' : ''}> Activar el ciclo automático para este bot</label>
      <label class="bl-chk"><input type="checkbox" id="cycAuto" ${c.auto !== false ? 'checked' : ''} ${c.enabled ? '' : 'disabled'}> Mejora automática (la versión que gana se vuelve la principal sola)</label>
      <div class="bl-grid" style="margin-top:8px">${fld('Frecuencia', `<select id="cycEvery">${[[24, 'Cada día'], [72, 'Cada 3 días'], [168, 'Cada semana']].map(([v, l]) => `<option value="${v}" ${c.everyHours === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}${fld('Historial', `<select id="cycBars">${[[2500, '2.500 velas'], [4000, '4.000 velas'], [6000, '6.000 velas']].map(([v, l]) => `<option value="${v}" ${c.bars === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>
      ${c.enabled ? (sv ? note(`Servidor: último resultado ${dt(sv.at)}.`) : waiting ? note('⚠ Aún no hay resultados del servidor. Revisa que el flujo «Reentrenar bots» esté activo en GitHub y que el secreto FIREBASE_SERVICE_ACCOUNT esté configurado (INSTALL.md → Reentrenamiento programado).', 'warn') : note('Esperando al primer ciclo del servidor (corre a diario; también se puede lanzar a mano en GitHub → Actions).')) : ''}
      ${!(H.cloud && H.cloud()) ? note('Inicia sesión para que el servidor pueda leer tus bots: sin cuenta solo funciona «Optimizar ahora».', 'warn') : ''}</div>
      <div class="bl-box"><h4>Optimizar ahora (en este navegador)</h4>${note('Misma lógica que el servidor, ejecutada aquí con las velas actuales. Ajusta stop loss, take profit, trailing, tiempo máximo, filtros de mercado, periodos de los indicadores, bandas de Bollinger y umbrales de RSI/ADX/volumen. NO toca el tamaño de la posición ni los parámetros de tus indicadores propios (su ajuste exigiría ejecutar tu script cientos de veces y multiplica el riesgo de sobreajuste). Tarda unos segundos.')}<div class="bl-actions"><button class="bl-btn" data-a="optNow" ${busyMsg ? 'disabled' : ''}>Optimizar ahora</button></div></div>` + resultCard(b, sv, 'servidor') + resultCard(b, lc, 'este navegador') +
      ((b.optHistory || []).length ? `<div class="bl-box"><h4>Historial de experimentos</h4><ul class="bl-log">${b.optHistory.slice().reverse().map(h => `<li><small>${dt(h.at)} · ${esc(h.who)}</small><br>${esc((decText[h.decision] || [h.decision])[0])}${h.oos != null ? ` · fuera de muestra: candidata ${money(h.oos)} vs actual ${money(h.base)}` : ''}</li>`).join('')}</ul></div>` : '');
  }
  function addCandidate(b, r, who) { // la propuesta entra como versión CANDIDATA; con la mejora automática encendida pasa a ser la principal
    if (!r || r.decision !== 'propuesta' || !r.candidate) return false; const nv = Math.max(...b.versions.map(x => x.v)) + 1, sp = B.normalizeSpec(r.candidate); if (!B.validateSpec(sp).ok) return false;
    setTimeout(() => autoPromote(b, nv, r, who), 0);
    b.versions.push({v: nv, spec: sp, at: Date.now(), note: r.note ? String(r.note).slice(0, 200) : 'Reentrenamiento: ' + (r.changes || []).map(c => `${pathLabel(mainSpec(b), c.path)} ${num(c.from, 2)}→${num(c.to, 2)}`).join('; ').slice(0, 200), origin: who + (r.note ? ' (cerebro)' : ' (reentrenamiento)'), state: 'candidata'}); log(b, 'reentrenamiento', `El ${who} propuso la v${nv} (candidata, pendiente de tu aprobación).`); return nv;
  }
  /* Mejora automática: la candidata ya ganó en datos que no usó para ajustarse (walk-forward) y pasó la prueba final → se vuelve la principal,
     la simulación en vivo sigue con ella y te avisa. La anterior queda en Versiones («anterior») para regresar con un clic. */
  function autoPromote(b, nv, r, who) {
    const c = cyc(b), v = ver(b, nv); if (c.auto === false || !v || v.state !== 'candidata' || b.status === 'archived') return;
    const prev = b.mainV; b.versions.forEach(x => { if (x.v === prev) x.state = 'anterior'; }); v.state = 'principal'; v.auto = true; b.mainV = nv;
    const why = r.oos ? ` En los tramos que no vio, la nueva ganó ${money(r.oos.cand.net)} contra ${money(r.oos.base.net)} de la anterior.` : '';
    log(b, 'versión', `Mejora automática: la v${nv} (propuesta por el ${who}) pasó a ser la principal en lugar de la v${prev}.${why} Si no te convence, en Versiones puedes regresar a la v${prev}.`);
    relive(b); touch(b);
    if (window.CCT_botNotify) window.CCT_botNotify(`VORTEX · ${b.name} aprendió`, `La v${nv} es ahora la principal (mejor que la v${prev} en datos que no vio).${why}`, 'bot-learn-' + b.id + '-' + nv);
  }
  function noteHistory(b, r, who) { (b.optHistory = b.optHistory || []).push({at: r.at, who, decision: r.status === 'error' ? 'error' : r.decision, oos: r.oos ? r.oos.cand.net : null, base: r.oos ? r.oos.base.net : null}); if (b.optHistory.length > 12) b.optHistory.shift(); }
  /* Aviso de mejora: cuando el servidor reentrenó un bot y la versión nueva ganó, sale un aviso al abrir la app (y una marca «Mejoró» en la lista 2 días) */
  const upNews = [];
  function announceUp(list) {
    if (!list.length || typeof document === 'undefined') return;
    let box = document.getElementById('botUpBox'); if (!box) { box = document.createElement('div'); box.id = 'botUpBox'; box.className = 'bot-up-box'; document.body.appendChild(box); }
    for (const {b, r} of list.slice(-3)) {
      const how = r.oos ? `Ganó ${money(r.oos.cand.net)} contra ${money(r.oos.base.net)} de la anterior en pruebas que no vio (${r.oos.cand.n} operaciones${r.coins > 1 ? ` en ${r.coins} monedas` : ''}).` : 'Ganó en pruebas que no vio.';
      const el = document.createElement('div'); el.className = 'bot-up';
      el.innerHTML = `<span class="bu-ic">🚀</span><div class="bu-t"><b>${esc(b.name)} mejoró solo · v${r.applied.v}</b><small>${esc(how)} Ya opera en simulación con la versión nueva.</small></div><button type="button" class="bu-go">Ver</button><button type="button" class="bu-x" aria-label="Cerrar">✕</button>`;
      el.querySelector('.bu-go').onclick = () => { el.remove(); try { const sb = document.getElementById('rrBotLab'); if (sb && sb.getClientRects().length && !sb.classList.contains('on')) sb.click(); } catch {} try { ACT.open({dataset: {id: b.id}}); } catch {} };
      el.querySelector('.bu-x').onclick = () => el.remove(); box.appendChild(el); setTimeout(() => el.classList.add('in'), 30); setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 14000);
    }
  }
  function mergeServer(res) { // resultados del trabajo programado → bots (sin tocar versiones principales)
    let ch = false; for (const b of S.bots) { const r = res && res[b.id]; if (!r || (b.server && b.server.at === r.at)) continue; b.server = r; log(b, 'reentrenamiento', r.status === 'error' ? 'El servidor no pudo reentrenar: ' + r.reason : `Reentrenamiento del servidor: ${(decText[r.decision] || [r.decision])[0]}.`); noteHistory(b, r, 'servidor'); if (!(r.applied && b.versions.some(x => x.v === r.applied.v))) addCandidate(b, r, 'servidor'); if (r.applied && b.upSeen !== r.applied.v) { b.upSeen = r.applied.v; b.upAt = r.applied.at || Date.now(); upNews.push({b, r}); } ch = true; } // si el servidor ya la aplicó (y tu cuenta ya la trae), no se duplica
    if (upNews.length) setTimeout(() => announceUp(upNews.splice(0)), 1500);
    if (ch) save(); return ch;
  }
  function mergePaper(paper) { // sesiones de paper trading avanzadas por el servidor: solo se adopta si continúa EXACTAMENTE el mismo libro (cadena de hashes) y avanzó
    if (!paper) return false; let ch = false;
    for (const b of S.bots) for (const sv of paper[b.id] || []) {
      const lo = (b.paper || []).find(x => x.id === sv.id); if (!lo || lo.status !== 'running') continue;
      const n = Math.min(lo.ledger.length, sv.ledger.length); let same = true; for (let i = 0; i < n; i++) if (lo.ledger[i].h !== sv.ledger[i].h) { same = false; break; }
      if (!same) { if (!lo.notes.some(x => /no coincide/.test(x.text))) lo.notes.push({t: Date.now(), text: 'El libro del servidor no coincide con el de este dispositivo: se conserva el de este dispositivo.'}); ch = true; continue; }
      if (sv.ledger.length > lo.ledger.length || (sv.ledger.length === lo.ledger.length && sv.last && (!lo.last || sv.last.t > lo.last.t))) {
        const news = sv.ledger.slice(lo.ledger.length); for (const k of ['ledger', 'cash', 'peak', 'anchorT', 'curve', 'open', 'last', 'gaps', 'notes', 'halted', 'err', 'checkedAt', 'nN', 'oN']) if (k in sv) lo[k] = sv[k]; lo.by = 'servidor';
        for (const t of news) log(b, 'paper', `Paper v${lo.v} (servidor): ${t.side === 'long' ? 'compra' : 'venta'} cerrada ${t.net >= 0 ? '+' : '−'}$${num(Math.abs(t.net), 2)} · ${t.why || ''}`); ch = true;
      }
    }
    if (ch) save(); return ch;
  }
  async function optNow(b) {
    const sp = mainSpec(b), bars = cyc(b).bars || 4000; busyMsg = 'Optimizando… preparando datos'; render();
    try {
      const candles = await candlesFor(sp.symbol, sp.interval, bars), uo = userOps(sp), user = {}; for (const sid of [...new Set(uo.map(x => x.sid))]) { const r = await userSources(sid, sp.symbol, sp.interval, bars); for (const x of uo.filter(y => y.sid === sid)) { const f = r.sources.find(q => q.src === x.src); if (!f) throw new Error('Tu indicador ya no produce la señal «' + (x.sl || x.src) + '»'); user[sid + '|' + x.src] = f.series; } }
      const r = await window.CCTBotOpt.optimize(candles, sp, {seed: window.CCTBotOpt.hash(b.id + new Date().toISOString().slice(0, 10)), budget: 50, ropts: {nova: window.NovaNexus, user: uo.length ? user : null}, yield: () => new Promise(x => setTimeout(x, 0)), onProgress: (k, n, t) => { busyMsg = `Optimizando… ${t}`; const e = $('.bl-busy'); if (e) e.lastChild.textContent = busyMsg; }});
      const res = Object.assign({}, r, {status: 'ok', v: b.mainV, symbol: sp.symbol, interval: sp.interval}); b.local = res; log(b, 'reentrenamiento', `Optimización en el navegador: ${(decText[res.decision] || [res.decision])[0]}.`); noteHistory(b, res, 'navegador'); addCandidate(b, res, 'navegador'); touch(b);
    } catch (e) { toast('No se pudo optimizar: ' + (e.message || e)); b.local = {at: Date.now(), status: 'error', reason: String(e.message || e)}; touch(b); }
    busyMsg = ''; if (view === 'bot') render();
  }
  /* ----- Asistente del bot (IA con datos reales) ----- */
  function insights(b, run) { // preguntas y observaciones basadas SOLO en los números reales del último backtest
    if (!run || !run.ext || !run.ext.hour) return ['Aún no hay resultados. ¿Quieres que ejecute primero un backtest para tener datos reales sobre los que preguntar?'];
    const m = run.metrics, s = run.segments, q = [];
    if (m.n < 30) q.push(`Solo hay ${m.n} operaciones: muy pocas para concluir algo. ¿Quieres probar una temporalidad menor o más historial para tener más muestra?`);
    if (s.train.net > 0 && (s.val.net <= 0 || s.test.net <= 0)) q.push('Gana en entrenamiento pero pierde en validación o prueba: eso suele ser sobreajuste. ¿Quieres simplificar las reglas o que pruebe un filtro de tendencia?');
    if (m.winRate != null && m.winRate > 55 && m.rr != null && m.rr < 1) q.push(`Acierta ${num(m.winRate, 0)} % pero la ganancia media es menor que la pérdida media (ratio ${num(m.rr, 2)}). ¿Pruebo un take profit más amplio o un stop más corto?`);
    if (m.winRate != null && m.winRate < 40 && (m.rr == null || m.rr < 2)) q.push(`Solo acierta ${num(m.winRate, 0)} % y el ratio ganancia/pérdida (${m.rr == null ? '—' : num(m.rr, 2)}) no lo compensa. ¿Quieres exigir más confirmación antes de entrar?`);
    if (m.maxDDPct > 20) q.push(`El drawdown máximo es ${num(m.maxDDPct, 1)} %. ¿Quieres que pruebe reducir el riesgo por operación o añadir un límite de pérdida diaria?`);
    if (m.retPct < run.buyHold.retPct) q.push(`No supera a comprar y mantener (${pct(run.buyHold.retPct)}). ¿Qué te parece comparar con un filtro que solo opere con tendencia alcista?`);
    const hr = Object.entries(run.breakdown.hour || {}).filter(([, v]) => v.n >= 5).sort((a, c) => a[1].net - c[1].net)[0]; if (hr && hr[1].net < 0) q.push(`Las entradas entre las ${hr[0]}:00 y las ${+hr[0] + 4}:00 UTC pierden ${money(-hr[1].net)} en ${hr[1].n} operaciones. ¿Pruebo un filtro de horario que las evite?`);
    if (m.fees > Math.abs(m.net) * .5 && m.n > 20) q.push(`Las comisiones (${money(m.fees)}) se comen gran parte del resultado. ¿Probamos una temporalidad mayor para operar menos?`);
    return q.length ? q : ['Con los datos actuales no veo una debilidad clara que justifique un cambio. Podemos validar la robustez en otras monedas (pestaña Robustez) antes de tocar nada.'];
  }
  const AI_SYS = `Eres el asistente de un bot de trading dentro de un laboratorio de backtesting. Hablas en español, breve y claro. Reglas: usa SOLO los números del contexto; no inventes resultados ni prometas ganancias; distingue entre en-muestra (entrenamiento) y fuera de muestra (validación/prueba); si algo no se puede concluir por pocas operaciones, dilo. Puedes hacer preguntas, explicar métricas y proponer experimentos. Si propones un cambio concreto, añade AL FINAL un bloque \`\`\`json {"why":"motivo breve","patch":{...}} \`\`\` donde patch es un fragmento de la especificación del bot (solo campos que cambian; las listas de condiciones se sustituyen completas; mismo esquema que la especificación actual). Nunca digas que el cambio ya está aplicado: el usuario decide.`;
  function ctxOf(b, run) { const sp = mainSpec(b); return `ESPECIFICACIÓN ACTUAL (v${b.mainV}):\n${JSON.stringify(sp)}\n\nREGLAS EN TEXTO:\n${B.describeSpec(sp)}\n\nÚLTIMO BACKTEST:\n` + (run ? JSON.stringify({velas: run.bars, periodo: [dd(run.from), dd(run.to)], metricas: {n: run.metrics.n, neto: run.metrics.net, rend: run.metrics.retPct, aciertos: run.metrics.winRate, factorBenef: run.metrics.profitFactor, ddPct: run.metrics.maxDDPct, expectativa: run.metrics.expectancy, comisiones: run.metrics.fees}, tramos: ['train', 'val', 'test'].map(k => ({k, n: run.segments[k].n, rend: run.segments[k].retPct, pf: run.segments[k].profitFactor})), buyHold: run.buyHold.retPct, veredicto: run.verdict.text, horario: run.breakdown.hour, tendencia: run.breakdown.trend, volatilidad: run.breakdown.vol}) : 'ninguno todavía'); }
  function tabAi(b, run) {
    const T = $('#blTab'), ins = insights(b, run);
    T.innerHTML = `<div class="bl-box"><h4>Observaciones con tus datos reales</h4>${note('Calculadas localmente a partir del último backtest. Toca una para hablarla con la IA.')}${ins.map((q, i) => `<button class="bl-q" data-a="askq" data-i="${i}">${esc(q)}</button>`).join('')}</div><form class="bl-form bl-form-top" id="blBf"><textarea id="blBi" rows="2" placeholder="Pregunta o pide un experimento…" maxlength="800"></textarea><button class="bl-send">Enviar</button></form><div class="bl-chat bl-chat-flow" id="blBc">${b.chat.slice().reverse().map(m => m.role === 'user' ? `<div class="bl-msg user"><p>${esc(m.text)}</p></div>` : `<div class="bl-msg bot">${mdLite(m.text)}${m.patch ? propCard(b, m) : ''}</div>`).join('') || '<div class="bl-msg bot"><p>Pregúntame lo que quieras sobre este bot. Puedo explicarte sus métricas y proponerte experimentos; tú decides cuáles probar.</p></div>'}</div>`;
    T._ins = ins;
  }
  const propCard = (b, m) => m.state === 'tested' ? `<div class="bl-prop done"><b>Propuesta probada como v${m.v}.</b> Compárala en la pestaña Versiones.</div>` : m.state === 'rejected' ? '<div class="bl-prop done">Propuesta rechazada.</div>' : `<div class="bl-prop"><b>Experimento propuesto</b>${m.why ? `<p>${esc(m.why)}</p>` : ''}<pre>${esc(JSON.stringify(m.patch, null, 1).slice(0, 700))}</pre><div class="bl-card-b"><button class="bl-mini" data-a="accept" data-id="${m.id}">Probar como versión nueva</button><button class="bl-mini danger" data-a="reject" data-id="${m.id}">Rechazar</button></div></div>`;
  const merge2 = (a, p) => { if (p === null || typeof p !== 'object' || Array.isArray(p)) return p; const o = Object.assign({}, a && typeof a === 'object' && !Array.isArray(a) ? a : {}); for (const k of Object.keys(p)) o[k] = merge2(o[k], p[k]); return o; };
  async function askAi(b, text) {
    text = String(text || '').trim(); if (!text) return; const run = runOf(b); b.chat.push({role: 'user', text}); touch(b); render(); const hist = b.chat.slice(-8).map(m => ({role: m.role === 'user' ? 'user' : 'assistant', content: m.text}));
    try { const r = await LLM.chat([{role: 'system', content: AI_SYS + '\n\n' + ctxOf(b, run)}, ...hist], {maxTokens: 900, temperature: .3, timeout: 90000}), j = /```json\s*([\s\S]*?)```/.exec(r.text); let patch = null, why = ''; if (j) { try { const o = JSON.parse(j[1]); patch = o.patch || null; why = o.why || ''; } catch {} }
      b.chat.push({role: 'bot', text: LLM.stripCode(r.text) || 'Te dejo una propuesta:', patch, why, id: uidOf(), state: 'open'});
    } catch (e) { b.chat.push({role: 'bot', text: 'No pude consultar la IA: ' + LLM.friendly(e) + '\n\nMientras tanto, estas son las observaciones calculadas con tus datos (arriba).'}); }
    if (b.chat.length > 60) b.chat.splice(0, b.chat.length - 60); touch(b); if (view === 'bot' && tab === 'ai') render();
  }
  async function acceptProposal(b, id) {
    const m = b.chat.find(x => x.id === id); if (!m || !m.patch) return; const sp = B.normalizeSpec(merge2(JSON.parse(JSON.stringify(mainSpec(b))), m.patch)), v = B.validateSpec(sp);
    if (!v.ok) { toast('La propuesta no es válida: ' + v.errors[0]); return; }
    const nv = Math.max(...b.versions.map(x => x.v)) + 1; b.versions.push({v: nv, spec: sp, at: Date.now(), note: m.why || 'Propuesta del asistente', origin: 'asistente (aceptada por ti)', state: 'candidata'}); m.state = 'tested'; m.v = nv; log(b, 'experimento', `Aceptaste probar la propuesta del asistente como v${nv}.`); touch(b); await runAndShow(b, nv); tab = 'ver'; render();
  }

  /* ----- Mostrar en el gráfico + repetición ----- */
  let marksOn = false;
  function marksTrades(b) {
    const run = runOf(b, replay.ver || b.mainV) || runOf(b); if (!run || !run.trades.length) return {run, trades: []}; const sp0 = ver(b, run.v).spec; let tr = run.trades.filter(t => !t.sym || t.sym === sp0.symbol); if (replay.seg !== 'all' && run.segments[replay.seg]) { const s = run.segments[replay.seg]; tr = tr.filter(t => t.entryT >= s.from && t.entryT <= s.to); } return {run, trades: tr};
  }
  function pushMarks() {
    if (!H.marks) return; const b = bot(); if (!marksOn || !b) return H.marks(null); const {run, trades} = marksTrades(b); if (!run) return H.marks(null); const sp = ver(b, run.v).spec;
    const seg = replay.seg !== 'all' && run.segments[replay.seg], ivm = B.IV_MS[sp.interval] || 0; H.marks({symbol: sp.symbol, interval: sp.interval, trades, avoid: (run.avoid || []).filter(z => !seg || (z[0] >= seg.from && z[0] <= seg.to)).map(z => [z[0], z[0] + ivm]), limitT: replay.t, show: replay.show});
  }
  function events() { const {trades} = marksTrades(bot()), c = H.chart ? H.chart() : {}, from = c.from || 0; return [...new Set(trades.flatMap(t => [t.entryT, t.exitT]))].filter(t => t >= from).sort((a, c) => a - c); } // solo eventos que caen dentro de las velas cargadas en el gráfico
  function replayBar() {
    const b = bot(), {run, trades} = marksTrades(b), c = H.chart ? H.chart() : {}, out = run && c.from ? trades.filter(t => t.entryT < c.from).length : 0;
    return `<div class="bl-replay"><div class="bl-rrow"><button class="bl-ib sm" data-a="rpPlay" aria-label="${replay.on ? 'Pausa' : 'Reproducir'}">${replay.on ? IC.pause : IC.play}</button><button class="bl-ib sm" data-a="rpStep" aria-label="Siguiente evento">${IC.step}</button><button class="bl-mini" data-a="rpReset">Reiniciar</button><label>Velocidad<select id="rpSpd">${[1, 2, 4, 8].map(x => `<option value="${x}" ${replay.speed === x ? 'selected' : ''}>${x}×</option>`).join('')}</select></label><label>Periodo<select id="rpSeg">${[['all', 'Todo'], ['train', 'Entrenamiento'], ['val', 'Validación'], ['test', 'Prueba']].map(([k, l]) => `<option value="${k}" ${replay.seg === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Versión<select id="rpVer">${b.versions.filter(v => runOf(b, v.v)).map(v => `<option value="${v.v}" ${(replay.ver || b.mainV) === v.v ? 'selected' : ''}>v${v.v}</option>`).join('')}</select></label></div><div class="bl-rrow"><label class="bl-chk"><input type="checkbox" data-sh="arrows" ${replay.show.arrows ? 'checked' : ''}> Flechas</label><label class="bl-chk"><input type="checkbox" data-sh="levels" ${replay.show.levels ? 'checked' : ''}> Stop/Objetivo</label><label class="bl-chk"><input type="checkbox" data-sh="avoid" ${replay.show.avoid ? 'checked' : ''}> Evitar (${run && run.avoid ? run.avoid.length : 0})</label></div>${replay.t ? `<small class="bl-dim">Repetición hasta ${dt(replay.t)}</small>` : ''}${out > 0 ? note(`${out} operaciones anteriores a las velas cargadas en el gráfico no se pueden dibujar (desplázate hacia atrás para cargar más).`, 'warn') : ''}${note('Zonas ámbar = velas donde las reglas pedían entrar pero el filtro de mercado o el límite de riesgo lo impidió.')}</div>`;
  }
  function rpTick(step) { const ev = events(); if (!ev.length) return; const i = replay.t == null ? -1 : ev.findIndex(x => x > replay.t - 0); let nx = replay.t == null ? 0 : (i < 0 ? ev.length : i); if (nx >= ev.length) { replay.on = false; clearInterval(replay.timer); replay.timer = 0; render(); return; } replay.t = ev[nx]; H.seek && H.seek(replay.t); pushMarks(); const e = $('.bl-replay small.bl-dim'); if (view === 'bot' && !e) render(); else if (e) e.textContent = 'Repetición hasta ' + dt(replay.t); }
  function chartShow(b, tradeT) {
    const run = runOf(b); if (!run || !run.trades.length) { toast('Este bot aún no tiene operaciones para mostrar'); return; } const sp = mainSpec(b); wide = false; document.body.classList.remove('botlab-wide'); marksOn = true; replay.t = null; pushMarks();
    if (H.open) H.open(sp.symbol, sp.interval, tradeT || run.trades[run.trades.length - 1].entryT); if (view === 'bot') render();
  }

  /* ----- Comparador ----- */
  function score(r) { if (!r) return null; const m = r.metrics, risk = m.maxDDPct > 0 ? m.retPct / m.maxDDPct : m.retPct, rob = {consistente: 1, 'no-confirmada': .5, pierde: .2, insuficiente: .3}[r.verdict.level] || .3; return risk * rob * Math.min(1, m.n / 30); }
  function cmpView() {
    const bs = [...sel].map(getBot).filter(Boolean), rs = bs.map(b => runOf(b)), same = new Set(rs.filter(Boolean).map(r => r.symbol + r.interval + r.reqBars)).size <= 1;
    const order = bs.map((b, i) => [b, rs[i], score(rs[i])]).sort((a, c) => (c[2] == null ? -1e9 : c[2]) - (a[2] == null ? -1e9 : a[2]));
    root.innerHTML = head('Comparador de bots', 'Ranking ajustado por riesgo y robustez', 'lib') + (same ? '' : `<div class="bl-box">${note('⚠ Los bots se probaron en monedas, temporalidades o historiales distintos: la comparación no es directa. Para compararlos en igualdad, vuelve a ejecutar los backtests con el mismo historial.', 'warn')}</div>`) +
      `<div class="bl-box"><div class="bl-scroll"><table class="bl-t"><thead><tr><th>#</th><th>Bot</th><th>Mercado</th><th>Rend.</th><th>DD</th><th>Valid.</th><th>Prueba</th><th>Op.</th><th>vs B&amp;H</th><th>Puntaje</th></tr></thead><tbody>${order.map(([b, r, s], i) => r ? `<tr><td>${i + 1}</td><td>${esc(b.name)}<br><small class="bl-dim">v${b.mainV}</small></td><td>${r.symbol.replace('USDT', '')} ${r.interval}</td><td class="${cls(r.metrics.retPct)}">${pct(r.metrics.retPct)}</td><td>${num(r.metrics.maxDDPct, 1)} %</td><td class="${cls(r.segments.val.retPct)}">${pct(r.segments.val.retPct)}</td><td class="${cls(r.segments.test.retPct)}">${pct(r.segments.test.retPct)}</td><td>${r.metrics.n}</td><td class="${cls(r.metrics.retPct - r.buyHold.retPct)}">${pct(r.metrics.retPct - r.buyHold.retPct)}</td><td><b>${num(s, 2)}</b></td></tr>` : `<tr><td>—</td><td>${esc(b.name)}</td><td colspan="8" class="bl-dim">Sin backtest</td></tr>`).join('')}</tbody></table></div>${note('Puntaje = (rendimiento ÷ drawdown) × robustez (1 si se confirma fuera de muestra, 0,5 si no, 0,2–0,3 si pierde o hay poca muestra) × min(1, operaciones ÷ 30). Es un criterio para ordenar, no una predicción.')}</div>`;
  }

  /* ----- Importar / exportar ----- */
  function exportBot(b) { const blob = new Blob([JSON.stringify({nbl: 1, bot: b}, null, 1)], {type: 'application/json'}), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `bot-${b.name.replace(/[^\w-]+/g, '_').slice(0, 40)}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function importBot(text) {
    try { const o = JSON.parse(text), x = o && o.bot; if (!x || !Array.isArray(x.versions) || !x.versions.length) throw new Error('formato'); x.versions.forEach(v => { v.spec = B.normalizeSpec(v.spec); const r = B.validateSpec(v.spec); if (!r.ok) throw new Error(r.errors[0]); }); x.id = uidOf(); x.name = (x.name || 'Bot importado') + ' (importado)'; x.updatedAt = Date.now(); x.status = x.status === 'running' ? 'tested' : (x.status || 'draft'); x.runs = x.runs || []; x.chat = x.chat || []; x.journal = x.journal || []; x.sweeps = x.sweeps || {}; if (!ver(x)) x.mainV = x.versions[0].v; log(x, 'importación', 'Bot importado desde un archivo.'); S.bots.push(x); save(); toast('Bot importado'); render();
    } catch (e) { toast('Archivo no válido: ' + (e.message || e)); }
  }
  function dupBot(b) { const c = JSON.parse(JSON.stringify(b)); c.id = uidOf(); c.name = b.name + ' (copia)'; c.createdAt = c.updatedAt = Date.now(); c.status = runOf(c) ? 'tested' : 'draft'; c.journal = [{t: Date.now(), kind: 'creación', text: 'Duplicado de «' + b.name + '».'}]; c.chat = []; S.bots.push(c); save(); render(); }

  /* ----- Eventos ----- */
  const ACT = {
    claudio() { view = 'claudio'; render(); }, tcSym(el) { tcSym = el.dataset.k; render(); }, tourn() { view = 'tourn'; render(); },
    toChart() { const b = bot(); if (!b) return; const on = !!b.sigOn;
      if (on) { b.sigOn = false; for (const k of [...sigCache.keys()]) if (k.startsWith(b.id + '|')) sigCache.delete(k); sigPush(); touch(b); render(); return toast('Se quitaron las señales de «' + b.name + '» del gráfico.'); }
      let pine = null; try { if (window.CCTBotPine) pine = window.CCTBotPine.toPine(mainSpec(b)); } catch (e) { pine = null; }
      if (pine && window.CCT_ai && window.CCT_ai.saveConverted) { const sid = window.CCT_ai.saveConverted(pine.code, pine.name, null, true); if (sid) { log(b, 'gráfico', `Convertido en señales del gráfico («${pine.name}»).`); touch(b); toast('Listo: «' + pine.name + '» está en el gráfico (cajitas COMPRA / VENTA con SL y TP) y en Mis indicadores.'); } return; }
      b.sigOn = true; log(b, 'gráfico', 'Sus señales se ven en el gráfico como cajitas COMPRA / VENTA (con sus indicadores Nova o tuyos).'); touch(b); render(); const c = H.chart ? H.chart() : null; if (c) sigNeed(c.symbol, c.interval);
      toast('Listo: las señales de «' + b.name + '» salen en el gráfico (en la moneda y temporalidad que tengas abierta). Toca el botón otra vez para quitarlas.'); },
    bell() { const b = bot(); dcPanel = dcPanel === b.id ? null : b.id; render(); },
    dcOn() { const b = bot(); b.notify = b.notify === false; log(b, 'avisos', b.notify ? 'Avisos a Discord activados para este bot.' : 'Avisos a Discord desactivados para este bot.'); touch(b); render(); },
    dcDest(el) { const b = bot(); b.dcDest = el.dataset.k; if (b.dcDest === 'main') log(b, 'avisos', 'Los avisos de este bot van a tu canal de VORTEX.'); touch(b); render(); },
    dcCfg() { dcPanel = null; render(); if (window.CCT_switchView) { window.CCT_dcBack = 'botLabView'; window.CCT_switchView('discordView'); if (window.CCTDiscord) setTimeout(() => window.CCTDiscord.paint(), 0); } else toast('Abre Configuración › Discord y pega el webhook de tu canal.'); },
    async dcSave() { const b = bot(), inp = $('#dcHookIn'), u = String(inp && inp.value || '').trim(); if (!HOOK_RE.test(u)) return toast('Ese no parece un webhook de Discord. Cópialo de: Editar canal › Integraciones › Webhooks › Copiar URL.');
      b.dcHook = u; b.dcDest = 'own'; b.notify = true; log(b, 'avisos', 'Los avisos de este bot van a su propio canal de Discord.'); touch(b); render();
      const r = window.CCTDiscord && window.CCTDiscord.sendTo ? await window.CCTDiscord.sendTo(u, [{title: `🤖 ${b.name} conectado`, description: 'Aquí llegarán las compras, ventas y cierres de este bot.', color: 0x20bf9f, timestamp: new Date().toISOString(), footer: {text: 'Nova Bot Lab · VORTEX'}}]) : null;
      toast(r && r.ok ? 'Listo: revisa el canal, llegó un mensaje de prueba.' : 'Guardado, pero la prueba no llegó' + (r && r.why ? ': ' + r.why : '') + '.'); },
    dcDel() { const b = bot(); b.dcHook = ''; b.dcDest = 'main'; log(b, 'avisos', 'Se quitó el canal propio de este bot.'); touch(b); render(); }, dmode(el) { diaryMode = el.dataset.k; render(); }, backBot() { view = 'bot'; render(); }, clToggle() { if (window.CCTClaudioUI) window.CCTClaudioUI.toggle(); },
    rowSim(el) { const b = getBot(el.dataset.id); if (!b) return; const run = (b.paper || []).filter(x => x.status === 'running'), paused = (b.paper || []).filter(x => x.status === 'paused').pop(), now = Date.now();
      if (run.length) { for (const x of run) { x.status = 'paused'; x.pausedAt = now; } log(b, 'paper', 'Simulación en vivo pausada desde la lista.'); touch(b); return render(); }
      void paused; startLive(b, b.mainV, mainSpec(b).risk.capital); },
    lk(el) { const b = view === 'bot' || (view === 'edit' && draftMeta && draftMeta.id) ? getBot(view === 'edit' ? draftMeta.id : cur) : null, L = b ? (b.look = lookOf(b)) : (newLook = newLook || lookOf({id: uidOf()})); L[el.dataset.t] = el.dataset.v; if (b) { touch(b); if (view === 'edit') { const box = root.querySelector('.bl-edlook'); if (box) box.innerHTML = LK.picker(lookOf(b)); } else { render(); const d = root.querySelector('.bl-lookbox'); if (d) d.open = true; } } else if (view === 'edit') { const box = root.querySelector('.bl-edlook'); if (box) box.innerHTML = LK.picker(newLook); } else render(); },
    lookOpen() { const b = bot(); lookPanel = lookPanel === b.id ? null : b.id; const m = root.querySelector('.bl-more'); if (m) m.open = false; render(); },
    async fixBot() { const b = bot(); if (b) await fixBot(b); },
    goImprove() { tab = 'est'; if (!sub.est) sub.est = 'est'; render(); },
    tip(el) { const b = bot(), t = ($('#blTab')._tips || [])[+el.dataset.k]; if (b && t) testTip(b, t); },
    tipApply(el) { const b = bot(); if (b) applyTested(b, el.dataset.k); },
    tipDrop(el) { const b = bot(), x = b && (b.tipTests || {})[el.dataset.k]; if (!x) return; const vv = ver(b, x.v); if (vv && vv.state !== 'principal') vv.state = 'descartada'; if (x.tip) { const k = tipKey(x.tip), run = runOf(b); b.ignoredTips = (b.ignoredTips || []).filter(z => (typeof z === 'string' ? z : z.k) !== k); b.ignoredTips.push({k, at: Date.now(), run: run && run.id, n: liveClosed(b)}); } delete b.tipTests[el.dataset.k]; log(b, 'consejo', `Descartado «${x.title}».`); touch(b); render(); },
    tipIgnore(el) { const b = bot(), t = ($('#blTab')._tips || [])[+el.dataset.k]; if (!b || !t) return; { const k = tipKey(t), run = runOf(b); b.ignoredTips = (b.ignoredTips || []).filter(x => (typeof x === 'string' ? x : x.k) !== k); b.ignoredTips.push({k, at: Date.now(), run: run && run.id, n: liveClosed(b)}); } if (b.ignoredTips.length > 60) b.ignoredTips = b.ignoredTips.slice(-60); log(b, 'consejo', 'Ignoraste el consejo: ' + t.title); touch(b); render(); },
    tcCandles() { const host = $('#blTC'); if (!host || !host._tc || !window.CCTTradeChart) return; host.innerHTML = ''; tchart = window.CCTTradeChart.mount(host, host._tc); }, tipForce() { const b = bot(); if (b && b.lastApply) { const la = b.lastApply; b.versions.forEach(x => { if (x.v === b.mainV) x.state = 'anterior'; }); ver(b, la.v).state = 'principal'; b.mainV = la.v; la.promoted = true; la.at = Date.now(); log(b, 'versión', `La v${la.v} pasó a ser la principal (decisión tuya).`); relive(b); touch(b); render(); } },
    tipUndo() { const b = bot(), la = b && b.lastApply; if (!la) return; ver(b, la.v).state = 'descartada'; ver(b, la.prev).state = 'principal'; b.mainV = la.prev; log(b, 'versión', `Deshiciste el consejo «${la.title}»: vuelve la v${la.prev}.`); b.lastApply = null; relive(b); touch(b); render(); },
    tipOk() { const b = bot(); if (b) { b.lastApply = null; touch(b); render(); } }, coachAi() { const b = bot(); if (b) coachAi(b, false); },
    quickSim() { const b = bot(); if (isLive(b)) { tab = problem(b) ? 'sum' : 'pap'; return render(); } const r = runOf(b); if (r && r.verdict.level === 'pierde' && !confirm('Esta versión pierde dinero en el backtest. ¿Simularla en vivo de todos modos?')) return;
      tab = 'sum'; startLive(b, b.mainV, mainSpec(b).risk.capital); }, newBack() { view = 'new'; render(); }, wide() { wide = !wide; render(); }, new() { nl = {hist: [], spec: null, busy: false, msgs: []}; view = 'new'; render(); }, lib() { view = 'lib'; replay.on = false; clearInterval(replay.timer); replay.timer = 0; render(); },
    mA() { view = 'nl'; nlView(); }, mB() { startDraft(B.defaultSpec(), {id: null, method: 'visual'}); }, mC() { view = 'ind'; indView(); }, indScan, indOk() { const sp = indSpec(), v = B.validateSpec(sp); if (!v.ok) return toast(v.errors[0]); const b = newBot(sp, 'indicador', 'Señales de ' + (sp.entry.long[0].a.sname || 'mi indicador')); S.bots.push(b); touch(b); cur = b.id; tab = 'sum'; view = 'bot'; render(); runAndShow(b, 1); }, indEdit() { startDraft(indSpec(), {id: null, method: 'indicador'}); },
    preset(el) { const sp = B.PRESETS[el.dataset.k](); startDraft(sp, {id: null, method: el.dataset.k === 'novaNexus' ? 'nova' : 'visual'}); },
    nlOk() { const b = newBot(nl.spec, 'nl', nl.hist.filter(h => h.role === 'user').map(h => h.content).join(' / ').slice(0, 300)); S.bots.push(b); touch(b); cur = b.id; tab = 'sum'; view = 'bot'; render(); runAndShow(b, 1); },
    nlEdit() { startDraft(nl.spec, {id: null, method: 'nl'}); },
    tfPick(el) { if (!draft) return; const k = el.dataset.k, cur = ivsOf(draft), on = cur.includes(k); let l = on ? cur.filter(x => x !== k) : [...cur, k]; if (!l.length) { toast('Deja al menos una temporalidad'); return; } l = INTS.filter(i => l.includes(i)); draft.intervals = l.length > 1 ? l : undefined; if (!l.includes(draft.interval) || l.length === 1) draft.interval = l[0]; editView(); },
    tfTest() { const b = bot(); if (b) doTfTest(b); },
    addc(el) { const l = getP(draft, el.dataset.list); l.push({a: {k: 'close'}, op: 'gt', b: {k: 'ema', n: 20}}); editView(); }, rmc(el) { getP(draft, el.dataset.list).splice(+el.dataset.i, 1); editView(); },
    saveDraft, showDesc() { $('#blDesc').innerHTML = `<div class="bl-box">${mdLite(B.describeSpec(B.normalizeSpec(draft)))}</div>`; },
    open(el) { diaryMode = 'auto'; cur = el.dataset.id; tab = 'sum'; view = 'bot'; replay = Object.assign(replay, {t: null, ver: null, seg: 'all'}); marksOn = false; H.marks && H.marks(null); render(); },
    dup(el) { dupBot(getBot(el.dataset.id)); }, pause(el) { const b = getBot(el.dataset.id), now = Date.now(); b.status = b.status === 'paused' ? (runOf(b) ? 'tested' : 'draft') : 'paused'; for (const x of b.paper || []) { if (b.status === 'paused' && x.status === 'running') { x.status = 'paused'; x.pausedAt = now; x.byBot = true; } else if (b.status !== 'paused' && x.status === 'paused' && x.byBot) { x.status = 'running'; x.byBot = false; if (x.open) (x.notes = x.notes || []).push({t: now, text: 'Se reanudó con una posición abierta: el modelo no la sigue durante la pausa; verifícala.'}); x.open = null; x.anchorT = Math.max(x.anchorT || 0, now); (x.gaps = x.gaps || []).push({from: x.pausedAt, to: now, why: 'Bot en pausa (no se opera durante ella)'}); } } log(b, 'estado', b.status === 'paused' ? 'Bot pausado (también su simulación en vivo).' : 'Bot reanudado.'); touch(b); render(); },
    arch(el) { const b = getBot(el.dataset.id); b.status = b.status === 'archived' ? (runOf(b) ? 'tested' : 'draft') : 'archived'; sel.delete(b.id); touch(b); render(); }, exp(el) { exportBot(getBot(el.dataset.id)); },
    del(el) { const b = getBot(el.dataset.id); if (!confirm(`¿Eliminar «${b.name}» y todo su historial? No se puede deshacer.`)) return; S.bots = S.bots.filter(x => x.id !== b.id); S.deleted[b.id] = Date.now(); sel.delete(b.id); if (marksOn) { marksOn = false; H.marks && H.marks(null); } save(); render(); },
    import() { const f = document.createElement('input'); f.type = 'file'; f.accept = 'application/json,.json'; f.onchange = () => { const r = new FileReader(); r.onload = () => importBot(r.result); f.files[0] && r.readAsText(f.files[0]); }; f.click(); },
    cmp() { if (!pick) pick = true; else if (sel.size >= 2) { pick = false; view = 'cmp'; } render(); }, cmpCancel() { pick = false; sel.clear(); render(); }, toggleArch() { showArch = !showArch; render(); },
    quickRun() { const b = bot(), r = runOf(b); runAndShow(b, b.mainV, (r && r.reqBars) || 3000); }, sub(el) { sub[tab] = el.dataset.k; render(); },
    tab(el) { tab = el.dataset.k; render(); },
    run() { const b = bot(); runAndShow(b, +$('#blRunV').value, +$('#blRunBars').value); }, vrun(el) { runAndShow(bot(), +el.dataset.v); },
    vmain(el) { const b = bot(), v = +el.dataset.v, c = runOf(b, v), m = runOf(b); if (!c) { toast('Primero prueba esa versión'); return; } const bad = m && m !== c && judge(c, m).lvl === 'empeora'; if (!confirm(bad ? `La v${v} es PEOR que la principal en alguna métrica fuera de muestra o de riesgo. ¿Quieres convertirla en principal de todos modos?` : `¿Hacer principal la v${v}? Podrás volver a la anterior cuando quieras.`)) return; b.versions.forEach(x => { if (x.v === b.mainV) x.state = 'anterior'; }); ver(b, v).state = 'principal'; b.mainV = v; log(b, 'versión', `La v${v} pasó a ser la principal (decisión tuya).`); relive(b); touch(b); render(); },
    vdisc(el) { const b = bot(); ver(b, +el.dataset.v).state = 'descartada'; log(b, 'versión', `Descartada la v${el.dataset.v}.`); touch(b); render(); },
    vedit(el) { const b = bot(); startDraft(ver(b, +el.dataset.v).spec, {id: b.id, note: 'Editada a partir de v' + el.dataset.v}); },
    papStart() { const b = bot(), v = +$('#papV').value, cap = +$('#papCap').value; if (!(cap >= 100)) return toast('El capital virtual debe ser de al menos 100'); const sp = ver(b, v).spec, r = runOf(b, v); if (r && r.verdict.level === 'pierde' && !confirm('Esta versión pierde dinero en el backtest. ¿Iniciar paper trading de todos modos?')) return;
      void sp; startLive(b, v, cap); },
    papUpd(el) { const b = bot(), s = (b.paper || []).find(x => x.id === el.dataset.id); if (s) paperUpdate(b, s); },
    papPause(el) { const b = bot(), s = b.paper.find(x => x.id === el.dataset.id); s.status = 'paused'; s.pausedAt = Date.now(); log(b, 'paper', 'Paper trading pausado.'); touch(b); render(); },
    papResume(el) { const b = bot(), s = b.paper.find(x => x.id === el.dataset.id); s.status = 'running'; if (s.open) { s.notes.push({t: Date.now(), text: 'Se reanudó con una posición abierta: el modelo no la sigue durante la pausa; verifícala.'}); } s.open = null; s.anchorT = Math.max(s.anchorT, Date.now()); s.gaps.push({from: s.pausedAt, to: Date.now(), why: 'Pausa del usuario (no se opera durante ella)'}); log(b, 'paper', 'Paper trading reanudado.'); touch(b); render(); paperUpdate(b, s); },
    papStop(el) { const b = bot(), s = b.paper.find(x => x.id === el.dataset.id); if (!confirm('¿Terminar esta sesión? Se conserva el historial pero ya no avanza.')) return; s.status = 'stopped'; log(b, 'paper', 'Paper trading terminado.'); touch(b); render(); },
    risk() { view = 'risk'; render(); }, rkPeak() { S.risk = RK().norm(S.risk); S.risk.peak = 0; S.risk.updatedAt = Date.now(); save(); riskTick(); render(); },
    sweep() { doSweep(bot()); }, optNow() { optNow(bot()); },
    async costs() { const b = bot(), sp = mainSpec(b), run = runOf(b); $('#blCosts').innerHTML = note('Calculando…'); try { const res = await execute(Object.assign({}, sp, {costs: {feePct: sp.costs.feePct * 2, slipPct: sp.costs.slipPct * 2}}), run.reqBars); $('#blCosts').innerHTML = `<p>Con costes ×2: <b class="${cls(res.metrics.retPct)}">${pct(res.metrics.retPct)}</b> (${res.metrics.n} op.) frente a <b>${pct(run.metrics.retPct)}</b> con los costes normales.</p>`; } catch (e) { $('#blCosts').innerHTML = note('Error: ' + (e.message || e)); } },
    askq(el) { askAi(bot(), $('#blTab')._ins[+el.dataset.i]); }, accept(el) { acceptProposal(bot(), el.dataset.id); }, reject(el) { const b = bot(), m = b.chat.find(x => x.id === el.dataset.id); m.state = 'rejected'; log(b, 'experimento', 'Rechazaste una propuesta del asistente.'); touch(b); render(); },
    chartToggle() { const b = bot(); if (marksOn) { marksOn = false; replay.on = false; clearInterval(replay.timer); replay.timer = 0; replay.t = null; H.marks && H.marks(null); render(); } else chartShow(b); },
    seeTrade(el) { const b = bot(), run = runOf(b), t = run.trades[+el.dataset.i]; if (tchart && $('#blTC')) { tchart.focus(t); $('#blTC').scrollIntoView({behavior: 'smooth', block: 'center'}); return; } replay.t = null; replay.seg = 'all'; chartShow(b, t.entryT); },
    rpPlay() { if (replay.on) { replay.on = false; clearInterval(replay.timer); replay.timer = 0; } else { replay.on = true; if (replay.t == null) rpTick(); replay.timer = setInterval(rpTick, 1100 / replay.speed); } render(); }, rpStep() { rpTick(); }, rpReset() { replay.t = null; replay.on = false; clearInterval(replay.timer); replay.timer = 0; pushMarks(); render(); }
  };
  function bind() {
    root.addEventListener('click', e => { if ((view === 'lib' || view === 'bot' || view === 'tourn') && dashClick(e)) return; const el = e.target.closest('[data-a]'); if (!el || !root.contains(el) || el.disabled) return; const f = ACT[el.dataset.a]; if (f) { e.preventDefault(); if (freshV && /^(tab|sub|lib|open|dmode|claudio|tourn|new|risk|cmp|backBot|tcSym)$/.test(el.dataset.a)) freshV = null; f(el); } });
    root.addEventListener('change', e => {
      const el = e.target; if (el.id === 'blArch') { showArch = el.checked; return render(); } if (el.dataset.sel) { el.checked ? sel.add(el.dataset.sel) : sel.delete(el.dataset.sel); return render(); }
      if (el.id === 'rpSpd') { replay.speed = +el.value; if (replay.on) { clearInterval(replay.timer); replay.timer = setInterval(rpTick, 1100 / replay.speed); } return; } if (el.id === 'rpSeg') { replay.seg = el.value; replay.t = null; pushMarks(); return render(); } if (el.id === 'rpVer') { replay.ver = +el.value; replay.t = null; pushMarks(); return render(); } if (el.dataset.sh) { replay.show[el.dataset.sh] = el.checked; return pushMarks(); }
      if (el.dataset.rk2) { const r = S.risk = RK().norm(S.risk); r.log = r.log.slice(); r[el.dataset.rk2] = Math.max(0, +el.value || 0); r.updatedAt = Date.now(); save(); riskTick(); return render(); } if (el.id === 'rkKill') { const r = S.risk = RK().norm(S.risk); r.kill = el.checked; r.updatedAt = Date.now(); save(); riskTick(); return render(); }
      if (el.id === 'cycAuto') { const b = bot(), c = cyc(b); c.auto = el.checked; log(b, 'ciclo', el.checked ? 'Mejora automática ACTIVADA.' : 'Mejora automática desactivada: las mejoras quedan como candidatas para que las revises.'); touch(b); return; }
      if (el.id === 'cycOn') { const b = bot(), c = cyc(b); c.enabled = el.checked; if (el.checked) c.enabledAt = Date.now(); log(b, 'ciclo', el.checked ? 'Ciclo automático de reentrenamiento ACTIVADO.' : 'Ciclo automático desactivado.'); touch(b); return render(); } if (el.id === 'cycEvery') { cyc(bot()).everyHours = +el.value; return touch(bot()); } if (el.id === 'cycBars') { cyc(bot()).bars = +el.value; return touch(bot()); }
      if (el.id === 'indSid') { ind.sid = el.value; ind.res = null; ind.err = ''; return indView(); } if (el.id === 'indSym') { ind.sym = el.value.toUpperCase(); ind.res = null; return; } if (el.id === 'indItv') { ind.itv = el.value; ind.res = null; return; } if (el.id === 'indBuy') { ind.buy = el.value; return indView(); } if (el.id === 'indSell') { ind.sell = el.value; return; } if (el.id === 'indShort') { ind.short = el.checked; return; }
      onField(el);
    });
    root.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'blNlForm') { const t = $('#blNlIn').value; nlSend(t); } else if (e.target.id === 'blBf') { const t = $('#blBi').value; $('#blBi').value = ''; askAi(bot(), t); } });
  }

  /* ----- Arranque ----- */
  function init() {
    root = $('#botLabRoot'); if (!root) return; S = dedupe(Object.assign({deleted: {}}, readLocal())); bind(); setTimeout(() => { if (!(H.cloud && H.cloud())) { seedSafe(); seedLucas(); fixQuick(); seedPachita(); healBots(); if (view === 'lib') render(); } }, 12000); if (window.CCTClaudioUI) window.CCTClaudioUI.onChange = () => { if (view === 'lib') render(); }; render();
    const open = () => { S = merge(S, readLocal()); setTimeout(() => { if (view === 'lib') render(); }, 30); pullCloud(); paperTick(); };
    const rb = $('#rrBotLab'); rb && rb.addEventListener('click', open);
    paperTick(); setInterval(() => { if (!document.hidden) paperTick(); }, 60000);
    setTimeout(pullCloud, 2500);
    window.CCTBotLabUI = {nl: text => { view = 'nl'; nlView(); setTimeout(() => nlSend(text), 50); }, mergeServer, mergePaper, state: () => S, open: id => ACT.open({dataset: {id}}), runBot, newBot, store: s => { S = s; save(); render(); }, claudio: o => { if (o === undefined) return S.claudio || null; S.claudio = o; save(); return o; }};
  }
  // La vista de lista usa las vistas «nl» como subvista de «new»
  const _render = render; render = function () { if (view === 'ind') { stopReplayIf(); indView(); document.body.classList.toggle('botlab-wide', wide && matchMedia('(min-width:1024px)').matches); return; } if (view === 'nl') { stopReplayIf(); nlView(); document.body.classList.toggle('botlab-wide', wide && matchMedia('(min-width:1024px)').matches); return; } _render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

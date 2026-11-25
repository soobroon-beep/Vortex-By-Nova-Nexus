/* VORTEX · Nexus Lens — tu cuenta del exchange dentro de VORTEX.
   Antes era una app aparte (lens.html en un iframe, solo BingX, con sus propios colores y Chart.js).
   Ahora es una sección nativa de VORTEX:
   · Datos: el exchange que conectas UNA vez en VORTEX (CCTExchange, cualquiera de la lista: BingX, Binance, Bybit, OKX, Bitget…).
     Saldo y posiciones en vivo salen de su lectura periódica; el historial de operaciones cerradas de CCTExchange.history().
   · Estilo: usa las mismas variables de color, tipografía y cristal que el resto de la app (Clásico, Minimal, Espacial, claro u oscuro).
   · Gráficos: SVG propios (sin librerías), con cruz y globo al pasar el cursor o el dedo.
   · Coach IA: la IA de VORTEX (tu IA si la configuraste; si no o si falla, la IA gratis) con tus métricas, tus reglas de Nexus Pixel,
     tus posiciones abiertas y el contexto de mercado de cada una (tendencia, ATR, máximos y mínimos recientes).
   Nada de esto manda órdenes: Nexus Lens solo lee. */
(function (root) {
  'use strict';
  const doc = root.document, fin = Number.isFinite;
  const EX = () => root.CCTExchange, LLM = () => root.CCTLLM;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const toast = m => { try { root.CCT_toast && root.CCT_toast(m); } catch {} };
  const CACHE = 'cct_lens_cache_v2', PREF = 'cct_lens_pref_v1', DAYS = 120;
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const svg = (p, s = 16, w = 1.8) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const IC = {
    lens: '<circle cx="10" cy="10" r="7.4"/><path d="m15.4 15.4 5.4 5.4"/><path d="M7 12.5v-2M10 12.5V7.5M13 12.5V9.5"/>',
    sync: '<path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M20 4.5V9h-4.5"/>',
    home: '<path d="M4 19V9l8-5 8 5v10"/><path d="M9 19v-5h6v5"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".8"/><circle cx="4" cy="12" r=".8"/><circle cx="4" cy="18" r=".8"/>',
    stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    coach: '<path d="M12 3.5 13.9 8l4.6 1.1-3.5 3.1.9 4.7L12 14.6 8.1 16.9 9 12.2 5.5 9.1 10.1 8z"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    chart: '<path d="M4 19h16"/><path d="m4 15 5-5 4 3 7-7"/>',
    send: '<path d="M5 12h13"/><path d="m13 6 6 6-6 6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    plug: '<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0z"/><path d="M12 16v5"/>',
    left: '<path d="m15 6-6 6 6 6"/>', right: '<path d="m9 6 6 6-6 6"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    warn: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17h.01"/>', ok: '<path d="m5 12.5 4.2 4.2L19 7"/>', info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', bolt: '<path d="M13 2.5 4.5 13.5H12L11 21.5l8.5-11H12z"/>', target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".9"/>',
    shield: '<path d="M12 3 5 6v5.5c0 4.4 3 7.7 7 9.5 4-1.8 7-5.1 7-9.5V6z"/>', brain: '<path d="M9.5 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 7 17.5a2.5 2.5 0 0 0 5 .5V5.5a2.5 2.5 0 0 0-2.5-1zM14.5 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3 3 0 0 1-2.5 4.8 2.5 2.5 0 0 1-5 .5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.6 3-5.4 3.6-8.9 1.8 1.2 2.9 2.9 3.1 4.6 1-.6 1.6-1.9 1.7-3.2 2.1 1.7 3.6 4.4 3.6 7.5 0 3.2-2.4 5.6-6 5.6z"/>'
  };

  /* ───────── Preferencias de la vista (pestaña, rango del gráfico, filtros) ───────── */
  const P = (() => { let o = {}; try { o = JSON.parse(localStorage.getItem(PREF) || '{}') || {}; } catch {} return {tab: ['home', 'trades', 'stats', 'coach', 'cal'].includes(o.tab) ? o.tab : 'home', range: ['7', '30', '90', 'all'].includes(o.range) ? o.range : '30', filter: o.filter || 'all', pairs: o.pairs || 'pnl'}; })();
  const saveP = () => { try { localStorage.setItem(PREF, JSON.stringify(P)); } catch {} };

  /* ───────── Estado ───────── */
  let D = {trades: [], at: 0, src: '', spot: false, err: '', ex: ''}, M = null, loading = false, demo = false, host = null, wired = false, lastW = 0;
  let calY = new Date().getFullYear(), calM = new Date().getMonth(), calSel = '';
  let ai = {busy: false, kind: '', text: '', model: '', err: '', note: ''}, chat = [], posAi = {}, aiCtl = null;

  /* ───────── Diario de cada operación (antes en «Diario de trading»): setup, emoción, errores y nota ─────────
     Se guarda por cuenta (este navegador + users/<uid>/data/lens_notes) y se mezcla por fecha: nunca se pisa lo más nuevo. */
  const NOTES = 'cct_lens_notes_v1', TAGS = ['Ruptura', 'Retesteo', 'Tendencia', 'Rango', 'Reversión', 'Noticia', 'Scalp', 'Swing'];
  const MOODS = ['Disciplinado', 'Confiado', 'Dudoso', 'Impulsivo', 'Miedo', 'Codicia'], ERRS = ['Entré tarde', 'Sin plan', 'Moví el stop', 'Cerré antes', 'Sobreapalancado', 'Operé por venganza'];
  let N = (() => { try { const o = JSON.parse(localStorage.getItem(NOTES) || 'null'); if (o && o.map) return o; } catch {} return {owner: '', map: {}}; })(), noteSel = '', noteT = 0, notesPulled = '';
  const tKey = t => String(t.id || (t.sym + '|' + t.ts));
  const noteOf = t => N.map[tKey(t)] || null;
  const hasNote = n => !!(n && ((n.tags || []).length || n.mood || (n.errs || []).length || (n.note || '').trim()));
  function notesSave() {
    const u = cuid(); if (u && N.owner && N.owner !== u) N = {owner: u, map: {}}; if (u) N.owner = u;
    if (demo) return; // la cuenta de ejemplo no se guarda
    try { localStorage.setItem(NOTES, JSON.stringify({owner: N.owner, map: Object.fromEntries(Object.entries(N.map).filter(([k]) => !k.startsWith('demo')))})); } catch {}
    clearTimeout(noteT); noteT = setTimeout(notesPush, 2500);
  }
  async function notesPull() {
    const C = root.CCTCloudPriv, u = cuid(); if (!C || !C.ready || !C.ready() || !u || notesPulled === u) return; notesPulled = u;
    if (N.owner && N.owner !== u) N = {owner: u, map: {}};
    try { const d = await C.get('lens_notes'); let m = {}; try { m = d && d.items ? JSON.parse(d.items) : {}; } catch {} let ch = false;
      for (const [k, v] of Object.entries(m || {})) { const cur = N.map[k]; if (v && (!cur || (v.at || 0) > (cur.at || 0))) { N.map[k] = v; ch = true; } }
      N.owner = u; try { localStorage.setItem(NOTES, JSON.stringify(N)); } catch {} if (ch && visible()) paint(); } catch {}
  }
  async function notesPush() {
    const C = root.CCTCloudPriv, u = cuid(); if (!C || !C.ready || !C.ready() || !u) return;
    try { const keep = Object.entries(N.map).filter(([k, v]) => !k.startsWith('demo') && hasNote(v)).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 1500); await C.set('lens_notes', {items: JSON.stringify(Object.fromEntries(keep)), at: Date.now()}); } catch {}
  }
  function noteSet(key, fn) { const n = N.map[key] || (N.map[key] = {tags: [], mood: '', errs: [], note: ''}); fn(n); n.at = Date.now(); notesSave(); return n; }
  function noteEditor(t) {
    const n = noteOf(t) || {}, k = tKey(t), chip = (kind, v, on) => `<button type="button" class="ln-nc${on ? ' on' : ''}" data-ln-nk="${kind}" data-ln-nv="${esc(v)}" data-ln-nid="${esc(k)}">${esc(v)}</button>`;
    return `<div class="ln-ned" data-ln-ned="${esc(k)}">
      <h5>Setup</h5><div class="ln-ncs">${TAGS.map(v => chip('tag', v, (n.tags || []).includes(v))).join('')}${(n.tags || []).filter(v => !TAGS.includes(v)).map(v => chip('tag', v, true)).join('')}<button type="button" class="ln-nc add" data-ln-newtag="${esc(k)}">+ Otro</button></div>
      <h5>Cómo me sentí</h5><div class="ln-ncs">${MOODS.map(v => chip('mood', v, n.mood === v)).join('')}</div>
      <h5>Errores</h5><div class="ln-ncs">${ERRS.map(v => chip('err', v, (n.errs || []).includes(v))).join('')}</div>
      <h5>Nota</h5><textarea class="ln-nta" data-ln-nta="${esc(k)}" rows="3" maxlength="4000" placeholder="¿Por qué entraste? ¿Qué harías distinto?">${esc(n.note || '')}</textarea></div>`;
  }
  function csv() {
    if (!M) return; const rows = [['Fecha cierre', 'Par', 'Lado', 'Resultado USD', 'R', 'Salida', 'Comisión', 'Setup', 'Emoción', 'Errores', 'Nota']];
    for (const t of M.T.slice().reverse()) { const n = noteOf(t) || {}; rows.push([new Date(t.ts).toISOString(), t.sym, t.side === 'long' ? 'Long' : t.side === 'short' ? 'Short' : '', t.pnl.toFixed(2), (t.pnl / M.R).toFixed(2), fin(t.exit) ? t.exit : '', fin(t.fee) ? t.fee : '', (n.tags || []).join(' | '), n.mood || '', (n.errs || []).join(' | '), n.note || '']); }
    const txt = '\ufeff' + rows.map(r => r.map(v => /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
    const a = doc.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], {type: 'text/csv'})); a.download = `nexus-lens-${new Date().toISOString().slice(0, 10)}.csv`; doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function journalStats() { // por setup y errores, con las operaciones que tienen nota
    const by = (keys) => { const m = new Map(); for (const t of M.T) { const n = noteOf(t); if (!n) continue; for (const k of keys(n)) { const o = m.get(k) || {n: 0, pnl: 0, w: 0}; o.n++; o.pnl += t.pnl; if (t.pnl > 0) o.w++; m.set(k, o); } } return [...m.entries()].map(([k, v]) => Object.assign({k, wr: v.n ? v.w / v.n : 0}, v)); };
    return {tags: by(n => n.tags || []).sort((a, b) => b.pnl - a.pnl), errs: by(n => n.errs || []).sort((a, b) => a.pnl - b.pnl), moods: by(n => n.mood ? [n.mood] : []).sort((a, b) => b.pnl - a.pnl)};
  }

  /* ───────── Formatos ───────── */
  const money = (v, d = 2) => fin(v) ? (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d}) : '—';
  const pnlTxt = (v, d = 2) => fin(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d}) : '—';
  const short = v => { if (!fin(v)) return '—'; const a = Math.abs(v), s = v < 0 ? '−' : ''; return s + '$' + (a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e4 ? (a / 1e3).toFixed(1) + 'k' : a >= 100 ? a.toFixed(0) : a.toFixed(2)); };
  const cmp = v => { if (!fin(v)) return '—'; const a = Math.abs(v); return (v > 0 ? '+' : v < 0 ? '−' : '') + (a >= 1e4 ? Math.round(a / 1e3) + 'k' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'k' : a >= 10 ? Math.round(a) : a.toFixed(1)); }; // sin $, para celdas chicas
  const shortS = v => (fin(v) && v > 0 ? '+' : '') + short(v);
  const pct = (v, d = 1) => fin(v) ? (v * 100).toFixed(d) + '%' : '—';
  const num2 = v => v === Infinity ? '∞' : fin(v) ? v.toFixed(2) : '—';
  const px = v => { if (!fin(v) || v <= 0) return '—'; const d = v >= 1000 ? 1 : v >= 10 ? 2 : v >= 1 ? 3 : v >= .01 ? 5 : 7; return v.toLocaleString('en-US', {minimumFractionDigits: v >= 1000 ? 0 : Math.min(d, 2), maximumFractionDigits: v >= 10000 ? 0 : d}); };
  const tone = v => !fin(v) || v === 0 ? '' : v > 0 ? 'up' : 'dn';
  const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dLabel = k => { const [y, m, d] = k.split('-'); return `${+d} ${MONTHS[+m - 1].slice(0, 3).toLowerCase()}`; };
  const ago = t => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 50 ? 'hace un momento' : s < 3600 ? `hace ${Math.round(s / 60)} min` : s < 86400 ? `hace ${Math.round(s / 3600)} h` : `hace ${Math.round(s / 86400)} d`; };
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const sessOf = ts => { const h = new Date(ts).getUTCHours(); return h < 7 ? 'Asia' : h < 13 ? 'Londres' : h < 21 ? 'Nueva York' : 'Cierre'; };

  /* ───────── Exchange: saldo y posiciones en vivo ───────── */
  const snap = () => { if (demo) return DEMO.snap; const X = EX(); return X && X.connected() ? X.snap() : null; };
  const exInfo = () => { if (demo) return {id: 'demo', name: 'Ejemplo', market: 'swap'}; const X = EX(); return X && X.info ? X.info() : null; };
  const num = v => { v = +v; return fin(v) ? v : NaN; };
  function positions() {
    const s = snap(); if (!s) return [];
    return (s.positions || []).map(p => {
      const I = p.info || {}, c = Math.abs(num(p.contracts)), side = String(p.side || '').toLowerCase() === 'short' ? 'short' : 'long';
      const entry = num(p.entryPrice), mark = num(p.markPrice) || num(I.markPrice), upnl = num(p.unrealizedPnl), lev = num(p.leverage) || num(I.leverage);
      const notional = Math.abs(num(p.notional)) || c * (num(p.contractSize) || 1) * (mark || entry);
      const margin = num(p.initialMargin) || (lev > 0 ? notional / lev : NaN);
      return {raw: p, sym: String(p.symbol || '').split(/[/:]/)[0].replace(/[-_]?(USDT|USDC|USD)$/i, '').replace(/^1000+/, ''), pair: p.symbol, side, size: c, entry, mark, upnl, lev, notional, margin, roe: margin > 0 && fin(upnl) ? upnl / margin : num(p.percentage) / 100, liq: num(p.liquidationPrice)};
    }).filter(p => p.size > 0 || fin(p.upnl));
  }

  /* ───────── Carga del historial ───────── */
  const cuid = () => { try { const C = root.CCTCloudPriv; return C && C.uid ? C.uid() : ''; } catch { return ''; } }; // el historial guardado es de UNA cuenta: otra cuenta en este navegador no lo ve
  function readCache(id) { try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); return c && c.ex === id && c.uid && c.uid === cuid() && Array.isArray(c.trades) ? c : null; } catch { return null; } }
  function writeCache(d) { try { const u = cuid(); if (!u) return; localStorage.setItem(CACHE, JSON.stringify({trades: d.trades.slice(-1500), at: d.at, src: d.src, spot: d.spot, ex: d.ex, uid: u})); } catch {} }
  async function load(force) {
    if (demo) { D = DEMO.data(); compute(); return paint(); }
    const X = EX(), info = exInfo();
    if (!X || !X.connected() || !info) { D = {trades: [], at: 0, src: '', spot: false, err: '', ex: ''}; M = null; return paint(); }
    if (D.ex !== info.id) { const c = readCache(info.id); D = c ? Object.assign({err: ''}, c) : {trades: [], at: 0, src: '', spot: info.market === 'spot', err: '', ex: info.id}; compute(); paint(); }
    if (!force && D.at && Date.now() - D.at < 3 * 6e4) return;
    if (loading) return; loading = true; paintBusy();
    try { const r = await X.history({days: DAYS}); D = {trades: r.trades || [], at: Date.now(), src: r.src || '', spot: !!r.spot, err: '', ex: info.id}; writeCache(D); }
    catch (e) { D.err = String(e && e.message || e).slice(0, 240); }
    finally { loading = false; }
    if (force) { try { X.refresh(); } catch {} }
    compute(); paint();
  }

  /* ───────── Métricas ───────── */
  function compute() {
    const T = D.trades.filter(t => fin(t.pnl) && t.pnl !== 0).slice().sort((a, b) => a.ts - b.ts);
    if (!T.length) { M = null; return; }
    const m = {T, n: T.length}, pnls = T.map(t => t.pnl), wins = pnls.filter(p => p > 0), losses = pnls.filter(p => p < 0);
    m.wins = wins.length; m.losses = losses.length; m.wr = wins.length / pnls.length;
    m.grossWin = wins.reduce((a, b) => a + b, 0); m.grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
    m.avgWin = wins.length ? m.grossWin / wins.length : 0; m.avgLoss = losses.length ? m.grossLoss / losses.length : 0;
    m.pf = m.grossLoss > 0 ? m.grossWin / m.grossLoss : (m.grossWin > 0 ? Infinity : 0);
    m.total = pnls.reduce((a, b) => a + b, 0); m.exp = m.total / pnls.length;
    m.wl = m.avgLoss > 0 ? m.avgWin / m.avgLoss : (m.avgWin > 0 ? Infinity : 0);
    m.payoff = m.wl === Infinity ? 1 : m.wr * m.wl - (1 - m.wr); // ventaja por operación en unidades de pérdida media
    m.best = Math.max(...pnls); m.worst = Math.min(...pnls); m.fees = T.reduce((a, t) => a + (t.fee || 0), 0);
    const R = m.avgLoss > 0 ? m.avgLoss : (Math.abs(m.exp) || 1); m.R = R; m.rs = pnls.map(p => p / R); m.expR = mean(m.rs);
    // por día
    const days = {}; for (const t of T) { const k = dayKey(t.ts); (days[k] || (days[k] = {pnl: 0, n: 0, w: 0, trades: []})); days[k].pnl += t.pnl; days[k].n++; if (t.pnl > 0) days[k].w++; days[k].trades.push(t); }
    m.days = days; const dk = Object.keys(days).sort(); m.dayKeys = dk; const dr = dk.map(k => days[k].pnl); m.dayRets = dr;
    const sd = std(dr), sdn = std(dr.filter(x => x < 0).concat(dr.filter(x => x < 0).length < 2 ? [0, 0] : [])), md = mean(dr), ANN = Math.sqrt(365);
    m.sharpe = sd > 0 ? md / sd * ANN : 0; m.sortino = sdn > 0 ? md / sdn * ANN : (md > 0 ? Infinity : 0);
    m.greenDays = dr.filter(x => x > 0).length; m.redDays = dr.filter(x => x < 0).length;
    // curva y drawdown por operación (más detalle que por día)
    const eq = snap() && fin(snap().equity) ? snap().equity : NaN; m.equity = eq;
    let cum = 0, peak = 0, maxDD = 0, ddAt = 0; const curve = [], under = [];
    for (const t of T) { cum += t.pnl; curve.push({t: t.ts, v: cum}); if (cum > peak) peak = cum; const dd = cum - peak; under.push({t: t.ts, v: dd}); if (dd < maxDD) { maxDD = dd; ddAt = t.ts; } }
    m.curve = curve; m.under = under; m.maxDD = maxDD; m.ddAt = ddAt;
    const base = fin(eq) && eq > 0 ? eq - m.total + (peak) : 0; m.maxDDpct = base > 0 ? maxDD / base : NaN; // contra el capital en el pico
    m.startCap = fin(eq) ? eq - m.total : NaN;
    if (ddAt) { const i = curve.findIndex(c => c.t === ddAt), trough = curve[i].v, pk = Math.max(0, ...curve.slice(0, i + 1).map(c => c.v)), last = curve[curve.length - 1].v; m.recovered = pk > trough ? Math.max(0, Math.min(1, (last - trough) / (pk - trough))) : 1; } else m.recovered = 1;
    const yrs = Math.max((Date.now() - T[0].ts) / (365 * 864e5), 7 / 365); m.span = Math.max(1, Math.round((Date.now() - T[0].ts) / 864e5));
    m.calmar = maxDD < 0 ? (m.total / yrs) / Math.abs(maxDD) : (m.total > 0 ? Infinity : 0);
    // win rate móvil (20)
    m.rolling = pnls.map((_, i) => { const s = pnls.slice(Math.max(0, i - 19), i + 1); return s.filter(p => p > 0).length / s.length; });
    // rachas
    let cw = 0, cl = 0, mw = 0, ml = 0; for (const p of pnls) { if (p > 0) { cw++; cl = 0; } else { cl++; cw = 0; } mw = Math.max(mw, cw); ml = Math.max(ml, cl); }
    m.maxWinStreak = mw; m.maxLossStreak = ml; m.curStreak = cw ? cw : -cl;
    let gd = 0; for (let i = dk.length - 1; i >= 0 && days[dk[i]].pnl > 0; i--) gd++; m.greenStreak = gd;
    // lados
    const L = T.filter(t => t.side === 'long'), S = T.filter(t => t.side === 'short');
    const sideStats = a => ({n: a.length, pnl: a.reduce((s, t) => s + t.pnl, 0), wr: a.length ? a.filter(t => t.pnl > 0).length / a.length : 0});
    m.long = sideStats(L); m.short = sideStats(S); m.sideKnown = L.length + S.length;
    // sesiones, días, horas, pares
    m.sess = {Asia: sideStats([]), Londres: sideStats([]), 'Nueva York': sideStats([]), Cierre: sideStats([])};
    const bucket = {}; for (const t of T) (bucket[sessOf(t.ts)] || (bucket[sessOf(t.ts)] = [])).push(t); for (const k in m.sess) m.sess[k] = sideStats(bucket[k] || []);
    m.dow = Array.from({length: 7}, (_, i) => sideStats(T.filter(t => new Date(t.ts).getDay() === i)));
    m.hours = Array.from({length: 24}, (_, h) => sideStats(T.filter(t => new Date(t.ts).getHours() === h)));
    const ps = {}; for (const t of T) (ps[t.sym] || (ps[t.sym] = [])).push(t);
    m.pairs = Object.entries(ps).map(([sym, a]) => Object.assign({sym}, sideStats(a), {avg: a.reduce((s, t) => s + t.pnl, 0) / a.length}));
    // conducta: tras ganar / tras perder
    const aL = [], aW = [], szAll = [], szL = []; for (let i = 0; i < T.length; i++) { const sz = T[i].notional; if (fin(sz) && sz > 0) szAll.push(sz); if (!i) continue; const prev = T[i - 1].pnl; if (prev < 0) { aL.push(T[i].pnl); if (fin(sz) && sz > 0) szL.push(sz); } else aW.push(T[i].pnl); }
    m.rev = {afterLoss: mean(aL), afterWin: mean(aW), nL: aL.length, nW: aW.length, size: mean(szAll), sizeL: mean(szL), hasSize: szAll.length > 4};
    // operaciones rápidas tras pérdida (revancha): siguiente operación cerrada < 30 min después de una pérdida
    let quick = 0, quickPnl = 0; for (let i = 1; i < T.length; i++) if (T[i - 1].pnl < 0 && T[i].ts - T[i - 1].ts < 30 * 6e4) { quick++; quickPnl += T[i].pnl; } m.quick = {n: quick, pnl: quickPnl};
    const per = dk.map(k => days[k].n); m.tpd = mean(per); m.maxDay = Math.max(...per);
    // nota del sistema (0-100)
    let sc = 0; const pf = m.pf === Infinity ? 3 : m.pf; sc += Math.min(25, pf / 2 * 25); sc += Math.max(0, Math.min(25, (m.expR + .1) / .6 * 25)); sc += Math.max(0, Math.min(25, m.sharpe / 2.5 * 25)); sc += Math.min(25, (dr.length ? m.greenDays / dr.length : 0) * 40);
    m.score = Math.round(Math.max(0, Math.min(100, sc))); m.grade = m.score >= 80 ? 'A' : m.score >= 65 ? 'B' : m.score >= 45 ? 'C' : 'D';
    m.gradeTxt = {A: 'Ventaja sólida y constante', B: 'Rentable, con margen de mejora', C: 'Ventaja débil: cuida el riesgo', D: 'Sin ventaja clara todavía'}[m.grade];
    M = m;
  }
  const inRange = (ts, r) => r === 'all' || ts >= Date.now() - (+r) * 864e5;
  function periodPnl(fromTs) { let p = 0, n = 0; if (!M) return {p, n}; for (const t of M.T) if (t.ts >= fromTs) { p += t.pnl; n++; } return {p, n}; }
  const startOf = u => { const d = new Date(); d.setHours(0, 0, 0, 0); if (u === 'w') { const w = d.getDay(); d.setDate(d.getDate() - (w === 0 ? 6 : w - 1)); } if (u === 'm') d.setDate(1); return d.getTime(); };

  /* ═════════ Gráficos SVG (sin librerías) ═════════ */
  let charts = [];
  const slot = (kind, data, o) => { const id = 'lnc' + charts.length; charts.push({id, kind, data, o: o || {}}); return `<div class="ln-chart" id="${id}" style="height:${(o && o.h) || 150}px" role="img" aria-label="${esc((o && o.aria) || 'Gráfico')}"></div>`; };
  function niceTicks(lo, hi, n) {
    if (!(hi > lo)) { hi = lo + 1; lo = lo - 1; }
    const raw = (hi - lo) / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log10(raw))), st = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw) || raw;
    const a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st, out = []; for (let v = a; v <= b + st / 2; v += st) out.push(+v.toFixed(10)); return out;
  }
  function drawLine(el, c) {
    const W = el.clientWidth, H = el.clientHeight, o = c.o, data = c.data; if (!W || data.length < 2) { el.innerHTML = `<div class="ln-nochart">Aún no hay suficientes datos</div>`; return; }
    const R = o.axis === false ? 6 : 50, T = 10, B = o.xfmt ? 20 : 6, Lp = 4, pw = W - Lp - R, ph = H - T - B;
    let lo = o.min != null ? o.min : Math.min(...data.map(d => d.v)), hi = o.max != null ? o.max : Math.max(...data.map(d => d.v));
    if (o.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const ticks = o.ticks || niceTicks(lo, hi, 3); lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    const xs = o.byIndex ? data.map((_, i) => i) : data.map(d => d.t), x0 = xs[0], x1 = xs[xs.length - 1] === x0 ? x0 + 1 : xs[xs.length - 1];
    const X = v => Lp + (v - x0) / (x1 - x0) * pw, Y = v => T + (hi - v) / (hi - lo || 1) * ph;
    const pts = data.map((d, i) => [X(xs[i]), Y(d.v)]), line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    const base = Y(o.zero || (lo <= 0 && hi >= 0) ? 0 : (o.fillTo != null ? o.fillTo : lo)), col = o.color || 'var(--accent)', gid = c.id + 'g';
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${col};stop-opacity:${o.down ? 0 : .26}"/><stop offset="1" style="stop-color:${col};stop-opacity:${o.down ? .3 : 0}"/></linearGradient></defs>`;
    for (const tk of ticks) { const y = Y(tk); s += `<line class="ln-grid${tk === 0 ? ' z' : ''}" x1="${Lp}" x2="${Lp + pw}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`; if (o.axis !== false) s += `<text class="ln-ax" x="${W - 4}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${esc((o.yfmt || short)(tk))}</text>`; }
    if (o.ref != null) { const y = Y(o.ref); s += `<line class="ln-ref" x1="${Lp}" x2="${Lp + pw}" y1="${y}" y2="${y}"/>`; }
    if (o.area !== false) s += `<path d="${line}L${pts[pts.length - 1][0].toFixed(1)} ${base.toFixed(1)}L${pts[0][0].toFixed(1)} ${base.toFixed(1)}Z" fill="url(#${gid})"/>`;
    s += `<path class="ln-line" d="${line}" style="stroke:${col}"/>`;
    const lp = pts[pts.length - 1]; s += `<circle class="ln-end" cx="${lp[0].toFixed(1)}" cy="${lp[1].toFixed(1)}" r="3.2" style="fill:${col}"/>`;
    if (o.xfmt) { const n = Math.min(4, data.length); for (let k = 0; k < n; k++) { const i = Math.round(k * (data.length - 1) / Math.max(1, n - 1)), x = pts[i][0]; s += `<text class="ln-ax" x="${x.toFixed(1)}" y="${H - 5}" text-anchor="${k === 0 ? 'start' : k === n - 1 ? 'end' : 'middle'}">${esc(o.xfmt(data[i], i))}</text>`; } }
    s += `<g class="ln-hov" style="display:none"><line class="ln-cross" y1="${T}" y2="${T + ph}"/><circle r="4.2" style="fill:${col}" class="ln-dot"/></g></svg><div class="ln-tip" hidden></div>`;
    el.innerHTML = s;
    hover(el, i => ({x: pts[i][0], y: pts[i][1], html: o.tip ? o.tip(data[i], i) : esc((o.yfmt || short)(data[i].v))}), x => { let b = 0, bd = 1e9; for (let i = 0; i < pts.length; i++) { const d = Math.abs(pts[i][0] - x); if (d < bd) { bd = d; b = i; } } return b; });
  }
  function drawBars(el, c) {
    const W = el.clientWidth, H = el.clientHeight, o = c.o, data = c.data; if (!W || !data.length) { el.innerHTML = `<div class="ln-nochart">Aún no hay suficientes datos</div>`; return; }
    const R = o.axis === false ? 4 : 46, T = 8, B = o.labels ? 18 : 4, Lp = 2, pw = W - Lp - R, ph = H - T - B;
    let lo = Math.min(0, ...data.map(d => d.v)), hi = Math.max(0, ...data.map(d => d.v)); const ticks = niceTicks(lo, hi, 3); lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    const Y = v => T + (hi - v) / (hi - lo || 1) * ph, y0 = Y(0), slotW = pw / data.length, gap = Math.min(4, Math.max(1, slotW * .22)), bw = Math.max(1.5, slotW - gap), r = Math.min(3, bw / 2);
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    for (const tk of ticks) { const y = Y(tk); s += `<line class="ln-grid${tk === 0 ? ' z' : ''}" x1="${Lp}" x2="${Lp + pw}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`; if (o.axis !== false) s += `<text class="ln-ax" x="${W - 4}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${esc((o.yfmt || short)(tk))}</text>`; }
    const geo = data.map((d, i) => {
      const x = Lp + i * slotW + gap / 2, y = Y(d.v), up = d.v >= 0, h = Math.abs(y - y0), col = d.color || (o.color ? o.color(d) : up ? 'var(--green)' : 'var(--red)');
      if (h < .5) { s += `<rect class="ln-bar0" x="${x.toFixed(1)}" y="${(y0 - .5).toFixed(1)}" width="${bw.toFixed(1)}" height="1"/>`; return {x: x + bw / 2, y: y0}; }
      const rr = Math.min(r, h), top = up ? y : y0, bot = up ? y0 : y;
      const path = up ? `M${x} ${bot}V${top + rr}Q${x} ${top} ${x + rr} ${top}H${x + bw - rr}Q${x + bw} ${top} ${x + bw} ${top + rr}V${bot}Z` : `M${x} ${top}V${bot - rr}Q${x} ${bot} ${x + rr} ${bot}H${x + bw - rr}Q${x + bw} ${bot} ${x + bw} ${bot - rr}V${top}Z`;
      s += `<path class="ln-bar" data-i="${i}" d="${path}" style="fill:${col}"/>`; return {x: x + bw / 2, y: up ? top : bot};
    });
    if (o.labels) { const step = Math.max(1, Math.ceil(data.length / (o.maxLabels || 6))); data.forEach((d, i) => { if (i % step && i !== data.length - 1 && !o.allLabels) return; if (o.allLabels || i % step === 0) s += `<text class="ln-ax" x="${geo[i].x.toFixed(1)}" y="${H - 4}" text-anchor="middle">${esc(d.label)}</text>`; }); }
    s += `<g class="ln-hov" style="display:none"><rect class="ln-band" y="${T}" height="${ph}" width="${slotW.toFixed(1)}"/></g></svg><div class="ln-tip" hidden></div>`;
    el.innerHTML = s;
    const band = el.querySelector('.ln-band');
    hover(el, i => { band.setAttribute('x', (Lp + i * slotW).toFixed(1)); return {x: geo[i].x, y: geo[i].y, html: o.tip ? o.tip(data[i], i) : esc(String(data[i].v))}; }, x => Math.max(0, Math.min(data.length - 1, Math.floor((x - Lp) / slotW))), true);
  }
  function hover(el, at, pick, isBar) {
    const sv = el.querySelector('svg'), g = el.querySelector('.ln-hov'), tip = el.querySelector('.ln-tip'), cross = el.querySelector('.ln-cross'), dot = el.querySelector('.ln-dot');
    const show = e => {
      const r = sv.getBoundingClientRect(), x = (e.clientX - r.left), i = pick(x); if (i == null || i < 0) return; const q = at(i);
      g.style.display = ''; if (cross) { cross.setAttribute('x1', q.x); cross.setAttribute('x2', q.x); } if (dot) { dot.setAttribute('cx', q.x); dot.setAttribute('cy', q.y); }
      tip.innerHTML = q.html; tip.hidden = false; const tw = tip.offsetWidth, th = tip.offsetHeight; let lx = q.x + 12; if (lx + tw > r.width - 2) lx = q.x - tw - 12; tip.style.left = Math.max(2, lx) + 'px'; tip.style.top = Math.max(0, Math.min(r.height - th, q.y - th - 8)) + 'px';
      el.querySelectorAll('.ln-bar.on').forEach(b => b.classList.remove('on')); if (isBar) { const b = el.querySelector(`.ln-bar[data-i="${i}"]`); if (b) b.classList.add('on'); }
    };
    const hide = () => { g.style.display = 'none'; tip.hidden = true; el.querySelectorAll('.ln-bar.on').forEach(b => b.classList.remove('on')); };
    el.onpointermove = show; el.onpointerdown = show; el.onpointerleave = hide;
  }
  function mountCharts() { for (const c of charts) { const el = doc.getElementById(c.id); if (!el) continue; try { (c.kind === 'line' ? drawLine : drawBars)(el, c); } catch (e) { el.innerHTML = ''; } } }

  /* ═════════ Pintado ═════════ */
  const TABS = [['home', 'Resumen', IC.home], ['trades', 'Trades', IC.list], ['stats', 'Análisis', IC.stats], ['coach', 'Coach', IC.coach], ['cal', 'Calendario', IC.cal]];
  function shell() {
    const info = exInfo(), s = snap(), live = info && s && !s.err;
    return `<div class="ln${demo ? ' demo' : ''}">
      <div class="view-head ln-head"><div><div class="eyebrow">NEXUS LENS${info ? ' · ' + esc(info.name.toUpperCase()) : ''}</div><h1>Mi cuenta</h1></div>
        <div class="ln-hact">${info ? `<div class="ln-exw"><button type="button" class="ln-exch" ${demo ? 'data-ln="demo-off"' : 'data-ex-open'} title="${demo ? 'Salir del ejemplo' : 'Tu exchange conectado'}"><i class="ln-dot${live ? ' on' : ''}"></i>${esc(demo ? 'Ejemplo' : info.name)}</button><small class="ln-fut">Solo futuros</small></div>` : ''}
        ${info ? `<button type="button" class="ln-ib${loading ? ' spin' : ''}" data-ln="sync" aria-label="Actualizar" title="Actualizar">${svg(IC.sync, 17)}</button>` : ''}</div></div>
      ${info ? `<div class="ln-tabs" role="tablist" aria-label="Nexus Lens">${TABS.map(([k, n, i]) => `<button type="button" role="tab" data-ln-tab="${k}" aria-selected="${P.tab === k}">${svg(i, 15)}<span>${n}</span></button>`).join('')}</div>` : ''}
      <div class="ln-body">${body()}</div></div>`;
  }
  function body() {
    const info = exInfo();
    if (!info) return emptyHtml();
    let h = '';
    if (demo) h += `<div class="ln-banner">${svg(IC.eye, 16)}<span>Estás viendo una <b>cuenta de ejemplo</b>. Conecta tu exchange para ver tus datos reales.</span><button type="button" class="ln-mini acc" data-ex-open>Conectar</button></div>`;
    if (D.err) h += `<div class="ln-banner warn">${svg(IC.warn, 16)}<span>${esc(D.err)}</span><button type="button" class="ln-mini" data-ln="sync">Reintentar</button></div>`;
    const s = snap(); if (s && s.err && !demo) h += `<div class="ln-banner warn">${svg(IC.warn, 16)}<span>${esc(s.err)}</span></div>`;
    if (D.spot && !demo) h += `<div class="ln-banner">${svg(IC.info, 16)}<span>Conectaste el mercado <b>Spot</b>. Nexus Lens mide operaciones de <b>futuros</b> (ganancia realizada); aquí verás tu saldo. Para tu historial conecta Futuros perpetuos.</span><button type="button" class="ln-mini" data-ex-open>Cambiar</button></div>`;
    h += ({home: tabHome, trades: tabTrades, stats: tabStats, coach: tabCoach, cal: tabCal}[P.tab] || tabHome)();
    h += `<p class="ln-foot">${demo ? 'Datos inventados para que veas cómo funciona.' : D.at ? `Historial de ${DAYS} días · actualizado ${ago(D.at)}` : loading ? 'Leyendo tu historial…' : ''}${!demo && info ? ` · solo lectura` : ''}</p>`;
    return h;
  }
  function emptyHtml() {
    const X = EX(), feat = (X && X.FEATURED || []).slice(0, 8);
    return `<div class="ln-empty">
      <div class="ln-orb">${svg(IC.lens, 34, 1.5)}</div>
      <h2>Conecta tu exchange</h2><small class="ln-fut big">Solo futuros</small>
      <p>Nexus Lens lee tu cuenta para mostrarte tu equity, tus posiciones abiertas, tu historial, estadísticas de nivel profesional y un coach con IA que analiza tu forma de operar.</p>
      <div class="ln-exl">${feat.map(([id, n]) => `<button type="button" class="ln-exc" data-ex-open title="${esc(n)}">${esc(n)}</button>`).join('')}<span class="ln-exc more">+100</span></div>
      <button type="button" class="primary ln-go" data-ex-open>${svg(IC.plug, 17)} Conectar exchange</button>
      <button type="button" class="small-button ln-go2" data-ln="demo">${svg(IC.eye, 15)} Ver con una cuenta de ejemplo</button>
      <ul class="ln-safe"><li>${svg(IC.shield, 14)}<span>Usa una API Key de <b>solo lectura</b>: Nexus Lens nunca manda órdenes.</span></li><li>${svg(IC.bolt, 14)}<span>La conectas una vez y sirve en toda la app y en tus dispositivos.</span></li></ul>
    </div>`;
  }
  function card(title, inner, extra, cls) { return `<section class="ln-card${cls ? ' ' + cls : ''}">${title ? `<div class="ln-ct"><h3>${title}</h3>${extra || ''}</div>` : ''}${inner}</section>`; }
  const seg = (name, cur, opts) => `<div class="ln-seg" role="group">${opts.map(([v, t]) => `<button type="button" data-ln-${name}="${v}" aria-pressed="${cur === v}">${t}</button>`).join('')}</div>`;
  const stat = (label, val, cls, sub) => `<div class="ln-st"><span>${label}</span><b class="${cls || ''}">${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;

  /* ───── Resumen ───── */
  function tabHome() {
    const s = snap() || {}, eq = s.equity, pos = positions(), upnl = pos.reduce((a, p) => a + (fin(p.upnl) ? p.upnl : 0), 0);
    const td = periodPnl(startOf('d')), wk = periodPnl(startOf('w')), mo = periodPnl(startOf('m'));
    let h = `<section class="ln-hero"><div class="ln-hero-l"><span class="ln-k">Equity</span><b class="ln-big">${fin(eq) ? money(eq) : (loading || !s.at ? '<i class="ln-sk"></i>' : '—')}</b>
      <div class="ln-chips">${fin(s.free) ? `<span>Disponible <b>${money(s.free)}</b></span>` : ''}${pos.length ? `<span>Abierto <b class="${tone(upnl)}">${pnlTxt(upnl)}</b></span>` : ''}${M ? `<span>${M.n} operaciones · ${M.span} d</span>` : ''}</div></div>
      ${M ? `<div class="ln-grade g${M.grade}" title="Calidad del sistema: ${M.score}/100 · ${esc(M.gradeTxt)}"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18.5" class="trk"/><circle cx="22" cy="22" r="18.5" class="val" style="stroke-dasharray:${(M.score / 100 * 116.2).toFixed(1)} 116.2"/></svg><b>${M.grade}</b><small>${M.score}</small></div>` : ''}</section>`;
    h += `<div class="ln-kpis">${[['Hoy', td], ['Semana', wk], ['Mes', mo]].map(([n, v]) => `<div class="ln-kpi"><span>${n}</span><b class="${tone(v.p)}">${v.n ? shortS(v.p) : '—'}</b><small>${v.n ? v.n + (v.n === 1 ? ' op.' : ' ops.') : 'sin operaciones'}</small></div>`).join('')}</div>`;
    // curva de capital
    if (M) {
      const pts = M.curve.filter(p => inRange(p.t, P.range)); let data = pts;
      if (P.range !== 'all') { const before = M.curve.filter(p => !inRange(p.t, P.range)), b0 = before.length ? before[before.length - 1].v : 0; data = [{t: Date.now() - (+P.range) * 864e5, v: b0}].concat(pts); data = data.map(d => ({t: d.t, v: d.v - b0})); }
      const ch = data.length ? data[data.length - 1].v : 0;
      h += card('Curva de capital', `<div class="ln-cv"><b class="${tone(ch)}">${pnlTxt(ch)}</b><small>ganancia realizada · ${P.range === 'all' ? 'todo el historial' : 'últimos ' + P.range + ' días'}</small></div>` +
        (data.length > 1 ? slot('line', data, {h: 170, color: ch >= 0 ? 'var(--green)' : 'var(--red)', zero: true, aria: 'Curva de capital', xfmt: d => dLabel(dayKey(d.t)), tip: d => `<b>${pnlTxt(d.v)}</b><small>${new Date(d.t).toLocaleString('es-MX', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}</small>`}) : `<div class="ln-nochart">Sin operaciones en este periodo</div>`),
        seg('range', P.range, [['7', '7D'], ['30', '30D'], ['90', '90D'], ['all', 'Todo']]));
    }
    // posiciones abiertas
    h += card(`Posiciones abiertas${pos.length ? ` <em>${pos.length}</em>` : ''}`, pos.length ? pos.map(posCard).join('') : `<div class="ln-none">${svg(IC.target, 18)} Sin posiciones abiertas ahora.</div>`);
    if (M) {
      h += card('Rendimiento', `<div class="ln-grid4">${stat('Win rate', pct(M.wr, 0), M.wr >= .5 ? 'up' : 'dn', `${M.wins} G · ${M.losses} P`)}${stat('Profit factor', num2(M.pf), M.pf >= 1.5 ? 'up' : M.pf >= 1 ? 'mid' : 'dn', 'ganado / perdido')}${stat('Expectativa', pnlTxt(M.exp), tone(M.exp), (M.expR >= 0 ? '+' : '') + M.expR.toFixed(2) + 'R por operación')}${stat('Ratio G/P', num2(M.wl), M.wl >= 1 ? 'up' : 'mid', `${short(M.avgWin)} / ${short(M.avgLoss)}`)}</div>
        <div class="ln-wr"><i style="width:${(M.wr * 100).toFixed(1)}%"></i></div>`);
      h += card('Tu perfil', profileHtml());
    } else if (!loading && !D.err && D.at && !D.spot) h += card('', `<div class="ln-none">${svg(IC.info, 18)} No hay operaciones cerradas en los últimos ${DAYS} días.</div>`);
    return h;
  }
  function posCard(p) {
    const k = p.pair, r = posAi[k], side = p.side === 'short' ? 'Short' : 'Long', dist = fin(p.liq) && p.liq > 0 && fin(p.mark) ? Math.abs(p.mark - p.liq) / p.mark : NaN;
    return `<div class="ln-pos ${p.side}">
      <div class="ln-pos-t"><div class="ln-pos-s"><b>${esc(p.sym)}</b><span class="ln-side ${p.side}">${side}${fin(p.lev) ? ' ' + p.lev + 'x' : ''}</span></div><div class="ln-pos-p"><b class="${tone(p.upnl)}">${pnlTxt(p.upnl)}</b><small class="${tone(p.roe)}">${fin(p.roe) ? (p.roe >= 0 ? '+' : '') + (p.roe * 100).toFixed(1) + '%' : ''}</small></div></div>
      <div class="ln-pos-g"><div><span>Entrada</span><b>${px(p.entry)}</b></div><div><span>Precio</span><b>${px(p.mark)}</b></div><div><span>Tamaño</span><b>${short(p.notional)}</b></div><div><span>Liquidación</span><b class="${dist < .1 ? 'dn' : ''}">${px(p.liq)}${fin(dist) ? `<small>${(dist * 100).toFixed(1)}%</small>` : ''}</b></div></div>
      ${r ? `<div class="ln-verdict${r.busy ? ' busy' : ''}">${r.busy ? `<i class="ln-think"></i> ${esc(r.text || 'Analizando la posición con el mercado actual…')}` : md(r.text)}</div>` : ''}
      <div class="ln-pos-a"><button type="button" class="ln-mini" data-ln-chart="${esc(p.sym)}">${svg(IC.chart, 14)} Ver gráfico</button><button type="button" class="ln-mini acc" data-ln-pai="${esc(k)}"${r && r.busy ? ' disabled' : ''}>${svg(IC.coach, 14)} ${r && !r.busy ? 'Volver a analizar' : 'Analizar con IA'}</button></div></div>`;
  }
  function profileHtml() {
    const tpd = M.tpd, type = tpd >= 8 ? ['Scalper', 'Muchas operaciones cortas al día.'] : tpd >= 2.5 ? ['Day trader', 'Abres y cierras varias veces al día.'] : tpd >= .8 ? ['Intradía / swing', 'Unas pocas operaciones por día.'] : ['Swing / posición', 'Pocas operaciones, más tiempo en el mercado.'];
    const hr = M.hours.map((h, i) => [i, h.n]).sort((a, b) => b[1] - a[1])[0], bestS = Object.entries(M.sess).filter(([, v]) => v.n).sort((a, b) => b[1].pnl - a[1].pnl)[0];
    const bestP = M.pairs.slice().sort((a, b) => b.pnl - a.pnl)[0];
    return `<div class="ln-prof"><div class="ln-prof-h"><span>${svg(IC.brain, 20)}</span><div><b>${type[0]}</b><small>${type[1]}</small></div></div>
      <div class="ln-grid3">${stat('Ops. por día', tpd.toFixed(1))}${stat('Hora más activa', hr ? hr[0] + ':00' : '—')}${stat('Mejor sesión', bestS ? bestS[0] : '—', bestS && bestS[1].pnl > 0 ? 'up' : '')}${stat('Mejor par', bestP ? bestP.sym : '—', bestP && bestP.pnl > 0 ? 'up' : '')}${stat('Racha actual', M.curStreak > 0 ? M.curStreak + ' G' : M.curStreak < 0 ? -M.curStreak + ' P' : '—', M.curStreak > 0 ? 'up' : M.curStreak < 0 ? 'dn' : '')}${stat('Días verdes', `${M.greenDays}/${M.dayKeys.length}`)}</div></div>`;
  }

  /* ───── Trades ───── */
  function tabTrades() {
    if (!M) return noData();
    const keys = M.dayKeys.slice(-30), bars = keys.map(k => ({label: dLabel(k), v: M.days[k].pnl, k}));
    let h = card('P&L por día', slot('bars', bars, {h: 150, labels: true, maxLabels: 5, aria: 'Ganancia por día', tip: d => `<b class="${tone(d.v)}">${pnlTxt(d.v)}</b><small>${d.label} · ${M.days[d.k].n} ops · ${M.days[d.k].w} ganadas</small>`}), `<span class="ln-tag">últimos ${keys.length} días con operaciones</span>`);
    let list = M.T.slice().reverse();
    if (P.filter === 'long') list = list.filter(t => t.side === 'long'); else if (P.filter === 'short') list = list.filter(t => t.side === 'short'); else if (P.filter === 'win') list = list.filter(t => t.pnl > 0); else if (P.filter === 'loss') list = list.filter(t => t.pnl < 0);
    const shown = list.slice(0, 120);
    h += card(`Operaciones <em>${list.length}</em>`, `<div class="ln-chips2">${[['all', 'Todas'], ['long', 'Long'], ['short', 'Short'], ['win', 'Ganadas'], ['loss', 'Perdidas']].map(([v, t]) => `<button type="button" data-ln-filter="${v}" aria-pressed="${P.filter === v}">${t}</button>`).join('')}</div>
      <div class="ln-tl">${shown.length ? shown.map(t => { const r = t.pnl / M.R, d = new Date(t.ts), n = noteOf(t), k = tKey(t), open = noteSel === k, tg = hasNote(n) ? [...(n.tags || []), n.mood].filter(Boolean).slice(0, 2).join(' · ') || 'Nota' : ''; return `<button type="button" class="ln-tr${open ? ' open' : ''}" data-ln-note="${esc(k)}" aria-expanded="${open}" title="Anotar setup, emoción, errores y nota"><span class="ln-sbar ${t.side || 'na'}"></span><div class="ln-tr-m"><b>${esc(t.sym)}${t.side ? `<i class="ln-side ${t.side}">${t.side === 'long' ? 'L' : 'S'}</i>` : ''}${tg ? `<i class="ln-ntag">${esc(tg)}</i>` : ''}</b><small>${d.toLocaleDateString('es-MX', {day: 'numeric', month: 'short'})} · ${d.toLocaleTimeString('es-MX', {hour: '2-digit', minute: '2-digit'})}${fin(t.exit) ? ' · ' + px(t.exit) : ''}</small></div><div class="ln-tr-v"><b class="${tone(t.pnl)}">${pnlTxt(t.pnl)}</b><small class="${tone(r)}">${(r >= 0 ? '+' : '') + r.toFixed(2)}R</small></div></button>${open ? noteEditor(t) : ''}`; }).join('') : `<div class="ln-none">Sin operaciones con este filtro.</div>`}</div>
      ${list.length > shown.length ? `<p class="ln-note">Mostrando las ${shown.length} más recientes.</p>` : ''}
      <p class="ln-note">Toca una operación para anotar su setup, cómo te sentiste, tus errores y una nota.</p>
      <div class="ln-btn2"><button type="button" class="small-button ln-wide" data-ln="copy">${svg(IC.copy, 15)} Copiar resumen</button><button type="button" class="small-button ln-wide" data-ln="csv">${svg(IC.list, 15)} Exportar CSV</button></div>`);
    return h;
  }

  /* ───── Análisis ───── */
  function tabStats() {
    if (!M) return noData();
    const g = (v, good, ok) => v === Infinity || v >= good ? 'up' : v >= ok ? 'mid' : 'dn';
    let h = `<section class="ln-card ln-score"><div><span class="ln-k">Calidad del sistema</span><b>${M.score}<small>/100</small></b><p>${esc(M.gradeTxt)}. Combina profit factor, expectativa, Sharpe y días verdes.</p></div><div class="ln-gpill g${M.grade}">${M.grade}</div></section>`;
    h += card('Riesgo ajustado', `<div class="ln-grid4">${stat('Sharpe', num2(M.sharpe), g(M.sharpe, 1, 0), 'retorno / volatilidad')}${stat('Sortino', num2(M.sortino), g(M.sortino, 1.5, 0), 'solo castiga bajadas')}${stat('Calmar', num2(M.calmar), g(M.calmar, 2, .5), 'retorno / peor caída')}${stat('Profit factor', num2(M.pf), g(M.pf, 1.5, 1), 'ganado / perdido')}</div>`);
    h += card('Por operación', `<div class="ln-grid4">${stat('Expectativa', pnlTxt(M.exp), tone(M.exp), 'esperado')}${stat('En R', (M.expR >= 0 ? '+' : '') + M.expR.toFixed(2) + 'R', tone(M.expR), `1R = ${short(M.R)}`)}${stat('Mejor', pnlTxt(M.best), 'up')}${stat('Peor', pnlTxt(M.worst), 'dn')}</div>${M.fees ? `<p class="ln-note">Comisiones pagadas: <b>${money(M.fees)}</b> (${pct(M.fees / Math.max(1e-9, M.grossWin), 1)} de lo ganado).</p>` : ''}`);
    // R
    const bins = ['≤-3', '-2', '-1', '0', '+1', '+2', '≥3'], cnt = new Array(7).fill(0); for (const r of M.rs) cnt[Math.max(0, Math.min(6, Math.round(r) + 3))]++;
    h += card('Distribución en R', slot('bars', bins.map((b, i) => ({label: b + 'R', v: cnt[i], color: i < 3 ? 'var(--red)' : i === 3 ? 'var(--muted)' : 'var(--green)'})), {h: 140, labels: true, allLabels: true, yfmt: v => String(Math.round(v)), aria: 'Distribución de resultados en R', tip: d => `<b>${d.v} ${d.v === 1 ? 'operación' : 'operaciones'}</b><small>alrededor de ${d.label}</small>`}), `<span class="ln-tag">1R = tu pérdida media</span>`);
    // capital y caída: dos gráficos con el mismo eje de tiempo (sin doble eje)
    h += card('Capital y caídas', `<div class="ln-sub">Ganancia acumulada</div>${slot('line', M.curve, {h: 130, color: 'var(--accent)', zero: true, aria: 'Ganancia acumulada', tip: d => `<b>${pnlTxt(d.v)}</b><small>${new Date(d.t).toLocaleDateString('es-MX', {day: 'numeric', month: 'short'})}</small>`})}
      <div class="ln-sub">Caída desde el máximo</div>${slot('line', M.under, {h: 90, color: 'var(--red)', max: 0, down: true, aria: 'Caída desde el máximo', xfmt: d => dLabel(dayKey(d.t)), tip: d => `<b class="dn">${pnlTxt(d.v)}</b><small>${new Date(d.t).toLocaleDateString('es-MX', {day: 'numeric', month: 'short'})}</small>`})}
      <div class="ln-grid3">${stat('Caída máxima', shortS(M.maxDD), 'dn', M.ddAt ? dLabel(dayKey(M.ddAt)) : '')}${stat('En %', fin(M.maxDDpct) ? (M.maxDDpct * 100).toFixed(1) + '%' : '—', 'dn', 'desde el pico')}${stat('Recuperado', Math.round(M.recovered * 100) + '%', M.recovered >= 1 ? 'up' : M.recovered >= .5 ? 'mid' : 'dn')}</div>`);
    if (M.n >= 5) h += card('Win rate móvil', slot('line', M.rolling.map((v, i) => ({t: i, v: v * 100})), {h: 120, byIndex: true, min: 0, max: 100, ticks: [0, 50, 100], ref: 50, color: 'var(--accent)', yfmt: v => v + '%', area: false, aria: 'Win rate de las últimas 20 operaciones', tip: (d, i) => `<b>${d.v.toFixed(0)}%</b><small>operación #${i + 1} · últimas 20</small>`}), `<span class="ln-tag">últimas 20 ops.</span>`);
    // long vs short
    if (M.sideKnown) { const tot = M.long.n + M.short.n || 1, lp = M.long.n / tot * 100; h += card('Long vs Short', `<div class="ln-ls"><div><b class="up">Long</b><span>${M.long.n} ops · WR ${pct(M.long.wr, 0)}</span><b class="${tone(M.long.pnl)}">${pnlTxt(M.long.pnl)}</b></div><div><b class="dn">Short</b><span>${M.short.n} ops · WR ${pct(M.short.wr, 0)}</span><b class="${tone(M.short.pnl)}">${pnlTxt(M.short.pnl)}</b></div></div><div class="ln-split"><i style="width:${lp.toFixed(1)}%"></i><i style="width:${(100 - lp).toFixed(1)}%"></i></div>`); }
    // sesiones
    const ses = Object.entries(M.sess), sm = Math.max(1e-9, ...ses.map(([, v]) => Math.abs(v.pnl)));
    h += card('Por sesión', `<div class="ln-rows">${ses.map(([k, v]) => hbar(k, v, sm)).join('')}</div>`, `<span class="ln-tag">hora UTC</span>`);
    // días de la semana
    const dm = Math.max(1e-9, ...M.dow.map(v => Math.abs(v.pnl)));
    h += card('Por día de la semana', `<div class="ln-dow">${[1, 2, 3, 4, 5, 6, 0].map(i => { const v = M.dow[i], a = v.n ? Math.abs(v.pnl) / dm : 0; return `<div class="ln-dc ${v.n ? tone(v.pnl) : ''}" style="--a:${(0.08 + a * .5).toFixed(2)}" title="${DOW[i]}: ${v.n} ops, ${pnlTxt(v.pnl)}"><span>${DOW[i]}</span><b>${v.n ? cmp(v.pnl) : '—'}</b><small>${v.n} ops</small></div>`; }).join('')}</div>`);
    // horas
    const hm = Math.max(1, ...M.hours.map(v => v.n));
    h += card('Mapa por hora', `<div class="ln-heat">${M.hours.map((v, i) => `<div class="ln-hc ${v.n ? tone(v.pnl) : ''}" style="--a:${v.n ? (0.12 + v.n / hm * .6).toFixed(2) : 0}" title="${i}:00 · ${v.n} ops · ${pnlTxt(v.pnl)}"><span>${v.n || ''}</span></div>`).join('')}</div><div class="ln-heat-x"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div><p class="ln-note">Intensidad = cantidad de operaciones · color = resultado neto. Hora local.</p>`);
    // diario: setups, emociones y errores anotados
    { const J = journalStats(), mxOf = a => Math.max(1e-9, ...a.map(v => Math.abs(v.pnl))), rows = a => { const mx = mxOf(a); return `<div class="ln-rows">${a.slice(0, 8).map(v => hbar(v.k, v, mx)).join('')}</div>`; };
      if (J.tags.length || J.errs.length || J.moods.length) h += card('Tu diario', (J.tags.length ? `<div class="ln-sub">Por setup</div>${rows(J.tags)}` : '') + (J.errs.length ? `<div class="ln-sub">Errores más caros</div>${rows(J.errs)}` : '') + (J.moods.length ? `<div class="ln-sub">Por emoción</div>${rows(J.moods)}` : ''), `<span class="ln-tag">de tus notas</span>`);
      else h += card('Tu diario', `<div class="ln-none">${svg(IC.info, 18)} Anota tus operaciones en <b>Trades</b> (setup, emoción, errores) y aquí verás cuáles te dan dinero y cuáles te cuestan.</div>`); }
    // pares
    const pr = M.pairs.slice(), sorted = P.pairs === 'n' ? pr.sort((a, b) => b.n - a.n) : P.pairs === 'worst' ? pr.sort((a, b) => a.pnl - b.pnl) : pr.sort((a, b) => b.pnl - a.pnl), pm = Math.max(1e-9, ...pr.map(p => P.pairs === 'n' ? p.n : Math.abs(p.pnl)));
    h += card('Pares', `<div class="ln-rows">${sorted.slice(0, 8).map(p => `<div class="ln-row"><b>${esc(p.sym)}</b><div class="ln-hb"><i class="${P.pairs === 'n' ? 'acc' : tone(p.pnl)}" style="width:${((P.pairs === 'n' ? p.n : Math.abs(p.pnl)) / pm * 100).toFixed(1)}%"></i></div><span class="ln-rv"><b class="${tone(p.pnl)}">${shortS(p.pnl)}</b><small>${p.n} ops · ${pct(p.wr, 0)}</small></span></div>`).join('')}</div>`, seg('pairs', P.pairs, [['pnl', 'Mejores'], ['worst', 'Peores'], ['n', 'Más operados']]));
    return h;
  }
  const hbar = (name, v, mx) => `<div class="ln-row"><b>${esc(name)}</b><div class="ln-hb"><i class="${tone(v.pnl)}" style="width:${(Math.abs(v.pnl) / mx * 100).toFixed(1)}%"></i></div><span class="ln-rv"><b class="${tone(v.pnl)}">${v.n ? shortS(v.pnl) : '—'}</b><small>${v.n} ops${v.n ? ' · ' + pct(v.wr, 0) : ''}</small></span></div>`;

  /* ───── Calendario ───── */
  function tabCal() {
    if (!M) return noData();
    const first = new Date(calY, calM, 1).getDay(), nd = new Date(calY, calM + 1, 0).getDate(), pre = `${calY}-${String(calM + 1).padStart(2, '0')}`, today = dayKey(Date.now());
    const mk = Object.keys(M.days).filter(k => k.startsWith(pre)), mx = Math.max(1e-9, ...mk.map(k => Math.abs(M.days[k].pnl)));
    let cells = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<div class="ln-cdw">${d}</div>`).join('');
    for (let i = 0; i < (first + 6) % 7; i++) cells += '<div></div>';
    for (let d = 1; d <= nd; d++) { const k = `${pre}-${String(d).padStart(2, '0')}`, v = M.days[k]; cells += `<button type="button" class="ln-cd${v ? ' has ' + tone(v.pnl) : ''}${k === today ? ' today' : ''}${k === calSel ? ' sel' : ''}" ${v ? `data-ln-day="${k}" style="--a:${(0.14 + Math.abs(v.pnl) / mx * .5).toFixed(2)}"` : 'disabled'}><span>${d}</span>${v ? `<b>${cmp(v.pnl)}</b>` : ''}</button>`; }
    const tr = mk.flatMap(k => M.days[k].trades), tot = tr.reduce((a, t) => a + t.pnl, 0), w = tr.filter(t => t.pnl > 0).length, bestD = mk.sort((a, b) => M.days[b].pnl - M.days[a].pnl)[0];
    let h = card(`${MONTHS[calM]} ${calY}`, `<div class="ln-cal">${cells}</div>`, `<div class="ln-nav"><button type="button" class="ln-ib sm" data-ln="cal-prev" aria-label="Mes anterior">${svg(IC.left, 16)}</button><button type="button" class="ln-ib sm" data-ln="cal-next" aria-label="Mes siguiente">${svg(IC.right, 16)}</button></div>`);
    h += card('Resumen del mes', tr.length ? `<div class="ln-grid4">${stat('P&L', pnlTxt(tot), tone(tot))}${stat('Win rate', pct(w / tr.length, 0), w / tr.length >= .5 ? 'up' : 'dn', `${w} G · ${tr.length - w} P`)}${stat('Operaciones', tr.length)}${stat('Mejor día', bestD ? dLabel(bestD) : '—', '', bestD ? pnlTxt(M.days[bestD].pnl) : '')}</div>` : `<div class="ln-none">Sin operaciones este mes.</div>`);
    if (calSel && M.days[calSel]) { const v = M.days[calSel]; h += card(`${dLabel(calSel)} <em class="${tone(v.pnl)}">${pnlTxt(v.pnl)}</em>`, `<div class="ln-tl">${v.trades.slice().reverse().map(t => `<div class="ln-tr"><span class="ln-sbar ${t.side || 'na'}"></span><div class="ln-tr-m"><b>${esc(t.sym)}${t.side ? `<i class="ln-side ${t.side}">${t.side === 'long' ? 'L' : 'S'}</i>` : ''}</b><small>${new Date(t.ts).toLocaleTimeString('es-MX', {hour: '2-digit', minute: '2-digit'})}</small></div><div class="ln-tr-v"><b class="${tone(t.pnl)}">${pnlTxt(t.pnl)}</b></div></div>`).join('')}</div>`); }
    return h;
  }
  const noData = () => card('', `<div class="ln-none">${svg(IC.info, 18)} ${loading ? 'Leyendo tu historial del exchange…' : D.spot ? 'En Spot no hay historial de ganancias realizadas.' : `Aún no hay operaciones cerradas en los últimos ${DAYS} días.`}</div>`);

  /* ═════════ Coach IA ═════════ */
  const ACTIONS = [['full', 'Análisis completo', IC.brain], ['conducta', 'Mi conducta', IC.flame], ['edge', 'Mi ventaja', IC.target], ['riesgo', 'Riesgo y tamaño', IC.shield], ['plan', 'Plan de mejora', IC.bolt], ['pos', 'Mis posiciones', IC.chart]];
  function engine() { try { const L = LLM(), o = L && L.ownLoad && L.ownLoad(); return o && o.on && L.OWN && L.OWN[o.provider] ? 'Tu IA · ' + L.OWN[o.provider].name : 'IA gratis de VORTEX'; } catch { return 'IA de VORTEX'; } }
  function tabCoach() {
    let h = `<section class="ln-coach"><div class="ln-coach-h"><div class="ln-orb sm${ai.busy ? ' busy' : ''}">${svg(IC.coach, 20, 1.6)}</div><div><b>Coach Nova</b><small>${esc(engine())} · conoce tus ${M ? M.n : 0} operaciones${positions().length ? ' y tus posiciones' : ''}</small></div></div>
      <div class="ln-acts">${ACTIONS.map(([k, n, i]) => `<button type="button" data-ln-ai="${k}"${ai.busy ? ' disabled' : ''} class="${ai.kind === k ? 'on' : ''}">${svg(i, 15)}<span>${n}</span></button>`).join('')}</div>
      <div class="ln-out${ai.busy ? ' busy' : ''}${ai.text || ai.err ? '' : ' idle'}" aria-live="polite">${ai.err ? `<p class="dn">${esc(ai.err)}</p>` : ai.text ? md(ai.text) : ai.busy ? `<p class="ln-muted"><i class="ln-think"></i> ${esc(ai.note || 'Analizando tus datos…')}</p>` : `<p class="ln-muted">Elige un análisis. El coach estudia tu historial, tu conducta, tus reglas de trading y lo que pasa ahora en el mercado con tus posiciones, y te dice qué mejorar con números.</p>`}</div>
      ${ai.busy ? `<button type="button" class="ln-mini" data-ln="ai-stop">Detener</button>` : ai.text && !ai.err ? `<div class="ln-out-a"><span>${esc(ai.model || '')}</span><button type="button" class="ln-mini" data-ln="ai-copy">${svg(IC.copy, 13)} Copiar</button></div>` : ''}</section>`;
    // chat
    h += card('Pregúntale al coach', `<div class="ln-chat">${chat.length ? chat.map(m => `<div class="ln-msg ${m.role === 'user' ? 'me' : 'ai'}">${m.role === 'user' ? esc(m.content) : m.pending ? `<i class="ln-think"></i> Pensando…` : md(m.content)}</div>`).join('') : `<div class="ln-sugs">${['¿Por qué pierdo más los viernes?', '¿Qué par debería dejar de operar?', '¿Cuánto debería arriesgar por operación?', '¿Mi short es mejor que mi long?'].map(q => `<button type="button" data-ln-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`}</div>
      <form class="ln-ask" data-ln-form><input type="text" placeholder="Escribe tu pregunta sobre tus trades…" autocomplete="off" maxlength="600"${ai.busy ? ' disabled' : ''}><button type="submit" class="ln-send" aria-label="Enviar"${ai.busy ? ' disabled' : ''}>${svg(IC.send, 17)}</button></form>
      ${chat.length ? `<button type="button" class="ln-link" data-ln="chat-clear">Borrar conversación</button>` : ''}`);
    if (M) { h += card('Patrones detectados', insights().map(c => `<div class="ln-ins ${c.t}"><span>${svg(c.t === 'warn' ? IC.warn : c.t === 'good' ? IC.ok : IC.info, 16)}</span><div><b>${esc(c.title)}</b><small>${esc(c.d)}</small></div></div>`).join(''), `<span class="ln-tag">estadístico · al instante</span>`); h += card('Después de perder', revengeHtml()); }
    return h;
  }
  function insights() {
    const c = [], rv = M.rev;
    if (rv.nL >= 3) { if (rv.afterLoss < rv.afterWin - Math.abs(M.exp) * .3) c.push({t: 'warn', title: 'Operas peor después de perder', d: `Tras una pérdida tu siguiente operación promedia ${pnlTxt(rv.afterLoss)}; tras ganar, ${pnlTxt(rv.afterWin)}.`}); else c.push({t: 'good', title: 'Buena disciplina tras perder', d: 'Tu resultado se mantiene estable después de una pérdida.'}); }
    if (M.quick.n >= 3 && M.quick.pnl < 0) c.push({t: 'warn', title: 'Entradas rápidas de revancha', d: `${M.quick.n} veces volviste a operar menos de 30 min después de perder; en total ${pnlTxt(M.quick.pnl)}.`});
    if (rv.hasSize && rv.sizeL > 0 && rv.size > 0 && rv.sizeL / rv.size > 1.2) c.push({t: 'warn', title: 'Subes el tamaño tras perder', d: `Tus posiciones tras una pérdida son ${Math.round((rv.sizeL / rv.size - 1) * 100)}% más grandes que tu promedio.`});
    if (M.maxDay > M.tpd * 2.5 && M.tpd > 0) c.push({t: 'note', title: 'Días de sobreoperación', d: `Tu día más activo tuvo ${M.maxDay} operaciones; tu promedio es ${M.tpd.toFixed(1)} por día.`});
    if (M.maxLossStreak >= 4) c.push({t: 'note', title: `Racha de ${M.maxLossStreak} pérdidas seguidas`, d: 'Define una regla: tras 3 pérdidas seguidas, pausa el resto del día.'});
    if (M.sideKnown >= 8) { const lp = M.long.n / M.sideKnown; if (lp > .75 || lp < .25) c.push({t: 'note', title: `Sesgo ${lp > .75 ? 'long' : 'short'} fuerte`, d: `El ${Math.round(Math.max(lp, 1 - lp) * 100)}% de tus operaciones son ${lp > .75 ? 'long' : 'short'}.`}); if (M.long.n >= 5 && M.short.n >= 5 && Math.sign(M.long.pnl) !== Math.sign(M.short.pnl)) { const bad = M.long.pnl < 0 ? 'long' : 'short'; c.push({t: 'warn', title: `Tus ${bad} pierden dinero`, d: `Long ${pnlTxt(M.long.pnl)} · Short ${pnlTxt(M.short.pnl)}. Revisa tus entradas ${bad}.`}); } }
    const ses = Object.entries(M.sess).filter(([, v]) => v.n >= 3).sort((a, b) => b[1].pnl - a[1].pnl); if (ses.length) { if (ses[0][1].pnl > 0) c.push({t: 'good', title: `Tu mejor sesión: ${ses[0][0]}`, d: `${pnlTxt(ses[0][1].pnl)} en ${ses[0][1].n} operaciones.`}); const w = ses[ses.length - 1]; if (ses.length > 1 && w[1].pnl < 0) c.push({t: 'warn', title: `Pierdes en ${w[0]}`, d: `${pnlTxt(w[1].pnl)} en ${w[1].n} operaciones. Considera no operar en ese horario.`}); }
    const wp = M.pairs.filter(p => p.n >= 3).sort((a, b) => a.pnl - b.pnl)[0]; if (wp && wp.pnl < 0 && wp.pnl < -Math.abs(M.total) * .3) c.push({t: 'warn', title: `${wp.sym} te cuesta dinero`, d: `${pnlTxt(wp.pnl)} en ${wp.n} operaciones (WR ${pct(wp.wr, 0)}).`});
    if (M.expR > .1) c.push({t: 'good', title: 'Tienes ventaja estadística', d: `+${M.expR.toFixed(2)}R por operación. Con un tamaño constante, el sistema crece.`}); else if (M.expR < -.05) c.push({t: 'warn', title: 'Expectativa negativa', d: `Pierdes ${Math.abs(M.expR).toFixed(2)}R por operación en promedio. Ajusta entradas o salidas antes de subir el tamaño.`});
    if (M.wr > .55 && M.wl < .8) c.push({t: 'note', title: 'Ganas seguido pero poco', d: `Win rate ${pct(M.wr, 0)} pero tus ganancias son ${M.wl.toFixed(2)}× tus pérdidas: deja correr más las ganadoras.`});
    if (!c.length) c.push({t: 'note', title: 'Sin patrones marcados', d: 'Con los datos actuales no hay sesgos claros.'});
    return c;
  }
  function revengeHtml() {
    const rv = M.rev; if (!rv.nL || !rv.nW) return `<div class="ln-none">Aún no hay datos suficientes.</div>`;
    const mx = Math.max(1e-9, Math.abs(rv.afterLoss), Math.abs(rv.afterWin));
    return `<div class="ln-rows">${[['Tras ganar', rv.afterWin, rv.nW], ['Tras perder', rv.afterLoss, rv.nL]].map(([n, v, k]) => `<div class="ln-row"><b>${n}</b><div class="ln-hb"><i class="${tone(v)}" style="width:${(Math.abs(v) / mx * 100).toFixed(1)}%"></i></div><span class="ln-rv"><b class="${tone(v)}">${pnlTxt(v)}</b><small>${k} ops</small></span></div>`).join('')}</div><p class="ln-note">Resultado promedio de la operación siguiente.</p>`;
  }

  /* Contexto de mercado de cada posición: tendencia (EMA 20/50), ATR, máximos/mínimos recientes, cambio 24 h */
  async function marketOf(sym) {
    try {
      const H = root.CCT_host; if (!H || !H.klines) return null; const cs = (await Promise.race([H.klines(sym + 'USDT', '1h'), new Promise(r => setTimeout(() => r(null), 8000))])) || []; // sin respuesta en 8 s: se analiza sin contexto de mercado if (cs.length < 60) return null;
      const C = cs.map(c => +c.c), ema = (n) => { const k = 2 / (n + 1); let e = C[0]; for (const v of C) e = v * k + e * (1 - k); return e; };
      let atr = 0; for (let i = cs.length - 14; i < cs.length; i++) atr += Math.max(cs[i].h - cs[i].l, Math.abs(cs[i].h - cs[i - 1].c), Math.abs(cs[i].l - cs[i - 1].c)); atr /= 14;
      const last = C[C.length - 1], r50 = cs.slice(-50), e20 = ema(20), e50 = ema(50), e200 = cs.length >= 200 ? ema(200) : NaN;
      let g = 0, l = 0; for (let i = C.length - 14; i < C.length; i++) { const d = C[i] - C[i - 1]; if (d > 0) g += d; else l -= d; } const rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
      return {last, e20, e50, e200, atr, rsi, hi: Math.max(...r50.map(c => c.h)), lo: Math.min(...r50.map(c => c.l)), ch24: C.length > 24 ? last / C[C.length - 25] - 1 : NaN};
    } catch { return null; }
  }
  const mkTxt = (p, m) => !m ? '' : `  Mercado 1h: precio ${px(m.last)} · EMA20 ${px(m.e20)} · EMA50 ${px(m.e50)}${fin(m.e200) ? ' · EMA200 ' + px(m.e200) : ''} → ${m.last > m.e20 && m.e20 > m.e50 ? 'tendencia alcista' : m.last < m.e20 && m.e20 < m.e50 ? 'tendencia bajista' : 'lateral/mixta'} · RSI14 ${m.rsi.toFixed(0)} · ATR14 ${px(m.atr)} (${(m.atr / m.last * 100).toFixed(2)}%) · máx 50 velas ${px(m.hi)} · mín ${px(m.lo)} · 24h ${fin(m.ch24) ? (m.ch24 * 100).toFixed(2) + '%' : '—'}`;
  function rulesTxt() { try { const c = root.CCT_pixel && root.CCT_pixel.cfg && root.CCT_pixel.cfg(); if (!c) return ''; return `\nCÓMO OPERA EL TRADER (de su configuración en VORTEX): estilo ${c.estilo}, riesgo ${c.riesgo}${c.tfs && c.tfs.length ? ', temporalidades ' + c.tfs.join('/') : ''}.${c.reglas ? '\nSus reglas: ' + c.reglas.slice(0, 900) : ''}${c.notas ? '\nSus notas: ' + c.notas.slice(0, 500) : ''}`; } catch { return ''; } }
  async function context(withMarket) {
    const NL = '\n', s = snap() || {}, pos = positions(), info = exInfo();
    let t = `EXCHANGE: ${info ? info.name : '—'} (${info && info.market === 'spot' ? 'spot' : 'futuros perpetuos'})${demo ? ' — CUENTA DE EJEMPLO' : ''}${NL}EQUITY: ${money(s.equity)} · disponible ${money(s.free)}${NL}`;
    if (M) {
      t += `HISTORIAL (${M.span} días, ${M.n} operaciones cerradas):${NL}- P&L total ${pnlTxt(M.total)} · win rate ${pct(M.wr)} (${M.wins}G/${M.losses}P) · profit factor ${num2(M.pf)}${NL}- Expectativa ${pnlTxt(M.exp)}/op (${M.expR.toFixed(2)}R; 1R=${money(M.R)}) · ganancia media ${money(M.avgWin)} · pérdida media ${money(M.avgLoss)} · ratio G/P ${num2(M.wl)}${NL}- Mejor ${pnlTxt(M.best)} · peor ${pnlTxt(M.worst)} · comisiones ${money(M.fees)}${NL}- Sharpe ${num2(M.sharpe)} · Sortino ${num2(M.sortino)} · Calmar ${num2(M.calmar)} · caída máx ${pnlTxt(M.maxDD)}${fin(M.maxDDpct) ? ' (' + (M.maxDDpct * 100).toFixed(1) + '%)' : ''} · recuperado ${Math.round(M.recovered * 100)}%${NL}- Nota del sistema ${M.score}/100 (${M.grade})${NL}`;
      t += `- Rachas: máx ${M.maxWinStreak} ganadas, máx ${M.maxLossStreak} perdidas, actual ${M.curStreak > 0 ? M.curStreak + ' ganadas' : -M.curStreak + ' perdidas'} · días verdes ${M.greenDays}/${M.dayKeys.length}${NL}`;
      t += `- Long: ${M.long.n} ops, ${pnlTxt(M.long.pnl)}, WR ${pct(M.long.wr, 0)} · Short: ${M.short.n} ops, ${pnlTxt(M.short.pnl)}, WR ${pct(M.short.wr, 0)}${M.sideKnown < M.n ? ` (lado desconocido en ${M.n - M.sideKnown})` : ''}${NL}`;
      t += `- Sesiones UTC: ${Object.entries(M.sess).map(([k, v]) => `${k} ${v.n} ops ${pnlTxt(v.pnl)}`).join(' · ')}${NL}`;
      t += `- Días: ${M.dow.map((v, i) => `${DOW[i]} ${v.n}/${shortS(v.pnl)}`).join(' · ')}${NL}`;
      t += `- Pares: ${M.pairs.slice().sort((a, b) => b.n - a.n).slice(0, 10).map(p => `${p.sym} ${p.n} ops ${pnlTxt(p.pnl)} WR ${pct(p.wr, 0)}`).join(' · ')}${NL}`;
      t += `- Conducta: ${M.tpd.toFixed(1)} ops/día (máx ${M.maxDay}) · siguiente op. tras perder ${pnlTxt(M.rev.afterLoss)} vs tras ganar ${pnlTxt(M.rev.afterWin)} · reentradas <30 min tras perder: ${M.quick.n} (${pnlTxt(M.quick.pnl)})${M.rev.hasSize && M.rev.size ? ` · tamaño tras perder ${Math.round((M.rev.sizeL / M.rev.size) * 100)}% del promedio` : ''}${NL}`;
      t += `ÚLTIMAS 20 OPERACIONES:${NL}${M.T.slice(-20).reverse().map(x => `- ${new Date(x.ts).toLocaleString('es-MX', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})} ${x.sym} ${x.side ? x.side.toUpperCase() : '?'} ${pnlTxt(x.pnl)}${fin(x.exit) ? ' @' + px(x.exit) : ''}`).join(NL)}${NL}`;
      { const J = journalStats(), f = a => a.slice(0, 6).map(v => `${v.k} ${v.n} ops ${pnlTxt(v.pnl)} WR ${pct(v.wr, 0)}`).join(' · ');
        if (J.tags.length || J.errs.length || J.moods.length) t += `DIARIO DEL TRADER (sus notas):${NL}${J.tags.length ? `- Setups: ${f(J.tags)}${NL}` : ''}${J.errs.length ? `- Errores: ${f(J.errs)}${NL}` : ''}${J.moods.length ? `- Emociones: ${f(J.moods)}${NL}` : ''}`;
        const ns = M.T.slice(-40).reverse().map(x => [x, noteOf(x)]).filter(([, n]) => n && (n.note || '').trim()).slice(0, 6);
        if (ns.length) t += `NOTAS RECIENTES:${NL}${ns.map(([x, n]) => `- ${x.sym} ${pnlTxt(x.pnl)}: ${String(n.note).replace(/\s+/g, ' ').slice(0, 160)}`).join(NL)}${NL}`; }
    } else t += `Sin operaciones cerradas en el historial.${NL}`;
    if (pos.length) {
      t += `POSICIONES ABIERTAS:${NL}`;
      for (const p of pos) { const m = withMarket ? await marketOf(p.sym) : null; t += `- ${p.sym} ${p.side.toUpperCase()}${fin(p.lev) ? ' ' + p.lev + 'x' : ''} · entrada ${px(p.entry)} · precio ${px(p.mark)} · tamaño ${money(p.notional)} · P&L ${pnlTxt(p.upnl)}${fin(p.roe) ? ' (' + (p.roe * 100).toFixed(1) + '% del margen)' : ''} · liquidación ${px(p.liq)}${NL}${mkTxt(p, m)}${m ? NL : ''}`; }
    } else t += `Sin posiciones abiertas.${NL}`;
    return t + rulesTxt();
  }
  const SYS = `Eres «Nova», el coach de trading de Nexus Lens dentro de VORTEX. Analizas la cuenta REAL del trader (futuros cripto) con sus números.
Reglas:
- Español de México, directo y claro, sin rodeos ni relleno. Tutea al trader.
- Usa SOLO los datos que te doy; cita números concretos (win rate, R, P&L, pares, sesiones). Si un dato no está, dilo, no lo inventes.
- Mezcla análisis cuantitativo y psicología del trading. Da acciones concretas y medibles (reglas tipo «máximo 3 operaciones al día», «stop en X», «riesgo 1 % = $Y»).
- Formato: títulos cortos con «### », viñetas con «- », negritas con **texto**. Sin tablas, sin emojis.
- Si hay posiciones abiertas y piden opinión, da niveles: invalidación/stop, objetivo y qué haría (mantener, reducir, cerrar), basado en el contexto de mercado (EMA, ATR, máximos/mínimos). Recuerda que la decisión final es del trader.
- No prometas ganancias. No recomiendes subir apalancamiento si la expectativa es negativa.`;
  const ASK = {
    full: 'Haz un diagnóstico completo de mi trading: ### Lo que haces bien, ### Lo que te está costando dinero, ### 3 acciones para esta semana (medibles). Sé honesto.',
    conducta: 'Analiza mi conducta: revancha, sobreoperación, tamaño tras perder, horarios en que me descontrolo, rachas. Dame un diagnóstico psicológico breve y reglas concretas para corregirlo.',
    edge: '¿Tengo ventaja real o opero al azar? Dime en qué pares, lados (long/short), sesiones y días está mi ventaja y qué debería dejar de operar. Usa los números.',
    riesgo: 'Evalúa mi gestión de riesgo: caída máxima, rachas, Sharpe, tamaño de las posiciones y apalancamiento. Dime cuánto arriesgar por operación (en % y en dólares según mi equity), cuántas operaciones máximo al día y cuándo parar.',
    plan: 'Hazme un plan de mejora de 7 días con reglas claras: qué operar, cuándo, cuánto arriesgar, cuándo parar y qué medir al final de la semana para saber si mejoré.',
    pos: 'Analiza cada posición abierta con el contexto de mercado: ¿la entrada tiene sentido con mi historial y la tendencia?, ¿qué hago ahora (mantener, reducir, cerrar)?, ¿dónde va el stop de invalidación y el objetivo realista (usa el ATR y los máximos/mínimos)?, riesgo principal. Si no hay posiciones, dímelo en una línea y dame qué vigilar antes de la próxima entrada.'
  };
  async function runAI(kind) {
    const L = LLM(); if (!L || !L.chat) { toast('La IA de VORTEX aún está cargando'); return; }
    if (ai.busy) return; ai = {busy: true, kind, text: '', model: '', err: '', note: kind === 'pos' ? 'Revisando el mercado de tus posiciones…' : 'Analizando tus datos…'}; paint();
    aiCtl = new AbortController();
    try {
      const ctx = await context(kind === 'pos' || kind === 'full');
      const r = await L.chat([{role: 'system', content: SYS}, {role: 'user', content: `MIS DATOS:\n${ctx}\n\nPETICIÓN: ${ASK[kind]}`}], {maxTokens: 1100, timeout: 90000, signal: aiCtl.signal, onToken: t => { ai.text = t; ai.note = ''; paintOut(); }, onProgress: p => { if (!ai.text) { ai.note = p && p.text || ai.note; paintOut(); } }});
      ai.text = String(r && r.text || ai.text || '').trim(); ai.model = r && r.model ? String(r.model) : engine(); if (!ai.text) ai.err = 'La IA no devolvió respuesta. Intenta de nuevo.';
    } catch (e) { if (!(aiCtl && aiCtl.signal.aborted)) ai.err = 'No se pudo completar el análisis: ' + String(e && e.message || e).slice(0, 160); }
    finally { ai.busy = false; aiCtl = null; if (P.tab === 'coach') paint(); }
  }
  async function askChat(q) {
    q = String(q || '').trim(); const L = LLM(); if (!q || ai.busy || !L) return;
    chat.push({role: 'user', content: q}); const pend = {role: 'assistant', content: '', pending: true}; chat.push(pend); ai.busy = true; paint(); scrollChat();
    try {
      const ctx = await context(/posici|stop|cerrar|mantener|entrada|ahora/i.test(q));
      const hist = chat.filter(m => m !== pend).slice(-9, -1).map(m => ({role: m.role === 'user' ? 'user' : 'assistant', content: m.content}));
      const r = await L.chat([{role: 'system', content: SYS + '\nResponde conversacional y breve (máximo 3 párrafos o 6 viñetas).\n\nDATOS ACTUALES DEL TRADER:\n' + ctx}].concat(hist, [{role: 'user', content: q}]), {maxTokens: 700, timeout: 80000, onToken: t => { pend.content = t; pend.pending = false; paintChat(); }});
      pend.content = String(r && r.text || pend.content || '').trim() || 'No obtuve respuesta, intenta de nuevo.';
    } catch (e) { pend.content = 'No pude responder ahora: ' + String(e && e.message || e).slice(0, 140); }
    finally { pend.pending = false; ai.busy = false; if (chat.length > 16) chat = chat.slice(-16); if (P.tab === 'coach') { paint(); scrollChat(); } }
  }
  async function analyzePos(key) {
    const p = positions().find(x => x.pair === key), L = LLM(); if (!p || !L) return;
    posAi[key] = {busy: true, text: ''}; paint();
    try {
      const m = await marketOf(p.sym), ctx = await context(false);
      const q = `POSICIÓN A ANALIZAR: ${p.sym} ${p.side.toUpperCase()}${fin(p.lev) ? ' ' + p.lev + 'x' : ''} · entrada ${px(p.entry)} · precio ${px(p.mark)} · P&L ${pnlTxt(p.upnl)} · liquidación ${px(p.liq)}\n${mkTxt(p, m) || 'Sin datos de mercado.'}\n\nResponde SOLO sobre esta posición en 4 viñetas cortas: **Lectura** (¿la entrada va con la tendencia y con mi historial en este par?), **Qué haría** (mantener / reducir / cerrar), **Stop de invalidación** (precio) y **Objetivo** (precio), y **Riesgo principal**.`;
      const r = await L.chat([{role: 'system', content: SYS}, {role: 'user', content: `MIS DATOS:\n${ctx}\n\n${q}`}], {maxTokens: 420, timeout: 70000, onToken: t => { posAi[key] = {busy: true, text: t}; paintPos(key); }});
      posAi[key] = {busy: false, text: String(r && r.text || '').trim() || 'Sin respuesta.'};
    } catch (e) { posAi[key] = {busy: false, text: 'No se pudo analizar: ' + String(e && e.message || e).slice(0, 120)}; }
    paint();
  }
  /* Markdown mínimo y seguro (títulos, viñetas, listas numeradas, negritas, código) */
  function md(t) {
    const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,;:]|$)/g, '$1<i>$2</i>');
    const out = []; let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of String(t || '').replace(/\r/g, '').split('\n')) {
      const l = raw.trim(); if (!l) { close(); continue; }
      let m;
      if ((m = l.match(/^#{1,6}\s*(.+)$/))) { close(); out.push(`<h4>${inl(m[1].replace(/[:：]$/, ''))}</h4>`); }
      else if ((m = l.match(/^[-*•]\s+(.+)$/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inl(m[1])}</li>`); }
      else if ((m = l.match(/^\d+[.)]\s+(.+)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inl(m[1])}</li>`); }
      else if (/^[-_*]{3,}$/.test(l)) { close(); }
      else { close(); out.push(`<p>${inl(l)}</p>`); }
    }
    close(); return out.join('');
  }

  /* ═════════ Pintar / eventos ═════════ */
  function visible() { return !!(host && host.offsetParent !== null); }
  function paint() {
    if (!host) return; const sc = host.closest('.view') || host, top = sc.scrollTop;
    charts = []; host.innerHTML = shell(); mountCharts(); sc.scrollTop = top; lastW = host.clientWidth;
    const tb = host.querySelector('.ln-tabs'), on = tb && tb.querySelector('[aria-selected=true]'); if (tb && on && tb.scrollWidth > tb.clientWidth) tb.scrollLeft = Math.max(0, on.offsetLeft - (tb.clientWidth - on.offsetWidth) / 2);
    const inp = host.querySelector('[data-ln-form] input'); if (inp && pendingInput) { inp.value = pendingInput; pendingInput = ''; }
  }
  let pendingInput = '';
  function paintBusy() { if (!host) return; const b = host.querySelector('[data-ln="sync"]'); if (b) b.classList.toggle('spin', loading); else paint(); }
  function paintOut() { const o = host && host.querySelector('.ln-out'); if (!o) return; o.classList.toggle('idle', false); o.innerHTML = ai.text ? md(ai.text) : `<p class="ln-muted"><i class="ln-think"></i> ${esc(ai.note || 'Analizando…')}</p>`; }
  function paintChat() { const c = host && host.querySelector('.ln-chat'); if (!c) return; c.innerHTML = chat.map(m => `<div class="ln-msg ${m.role === 'user' ? 'me' : 'ai'}">${m.role === 'user' ? esc(m.content) : m.pending ? `<i class="ln-think"></i> Pensando…` : md(m.content)}</div>`).join(''); scrollChat(); }
  function scrollChat() { const c = host && host.querySelector('.ln-chat'); if (c) c.scrollTop = c.scrollHeight; }
  function paintPos(key) { const r = posAi[key], b = host && [...host.querySelectorAll('[data-ln-pai]')].find(x => x.dataset.lnPai === key); if (!b) return; const card = b.closest('.ln-pos'); let v = card.querySelector('.ln-verdict'); if (!v) { v = doc.createElement('div'); v.className = 'ln-verdict'; card.insertBefore(v, card.querySelector('.ln-pos-a')); } v.classList.toggle('busy', false); v.innerHTML = md(r.text); }

  function onClick(e) {
    const t = e.target, b = t.closest('button'); if (!b || !host.contains(b)) return;
    if (b.dataset.lnNote) { noteSel = noteSel === b.dataset.lnNote ? '' : b.dataset.lnNote; return paint(); }
    if (b.dataset.lnNk) { const {lnNk: kind, lnNv: v, lnNid: k} = b.dataset; noteSet(k, n => { if (kind === 'mood') n.mood = n.mood === v ? '' : v; else { const f = kind === 'tag' ? 'tags' : 'errs'; n[f] = (n[f] || []).includes(v) ? n[f].filter(x => x !== v) : [...(n[f] || []), v]; } }); return paint(); }
    if (b.dataset.lnNewtag) { const v = (root.prompt('Nombre del setup:') || '').trim().slice(0, 24); if (v) { noteSet(b.dataset.lnNewtag, n => { n.tags = [...new Set([...(n.tags || []), v])]; }); paint(); } return; }
    if (b.dataset.lnTab) { P.tab = b.dataset.lnTab; saveP(); paint(); (host.closest('.view') || host).scrollTop = 0; return; }
    if (b.dataset.lnRange) { P.range = b.dataset.lnRange; saveP(); return paint(); }
    if (b.dataset.lnFilter) { P.filter = b.dataset.lnFilter; saveP(); return paint(); }
    if (b.dataset.lnPairs) { P.pairs = b.dataset.lnPairs; saveP(); return paint(); }
    if (b.dataset.lnDay) { calSel = calSel === b.dataset.lnDay ? '' : b.dataset.lnDay; return paint(); }
    if (b.dataset.lnAi) return runAI(b.dataset.lnAi);
    if (b.dataset.lnPai) return analyzePos(b.dataset.lnPai);
    if (b.dataset.lnQ) return askChat(b.dataset.lnQ);
    if (b.dataset.lnChart) { const s = b.dataset.lnChart + 'USDT'; try { if (root.CCT_pixel && root.CCT_pixel.openSymbol) root.CCT_pixel.openSymbol(s); } catch {} return; }
    const a = b.dataset.ln; if (!a) return;
    if (a === 'sync') return load(true);
    if (a === 'csv') return csv();
    if (a === 'demo') { demo = true; P.tab = 'home'; return load(); }
    if (a === 'demo-off') { demo = false; D = {trades: [], at: 0, src: '', spot: false, err: '', ex: ''}; M = null; return load(); }
    if (a === 'cal-prev') { calM--; if (calM < 0) { calM = 11; calY--; } calSel = ''; return paint(); }
    if (a === 'cal-next') { calM++; if (calM > 11) { calM = 0; calY++; } calSel = ''; return paint(); }
    if (a === 'ai-stop') { try { aiCtl && aiCtl.abort(); } catch {} ai.busy = false; return paint(); }
    if (a === 'ai-copy') { copy(ai.text); return; }
    if (a === 'chat-clear') { chat = []; return paint(); }
    if (a === 'copy') { if (!M) return; copy(`Nexus Lens · ${new Date().toLocaleDateString('es-MX')}\nP&L ${pnlTxt(M.total)} en ${M.n} operaciones (${M.span} días)\nWin rate ${pct(M.wr)} (${M.wins}G/${M.losses}P) · Profit factor ${num2(M.pf)}\nExpectativa ${pnlTxt(M.exp)} (${M.expR.toFixed(2)}R) · Sharpe ${num2(M.sharpe)}\nCaída máx ${pnlTxt(M.maxDD)} · Nota ${M.score}/100 (${M.grade})`); }
  }
  function copy(txt) { try { navigator.clipboard.writeText(String(txt || '')).then(() => toast('Copiado'), () => toast('No se pudo copiar')); } catch { toast('No se pudo copiar'); } }
  function onSubmit(e) { const f = e.target.closest('[data-ln-form]'); if (!f) return; e.preventDefault(); const i = f.querySelector('input'), q = i.value; i.value = ''; askChat(q); }

  function mount() {
    if (host) return true;
    host = doc.getElementById('lensRoot'); if (!host) return false;
    host.addEventListener('click', onClick); host.addEventListener('submit', onSubmit);
    host.addEventListener('input', e => { const ta = e.target.closest && e.target.closest('[data-ln-nta]'); if (!ta) return; const k = ta.dataset.lnNta, v = ta.value.slice(0, 4000); noteSet(k, n => { n.note = v; }); });
    host.addEventListener('focusout', e => { if (e.target.closest && e.target.closest('[data-ln-nta]')) { const r = host.querySelector(`[data-ln-note="${CSS.escape(e.target.dataset.lnNta)}"] .ln-tr-m b`); if (r && !r.querySelector('.ln-ntag') && (e.target.value || '').trim()) r.insertAdjacentHTML('beforeend', '<i class="ln-ntag">Nota</i>'); } });
    if (root.ResizeObserver) { let rt = 0; new ResizeObserver(() => { if (!host.clientWidth || Math.abs(host.clientWidth - lastW) < 2) return; clearTimeout(rt); rt = setTimeout(() => { lastW = host.clientWidth; mountCharts(); }, 120); }).observe(host); }
    return true;
  }
  /* Abrir (lo llama app.js al mostrar la sección) */
  function open() { if (!mount()) return; paint(); load(false); notesPull(); }
  /* El exchange cambió (lectura nueva, conectado o desconectado) */
  let snapT = 0, lastId = '';
  function wire() {
    if (wired) return; const X = EX(); if (!X || !X.onChange) return; wired = true;
    X.onChange(s => {
      try { if (s && fin(s.equity) && s.equity >= 0) root.postMessage({cct: 'equity', value: s.equity}, root.location.origin); } catch {} // barra de saldo de la cuenta (abajo del gráfico)
      const info = X.info(), id = info ? info.id : ''; if (id !== lastId) { lastId = id; if (demo && id) demo = false; if (visible()) { load(true); return; } D.ex = ''; }
      if (!visible() || demo) return; clearTimeout(snapT); snapT = setTimeout(() => { if (M) compute(); const ae = doc.activeElement; if (!(ae && host.contains(ae) && ae.matches('input, textarea'))) paint(); }, 250);
    });
  }
  root.addEventListener('vx-exchange-changed', () => { if (visible()) load(true); });
  setInterval(() => { if (visible() && !demo && EX() && EX().connected() && !loading && Date.now() - D.at > 5 * 6e4 && doc.visibilityState === 'visible') load(true); }, 60000);
  const boot = () => { wire(); mount(); };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
  setTimeout(wire, 1500);

  /* ═════════ Cuenta de ejemplo (para conocer Nexus Lens sin conectar nada) ═════════ */
  const DEMO = {
    snap: null,
    data() {
      let sd = 7; const rnd = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
      const syms = [['BTC', 96000], ['ETH', 3500], ['SOL', 210], ['XRP', 2.4], ['DOGE', .38], ['LINK', 23], ['BNB', 690]], now = Date.now(), trades = [];
      for (let d = 95; d >= 0; d--) {
        const n = rnd() < .2 ? 0 : 1 + Math.floor(rnd() * (rnd() < .15 ? 6 : 3));
        for (let k = 0; k < n; k++) {
          const [sym, p0] = syms[Math.floor(Math.pow(rnd(), 1.6) * syms.length)], side = rnd() < .62 ? 'long' : 'short', ts = now - d * 864e5 - Math.floor(rnd() * 864e5 * .9), hr = new Date(ts).getUTCHours();
          const edge = (hr >= 13 && hr < 21 ? .1 : hr < 7 ? -.12 : 0) + (side === 'short' ? -.05 : .04) + (new Date(ts).getDay() === 5 ? -.12 : 0), win = rnd() < .5 + edge;
          const pnl = +(win ? 18 + rnd() * 70 : -(14 + rnd() * 42)).toFixed(2), px0 = p0 * (1 + (rnd() - .5) * .12), q = (180 + rnd() * 900) / px0;
          trades.push({id: 'demo' + trades.length, sym, pair: sym + '/USDT:USDT', side, pnl, ts, tOpen: ts - 3600e3 * (1 + rnd() * 9), entry: px0, exit: px0 * (1 + (side === 'long' ? 1 : -1) * pnl / (q * px0)), qty: q, notional: q * px0, lev: [3, 5, 10][Math.floor(rnd() * 3)], fee: +(q * px0 * .0005).toFixed(3)});
        }
      }
      trades.sort((a, b) => a.ts - b.ts); const tot = trades.reduce((a, t) => a + t.pnl, 0);
      DEMO.snap = {equity: 2000 + tot + 31.4, free: 1450 + tot, at: now, err: '', positions: [
        {symbol: 'BTC/USDT:USDT', side: 'long', contracts: .012, contractSize: 1, entryPrice: 95210, markPrice: 96480, unrealizedPnl: 15.24, leverage: 5, liquidationPrice: 77100, notional: 1157.8, initialMargin: 231.6},
        {symbol: 'SOL/USDT:USDT', side: 'short', contracts: 4, contractSize: 1, entryPrice: 208.4, markPrice: 204.3, unrealizedPnl: 16.4, leverage: 10, liquidationPrice: 227.9, notional: 817.2, initialMargin: 81.7}], orders: []};
      return {trades, at: now, src: 'demo', spot: false, err: '', ex: 'demo'};
    }
  };

  root.CCTLens = {open, refresh: () => load(true), context: () => context(false), metrics: () => M, demo: on => { demo = on !== false; load(); }, _md: md};
})(typeof window !== 'undefined' ? window : globalThis);

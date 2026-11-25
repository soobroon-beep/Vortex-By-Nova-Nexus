/* VORTEX · Radar del mercado — mapa de calor de criptomonedas (idea parecida a Coin360, diseño propio).
   · Cada cuadro es una moneda: su tamaño = capitalización (o volumen) y su color = cuánto sube o baja en el periodo elegido.
   · Arriba: sentimiento del mercado (índice de miedo y codicia, % de monedas en verde, cambio de la capitalización total).
   · «Nuevas»: los listados más recientes de Binance Futures, con su edad.
   · Tocas un cuadro y se abre su gráfico. Se actualiza solo mientras el panel está abierto, y los cuadros que cambian parpadean.
   Datos públicos: CoinGecko (mercado), alternative.me (miedo y codicia) y Binance (respaldo y nuevas). El algoritmo de acomodo
   (treemap «squarified») está en layout() y se prueba en tests/market-map.test.js. No es asesoría financiera. */
(function (root) {
  'use strict';
  const doc = root.document, fin = Number.isFinite;
  const CG = 'https://api.coingecko.com/api/v3', FNG = 'https://api.alternative.me/fng/?limit=2', BN = 'https://api.binance.com/api/v3', BF = 'https://fapi.binance.com/fapi/v1';
  const PROXY = 'https://vortex-push.soobroon.workers.dev/mkt?u=', PREF = 'cct_map_pref_v1';
  const STABLE = new Set(['usdt', 'usdc', 'dai', 'fdusd', 'tusd', 'usde', 'usds', 'pyusd', 'busd', 'usdp', 'gusd', 'frax', 'lusd', 'usdd', 'usd1', 'rlusd', 'usdtb', 'usdy', 'usyc', 'buidl', 'susde', 'susds', 'eurc', 'xaut', 'paxg', 'usdf', 'usdg', 'bfusd', 'usdx', 'crvusd', 'gho']);
  const SKIP = /(^|-)(wrapped|staked|restaked|bridged|binance-peg|liquid-staked)(-|$)|^weth$|^wbtc$|^steth$|^wsteth$|^weeth$|^cbbtc$|^cbeth$|^reth$|^jitosol$|^msol$|^bnsol$|^lbtc$|^solvbtc|^ezeth$|^rseth$|^meth$|^wbeth$|^clbtc$|^tbtc$/i;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const P = (() => { let o = {}; try { o = JSON.parse(localStorage.getItem(PREF) || '{}') || {}; } catch {} return {per: ['1h', '24h', '7d'].includes(o.per) ? o.per : '24h', size: o.size === 'vol' ? 'vol' : 'cap', list: ['50', '100', '200', 'new'].includes(o.list) ? o.list : '100'}; })();
  const saveP = () => { try { localStorage.setItem(PREF, JSON.stringify(P)); } catch {} };
  let H = {open: null, cur: () => '', has: () => false, toast: () => {}};
  let host = null, coins = [], news = [], fng = null, glob = null, at = 0, newAt = 0, busy = false, err = '', src = '', prev = new Map(), timer = 0, tip = null, ro = null, lastW = 0, lastH = 0, bnSpot = null, bnSpotAt = 0;

  /* ───────── Datos ───────── */
  async function getJSON(u, proxy) {
    const one = async url => { const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000); try { const r = await fetch(url, {signal: ctl.signal}); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(to); } };
    try { return await one(u); } catch (e) { if (!proxy) throw e; return one(PROXY + encodeURIComponent(u)); }
  }
  const okCoin = c => c && c.symbol && !STABLE.has(String(c.symbol).toLowerCase()) && !SKIP.test(c.id || '') && !(c.current_price > .97 && c.current_price < 1.03 && /usd|eur/i.test(c.symbol));
  async function loadMarket() {
    const per = P.list === '200' ? 250 : 150;
    try {
      const a = await getJSON(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${per}&page=1&sparkline=false&price_change_percentage=1h,24h,7d`);
      coins = a.filter(okCoin).map(c => ({id: c.id, sym: String(c.symbol).toUpperCase(), name: c.name, img: c.image, price: c.current_price, cap: c.market_cap || 0, vol: c.total_volume || 0, rank: c.market_cap_rank,
        ch: {'1h': c.price_change_percentage_1h_in_currency, '24h': c.price_change_percentage_24h_in_currency != null ? c.price_change_percentage_24h_in_currency : c.price_change_percentage_24h, '7d': c.price_change_percentage_7d_in_currency}}));
      src = 'CoinGecko'; err = '';
    } catch (e) { // respaldo: tickers de Binance (solo 24 h, tamaño por volumen)
      try {
        const t = await getJSON(`${BN}/ticker/24hr`, true);
        coins = t.filter(x => /^[A-Z0-9]{2,12}USDT$/.test(x.symbol) && +x.quoteVolume > 3e6 && !STABLE.has(x.symbol.replace(/USDT$/, '').toLowerCase())).sort((a, b) => +b.quoteVolume - +a.quoteVolume).slice(0, 150)
          .map((x, i) => { const s = x.symbol.replace(/USDT$/, ''); return {id: s, sym: s, name: s, img: '', price: +x.lastPrice, cap: +x.quoteVolume, vol: +x.quoteVolume, rank: i + 1, ch: {'1h': null, '24h': +x.priceChangePercent, '7d': null}}; });
        src = 'Binance'; err = '';
      } catch { err = 'No se pudo leer el mercado. Reintenta en un momento.'; }
    }
    at = Date.now();
  }
  async function loadSentiment() {
    try { const j = await getJSON(FNG); const d = j && j.data || []; if (d[0]) fng = {v: +d[0].value, txt: d[0].value_classification, prev: d[1] ? +d[1].value : NaN}; } catch {}
    try { const g = (await getJSON(`${CG}/global`)).data; if (g) glob = {chg: g.market_cap_change_percentage_24h_usd, cap: g.total_market_cap && g.total_market_cap.usd, btc: g.market_cap_percentage && g.market_cap_percentage.btc}; } catch {}
  }
  async function loadNew() { // listados recientes de Binance Futures (los 45 días más nuevos), con su volumen y cambio de 24 h
    if (news.length && Date.now() - newAt < 5 * 6e4) return;
    try {
      const [ex, tk] = await Promise.all([getJSON(`${BF}/exchangeInfo`, true), getJSON(`${BF}/ticker/24hr`, true)]), T = new Map(tk.map(x => [x.symbol, x])), lim = Date.now() - 45 * 864e5;
      news = (ex.symbols || []).filter(s => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING' && s.onboardDate > lim && T.has(s.symbol))
        .map(s => { const x = T.get(s.symbol), b = s.baseAsset.replace(/^1000+/, ''); return {id: s.symbol, sym: b, name: s.baseAsset, img: '', price: +x.lastPrice, cap: +x.quoteVolume, vol: +x.quoteVolume, ch: {'1h': null, '24h': +x.priceChangePercent, '7d': null}, born: s.onboardDate, fut: s.symbol}; })
        .filter(c => c.vol > 0).sort((a, b) => b.born - a.born).slice(0, 60);
      newAt = Date.now();
    } catch { if (!news.length) err = 'No se pudieron leer los listados nuevos.'; }
  }
  async function loadBnSpot() { if (bnSpot && Date.now() - bnSpotAt < 6e5) return; try { const t = await getJSON(`${BN}/ticker/price`, true); bnSpot = new Set(t.map(x => x.symbol)); bnSpotAt = Date.now(); } catch {} }
  async function refresh(force) {
    if (busy) return; if (!force && at && Date.now() - at < 40000) return paint(); busy = true; paintStatus();
    snapPrev();
    try { await Promise.all([P.list === 'new' ? loadNew() : loadMarket(), !fng || Date.now() - at > 3e5 ? loadSentiment() : null, loadBnSpot()]); } finally { busy = false; }
    if (P.list === 'new') at = Date.now();
    paint(true);
  }
  function snapPrev() { prev = new Map(); for (const c of list()) prev.set(c.id, c.price); }

  /* ───────── Acomodo «squarified» (cuadros lo más cuadrados posible) ───────── */
  function layout(items, x, y, w, h) {
    const out = [], tot = items.reduce((a, it) => a + it.v, 0); if (!(tot > 0) || w <= 0 || h <= 0) return out;
    const scale = w * h / tot, rest = items.map(it => Object.assign({}, it, {a: it.v * scale}));
    const worst = (row, side) => { let s = 0, mx = 0, mn = Infinity; for (const r of row) { s += r.a; mx = Math.max(mx, r.a); mn = Math.min(mn, r.a); } const s2 = s * s, q = side * side; return Math.max(q * mx / s2, s2 / (q * mn)); };
    let row = [];
    const place = () => {
      const s = row.reduce((a, r) => a + r.a, 0);
      if (w >= h) { const cw = s / h; let yy = y; for (const r of row) { const ch = r.a / cw; out.push(Object.assign(r, {x, y: yy, w: cw, h: ch})); yy += ch; } x += cw; w -= cw; }
      else { const ch = s / w; let xx = x; for (const r of row) { const cw = r.a / ch; out.push(Object.assign(r, {x: xx, y, w: cw, h: ch})); xx += cw; } y += ch; h -= ch; }
      row = [];
    };
    while (rest.length) {
      const side = Math.min(w, h), it = rest[0];
      if (!row.length || worst(row.concat(it), side) <= worst(row, side)) { row.push(rest.shift()); }
      else place();
    }
    if (row.length) place();
    return out;
  }

  /* ───────── Vista ───────── */
  function list() {
    if (P.list === 'new') return news;
    const n = P.list === '50' ? 50 : P.list === '200' ? 200 : 100;
    return coins.slice(0, n);
  }
  const RANGE = {'1h': 3, '24h': 10, '7d': 25};
  function tint(ch, per) { // color del cuadro: verde/rojo de la app, más intenso cuanto más se mueve
    if (!fin(ch)) return 'color-mix(in srgb, var(--muted) 14%, var(--bg))';
    const k = Math.min(1, Math.pow(Math.abs(ch) / RANGE[per], .7)), pct = Math.round(14 + k * 70);
    return `color-mix(in srgb, ${ch >= 0 ? 'var(--green)' : 'var(--red)'} ${pct}%, var(--bg))`;
  }
  const pctTxt = v => fin(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 2) + '%' : '—';
  const big = v => { if (!fin(v)) return '—'; const a = Math.abs(v); return '$' + (a >= 1e12 ? (v / 1e12).toFixed(2) + ' B' : a >= 1e9 ? (v / 1e9).toFixed(2) + ' mil M' : a >= 1e6 ? (v / 1e6).toFixed(1) + ' M' : a >= 1e3 ? (v / 1e3).toFixed(1) + ' K' : v.toFixed(0)); };
  const price = v => { if (!fin(v)) return '—'; const d = v >= 1000 ? 0 : v >= 1 ? 2 : v >= .01 ? 4 : 7; return '$' + v.toLocaleString('en-US', {minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d}); };
  const age = t => { const d = Math.floor((Date.now() - t) / 864e5); return d < 1 ? 'hoy' : d === 1 ? 'hace 1 día' : `hace ${d} días`; };
  const chOf = c => { const v = c.ch[P.per]; return fin(v) ? v : c.ch['24h']; };
  const perOf = c => fin(c.ch[P.per]) ? P.per : '24h';

  function shell() {
    const seg = (k, cur, opts) => `<div class="mm-seg" role="group">${opts.map(([v, t, dis]) => `<button type="button" data-mm-${k}="${v}" aria-pressed="${cur === v}"${dis ? ' disabled' : ''}>${t}</button>`).join('')}</div>`;
    const isNew = P.list === 'new';
    return `<div class="mm">
      <div class="view-head mm-head"><div><div class="eyebrow">MERCADO</div><h1>Radar</h1></div><button type="button" class="mm-ib" data-mm="sync" aria-label="Actualizar" title="Actualizar"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M20 4.5V9h-4.5"/></svg></button></div>
      <div class="mm-sent" data-mm-sent>${sentHtml()}</div>
      <div class="mm-ctl">${seg('list', P.list, [['50', 'Top 50'], ['100', 'Top 100'], ['200', 'Top 200'], ['new', 'Nuevas']])}
        <div class="mm-row2">${seg('per', isNew ? '24h' : P.per, [['1h', '1h', isNew], ['24h', '24h'], ['7d', '7d', isNew]])}${seg('size', isNew ? 'vol' : P.size, [['cap', 'Capitalización', isNew], ['vol', 'Volumen']])}</div></div>
      <div class="mm-map" data-mm-map role="list" aria-label="Mapa de criptomonedas"></div>
      <p class="mm-foot" data-mm-foot></p></div>`;
  }
  function sentHtml() {
    const L = list(), n = L.filter(c => fin(chOf(c))).length, up = L.filter(c => chOf(c) > 0).length, upP = n ? up / n * 100 : NaN;
    const f = fng, fc = !f ? 'var(--muted)' : f.v >= 75 ? 'var(--green)' : f.v >= 55 ? 'color-mix(in srgb, var(--green) 70%, var(--text))' : f.v > 45 ? 'var(--muted)' : f.v > 25 ? 'color-mix(in srgb, var(--red) 70%, var(--text))' : 'var(--red)';
    const TXT = {'Extreme Fear': 'Miedo extremo', Fear: 'Miedo', Neutral: 'Neutral', Greed: 'Codicia', 'Extreme Greed': 'Codicia extrema'};
    const arc = f ? (f.v / 100 * 50.3).toFixed(1) : 0;
    return `<div class="mm-fng" title="Índice de miedo y codicia (alternative.me): 0 = miedo extremo, 100 = codicia extrema">
        <svg viewBox="0 0 40 24" aria-hidden="true"><path d="M4 21a16 16 0 0 1 32 0" class="trk"/><path d="M4 21a16 16 0 0 1 32 0" class="val" style="stroke:${fc};stroke-dasharray:${arc} 60"/></svg>
        <div><b style="color:${fc}">${f ? f.v : '—'}</b><small>${f ? esc(TXT[f.txt] || f.txt) : 'Sentimiento'}</small></div></div>
      <div class="mm-breadth" title="Monedas que suben vs. bajan en el mapa (${perOf(L[0] || {ch: {}})})"><div class="mm-bt"><span>En verde</span><b>${fin(upP) ? Math.round(upP) + '%' : '—'}</b></div><div class="mm-bar"><i style="width:${fin(upP) ? upP.toFixed(1) : 50}%"></i></div><small>${up} de ${n} suben</small></div>
      ${glob && P.list !== 'new' ? `<div class="mm-glob" title="Capitalización total del mercado cripto${fin(glob.btc) ? ' · dominancia de BTC ' + glob.btc.toFixed(1) + '%' : ''}"><span>Mercado</span><b class="${glob.chg >= 0 ? 'up' : 'dn'}">${pctTxt(glob.chg)}</b><small>${big(glob.cap)}</small></div>` : ''}`;
  }
  function paintMap(flash) {
    const box = host && host.querySelector('[data-mm-map]'); if (!box) return;
    const W = box.clientWidth, Ht = box.clientHeight; lastW = W; lastH = Ht; if (W < 40 || Ht < 40) return;
    const L = list().filter(c => (P.list === 'new' || P.size === 'vol' ? c.vol : c.cap) > 0);
    if (!L.length) { box.innerHTML = `<div class="mm-empty">${busy ? 'Leyendo el mercado…' : esc(err || 'Sin datos por ahora.')}</div>`; return; }
    const sizeOf = c => P.list === 'new' || P.size === 'vol' ? c.vol : c.cap;
    // raíz cuadrada suaviza la escala: BTC no se come todo el mapa y las pequeñas siguen siendo tocables
    const items = L.map(c => ({c, v: Math.pow(sizeOf(c), P.list === 'new' ? .5 : .62)})).sort((a, b) => b.v - a.v);
    const R = layout(items, 0, 0, W, Ht), cur = String(H.cur() || '').split('@')[0].replace(/(USDT|USDC|FDUSD|USD)$/, '').toUpperCase();
    box.innerHTML = R.map(({c, x, y, w, h}) => {
      const ch = chOf(c), a = Math.min(w, h), fs = Math.max(8, Math.min(30, a / 4.2)), showP = a >= 64, logo = c.img && a >= 54, old = prev.get(c.id), fl = flash && fin(old) && old !== c.price ? (c.price > old ? ' fl-up' : ' fl-dn') : '';
      return `<button type="button" role="listitem" class="mm-t${a < 26 ? ' xs' : ''}${c.sym === cur ? ' cur' : ''}${fl}" data-mm-id="${esc(c.id)}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${Math.max(0, w - 2).toFixed(1)}px;height:${Math.max(0, h - 2).toFixed(1)}px;background:${tint(ch, perOf(c))};--fs:${fs.toFixed(1)}px" aria-label="${esc(c.name)} ${pctTxt(ch)}">
        ${a >= 22 ? `<span class="mm-in">${logo ? `<img src="${esc(c.img)}" alt="" loading="lazy" width="${Math.round(fs * 1.25)}" height="${Math.round(fs * 1.25)}">` : ''}<b>${esc(c.sym)}</b>${a >= 34 ? `<em>${pctTxt(ch)}</em>` : ''}${showP ? `<small>${P.list === 'new' ? esc(age(c.born)) : price(c.price)}</small>` : ''}</span>` : ''}</button>`;
    }).join('');
  }
  function paintStatus() { const b = host && host.querySelector('[data-mm="sync"]'); if (b) b.classList.toggle('spin', busy); const f = host && host.querySelector('[data-mm-foot]'); if (f) f.textContent = foot(); }
  function foot() {
    if (busy && !at) return 'Leyendo el mercado…'; if (err) return err;
    const per = P.list === 'new' ? '24 h' : P.per === '1h' ? '1 hora' : P.per === '7d' ? '7 días' : '24 h';
    return `${P.list === 'new' ? 'Listados de Binance Futures de los últimos 45 días · tamaño = volumen' : `Tamaño = ${P.size === 'vol' ? 'volumen 24 h' : 'capitalización'}`} · color = cambio en ${per} · ${src || 'Binance'}${at ? ' · ' + new Date(at).toLocaleTimeString('es-MX', {hour: '2-digit', minute: '2-digit'}) : ''}. Toca una moneda para abrir su gráfico.`;
  }
  function paint(flash) {
    if (!host) return; if (!host.firstChild) host.innerHTML = shell();
    else { const s = host.querySelector('[data-mm-sent]'); if (s) s.innerHTML = sentHtml(); }
    paintMap(flash); paintStatus();
  }
  function repaintAll() { if (!host) return; host.innerHTML = shell(); paint(); }

  /* ───────── Abrir el gráfico de una moneda ───────── */
  function symbolFor(c) {
    const M = root.CCTMarkets, pair = c.sym + 'USDT';
    if (c.fut) return M ? M.mk(c.fut, 'binancef') : c.fut; // nuevas: futuros de Binance
    if ((bnSpot && bnSpot.has(pair)) || H.has(pair)) return pair; // Binance spot (lo de siempre)
    if (M) return M.mk(M.symFor('mexc', pair), 'mexc'); // si no está en Binance, MEXC (lista casi todo)
    return pair;
  }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b || !host.contains(b)) return;
    if (b.dataset.mmId) { const c = list().find(x => x.id === b.dataset.mmId); if (c && H.open) { hideTip(); H.open(symbolFor(c)); setTimeout(() => paintMap(false), 60); } return; }
    if (b.dataset.mmList) { const was = P.list; P.list = b.dataset.mmList; saveP(); repaintAll(); if ((was === 'new') !== (P.list === 'new') || P.list === '200' && coins.length < 160) { at = 0; refresh(true); } return; }
    if (b.dataset.mmPer) { P.per = b.dataset.mmPer; saveP(); return repaintAll(); }
    if (b.dataset.mmSize) { P.size = b.dataset.mmSize; saveP(); return repaintAll(); }
    if (b.dataset.mm === 'sync') return refresh(true);
  }
  /* globo al pasar el cursor (solo con ratón) */
  function showTip(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return; const t = e.target.closest('[data-mm-id]'); if (!t) return hideTip();
    const c = list().find(x => x.id === t.dataset.mmId); if (!c) return hideTip();
    if (!tip) { tip = doc.createElement('div'); tip.className = 'mm-tip'; doc.body.appendChild(tip); }
    const row = (k, v) => fin(v) ? `<span>${k}</span><b class="${v >= 0 ? 'up' : 'dn'}">${pctTxt(v)}</b>` : '';
    tip.innerHTML = `<div class="mm-tt">${c.img ? `<img src="${esc(c.img)}" alt="" width="20" height="20">` : ''}<div><b>${esc(c.name)}</b><small>${esc(c.sym)}${c.rank ? ' · #' + c.rank : ''}${c.born ? ' · listada ' + esc(age(c.born)) : ''}</small></div></div>
      <div class="mm-tp">${price(c.price)}</div><div class="mm-tg">${row('1 h', c.ch['1h'])}${row('24 h', c.ch['24h'])}${row('7 días', c.ch['7d'])}<span>Volumen 24 h</span><b>${big(c.vol)}</b>${c.fut ? '' : `<span>Capitalización</span><b>${big(c.cap)}</b>`}</div>`;
    tip.hidden = false; const r = tip.getBoundingClientRect(), vw = root.innerWidth, vh = root.innerHeight;
    tip.style.left = Math.max(8, Math.min(vw - r.width - 8, e.clientX - r.width - 14)) + 'px'; tip.style.top = Math.max(8, Math.min(vh - r.height - 8, e.clientY + 12)) + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }

  function visible() { return !!(host && host.offsetParent !== null); }
  function mount() {
    if (host) return true; host = doc.getElementById('mapRoot'); if (!host) return false;
    host.addEventListener('click', onClick); host.addEventListener('pointermove', showTip); host.addEventListener('pointerleave', hideTip);
    if (root.ResizeObserver) { let t = 0; ro = new ResizeObserver(() => { const b = host.querySelector('[data-mm-map]'); if (!b || (Math.abs(b.clientWidth - lastW) < 2 && Math.abs(b.clientHeight - lastH) < 2)) return; clearTimeout(t); t = setTimeout(() => paintMap(false), 90); }); ro.observe(host); }
    return true;
  }
  function open() {
    if (!mount()) return; if (!host.firstChild) host.innerHTML = shell(); paint(); refresh(false);
    clearInterval(timer); timer = setInterval(() => { if (!visible()) { clearInterval(timer); timer = 0; return; } if (doc.visibilityState === 'visible') refresh(false); }, 45000);
  }
  function bind(h) { Object.assign(H, h); }
  const api = {bind, open, refresh, layout, tint, _set: (c, n) => { coins = c || []; news = n || []; }};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTMap = api;
})(typeof self !== 'undefined' ? self : this);

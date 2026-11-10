/* Mercados: cada activo se guarda con su exchange en la propia clave, como en TradingView.
   «BTCUSDT» = Binance Spot (como siempre) · «BTCUSDT@bybit», «BTCUSDT@okx», «BTCUSDT@binancef», «BTC-USD@coinbase», «BTC-USDT@bingx», «BTC-USDT@bingxf» (perpetuo), «BTC-USDT@kucoin», «BTC_USDT@gate», «BTCUSDT@mexc», «BTCUSDT@bitget», «BTCUSDT@htx», «BTC-USD@kraken»…
   Aquí viven: la lectura de claves, las listas de pares de cada exchange (para el buscador) y los precios/cambio 24 h de cada uno.
   Todo es de datos públicos (sin llaves). */
(function (root) {
  'use strict';
  const EXCH = {binance: 'Binance', binancef: 'Binance Futuros', bybit: 'Bybit', bybitf: 'Bybit Perpetuos', okx: 'OKX', okxf: 'OKX Perpetuos', coinbase: 'Coinbase', bingx: 'BingX', bingxf: 'BingX Perpetuos', kucoin: 'KuCoin', gate: 'Gate.io', mexc: 'MEXC', bitget: 'Bitget', htx: 'HTX', kraken: 'Kraken', dom: 'Dominancia'};
  const SHORT = {binance: 'BINANCE', binancef: 'BINANCE·F', bybit: 'BYBIT', bybitf: 'BYBIT·F', okx: 'OKX', okxf: 'OKX·F', coinbase: 'COINBASE', bingx: 'BINGX', bingxf: 'BINGX·F', kucoin: 'KUCOIN', gate: 'GATE', mexc: 'MEXC', bitget: 'BITGET', htx: 'HTX', kraken: 'KRAKEN', dom: 'CRYPTO'};
  const ORDER = ['binance', 'bybit', 'bingx', 'okx', 'coinbase', 'kucoin', 'gate', 'mexc', 'bitget', 'htx', 'kraken', 'binancef', 'bingxf', 'bybitf', 'okxf', 'dom'];
  const PERP = ['binancef', 'bingxf', 'bybitf', 'okxf'], isPerp = src => PERP.includes(src);
  const QUOTE_OK = ['USDT', 'USDC', 'USD', 'BTC', 'EUR'];

  const parse = key => { const s = String(key || ''), i = s.indexOf('@'); const src = i < 0 ? 'binance' : s.slice(i + 1); return {sym: i < 0 ? s : s.slice(0, i), src: EXCH[src] ? src : 'binance'}; };
  const symOf = key => parse(key).sym, srcOf = key => parse(key).src;
  const mk = (sym, src) => !src || src === 'binance' ? sym : `${sym}@${src}`;
  /* Símbolo «de trabajo» que usa la app para separar base/cotización: Binance escribe BTCUSDT; OKX/Coinbase/BingX/KuCoin usan guiones (BTC-USDT), Gate guion bajo (BTC_USDT). */
  const norm = sym => String(sym).replace(/[-_/]/g, '').toUpperCase();

  // ── normalizadores (puros, probados en tests/markets.test.js) ──
  const num = x => { const n = Number(String(x == null ? '' : x).replace('%', '')); return x !== '' && x != null && Number.isFinite(n) ? n : NaN; };
  const row = (src, sym, base, quote, last, chg, vol) => ({key: mk(sym, src), sym, src, base, quote, last: num(last), chg: num(chg), vol: num(vol) || 0});
  const splitQ = s => { for (const q of ['USDT', 'USDC', 'FDUSD', 'USD', 'BTC', 'EUR']) if (s.length > q.length && s.endsWith(q)) return [s.slice(0, -q.length), q]; return null; };
  const pct = (l, o) => { l = num(l); o = num(o); return o > 0 ? (l / o - 1) * 100 : NaN; };
  const arr = x => Array.isArray(x) ? x : [];
  const glued = (src, list, f) => arr(list).map(t => { const [sym, last, chg, vol] = f(t), p = splitQ(String(sym).toUpperCase()); return p && QUOTE_OK.includes(p[1]) ? row(src, String(sym).toUpperCase(), p[0], p[1], last, chg, vol) : null; }).filter(Boolean); // «BTCUSDT»
  const dashed = (src, list, sep, f) => arr(list).map(t => { const [sym, last, chg, vol, off] = f(t), pp = String(sym).split(sep); if (off || pp.length !== 2 || !pp[0] || !QUOTE_OK.includes(pp[1])) return null; return row(src, String(sym), pp[0], pp[1], last, chg, vol); }).filter(Boolean); // «BTC-USDT», «BTC_USDT»
  const KR_ASSET = {XBT: 'BTC', XDG: 'DOGE'};
  const N = {
    binance: d => glued('binance', d, t => [t.symbol, t.lastPrice, t.priceChangePercent, t.quoteVolume]),
    binancef: d => glued('binancef', d, t => [t.symbol, t.lastPrice, t.priceChangePercent, t.quoteVolume]),
    bybit: j => glued('bybit', j && j.result && j.result.list, t => [t.symbol, t.lastPrice, num(t.price24hPcnt) * 100, t.turnover24h]),
    bybitf: j => glued('bybitf', j && j.result && j.result.list, t => [t.symbol, t.lastPrice, num(t.price24hPcnt) * 100, t.turnover24h]),
    okx: j => dashed('okx', j && j.data, '-', t => [t.instId, t.last, pct(t.last, t.open24h), num(t.volCcy24h) * num(t.last)]),
    okxf: j => dashed('okxf', arr(j && j.data).filter(t => /-SWAP$/.test(t.instId)), '-', t => [String(t.instId).replace(/-SWAP$/, ''), t.last, pct(t.last, t.open24h), num(t.volCcy24h) * num(t.last)]), // perpetuo: BTC-USDT-SWAP se guarda como BTC-USDT@okxf
    coinbase: d => dashed('coinbase', d, '-', t => [t.id, NaN, NaN, 0, t.trading_disabled || t.status === 'delisted']),
    bingx: j => dashed('bingx', j && j.data && Array.isArray(j.data.symbols) ? j.data.symbols : j && j.data, '-', t => [t.symbol, t.lastPrice, t.priceChangePercent, t.quoteVolume, t.status === 0]),
    bingxf: j => dashed('bingxf', j && j.data, '-', t => [t.symbol, t.lastPrice, t.priceChangePercent, t.quoteVolume]),
    kucoin: j => dashed('kucoin', j && j.data && j.data.ticker, '-', t => [t.symbol, t.last, num(t.changeRate) * 100, t.volValue]),
    gate: d => dashed('gate', d, '_', t => [t.currency_pair, t.last, t.change_percentage, t.quote_volume]),
    mexc: d => glued('mexc', d, t => [t.symbol, t.lastPrice, pct(t.lastPrice, t.openPrice), t.quoteVolume]),
    bitget: j => glued('bitget', j && j.data, t => [t.symbol, t.lastPr, num(t.change24h) * 100, t.quoteVolume]),
    htx: j => glued('htx', j && j.data, t => [t.symbol, t.close, pct(t.close, t.open), t.vol]),
    kraken: (pairs, tick) => { // AssetPairs (wsname «XBT/USD») + Ticker de todos los pares
      const P = (pairs && pairs.result) || {}, T = (tick && tick.result) || {}, out = [];
      for (const [id, p] of Object.entries(P)) {
        const w = String(p.wsname || '').split('/'); if (w.length !== 2 || /\.d$/.test(id)) continue;
        const b = KR_ASSET[w[0]] || w[0], q = KR_ASSET[w[1]] || w[1]; if (!QUOTE_OK.includes(q)) continue;
        const t = T[id], l = t ? num(t.c && t.c[0]) : NaN;
        out.push(Object.assign(row('kraken', `${b}-${q}`, b, q, l, t ? pct(l, t.o) : NaN, t ? num(t.v && t.v[1]) * l : 0), {alt: p.altname}));
      }
      return out;
    }
  };
  const URLS = {
    binance: 'https://api.binance.com/api/v3/ticker/24hr',
    binancef: 'https://fapi.binance.com/fapi/v1/ticker/24hr',
    bybit: 'https://api.bybit.com/v5/market/tickers?category=spot',
    bybitf: 'https://api.bybit.com/v5/market/tickers?category=linear',
    okx: 'https://www.okx.com/api/v5/market/tickers?instType=SPOT',
    okxf: 'https://www.okx.com/api/v5/market/tickers?instType=SWAP',
    coinbase: 'https://api.exchange.coinbase.com/products',
    bingx: () => [`https://open-api.bingx.com/openApi/spot/v1/ticker/24hr?timestamp=${Date.now()}`, 'https://open-api.bingx.com/openApi/spot/v1/common/symbols'], // con precios; si falla, solo la lista
    bingxf: 'https://open-api.bingx.com/openApi/swap/v2/quote/ticker',
    kucoin: 'https://api.kucoin.com/api/v1/market/allTickers',
    gate: 'https://api.gateio.ws/api/v4/spot/tickers',
    mexc: 'https://api.mexc.com/api/v3/ticker/24hr',
    bitget: 'https://api.bitget.com/api/v2/spot/market/tickers',
    htx: 'https://api.huobi.pro/market/tickers'
  };

  /* Varios exchanges (BingX, KuCoin…) no dejan que una página web les pida datos directo (CORS).
     Entonces se pide por el servidor de VORTEX (Worker «vortex-push», ruta /mkt): solo datos públicos, sin llaves. */
  const PROXY = 'https://vortex-push.soobroon.workers.dev/mkt?u=';
  const viaProxy = new Set(['open-api.bingx.com', 'api.kucoin.com', 'api.mexc.com']);
  const browser = typeof document !== 'undefined';
  const raw = async url => { const r = await fetch(url); if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); };
  const smart = async url => {
    let h = ''; try { h = new URL(url).host; } catch {}
    if (browser && viaProxy.has(h)) return raw(PROXY + encodeURIComponent(url));
    try { return await raw(url); } catch (e) { if (!browser || !(e instanceof TypeError)) throw e; viaProxy.add(h); return raw(PROXY + encodeURIComponent(url)); } // TypeError = bloqueo CORS / red
  };
  let get = smart;
  const setFetcher = f => { get = f || smart; };

  // ── listas de pares (se piden una vez y se guardan 30 min) ──
  const cache = {}, TTL = 30 * 60 * 1000;
  async function fetchList(src) {
    if (src === 'kraken') { const pairs = await get('https://api.kraken.com/0/public/AssetPairs'); let tick = null; try { tick = await get('https://api.kraken.com/0/public/Ticker'); } catch {} return N.kraken(pairs, tick); }
    const u = typeof URLS[src] === 'function' ? URLS[src]() : URLS[src];
    let err; for (const url of [].concat(u)) { try { const list = N[src](await get(url)); if (list.length) return list; } catch (e) { err = e; } }
    if (err) throw err; return [];
  }
  async function universe(src, maxAge) {
    if (src === 'dom') { const list = await domList(); cache.dom = {ts: Date.now(), list}; return list; }
    if (!N[src]) return [];
    const c = cache[src]; if (c && c.list && Date.now() - c.ts < (maxAge || TTL)) return c.list;
    if (c && c.p) return c.p;
    const p = (async () => { try { const list = await fetchList(src); cache[src] = {ts: Date.now(), list}; return list; } catch { cache[src] = {ts: Date.now() - TTL + 60000, list: (c && c.list) || []}; return (c && c.list) || []; } })();
    cache[src] = Object.assign({}, c, {p}); return p;
  }
  const loaded = () => ORDER.filter(s => cache[s] && cache[s].list && cache[s].list.length);

  /* Búsqueda estilo TradingView: «btc», «ethusdt», «sol/usdt»… devuelve filas {key, sym, src, base, quote} ordenadas por relevancia y exchange. */
  function search(q, opts = {}) {
    const t = String(q || '').toUpperCase().replace(/[^A-Z0-9.]/g, ''), limit = opts.limit || 60, names = opts.names || (() => '');
    const out = [];
    for (const src of ORDER) {
      const list = cache[src] && cache[src].list; if (!list) continue;
      for (const r of list) {
        const full = r.base + r.quote, nm = String(names(r.base) || '').toUpperCase();
        let score = -1;
        if (!t) score = r.quote === 'USDT' || r.quote === 'USD' || r.src === 'dom' ? 1 : -1;
        else if (r.base === t) score = 100 + (r.quote === 'USDT' ? 5 : r.quote === 'USD' ? 4 : 0);
        else if (full === t) score = 110;
        else if (full.startsWith(t)) score = 60;
        else if (r.base.startsWith(t)) score = 50;
        else if (nm && nm.startsWith(t)) score = 40;
        else if (full.includes(t) || (nm && nm.includes(t))) score = 20;
        if (score < 0) continue;
        out.push(Object.assign({score: score + Math.min(8, Math.log10(1 + r.vol) / 2) - ORDER.indexOf(src) * .1}, r));
      }
    }
    out.sort((a, b) => b.score - a.score || a.base.localeCompare(b.base));
    return out.slice(0, limit);
  }

  // ── precios 24 h de las claves del seguimiento (agrupadas por exchange) ──
  async function tickers(keys) {
    const by = {}; for (const k of keys) { const p = parse(k); if (p.src !== 'binance') (by[p.src] = by[p.src] || []).push(p); }
    const out = {};
    if (by.dom) { try { const m = new Map((await domList()).map(r => [r.sym, r])); for (const p of by.dom) { const r = m.get(p.sym); if (r) out[mk(p.sym, 'dom')] = {symbol: mk(p.sym, 'dom'), lastPrice: String(r.last), priceChangePercent: String(r.chg)}; } } catch {} delete by.dom; }
    await Promise.all(Object.entries(by).map(async ([src, ps]) => {
      try {
        if (src !== 'coinbase' && src !== 'bingx') { const list = await universe(src, 20000), m = new Map(list.map(r => [r.sym, r])); for (const p of ps) { const r = m.get(p.sym); if (r) out[mk(p.sym, src)] = {symbol: mk(p.sym, src), lastPrice: String(r.last), priceChangePercent: String(r.chg)}; } }
        else if (src === 'coinbase') await Promise.all(ps.map(async p => { try { const s = await get(`https://api.exchange.coinbase.com/products/${p.sym}/stats`), t = await get(`https://api.exchange.coinbase.com/products/${p.sym}/ticker`), o = num(s.open), l = num(t.price); out[mk(p.sym, src)] = {symbol: mk(p.sym, src), lastPrice: String(l), priceChangePercent: String(o > 0 ? (l / o - 1) * 100 : NaN)}; } catch {} }));
        if (src === 'bingx') { const m = new Map((await universe('bingx', 20000)).map(r => [r.sym, r])); ps = ps.filter(p => { const r = m.get(p.sym); if (r && Number.isFinite(r.last)) { out[mk(p.sym, src)] = {symbol: mk(p.sym, src), lastPrice: String(r.last), priceChangePercent: String(r.chg)}; return false; } return true; }); }
        if (src === 'bingx') await Promise.all(ps.map(async p => { try { const j = await get(`https://open-api.bingx.com/openApi/spot/v1/ticker/24hr?symbol=${p.sym}&timestamp=${Date.now()}`), t = Array.isArray(j.data) ? j.data[0] : j.data; if (t) out[mk(p.sym, src)] = {symbol: mk(p.sym, src), lastPrice: String(num(t.lastPrice)), priceChangePercent: String(num(String(t.priceChangePercent).replace('%', '')))}; } catch {} }));
      } catch {}
    }));
    return out;
  }


  // ── Dominancia (USDT.D, BTC.D): muestras que guarda .github/workflows/dominance.yml en dominance-data.json ──
  const DOM_NAMES = {'USDT.D': 'Tether Dominance', 'BTC.D': 'Bitcoin Dominance'};
  const DOM_URLS = ['dominance-data.json', 'https://raw.githubusercontent.com/soobroon-beep/Vortex-By-Nova-Nexus/main/dominance-data.json'];
  let domCache = null;
  /* Valor en vivo (cada minuto) con la misma fórmula que el archivo: moneda / suma de las 125 criptomonedas más grandes (CoinGecko). Si falla, queda la muestra de 15 min. */
  let domLive = null, domLiveAt = 0;
  const DOM_SKIP = /(^|-)(wrapped|staked|restaked|bridged|binance-peg)(-|$)|staked-|-staked|wrapped-|-wrapped|-bridged/i, DOM_FUNDS = /^(figr_heloc|buidl|usyc|ustb|jaaa|jtrsy|eutbl|ousg|benji|usdtb|ustbl|tbill|wtgxx|fobxx|ylds)$/i;
  async function domLivePull() {
    if (Date.now() - domLiveAt < 60000) return; domLiveAt = Date.now();
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1'); if (!r.ok) return;
      const a = (await r.json()).filter(c => c && c.market_cap > 0 && !DOM_SKIP.test(c.id || '') && !DOM_FUNDS.test(c.symbol || '')).sort((x, y) => y.market_cap - x.market_cap).slice(0, 125); if (a.length < 100) return;
      const tot = a.reduce((x, c) => x + c.market_cap, 0), cap = id => (a.find(c => c.id === id) || {}).market_cap || 0;
      if (tot > 0 && cap('tether') > 0) domLive = {t: Date.now(), v: {'USDT.D': cap('tether') / tot * 100, 'BTC.D': cap('bitcoin') / tot * 100}};
    } catch {}
  }
  async function domData() {
    await domLivePull();
    if (domCache && Date.now() - domCache.ts < 120000) return domCache.d;
    let d = null;
    for (const u of DOM_URLS) { try { const r = await fetch(u + (u.includes('?') ? '&' : '?') + 'v=' + Math.floor(Date.now() / 120000)); if (r.ok) { d = await r.json(); if (d && d.series) break; } } catch {} }
    if (!d || !d.series) { if (domCache) return domCache.d; throw Error('Sin datos de dominancia'); }
    domCache = {ts: Date.now(), d}; return d;
  }
  function domPoints(d, sym) { // [t, %] en orden: el diario (largo plazo) y el de 15 min (reciente) sin repetir
    const s = d.series[sym]; if (!s) return [];
    const h = s.h || [], t0 = h.length ? h[0][0] : Infinity, hh = (s.hh || []).filter(p => p[0] < t0), t1 = hh.length ? hh[0][0] : t0; // diario (1 año) → por hora (90 días) → cada 15 min (30 días)
    const out = [...(s.d || []).filter(p => p[0] < t1), ...hh, ...h].sort((a, b) => a[0] - b[0]);
    const lv = domLive && domLive.v[sym]; if (lv > 0 && out.length && domLive.t > out[out.length - 1][0]) out.push([domLive.t, lv]); // valor de este minuto
    return out;
  }
  async function domList() {
    const d = await domData(), out = [];
    for (const sym of Object.keys(DOM_NAMES)) {
      const pts = domPoints(d, sym); if (!pts.length) continue;
      const last = pts[pts.length - 1], ref = [...pts].reverse().find(p => p[0] <= last[0] - 864e5 + 9e5);
      out.push(row('dom', sym, sym, '', last[1], ref ? (last[1] / ref[1] - 1) * 100 : NaN, 1e12));
    }
    return out;
  }
  const TF_MS = {'1m': 6e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '2h': 72e5, '4h': 144e5, '6h': 216e5, '8h': 288e5, '12h': 432e5, '1d': 864e5, '3d': 2592e5, '1w': 6048e5, '1M': 2592e6};
  async function klinesDom(sym, tf, limit = 1000) {
    const pts = domPoints(await domData(), sym), ms = TF_MS[tf] || 36e5, m = new Map();
    for (const [t, v] of pts) { const k = Math.floor(t / ms) * ms, c = m.get(k); if (!c) m.set(k, {t: k, o: v, h: v, l: v, c: v, v: 0}); else { c.h = Math.max(c.h, v); c.l = Math.min(c.l, v); c.c = v; } }
    const out = [...m.values()].sort((a, b) => a.t - b.t);
    for (let i = 1; i < out.length; i++) { const c = out[i], pc = out[i - 1].c; c.o = pc; c.h = Math.max(c.h, pc); c.l = Math.min(c.l, pc); } // cada vela abre donde cerró la anterior: sin rayitas planas
    if (out.length < 2) throw Error('La dominancia aún está juntando historial: vuelve en un rato');
    return out.slice(-limit);
  }

  // BingX: velas (el orden que devuelve no está garantizado, se ordena por tiempo)
  const BX_IV = {'1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w', '1M': '1M'};
  async function klinesBingx(sym, tf, limit = 1000) {
    const j = await get(`https://open-api.bingx.com/openApi/spot/v2/market/kline?symbol=${sym}&interval=${BX_IV[tf]}&limit=${Math.min(1000, limit)}`);
    const d = j && Array.isArray(j.data) ? j.data : null; if (!d || !d.length) throw Error('BingX sin datos');
    return d.map(x => Array.isArray(x) ? {t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5]} : {t: +x.openTime || +x.time, o: +x.open, h: +x.high, l: +x.low, c: +x.close, v: +x.volume}).sort((a, b) => a.t - b.t).filter((c, i, arr) => !i || c.t !== arr[i - 1].t);
  }

  /* Velas de los demás exchanges (spot y perpetuos). Todas regresan [{t ms, o, h, l, c, v}] de la más vieja a la más nueva. */
  const TF = {
    bybitf: {'1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W', '1M': 'M'},
    okxf: {'1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H', '1d': '1Dutc', '1w': '1Wutc', '1M': '1Mutc'},
    bingxf: BX_IV,
    kucoin: {'1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1hour', '4h': '4hour', '1d': '1day', '1w': '1week'},
    gate: {'1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '7d', '1M': '30d'},
    mexc: {'1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '60m', '4h': '4h', '1d': '1d', '1w': '1W', '1M': '1M'},
    bitget: {'1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week', '1M': '1M'},
    htx: {'1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '60min', '4h': '4hour', '1d': '1day', '1w': '1week', '1M': '1mon'},
    kraken: {'1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080}
  };
  const tfOk = (src, tf) => !!(TF[src] && TF[src][tf]);
  const tidy = a => a.filter(c => Number.isFinite(c.t) && Number.isFinite(c.c)).sort((x, y) => x.t - y.t).filter((c, i, l) => !i || c.t !== l[i - 1].t);
  const krAlt = sym => { const r = cache.kraken && cache.kraken.list && cache.kraken.list.find(x => x.sym === sym); if (r && r.alt) return r.alt; const [b, q] = String(sym).split('-'); return (b === 'BTC' ? 'XBT' : b === 'DOGE' ? 'XDG' : b) + q; };
  const K = {
    async bybitf(sym, iv, n) { const j = await get(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${sym}&interval=${iv}&limit=${Math.min(1000, n)}`); return arr(j && j.result && j.result.list).map(d => ({t: +d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]})); },
    async okxf(sym, iv, n) {
      const inst = sym + '-SWAP', out = []; let j = await get(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=${iv}&limit=300`); out.push(...arr(j && j.data));
      for (let page = 0; page < 6 && out.length && out.length < n; page++) { j = await get(`https://www.okx.com/api/v5/market/history-candles?instId=${inst}&bar=${iv}&limit=100&after=${out[out.length - 1][0]}`); const d = arr(j && j.data); if (!d.length) break; out.push(...d); }
      return out.slice(0, n).map(d => ({t: +d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]}));
    },
    async bingxf(sym, iv, n) { const j = await get(`https://open-api.bingx.com/openApi/swap/v3/quote/klines?symbol=${sym}&interval=${iv}&limit=${Math.min(1000, n)}`); return arr(j && j.data).map(x => Array.isArray(x) ? {t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5]} : {t: +x.time, o: +x.open, h: +x.high, l: +x.low, c: +x.close, v: +x.volume}); },
    async kucoin(sym, iv) { const j = await get(`https://api.kucoin.com/api/v1/market/candles?type=${iv}&symbol=${sym}`); return arr(j && j.data).map(d => ({t: d[0] * 1000, o: +d[1], c: +d[2], h: +d[3], l: +d[4], v: +d[5]})); },
    async gate(sym, iv, n) { const d = await get(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${sym}&interval=${iv}&limit=${Math.min(1000, n)}`); return arr(d).map(x => ({t: x[0] * 1000, c: +x[2], h: +x[3], l: +x[4], o: +x[5], v: +x[6]})); },
    async mexc(sym, iv, n) { const d = await get(`https://api.mexc.com/api/v3/klines?symbol=${sym}&interval=${iv}&limit=${Math.min(1000, n)}`); return arr(d).map(x => ({t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5]})); },
    async bitget(sym, iv, n) { const j = await get(`https://api.bitget.com/api/v2/spot/market/candles?symbol=${sym}&granularity=${iv}&limit=${Math.min(1000, n)}`); return arr(j && j.data).map(x => ({t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5]})); },
    async htx(sym, iv, n) { const j = await get(`https://api.huobi.pro/market/history/kline?symbol=${sym.toLowerCase()}&period=${iv}&size=${Math.min(2000, n)}`); return arr(j && j.data).map(x => ({t: x.id * 1000, o: +x.open, h: +x.high, l: +x.low, c: +x.close, v: +x.amount})); },
    async kraken(sym, iv) { const j = await get(`https://api.kraken.com/0/public/OHLC?pair=${krAlt(sym)}&interval=${iv}`), r = (j && j.result) || {}, k = Object.keys(r).find(x => x !== 'last'); return arr(k && r[k]).map(x => ({t: x[0] * 1000, o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[6]})); }
  };
  async function klines(src, sym, tf, limit = 1000) {
    if (!K[src] || !tfOk(src, tf)) throw Error(`${EXCH[src] || src} no tiene esa temporalidad`);
    const out = tidy(await K[src](sym, TF[src][tf], limit)); if (!out.length) throw Error(`${EXCH[src]} sin datos`);
    return out.slice(-limit);
  }
  const LIVE_WS = ['binance', 'binancef', 'bybit', 'bybitf', 'okx', 'okxf']; // el resto se actualiza consultando cada pocos segundos

  root.CCTMarkets = {DOM_NAMES, PERP, isPerp, klines, tfOk, TF, LIVE_WS, PROXY, klinesDom, EXCH, SHORT, ORDER, parse, symOf, srcOf, mk, norm, N, universe, loaded, search, tickers, klinesBingx, BX_IV, setFetcher, splitQ};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CCTMarkets;
})(typeof window !== 'undefined' ? window : globalThis);

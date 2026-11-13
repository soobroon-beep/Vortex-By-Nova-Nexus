(() => {
'use strict';
/* VORTEX · Powered by Nova Nexus — JS vanilla, sin dependencias.
   Pestañas: Seguimiento · Gráfico · Indicadores · Ajustes. Datos reales de Binance Spot (REST + WebSocket). */

const I = (n, z) => CCTI.svg(n, z); // iconos SVG (icons.js)
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const API = 'https://api.binance.com/api/v3';
const IV_MS = {'1m':6e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'4h':144e5,'1d':864e5,'1w':6048e5,'1M':2592e6};
const INTERVALS = Object.keys(IV_MS);
const PANE = /[?&]pane=/.test(location.search); // gráficos extra (2.º a 5.º): la misma app dentro de un iframe, con su propio estado y sin sincronizar
const PANE_N = Math.min(5, Math.max(2, +((/[?&]pane=(\d)/.exec(location.search) || [])[1]) || 2));
const STORE = PANE ? 'cct_pane' + PANE_N + '_v1' : 'cct_mobile_v1';
const ONEPT = ['horizontal', 'vertical', 'text', 'marker', 'hray', 'crossline', 'note', 'label', 'arrowup', 'arrowdown', 'flag', 'check', 'xmark', 'star', 'arrowleft', 'arrowright'], THREEPT = ['channel', 'fibext', 'pitchfork', 'triangle', 'parallelogram'];
/* Patrones de varios puntos: se toca cada punto en orden (n = cuántos) */
const MULTI = {
  xabcd: {n: 5, labels: ['X', 'A', 'B', 'C', 'D']}, abcd: {n: 4, labels: ['A', 'B', 'C', 'D']}, trianglep: {n: 4, labels: ['A', 'B', 'C', 'D']},
  hs: {n: 7, labels: ['', 'Hombro', '', 'Cabeza', '', 'Hombro', '']}, impulse: {n: 6, labels: ['0', '1', '2', '3', '4', '5']}, abc: {n: 4, labels: ['0', 'A', 'B', 'C']}
};

/* ───────── Estado persistente ───────── */
const defaults = {
  symbols: ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT'],
  symbol: 'BTCUSDT', interval: '1h',
  indicators: {derivs:true, oi:false, funding:false, lsr:false, taker:false, ema20:true, ema50:false, sma200:false, wma20:false, bollinger:false, vwap:false, supertrend:false, cross:false, rsi:true, macd:false, stoch:false, atr:false, obv:false, volume:true, vpvr:false, liqmap:false, adx:false, cci:false, willr:false, mfi:false, roc:false, stochrsi:false, ao:false, cmf:false, donchian:false, keltner:false, ichimoku:false, psar:false, patterns:false, dchan:false, nnIa:false, nnEma:false, nnTp:false, nnRules:false, nnSmc:false, nnOb:false, nnTrail:false, nnRev:false, nnSR:false, nnPiv:false, nnLiq:false, nnLiqBars:false, nnVP:false},
  groups: [], symGroup: {}, symColor: {}, listRev: 0, drawTpl: [], light: false, chartStyle: {}, ctype: 'candles', layout: '1', stdParams: {}, stdHide: {}, drawings: {}, brush: {c: '#e9c36e', w: 3}, pine: [], designs: [], source: 'binance', ui: {}, novaSaved: null, novaParams: {}, alerts: [], acct: {start: 0, cur: 0, auto: true}, moveAlerts: {on: true, pct: 2, sound: true}, discord: {url: '', invite: '', on: {move: true, price: true, ind: true, s1h: true, s4h: true}, sent: {s1h: 0, s4h: 0}}
};
function sanAlert(a) {
  if (!a || typeof a.id !== 'string' || !/^[A-Z0-9][A-Z0-9_-]{1,24}(@[a-z]{2,12})?$/.test(a.symbol)) return null; // también monedas de otros exchanges (HYPEUSDT@binancef, BTCUSDT@bybit…): antes se borraban y nunca avisaban
  const base0 = {id: a.id, symbol: a.symbol, on: a.on !== false, note: String(a.note || '').slice(0, 140), created: +a.created || 0, firedAt: +a.firedAt || 0};
  if (['app', 'discord', 'both'].includes(a.notify)) base0.notify = a.notify;
  if (a.kind === 'ind') {
    if (!(a.interval in IV_MS) || !['pine', 'std', 'nova'].includes(a.src) || !a.spec || typeof a.spec !== 'object' || JSON.stringify(a.spec).length > 400) return null;
    return Object.assign(base0, {kind: 'ind', interval: a.interval, src: a.src, sid: typeof a.sid === 'string' ? a.sid.slice(0, 40) : '', spec: JSON.parse(JSON.stringify(a.spec)), label: String(a.label || '').slice(0, 120), repeat: a.repeat === 'every' ? 'every' : 'once', lastBar: +a.lastBar || 0, firedInfo: String(a.firedInfo || '').slice(0, 200)});
  }
  if (!Number.isFinite(a.price) || !(a.price > 0) || (a.dir !== 'up' && a.dir !== 'down')) return null;
  const pr = Object.assign(base0, {price: a.price, dir: a.dir, firedPrice: Number.isFinite(a.firedPrice) ? a.firedPrice : null});
  if (['up', 'down'].includes(a.cond)) pr.cond = a.cond; // cruce ascendente / descendente (sin cond = cruce normal)
  if (a.repeat === 'every') pr.repeat = 'every'; if (a.wait === true) pr.wait = true;
  if (Number.isFinite(+a.exp) && +a.exp > 0) pr.exp = Math.round(+a.exp); if (a.expired === true) pr.expired = true;
  return pr;
}
function sanAcct(a) { // saldo de la cuenta para la barra de progreso (USD)
  const q = a && typeof a === 'object' && !Array.isArray(a) ? a : {}, n = v => Number.isFinite(+v) && +v >= 0 && +v < 1e12 ? Math.round(+v * 100) / 100 : 0;
  return {start: n(q.start), cur: n(q.cur), auto: q.auto !== false};
}
function sanRisk(a) { // calculadora de riesgo: % por operación, apalancamiento, comisión, capital manual y si se muestra en los dibujos Long/Short
  const q = a && typeof a === 'object' && !Array.isArray(a) ? a : {}, n = (v, lo, hi, d) => Number.isFinite(+v) && +v >= lo && +v <= hi ? +v : d;
  return {pct: n(q.pct, .01, 100, 1), lev: Math.round(n(q.lev, 1, 200, 10)), fee: n(q.fee, 0, 1, .05), cap: n(q.cap, 0, 1e12, 0), show: q.show !== false};
}
function sanScrPush(a) { const q = a && typeof a === 'object' ? a : {}; return {on: q.on === true, h1: q.h1 !== false, h4: q.h4 !== false}; } // señales del Screener al celular
function sanMoveAlerts(a) { // avisos de movimientos bruscos del precio
  const q = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
  return {on: q.on !== false, pct: Math.max(0.5, Math.min(25, Math.round((+q.pct || 2) * 10) / 10)), sound: q.sound !== false};
}
function sanDiscord(a) { // Discord: webhook del canal #vortex, invitación al servidor y qué se envía (se guarda en la cuenta, privada del dueño)
  const q = a && typeof a === 'object' && !Array.isArray(a) ? a : {}, o = q.on && typeof q.on === 'object' ? q.on : {}, sn = q.sent && typeof q.sent === 'object' ? q.sent : {};
  const url = typeof q.url === 'string' && /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/.test(q.url.trim()) ? q.url.trim() : '';
  const inv = typeof q.invite === 'string' && /^https:\/\/(?:discord\.gg\/|(?:www\.)?discord\.com\/invite\/)[\w-]{2,40}$/.test(q.invite.trim()) ? q.invite.trim() : '';
  const t = v => Number.isFinite(+v) && +v > 0 ? Math.round(+v) : 0;
  return {url, invite: inv, on: {bots: o.bots !== false, move: o.move !== false, price: o.price !== false, ind: o.ind !== false, s1h: o.s1h !== false, s4h: o.s4h !== false}, sent: {s1h: t(sn.s1h), s4h: t(sn.s4h)}};
}
const CTYPES = [['candles', 'Velas', 'c_candles'], ['hollow', 'Velas huecas', 'c_hollow'], ['ha', 'Heikin Ashi', 'c_ha'], ['bars', 'Barras OHLC', 'c_bars'], ['hlc', 'Barras HLC', 'c_hlc'], ['line', 'Línea', 'c_line'], ['area', 'Área', 'c_area'], ['step', 'Línea escalonada', 'c_step']];
const SOURCES = {binance: 'Binance Spot', binancef: 'Binance Futuros', bybit: 'Bybit Spot', bybitf: 'Bybit Perpetuos', okx: 'OKX Spot', okxf: 'OKX Perpetuos', coinbase: 'Coinbase', bingx: 'BingX Spot', bingxf: 'BingX Perpetuos', kucoin: 'KuCoin', gate: 'Gate.io', mexc: 'MEXC', bitget: 'Bitget', htx: 'HTX', kraken: 'Kraken', dom: 'Dominancia USDT/BTC'}; // exchanges (el exchange va en la clave del activo: BTCUSDT@bybit)
const CURSOR_MODES = ['Cruz', 'Flecha', 'Estrella']; // tipo de puntero sobre el gráfico (la estrella deja estela al mantener presionado: star-cursor.js)
const CHART_DEF = {bg: '#07090e', grid: '', gridH: true, gridV: true, up: '#089981', down: '#f23645', upBorder: '', downBorder: '', upWick: '', downWick: '', hollow: false, cross: '', crossA: 55, crossS: 'Guiones', crossW: 1, cursor: 'Cruz', alertCol: '', alertA: 28, alertS: 'Puntos', alertW: 1};
function sanChartStyle(c) {
  const o = {}; if (!c || typeof c !== 'object' || Array.isArray(c)) return o;
  for (const k of ['bg', 'grid', 'up', 'down', 'upBorder', 'downBorder', 'upWick', 'downWick', 'cross', 'alertCol']) if (typeof c[k] === 'string' && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(c[k])) o[k] = c[k];
  for (const k of ['gridH', 'gridV', 'hollow']) if (typeof c[k] === 'boolean') o[k] = c[k];
  if (Number.isFinite(+c.crossA) && c.crossA !== '') o.crossA = Math.max(5, Math.min(100, Math.round(+c.crossA)));
  if (Number.isFinite(+c.crossW) && c.crossW !== '') o.crossW = Math.max(1, Math.min(4, Math.round(+c.crossW)));
  if (['Guiones', 'Sólida', 'Puntos'].includes(c.crossS)) o.crossS = c.crossS;
  if (CURSOR_MODES.includes(c.cursor)) o.cursor = c.cursor;
  if (Number.isFinite(+c.alertA) && c.alertA !== '') o.alertA = Math.max(5, Math.min(100, Math.round(+c.alertA)));
  if (Number.isFinite(+c.alertW) && c.alertW !== '') o.alertW = Math.max(1, Math.min(4, Math.round(+c.alertW)));
  if (['Guiones', 'Sólida', 'Puntos'].includes(c.alertS)) o.alertS = c.alertS;
  return o;
}
const STD_SCHEMA_BASE = {
  ema20: [['len', 'Período', 'int', 20, 1, 500], ['color', 'Color y opacidad', 'color', '#f5c568'], ['width', 'Grosor', 'int', 1, 1, 6], ['dash', 'Estilo de línea', 'string', 'Sólida', 0, 0, ['Sólida', 'Guiones', 'Puntos']]], ema50: [['len', 'Período', 'int', 50, 1, 500], ['color', 'Color y opacidad', 'color', '#6ca5f9'], ['width', 'Grosor', 'int', 1, 1, 6], ['dash', 'Estilo de línea', 'string', 'Sólida', 0, 0, ['Sólida', 'Guiones', 'Puntos']]],
  sma200: [['len', 'Período', 'int', 200, 1, 1000], ['color', 'Color y opacidad', 'color', '#b58dff'], ['width', 'Grosor', 'int', 1, 1, 6], ['dash', 'Estilo de línea', 'string', 'Sólida', 0, 0, ['Sólida', 'Guiones', 'Puntos']]], wma20: [['len', 'Período', 'int', 20, 1, 500], ['color', 'Color y opacidad', 'color', '#4dd0e1'], ['width', 'Grosor', 'int', 1, 1, 6], ['dash', 'Estilo de línea', 'string', 'Sólida', 0, 0, ['Sólida', 'Guiones', 'Puntos']]],
  bollinger: [['len', 'Período', 'int', 20, 2, 500], ['mult', 'Desviaciones', 'float', 2, .1, 10], ['color', 'Color y opacidad', 'color', '#748bab'], ['width', 'Grosor', 'int', 1, 1, 6], ['dash', 'Estilo de línea', 'string', 'Guiones', 0, 0, ['Sólida', 'Guiones', 'Puntos']], ['fill', 'Relleno entre bandas', 'color', '#748bab00']],
  rsi: [['len', 'Período', 'int', 14, 2, 200], ['color', 'Color y opacidad', 'color', '#bb9cff'], ['width', 'Grosor', 'int', 2, 1, 6], ['ob', 'Nivel sobrecompra', 'int', 70, 50, 100], ['os', 'Nivel sobreventa', 'int', 30, 0, 50]],
  macd: [['fast', 'Rápida', 'int', 12, 1, 200], ['slow', 'Lenta', 'int', 26, 2, 400], ['sig', 'Señal', 'int', 9, 1, 100], ['cLine', 'Color línea MACD', 'color', '#548fff'], ['cSig', 'Color señal', 'color', '#f5a623'], ['hUp', 'Histograma positivo', 'color', '#089981'], ['hDn', 'Histograma negativo', 'color', '#f23645'], ['width', 'Grosor', 'int', 1, 1, 6]],
  stoch: [['k', 'Longitud %K', 'int', 14, 1, 200], ['ks', 'Suavizado %K', 'int', 3, 1, 50], ['d', 'Suavizado %D', 'int', 3, 1, 50], ['cK', 'Color %K', 'color', '#548fff'], ['cD', 'Color %D', 'color', '#f5a623'], ['lo', 'Nivel inferior', 'int', 20, 0, 50], ['hi', 'Nivel superior', 'int', 80, 50, 100], ['width', 'Grosor', 'int', 1, 1, 6]],
  atr: [['len', 'Período', 'int', 14, 1, 200], ['color', 'Color y opacidad', 'color', '#e07b53'], ['width', 'Grosor', 'int', 1, 1, 6]],
  supertrend: [['len', 'Período ATR', 'int', 10, 1, 200], ['factor', 'Factor', 'float', 3, .1, 20], ['up', 'Color alcista', 'color', '#089981'], ['down', 'Color bajista', 'color', '#f23645'], ['width', 'Grosor', 'int', 1, 1, 6]],
  vwap: [['color', 'Color y opacidad', 'color', '#ff8a65'], ['width', 'Grosor', 'int', 1, 1, 6], ['dash', 'Estilo de línea', 'string', 'Sólida', 0, 0, ['Sólida', 'Guiones', 'Puntos']]], obv: [['color', 'Color y opacidad', 'color', '#2ec4b6'], ['width', 'Grosor', 'int', 1, 1, 6]],
  volume: [['up', 'Color alcista y opacidad', 'color', '#089981aa'], ['down', 'Color bajista y opacidad', 'color', '#f23645aa']],
  dchan: [['len', 'Longitud del pivote (velas)', 'int', 5, 2, 30], ['count', 'Canales a mostrar (escalas)', 'int', 2, 1, 3], ['ext', 'Extender a la derecha (velas)', 'int', 25, 0, 200], ['mid', 'Línea media', 'string', 'Sí', 0, 0, ['Sí', 'No']], ['brk', 'Tolerancia de ruptura (× ATR)', 'float', 1, 0, 5], ['cUp', 'Color canal alcista', 'color', '#20bf9fb0'], ['cDn', 'Color canal bajista', 'color', '#f23645b0'], ['cFlat', 'Color canal lateral', 'color', '#8796abb0'], ['width', 'Grosor', 'int', 1, 1, 4], ['dash', 'Estilo de línea', 'string', 'Puntos', 0, 0, ['Sólida', 'Guiones', 'Puntos']]],
  patterns: [['len', 'Longitud del pivote (velas)', 'int', 5, 2, 30], ['dev', 'Movimiento mínimo (× ATR)', 'float', 1.5, .2, 10], ['tol', 'Tolerancia de proporciones (%)', 'int', 10, 2, 30], ['min', 'Puntuación mínima (0-100)', 'int', 60, 0, 100], ['max', 'Máximo de patrones a mostrar', 'int', 3, 1, 10], ['keep', 'Antigüedad máxima (velas)', 'int', 200, 20, 1000],
    ['g123', '1-2-3', 'string', 'Sí', 0, 0, ['Sí', 'No']], ['gabc', 'Corrección ABC', 'string', 'Sí', 0, 0, ['Sí', 'No']], ['gharm', 'Armónicos (ABCD, Gartley, Bat, Butterfly, Crab, Cypher)', 'string', 'Sí', 0, 0, ['Sí', 'No']], ['gchart', 'Chartistas (dobles, HCH, triángulos, cuñas)', 'string', 'Sí', 0, 0, ['Sí', 'No']], ['gell', 'Ondas de Elliott', 'string', 'Sí', 0, 0, ['Sí', 'No']],
    ['labels', 'Etiquetas de los puntos', 'string', 'Sí', 0, 0, ['Sí', 'No']], ['prz', 'Zona de reversión (PRZ) y objetivos', 'string', 'Sí', 0, 0, ['Sí', 'No']], ['panel', 'Panel con los patrones detectados', 'string', 'Sí', 0, 0, ['Sí', 'No']], ['cBull', 'Color alcista', 'color', '#089981'], ['cBear', 'Color bajista', 'color', '#f23645']],
  adx: [['len', 'Período', 'int', 14, 2, 100], ['cAdx', 'Color ADX', 'color', '#f5c568'], ['cP', 'Color +DI', 'color', '#089981'], ['cM', 'Color −DI', 'color', '#f23645'], ['lvl', 'Nivel de tendencia', 'int', 25, 5, 60], ['width', 'Grosor', 'int', 1, 1, 6]],
  cci: [['len', 'Período', 'int', 20, 2, 200], ['color', 'Color y opacidad', 'color', '#4dd0e1'], ['width', 'Grosor', 'int', 1, 1, 6]],
  willr: [['len', 'Período', 'int', 14, 2, 200], ['color', 'Color y opacidad', 'color', '#b58dff'], ['width', 'Grosor', 'int', 1, 1, 6]],
  mfi: [['len', 'Período', 'int', 14, 2, 200], ['color', 'Color y opacidad', 'color', '#ff8a65'], ['width', 'Grosor', 'int', 1, 1, 6]],
  roc: [['len', 'Período', 'int', 12, 1, 200], ['color', 'Color y opacidad', 'color', '#6ca5f9'], ['width', 'Grosor', 'int', 1, 1, 6]],
  stochrsi: [['rl', 'Longitud RSI', 'int', 14, 2, 100], ['sl', 'Longitud Estocástico', 'int', 14, 2, 100], ['ks', 'Suavizado %K', 'int', 3, 1, 50], ['ds', 'Suavizado %D', 'int', 3, 1, 50], ['cK', 'Color %K', 'color', '#548fff'], ['cD', 'Color %D', 'color', '#f5a623'], ['width', 'Grosor', 'int', 1, 1, 6]],
  ao: [['fast', 'Rápida', 'int', 5, 1, 100], ['slow', 'Lenta', 'int', 34, 2, 300], ['hUp', 'Color positivo', 'color', '#089981'], ['hDn', 'Color negativo', 'color', '#f23645']],
  cmf: [['len', 'Período', 'int', 20, 2, 200], ['hUp', 'Color positivo', 'color', '#089981'], ['hDn', 'Color negativo', 'color', '#f23645']],
  oi: [['color', 'Color y opacidad', 'color', '#f0b90b'], ['width', 'Grosor', 'int', 2, 1, 6]],
  funding: [['hUp', 'Color positivo', 'color', '#089981'], ['hDn', 'Color negativo', 'color', '#f23645']],
  lsr: [['cA', 'Color cuentas', 'color', '#6ca5f9'], ['cT', 'Color top traders', 'color', '#f5a623'], ['width', 'Grosor', 'int', 1, 1, 6]],
  taker: [['hUp', 'Color compradores', 'color', '#089981'], ['hDn', 'Color vendedores', 'color', '#f23645']],
  donchian: [['len', 'Período', 'int', 20, 2, 300], ['color', 'Color y opacidad', 'color', '#4dd0e1'], ['width', 'Grosor', 'int', 1, 1, 6], ['fill', 'Relleno entre bandas', 'color', '#4dd0e114']],
  keltner: [['len', 'Período EMA', 'int', 20, 2, 300], ['mult', 'Multiplicador ATR', 'float', 2, .1, 10], ['atr', 'Período ATR', 'int', 10, 1, 200], ['color', 'Color y opacidad', 'color', '#f5c568'], ['width', 'Grosor', 'int', 1, 1, 6], ['fill', 'Relleno entre bandas', 'color', '#f5c56814']],
  ichimoku: [['t', 'Tenkan', 'int', 9, 1, 100], ['k', 'Kijun', 'int', 26, 1, 200], ['b', 'Senkou B', 'int', 52, 1, 300], ['cT', 'Color Tenkan', 'color', '#2962ff'], ['cK', 'Color Kijun', 'color', '#b71c1c'], ['cUp', 'Nube alcista', 'color', '#08998133'], ['cDn', 'Nube bajista', 'color', '#f2364533'], ['cC', 'Color Chikou', 'color', '#43a047'], ['width', 'Grosor', 'int', 1, 1, 6]],
  psar: [['step', 'Paso', 'float', .02, .001, .5], ['max', 'Máximo', 'float', .2, .01, 1], ['up', 'Color alcista', 'color', '#089981'], ['down', 'Color bajista', 'color', '#f23645']],
  liqmap: [['rows', 'Resolución (filas de precio)', 'int', 140, 40, 300], ['gain', 'Intensidad (%)', 'int', 100, 30, 400], ['alpha', 'Opacidad (%)', 'int', 80, 20, 100]],
  vpvr: [['rows', 'Número de filas', 'int', 24, 4, 200], ['va', 'Área de valor (% del volumen)', 'int', 70, 10, 100], ['mode', 'Volumen', 'string', 'Arriba/Abajo', 0, 0, ['Arriba/Abajo', 'Total', 'Delta']], ['place', 'Ubicación', 'string', 'Derecha', 0, 0, ['Derecha', 'Izquierda']], ['wpct', 'Ancho (% del gráfico)', 'int', 30, 5, 90],
    ['cUp', 'Volumen comprador (arriba)', 'color', '#2962ff'], ['cDn', 'Volumen vendedor (abajo)', 'color', '#fbc02d'], ['pocOn', 'Línea POC', 'string', 'Sí', 0, 0, ['Sí', 'No']], ['cPoc', 'Color POC', 'color', '#ff5252'], ['vaOn', 'Líneas VAH / VAL', 'string', 'Sí', 0, 0, ['Sí', 'No']], ['cVa', 'Color VAH / VAL', 'color', '#2962ff']]
};
/* Copias de un mismo indicador (dos EMA, tres SMA…): la copia se llama base_c2, base_c3… y usa el esquema de su base */
const COPYABLE = {ema20: 'EMA', sma200: 'SMA', wma20: 'WMA', bollinger: 'Bollinger'}, COPY_RE = /^(ema20|sma200|wma20|bollinger)_c(\d{1,2})$/, MAX_COPIES = 8;
const baseOf = k => { const m = COPY_RE.exec(k); return m ? m[1] : k; }, isCopy = k => COPY_RE.test(k);
const STD_SCHEMA = new Proxy(STD_SCHEMA_BASE, {get: (t, k) => typeof k === 'string' && isCopy(k) ? t[baseOf(k)] : t[k]});
const COPY_COLS = ['#ff7ab6', '#4dd0e1', '#9ccc65', '#ffb74d', '#b39ddb', '#4fc3f7', '#f06292', '#aed581'];
const copyKeys = b => Object.keys(state.indicators || {}).filter(k => baseOf(k) === b && isCopy(k)).sort((x, y) => +x.split('_c')[1] - +y.split('_c')[1]);
function addCopy(b) { // agrega otra copia del indicador con su propio color (y para la EMA, otro período) y la deja encendida
  if (!COPYABLE[b]) return null; const have = copyKeys(b); if (have.length >= MAX_COPIES) { toast(`Máximo ${MAX_COPIES + 1} ${COPYABLE[b]}`); return null; }
  let n = 2; while (state.indicators[`${b}_c${n}`] !== undefined) n++; const k = `${b}_c${n}`;
  const q = Object.assign({}, (state.stdParams || {})[b]); q.color = COPY_COLS[(n - 2) % COPY_COLS.length];
  if (b !== 'bollinger') q.len = [50, 100, 200, 9, 21, 34, 89, 144][(n - 2) % 8];
  state.indicators[k] = true; state.stdParams = sanStdParams(Object.assign({}, state.stdParams, {[k]: q})); return k;
}
function removeCopy(k) { if (!isCopy(k)) return; delete state.indicators[k]; if (state.stdParams) delete state.stdParams[k]; if (state.stdHide) delete state.stdHide[k]; }
function bbands(c, bl, bm) { const n = c.length, m = sma(c, bl), up = Array(n).fill(null), lo = Array(n).fill(null); for (let i = bl - 1; i < n; i++) { let s = 0; for (let j = i - bl + 1; j <= i; j++) { const d = c[j] - m[i]; s += d * d; } const sd = Math.sqrt(s / bl); up[i] = m[i] + bm * sd; lo[i] = m[i] - bm * sd; } return {up, lo}; }
const sp = (key, name) => { const v = state.stdParams && state.stdParams[key] && state.stdParams[key][name]; if (v !== undefined) return v; const e = (STD_SCHEMA[key] || []).find(x => x[0] === name); return e ? e[3] : undefined; };
function sanStdParams(p) {
  const o = {}; if (!p || typeof p !== 'object' || Array.isArray(p)) return o;
  for (const key of [...Object.keys(STD_SCHEMA_BASE), ...Object.keys(p).filter(isCopy).slice(0, 40)]) { const src = p[key]; if (!src || typeof src !== 'object') continue; const q = {};
    for (const [nm, , type, def, mn, mx, opts] of STD_SCHEMA[key]) { const v = src[nm]; if (type === 'color') { if (typeof v === 'string' && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v) && v !== def) q[nm] = v; } else if (type === 'string') { if (typeof v === 'string' && opts && opts.includes(v) && v !== def) q[nm] = v; } else if (Number.isFinite(v)) { const x = type === 'int' ? Math.round(v) : v; if (x >= mn && x <= mx && x !== def) q[nm] = x; } }
    if (Object.keys(q).length) o[key] = q; }
  return o;
}
const PLUS_IND = ['vpvr', 'dchan', 'patterns'], PLUS_FREE = ['autofib']; // indicadores que se desbloquean con el plan Plus
const stdOn = k => !!state.indicators[k] && !(state.stdHide && state.stdHide[k]) && !(PLUS_IND.includes(k) && !planOk('proInd')); // activo y no oculto con el ojito de la leyenda
const stdName = k => isCopy(k) ? (baseOf(k) === 'bollinger' ? `Bollinger ${sp(k, 'len')}` : `${COPYABLE[baseOf(k)]} ${sp(k, 'len')}`) : ({derivs: 'Derivados en vivo', oi: 'Interés abierto', funding: 'Funding', lsr: 'Ratio Long/Short', taker: 'Compra/venta agresiva', ema20: `EMA ${sp('ema20', 'len')}`, ema50: `EMA ${sp('ema50', 'len')}`, sma200: `SMA ${sp('sma200', 'len')}`, wma20: `WMA ${sp('wma20', 'len')}`, bollinger: 'Bollinger', vwap: 'VWAP', supertrend: 'Supertrend', rsi: `RSI ${sp('rsi', 'len')}`, macd: 'MACD', stoch: 'Estocástico', atr: 'ATR', obv: 'OBV', volume: 'Volumen', adx: `ADX ${sp('adx', 'len')}`, cci: `CCI ${sp('cci', 'len')}`, willr: `Williams %R ${sp('willr', 'len')}`, mfi: `MFI ${sp('mfi', 'len')}`, roc: `ROC ${sp('roc', 'len')}`, stochrsi: 'Estoc. RSI', ao: 'Awesome Osc.', cmf: `CMF ${sp('cmf', 'len')}`, donchian: `Donchian ${sp('donchian', 'len')}`, keltner: `Keltner ${sp('keltner', 'len')}`, ichimoku: 'Ichimoku', psar: 'Parabolic SAR', vpvr: 'VPVR', liqmap: 'Liquidaciones (heatmap)', patterns: 'Patrones', dchan: 'Canales dinámicos', cross: 'Cruces EMA 20/50'}[k] || k);
const DASHES = {'Sólida': [], 'Guiones': [6, 4], 'Puntos': [1.5, 3]};
const lineSty = key => ({w: sp(key, 'width') || 1.4, d: DASHES[sp(key, 'dash')] || []});
const OLD_BG = /^#(0d1019|101725|090e19)$/i; // fondos por defecto anteriores: pasan al tema nuevo más oscuro
const cstyle = () => { const o = Object.assign({}, CHART_DEF, state.chartStyle || {}); if (OLD_BG.test(o.bg || '')) o.bg = CHART_DEF.bg; if (!(state.chartStyle && state.chartStyle.bg) && document.body.classList.contains('light')) o.bg = ''; return o; }; // fondo por defecto #07090e (el tema claro conserva el suyo)
/* Preferencias de interfaz que también viajan a la cuenta: altura de paneles, tamaño de paneles, opciones del dibujo (imán, bloquear…) y color/ícono de la app */
function sanUi(u) {
  const q = u && typeof u === 'object' && !Array.isArray(u) ? u : {}, o = {};
  const sanPanes = c => { const r = {}; if (c && typeof c === 'object') { if (c.paneH && typeof c.paneH === 'object' && !Array.isArray(c.paneH)) { const h = {}; for (const [k, v] of Object.entries(c.paneH).slice(0, 24)) if (/^[A-Za-z0-9:_-]{1,40}$/.test(k) && Number.isFinite(v) && ((v > 0 && v <= 1) || (v >= 20 && v <= 3000))) h[k] = v <= 1 ? +v.toFixed(4) : Math.round(v); r.paneH = h; } if (c.man && typeof c.man === 'object' && !Array.isArray(c.man)) { const m = {}; for (const [k, v] of Object.entries(c.man).slice(0, 24)) if (/^[A-Za-z0-9:_-]{1,40}$/.test(k) && Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) && v[1] > v[0]) m[k] = [+v[0], +v[1]]; r.man = m; } if (Number.isFinite(c.paneScale) && c.paneScale >= .6 && c.paneScale <= 3) r.paneScale = c.paneScale; if (Array.isArray(c.order)) r.order = c.order.filter(k => typeof k === 'string' && /^[A-Za-z0-9:_-]{1,40}$/.test(k)).slice(0, 64); } return r; };
  if (q.panes && typeof q.panes === 'object') { o.panes = {}; for (const k of ['pc', 'movil']) if (q.panes[k]) o.panes[k] = sanPanes(q.panes[k]); } // tamaño de paneles: uno para PC y otro para móvil
  if (q.dopt && typeof q.dopt === 'object' && !Array.isArray(q.dopt)) { const d = {}; for (const k of ['magnet', 'stay', 'lock', 'hide']) if (typeof q.dopt[k] === 'boolean') d[k] = q.dopt[k]; o.dopt = d; }
  if (typeof q.icon === 'string' && /^[a-z][a-z0-9]{2,11}$/.test(q.icon)) o.icon = q.icon;
  if (q.prefs && typeof q.prefs === 'object') o.prefs = CCTPrefs.sanitize(q.prefs);
  if (q.favBar && typeof q.favBar === 'object') { const f = q.favBar, c01 = v => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null; o.favBar = {show: f.show !== false, x: c01(f.x), y: c01(f.y), mx: c01(f.mx), my: c01(f.my)}; }
  if (Array.isArray(q.pillFavs)) o.pillFavs = q.pillFavs.filter(x => typeof x === 'string' && /^[A-Za-z0-9-]{2,40}$/.test(x)).slice(0, 5); // favoritos de la píldora del celular (se sincronizan con tu cuenta)
  if (Array.isArray(q.favs)) o.favs = q.favs.filter(x => typeof x === 'string' && /^[a-zA-Z0-9]{2,24}$/.test(x)).slice(0, 24);
  if (Array.isArray(q.myColors)) o.myColors = [...new Set(q.myColors.filter(x => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x)).map(x => x.toLowerCase()))].slice(0, 20); // «Mis colores» de la paleta (se comparten en toda la app y en tu cuenta)
  return o;
}
function sanDrawExtra(d) { // estilo propio de cada dibujo: color, grosor, estilo de línea, texto, bloqueo y visibilidad
  const o = {...d}, hex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  if (o.col != null && !hex(o.col)) delete o.col;
  if (o.tc != null && !hex(o.tc)) delete o.tc;
  if (o.lw != null) { const v = +o.lw; if (Number.isFinite(v) && v > 0) o.lw = Math.min(24, Math.max(.5, v)); else delete o.lw; }
  if (o.ds != null && o.ds !== 'dash' && o.ds !== 'dot') delete o.ds;
  if (o.ts != null) { const v = Math.round(+o.ts); if (Number.isFinite(v)) o.ts = Math.max(8, Math.min(36, v)); else delete o.ts; }
  if (o.label != null) { o.label = String(o.label).slice(0, 80); if (!o.label) delete o.label; }
  if (o.sp != null) { const v = +o.sp; if (Number.isFinite(v) && v > 0) o.sp = v; else delete o.sp; } // Long/Short: precio del stop puesto a mano
  if (o.gc != null && !hex(o.gc)) delete o.gc; if (o.rc != null && !hex(o.rc)) delete o.rc; // Long/Short: color del objetivo y del stop
  for (const k of ['nt', 'no', 'ns', 'nr']) if (o[k] !== true) delete o[k]; // Long/Short: ocultar título / texto del objetivo / texto del stop
  if (o.lock !== true) delete o.lock; if (o.hide !== true) delete o.hide;
  if (o.o != null) { const x = CCTDrawCfg.sanitize(o.o); if (x) o.o = x; else delete o.o; } // ajustes propios de la herramienta (niveles, fondo, extensiones…)
  return o;
}
function tabCfgSan(cfg) { // configuración propia de cada pestaña (indicadores, sus ajustes, colores, paneles): misma limpieza que una plantilla
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return {}; const d = sanDesigns([{id: 'tab', name: 'tab', snap: cfg}])[0]; if (!d) return {};
  delete d.snap.ctype; return {cfg: d.snap};
}
const DESIGN_KEYS = ['indicators', 'stdParams', 'stdHide', 'pine', 'chartStyle', 'ctype', 'novaParams', 'novaSaved', 'pn'];
function sanDesigns(a) { // diseños guardados (configuración completa del gráfico): máx. 20 y de tamaño acotado, viajan a la cuenta
  const out = [], seen = new Set(); if (!Array.isArray(a)) return out;
  for (const d of a) {
    if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !/^[\w-]{1,24}$/.test(d.id) || seen.has(d.id) || !d.snap || typeof d.snap !== 'object' || Array.isArray(d.snap)) continue;
    const s = {}; for (const k of DESIGN_KEYS) if (d.snap[k] !== undefined) s[k] = d.snap[k];
    if (s.chartStyle) s.chartStyle = sanChartStyle(s.chartStyle); if (s.stdParams) s.stdParams = sanStdParams(s.stdParams);
    if (s.pn) { const q = s.pn && typeof s.pn === 'object' ? s.pn : {}, h = {}; if (q.paneH && typeof q.paneH === 'object') for (const [k, v] of Object.entries(q.paneH).slice(0, 24)) if (/^[A-Za-z0-9:_-]{1,40}$/.test(k) && Number.isFinite(+v)) h[k] = +v; s.pn = {paneH: h, paneScale: Number.isFinite(+q.paneScale) ? Math.max(.6, Math.min(3, +q.paneScale)) : 1.25, order: Array.isArray(q.order) ? q.order.filter(x => typeof x === 'string').slice(0, 64) : []}; }
    if (JSON.stringify(s).length > 24000) continue;
    seen.add(d.id); out.push({id: d.id, name: String(d.name || 'Diseño').slice(0, 40), t: +d.t || 0, snap: s}); if (out.length >= 20) break;
  }
  return out;
}
/* Nexus Pixel personalizado: tu estilo, reglas, notas, cómo te habla y cómo dibuja (se edita en la tarjeta de Pixel de la IA) */
const PIX_OPT = {estilo: ['scalping', 'intradía', 'swing', 'largo plazo'], riesgo: ['conservador', 'moderado', 'agresivo'], tono: ['corto y directo', 'explicado paso a paso'], trato: ['amigable', 'serio', 'divertido'], color: ['purple', 'blue', 'orange', 'mint', 'red'], completo: ['sr', 'trend', 'channel', 'range', 'fib']};
function sanPixel(x) {
  const q = x && typeof x === 'object' && !Array.isArray(x) ? x : {}, pick = (k, d) => PIX_OPT[k].includes(q[k]) ? q[k] : d, txt = (v, n) => typeof v === 'string' ? v.slice(0, n) : '', hex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '';
  return {nombre: txt(q.nombre, 30), estilo: pick('estilo', 'intradía'), riesgo: pick('riesgo', 'moderado'), tono: pick('tono', 'corto y directo'), trato: pick('trato', 'amigable'), color: pick('color', 'purple'),
    tfs: Array.isArray(q.tfs) ? q.tfs.filter(t => INTERVALS.includes(t)).slice(0, 6) : [], reglas: txt(q.reglas, 1500), notas: txt(q.notas, 1000),
    sr: Math.max(1, Math.min(5, Math.round(+q.sr) || 3)), colSup: hex(q.colSup), colRes: hex(q.colRes),
    tips: q.tips !== false, vigia: [0, 5, 15, 30].includes(+q.vigia) && q.vigia != null && q.vigia !== '' ? +q.vigia : 15, completo: Array.isArray(q.completo) && q.completo.filter(k => PIX_OPT.completo.includes(k)).length ? q.completo.filter(k => PIX_OPT.completo.includes(k)) : ['sr', 'trend', 'channel'], at: +q.at || 0};
}
const sanTpl = t => ({...(typeof t.k === 'string' && /^[a-z0-9_]{1,24}$/i.test(t.k) ? {k: t.k} : {}), ...(/^#[0-9a-f]{6}$/i.test(t.gc) ? {gc: t.gc} : {}), ...(/^#[0-9a-f]{6}$/i.test(t.rc) ? {rc: t.rc} : {}), ...['nt', 'no', 'ns', 'nr'].reduce((a, f) => typeof t[f] === 'boolean' ? (a[f] = t[f], a) : a, {}), ...(/^#[0-9a-f]{6}$/i.test(t.col) ? {col: t.col} : {}), ...(Number.isFinite(+t.lw) && +t.lw > 0 ? {lw: Math.min(24, +t.lw)} : {}), ...(t.ds === 'dash' || t.ds === 'dot' ? {ds: t.ds} : {}), ...(/^#[0-9a-f]{6}$/i.test(t.tc) ? {tc: t.tc} : {}), ...(Number.isFinite(+t.ts) && +t.ts > 0 ? {ts: Math.max(8, Math.min(36, Math.round(+t.ts)))} : {}), ...dSanO(t.o)});
function dSanO(o) { const x = o ? CCTDrawCfg.sanitize(o) : null; return x ? {o: x} : {}; } // ajustes propios de la herramienta (draw-cfg.js)
function merge(s) {
  const o = {...structuredClone(defaults), ...s};
  o.indicators = {...defaults.indicators, ...(s.indicators || {})};
  for (const k of Object.keys(o.indicators)) if (/_c\d+$/.test(k) && (!isCopy(k) || typeof o.indicators[k] !== 'boolean')) delete o.indicators[k]; // copias (EMA 2, SMA 2…): solo las válidas
  if (!o.drawings || typeof o.drawings !== 'object' || Array.isArray(o.drawings)) o.drawings = {};
  { // pincel: solo trazos bien formados y de tamaño acotado (el estado completo viaja en un documento de Firestore de máx. 1 MB)
    const okPt = q => Array.isArray(q) && q.length === 2 && Number.isFinite(q[0]) && Number.isFinite(q[1]);
    for (const k of Object.keys(o.drawings)) {
      const arr = Array.isArray(o.drawings[k]) ? o.drawings[k] : [];
      const clean = arr.filter(d => d && typeof d === 'object' && (d.type === 'brush' ? (Array.isArray(d.pts) && d.pts.length >= 2 && d.pts.length <= 400 && d.pts.every(okPt)) : (d.pts == null || (Array.isArray(d.pts) && d.pts.length >= 2 && d.pts.length <= 12 && d.pts.every(q => q && Number.isFinite(q.t) && Number.isFinite(q.p)))))).slice(-300)
        .map(d => d.type === 'brush' ? {id: String(d.id || '').slice(0, 16), type: 'brush', pts: d.pts, a: {t: d.pts[0][0], p: d.pts[0][1]}, col: /^#[0-9a-f]{6}$/i.test(d.col) ? d.col : '#e9c36e', w: Math.max(1, Math.min(24, +d.w || 3)), ...(d.hl === true ? {hl: true} : {}), ...(d.lock === true ? {lock: true} : {}), ...(d.hide === true ? {hide: true} : {}), ...dSanO(d.o)} : sanDrawExtra(d));
      if (clean.length) o.drawings[k] = clean; else delete o.drawings[k];
    }
    const bq = o.brush && typeof o.brush === 'object' ? o.brush : {};
    o.brush = {c: /^#[0-9a-f]{6}$/i.test(bq.c) ? bq.c : '#e9c36e', w: Math.max(1, Math.min(24, Math.round(+bq.w) || 3))};
    o.lastStyle = o.lastStyle && typeof o.lastStyle === 'object' && !Array.isArray(o.lastStyle) ? Object.fromEntries(Object.entries(o.lastStyle).filter(([k, v]) => /^[a-z0-9_]{1,24}$/i.test(k) && v && typeof v === 'object').slice(0, 60).map(([k, t]) => [k, sanTpl(t)])) : {}; // última configuración por herramienta
    o.drawTpl = Array.isArray(o.drawTpl) ? o.drawTpl.filter(t => t && typeof t === 'object' && typeof t.n === 'string' && t.n.trim()).slice(0, 80).map(t => ({n: t.n.slice(0, 24), ...sanTpl(t)})) : [];
  }
  o.novaParams = o.novaParams && typeof o.novaParams === 'object' && !Array.isArray(o.novaParams) ? Object.fromEntries(Object.entries(o.novaParams).filter(([k, v]) => /^[a-zA-Z0-9]{1,24}$/.test(k) && (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'boolean' || (typeof v === 'string' && v.length < 400))).slice(0, 120)) : {};
  o.ui = sanUi(o.ui); o.acct = sanAcct(o.acct); o.risk = sanRisk(o.risk); o.moveAlerts = sanMoveAlerts(o.moveAlerts); o.scrPush = sanScrPush(o.scrPush); o.discord = sanDiscord(o.discord);
  o.novaSaved = o.novaSaved && typeof o.novaSaved === 'object' && !Array.isArray(o.novaSaved) ? o.novaSaved : null;
  o.pine = Array.isArray(o.pine) ? o.pine.filter(p => p && typeof p.sid === 'string').slice(0, 12).map(p => Object.assign({sid: p.sid, on: p.on !== false, inputs: p.inputs && typeof p.inputs === 'object' && !Array.isArray(p.inputs) ? p.inputs : {}}, p.style && typeof p.style === 'object' && !Array.isArray(p.style) ? {style: p.style} : {}, p.vis && typeof p.vis === 'object' && !Array.isArray(p.vis) ? {vis: p.vis} : {}, ['main', 'top', 'bottom'].includes(p.pane) ? {pane: p.pane} : {}, p.hide === true ? {hide: true} : {})) : [];
  { // Nova Nexus: queda un solo indicador, el completo (Pine, en Mis indicadores). El módulo nativo antiguo se apaga y, si estaba encendido, se pasa al completo para no perderlo
    const nnKeys = Object.keys(o.indicators).filter(k => /^nn[A-Z]/.test(k)), nnWasOn = nnKeys.some(k => o.indicators[k]);
    nnKeys.forEach(k => { o.indicators[k] = false; }); o.novaSaved = null;
    if (nnWasOn && !o.pine.some(p => p.sid === 'cat:nova-nexus') && o.pine.length < 12) o.pine.unshift({sid: 'cat:nova-nexus', on: true, inputs: {}});
  }
  o.source = Object.prototype.hasOwnProperty.call(SOURCES, o.source) ? o.source : 'binance';
  if (o.source !== 'binance' && window.CCTMarkets) { // antes la fuente era global: ahora cada activo lleva su exchange; se conservan los que ya usaba
    const sv = o.source, cv = k => { if (k.includes('@')) return k; const p = CCTMarkets.splitQ(k); return CCTMarkets.mk(['okx', 'coinbase', 'bingx'].includes(sv) && p ? p[0] + '-' + p[1] : k, sv); };
    o.symbols = o.symbols.map(cv); if (typeof o.symbol === 'string') o.symbol = cv(o.symbol); o.source = 'binance';
  }
  { // secciones del seguimiento: [{id, name, collapsed}] y a cuál pertenece cada activo
    const gs = []; if (Array.isArray(o.groups)) for (const x of o.groups.slice(0, 30)) if (x && typeof x.id === 'string' && /^[\w-]{1,24}$/.test(x.id) && typeof x.name === 'string' && !gs.some(y => y.id === x.id)) gs.push({id: x.id, name: x.name.slice(0, 40), collapsed: !!x.collapsed});
    o.groups = gs; const sg = {}; if (o.symGroup && typeof o.symGroup === 'object' && !Array.isArray(o.symGroup)) for (const [k, v] of Object.entries(o.symGroup)) if (o.symbols.includes(k) && gs.some(y => y.id === v)) sg[k] = v;
    o.symGroup = sg;
    const sc = {}; if (o.symColor && typeof o.symColor === 'object' && !Array.isArray(o.symColor)) for (const [k, v] of Object.entries(o.symColor)) if (o.symbols.includes(k) && TAGS.some(t => t[0] === v)) sc[k] = v;
    o.symColor = sc; o.listRev = Number.isFinite(+o.listRev) && +o.listRev > 0 ? +o.listRev : 0;
  }
  o.layout = ['1', '2v', '2h', '3', '4', '5'].includes(o.layout) ? o.layout : '1'; o.ctype = CTYPES.some(c => c[0] === o.ctype) ? o.ctype : 'candles'; o.chartStyle = sanChartStyle(o.chartStyle); o.stdParams = sanStdParams(o.stdParams);
  o.stdHide = o.stdHide && typeof o.stdHide === 'object' && !Array.isArray(o.stdHide) ? Object.fromEntries(Object.keys(o.stdHide).filter(k => o.stdHide[k] === true && Object.prototype.hasOwnProperty.call(o.indicators, k) && !k.startsWith('nn') && o.indicators[k]).map(k => [k, true])) : {}; // «oculto» (ojito) ≠ «apagado»: sigue activo en Indicadores, solo no se dibuja
  o.designs = sanDesigns(o.designs);
  o.pixel = sanPixel(o.pixel); // personalización de Nexus Pixel (viaja con tu cuenta)
  o.alerts = Array.isArray(o.alerts) ? o.alerts.map(sanAlert).filter(Boolean).slice(0, 50) : [];
  if (!Array.isArray(o.symbols) || !o.symbols.length) o.symbols = [...defaults.symbols];
  if (!INTERVALS.includes(o.interval)) o.interval = '1h';
  o.tabs = Array.isArray(o.tabs) ? o.tabs.filter(t => t && typeof t.s === 'string' && /^[\w.:@\-/]{2,40}$/.test(t.s)).slice(0, 8).map((t, i) => Object.assign({id: /^[a-z0-9]{3,12}$/.test(t.id) ? t.id : 't' + i + Date.now().toString(36).slice(-4), s: t.s, i: INTERVALS.includes(t.i) ? t.i : '1h', c: CTYPES.some(x => x[0] === t.c) ? t.c : 'candles'}, typeof t.n === 'string' && t.n.trim() ? {n: t.n.trim().slice(0, 24)} : {}, tabCfgSan(t.cfg))) : [];
  o.tab = typeof o.tab === 'string' ? o.tab.slice(0, 12) : ''; o.tabRev = Number.isFinite(+o.tabRev) ? +o.tabRev : 0;
  if (typeof o.symbol !== 'string') o.symbol = o.symbols[0];
  return o;
}
/* Cuenta de Google (Firebase) — opcional: se activa si firebase-config.js define window.CCT_FIREBASE */
const CFG = window.CCT_FIREBASE, cloudEnabled = !!(CFG && CFG.apiKey && CFG.projectId);
const LASTUID = 'cct_last_uid', CLOUD_DOC = u => `users/${u}/data/cct_mobile`;
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
let uid = cloudEnabled ? lsGet(LASTUID) : null, fbUser = null, auth = null, db = null, unsubCloud = null, unsubScripts = null, pushTimer = 0, lastRemote = '', syncStatus = '';
/* Colores de clasificación (se define aquí arriba: el estado guardado se limpia al arrancar y necesita esta lista) */
const TAGS = [['#f23645', 'Rojo'], ['#ff9800', 'Naranja'], ['#fbc02d', 'Amarillo'], ['#089981', 'Verde'], ['#00bcd4', 'Cian'], ['#2962ff', 'Azul'], ['#9c27b0', 'Morado'], ['#e91e63', 'Rosa']];
const storeKey = () => uid ? `${STORE}_${uid}` : STORE;
const readLocal = key => { try { return JSON.parse(lsGet(key) || '{}'); } catch { return {}; } };
const LAY_KEY = 'cct_layout_pref_v1', LAY_OK = ['1', '2v', '2h', '3', '4', '5']; // el diseño (1 a 5 gráficos) depende de la pantalla de cada dispositivo: se guarda aquí y no lo pisa la nube
let layoutNow = null; // diseño en uso en este dispositivo (se actualiza al elegirlo)
const withLocalLayout = o => { const lp = lsGet(LAY_KEY) || layoutNow; return lp && LAY_OK.includes(lp) && o && typeof o === 'object' ? {...o, layout: lp} : o; };
let state = merge(withLocalLayout(readLocal(storeKey()))), stateUid = uid; // stateUid: de qué cuenta viene el estado en memoria
let PR = CCTPrefs.sanitize((state.ui || {}).prefs); // preferencias: zona horaria, decimales, sonido y avisos (viajan a la cuenta)
if (PANE) { document.body.classList.add('pane'); const q = new URLSearchParams(location.search); if (!lsGet(STORE)) { state.symbol = /^[A-Z0-9]{5,15}$/.test(q.get('sym') || '') ? q.get('sym') : ['ETHUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'][PANE_N - 1]; } state.light = q.get('light') === '1'; }
const dirtyKey = () => uid ? `${STORE}_dirty_${uid}` : null;
const persistLocal = () => { try { localStorage.setItem(storeKey(), JSON.stringify(state)); } catch {} };
let remoteRev = 0; // versión (rev) más reciente que se sabe que hay en la nube
/* listRev: cuándo se cambió por última vez la lista de seguimiento (orden de monedas y secciones, sección y color de cada una). Al mezclar con la nube gana la lista más reciente:
   antes se usaba siempre el orden de la nube, y si otro dispositivo guardaba al mismo tiempo, el orden que acababas de arrastrar se deshacía. */
const listSigOf = st => JSON.stringify([st.symbols, st.groups, st.symGroup, st.symColor]);
let listSig = listSigOf(state);
let cfgLive = false; // vista previa de una ventana de ajustes: se ve en el gráfico pero no se guarda hasta «Aceptar»
const save = () => { if (cfgLive) return; tabTouch(); const ls = listSigOf(state); if (ls !== listSig) { listSig = ls; state.listRev = Date.now(); } state.rev = Math.max(Date.now(), (+state.rev || 0) + 1, (+remoteRev || 0) + 1); try { localStorage.setItem(storeKey(), JSON.stringify(state)); const dk = dirtyKey(); if (dk) localStorage.setItem(dk, String(Date.now())); } catch {} cloudPush(); };

/* ───────── Utilidades ───────── */
const catalog = {BTC:['Bitcoin','₿'],ETH:['Ethereum','Ξ'],SOL:['Solana','◎'],BNB:['BNB','◆'],XRP:['XRP','✕'],DOGE:['Dogecoin','Ð'],ADA:['Cardano','₳'],AVAX:['Avalanche','▲'],LINK:['Chainlink','⬡'],DOT:['Polkadot','●'],LTC:['Litecoin','Ł'],TRX:['TRON','◈'],SUI:['Sui','≋'],NEAR:['NEAR','N'],ATOM:['Cosmos','A'],UNI:['Uniswap','U'],ARB:['Arbitrum','A'],OP:['Optimism','O'],APT:['Aptos','A'],PEPE:['Pepe','P']};
const QUOTES = ['USDT', 'USDC', 'FDUSD', 'USD', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY', 'BRL']; // monedas de cotización admitidas (ETHBTC = ETH/BTC)
const splitSym = s0 => { if (window.CCTMarkets && CCTMarkets.srcOf(s0) === 'dom') return [CCTMarkets.symOf(s0), '']; const s = window.CCTMarkets ? CCTMarkets.norm(CCTMarkets.symOf(s0)) : s0; for (const q of QUOTES) if (s.length > q.length + 1 && s.endsWith(q)) return [s.slice(0, -q.length), q]; return [s, 'USDT']; };
const srcOf = k => window.CCTMarkets ? CCTMarkets.srcOf(k) : 'binance', symOf = k => window.CCTMarkets ? CCTMarkets.symOf(k) : k, exName = k => (window.CCTMarkets ? CCTMarkets.EXCH[srcOf(k)] : 'Binance') || 'Binance';
const baseOnly = s => splitSym(s)[0], quoteOf = s => splitSym(s)[1], pairLbl = s => quoteOf(s) ? `${baseOnly(s)}/${quoteOf(s)}` : baseOnly(s);
const base = s => { const [b, q] = splitSym(s); return q === 'USDT' || !q ? b : b + '/' + q; };
const meta = s => catalog[baseOnly(s)] || [base(s), baseOnly(s).slice(0, 1)];
const fmt = n => CCTPrefs.formatPrice(n, PR);
const pct = n => !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer;
/* Menús y ventanas de ajustes: se desvanecen al cerrarse (la entrada la pone glass.css) */
function uxOut(el, ms = 150) { if (!el || el.classList.contains('ux-out')) return; el.classList.add('ux-out'); if (el.id) el.removeAttribute('id'); el.style.pointerEvents = 'none'; setTimeout(() => el.remove(), ms); }
function toast(msg) { if (cfgLive) return; const el = $('#toast'); el.textContent = msg; el.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.style.display = 'none', 2400); }
function updateStatus(ok, msg) { $('#connection').textContent = '● ' + msg; $('#connection').className = 'connection ' + (ok ? 'online' : 'offline'); }
async function getJSON(url, signal) { const r = await fetch(url, {signal}); if (!r.ok) throw Error('Binance HTTP ' + r.status); return r.json(); }

/* ───────── Variables de ejecución ───────── */
let tickers = {}, candles = [], ind = {}, visible = 70, pan = 0, fetchCtl = null, botMarks = null; // botMarks: operaciones de Nova Bot Lab dibujadas sobre el gráfico
let currentView = 'watchView', sheetMode = 'select', editMode = false;
let pineLastMs = 0, pineRes = {}, pineBusy = {}, pineDirty = {}, pineLast = 0, pineTimer = 0, pineKey = '', pineDraft = {name: '', code: ''}, pineSetSid = null, pineWorker = null, pineNoWorker = false, pineSeq = 0;
const PINE_MAX = 6;
let drawTool = '', pending = null, pending2 = null, preview = null, selectedId = null, cross = null, geo = null, multi = [];
let paneMan = {}, paneHit = []; // escala vertical manual por panel (oscilador, RSI…) y su zona táctil; se llena al dibujar
let priceMan = null, lastAxisTap = 0; // escala de precio manual {min,max}; null = automática
let ws = null, wsGen = 0, wsOpen = false, wsRetry = 0, wsPing = 0, dataSrc = 'binance';
const lastShown = {};

/* ───────── Navegación ───────── */
const deskMQ = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : {matches: false};
const isDesktop = () => deskMQ.matches;
const SUB_VIEWS = ['alertsView', 'discordView', 'customView', 'notifView']; let alBackTo = ''; // a dónde regresa el botón ‹ de Alertas
function setSide(id) {
  { const cur = document.body.dataset.side; if (id === 'alertsView' && cur && !SUB_VIEWS.includes(cur)) alBackTo = cur; }
  document.body.dataset.side = id;
  if (id === 'lensView') { const f = $('#lensFrame'); if (f && !f.src) f.src = f.dataset.src; } // Nexus Lens se carga la primera vez que se abre
  $$('.right-rail [data-side]').forEach(b => b.classList.toggle('active', b.dataset.side === (id === 'customView' || id === 'notifView' ? 'settingsView' : id)));
}
function switchView(id) {
  if (isDesktop()) { // computadora: seguimiento + gráfico siempre visibles; Indicadores/Ajustes en el panel derecho
    if (id === 'watchView' || id === 'newsView' || id === 'aiView' || id === 'settingsView' || id === 'alertsView' || id === 'screenerView' || id === 'lensView' || id === 'discordView' || id === 'botLabView' || id === 'customView' || id === 'notifView') { setSide(id); if (id === 'customView') renderCustom(); if (id === 'notifView') { renderPrefs(); if (window.VortexPush) VortexPush.render(); } if (id === 'watchView') { wlOpenSym = null; renderWatch(); } if (id === 'alertsView') { renderAlerts(); checkAlertsPoll(); } return; }
    id = 'chartView';
  }
  if (id === 'alertsView' && currentView !== id && !SUB_VIEWS.includes(currentView)) alBackTo = currentView;
  currentView = id; if (id === 'customView') renderCustom(); if (id === 'notifView') { renderPrefs(); if (window.VortexPush) VortexPush.render(); }
  if (id === 'lensView') { const f = $('#lensFrame'); if (f && !f.src) f.src = f.dataset.src; }
  $$('.view').forEach(x => x.classList.toggle('active', x.id === id));
  $$('.bottom-nav button').forEach(x => x.classList.toggle('active', x.dataset.view === id));
  { const ta = $('#topAlertsBtn'); if (ta) ta.classList.toggle('active', id === 'alertsView'); } // celular: Alertas vive arriba, junto a Notificaciones
  document.body.classList.toggle('chart-mode', id === 'chartView');
  if (id === 'chartView' && typeof dvRefresh === 'function') setTimeout(() => dvRefresh(), 0);
  if (id !== 'chartView') document.body.classList.remove('expanded');
  if (id === 'chartView') requestAnimationFrame(() => { if (!candles.length) loadCandles(); render(); });
  if (id === 'watchView') { wlOpenSym = null; renderWatch(); }
  if (id === 'alertsView') { renderAlerts(); checkAlertsPoll(); if (window.CCTRadar) CCTRadar.paint(); }
  if (isDesktop()) renderWatch();
  syncFullscreenLabel();
}
$$('.bottom-nav button').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
$('#settingsBtn').onclick = () => switchView('settingsView');
/* Centro de avisos: todo en la vista Alertas, en tres pestañas (Mis alertas · Cómo te aviso · Movimientos bruscos) */
let alTab = 'list';
function setAlTab(t) {
  alTab = t; $$('#alertsView [data-altab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.altab === t)));
  $$('#alertsView [data-alpane]').forEach(p => { p.hidden = p.dataset.alpane !== t; });
  if (t === 'move') { renderMoveAlerts(); renderScrPush(); scrStatus(); if (window.CCTRadar) CCTRadar.paint(); }
}
function alTabCount() { const n = (state.alerts || []).filter(a => a.on).length, e = $('#alTabN'); if (e) e.textContent = n ? String(n) : ''; }
function openAlerts(t) { switchView('alertsView'); setAlTab(t || alTab); }
$$('#alertsView [data-altab]').forEach(b => b.addEventListener('click', () => setAlTab(b.dataset.altab)));
{ const bk = $('#alBack'); if (bk) bk.onclick = () => switchView(alBackTo && alBackTo !== 'alertsView' ? alBackTo : (isDesktop() ? 'watchView' : 'chartView')); } // ‹ regresa a donde estabas antes de abrir Alertas
{ const bk = $('#cuBack'); if (bk) bk.onclick = () => switchView('settingsView'); const sc = $('#setCustom'); if (sc) sc.onclick = () => switchView('customView'); }
document.addEventListener('click', e => { if (!e.target.closest('#alDiscord')) return; window.CCT_dcBack = 'notifView'; switchView('discordView'); if (window.CCTDiscord) setTimeout(() => CCTDiscord.paint(), 0); }); // el botón se vuelve a dibujar con los avisos
{ const s2 = $('#setAlerts'); if (s2) s2.onclick = () => switchView('notifView'); const nb = $('#ntBack'); if (nb) nb.onclick = () => switchView('settingsView'); } // Avisos viven en Configuración; Alertas = solo Mis alertas e Historial
{ const ta = $('#topAlertsBtn'); if (ta) ta.onclick = () => switchView('alertsView'); }
let prevSide = ''; // panel que estaba abierto antes del clic en la barra de iconos (volver a tocar el mismo lo oculta)
$$('.right-rail [data-side]').forEach(b => b.addEventListener('click', () => { prevSide = document.body.dataset.side || 'watchView'; setSide(b.dataset.side); }));
$('#scrOpen').addEventListener('click', () => { if (isDesktop()) setSide('screenerView'); else switchView('screenerView'); }); // celular: el Screener es una vista completa
function onLayoutChange() {
  if (isDesktop()) { setSide(document.body.dataset.side || 'watchView'); switchView('chartView'); }
  else { delete document.body.dataset.side; document.body.classList.remove('expanded'); switchView('watchView'); }
  requestAnimationFrame(() => { if (candles.length) { visible = defaultVisible(); pan = 0; } render(); });
}
if (deskMQ.addEventListener) deskMQ.addEventListener('change', onLayoutChange);

/* ───────── 1 · Seguimiento ───────── */
/* Fotos de las criptomonedas: logo real desde un CDN público (CoinCap, y de respaldo el set cryptocurrency-icons); si ninguno existe se queda la inicial de siempre */
const COIN_SRC = [b => `https://assets.coincap.io/assets/icons/${b}@2x.png`, b => `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/${b}.png`];
const coinKey = b => { b = String(b || '').toLowerCase().replace(/^(?:1000000|1000|1m)(?=[a-z])/, ''); return /^[a-z0-9]{1,12}$/.test(b) ? b : ''; };
const coinImg = b => { const k = coinKey(b); return k ? `<img class="coin-img" src="${COIN_SRC[0](k)}" data-k="${k}" data-i="0" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''; };
document.addEventListener('error', e => { const im = e.target; if (!im || !im.classList || !im.classList.contains('coin-img')) return; const i = +im.dataset.i + 1; if (i < COIN_SRC.length) { im.dataset.i = i; im.src = COIN_SRC[i](im.dataset.k); } else im.remove(); }, true);
document.addEventListener('load', e => { const im = e.target; if (im && im.classList && im.classList.contains('coin-img') && im.naturalWidth > 1) im.parentNode.classList.add('has-img'); }, true);
function coinBadge(s) {
  const b = baseOnly(s);
  return `<span class="coin-icon ${b === 'ETH' ? 'eth' : b === 'SOL' ? 'sol' : b === 'BNB' ? 'bnb' : b === 'XRP' ? 'xrp' : b === 'BTC' ? '' : 'other'}">${esc(meta(s)[1])}${b.endsWith('.D') ? '' : coinImg(b)}</span>`;
}
/* Mini gráficos (sparklines) de la lista: últimas 24 h con velas de 30 min de Binance Spot (49 puntos: la apertura de la primera vela y el cierre de cada una).
   El último punto se sustituye por el precio en vivo del ticker. Verde si la moneda sube en 24 h, rojo si baja (el mismo signo que el % de la fila). Sin datos no se dibuja nada inventado. */
const SPARK_TTL = 300000, SPARK_RETRY = 60000, spark = {}; let sparkBusy = false;
const sparkStale = s => { const e = spark[s]; return !e || Date.now() - e.ts > (e.v ? SPARK_TTL : SPARK_RETRY); };
async function sparkOne(s) {
  try { const sr = srcOf(s), f = SRC_FETCH[sr], k = sr === 'binance' ? (await getJSON(`${API}/klines?symbol=${s}&interval=30m&limit=48`)).map(bnRow) : await (f && f.ok('30m') ? f.get(symOf(s), '30m', 48) : f.get(symOf(s), '1h', 24)).then(a => a.slice(-48)), v = [k[0].o, ...k.map(x => x.c)].filter(x => Number.isFinite(x) && x > 0); spark[s] = {ts: Date.now(), v: v.length >= 8 ? v : null}; }
  catch { spark[s] = {ts: Date.now(), v: null}; }
}
async function loadSparks() {
  if (sparkBusy) return; const todo = state.symbols.filter(sparkStale).slice(0, 60); if (!todo.length) return;
  sparkBusy = true;
  try {
    for (let i = 0; i < todo.length; i += 8) { // en lotes de 8 para no saturar la API
      await Promise.all(todo.slice(i, i + 8).map(sparkOne));
      renderWatch();
    }
  } finally { sparkBusy = false; }
}
function sparkSVG(s, change) {
  const e = spark[s]; if (!e || !e.v) return '<span class="spark" aria-hidden="true"></span>';
  const v = e.v.slice(), live = Number(tickers[s]?.lastPrice); if (Number.isFinite(live) && live > 0) v[v.length - 1] = live;
  const lo = Math.min(...v), hi = Math.max(...v), W = 72, H = 28, P = 3, n = v.length, flat = !(hi - lo > hi * 1e-9);
  const pts = v.map((x, i) => [+(i / (n - 1) * W).toFixed(1), +(flat ? H / 2 : P + (hi - x) / (hi - lo) * (H - 2 * P)).toFixed(1)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(''), rising = Number.isFinite(change) ? change >= 0 : v[n - 1] >= v[0], end = pts[n - 1];
  return `<svg class="spark ${rising ? 'positive' : 'negative'}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${rising ? 'Subiendo' : 'Bajando'} en las últimas 24 horas"><path d="${d}L${W} ${H}L0 ${H}Z" fill="currentColor" fill-opacity=".13"/><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${end[0]}" cy="${end[1]}" r="2.2" fill="currentColor"/></svg>`;
}
/* Colores para clasificar monedas (en vez de banderitas): se guardan por activo en la cuenta */
const tagOf = k => (state.symColor && state.symColor[k]) || '';
function setTag(k, c) { if (!state.symColor) state.symColor = {}; if (c) state.symColor[k] = c; else delete state.symColor[k]; save(); renderWatch(); }
function openTagPop(k, x, y) {
  $$('.tag-pop').forEach(m => m.remove());
  const m = document.createElement('div'); m.className = 'tag-pop'; m.setAttribute('role', 'menu');
  m.innerHTML = `<small>Color de ${esc(base(k))}</small><div class="tag-grid">${TAGS.map(([c, n]) => `<button type="button" data-tagc="${c}" style="--c:${c}" class="${tagOf(k) === c ? 'on' : ''}" aria-label="${n}" title="${n}"></button>`).join('')}</div><button type="button" class="tag-none" data-tagc="">Sin color</button>`;
  document.body.appendChild(m);
  const w = m.offsetWidth, h = m.offsetHeight; m.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px'; m.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
  const close = () => { uxOut(m); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', onKey, true); }, away = ev => { if (!m.contains(ev.target)) close(); }, onKey = ev => { if (ev.key === 'Escape') close(); };
  m.addEventListener('click', ev => { const b = ev.target.closest('[data-tagc]'); if (!b) return; close(); setTag(k, b.dataset.tagc); });
  setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', onKey, true); });
}
/* Menú de tres puntos de cada moneda en Mi seguimiento: abrir, color, mover a sección, alerta y quitar */
function openRowMenu(k, x, y) {
  $$('.row-menu, .tag-pop').forEach(m => m.remove());
  const m = document.createElement('div'); m.className = 'row-menu'; m.setAttribute('role', 'menu');
  const ic = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const secs = state.groups.length ? `<button type="button" class="rm-it" data-rm="sec" aria-expanded="false">${ic('<path d="M4 7h16M4 12h10M4 17h6"/>')}<span>Mover a sección</span><i class="rm-car">›</i></button><div class="rm-sub" hidden><button type="button" class="rm-it ${grpOf(k) ? '' : 'on'}" data-rm-sec="">Sin sección</button>${state.groups.map(g => `<button type="button" class="rm-it ${grpOf(k) === g.id ? 'on' : ''}" data-rm-sec="${g.id}">${esc(g.name)}</button>`).join('')}</div>` : '';
  m.innerHTML = `<div class="rm-head"><b>${esc(base(k))}</b><small>${esc(meta(k)[0])}</small></div>
    <button type="button" class="rm-it" data-rm="open">${ic('<path d="M4 18l5-6 4 3 7-9"/>')}<span>Abrir en el gráfico</span></button>
    <div class="rm-color"><small>Color</small><div class="tag-grid">${TAGS.map(([c, n]) => `<button type="button" data-tagc="${c}" style="--c:${c}" class="${tagOf(k) === c ? 'on' : ''}" aria-label="${n}" title="${n}"></button>`).join('')}</div>${tagOf(k) ? '<button type="button" class="tag-none" data-tagc="">Sin color</button>' : ''}</div>
    ${secs}
    <button type="button" class="rm-it" data-rm="alert">${ic('<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>')}<span>Añadir alerta…</span></button>
    <button type="button" class="rm-it danger" data-rm="del">${ic('<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>')}<span>Quitar de la lista</span></button>`;
  document.body.appendChild(m);
  const w = m.offsetWidth, h = m.offsetHeight; m.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px'; m.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
  const close = () => { uxOut(m); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', onKey, true); }, away = ev => { if (!m.contains(ev.target)) close(); }, onKey = ev => { if (ev.key === 'Escape') close(); };
  m.addEventListener('click', ev => {
    const c = ev.target.closest('[data-tagc]'); if (c) { close(); setTag(k, c.dataset.tagc); return; }
    const sc = ev.target.closest('[data-rm-sec]'); if (sc) { close(); if (sc.dataset.rmSec) state.symGroup[k] = sc.dataset.rmSec; else delete state.symGroup[k]; save(); renderWatch(); return; }
    const b = ev.target.closest('[data-rm]'); if (!b) return;
    if (b.dataset.rm === 'sec') { const sub = m.querySelector('.rm-sub'); sub.hidden = !sub.hidden; b.setAttribute('aria-expanded', String(!sub.hidden)); const r = m.getBoundingClientRect(); if (r.bottom > innerHeight - 8) m.style.top = Math.max(8, innerHeight - 8 - r.height) + 'px'; return; }
    close();
    if (b.dataset.rm === 'open') selectSymbol(k);
    else if (b.dataset.rm === 'alert') { openAlertDialog({symbol: k}); }
    else if (b.dataset.rm === 'del') { state.symbols = state.symbols.filter(q => q !== k); delete state.symGroup[k]; delete (state.symColor || {})[k]; if (!state.symbols.length) editMode = false; save(); renderWatch(); }
  });
  setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', onKey, true); });
}
const grpOf = k => (state.symGroup && state.symGroup[k]) || '';
/* Agregar a Mi seguimiento: la moneda nueva queda HASTA ABAJO de tu lista (si tienes secciones, al final de la última; las monedas sin sección salen arriba de las secciones) */
function wlAdd(s) {
  if (!s || state.symbols.includes(s)) return false;
  state.symbols.push(s); const g = (state.groups || [])[state.groups.length - 1];
  if (g) { state.symGroup[s] = g.id; if (g.collapsed) g.collapsed = false; }
  return true;
}
function watchRow(s) {
  const t = tickers[s], change = Number(t?.priceChangePercent), price = Number(t?.lastPrice);
  let flash = '';
  if (Number.isFinite(price) && lastShown[s] != null && price !== lastShown[s]) flash = price > lastShown[s] ? ' flash-up' : ' flash-down';
  if (Number.isFinite(price)) lastShown[s] = price;
  const tr = window.CCTTradeWatch && CCTTradeWatch.of ? CCTTradeWatch.of(baseOnly(s)) : null, trS = tr ? (tr.side > 0 ? 'long' : 'short') : ''; // ¿tienes un trade abierto en esta moneda?
  const trR = tr && Number.isFinite(tr.roe) ? `${tr.roe >= 0 ? '+' : '−'}${Math.abs(tr.roe).toFixed(Math.abs(tr.roe) >= 10 ? 0 : 1)}%` : '';
  const trPill = tr ? `<em class="tr-pill ${trS}" title="Trade abierto: ${tr.side > 0 ? 'LONG' : 'SHORT'}${tr.lev > 1 ? ' ' + tr.lev + 'x' : ''}${trR ? ' · ROE ' + trR : ''}">${tr.side > 0 ? 'L' : 'S'}${trR ? `<b class="${tr.roe >= 0 ? 'pos' : 'neg'}">${trR}</b>` : ''}</em>` : '';
  const main = `${tr ? `<span class="tr-ring ${trS}">${coinBadge(s)}</span>` : coinBadge(s)}<span class="row-main"><strong>${esc(base(s))}</strong><small>${trPill || `<span class="nm">${esc(meta(s)[0])}</span>`}${srcOf(s) !== 'binance' ? `<em class="ex-tag ex-${srcOf(s)}">${esc(CCTMarkets.SHORT[srcOf(s)])}</em>` : ''}</small></span>`;
  const tg = tagOf(s), tgA = (tr ? ' in-trade ' + trS : '') + (tg ? ` tagged" style="--tag:${tg}` : '');
  if (editMode) {
    const opts = `<option value="">Sin sección</option>` + state.groups.map(g => `<option value="${g.id}" ${grpOf(s) === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
    return `<div class="watch-row editing${tgA}" data-symbol="${esc(s)}"><span class="drag-h" aria-hidden="true">⠿</span>${main}<span class="row-edit">${state.groups.length ? `<select class="sec-pick" data-assign="${esc(s)}" aria-label="Sección de ${esc(base(s))}">${opts}</select>` : ''}<button data-remove="${esc(s)}" class="danger" aria-label="Quitar ${esc(base(s))}">✕</button></span></div>`;
  }
  return `<button class="watch-row${tgA}" data-symbol="${esc(s)}"><span class="row-dots" role="button" tabindex="0" data-menu="${esc(s)}" aria-haspopup="menu" aria-label="Opciones de ${esc(base(s))}" title="Opciones"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg></span>${main}${sparkSVG(s, change)}<span class="row-prices"><strong class="${flash}">${fmt(price)}</strong><small class="${change >= 0 ? 'positive' : 'negative'}">${pct(change)}</small></span></button>`;
}
let wlDragOn = false, wlDragPend = false; // mientras arrastras no se repinta la lista (los precios en vivo la reconstruían a mitad del gesto)
function renderWatch() {
  if (wlDragOn) { wlDragPend = true; return; }
  const q = $('#searchCoins').value.trim().toUpperCase();
  const list = state.symbols.filter(s => s.toUpperCase().includes(q) || meta(s)[0].toUpperCase().includes(q));
  const none = list.filter(s => !grpOf(s)), html = [none.map(watchRow).join('')];
  state.groups.forEach((g, gi) => {
    const items = list.filter(s => grpOf(s) === g.id), open = q || !g.collapsed;
    if (!items.length && q) return;
    html.push(`<div class="wl-sec ${g.collapsed ? 'closed' : ''}" data-sec="${g.id}"><span class="sec-grip" title="Arrastra para mover la sección" aria-label="Mover sección">⠿</span><button class="wl-sec-t" data-tog="${g.id}" aria-expanded="${!g.collapsed}"><span class="wl-car">▾</span><span class="wl-nm">${esc(g.name)}</span><small>${items.length}</small></button>${true ? `<span class="wl-sec-ed"><button hidden data-secmv="-1" data-sid="${g.id}" aria-label="Subir sección" ${gi === 0 ? 'disabled' : ''}>▲</button><button hidden data-secmv="1" data-sid="${g.id}" aria-label="Bajar sección" ${gi === state.groups.length - 1 ? 'disabled' : ''}>▼</button><button data-secren="${g.id}" aria-label="Renombrar sección">✎</button><button data-secdel="${g.id}" class="danger" aria-label="Eliminar sección">✕</button></span>` : ''}</div>`);
    if (open) html.push(items.map(watchRow).join('') || (editMode ? '<p class="small-note wl-empty">Sección vacía: arrastra aquí o elige la sección en cada activo.</p>' : ''));
  });
  $('#watchRows').innerHTML = html.join('') || '<p class="small-note">No hay activos con ese nombre.</p>';
  $('#totalAssets').textContent = state.symbols.length;
  $('#winners').textContent = state.symbols.filter(s => Number(tickers[s]?.priceChangePercent) > 0).length;
  $('#losers').textContent = state.symbols.filter(s => Number(tickers[s]?.priceChangePercent) < 0).length;
  const as = $('#addSection'); if (as) as.hidden = false;
  paintWlFab();
}
const moveInGroup = (k, dir) => { const g = grpOf(k), idx = state.symbols.map((x, i) => grpOf(x) === g ? i : -1).filter(i => i >= 0), p = idx.indexOf(state.symbols.indexOf(k)), o = idx[p + dir]; if (o === undefined) return; const i = state.symbols.indexOf(k); [state.symbols[i], state.symbols[o]] = [state.symbols[o], state.symbols[i]]; };
const newSecId = () => 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36);
let dragKey = null;
$('#watchRows').addEventListener('click', e => {
  const rm = e.target.closest('[data-remove]'), row = e.target.closest('.watch-row'), tog = e.target.closest('[data-tog]');
  const sren = e.target.closest('[data-secren]'), sdel = e.target.closest('[data-secdel]');
  const mv = e.target.closest('[data-secmv]'), col = e.target.closest('[data-color]');
  if (mv) { const i = state.groups.findIndex(x => x.id === mv.dataset.sid), j = i + Number(mv.dataset.secmv); if (i >= 0 && j >= 0 && j < state.groups.length) { [state.groups[i], state.groups[j]] = [state.groups[j], state.groups[i]]; save(); renderWatch(); } return; }
  const dots = e.target.closest('[data-menu]'); if (dots) { const r = dots.getBoundingClientRect(); openRowMenu(dots.dataset.menu, r.left, r.bottom + 4); return; }
  if (col) { const r = col.getBoundingClientRect(); openTagPop(col.dataset.color, r.left, r.bottom + 6); return; }
  if (tog && Date.now() - suppressClick < 400) return;
  if (tog) { const g = state.groups.find(x => x.id === tog.dataset.tog); if (g) { g.collapsed = !g.collapsed; save(); renderWatch(); } return; }
  if (sren) { const g = state.groups.find(x => x.id === sren.dataset.secren), n = g && prompt('Nombre de la sección', g.name); if (n && n.trim()) { g.name = n.trim().slice(0, 40); save(); renderWatch(); } return; }
  if (sdel) { const id = sdel.dataset.secdel; state.groups = state.groups.filter(x => x.id !== id); for (const k of Object.keys(state.symGroup)) if (state.symGroup[k] === id) delete state.symGroup[k]; save(); renderWatch(); return; }
  if (rm) { const k = rm.dataset.remove; state.symbols = state.symbols.filter(s => s !== k); delete state.symGroup[k]; delete (state.symColor || {})[k]; if (!state.symbols.length) editMode = false; save(); renderWatch(); return; }
  if (e.target.closest('.sec-pick, .drag-h, .tag-btn')) return;
  if (Date.now() - suppressClick < 400) return;
  if (row && !editMode) selectSymbol(row.dataset.symbol);
});
$('#watchRows').addEventListener('change', e => { const sel = e.target.closest('[data-assign]'); if (!sel) return; const k = sel.dataset.assign; if (sel.value) state.symGroup[k] = sel.value; else delete state.symGroup[k]; save(); renderWatch(); });
/* Mover monedas y secciones DEJANDO PRESIONADO (≈0.4 s) y arrastrando, con el dedo o el mouse; al soltar queda guardado.
   Sobre otra moneda = se coloca justo antes (o después) y entra a su sección; sobre el encabezado de una sección = al inicio de esa sección; un encabezado arrastrado se reordena entre secciones. */
(() => {
  const box = $('#watchRows'); let st = null;
  const clear = () => { wlDragOn = false; if (!st) { if (wlDragPend) { wlDragPend = false; renderWatch(); } return; } clearTimeout(st.timer); if (st.ghost) st.ghost.remove(); box.classList.remove('wl-dragging'); $$('#watchRows .dragging, #watchRows .drop-before, #watchRows .drop-after, #watchRows .drop-on').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after', 'drop-on')); st = null; if (wlDragPend) { wlDragPend = false; renderWatch(); } };
  const target = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest ? el.closest('.watch-row[data-symbol]:not(.pop-row), .wl-sec') : null; };
  box.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target.closest('button:not(.watch-row):not(.wl-sec-t), select, input, .wl-sec-ed, .tag-dot')) return;
    const el = e.target.closest('.watch-row[data-symbol]:not(.pop-row), .wl-sec'); if (!el) return;
    clear(); st = {el, x: e.clientX, y: e.clientY, id: e.pointerId, on: false, sec: el.classList.contains('wl-sec'), key: el.dataset.symbol || el.dataset.sec};
    const arm = () => {
      if (!st) return; st.on = true; wlDragOn = true; el.classList.add('dragging'); box.classList.add('wl-dragging');
      const r = el.getBoundingClientRect(), gh = el.cloneNode(true); gh.className += ' wl-ghost'; gh.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;pointer-events:none;z-index:300`; document.body.appendChild(gh); st.ghost = gh; st.dy = e.clientY - r.top;
      try { navigator.vibrate && navigator.vibrate(12); } catch {}
    };
    if (e.target.closest('.sec-grip')) { try { box.setPointerCapture(e.pointerId); } catch {} arm(); } // el asa de la sección agarra al instante (sin esperar ni arriesgar que la pantalla se desplace)
    else st.timer = setTimeout(arm, 400);
  });
  box.addEventListener('touchmove', e => { if (st && st.on) e.preventDefault(); }, {passive: false});
  document.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.on) { if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 9) clear(); return; } // se movió antes del tiempo: era un desplazamiento
    e.preventDefault(); st.ghost.style.top = (e.clientY - st.dy) + 'px';
    $$('#watchRows .drop-before, #watchRows .drop-after, #watchRows .drop-on').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-on'));
    if (st.sec) { // una sección se puede soltar ENTRE las monedas (incluso entre las sueltas de arriba) o antes/después de otra sección
      const scr = () => { const sc2 = box.closest('.view'); if (sc2) { const vr = sc2.getBoundingClientRect(); if (e.clientY < vr.top + 50) sc2.scrollTop -= 10; else if (e.clientY > vr.bottom - 50) sc2.scrollTop += 10; } };
      const tc = target(e.clientX, e.clientY);
      if (tc && !tc.classList.contains('wl-sec') && tc.dataset.symbol && grpOf(tc.dataset.symbol) !== st.key) { // sobre una moneda: la sección queda justo antes o después de ella
        const rc = tc.getBoundingClientRect(), after = e.clientY > rc.top + rc.height / 2;
        st.drop = {sec: true, coin: tc.dataset.symbol, after}; tc.classList.add(after ? 'drop-after' : 'drop-before'); scr(); return;
      }
      if (tc && !tc.classList.contains('wl-sec')) { st.drop = null; scr(); return; } // sobre sus propias monedas: nada
      const kids = [...box.children], blocks = []; let cur = null;
      for (const k of kids) { const r0 = k.getBoundingClientRect(); if (k.classList.contains('wl-sec')) { cur = {head: k, top: r0.top, bottom: r0.bottom}; blocks.push(cur); } else if (cur) cur.bottom = r0.bottom; }
      const others = blocks.filter(b => b.head !== st.el), idx = others.filter(b => e.clientY > (b.top + b.bottom) / 2).length;
      st.drop = {sec: true, idx, others: others.map(b => b.head.dataset.sec)};
      if (idx < others.length) others[idx].head.classList.add('drop-before'); else if (others.length) { const last = others[others.length - 1].head, lk = kids.filter(k => k !== st.el); const tail = lk[lk.length - 1]; (tail || last).classList.add('drop-after'); }
      scr(); return;
    }
    const t = target(e.clientX, e.clientY); if (!t || t === st.el) { st.drop = null; return; }
    const r = t.getBoundingClientRect();
    if (t.classList.contains('wl-sec')) { if (st.sec) { st.drop = {t, after: e.clientY > r.top + r.height / 2}; t.classList.add(st.drop.after ? 'drop-after' : 'drop-before'); } else { st.drop = {t, into: true}; t.classList.add('drop-on'); } }
    else if (!st.sec) { st.drop = {t, after: e.clientY > r.top + r.height / 2}; t.classList.add(st.drop.after ? 'drop-after' : 'drop-before'); }
    else st.drop = null;
    const sc = box.closest('.view'); if (sc) { const vr = sc.getBoundingClientRect(); if (e.clientY < vr.top + 50) sc.scrollTop -= 10; else if (e.clientY > vr.bottom - 50) sc.scrollTop += 10; }
  }, {passive: false});
  const end = e => {
    if (!st || (e && e.pointerId !== st.id)) return;
    const s0 = st, d = s0.on ? s0.drop : null; clear();
    if (s0.on) { suppressClick = Date.now(); }
    if (!d) { if (s0.on) renderWatch(); return; }
    if (s0.sec) {
      const from = state.groups.findIndex(x => x.id === s0.key); if (from < 0 || !d.sec) return renderWatch();
      if (d.coin) { // entre las monedas: las monedas desde ese punto hasta el final de su bloque pasan a la sección, y la sección va justo después de ese bloque
        const S = state.groups[from], tk = d.coin, gid = grpOf(tk); if (gid === S.id) return renderWatch();
        const blk = state.symbols.filter(x => grpOf(x) === gid), ix = blk.indexOf(tk) + (d.after ? 1 : 0), moved = blk.slice(ix);
        state.symbols = state.symbols.filter(x => !moved.includes(x));
        const first = state.symbols.findIndex(x => grpOf(x) === S.id); if (first < 0) state.symbols.push(...moved); else state.symbols.splice(first, 0, ...moved);
        moved.forEach(x => { state.symGroup[x] = S.id; });
        state.groups = state.groups.filter(g => g.id !== S.id); state.groups.splice(gid ? state.groups.findIndex(g => g.id === gid) + 1 : 0, 0, S);
        save(); renderWatch(); return;
      }
      const [g1] = state.groups.splice(from, 1); let to = state.groups.length;
      if (d.idx < d.others.length) to = state.groups.findIndex(x => x.id === d.others[d.idx]); else if (d.others.length) to = state.groups.findIndex(x => x.id === d.others[d.others.length - 1]) + 1;
      state.groups.splice(to < 0 ? state.groups.length : to, 0, g1);
    }
    else {
      const k = s0.key; state.symbols = state.symbols.filter(x => x !== k);
      if (d.t.classList.contains('wl-sec')) { const id = d.t.dataset.sec, first = state.symbols.findIndex(x => grpOf(x) === id); if (first < 0) state.symbols.push(k); else state.symbols.splice(first, 0, k); state.symGroup[k] = id; }
      else { const tk = d.t.dataset.symbol; let at = state.symbols.indexOf(tk); if (d.after) at++; state.symbols.splice(at, 0, k); if (grpOf(tk)) state.symGroup[k] = grpOf(tk); else delete state.symGroup[k]; }
    }
    save(); renderWatch();
  };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  document.addEventListener('contextmenu', e => { if (st && st.on) e.preventDefault(); });
})();
let suppressClick = 0;
$('#watchRows').addEventListener('contextmenu', e => { const r = e.target.closest('.watch-row[data-symbol]'); if (!r || e.pointerType === 'touch' || $('#watchRows').classList.contains('wl-dragging')) return; e.preventDefault(); openTagPop(r.dataset.symbol, e.clientX, e.clientY); });
$('#addSection').onclick = () => { const n = prompt('Nombre de la sección (por ejemplo: BingX)'); if (!n || !n.trim()) return; state.groups.push({id: newSecId(), name: n.trim().slice(0, 40), collapsed: false}); save(); renderWatch(); };

async function fetchTicker() {
  try {
    const plain = state.symbols.filter(k => srcOf(k) === 'binance'), other = state.symbols.filter(k => srcOf(k) !== 'binance');
    if (other.length && window.CCTMarkets) CCTMarkets.tickers(other).then(m => { Object.assign(tickers, m); renderWatch(); updateChartHeader(); }).catch(() => {});
    let data = [];
    if (plain.length) {
      try { data = await getJSON(`${API}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(plain))}`); }
      catch { data = await getJSON(`${API}/ticker/24hr`); } // por si algún símbolo añadido a mano no existe
    }
    for (const t of data) tickers[t.symbol] = t;
    updateStatus(true, 'Binance en línea');
    renderWatch(); updateChartHeader(); checkAlertsPoll(); loadSparks();
  } catch {
    updateStatus(false, 'Sin conexión'); renderWatch();
    if (!candles.length) setFeedback('No hay datos. Revisa tu conexión o posibles restricciones de Binance en tu país.');
  }
}

/* ───────── Top criptomonedas populares ─────────
   Fuente: Binance Spot (pares USDT con más volumen) y CoinGecko «en tendencia» (de lo que más se busca/habla).
   Semana y mes: rendimiento de las 30 monedas con más volumen, calculado con velas diarias reales. Solo para descubrir; no se ejecutan operaciones. */
const POP_STABLE = new Set(['USDC', 'FDUSD', 'TUSD', 'USDP', 'DAI', 'BUSD', 'USDE', 'USDS', 'USD1', 'XUSD', 'PYUSD', 'BFUSD', 'EUR', 'AEUR', 'EURI', 'UST', 'USTC']);
const POP_NOTES = {
  hoy: 'Las más operadas en Binance en las últimas 24 h (por volumen).',
  tend: 'Las que más se están buscando y comentando hoy (CoinGecko), disponibles en Binance Spot.',
  sem: 'Entre las 30 con más volumen, las de mejor rendimiento en los últimos 7 días.',
  mes: 'Entre las 30 con más volumen, las de mejor rendimiento en los últimos 30 días.'
};
let popTab = 'hoy', popAll = [], popTrend = [], popTrendTs = 0, popKl = {}, popKlTs = 0, popMore = false, popBusy = false, popErr = '';
const popVol = n => n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(0) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : String(Math.round(n));

async function loadPopTickers() {
  let data; // si api.binance.com falla o limita, se prueba el espejo público de datos de mercado
  try { data = await getJSON(`${API}/ticker/24hr`); } catch (e1) { data = await getJSON('https://data-api.binance.vision/api/v3/ticker/24hr'); }
  popAll = data.filter(t => /^[A-Z0-9]{2,12}USDT$/.test(t.symbol) && !POP_STABLE.has(base(t.symbol)) && +t.quoteVolume > 2e6 && +t.lastPrice > 0)
    .sort((a, b) => +b.quoteVolume - +a.quoteVolume);
  for (const t of popAll) tickers[t.symbol] = t; // así el gráfico también muestra su cabecera
}
async function loadPopTrend() {
  if (popTrend.length && Date.now() - popTrendTs < 600000) return;
  const r = await fetch('https://api.coingecko.com/api/v3/search/trending');
  if (!r.ok) throw Error('CoinGecko HTTP ' + r.status);
  const j = await r.json();
  popTrend = (j.coins || []).map(c => String(c.item?.symbol || '').toUpperCase()).filter(Boolean);
  popTrendTs = Date.now();
}
async function loadPopKl() {
  if (Object.keys(popKl).length && Date.now() - popKlTs < 600000) return;
  const res = await Promise.all(popAll.slice(0, 30).map(t => getJSON(`${API}/klines?symbol=${t.symbol}&interval=1d&limit=31`).then(k => [t.symbol, k.map(x => +x[4])]).catch(() => null)));
  popKl = {}; for (const r of res) if (r && r[1].length >= 8) popKl[r[0]] = r[1];
  popKlTs = Date.now();
}
function popRowsFor(tab) {
  const by = new Map(popAll.map(t => [t.symbol, t]));
  if (tab === 'hoy') return popAll.map(t => ({s: t.symbol, ch: +t.priceChangePercent, sub: 'Vol ' + popVol(+t.quoteVolume)}));
  if (tab === 'tend') return popTrend.map((c, i) => by.get(c + 'USDT') ? {s: c + 'USDT', ch: +by.get(c + 'USDT').priceChangePercent, sub: `#${i + 1} en tendencia`} : null).filter(Boolean);
  const back = tab === 'sem' ? 7 : 30;
  return Object.entries(popKl).map(([s, c]) => {
    if (c.length < back + 1) return null;
    const now = +by.get(s)?.lastPrice || c[c.length - 1];
    return {s, ch: (now / c[c.length - 1 - back] - 1) * 100, sub: tab === 'sem' ? '7 días' : '30 días'};
  }).filter(Boolean).sort((a, b) => b.ch - a.ch);
}
function renderPopular() {
  const box = $('#popRows'); if (!box) return;
  $$('#popTabs [data-pop]').forEach(b => b.classList.toggle('active', b.dataset.pop === popTab));
  $('#popNote').textContent = popErr || (POP_NOTES[popTab] + ' No es una recomendación de inversión.');
  const rows = popRowsFor(popTab), limit = popMore ? 30 : 10, shown = rows.slice(0, limit);
  box.innerHTML = shown.map(r => {
    const tracked = state.symbols.includes(r.s), p = +tickers[r.s]?.lastPrice;
    return `<div class="watch-row pop-row" data-symbol="${r.s}" role="button" tabindex="0">${coinBadge(r.s)}<span class="row-main"><strong>${esc(base(r.s))}</strong><small>${esc(r.sub)}</small></span><span class="row-prices"><strong>${fmt(p)}</strong><small class="${r.ch >= 0 ? 'positive' : 'negative'}">${pct(r.ch)}</small></span>${tracked ? '<span class="pop-add done" title="Ya está en tu seguimiento">✓</span>' : `<button class="pop-add" data-padd="${r.s}" aria-label="Añadir ${esc(base(r.s))} a mi seguimiento" title="Añadir a mi seguimiento">＋</button>`}</div>`;
  }).join('') || `<p class="small-note">${popBusy ? 'Cargando populares…' : 'No hay datos por ahora.'}</p>${!popBusy ? '<button class="small-button pop-retry" type="button">Reintentar</button>' : ''}`;
  $('#popMore').hidden = rows.length <= 10; $('#popMore').textContent = popMore ? 'Ver menos' : 'Ver más';
}
async function refreshPop() {
  if (popBusy) return; popBusy = true; popErr = ''; renderPopular();
  try {
    await loadPopTickers();
    if (popTab === 'sem' || popTab === 'mes') await loadPopKl();
    if (popTab === 'tend') await loadPopTrend();
  } catch (e) { popErr = popTab === 'tend' ? 'No pude cargar las tendencias ahora. Prueba otra pestaña o reintenta en un momento.' : 'No pude cargar las populares. Revisa tu conexión.'; }
  popBusy = false; renderPopular();
}
$('#popTabs').addEventListener('click', e => { const b = e.target.closest('[data-pop]'); if (!b) return; popTab = b.dataset.pop; popMore = false; refreshPop(); });
$('#popMore').onclick = () => { popMore = !popMore; renderPopular(); };
$('#popRows').addEventListener('click', e => {
  const add = e.target.closest('[data-padd]'), row = e.target.closest('.pop-row');
  if (e.target.closest('.pop-retry')) { refreshPop(); return; }
  if (add) { const s = add.dataset.padd; if (wlAdd(s)) { save(); renderWatch(); renderPopular(); fetchTicker(); toast(`${base(s)} añadido a tu seguimiento`); } return; }
  if (row) selectSymbol(row.dataset.symbol);
});
$('#popRows').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('pop-row')) { e.preventDefault(); selectSymbol(e.target.dataset.symbol); } });


/* ───────── Alertas de precio ───────── */
const alertPrice = {}; // último precio conocido por símbolo (para alertas fuera del seguimiento)
let trHit = [], trDrag = null, trOpen = ''; // trOpen: en el celular, la operación cuyos botones (+TP, +SL, ✕) están desplegados
 // operaciones demo: zonas tocables y arrastre en curso
let selAlertId = null, alDrag = null, alConfirm = null; // alerta seleccionada en el gráfico, arrastre en curso y confirmación pendiente
const alDiscordReady = () => { try { return !!(window.CCT_discordStore && CCT_discordStore.get().url); } catch { return false; } };
const TONE_SEQ = {beep: [[880, 0, .6, 'sine']], chime: [[988, 0, .35, 'sine'], [1319, .16, .55, 'sine']], pulse: [[440, 0, .14, 'triangle'], [440, .22, .14, 'triangle'], [440, .44, .14, 'triangle']], alarm: [[780, 0, .18, 'square'], [620, .2, .18, 'square'], [780, .4, .18, 'square']]};
function alertBeep(force, tone) { // el sonido elegido en Configuración; force = prueba
  if (!force && PR.sound === 'off') return;
  try { const A = window.AudioContext || window.webkitAudioContext, c = new A(); for (const [f, t0, d, ty] of TONE_SEQ[tone || PR.tone] || TONE_SEQ.beep) { const o = c.createOscillator(), g = c.createGain(); o.type = ty; o.frequency.value = f; o.connect(g); g.connect(c.destination); const t = c.currentTime + t0; g.gain.setValueAtTime(ty === 'square' ? .08 : .2, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.start(t); o.stop(t + d + .02); } setTimeout(() => { try { c.close(); } catch {} }, 1500); } catch {}
}
// Notificación del sistema. En Android/PWA «new Notification()» no existe: se usa el service worker. La etiqueta (tag) evita duplicados
// si el servidor de avisos con la app cerrada (push.js) manda el mismo aviso.
function sysNotify(title, body, tag) {
  try {
    if (!window.Notification || Notification.permission !== 'granted') return;
    const opts = {body, tag, renotify: true, icon: 'icons/i01-192.png', badge: 'icons/notif-badge-96.png', vibrate: [200, 100, 200], data: {url: location.href.split('#')[0] + '#alerts'}};
    if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(r => r.showNotification(title, opts)).catch(() => {});
    else new Notification(title, opts);
  } catch {}
}
const dcSend = (k, o) => { if (window.CCTDiscord && PR.n.discord) CCTDiscord.alert(k, o); }; // Discord solo si se quiere recibir ahí
const alNotify = (a, kind) => { const n = a.notify || 'both'; return {app: n !== 'discord', dc: n !== 'app' && !!PR.n.discord}; }; // dónde avisar: app, Discord o ambos. Con «Enviar avisos a Discord» apagado en Ajustes no sale nada a Discord
window.CCT_discordOn = () => !!(PR && PR.n && PR.n.discord); // interruptor general de Discord (lo usan bots, servidor y avisos)
function fireAlert(a, price) {
  const msg = `${base(a.symbol)} ${a.dir === 'up' ? 'subió a' : 'bajó a'} ${fmt(a.price)} (ahora ${fmt(price)})${a.note ? ' · ' + a.note : ''}`, dir0 = a.dir;
  a.firedAt = Date.now(); a.firedPrice = price;
  if (a.repeat === 'every') { if (a.cond) a.wait = true; else a.dir = a.dir === 'up' ? 'down' : 'up'; } else a.on = false; // «todo el tiempo»: el cruce normal vigila el sentido contrario; ascendente/descendente espera a que el precio vuelva
  if (!PR.n.price) return; // avisos de precio apagados en Configuración
  const n = alNotify(a);
  if (n.app) { toast(msg); alertBeep(); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {} sysNotify('VORTEX · Alerta', msg, 'al-' + a.id); }
  if (n.dc && window.CCTDiscord) CCTDiscord.alert('price', {symbol: base(a.symbol), dir: dir0, level: a.price, price, note: a.note, text: msg});
}
function checkAlerts(sym, price) {
  if (!Number.isFinite(price)) return;
  alertPrice[sym] = price; let hit = false;
  for (const a of state.alerts) {
    if (a.kind === 'ind' || !a.on || a.symbol !== sym) continue;
    if (a.exp && Date.now() > a.exp) { a.on = false; a.expired = true; hit = true; continue; }
    const past = a.dir === 'up' ? price >= a.price : price <= a.price;
    if (a.wait) { if (!past) { a.wait = false; hit = true; } continue; }
    if (past) { fireAlert(a, price); hit = true; }
  }
  if (hit) { save(); renderAlerts(); scheduleRender(); }
}
async function checkAlertsPoll() {
  const allS = [...new Set(state.alerts.filter(a => a.kind !== 'ind' && a.on).map(a => a.symbol))], syms = allS.filter(k => srcOf(k) === 'binance'), other = allS.filter(k => srcOf(k) !== 'binance');
  if (other.length && window.CCTMarkets) { // otros exchanges y futuros: precio de su propio mercado (aunque la moneda no esté en tu seguimiento)
    try { const t = await CCTMarkets.tickers(other); for (const k of other) { const p = Number((t[k] || tickers[k] || {}).lastPrice); if (Number.isFinite(p)) checkAlerts(k, p); } } catch { for (const k of other) { const p = Number(tickers[k]?.lastPrice); if (Number.isFinite(p)) checkAlerts(k, p); } }
  }
  if (!syms.length) return;
  try {
    const data = await getJSON(`${API}/ticker/price?symbols=${encodeURIComponent(JSON.stringify(syms))}`);
    for (const t of data) checkAlerts(t.symbol, +t.price);
  } catch {}
  if (currentView === 'alertsView') renderAlerts();
}
function curPrice(sym) { const t = tickers[sym]; return Number.isFinite(+t?.lastPrice) && t ? +t.lastPrice : alertPrice[sym]; }
function renderAlerts() {
  alTabCount();
  const el = $('#alertList'); if (!el) return;
  const act = state.alerts.filter(a => a.on), done = state.alerts.filter(a => !a.on);
  const row = a => { if (a.kind === 'ind') { const missing = a.src === 'pine' && !scripts.some(s => s.id === a.sid);
      return `<div class="setting-row alert-row ${a.on ? '' : 'dim'}"><div><b>${esc(a.label)}</b><small>${esc(base(a.symbol))} · ${a.interval} · ${a.repeat === 'every' ? 'cada vez' : 'una vez'}${missing ? ' · <span class="pine-err">el script ya no existe</span>' : ''}${a.firedAt ? ` · última: ${new Date(a.firedAt).toLocaleString()}${a.firedInfo ? ' (' + esc(a.firedInfo) + ')' : ''}` : ''}${a.note ? ' · ' + esc(a.note) : ''}</small></div><div class="alert-btns">${a.on ? '' : `<button class="small-button" data-al-re="${a.id}">Reactivar</button>`}<button class="small-button" data-al-del="${a.id}" aria-label="Eliminar">✕</button></div></div>`; }
    const p = curPrice(a.symbol), dist = Number.isFinite(p) ? ((a.price - p) / p * 100) : NaN;
    return `<div class="setting-row alert-row ${a.on ? '' : 'dim'}"><div><b>${esc(base(a.symbol))} ${a.dir === 'up' ? '≥' : '≤'} ${fmt(a.price)}</b><small>${a.on ? `Ahora ${fmt(p)}${Number.isFinite(dist) ? ` · a ${Math.abs(dist).toFixed(2)}%` : ''}` : a.expired ? 'Venció ' + new Date(a.exp).toLocaleString() : `Se disparó ${new Date(a.firedAt).toLocaleString()} a ${fmt(a.firedPrice)}`}${a.on && a.repeat === 'every' && a.firedAt ? ` · última: ${new Date(a.firedAt).toLocaleString()}` : ''} · ${alCondTxt(a)}${a.repeat === 'every' ? ' · todo el tiempo' : ''}${a.exp && a.on ? ' · vence ' + new Date(a.exp).toLocaleDateString() : ''}${alNotTxt(a) ? ' · ' + alNotTxt(a) : ''}${a.note ? ' · ' + esc(a.note) : ''}</small></div><div class="alert-btns"><button class="small-button" data-al-ed="${a.id}" aria-label="Editar">Editar</button>${a.on ? '' : `<button class="small-button" data-al-re="${a.id}">Reactivar</button>`}<button class="small-button" data-al-del="${a.id}" aria-label="Eliminar">✕</button></div></div>`; };
  el.innerHTML = (act.length ? `<div class="section-label">ACTIVAS (${act.length})</div>` + act.map(row).join('') : `<div class="soon"><div class="soon-ic">${I('bell', 28)}</div><b>Sin alertas activas</b><small>Crea una abajo y te avisaremos cuando el precio llegue.</small></div>`) + (done.length ? `<div class="section-label">DISPARADAS</div>` + done.map(row).join('') : '');
  const sel = $('#alSym'); if (sel && !sel.dataset.ready) { sel.dataset.ready = 1; sel.innerHTML = state.symbols.map(s => `<option value="${s}">${esc(pairLbl(s))}</option>`).join(''); }
  if (sel) { const s = state.symbols; if ([...sel.options].map(o => o.value).join() !== s.join()) { const v = sel.value; sel.innerHTML = s.map(x => `<option value="${x}">${esc(pairLbl(x))}</option>`).join(''); if (s.includes(v)) sel.value = v; } }
}
$('#alInd').onclick = openIndAlertDialog;
/* Diálogo «Crear alerta» (como en TradingView): activo, condición (precio o indicador), tipo de cruce, valor, activación, vencimiento, mensaje y dónde avisar */
const AL_EXP = [['0', 'Sin vencimiento'], ['1', '24 horas'], ['7', '7 días'], ['30', '30 días'], ['c', 'Elegir fecha…']];
const alCondTxt = a => a.cond === 'up' ? 'Cruce ascendente' : a.cond === 'down' ? 'Cruce descendente' : 'Cruce';
const alNotTxt = a => a.notify === 'discord' ? 'Discord' : a.notify === 'both' ? 'App y Discord' : a.notify === 'app' ? 'App' : '';
async function openAlertDialog(o) {
  o = o || {}; const ed = o.edit || null, sym0 = ed ? ed.symbol : (o.symbol || state.symbol);
  if (!ed && state.alerts.length >= 50) { toast('Máximo 50 alertas'); return; }
  const el = document.createElement('div'); el.className = 'cfg-overlay';
  const syms = state.symbols.includes(sym0) ? state.symbols : [sym0].concat(state.symbols), loc = ms => { const d = new Date(ms - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
  const hasExp = ed && ed.exp, v = {cond: ed ? (ed.cond || 'cross') : 'cross', price: ed ? ed.price : (o.price || ''), rep: ed ? ed.repeat || 'once' : 'once', note: ed ? ed.note : '', not: ed ? (ed.notify || 'both') : 'app'};
  el.innerHTML = `<div class="cfg-dlg al-dlg" role="dialog" aria-modal="true" aria-label="Crear alerta"><div class="cfg-head"><strong>${ed ? 'Editar alerta' : 'Crear alerta'} sobre</strong><select id="adSym" class="al-sym" ${ed ? 'disabled' : ''}>${syms.map(x => `<option value="${x}" ${x === sym0 ? 'selected' : ''}>${esc(pairLbl(x))}</option>`).join('')}</select><span class="cfg-sp"></span><button class="cfg-x" aria-label="Cerrar">✕</button></div>
    <div class="cfg-body"><div class="cfg-sec">
      <div class="al-r"><span>Condición</span><div class="al-c"><select id="adKind" ${ed ? 'disabled' : ''}><option value="price">Precio</option><option value="ind">Indicador…</option></select>
        <select id="adCond"><option value="cross">Cruce</option><option value="up">Cruce ascendente</option><option value="down">Cruce descendente</option></select>
        <input id="adPrice" inputmode="decimal" placeholder="Valor" aria-label="Valor"><small id="adNow" class="al-hint"></small></div></div>
      <div class="al-r"><span>Activación</span><select id="adRep"><option value="once">Solo una vez</option><option value="every">Todo el tiempo</option></select></div>
      <div class="al-r"><span>Vencimiento</span><div class="al-c"><select id="adExp">${AL_EXP.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><input id="adDate" type="datetime-local" hidden></div></div>
      <div class="al-r"><span>Mensaje</span><input id="adNote" maxlength="140" placeholder="Opcional · por defecto: el aviso del cruce"></div>
      <div class="al-r"><span>Notificaciones</span><select id="adNot"><option value="app">Solo en la app</option><option value="discord">Solo en Discord</option><option value="both">App y Discord</option></select></div>
      <p class="cfg-note">Te avisa aunque la app esté cerrada (con «Activar notificaciones» encendido). «Todo el tiempo» vuelve a avisar cada vez que el precio cruce otra vez el nivel. No ejecuta órdenes.</p>
    </div></div>
    <div class="cfg-foot"><span class="cfg-sp"></span><button class="cfg-btn" data-act="cancel">Cancelar</button><button class="cfg-btn cfg-ok" data-act="ok">${ed ? 'Guardar' : 'Crear'}</button></div></div>`;
  document.body.appendChild(el);
  const $e = q => el.querySelector(q), close = () => { el.remove(); document.removeEventListener('keydown', onKey, true); }, onKey = ev => { if (ev.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey, true);
  $e('#adCond').value = v.cond; $e('#adPrice').value = v.price === '' ? '' : String(v.price); $e('#adRep').value = v.rep; $e('#adNote').value = v.note; $e('#adNot').value = v.not;
  if (hasExp) { $e('#adExp').value = 'c'; $e('#adDate').value = loc(ed.exp); $e('#adDate').hidden = false; }
  $e('#adExp').onchange = () => { const c = $e('#adExp').value === 'c'; $e('#adDate').hidden = !c; if (c && !$e('#adDate').value) $e('#adDate').value = loc(Date.now() + 30 * 864e5); };
  const showNow = () => { const p = curPrice($e('#adSym').value); $e('#adNow').textContent = Number.isFinite(p) ? 'Precio actual: ' + fmt(p) : ''; };
  $e('#adSym').onchange = showNow; showNow(); if (!Number.isFinite(curPrice(sym0))) getJSON(`${API}/ticker/price?symbol=${sym0}`).then(r => { if (+r.price > 0) { alertPrice[sym0] = +r.price; showNow(); } }).catch(() => {});
  $e('#adKind').onchange = () => { if ($e('#adKind').value === 'ind') { close(); openIndAlertDialog(); } };
  setTimeout(() => { const f = $e('#adPrice'); f.focus(); f.select(); }, 60);
  el.addEventListener('click', async e => {
    if (e.target === el || e.target.closest('.cfg-x') || e.target.closest('[data-act=cancel]')) return close();
    if (!e.target.closest('[data-act=ok]')) return;
    const sym = $e('#adSym').value, price = parseFloat(String($e('#adPrice').value).replace(',', '.')), cond = $e('#adCond').value, rep = $e('#adRep').value, nt = $e('#adNot').value, note = $e('#adNote').value.trim().slice(0, 140);
    if (!sym || !(price > 0)) { toast('Escribe un valor válido'); return; }
    let exp = 0; const xk = $e('#adExp').value;
    if (xk === 'c') { exp = Date.parse($e('#adDate').value); if (!(exp > Date.now())) { toast('El vencimiento debe ser una fecha futura'); return; } } else if (xk !== '0') exp = Date.now() + (+xk) * 864e5;
    let p = curPrice(sym); if (!Number.isFinite(p)) { try { p = +(await getJSON(`${API}/ticker/price?symbol=${sym}`)).price; } catch {} }
    if (!Number.isFinite(p)) { toast('No pude leer el precio actual; revisa tu conexión'); return; }
    if (price === p) { toast('El precio ya está en ese nivel'); return; }
    if (cond === 'up' && price < p) { toast(`Cruce ascendente: el valor debe estar por encima de ${fmt(p)}`); return; }
    if (cond === 'down' && price > p) { toast(`Cruce descendente: el valor debe estar por debajo de ${fmt(p)}`); return; }
    const dir = price > p ? 'up' : 'down', f = {price, dir, note, repeat: rep, notify: nt, exp: exp || 0}; if (cond === 'cross') delete f.cond; else f.cond = cond;
    if (nt !== 'app' && !alDiscordReady()) toast('Aún no conectas Discord (barra derecha): el aviso llegará solo a la app');
    if (ed) { const a = state.alerts.find(x => x.id === ed.id); if (!a) return close(); for (const k of ['cond', 'wait', 'expired']) delete a[k]; Object.assign(a, f, {on: true, firedAt: 0, firedPrice: null}); if (!f.cond) delete a.cond; if (rep !== 'every') delete a.repeat; }
    else { const a = {id: 'al' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), symbol: sym, on: true, created: Date.now(), firedAt: 0, firedPrice: null, ...f}; if (rep !== 'every') delete a.repeat; state.alerts.unshift(a); }
    alertPrice[sym] = p; save(); renderAlerts(); scheduleRender(); close(); toast(ed ? 'Alerta actualizada' : 'Alerta creada');
    try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch {}
  });
}
$('#alAdd').onclick = () => openAlertDialog({symbol: state.symbol});
$('#alertsView').addEventListener('click', e => {
  const d = e.target.closest('[data-al-del]'), r = e.target.closest('[data-al-re]'), ed = e.target.closest('[data-al-ed]');
  if (ed) { const a = state.alerts.find(x => x.id === ed.dataset.alEd); if (a && a.kind !== 'ind') openAlertDialog({edit: a}); else if (a) toast('Para cambiar una alerta con indicador, créala de nuevo'); return; }
  if (d) { state.alerts = state.alerts.filter(a => a.id !== d.dataset.alDel); save(); renderAlerts(); }
  if (r) { const a = state.alerts.find(x => x.id === r.dataset.alRe), p = curPrice(a?.symbol); if (a && a.kind === 'ind') { a.on = true; a.firedAt = 0; a.firedInfo = ''; lastClosedBar(a.symbol, a.interval).then(t => { if (t != null) a.lastBar = t; save(); renderAlerts(); }); } else if (a) { if (!a.cond) a.dir = Number.isFinite(p) ? (a.price > p ? 'up' : 'down') : a.dir; a.on = true; a.firedAt = 0; a.firedPrice = null; a.wait = false; if (a.expired) { a.expired = false; a.exp = 0; } save(); renderAlerts(); checkAlertsPoll(); } }
});

/* ───────── Avisos de movimientos bruscos ─────────
   Cada 15 s se lee el precio de tu seguimiento y se compara con los últimos 5 minutos y la última hora.
   Si sube o cae más de ±X % en 5 min (o ±2.5·X % en 1 h) llega un aviso con sonido, vibración y notificación del sistema (si diste permiso). Máximo uno cada 15 min por moneda y sentido.
   Solo avisa, no opera. Se calcula con precios reales de Binance Spot; sin datos no se inventa nada. */
const MOVE_WIN = [[300000, '5 min', 1], [3600000, '1 h', 2.5]], MOVE_COOL = 900000, MOVE_LOG_KEY = 'cct_move_log_v1';
const moveBuf = {}, moveLast = {}; let moveLog = (() => { try { const a = JSON.parse(lsGet(MOVE_LOG_KEY) || '[]'); return Array.isArray(a) ? a.slice(0, 30) : []; } catch { return []; } })();
const MOVE_TOP = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL']; // los avisos de movimientos bruscos son solo del top 5 por capitalización (sin stablecoins); el Screener sigue revisando todas
function moveCheck(sym, price, now) {
  const b = moveBuf[sym] || (moveBuf[sym] = []); b.push([now, price]);
  while (b.length && now - b[0][0] > 3720000) b.shift();
  const M = state.moveAlerts || {}; if (!M.on || !MOVE_TOP.includes(baseOnly(sym))) return;
  for (const [W, lbl, mult] of MOVE_WIN) {
    const start = b.find(x => x[0] >= now - W); if (!start || now - start[0] < W * 0.6) continue; // todavía no hay historia suficiente
    const ch = (price / start[1] - 1) * 100, thr = M.pct * mult; if (!Number.isFinite(ch) || Math.abs(ch) < thr) continue;
    const dir = ch > 0 ? 'up' : 'down', k = sym + '|' + dir; if (now - (moveLast[k] || 0) < MOVE_COOL) continue;
    moveLast[k] = now; fireMove(sym, dir, ch, lbl, price); break;
  }
}
function fireMove(sym, dir, ch, lbl, price) {
  const msg = `${base(sym)} ${dir === 'up' ? 'sube' : 'cae'} ${Math.abs(ch).toFixed(1)}% en ${lbl} · ${fmt(price)}`;
  moveLog.unshift({t: Date.now(), s: sym, d: dir, c: +ch.toFixed(2), w: lbl, p: price}); moveLog = moveLog.slice(0, 30); try { localStorage.setItem(MOVE_LOG_KEY, JSON.stringify(moveLog)); } catch {}
  toast('Movimiento brusco: ' + msg); if (PR.sound !== 'off') { alertBeep(); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {} } // sonido y vibración: van con «Activar notificaciones»
  sysNotify('VORTEX · Movimiento brusco', msg, 'mv-' + sym + '-' + dir);
  dcSend('move', {symbol: base(sym), dir, pct: ch, win: lbl, price, text: msg});
  renderMoveAlerts();
}
async function movePoll() {
  if (PANE || !(state.moveAlerts || {}).on) return;
  const syms = [...new Set([...state.symbols, state.symbol])].filter(k => srcOf(k) === 'binance' && /^[A-Z0-9]{5,20}$/.test(k)).slice(0, 60); if (!syms.length) return;
  try {
    const data = await getJSON(`${API}/ticker/price?symbols=${encodeURIComponent(JSON.stringify(syms))}`), now = Date.now();
    for (const t of data) { const p = +t.price; if (Number.isFinite(p) && p > 0) moveCheck(t.symbol, p, now); }
  } catch {}
}
const MOVE_LEVELS = [[1, 'Muy sensible · ±1 % en 5 min'], [2, 'Normal · ±2 % en 5 min'], [4, 'Solo grandes · ±4 % en 5 min'], [8, 'Solo extremos · ±8 % en 5 min']];
function renderMoveAlerts() { // pestaña Historial: los últimos movimientos bruscos (el interruptor y la sensibilidad están en Avisos › Qué te avisamos)
  const box = $('#moveBox'); if (!box) return;
  const sv = p => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px">${p}</svg>`; // (SV aún no existe cuando esto corre por primera vez)
  const ic = d => d === 'up' ? sv('<path d="M5 15l5-5 3 3 6-7"/><path d="M15 6h4v4"/>') : sv('<path d="M5 9l5 5 3-3 6 7"/><path d="M15 18h4v-4"/>');
  box.innerHTML = `<div class="section-label">MOVIMIENTOS BRUSCOS</div>` + (moveLog.length ? moveLog.slice(0, 12).map(x => `<div class="setting-row move-row ${x.d}"><div><b>${ic(x.d)} ${esc(base(x.s))} ${x.c > 0 ? '+' : ''}${x.c}% en ${esc(x.w)}</b><small>${new Date(x.t).toLocaleString()} · ${fmt(x.p)}</small></div></div>`).join('')
    : `<p class="small-note">${(state.moveAlerts || {}).on ? 'Todavía no hay movimientos bruscos en el top 5.' : 'Los avisos de movimientos bruscos están apagados (Avisos › Qué te avisamos).'}</p>`);
}
renderMoveAlerts();
/* Señales del Screener al celular: las calcula el servidor al empezar cada hora (1h) y cada 4 h, aunque la app esté cerrada */
let scrSrv = null;
async function scrStatus() { try { const r = await fetch('https://vortex-push.soobroon.workers.dev/scr/state'); if (r.ok) { scrSrv = await r.json(); renderScrPush(); } } catch {} }
function renderScrPush() { // pestaña Historial: último análisis del Screener (el interruptor está en Avisos › Qué te avisamos)
  const box = $('#scrPushBox'); if (!box) return; const S = state.scrPush || {};
  const last = tf => { const l = scrSrv && scrSrv.last && scrSrv.last[tf]; return l ? `Último análisis ${new Date(l.at).toLocaleString([], {hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short'})}: ${l.n} con señal de ${l.of}` : 'Se analiza al empezar cada ' + (tf === '1h' ? 'hora' : '4 horas'); };
  box.innerHTML = `<div class="section-label">SEÑALES DEL SCREENER</div>`
    + (S.on ? [['1h', 'Temporalidad 1 hora', S.h1 !== false], ['4h', 'Temporalidad 4 horas', S.h4 !== false]].map(([tf, t, on]) => `<div class="setting-row"><div><b>${t}${on ? '' : ' · apagada'}</b><small>${esc(last(tf))}</small></div></div>`).join('')
      : `<p class="small-note">Las señales del Screener están apagadas (Avisos › Qué te avisamos).</p>`);
}
renderScrPush();

/* ───────── Alertas con indicadores ─────────
   Se evalúan sobre la ÚLTIMA VELA CERRADA (sin repintado) del símbolo y temporalidad elegidos, aunque no estén en el gráfico.
   Fuentes: indicadores comunes, Nova Nexus (señales) y cualquier script Pine (alertcondition, alert(), formas y cruces de líneas). */
const STD_CONDS = [
  ['ema_x_up', 'EMA 20 cruza al alza la EMA 50'], ['ema_x_dn', 'EMA 20 cruza a la baja la EMA 50'],
  ['px_ema20_up', 'Precio cruza al alza la EMA 20'], ['px_ema20_dn', 'Precio cruza a la baja la EMA 20'],
  ['px_sma200_up', 'Precio cruza al alza la SMA 200'], ['px_sma200_dn', 'Precio cruza a la baja la SMA 200'],
  ['rsi_up', 'RSI cruza al alza el nivel'], ['rsi_dn', 'RSI cruza a la baja el nivel'],
  ['macd_up', 'MACD cruza al alza su señal'], ['macd_dn', 'MACD cruza a la baja su señal'],
  ['bb_up', 'Cierre rompe por encima la banda superior de Bollinger'], ['bb_dn', 'Cierre rompe por debajo la banda inferior de Bollinger'],
  ['st_up', 'Supertrend cambia a alcista'], ['st_dn', 'Supertrend cambia a bajista']
];
const crossUp = (a, b, k) => k > 0 && a[k] != null && b[k] != null && a[k - 1] != null && b[k - 1] != null && a[k - 1] <= b[k - 1] && a[k] > b[k];
const crossDn = (a, b, k) => k > 0 && a[k] != null && b[k] != null && a[k - 1] != null && b[k - 1] != null && a[k - 1] >= b[k - 1] && a[k] < b[k];
const stdHit = (cs, k, spec) => CCTAlertEval.stdHit(cs, k, spec); // alert-eval.js: la misma lógica corre en el servidor con la app cerrada
function novaOpts() {
  const I = state.indicators, NP = novaP;
  return {smc: !!(I.nnSmc || I.nnOb), emaLen: NP('emaLen'), emaMult: NP('emaMult'), minScore: NP('minScore'), cooldown: NP('cooldown'), cdBoth: NP('cdBoth'), slMult: NP('slMult'), tp1Mult: NP('tp1'), tp2Mult: NP('tp2'), tp3Mult: NP('tp3'), tpBars: NP('tpBars'), smcOpts: {mslen: NP('smcLen'), window: NP('smcWindow'), swingLimit: NP('smcSwing'), sweep: NP('smcSweep'), oblast: NP('obLast'), obmiti: NP('obMiti')}};
}
const pineHit = (res, spec, cs, k) => CCTAlertEval.pineHit(res, spec, cs, k); // → {hit, msg}
function indSummary(a) { // texto legible de una alerta de indicador
  return a.label || 'Indicador';
}
const alGroups = new Map(); let alBusy = false;
function closedIdx(cs, lastClosedT) { for (let i = cs.length - 1; i >= 0; i--) if (cs[i].t === lastClosedT) return i; return -1; }
function fireInd(a, info) {
  a.firedAt = Date.now(); a.firedInfo = info; if (a.repeat === 'once') a.on = false; if (!PR.n.ind) return;
  const msg = `${base(a.symbol)} ${a.interval} · ${a.label}${info ? ' · ' + info : ''}${a.note ? ' · ' + a.note : ''}`;
  const n = alNotify(a);
  if (n.app) { toast(msg); alertBeep(); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {} sysNotify('VORTEX · Alerta', msg, 'in-' + a.id); }
  if (n.dc && window.CCTDiscord) CCTDiscord.alert('ind', {symbol: base(a.symbol), interval: a.interval, label: a.label, info, note: a.note, text: msg});
}
async function lastClosedBar(sym, itv) {
  if (sym.includes('@')) { const cs = await CCTMarkets.klinesAny(sym, itv, 3); return cs.length ? cs[cs.length - 1].t : null; } // cualquier exchange (markets.js)
  const raw = await getJSON(`${API}/klines?symbol=${sym}&interval=${itv}&limit=2`), now = Date.now(), cl = raw.filter(d => d[6] < now);
  return cl.length ? cl[cl.length - 1][0] : null;
}
async function indAlertTick(force) {
  if (alBusy) return; const act = state.alerts.filter(a => a.kind === 'ind' && a.on); if (!act.length) return;
  alBusy = true; let changed = false;
  try {
    const groups = new Map(); for (const a of act) { const key = a.symbol + '|' + a.interval; (groups.get(key) || groups.set(key, []).get(key)).push(a); }
    for (const [key, list] of groups) {
      const [sym, itv] = key.split('|'), g = alGroups.get(key) || {next: 0, at: 0}, now = Date.now();
      if (!force && now < g.next && now - g.at < 300000) continue;
      let lc; try { lc = await lastClosedBar(sym, itv); } catch { continue; }
      if (lc === null) continue;
      g.at = now; g.next = lc + 2 * IV_MS[itv] + 2000; alGroups.set(key, g);
      const due = list.filter(a => a.lastBar < lc); if (!due.length) continue;
      const cs = sym.includes('@') ? await CCTMarkets.klinesAny(sym, itv, 1000).catch(() => []) : await pineSecCandles(sym, itv), k = closedIdx(cs, lc); if (k < 1) continue; // velas del exchange de la moneda
      const runs = new Map(); let nova = null;
      for (const a of due) {
        const from = Math.max(1, k - 4), bars = []; for (let i = from; i <= k; i++) if (cs[i].t > a.lastBar) bars.push(i);
        let hitInfo = null;
        try {
          if (a.src === 'std') { for (const i of bars) if (stdHit(cs, i, a.spec)) hitInfo = fmt(cs[i].c); }
          else if (a.src === 'nova') {
            if (!nova) nova = NovaNexus.compute(cs, novaOpts());
            for (const i of bars) { const sg = nova.bySignal[i]; if (sg && (a.spec.side === 'any' || sg.side === a.spec.side) && sg.score >= (a.spec.minScore || 0)) hitInfo = `${sg.side === 'buy' ? 'COMPRA' : 'VENTA'} ★${sg.score} @ ${fmt(sg.price)}`; }
          } else if (a.src === 'pine') {
            const s = scripts.find(x => x.id === a.sid), p = state.pine.find(x => x.sid === a.sid);
            if (s) {
              if (!runs.has(a.sid)) runs.set(a.sid, await pineRunFull(s.code, {inputs: (p && p.inputs) || {}, interval: itv, symbol: sym, name: s.name, cs, timeLimitMs: 12000}));
              const res = runs.get(a.sid);
              if (res && res.ok) for (const i of bars) { const r = pineHit(res, a.spec, cs, i); if (r.hit) hitInfo = r.msg || ''; }
            }
          }
        } catch (e) { console.warn('alerta', e); }
        a.lastBar = lc; changed = true;
        if (hitInfo !== null) fireInd(a, hitInfo);
      }
    }
  } finally { alBusy = false; }
  if (changed) { save(); renderAlerts(); }
}
window.CCTAlerts = {stdHit, pineHit, STD_CONDS}; // expuesto para pruebas
window.CCTPushBridge = {state: () => state, prefs: () => PR, save: () => save(), setSound: on => setPref('sound', on ? 'on' : 'off'), renderPrefs: () => renderPrefs(), renderAlerts: () => renderAlerts(), scheduleRender: () => scheduleRender(), toast: m => toast(m), uid: () => (fbUser && fbUser.uid) || '',
  indAlerts: () => state.alerts.filter(a => a.kind === 'ind').map(a => Object.assign({id: a.id, symbol: a.symbol, interval: a.interval, src: a.src, sid: a.sid, spec: a.spec, label: a.label, note: a.note, notify: a.notify, repeat: a.repeat, on: a.on, lastBar: a.lastBar || 0, firedAt: a.firedAt || 0, firedInfo: a.firedInfo || ''},
    a.src === 'pine' ? {inputs: (state.pine.find(p => p.sid === a.sid) || {}).inputs || {}} : {}, a.src === 'nova' ? {nopt: novaOpts()} : {})), // el servidor las revisa con la app cerrada (scripts/ind-alerts.js)
  applyInd: back => { let ch = false; for (const s of back || []) { const a = state.alerts.find(x => x.id === s.id && x.kind === 'ind'); if (!a || !(s.firedAt > (a.firedAt || 0))) continue; a.on = s.on; a.firedAt = s.firedAt; a.firedInfo = s.firedInfo || ''; a.lastBar = Math.max(a.lastBar || 0, s.lastBar || 0); ch = true; } if (ch) { save(); renderAlerts(); } }}; // para push.js (avisos con la app cerrada)
/* Seguimiento de tus trades abiertos (trade-watch.js): avisos de cómo va cada posición real de tu exchange y resaltado en Mi seguimiento */
if (window.CCTTradeWatch && CCTTradeWatch.host) CCTTradeWatch.host({
  prefs: () => PR, fmt: v => fmt(v),
  levels: b => { // tus líneas y rayos horizontales de esa moneda (en cualquier exchange) = niveles importantes
    const out = []; for (const [k, arr] of Object.entries(state.drawings || {})) { if (CCTTradeWatch.stripBase(baseOnly(k)) !== b || !Array.isArray(arr)) continue; for (const d of arr) if (d && (d.type === 'horizontal' || d.type === 'hray') && d.a && +d.a.p > 0) out.push(+d.a.p); }
    return out;
  },
  async prices(keys) {
    const out = {}, bin = keys.filter(k => !k.includes('@')), oth = keys.filter(k => k.includes('@'));
    if (bin.length) try { for (const t of await getJSON(`${API}/ticker/price?symbols=${encodeURIComponent(JSON.stringify(bin))}`)) out[t.symbol] = +t.price; } catch {}
    if (oth.length && window.CCTMarkets) try { const t = await CCTMarkets.tickers(oth); for (const k of oth) if (t[k]) out[k] = +t[k].lastPrice; } catch {}
    return out;
  },
  notify(title, body, tag, kind) {
    toast(body);
    if (PR.sound !== 'off') { alertBeep(); try { navigator.vibrate && navigator.vibrate(kind === 'liqN' || kind === 'liq' || kind === 'sl' ? [120, 60, 120, 60, 120] : [200, 100, 200]); } catch {} }
    if (!(window.VortexPush && VortexPush.on)) sysNotify(title, body, tag); // con los avisos de app cerrada encendidos la notificación del sistema la manda el servidor (misma etiqueta, sin duplicados)
  }
});
if (window.CCTTradeWatch && CCTTradeWatch.onChange) CCTTradeWatch.onChange(() => renderWatch());
setInterval(() => { if (!document.hidden) indAlertTick(); }, 15000);
setTimeout(indAlertTick, 4000);

/* Diálogo "Alerta con indicador" */
function openIndAlertDialog() {
  const pines = state.pine.filter(p => scripts.some(s => s.id === p.sid));
  const el = document.createElement('div'); el.className = 'cfg-overlay';
  const inds = [['std', 'Indicadores comunes (EMA, RSI, MACD…)'], ['nova', 'Nova Nexus (señales)']].concat(pines.map(p => ['pine:' + p.sid, 'Script: ' + pineName(p.sid)]));
  el.innerHTML = `<div class="cfg-dlg" role="dialog" aria-modal="true" aria-label="Alerta con indicador"><div class="cfg-head"><strong>Alerta con indicador</strong><button class="cfg-x" aria-label="Cerrar">✕</button></div>
    <div class="cfg-body"><div class="cfg-sec">
      <label class="al-f">Indicador<select id="aiSrc">${inds.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>
      <label class="al-f">Condición<select id="aiCond"></select></label>
      <div id="aiExtra"></div>
      <label class="al-f">Activo<select id="aiSym">${state.symbols.map(s => `<option value="${s}" ${s === state.symbol ? 'selected' : ''}>${esc(pairLbl(s))}</option>`).join('')}</select></label>
      <label class="al-f">Temporalidad<select id="aiTf">${INTERVALS.map(t => `<option ${t === state.interval ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="al-f">Frecuencia<select id="aiRep"><option value="once">Solo una vez</option><option value="every">Cada vez que ocurra (al cerrar la vela)</option></select></label>
      <label class="al-f">Notificaciones<select id="aiNot"><option value="app">Solo en la app</option><option value="discord">Solo en Discord</option><option value="both">App y Discord</option></select></label>
      <label class="al-f">Mensaje (opcional)<input id="aiNote" maxlength="140"></label>
      <p class="cfg-note" id="aiHint">Se evalúa al cierre de cada vela, así evita falsas señales por repintado.</p>
    </div></div>
    <div class="cfg-foot"><span class="cfg-sp"></span><button class="cfg-btn" data-act="cancel">Cancelar</button><button class="cfg-btn cfg-ok" data-act="ok">Crear alerta</button></div></div>`;
  document.body.appendChild(el);
  const $e = s => el.querySelector(s), close = () => el.remove();
  let opts = []; // [{v, label, spec}]
  const fillCond = () => {
    const src = $e('#aiSrc').value, extra = $e('#aiExtra'); extra.innerHTML = ''; opts = [];
    if (src === 'std') opts = STD_CONDS.map(([k, l]) => ({label: l, spec: {k}}));
    else if (src === 'nova') opts = [{label: 'Señal de COMPRA', spec: {side: 'buy'}}, {label: 'Señal de VENTA', spec: {side: 'sell'}}, {label: 'Cualquier señal', spec: {side: 'any'}}];
    else {
      const sid = src.slice(5), r = pineRes[sid];
      if (!r || !r.ok) { $e('#aiCond').innerHTML = '<option value="">(abre el gráfico para que el script se calcule)</option>'; $e('#aiHint').textContent = 'El script aún no se ha calculado o tiene errores. Actívalo en el gráfico e inténtalo de nuevo.'; return; }
      (r.alerts || []).forEach((x, i) => opts.push({label: (x.kind === 'cond' ? 'alertcondition: ' : 'alert(): ') + x.title + (x.message && x.kind === 'cond' ? ` — ${x.message.slice(0, 40)}` : ''), spec: {t: 'ac', kind: x.kind, title: x.title, i}}));
      r.shapes.forEach((x, i) => { if (x.pts.length || true) opts.push({label: 'Señal/forma: ' + (x.title || 'sin título'), spec: {t: 'sh', kind: x.kind, title: x.title || '', i}}); });
      opts.push({label: 'Cruce de líneas del indicador…', spec: {t: 'x'}, cross: true});
      $e('#aiHint').textContent = `Condiciones leídas de este script: ${(r.alerts || []).length} alertcondition/alert(), ${r.shapes.length} forma(s) y cruces entre sus ${r.plots.length} línea(s).`;
    }
    $e('#aiCond').innerHTML = opts.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join('');
    condChange();
  };
  const condChange = () => {
    const o = opts[+$e('#aiCond').value], extra = $e('#aiExtra'); extra.innerHTML = '';
    if (!o) return;
    if (o.spec.k === 'rsi_up' || o.spec.k === 'rsi_dn') extra.innerHTML = `<label class="al-f">Nivel RSI<input id="aiLvl" inputmode="decimal" value="${o.spec.k === 'rsi_up' ? 70 : 30}"></label>`;
    if (o.spec.side) extra.innerHTML = `<label class="al-f">Puntuación mínima (★)<select id="aiScore">${[0, 2, 3, 4, 5].map(n => `<option value="${n}">${n ? '≥ ' + n : 'Cualquiera'}</option>`).join('')}</select></label>`;
    if (o.cross) {
      const r = pineRes[$e('#aiSrc').value.slice(5)], pl = r.plots.map(p => `<option value="p:${p.id}">${esc(p.title || 'Línea ' + p.id)}</option>`).join('');
      extra.innerHTML = `<label class="al-f">Línea A<select id="aiA">${pl}<option value="price">Precio (cierre)</option></select></label><label class="al-f">Cruza<select id="aiDir"><option value="up">al alza</option><option value="dn">a la baja</option></select></label><label class="al-f">Línea B<select id="aiB"><option value="price">Precio (cierre)</option>${pl}<option value="n">Nivel fijo…</option></select></label><label class="al-f" id="aiNWrap" style="display:none">Nivel<input id="aiN" inputmode="decimal" placeholder="Ej. 50"></label>`;
      const ab = $e('#aiB'); if (r.plots.length > 1) ab.value = 'p:' + r.plots[1].id; ab.onchange = () => { $e('#aiNWrap').style.display = ab.value === 'n' ? '' : 'none'; };
    }
  };
  $e('#aiSrc').onchange = fillCond; $e('#aiCond').onchange = condChange; fillCond();
  const ser = v => v === 'price' ? {price: 1} : v.startsWith('p:') ? {p: +v.slice(2)} : {n: parseFloat(String($e('#aiN').value).replace(',', '.'))};
  el.addEventListener('click', async e => {
    if (e.target === el || e.target.closest('.cfg-x') || e.target.closest('[data-act=cancel]')) return close();
    if (!e.target.closest('[data-act=ok]')) return;
    const src = $e('#aiSrc').value, o = opts[+$e('#aiCond').value]; if (!o) { toast('Elige una condición'); return; }
    const spec = JSON.parse(JSON.stringify(o.spec)); let label = o.label, kind = src.startsWith('pine:') ? 'pine' : src;
    if (spec.k === 'rsi_up' || spec.k === 'rsi_dn') { const L = parseFloat(String($e('#aiLvl').value).replace(',', '.')); if (!Number.isFinite(L)) { toast('Nivel de RSI inválido'); return; } spec.lvl = L; label += ' ' + L; }
    if (spec.side) { spec.minScore = +$e('#aiScore').value; label += spec.minScore ? ` (★≥${spec.minScore})` : ''; label = 'Nova Nexus · ' + label; }
    if (o.cross) {
      spec.a = ser($e('#aiA').value); spec.b = ser($e('#aiB').value); spec.dir = $e('#aiDir').value;
      if (spec.b.n !== undefined && !Number.isFinite(spec.b.n)) { toast('Escribe el nivel fijo'); return; }
      const nm = s => s.price ? 'Precio' : s.n !== undefined ? String(s.n) : ((pineRes[src.slice(5)].plots.find(p => p.id === s.p) || {}).title || 'Línea');
      label = `${nm(spec.a)} cruza ${spec.dir === 'up' ? 'al alza' : 'a la baja'} ${nm(spec.b)}`;
    }
    if (kind === 'pine') label = pineName(src.slice(5)) + ' · ' + label.replace(/^(alertcondition|alert\(\)|Señal\/forma): /, '').replace(/ — .*$/, '');
    if (kind === 'std') label = 'Indicador · ' + label;
    const sym = $e('#aiSym').value, itv = $e('#aiTf').value; if ($e('#aiNot').value !== 'app' && !alDiscordReady()) toast('Aún no conectas Discord (barra derecha): el aviso llegará solo a la app');
    if (state.alerts.length >= 50) { toast('Máximo 50 alertas'); return; }
    let lc; try { lc = await lastClosedBar(sym, itv); } catch {}
    if (lc == null) { toast('No pude leer las velas; revisa tu conexión'); return; }
    state.alerts.unshift({id: 'al' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind: 'ind', src: kind, sid: kind === 'pine' ? src.slice(5) : '', spec, label, symbol: sym, interval: itv, repeat: $e('#aiRep').value, notify: $e('#aiNot').value, on: true, note: $e('#aiNote').value.trim().slice(0, 140), created: Date.now(), firedAt: 0, lastBar: lc, firedInfo: ''});
    alGroups.delete(sym + '|' + itv); save(); renderAlerts(); close(); toast('Alerta con indicador creada');
    try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch {}
  });
}

/* ───────── Velas y datos en vivo ───────── */
function setFeedback(t) { $('#chartFeedback').textContent = t; }
function defaultVisible() { const w = $('#chartArea').clientWidth || 360; return clamp(Math.round((w - 70) / (isDesktop() ? 7 : 5.5)), 40, 260); }
function renderFrames() {
  $('#timeframes').innerHTML = INTERVALS.map(t => `<button class="${t === state.interval ? 'active' : ''}" data-tf="${t}">${t}</button>`).join('');
  const tfb = $('#tfBtn'); if (tfb) tfb.textContent = state.interval + ' ▾';
}
/* Móvil/tablet: la temporalidad y las opciones secundarias van en menús desplegables para dejar más sitio al gráfico (en escritorio siguen en la barra) */
(() => {
  const view = $('#chartView'), tb = view.querySelector('.chart-toolbar'), tf = $('#tfBtn'), more = $('#moreBtn');
  const close = () => { view.classList.remove('tf-open', 'more-open'); tf.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-expanded', 'false'); };
  const toggle = (cls, btn, panel) => {
    const was = view.classList.contains(cls); close(); if (was) return;
    // la píldora del celular está abajo: los menús se abren hacia arriba
    const r = tb.getBoundingClientRect(), vr = view.getBoundingClientRect();
    if (r.top - vr.top > vr.height / 2) { panel.style.top = 'auto'; panel.style.bottom = (vr.bottom - r.top + 8) + 'px'; } else { panel.style.bottom = 'auto'; panel.style.top = (r.bottom - vr.top + 8) + 'px'; }
    view.classList.add(cls); btn.setAttribute('aria-expanded', 'true');
  };
  /* celular: desliza el dedo hacia arriba o hacia abajo sobre la temporalidad para cambiarla sin abrir el menú (arriba = más grande) */
  let sw = null, swHint = null, swAt = 0;
  const swShow = i => {
    if (!swHint) { swHint = document.createElement('div'); swHint.className = 'tf-wheel'; view.appendChild(swHint); }
    swHint.innerHTML = [i + 1, i, i - 1].map((k, n) => `<span class="${n === 1 ? 'cur' : ''}">${INTERVALS[k] || '·'}</span>`).join('');
    const r = tf.getBoundingClientRect(), vr = view.getBoundingClientRect(); swHint.style.left = (r.left - vr.left + r.width / 2) + 'px'; swHint.style.top = (r.top - vr.top - 8) + 'px';
  };
  tf.addEventListener('pointerdown', e => { if (isDesktop()) return; const i = INTERVALS.indexOf(state.interval); sw = {y: e.clientY, i0: i, i, moved: false}; try { tf.setPointerCapture(e.pointerId); } catch {} });
  tf.addEventListener('pointermove', e => {
    if (!sw) return; const dy = sw.y - e.clientY; if (!sw.moved && Math.abs(dy) < 10) return;
    if (!sw.moved) { sw.moved = true; close(); tf.classList.add('swiping'); }
    const i = clamp(sw.i0 + Math.round(dy / 24), 0, INTERVALS.length - 1); if (i !== sw.i) { sw.i = i; navigator.vibrate?.(6); }
    tf.textContent = INTERVALS[i] + ' ▾'; swShow(i); e.preventDefault();
  });
  const swEnd = e => {
    if (!sw) return; const s = sw; sw = null; tf.classList.remove('swiping'); if (swHint) { swHint.remove(); swHint = null; } if (!s.moved) return;
    swAt = Date.now(); // el toque que cierra el gesto no abre el menú
    if (e.type === 'pointerup' && s.i !== s.i0) { state.interval = INTERVALS[s.i]; save(); renderFrames(); clearTransient(); loadCandles(); } else renderFrames();
  };
  tf.addEventListener('pointerup', swEnd); tf.addEventListener('pointercancel', swEnd);
  tf.onclick = e => { e.stopPropagation(); if (Date.now() - swAt < 450) return; toggle('tf-open', tf, $('#timeframes')); };
  more.onclick = e => { e.stopPropagation(); toggle('more-open', more, $('#moreGroup')); };
  document.addEventListener('click', e => {
    if (!view.classList.contains('tf-open') && !view.classList.contains('more-open')) return;
    close();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', close);
  // celular: en la píldora quedan solo los esenciales; lo demás pasa a «Más» (en escritorio todo vuelve a su lugar)
  // celular: la barra flotante solo lleva la temporalidad actual y la estrella; todo lo demás va en el menú que se despliega
  const MOVE = [tb.querySelector('[data-panel=indicators]'), $('#liqBtn'), tb.querySelector('[data-panel=tools]'), $('#designsBtn'), $('#tradeBtn'), $('#replayBtn'), $('#bookBtn'), $('#journalBtn')].filter(Boolean), UNDO = $('#undoDraw');
  const ORIG = [...tb.children], firstOwn = $('#layoutBtn'); // orden original de la barra (para volver a escritorio)
  const place = () => {
    const mob = !isDesktop(), grp = $('#moreGroup');
    if (mob) { MOVE.forEach(b => { if (b.parentNode !== grp) grp.insertBefore(b, firstOwn && firstOwn.parentNode === grp ? firstOwn : null); }); if (UNDO && UNDO.parentNode !== grp) grp.appendChild(UNDO); if (grp.parentNode !== view) view.appendChild(grp); } // fuera de la barra para que no lo recorte
    else {
      if ([...tb.children].some((c, i) => c !== ORIG[i]) || tb.children.length !== ORIG.length) ORIG.forEach(c => tb.appendChild(c));
    }
    view.classList.toggle('pill-bar', mob); pillPos();
  };
  /* posición de la barra flotante: la mueves con la agarradera y se queda donde la dejaste (se guarda en este celular) */
  const PK = 'cct_pill_pos_v1'; let PP = (() => { try { const v = JSON.parse(localStorage.getItem(PK) || 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null; } catch { return null; } })();
  function pillPos() {
    if (isDesktop()) { tb.style.left = tb.style.top = ''; return; }
    const W = view.clientWidth, Hh = view.clientHeight, w = tb.offsetWidth || 150, h = tb.offsetHeight || 40; if (!W || !Hh) return;
    const x = PP ? PP.x * Math.max(0, W - w) : 10, y = PP ? PP.y * Math.max(0, Hh - h) : Hh - h - 34;
    tb.style.left = clamp(x, 0, Math.max(0, W - w)) + 'px'; tb.style.top = clamp(y, 0, Math.max(0, Hh - h)) + 'px';
  }
  const grip = $('#pillGrip');
  if (grip) grip.addEventListener('pointerdown', e => {
    if (isDesktop()) return; e.preventDefault(); e.stopPropagation(); close(); if (fbOpen) setFbOpen(false);
    const r = tb.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top; tb.classList.add('dragging'); try { grip.setPointerCapture(e.pointerId); } catch {}
    const mv = ev => { const vr = view.getBoundingClientRect(), W = vr.width - tb.offsetWidth, Hh = vr.height - tb.offsetHeight;
      PP = {x: W > 0 ? clamp((ev.clientX - vr.left - ox) / W, 0, 1) : 0, y: Hh > 0 ? clamp((ev.clientY - vr.top - oy) / Hh, 0, 1) : 0}; pillPos(); };
    const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); tb.classList.remove('dragging'); try { localStorage.setItem(PK, JSON.stringify(PP)); } catch {} navigator.vibrate?.(8); };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up); navigator.vibrate?.(10);
  });
  if (window.ResizeObserver) new ResizeObserver(() => pillPos()).observe(view);
  more.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
  window.CCT_pillPos = pillPos;
  const fp = $('#favPillBtn'); if (fp) fp.addEventListener('click', e => { e.stopPropagation(); if (!FB.show) { FB.show = true; syncUi(); renderFavBar(); } setFbOpen(!fbOpen); placeFab(); });
  place(); if (deskMQ.addEventListener) deskMQ.addEventListener('change', () => { close(); place(); });
  /* Celular: deja presionado un botón del menú (Indicadores, Liquidaciones, Dibujar, Plantillas, Operar…) para fijarlo como favorito.
     Los favoritos salen junto a la estrella de la píldora: la píldora crece y ya no tienes que abrir el menú. Se guardan en este celular. */
  const grp = $('#moreGroup'), pf = $('#pillFavs'), PFK = 'cct_pill_favs_v1', PF_MAX = 5;
  let favs = (() => { const u = (state.ui || {}).pillFavs; if (Array.isArray(u)) return u.slice(0, PF_MAX); try { const a = JSON.parse(localStorage.getItem(PFK) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, PF_MAX) : []; } catch { return []; } })(); // de tu cuenta (o de este celular, la primera vez)
  const keyOf = b => b.id || (b.dataset.panel ? 'panel-' + b.dataset.panel : '');
  const btnOf = k => k.startsWith('panel-') ? document.querySelector(`#chartView [data-panel="${k.slice(6)}"]:not(.pf-btn)`) : document.getElementById(k);
  const labelOf = b => { const t = (b.textContent || '').replace(/ƒx/g, '').replace(/\(\d+\)/g, '').replace(/\s+/g, ' ').trim(); return t || (b.getAttribute('title') || '').split(' · ')[0].split(':')[0]; };
  const iconOf = b => { const s = b.querySelector('svg'); return s ? s.outerHTML : `<b class="pf-fx">${(b.textContent.trim().split(/\s+/)[0] || '•').slice(0, 2)}</b>`; };
  const syncOne = (p, b) => { const on = b.classList.contains('on') || b.getAttribute('aria-pressed') === 'true'; p.classList.toggle('on', on); p.hidden = !!b.hidden; };
  function renderPF() {
    if (!pf) return; const show = favs.filter(k => btnOf(k)); // solo se muestran los que existen (no se borran de tu lista)
    pf.innerHTML = show.map(k => { const b = btnOf(k); return `<button type="button" class="pf-btn" data-pf="${esc(k)}" title="${esc(labelOf(b))}" aria-label="${esc(labelOf(b))}">${iconOf(b)}</button>`; }).join('');
    pf.querySelectorAll('[data-pf]').forEach(p => syncOne(p, btnOf(p.dataset.pf)));
    if (grp) grp.querySelectorAll('button').forEach(b => b.classList.toggle('is-fav', favs.includes(keyOf(b))));
    pillPos();
  }
  const saveFavs = () => { try { localStorage.setItem(PFK, JSON.stringify(favs)); } catch {} try { syncUi(); } catch {} }; // también a tu cuenta (los ves en tus otros celulares)
  window.CCT_pillFavs = () => favs.slice();
  window.CCT_setPillFavs = a => { const n = a.filter(x => typeof x === 'string').slice(0, PF_MAX); if (JSON.stringify(n) === JSON.stringify(favs)) return; favs = n; try { localStorage.setItem(PFK, JSON.stringify(favs)); } catch {} renderPF(); };
  if (pf) pf.addEventListener('click', e => {
    const p = e.target.closest('[data-pf]'); if (!p) return; e.stopPropagation(); close();
    const b = btnOf(p.dataset.pf); if (!b) return;
    const r = p.getBoundingClientRect(); b.getBoundingClientRect = () => r; // los menús que se abren junto al botón se colocan junto al favorito
    try { b.click(); } finally { setTimeout(() => { delete b.getBoundingClientRect; }, 0); }
    setTimeout(() => pf.querySelectorAll('[data-pf]').forEach(q => { const o = btnOf(q.dataset.pf); if (o) syncOne(q, o); }), 60);
  });
  if (grp) { // mantener presionado ≈0.5 s = fijar / quitar de favoritos
    let lp = 0, rt = 0, fired = false, st = null;
    grp.addEventListener('pointerdown', e => { if (isDesktop()) return; const b = e.target.closest('button'); if (!b || !keyOf(b)) return; fired = false; clearTimeout(rt); st = {x: e.clientX, y: e.clientY}; clearTimeout(lp);
      lp = setTimeout(() => { fired = true; const k = keyOf(b), i = favs.indexOf(k);
        if (i >= 0) { favs.splice(i, 1); toast(labelOf(b) + ' ya no está en la barra'); }
        else if (favs.length >= PF_MAX) { toast(`Máximo ${PF_MAX} favoritos en la barra: deja presionado uno para quitarlo`); return; }
        else { favs.push(k); toast(labelOf(b) + ' fijado junto a la estrella'); }
        navigator.vibrate?.(14); saveFavs(); renderPF(); clearTimeout(rt); rt = setTimeout(() => { fired = false; }, 900); b.classList.remove('fav-pop'); void b.offsetWidth; b.classList.add('fav-pop'); }, 500); });
    grp.addEventListener('pointermove', e => { if (st && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) clearTimeout(lp); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => grp.addEventListener(ev, () => { clearTimeout(lp); st = null; }));
    const block = e => { if (!fired) return; fired = false; e.stopImmediatePropagation(); e.preventDefault(); }; // el toque largo no abre la herramienta (ni los planes de un botón bloqueado)
    window.addEventListener('click', block, true);
    grp.addEventListener('contextmenu', e => { if (!isDesktop()) e.preventDefault(); });
    if (window.MutationObserver) new MutationObserver(() => { if (pf) pf.querySelectorAll('[data-pf]').forEach(q => { const o = btnOf(q.dataset.pf); if (o) syncOne(q, o); }); }).observe(grp, {subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'hidden']});
    if (!grp.querySelector('.mg-hint')) { const h = document.createElement('small'); h.className = 'mg-hint mob-only'; h.textContent = 'Deja presionado un botón para fijarlo junto a la estrella'; grp.appendChild(h); }
  }
  renderPF(); setTimeout(renderPF, 1500); // algunos botones (Liquidaciones, Plantillas) se completan después
})();
$('#timeframes').addEventListener('click', e => {
  const b = e.target.closest('[data-tf]'); if (!b) return;
  state.interval = b.dataset.tf; save(); renderFrames(); clearTransient(); loadCandles();
});
/* Botón «+» al lado derecho de la tarjeta de la moneda (nombre/precio): agrega la moneda abierta a Mi seguimiento.
   Se coloca pegado a la tarjeta aunque cambie de ancho (precio más largo, chips de derivados); si ya está en tu lista se vuelve una palomita. */
var wlOpenSym = null, wlFab = $('#wlAddFab'); // var: renderWatch() puede llamar a paintWlFab() antes de llegar aquí
function placeWlFab() {
  const h = $('#chartSymHead'); if (!wlFab || !h) return;
  const vis = h.offsetParent !== null && h.offsetWidth > 0; wlFab.hidden = !vis; if (!vis) return;
  const s = innerWidth <= 760 ? 26 : 34, gap = innerWidth <= 760 ? 6 : 8;
  wlFab.style.left = Math.round(h.offsetLeft + h.offsetWidth + gap) + 'px';
  wlFab.style.top = Math.round(h.offsetTop + Math.min(h.offsetHeight, innerWidth <= 760 ? 44 : 52) / 2 - s / 2) + 'px';
  requestAnimationFrame(() => wlFab.classList.add('ready'));
}
function paintWlFab() {
  if (!wlFab) return; const on = state.symbols.includes(state.symbol), t = on ? `${base(state.symbol)} ya está en Mi seguimiento` : `Agregar ${base(state.symbol)} a Mi seguimiento`;
  if (wlFab.classList.contains('in') !== on) wlFab.classList.toggle('in', on);
  const gone = on && !(wlFab.dataset.just === state.symbol); // ya está en tu lista: el botón no aparece (solo se ve la palomita un momento al agregarla)
  if (wlFab.classList.contains('gone') !== gone) { wlFab.classList.toggle('gone', gone); wlFab.tabIndex = gone ? -1 : 0; wlFab.setAttribute('aria-hidden', String(gone)); }
  const fresh = wlOpenSym !== state.symbol; // destello solo al cambiar de moneda (la lista se repinta con cada precio)
  for (const r of document.querySelectorAll('#watchRows .watch-row[data-symbol]')) { const o = r.dataset.symbol === state.symbol; if (r.classList.contains('is-open') !== o) r.classList.toggle('is-open', o); if (o && fresh) { r.classList.add('sheen'); wlOpenSym = state.symbol; } } // la moneda abierta en el gráfico se resalta en Mi seguimiento
  if (wlFab.title !== t) { wlFab.title = t; wlFab.setAttribute('aria-label', t); }
}
if (wlFab) {
  wlFab.addEventListener('click', () => {
    const s = state.symbol; if (!s) return;
    if (state.symbols.includes(s)) { toast(`${base(s)} ya está en tu seguimiento`); return; }
    wlAdd(s); save(); renderWatch(); fetchTicker(); paintWlFab();
    wlFab.classList.remove('pop'); void wlFab.offsetWidth; wlFab.classList.add('pop');
    wlFab.dataset.just = s; clearTimeout(wlFab._t); wlFab._t = setTimeout(() => { delete wlFab.dataset.just; paintWlFab(); }, 1100); paintWlFab();
    try { navigator.vibrate && navigator.vibrate(12); } catch {}
    toast(`${base(s)} añadido a tu seguimiento${srcOf(s) !== 'binance' ? ' (' + exName(s) + ')' : ''}`);
  });
  wlFab.addEventListener('animationend', () => wlFab.classList.remove('pop'));
  { const h = $('#chartSymHead'); if (h && window.ResizeObserver) new ResizeObserver(placeWlFab).observe(h); }
  addEventListener('resize', placeWlFab); setTimeout(placeWlFab, 300);
}
const symHeadH = () => { const e = $('#chartSymHead'); return e && e.offsetParent !== null ? e.offsetHeight + 4 : 0; }; // alto que ocupa el nombre/precio flotante: solo baja la leyenda, el gráfico llega hasta arriba
function updateChartHeader() {
  const b = base(state.symbol), t = tickers[state.symbol];
  const last = candles.length ? candles[candles.length - 1].c : Number(t?.lastPrice);
  const ch = Number(t?.priceChangePercent);
  { const ci = $('#coinIcon'), sb = baseOnly(state.symbol), key = state.symbol; if (ci.dataset.k !== key) { ci.dataset.k = key; ci.classList.remove('has-img'); ci.innerHTML = esc(meta(state.symbol)[1]) + (sb.endsWith('.D') || srcOf(state.symbol) === 'dom' ? '' : coinImg(sb)); } }
  paintWlFab();
  $('#coinTitle').textContent = pairLbl(state.symbol).replace('/', ' / '); { const sl = $('#srcLabel'); if (sl) sl.textContent = (SOURCES[dataSrc || srcOf(state.symbol)] || 'Binance Spot').toUpperCase() + ' ▾'; }
  $('#chartLabel').textContent = symOf(state.symbol);
  $('#intervalLabel').textContent = state.interval;
  $('#lastPrice').textContent = fmt(last);
  $('#dayChange').textContent = pct(ch);
  $('#dayChange').className = ch >= 0 ? 'positive' : 'negative';
  if (typeof scheduleRender === 'function') scheduleRender();
}
/* Velas desde Binance o Bybit Spot (para que el perfil de volumen y el POC coincidan con TradingView/Bybit). Si Bybit falla o no lista el par, se usa Binance. */
const BYBIT = 'https://api.bybit.com/v5/market', BY_IV = {'1m':'1','5m':'5','15m':'15','30m':'30','1h':'60','4h':'240','1d':'D','1w':'W','1M':'M'};
async function fetchKlinesBybit(sym, tf, limit = 1000, end = null, signal) {
  const j = await getJSON(`${BYBIT}/kline?category=spot&symbol=${sym}&interval=${BY_IV[tf]}&limit=${Math.min(1000, limit)}${end ? '&end=' + end : ''}`, signal);
  if (!j || j.retCode !== 0 || !j.result || !Array.isArray(j.result.list) || !j.result.list.length) throw new Error('Bybit sin datos');
  return j.result.list.map(d => ({t: +d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]})).reverse(); // Bybit las entrega de la más nueva a la más vieja
}
const bnRow = d => ({t: d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]});
const OKX_BAR = {'1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H', '1d': '1Dutc', '1w': '1Wutc', '1M': '1Mutc'}, CB_GRAN = {'1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1d': 86400};
const dashPair = s => { const [b, q] = splitSym(s); return `${b}-${q}`; };
async function fetchOkx(sym, tf, limit = 1000, signal) { // OKX Spot: 300 velas recientes y luego historial de 100 en 100
  const inst = dashPair(sym), bar = OKX_BAR[tf], out = [];
  let j = await getJSON(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=${bar}&limit=300`, signal);
  if (!j || j.code !== '0' || !Array.isArray(j.data) || !j.data.length) throw new Error('OKX sin datos');
  out.push(...j.data);
  for (let page = 0; page < 6 && out.length < limit; page++) {
    j = await getJSON(`https://www.okx.com/api/v5/market/history-candles?instId=${inst}&bar=${bar}&limit=100&after=${out[out.length - 1][0]}`, signal);
    if (!j || j.code !== '0' || !Array.isArray(j.data) || !j.data.length) break; out.push(...j.data);
  }
  return out.slice(0, limit).map(d => ({t: +d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]})).reverse();
}
async function fetchCoinbase(sym, tf, limit = 900, signal) { // Coinbase: máx. 300 velas por consulta, temporalidades 1m 5m 15m 1h 1d
  const g = CB_GRAN[tf], prod = dashPair(sym), out = []; let end = Date.now();
  for (let page = 0; page < Math.ceil(limit / 300) && out.length < limit; page++) {
    const start = end - 300 * g * 1000, rows = await getJSON(`https://api.exchange.coinbase.com/products/${prod}/candles?granularity=${g}&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`, signal);
    if (!Array.isArray(rows) || !rows.length) break; out.push(...rows); end = start;
  }
  if (!out.length) throw new Error('Coinbase sin datos');
  return out.map(d => ({t: d[0] * 1000, o: +d[3], h: +d[2], l: +d[1], c: +d[4], v: +d[5]})).sort((a, b2) => a.t - b2.t).filter((c, i, arr) => !i || c.t !== arr[i - 1].t);
}
const SRC_FETCH = {
  binancef: {ok: () => true, get: (sym, tf, limit, sig) => getJSON(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${tf}&limit=${Math.min(1500, limit)}`, sig).then(d => d.map(bnRow))},
  bybit: {ok: tf => !!BY_IV[tf], get: (sym, tf, limit, sig) => fetchKlinesBybit(sym, tf, limit, null, sig)},
  okx: {ok: tf => !!OKX_BAR[tf], get: fetchOkx},
  coinbase: {ok: tf => !!CB_GRAN[tf], get: fetchCoinbase},
  bingx: {ok: tf => !!(window.CCTMarkets && CCTMarkets.BX_IV[tf]), get: (sym, tf, limit) => CCTMarkets.klinesBingx(dashPair(sym), tf, limit)},
  dom: {ok: () => true, get: (sym, tf, limit) => CCTMarkets.klinesDom(sym, tf, limit)}
};
['bybitf', 'okxf', 'bingxf', 'kucoin', 'gate', 'mexc', 'bitget', 'htx', 'kraken'].forEach(x => { SRC_FETCH[x] = {ok: tf => !!(window.CCTMarkets && CCTMarkets.tfOk(x, tf)), get: (sym, tf, limit) => CCTMarkets.klines(x, sym, tf, limit)}; }); // más exchanges (spot y perpetuos)
async function fetchKlinesAny(key, tf, signal, limit = 1000) { // el exchange va en la clave del activo; si no tiene el par o la temporalidad, se usa Binance Spot
  const sym = symOf(key), src = srcOf(key), f = SRC_FETCH[src];
  if (src === 'dom') return {cs: await f.get(sym, tf, limit, signal), src};
  if (f && f.ok(tf)) { try { return {cs: await f.get(sym, tf, limit, signal), src}; } catch (e) { if (e.name === 'AbortError') throw e; } }
  const data = await getJSON(`${API}/klines?symbol=${CCTMarkets.norm(sym)}&interval=${tf}&limit=${Math.min(1000, limit)}`, signal);
  return {cs: data.map(bnRow), src: 'binance'};
}
async function loadCandles(silent = false) {
  if (replay && !silent) replayExit(false); // cambiar de moneda o temporalidad termina la repetición
  if (fetchCtl) fetchCtl.abort();
  fetchCtl = new AbortController();
  const sym = state.symbol, tf = state.interval;
  if (!silent) { candles = []; ind = {}; setFeedback(`Cargando velas reales de ${SOURCES[srcOf(sym)] || 'Binance'}…`); render(); }
  try {
    const r = await fetchKlinesAny(sym, tf, fetchCtl.signal);
    if (sym !== state.symbol || tf !== state.interval) return;
    candles = r.cs; dataSrc = r.src;
    recalc(); setTimeout(() => dvRefresh(), 0);
    if (!silent) { stopMotion(); visible = defaultVisible(); pan = 0; const ca = $('#chartArea'); if (ca) { ca.classList.remove('swap-in'); void ca.offsetWidth; ca.classList.add('swap-in'); } }
    setFeedback(''); updateChartHeader(); render(); connectWS(); return true;
  } catch (e) {
    if (e.name === 'AbortError') return false;
    if (!silent && srcOf(sym) === 'dom') { setFeedback(e.message || 'Sin datos de dominancia'); render(); return; }
    if (!silent) { setFeedback(`No se pudieron cargar las velas de ${SOURCES[srcOf(sym)] || 'Binance'}${srcOf(sym) !== 'binance' ? ' ni de Binance Spot' : ''}. No se muestran datos simulados.`); render(); }
  }
}
/* ───────── Repetición de mercado (replay): eliges un punto del pasado y las velas avanzan una a una, como en vivo ───────── */
let replay = null, replayPick = false;
const RP_SPEEDS = [[1, 1000], [2, 500], [5, 200], [10, 100], [25, 40]];
function replayStart() {
  if (replay) { replayExit(true); return; }
  if (candles.length < 60) { toast('Espera a que carguen las velas'); return; }
  if (currentView !== 'chartView') switchView('chartView');
  replayPick = true; document.body.classList.add('rp-picking'); replayBar(); toast('Toca el gráfico donde quieres que empiece la repetición');
}
function replayBegin(idx) {
  replayPick = false; document.body.classList.remove('rp-picking');
  const all = candles.slice(); idx = Math.max(30, Math.min(all.length - 2, Math.round(idx)));
  replay = {all, idx, playing: false, speed: 0, timer: 0, start: idx, live: null, trades: []};
  stopMotion(); pan = 0; replayApply(); replayBar(); toast('Repetición lista: dale ▶ o avanza vela por vela');
}
function replayApply() {
  if (!replay) return; candles = replay.all.slice(0, replay.idx + 1); recalc(); updateChartHeader(); pineKey = ''; schedulePine(); scheduleRender(); replayBar();
}
function replayStep(n = 1) {
  if (!replay) return; if (replay.idx >= replay.all.length - 1) { replayPause(); toast('Llegaste al presente: sal de la repetición para ver el gráfico en vivo'); return; }
  const was = replay.idx; replay.idx = Math.min(replay.all.length - 1, replay.idx + n); if (pan > 0) pan += replay.idx - was; replayApply();
}
function replayBack(n = 1) { if (!replay) return; replay.idx = Math.max(30, replay.idx - n); replayApply(); }
function replayPlay() { if (!replay) return; if (replay.playing) return replayPause(); replay.playing = true; clearInterval(replay.timer); replay.timer = setInterval(() => replayStep(1), RP_SPEEDS[replay.speed][1]); replayBar(); }
function replayPause() { if (!replay) return; replay.playing = false; clearInterval(replay.timer); replayBar(); }
function replaySpeed() { if (!replay) return; replay.speed = (replay.speed + 1) % RP_SPEEDS.length; if (replay.playing) { clearInterval(replay.timer); replay.timer = setInterval(() => replayStep(1), RP_SPEEDS[replay.speed][1]); } replayBar(); }
function replayLive(k) { if (!replay) return; const a = replay.all, last = a[a.length - 1]; if (k.t === last.t) a[a.length - 1] = k; else if (k.t > last.t) a.push(k); replayBar(); } // sigue guardando el vivo para cuando salgas
function replayExit(reload = true) {
  replayPick = false; document.body.classList.remove('rp-picking');
  if (replay) { clearInterval(replay.timer); const all = replay.all; replay = null; candles = all; recalc(); updateChartHeader(); pineKey = ''; schedulePine(); }
  replayBar(); if (reload) { pan = 0; scheduleRender(); loadCandles(true); }
}
function replayBar() {
  const area = $('#chartArea'); if (!area) return; let bar = $('#rpBar');
  const btn = $('#replayBtn'); if (btn) btn.classList.toggle('on', !!(replay || replayPick));
  if (!replay && !replayPick) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'rpBar'; bar.className = 'rp-bar'; area.appendChild(bar); bar.addEventListener('pointerdown', e => e.stopPropagation()); bar.addEventListener('click', e => { const b = e.target.closest('[data-rp]'); if (!b) return; const a = b.dataset.rp; if (a === 'play') replayPlay(); else if (a === 'next') replayStep(1); else if (a === 'next10') replayStep(10); else if (a === 'prev') replayBack(1); else if (a === 'speed') replaySpeed(); else if (a === 'pick') { replayPause(); const all = replay ? replay.all : null; if (all) { candles = all; replay = null; } replayPick = true; document.body.classList.add('rp-picking'); recalc(); scheduleRender(); replayBar(); } else if (a === 'exit') replayExit(true); }); }
  const ic = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">${d}</svg>`;
  if (replayPick) { bar.innerHTML = `<span class="rp-tag">Repetición</span><span class="rp-hint">Toca el gráfico donde quieres empezar</span><button data-rp="exit" class="rp-x" aria-label="Cancelar">${ic('<path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/>')}</button>`; return; }
  const k = replay.all[replay.idx], d = new Date(k.t), z = n => String(n).padStart(2, '0'), done = replay.idx - replay.start, left = replay.all.length - 1 - replay.idx;
  const when = `${z(d.getDate())}/${z(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${z(d.getHours())}:${z(d.getMinutes())}`;
  bar.innerHTML = `<span class="rp-tag">Repetición</span>
    <button data-rp="pick" title="Elegir otro punto de inicio" aria-label="Elegir otro punto de inicio">${ic('<path d="M12 3a9 9 0 1 1-8.5 6h2.1A7 7 0 1 0 12 5V3z"/><path d="M3 4v5h5z"/>')}</button>
    <button data-rp="prev" title="Retroceder una vela" aria-label="Retroceder una vela">${ic('<path d="M6 5h2v14H6zM20 5v14L9 12z"/>')}</button>
    <button data-rp="play" class="rp-play" title="${replay.playing ? 'Pausa' : 'Reproducir'}" aria-label="${replay.playing ? 'Pausa' : 'Reproducir'}">${replay.playing ? ic('<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>') : ic('<path d="M8 5v14l11-7z"/>')}</button>
    <button data-rp="next" title="Avanzar una vela" aria-label="Avanzar una vela">${ic('<path d="M4 5v14l11-7zM16 5h2v14h-2z"/>')}</button>
    <button data-rp="next10" title="Avanzar 10 velas" aria-label="Avanzar 10 velas" class="rp-txt">+10</button>
    <button data-rp="speed" title="Velocidad" class="rp-txt rp-spd">${RP_SPEEDS[replay.speed][0]}×</button>
    <span class="rp-info"><b>${when}</b><small>${done} vela${done === 1 ? '' : 's'} · faltan ${left}</small></span>
    <button data-rp="exit" class="rp-x" title="Salir y volver al vivo" aria-label="Salir de la repetición">${ic('<path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/>')}</button>`;
}
{ // elegir el punto de inicio: un toque/clic en el gráfico mientras se elige
  const area = $('#chartArea');
  if (area) area.addEventListener('pointerdown', e => {
    if (!replayPick || e.target.closest('#rpBar, .chart-symhead, .wl-add-fab, .chart-controls, .favbar, .fav-fab')) return;
    const r = area.getBoundingClientRect(), x = e.clientX - r.left; if (!geo || !geo.step) return;
    e.preventDefault(); e.stopImmediatePropagation(); replayBegin(geo.start + (x - geo.left) / geo.step - .5);
  }, true);
  document.addEventListener('keydown', e => { if (!replay || /input|textarea|select/i.test((e.target.tagName || ''))) return; if (e.key === ' ') { e.preventDefault(); replayPlay(); } else if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); replayStep(1); } else if (e.key === 'Escape') replayExit(true); });
  const b = $('#replayBtn'); if (b) b.addEventListener('click', replayStart);
}
function setLive(on) { $('#liveDot').classList.toggle('on', !!on); }
function closeWS() { wsGen++; wsOpen = false; clearInterval(wsPing); if (ws) { ws.onclose = ws.onmessage = ws.onopen = ws.onerror = null; try { ws.close(); } catch {} } ws = null; setLive(false); }
let wsLast = 0, wsReloadAt = 0; // último dato en vivo recibido / última recarga del vigilante
function connectWS() {
  closeWS(); wsLast = Date.now();
  if (typeof WebSocket === 'undefined') return;
  const gen = wsGen, sym = symOf(state.symbol), tf = state.interval, src = dataSrc || 'binance';
  if (src === 'dom') { setLive(true); wsPing = setInterval(async () => { if (gen !== wsGen || document.hidden) return; try { const cs = await SRC_FETCH.dom.get(sym, tf, 3); if (gen === wsGen) cs.forEach(applyKline); } catch {} }, 60000); return; }
  if (SRC_FETCH[src] && !(window.CCTMarkets ? CCTMarkets.LIVE_WS : ['binance', 'binancef', 'bybit', 'okx']).includes(src)) { // Coinbase, BingX, KuCoin, Gate, MEXC, Bitget, HTX, Kraken: sin WebSocket público sencillo, se consulta cada 8 s
    setLive(true); wsPing = setInterval(async () => { if (gen !== wsGen || document.hidden) return; try { const cs = await SRC_FETCH[src].get(sym, tf, 3); if (gen === wsGen) cs.forEach(applyKline); } catch {} }, 8000); return;
  }
  const by = (src === 'bybit' || src === 'bybitf') && BY_IV[tf], ok = (src === 'okx' || src === 'okxf') && OKX_BAR[tf];
  const url = by ? `wss://stream.bybit.com/v5/public/${src === 'bybitf' ? 'linear' : 'spot'}` : ok ? 'wss://ws.okx.com:8443/ws/v5/business' : src === 'binancef' ? `wss://fstream.binance.com/ws/${sym.toLowerCase()}@kline_${tf}` : `wss://stream.binance.com:9443/ws/${sym.toLowerCase()}@kline_${tf}`;
  try { ws = new WebSocket(url); } catch { return; }
  ws.onopen = () => { if (gen === wsGen) { wsOpen = true; wsRetry = 0; setLive(true);
    if (by) { ws.send(JSON.stringify({op: 'subscribe', args: [`kline.${BY_IV[tf]}.${sym}`]})); clearInterval(wsPing); wsPing = setInterval(() => { try { ws.send(JSON.stringify({op: 'ping'})); } catch {} }, 20000); }
    if (ok) { ws.send(JSON.stringify({op: 'subscribe', args: [{channel: 'candle' + OKX_BAR[tf], instId: dashPair(sym) + (src === 'okxf' ? '-SWAP' : '')}]})); clearInterval(wsPing); wsPing = setInterval(() => { try { ws.send('ping'); } catch {} }, 20000); } } };
  ws.onmessage = e => {
    if (gen !== wsGen) return; wsLast = Date.now();
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (by) { const d = m && typeof m.topic === 'string' && m.topic.startsWith('kline.') && Array.isArray(m.data) ? m.data[0] : null; if (d) applyKline({t: +d.start, o: +d.open, h: +d.high, l: +d.low, c: +d.close, v: +d.volume}); return; }
    if (ok) { const d = m && m.arg && /^candle/.test(m.arg.channel || '') && Array.isArray(m.data) ? m.data[0] : null; if (d) applyKline({t: +d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]}); return; }
    const k = m && m.k; if (k) applyKline({t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v});
  };
  ws.onerror = () => { try { ws.close(); } catch {} };
  ws.onclose = () => {
    if (gen !== wsGen) return;
    wsOpen = false; setLive(false);
    setTimeout(() => { if (gen === wsGen && !document.hidden) connectWS(); }, Math.min(15000, 3000 * ++wsRetry));
  };
}
/* La vela se pinta con CADA dato en vivo; los indicadores (lo pesado) se recalculan como mucho unas veces por segundo,
   según lo que tarden: así el hilo no se satura y el gráfico nunca se queda «a tirones». Una vela nueva sí recalcula al instante. */
let rcAt = 0, rcCost = 0, rcTimer = 0;
function recalcSoon(force) {
  const now = performance.now(), gap = Math.min(3000, Math.max(300, rcCost * 4));
  if (force || now - rcAt >= gap) { clearTimeout(rcTimer); rcTimer = 0; const t0 = performance.now(); recalc(); rcCost = performance.now() - t0; rcAt = performance.now(); }
  else if (!rcTimer) rcTimer = setTimeout(() => { rcTimer = 0; recalcSoon(true); scheduleRender(); }, gap - (now - rcAt));
}
function applyKline(k) {
  if (replay) { replayLive(k); return; } // en repetición el gráfico no se mueve con el precio en vivo
  const n = candles.length; if (!n) return;
  const last = candles[n - 1];
  let isNew = false;
  if (k.t === last.t) candles[n - 1] = k;
  else if (k.t > last.t) { candles.push(k); if (pan > 0) pan += 1; isNew = true; }
  else return;
  recalcSoon(isNew); updateChartHeader(); checkAlerts(state.symbol, k.c); if (window.CCTTrade) CCTTrade.tick(state.symbol, k.c);
  if (currentView === 'chartView') scheduleRender();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  fetchTicker();
  if (currentView === 'chartView' && candles.length) { wsReloadAt = Date.now(); loadCandles(true); }
});
/* Vigilante del tiempo real: si la conexión se queda «colgada» sin avisar (la compu durmió, cambió la red, el exchange la soltó),
   a los 20 s sin datos se bajan las velas recientes y se reconecta solo. Así el gráfico abierto nunca se queda congelado. */
function liveKick(why) { if (document.hidden || replay || !candles.length || currentView !== 'chartView') return; wsReloadAt = Date.now(); fetchTicker(); loadCandles(true); }
setInterval(() => {
  if (document.hidden || replay || !candles.length || currentView !== 'chartView' || !ws) return; // (las fuentes sin WebSocket ya se consultan solas cada pocos segundos)
  const now = Date.now(); if (now - wsLast > 12000 && now - wsReloadAt > 12000) liveKick('sin datos');
}, 3000);
/* Respaldo: si el tiempo real lleva más de 4 s callado, la última vela se pide directo al exchange cada 2 s mientras se reconecta.
   La vela se sigue moviendo aunque la conexión en vivo falle. */
let restBusy = false;
setInterval(async () => {
  if (document.hidden || replay || !candles.length || currentView !== 'chartView' || !ws || restBusy || Date.now() - wsLast < 4000) return;
  const sym = state.symbol, tf = state.interval, gen = wsGen; restBusy = true;
  try { const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 5000), r = await fetchKlinesAny(sym, tf, ctl.signal, 3); clearTimeout(to); if (gen === wsGen && sym === state.symbol && tf === state.interval && r.src === (dataSrc || 'binance')) r.cs.forEach(applyKline); } catch {}
  restBusy = false;
}, 2000);
window.addEventListener('online', () => liveKick('red'));
window.addEventListener('focus', () => { if (Date.now() - wsLast > 12000 && Date.now() - wsReloadAt > 12000) liveKick('foco'); });
{ let beat = Date.now(); setInterval(() => { const n = Date.now(); if (n - beat > 30000) liveKick('despertó'); beat = n; }, 4000); } // el reloj «saltó»: la compu estuvo dormida

/* ───────── Indicadores ───────── */
/* Miniaturas muy básicas de cada indicador común (viewBox 40×24; la línea toma el color del indicador) */
const W = 'M2 18C8 17 11 11 17 12S27 7 38 4', Wb = 'M2 20C8 19 11 14 17 15S27 10 38 7';
const IND_ART = {
  derivs: '<rect x="2" y="6" width="10" height="12" rx="3"/><rect x="15" y="6" width="10" height="12" rx="3" opacity=".7"/><rect x="28" y="6" width="10" height="12" rx="3" opacity=".45"/>',
  oi: '<path d="M2 18c6-1 8-6 13-7s8 3 12 0 7-7 11-8"/><path d="M2 21h36" opacity=".25"/>',
  funding: '<path d="M4 12v-5M10 12v-3M16 12v-6M22 12v3M28 12v5M34 12v-2" stroke-width="3.2"/><path d="M2 12h36" opacity=".3"/>',
  lsr: '<path d="M2 12h36" opacity=".3" stroke-dasharray="2 2"/><path d="M2 9c6 0 8 6 14 5s9-8 14-6 6 4 8 3"/><path d="M2 15c6 1 10-4 15-3s9 5 13 3 6-2 8-3" opacity=".6"/>',
  taker: '<path d="M4 12V6M9 12v4M14 12V4M19 12v6M24 12V8M29 12v3M34 12V5" stroke-width="3.2"/>',
  ema20: `<path d="${W}"/>`, ema50: `<path d="${W}"/>`, sma200: `<path d="M2 16C12 15 22 12 38 8"/>`, wma20: `<path d="${W}"/>`,
  bollinger: '<path d="M2 8C12 4 24 9 38 5M2 20C12 16 24 21 38 17" opacity=".7"/><path d="M2 14C12 10 24 15 38 11"/>',
  rsi: '<path d="M2 17l6-6 5 4 6-9 6 8 5-4 8 3"/><path d="M2 6h36M2 19h36" opacity=".25" stroke-dasharray="2 2"/>',
  vwap: '<path d="M2 18C10 16 16 12 38 9" stroke-dasharray="0"/><path d="M4 21l8-6 6 2 8-8 8 2" opacity=".35"/>',
  supertrend: '<path d="M2 18h12l3-3h8l3-8h10" />',
  cross: '<path d="M2 18 38 6M2 8l36 10"/><circle cx="20" cy="12" r="2.4" fill="currentColor"/>',
  ichimoku: '<path d="M2 14C12 12 22 12 38 10"/><path d="M12 6l26 4v8l-26-4z" fill="currentColor" fill-opacity=".22" stroke="none"/><path d="M12 6l26 4M12 14l26 4" opacity=".6"/>',
  psar: '<circle cx="6" cy="19" r="1.6"/><circle cx="13" cy="16" r="1.6"/><circle cx="20" cy="12" r="1.6"/><circle cx="27" cy="5" r="1.6"/><circle cx="34" cy="3" r="1.6"/>',
  donchian: '<path d="M2 6h10v4h12V5h14M2 18h8v-3h14v4h14" opacity=".8"/><path d="M2 12h36" opacity=".4"/>',
  keltner: '<path d="M2 8C12 5 24 9 38 5M2 20C12 17 24 21 38 17" opacity=".7"/><path d="M2 14C12 11 24 15 38 11"/>',
  adx: '<path d="M2 18C10 16 16 8 24 7s10 4 14 3"/><path d="M2 10l10 5 10-4 16 6" opacity=".55"/>',
  cci: '<path d="M2 12 8 4l6 14 6-12 6 12 6-10 6 6"/><path d="M2 12h36" opacity=".25" stroke-dasharray="2 2"/>',
  willr: '<path d="M2 5l6 12 6-9 6 11 6-14 6 12 6-8"/>',
  mfi: '<path d="M2 18l7-10 6 7 7-11 6 12 10-6"/>',
  roc: '<path d="M2 12c4-8 8-8 12 0s8 8 12 0 8-8 12 0"/><path d="M2 12h36" opacity=".25"/>',
  stochrsi: '<path d="M2 18l8-12 8 10 8-11 12 10"/><path d="M2 16l9-8 8 8 8-8 11 8" opacity=".55"/>',
  ao: '<path d="M4 12v5M9 12v7M14 12v4M19 12v-3M24 12v-6M29 12v-8M34 12v-5" stroke-width="3.2"/>',
  cmf: '<path d="M4 12v-4M9 12v-6M14 12v-3M19 12v4M24 12v6M29 12v3M34 12v-3" stroke-width="3.2"/>',
  macd: '<path d="M2 16C10 16 16 8 24 9s10 6 14 4"/><path d="M2 14C10 15 16 11 24 12s10 4 14 3" opacity=".55"/><path d="M6 20v-2M12 20v-4M18 20v-1M24 20v1M30 20v2" opacity=".5"/>',
  stoch: '<path d="M2 17l8-10 7 8 8-9 13 10"/><path d="M2 14l9-6 8 8 8-6 11 8" opacity=".55"/>',
  atr: '<path d="M2 18l5-4 4 2 5-9 5 7 5-2 5-8 7 6"/>',
  obv: '<path d="M2 18l7-3 5-6 6 4 6-8 6 3 6-3"/>',
  volume: '<path d="M5 20v-6M11 20v-10M17 20v-5M23 20v-12M29 20v-7M35 20v-9" stroke-width="3.6"/>',
  liqmap: '<path d="M2 5h36M2 11h36M2 17h36" stroke-width="4" opacity=".28"/><path d="M12 11h20" stroke-width="4" opacity=".75"/>',
  vpvr: '<path d="M38 3h-16M38 7h-26M38 11h-30M38 15h-20M38 19h-10" stroke-width="2.6"/>',
  dchan: '<path d="M2 22 38 8" stroke-dasharray="2 3"/><path d="M2 31 38 17" stroke-dasharray="2 3"/><path d="M2 26.5 38 12.5" opacity=".4" stroke-dasharray="1 3"/>',
  patterns: '<path d="M3 20 11 6l6 9 7-12 6 10 7-5"/><circle cx="11" cy="6" r="1.6" fill="currentColor"/><circle cx="24" cy="3" r="1.6" fill="currentColor"/>'
};
const indArt = (k, col) => (k = baseOf(k), IND_ART[k]) ? `<span class="ind-art" style="color:${col}"><svg viewBox="0 0 40 24" width="40" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IND_ART[k]}</svg></span>` : '';
const indicatorMeta = [
  ['ema20','EMA','Media móvil exponencial: cambia el período en el engrane (20 por defecto)','#f5c568'],
  ['ema50','EMA 50','Media móvil exponencial de 50 períodos','#6ca5f9'],
  ['sma200','SMA 200','Media móvil simple de 200 períodos','#b58dff'],
  ['bollinger','Bandas de Bollinger','20 períodos · 2 desviaciones','#a3b0c3'],
  ['rsi','RSI 14','Índice de fuerza relativa en panel inferior','#bb9cff'],
  ['wma20','WMA 20','Media móvil ponderada de 20 períodos','#4dd0e1'],
  ['vwap','VWAP','Precio medio ponderado por volumen, reinicia cada día UTC (solo intradía)','#ff8a65'],
  ['supertrend','Supertrend','ATR 10 · factor 3 · verde = alcista, rojo = bajista','#089981'],
  ['cross','Cruces EMA 20/50','Marca los cruces de la EMA 20 con la EMA 50','#f5c568'],
  ['ichimoku','Ichimoku Kinko Hyo','Tenkan, Kijun, nube (Senkou A/B) y Chikou','#2962ff'],
  ['psar','Parabolic SAR','Puntos de parada y reversa (paso 0.02, máx. 0.2)','#089981'],
  ['donchian','Canales de Donchian','Máximo y mínimo de N velas con línea media','#4dd0e1'],
  ['keltner','Canales de Keltner','EMA ± múltiplo del ATR','#f5c568'],
  ['adx','ADX / DMI','Fuerza de la tendencia con +DI y −DI en panel inferior','#f5c568'],
  ['cci','CCI','Índice de canal de materias primas en panel inferior','#4dd0e1'],
  ['willr','Williams %R','Oscilador −100 a 0 en panel inferior (−20 / −80)','#b58dff'],
  ['mfi','MFI','Índice de flujo de dinero (RSI con volumen) en panel inferior','#ff8a65'],
  ['roc','ROC','Tasa de cambio (%) en panel inferior','#6ca5f9'],
  ['stochrsi','Estocástico RSI','%K y %D del RSI en panel inferior','#548fff'],
  ['ao','Awesome Oscillator','Histograma SMA 5 − SMA 34 del punto medio','#089981'],
  ['cmf','Chaikin Money Flow','Flujo de dinero de Chaikin (20) en panel inferior','#2ec4b6'],
  ['derivs','Derivados en vivo','Funding, interés abierto, ratio long/short y prima junto al precio (futuros de Binance)','#f0b90b'],
  ['oi','Interés abierto','Contratos abiertos de futuros en USD, en panel inferior','#f0b90b'],
  ['funding','Funding','Tasa de financiamiento de cada 8 h (verde = largos pagan, rojo = cortos pagan)','#089981'],
  ['lsr','Ratio Long/Short','Cuentas en largo vs. en corto y posiciones de los top traders (1 = equilibrio)','#6ca5f9'],
  ['taker','Compra/venta agresiva','Volumen de órdenes a mercado: compradores menos vendedores (delta de futuros)','#2ec4b6'],
  ['macd','MACD 12 26 9','Línea, señal e histograma en panel inferior','#548fff'],
  ['stoch','Estocástico 14 3 3','%K y %D en panel inferior (niveles 20/80)','#548fff'],
  ['atr','ATR 14','Rango verdadero medio (Wilder) en panel inferior','#e07b53'],
  ['obv','OBV','Volumen en balance en panel inferior','#2ec4b6'],
  ['volume','Volumen','Barras de volumen por vela','#8294a8'],
  ['liqmap','Mapa de calor de liquidaciones','Zonas donde se estima que hay liquidaciones apalancadas (estilo CoinGlass): se calcula con el volumen de cada vela y varios apalancamientos; cuanto más claro, más liquidaciones esperadas','#f5d90a'],
  ['vpvr','Perfil de volumen de rango visible (VPVR)','Volumen por nivel de precio de las velas que ves en pantalla, con POC y área de valor; se recalcula al mover o hacer zoom','#2962ff'],
  ['dchan','Canales dinámicos','Dibuja con líneas punteadas discretas los canales que se van formando (alcista, bajista o lateral), a varias escalas; se recalculan con cada vela y se descartan cuando el precio los rompe','#20bf9f'],
  ['patterns','Patrones (1-2-3, ABC, armónicos, chartistas, Elliott)','Detecta y dibuja sobre el gráfico el patrón que se está formando: 1-2-3, ABC, ABCD/Gartley/Bat/Butterfly/Crab/Cypher con zona de reversión, dobles techos y suelos, hombro-cabeza-hombro, triángulos, cuñas e impulsos de Elliott','#f5a623'],
  ['nnIa','Nova Nexus · Señales IA','BUY/SELL con score ★, cooldown y divergencias (v2.7)','#11cf77'],
  ['nnEma','Nova Nexus · EMA Cloud','Nube EMA 55 ± 0.6 ATR','#8a97b3'],
  ['nnTp','Nova Nexus · TP / SL','Niveles de la última señal (SL 1 · TP 1.5 / 2.5 / 4 ATR)','#ff9900'],
  ['nnSmc','Nova Nexus · Estructura SMC','BOS / CHoCH con barridos (swing, longitud 5)','#089981'],
  ['nnOb','Nova Nexus · Order Blocks','Order Blocks volumétricos con actividad compra/venta (últimos 5)','#f23645'],
  ['nnTrail','Nova Nexus · Smooth Trail','Trailing stop EMA 30 ± 2 ATR(20), suavizado 2 · verde alcista, morado bajista','#119c7e'],
  ['nnRev','Nova Nexus · Reversal Bands','SMA 70 ± 6/7/8 ATR(70): zonas de posible reversión','#f23645'],
  ['nnVP','Nova Nexus · Volume Profile','Perfil de volumen (25 filas, últimas 200 velas): nodos, sentimiento y zona POC en un margen a la derecha','#ffeb3b'],
  ['nnLiq','Nova Nexus · Liquidaciones','Niveles de liquidación 5x/10x/25x/50x/100x desde pivotes con filtro de volumen, y tabla de niveles activos','#22ab94'],
  ['nnLiqBars','Nova Nexus · Liquidaciones: velas lima','Opcional: colorea todas las velas de lima, como el barcolor del Pine al activar Liquidaciones (requiere Liquidaciones)','#00e676'],
  ['nnPiv','Nova Nexus · Pivots','Zigzag de pivotes (50), pivotes perdidos y niveles fantasma','#26a69a'],
  ['nnSR','Nova Nexus · Soporte y Resistencia','Cajas de soporte/resistencia con Break y Retest (pivotes de 20 velas)','#ff5252'],
  ['nnRules','Nova Nexus · Reglas','Panel de reglas de trading sobre el gráfico','#4361cf']
];
function ema(xs, n) {
  const out = Array(xs.length).fill(null); if (xs.length < n) return out;
  const k = 2 / (n + 1); let e = xs.slice(0, n).reduce((a, b) => a + b, 0) / n; out[n - 1] = e;
  for (let i = n; i < xs.length; i++) { e = xs[i] * k + e * (1 - k); out[i] = e; }
  return out;
}
function sma(xs, n) {
  const out = Array(xs.length).fill(null); let s = 0;
  for (let i = 0; i < xs.length; i++) { s += xs[i]; if (i >= n) s -= xs[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
}
function rsi(xs, n = 14) {
  const out = Array(xs.length).fill(null); if (xs.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) { const d = xs[i] - xs[i - 1]; gain += Math.max(0, d); loss += Math.max(0, -d); }
  gain /= n; loss /= n; out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    gain = (gain * (n - 1) + Math.max(0, d)) / n; loss = (loss * (n - 1) + Math.max(0, -d)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}
function recalc() {
  const c = candles.map(x => x.c), n = c.length, bl = sp('bollinger', 'len'), bm = sp('bollinger', 'mult'), m = sma(c, bl);
  const up = Array(n).fill(null), lo = Array(n).fill(null);
  for (let i = bl - 1; i < n; i++) { let s = 0; for (let j = i - bl + 1; j <= i; j++) { const d = c[j] - m[i]; s += d * d; } const sd = Math.sqrt(s / bl); up[i] = m[i] + bm * sd; lo[i] = m[i] - bm * sd; }
  ind = {ema20: ema(c, sp('ema20', 'len')), ema50: ema(c, sp('ema50', 'len')), sma200: sma(c, sp('sma200', 'len')), bbU: up, bbL: lo, rsi: rsi(c, sp('rsi', 'len'))};
  ind.nn = null; calcNova(); calcExtra(); schedulePine();
}
const PANELS = ['macd', 'stoch', 'atr', 'obv', 'adx', 'cci', 'willr', 'mfi', 'roc', 'stochrsi', 'ao', 'cmf', 'oi', 'funding', 'lsr', 'taker'];
function calcExtra() { // indicadores de la fase 2: solo se calculan los activados
  const I = state.indicators, T = window.CCTIndicators, n = candles.length;
  if (!T || !n) return;
  const c = candles.map(x => x.c), iv = IV_MS[state.interval];
  ind.wma20 = I.wma20 ? T.wma(c, sp('wma20', 'len')) : null;
  for (const k of Object.keys(I)) { if (!isCopy(k)) continue; if (!I[k]) { ind[k] = null; continue; } const bs = baseOf(k); // copias del mismo indicador (EMA 2, SMA 2…)
    ind[k] = bs === 'ema20' ? ema(c, sp(k, 'len')) : bs === 'sma200' ? sma(c, sp(k, 'len')) : bs === 'wma20' ? T.wma(c, sp(k, 'len')) : bbands(c, sp(k, 'len'), sp(k, 'mult')); }
  ind.vwap = I.vwap ? T.vwap(candles, iv) : null;
  const st = I.supertrend ? T.supertrend(candles, sp('supertrend', 'len'), sp('supertrend', 'factor')) : null; ind.stUp = st && st.up; ind.stDn = st && st.dn; ind.stDir = st && st.dir;
  ind.cross = I.cross ? T.crosses(ind.ema20, ind.ema50) : null;
  ind.macd = I.macd ? T.macd(c, sp('macd', 'fast'), sp('macd', 'slow'), sp('macd', 'sig')) : null;
  ind.stoch = I.stoch ? T.stoch(candles, sp('stoch', 'k'), sp('stoch', 'ks'), sp('stoch', 'd')) : null;
  ind.atr = I.atr ? T.atr(candles, sp('atr', 'len')) : null;
  ind.obv = I.obv ? T.obv(candles) : null;
  ind.adx = I.adx ? T.adx(candles, sp('adx', 'len')) : null;
  ind.cci = I.cci ? T.cci(candles, sp('cci', 'len')) : null;
  ind.willr = I.willr ? T.willr(candles, sp('willr', 'len')) : null;
  ind.mfi = I.mfi ? T.mfi(candles, sp('mfi', 'len')) : null;
  ind.roc = I.roc ? T.roc(candles, sp('roc', 'len')) : null;
  ind.stochrsi = I.stochrsi ? T.stochRsi(candles, sp('stochrsi', 'rl'), sp('stochrsi', 'sl'), sp('stochrsi', 'ks'), sp('stochrsi', 'ds')) : null;
  ind.ao = I.ao ? T.awesome(candles, sp('ao', 'fast'), sp('ao', 'slow')) : null;
  ind.cmf = I.cmf ? T.cmf(candles, sp('cmf', 'len')) : null;
  dvCalc();
  ind.donchian = I.donchian ? T.donchian(candles, sp('donchian', 'len')) : null;
  ind.keltner = I.keltner ? T.keltner(candles, sp('keltner', 'len'), sp('keltner', 'mult'), sp('keltner', 'atr')) : null;
  ind.ichimoku = I.ichimoku ? T.ichimoku(candles, sp('ichimoku', 't'), sp('ichimoku', 'k'), sp('ichimoku', 'b')) : null;
  ind.psar = I.psar ? T.psar(candles, sp('psar', 'step'), sp('psar', 'max')) : null;
  const NP = novaP;
  ind.trail = I.nnTrail ? T.smoothTrail(candles, NP('trailLen'), NP('trailAtr'), NP('trailMult'), NP('trailSmooth')) : null;
  ind.rev = I.nnRev ? T.reversalBands(candles, NP('revLen')) : null;
  ind.sr = I.nnSR ? T.supportResistance(candles, {lookback: NP('srLookback'), retSince: NP('srSince'), retValid: NP('srLimit')}) : null;
  ind.piv = I.nnPiv ? T.pivots(candles, NP('pivLen')) : null;
  { const lk = `${state.symbol}|${state.interval}|${candles.length}|${candles[0].t}|${sp('liqmap', 'rows')}|${Math.floor(Date.now() / 20000)}`; if (!I.liqmap || !planOk('liq')) ind.lm = null; else if (!ind.lm || ind.lm._k !== lk) { ind.lm = T.liquidationHeatmap(candles, {rows: sp('liqmap', 'rows')}); if (ind.lm) ind.lm._k = lk; } }
  ind.liq = I.nnLiq ? T.liquidations(candles, iv, {lookback: NP('liqLookback')}) : null;
  ind.dch = I.dchan && planOk('proInd') && window.CCTChannels ? CCTChannels.detect(candles, {len: sp('dchan', 'len'), count: sp('dchan', 'count'), brk: sp('dchan', 'brk')}) : null;
  { const Q = k => sp('patterns', k); ind.pat = I.patterns && planOk('proInd') && window.CCTPatterns ? CCTPatterns.detect(candles, {len: Q('len'), dev: Q('dev'), tol: Q('tol') / 100, min: Q('min'), max: Q('max'), keep: Q('keep'), p123: Q('g123') === 'Sí', abc: Q('gabc') === 'Sí', harm: Q('gharm') === 'Sí', chart: Q('gchart') === 'Sí', ell: Q('gell') === 'Sí'}) : null; }
  ind.vp = I.nnVP ? T.volumeProfile(candles, {rows: NP('vpRows'), lookback: NP('vpLookback'), hiThr: NP('vpHi'), loThr: NP('vpLo')}) : null;
}
// Parámetros de Nova Nexus editables (misma presentación que la ventana de TradingView: grupos, filas y ayudas)
const NOVA_STRATS = {'Ninguna (usar módulos)': null, 'Mobile (IA + Smooth Trail + Reversal Bands)': ['nnIa', 'nnTrail', 'nnRev'], 'Cloud (IA + EMA Cloud + Volume Profile + S/R)': ['nnIa', 'nnEma', 'nnVP', 'nnSR'], 'SMC (IA + SMC + Pivots + Volume Profile)': ['nnIa', 'nnSmc', 'nnOb', 'nnPiv', 'nnVP']};
const NOVA_SCHEMA = [
  {key: 'emaLen', title: 'EMA Periodos', type: 'int', def: 55, min: 2, max: 500, group: 'EMA CLOUD'},
  {key: 'emaMult', title: 'Multiplicador ATR', type: 'float', def: 0.6, min: 0.1, max: 10, step: 0.1, group: 'EMA CLOUD'},
  {key: 'trailLen', title: 'Longitud EMA Base', type: 'int', def: 30, min: 2, max: 500, group: 'SMOOTH TRAIL'},
  {key: 'trailAtr', title: 'ATR Length', type: 'int', def: 20, min: 1, max: 500, group: 'SMOOTH TRAIL'},
  {key: 'trailMult', title: 'Multiplicador ATR', type: 'float', def: 2, min: 0.1, max: 20, step: 0.1, group: 'SMOOTH TRAIL'},
  {key: 'trailSmooth', title: 'Suavizado', type: 'int', def: 2, min: 1, max: 50, group: 'SMOOTH TRAIL'},
  {key: 'pivLen', title: 'Pivot Length', type: 'int', def: 50, min: 2, max: 200, group: 'PIVOTS (High/Low & Missed)'},
  {key: 'revLen', title: 'Length', type: 'int', def: 70, min: 2, max: 500, group: 'REVERSAL BANDS'},
  {key: 'smcLen', title: 'Longitud del swing', type: 'int', def: 5, min: 2, max: 50, group: 'MARKET STRUCTURE'},
  {key: 'smcWindow', title: 'Window', type: 'int', def: 500, min: 50, max: 1000, group: 'MARKET STRUCTURE', tooltip: 'Cantidad de velas recientes donde se busca la estructura.'},
  {key: 'smcSwing', title: 'Swing', type: 'int', def: 100, min: 10, max: 500, group: 'MARKET STRUCTURE'},
  {key: 'smcSweep', title: 'Build Sweep (x)', type: 'bool', def: true, group: 'MARKET STRUCTURE'},
  {key: 'obLast', title: 'Show Last', type: 'int', def: 5, min: 1, max: 20, group: 'VOLUMETRIC ORDER BLOCKS'},
  {key: 'obMiti', title: 'Mitigación', type: 'string', def: 'Close', options: ['Close', 'Wick', 'Avg'], group: 'VOLUMETRIC ORDER BLOCKS'},
  {key: 'vpRows', title: 'Number of Rows', type: 'int', def: 25, min: 5, max: 100, group: 'Volume Profile'},
  {key: 'vpLookback', title: 'Lookback Length', type: 'int', def: 200, min: 10, max: 1000, group: 'Volume Profile'},
  {key: 'vpHi', title: 'High Traded Nodes Threshold %', type: 'float', def: 53, min: 0, max: 100, group: 'Volume Profile'},
  {key: 'vpLo', title: 'Low Traded Nodes Threshold %', type: 'float', def: 37, min: 0, max: 100, group: 'Volume Profile'},
  {key: 'liqLookback', title: 'Lookback Period', type: 'int', def: 40, min: 5, max: 500, group: 'LIQUIDATIONS'},
  {key: 'srLookback', title: 'Lookback Range', type: 'int', def: 20, min: 2, max: 200, group: 'Support and Resistance'},
  {key: 'srSince', title: 'Bars Since Breakout', type: 'int', def: 2, min: 1, max: 50, group: 'Support and Resistance'},
  {key: 'srLimit', title: 'Retest Detection Limiter', type: 'int', def: 2, min: 1, max: 50, group: 'Support and Resistance'},
  {key: 'slMult', title: 'SL x ATR', type: 'float', def: 1, min: 0.1, max: 20, step: 0.1, group: 'IA Signals — TP / SL'},
  {key: 'tp1', title: 'TP1 x ATR', type: 'float', def: 1.5, min: 0.1, max: 50, step: 0.1, group: 'IA Signals — TP / SL'},
  {key: 'tp2', title: 'TP2 x ATR', type: 'float', def: 2.5, min: 0.1, max: 50, step: 0.1, group: 'IA Signals — TP / SL'},
  {key: 'tp3', title: 'TP3 x ATR', type: 'float', def: 4, min: 0.1, max: 50, step: 0.1, group: 'IA Signals — TP / SL'},
  {key: 'tpBars', title: 'Velas de vigencia TP / SL', type: 'int', def: 40, min: 5, max: 500, group: 'IA Signals — TP / SL'},
  {key: 'minScore', title: 'Score mínimo para mostrar señal', type: 'int', def: 1, min: 1, max: 5, group: 'IA Signals — Score'},
  {key: 'cooldown', title: 'Velas mínimas entre señales', type: 'int', def: 10, min: 0, max: 200, group: 'IA Signals — Cooldown'},
  {key: 'cdBoth', title: 'Cooldown compartido (BUY y SELL)', type: 'bool', def: false, group: 'IA Signals — Cooldown'},
  {key: 'cloudBull', title: 'EMA Cloud alcista', type: 'color', def: '#8c9bb933', group: 'COLORES Y OPACIDAD'},
  {key: 'cloudBear', title: 'EMA Cloud bajista', type: 'color', def: '#78828c33', group: 'COLORES Y OPACIDAD'},
  {key: 'cloudEdge', title: 'EMA Cloud bordes', type: 'color', def: '#c8d2e64d', group: 'COLORES Y OPACIDAD'},
  {key: 'trailBull', title: 'Smooth Trail alcista', type: 'color', def: '#119c7e', group: 'COLORES Y OPACIDAD'},
  {key: 'trailBear', title: 'Smooth Trail bajista', type: 'color', def: '#7c3cf3', group: 'COLORES Y OPACIDAD'},
  {key: 'revUp', title: 'Reversal Bands superior', type: 'color', def: '#f23645', group: 'COLORES Y OPACIDAD'},
  {key: 'revDn', title: 'Reversal Bands inferior', type: 'color', def: '#089981', group: 'COLORES Y OPACIDAD'},
  {key: 'revOp', title: 'Reversal Bands · opacidad %', type: 'int', def: 100, min: 0, max: 200, group: 'COLORES Y OPACIDAD'},
  {key: 'srSup', title: 'Soporte', type: 'color', def: '#ff5252', group: 'COLORES Y OPACIDAD'},
  {key: 'srRes', title: 'Resistencia', type: 'color', def: '#089981', group: 'COLORES Y OPACIDAD'},
  {key: 'srOp', title: 'Soporte/Resistencia · opacidad %', type: 'int', def: 100, min: 0, max: 300, group: 'COLORES Y OPACIDAD'},
  {key: 'vpHvc', title: 'Volume Profile · nodo de alto volumen', type: 'color', def: '#ffeb3b80', group: 'COLORES Y OPACIDAD'},
  {key: 'vpAvc', title: 'Volume Profile · nodo promedio', type: 'color', def: '#2962ff80', group: 'COLORES Y OPACIDAD'},
  {key: 'vpLvc', title: 'Volume Profile · nodo de bajo volumen', type: 'color', def: '#f2364580', group: 'COLORES Y OPACIDAD'},
  {key: 'vpBlc', title: 'Volume Profile · compras', type: 'color', def: '#26a69aff', group: 'COLORES Y OPACIDAD'},
  {key: 'vpBrc', title: 'Volume Profile · ventas', type: 'color', def: '#ef5350ff', group: 'COLORES Y OPACIDAD'},
  {key: 'vpOp', title: 'Volume Profile · opacidad %', type: 'int', def: 100, min: 0, max: 100, group: 'COLORES Y OPACIDAD'},
  {key: 'strat', title: 'Estrategia', type: 'string', def: 'Ninguna (usar módulos)', options: Object.keys(NOVA_STRATS), group: 'ESTRATEGIAS', tooltip: 'Como en el Pine original: Mobile / Cloud / SMC activan un conjunto fijo de módulos y desactivan el resto. «Ninguna» devuelve tus módulos.'},
  {key: 'rulesText', title: 'Texto de Reglas', type: 'string', def: '', group: 'REGLAS', tooltip: 'Una regla por línea separada con «|». Vacío = reglas por defecto.'}
];
const novaDef = k => { const e = NOVA_SCHEMA.find(x => x.key === k); return e ? e.def : undefined; };
function novaP(k) { const v = state.novaParams && state.novaParams[k]; const d = novaDef(k); if (k === 'rulesText') return v ? String(v).split('|').map(x => '• ' + x.trim().replace(/^•\s*/, '')).join('\n') : undefined; return v === undefined ? d : v; }
/* Ventanas de ajustes con vista previa en vivo: snap() copia lo que se puede cambiar y restore(copia) lo regresa si cancelas */
function liveCfg(c, snap, restore) {
  const s0 = snap(); let touched = false;
  c.onPreview = res => { touched = true; cfgLive = true; try { c.onApply(res); } finally { cfgLive = false; } };
  c.onCancel = () => { if (touched) try { restore(s0); } catch (e) { console.warn(e); } };
  return c;
}
const jcopy = o => o == null ? o : JSON.parse(JSON.stringify(o));
function openNovaDialog() {
  const mods = NOVA_GROUPS.flatMap(([t, ks]) => ks.map(k => ({key: 'mod:' + k, title: novaTitle(k), type: 'bool', def: NOVA_DEFAULT.includes(k), value: !!state.indicators[k], group: 'MÓDULOS (ON/OFF)', tooltip: novaDesc(k)})));
  const params = NOVA_SCHEMA.map(e => Object.assign({}, e, {value: state.novaParams[e.key] !== undefined ? state.novaParams[e.key] : e.def}));
  const values = {}; for (const i of mods.concat(params)) values[i.key] = i.value;
  CCTSettings.open(liveCfg({title: 'Nova Nexus', tabs: ['in'], note: 'Estos son los parámetros que el indicador ya permite cambiar. Para tener TODOS los parámetros del Pine original, pega su código en «Scripts de Pine».', inputs: mods.concat(params), values, plots: [], hlines: [], objects: [], shapes: [], onApply: res => {
    const get = i => res.inputs[i.key] !== undefined ? res.inputs[i.key] : i.def;
    const prevStrat = state.novaParams.strat, strat = NOVA_STRATS[get(params.find(p => p.key === 'strat'))];
    if (strat) {
      if (!prevStrat || !NOVA_STRATS[prevStrat]) state.novaSaved = Object.fromEntries(mods.map(i => [i.key.slice(4), !!get(i)]));
      for (const k of NN_KEYS) state.indicators[k] = strat.includes(k);
    } else if (prevStrat && NOVA_STRATS[prevStrat] && state.novaSaved) { for (const k of NN_KEYS) state.indicators[k] = !!state.novaSaved[k]; if (!novaOn()) NOVA_DEFAULT.forEach(k => state.indicators[k] = true); state.novaSaved = null; }
    else { for (const i of mods) state.indicators[i.key.slice(4)] = !!get(i); state.novaSaved = null; } const np = {}; for (const i of params) { const v = get(i); if (JSON.stringify(v) !== JSON.stringify(i.def)) np[i.key] = v; } state.novaParams = np;
    save(); renderIndicators(); countIndicators(); calcNova(); calcExtra(); scheduleRender(); toast('Configuración aplicada');
  }}, () => ({ind: jcopy(state.indicators), np: jcopy(state.novaParams), ns: jcopy(state.novaSaved)}),
  s0 => { state.indicators = s0.ind; state.novaParams = s0.np; state.novaSaved = s0.ns; renderIndicators(); countIndicators(); calcNova(); calcExtra(); scheduleRender(); }));
}
function calcNova() {
  const I = state.indicators;
  if (!window.NovaNexus || !candles.length || !(I.nnIa || I.nnEma || I.nnTp || I.nnRules || I.nnSmc || I.nnOb)) { ind.nn = null; return; }
  const NP = novaP;
  try { ind.nn = NovaNexus.compute(candles, {smc: !!(I.nnSmc || I.nnOb), emaLen: NP('emaLen'), emaMult: NP('emaMult'), minScore: NP('minScore'), cooldown: NP('cooldown'), cdBoth: NP('cdBoth'), slMult: NP('slMult'), tp1Mult: NP('tp1'), tp2Mult: NP('tp2'), tp3Mult: NP('tp3'), tpBars: NP('tpBars'), smcOpts: {mslen: NP('smcLen'), window: NP('smcWindow'), swingLimit: NP('smcSwing'), sweep: NP('smcSweep'), oblast: NP('obLast'), obmiti: NP('obMiti')}}); } catch (e) { ind.nn = null; console.warn('Nova Nexus:', e); }
}
const NN_KEYS = indicatorMeta.map(m => m[0]).filter(k => k.startsWith('nn')), novaOn = () => NN_KEYS.some(k => state.indicators[k]);
let indTab = 'std';
const indTabs = () => `<div class="ind-tabs"><button data-indtab="std" class="${indTab === 'std' ? 'active' : ''}">Gratuitos</button><button data-indtab="mine" class="${indTab === 'mine' ? 'active' : ''}">Mis indicadores</button></div>`;
const LEGACY_IND = ['ema50', 'sma200', 'wma20', 'cross']; // la lista muestra una sola EMA (con período editable); estos solo aparecen si ya los tenías encendidos
const indicatorRows = () => indBrowser();
const indicatorRowsOld = () => { document.body.dataset.indtab = indTab; return indTabs() + (indTab === 'std'
  ? indicatorMeta.filter(m => !m[0].startsWith('nn') && !(LEGACY_IND.includes(m[0]) && !state.indicators[m[0]])).map(([key, title, desc, col]) =>
    `<div class="setting-row ind-row">${indArt(key, col)}<div><b>${title}</b><small>${desc}</small></div><div class="script-btns">${STD_SCHEMA[key] ? `<button class="small-button" data-std-set="${key}" aria-label="Ajustes de ${title}">${I('gear', 16)}</button>` : ''}<button class="toggle ${state.indicators[key] ? 'on' : ''}" data-ind="${key}" aria-label="${title}" aria-pressed="${!!state.indicators[key]}"></button></div></div>`).join('')
  : catalogCards() + pineSection()); };
document.addEventListener('change', e => { const s = e.target.closest('[data-pine-pane]'); if (!s) return; const p = state.pine.find(x => x.sid === s.dataset.pinePane); if (!p) return; if (s.value) p.pane = s.value; else delete p.pane; save(); renderIndicators(); if (sheetMode === 'indicators' && $('#sheet').classList.contains('open')) ibRefresh(); scheduleRender(); });
document.addEventListener('click', e => { const t = e.target.closest('[data-indtab]'); if (!t) return; indTab = t.dataset.indtab; renderIndicators(); if (sheetMode === 'indicators' && $('#sheet').classList.contains('open')) ibRefresh(); });
function renderIndicators() { const l = $('#indicatorList'); if (l) { const sc = l.querySelector('.ib-list'), y = sc ? sc.scrollTop : 0; l.innerHTML = indicatorRows(); const n = l.querySelector('.ib-list'); if (n) n.scrollTop = y; } }

/* ───────── Explorador de indicadores (por categorías, con buscador) ───────── */
const IB_CATS = [['active', 'En el gráfico', '<path d="M4 19V5M4 19h16"/><path d="m7 15 4-4 3 3 5-6"/>'], ['free', 'Gratuitos', '<path d="M12 3 4 7v5c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V7z"/><path d="m9 12 2 2 4-4"/>'],
  ['trend', 'Tendencia', '<path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/>'], ['osc', 'Osciladores', '<path d="M2 12c2.5-6 5-6 7.5 0s5 6 7.5 0 3-4 5-2"/>'], ['volume', 'Volumen', '<path d="M5 20v-6M10 20V8M15 20v-9M20 20V4"/>'],
  ['volat', 'Volatilidad y canales', '<path d="M3 8c4-3 8 3 18-2M3 16c4-3 8 3 18-2"/>'], ['struct', 'Estructura y patrones', '<path d="M3 18 9 6l5 8 3-5 4 9"/>'],
  ['deriv', 'Derivados', '<path d="M3 17 8 12l4 3 4-6 5 4"/><circle cx="8" cy="12" r="1.4"/><circle cx="16" cy="9" r="1.4"/><path d="M3 21h18"/>'],
  ['pro', 'Pro', '<path d="M12 2.5c.7 6.2 3.3 8.8 9.5 9.5-6.2.7-8.8 3.3-9.5 9.5-.7-6.2-3.3-8.8-9.5-9.5 6.2-.7 8.8-3.3 9.5-9.5z"/>'], ['nova', 'Nova Nexus ©', '<path d="M12 2 14.6 9.4 22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"/>'], ['mine', 'Mis indicadores', '<path d="M4 4h10l6 6v10H4z"/><path d="M14 4v6h6"/>']];
const STD_CAT = {ema20: 'trend', ema50: 'trend', sma200: 'trend', wma20: 'trend', vwap: 'trend', supertrend: 'trend', cross: 'trend', ichimoku: 'trend', psar: 'trend',
  rsi: 'osc', macd: 'osc', stoch: 'osc', stochrsi: 'osc', cci: 'osc', willr: 'osc', roc: 'osc', ao: 'osc', volume: 'volume', obv: 'volume', mfi: 'volume', cmf: 'volume', vpvr: 'volume',
  bollinger: 'volat', donchian: 'volat', keltner: 'volat', atr: 'volat', adx: 'volat', dchan: 'volat', patterns: 'struct', liqmap: 'struct', derivs: 'deriv', oi: 'deriv', funding: 'deriv', lsr: 'deriv', taker: 'deriv'};
const FREE_GROUPS = ['trend', 'osc', 'volume', 'volat', 'struct'];
let ibCat = 'free', ibQ = '';
const ibNorm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ibIc = d => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
function ibItems() {
  const out = [];
  for (const [key, title, desc, col] of indicatorMeta) { if (key.startsWith('nn') || (LEGACY_IND.includes(key) && !state.indicators[key])) continue; out.push({kind: 'std', key, title, desc, col, cat: STD_CAT[key] || 'trend', on: !!state.indicators[key], premium: key === 'liqmap', copyable: !!COPYABLE[key]});
    if (COPYABLE[key]) for (const k of copyKeys(key)) out.push({kind: 'std', key: k, title: stdName(k), desc: 'Copia: tiene su propia configuración', col: sp(k, 'color'), cat: STD_CAT[key] || 'trend', on: true, copy: true}); }
  for (const f of window.CCTFree || []) { const p = state.pine.find(x => x.sid === 'free:' + f.id); out.push({kind: 'free', key: f.id, sid: 'free:' + f.id, title: f.name, desc: f.desc, col: f.col, art: f.art, cat: f.cat, on: !!(p && p.on), p}); }
  for (const c of window.CCTCatalog || []) { const p = catPineOf(c); out.push({kind: 'cat', c, title: nnName(c.name), desc: c.desc, cat: 'nova', on: !!(p && p.on)}); }
  for (const x of userScripts()) { const p = state.pine.find(q => q.sid === x.id); out.push({kind: 'mine', x, title: x.name, desc: '', cat: 'mine', on: !!(p && p.on), p}); }
  return out;
}
function ibCard(it) {
  const tog = (attr, on, t) => `<button class="toggle ${on ? 'on' : ''}" ${attr} aria-label="${esc(t)}" aria-pressed="${!!on}"></button>`;
  if (it.kind === 'std') return `<div class="ib-card ${it.on ? 'on' : ''}"${it.key === 'liqmap' ? ' data-pl="inf"' : PLUS_IND.includes(it.key) ? ' data-pl="plus"' : ''}>${indArt(it.key, it.col)}<div class="ib-t"><b>${esc(it.title)}${it.premium ? ' <span class="prem-tag"><svg viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>PRO</span>' : ''}</b><small>${esc(it.desc)}</small></div><div class="ib-act">${it.copyable ? `<button class="ib-ib ib-copy" data-std-copy="${it.key}" title="Agregar otra ${esc(COPYABLE[it.key])} al gráfico" aria-label="Agregar otra ${esc(COPYABLE[it.key])}">${I('plus', 15)}</button>` : ''}${STD_SCHEMA[it.key] ? `<button class="ib-ib" data-std-set="${it.key}" aria-label="Ajustes de ${esc(it.title)}">${I('gear', 15)}</button>` : ''}${tog(`data-ind="${it.key}"`, it.on, it.title)}</div></div>`;
  if (it.kind === 'free') return `<div class="ib-card ${it.on ? 'on' : ''}"${PLUS_FREE.includes(it.key) ? ' data-pl="plus"' : ''}>${indArt(it.art, it.col)}<div class="ib-t"><b>${esc(it.title)}</b><small>${esc(it.desc)}</small></div><div class="ib-act">${it.p ? `<button class="ib-ib" data-pine-set="${it.sid}" aria-label="Ajustes de ${esc(it.title)}">${I('gear', 15)}</button>` : ''}${tog(`data-free="${it.key}"`, it.on, it.title)}</div></div>`;
  if (it.kind === 'cat') return catalogCards([it.c]);
  const x = it.x, p = it.p, r = p && pineRes[p.sid]; let st = `${x.lines} líneas · ${Math.max(1, Math.round(x.size / 1024))} KB`;
  if (p && p.on && r && !r.ok) st = `<span class="pine-err">Error${r.error.line ? ' · línea ' + r.error.line : ''}: ${esc(r.error.msg)}</span>`;
  else if (p && p.on && r && r.ok) { const u = r.warnings.filter(w => w.level === 'unsupported').length; st += u ? ` · <span class="pine-warn">${u} parte(s) sin soporte</span>` : ' · <span class="ib-okt">funcionando</span>'; }
  else if (p && p.on && !r) st += ' · calculando…';
  const bad = (p && r && (!r.ok || r.warnings.some(w => w.level === 'unsupported'))) || scriptPrev(x) === 'err';
  return `<div class="ib-card mine ${it.on ? 'on' : ''}"><div class="ib-thumb">${prevImg(x)}</div><div class="ib-t"><b>${esc(nnName(x.name))}</b><small>${st}</small>
    <div class="ib-btns">${p ? `<button class="ib-pill" data-pine-set="${x.id}">${I('gear', 13)} Ajustes</button><button class="ib-pill" data-pine-del="${x.id}">Quitar del gráfico</button>` : `<button class="ib-pill main" data-pine-add="${x.id}">＋ Al gráfico</button>`}${bad ? `<button class="ib-pill warn" data-pine-conv="${x.id}">${I('wrench', 13)} Convertir de nuevo</button>` : ''}<button class="ib-pill" data-ib-view="${x.id}">Código</button><button class="ib-pill del" data-ib-del="${x.id}" aria-label="Eliminar ${esc(x.name)}">${I('trash', 13)}</button></div></div>${p ? `<div class="ib-act">${tog(`data-pine-tog="${x.id}"`, p.on, x.name)}</div>` : ''}</div>`;
}
const isProItem = it => (it.kind === 'std' && (it.key === 'liqmap' || PLUS_IND.includes(it.key))) || (it.kind === 'free' && PLUS_FREE.includes(it.key)); // pestaña «Pro»: los indicadores premium que no son Nova Nexus
function ibList() {
  const all = ibItems(), q = ibNorm(ibQ).trim(), sec = (t, a) => a.length ? `<div class="ib-sec">${t}</div>${a.map(ibCard).join('')}` : '';
  if (q) { const hit = all.filter(it => ibNorm(it.title + ' ' + it.desc).includes(q)); return hit.length ? `<div class="ib-sec">${hit.length} resultado${hit.length === 1 ? '' : 's'}</div>` + hit.map(ibCard).join('') : `<div class="ib-empty">Nada coincide con «${esc(ibQ)}».<br>¿Lo tienes en TradingView? Importa su código Pine y se convierte aquí.</div>`; }
  if (ibCat === 'pro') return `<div class="ib-sec">Indicadores Pro · se desbloquean con Plus (Liquidaciones con Infinity)</div>` + all.filter(isProItem).map(ibCard).join('');
  if (ibCat === 'active') { const on = all.filter(it => it.on); return on.length ? on.map(ibCard).join('') : '<div class="ib-empty">No tienes indicadores en el gráfico.<br>Elige uno en «Gratuitos» o en «Mis indicadores».</div>'; }
  if (ibCat === 'free') return FREE_GROUPS.map(g => sec(IB_CATS.find(c => c[0] === g)[1], all.filter(it => (it.kind === 'std' || it.kind === 'free') && it.cat === g))).join('');
  if (ibCat === 'mine') { const m = all.filter(it => it.kind === 'mine'); return `<div class="ib-import"><div><b>Importa tus indicadores de TradingView</b><small>Pega el código Pine o sube el archivo: se convierte, se prueba en tus velas y se corrige solo si hace falta. Queda guardado en tu cuenta con su imagen.</small></div><div class="ib-btns"><button class="ib-pill main" data-pine-new="1">${I('clipboard', 13)} Pegar código</button><button class="ib-pill" data-ib-file="1">Subir archivo .pine</button></div></div>` + (m.length ? m.map(ibCard).join('') : '<div class="ib-empty">Aún no tienes scripts propios.</div>'); }
  return all.filter(it => it.cat === ibCat).map(ibCard).join('');
}
function indBrowser() {
  const all = ibItems(), n = c => c === 'pro' ? all.filter(isProItem).length : c === 'active' ? all.filter(i => i.on).length : c === 'free' ? all.filter(i => i.kind === 'std' || i.kind === 'free').length : all.filter(i => i.cat === c).length;
  return `<div class="ib"><div class="ib-top"><label class="ib-search">${ibIc('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>')}<input id="ibQ" type="search" placeholder="Buscar indicador…" autocomplete="off" value="${esc(ibQ)}"></label><button class="ib-new" data-pine-new="1">${ibIc('<path d="M12 5v14M5 12h14"/>')}<span>Importar Pine</span></button></div>
    <div class="ib-main"><nav class="ib-cats" aria-label="Categorías">${IB_CATS.map(([k, t, ic]) => `<button data-ibcat="${k}" class="${ibCat === k && !ibQ ? 'on' : ''}${k === 'trend' || k === 'osc' || k === 'volume' || k === 'volat' || k === 'struct' ? ' sub' : ''}">${ibIc(ic)}<span>${t}</span><em>${n(k)}</em></button>`).join('')}</nav><div class="ib-list">${ibList()}</div></div></div>`;
}
document.addEventListener('input', e => { if (e.target.id !== 'ibQ') return; ibQ = e.target.value; const l = e.target.closest('.ib').querySelector('.ib-list'); if (l) { l.innerHTML = ibList(); l.scrollTop = 0; } e.target.closest('.ib').querySelectorAll('[data-ibcat]').forEach(b => b.classList.toggle('on', !ibQ && b.dataset.ibcat === ibCat)); });
document.addEventListener('click', e => {
  const c = e.target.closest('[data-ibcat]'); if (c) { ibCat = c.dataset.ibcat; ibQ = ''; const box = c.closest('.ib'); const qi = box.querySelector('#ibQ'); if (qi) qi.value = ''; box.querySelectorAll('[data-ibcat]').forEach(b => b.classList.toggle('on', b === c)); const l = box.querySelector('.ib-list'); l.innerHTML = ibList(); l.scrollTop = 0; return; }
  const f = e.target.closest('[data-free]'); if (f) { const sid = 'free:' + f.dataset.free, p = state.pine.find(x => x.sid === sid); if (p) p.on = !p.on; else { if (activePine().length >= PINE_MAX) { toast(`Máximo ${PINE_MAX} scripts activos`); return; } state.pine.push({sid, on: true, inputs: {}}); } save(); countIndicators(); pineKey = ''; schedulePine(); renderIndicators(); if (sheetMode === 'indicators' && $('#sheet').classList.contains('open')) ibRefresh(); scheduleRender(); return; }
  const cv = e.target.closest('[data-pine-conv]'); if (cv) { const x = scripts.find(y => y.id === cv.dataset.pineConv); if (x && window.CCTConvert) { closeSheet(); if (!candles.length) { toast('Abre un gráfico y espera a que carguen las velas'); return; } CCTConvert.open(x.code, x.name, {replaceId: x.id}); } return; }
  const v = e.target.closest('[data-ib-view]'); if (v) { viewScriptId = v.dataset.ibView; openSheet('script'); return; }
  const fl = e.target.closest('[data-ib-file]'); if (fl) { $('#scriptFile').click(); return; }
  const d = e.target.closest('[data-ib-del]'); if (d) { const x = scripts.find(y => y.id === d.dataset.ibDel); if (x && confirm(`¿Eliminar «${x.name}» de tus indicadores?`)) { scripts = scripts.filter(y => y.id !== x.id); state.pine = state.pine.filter(q => q.sid !== x.id); delete pineRes[x.id]; save(); saveScripts(); renderScripts(); countIndicators(); scheduleRender(); ibRefresh(); } }
});
function ibRefresh() { const sl = $('#sheetList'); if (sheetMode !== 'indicators' || !sl || !$('#sheet').classList.contains('open')) return; const l = sl.querySelector('.ib-list'), y = l ? l.scrollTop : 0; sl.innerHTML = indBrowser(); const n = sl.querySelector('.ib-list'); if (n) n.scrollTop = y; }
function syncLiqBtn() { const b = $('#liqBtn'); if (!b) return; const on = !!state.indicators.liqmap; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
{ const b = $('#liqBtn'); if (b) b.addEventListener('click', () => { state.indicators.liqmap = !state.indicators.liqmap; if (state.stdHide) delete state.stdHide.liqmap; save(); renderIndicators(); countIndicators(); if (candles.length) { calcNova(); calcExtra(); } scheduleRender(); toast(state.indicators.liqmap ? 'Heatmap de liquidaciones activado (estimado)' : 'Heatmap de liquidaciones apagado'); }); }
document.addEventListener('click', e => { // «＋» en EMA, SMA, WMA y Bollinger: agrega otra copia con su propia configuración
  const b = e.target.closest('[data-std-copy]'); if (!b) return; e.stopPropagation();
  const k = addCopy(b.dataset.stdCopy); if (!k) return;
  save(); renderIndicators(); countIndicators(); if (candles.length) calcExtra(); if (sheetMode === 'indicators' && $('#sheet').classList.contains('open')) ibRefresh(); scheduleRender();
  toast(`${stdName(k)} agregada · cámbiale el período o el color con el engrane`);
});
function countIndicators() { syncLiqBtn(); const n = Object.entries(state.indicators).filter(([k, v]) => v && !k.startsWith('nn') && k !== 'derivs').length + (novaOn() ? 1 : 0); $('#indicatorCount').textContent = n ? `Indicadores (${n})` : 'Indicadores'; }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ind]'); if (!b) return;
  if (isCopy(b.dataset.ind)) removeCopy(b.dataset.ind); else { state.indicators[b.dataset.ind] = !state.indicators[b.dataset.ind]; if (state.stdHide) delete state.stdHide[b.dataset.ind]; }
  save(); renderIndicators(); countIndicators(); if (candles.length) { calcNova(); calcExtra(); }
  if (/^(derivs|oi|funding|lsr|taker)$/.test(b.dataset.ind)) dvRefresh(true);
  if (['indicators', 'novaSet'].includes(sheetMode) && $('#sheet').classList.contains('open')) renderSheet();
  scheduleRender();
});

/* ───────── Hojas inferiores (activo / añadir / dibujar / indicadores) ───────── */
function openSheet(mode = 'select') {
  if (mode === 'select' || mode === 'add') { sheetMode = mode; openSym(mode); return; }
  sheetMode = mode; $('#sheet').dataset.mode = mode;
  $('#sheetTitle').textContent = {add: 'Añadir a seguimiento', tools: 'Herramientas de dibujo', indicators: 'Indicadores', select: 'Seleccionar criptomoneda', script: 'Código del script', paste: 'Pegar script de Pine', pine: 'Convertir script de Pine', pineSet: 'Script de Pine', novaSet: 'Nova Nexus'}[mode];
  $('#sheetSearch').style.display = ['tools', 'indicators', 'script', 'paste', 'pine', 'pineSet', 'novaSet'].includes(mode) ? 'none' : 'block';
  $('#sheetSearch').value = '';
  $('#sheetBackdrop').classList.add('open'); $('#sheet').classList.add('open');
  renderSheet(); if (['add', 'select'].includes(mode)) loadSheetUniverse();
}
function closeSheet() { $('#sheetBackdrop').classList.remove('open'); $('#sheet').classList.remove('open'); closeSym(); }
/* ───────── Catálogo de herramientas de dibujo (estilo TradingView) ─────────
   Cada grupo = un botón en la barra izquierda (escritorio) y una sección en la hoja «Dibujar» (móvil).
   Herramienta: [clave, nombre, ayuda, icono SVG] */
const SV = (inner, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const DOT = (x, y) => `<circle cx="${x}" cy="${y}" r="1.7" fill="currentColor" stroke="none"/>`;
const IC = {
  cursor: '<path d="m6 4 12 7-5.2 1.6L11 18z"/>',
  trend: '<path d="M5 19 19 5"/>' + DOT(5, 19) + DOT(19, 5),
  ray: DOT(5, 18) + '<path d="M5 18 21 6M17 5.5 21 6l-1.3 4"/>',
  info: '<path d="M4 18 15 7"/><rect x="11" y="11" width="9" height="7" rx="1.5"/><path d="M13 14.5h5"/>',
  extended: '<path d="M3 21 21 3"/>' + DOT(9, 15) + DOT(15, 9),
  angle: '<path d="M4 19h16M4 19 17 8M12 19a8 8 0 0 0-2.4-5.6"/>',
  horizontal: '<path d="M3 12h18"/>' + DOT(12, 12),
  hray: DOT(5, 12) + '<path d="M5 12h16M17 8.5l4 3.5-4 3.5"/>',
  vertical: '<path d="M12 3v18"/>' + DOT(12, 12),
  crossline: '<path d="M3 12h18M12 3v18"/>' + DOT(12, 12),
  channel: '<path d="M4 14 18 4M6 20 20 10"/>',
  pitchfork: '<path d="M4 20l6-8M10 12 21 6M10 12h11M10 12l11 7"/>',
  fib: '<path d="M3 5h18M3 10h18M3 14h18M3 19h18"/><path d="m6 19 12-14" stroke-dasharray="2 2"/>',
  fibext: '<path d="M3 6h18M3 11h18M3 16h18"/><path d="m5 20 4-11 4 6" />',
  fibtime: '<path d="M4 4v16M8 4v16M13 4v16M21 4v16"/>',
  fibfan: '<path d="M4 20 20 4M4 20 20 9M4 20 20 14M4 20h16"/>',
  fibcircle: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="9"/>',
  xabcd: '<path d="m3 18 4-12 5 9 4-8 5 11"/>',
  abcd: '<path d="M4 18 9 7l6 8 5-9"/>',
  trianglep: '<path d="M3 6l18 4M3 18l18-4M3 6v12"/>',
  hs: '<path d="m2 17 4-7 3 5 3-10 3 10 3-5 4 7"/>',
  impulse: '<path d="m3 20 4-8 2 3 6-10 2 4 5-5"/>',
  abc: '<path d="m4 6 5 12 4-8 7 10"/>',
  long: '<rect x="5" y="4" width="14" height="8" fill="currentColor" fill-opacity=".25"/><rect x="5" y="12" width="14" height="6"/>',
  short: '<rect x="5" y="6" width="14" height="6"/><rect x="5" y="12" width="14" height="8" fill="currentColor" fill-opacity=".25"/>',
  measure: '<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/>',
  pricerange: '<path d="M12 4v16M9 7l3-3 3 3M9 17l3 3 3-3M5 4h14M5 20h14"/>',
  daterange: '<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3M4 5v14M20 5v14"/>',
  brush: '<path d="m4 20 1-4L16 5l3 3L8 19zM14 7l3 3"/>',
  highlighter: '<path d="m5 17 3-1 9-9-2-2-9 9zM13 5l6 6M4 21h8"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="6"/>',
  triangle: '<path d="M12 4 21 19H3z"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  note: '<path d="M4 5h16v11H11l-4 4v-4H4z"/>',
  label: '<path d="M3 12 8 6h13v12H8z"/>',
  arrow: '<path d="M5 19 19 5M10 5h9v9"/>',
  arrowup: '<path d="M12 20V6M6 12l6-6 6 6"/>',
  arrowdown: '<path d="M12 4v14M6 12l6 6 6-6"/>',
  marker: '<path d="M12 21 6 11a6 6 0 1 1 12 0z"/><circle cx="12" cy="10" r="2"/>',
  regression: '<path d="M3 17 21 7M3 11 21 1M3 23 21 13" opacity=".9"/>',
  cyclic: '<path d="M5 4v16M10 4v16M15 4v16M20 4v16"/>',
  sinewave: '<path d="M2 12c3-9 5-9 8 0s5 9 8 0 3-5 4-4"/>',
  gannfan: '<path d="M4 20 20 4M4 20 20 9M4 20 20 14M4 20 14 4M4 20 9 4M4 20h16"/>',
  gannbox: '<rect x="4" y="4" width="16" height="16"/><path d="M4 4 20 20M20 4 4 20M12 4v16M4 12h16"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  diamond: '<path d="M12 3 21 12 12 21 3 12z"/>',
  parallelogram: '<path d="M7 6h14l-4 12H3z"/>',
  callout: '<path d="M4 4h12v8H9l-3 3v-3H4z"/><path d="M13 12l6 7"/>',
  flag: '<path d="M6 21V4M6 4h12l-3 4 3 4H6"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  xmark: '<path d="M6 6l12 12M18 6 6 18"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  arrowleft: '<path d="M20 12H5M11 6l-6 6 6 6"/>',
  arrowright: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  starfill: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor"/>',
  magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4zM6 8h4M14 8h4"/>',
  keep: '<path d="M9 4h6v5l3 4H6l3-4zM12 13v7"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.5 7.6A16 16 0 0 0 2 12s4 7 10 7a9.5 9.5 0 0 0 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  swap: '<path d="M8 4v16M8 4 5 7M8 4l3 3M16 20V4M16 20l-3-3M16 20l3-3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>'
};
const TOOL_GROUPS = [
  {id: 'lines', name: 'Líneas', tools: [
    ['trend', 'Línea de tendencia', 'Arrastra o toca dos puntos', IC.trend],
    ['ray', 'Rayo', 'Dos puntos; la línea sigue hacia la derecha', IC.ray],
    ['info', 'Línea de información', 'Tendencia con variación, % y velas', IC.info],
    ['extended', 'Línea extendida', 'Dos puntos; la línea sigue en ambos sentidos', IC.extended],
    ['angle', 'Ángulo de tendencia', 'Dos puntos; muestra el ángulo', IC.angle],
    ['horizontal', 'Línea horizontal', 'Toca un precio', IC.horizontal],
    ['hray', 'Rayo horizontal', 'Toca un punto; sigue hacia la derecha', IC.hray],
    ['vertical', 'Línea vertical', 'Toca una vela', IC.vertical],
    ['crossline', 'Línea cruzada', 'Toca un punto: horizontal y vertical', IC.crossline],
    ['channel', 'Canal paralelo', 'Dos puntos y un tercero para el ancho', IC.channel],
    ['regression', 'Canal de regresión', 'Dos velas; regresión lineal ±2σ', IC.regression],
    ['cyclic', 'Líneas cíclicas', 'Dos puntos; verticales a intervalos iguales', IC.cyclic],
    ['sinewave', 'Línea sinusoidal', 'Dos puntos; onda que se repite', IC.sinewave]
  ]},
  {id: 'fib', name: 'Fibonacci y horquillas', tools: [
    ['fib', 'Retroceso de Fibonacci', 'Inicio y fin del movimiento', IC.fib],
    ['fibext', 'Extensión de Fibonacci', 'Tres puntos: inicio, fin y retroceso', IC.fibext],
    ['fibtime', 'Zonas de tiempo de Fibonacci', 'Dos puntos; marca 1, 2, 3, 5, 8, 13…', IC.fibtime],
    ['fibfan', 'Abanico de Fibonacci', 'Dos puntos; abanico de velocidad', IC.fibfan],
    ['fibcircle', 'Círculos de Fibonacci', 'Dos puntos; círculos concéntricos', IC.fibcircle],
    ['gannfan', 'Abanico de Gann', 'Dos puntos; rayos 1x1, 1x2, 2x1…', IC.gannfan],
    ['gannbox', 'Caja de Gann', 'Dos esquinas; diagonales y divisiones', IC.gannbox],
    ['pitchfork', 'Horquilla de Andrews', 'Tres puntos: mango y dos extremos', IC.pitchfork]
  ]},
  {id: 'patterns', name: 'Patrones de gráficos', tools: [
    ['xabcd', 'Patrón XABCD', 'Toca 5 puntos: X, A, B, C, D', IC.xabcd],
    ['abcd', 'Patrón ABCD', 'Toca 4 puntos: A, B, C, D', IC.abcd],
    ['trianglep', 'Patrón de triángulo', 'Toca 4 puntos: dos líneas que convergen', IC.trianglep],
    ['hs', 'Cabeza y hombros', 'Toca 7 puntos del patrón', IC.hs],
    ['impulse', 'Onda de impulso (1-5)', 'Toca 6 puntos: 0 a 5', IC.impulse],
    ['abc', 'Onda correctiva (ABC)', 'Toca 4 puntos: 0, A, B, C', IC.abc]
  ]},
  {id: 'proj', name: 'Proyección y medición', tools: [
    ['long', 'Posición Long', 'Entrada y objetivo arriba (stop a 2:1)', IC.long],
    ['short', 'Posición Short', 'Entrada y objetivo abajo (stop a 2:1)', IC.short],
    ['measure', 'Medición', 'Precio, % y velas entre dos puntos', IC.measure],
    ['pricerange', 'Rango de precio', 'Diferencia de precio entre dos puntos', IC.pricerange],
    ['daterange', 'Rango de fechas', 'Velas y tiempo entre dos puntos', IC.daterange]
  ]},
  {id: 'shapes', name: 'Pincel y formas', tools: [
    ['brush', 'Pincel', 'Dibuja a mano alzada sobre el gráfico', IC.brush],
    ['highlighter', 'Resaltador', 'Trazo ancho y translúcido', IC.highlighter],
    ['rect', 'Rectángulo', 'Dos esquinas', IC.rect],
    ['ellipse', 'Elipse', 'Dos esquinas del recuadro', IC.ellipse],
    ['triangle', 'Triángulo', 'Tres puntos', IC.triangle],
    ['circle', 'Círculo', 'Centro y borde', IC.circle],
    ['diamond', 'Rombo', 'Dos esquinas del recuadro', IC.diamond],
    ['parallelogram', 'Paralelogramo', 'Tres puntos', IC.parallelogram]
  ]},
  {id: 'notes', name: 'Texto y notas', tools: [
    ['text', 'Texto', 'Toca dónde quieres escribir', IC.text],
    ['note', 'Nota', 'Globo de nota con texto', IC.note],
    ['label', 'Etiqueta de precio', 'Toca un punto: muestra su precio', IC.label],
    ['arrow', 'Flecha', 'Inicio y punta', IC.arrow],
    ['arrowup', 'Flecha arriba', 'Toca un punto', IC.arrowup],
    ['arrowdown', 'Flecha abajo', 'Toca un punto', IC.arrowdown],
    ['marker', 'Marcador de máximo/mínimo', 'Toca un máximo o mínimo', IC.marker],
    ['callout', 'Llamada', 'Punto señalado y posición del texto', IC.callout],
    ['flag', 'Bandera', 'Toca un punto', IC.flag],
    ['check', 'Marca ✓', 'Toca un punto', IC.check],
    ['xmark', 'Marca ✕', 'Toca un punto', IC.xmark],
    ['star', 'Estrella', 'Toca un punto', IC.star],
    ['arrowleft', 'Flecha izquierda', 'Toca un punto', IC.arrowleft],
    ['arrowright', 'Flecha derecha', 'Toca un punto', IC.arrowright]
  ]}
];
/* Favoritos: la estrella de cada herramienta la sube a la sección «Favoritos» (arriba de la barra y de la hoja del celular) */
const FAV_KEY = 'cct_favtools_v1';
let FAVS = ['brush']; try { const f = JSON.parse(lsGet(FAV_KEY) || 'null'); if (Array.isArray(f)) FAVS = f.filter(x => typeof x === 'string').slice(0, 24); } catch {}
let FB = Object.assign({show: true, x: null, y: null, mx: null, my: null}, (state.ui && state.ui.favBar) || {}); // (mx,my: posición del botón estrella en celular) barra flotante de favoritos: visible y posición (fracciones del gráfico)
if (state.ui && Array.isArray(state.ui.favs)) FAVS = state.ui.favs.slice(0, 24);
let MYCOL = state.ui && Array.isArray(state.ui.myColors) ? state.ui.myColors.slice(0, 20) : []; // tus colores guardados (máx. 20)
window.CCTColors = {pal: () => SB_PAL, get: () => MYCOL.slice(), has: c => MYCOL.includes(String(c).toLowerCase()), add(c) { c = String(c || '').toLowerCase(); if (!/^#[0-9a-f]{6}$/.test(c)) return false; if (MYCOL.includes(c)) return true; if (MYCOL.length >= 20) return 'full'; MYCOL = [...MYCOL, c]; syncUi(); return true; }, remove(c) { c = String(c || '').toLowerCase(); MYCOL = MYCOL.filter(x => x !== c); syncUi(); }};
const favTools = () => FAVS.map(k => toolOf(k)).filter(Boolean);
function toggleFav(k) {
  FAVS = FAVS.includes(k) ? FAVS.filter(x => x !== k) : [...FAVS, k];
  try { localStorage.setItem(FAV_KEY, JSON.stringify(FAVS)); } catch {}
  if (typeof syncUi === 'function') syncUi(); if (typeof renderFavBar === 'function') renderFavBar();
  buildRail(); const fl = $('#railFly'); if (fl) { fl.querySelectorAll('[data-star]').forEach(b => b.classList.toggle('on', FAVS.includes(b.dataset.star))); }
  if (typeof sheetMode !== 'undefined' && sheetMode === 'tools' && typeof renderSheet === 'function') renderSheet();
}
const starBtn = k => `<span class="star${FAVS.includes(k) ? ' on' : ''}" data-star="${k}" role="button" aria-label="Favorito" title="Añadir o quitar de favoritos">${SV(IC.star, 16)}</span>`;
/* Opciones de la barra: imán (ajusta a O/H/L/C), mantener herramienta, bloquear y ocultar dibujos */
const DOPT_KEY = 'cct_dopts_v1';
const DOPT = Object.assign({magnet: true, stay: false, lock: false, hide: false}, (() => { try { return JSON.parse(lsGet(DOPT_KEY) || '{}') || {}; } catch { return {}; } })());
const saveDopt = () => { try { localStorage.setItem(DOPT_KEY, JSON.stringify(DOPT)); } catch {} if (typeof syncUi === 'function') syncUi(); };
const isBrushTool = t => t === 'brush' || t === 'highlighter';
function renderSheet() {
  const list = $('#sheetList');
  if (sheetMode === 'indicators') { list.innerHTML = indicatorRows(); return; }
  if (sheetMode === 'novaSet') { renderNovaSettings(list); return; }
  if (sheetMode === 'pine') { renderPineEditor(list); return; }
  if (sheetMode === 'pineSet') { renderPineSettings(list); return; }
  if (sheetMode === 'script') {
    const sc = scripts.find(x => x.id === viewScriptId); if (!sc) { list.innerHTML = ''; return; }
    const MAXV = 30000, shown = sc.code.length > MAXV ? sc.code.slice(0, MAXV) : sc.code;
    list.innerHTML = `<p class="small-note">${esc(sc.name)} · ${sc.lines} líneas${sc.code.length > MAXV ? ' · se muestran los primeros 30,000 caracteres (el script completo está guardado)' : ''}</p><pre class="code">${esc(shown)}</pre>`; return;
  }
  if (sheetMode === 'paste') {
    list.innerHTML = `<input id="pasteName" class="paste-name" placeholder="Nombre (opcional)" autocomplete="off"><textarea id="pasteCode" placeholder="Pega aquí tu código Pine…" spellcheck="false"></textarea><div class="paste-actions"><button class="primary" id="pasteSave" style="margin:0">Convertir y guardar</button></div>`;
    $('#pasteSave').onclick = () => { const code = $('#pasteCode').value; if (!code.trim()) { toast('Pega primero el código'); return; } closeSheet(); convertPine(code, $('#pasteName').value.trim() || 'Script pegado'); };
    return;
  }
  if (sheetMode === 'tools') {
    const item = ([k, t, d, ic]) => `<button class="sheet-item" data-tool="${k}"><span class="tool-line"><span class="ti">${SV(ic, 18)}</span>${esc(t)}${starBtn(k)}</span><small>${esc(d)}</small></button>`;
    list.innerHTML = (FAVS.length ? `<div class="section-label">FAVORITOS</div>` + favTools().map(item).join('') : '') + TOOL_GROUPS.map(gr => `<div class="section-label">${esc(gr.name).toUpperCase()}</div>` + gr.tools.map(item).join('')).join('')
      + `<div class="section-label">OPCIONES</div><button class="sheet-item" data-tool="clear"><span class="tool-line"><span class="ti">${SV(IC.trash, 18)}</span>Borrar todos los dibujos</span><small>Solo de este activo</small></button>`;
    $$('.sheet-item[data-tool]').forEach(b => b.onclick = e => {
      const st = e.target.closest('[data-star]'); if (st) { e.stopPropagation(); toggleFav(st.dataset.star); return; }
      const k = b.dataset.tool; closeSheet();
      if (k === 'clear') { snapDraw(); setDrawings([]); selectedId = null; updateDrawUI(); render(); toast('Dibujos borrados'); }
      else pickTool(k);
    });
    return;
  }
  /* Buscador de activos estilo TradingView: escribe «btc» y salen Bitcoin de Binance, Bybit, BingX, OKX… cada uno con su exchange; al elegir uno se guarda ese par de ese exchange. */
  const search = $('#sheetSearch').value.trim().toUpperCase(), M = window.CCTMarkets, q2 = search.replace(/[^A-Z0-9.]/g, '');
  let rows;
  if (!q2) { const pool = sheetMode === 'add' ? Object.keys(catalog).map(x => x + 'USDT') : state.symbols; rows = pool.map(k => ({key: k, base: baseOnly(k), quote: quoteOf(k), src: srcOf(k)})); }
  else {
    if (M && !M.loaded().length) list.innerHTML = '<p class="small-note">Buscando en los exchanges…</p>';
    rows = M ? M.search(q2, {names: b => (catalog[b] || [''])[0], limit: 80}) : [];
    if (!rows.length && !(M && M.ORDER.every(x => sheetLoad[x] === 'done'))) list.innerHTML = '<p class="small-note">Buscando en los exchanges…</p>';
    if (sheetMode === 'add' && q2 && /^[A-Z0-9]{2,15}$/.test(q2) && !rows.length && M && M.ORDER.every(x => sheetLoad[x] === 'done')) { const full = QUOTES.some(q => q2.length > q.length + 1 && q2.endsWith(q)) ? q2 : q2 + 'USDT'; rows = [{key: full, base: baseOnly(full), quote: quoteOf(full), src: 'binance'}]; }
  }
  if (!rows.length && q2 && M && !M.ORDER.every(x => sheetLoad[x] === 'done')) return;
  const tag = r => `<span class="ex-tag ex-${r.src}">${esc((M && M.SHORT[r.src]) || 'BINANCE')}</span>`;
  list.innerHTML = rows.map(r => `<button class="sheet-item pick-row" data-pick="${esc(r.key)}"><span class="pk-main"><strong>${esc(r.base + '/' + r.quote)}</strong> <small>${esc(meta(r.key)[0])}</small></span>${tag(r)}<span class="pk-go">${state.symbols.includes(r.key) ? (sheetMode === 'add' ? '✓' : '→') : '＋'}</span></button>`).join('') || '<p class="small-note">No se encontraron monedas.</p>';
  $$('[data-pick]').forEach(b => b.onclick = () => {
    const s = b.dataset.pick;
    if (sheetMode !== 'add') { if (wlAdd(s)) { save(); renderWatch(); fetchTicker(); } selectSymbol(s); return; }
    if (state.symbols.includes(s)) { closeSheet(); return; }
    wlAdd(s); save(); renderWatch(); fetchTicker(); toast(`${base(s)} añadido (${exName(s)})`); closeSheet();
  });
}
const sheetLoad = {};
function loadSheetUniverse() { if (!window.CCTMarkets) return; CCTMarkets.ORDER.forEach(x => { if (sheetLoad[x]) return; sheetLoad[x] = 'busy'; CCTMarkets.universe(x).then(() => { sheetLoad[x] = 'done'; if (symOpen) renderSym(); }); }); }

/* ───────── Buscador de activos visual (estilo openmarket / TradingView) ─────────
   Categorías arriba, filtros a la izquierda, lista de activos con mini gráfico en el centro y, a la derecha, el mismo activo en cada exchange.
   Elegir un exchange abre ese par; en «Añadir» lo guarda en Mi seguimiento. En celular el panel de exchanges ocupa la pantalla y tiene botón «Volver». */
let symOpen = false, symMode = 'select', symTab = 'all', symExp = 'vol', symSel = '', symF = {src: '', quote: '', prod: ''}, symAssets = [], symCur = 0;
const SYM_TABS = [['all', 'Todos'], ['crypto', 'Cripto'], ['dom', 'Dominancia'], ['fav', 'Mi seguimiento']];
const SYM_EXP = [['vol', 'Más volumen'], ['up', 'Suben hoy'], ['down', 'Bajan hoy']];
const symName = b => (catalog[b] || [(window.CCTMarkets && CCTMarkets.DOM_NAMES[b]) || ''])[0];
const symIcon = b => `<span class="coin-icon ${b === 'ETH' ? 'eth' : b === 'SOL' ? 'sol' : b === 'BNB' ? 'bnb' : b === 'XRP' ? 'xrp' : b === 'BTC' ? '' : 'other'}">${esc(b.endsWith('.D') ? 'D' : (catalog[b] || [0, b.slice(0, 1)])[1])}${b.endsWith('.D') ? '' : coinImg(b)}</span>`;
const symPx = r => Number.isFinite(r.last) ? fmt(r.last) + (r.src === 'dom' ? '%' : '') : '—';
const symChg = r => Number.isFinite(r.chg) ? `<small class="${r.chg >= 0 ? 'positive' : 'negative'}">${r.chg >= 0 ? '▲' : '▼'} ${Math.abs(r.chg).toFixed(2)}%</small>` : '<small>—</small>';
function symBuild() {
  const M = window.CCTMarkets; if (!M) return [];
  const q = $('#symInput').value.trim().toUpperCase().replace(/[^A-Z0-9.]/g, '');
  let rows = M.search(q, {names: symName, limit: 6000});
  rows = rows.filter(r => {
    if (symTab === 'dom' && r.src !== 'dom') return false;
    if (symTab === 'crypto' && r.src === 'dom') return false;
    if (symTab === 'fav' && !state.symbols.includes(r.key)) return false;
    if (symF.src && r.src !== symF.src) return false;
    if (symF.quote && r.quote !== symF.quote) return false;
    if (symF.prod === 'spot' && (CCTMarkets.isPerp(r.src) || r.src === 'dom')) return false;
    if (symF.prod === 'perp' && !CCTMarkets.isPerp(r.src)) return false;
    return true;
  });
  const g = new Map();
  for (const r of rows) { const k = r.base; if (!g.has(k)) g.set(k, {base: k, name: symName(k), rows: [], rank: g.size}); g.get(k).rows.push(r); }
  const out = [...g.values()];
  for (const a of out) { // fila «principal»: la de más volumen con precio, preferiblemente en dólares
    const pr = a.rows.filter(r => Number.isFinite(r.last)), pool = pr.length ? pr : a.rows;
    a.best = pool.slice().sort((x, y) => ((y.quote === 'USDT' || y.quote === 'USD' || y.src === 'dom') - (x.quote === 'USDT' || x.quote === 'USD' || x.src === 'dom')) || y.vol - x.vol)[0];
    a.vol = Math.max(...a.rows.map(r => r.vol || 0));
  }
  if (!q) { // sin texto: orden según «Explorar»
    if (symExp === 'up') out.sort((a, b) => (b.best.chg || -1e9) - (a.best.chg || -1e9));
    else if (symExp === 'down') out.sort((a, b) => (a.best.chg || 1e9) - (b.best.chg || 1e9));
    else out.sort((a, b) => (b.best.src === 'dom') - (a.best.src === 'dom') || b.vol - a.vol);
    if (symExp !== 'vol') return out.filter(a => Number.isFinite(a.best.chg) && a.vol > 5e6).slice(0, 60);
  }
  return out.slice(0, 60);
}
function symSparkCell(r) { return `<span class="sym-sp" data-sp="${esc(r.key)}">${sparkSVG(r.key, r.chg)}</span>`; }
async function symSparks(keys) {
  const todo = keys.filter(sparkStale).slice(0, 40);
  for (let i = 0; i < todo.length && symOpen; i += 8) {
    await Promise.all(todo.slice(i, i + 8).map(sparkOne));
    $$('#symModal [data-sp]').forEach(el => { const k = el.dataset.sp; if (spark[k] && spark[k].v) { const r = symAllRows.get(k); el.innerHTML = sparkSVG(k, r ? r.chg : NaN); } });
  }
}
let symAllRows = new Map();
function renderSym() {
  if (!symOpen) return;
  const M = window.CCTMarkets, loading = M && !M.ORDER.every(x => sheetLoad[x] === 'done');
  $('#symTabs').innerHTML = SYM_TABS.map(([k, n]) => `<button class="${symTab === k ? 'on' : ''}" data-symtab="${k}" type="button">${n}</button>`).join('');
  const quotes = ['USDT', 'USDC', 'USD', 'BTC', 'EUR'], srcs = M ? M.ORDER.filter(x => x !== 'dom') : [];
  const sel = (id, lab, cur, opts) => `<label class="sym-sel"><small>${lab}</small><select id="${id}"><option value="">Todos</option>${opts.map(([v, n]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
  $('#symSide').innerHTML = `<h6>Explorar</h6>${SYM_EXP.map(([k, n]) => `<button class="sym-nav ${symExp === k ? 'on' : ''}" data-symexp="${k}" type="button">${n}${symExp === k ? '<i>✓</i>' : ''}</button>`).join('')}
    <h6>Refinar</h6>${sel('symFSrc', 'Exchange', symF.src, srcs.map(x => [x, M.EXCH[x]]))}${sel('symFQuote', 'Cotización', symF.quote, quotes.map(x => [x, x]))}
    <h6>Producto</h6><div class="sym-chips">${[['spot', 'Spot'], ['perp', 'Perpetuos']].map(([k, n]) => `<button class="${symF.prod === k ? 'on' : ''}" data-symprod="${k}" type="button">${n}</button>`).join('')}</div>`;
  symAssets = symBuild(); symAllRows = new Map(); symAssets.forEach(a => a.rows.forEach(r => symAllRows.set(r.key, r)));
  if (!symAssets.some(a => a.base === symSel)) symSel = symAssets[0] ? symAssets[0].base : '';
  symCur = Math.max(0, symAssets.findIndex(a => a.base === symSel));
  $('#symAssets').innerHTML = `<div class="sym-head"><b>Activos</b><small>${symAssets.length}${symAssets.length >= 60 ? '+' : ''} resultados</small></div>` + (symAssets.map(a => `<button class="sym-row ${a.base === symSel ? 'on' : ''}" data-symbase="${esc(a.base)}" type="button">${symIcon(a.base)}<span class="sym-nm"><strong>${esc(a.base)}</strong><small>${esc(a.name || (a.rows.length + (a.rows.length === 1 ? ' mercado' : ' mercados')))}</small></span>${symSparkCell(a.best)}<span class="sym-px"><strong>${symPx(a.best)}</strong>${symChg(a.best)}</span></button>`).join('') || `<p class="small-note">${loading ? 'Buscando en los exchanges…' : 'No se encontraron activos. Prueba otro texto o quita filtros.'}</p>`);
  renderSymEx();
  symSparks(symAssets.slice(0, 24).map(a => a.best.key));
}
function renderSymEx() {
  const a = symAssets.find(x => x.base === symSel), box = $('#symEx');
  if (!a) { box.innerHTML = ''; return; }
  const rows = a.rows.slice().sort((x, y) => (y.vol || 0) - (x.vol || 0) || M_ORDER(x) - M_ORDER(y)).slice(0, 40);
  box.innerHTML = `<div class="sym-head"><button class="sym-back" id="symBack" type="button">‹ Volver</button>${symIcon(a.base)}<b>${esc(a.base)}</b><small>${esc(a.name)}</small><span class="sym-count">${a.rows.length} ${a.rows.length === 1 ? 'mercado' : 'mercados'}</span></div>` +
    rows.map(r => `<button class="sym-row ex" data-sympick="${esc(r.key)}" type="button"><span class="ex-tag ex-${r.src}">${esc(CCTMarkets.SHORT[r.src])}</span><span class="sym-nm"><strong>${esc(r.quote ? r.base + '/' + r.quote : r.base)}</strong><small>${CCTMarkets.isPerp(r.src) ? 'Perpetuo' : r.src === 'dom' ? 'Índice' : 'Spot'}</small></span>${symSparkCell(r)}<span class="sym-px"><strong>${symPx(r)}</strong>${symChg(r)}</span><span class="sym-go">${state.symbols.includes(r.key) ? '✓' : '＋'}</span></button>`).join('');
  symSparks(rows.map(r => r.key));
}
const M_ORDER = r => CCTMarkets.ORDER.indexOf(r.src);
function symPick(key) {
  if (symMode === 'add') { if (wlAdd(key)) { save(); renderWatch(); fetchTicker(); toast(`${base(key)} añadido (${exName(key)})`); } closeSym(); return; }
  if (wlAdd(key)) { save(); renderWatch(); fetchTicker(); }
  selectSymbol(key);
}
function openSym(mode) {
  symMode = mode; symOpen = true; symTab = 'all'; symExp = 'vol'; symSel = ''; symF = {src: '', quote: '', prod: ''};
  $('#symInput').value = ''; $('#symTitle').textContent = mode === 'add' ? 'Añadir a Mi seguimiento' : 'Buscar activo';
  $('#symBackdrop').classList.add('open'); $('#symModal').classList.remove('ex-open');
  renderSym(); loadSheetUniverse(); setTimeout(() => { try { $('#symInput').focus(); } catch {} }, 60);
}
function closeSym() { if (!symOpen) return; symOpen = false; $('#symBackdrop').classList.remove('open'); }
{
  const modal = $('#symModal');
  $('#symInput').addEventListener('input', () => { symSel = ''; renderSym(); });
  $('#symClose').onclick = closeSym;
  $('#symBackdrop').addEventListener('mousedown', e => { if (e.target.id === 'symBackdrop') closeSym(); });
  modal.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.symtab) { symTab = t.dataset.symtab; symSel = ''; renderSym(); }
    else if (t.dataset.symexp) { symExp = t.dataset.symexp; symSel = ''; renderSym(); }
    else if (t.dataset.symprod) { symF.prod = symF.prod === t.dataset.symprod ? '' : t.dataset.symprod; symSel = ''; renderSym(); }
    else if (t.dataset.symbase) { symSel = t.dataset.symbase; $$('#symAssets .sym-row').forEach(b => b.classList.toggle('on', b.dataset.symbase === symSel)); renderSymEx(); modal.classList.add('ex-open'); }
    else if (t.dataset.sympick) symPick(t.dataset.sympick);
    else if (t.id === 'symBack') modal.classList.remove('ex-open');
  });
  modal.addEventListener('dblclick', e => { const t = e.target.closest('[data-symbase]'); if (t) { const a = symAssets.find(x => x.base === t.dataset.symbase); if (a) symPick(a.best.key); } });
  modal.addEventListener('change', e => { if (e.target.id === 'symFSrc') symF.src = e.target.value; else if (e.target.id === 'symFQuote') symF.quote = e.target.value; else return; symSel = ''; renderSym(); });
  document.addEventListener('keydown', e => {
    if (!symOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSym(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!symAssets.length) return; symCur = clamp(symCur + (e.key === 'ArrowDown' ? 1 : -1), 0, symAssets.length - 1); symSel = symAssets[symCur].base; $$('#symAssets .sym-row').forEach(b => b.classList.toggle('on', b.dataset.symbase === symSel)); const on = $('#symAssets .sym-row.on'); if (on) on.scrollIntoView({block: 'nearest'}); renderSymEx(); }
    else if (e.key === 'Enter') { const a = symAssets.find(x => x.base === symSel); if (a) { e.preventDefault(); symPick(a.best.key); } }
  });
}

$('#closeSheet').onclick = closeSheet; $('#sheetBackdrop').onclick = closeSheet; $('#sheetSearch').oninput = renderSheet;
$('#symbolButton').onclick = () => openSheet(); $('#addAsset').onclick = () => openSheet('add'); $('#searchCoins').oninput = renderWatch;
$$('[data-panel]').forEach(b => b.onclick = () => openSheet(b.dataset.panel === 'tools' ? 'tools' : 'indicators'));
$('#goChart').onclick = () => switchView('chartView');
function selectSymbol(s) {
  state.symbol = s; save(); closeSheet(); clearTransient(); closeWS(); candles = []; ind = {};
  updateChartHeader(); switchView('chartView'); loadCandles(); if (window.CCTTrade) CCTTrade.symChanged(); if (window.CCTBook) CCTBook.symChanged(); dvClose(); dvFs = ''; setTimeout(() => dvRefresh(true), 50);
}

/* ───────── Pestañas de gráficos: varios gráficos abiertos, cada uno con su moneda, temporalidad y tipo de vela ───────── */
const MAX_TABS = 8; let tabPrevEl = null;
function tabEnsure() {
  if (!Array.isArray(state.tabs)) state.tabs = [];
  if (!state.tabs.length) { const id = 't' + Date.now().toString(36).slice(-6); state.tabs = [{id, s: state.symbol, i: state.interval, c: state.ctype || 'candles'}]; state.tab = id; }
  if (!state.tabs.some(t => t.id === state.tab)) state.tab = state.tabs[0].id;
}
function tabTouch() { // la pestaña activa siempre refleja el gráfico que se está viendo
  try {
    if (typeof PANE !== 'undefined' && PANE) return; tabEnsure();
    const t = state.tabs.find(x => x.id === state.tab); if (!t) return;
    const c = state.ctype || 'candles';
    if (t.s !== state.symbol || t.i !== state.interval || t.c !== c) { t.s = state.symbol; t.i = state.interval; t.c = c; if (typeof renderTabs === 'function') renderTabs(); }
  } catch {}
}
function renderTabs() {
  const bar = $('#chartTabs'); if (!bar) return;
  if (PANE) { bar.hidden = true; return; } bar.hidden = false; tabEnsure();
  const ct = c => (CTYPES.find(x => x[0] === c) || CTYPES[0]);
  bar.innerHTML = state.tabs.map(t => `<div class="ctab${t.id === state.tab ? ' on' : ''}" role="tab" tabindex="0" aria-selected="${t.id === state.tab}" data-tab="${t.id}" title="${t.n ? esc(t.n) + ' · ' : ''}${esc(base(t.s))} · ${t.i} · ${esc(ct(t.c)[1])} · clic derecho: cambiar nombre"><span class="ct-t">${t.n ? esc(t.n) : esc(base(t.s).replace('/USDT', ''))}<small>${t.n ? esc(base(t.s).replace('/USDT', '')) + ' · ' : ''}${t.i}</small></span>${state.tabs.length > 1 ? `<button type="button" class="ct-x" data-tab-x="${t.id}" aria-label="Cerrar pestaña" tabindex="-1">&times;</button>` : ''}</div>`).join('')
    + (state.tabs.length < MAX_TABS ? `<button type="button" class="ct-add" id="tabAdd" aria-label="Nueva pestaña" title="Nueva pestaña">${I('plus', 16)}</button>` : '');
  const on = bar.querySelector('.ctab.on'); if (on && bar.scrollWidth > bar.clientWidth) on.scrollIntoView({inline: 'nearest', block: 'nearest'});
}
function loadTabChart() { clearTransient(); closeWS(); candles = []; ind = {}; updateChartHeader(); renderFrames(); syncCtypeBtn(); render(); loadCandles(); }
const tabSnap = () => { const sn = designSnap(); delete sn.ctype; return structuredClone(sn); };
function tabStore() { const o = state.tabs.find(x => x.id === state.tab); if (o && !PANE) o.cfg = tabSnap(); } // guarda en la pestaña activa sus indicadores y ajustes actuales
function tabApply(t) { if (t && t.cfg) applyDesign({snap: t.cfg}); else { renderIndicators(); countIndicators(); } }
function switchTab(id) {
  const t = state.tabs.find(x => x.id === id); if (!t || id === state.tab) return;
  tabTouch(); hideTabPrev(); tabStore(); state.tab = id; state.tabRev = Date.now(); state.symbol = t.s; state.interval = t.i; state.ctype = t.c; tabApply(t); renderIndicators(); countIndicators(); save(); renderTabs(); loadTabChart();
}
function newTab() {
  if (state.tabs.length >= MAX_TABS) { toast(`Máximo ${MAX_TABS} pestañas`); return; }
  tabTouch(); tabStore(); const id = 't' + Date.now().toString(36).slice(-6);
  const cfg = tabSnap(); cfg.indicators = Object.fromEntries(Object.keys(cfg.indicators || {}).map(k => [k, false])); cfg.stdHide = {}; cfg.pine = []; // la pestaña nueva empieza limpia, sin indicadores; desde aquí cada pestaña guarda los suyos
  const t = {id, s: state.symbol, i: state.interval, c: state.ctype || 'candles', cfg}; state.tabs.push(t); state.tab = id; state.tabRev = Date.now();
  tabApply(t); renderIndicators(); countIndicators(); save(); renderTabs(); loadTabChart(); openSheet(); // elige la moneda para la pestaña nueva
}
function closeTab(id) {
  if (state.tabs.length < 2) return; const i = state.tabs.findIndex(x => x.id === id); if (i < 0) return; const wasOn = id === state.tab;
  state.tabs.splice(i, 1); state.tabRev = Date.now();
  if (wasOn) { const n = state.tabs[Math.min(i, state.tabs.length - 1)]; state.tab = n.id; state.symbol = n.s; state.interval = n.i; state.ctype = n.c; tabApply(n); renderIndicators(); countIndicators(); save(); renderTabs(); loadTabChart(); } else { save(); renderTabs(); }
}
function hideTabPrev() { if (tabPrevEl) { tabPrevEl.remove(); tabPrevEl = null; } }
function showTabPrev(el) { // vista previa de la pestaña: moneda, temporalidad, tipo de vela, precio y mini gráfico de 24 h
  const t = state.tabs.find(x => x.id === el.dataset.tab); if (!t) return; hideTabPrev();
  const tk = tickers[t.s], chg = Number(tk && tk.priceChangePercent), px = Number(tk && tk.lastPrice), cty = (CTYPES.find(x => x[0] === t.c) || CTYPES[0])[1];
  const m = document.createElement('div'); m.className = 'tab-prev'; tabPrevEl = m;
  const paint = () => { m.innerHTML = `<div class="tp-h"><b>${esc(base(t.s))}</b><span>${t.i} · ${esc(cty)}</span></div><div class="tp-spark">${sparkSVG(t.s, chg)}</div><div class="tp-f"><span>${Number.isFinite(px) ? fmt(px) : '—'}</span><span class="${chg >= 0 ? 'positive' : 'negative'}">${Number.isFinite(chg) ? pct(chg) : ''}</span></div>`; };
  paint(); document.body.appendChild(m);
  const r = el.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + 'px'; m.style.top = (r.bottom + 6) + 'px';
  if (sparkStale(t.s)) sparkOne(t.s).then(() => { if (tabPrevEl === m) paint(); });
}
{
  const bar = $('#chartTabs'); let hov = 0, lp = 0, lpFired = false;
  bar.addEventListener('click', e => {
    if (lpFired) { lpFired = false; return; }
    const x = e.target.closest('[data-tab-x]'); if (x) { e.stopPropagation(); closeTab(x.dataset.tabX); return; }
    if (e.target.closest('#tabAdd')) { newTab(); return; }
    const t = e.target.closest('[data-tab]'); if (t) switchTab(t.dataset.tab);
  });
  bar.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const t = e.target.closest('[data-tab]'); if (t) { e.preventDefault(); switchTab(t.dataset.tab); } } });
  bar.addEventListener('mouseover', e => { const t = e.target.closest('[data-tab]'); if (!t || e.target.closest('[data-tab-x]')) return; clearTimeout(hov); hov = setTimeout(() => showTabPrev(t), 350); });
  bar.addEventListener('mouseout', () => { clearTimeout(hov); hideTabPrev(); });
  bar.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; const t = e.target.closest('[data-tab]'); if (!t) return; clearTimeout(lp); lpFired = false; lp = setTimeout(() => { lpFired = true; showTabPrev(t); navigator.vibrate?.(8); }, 450); });
  ['pointerup', 'pointercancel', 'pointermove'].forEach(ev => bar.addEventListener(ev, e => { if (ev === 'pointermove' && Math.abs(e.movementX) + Math.abs(e.movementY) < 3) return; clearTimeout(lp); if (ev !== 'pointermove') setTimeout(hideTabPrev, 900); else hideTabPrev(); }));
  bar.addEventListener('contextmenu', e => { // clic derecho en una pestaña: cambiar nombre o cerrar
    const t = e.target.closest('[data-tab]'); if (!t) return; e.preventDefault(); clearTimeout(hov); hideTabPrev(); if (lpFired) return;
    const id = t.dataset.tab, r = t.getBoundingClientRect();
    openMx({left: e.clientX || r.left, top: r.top, bottom: r.bottom, right: e.clientX || r.right}, 'Pestaña',
      `<button type="button" class="mx-it" data-mx="ren">${SVX('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>')}<span>Cambiar nombre</span></button>` + (state.tabs.length > 1 ? `<button type="button" class="mx-it danger" data-mx="close">${SVX('<path d="M6 6l12 12M18 6 6 18"/>')}<span>Cerrar pestaña</span></button>` : ''),
      k => { closeMx(); if (k === 'ren') renameTab(id); else if (k === 'close') closeTab(id); });
  });
}
/* Cambiar el nombre de una pestaña: se escribe ahí mismo (Enter guarda, Esc cancela; vacío = vuelve al nombre de la moneda) */
function renameTab(id, done) {
  const t = state.tabs.find(x => x.id === id); if (!t) return;
  const el = !isDesktop() || done ? null : document.querySelector(`#chartTabs [data-tab="${id}"] .ct-t`);
  const apply = v => { v = String(v || '').trim().slice(0, 24); if (v) t.n = v; else delete t.n; state.tabRev = Date.now(); save(); renderTabs(); if (done) done(); };
  if (!el) { const v = prompt('Nombre de la pestaña (vacío = el de la moneda)', t.n || ''); if (v !== null) apply(v); return; }
  const inp = document.createElement('input'); inp.className = 'ct-ren'; inp.value = t.n || ''; inp.placeholder = base(t.s).replace('/USDT', ''); inp.maxLength = 24; inp.setAttribute('aria-label', 'Nombre de la pestaña');
  el.replaceWith(inp); inp.focus(); inp.select(); let fin = false;
  const end = ok => { if (fin) return; fin = true; if (ok) apply(inp.value); else renderTabs(); };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); end(true); } else if (e.key === 'Escape') { e.preventDefault(); end(false); } });
  inp.addEventListener('blur', () => end(true)); ['click', 'pointerdown', 'dblclick'].forEach(ev => inp.addEventListener(ev, e => e.stopPropagation()));
}
{ const bar = $('#chartTabs'); if (bar) bar.addEventListener('dblclick', e => { const t = e.target.closest('[data-tab]'); if (t && !e.target.closest('[data-tab-x]')) renameTab(t.dataset.tab); }); } // doble clic también cambia el nombre

/* ───────── Menús flotantes (pestañas en el celular, ver/ocultar y borrar) con el liquid glass oscuro de la app ───────── */
const SVX = (d, z = 16) => `<svg viewBox="0 0 24 24" width="${z}" height="${z}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
let mxPop = null, mxAC = null;
function closeMx() { if (mxAC) { mxAC.abort(); mxAC = null; } if (mxPop) { const m = mxPop; mxPop = null; m.classList.add('out'); setTimeout(() => m.remove(), 160); } }
function openMx(at, title, html, onPick) {
  closeMx(); const m = document.createElement('div'); m.className = 'mx-pop'; m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="mx-h">${title}</div><div class="mx-b">${html}</div>`; document.body.appendChild(m); mxPop = m;
  const place = () => { const w = m.offsetWidth, h = m.offsetHeight, below = at.bottom + 8 + h < innerHeight - 8;
    m.style.left = Math.round(clamp(isDesktop() ? at.left : (innerWidth - w) / 2, 8, innerWidth - w - 8)) + 'px';
    m.style.top = Math.round(below ? at.bottom + 8 : Math.max(8, at.top - h - 8)) + 'px'; m.classList.toggle('up', !below); };
  place(); m.mxPlace = place;
  m.addEventListener('click', e => { const b = e.target.closest('[data-mx]'); if (b) { e.stopPropagation(); onPick(b.dataset.mx, b, e); } });
  mxAC = new AbortController(); const sig = {capture: true, signal: mxAC.signal};
  setTimeout(() => { if (!mxAC) return; document.addEventListener('pointerdown', e => { if (!m.contains(e.target)) closeMx(); }, sig); document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMx(); }, sig); addEventListener('resize', closeMx, {signal: mxAC.signal}); });
  return m;
}
const mxFill = (m, html) => { const b = m && m.querySelector('.mx-b'); if (b) { b.innerHTML = html; b.classList.add('quiet'); if (m.mxPlace) m.mxPlace(); } };
/* Indicadores en el gráfico (los mismos que cuenta el botón Indicadores) */
const chartInds = () => Object.keys(state.indicators).filter(k => state.indicators[k] && !k.startsWith('nn') && k !== 'derivs');
const indAnyVisible = () => chartInds().some(k => !(state.stdHide && state.stdHide[k])) || state.pine.some(p => p.on && !p.hide);
const IND_HIDE_KEY = 'cct_indhide_v1';
function setIndsHidden(hide) { // ocultar/mostrar TODOS los indicadores a la vez (siguen activos; al mostrarlos vuelven los que estaban visibles)
  state.stdHide = state.stdHide || {};
  if (hide) {
    const rec = {std: chartInds().filter(k => !state.stdHide[k]), pine: state.pine.filter(p => p.on && !p.hide).map(p => p.sid)};
    rec.std.forEach(k => { state.stdHide[k] = true; }); state.pine.forEach(p => { if (rec.pine.includes(p.sid)) p.hide = true; });
    try { localStorage.setItem(IND_HIDE_KEY, JSON.stringify(rec)); } catch {}
  } else {
    let rec = null; try { rec = JSON.parse(localStorage.getItem(IND_HIDE_KEY) || 'null'); } catch {}
    const okS = k => !rec || !rec.std.length || rec.std.includes(k), okP = sid => !rec || !rec.pine.length || rec.pine.includes(sid);
    let any = false; chartInds().forEach(k => { if (state.stdHide[k] && okS(k)) { delete state.stdHide[k]; any = true; } }); state.pine.forEach(p => { if (p.hide && okP(p.sid)) { delete p.hide; any = true; } });
    if (!any) { state.stdHide = {}; state.pine.forEach(p => { delete p.hide; }); } // si lo guardado ya no aplica, se muestran todos
    try { localStorage.removeItem(IND_HIDE_KEY); } catch {}
  }
  save(); legSig = ''; legStruct = ''; scheduleRender();
}
function clearAllInds() {
  const n = chartInds().length + state.pine.length; if (!n) { toast('No hay indicadores en este gráfico'); return; }
  if (!confirm(`¿Quitar los ${n} indicador${n > 1 ? 'es' : ''} de este gráfico? (tus scripts siguen guardados en Mis indicadores)`)) return;
  chartInds().forEach(k => { if (isCopy(k)) removeCopy(k); else state.indicators[k] = false; }); state.stdHide = {};
  state.pine.forEach(p => { delete pineRes[p.sid]; }); state.pine = [];
  save(); renderIndicators(); countIndicators(); if (candles.length) { calcNova(); calcExtra(); } legSig = ''; legStruct = ''; scheduleRender(); toast('Indicadores quitados del gráfico');
}
const EYE = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', EYE_OFF = '<path d="M3 3l18 18"/><path d="M10.6 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.8C3.6 8.7 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.5-1.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';
const TRASH = '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>';
function visHtml() {
  const dOn = !DOPT.hide, iOn = indAnyVisible(), nd = getDrawings().length, ni = chartInds().length + state.pine.filter(p => p.on).length;
  const row = (k, on, t, n) => `<button type="button" class="mx-it${on ? '' : ' off'}" data-mx="${k}" role="menuitemcheckbox" aria-checked="${on}">${SVX(on ? EYE : EYE_OFF)}<span>${t}</span><em>${on ? 'Visibles' : 'Ocultos'}${n ? ' · ' + n : ''}</em></button>`;
  return row('draw', dOn, 'Dibujos', nd) + row('ind', iOn, 'Indicadores', ni) + `<button type="button" class="mx-it ghost" data-mx="all">${SVX(dOn || iOn ? EYE_OFF : EYE)}<span>${dOn || iOn ? 'Ocultar todo' : 'Mostrar todo'}</span></button>`;
}
function openVisMenu(at) {
  const m = openMx(at, 'Ver u ocultar', visHtml(), k => {
    if (k === 'draw') toggleOpt('hide');
    else if (k === 'ind') setIndsHidden(indAnyVisible());
    else if (k === 'all') { const hide = !DOPT.hide || indAnyVisible(); if (!!DOPT.hide !== hide) toggleOpt('hide'); if (indAnyVisible() === hide) setIndsHidden(hide); }
    mxFill(m, visHtml());
  });
}
function openClearMenu(at) {
  const nd = getDrawings().length, ni = chartInds().length + state.pine.length;
  openMx(at, 'Borrar', `<button type="button" class="mx-it danger" data-mx="draw"${nd ? '' : ' disabled'}>${SVX(TRASH)}<span>Solo los dibujos</span><em>${nd || 'ninguno'}</em></button><button type="button" class="mx-it danger" data-mx="ind"${ni ? '' : ' disabled'}>${SVX(TRASH)}<span>Solo los indicadores</span><em>${ni || 'ninguno'}</em></button>`,
    k => { closeMx(); if (k === 'draw') clearAllDrawings(); else clearAllInds(); });
}
function tabsHtml() {
  tabEnsure();
  return state.tabs.map(t => `<div class="mx-tab${t.id === state.tab ? ' on' : ''}"><button type="button" class="mx-it" data-mx="go:${t.id}">${coinBadge(t.s)}<span>${esc(t.n || base(t.s).replace('/USDT', ''))}</span><em>${t.n ? esc(base(t.s).replace('/USDT', '')) + ' · ' : ''}${t.i}</em></button><button type="button" class="mx-ic" data-mx="ren:${t.id}" aria-label="Cambiar nombre" title="Cambiar nombre">${SVX('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>', 15)}</button>${state.tabs.length > 1 ? `<button type="button" class="mx-ic" data-mx="x:${t.id}" aria-label="Cerrar pestaña" title="Cerrar pestaña">${SVX('<path d="M6 6l12 12M18 6 6 18"/>', 15)}</button>` : ''}</div>`).join('')
    + (state.tabs.length < MAX_TABS ? `<button type="button" class="mx-it ghost" data-mx="new">${SVX('<path d="M12 5v14M5 12h14"/>')}<span>Nueva pestaña</span></button>` : '');
}
function openTabsMenu(at) {
  const m = openMx(at, 'Pestañas', tabsHtml(), k => {
    const [a, id] = k.split(':');
    if (a === 'go') { closeMx(); switchTab(id); }
    else if (a === 'new') { closeMx(); newTab(); }
    else if (a === 'x') { closeTab(id); mxFill(m, tabsHtml()); }
    else if (a === 'ren') renameTab(id, () => mxFill(m, tabsHtml()));
  });
}
{ const at = b => { const r = b.getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, bottom: r.bottom}; };
  const wire = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', e => { e.stopPropagation(); const r = at(b); const v = $('#chartView'); if (v) v.classList.remove('more-open', 'tf-open'); const mb = $('#moreBtn'); if (mb) mb.setAttribute('aria-expanded', 'false'); fn(r); }); };
  wire('#tabsMBtn', openTabsMenu); wire('#visMBtn', openVisMenu); wire('#clearMBtn', openClearMenu); }

/* ───────── Dibujos (anclados a tiempo y precio, guardados por activo) ───────── */
const getDrawings = () => state.drawings[state.symbol] || [];
const setDrawings = arr => { if (arr.length) state.drawings[state.symbol] = arr; else delete state.drawings[state.symbol]; save(); };
function clearTransient() { drawHist.u.length = drawHist.r.length = 0; drawTool = ''; pending = null; pending2 = null; multi = []; preview = null; selectedId = null; cross = null; priceMan = null; updateAutoBtn(); updateDrawUI(); }
const two = (first, second) => p => p ? second : first;
const HINTS = {
  trend: two('Arrastra o toca el primer punto', 'Toca el segundo punto'),
  ray: two('Arrastra o toca el primer punto', 'Toca el segundo punto'),
  arrow: two('Arrastra o toca el inicio de la flecha', 'Toca la punta de la flecha'),
  measure: two('Arrastra o toca el punto de partida', 'Toca el punto final'),
  brush: () => 'Pincel: dibuja con el dedo o el ratón',
  horizontal: () => 'Toca el precio donde quieres la línea',
  vertical: () => 'Toca la vela donde quieres la línea',
  text: () => 'Toca dónde quieres el texto',
  marker: () => 'Toca el máximo o mínimo a marcar',
  rect: two('Arrastra o toca la primera esquina', 'Toca la esquina opuesta'),
  fib: two('Arrastra o toca el inicio del movimiento', 'Toca el final del movimiento'),
  long: two('Arrastra o toca la entrada', 'Toca el objetivo (arriba de la entrada)'),
  short: two('Arrastra o toca la entrada', 'Toca el objetivo (abajo de la entrada)'),
  channel: (p, p2) => p2 ? 'Toca el tercer punto (ancho del canal)' : p ? 'Toca el segundo punto' : 'Arrastra o toca el primer punto',
  fibext: (p, p2) => p2 ? 'Toca el punto del retroceso' : p ? 'Toca el final del movimiento' : 'Arrastra o toca el inicio del movimiento'
};
const TWO = two('Arrastra o toca el primer punto', 'Toca el segundo punto');
Object.assign(HINTS, {
  highlighter: () => 'Resaltador: dibuja con el dedo o el ratón',
  info: TWO, extended: TWO, angle: TWO, fibtime: TWO, fibfan: TWO, fibcircle: TWO, pricerange: TWO, daterange: TWO, ellipse: TWO,
  hray: () => 'Toca el punto donde empieza el rayo', crossline: () => 'Toca el punto donde se cruzan las líneas', note: () => 'Toca dónde va la nota',
  label: () => 'Toca el punto a etiquetar', arrowup: () => 'Toca el punto al que apunta la flecha', arrowdown: () => 'Toca el punto al que apunta la flecha',
  pitchfork: (p, p2) => p2 ? 'Toca el tercer punto' : p ? 'Toca el segundo punto' : 'Arrastra o toca el primer punto (mango)',
  triangle: (p, p2) => p2 ? 'Toca el tercer vértice' : p ? 'Toca el segundo vértice' : 'Arrastra o toca el primer vértice'
});
for (const k of Object.keys(MULTI)) HINTS[k] = () => `Toca el punto ${Math.min(multi.length + 1, MULTI[k].n)} de ${MULTI[k].n}${MULTI[k].labels[multi.length] ? ' (' + MULTI[k].labels[multi.length] + ')' : ''}`;
function startTool(k) { drawTool = k; pending = null; pending2 = null; multi = []; preview = null; selectedId = null; updateDrawUI(); scheduleRender(); }
const BRUSH_COLORS = ['#e9c36e', '#f23645', '#089981', '#548fff', '#ffffff'], BRUSH_W = [2, 4, 7];
function brushOptsHtml() { return `<span id="brushOpts">${BRUSH_COLORS.map(c => `<button class="bsw${state.brush.c === c ? ' on' : ''}" data-bc="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}${BRUSH_W.map(w => `<button class="bw${state.brush.w === w ? ' on' : ''}" data-bw="${w}" aria-label="Grosor ${w}"><i style="height:${w}px"></i></button>`).join('')}</span>`; }
document.addEventListener('click', e => {
  const c = e.target.closest('[data-bc]'), w = e.target.closest('[data-bw]'); if (!c && !w) return;
  if (c) state.brush.c = c.dataset.bc; else state.brush.w = +w.dataset.bw; save(); updateDrawUI();
});
function updateDrawUI() {
  $('#drawHint').hidden = !drawTool;
  { const bo = $('#brushOpts'); if (bo) bo.remove(); $('#cancelDraw').textContent = isBrushTool(drawTool) ? 'Listo' : 'Cancelar'; } // la caja antigua de colores ya no existe: color y grosor están en la barra nueva
  if (drawTool) $('#drawHintText').textContent = (HINTS[drawTool] || HINTS.trend)(pending, pending2);
  $('#deleteDraw').hidden = !selectedId;
  $('#undoDraw').disabled = !drawHist.u.length && !getDrawings().length;
  renderSelBar(); syncHiddenChip(); if (typeof renderFavBar === 'function') renderFavBar();
  $('#chartArea').classList.toggle('drawing', !!drawTool); $('#chartArea').dataset.tool = drawTool;
  syncRail();
}
$('#cancelDraw').onclick = () => { drawTool = ''; pending = null; pending2 = null; multi = []; preview = null; updateDrawUI(); scheduleRender(); };
const drawHist = {u: [], r: []}; // historial de cambios en los dibujos (por símbolo): Ctrl+Z / Ctrl+Y
const snapDraw = () => { drawHist.u.push(JSON.stringify(getDrawings())); if (drawHist.u.length > 60) drawHist.u.shift(); drawHist.r.length = 0; };
function undoDrawing() { if (!drawHist.u.length) { const a = getDrawings(); if (!a.length) { toast('No hay nada que deshacer'); return; } drawHist.r.push(JSON.stringify(a)); setDrawings(a.slice(0, -1)); selectedId = null; updateDrawUI(); render(); return; } drawHist.r.push(JSON.stringify(getDrawings())); setDrawings(JSON.parse(drawHist.u.pop())); selectedId = null; updateDrawUI(); render(); }
function redoDrawing() { if (!drawHist.r.length) { toast('No hay nada que rehacer'); return; } drawHist.u.push(JSON.stringify(getDrawings())); setDrawings(JSON.parse(drawHist.r.pop())); selectedId = null; updateDrawUI(); render(); }
function deleteSelected() { if (!selectedId) return; snapDraw(); setDrawings(getDrawings().filter(x => x.id !== selectedId)); selectedId = null; updateDrawUI(); render(); toast('Dibujo eliminado · Ctrl+Z para recuperarlo'); }
$('#undoDraw').onclick = undoDrawing;
$('#deleteDraw').onclick = deleteSelected;
/* ───────── Barra flotante de propiedades de un dibujo (estilo TradingView) ─────────
   Aparece al crear o tocar un dibujo: plantillas · color · texto · grosor · estilo · ajustes · alerta · bloquear · eliminar · más (clonar, copiar, ocultar…).
   Con el pincel activo (sin trazo seleccionado) muestra color y grosor del pincel. */
const SEL_COLORS = ['#e9c36e', '#f23645', '#089981', '#548fff', '#ffffff', '#b07cff'];
const SB_PAL = [
  ['#ffffff', '#d1d4dc', '#b2b5be', '#868993', '#5d606b', '#434651', '#2a2e39', '#000000'],
  ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#9c27b0'],
  ['#fccbcd', '#ffe0b2', '#fff9c4', '#c8e6c9', '#b2dfdb', '#b2ebf2', '#bbd9fb', '#e1bee7'],
  ['#faa1a4', '#ffcc80', '#fff59d', '#a5d6a7', '#80cbc4', '#80deea', '#90bff9', '#ce93d8'],
  ['#b22833', '#e65100', '#f9a825', '#2e7d32', '#056656', '#00838f', '#1848cc', '#6a1b9a'],
  ['#e9c36e', '#e91e63', '#ff5252', '#69f0ae', '#40c4ff', '#7c4dff', '#ffd54f', '#ff6e40']
];
const SB_NOSTYLE = new Set(['marker', 'arrowup', 'arrowdown', 'flag', 'check', 'xmark', 'star', 'arrowleft', 'arrowright', 'label']); // solo color
const SB_TEXT = new Set(['text', 'note', 'callout']);       // el texto ES el dibujo
const SB_ALERT = new Set(['horizontal', 'hray', 'trend', 'ray', 'extended']); // líneas con un precio al que se puede poner alerta
const SB_LW = [1, 2, 3, 4, 5, 6, 8], SB_BW = [1, 2, 3, 4, 6, 8, 12, 16], SB_TS = [[11, 'S'], [13, 'M'], [16, 'L'], [20, 'XL']];
const SBI = {
  tpl: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><path d="M16.5 13.5v7M13 17h7"/>',
  pen: '<path d="m4 20 1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/><path d="m14.5 6.5 3 3"/>',
  txt: '<path d="M5 6V4.5h14V6M12 4.5V20M9 20h6"/>',
  dots: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
  set: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6"/>',
  alert: '<circle cx="11" cy="13" r="7"/><path d="M11 9.5V13l2.5 1.5M4 5.5 7 3M18 3l3 2.5M18 17v5M15.5 19.5h5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-1.8"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10.5 11v6M13.5 11v6"/>'
};
let selPop = '', selPos = null, drawClip = '', pasteN = 0;
const curDraw = () => selectedId ? getDrawings().find(x => x.id === selectedId) || null : null;
const newDrawId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const sbDefCol = () => cstyle().draw || '#e9c36e';
function patchD(props, snap = true) {
  const d = curDraw(); if (!d) return;
  if (snap) snapDraw();
  let nd = null; setDrawings(getDrawings().map(x => { if (x.id !== d.id) return x; const n = {...x, ...props}; for (const k of Object.keys(props)) if (props[k] == null || props[k] === false) delete n[k]; nd = n; return n; }));
  if (nd) { const {k, ...st} = tplOf(nd); state.lastStyle = {...(state.lastStyle || {}), [k]: nd.type === 'brush' ? (st.o ? {o: st.o} : {}) : st}; save(); } // el próximo dibujo de este tipo sale con esta configuración
  renderSelBar(); render();
}
const sbBrushMode = d => (d && d.type === 'brush') || (!d && isBrushTool(drawTool));
function sbSetColor(c) { const d = curDraw(); if (d) patchD({col: c}); if (sbBrushMode(d)) { state.brush.c = c; save(); } if (!d) updateDrawUI(); }
function sbSetWidth(w) {
  const d = curDraw();
  if (d) patchD(d.type === 'brush' ? {w: d.hl ? w * 3 : w} : {lw: w});
  if (sbBrushMode(d)) { state.brush.w = w; save(); }
  if (!d) updateDrawUI();
}
function sbPrice(d) { // precio de la línea ahora (nivel de la línea en la última vela)
  if (d.type === 'horizontal' || d.type === 'hray') return d.a.p;
  const ia = idxOfTime(d.a.t), ib = idxOfTime(d.b.t); if (ia === ib || !candles.length) return NaN;
  return d.a.p + (d.b.p - d.a.p) * (candles.length - 1 - ia) / (ib - ia);
}
/* Cuenta regresiva del cierre de la vela actual (según la temporalidad) */
function candleCountdown(c) {
  if (!c || !(c.t > 0)) return null; const iv = state.interval; if (!(iv in IV_MS)) return null;
  const end = iv === '1M' ? (() => { const d = new Date(c.t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); })() : c.t + IV_MS[iv], left = end - Date.now();
  return left > -2000 && left <= IV_MS[iv] * 1.01 + 864e5 ? Math.max(0, left) : null; // si la última vela ya está vieja (mercado sin datos), no se muestra
}
function fmtCountdown(ms, secs) {
  const t = Math.floor(ms / 1000), d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), sc = t % 60, p2 = x => String(x).padStart(2, '0');
  if (d > 0) return secs ? `${d}d ${p2(h)}h ${p2(m)}m` : `${d}d ${p2(h)}h`;
  if (h > 0) return secs ? `${h}:${p2(m)}:${p2(sc)}` : `${h}:${p2(m)}`;
  return `${p2(m)}:${p2(sc)}`;
}
setInterval(() => { if (document.visibilityState === 'visible' && candles.length) scheduleRender(); }, 1000);
function sbAlert() {
  const d = curDraw(); if (!d) return;
  if (!SB_ALERT.has(d.type)) { toast('Las alertas se ponen en líneas de precio (horizontal, tendencia, rayo…)'); return; }
  const price = +sbPrice(d).toPrecision(8), last = candles.length ? candles[candles.length - 1].c : NaN, sym = state.symbol;
  if (!(price > 0) || !Number.isFinite(last)) { toast('No se pudo calcular el precio de la línea'); return; }
  if (!/^[A-Z0-9][A-Z0-9_-]{1,24}(@[a-z]{2,12})?$/.test(sym)) { toast('Este activo no admite alertas de precio'); return; }
  if (state.alerts.length >= 50) { toast('Máximo 50 alertas'); return; }
  if (price === last) { toast('El precio ya está en ese nivel'); return; }
  state.alerts.unshift({id: 'al' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), symbol: sym, price, dir: price > last ? 'up' : 'down', on: true, note: ('Línea ' + (d.label || d.text || '')).trim().slice(0, 80), created: Date.now(), firedAt: 0, firedPrice: null});
  alertPrice[sym] = last; save(); renderAlerts(); toast(`Alerta creada en ${fmt(price)}`);
  try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch {}
}
function shiftPoint(q, dx, dy) { const x = X(idxOfTime(q.t)) + dx, y = Y(q.p) + dy; return {...q, t: Math.round(timeOfIdx(IDX(x))), p: +PRICE(y).toPrecision(8)}; }
function dupDrawing(d, dx, dy) {
  const n = JSON.parse(JSON.stringify(d)); n.id = newDrawId(); delete n.lock; delete n.hide;
  if (n.type === 'horizontal') n.a = {t: n.a.t, p: shiftPoint(n.a, 0, dy).p};
  else if (n.type === 'vertical') n.a = {t: shiftPoint(n.a, dx, 0).t, p: n.a.p};
  else if (n.type === 'brush') { n.pts = n.pts.map(([t, p]) => { const m = shiftPoint({t, p}, dx, dy); return [m.t, m.p]; }); n.a = {t: n.pts[0][0], p: n.pts[0][1]}; }
  else { for (const k of ['a', 'b', 'c']) if (n[k]) n[k] = shiftPoint(n[k], dx, dy); if (n.pts) { n.pts = n.pts.map(q => shiftPoint(q, dx, dy)); n.a = n.pts[0]; } }
  return n;
}
function sbAdd(n, msg) { snapDraw(); setDrawings([...getDrawings(), n]); selectedId = n.id; updateDrawUI(); render(); if (msg) toast(msg); }
function sbClone() { const d = curDraw(); if (d && geo) sbAdd(dupDrawing(d, 18, 18), 'Dibujo clonado'); }
function sbCopy() { const d = curDraw(); if (!d) return; drawClip = JSON.stringify(d); pasteN = 0; toast('Dibujo copiado · Ctrl+V o «Pegar» para duplicarlo'); renderSelBar(); }
function sbPaste() { if (!drawClip || !geo) { toast('No hay nada copiado'); return; } pasteN++; sbAdd(dupDrawing(JSON.parse(drawClip), 18 * pasteN, 18 * pasteN), 'Dibujo pegado'); }
function sbOrder(front) { const d = curDraw(); if (!d) return; snapDraw(); const rest = getDrawings().filter(x => x.id !== d.id); setDrawings(front ? [...rest, d] : [d, ...rest]); render(); toast(front ? 'Traído al frente' : 'Enviado al fondo'); }
function sbHide() { const d = curDraw(); if (!d) return; patchD({hide: true}); selectedId = null; updateDrawUI(); render(); toast('Dibujo oculto · toca «ocultos» abajo a la izquierda para mostrarlo'); }
function sbLock() { const d = curDraw(); if (!d) return; patchD({lock: !d.lock}); toast(d.lock ? 'Dibujo desbloqueado' : 'Dibujo bloqueado: no se puede mover'); }
function sbEditText(val) {
  const d = curDraw(); if (!d) return; const v = String(val || '').trim().slice(0, 80);
  if (SB_TEXT.has(d.type)) { if (!v) { toast('El texto no puede quedar vacío'); return; } patchD({text: v}); } else patchD({label: v || null});
}
const tplKind = d => isPos(d) ? 'pos' : d.type === 'brush' && d.hl ? 'highlighter' : d.type;
const tplFits = (t, d) => t.k ? t.k === tplKind(d) || (t.k === 'brush' && d.type === 'brush') : !isPos(d); // las plantillas guardadas antes (sin tipo) valen para todo menos Long/Short
const tplOf = d => { const o = {k: tplKind(d)}; if (isPos(d)) { for (const f of ['gc', 'rc', 'nt', 'no', 'ns', 'nr']) if (d[f] != null) o[f] = d[f]; } if (d.col) o.col = d.col; const w = d.type === 'brush' ? (d.hl ? d.w / 3 : d.w) : d.lw; if (w) o.lw = w; if (d.ds) o.ds = d.ds; if (d.tc) o.tc = d.tc; if (d.ts) o.ts = d.ts; if (d.o) o.o = d.o; return o; };
function sbSaveTpl() {
  const d = curDraw(); if (!d) return; if ((state.drawTpl || []).filter(t => tplFits(t, d)).length >= 12) { toast('Máximo 12 plantillas de este tipo: borra alguna'); return; }
  const n = (prompt('Nombre de la plantilla:', 'Plantilla ' + ((state.drawTpl || []).filter(t => tplFits(t, d)).length + 1)) || '').trim().slice(0, 24); if (!n) return;
  state.drawTpl = [...(state.drawTpl || []), {n, ...tplOf(d)}]; save(); renderSelBar(); toast('Plantilla guardada');
}
function sbApplyTpl(i) {
  const d = curDraw(), t = (state.drawTpl || [])[i]; if (!d || !t) return;
  if (!tplFits(t, d)) return;
  if (isPos(d)) { patchD({col: t.col, lw: t.lw, ds: t.ds, tc: t.tc, ts: t.ts, gc: t.gc, rc: t.rc, nt: t.nt, no: t.no, ns: t.ns, nr: t.nr, o: t.o}); return; }
  patchD(d.type === 'brush' ? {col: t.col, w: Math.round((t.lw || (d.hl ? d.w / 3 : d.w)) * (d.hl ? 3 : 1)), o: t.o} : {col: t.col, lw: t.lw, ds: t.ds, tc: t.tc, ts: t.ts, o: t.o});
  if (d.type === 'brush' && t.col) { state.brush.c = t.col; save(); }
}
const isPos = d => !!d && (d.type === 'long' || d.type === 'short');
function sbResetStyle() { const d = curDraw(); if (!d) return; patchD(d.type === 'brush' ? {col: '#e9c36e', w: d.hl ? 9 : 3, o: null} : {col: null, lw: null, ds: null, tc: null, ts: null, label: null, gc: null, rc: null, nt: null, no: null, ns: null, sp: null, o: null}); }
const posColors = d => `<label class="pp-lbl">Objetivo (ganancia)</label>${sbPal('data-pgc', d.gc || '#089981')}<label class="pp-lbl">Stop (pérdida)</label>${sbPal('data-prc', d.rc || '#f23645')}`;
const posToggles = d => `<label class="pp-lbl">Textos que se muestran</label><div class="pp-col">${[['nt', 'Título (Long / Short)'], ['no', 'Texto del objetivo'], ['ns', 'Texto del stop'], ['nr', 'Tamaño y riesgo (calculadora)']].map(([k, n]) => `<button class="pp-item${d[k] ? '' : ' on'}" data-ptog="${k}"><span class="pp-ic">${d[k] ? '' : I('check', 16)}</span><span>${n}</span></button>`).join('')}</div>`;
const sbSw = (attr, c, cur) => `<button class="pp-sw${String(cur || '').toLowerCase() === c ? ' on' : ''}" ${attr}="${c}" style="background:${c}" aria-label="${c}"></button>`;
const sbMine = (attr, cur) => { const m = window.CCTColors ? CCTColors.get() : []; const ok = /^#[0-9a-f]{6}$/i.test(cur || ''); return `<div class="pp-mine"><div class="pp-mine-h"><span>Mis colores</span>${ok ? `<button type="button" class="pp-mine-add" data-mycol-add="${String(cur).toLowerCase()}" title="Guardar el color actual en Mis colores" aria-label="Guardar el color actual en Mis colores">+</button>` : ''}</div>${m.length ? `<div class="pp-grid">${m.map(c => sbSw(attr, c, cur)).join('')}</div>` : '<small class="pp-mine-e">Guarda hasta 20 colores y aparecerán en todas las paletas.</small>'}</div>`; };
const sbPal = (attr, cur) => `<div class="pp-grid">${SB_PAL.flat().map(c => sbSw(attr, c, cur)).join('')}</div>${sbMine(attr, cur)}<label class="pp-custom">Otro color <input type="color" ${attr}-in value="${/^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#e9c36e'}"></label>`;
const sbLwRow = (list, cur) => `<div class="pp-row">${list.map(w => `<button class="pp-lw${Math.round(cur) === w ? ' on' : ''}" data-pw="${w}"><i style="height:${Math.min(w, 8)}px"></i><span>${w}px</span></button>`).join('')}</div>`;
const sbDsRow = cur => `<div class="pp-col">${[['', 'Línea', ''], ['dash', 'Línea discontinua', '7 5'], ['dot', 'Línea de puntos', '1.5 4']].map(([k, n, da]) => `<button class="pp-item${(cur || '') === k ? ' on' : ''}" data-pd="${k}"><svg width="46" height="8" viewBox="0 0 46 8"><path d="M1 4h44" stroke="currentColor" stroke-width="2" ${da ? `stroke-dasharray="${da}" stroke-linecap="${k === 'dot' ? 'round' : 'butt'}"` : ''}/></svg><span>${n}</span></button>`).join('')}</div>`;
const sbSizeRow = cur => `<div class="pp-row">${SB_TS.map(([s, n]) => `<button class="pp-lw${(cur || 13) === s ? ' on' : ''}" data-pts="${s}"><span>${n}</span></button>`).join('')}</div>`;
function sbTextBlock(d) {
  const isT = SB_TEXT.has(d.type);
  return `<label class="pp-lbl">${isT ? 'Texto' : 'Etiqueta de texto'}</label><div class="pp-row"><input class="pp-input" id="sbTxt" maxlength="80" value="${esc(isT ? d.text || '' : d.label || '')}" placeholder="${isT ? 'Escribe el texto' : 'Añadir texto a este dibujo'}"><button class="pp-ok" data-sb="txtok">OK</button></div>`
    + `<label class="pp-lbl">Color del texto</label>${sbPal('data-ptc', d.tc || (isT && d.type === 'text' ? d.col : ''))}<label class="pp-lbl">Tamaño</label>${sbSizeRow(d.ts)}`;
}
function popHtml(kind, d) {
  const brush = sbBrushMode(d), col = d ? d.col || sbDefCol() : state.brush.c, lw = d ? (d.type === 'brush' ? (d.hl ? d.w / 3 : d.w) : d.lw || 2) : state.brush.w;
  if (kind === 'col') return isPos(d) ? `<div class="pp-title">Colores</div>${posColors(d)}` : `<div class="pp-title">Color</div>${sbPal('data-pc', col)}`;
  if (kind === 'lw') return `<div class="pp-title">Grosor</div>${sbLwRow(brush ? SB_BW : SB_LW, lw)}`;
  if (!d) return '';
  if (kind === 'ds') return `<div class="pp-title">Estilo de línea</div>${sbDsRow(d.ds)}`;
  if (kind === 'txt') return `<div class="pp-title">Texto</div>${isPos(d) ? posToggles(d) : ''}${sbTextBlock(d)}`;
  if (kind === 'tpl') {
    const list = (state.drawTpl || []).map((t, i) => tplFits(t, d) ? `<div class="pp-tpl"><button class="pp-item" data-ptpl="${i}"><i class="pp-dot" style="background:${t.col || sbDefCol()}"></i><span>${esc(t.n)}</span><small>${t.lw || ''}${t.lw ? 'px' : ''}${t.ds ? ' · ' + (t.ds === 'dash' ? 'discont.' : 'puntos') : ''}</small></button><button class="pp-x" data-ptpl-del="${i}" aria-label="Borrar plantilla">×</button></div>` : '').join('');
    return `<div class="pp-title">Plantillas de estilo</div><button class="pp-item" data-sb="tplsave">＋ Guardar el estilo actual como plantilla…</button><button class="pp-item" data-sb="tplreset">↺ Restablecer estilo</button>${list ? '<div class="pp-sep"></div>' + list : '<p class="pp-note">Aún no tienes plantillas. Guarda el estilo de este dibujo para aplicarlo en otros.</p>'}`;
  }
  if (kind === 'set') {
    const noStyle = SB_NOSTYLE.has(d.type) || brush, hasPrice = d.type === 'horizontal' || d.type === 'hray';
    if (isPos(d)) return `<div class="pp-title">Ajustes</div>${posColors(d)}<label class="pp-lbl">Grosor</label>${sbLwRow(SB_LW, lw)}<label class="pp-lbl">Estilo</label>${sbDsRow(d.ds)}${dCfgHtml(d)}${posToggles(d)}${sbTextBlock(d)}`;
    const lvFirst = CCTDrawCfg.has(d, 'lv'); // herramientas con niveles (Fibonacci, Gann…): sus niveles van arriba, que es lo que más se cambia
    return `<div class="pp-title">Ajustes</div>${lvFirst ? dCfgHtml(d) : ''}<label class="pp-lbl">Color</label>${sbPal('data-pc', col)}`
      + (brush ? `<label class="pp-lbl">Grosor</label>${sbLwRow(SB_BW, lw)}` : noStyle ? '' : `<label class="pp-lbl">Grosor</label>${sbLwRow(SB_LW, lw)}<label class="pp-lbl">Estilo</label>${sbDsRow(d.ds)}`)
      + (lvFirst ? '' : dCfgHtml(d))
      + (hasPrice ? `<label class="pp-lbl">Precio</label><div class="pp-row"><input class="pp-input" id="sbPrice" inputmode="decimal" value="${d.a.p}"><button class="pp-ok" data-sb="priceok">OK</button></div>` : '')
      + (brush || SB_NOSTYLE.has(d.type) ? '' : sbTextBlock(d));
  }
  if (kind === 'more') {
    const it = (a, ic, n, k) => `<button class="pp-item" data-sb="${a}"><span class="pp-ic">${ic}</span><span>${n}</span>${k ? `<small>${k}</small>` : ''}</button>`;
    return it('clone', I('layers', 16), 'Clonar', 'Ctrl+D') + it('copy', I('copy', 16), 'Copiar', 'Ctrl+C') + (drawClip ? it('paste', I('clipboard', 16), 'Pegar', 'Ctrl+V') : '') + '<div class="pp-sep"></div>'
      + it('front', I('toTop', 16), 'Traer al frente') + it('back', I('toBottom', 16), 'Enviar al fondo') + '<div class="pp-sep"></div>'
      + it('hide', I('eyeoff', 16), 'Ocultar') + it('lock', I(d.lock ? 'unlock' : 'lock', 16), d.lock ? 'Desbloquear' : 'Bloquear') + '<div class="pp-sep"></div>'
      + it('undo', I('undo', 16), 'Deshacer', 'Ctrl+Z') + it('redo', I('redo', 16), 'Rehacer', 'Ctrl+Y') + it('clear', I('trash', 16), 'Borrar todos los dibujos');
  }
  return '';
}
function sbMoreNoSel() { return `<button class="pp-item" data-sb="undo"><span class="pp-ic">${I('undo', 16)}</span><span>Deshacer</span></button><button class="pp-item" data-sb="redo"><span class="pp-ic">${I('redo', 16)}</span><span>Rehacer</span></button><button class="pp-item" data-sb="clear"><span class="pp-ic">${I('trash', 16)}</span><span>Borrar todos los dibujos</span></button>`; }
function closePop() { selPop = ''; dPpCol = ''; const p = $('#selPop'); if (p) uxOut(p); document.querySelectorAll('#selBar [data-sb].open').forEach(b => b.classList.remove('open')); }
function renderPop() {
  const old = $('#selPop'), bar = $('#selBar'), keepTop = old && old.dataset.k === selPop ? old.scrollTop : 0, again = !!(old && old.dataset.k === selPop); if (old) { if (again) old.remove(); else uxOut(old); } // al cambiar un ajuste el panel se vuelve a dibujar: conserva por dónde ibas
  if (!selPop || !bar) return;
  const d = curDraw(); let html = selPop === 'more' && !d ? sbMoreNoSel() : popHtml(selPop, d); if (!html) { selPop = ''; return; }
  const pop = document.createElement('div'); pop.id = 'selPop'; pop.className = 'pbar-pop' + (again ? ' ux-still' : ''); pop.dataset.k = selPop; pop.innerHTML = html; pop.addEventListener('wheel', e => e.stopPropagation(), {passive: true}); $('#chartArea').appendChild(pop); pop.scrollTop = keepTop; // la rueda del ratón desplaza el panel (no hace zoom al gráfico)
  const btn = bar.querySelector(`[data-sb="${selPop}"]`); if (btn) btn.classList.add('open');
  const ar = $('#chartArea').getBoundingClientRect(), br = (btn || bar).getBoundingClientRect(), below = br.top - ar.top < ar.height / 2;
  pop.style.left = clamp(br.left - ar.left - 4, 6, Math.max(6, ar.width - pop.offsetWidth - 6)) + 'px';
  pop.style.top = clamp(below ? br.bottom - ar.top + 6 : br.top - ar.top - pop.offsetHeight - 6, 6, Math.max(6, ar.height - pop.offsetHeight - 6)) + 'px';
}
const sbIc = (k, s = 20) => SV(SBI[k], s);
function applyBarPos(bar) { if (selPos) { bar.style.left = selPos.x + 'px'; bar.style.top = selPos.y + 'px'; bar.style.bottom = 'auto'; bar.style.transform = 'none'; } }
/* ───────── Ajustes propios de cada herramienta (esquema en draw-cfg.js) ─────────
   El panel «Ajustes» añade, debajo de color/grosor/estilo, lo que solo tiene esa herramienta: niveles de Fibonacci,
   fondo, extensiones, textos… Cada cambio queda como «última configuración» de la herramienta y entra en sus plantillas. */
let dPpCol = '', dRangeSnap = false; // dPpCol: qué color está desplegado ('o:clave' de un ajuste o 'l:nivel')
const dOpt = (d, k) => CCTDrawCfg.get(d, k);
const dLv = d => CCTDrawCfg.levelsOf(d);
const dLvCol = (d, lv, col) => CCTDrawCfg.levelColor(d, lv, col);
function dCfgHtml(d) {
  const S = CCTDrawCfg.schema(d); if (!S.length) return '';
  const base = d.col || (d.type === 'brush' ? '#e9c36e' : sbDefCol()), chk = on => `<span class="pp-ic">${on ? I('check', 16) : ''}</span>`;
  return S.map(f => {
    const v = f.k ? dOpt(d, f.k) : null;
    if (f.t === 'sec') return `<label class="pp-lbl">${f.n}</label>`;
    if (f.t === 'bool') return `<button class="pp-item${v ? ' on' : ''}" data-oo="${f.k}">${chk(v)}<span>${f.n}</span></button>`;
    if (f.t === 'pick') return `<label class="pp-lbl">${f.n}</label><div class="pp-row">${f.opts.map(([x, n]) => `<button class="pp-lw${v === x ? ' on' : ''}" data-ok="${f.k}" data-ov="${x}"><span>${n}</span></button>`).join('')}</div>`;
    if (f.t === 'range') return `<label class="pp-lbl">${f.n} <b id="orv_${f.k}">${v}${f.u}</b></label><input class="pp-range" type="range" data-or="${f.k}" data-u="${f.u}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}">`;
    if (f.t === 'col') { const cur = v || base, open = dPpCol === 'o:' + f.k;
      return `<button class="pp-item${open ? ' open' : ''}" data-ocol="o:${f.k}"><i class="pp-dot" style="background:${cur}"></i><span>${f.n}</span><small>${open ? '▴' : '▾'}</small></button>` + (open ? `<div class="pp-sub">${sbPal('data-opc', cur)}${f.def === '' ? '<button class="pp-item" data-opc="">↺ Igual que el color de línea</button>' : ''}</div>` : ''); }
    if (f.t === 'levels') { const act = dLv(d), all = [...new Set([...f.all, ...act])].sort((a, b) => a - b), open = dPpCol.startsWith('l:') ? +dPpCol.slice(2) : null;
      return `<label class="pp-lbl">${f.n}</label><div class="pp-lvs">${all.map(lv => { const on = act.includes(lv); return `<div class="pp-lv${on ? ' on' : ''}"><button data-olv="${lv}">${chk(on)}<span>${esc(CCTDrawCfg.levelLabel(d, lv))}</span></button><button class="pp-lvc${open === lv ? ' open' : ''}" data-ocol="l:${lv}" style="background:${dLvCol(d, lv, base)}" title="Color de este nivel" aria-label="Color del nivel ${lv}"></button></div>`; }).join('')}</div>`
        + (open != null ? `<div class="pp-sub"><label class="pp-lbl">Color de ${esc(CCTDrawCfg.levelLabel(d, open))}</label>${sbPal('data-opc', dLvCol(d, open, base))}<button class="pp-item" data-opc="">↺ Quitar el color propio</button></div>` : '')
        + (f.custom ? `<div class="pp-row pp-lvadd"><input class="pp-input" id="olvNew" inputmode="decimal" maxlength="8" placeholder="Otro nivel (ej. 0.886)"><button class="pp-ok" data-olvadd="1" aria-label="Añadir nivel">＋</button></div>` : ''); }
    return '';
  }).join('');
}
function dApplyCol(c) { // color elegido en la paleta desplegada: de un ajuste o de un nivel
  const d = curDraw(); if (!d || !dPpCol) return; const key = dPpCol.slice(2);
  if (dPpCol[0] === 'o') { patchD({o: CCTDrawCfg.set(d, key, c || null)}); return; }
  const lk = {...((d.o && d.o.lk) || {})}; if (c) lk[key] = c; else delete lk[key];
  patchD({o: CCTDrawCfg.set(d, 'lk', Object.keys(lk).length ? lk : null)});
}
function dAddLevel() {
  const d = curDraw(), i = $('#olvNew'); if (!d || !i) return; const v = parseFloat(String(i.value).replace(',', '.')), act = dLv(d);
  if (!Number.isFinite(v) || v < -10 || v > 1000) { toast('Escribe un nivel válido (por ejemplo 0.886)'); return; }
  if (act.length >= 24) { toast('Máximo 24 niveles'); return; }
  patchD({o: CCTDrawCfg.set(d, 'lv', [...act, CCTDrawCfg.r4(v)])});
}
document.addEventListener('click', e => {
  const t = e.target.closest('#selPop [data-oo], #selPop [data-ok], #selPop [data-ocol], #selPop [data-opc], #selPop [data-olv], #selPop [data-olvadd]'); if (!t) return;
  const D = t.dataset, d = curDraw(); if (!d) return;
  if (D.oo) { patchD({o: CCTDrawCfg.set(d, D.oo, !dOpt(d, D.oo))}); return; }
  if (D.ok) { const f = CCTDrawCfg.field(d, D.ok), op = f && f.opts.find(x => String(x[0]) === D.ov); if (op) patchD({o: CCTDrawCfg.set(d, D.ok, op[0])}); return; }
  if (D.ocol) { dPpCol = dPpCol === D.ocol ? '' : D.ocol; renderPop(); return; }
  if (D.opc !== undefined) { dApplyCol(D.opc); return; }
  if (D.olv !== undefined) { const lv = +D.olv, f = CCTDrawCfg.field(d, 'lv'), act = dLv(d), nx = act.includes(lv) ? act.filter(x => x !== lv) : [...act, lv]; if (f && nx.length < f.min) { toast('Deja al menos un nivel activo'); return; } patchD({o: CCTDrawCfg.set(d, 'lv', nx)}); return; }
  if (D.olvadd) dAddLevel();
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'olvNew') { e.preventDefault(); dAddLevel(); } });
/* Deslizadores (opacidad…): el dibujo cambia en vivo mientras arrastras; al soltar queda guardado como última configuración */
document.addEventListener('input', e => {
  const i = e.target.closest('#selPop input[data-or]'); if (!i) return; const d = curDraw(); if (!d) return;
  if (!dRangeSnap) { snapDraw(); dRangeSnap = true; }
  const o = CCTDrawCfg.set(d, i.dataset.or, +i.value);
  setDrawings(getDrawings().map(x => { if (x.id !== d.id) return x; const n = {...x}; if (o) n.o = o; else delete n.o; return n; }));
  const b = document.getElementById('orv_' + i.dataset.or); if (b) b.textContent = i.value + (i.dataset.u || ''); scheduleRender();
});
document.addEventListener('change', e => { const i = e.target.closest('#selPop input[data-or]'); if (!i) return; dRangeSnap = false; const d = curDraw(); if (d) patchD({o: d.o || null}, false); });
/* ───────── Calculadora de riesgo ───────── */
const riskCap = () => { const R = state.risk || {}, A = state.acct || {}; return R.cap > 0 ? R.cap : (A.cur > 0 ? A.cur : A.start > 0 ? A.start : 0); };
const usd = v => (Math.abs(v) >= 1000 ? '$' + Math.round(v).toLocaleString('en-US') : '$' + (+v).toFixed(2));
const fmtQty = v => v >= 1000 ? Math.round(v).toLocaleString('en-US') : v >= 1 ? (+v).toFixed(v >= 100 ? 1 : 3) : (+v).toPrecision(3);
function openRisk(d, priceHint) {
  document.querySelectorAll('.rk-back').forEach(x => x.remove());
  const R = state.risk = sanRisk(state.risk), last = candles.length ? candles[candles.length - 1].c : 0, q = d && isPos(d) ? posBox(d) : null, base = symOf(state.symbol).replace(/USDT$|USDC$|USD$/, '');
  const entry0 = q ? q.entry : (priceHint > 0 ? priceHint : last), stop0 = q ? q.stop : +(entry0 * .99).toPrecision(8), tgt0 = q ? q.target : +(entry0 * 1.02).toPrecision(8);
  const m = document.createElement('div'); m.className = 'rk-back';
  const fld = (id, lbl, v, step, suf) => `<label class="rk-f"><span>${lbl}</span><div><input id="${id}" type="number" inputmode="decimal" step="${step || 'any'}" value="${v}">${suf ? `<em>${suf}</em>` : ''}</div></label>`;
  m.innerHTML = `<div class="rk-dlg" role="dialog" aria-label="Calculadora de riesgo"><div class="rk-head"><div><b>Calculadora de riesgo</b><small>${esc(symOf(state.symbol))} · ${q ? (q.entry > q.stop ? 'Long' : 'Short') + ' del dibujo' : 'precio actual'}</small></div><button class="rk-x" type="button" aria-label="Cerrar">✕</button></div>
    <div class="rk-body"><div class="rk-in">
      <div class="rk-sec">Tu cuenta</div>${fld('rkCap', 'Capital', riskCap() || '', 'any', 'USDT')}${fld('rkPct', 'Riesgo por operación', R.pct, '0.1', '%')}
      <div class="rk-lev"><span>Apalancamiento</span><input id="rkLev" type="range" min="1" max="125" step="1" value="${R.lev}"><b id="rkLevV">x${R.lev}</b></div>${fld('rkFee', 'Comisión por lado', R.fee, '0.01', '%')}
      <div class="rk-sec">Operación</div>${fld('rkE', 'Entrada', +entry0.toPrecision(8), 'any')}${fld('rkS', 'Stop loss', +(+stop0).toPrecision(8), 'any')}${fld('rkT', 'Objetivo (opcional)', +(+tgt0).toPrecision(8), 'any')}
    </div><div class="rk-out" id="rkOut"></div></div>
    <div class="rk-foot"><label class="rk-chk"><input type="checkbox" id="rkShow" ${R.show ? 'checked' : ''}> Mostrar el tamaño en los dibujos Long/Short</label><div class="rk-btns">${q ? '<button class="rk-b" data-rk="apply" type="button">Aplicar al dibujo</button>' : ''}<button class="rk-b main" data-rk="save" type="button">Guardar</button></div></div></div>`;
  document.body.appendChild(m);
  const $v = id => parseFloat(String(m.querySelector('#' + id).value).replace(',', '.'));
  const paint = () => {
    m.querySelector('#rkLevV').textContent = 'x' + m.querySelector('#rkLev').value;
    const r = CCTRisk.calc({capital: $v('rkCap'), riskPct: $v('rkPct'), entry: $v('rkE'), stop: $v('rkS'), target: $v('rkT'), leverage: +m.querySelector('#rkLev').value, feePct: $v('rkFee')}), o = m.querySelector('#rkOut');
    if (!r.ok) { o.innerHTML = `<div class="rk-empty">${esc(r.error)}</div>`; return; }
    const big = (l, v, s, c) => `<div class="rk-kpi ${c || ''}"><small>${l}</small><b>${v}</b>${s ? `<em>${s}</em>` : ''}</div>`;
    o.innerHTML = `<div class="rk-side ${r.long ? 'l' : 's'}">${r.long ? 'LONG' : 'SHORT'} · stop a ${r.distPct.toFixed(2)} %</div>`
      + big('Tamaño de la posición', `${fmtQty(r.qty)} ${esc(base)}`, `≈ ${usd(r.notional)} en la operación`, 'hero')
      + `<div class="rk-grid">${big('Margen necesario', usd(r.margin), 'con x' + r.lev)}${big('Pierdes en el stop', '−' + usd(r.loss), 'comisiones incluidas', 'neg')}${r.gain != null ? big('Ganas en el objetivo', '+' + usd(r.gain), 'R:R ' + r.rr.toFixed(2), 'pos') : big('Objetivo', '—', 'sin objetivo')}${big('Liquidación aprox.', fmt(r.liq), 'margen aislado', 'liq')}</div>`
      + (r.warn.length ? `<ul class="rk-warn">${r.warn.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="rk-ok">Todo en orden: el stop está antes de la liquidación y el margen cabe en tu capital.</p>')
      + `<p class="rk-note">Cálculo educativo para futuros con margen aislado (mantenimiento ${(CCTRisk.MMR * 100).toFixed(1)} %). El exchange puede variar un poco. No es asesoría financiera.</p>`;
  };
  m.addEventListener('input', paint); paint();
  const close = () => uxOut(m, 180);
  m.querySelector('.rk-x').onclick = close; m.addEventListener('pointerdown', e => { if (e.target === m) close(); });
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-rk]'); if (!b) return;
    state.risk = sanRisk({pct: $v('rkPct'), lev: +m.querySelector('#rkLev').value, fee: $v('rkFee'), cap: Math.abs($v('rkCap') - ((state.acct || {}).cur || (state.acct || {}).start || 0)) < .005 ? 0 : $v('rkCap'), show: m.querySelector('#rkShow').checked});
    if (b.dataset.rk === 'apply' && d) { const e2 = $v('rkE'), s2 = $v('rkS'), t2 = $v('rkT'); if (e2 > 0 && t2 > 0 && s2 > 0 && (s2 - e2) * (t2 - e2) < 0) patchD({a: {...d.a, p: e2}, b: {...d.b, p: t2}, sp: s2}); else { toast('Revisa entrada, stop y objetivo'); return; } }
    save(); scheduleRender(); close(); toast(b.dataset.rk === 'apply' ? 'Dibujo actualizado con la calculadora' : 'Riesgo guardado');
  });
  setTimeout(() => { const i = m.querySelector(riskCap() ? '#rkS' : '#rkCap'); if (i && deskMQ.matches) i.focus(); }, 50);
}
function renderSelBar() {
  let bar = $('#selBar'); const d = curDraw(), show = !!d || isBrushTool(drawTool);
  if (!show) { if (bar) { bar.removeAttribute('id'); bar.classList.add('pbar-out'); bar.style.pointerEvents = 'none'; setTimeout(() => bar.remove(), 170); } closePop(); return; } // se desvanece al soltar el dibujo
  if (!bar) { bar = document.createElement('div'); bar.id = 'selBar'; bar.className = 'pbar pbar-in'; $('#chartArea').appendChild(bar); setTimeout(() => bar.classList.remove('pbar-in'), 320); } // aparece con animación
  const brush = sbBrushMode(d), col = d ? d.col || sbDefCol() : state.brush.c, lw = d ? (d.type === 'brush' ? (d.hl ? d.w / 3 : d.w) : d.lw || 2) : state.brush.w;
  const line = d && !brush && !SB_NOSTYLE.has(d.type) && !SB_TEXT.has(d.type), canText = d && !brush && !SB_NOSTYLE.has(d.type);
  const b = (k, ic, tip, extra = '') => `<button data-sb="${k}" title="${tip}" aria-label="${tip}" class="${selPop === k ? 'open' : ''}">${extra || ic}</button>`;
  const ul = c => `<i class="sb-ul" style="background:${c}"></i>`;
  bar.innerHTML = '<span class="sb-grip" title="Arrastra para mover la barra" aria-label="Mover barra">⋮⋮</span>'
    + (d ? b('tpl', '', 'Plantillas de estilo', sbIc('tpl')) + '<i class="sb-sep"></i>' : '')
    + b('col', '', isPos(d) ? 'Colores del objetivo y del stop' : 'Color', `<span class="sb-st">${sbIc('pen')}${ul(isPos(d) ? (d.gc || '#089981') : col)}</span>`)
    + (canText ? b('txt', '', SB_TEXT.has(d.type) ? 'Editar texto y su color' : 'Añadir texto y cambiar su color', `<span class="sb-st">${sbIc('txt')}${ul(d.tc || (d.type === 'text' && d.col) || '#2962ff')}</span>`) : '')
    + ((line || brush) ? b('lw', '', 'Grosor', `<i class="sb-ln" style="height:${Math.min(8, Math.max(1, lw))}px"></i><b>${lw}px</b>`) : '')
    + (line ? b('ds', '', 'Estilo de línea', `<svg width="30" height="8" viewBox="0 0 30 8"><path d="M1 4h28" stroke="currentColor" stroke-width="2" ${d.ds === 'dash' ? 'stroke-dasharray="6 4"' : d.ds === 'dot' ? 'stroke-dasharray="1.5 4" stroke-linecap="round"' : 'stroke-dasharray="1.5 4" stroke-linecap="round"'}/></svg>`) : '')
    + (d ? '<i class="sb-sep"></i>' + b('set', '', 'Ajustes', sbIc('set')) : '')
    + (d && SB_ALERT.has(d.type) ? b('alert', '', 'Añadir alerta a esta línea', sbIc('alert')) : '')
    + (isPos(d) ? b('risk', '', 'Calculadora de riesgo: tamaño de la posición', SV('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11v6M8 14h2M12 14h2M8 17h2M12 17h2"/>', 20)) : '')
    + (d ? b('lock', '', d.lock ? 'Desbloquear' : 'Bloquear', sbIc(d.lock ? 'lock' : 'unlock')) + b('del', '', 'Eliminar (Supr)', sbIc('trash')) : '')
    + b('more', '', 'Más opciones', sbIc('dots'));
  bar.classList.toggle('locked', !!(d && d.lock));
  applyBarPos(bar); renderPop();
}
/* Mover la barra arrastrando el asa */
document.addEventListener('pointerdown', e => {
  const gr = e.target.closest('.sb-grip'); if (!gr) return; const bar = $('#selBar'); if (!bar) return; e.preventDefault(); closePop();
  const ar = $('#chartArea').getBoundingClientRect(), br = bar.getBoundingClientRect(), ox = e.clientX - br.left, oy = e.clientY - br.top;
  const mv = ev => { selPos = {x: clamp(ev.clientX - ar.left - ox, 0, Math.max(0, ar.width - br.width)), y: clamp(ev.clientY - ar.top - oy, 0, Math.max(0, ar.height - br.height))}; applyBarPos(bar); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
});
document.addEventListener('pointerdown', e => { if (selPop && !e.target.closest('.pbar, .pbar-pop')) closePop(); }, true);
document.addEventListener('click', e => {
  const t = e.target.closest('#selBar [data-sb], #selPop [data-sb], #selPop [data-pc], #selPop [data-ptc], #selPop [data-pgc], #selPop [data-prc], #selPop [data-ptog], #selPop [data-pw], #selPop [data-pd], #selPop [data-pts], #selPop [data-ptpl], #selPop [data-ptpl-del]'); if (!t) return;
  const D = t.dataset, keep = selPop === 'set' || selPop === 'txt' || (selPop === 'col' && isPos(curDraw())), done = () => { if (!keep) closePop(); }; // color, grosor, estilo y plantilla se cierran al elegir; Texto y Ajustes siguen abiertos
  if (D.pc) { sbSetColor(D.pc); done(); return; }
  if (D.ptc) { patchD({tc: D.ptc}); return; }
  if (D.pgc) { patchD({gc: D.pgc}); return; } if (D.prc) { patchD({rc: D.prc}); return; }
  if (D.ptog) { const d = curDraw(); if (d) patchD({[D.ptog]: !d[D.ptog]}); return; }
  if (D.pw) { sbSetWidth(+D.pw); done(); return; }
  if (D.pd !== undefined) { patchD({ds: D.pd || null}); done(); return; }
  if (D.pts) { patchD({ts: +D.pts}); return; }
  if (D.ptpl !== undefined) { sbApplyTpl(+D.ptpl); done(); return; }
  if (D.ptplDel !== undefined) { state.drawTpl = (state.drawTpl || []).filter((_, i) => i !== +D.ptplDel); save(); renderSelBar(); return; }
  const k = D.sb;
  if (['tpl', 'col', 'txt', 'lw', 'ds', 'set', 'more'].includes(k)) { selPop = selPop === k ? '' : k; if (!selPop) closePop(); else renderPop(); return; }
  if (k === 'txtok') { sbEditText($('#sbTxt').value); return; }
  if (k === 'priceok') { const v = parseFloat(String($('#sbPrice').value).replace(',', '.')), d = curDraw(); if (d && v > 0) patchD({a: {...d.a, p: v}}); else toast('Escribe un precio válido'); return; }
  if (k === 'tplsave') { sbSaveTpl(); return; } if (k === 'tplreset') { sbResetStyle(); return; }
  if (k === 'risk') { closePop(); openRisk(curDraw()); return; }
  if (k === 'alert') { sbAlert(); return; } if (k === 'lock') { sbLock(); return; } if (k === 'del') { closePop(); deleteSelected(); return; }
  if (k === 'clone') { sbClone(); closePop(); return; } if (k === 'copy') { sbCopy(); closePop(); return; } if (k === 'paste') { sbPaste(); closePop(); return; }
  if (k === 'front') { sbOrder(true); closePop(); return; } if (k === 'back') { sbOrder(false); closePop(); return; } if (k === 'hide') { closePop(); sbHide(); return; }
  if (k === 'undo') undoDrawing(); else if (k === 'redo') redoDrawing();
  else if (k === 'clear') { closePop(); if (!getDrawings().length) return toast('No hay dibujos'); if (confirm('¿Borrar todos los dibujos de este gráfico? (Ctrl+Z los recupera)')) { snapDraw(); setDrawings([]); selectedId = null; updateDrawUI(); render(); } }
});
document.addEventListener('change', e => { const i = e.target.closest('#selPop input[type=color]'); if (!i) return; if (i.hasAttribute('data-pc-in')) sbSetColor(i.value); else if (i.hasAttribute('data-ptc-in')) patchD({tc: i.value}); else if (i.hasAttribute('data-pgc-in')) patchD({gc: i.value}); else if (i.hasAttribute('data-prc-in')) patchD({rc: i.value}); else if (i.hasAttribute('data-opc-in')) dApplyCol(i.value); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'sbTxt') { e.preventDefault(); sbEditText(e.target.value); } else if (e.key === 'Enter' && e.target.id === 'sbPrice') { e.preventDefault(); document.querySelector('#selPop [data-sb="priceok"]').click(); } });
document.addEventListener('keydown', e => { // atajos de escritorio: copiar / pegar / clonar
  if (!(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || currentView !== 'chartView') return;
  const k = e.key.toLowerCase();
  if (k === 'c' && curDraw()) { e.preventDefault(); sbCopy(); } else if (k === 'v' && drawClip) { e.preventDefault(); sbPaste(); } else if (k === 'd' && curDraw()) { e.preventDefault(); sbClone(); }
});
/* Chip «N ocultos» para volver a mostrar los dibujos ocultos uno a uno desde la barra */
function syncHiddenChip() {
  const n = getDrawings().filter(x => x.hide).length; let c = $('#showHidden');
  if (!n) { if (c) c.remove(); return; }
  if (!c) { c = document.createElement('button'); c.id = 'showHidden'; c.className = 'pbar-hidden'; c.onclick = () => { snapDraw(); setDrawings(getDrawings().map(({hide, ...r}) => r)); updateDrawUI(); render(); toast('Dibujos visibles otra vez'); }; $('#chartArea').appendChild(c); }
  c.innerHTML = `${I('eye', 14)} ${n} oculto${n > 1 ? 's' : ''} · mostrar`;
}

/* ───────── Barra izquierda de herramientas de dibujo (escritorio, estilo TradingView) ───────── */
const RAIL_KEY = 'cct_railLast_v1';
let railLast = {}; try { railLast = JSON.parse(lsGet(RAIL_KEY) || '{}') || {}; } catch {}
const groupOf = k => TOOL_GROUPS.find(gr => gr.tools.some(t => t[0] === k));
const toolOf = k => { for (const gr of TOOL_GROUPS) { const t = gr.tools.find(x => x[0] === k); if (t) return t; } return null; };
const lastOf = gr => (railLast[gr.id] && gr.tools.some(t => t[0] === railLast[gr.id])) ? railLast[gr.id] : gr.tools[0][0];
const RAIL_OPTS = [['magnet', 'Imán: ajusta a máximo, mínimo, apertura y cierre', IC.magnet], ['stay', 'Mantener la herramienta activa después de dibujar', IC.keep], ['lock', 'Bloquear dibujos (no se seleccionan ni se mueven)', IC.lock], ['hide', 'Ver u ocultar dibujos e indicadores', IC.eye], ['clear', 'Borrar dibujos o indicadores', IC.trash]];
function buildRail() {
  const rail = $('#toolRail'); if (!rail) return;
  rail.innerHTML = `<button class="rail-btn grp" data-rail="cursor" title="Cursor (Esc)" aria-label="Cursor">${SV(CURSOR_IC[cstyle().cursor] || CURSOR_IC.Cruz)}<i class="caret" data-curfly="1" title="Elegir cursor: cruz, flecha o estrella"></i></button><div class="rail-sep"></div>`
    + (FAVS.length ? favTools().map(t => `<button class="rail-btn fav" data-ftool="${t[0]}" title="${esc(t[1])} (favorito)" aria-label="${esc(t[1])}">${SV(t[3])}</button>`).join('') + `<div class="rail-sep"></div>` : '')
    + TOOL_GROUPS.map(gr => { const t = toolOf(lastOf(gr)); return `<button class="rail-btn grp" data-group="${gr.id}" data-last="${t[0]}" title="${esc(t[1])}" aria-label="${esc(gr.name)}">${SV(t[3])}<i class="caret" data-fly="${gr.id}" title="${esc(gr.name)}: ver todas"></i></button>`; }).join('')
    + `<div class="rail-spacer"></div><div class="rail-sep"></div>`
    + RAIL_OPTS.map(([k, t, ic]) => `<button class="rail-btn" data-opt="${k}" title="${esc(t)}" aria-label="${esc(t)}">${SV(ic)}</button>`).join('');
  syncRail();
}
function syncRail() {
  const rail = $('#toolRail'); if (!rail || !rail.firstChild) return;
  const cg = drawTool ? groupOf(drawTool) : null;
  rail.querySelector('[data-rail="cursor"]').classList.toggle('on', !drawTool);
  rail.querySelectorAll('[data-ftool]').forEach(b => b.classList.toggle('on', drawTool === b.dataset.ftool));
  rail.querySelectorAll('[data-group]').forEach(b => {
    const gr = TOOL_GROUPS.find(x => x.id === b.dataset.group), active = !!cg && cg.id === gr.id, k = active ? drawTool : lastOf(gr), t = toolOf(k);
    b.classList.toggle('on', active);
    if (b.dataset.last !== k || !b.querySelector('svg')) { b.dataset.last = k; const old = b.querySelector('svg'); if (old) old.outerHTML = SV(t[3]); }
    b.title = t[1];
  });
  rail.querySelectorAll('[data-opt]').forEach(b => { const k = b.dataset.opt; if (k === 'clear') return; b.classList.toggle('on', !!DOPT[k]); if (k === 'hide') { const want = DOPT.hide ? IC.eyeoff : IC.eye; if (b.dataset.ic !== (DOPT.hide ? '1' : '0')) { b.dataset.ic = DOPT.hide ? '1' : '0'; b.querySelector('svg').outerHTML = SV(want); } } });
}
function closeFly() { const f = $('#railFly'); if (f) uxOut(f); }
function openFly(id, btn) {
  const old = $('#railFly'); if (old) { const same = old.dataset.g === id; if (same) { uxOut(old); return; } old.remove(); }
  const gr = TOOL_GROUPS.find(x => x.id === id); if (!gr) return;
  const f = document.createElement('div'); f.id = 'railFly'; f.className = 'rail-fly'; f.dataset.g = id;
  f.innerHTML = `<h4>${esc(gr.name)}</h4>` + gr.tools.map(([k, t, d, ic]) => `<button data-rtool="${k}" title="${esc(d)}" class="${drawTool === k ? 'on' : ''}"><span class="ti">${SV(ic, 20)}</span><span class="tn">${esc(t)}</span>${starBtn(k)}</button>`).join('');
  document.body.appendChild(f);
  const r = btn.getBoundingClientRect(); f.style.left = (r.right + 6) + 'px'; f.style.top = Math.max(8, Math.min(innerHeight - f.offsetHeight - 8, r.top)) + 'px';
}
const CURSOR_IC = {Cruz: '<path d="M12 3v7M12 14v7M3 12h7M14 12h7"/>', Flecha: IC.cursor, Estrella: '<path d="M12 3c.6 4.6 1.4 5.4 6 6-4.6.6-5.4 1.4-6 6-.6-4.6-1.4-5.4-6-6 4.6-.6 5.4-1.4 6-6z"/><path d="M18.5 15.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z"/>'};
const CURSOR_TXT = {Cruz: ['Cruz', 'Retícula con líneas de precio y tiempo'], Flecha: ['Flecha', 'Puntero normal, sin líneas'], Estrella: ['Estrella', 'Estrella galáctica que deja estela al mantener presionado']};
let curModeShown = '';
function syncCursorMode(m) { // aplica el tipo de cursor al gráfico (clases CSS + lienzo de la estrella) y al botón de la barra izquierda
  m = CURSOR_MODES.includes(m) ? m : 'Cruz'; if (m === curModeShown) return; curModeShown = m;
  try { window.CCTStarCursor && CCTStarCursor.setMode(m); } catch {}
  const b = document.querySelector('#toolRail [data-rail="cursor"]'); if (b) { const old = b.querySelector('svg'); if (old) old.outerHTML = SV(CURSOR_IC[m]); b.title = `Cursor: ${CURSOR_TXT[m][0]} (Esc)`; }
}
function setCursorMode(m) { if (!CURSOR_MODES.includes(m)) return; state.chartStyle = sanChartStyle(Object.assign({}, state.chartStyle || {}, {cursor: m})); if (m === 'Cruz') delete state.chartStyle.cursor; save(); cancelTool(); syncCursorMode(m); scheduleRender(); toast(`Cursor: ${CURSOR_TXT[m][0]}`); }
function openCurFly(btn) {
  const old = $('#railFly'); if (old) { const same = old.dataset.g === 'cursor'; if (same) { uxOut(old); return; } old.remove(); }
  const cur = cstyle().cursor || 'Cruz', f = document.createElement('div'); f.id = 'railFly'; f.className = 'rail-fly'; f.dataset.g = 'cursor';
  f.innerHTML = `<h4>Cursor</h4>` + CURSOR_MODES.map(k => `<button data-cur="${k}" title="${esc(CURSOR_TXT[k][1])}" class="${cur === k ? 'on' : ''}"><span class="ti">${SV(CURSOR_IC[k], 20)}</span><span class="tn">${esc(CURSOR_TXT[k][0])}<small class="cur-sub">${esc(CURSOR_TXT[k][1])}</small></span></button>`).join('');
  document.body.appendChild(f);
  const r = btn.getBoundingClientRect(); f.style.left = (r.right + 6) + 'px'; f.style.top = Math.max(8, Math.min(innerHeight - f.offsetHeight - 8, r.top)) + 'px';
}
function pickTool(k) {
  const gr = groupOf(k); if (!gr) return;
  railLast[gr.id] = k; try { localStorage.setItem(RAIL_KEY, JSON.stringify(railLast)); } catch {}
  if (DOPT.hide) { DOPT.hide = false; saveDopt(); render(); }
  startTool(k);
}
function cancelTool() { drawTool = ''; pending = null; pending2 = null; multi = []; preview = null; updateDrawUI(); scheduleRender(); }
/* ───────── Barra flotante permanente de herramientas favoritas (estilo TradingView) ─────────
   Muestra tus favoritas (★) siempre a mano sobre el gráfico: se mueve arrastrando el asa y con clic derecho se oculta;
   para mostrarla otra vez, clic derecho sobre el gráfico. Posición, visibilidad y favoritas se guardan en tu cuenta. Solo en computadora. */
function placeFavBar() {
  const bar = $('#favBar'), ar = $('#chartArea'); if (!bar || !ar) return;
  if (!deskMQ.matches) { placeFab(); return; } // celular: el botón estrella se mueve libremente y la barra se abre a su lado
  if (FB.x == null || FB.y == null) { bar.style.left = '50%'; bar.style.top = 'auto'; bar.style.bottom = '50px'; bar.style.transform = 'translateX(-50%)'; return; }
  const aw = ar.clientWidth, ah = ar.clientHeight, bw = bar.offsetWidth, bh = bar.offsetHeight;
  bar.style.transform = 'none'; bar.style.bottom = 'auto';
  bar.style.left = clamp(FB.x * Math.max(0, aw - bw), 0, Math.max(0, aw - bw)) + 'px'; bar.style.top = clamp(FB.y * Math.max(0, ah - bh), 0, Math.max(0, ah - bh)) + 'px';
}
const FAB = 44, FAB_GAP = 8;
function placeFab() { // coloca el botón estrella (fracciones mx,my) y abre la barra al lado donde cabe
  const bar = $('#favBar'), fab = $('#favFab'), ar = $('#chartArea'); if (!bar || !ar) return;
  if (!fab) { // celular: la barra sale justo arriba de la píldora
    const pb = $('#favPillBtn'), ab = ar.getBoundingClientRect(), r = pb ? pb.getBoundingClientRect() : null, bw = bar.offsetWidth, bh = bar.offsetHeight || 44;
    const cx = r ? r.left + r.width / 2 - ab.left : 20, up = !r || (r.top - ab.top) > ar.clientHeight / 2;
    bar.style.left = clamp(cx - bw / 2, 8, Math.max(8, ar.clientWidth - bw - 8)) + 'px'; bar.style.bottom = 'auto';
    bar.style.top = clamp(r ? (up ? r.top - ab.top - bh - 8 : r.bottom - ab.top + 8) : ar.clientHeight - bh - 8, 8, Math.max(8, ar.clientHeight - bh - 8)) + 'px';
    bar.style.transformOrigin = up ? 'center bottom' : 'center top'; bar.style.setProperty('--fb-from', '0px'); return;
  }
  const aw = ar.clientWidth, ah = ar.clientHeight, mw = Math.max(0, aw - FAB), mh = Math.max(0, ah - FAB);
  const fx = FB.mx == null ? 10 : clamp(FB.mx * mw, 0, mw), fy = FB.my == null ? Math.max(0, ah - FAB - 84) : clamp(FB.my * mh, 0, mh);
  fab.style.left = fx + 'px'; fab.style.top = fy + 'px'; fab.style.bottom = 'auto';
  const bw = bar.offsetWidth, bh = bar.offsetHeight || 44; let bx, by = clamp(fy + (FAB - bh) / 2, 8, Math.max(8, ah - bh - 8)), origin = 'left center';
  if (fx + FAB + FAB_GAP + bw <= aw - 8) bx = fx + FAB + FAB_GAP;
  else if (fx - FAB_GAP - bw >= 8) { bx = fx - FAB_GAP - bw; origin = 'right center'; }
  else { bx = clamp(fx + FAB / 2 - bw / 2, 8, Math.max(8, aw - bw - 8)); by = fy > ah / 2 ? fy - bh - FAB_GAP : fy + FAB + FAB_GAP; origin = fy > ah / 2 ? 'center bottom' : 'center top'; }
  bar.style.left = bx + 'px'; bar.style.top = by + 'px'; bar.style.bottom = 'auto'; bar.style.transformOrigin = origin;
  bar.style.setProperty('--fb-from', origin.startsWith('right') ? '14px' : origin.startsWith('left') ? '-14px' : '0px');
}
let fbOpen = false; // celular: la barra va plegada tras un botón flotante con una estrella
function setFbOpen(v) { fbOpen = !!v; const pb = $('#favPillBtn'); if (pb) { pb.classList.toggle('on', fbOpen); pb.setAttribute('aria-expanded', String(fbOpen)); } const b = $('#favBar'), f = $('#favFab'); if (b) { b.classList.toggle('open', fbOpen); b.inert = !fbOpen; } if (f) { f.classList.toggle('open', fbOpen); f.setAttribute('aria-expanded', String(fbOpen)); } }
function wireFab(fab) { // mantener presionado = el botón se "agarra" y se puede mover · toque corto = abrir/cerrar
  let st = null;
  const arm = () => { if (!st || st.moved) return; st.armed = true; fab.classList.add('drag'); if (fbOpen) setFbOpen(false); navigator.vibrate?.(10); };
  fab.addEventListener('pointerdown', e => { if (e.button) return; const ar = $('#chartArea'), r = fab.getBoundingClientRect(), a = ar.getBoundingClientRect(); st = {x: e.clientX, y: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, a, armed: false, moved: false, id: e.pointerId, t: setTimeout(arm, 350)}; try { fab.setPointerCapture(e.pointerId); } catch {} });
  fab.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.armed) { if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) { clearTimeout(st.t); st.cancel = true; } return; } // se movió antes de tiempo: no es mantener presionado
    st.moved = true;
    const ar = $('#chartArea'), mw = ar.clientWidth - FAB, mh = ar.clientHeight - FAB;
    FB.mx = mw > 0 ? clamp((e.clientX - st.a.left - st.ox) / mw, 0, 1) : 0; FB.my = mh > 0 ? clamp((e.clientY - st.a.top - st.oy) / mh, 0, 1) : 0; placeFab();
  });
  const end = e => { if (!st || e.pointerId !== st.id) return; clearTimeout(st.t); const s0 = st; st = null; fab.classList.remove('drag'); try { fab.releasePointerCapture(e.pointerId); } catch {}
    if (s0.moved) syncUi(); else if (!s0.armed && !s0.cancel && e.type === 'pointerup') { setFbOpen(!fbOpen); placeFab(); } };
  fab.addEventListener('pointerup', end); fab.addEventListener('pointercancel', end);
  fab.addEventListener('contextmenu', e => e.preventDefault());
  fab.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFbOpen(!fbOpen); placeFab(); } });
}
function renderFavBar() {
  const ar = $('#chartArea'); if (!ar) return; let bar = $('#favBar'), fab = $('#favFab');
  const on = !PANE && FB.show, mob = !deskMQ.matches;
  if (!on) { if (bar) bar.remove(); if (fab) fab.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'favBar'; bar.className = 'favbar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Herramientas favoritas'); ar.appendChild(bar); }
  if (fab && mob) { fab.remove(); fab = null; } // celular: la estrella vive en la píldora de abajo (#favPillBtn)
  if (false) { fab = document.createElement('button'); fab.id = 'favFab'; fab.type = 'button'; fab.className = 'fav-fab'; fab.title = 'Herramientas favoritas'; fab.setAttribute('aria-label', 'Herramientas favoritas'); fab.setAttribute('aria-expanded', 'false'); fab.innerHTML = I('star', 22); ar.appendChild(fab); wireFab(fab); }
  if (!mob && fab) { fab.remove(); fab = null; }
  bar.classList.toggle('fb-mobile', mob);
  const tools = favTools();
  bar.innerHTML = (mob ? '' : '<span class="fb-grip" title="Arrastra para mover · clic derecho: ocultar" aria-label="Mover barra"><svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><g fill="currentColor"><circle cx="2.5" cy="3" r="1.2"/><circle cx="7.5" cy="3" r="1.2"/><circle cx="2.5" cy="8" r="1.2"/><circle cx="7.5" cy="8" r="1.2"/><circle cx="2.5" cy="13" r="1.2"/><circle cx="7.5" cy="13" r="1.2"/></g></svg></span>')
    + (tools.length ? tools.map(t => `<button type="button" class="fb-btn${drawTool === t[0] ? ' on' : ''}" data-fav-tool="${t[0]}" title="${esc(t[1])}" aria-label="${esc(t[1])}">${SV(t[3], 22)}</button>`).join('') : '<span class="fb-empty">Marca ★ en las herramientas para tenerlas aquí</span>');
  if (mob) { setFbOpen(fbOpen); if (fab) fab.classList.toggle('active', !!drawTool); const pb = $('#favPillBtn'); if (pb) pb.classList.toggle('active', !!drawTool); placeFab(); } else { bar.classList.remove('open'); bar.inert = false; }
  placeFavBar();
}
function setFavBar(show) { FB.show = !!show; syncUi(); renderFavBar(); toast(FB.show ? 'Barra de favoritos visible' : 'Barra de favoritos oculta · clic derecho sobre el gráfico para mostrarla'); }
{
  const ar = $('#chartArea');
  ar.addEventListener('click', e => { const b = e.target.closest('[data-fav-tool]'); if (!b) return; const k = b.dataset.favTool; if (!deskMQ.matches) setFbOpen(false); if (drawTool === k) cancelTool(); else pickTool(k); });
  ar.addEventListener('pointerdown', e => { if (fbOpen && !deskMQ.matches && !e.target.closest('#favBar, #favFab')) setFbOpen(false); }, true); // tocar el gráfico pliega la barra
  ar.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; const gr = e.target.closest('.fb-grip'); if (!gr) return; const bar = $('#favBar'); if (!bar) return; e.preventDefault();
    const r = ar.getBoundingClientRect(), br = bar.getBoundingClientRect(), ox = e.clientX - br.left, oy = e.clientY - br.top;
    const mv = ev => { const aw = ar.clientWidth - bar.offsetWidth, ah = ar.clientHeight - bar.offsetHeight; FB.x = aw > 0 ? clamp((ev.clientX - r.left - ox) / aw, 0, 1) : 0; FB.y = ah > 0 ? clamp((ev.clientY - r.top - oy) / ah, 0, 1) : 0; placeFavBar(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); syncUi(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
  ar.addEventListener('contextmenu', e => {
    { const fb = $('#favBar'), q = fb && fb.getBoundingClientRect(); if (!e.target.closest('#favBar') && !(q && e.clientX >= q.left && e.clientX <= q.right && e.clientY >= q.top && e.clientY <= q.bottom)) return; } e.preventDefault(); e.stopImmediatePropagation();
    document.querySelectorAll('.chart-ctx').forEach(x => x.remove());
    const m = document.createElement('div'); m.className = 'pop-menu chart-ctx';
    m.innerHTML = `<button data-a="hide">${I('eyeoff', 16)}<span>Ocultar barra de favoritos</span></button><button data-a="pos">${I('reset', 16)}<span>Volver a su lugar</span></button>`;
    document.body.appendChild(m); m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, e.clientX)) + 'px'; m.style.top = Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, e.clientY)) + 'px';
    const close = () => { uxOut(m); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); }, away = ev => { if (!m.contains(ev.target)) close(); }, esc = ev => { if (ev.key === 'Escape') close(); };
    setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', esc, true); });
    m.onclick = ev => { const b = ev.target.closest('[data-a]'); if (!b) return; close(); if (b.dataset.a === 'hide') setFavBar(false); else { FB.x = FB.y = null; syncUi(); placeFavBar(); } };
  }, true);
  { let lp = null; // celular: mantener presionado el asa abre el mismo menú
    ar.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' || !e.target.closest('.fb-grip')) return; const x = e.clientX, y = e.clientY; clearTimeout(lp); lp = setTimeout(() => { lp = null; ar.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: x, clientY: y})); }, 600); });
    ['pointermove', 'pointerup', 'pointercancel'].forEach(t => addEventListener(t, () => { if (lp) { clearTimeout(lp); lp = null; } }));
  }
  window.addEventListener('resize', () => { renderFavBar(); });
  deskMQ.addEventListener && deskMQ.addEventListener('change', renderFavBar);
}
function clearAllDrawings() {
  if (!getDrawings().length) { toast('No hay dibujos en este gráfico'); return; }
  if (confirm('¿Borrar todos los dibujos de este gráfico? (Ctrl+Z los recupera)')) { snapDraw(); setDrawings([]); selectedId = null; updateDrawUI(); render(); }
}
const OPT_MSG = {magnet: ['Imán desactivado', 'Imán activado: se ajusta a máximos, mínimos y cierres'], stay: ['La herramienta se desactiva tras dibujar', 'Herramienta fija: sigue activa tras dibujar'], lock: ['Dibujos desbloqueados', 'Dibujos bloqueados: no se pueden seleccionar'], hide: ['Dibujos visibles', 'Dibujos ocultos']};
function toggleOpt(k) {
  if (k === 'clear') { clearAllDrawings(); return; }
  DOPT[k] = !DOPT[k]; saveDopt();
  if (k === 'lock' && DOPT.lock) { selectedId = null; updateDrawUI(); }
  if (k === 'hide' && DOPT.hide) { selectedId = null; updateDrawUI(); }
  syncRail(); render(); toast(OPT_MSG[k][DOPT[k] ? 1 : 0]);
}
(() => {
  const rail = $('#toolRail'); if (!rail) return;
  rail.addEventListener('click', e => {
    const fav = e.target.closest('[data-ftool]'); if (fav) { closeFly(); pickTool(fav.dataset.ftool); return; }
    const cav = e.target.closest('[data-fly]'), grp = e.target.closest('[data-group]'), opt = e.target.closest('[data-opt]');
    if (e.target.closest('[data-curfly]')) { openCurFly(e.target.closest('.rail-btn')); return; }
    if (cav) { openFly(cav.dataset.fly, cav.closest('.rail-btn')); return; }
    closeFly();
    if (grp) { pickTool(grp.dataset.last); return; }
    if (opt) { const k = opt.dataset.opt; if (k === 'clear' || k === 'hide') { const r = opt.getBoundingClientRect(); (k === 'clear' ? openClearMenu : openVisMenu)({left: r.right + 10, right: r.right, top: r.bottom, bottom: r.top - 8}); return; } toggleOpt(k); return; } // ojo y basura: menú con dibujos / indicadores
    if (e.target.closest('[data-rail="cursor"]')) cancelTool();
  });
  rail.addEventListener('contextmenu', e => { if (e.target.closest('[data-rail="cursor"]')) { e.preventDefault(); openCurFly(e.target.closest('.rail-btn')); return; } const grp = e.target.closest('[data-group]'); if (!grp) return; e.preventDefault(); openFly(grp.dataset.group, grp); });
  document.addEventListener('click', e => {
    const stf = e.target.closest('#railFly [data-star]'); if (stf) { e.stopPropagation(); toggleFav(stf.dataset.star); return; }
    const cu = e.target.closest('#railFly [data-cur]'); if (cu) { closeFly(); setCursorMode(cu.dataset.cur); return; }
    const it = e.target.closest('#railFly [data-rtool]'); if (it) { const k = it.dataset.rtool; closeFly(); pickTool(k); return; }
    if (!e.target.closest('#railFly,#toolRail')) closeFly();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFly(); });
  window.addEventListener('resize', closeFly);
})();

function idxOfTime(t) {
  const n = candles.length; if (!n) return 0; const iv = IV_MS[state.interval];
  if (t <= candles[0].t) return (t - candles[0].t) / iv;
  if (t >= candles[n - 1].t) return n - 1 + (t - candles[n - 1].t) / iv;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (candles[m].t <= t) lo = m; else hi = m; }
  return lo + (t - candles[lo].t) / (candles[lo + 1].t - candles[lo].t);
}
function timeOfIdx(i) {
  const n = candles.length, iv = IV_MS[state.interval];
  if (i <= 0) return candles[0].t + i * iv;
  if (i >= n - 1) return candles[n - 1].t + (i - (n - 1)) * iv;
  const lo = Math.floor(i); return candles[lo].t + (i - lo) * (candles[lo + 1].t - candles[lo].t);
}
const X = i => geo.left + (i - geo.start + .5) * geo.step;
const IDX = x => (x - geo.left) / geo.step + geo.start - .5;
const Y = p => geo.plotTop + (geo.max - p) / (geo.max - geo.min) * geo.plotH;
const PRICE = y => geo.max - (y - geo.plotTop) / geo.plotH * (geo.max - geo.min);
function snapPoint(pt) {
  const i = Math.round(IDX(pt.x)); let p = PRICE(pt.y);
  const c = candles[i];
  if (c && DOPT.magnet) { let best = null, bd = 14; for (const v of [c.o, c.h, c.l, c.c]) { const dd = Math.abs(Y(v) - pt.y); if (dd < bd) { bd = dd; best = v; } } if (best != null) p = best; }
  return {t: timeOfIdx(i), p};
}
const px = a => ({x: X(idxOfTime(a.t)), y: Y(a.p)});
/* Geometría de las herramientas nuevas: Fibonacci (tiempo, abanico, círculos), horquilla, triángulo, elipse y patrones de varios puntos */
const ptsPx = d => (d.pts || []).map(px);
const farPt = (a, b, k = 1) => { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; return {x: a.x + dx / L * 5000 * k, y: a.y + dy / L * 5000 * k}; };
function pitchRays(d) { // horquilla de Andrews: mediana desde A por el punto medio de B–C, y paralelas por B y C
  const A = px(d.a), B = px(d.b), C = px(d.c), M = {x: (B.x + C.x) / 2, y: (B.y + C.y) / 2}, dx = M.x - A.x, dy = M.y - A.y, L = Math.hypot(dx, dy) || 1;
  return [A, B, C].map(P => [P, {x: P.x + dx / L * 5000, y: P.y + dy / L * 5000}]);
}
function fanRays(d) { const A = px(d.a), B = px(d.b); return dLv(d).map(lv => [A, farPt(A, {x: B.x, y: A.y + (B.y - A.y) * lv})]); }
function fibCircle(d) { const A = px(d.a), B = px(d.b); return {m: {x: (A.x + B.x) / 2, y: (A.y + B.y) / 2}, R: Math.hypot(B.x - A.x, B.y - A.y) / 2}; }
const inTri = (p, a, b, c) => { const s = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y), d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
const readableOn = hex => { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); if (!m) return '#10151f'; const l = (.299 * parseInt(m[1], 16) + .587 * parseInt(m[2], 16) + .114 * parseInt(m[3], 16)) / 255; return l > .55 ? '#10151f' : '#ffffff'; };
const dExt = (d, p, q) => [dOpt(d, 'xl') ? farPt(q, p) : p, dOpt(d, 'xr') ? farPt(p, q) : q]; // extremos de una línea con «extender a la izquierda / derecha»
const dFibPrice = (d, lv) => dOpt(d, 'rv') ? d.a.p + (d.b.p - d.a.p) * lv : b_price(d, lv);
const dFibSpan = (d, p, q) => { const x1 = dOpt(d, 'xl') ? geo.left : Math.min(p.x, q.x); let x2 = dOpt(d, 'xr') ? geo.w - geo.right : Math.max(p.x, q.x); if (x2 - x1 < 60) x2 = x1 + 60; return {x1, x2}; };
const dDateTag = t => new Date(t).toLocaleString('es', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'});
function handlesOf(d) {
  if (d.type === 'brush' || d.lock) return [];
  if (d.pts && MULTI[d.type]) return d.pts.map((q, i) => ({key: 'p' + i, ...px(q)}));
  if (d.type === 'horizontal') return [{key: 'a', x: geo.left + geo.plotW / 2, y: Y(d.a.p)}];
  if (d.type === 'vertical') return [{key: 'a', x: X(idxOfTime(d.a.t)), y: geo.plotTop + geo.plotH / 2}];
  if (ONEPT.includes(d.type)) return [{key: 'a', ...px(d.a)}];
  const hs = [{key: 'a', ...px(d.a)}, {key: 'b', ...px(d.b)}];
  if (d.type === 'long' || d.type === 'short') { const q = posBox(d); hs.push({key: 's', x: (q.x1 + q.x2) / 2, y: q.yS}); } // asa del stop loss
  if (d.c) hs.push({key: 'c', ...px(d.c)});
  return hs;
}
/* Geometría de herramientas compuestas */
function channelOff(d) { // desplazamiento vertical (en precio) de la paralela que pasa por c
  const ia = idxOfTime(d.a.t), ib = idxOfTime(d.b.t), ic = idxOfTime(d.c.t), slope = ib === ia ? 0 : (d.b.p - d.a.p) / (ib - ia);
  return d.c.p - (d.a.p + slope * (ic - ia));
}
function posBox(d) { // Long/Short: entrada = a, objetivo = b, stop espejo a 2:1
  const A = px(d.a), B = px(d.b), x1 = Math.min(A.x, B.x); let x2 = Math.max(A.x, B.x); if (x2 - x1 < 40) x2 = x1 + 40;
  const manual = Number.isFinite(d.sp) && (d.sp - d.a.p) * (d.b.p - d.a.p) < 0; // stop movido a mano (debe quedar del lado contrario al objetivo)
  const stop = manual ? d.sp : d.a.p - (d.b.p - d.a.p) / (dOpt(d, 'rr') || 2);
  return {x1, x2, entry: d.a.p, target: d.b.p, stop, yE: Y(d.a.p), yT: Y(d.b.p), yS: Y(stop), manual};
}
function fmtDur(ms) { const m = Math.round(Math.abs(ms) / 6e4), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60; return d ? `${d} d ${h} h` : h ? `${h} h ${mm} min` : `${mm} min`; }
function markerKind(d) { const c = candles[clamp(Math.round(idxOfTime(d.a.t)), 0, candles.length - 1)]; return c && Math.abs(d.a.p - c.h) <= Math.abs(d.a.p - c.l) ? 'high' : 'low'; }
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function gannRays(d) { const A = px(d.a), B = px(d.b); return dLv(d).map(lv => [A, farPt(A, {x: B.x, y: A.y + (B.y - A.y) * lv})]); }
function regLines(d) { // regresión lineal de los cierres entre dos velas, con bandas a ±2 desviaciones
  const n = candles.length; if (!n) return null; let i0 = clamp(Math.round(idxOfTime(d.a.t)), 0, n - 1), i1 = clamp(Math.round(idxOfTime(d.b.t)), 0, n - 1); if (i0 > i1) [i0, i1] = [i1, i0];
  const m = i1 - i0 + 1; if (m < 3) return null; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = i0; i <= i1; i++) { const x = i - i0, y = candles[i].c; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const k = (m * sxy - sx * sy) / (m * sxx - sx * sx || 1), c0 = (sy - k * sx) / m; let v = 0; for (let i = i0; i <= i1; i++) { const e = candles[i].c - (c0 + k * (i - i0)); v += e * e; }
  const sd = Math.sqrt(v / m), f = (i, o) => ({x: X(i), y: Y(c0 + k * (i - i0) + o)});
  const dv = dOpt(d, 'dv') || 2; return {sd, lines: [0, dv, -dv].map(o => [f(i0, o * sd), f(i1, o * sd)])};
}
function sinePts(d, rightX) { // onda: a es una cresta/valle y b la siguiente; se repite hacia la derecha
  const A = px(d.a), B = px(d.b), dx = B.x - A.x; if (Math.abs(dx) < 6) return []; const mid = (A.y + B.y) / 2, amp = (A.y - B.y) / 2, s = Math.sign(dx), P = [];
  for (let x = A.x, n = 0; n < 900 && x >= geo.left - 12 && x <= rightX + 12; x += 4 * s, n++) P.push({x, y: mid + amp * Math.cos(Math.PI * (x - A.x) / dx)});
  return P;
}
function distToDrawing(d, pt) {
  { const s = dOpt(d, 'sz'); if (s && s !== 1) { const A = px(d.a); pt = {x: A.x + (pt.x - A.x) / s, y: A.y + (pt.y - A.y) / s}; } } // iconos con tamaño propio
  if (d.type === 'brush') { let m = 1e9, prev = null; for (const q of d.pts) { const c = {x: X(idxOfTime(q[0])), y: Y(q[1])}; m = Math.min(m, prev ? segDist(pt, prev, c) : Math.hypot(pt.x - c.x, pt.y - c.y)); prev = c; } return Math.max(0, m - (d.w || 3) / 2); }
  if (d.type === 'horizontal') return Math.abs(pt.y - Y(d.a.p));
  if (d.type === 'vertical') return Math.abs(pt.x - X(idxOfTime(d.a.t)));
  if (d.pts && MULTI[d.type]) { const P = ptsPx(d); let m = 1e9; for (let i = 1; i < P.length; i++) m = Math.min(m, segDist(pt, P[i - 1], P[i])); if (d.type === 'hs' && P.length > 4) m = Math.min(m, segDist(pt, P[2], P[4])); return P.length === 1 ? Math.hypot(pt.x - P[0].x, pt.y - P[0].y) : m; }
  if (d.type === 'hray') { const A = px(d.a); return pt.x < A.x - 4 ? 1e9 : Math.abs(pt.y - A.y); }
  if (d.type === 'crossline') { const A = px(d.a); return Math.min(Math.abs(pt.y - A.y), Math.abs(pt.x - A.x)); }
  if (d.type === 'arrowup' || d.type === 'arrowdown') { const A = px(d.a), s = d.type === 'arrowup' ? 1 : -1; return Math.abs(pt.x - A.x) <= 10 && (pt.y - A.y) * s >= -4 && (pt.y - A.y) * s <= 30 ? 0 : Math.hypot(pt.x - A.x, pt.y - A.y); }
  if (d.type === 'note') { const A = px(d.a), w = (d.text || '').length * 7 * (d.ts || 12) / 12 + 16; return pt.x >= A.x - 6 && pt.x <= A.x + w && pt.y >= A.y - 34 && pt.y <= A.y + 2 ? 0 : Math.hypot(pt.x - A.x, pt.y - A.y); }
  if (d.type === 'label') { const A = px(d.a); return pt.x >= A.x - 4 && pt.x <= A.x + 70 && Math.abs(pt.y - A.y) <= 10 ? 0 : Math.hypot(pt.x - A.x, pt.y - A.y); }
  if (['flag', 'check', 'xmark', 'star', 'arrowleft', 'arrowright'].includes(d.type)) {
    const A = px(d.a);
    if (d.type === 'flag') return Math.min(segDist(pt, A, {x: A.x, y: A.y - 26}), Math.max(0, Math.hypot(pt.x - A.x - 8, pt.y - A.y + 20) - 10));
    if (d.type === 'arrowleft' || d.type === 'arrowright') { const sx = d.type === 'arrowleft' ? 1 : -1, dx = (pt.x - A.x) * sx; return dx >= -2 && dx <= 36 && Math.abs(pt.y - A.y) <= 9 ? 0 : Math.hypot(pt.x - A.x, pt.y - A.y); }
    return Math.max(0, Math.hypot(pt.x - A.x, pt.y - A.y) - 9);
  }
  if (d.type === 'text' || d.type === 'marker') {
    const A = px(d.a);
    if (d.type === 'text' && pt.x >= A.x - 4 && pt.x <= A.x + (d.text || '').length * 7 * (d.ts || 12) / 12 + 10 && pt.y >= A.y - (d.ts || 12) - 4 && pt.y <= A.y + 4) return 0;
    return Math.hypot(pt.x - A.x, pt.y - A.y);
  }
  const a = px(d.a), b = px(d.b);
  if (d.type === 'trend' || d.type === 'arrow' || d.type === 'info' || d.type === 'angle') return segDist(pt, ...dExt(d, a, b));
  if (d.type === 'extended') return segDist(pt, farPt(a, b, -1), farPt(a, b, 1));
  if (d.type === 'regression') { const R = regLines(d); return R ? Math.min(...R.lines.map(([p, q]) => segDist(pt, p, q))) : segDist(pt, a, b); }
  if (d.type === 'cyclic') { if (pt.y < geo.plotTop || pt.y > geo.plotTop + geo.plotH) return 1e9; const i0 = idxOfTime(d.a.t), u = idxOfTime(d.b.t) - i0; if (!u) return 1e9; let m = 1e9; for (let k = 0; k < 200; k++) m = Math.min(m, Math.abs(pt.x - X(i0 + u * k))); return m; }
  if (d.type === 'sinewave') { const P = sinePts(d, geo.w - geo.right); let m = 1e9; for (let i = 1; i < P.length; i++) m = Math.min(m, segDist(pt, P[i - 1], P[i])); return P.length ? m : segDist(pt, a, b); }
  if (d.type === 'gannfan') return Math.min(...gannRays(d).map(([p, q]) => segDist(pt, p, q)));
  if (d.type === 'circle') { const r = Math.hypot(pt.x - a.x, pt.y - a.y), R = Math.hypot(b.x - a.x, b.y - a.y); return r <= R ? 0 : r - R; }
  if (d.type === 'callout') { const w = (d.text || '').length * 7 * (d.ts || 12) / 12 + 16; return pt.x >= b.x - w / 2 && pt.x <= b.x + w / 2 && pt.y >= b.y - 12 && pt.y <= b.y + 12 ? 0 : segDist(pt, a, b); }
  if (d.type === 'parallelogram') { if (!d.c) return segDist(pt, a, b); const c = px(d.c), e = {x: a.x + c.x - b.x, y: a.y + c.y - b.y}; return inTri(pt, a, b, c) || inTri(pt, a, c, e) ? 0 : Math.min(segDist(pt, a, b), segDist(pt, b, c), segDist(pt, c, e), segDist(pt, e, a)); }
  if (d.type === 'ellipse') { const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, rx = Math.max(1, Math.abs(b.x - a.x) / 2), ry = Math.max(1, Math.abs(b.y - a.y) / 2), r = Math.hypot((pt.x - cx) / rx, (pt.y - cy) / ry); return r <= 1 ? 0 : (r - 1) * Math.min(rx, ry); }
  if (d.type === 'triangle') { if (!d.c) return segDist(pt, a, b); const c = px(d.c); return inTri(pt, a, b, c) ? 0 : Math.min(segDist(pt, a, b), segDist(pt, b, c), segDist(pt, c, a)); }
  if (d.type === 'pitchfork') { if (!d.c) return segDist(pt, a, b); return Math.min(...pitchRays(d).map(([p, q]) => segDist(pt, p, q))); }
  if (d.type === 'fibtime') { if (pt.y < geo.plotTop || pt.y > geo.plotTop + geo.plotH) return 1e9; const i0 = idxOfTime(d.a.t), u = idxOfTime(d.b.t) - i0; return Math.min(...dLv(d).map(nn => Math.abs(pt.x - X(i0 + u * nn)))); }
  if (d.type === 'fibfan') return Math.min(...fanRays(d).map(([p, q]) => segDist(pt, p, q)));
  if (d.type === 'fibcircle') { const {m, R} = fibCircle(d), r = Math.hypot(pt.x - m.x, pt.y - m.y); return Math.min(...dLv(d).map(lv => Math.abs(r - R * lv))); }
  if (d.type === 'ray') { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; return segDist(pt, a, {x: a.x + dx / L * 5000, y: a.y + dy / L * 5000}); }
  if (d.type === 'channel') {
    if (!d.c) return segDist(pt, a, b);
    const off = channelOff(d); return Math.min(segDist(pt, ...dExt(d, a, b)), segDist(pt, ...dExt(d, px({t: d.a.t, p: d.a.p + off}), px({t: d.b.t, p: d.b.p + off}))));
  }
  if (d.type === 'long' || d.type === 'short') {
    const q = posBox(d), y1 = Math.min(q.yT, q.yS), y2 = Math.max(q.yT, q.yS);
    return pt.x >= q.x1 && pt.x <= q.x2 && pt.y >= y1 && pt.y <= y2 ? 0 : Math.min(Math.abs(pt.y - q.yT), Math.abs(pt.y - q.yS), Math.abs(pt.y - q.yE)) + (pt.x < q.x1 ? q.x1 - pt.x : pt.x > q.x2 ? pt.x - q.x2 : 0);
  }
  if (d.type === 'fibext') {
    if (!d.c) return segDist(pt, a, b);
    const c = px(d.c), sp = dFibSpan(d, a, c); if (pt.x < sp.x1 - 10 || pt.x > sp.x2 + 10) return 1e9;
    return Math.min(...dLv(d).map(lv => Math.abs(pt.y - Y(d.c.p + (d.b.p - d.a.p) * lv))));
  }
  if (d.type === 'rect' || d.type === 'gannbox' || d.type === 'diamond' || d.type === 'measure' || d.type === 'pricerange' || d.type === 'daterange') {
    const x1 = Math.min(a.x, b.x), x2 = dOpt(d, 'xr') ? geo.w - geo.right : Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
    if (pt.x >= x1 && pt.x <= x2 && pt.y >= y1 && pt.y <= y2) return 0;
    return Math.min(segDist(pt, {x: x1, y: y1}, {x: x2, y: y1}), segDist(pt, {x: x2, y: y1}, {x: x2, y: y2}), segDist(pt, {x: x2, y: y2}, {x: x1, y: y2}), segDist(pt, {x: x1, y: y2}, {x: x1, y: y1}));
  }
  const sp = dFibSpan(d, a, b); if (pt.x < sp.x1 - 10 || pt.x > sp.x2 + 10) return 1e9;
  return Math.min(...dLv(d).map(lv => Math.abs(pt.y - Y(dFibPrice(d, lv)))), dOpt(d, 'tl') ? segDist(pt, a, b) : 1e9);
}
const b_price = (d, lv) => d.b.p - (d.b.p - d.a.p) * lv;
function hitTest(pt) { if (DOPT.lock || DOPT.hide) return null; const arr = getDrawings(); for (let i = arr.length - 1; i >= 0; i--) if (!arr[i].hide && distToDrawing(arr[i], pt) < 13) return arr[i]; return null; }
function withLastStyle(d) { const st = (state.lastStyle || {})[tplKind(d)]; if (st) for (const [k, v] of Object.entries(st)) if (k !== 'k' && v != null && d[k] == null) d[k] = v; return d; } // última configuración usada en esa herramienta
function commitDrawing(a, b, c) {
  const one = ONEPT.includes(drawTool), three = THREEPT.includes(drawTool);
  if (!one) {
    const A = px(a), B = px(b); if (Math.hypot(A.x - B.x, A.y - B.y) < 8) { toast('Los puntos están muy cerca'); pending = null; preview = null; updateDrawUI(); scheduleRender(); return; }
    if (drawTool === 'long' && b.p <= a.p) { toast('Para Long, el objetivo debe quedar arriba de la entrada'); pending = null; preview = null; updateDrawUI(); scheduleRender(); return; }
    if (drawTool === 'short' && b.p >= a.p) { toast('Para Short, el objetivo debe quedar abajo de la entrada'); pending = null; preview = null; updateDrawUI(); scheduleRender(); return; }
  }
  if (three && !c) { pending2 = {a, b}; pending = null; preview = null; updateDrawUI(); scheduleRender(); return; }
  const d = {id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: drawTool, a, ...(one ? {} : {b}), ...(three ? {c} : {})};
  if (drawTool === 'text' || drawTool === 'note' || drawTool === 'callout') {
    const txt = (prompt(drawTool === 'note' ? 'Texto de la nota:' : 'Texto del dibujo:') || '').trim().slice(0, 80);
    if (!txt) { drawTool = ''; pending = null; preview = null; updateDrawUI(); render(); return; }
    d.text = txt;
  }
  withLastStyle(d); snapDraw(); setDrawings([...getDrawings(), d]);
  selectedId = DOPT.stay ? null : d.id; if (!DOPT.stay) drawTool = ''; pending = null; pending2 = null; preview = null; updateDrawUI(); render();
}

// Simplificación Ramer–Douglas–Peucker en píxeles: trazos livianos (el estado viaja entero a la cuenta) sin perder la forma
function rdp(P, eps) {
  if (P.length < 3) return P; const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1; const st = [[0, P.length - 1]];
  while (st.length) { const [i, j] = st.pop(); let m = 0, k = -1; for (let n = i + 1; n < j; n++) { const d = segDist(P[n], P[i], P[j]); if (d > m) { m = d; k = n; } } if (k >= 0 && m > eps) { keep[k] = 1; st.push([i, k], [k, j]); } }
  return P.filter((_, i) => keep[i]);
}
function commitMulti() {
  const M = MULTI[drawTool], pts = multi.slice(0, M.n), d = {id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: drawTool, a: pts[0], pts};
  withLastStyle(d); snapDraw(); setDrawings([...getDrawings(), d]);
  selectedId = DOPT.stay ? null : d.id; if (!DOPT.stay) drawTool = ''; multi = []; pending = null; preview = null; updateDrawUI(); render();
}
const dBrushO = () => { const st = (state.lastStyle || {})[drawTool === 'highlighter' ? 'highlighter' : 'brush']; return st && st.o ? {o: st.o} : {}; }; // opacidad usada la última vez
function commitBrush(live) {
  if (!live || live.length < 2 || !geo) return;
  const P = live.map(q => ({x: X(idxOfTime(q[0])), y: Y(q[1]), q}));
  let eps = 1.1, out = rdp(P, eps); while (out.length > 300 && eps < 20) out = rdp(P, eps *= 1.5);
  if (out.length < 2) return;
  const pts = out.map(o => [Math.round(o.q[0]), +(+o.q[1].toPrecision(8))]);
  const d = {id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: 'brush', pts, a: {t: pts[0][0], p: pts[0][1]}, col: state.brush.c, w: drawTool === 'highlighter' ? state.brush.w * 3 : state.brush.w, ...(drawTool === 'highlighter' ? {hl: true} : {}), ...dBrushO()};
  snapDraw(); setDrawings([...getDrawings(), d]); selectedId = d.id; updateDrawUI();
}

/* ───────── Render del gráfico ───────── */
let raf = 0;
/* ───────── Movimiento fluido: inercia al desplazar y zoom/ajuste suavizados ───────── */
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let glideRaf = 0, glideT = null, inertiaRaf = 0;
function stopMotion() { cancelAnimationFrame(glideRaf); cancelAnimationFrame(inertiaRaf); glideRaf = inertiaRaf = 0; glideT = null; }
function glide(t) { // t = {visible?, pan?}: se acerca al objetivo con suavizado exponencial
  if (REDUCED) { if (t.visible != null) visible = t.visible; if (t.pan != null) pan = t.pan; render(); return; }
  cancelAnimationFrame(inertiaRaf); glideT = Object.assign(glideT || {}, t); if (glideRaf) return;
  let last = performance.now();
  const step = now => {
    const dt = Math.min(48, now - last); last = now; const k = 1 - Math.pow(.0009, dt / 1000); let done = true; const g = glideT;
    if (g.visible != null) { visible += (g.visible - visible) * k; if (Math.abs(g.visible - visible) < .05) visible = g.visible; else done = false; }
    if (g.pan != null) { pan += (g.pan - pan) * k; if (Math.abs(g.pan - pan) < .02) pan = g.pan; else done = false; }
    render(); if (done) { glideRaf = 0; glideT = null; } else glideRaf = requestAnimationFrame(step);
  };
  glideRaf = requestAnimationFrame(step);
}
function inertia(v) { // v en velas/ms; se frena con fricción
  if (REDUCED || Math.abs(v) < .004) return; cancelAnimationFrame(inertiaRaf); let last = performance.now();
  const step = now => { const dt = Math.min(48, now - last); last = now; pan += v * dt; v *= Math.pow(.0035, dt / 1000);
    render(); if (Math.abs(v) > .0015) inertiaRaf = requestAnimationFrame(step); else inertiaRaf = 0; };
  inertiaRaf = requestAnimationFrame(step);
}
function scheduleRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
let g = null;
function setupCanvas() {
  const el = $('#priceCanvas'), b = el.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 3);
  // tamaño real del diseño (sin animaciones): con getBoundingClientRect una animación de escala lo medía más chico y el gráfico «brincaba»
  const r = el.clientWidth && el.clientHeight ? {width: el.clientWidth, height: el.clientHeight} : b;
  const W = Math.round(r.width * d), H = Math.round(r.height * d);
  if (el.width !== W || el.height !== H) { el.width = W; el.height = H; }
  g = el.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
  return {w: r.width, h: r.height};
}
function timeLabel(t, prev) { return CCTPrefs.axisLabel(t, prev, state.interval, PR); }
let legRows = [], legSig = '', legStruct = '', grips = [], gripDrag = false;
let paneH = (() => { try { const o = JSON.parse(localStorage.getItem('cct_paneH_v1') || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } })();
let paneOrder = (() => { try { const o = JSON.parse(localStorage.getItem('cct_paneOrder_v1') || '[]'); return Array.isArray(o) ? o.filter(k => typeof k === 'string').slice(0, 64) : []; } catch { return []; } })(); // orden elegido por el usuario para los paneles (RSI, MACD…)
let paneLayout = {bot: [], top: [], main: [], mainBase: 0}, mainCount = 0; // paneles de abajo y de arriba tal como se dibujaron: [{key, h}], para poder arrastrarlos
const orderPanes = keys => { const ix = k => { const i = paneOrder.indexOf(k); return i < 0 ? 1e6 : i; }; return keys.map((k, i) => [k, i]).sort((a, b) => ix(a[0]) - ix(b[0]) || a[1] - b[1]).map(x => x[0]); };
const savePaneOrder = () => { try { localStorage.setItem('cct_paneOrder_v1', JSON.stringify(paneOrder)); } catch {} if (typeof syncUi === 'function') syncUi(); };
/* Rango vertical que dejaste en los paneles acotados (osciladores de Pine, RSI, estocástico): se guarda y se queda igual al cambiar de moneda, recargar o abrir en otro dispositivo */
const PANE_KEEP = k => /^pine:|^(rsi|stoch)$/.test(k);
let paneManSaved = (() => { try { const o = JSON.parse(localStorage.getItem('cct_paneMan_v1') || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } })();
const paneManKeep = () => paneManSaved;
function savePaneMan(key) { if (!PANE_KEEP(key)) return; const pm = paneMan[key]; if (pm) paneManSaved[key] = [+pm.min.toPrecision(8), +pm.max.toPrecision(8)]; else delete paneManSaved[key]; try { localStorage.setItem('cct_paneMan_v1', JSON.stringify(paneManSaved)); } catch {} if (typeof syncUi === 'function') syncUi(); }
let paneRefH = 0; // alto disponible para gráfico + paneles (para guardar la altura de cada panel como proporción y no como píxeles)
const savePaneH = () => { try { localStorage.setItem('cct_paneH_v1', JSON.stringify(paneH)); } catch {} if (typeof syncUi === 'function') syncUi(); };
const paneScale0 = () => { try { const v = parseFloat(localStorage.getItem('cct_paneScale')); return v >= .6 && v <= 3 ? v : 1.25; } catch { return 1.25; } };
let paneScale = paneScale0();
const devClass = () => (window.matchMedia && matchMedia('(min-width: 1024px)').matches ? 'pc' : 'movil');
function syncUi() { // vuelca las preferencias de interfaz al estado (que se guarda en el dispositivo y en la cuenta)
  const panes = Object.assign({}, (state.ui || {}).panes); panes[devClass()] = {paneH, paneScale, order: paneOrder, man: paneManKeep()}; // cada tipo de dispositivo guarda su propio tamaño
  state.ui = sanUi({panes, dopt: DOPT, favBar: FB, favs: FAVS, myColors: MYCOL, pillFavs: window.CCT_pillFavs ? window.CCT_pillFavs() : (state.ui || {}).pillFavs, prefs: PR, icon: (window.CCTAppIcons && window.CCTAppIcons.selected) || (state.ui && state.ui.icon) || ''}); save();
}
function applyUi() { // al recibir el estado de la cuenta: aplica sus preferencias de interfaz en este dispositivo
  const u = state.ui || {};
  if (Array.isArray(u.myColors)) MYCOL = u.myColors.slice(0, 20);
  const pn = (u.panes || {})[devClass()] || {}; // solo se aplica el tamaño guardado para este tipo de dispositivo
  if (pn.paneH) { paneH = {...pn.paneH}; try { localStorage.setItem('cct_paneH_v1', JSON.stringify(paneH)); } catch {} }
  if (pn.man) { paneManSaved = {...pn.man}; try { localStorage.setItem('cct_paneMan_v1', JSON.stringify(paneManSaved)); } catch {} }
  if (Array.isArray(pn.order)) { paneOrder = pn.order.slice(0, 64); try { localStorage.setItem('cct_paneOrder_v1', JSON.stringify(paneOrder)); } catch {} }
  if (pn.paneScale) { paneScale = pn.paneScale; try { localStorage.setItem('cct_paneScale', String(paneScale)); } catch {} }
  if (Array.isArray(u.pillFavs) && window.CCT_setPillFavs) window.CCT_setPillFavs(u.pillFavs);
  if (u.dopt) { Object.assign(DOPT, u.dopt); try { localStorage.setItem(DOPT_KEY, JSON.stringify(DOPT)); } catch {} }
  if (u.icon && window.CCTAppIcons && window.CCTAppIcons.selected !== u.icon) window.CCTAppIcons.apply(u.icon);
  if (Array.isArray(u.favs)) { FAVS = u.favs.slice(0, 24); try { localStorage.setItem(FAV_KEY, JSON.stringify(FAVS)); } catch {} if (typeof buildRail === 'function') buildRail(); }
  if (u.prefs) { PR = CCTPrefs.sanitize(u.prefs); if (typeof renderPrefs === 'function') renderPrefs(); }
  if (u.favBar) FB = Object.assign({show: true, x: null, y: null, mx: null, my: null}, u.favBar);
  if (typeof renderFavBar === 'function') renderFavBar();
}
window.addEventListener('cct-theme', () => { const id = window.CCTAppIcons && window.CCTAppIcons.selected; if (id && (state.ui || {}).icon !== id && typeof save === 'function') syncUi(); });
const LEG_FONT = '600 13px system-ui';
const legBtnH = () => (window.matchMedia && matchMedia('(max-width:760px)').matches ? 26 : 22);
const legStep = () => legBtnH() + 4; // separación vertical entre filas con botones
function legAt(text, x, y, act, dim) {
  const tw = g.measureText(text).width, pk = act.mid || (act.t === 'std' ? act.key : act.t === 'pine' ? 'pine:' + act.sid : ''), grp = act.mid ? (mainCount > 1 ? [0, 0] : null) : pk && [paneLayout.bot, paneLayout.top].find(L => L.some(q => q.key === pk)); // solo los nombres de paneles (con otro panel con quien cambiar de lugar) se pueden arrastrar
  legRows.push({x: x + tw + 8, y: y - Math.round(legBtnH() / 2 + 5), act, dim: !!dim, tw, hk: grp && grp.length > 1 ? pk : ''});
}
/* Leyenda de indicadores plegable: cerrada solo se ve «N indicadores»; abierta muestra nombres, valores y botones (ocultar, ajustes, eliminar) */
let legOpen = lsGet('cct_legOpen_v1') === '1', legN = 0;
function legLabel(text, x, y, act, dim) {
  legN++; if (!legOpen) return; const f = g.font; g.font = LEG_FONT;
  const css = getComputedStyle(document.documentElement), muted = css.getPropertyValue('--muted').trim().toLowerCase(), fg = css.getPropertyValue('--text').trim();
  if (fg) { // nombres más legibles: activos casi blancos (los que traen su propio color no se tocan) y ocultos atenuados pero claros
    if (dim) { g.fillStyle = muted; g.globalAlpha = .5; }
    else if (String(g.fillStyle).toLowerCase() === muted) g.fillStyle = fg;
  }
  g.fillText(text, x, y); legAt(text, x, y, act, dim); g.font = f;
}
function syncLegToggle() {
  const b = $('#legToggle'); if (!b) return; b.hidden = !legN; if (!legN) return;
  $('#legCount').textContent = legN === 1 ? '1 indicador' : legN + ' indicadores';
  b.classList.toggle('open', legOpen); b.setAttribute('aria-expanded', legOpen ? 'true' : 'false');
  b.title = legOpen ? 'Ocultar las opciones de los indicadores' : 'Mostrar los indicadores y sus opciones (ocultar, ajustes, eliminar)';
}
(() => { const b = $('#legToggle'); if (!b) return; b.insertAdjacentHTML('beforeend', SV(IC.chevron, 12));
  b.addEventListener('click', e => { e.stopPropagation(); legOpen = !legOpen; try { localStorage.setItem('cct_legOpen_v1', legOpen ? '1' : '0'); } catch {} legSig = ''; legStruct = ''; $('#legMenu')?.remove(); scheduleRender(); }); })();
function syncLegend() {
  const box = $('#legendBox'); if (!box || gripDrag) return;
  const sig = grips.map(q => q.key + ':' + Math.round(q.y)).join(',') + '#' + legRows.map(r => [Math.round(r.x), Math.round(r.y), r.act.t, r.act.sid || r.act.key || '', r.dim ? 1 : 0, r.act.pane || '', r.hk || '', Math.round(r.tw)].join(':')).join('|');
  if (sig === legSig) return; legSig = sig;
  const gw = geo ? Math.max(40, geo.w - geo.left - geo.right + 2) : 100;
  // misma estructura (solo se movieron/cambió el texto): se recolocan los elementos existentes en vez de recrearlos,
  // así un clic en curso no pierde su botón por un tick de precio en vivo
  const struct = grips.map(q => q.key + ':' + q.dir).join(',') + '#' + legRows.map(r => [r.act.t, r.act.sid || r.act.key || '', r.dim ? 1 : 0, r.act.pane || '', r.hk || ''].join(':')).join('|');
  if (struct === legStruct && box.children.length === grips.length + legRows.length) {
    grips.forEach((q, i) => { const el = box.children[i]; el.style.top = (Math.round(q.y) - 10) + 'px'; el.style.left = (geo ? geo.left : 6) + 'px'; el.style.width = gw + 'px'; el.dataset.gh = q.h; });
    legRows.forEach((r, i) => { const el = box.children[grips.length + i]; el.style.left = Math.round(r.x) + 'px'; el.style.top = Math.round(r.y) + 'px'; const hd = el.querySelector('.leg-handle'); if (hd) { hd.style.left = '-' + Math.round(r.tw + 8) + 'px'; hd.style.width = Math.round(r.tw) + 'px'; } });
    return;
  }
  legStruct = struct;
  box.innerHTML = grips.map(q => `<div class="pane-grip" data-gk="${esc(q.key)}" data-gd="${q.dir}" data-gh="${q.h}" style="top:${Math.round(q.y) - 10}px;left:${geo ? geo.left : 6}px;width:${gw}px" title="Arrastra para cambiar la altura (doble toque: automática)"></div>`).join('') + legRows.map(r => { const a = r.act, id = a.sid || a.key || '', d = `data-leg="${a.t}" data-id="${esc(id)}"`;
    return `<div class="leg-row" style="left:${Math.round(r.x)}px;top:${Math.round(r.y)}px">${r.hk ? `<span class="leg-handle" data-hk="${esc(r.hk)}" title="Mantén pulsado el nombre y arrastra para subirlo o bajarlo" style="left:-${Math.round(r.tw + 8)}px;width:${Math.round(r.tw)}px"></span>` : ''}<button ${d} data-do="eye" title="${r.dim ? 'Mostrar' : 'Ocultar'}" aria-label="${r.dim ? 'Mostrar' : 'Ocultar'}">${SV(r.dim ? IC.eyeoff : IC.eye, 15)}</button><button ${d} data-do="set" title="Ajustes" aria-label="Ajustes">${SV(IC.gear, 15)}</button>${a.t === 'pine' ? `<button ${d} data-do="move" title="Mover de panel" aria-label="Mover de panel">${SV(IC.swap, 15)}</button>` : ''}<button ${d} data-do="del" title="Eliminar del gráfico" aria-label="Eliminar">${SV(IC.close, 15)}</button></div>`; }).join('');
}
document.addEventListener('click', e => {
  const m = e.target.closest('[data-leg-pane]');
  if (m) { const p = state.pine.find(x => x.sid === m.dataset.id); if (p) { if (m.dataset.legPane) p.pane = m.dataset.legPane; else delete p.pane; save(); renderIndicators(); scheduleRender(); } $('#legMenu')?.remove(); return; }
  const b = e.target.closest('[data-leg]'); if (!b) { $('#legMenu')?.remove(); return; }
  const t = b.dataset.leg, id = b.dataset.id, act = b.dataset.do; $('#legMenu')?.remove();
  if (t === 'pine') {
    const p = state.pine.find(x => x.sid === id); if (!p) return;
    if (act === 'eye') { if (p.hide) delete p.hide; else p.hide = true; save(); scheduleRender(); }
    else if (act === 'set') { pineSetSid = id; openPineDialog(id); }
    else if (act === 'del') { state.pine = state.pine.filter(x => x !== p); delete pineRes[p.sid]; save(); renderIndicators(); countIndicators(); scheduleRender(); toast('Quitado del gráfico (sigue en Mis indicadores)'); }
    else if (act === 'move') {
      const r = pineRes[id], cur = p.pane || (r && r.meta && r.meta.overlay ? 'main' : 'bottom'), r0 = b.getBoundingClientRect();
      const mk = (v, tx) => `<button data-leg-pane="${v}" data-id="${esc(id)}" class="${cur === (v || (r && r.meta && r.meta.overlay ? 'main' : 'bottom')) ? 'cur' : ''}">${tx}</button>`;
      const el = document.createElement('div'); el.id = 'legMenu'; el.innerHTML = mk('main', 'Sobre el gráfico') + mk('top', 'Panel arriba') + mk('bottom', 'Panel abajo');
      el.style.cssText = `left:${Math.min(r0.left, innerWidth - 170)}px;top:${r0.bottom + 4}px`; document.body.appendChild(el);
    }
    return;
  }
  if (t === 'nova') { if (act === 'set') openNovaDialog(); else if (act === 'eye' || act === 'del') { novaToggleAll(false); novaAfter(); toast('Nova Nexus apagado: actívalo en Indicadores → Mis indicadores'); } return; }
  if (t === 'std') {
    if (act === 'set') { openStdDialog(id); return; }
    if (act === 'eye') { // el ojito solo oculta/muestra: el indicador sigue activo en Indicadores
      state.stdHide = state.stdHide || {}; if (state.stdHide[id]) delete state.stdHide[id]; else state.stdHide[id] = true;
      save(); legSig = ''; legStruct = ''; scheduleRender(); return;
    }
    if (isCopy(id)) removeCopy(id); else state.indicators[id] = false; if (state.stdHide) delete state.stdHide[id]; save(); renderIndicators(); countIndicators(); if (candles.length) { calcNova(); calcExtra(); } scheduleRender(); toast('Indicador apagado: puedes volver a activarlo en Indicadores');
  }
});
function render() { renderCore(); syncLegend(); syncLegToggle(); if (candles.length && window.CCT_splashDone) CCT_splashDone(); } // ya hay velas: termina la animación de apertura
/* Reordenar paneles: mantén pulsado el NOMBRE de un indicador (RSI, MACD, un script en panel…) y arrástralo hacia arriba o abajo; al soltar queda guardado.
   Solo se mueve el nombre/panel elegido; los botones y el resto de la leyenda no cambian. */
(() => {
  const box = $('#legendBox'); if (!box) return;
  box.addEventListener('contextmenu', e => { if (e.target.closest('.leg-handle')) e.preventDefault(); });
  box.addEventListener('pointerdown', e => {
    const hd = e.target.closest('.leg-handle'); if (!hd || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const key = hd.dataset.hk, o = {x: e.clientX, y: e.clientY}; let active = false, changed = false, list = null, base = 0;
    const timer = setTimeout(() => {
      const L = paneLayout.bot.some(q => q.key === key) ? 'bot' : paneLayout.top.some(q => q.key === key) ? 'top' : paneLayout.main.some(q => q.key === key) ? 'main' : ''; if (!L) { cleanup(); return; }
      if (!geo) { cleanup(); return; }
      list = paneLayout[L].map(q => ({...q})); base = L === 'bot' ? geo.extraTop : L === 'main' ? paneLayout.mainBase : 6; // donde empieza la pila de paneles de abajo (o la de arriba)
      active = true; gripDrag = true; box.classList.add('dragging'); if (navigator.vibrate) try { navigator.vibrate(15); } catch {}
    }, 350);
    const move = ev => {
      if (!active) { if (Math.hypot(ev.clientX - o.x, ev.clientY - o.y) > 8) cleanup(); return; }
      ev.preventDefault();
      const y = ev.clientY - box.getBoundingClientRect().top, mids = () => { let t = base; return list.map(q => { const m = t + q.h / 2; t += q.h; return m; }); };
      let i = list.findIndex(q => q.key === key), moved = false;
      for (let guard = 0; guard < 24; guard++) {
        const m = mids();
        if (i > 0 && y < m[i - 1]) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; i--; moved = true; }
        else if (i < list.length - 1 && y > m[i + 1]) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; i++; moved = true; }
        else break;
      }
      if (moved) { changed = true; const ks = list.map(q => q.key); paneOrder = [...ks, ...paneOrder.filter(k => !ks.includes(k))].slice(0, 64); scheduleRender(); }
    };
    const end = () => { const was = active; cleanup(); if (was) { box.classList.remove('dragging'); gripDrag = false; if (changed) savePaneOrder(); legSig = ''; legStruct = ''; scheduleRender(); } };
    function cleanup() { clearTimeout(timer); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); if (active) { active = false; box.classList.remove('dragging'); gripDrag = false; } }
    window.addEventListener('pointermove', move, {passive: false}); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  });
})();
(() => {
  const box = $('#legendBox'); if (!box) return; let drag = null;
  box.addEventListener('pointerdown', e => {
    const el = e.target.closest('.pane-grip'); if (!el) return; e.preventDefault(); e.stopPropagation();
    drag = {el, key: el.dataset.gk, dir: el.dataset.gd, h0: +el.dataset.gh, y0: e.clientY, top0: parseFloat(el.style.top), max: +el.dataset.gh + Math.max(0, (geo ? geo.plotH : 200) - 80)};
    gripDrag = true; box.classList.add('dragging'); el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch {}
  });
  box.addEventListener('pointermove', e => {
    if (!drag) return; let dy = e.clientY - drag.y0, nh = Math.round(drag.dir === 'up' ? drag.h0 - dy : drag.h0 + dy);
    nh = Math.max(36, Math.min(drag.max, nh)); dy = drag.dir === 'up' ? drag.h0 - nh : nh - drag.h0;
    paneH[drag.key] = nh; drag.el.style.top = (drag.top0 + dy) + 'px'; scheduleRender();
  });
  const end = () => { if (!drag) return; drag.el.classList.remove('on'); if (paneRefH > 0 && paneH[drag.key] > 1) paneH[drag.key] = +(paneH[drag.key] / paneRefH).toFixed(4); drag = null; gripDrag = false; box.classList.remove('dragging'); savePaneH(); legSig = ''; scheduleRender(); };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  box.addEventListener('dblclick', e => { const el = e.target.closest('.pane-grip'); if (!el) return; delete paneH[el.dataset.gk]; savePaneH(); legSig = ''; scheduleRender(); toast('Altura automática'); });
})();
function openStdDialog(key) {
  const meta = indicatorMeta.find(m => m[0] === key), schema = STD_SCHEMA[key], cTitle = isCopy(key) ? stdName(key) : '';
  if (!schema) { toast('Este indicador no tiene parámetros'); return; }
  const inputs = schema.map(([nm, title, type, def, mn, mx, opts]) => Object.assign({key: nm, title, type, def, min: mn, max: mx, value: sp(key, nm), group: type === 'color' || nm === 'width' || nm === 'dash' ? 'ESTILO' : 'PARÁMETROS'}, opts ? {options: opts} : {}));
  CCTSettings.open(liveCfg({title: cTitle || (meta ? meta[1] : key), tabs: ['in'], note: 'Parámetros del indicador. Las alertas con este indicador siguen usando los valores clásicos.', inputs, values: Object.fromEntries(inputs.map(i => [i.key, i.value])), plots: [], hlines: [], objects: [], shapes: [], onApply: res => {
    const q = {}; for (const i of inputs) { let v = res.inputs[i.key]; if (v === undefined) continue; if (i.type === 'string') { if (!i.options.includes(v) || v === i.def) continue; } else if (i.type !== 'color') { v = +v; if (!Number.isFinite(v)) continue; v = Math.max(i.min, Math.min(i.max, v)); if (i.type === 'int') v = Math.round(v); } if (v !== i.def) q[i.key] = v; }
    const sps = Object.assign({}, state.stdParams); if (Object.keys(q).length) sps[key] = q; else delete sps[key]; state.stdParams = sanStdParams(sps);
    save(); if (candles.length) recalc(); scheduleRender(); toast('Configuración aplicada');
  }}, () => jcopy(state.stdParams), s0 => { state.stdParams = s0; if (candles.length) recalc(); scheduleRender(); }));
}
function openChartStyle() {
  const cs = cstyle(); let bgDef = '#0b0f18'; try { if (!document.body.classList.contains('light')) throw 0; let n = $('#chartArea'); while (n) { const c = getComputedStyle(n).backgroundColor, m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c); if (m && (m[4] === undefined || +m[4] > 0)) { bgDef = '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join(''); break; } n = n.parentElement; } } catch { if (!document.body.classList.contains('light')) bgDef = CHART_DEF.bg; }
  const lineDef = '#1e2635', P = (key, title, type, def, group, extra) => Object.assign({key, title, type, def, value: state.chartStyle && state.chartStyle[key] !== undefined ? state.chartStyle[key] : def, group}, extra || {});
  const inputs = [
    P('bg', 'Color de fondo', 'color', bgDef, 'FONDO Y CUADRÍCULA'), P('gridH', 'Líneas horizontales', 'bool', true, 'FONDO Y CUADRÍCULA'), P('gridV', 'Líneas verticales', 'bool', true, 'FONDO Y CUADRÍCULA'), P('grid', 'Color de la cuadrícula', 'color', lineDef, 'FONDO Y CUADRÍCULA'),
    P('up', 'Vela alcista · cuerpo', 'color', CHART_DEF.up, 'VELAS'), P('down', 'Vela bajista · cuerpo', 'color', CHART_DEF.down, 'VELAS'),
    P('upBorder', 'Alcista · borde', 'color', cs.upBorder || cs.up, 'VELAS'), P('downBorder', 'Bajista · borde', 'color', cs.downBorder || cs.down, 'VELAS'),
    P('upWick', 'Alcista · mecha', 'color', cs.upWick || cs.up, 'VELAS'), P('downWick', 'Bajista · mecha', 'color', cs.downWick || cs.down, 'VELAS'),
    P('hollow', 'Velas alcistas huecas', 'bool', false, 'VELAS'),
    P('cursor', 'Tipo de cursor', 'string', 'Cruz', 'CURSOR', {options: CURSOR_MODES}), P('cross', 'Color del cursor (cruz)', 'color', document.body.classList.contains('light') ? '#0b1220' : '#edf3fc', 'CURSOR'), P('crossA', 'Opacidad del cursor (%)', 'int', 55, 'CURSOR', {min: 5, max: 100}), P('crossS', 'Estilo de línea', 'string', 'Guiones', 'CURSOR', {options: ['Guiones', 'Sólida', 'Puntos']}), P('crossW', 'Grosor (px)', 'int', 1, 'CURSOR', {min: 1, max: 4}),
    P('alertCol', 'Color de la línea', 'color', document.body.classList.contains('light') ? '#5b6678' : '#8a96a8', 'LÍNEA DE ALERTA'), P('alertA', 'Opacidad (%)', 'int', 28, 'LÍNEA DE ALERTA', {min: 5, max: 100}), P('alertS', 'Estilo de línea', 'string', 'Puntos', 'LÍNEA DE ALERTA', {options: ['Puntos', 'Guiones', 'Sólida']}), P('alertW', 'Grosor (px)', 'int', 1, 'LÍNEA DE ALERTA', {min: 1, max: 4}), {key: 'reset', title: 'Restablecer todo a los valores por defecto', type: 'bool', def: false, value: false, group: 'RESTABLECER'}];
  CCTSettings.open(liveCfg({title: 'Aspecto del gráfico', tabs: ['in'], note: 'Colores, cuadrícula, cursor y línea de las alertas. Se guardan en este dispositivo y en tu cuenta de Google si iniciaste sesión.', inputs, values: Object.fromEntries(inputs.map(i => [i.key, i.value])), plots: [], hlines: [], objects: [], shapes: [], onApply: res => {
    const v = res.inputs, o = {};
    if (!v.reset) for (const i of inputs) { if (i.key === 'reset') continue; const x = v[i.key]; if (x === undefined) continue; const dflt = i.key === 'bg' ? bgDef : i.key === 'grid' ? lineDef : (i.key === 'upBorder' ? (v.up || CHART_DEF.up) : i.key === 'downBorder' ? (v.down || CHART_DEF.down) : i.key === 'upWick' ? (v.up || CHART_DEF.up) : i.key === 'downWick' ? (v.down || CHART_DEF.down) : i.def); if (x !== dflt) o[i.key] = x; }
    state.chartStyle = sanChartStyle(o); save(); scheduleRender(); toast(v.reset ? 'Aspecto restablecido' : 'Aspecto aplicado');
  }}, () => jcopy(state.chartStyle), s0 => { state.chartStyle = s0; scheduleRender(); }));
}
function ctypeLabel() { const c = CTYPES.find(x => x[0] === state.ctype) || CTYPES[0]; return I(c[2], 16) + ' ' + c[1]; }
function syncCtypeBtn() { const b = $('#ctypeBtn'); if (b) b.innerHTML = ctypeLabel(); }
$('#ctypeBtn').onclick = e => {
  e.stopPropagation(); const old = $('#ctypeMenu'); if (old) { old.remove(); return; }
  const m = document.createElement('div'); m.id = 'ctypeMenu'; m.className = 'pop-menu';
  m.innerHTML = CTYPES.map(c => `<button data-ct="${c[0]}" class="${state.ctype === c[0] ? 'on' : ''}"><span>${I(c[2], 16)}</span>${c[1]}</button>`).join('');
  const b = e.currentTarget.getBoundingClientRect(); document.body.appendChild(m);
  m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, b.left)) + 'px'; m.style.top = Math.min(innerHeight - m.offsetHeight - 8, b.bottom + 6) + 'px';
  m.onclick = ev => { const k = ev.target.closest('[data-ct]'); if (!k) return; state.ctype = k.dataset.ct; save(); syncCtypeBtn(); render(); m.remove(); };
  setTimeout(() => document.addEventListener('click', function f() { m.remove(); document.removeEventListener('click', f); }), 0);
};
syncCtypeBtn();
let haCache = {n: 0, t: 0, c: 0, arr: null};
function haSeries() { // Heikin Ashi: velas suavizadas; se recalcula solo si cambian las velas
  const n = candles.length, l = candles[n - 1]; if (haCache.arr && haCache.n === n && haCache.t === candles[0].t && haCache.c === l.c && haCache.h === l.h && haCache.l === l.l) return haCache.arr;
  const a = new Array(n); let po = candles[0].o, pc = candles[0].c;
  for (let i = 0; i < n; i++) { const d = candles[i], c = (d.o + d.h + d.l + d.c) / 4, o = i ? (po + pc) / 2 : (d.o + d.c) / 2; a[i] = {t: d.t, o, c, h: Math.max(d.h, o, c), l: Math.min(d.l, o, c), v: d.v}; po = o; pc = c; }
  haCache = {n, t: candles[0].t, c: l.c, h: l.h, l: l.l, arr: a}; return a;
}
function renderCore() {
  if (currentView !== 'chartView') return;
  const el = $('#priceCanvas'); if (!el.getBoundingClientRect().width) return;
  const {w, h} = setupCanvas();
  const css = getComputedStyle(document.body);
  const text = css.getPropertyValue('--muted').trim(), line = css.getPropertyValue('--line').trim(), bg = css.getPropertyValue('--bg').trim(), drawCol = css.getPropertyValue('--draw').trim() || '#e9c36e', fg = css.getPropertyValue('--text').trim();
  syncNovaCols(); const CS = cstyle(), up = CS.up, down = CS.down;
  g.clearRect(0, 0, w, h); if (CS.bg) { g.fillStyle = CS.bg; g.fillRect(0, 0, w, h); }
  const gridCol = CS.grid || line; grips = []; paneHit = []; { const sk = state.symbol + '|' + state.interval; if (paneMan._k !== sk) { paneMan = {_k: sk}; for (const [k, v] of Object.entries(paneManSaved)) paneMan[k] = {min: v[0], max: v[1]}; } }
  const n = candles.length; if (!n) { geo = null; return; }

  const pineKeyNow = `${state.symbol}|${state.interval}|${candles[0].t}`;
  legRows = []; legN = 0;
  const prAll = activePine().filter(p => pineVisibleOn(p, state.interval)).map(p => ({p, r: pineStyled(pineRes[p.sid], p)})).filter(x => x.r && x.r.ok && x.r._key === pineKeyNow), pr = prAll.filter(x => !x.p.hide), pHid = prAll.filter(x => x.p.hide);
  const paneOf = x => x.p.pane || (x.r.meta.overlay ? 'main' : 'bottom'); // dónde se dibuja cada script: sobre el precio, en un panel arriba o en un panel abajo
  const pOver = pr.filter(x => paneOf(x) === 'main'), pSub = pr.filter(x => paneOf(x) === 'bottom'), pTop = pr.filter(x => paneOf(x) === 'top');
  const SH = symHeadH(); document.getElementById('chartArea').style.setProperty('--sh', SH + 'px'); // la franja con el nombre y el precio de la moneda va arriba del gráfico
  const CBH = (() => { // PC: la franja de temporalidades y botones va encima del gráfico (cristal translúcido); el precio empieza debajo de ella
    const v = $('#chartView'), b = v && v.querySelector('.chart-bar'), tb = $('#chartTabs'), on = deskMQ.matches && !document.body.classList.contains('pane') && b && b.offsetParent !== null, hh = on ? b.offsetHeight + (tb && tb.offsetParent !== null ? tb.offsetHeight : 0) : 0; // también la franja de pestañas (cristal translúcido)
    if (v && v.style.getPropertyValue('--cbh') !== hh + 'px') v.style.setProperty('--cbh', hh + 'px'); return hh; })();
  const left = 6, axisH = 22, top0 = 6 + CBH; let right = 64;
  if (!deskMQ.matches && candles.length) { // celular: la columna de precios solo tan ancha como sus números (poco margen)
    g.font = '10px system-ui'; const lc = candles[candles.length - 1].c; let mw = 0;
    for (const v of [lc, lc * 1.02, lc * .98]) mw = Math.max(mw, g.measureText(fmt(v)).width);
    right = Math.max(38, Math.min(64, Math.ceil(mw) + 11));
  }
  const psc = paneScale, hasTbl = prAll.some(x => x.r.tables && x.r.tables.length && !x.r.plots.length && !(x.r.shapes || []).length && !x.p.hide), rsiH0 = stdOn('rsi') ? Math.round(Math.max(70, h * (hasTbl ? .1 : .16))) : 0, volH0 = 0; // el volumen ya no tiene panel propio: se dibuja sobre las velas, abajo del gráfico
  paneRefH = Math.max(1, h - axisH - top0); const PHX = {}; for (const [k, v] of Object.entries(paneH)) PHX[k] = v > 0 && v <= 1 ? Math.round(v * paneRefH) : v; // alturas guardadas como proporción → mismo tamaño relativo en cualquier ventana
  const cap = Math.max(40, h - axisH - 80 - top0); let rsiH = rsiH0 && PHX.rsi ? clamp(PHX.rsi, 40, cap) : rsiH0, volH = volH0 && PHX.vol ? clamp(PHX.vol, 36, cap) : volH0;
  const panelKeys = [...PANELS.filter(k => stdOn(k) && ind[k]), ...pSub.map(x => 'pine:' + x.p.sid)];
  const isC = k => PHX[k] > 0;
  const tblOnly = x => !!(x && x.r && x.r.tables && x.r.tables.length && !x.r.plots.length && !(x.r.shapes || []).length);
  const tblW = panelKeys.length + pTop.length > 3 ? 2 : 4, wBot = panelKeys.map(k => k.startsWith('pine:') && tblOnly(pr.find(x => 'pine:' + x.p.sid === k)) ? tblW : 1), wTop = pTop.map(x => tblOnly(x) ? tblW : 1), wSum = wBot.map((x, i) => isC(panelKeys[i]) ? 0 : x).concat(wTop.map((x, i) => isC('pine:' + pTop[i].p.sid) ? 0 : x)).reduce((a, b) => a + b, 0), nAuto = panelKeys.filter(k => !isC(k)).length + pTop.filter(x => !isC('pine:' + x.p.sid)).length, customSum = panelKeys.filter(isC).reduce((s2, k) => s2 + clamp(PHX[k], 40, cap), 0) + pTop.filter(x => isC('pine:' + x.p.sid)).reduce((s2, x) => s2 + clamp(PHX['pine:' + x.p.sid], 40, cap), 0);
  const panelBudget = Math.max(0, Math.min(h - axisH - (wSum > nAuto ? 120 : 170) - rsiH - volH - customSum, h * Math.min(.85, .6 + (psc - 1) * .25 + (wSum > nAuto ? .2 : 0)) - rsiH - volH - customSum));
  const unitH = wSum ? Math.max(56, Math.min(clamp(h * .16, 52, 110) * psc, panelBudget / wSum)) : 0; let hBot = wBot.map((x, i) => isC(panelKeys[i]) ? Math.round(clamp(PHX[panelKeys[i]], 40, cap)) : Math.round(Math.max(56, unitH * x))), hTop = wTop.map((x, i) => isC('pine:' + pTop[i].p.sid) ? Math.round(clamp(PHX['pine:' + pTop[i].p.sid], 40, cap)) : Math.round(Math.max(56, unitH * x)));
  { // todos los paneles (volumen, RSI, los de abajo y los de arriba) deben caber en el lienzo: si no, el último (p. ej. el oscilador) quedaba fuera de pantalla y parecía que no se había agregado
    const sum = a => a.reduce((x, y) => x + y, 0), minPlot = Math.max(110, Math.round(h * .3)), room = Math.max(0, h - axisH - top0 - minPlot), tot = rsiH + volH + sum(hBot) + sum(hTop);
    if (tot > room && tot > 0) {
      const k = room / tot, fl = (v, f) => v ? Math.max(f, Math.round(v * k)) : 0;
      let f = 36; const apply = () => { rsiH = fl(rsiH0 && rsiH, f); volH = fl(volH0 && volH, f); hBot = hBot.map(v => fl(v, f)); hTop = hTop.map(v => fl(v, f)); };
      const r0 = rsiH, v0 = volH, b0 = hBot.slice(), t0 = hTop.slice(); apply();
      if (rsiH + volH + sum(hBot) + sum(hTop) > Math.max(room, h - axisH - top0 - 80)) { f = 24; rsiH = r0; volH = v0; hBot = b0; hTop = t0; apply(); } // muchos paneles: se reduce el mínimo antes de dejar que alguno desaparezca
    }
  }
  const offOf = arr => arr.map((_, i) => arr.slice(0, i).reduce((a, b) => a + b, 0)), oBot = offOf(hBot), oTop = offOf(hTop);
  const extraH = hBot.reduce((a, b) => a + b, 0), topH = hTop.reduce((a, b) => a + b, 0), plotTop = top0 + topH;
  // Espacio a la derecha de la última vela para lo que un script Pine dibuja en barras «futuras» (p. ej. el perfil de volumen del Nova Nexus,
  // que se coloca varias decenas de barras después de la última vela). Se mide con lo que el script realmente genera, así que no se reserva nada si no hay nada ahí.
  const aheadBars = (() => {
    let m = 0; const N = n - 1, f = v => { if (Number.isFinite(v) && v > N && v < N + 400 && v - N > m) m = v - N; };
    for (const {r} of pOver) { for (const b of r.boxes || []) { f(b.l); f(b.r); } for (const l of r.lines || []) { f(l.x1); f(l.x2); } for (const l of r.labels || []) f(l.x); for (const pl of r.polylines || []) for (const q of pl.pts || []) f(q && q[0]); }
    return m;
  })();
  // Margen estable: guarda cuántas barras «futuras» dibuja cada script y, mientras el script aún se calcula (tarda unos segundos), reserva ese mismo margen
  // para que el gráfico no se encoja de golpe cuando llegue el resultado.
  const aheadEff = (() => {
    let mem = {}; try { mem = JSON.parse(localStorage.getItem('cct_ahead') || '{}') || {}; } catch {}
    let m = aheadBars, dirty = false;
    for (const {p, r} of pOver) { let a = 0; const N = n - 1, f = v => { if (Number.isFinite(v) && v > N && v < N + 400 && v - N > a) a = v - N; }; for (const b of r.boxes || []) { f(b.l); f(b.r); } for (const l of r.lines || []) { f(l.x1); f(l.x2); } for (const l of r.labels || []) f(l.x); a = Math.round(a); if (mem[p.sid] !== a) { mem[p.sid] = a; dirty = true; } }
    for (const p of activePine()) if (pineVisibleOn(p, state.interval) && !p.hide && !prAll.some(x => x.p === p) && mem[p.sid] > m) m = mem[p.sid];
    if (dirty) { try { localStorage.setItem('cct_ahead', JSON.stringify(mem)); } catch {} }
    return m;
  })();
  const plotW0 = w - left - right, count0 = clamp(visible, 15, 400);
  const pineG = aheadEff ? clamp(Math.round(plotW0 * aheadEff / (count0 + aheadEff)) + 8, 0, Math.round(plotW0 * .5)) : 0;
  const vpOn = !!(state.indicators.nnVP && ind.vp), gutter = vpOn ? clamp(Math.round((w - left - right) * .4), 110, 300) : pineG; // margen derecho para el perfil
  const plotH = Math.max(80, h - axisH - rsiH - volH - extraH - plotTop), plotW = w - left - right - gutter;
  const count = clamp(visible, 15, 400);
  pan = clamp(pan, -Math.floor(count * .4), Math.max(0, n - Math.ceil(count * .3)));
  const end = n - pan, start = end - count, step = plotW / count;
  // Al mover el gráfico hacia atrás, las últimas velas pasan al margen derecho (el que se reserva para el perfil de volumen): se siguen dibujando ahí, por debajo del perfil,
  // en vez de desaparecer (antes se cortaban justo donde empezaba el margen y parecía que un cuadro negro las tapaba).
  const lo = Math.max(0, Math.floor(start)), hi = Math.min(n, Math.ceil(end) + (gutter > 0 ? Math.ceil(gutter / step) + 1 : 0));
  if (hi <= lo) return;

  let min = Infinity, max = -Infinity;
  for (let i = lo; i < hi; i++) { if (candles[i].l < min) min = candles[i].l; if (candles[i].h > max) max = candles[i].h; }
  const pineOff = [];
  for (const {r} of pOver) { const c = CCTPineDraw.contrib(r, lo, hi, min, max); if (Number.isFinite(c.min)) { min = Math.min(min, c.min); max = Math.max(max, c.max); } pineOff.push(...c.off); }
  // cajas dibujadas en barras «futuras» (el perfil de volumen): su rango de precios entra en el autoajuste para que se vean todos los niveles y no solo los que caen en las velas visibles
  for (const {r} of pOver) for (const b of r.boxes || []) { if (Math.max(b.l, b.r) > n + .5 && Math.max(b.l, b.r) < n + 400 && Number.isFinite(b.t) && Number.isFinite(b.b) && b.t > min / 3 && b.t < max * 3 && b.b > min / 3 && b.b < max * 3) { min = Math.min(min, b.t, b.b); max = Math.max(max, b.t, b.b); } }
  const overlays = [];
  if (stdOn('ema20')) overlays.push([`EMA ${sp('ema20', 'len')}`, ind.ema20, sp('ema20', 'color'), false, 'ema20', lineSty('ema20')]);
  if (stdOn('ema50')) overlays.push([`EMA ${sp('ema50', 'len')}`, ind.ema50, sp('ema50', 'color'), false, 'ema50', lineSty('ema50')]);
  if (stdOn('sma200')) overlays.push([`SMA ${sp('sma200', 'len')}`, ind.sma200, sp('sma200', 'color'), false, 'sma200', lineSty('sma200')]);
  if (stdOn('wma20') && ind.wma20) overlays.push([`WMA ${sp('wma20', 'len')}`, ind.wma20, sp('wma20', 'color'), false, 'wma20', lineSty('wma20')]);
  if (stdOn('vwap') && ind.vwap) overlays.push(['VWAP', ind.vwap, sp('vwap', 'color'), false, 'vwap', lineSty('vwap')]);
  if (stdOn('supertrend') && ind.stUp) overlays.push(['Supertrend ↑', ind.stUp, sp('supertrend', 'up'), false, null, {w: sp('supertrend', 'width'), d: []}], ['Supertrend ↓', ind.stDn, sp('supertrend', 'down'), false, null, {w: sp('supertrend', 'width'), d: []}]);
  if (stdOn('donchian') && ind.donchian) { const c0 = sp('donchian', 'color'), ls = lineSty('donchian'); overlays.push(['Donchian', ind.donchian.up, c0, false, 'donchian', ls], ['Donchian inf', ind.donchian.lo, c0, false, null, ls], ['Donchian medio', ind.donchian.mid, c0, false, null, {w: 1, d: [4, 4]}]); }
  if (stdOn('keltner') && ind.keltner) { const c0 = sp('keltner', 'color'), ls = lineSty('keltner'); overlays.push(['Keltner', ind.keltner.up, c0, false, 'keltner', ls], ['Keltner inf', ind.keltner.lo, c0, false, null, ls], ['Keltner medio', ind.keltner.mid, c0, false, null, {w: 1, d: [4, 4]}]); }
  if (stdOn('ichimoku') && ind.ichimoku) { const w = sp('ichimoku', 'width'), I2 = ind.ichimoku; overlays.push(['Ichimoku', I2.tenkan, sp('ichimoku', 'cT'), false, 'ichimoku', {w, d: []}], ['Kijun', I2.kijun, sp('ichimoku', 'cK'), false, null, {w, d: []}], ['Chikou', I2.chikou, sp('ichimoku', 'cC'), false, null, {w: 1, d: []}], ['Senkou A', I2.spanA, sp('ichimoku', 'cUp').slice(0, 7), false, null, {w: 1, d: []}], ['Senkou B', I2.spanB, sp('ichimoku', 'cDn').slice(0, 7), false, null, {w: 1, d: []}]); }
  if (stdOn('bollinger')) overlays.push(['BB sup', ind.bbU, sp('bollinger', 'color'), false, 'bollinger', lineSty('bollinger')], ['BB inf', ind.bbL, sp('bollinger', 'color'), false, null, lineSty('bollinger')]);
  for (const k of Object.keys(state.indicators)) { if (!isCopy(k) || !stdOn(k) || !ind[k]) continue; // copias: EMA 2, SMA 2, Bollinger 2…
    if (baseOf(k) === 'bollinger') overlays.push([stdName(k), ind[k].up, sp(k, 'color'), false, k, lineSty(k)], [stdName(k) + ' inf', ind[k].lo, sp(k, 'color'), false, null, lineSty(k)]);
    else overlays.push([stdName(k), ind[k], sp(k, 'color'), false, k, lineSty(k)]); }
  for (const [, arr] of overlays) for (let i = lo; i < hi; i++) if (arr[i] != null) { if (arr[i] < min) min = arr[i]; if (arr[i] > max) max = arr[i]; }
  if (state.indicators.nnTrail && ind.trail) for (let i = lo; i < hi; i++) { const v = ind.trail.trail[i]; if (v != null) { if (v < min) min = v; if (v > max) max = v; } }
  const nn = ind.nn;
  if (nn && state.indicators.nnEma) for (let i = lo; i < hi; i++) { const a = nn.emaTop[i], b = nn.emaBot[i]; if (Number.isFinite(a) && a > max) max = a; if (Number.isFinite(b) && b < min) min = b; }
  if (stdOn('patterns') && ind.pat) for (const q of ind.pat.list) { for (const t of q.pts) if (t.i >= lo && t.i < hi) { if (t.p < min) min = t.p; if (t.p > max) max = t.p; } if (q.prz && q.pts.length && q.pts[q.pts.length - 1].i >= lo) { min = Math.min(min, q.prz.lo); max = Math.max(max, q.prz.hi); } }
  const range = Math.max(max - min, Math.abs(max) * 1e-5), pad = range * (stdOn('patterns') && ind.pat && ind.pat.list.length ? .15 : .08); // con patrones, más aire arriba y abajo para las etiquetas min -= pad; max += pad;
  if (priceMan) { min = priceMan.min; max = priceMan.max; }
  { const lb = document.querySelector('.chart-label'); if (lb) lb.style.top = (topH + 8) + 'px'; } // la leyenda del precio baja si hay paneles arriba
  // Orden de los paneles: los de abajo (RSI + resto) y los de arriba se apilan según lo que el usuario arrastró; sin orden guardado, queda el de siempre
  const hMap = {}; if (rsiH) hMap.rsi = rsiH; panelKeys.forEach((k, i) => { hMap[k] = hBot[i]; }); pTop.forEach((x, i) => { hMap['pine:' + x.p.sid] = hTop[i]; });
  const botOrd = orderPanes([...(rsiH ? ['rsi'] : []), ...panelKeys]), topOrd = orderPanes(pTop.map(x => 'pine:' + x.p.sid));
  const posOf = (ord, base) => { const m = {}; let yy = base; for (const k of ord) { m[k] = yy; yy += hMap[k]; } return m; };
  const botY = posOf(botOrd, plotTop + plotH + volH), topY = posOf(topOrd, top0);
  paneLayout = {bot: botOrd.map(k => ({key: k, h: hMap[k]})), top: topOrd.map(k => ({key: k, h: hMap[k]}))};
  geo = {w, h, left, right, gutter, vpOn, axisH, plotTop, plotH, plotW, count, start, end, step, min, max, volTop: plotTop + plotH, rsiTop: rsiH ? botY.rsi : plotTop + plotH + volH, extraTop: plotTop + plotH + volH};
  { const bf = document.querySelector('.brand-fab'); if (bf && volH > 0) { bf.style.bottom = 'auto'; bf.style.top = Math.max(plotTop, plotTop + plotH + volH - 40) + 'px'; } else if (bf) { bf.style.bottom = 'auto'; bf.style.top = (plotTop + plotH - 42) + 'px'; } } // logo abajo a la izquierda, a la altura del panel de volumen

  // VPVR: perfil de volumen de las velas que se ven ahora mismo (índices cuyo centro cae dentro del área de precios); se recalcula en cada dibujo, así sigue al desplazar y al hacer zoom
  const vpvr = stdOn('vpvr') && window.CCTIndicators ? CCTIndicators.visibleRangeProfile(candles, Math.ceil(start - .5), Math.floor(end - .5 + (vpOn ? 0 : gutter) / step), {rows: sp('vpvr', 'rows'), valueArea: sp('vpvr', 'va')}) : null;
  if (volH) grips.push({key: 'vol', y: geo.volTop, dir: 'up', h: volH});
  if (rsiH) grips.push({key: 'rsi', y: geo.rsiTop, dir: 'up', h: rsiH});
  panelKeys.forEach((k, i) => grips.push({key: k, y: botY[k], dir: 'up', h: hBot[i]}));
  pTop.forEach((x, i) => grips.push({key: 'pine:' + x.p.sid, y: topY['pine:' + x.p.sid] + hTop[i], dir: 'down', h: hTop[i]}));
  // cuadrícula y escala de precios
  g.font = '10px system-ui'; g.textAlign = 'left'; g.lineWidth = .6;
  for (let i = 0; i <= 4; i++) {
    const yy = plotTop + i * plotH / 4, pr = max - (max - min) * i / 4;
    if (CS.gridH) { g.strokeStyle = gridCol; g.beginPath(); g.moveTo(left, yy); g.lineTo(w - right + 2, yy); g.stroke(); }
    g.fillStyle = text; g.fillText(fmt(pr), w - right + 6, yy + 3);
  }
  // eje de tiempo
  const stride = Math.max(1, Math.ceil(70 / step));
  g.fillStyle = text; g.textAlign = 'center';
  for (let i = Math.ceil(lo / stride) * stride; i < hi; i += stride) {
    const xx = X(i); if (xx < left + 14 || xx > w - right - 14) continue;
    if (CS.gridV) { g.strokeStyle = gridCol; g.beginPath(); g.moveTo(xx, top0 - CBH); g.lineTo(xx, plotTop + plotH + volH + rsiH + extraH); g.stroke(); }
    g.fillText(timeLabel(candles[i].t, i > 0 ? candles[i - 1].t : null), xx, h - 7);
  }
  g.textAlign = 'left';

  g.save(); g.beginPath(); { const ex = topH ? 0 : CBH; g.rect(left, plotTop - ex, plotW + 2 + (vpOn ? 0 : pineG), plotH + ex); } g.clip(); // sin paneles arriba, las velas también se ven bajo la franja de cristal
  // Nova Nexus · EMA Cloud (detrás de las velas)
  if (nn && state.indicators.nnEma) drawNovaCloud(nn, lo, hi, css);
  if (nn && nn.smc && state.indicators.nnOb) drawNovaOB(nn.smc);
  if (state.indicators.nnRev && ind.rev) drawNovaRev(ind.rev, lo, hi);
  if (state.indicators.nnSR && ind.sr) drawNovaSRBoxes(ind.sr, lo, hi);
  if (state.indicators.nnPiv && ind.piv) drawNovaPivots(ind.piv, lo, hi);
  if (state.indicators.nnLiq && ind.liq) drawNovaLiq(ind.liq, lo, hi, fg);
  if (vpOn) drawNovaVPZone(ind.vp);
  if (state.indicators.nnTrail && ind.trail) drawNovaTrailFill(ind.trail, lo, hi);
  { // zonas anchas de Pine (POC, área de valor, sentimiento) DETRÁS de las velas; antes se dibujaban encima y las tapaban al acercarse al perfil
    const none = {plots: [], shapes: [], lines: [], labels: [], polylines: [], hlines: [], fills: [], bgcolors: [], barcolors: [], candles: [], linefills: [], tables: [], strategy: null};
    for (const {r} of pOver) CCTPineDraw.draw(g, Object.assign({}, r, none), {X, Y, lo, hi, left, right: left + plotW + (vpOn ? 0 : pineG), top: plotTop, bottom: plotTop + plotH, step, candles, overlay: true, pass: 'back'});
  }
  if (stdOn('liqmap') && ind.lm) drawLiqMap(ind.lm, lo, hi);
  if (vpvr) drawVPVR(vpvr); // detrás de las velas, como en TradingView
  // velas
  const barW = clamp(step * .66, 1.5, 16), limeBars = !!(state.indicators.nnLiq && state.indicators.nnLiqBars && ind.liq);
  if (stdOn('volume') && candles.length) { // volumen en el mismo panel de las velas: barras al fondo (detrás de las velas), ocupan el ~18 % inferior
    const vBot = plotTop + plotH, vH = Math.round(plotH * .18); let maxV = 1;
    for (let i = lo; i < hi; i++) if (candles[i]) maxV = Math.max(maxV, candles[i].v);
    for (let i = lo; i < hi; i++) { const d = candles[i]; if (!d) continue; g.fillStyle = d.c >= d.o ? (sp('volume', 'up') === '#089981aa' ? up + '55' : sp('volume', 'up')) : (sp('volume', 'down') === '#f23645aa' ? down + '55' : sp('volume', 'down')); const bh = Math.max(1, d.v / maxV * vH); g.fillRect(X(i) - clamp(step * .66, 1.5, 16) / 2, vBot - bh, clamp(step * .66, 1.5, 16), bh); }
  }
  const pineBar = {};
  for (const {r} of pr) for (const e of r.barcolors) for (const [bar, ci] of e.pts) pineBar[bar + (e.offset || 0)] = r.palette[ci];
  const ct = state.ctype || 'candles';
  if (ct === 'line' || ct === 'area' || ct === 'step') { // líneas de cierre
    const lc = up; g.save(); g.lineWidth = 2; g.lineJoin = 'round'; g.strokeStyle = lc; g.beginPath(); let st0 = false, lx = 0, ly = 0;
    for (let i = lo; i < hi; i++) { const xx = X(i), yy = Y(candles[i].c); if (!st0) { g.moveTo(xx, yy); st0 = true; } else if (ct === 'step') { g.lineTo(xx, ly); g.lineTo(xx, yy); } else g.lineTo(xx, yy); lx = xx; ly = yy; }
    g.stroke();
    if (ct === 'area' && st0) { const gr = g.createLinearGradient(0, plotTop, 0, plotTop + plotH); gr.addColorStop(0, lc + '55'); gr.addColorStop(1, lc + '00'); g.lineTo(lx, plotTop + plotH); g.lineTo(X(lo), plotTop + plotH); g.closePath(); g.fillStyle = gr; g.fill(); }
    g.restore();
  } else {
    const src = ct === 'ha' ? haSeries() : candles, hollowT = ct === 'hollow' || CS.hollow;
    for (let i = lo; i < hi; i++) {
      const d = src[i], xx = X(i), pc = pineBar[i], lcol = limeBars && candles[i].t > ind.liq.after, col = pc || (lcol ? '#00e676' : d.c >= d.o ? up : down), yo = Y(d.o), yc = Y(d.c);
      const isUp = d.c >= d.o, custom = !pc && !lcol, wk = custom ? (isUp ? CS.upWick : CS.downWick) || col : col, bd = custom ? (isUp ? CS.upBorder : CS.downBorder) || col : col;
      if (ct === 'bars' || ct === 'hlc') { // barras: palito con marca de apertura (izq.) y cierre (der.)
        const tk = Math.max(2, Math.min(7, barW / 2)); g.strokeStyle = col; g.lineWidth = Math.max(1, Math.min(2, barW / 5)); g.beginPath(); g.moveTo(xx, Y(d.h)); g.lineTo(xx, Y(d.l));
        if (ct === 'bars') { g.moveTo(xx - tk, yo); g.lineTo(xx, yo); } g.moveTo(xx, yc); g.lineTo(xx + tk, yc); g.stroke(); continue;
      }
      g.lineWidth = 1; g.strokeStyle = wk; g.beginPath(); g.moveTo(xx, Y(d.h)); g.lineTo(xx, Y(d.l)); g.stroke();
      if (custom && hollowT && isUp) { g.strokeStyle = bd; g.strokeRect(xx - barW / 2 + .5, Math.min(yo, yc) + .5, Math.max(1, barW - 1), Math.max(1, Math.abs(yo - yc) - 1)); }
      else { g.fillStyle = col; g.fillRect(xx - barW / 2, Math.min(yo, yc), barW, Math.max(1, Math.abs(yo - yc))); if (custom && bd !== col) { g.strokeStyle = bd; g.strokeRect(xx - barW / 2 + .5, Math.min(yo, yc) + .5, Math.max(1, barW - 1), Math.max(1, Math.abs(yo - yc) - 1)); } }
    }
  }
  // medias y bandas
  if (stdOn('bollinger') && ind.bbU && sp('bollinger', 'fill') !== '#748bab00') fillBetween(ind.bbU, ind.bbL, lo, hi, sp('bollinger', 'fill'), 1);
  for (const k of copyKeys('bollinger')) if (stdOn(k) && ind[k] && sp(k, 'fill') !== '#748bab00') fillBetween(ind[k].up, ind[k].lo, lo, hi, sp(k, 'fill'), 1);
  if (stdOn('donchian') && ind.donchian && sp('donchian', 'fill') !== '#4dd0e100') fillBetween(ind.donchian.up, ind.donchian.lo, lo, hi, sp('donchian', 'fill'), 1);
  if (stdOn('keltner') && ind.keltner && sp('keltner', 'fill') !== '#f5c56800') fillBetween(ind.keltner.up, ind.keltner.lo, lo, hi, sp('keltner', 'fill'), 1);
  if (stdOn('ichimoku') && ind.ichimoku) { // nube: verde cuando Senkou A > Senkou B, roja cuando no
    const A = ind.ichimoku.spanA, B = ind.ichimoku.spanB, tU = [], bU = [], tD = [], bD = [];
    for (let i = 0; i < A.length; i++) { const a = A[i], b = B[i]; if (a == null || b == null) { tU[i] = bU[i] = tD[i] = bD[i] = null; continue; } if (a >= b) { tU[i] = a; bU[i] = b; tD[i] = bD[i] = null; } else { tD[i] = b; bD[i] = a; tU[i] = bU[i] = null; } }
    fillBetween(tU, bU, lo, hi, sp('ichimoku', 'cUp'), 1); fillBetween(tD, bD, lo, hi, sp('ichimoku', 'cDn'), 1);
  }
  for (const [, arr, col, , , sty] of overlays) {
    g.strokeStyle = col; g.lineWidth = sty ? sty.w : 1.4; g.setLineDash(sty ? sty.d : []); g.beginPath();
    let on = false;
    for (let i = lo; i < hi; i++) { if (arr[i] == null) { on = false; continue; } const xx = X(i), yy = Y(arr[i]); if (!on) { g.moveTo(xx, yy); on = true; } else g.lineTo(xx, yy); }
    g.stroke(); g.setLineDash([]);
  }
  if (stdOn('psar') && ind.psar) { const P = ind.psar, cu = sp('psar', 'up'), cd = sp('psar', 'down'), rr = clamp(step * .22, 1.3, 3); for (let i = lo; i < hi; i++) { if (P.v[i] == null) continue; g.fillStyle = P.dir[i] > 0 ? cu : cd; g.beginPath(); g.arc(X(i), Y(P.v[i]), rr, 0, 7); g.fill(); } }
  for (const {r} of pOver) CCTPineDraw.draw(g, r, {X, Y, lo, hi, left, right: left + plotW + (vpOn ? 0 : pineG), top: plotTop, bottom: plotTop + plotH, step, candles, overlay: true, zoneBack: true});
  for (const {r} of pSub.concat(pTop)) if (r.strategy) CCTPineDraw.drawTrades(g, r.strategy, {X, Y, lo, hi, candles}); // estrategias con panel propio: las operaciones se marcan igual sobre el precio
  if (state.indicators.nnTrail && ind.trail) drawNovaTrailLine(ind.trail, lo, hi);
  if (state.indicators.nnSR && ind.sr) drawNovaSRLabels(ind.sr, lo, hi);
  if (stdOn('dchan') && ind.dch) drawChannels(ind.dch.list);
  if (stdOn('patterns') && ind.pat) drawPatterns(ind.pat.list);
  // cruces EMA 20 / EMA 50
  if (stdOn('cross') && ind.cross) {
    g.font = 'bold 11px system-ui'; g.textAlign = 'center';
    for (let i = lo; i < hi; i++) {
      const k = ind.cross[i]; if (!k) continue;
      g.fillStyle = k > 0 ? '#089981' : '#f23645';
      g.fillText(k > 0 ? '▲' : '▼', X(i), k > 0 ? Y(candles[i].l) + 14 : Y(candles[i].h) - 6);
    }
    g.textAlign = 'left';
  }
  // Nova Nexus · señales y niveles TP/SL
  if (nn && (state.indicators.nnIa || state.indicators.nnTp)) drawNovaSignals(nn, lo, hi, n);
  if (nn && nn.smc && state.indicators.nnSmc) drawNovaStruct(nn.smc);
  // dibujos del usuario
  if (!DOPT.hide) for (const d of getDrawings()) drawShape(d, d.id === selectedId, drawCol, text);
  const dPre = drawTool && !isBrushTool(drawTool) ? withLastStyle({id: '_', type: drawTool}) : {}, preCol = dPre.col || drawCol; // mientras se dibuja ya sale con el color, grosor y ajustes de la última vez
  if (pending2) drawShape({id: '_', type: 'trend', a: pending2.a, b: pending2.b, col: dPre.col, lw: dPre.lw, ds: dPre.ds}, false, drawCol, text);
  if (preview) drawShape({...dPre, a: preview.a, b: preview.b, c: preview.c}, false, drawCol, text);
  if (brushLive && brushLive.length > 1) drawBrush({type: 'brush', ...dBrushO(), pts: brushLive, col: state.brush.c, w: drawTool === 'highlighter' ? state.brush.w * 3 : state.brush.w, hl: drawTool === 'highlighter'}, false, drawCol);
  if (multi.length && MULTI[drawTool]) {
    const live = cross ? snapPoint(cross) : null, pts = multi.concat(live && multi.length < MULTI[drawTool].n ? [live] : []);
    drawShape({...dPre, a: pts[0], pts}, false, drawCol, text);
    g.fillStyle = preCol; for (const q of multi) { const P = px(q); g.beginPath(); g.arc(P.x, P.y, 5, 0, 7); g.fill(); }
  }
  if (pending) { const P = px(pending); g.fillStyle = preCol; g.beginPath(); g.arc(P.x, P.y, 5, 0, 7); g.fill(); }
  g.restore();

  // asas de agarre: barra derecha (escala de precio) e inferior (escala de tiempo)
  g.fillStyle = priceMan ? '#548fff' : text; g.globalAlpha = priceMan ? .95 : .55;
  roundRect(w - 7, plotTop + plotH / 2 - 22, 4, 44, 2); g.fill();
  g.fillStyle = text; g.globalAlpha = .55; roundRect(left + plotW / 2 - 22, h - 6, 44, 4, 2); g.fill(); g.globalAlpha = 1;
  // Nova Bot Lab: operaciones del bot sobre el gráfico (flechas, entrada/salida, stop, take profit). Solo dibuja; no toca nada del gráfico.
  if (botMarks && botMarks.trades && botMarks.symbol === symOf(state.symbol) && botMarks.interval === state.interval) {
    const M = botMarks, lim = M.limitT == null ? Infinity : M.limitT, shw = M.show || {};
    g.save(); g.beginPath(); g.rect(left, plotTop, plotW, plotH); g.clip(); g.font = '10px system-ui'; g.textAlign = 'center';
    for (const t of M.trades) {
      if (t.entryT > lim) continue; const xi = X(idxOfTime(t.entryT)), exited = t.exitT <= lim, xe = X(idxOfTime(exited ? t.exitT : Math.min(lim, candles[n - 1].t)));
      if (xe < left - 40 || xi > w - right + 40) continue; const long = t.side === 'long', win = t.net > 0, col = win ? '#17c964' : '#f31260', yi = Y(t.entry), ye = Y(t.exit);
      if (shw.levels !== false) {
        g.setLineDash([4, 4]); g.lineWidth = 1; g.globalAlpha = .75;
        if (isFinite(t.sl) && t.sl != null) { g.strokeStyle = '#f31260'; g.beginPath(); g.moveTo(xi, Y(t.sl)); g.lineTo(xe, Y(t.sl)); g.stroke(); }
        if (isFinite(t.tp) && t.tp != null) { g.strokeStyle = '#17c964'; g.beginPath(); g.moveTo(xi, Y(t.tp)); g.lineTo(xe, Y(t.tp)); g.stroke(); }
        if (exited) { g.setLineDash([]); g.globalAlpha = .55; g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.moveTo(xi, yi); g.lineTo(xe, ye); g.stroke(); }
      }
      g.setLineDash([]); g.globalAlpha = 1;
      if (shw.arrows !== false) {
        g.fillStyle = long ? '#17c964' : '#f31260'; const s = 7, ay = long ? Y(candles[Math.max(0, Math.min(n - 1, Math.round(idxOfTime(t.entryT))))].l) + 12 : Y(candles[Math.max(0, Math.min(n - 1, Math.round(idxOfTime(t.entryT))))].h) - 12;
        g.beginPath(); if (long) { g.moveTo(xi, ay - s); g.lineTo(xi - s * .8, ay + s * .5); g.lineTo(xi + s * .8, ay + s * .5); } else { g.moveTo(xi, ay + s); g.lineTo(xi - s * .8, ay - s * .5); g.lineTo(xi + s * .8, ay - s * .5); } g.closePath(); g.fill();
        g.beginPath(); g.arc(xi, yi, 3, 0, 7); g.fill();
        if (exited) { g.fillStyle = col; g.beginPath(); g.arc(xe, ye, 3.5, 0, 7); g.fill(); g.fillStyle = col; g.fillText((t.net >= 0 ? '+' : '') + t.net.toFixed(2), xe, ye + (long === win ? -9 : 14)); }
      }
    }
    if (M.avoid && shw.avoid !== false) { g.globalAlpha = .08; g.fillStyle = '#ffb020'; for (const z of M.avoid) { const x1 = X(idxOfTime(z[0])), x2 = X(idxOfTime(z[1])); if (z[0] <= lim) g.fillRect(x1, plotTop, Math.max(2, x2 - x1), plotH); } g.globalAlpha = 1; }
    g.restore();
  }
  // alertas de precio activas: línea casi invisible en su nivel (aspecto en «Aspecto del gráfico»); seleccionada se resalta y se puede arrastrar
  { const CS = cstyle(), acol = CS.alertCol || text, dsh = {Puntos: [2, 5], Guiones: [7, 5], 'Sólida': []}[CS.alertS] || [2, 5], A = CS.alertA / 100, lastP = candles[n - 1].c;
    g.save();
    const ln = (p, al, wd, dash) => { const ay = Math.round(Y(p)) + .5; if (!(ay > plotTop && ay < plotTop + plotH)) return null; g.globalAlpha = al; g.strokeStyle = acol; g.lineWidth = wd; g.setLineDash(dash); g.beginPath(); g.moveTo(left, ay); g.lineTo(w - right, ay); g.stroke(); return ay; };
    const tag = (ay, txt, solid) => { g.setLineDash([]); g.globalAlpha = solid ? .95 : .8; g.fillStyle = acol; g.fillRect(w - right + 2, ay - 9, right - 3, 18); g.globalAlpha = 1; g.fillStyle = bg || '#0d1019'; g.font = '11px system-ui'; g.textAlign = 'left'; g.fillText(txt, w - right + 5, ay + 3.5); };
    for (const a of state.alerts) {
      if (a.kind === 'ind' || !a.on || a.symbol !== state.symbol) continue;
      const sel = a.id === selAlertId, live = alDrag && alDrag.id === a.id;
      const ay = ln(a.price, live ? Math.min(A, .18) : sel ? Math.min(1, A + .45) : A, CS.alertW + (sel ? 1 : 0), live ? [4, 5] : dsh);
      if (ay != null && sel && !live) { tag(ay, fmt(a.price), true); g.setLineDash([]); g.globalAlpha = .9; g.fillStyle = acol; g.beginPath(); g.arc(left + 16, ay, 4.5, 0, 7); g.fill(); g.globalAlpha = 1; }
      if (live && alDrag.p != null) { const ny = ln(alDrag.p, .95, CS.alertW + 1, [6, 4]); if (ny != null) { const dl = (alDrag.p - lastP) / lastP * 100; tag(ny, fmt(alDrag.p), true); g.setLineDash([]); g.font = '11px system-ui'; g.globalAlpha = .9; g.fillStyle = acol; g.textAlign = 'left'; g.fillText(`${dl >= 0 ? '+' : ''}${dl.toFixed(2)}%`, left + 28, ny - 5); } }
    }
    g.restore(); }
  // profundidad del libro de órdenes: barras horizontales pegadas a la escala de precio (verde = compras, rojo = ventas, ★ = muro)
  if (window.CCTBook && CCTBook.overlayOn() && !replay) { const DL = CCTBook.levels(PRICE(plotTop + plotH), PRICE(plotTop), Math.max(20, Math.min(120, Math.round(plotH / 5)))); if (DL && DL.max > 0) {
    g.save(); const maxW = Math.min(170, plotW * .22), x1 = w - right - 2, bh = Math.max(1, Math.abs(Y(DL.lo) - Y(DL.lo + DL.step)) - 1);
    for (const b of DL.bins) { if (!b.v) continue; const yy = Y(b.p), bw = Math.max(1, b.v / DL.max * maxW); g.globalAlpha = b.wall ? .55 : .22; g.fillStyle = b.side > 0 ? up : down; g.fillRect(x1 - bw, yy - bh / 2, bw, bh);
      if (b.wall) { g.globalAlpha = .9; g.font = '600 10px system-ui'; g.textAlign = 'right'; g.fillStyle = b.side > 0 ? up : down; g.fillText('★ ' + dvBig(b.v), x1 - bw - 4, yy + 3.5); } }
    g.restore(); } }
  // operaciones de la cuenta demo: entrada, TP, SL, órdenes y liquidación (se arrastran para moverlas; × las cierra o quita)
  trHit = [];
  if (window.CCTTrade && !replay) { const TL = CCTTrade.lines(state.symbol); if (TL.length) {
    g.save(); g.font = '600 11px system-ui'; const COL = {pos: null, tp: '#20bf9f', sl: '#f06b79', liq: '#f0b90b', ord: '#548fff'}, uFmt = v => (v >= 0 ? '+' : '−') + '$' + Math.abs(v).toFixed(2);
    for (const L of TL) {
      const dragNow = trDrag && trDrag.id === L.id && trDrag.kind === L.kind, price = dragNow && trDrag.p != null ? trDrag.p : L.price, yy = Math.round(Y(price)) + .5;
      if (!(yy > plotTop && yy < plotTop + plotH)) continue;
      const col = L.kind === 'pos' ? (L.side > 0 ? up : down) : COL[L.kind];
      g.globalAlpha = L.kind === 'liq' ? .55 : L.pend ? .6 : .9; g.strokeStyle = col; g.lineWidth = L.kind === 'pos' ? 1.4 : 1; g.setLineDash(L.kind === 'pos' ? [] : L.kind === 'liq' ? [2, 4] : [6, 4]);
      g.beginPath(); g.moveTo(left, yy); g.lineTo(w - right, yy); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      // etiqueta a la izquierda: texto · PnL · ×  (en posición también +TP / +SL)
      const parts = L.kind === 'pos' || L.kind === 'liq' ? [] : [{t: L.txt, k: 'lbl'}]; /* minimalista: la posición solo muestra PnL y botones; la liquidación solo su línea y el precio en la escala */ if (Number.isFinite(L.pnl)) parts.push({t: uFmt(L.pnl) + (L.sub ? ' ' + L.sub : ''), k: 'pnl', c: L.pnl >= 0 ? up : down});
      const cmp = !isDesktop(), key = L.id + '|' + L.kind, opened = trOpen === key;
      if (cmp) { // celular: una sola pastilla chica a la izquierda (PnL o TP/SL); al tocarla se despliegan +TP, +SL y ✕
        const pn = parts.find(q => q.k === 'pnl'); if (pn) { pn.k = 'more'; pn.t = uFmt(L.pnl); } else if (parts.length) parts[0].k = L.drag ? 'lbl' : 'more';
        if (!pn && L.x && parts[0] && L.drag) parts.push({t: '⋯', k: 'more'});
        if (opened) { if (L.addTp) parts.push({t: '+TP', k: 'addtp'}); if (L.addSl) parts.push({t: '+SL', k: 'addsl'}); if (L.x) parts.push({t: '✕', k: 'x'}); }
        g.font = '600 10px system-ui';
      } else { if (L.addTp) parts.push({t: '+TP', k: 'addtp'}); if (L.addSl) parts.push({t: '+SL', k: 'addsl'}); if (L.x) parts.push({t: '✕', k: 'x'}); }
      const pad = cmp ? 10 : 14, totW = parts.reduce((s0, q) => s0 + g.measureText(q.t).width + pad + 3, 0); let x0 = cmp ? left + 6 : Math.max(left + 8, w - right - 14 - totW); const hh = cmp ? 16 : 20, ty = yy - hh / 2; // PC: junto a la escala · celular: a la izquierda, chiquitas
      for (const pt of parts) {
        const tw = g.measureText(pt.t).width + pad, isBtn = pt.k !== 'lbl' && pt.k !== 'pnl';
        g.fillStyle = pt.k === 'lbl' ? col : isBtn ? (bg || '#0b0f18') : (bg || '#0b0f18'); g.globalAlpha = pt.k === 'lbl' ? .95 : .92; roundRect(x0, ty, tw, hh, 4); g.fill(); g.globalAlpha = 1;
        g.strokeStyle = col; g.lineWidth = 1; roundRect(x0 + .5, ty + .5, tw - 1, hh - 1, 4); g.stroke();
        g.fillStyle = pt.k === 'lbl' ? (L.kind === 'liq' ? '#1a1300' : '#fff') : pt.c || text; g.textAlign = 'left'; g.fillText(pt.t, x0 + pad / 2, yy + (cmp ? 3.5 : 4));
        if (pt.k !== 'pnl') trHit.push({x: x0, y: ty, w: tw, h: hh, id: L.id, kind: L.kind, act: pt.k === 'lbl' ? (L.drag ? 'drag' : 'sel') : pt.k});
        x0 += tw + 3;
      }
      g.font = '600 11px system-ui';
      g.fillStyle = col; g.fillRect(w - right + 2, yy - 9, right - 3, 18); g.fillStyle = L.kind === 'liq' ? '#1a1300' : '#fff'; g.font = '11px system-ui'; g.fillText(fmt(price), w - right + 5, yy + 3.5); g.font = '600 11px system-ui';
      if (L.drag) trHit.push({line: 1, yy, id: L.id, kind: L.kind});
    }
    g.restore();
  } }
  // etiqueta de último precio
  const lastC = candles[n - 1], ly = Y(lastC.c);
  if (ly > plotTop && ly < plotTop + plotH) {
    const col = lastC.c >= lastC.o ? up : down;
    g.strokeStyle = col; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(left, ly); g.lineTo(w - right + 2, ly); g.stroke(); g.setLineDash([]);
    g.fillStyle = col; g.fillRect(w - right + 2, ly - 9, right - 3, 18); g.fillStyle = '#fff'; g.fillText(fmt(lastC.c), w - right + 5, ly + 3.5);
    // tiempo que falta para que cierre la vela actual (texto pequeño debajo del precio)
    const cd = candleCountdown(lastC); if (cd != null && ly + 9 + 14 < plotTop + plotH + 14) {
      const f0 = g.font; g.font = '9.5px system-ui'; let tx = fmtCountdown(cd, true); if (g.measureText(tx).width > right - 8) tx = fmtCountdown(cd, false);
      g.globalAlpha = .55; g.fillStyle = col; g.fillRect(w - right + 2, ly + 9, right - 3, 13); g.globalAlpha = 1; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(tx, w - right + 2 + (right - 3) / 2, ly + 19); g.textAlign = 'left'; g.font = f0;
    }
  }
  if (vpvr) drawVPVRTags(vpvr); // etiquetas de POC / VAH / VAL en la escala de precios
  // leyenda de indicadores
  let ly2 = plotTop + 54 + SH; g.font = '12px system-ui'; const LS = legStep();
  // Cada indicador conserva SIEMPRE su lugar en la leyenda: al ocultarlo con el ojito queda en la misma fila (atenuado, «oculto») y no salta al final.
  const dimRow = (tx, act) => { g.globalAlpha = .5; g.fillStyle = text; legLabel(tx, left + 8, ly2, act, true); g.globalAlpha = 1; ly2 += LS; };
  const isHid = k => !!(state.indicators[k] && state.stdHide && state.stdHide[k]);
  const ovBy = {}; for (const o of overlays) if (o[4]) ovBy[o[4]] = o;
  const SLOTS = ['ema20', 'ema50', 'sma200', 'wma20', 'vwap', 'bollinger', 'donchian', 'keltner', 'ichimoku', 'psar', 'volume', 'patterns', 'dchan', 'liqmap', 'vpvr'], PLAIN = {psar: 'Parabolic SAR', volume: 'Volumen', patterns: 'Patrones', dchan: 'Canales dinámicos', liqmap: 'Liquidaciones', vpvr: 'VPVR'};
  const legItems = [], addLeg = (id, fn) => legItems.push({id, fn});
  for (const k of SLOTS.flatMap(b => [b, ...(COPYABLE[b] ? copyKeys(b) : [])])) {
    if (!state.indicators[k]) continue;
    const id = 'm:' + k; // el nombre de cada indicador de la leyenda se puede mover: se ordenan por lo que el usuario arrastró
    if (!isHid(k) && !ovBy[k] && !(PLAIN[k] && (k !== 'volume' || candles.length))) continue;
    addLeg(id, () => {
      if (isHid(k)) { dimRow(stdName(k), {t: 'std', key: k, mid: id}); return; }
      if (ovBy[k]) { const [name, , col] = ovBy[k]; g.fillStyle = col; legLabel(name.replace('BB sup', 'Bollinger'), left + 8, ly2, {t: 'std', key: k, mid: id}); ly2 += LS; }
      else if (PLAIN[k] && (k !== 'volume' || candles.length)) { g.fillStyle = text; legLabel(PLAIN[k], left + 8, ly2, {t: 'std', key: k, mid: id}); ly2 += LS; }
    });
  }
  for (const {p, r} of prAll) {
    if (paneOf({p, r}) !== 'main') continue;
    const id = 'm:p:' + p.sid;
    addLeg(id, () => {
      if (p.hide) { const tx = nnName(r.meta.title || r.meta.short || '').slice(0, 30); g.globalAlpha = .5; g.fillStyle = text; legLabel(tx, left + 8, ly2, {t: 'pine', sid: p.sid, pane: 'main', mid: id}, true); g.globalAlpha = 1; ly2 += LS; }
      else { g.fillStyle = text; const tx = nnName(r.meta.title || r.meta.short || '').slice(0, 32); legLabel(tx, left + 8, ly2, {t: 'pine', sid: p.sid, pane: 'main', mid: id}); ly2 += LS; }
    });
  }
  if (novaOn() && ind.nn) addLeg('m:nova', () => { const tx = 'Nova Nexus'; g.fillStyle = '#11cf77'; legLabel(tx, left + 8, ly2, {t: 'nova', mid: 'm:nova'}); ly2 += LS; });
  if (isHid('supertrend') || (stdOn('supertrend') && ind.stDir && ind.stDir[ind.stDir.length - 1] != null)) addLeg('m:supertrend', () => {
    if (isHid('supertrend')) dimRow(stdName('supertrend'), {t: 'std', key: 'supertrend', mid: 'm:supertrend'});
    else if (stdOn('supertrend') && ind.stDir) { const j = ind.stDir.length - 1, dv = ind.stDir[j]; if (dv != null) { g.fillStyle = dv < 0 ? '#089981' : '#f23645'; { const tx = 'Supertrend'; legLabel(tx, left + 8, ly2, {t: 'std', key: 'supertrend', mid: 'm:supertrend'}); } ly2 += LS; } }
  });
  { // se dibujan en el orden elegido; sin orden guardado queda el de siempre. paneLayout.main guarda el alto de cada fila para poder arrastrarlas
    const ids = orderPanes(legItems.map(x => x.id)), by = new Map(legItems.map(x => [x.id, x])), lay = [];
    mainCount = legItems.length; paneLayout.mainBase = ly2 - Math.round(LS * .75);
    for (const id of ids) { const t0 = ly2; by.get(id).fn(); if (ly2 > t0) lay.push({key: id, h: ly2 - t0}); }
    paneLayout.main = lay;
  }

  // volumen
  if (volH) {
    const top = geo.volTop + 4, height = volH - 8; let maxV = 1;
    for (let i = lo; i < hi; i++) maxV = Math.max(maxV, candles[i].v);
    g.strokeStyle = line; g.beginPath(); g.moveTo(left, geo.volTop); g.lineTo(w - right + 2, geo.volTop); g.stroke();
    g.fillStyle = text; legLabel('VOL', left + 4, top + 16, {t: 'std', key: 'volume'});
    for (let i = lo; i < hi; i++) { const d = candles[i]; g.fillStyle = d.c >= d.o ? (sp('volume', 'up') === '#089981aa' ? up + 'aa' : sp('volume', 'up')) : (sp('volume', 'down') === '#f23645aa' ? down + 'aa' : sp('volume', 'down')); const bh = Math.max(1, d.v / maxV * height); g.fillRect(X(i) - barW / 2, top + height - bh, barW, bh); }
  }
  // RSI
  if (rsiH) {
    const top = geo.rsiTop + 4, height = rsiH - 12;
    g.strokeStyle = line; g.beginPath(); g.moveTo(left, geo.rsiTop); g.lineTo(w - right + 2, geo.rsiTop); g.stroke();
    const lastR = [...ind.rsi].reverse().find(x => x != null);
    { const tx = `RSI ${sp('rsi', 'len')}`; g.fillStyle = text; legLabel(tx, left + 4, top + 16, {t: 'std', key: 'rsi'}); }
    g.setLineDash([2, 3]);
    for (const r of [sp('rsi', 'os'), sp('rsi', 'ob')]) { const yy = top + (100 - r) / 100 * height; g.strokeStyle = line; g.beginPath(); g.moveTo(left, yy); g.lineTo(w - right, yy); g.stroke(); g.fillStyle = text; g.fillText(String(r), w - right + 6, yy + 3); }
    g.setLineDash([]);
    g.strokeStyle = sp('rsi', 'color'); g.lineWidth = sp('rsi', 'width'); g.beginPath(); let on = false;
    for (let i = lo; i < hi; i++) { const v = ind.rsi[i]; if (v == null) { on = false; continue; } const yy = top + (100 - v) / 100 * height; if (!on) { g.moveTo(X(i), yy); on = true; } else g.lineTo(X(i), yy); }
    g.stroke();
  }
  panelKeys.forEach((k, idx) => k.startsWith('pine:') ? drawPinePane(pr.find(x => 'pine:' + x.p.sid === k), botY[k], hBot[idx], lo, hi, {left, w, right, line, text, step, plotW}) : drawSubPanel(k, botY[k], hBot[idx], lo, hi, {left, w, right, line, text}));
  pTop.forEach((x, idx) => drawPinePane(x, topY['pine:' + x.p.sid], hTop[idx], lo, hi, {left, w, right, line, text, step, plotW}));
  if (pTop.length) { g.strokeStyle = line; g.lineWidth = .6; g.setLineDash([]); g.beginPath(); g.moveTo(left, plotTop); g.lineTo(w - right + 2, plotTop); g.stroke(); }
  if (vpOn) drawNovaVP(ind.vp, fg);
  if (state.indicators.nnLiq && ind.liq) drawNovaLiqTable(fg);
  if (nn && state.indicators.nnRules) drawNovaRules();
  if (nn && state.indicators.nnIa && nn.last) drawNovaScore(nn.last);
  // retícula (mantener pulsado)
  let shown = candles[hi - 1];
  syncCursorMode(CS.cursor);
  if (cross) {
    const fi = IDX(cross.x), i = clamp(Math.round(fi), 0, n - 1), c = candles[i]; shown = c;
    const free = fi > n - 1 + .5 || fi < -.5, cx = free ? clamp(cross.x, left, w - right) : X(i), cy = clamp(cross.y, plotTop, plotTop + plotH); // fuera de las velas (zona vacía a la derecha) la cruz sigue al puntero sin ajustarse a una vela
    g.strokeStyle = CS.cross || fg; g.globalAlpha = CS.crossA / 100; g.lineWidth = CS.crossW; g.setLineDash(CS.crossS === 'Sólida' ? [] : CS.crossS === 'Puntos' ? [1.5, 3] : [4, 4]);
    if (CS.cursor === 'Cruz' || !CS.cursor || drawTool) { g.beginPath(); g.moveTo(cx, top0); g.lineTo(cx, h - axisH); g.moveTo(left, cy); g.lineTo(w - right + 2, cy); g.stroke(); } // con Flecha o Estrella no hay líneas: solo las etiquetas de precio y hora
    g.setLineDash([]); g.globalAlpha = 1;
    g.fillStyle = CS.cross || fg; g.fillRect(w - right + 2, cy - 9, right - 3, 18); g.fillStyle = bg; g.fillText(fmt(PRICE(cy)), w - right + 5, cy + 3.5);
    const tl = CCTPrefs.full(free ? timeOfIdx(Math.round(fi)) : c.t, PR);
    const tw = g.measureText(tl).width + 12, tx = clamp(cx - tw / 2, left, w - right - tw);
    g.fillStyle = CS.cross || fg; g.fillRect(tx, h - axisH + 1, tw, 18); g.fillStyle = bg; g.fillText(tl, tx + 6, h - 8);
  }
  if (shown) {
    const chg = (shown.c - shown.o) / shown.o * 100;
    const sgAt = cross && nn && state.indicators.nnIa ? nn.bySignal[clamp(Math.round(IDX(cross.x)), 0, n - 1)] : null;
    $('#ohlcText').textContent = `O ${fmt(shown.o)}  H ${fmt(shown.h)}  L ${fmt(shown.l)}  C ${fmt(shown.c)}  ${pct(chg)}` + (sgAt ? `\n${NovaNexus.tooltip(sgAt)}` : '');
    $('#ohlcText').style.color = shown.c >= shown.o ? up : down;
  }
}
/* ───────── Paneles inferiores: MACD · Estocástico · ATR · OBV ───────── */
const PANEL_DEF = { // paneles adicionales: etiqueta, series [valores, color], rango fijo, niveles de referencia y si es histograma
  adx: {label: () => `ADX ${sp('adx', 'len')}`, series: D => [[D.adx, sp('adx', 'cAdx')], [D.pdi, sp('adx', 'cP')], [D.mdi, sp('adx', 'cM')]], levels: () => [sp('adx', 'lvl')], range: [0, 100]},
  cci: {label: () => `CCI ${sp('cci', 'len')}`, series: D => [[D, sp('cci', 'color')]], levels: () => [-100, 0, 100]},
  willr: {label: () => `%R ${sp('willr', 'len')}`, series: D => [[D, sp('willr', 'color')]], levels: () => [-80, -20], range: [-100, 0]},
  mfi: {label: () => `MFI ${sp('mfi', 'len')}`, series: D => [[D, sp('mfi', 'color')]], levels: () => [20, 80], range: [0, 100]},
  roc: {label: () => `ROC ${sp('roc', 'len')}`, series: D => [[D, sp('roc', 'color')]], levels: () => [0]},
  stochrsi: {label: () => `Estoc. RSI ${sp('stochrsi', 'rl')} ${sp('stochrsi', 'sl')}`, series: D => [[D.k, sp('stochrsi', 'cK')], [D.d, sp('stochrsi', 'cD')]], levels: () => [20, 80], range: [0, 100]},
  ao: {label: () => 'AO', series: () => [], hist: true, levels: () => [0], hUp: () => sp('ao', 'hUp'), hDn: () => sp('ao', 'hDn')},
  cmf: {label: () => `CMF ${sp('cmf', 'len')}`, series: () => [], hist: true, levels: () => [0], hUp: () => sp('cmf', 'hUp'), hDn: () => sp('cmf', 'hDn')},
  oi: {label: () => `Interés abierto ${dvBig(dvLast(ind.oi))}`, series: D => [[D, sp('oi', 'color')]], levels: () => []},
  funding: {label: () => { const v = dvLast(ind.funding); return `Funding ${v == null ? '' : (v >= 0 ? '+' : '') + v.toFixed(4) + '%'}`; }, series: () => [], hist: true, levels: () => [0], hUp: () => sp('funding', 'hUp'), hDn: () => sp('funding', 'hDn')},
  lsr: {label: () => { const a = dvLast(ind.lsr && ind.lsr.acc), t = dvLast(ind.lsr && ind.lsr.top); return `Long/Short ${a == null ? '' : 'cuentas ' + a.toFixed(2)}${t == null ? '' : ' · top ' + t.toFixed(2)}`; }, series: D => [[D.acc, sp('lsr', 'cA')], [D.top, sp('lsr', 'cT')]], levels: () => [1]},
  taker: {label: () => { const v = dvLast(ind.taker); return `Delta agresivo ${v == null ? '' : (v >= 0 ? '+' : '−') + dvBig(Math.abs(v), true)}`; }, series: () => [], hist: true, levels: () => [0], hUp: () => sp('taker', 'hUp'), hDn: () => sp('taker', 'hDn')}
};
function drawSubPanel(key, top0, H, lo, hi, o) {
  const {left, w, right, line, text} = o, top = top0 + 4, height = H - 10, fmtV = v => v == null ? '—' : Math.abs(v) >= 1000 ? v.toLocaleString('en-US', {maximumFractionDigits: 0}) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(6);
  const D = ind[key]; if (!D) return; const PD = PANEL_DEF[key];
  const series = PD ? PD.series(D) : key === 'macd' ? [[D.line, sp('macd', 'cLine')], [D.signal, sp('macd', 'cSig')]] : key === 'stoch' ? [[D.k, sp('stoch', 'cK')], [D.d, sp('stoch', 'cD')]] : [[D, key === 'atr' ? sp('atr', 'color') : sp('obv', 'color')]];
  const hist = PD ? (PD.hist ? D : null) : key === 'macd' ? D.hist : null;
  let mn = Infinity, mx = -Infinity;
  const take = arr => { for (let i = lo; i < hi; i++) { const v = arr[i]; if (v != null) { if (v < mn) mn = v; if (v > mx) mx = v; } } };
  if (PD && PD.range) { mn = PD.range[0]; mx = PD.range[1]; } else if (key === 'stoch') { mn = 0; mx = 100; } else { series.forEach(([a]) => take(a)); if (hist) take(hist); }
  if (!Number.isFinite(mn) || !Number.isFinite(mx)) return;
  if (PD && PD.hist) { const m = Math.max(Math.abs(mn), Math.abs(mx)) || 1; mn = -m; mx = m; }
  if (key === 'macd') { const m = Math.max(Math.abs(mn), Math.abs(mx)) || 1; mn = -m; mx = m; } // el cero queda al centro
  if (mx === mn) { mx += 1; mn -= 1; }
  const pad = key === 'stoch' || (PD && PD.range) ? 0 : (mx - mn) * .08; mn -= pad; mx += pad;
  { const pm = paneMan[key]; if (pm) { mn = pm.min; mx = pm.max; } paneHit.push({key, top0, H, mn, mx}); }
  const Yp = v => top + (mx - v) / (mx - mn) * height;
  g.save(); g.beginPath(); g.rect(left, top0, w - left, H); g.clip(); // incluye el eje derecho para que se vean los niveles y la escala
  g.strokeStyle = line; g.lineWidth = .6; g.setLineDash([]); g.beginPath(); g.moveTo(left, top0); g.lineTo(w - right + 2, top0); g.stroke();
  g.font = '10px system-ui';
  const last = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };
  const label = PD ? PD.label() : {macd: `MACD ${sp('macd', 'fast')} ${sp('macd', 'slow')} ${sp('macd', 'sig')}`, stoch: `Estoc ${sp('stoch', 'k')} ${sp('stoch', 'ks')} ${sp('stoch', 'd')}`, atr: `ATR ${sp('atr', 'len')}`, obv: 'OBV'}[key];
  { const tx = label; g.fillStyle = text; legLabel(tx, left + 4, top + 16, {t: 'std', key}); }
  if (PD) {
    g.setLineDash([2, 3]); for (const r of PD.levels()) { const yy = Yp(r); if (yy < top - 2 || yy > top + height + 2) continue; g.strokeStyle = line; g.beginPath(); g.moveTo(left, yy); g.lineTo(w - right, yy); g.stroke(); g.fillStyle = text; g.fillText(String(r), w - right + 6, yy + 3); }
    g.setLineDash([]);
    if (PD.hist) { const y0 = Yp(0), bw = clamp(geo.step * .6, 1, 12); for (let i = lo; i < hi; i++) { const v = hist[i]; if (v == null) continue; const pv = i > 0 ? hist[i - 1] : null; g.globalAlpha = (v >= 0 ? (pv != null && v < pv) : (pv != null && v > pv)) ? .55 : .85; g.fillStyle = v >= 0 ? PD.hUp() : PD.hDn(); g.fillRect(X(i) - bw / 2, Math.min(y0, Yp(v)), bw, Math.max(1, Math.abs(Yp(v) - y0))); } g.globalAlpha = 1; }
    else { g.fillStyle = text; }
  } else if (key === 'stoch') {
    g.setLineDash([2, 3]);
    for (const r of [sp('stoch', 'lo'), sp('stoch', 'hi')]) { const yy = Yp(r); g.strokeStyle = line; g.beginPath(); g.moveTo(left, yy); g.lineTo(w - right, yy); g.stroke(); g.fillStyle = text; g.fillText(String(r), w - right + 6, yy + 3); }
    g.setLineDash([]);
  } else if (key === 'macd') {
    const y0 = Yp(0); g.setLineDash([2, 3]); g.strokeStyle = line; g.beginPath(); g.moveTo(left, y0); g.lineTo(w - right, y0); g.stroke(); g.setLineDash([]);
    const bw = clamp(geo.step * .6, 1, 12);
    for (let i = lo; i < hi; i++) { const v = hist[i]; if (v == null) continue; const pv = i > 0 ? hist[i - 1] : null; g.globalAlpha = (v >= 0 ? (pv != null && v < pv) : (pv != null && v > pv)) ? .55 : .85; g.fillStyle = v >= 0 ? sp('macd', 'hUp') : sp('macd', 'hDn'); g.fillRect(X(i) - bw / 2, Math.min(y0, Yp(v)), bw, Math.max(1, Math.abs(Yp(v) - y0))); }
    g.globalAlpha = 1;
  } else { g.fillStyle = text; g.fillText(fmtV(mx), w - right + 6, top + 9); g.fillText(fmtV(mn), w - right + 6, top + height); }
  g.lineWidth = sp(key, 'width') || 1.4;
  for (const [a, col] of series) {
    g.strokeStyle = col; g.beginPath(); let on = false;
    for (let i = lo; i < hi; i++) { const v = a[i]; if (v == null) { on = false; continue; } if (!on) { g.moveTo(X(i), Yp(v)); on = true; } else g.lineTo(X(i), Yp(v)); }
    g.stroke();
  }
  g.restore();
}
/* ───────── Nova Nexus: dibujo ───────── */
const NN_COL = {buy: '#11cf77', sell: '#d11645', range: '#9b59b6', sl: '#ff4444', tp1: '#11cf77', tp2: '#00aaff', tp3: '#ff9900'};
function drawNovaCloud(nn, lo, hi, css) {
  const light = document.body.classList.contains('light');
  const bullFill = light ? 'rgba(70,95,150,.16)' : 'rgba(140,155,185,.20)', bearFill = light ? 'rgba(110,110,125,.16)' : 'rgba(120,125,140,.20)';
  const edge = light ? 'rgba(30,40,60,.35)' : 'rgba(200,210,230,.30)';
  const cB = novaP('cloudBull'), cR = novaP('cloudBear'), cE = novaP('cloudEdge'), dB = novaDef('cloudBull'), dR = novaDef('cloudBear'), dE = novaDef('cloudEdge');
  // relleno por tramos del mismo color (alcista/bajista)
  let i = lo;
  while (i < hi) {
    if (!Number.isFinite(nn.emaTop[i])) { i++; continue; }
    const bull = nn.bull[i]; let j = i;
    while (j + 1 < hi && Number.isFinite(nn.emaTop[j + 1]) && nn.bull[j + 1] === bull) j++;
    const a = Math.max(lo, i - 1 >= lo && Number.isFinite(nn.emaTop[i - 1]) ? i - 1 : i);
    g.beginPath(); g.moveTo(X(a), Y(nn.emaTop[a]));
    for (let k = a + 1; k <= j; k++) g.lineTo(X(k), Y(nn.emaTop[k]));
    for (let k = j; k >= a; k--) g.lineTo(X(k), Y(nn.emaBot[k]));
    g.closePath(); g.fillStyle = bull ? (cB !== dB ? cB : bullFill) : (cR !== dR ? cR : bearFill); g.fill();
    i = j + 1;
  }
  g.strokeStyle = cE !== dE ? cE : edge; g.lineWidth = 1; g.setLineDash([]);
  for (const arr of [nn.emaTop, nn.emaBot]) {
    g.beginPath(); let on = false;
    for (let k = lo; k < hi; k++) { const v = arr[k]; if (!Number.isFinite(v)) { on = false; continue; } if (!on) { g.moveTo(X(k), Y(v)); on = true; } else g.lineTo(X(k), Y(v)); }
    g.stroke();
  }
}

/* ───────── Nova Nexus: Smooth Trail y Reversal Bands ───────── */
const TRAIL_COL = {bull: '#119c7e', bear: '#7c3cf3'}, REV_COL = {up: '#f23645', dn: '#089981'};
const hexArr = h => { const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(h || ''); return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), m[2] ? parseInt(m[2], 16) / 255 : 1] : [128, 128, 128, 1]; };
function syncNovaCols() { TRAIL_COL.bull = novaP('trailBull'); TRAIL_COL.bear = novaP('trailBear'); REV_COL.up = novaP('revUp'); REV_COL.dn = novaP('revDn'); SR_COL.sup = novaP('srSup'); SR_COL.res = novaP('srRes'); }
function vpPal(vp) { const o = {HVC: 'vpHvc', AVC: 'vpAvc', LVC: 'vpLvc', BLC: 'vpBlc', BRC: 'vpBrc'}, k = novaP('vpOp') / 100, m = new Map(), C = {}; for (const n in o) { const c = hexArr(novaP(o[n])); c[3] *= k; C[n] = c; m.set(vp.colors[n], c); } return {C, map: c => m.get(c) || c}; }
function fillBetween(top, bot, lo, hi, color, alpha) { // relleno entre dos series por tramos continuos
  g.fillStyle = color; g.globalAlpha = alpha;
  let i = lo;
  while (i < hi) {
    if (top[i] == null || bot[i] == null) { i++; continue; }
    let j = i; while (j + 1 < hi && top[j + 1] != null && bot[j + 1] != null) j++;
    g.beginPath(); g.moveTo(X(i), Y(top[i])); for (let k = i + 1; k <= j; k++) g.lineTo(X(k), Y(top[k])); for (let k = j; k >= i; k--) g.lineTo(X(k), Y(bot[k])); g.closePath(); g.fill();
    i = j + 1;
  }
  g.globalAlpha = 1;
}
function drawNovaRev(r, lo, hi) { // bandas 6-7 (suave) y 7-8 (fuerte), como los fill del Pine
  const ro = novaP('revOp') / 100;
  fillBetween(r.up[0], r.up[1], lo, hi, REV_COL.up, Math.min(1, .2 * ro)); fillBetween(r.up[1], r.up[2], lo, hi, REV_COL.up, Math.min(1, .5 * ro));
  fillBetween(r.dn[2], r.dn[1], lo, hi, REV_COL.dn, Math.min(1, .5 * ro)); fillBetween(r.dn[1], r.dn[0], lo, hi, REV_COL.dn, Math.min(1, .2 * ro));
}
function drawNovaTrailFill(t, lo, hi) {
  let i = lo;
  while (i < hi) {
    if (t.trail[i] == null || t.basis[i] == null) { i++; continue; }
    const bull = t.trend[i] === 1; let j = i; while (j + 1 < hi && t.trail[j + 1] != null && t.basis[j + 1] != null && (t.trend[j + 1] === 1) === bull) j++;
    const a = i > lo && t.trail[i - 1] != null ? i - 1 : i; // une con la barra anterior para no dejar huecos
    g.fillStyle = bull ? TRAIL_COL.bull : TRAIL_COL.bear; g.globalAlpha = .1;
    g.beginPath(); g.moveTo(X(a), Y(t.trail[a])); for (let k = a + 1; k <= j; k++) g.lineTo(X(k), Y(t.trail[k])); for (let k = j; k >= a; k--) g.lineTo(X(k), Y(t.basis[k])); g.closePath(); g.fill();
    g.globalAlpha = 1; i = j + 1;
  }
}
function drawNovaTrailLine(t, lo, hi) { // cada tramo toma el color de la tendencia de su barra final
  g.lineWidth = 1.4; g.setLineDash([]);
  for (let i = Math.max(lo, 1); i < hi; i++) {
    if (t.trail[i] == null || t.trail[i - 1] == null) continue;
    g.strokeStyle = t.trend[i] === 1 ? TRAIL_COL.bull : TRAIL_COL.bear;
    g.beginPath(); g.moveTo(X(i - 1), Y(t.trail[i - 1])); g.lineTo(X(i), Y(t.trail[i])); g.stroke();
  }
}

/* ───────── Nova Nexus: Volume Profile ───────── */
const rgbaOf = (c, a = c[3]) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+a.toFixed(3)})`;
function fmtVolPine(v) { // aproxima format.volume: 1.23K · 4.5M · 2B
  const a = Math.abs(v), sg = v < 0 ? '-' : '', t = x => String(+x.toFixed(2));
  return sg + (a >= 1e12 ? t(a / 1e12) + 'T' : a >= 1e9 ? t(a / 1e9) + 'B' : a >= 1e6 ? t(a / 1e6) + 'M' : a >= 1e3 ? t(a / 1e3) + 'K' : t(a));
}
/* ───────── Patrones ─────────
   Dibuja lo que detecta patterns.js: la línea que une los puntos con sus etiquetas (X-A-B-C-D, 1-2-3, 0-5, A-B-C), las diagonales y rellenos de los armónicos, la zona de reversión (PRZ)
   de la D que se está formando, la línea de cuello, las líneas de triángulos y cuñas, y el objetivo / stop. El panel de arriba a la derecha dice qué patrón es y en qué estado está. */
function drawChannels(list) { // líneas punteadas discretas de los canales vigentes (channels.js)
  if (!list || !list.length) return;
  const P = k => sp('dchan', k), n = candles.length, xl = geo.left, xr = geo.left + geo.plotW, dash = DASHES[P('dash')] || [1.5, 3], mid = P('mid') === 'Sí', ext = P('ext');
  g.save(); g.beginPath(); g.rect(xl, geo.plotTop, geo.plotW, geo.plotH); g.clip(); g.lineCap = 'round';
  for (const q of list) {
    const col = q.dir > 0 ? P('cUp') : q.dir < 0 ? P('cDn') : P('cFlat'), x1 = X(q.i1), x2 = X(q.i2 + ext);
    const ln = (a, b, w, d, al) => { g.globalAlpha = al; g.strokeStyle = col; g.lineWidth = w; g.setLineDash(d); g.beginPath(); g.moveTo(x1, Y(a.p1)); g.lineTo(x2, Y(a.p2 + (a.p2 - a.p1) / Math.max(1, q.i2 - q.i1) * ext)); g.stroke(); };
    const w = P('width') * (1 - q.k * .15);
    ln(q.up, 0, w, dash, 1); ln(q.lo, 0, w, dash, 1); if (mid) ln(q.mid, 0, Math.max(.8, w * .8), [1, 5], .6);
  }
  g.setLineDash([]); g.globalAlpha = 1; g.restore();
}
const PAT_STATE = {forming: 'en formación', confirmed: 'confirmado', complete: 'completo'};
/* Cada tipo de patrón con su propio tono de verde (alcista) o de rojo (bajista), a partir de los colores elegidos en sus ajustes,
   para distinguir de un vistazo cuál es cuál (armónico, 1-2-3, ABC, doble techo/suelo, HCH, triángulo/cuña/canal, Elliott). */
const PAT_TONES = {harm: [0, 0], p123: [-12, 15], abc: [12, -10], dbl: [-6, -19], hs: [16, 9], tri: [-16, -3], ell: [6, 25]};
function patTone(base, kind, k) {
  const m = /^#?([0-9a-f]{6})$/i.exec(base || ''); if (!m) return base; const v = parseInt(m[1], 16), r = (v >> 16 & 255) / 255, gg = (v >> 8 & 255) / 255, b = (v & 255) / 255;
  const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); let h = 0, sat = 0, l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; sat = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (gg - b) / d + (gg < b ? 6 : 0) : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4; h *= 60; }
  const [dh, dl] = PAT_TONES[kind] || [0, 0], extra = (k || 0) % 3 * 7; // si hay varios del mismo tipo, cada uno un poco distinto
  h = (h + dh + 360) % 360; l = Math.max(.3, Math.min(.78, l + (dl + extra) / 100)); sat = Math.max(.45, sat);
  const f = n => { const kk = (n + h / 30) % 12, a = sat * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(kk - 3, 9 - kk, 1)))).toString(16).padStart(2, '0'); };
  return '#' + f(0) + f(8) + f(4);
}
function drawPatterns(list) {
  if (!list.length) return;
  const P = k => sp('patterns', k), labelsOn = P('labels') === 'Sí', przOn = P('prz') === 'Sí', n = candles.length, xr = geo.left + geo.plotW, xl = geo.left;
  const clX = x => clamp(x, xl + 4, xr - 4), line = (x1, y1, x2, y2, col, w, dash) => { g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); };
  const tag = (txt, x, y, col, up) => { g.font = '10px system-ui'; const w = g.measureText(txt).width + 10, bx = clamp(x - w / 2, xl + 2, xr - w - 2), by = up ? y - 20 : y + 4; g.fillStyle = 'rgba(8,12,22,.82)'; roundRect(bx, by, w, 16, 5); g.fill(); g.strokeStyle = col; g.lineWidth = 1; g.stroke(); g.fillStyle = col; g.textAlign = 'left'; g.fillText(txt, bx + 5, by + 11.5); };
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  const seen = {}, cache = new Map(), colOf = p => { const base = p.dir > 0 ? P('cBull') : p.dir < 0 ? P('cBear') : '#9aa7bd'; if (!p.dir) return base; if (cache.has(p)) return cache.get(p); const k = seen[p.kind + p.dir] = (seen[p.kind + p.dir] || 0) + 1, c = patTone(base, p.kind, k - 1); cache.set(p, c); return c; };
  for (const p of list) {
    const col = colOf(p), pts = p.pts.map(q => ({x: X(q.i), y: Y(q.p), q}));
    if (p.kind === 'harm' && pts.length >= 4) { // rellenos XAB y BCD (o ABC y BCD) y diagonales
      const tri = (a, b, c) => { g.fillStyle = col + '22'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.closePath(); g.fill(); };
      if (pts.length === 5) { tri(pts[0], pts[1], pts[2]); tri(pts[2], pts[3], pts[4]); line(pts[0].x, pts[0].y, pts[2].x, pts[2].y, col + '99', 1, [4, 3]); line(pts[1].x, pts[1].y, pts[3].x, pts[3].y, col + '99', 1, [4, 3]); line(pts[2].x, pts[2].y, pts[4].x, pts[4].y, col + '99', 1, [4, 3]); line(pts[0].x, pts[0].y, pts[4].x, pts[4].y, col + '99', 1, [2, 4]); }
      else if (pts.length === 4 && p.status !== 'forming' || (pts.length === 4 && p.name.startsWith('ABCD'))) { tri(pts[0], pts[1], pts[2]); tri(pts[1], pts[2], pts[3]); }
      else if (pts.length === 4) { tri(pts[0], pts[1], pts[2]); line(pts[0].x, pts[0].y, pts[2].x, pts[2].y, col + '99', 1, [4, 3]); line(pts[1].x, pts[1].y, pts[3].x, pts[3].y, col + '99', 1, [4, 3]); }
    }
    if (pts.length > 1) { g.strokeStyle = col; g.lineWidth = 2; g.setLineDash(p.status === 'forming' && p.kind !== 'harm' ? [] : []); g.beginPath(); pts.forEach((o, k) => k ? g.lineTo(o.x, o.y) : g.moveTo(o.x, o.y)); g.stroke(); }
    for (const l of p.lines || []) line(X(l.i1), Y(l.p1), X(l.i2), Y(l.p2), col, 1.6, []);
    if (p.neck) line(X(p.neck.i1), Y(p.neck.p1), X(p.neck.i2), Y(p.neck.p2), col, 1.4, [6, 4]);
    const lp = pts[pts.length - 1] || {x: X(n - 1), y: Y(p.lines && p.lines[0] ? p.lines[0].p2 : candles[n - 1].c), q: {hi: true}};
    if (przOn && p.prz) { // zona de reversión donde se espera la D
      const x0 = X(p.pts[p.pts.length - 1].i), x1 = Math.min(xr, Math.max(X(n - 1), x0) + Math.max(geo.step * 16, 70)), y0 = Y(p.prz.hi), y1 = Y(p.prz.lo);
      g.fillStyle = col + '30'; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeStyle = col; g.lineWidth = 1; g.setLineDash([4, 3]); g.strokeRect(x0, y0, x1 - x0, y1 - y0); g.setLineDash([]);
      line(lp.x, lp.y, x0 + (x1 - x0) * .55, (y0 + y1) / 2, col, 1.2, [2, 4]); g.fillStyle = col; g.font = 'bold 10px system-ui'; g.textAlign = 'left'; g.fillText('PRZ · D', x0 + 4, y0 - 4);
    }
    if (przOn && Number.isFinite(p.target)) { const x0 = pts.length ? lp.x : xl, x1 = Math.min(xr, Math.max(X(n - 1), x0) + Math.max(geo.step * 14, 60)); line(x0, Y(p.target), x1, Y(p.target), col, 1, [5, 4]); g.fillStyle = col; g.font = '10px system-ui'; g.textAlign = 'right'; g.fillText((p.kind === 'ell' ? 'Onda 5 ≈ ' : 'Objetivo ') + fmt(p.target), clX(x1), Y(p.target) - 3); }
    if (przOn && Number.isFinite(p.stop)) { const x0 = pts.length ? pts[0].x : xl, x1 = Math.min(xr, Math.max(X(n - 1), lp.x) + Math.max(geo.step * 14, 60)); line(x0, Y(p.stop), x1, Y(p.stop), '#9aa7bd', 1, [2, 4]); g.fillStyle = '#9aa7bd'; g.font = '10px system-ui'; g.textAlign = 'right'; g.fillText('Stop ' + fmt(p.stop), clX(x1), Y(p.stop) - 3); }
    if (labelsOn) for (const o of pts) { if (!o.q.t) continue; g.fillStyle = col; g.beginPath(); g.arc(o.x, o.y, 3, 0, 7); g.fill(); g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.fillText(o.q.t, o.x, o.q.hi ? o.y - 8 : o.y + 17); }
    tag(`${p.name} · ${PAT_STATE[p.status]} ${Math.round(p.score)} %`, lp.x, lp.y, col, !!(lp.q && lp.q.hi));
  }
  if (P('panel') === 'Sí') { // panel: qué patrones hay ahora
    g.font = '11px system-ui'; const rows = list.map(p => ({col: colOf(p), txt: `${p.name} — ${PAT_STATE[p.status]}`})), w = Math.max(...rows.map(r => g.measureText(r.txt).width)) + 30, h = rows.length * 17 + 12, x = xr - w - 8, y = geo.plotTop + 8;
    g.fillStyle = 'rgba(8,12,22,.78)'; roundRect(x, y, w, h, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.stroke(); g.textAlign = 'left';
    rows.forEach((r, k) => { g.fillStyle = r.col; g.beginPath(); g.arc(x + 12, y + 14 + k * 17, 4, 0, 7); g.fill(); g.fillStyle = '#dfe7f5'; g.fillText(r.txt, x + 22, y + 18 + k * 17); });
  }
  g.restore(); g.textAlign = 'left';
}
/* ───────── VPVR · perfil de volumen de rango visible ─────────
   Histograma horizontal pegado al borde derecho (o izquierdo) del área de precios, detrás de las velas. Cada fila es un tramo de precio y su largo es el volumen negociado ahí
   por las velas visibles. Arriba/Abajo: comprador (cierre ≥ apertura) junto al borde y vendedor a continuación; Total: una sola barra; Delta: |compra − venta| con el color del lado ganador.
   Las filas dentro del área de valor se ven más intensas. Línea roja = POC; líneas punteadas = VAH / VAL. */
/* ───────── Heatmap de liquidaciones estimadas (estilo CoinGlass) ─────────
   Cada celda (vela × tramo de precio) se pinta según cuántas liquidaciones se estiman ahí; la escala va de morado oscuro (poco) a amarillo (mucho). Se dibuja detrás de las velas. */
const LIQ_RAMP = ['#2b0a5e', '#3a1590', '#3b2fb5', '#2a5fd1', '#1f94b8', '#26b97f', '#7ad24a', '#d6e035', '#ffe81a'];
function drawLiqMap(m, lo, hi) {
  const P = k => sp('liqmap', k), gain = P('gain') / 100, a = P('alpha') / 100, n = Math.min(hi, m.n), top = geo.plotTop, bot = geo.plotTop + geo.plotH;
  const r0 = Math.max(0, Math.floor((geo.min - m.pMin) / m.step)), r1 = Math.min(m.rows - 1, Math.ceil((geo.max - m.pMin) / m.step));
  g.save(); g.beginPath(); g.rect(geo.left, top, geo.plotW + 2 + (geo.vpOn ? 0 : geo.gutter), geo.plotH); g.clip(); g.globalAlpha = a;
  const nl = LIQ_RAMP.length - 1, x0 = i => Math.max(geo.left, X(i - .5)), W = geo.step;
  for (let r = r0; r <= r1; r++) {
    const d = m.data[r], yt = Math.max(top, Y(m.pMin + (r + 1) * m.step)), yb = Math.min(bot, Y(m.pMin + r * m.step)), hgt = yb - yt + .6; if (hgt <= 0) continue;
    let runLv = -1, runStart = 0;
    for (let i = Math.max(0, lo); i <= n; i++) {
      const lv = i < n ? Math.min(nl, Math.floor(Math.pow(Math.min(1.3, d[i] / m.ref * gain), .75) * nl * .85)) : -1;
      if (lv !== runLv) { if (runLv > 0) { g.fillStyle = LIQ_RAMP[runLv]; const xs = x0(runStart); g.fillRect(xs, yt, X(i - .5) - xs + .5, hgt); } runLv = lv; runStart = i; }
    }
  }
  g.restore();
}
function drawVPVR(vp) {
  const P = k => sp('vpvr', k), mode = P('mode'), toRight = P('place') === 'Derecha', maxW = Math.max(10, (geo.plotW + (geo.vpOn ? 0 : geo.gutter)) * P('wpct') / 100);
  const rEdge = geo.left + geo.plotW + (geo.vpOn ? 0 : geo.gutter), xE = toRight ? rEdge : geo.left, sc = mode === 'Delta' ? vp.maxDelta : vp.maxVol, cu = hexArr(P('cUp')), cd = hexArr(P('cDn'));
  const bar = (off, len, c, k, y, h) => { if (len < .3) return; g.fillStyle = rgbaOf(c, c[3] * k); g.fillRect(toRight ? xE - off - len : xE + off, y, len, h); };
  g.save(); g.setLineDash([]);
  if (sc > 0) for (const r of vp.rows) {
    const yT = Y(r.top), yB = Y(r.bot), h = yB - yT; if (yB < geo.plotTop || yT > geo.plotTop + geo.plotH) continue;
    const gap = h > 4 ? 1 : 0, y = yT + gap / 2, hh = Math.max(1, h - gap), k = r.inVA ? .68 : .34;
    if (mode === 'Arriba/Abajo') { const lu = r.up / sc * maxW, ld = r.dn / sc * maxW; bar(0, lu, cu, k, y, hh); bar(lu, ld, cd, k, y, hh); }
    else if (mode === 'Total') bar(0, r.vol / sc * maxW, cu, k, y, hh);
    else bar(0, Math.abs(r.delta) / sc * maxW, r.delta >= 0 ? cu : cd, k, y, hh);
  }
  const xa = geo.left, xb = rEdge, lab = (txt, y, col) => { g.font = '10px system-ui'; g.fillStyle = col; g.textAlign = toRight ? 'left' : 'right'; g.fillText(txt, toRight ? xa + 4 : xb - 4, y - 3); };
  const hl = (p, col, w, dash, txt) => { const y = Y(p); if (y < geo.plotTop - 1 || y > geo.plotTop + geo.plotH + 1) return; g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash); g.beginPath(); g.moveTo(xa, y); g.lineTo(xb, y); g.stroke(); lab(txt, y, col); };
  if (P('vaOn') === 'Sí') { const cv = P('cVa'); hl(vp.vah, cv, 1, [4, 3], 'VAH'); hl(vp.val, cv, 1, [4, 3], 'VAL'); }
  if (P('pocOn') === 'Sí') hl(vp.pocPrice, P('cPoc'), 1.5, [], 'POC');
  g.restore(); g.textAlign = 'left';
}
function drawVPVRTags(vp) {
  const P = k => sp('vpvr', k), x = geo.w - geo.right + 2, wTag = geo.right - 3, tag = (p, col) => { const y = Y(p); if (y < geo.plotTop || y > geo.plotTop + geo.plotH) return; g.fillStyle = col; g.fillRect(x, y - 8, wTag, 16); g.fillStyle = '#fff'; g.font = '10px system-ui'; g.textAlign = 'left'; g.fillText(fmt(p), x + 3, y + 3.5); };
  g.save();
  if (P('vaOn') === 'Sí') { tag(vp.vah, P('cVa')); tag(vp.val, P('cVa')); }
  if (P('pocOn') === 'Sí') tag(vp.pocPrice, P('cPoc'));
  g.restore();
}
function drawNovaVPZone(vp) { // zona del POC (Last(Zone)): caja y línea punteada sobre las velas del perfil
  const C = vpPal(vp).C, x1 = X(vp.from), x2 = X(vp.to), yT = Y(vp.pocTop), yB = Y(vp.pocBot), yc = Y(vp.pocPrice);
  g.fillStyle = rgbaOf(C.HVC, .27); g.fillRect(x1, yT, x2 - x1, yB - yT);
  g.strokeStyle = rgbaOf(C.HVC); g.lineWidth = 1; g.setLineDash([]); g.strokeRect(x1, yT, x2 - x1, yB - yT);
  g.setLineDash([1, 3]); g.beginPath(); g.moveTo(x1, yc); g.lineTo(x2, yc); g.stroke(); g.setLineDash([]);
}
function drawNovaVP(vp, fg) {
  const pal = vpPal(vp); // columnas del perfil: sentimiento | precios | volumen, en el margen derecho (mismo orden que el Pine)
  const G = geo.gutter, x0 = geo.left + geo.plotW, small = geo.w < 480;
  const Wp = clamp(Math.round(G * .30), 38, 56), R = G - Wp - 8, Ws = Math.round(R * .42), Wv = R - Ws;
  const sb = x0 + 4 + Ws, pc = sb + 1, vb = pc + Wp; // base del sentimiento (crece a la izquierda), columna de precios, base del volumen (crece a la derecha)
  g.save(); g.beginPath(); g.rect(x0, geo.plotTop, G, geo.plotH); g.clip();
  g.font = `${small ? 8 : 9}px system-ui`; g.textBaseline = 'alphabetic';
  const fits = (txt, wMax) => g.measureText(txt).width + 6 <= wMax;
  const pctTxt = v => `(${+v.toFixed(2)}%)`;
  for (const r of vp.rows) {
    const yT = Y(r.bot + vp.step * .9), yB = Y(r.bot + vp.step * .1), h = yB - yT;
    if (yB < geo.plotTop || yT > geo.plotTop + geo.plotH) continue;
    const ty = yT + h / 2 + 3, tall = h >= 8;
    // columna de precios
    g.fillStyle = 'rgba(41,98,255,.063)'; g.fillRect(pc, yT, Wp, h); g.strokeStyle = 'rgba(41,98,255,.5)'; g.lineWidth = 1; g.strokeRect(pc, yT, Wp, h);
    if (tall) { g.fillStyle = fg; g.textAlign = 'center'; g.fillText(fmt(r.center), pc + Wp / 2, ty); }
    // volumen (hacia la derecha)
    const wv = r.lpm * Wv;
    if (wv >= .5) {
      g.fillStyle = rgbaOf(pal.map(r.vcol)); g.fillRect(vb, yT, wv, h); g.strokeStyle = rgbaOf(pal.map(r.vcol)); g.strokeRect(vb, yT, wv, h);
      if (tall) { const full = `${fmtVolPine(r.quote)} USDT ${pctTxt(r.pct)}`, txt = fits(full, wv) ? full : fits(pctTxt(r.pct), wv) ? pctTxt(r.pct) : ''; if (txt) { g.fillStyle = fg; g.textAlign = 'left'; g.fillText(txt, vb + 3, ty); } }
    }
    // sentimiento (hacia la izquierda)
    const ws = r.dpm * Ws;
    if (r.scol && ws >= .5) {
      g.fillStyle = rgbaOf(pal.map(r.scol)); g.fillRect(sb - ws, yT, ws, h); g.strokeStyle = rgbaOf(pal.map(r.scol)); g.strokeRect(sb - ws, yT, ws, h);
      if (tall) { const full = `${fmtVolPine(r.bbp)} ${pctTxt(r.bpct)}`, txt = fits(full, ws) ? full : fits(pctTxt(r.bpct), ws) ? pctTxt(r.bpct) : ''; if (txt) { g.fillStyle = fg; g.textAlign = 'right'; g.fillText(txt, sb - 3, ty); } }
    }
  }
  g.restore(); g.textAlign = 'left';
}

/* ───────── Nova Nexus: Liquidaciones ───────── */
const LIQ_RGB = {up: '34,171,148', dn: '247,82,95'}, LIQ_ALPHA = {5: .10, 10: .20, 25: .30, 50: .40, 100: .50}; // transparencias 90/80/70/60/50 del Pine
function drawNovaLiq(liq, lo, hi, fg) {
  // fondo tenue en las velas anteriores a la fecha de inicio (bgcolor del Pine con chart.fg_color al 95 % de transparencia)
  g.fillStyle = fg; g.globalAlpha = .05;
  for (let i = lo; i < hi; i++) if (candles[i].t <= liq.after) g.fillRect(X(i) - geo.step / 2, geo.plotTop, geo.step, geo.plotH);
  g.globalAlpha = 1; g.lineWidth = 3; g.setLineDash([]); g.lineCap = 'butt';
  for (const L of liq.levels) for (const l of L.lines) {
    if (l.x2 < lo - 1 || l.x1 > hi + 1) continue;
    const y = Y(l.y); if (y < geo.plotTop - 4 || y > geo.plotTop + geo.plotH + 4) continue;
    g.strokeStyle = `rgba(${LIQ_RGB[l.side]},${LIQ_ALPHA[L.lev]})`;
    g.beginPath(); g.moveTo(X(l.x1), y); g.lineTo(X(l.x2), y); g.stroke();
  }
}
function drawNovaLiqTable(fg) { // tabla "Active Liquidation Levels" (centro-derecha); los cinco apalancamientos van activos por defecto
  const rows = [5, 10, 25, 50, 100], small = geo.w < 480, lh = small ? 14 : 17, w = small ? 96 : 118, hdr = lh * 2 + 4, h = hdr + rows.length * lh + 6;
  const x = geo.left + geo.plotW - w - 4, y = geo.plotTop + (geo.plotH - h) / 2;
  g.save(); g.fillStyle = 'rgba(0,0,0,.35)'; roundRect(x, y, w, h, 4); g.fill();
  g.font = `${small ? 8 : 10}px system-ui`; g.textAlign = 'left'; g.fillStyle = fg; g.globalAlpha = .5;
  g.fillText('Active', x + 6, y + lh - 3); g.fillText('Liquidation Levels', x + 6, y + lh * 2 - 3); g.globalAlpha = 1;
  rows.forEach((r, k) => { const yy = y + hdr + (k + 1) * lh - 3; g.fillStyle = fg; g.fillText(r + 'X', x + 6, yy); g.fillStyle = '#00e676'; g.fillText('⬤', x + w - (small ? 20 : 24), yy); });
  g.restore();
}

/* ───────── Nova Nexus: Pivots ───────── */
const PIV_COL = {miss_pl: 'rgba(38,166,153,.46)', miss_ph: 'rgba(239,83,80,.47)', ghost_pl: 'rgba(38,166,153,.5)', ghost_ph: 'rgba(239,83,80,.5)', proj_h: 'rgba(239,83,80,.5)', proj_l: 'rgba(38,166,153,.5)'};
function drawNovaPivots(pv, lo, hi) {
  for (const l of pv.lines) {
    if (Math.max(l.x1, l.x2) < lo - 1 || Math.min(l.x1, l.x2) > hi + 1) continue;
    g.strokeStyle = PIV_COL[l.col]; g.lineWidth = l.width; g.setLineDash(l.dash ? [5, 4] : []);
    g.beginPath(); g.moveTo(X(l.x1), Y(l.y1)); g.lineTo(X(l.x2), Y(l.y2)); g.stroke();
  }
  g.setLineDash([]);
}

/* ───────── Nova Nexus: Soporte y Resistencia ───────── */
const SR_COL = {sup: '#ff5252', res: '#089981'};
function drawNovaSRBoxes(sr, lo, hi) {
  g.lineWidth = 1;
  for (const b of sr.boxes) {
    if (b.right < lo - 1 || b.left > hi + 1) continue;
    const x1 = X(b.left), x2 = X(b.right), yT = Y(b.top), yB = Y(b.bot), h = Math.max(1, yB - yT);
    g.fillStyle = SR_COL[b.kind]; g.globalAlpha = Math.min(1, .1 * novaP('srOp') / 100); g.fillRect(x1, yT, x2 - x1, h); g.globalAlpha = 1;
    g.strokeStyle = SR_COL[b.kind]; g.setLineDash([1, 3]); g.strokeRect(x1, yT, x2 - x1, h); g.setLineDash([]);
  }
}
function drawNovaSRLabels(sr, lo, hi) { // Break / Potential Retest / Retest, con el ancla como en los estilos de label del Pine
  g.font = '9px system-ui'; g.textAlign = 'left';
  for (const l of sr.labels) {
    if (l.i < lo || l.i >= hi) continue;
    const col = SR_COL[l.side], x = X(l.i), y = Y(l.price), w = g.measureText(l.text).width + 8, hh = 14;
    // Break: a la izquierda del punto (soporte abajo, resistencia arriba) · Retest: a la derecha (resistencia abajo, soporte arriba)
    const left = l.kind === 'brk', below = l.kind === 'brk' ? l.side === 'sup' : l.side === 'res';
    const bx = left ? x - w : x, by = below ? y : y - hh;
    g.fillStyle = col; g.globalAlpha = .5; roundRect(bx, by, w, hh, 3); g.fill(); g.globalAlpha = 1;
    g.fillStyle = col; g.fillText(l.text, bx + 4, by + 10);
  }
}

/* ───────── Nova Nexus: SMC (estructura + Order Blocks) ───────── */
const SMC_COL = {up: '#089981', dn: '#f23645'};
function tIdx(t) { // tiempo (ms) → índice fraccionario de vela (extrapola con el paso de la última vela)
  const n = candles.length; if (!n || !Number.isFinite(t)) return NaN;
  if (t >= candles[n - 1].t) { const st = n > 1 ? candles[n - 1].t - candles[n - 2].t : 1; return n - 1 + (t - candles[n - 1].t) / st; }
  let a = 0, b = n - 1; while (a < b) { const m = (a + b) >> 1; if (candles[m].t < t) a = m + 1; else b = m; }
  return a;
}
function drawNovaOB(sm) {
  const xr = geo.w - geo.right, light = document.body.classList.contains('light');
  g.font = '9px system-ui';
  for (const side of ['bull', 'bear']) {
    const col = SMC_COL[side === 'bull' ? 'up' : 'dn'], arr = sm.obs[side], mt = sm.metrics[side];
    arr.forEach((ob, k) => {
      const x1 = Math.max(geo.left, X(tIdx(ob.loc))), yT = Y(ob.top), yB = Y(ob.btm), h = yB - yT, mid = (yT + yB) / 2;
      if (x1 >= xr || !Number.isFinite(x1)) return;
      g.globalAlpha = .10; g.fillStyle = col; g.fillRect(x1, yT, xr - x1, h);
      g.globalAlpha = .5; // actividad: compras (arriba) y ventas (abajo) proporcionales a las barras acumuladas
      const xb = Math.min(xr, Math.max(x1, X(tIdx(ob.xlocbl)))), xs = Math.min(xr, Math.max(x1, X(Number.isFinite(ob.xlocbr) ? tIdx(ob.xlocbr) : tIdx(ob.loc))));
      g.fillStyle = SMC_COL.up; g.fillRect(x1, yT, xb - x1, h / 2);
      g.fillStyle = SMC_COL.dn; g.fillRect(x1, mid, xs - x1, h / 2);
      g.globalAlpha = 1; g.strokeStyle = col; g.lineWidth = 1; g.setLineDash([]); g.strokeRect(x1, yT, xr - x1, h);
      g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x1, mid); g.lineTo(xr, mid); g.stroke(); g.setLineDash([]);
      const txt = mt[k] + '%'; g.fillStyle = light ? '#222' : '#e8edf5'; g.textAlign = 'right'; g.fillText(txt, xr - 4, Math.max(yT + 10, mid - 3)); g.textAlign = 'left';
    });
  }
  g.globalAlpha = 1;
}
function drawNovaStruct(sm) {
  const xr = geo.w - geo.right; g.font = 'bold 9px system-ui'; g.textAlign = 'center';
  for (const side of ['bull', 'bear']) for (const l of sm[side]) {
    if (!l || !Number.isFinite(l.x1)) continue;
    const i1 = tIdx(l.x1), i2 = tIdx(l.x2); if (i2 < geo.start - 1 || i1 > geo.end + 1 || i2 - i1 < 0.01) continue;
    const xa = X(i1), xb = X(i2), y = Y(l.y), col = SMC_COL[l.col];
    g.strokeStyle = col; g.lineWidth = 1; g.setLineDash(l.style === 'solid' ? [] : l.style === 'dotted' ? [1, 3] : [5, 4]);
    g.beginPath(); g.moveTo(Math.max(geo.left, xa), y); g.lineTo(Math.min(xr, xb), y); g.stroke(); g.setLineDash([]);
    if (l.style === 'dashed') continue; // los niveles aún no rotos no llevan etiqueta
    const xm = Math.min(xr - 14, Math.max(geo.left + 14, (xa + xb) / 2)), up = l.col === 'up';
    g.fillStyle = col; g.textBaseline = 'alphabetic'; g.fillText(l.txt, xm, up ? y - 3 : y + 10);
  }
  g.textAlign = 'left';
}
function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function drawNovaSignals(nn, lo, hi, n) {
  const I = state.indicators, small = geo.step < 5;
  if (I.nnIa) {
    g.font = `bold ${small ? 8 : 9}px system-ui`; g.textAlign = 'center';
    for (const sg of nn.signals) {
      if (sg.i < lo || sg.i >= hi) continue;
      const c = candles[sg.i], x = X(sg.i), buy = sg.side === 'buy';
      const col = sg.div ? NN_COL[sg.side] : sg.range ? NN_COL.range : NN_COL[sg.side];
      const tw = Math.max(18, g.measureText(sg.label).width + 10), th = 15, ar = 5;
      let y = buy ? Y(c.l) + 6 : Y(c.h) - 6 - th; // etiqueta: debajo del mínimo (BUY) o encima del máximo (SELL)
      g.fillStyle = col; roundRect(x - tw / 2, buy ? y + ar : y, tw, th, 4); g.fill();
      g.beginPath(); // flecha
      if (buy) { g.moveTo(x - 4, y + ar); g.lineTo(x + 4, y + ar); g.lineTo(x, y); } else { g.moveTo(x - 4, y + th); g.lineTo(x + 4, y + th); g.lineTo(x, y + th + ar); }
      g.fill();
      g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(sg.label, x, (buy ? y + ar : y) + th / 2 + .5); g.textBaseline = 'alphabetic';
    }
    g.textAlign = 'left';
  }
  const sg = nn.last;
  if (I.nnTp && sg) { // solo la última señal conserva sus niveles (igual que el script original)
    const x1 = X(sg.i), x2 = Math.min(X(sg.i + 40), geo.w - geo.right), lv = [['entry', sg.price, 'rgba(150,150,150,.6)', [4, 3], ''], ['sl', sg.sl, NN_COL.sl, [], 'SL'], ['tp1', sg.tp1, NN_COL.tp1, [4, 3], 'TP1'], ['tp2', sg.tp2, NN_COL.tp2, [4, 3], 'TP2'], ['tp3', sg.tp3, NN_COL.tp3, [4, 3], 'TP3']];
    g.font = 'bold 8px system-ui';
    for (const [, price, col, dash, name] of lv) {
      const y = Y(price); g.strokeStyle = col; g.lineWidth = 1; g.setLineDash(dash);
      g.beginPath(); g.moveTo(Math.max(geo.left, x1), y); g.lineTo(x2, y); g.stroke(); g.setLineDash([]);
      if (name) { const tw = 26, lx = x2 - tw - 2; g.fillStyle = col; roundRect(lx, y - 7, tw, 14, 3); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(name, lx + tw / 2, y + 3); g.textAlign = 'left'; }
    }
  }
}
function drawNovaRules() {
  const txt = (novaP('rulesText') || NovaNexus.defaults.rulesText).split('\n'), x2 = geo.left + geo.plotW - 4, small = geo.w < 480, y0 = geo.plotTop + (small ? 58 : 44);
  g.font = `${small ? 8 : 10}px system-ui`; const lh = small ? 11 : 14, wText = Math.max(...txt.map(t => g.measureText(t).width)) + 14, w = Math.max(wText, 70), x = x2 - w;
  g.save(); g.globalAlpha = .92;
  g.fillStyle = '#4361cf'; g.fillRect(x, y0, w, small ? 16 : 20);
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, y0 + (small ? 16 : 20), w, txt.length * lh + 8);
  g.globalAlpha = 1; g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `bold ${small ? 9 : 12}px system-ui`; g.fillText('REGLAS', x + w / 2, y0 + (small ? 12 : 14));
  g.textAlign = 'left'; g.font = `${small ? 8 : 10}px system-ui`;
  txt.forEach((t, i) => g.fillText(t, x + 6, y0 + (small ? 16 : 20) + 12 + i * lh));
  g.restore();
}
function drawNovaScore(sg) {
  const buy = sg.side === 'buy', col = NN_COL[buy ? 'buy' : 'sell'], txt = `${buy ? '▲ BUY' : '▼ SELL'}  ${sg.score} ${'★'.repeat(sg.score)}`;
  g.font = 'bold 10px system-ui'; const w = g.measureText(txt).width + 14, x = geo.left + geo.plotW - w - 4, y = geo.plotTop + geo.plotH - 20;
  g.fillStyle = 'rgba(0,0,0,.6)'; roundRect(x, y, w, 17, 4); g.fill(); g.fillStyle = col; g.textAlign = 'left'; g.fillText(txt, x + 7, y + 12);
}
/* Herramientas de la fase 2: rayo, vertical, canal, flecha, texto, medición, extensión Fib, marcador, Long/Short */
function arrowHead(from, to, size = 9) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  g.beginPath(); g.moveTo(to.x, to.y); g.lineTo(to.x - size * Math.cos(ang - .45), to.y - size * Math.sin(ang - .45)); g.lineTo(to.x - size * Math.cos(ang + .45), to.y - size * Math.sin(ang + .45)); g.closePath(); g.fill();
}
function tag(txt, x, y, fill, align = 'left', tc = '#fff', fs = 10) { // etiqueta con fondo
  g.font = `bold ${fs}px system-ui`; const w = g.measureText(txt).width + 10; let x0 = align === 'right' ? x - w : x;
  const rx = geo.left + geo.plotW; x0 = Math.max(geo.left, Math.min(x0, rx - w)); // dentro del área del gráfico
  g.fillStyle = fill; roundRect(x0, y - 9, w, 17, 3); g.fill(); g.fillStyle = tc; g.textAlign = 'left'; g.fillText(txt, x0 + 5, y + 3.5);
}
function dStat(d, a, b) { // «mostrar precio, % y velas» de las líneas
  if (!dOpt(d, 'st') || !d.b) return; const dp = d.b.p - d.a.p, bars = Math.round(idxOfTime(d.b.t) - idxOfTime(d.a.t));
  tag(`${dp >= 0 ? '+' : ''}${fmt(dp)} (${pct(dp / d.a.p * 100)}) · ${Math.abs(bars)} velas`, b.x + 8, b.y + (b.y < a.y ? -14 : 14), '#5b6b83');
}
/* Niveles de Fibonacci que más importan en el trading: dorados y resaltados (0.618 el principal; 0.5, 0.786 y 1.618 secundarios) */
const FIB_KEY = lv => { const k = Math.round(lv * 1000) / 1000; return k === .618 ? {c: '#f5c568', w: 2.4, glow: 10, n: 'proporción áurea'} : k === 1.618 ? {c: '#f5c568', w: 2.2, glow: 8, n: 'extensión áurea'} : k === .5 ? {c: '#e9d29a', w: 1.6, glow: 4, n: 'medio'} : k === .786 ? {c: '#e9d29a', w: 1.6, glow: 4, n: 'retroceso profundo'} : k === .65 ? {c: '#d9b45c', w: 1.2, glow: 0, n: 'zona dorada'} : null; };
function dFibRows(d, L, priceOf, x1, x2, rightX, col, dim) { // niveles horizontales (retroceso y extensión): línea, etiqueta y fondo entre niveles
  const sl = dOpt(d, 'sl'), sv = dOpt(d, 'sv'), right = dOpt(d, 'lp') === 'r', fl = dOpt(d, 'fl'), fo = dOpt(d, 'fo') / 100, fc = dOpt(d, 'fc'); g.font = '10px system-ui'; g.lineWidth = 1;
  // zona dorada (golden pocket 0.618–0.65): la franja donde más rebota el precio, siempre resaltada en dorado
  if (L.some(lv => Math.abs(lv - .618) < 1e-6)) { const ya = Y(priceOf(.618)), yb = Y(priceOf(.65)); g.save(); const gr = g.createLinearGradient(x1, 0, x2, 0); gr.addColorStop(0, 'rgba(245,197,104,.26)'); gr.addColorStop(1, 'rgba(245,197,104,.08)'); g.fillStyle = gr; g.fillRect(x1, Math.min(ya, yb), x2 - x1, Math.max(2, Math.abs(yb - ya))); g.restore(); }
  L.forEach((lv, k) => {
    const pr = priceOf(lv), yy = Y(pr), key = FIB_KEY(lv), c = key ? key.c : dLvCol(d, lv, col);
    g.strokeStyle = c; g.fillStyle = c; g.globalAlpha = key || lv === 0 || lv === 1 ? 1 : dim;
    if (key) { g.save(); g.lineWidth = key.w; g.shadowColor = 'rgba(245,197,104,.55)'; g.shadowBlur = key.glow; } // niveles clave: dorados, más gruesos y con brillo
    g.beginPath(); g.moveTo(x1, yy); g.lineTo(x2, yy); g.stroke(); if (key) g.restore(); g.globalAlpha = 1;
    const tx = [sl ? String(lv) : '', sv ? `(${fmt(pr)})` : ''].filter(Boolean).join(' ') + (key && sl ? ' · ' + key.n : '');
    if (tx) { g.textAlign = right ? 'right' : 'left'; if (key) { g.font = 'bold 11px system-ui'; g.fillStyle = key.c; } g.fillText(tx, right ? x2 - 4 : Math.min(x1 + 4, rightX - 90), yy - 3); g.font = '10px system-ui'; g.textAlign = 'left'; }
    if (fl && k < L.length - 1) { const y2 = Y(priceOf(L[k + 1])); g.globalAlpha = fo; g.fillStyle = fc || dLvCol(d, L[k + 1], col); g.fillRect(x1, Math.min(yy, y2), x2 - x1, Math.abs(y2 - yy)); g.globalAlpha = 1; }
  });
  g.strokeStyle = col; g.fillStyle = col;
}
const dFont = (d, px0) => `${dOpt(d, 'it') ? 'italic ' : ''}${dOpt(d, 'bo') ? 'bold ' : ''}${px0}px system-ui`;
function drawShapeExtra(d, a, b, rightX, col) {
  const t = d.type; g.setLineDash([]); g.globalAlpha = 1; g.textAlign = 'left';
  if (t === 'vertical') { g.beginPath(); g.moveTo(a.x, geo.plotTop); g.lineTo(a.x, geo.h - geo.axisH); g.stroke(); if (dOpt(d, 'dl')) tag(dDateTag(d.a.t), a.x + 6, geo.h - geo.axisH - 12, col, 'left', readableOn(col)); }
  else if (t === 'ray') { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x + dx / L * 5000, a.y + dy / L * 5000); g.stroke(); dStat(d, a, b); }
  else if (t === 'arrow') { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.fillStyle = col; const hs = dOpt(d, 'hs') || 11; arrowHead(a, b, hs); if (dOpt(d, 'a2')) arrowHead(b, a, hs); }
  else if (t === 'text') {
    const fs = d.ts || 12, txt = d.text || ''; g.font = dFont(d, fs);
    if (dOpt(d, 'bg') || dOpt(d, 'br')) { const w = g.measureText(txt).width + 12, h = fs + 10, bx = a.x - 6, by = a.y - fs - 3; if (dOpt(d, 'bg')) { g.fillStyle = dOpt(d, 'bc'); roundRect(bx, by, w, h, 4); g.fill(); } if (dOpt(d, 'br')) { g.lineWidth = 1; roundRect(bx, by, w, h, 4); g.stroke(); } }
    g.fillStyle = col; g.fillText(txt, a.x, a.y);
  }
  else if (t === 'marker') {
    const hi = markerKind(d) === 'high'; g.font = 'bold 11px system-ui'; g.fillStyle = col; g.textAlign = 'center';
    g.fillText(hi ? '▼' : '▲', a.x, hi ? a.y - 3 : a.y + 12); g.font = 'bold 10px system-ui'; if (dOpt(d, 'vp')) g.fillText(fmt(d.a.p), a.x, hi ? a.y - 15 : a.y + 24); g.textAlign = 'left';
  }
  else if (t === 'channel') {
    const [p1, q1] = dExt(d, a, b); g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(q1.x, q1.y); g.stroke();
    if (!d.c) return;
    const off = channelOff(d), [p2, q2] = dExt(d, px({t: d.a.t, p: d.a.p + off}), px({t: d.b.t, p: d.b.p + off}));
    g.beginPath(); g.moveTo(p2.x, p2.y); g.lineTo(q2.x, q2.y); g.stroke();
    if (dOpt(d, 'ml')) { g.setLineDash([5, 4]); g.beginPath(); g.moveTo((p1.x + p2.x) / 2, (p1.y + p2.y) / 2); g.lineTo((q1.x + q2.x) / 2, (q1.y + q2.y) / 2); g.stroke(); g.setLineDash([]); }
    if (dOpt(d, 'fl')) { g.globalAlpha = dOpt(d, 'fo') / 100; g.fillStyle = dOpt(d, 'fc') || col; g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(q1.x, q1.y); g.lineTo(q2.x, q2.y); g.lineTo(p2.x, p2.y); g.closePath(); g.fill(); g.globalAlpha = 1; g.fillStyle = col; }
  }
  else if (t === 'measure') {
    const dp = d.b.p - d.a.p, up = dp >= 0, mc = up ? dOpt(d, 'uc') : dOpt(d, 'dc'), bars = Math.round(idxOfTime(d.b.t) - idxOfTime(d.a.t));
    const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    g.fillStyle = mc; g.strokeStyle = mc; if (dOpt(d, 'fl')) { g.globalAlpha = dOpt(d, 'fo') / 100; g.fillRect(x1, y1, w, h); g.globalAlpha = 1; } g.setLineDash([4, 3]); g.strokeRect(x1, y1, w, h); g.setLineDash([]);
    g.lineWidth = 1.5; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); arrowHead(a, b, 8);
    const LL = [dOpt(d, 'vp') ? `${dp >= 0 ? '+' : ''}${fmt(dp)} (${pct(dp / d.a.p * 100)})` : '', dOpt(d, 'vb') ? `${Math.abs(bars)} velas · ${fmtDur(d.b.t - d.a.t)}` : ''].filter(Boolean);
    if (LL.length) { g.font = 'bold 10px system-ui'; const tw = Math.max(...LL.map(x => g.measureText(x).width)) + 12, th = LL.length * 13 + 4, tx = clamp(x1 + w / 2 - tw / 2, geo.left, rightX - tw), ty = up ? Math.max(geo.plotTop + 2, y1 - th - 4) : Math.min(geo.plotTop + geo.plotH - th - 4, y1 + h + 4);
      g.fillStyle = mc; roundRect(tx, ty, tw, th, 4); g.fill(); g.fillStyle = '#fff'; LL.forEach((x, i) => g.fillText(x, tx + 6, ty + 12 + i * 13)); }
  }
  else if (t === 'fibext') {
    const tl = dOpt(d, 'tl'); g.setLineDash([4, 4]); g.lineWidth = 1;
    if (tl || !d.c) { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    if (!d.c) { g.setLineDash([]); return; }
    const c = px(d.c); if (tl) { g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(c.x, c.y); g.stroke(); } g.setLineDash([]);
    const sp = dFibSpan(d, a, c); dFibRows(d, dLv(d), lv => d.c.p + (d.b.p - d.a.p) * lv, sp.x1, sp.x2, rightX, col, .8);
  }
  else if (t === 'long' || t === 'short') {
    const q = posBox(d), lg = t === 'long', gc = d.gc || '#089981', rc = d.rc || '#f23645', w = q.x2 - q.x1, lw = d.lw || 1.2, ds = d.ds === 'dash' ? [7, 5] : d.ds === 'dot' ? [1.5, 4] : [];
    g.globalAlpha = dOpt(d, 'zo') / 100; g.fillStyle = gc; g.fillRect(q.x1, Math.min(q.yE, q.yT), w, Math.abs(q.yT - q.yE));
    g.fillStyle = rc; g.fillRect(q.x1, Math.min(q.yE, q.yS), w, Math.abs(q.yS - q.yE)); g.globalAlpha = 1;
    g.lineWidth = lw; g.setLineDash(ds); if (dOpt(d, 'bd')) { g.strokeStyle = gc; g.strokeRect(q.x1, Math.min(q.yE, q.yT), w, Math.abs(q.yT - q.yE));
      g.strokeStyle = rc; g.strokeRect(q.x1, Math.min(q.yE, q.yS), w, Math.abs(q.yS - q.yE)); }
    g.strokeStyle = dOpt(d, 'ec'); g.beginPath(); g.moveTo(q.x1, q.yE); g.lineTo(q.x2, q.yE); g.stroke(); g.setLineDash([]);
    const pc = v => dOpt(d, 'pc') ? ` (${pct((v - q.entry) / q.entry * 100)})` : '', tc = d.tc || '#fff', fs = d.ts ? Math.max(9, d.ts - 3) : 10;
    if (!d.nt) tag(d.label ? d.label : `${lg ? 'Long' : 'Short'} · R:R ${(Math.abs(q.target - q.entry) / (Math.abs(q.entry - q.stop) || 1)).toFixed(2)}`, q.x1, q.yE, '#5b6b83', 'left', tc, fs);
    if (!d.no) tag(`Objetivo ${fmt(q.target)}${pc(q.target)}`, q.x1, q.yT + (q.yT < q.yE ? -11 : 11), gc, 'left', tc, fs);
    if (!d.ns) tag(`Stop ${fmt(q.stop)}${pc(q.stop)}`, q.x1, q.yS + (q.yS < q.yE ? -11 : 11), rc, 'left', tc, fs);
    const RK = state.risk || {}, cap = riskCap(); // tamaño de posición según tu riesgo (calculadora)
    if (RK.show !== false && cap > 0 && window.CCTRisk && !d.nr) { const r = CCTRisk.calc({capital: cap, riskPct: RK.pct, entry: q.entry, stop: q.stop, target: q.target, leverage: RK.lev, feePct: RK.fee});
      if (r.ok) tag(`Tamaño ${fmtQty(r.qty)} (${usd(r.notional)}) · x${r.lev} · arriesgas ${usd(r.loss)}${r.warn.length && /liquidar/.test(r.warn[0]) ? ' · ⚠ liquidación antes del stop' : ''}`, q.x1, q.yE + (q.yS > q.yE ? 13 : -13), '#2a3446', 'left', tc, Math.max(9, fs - 1)); }
  }
}
function drawShapeNew(d, a, b, rightX, col, selected) {
  const t = d.type; g.setLineDash([]); g.globalAlpha = 1; g.textAlign = 'left';
  const lw = selected ? 2.2 : 1.5; g.lineWidth = lw; g.strokeStyle = col; g.fillStyle = col;
  const poly = (P, close) => { g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); if (close) g.closePath(); };
  const seg = (p, q) => { g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); };
  const F = CCTDrawCfg.has(d, 'fl') ? (dOpt(d, 'fl') ? {a: dOpt(d, 'fo') / 100, c: dOpt(d, 'fc')} : null) : undefined; // fondo configurable de esta herramienta (undefined = no aplica)
  const fillA = (al, fn) => { if (F === null) return; const pf = g.fillStyle; g.globalAlpha = F ? F.a : al; if (F && F.c) g.fillStyle = F.c; fn(); g.globalAlpha = 1; g.fillStyle = pf; };
  const bd = () => { if (dOpt(d, 'bd') !== false) g.stroke(); };
  const dash = fn => { g.setLineDash([5, 4]); g.lineWidth = 1; fn(); g.setLineDash([]); g.lineWidth = lw; };
  const lab = (txt, x, y) => { g.font = 'bold 11px system-ui'; g.fillStyle = col; g.textAlign = 'center'; g.fillText(txt, x, y); g.textAlign = 'left'; };
  const M = MULTI[t];
  if (M) {
    const P = ptsPx(d); if (!P.length) return;
    const fillIdx = idx => { if (idx.every(i => P[i])) { poly(idx.map(i => P[i]), true); fillA(.12, () => g.fill()); } };
    const dseg = (i, j) => { if (P[i] && P[j]) dash(() => seg(P[i], P[j])); };
    if (t === 'xabcd') { fillIdx([0, 1, 2]); fillIdx([2, 3, 4]); }
    if (t === 'trianglep') { fillIdx([0, 2, 3, 1]); if (P[2]) seg(P[0], P[2]); if (P[3]) seg(P[1], P[3]); dseg(0, 1); dseg(1, 2); dseg(2, 3); }
    else { poly(P); g.stroke(); }
    if (t === 'xabcd') { dseg(0, 2); dseg(1, 3); dseg(2, 4); dseg(0, 4); }
    if (t === 'abcd' && dOpt(d, 'gl')) { dseg(0, 2); dseg(1, 3); }
    if (t === 'hs' && P[4] && dOpt(d, 'nk')) dash(() => seg(P[2], farPt(P[2], P[4])));
    g.fillStyle = col; P.forEach(p => { g.beginPath(); g.arc(p.x, p.y, 2.6, 0, 7); g.fill(); });
    if (dOpt(d, 'lb') !== false) (M.labels || []).forEach((tx, i) => { const p = P[i]; if (!p || !tx) return; const up = (!P[i - 1] || P[i - 1].y > p.y) && (!P[i + 1] || P[i + 1].y > p.y); lab(tx, p.x, up ? p.y - 8 : p.y + 17); });
    return;
  }
  const bars = b && d.b ? Math.round(idxOfTime(d.b.t) - idxOfTime(d.a.t)) : 0;
  if (t === 'hray') { seg(a, {x: rightX, y: a.y}); if (dOpt(d, 'pt')) { g.beginPath(); g.arc(a.x, a.y, 3, 0, 7); g.fill(); } if (dOpt(d, 'pl')) tag(fmt(d.a.p), rightX - 2, a.y - 11, col, 'right', readableOn(col)); }
  else if (t === 'crossline') { seg({x: geo.left, y: a.y}, {x: rightX, y: a.y}); seg({x: a.x, y: geo.plotTop}, {x: a.x, y: geo.h - geo.axisH}); if (dOpt(d, 'pl')) tag(fmt(d.a.p), rightX - 2, a.y - 11, col, 'right', readableOn(col)); if (dOpt(d, 'dl')) tag(dDateTag(d.a.t), a.x + 6, geo.h - geo.axisH - 12, col, 'left', readableOn(col)); }
  else if (t === 'extended') { seg(farPt(a, b, -1), farPt(a, b, 1)); dStat(d, a, b); }
  else if (t === 'info') {
    seg(a, b); const dp = d.b.p - d.a.p, parts = [dOpt(d, 'vp') ? `${dp >= 0 ? '+' : ''}${fmt(dp)} (${pct(dp / d.a.p * 100)})` : '', dOpt(d, 'vb') ? `${Math.abs(bars)} velas` : '', dOpt(d, 'vt') ? fmtDur(d.b.t - d.a.t) : ''].filter(Boolean);
    if (parts.length) tag(parts.join(' · '), b.x + 8, b.y + (b.y < a.y ? -14 : 14), '#5b6b83');
  }
  else if (t === 'angle') {
    seg(a, b); if (dOpt(d, 'gl')) dash(() => seg(a, {x: b.x, y: a.y}));
    const sx = b.x >= a.x ? 1 : -1, ang = Math.atan2(a.y - b.y, Math.abs(b.x - a.x)), deg = ang * 180 / Math.PI;
    g.beginPath(); if (sx === 1) g.arc(a.x, a.y, 26, 0, -ang, ang > 0); else g.arc(a.x, a.y, 26, Math.PI, Math.PI + ang, ang < 0); g.lineWidth = 1; g.stroke(); g.lineWidth = lw;
    if (dOpt(d, 'sa')) tag(deg.toFixed(1) + '°', a.x + sx * 34, a.y - 12, '#5b6b83', sx === 1 ? 'left' : 'right');
  }
  else if (t === 'pricerange') {
    const x1 = Math.min(a.x, b.x), w = Math.max(60, Math.abs(b.x - a.x)), mx = x1 + w / 2, dp = d.b.p - d.a.p, mc = dp >= 0 ? dOpt(d, 'uc') : dOpt(d, 'dc');
    g.fillStyle = mc; g.strokeStyle = mc; fillA(.12, () => g.fillRect(x1, Math.min(a.y, b.y), w, Math.abs(b.y - a.y)));
    seg({x: x1, y: a.y}, {x: x1 + w, y: a.y}); seg({x: x1, y: b.y}, {x: x1 + w, y: b.y}); seg({x: mx, y: a.y}, {x: mx, y: b.y}); arrowHead({x: mx, y: a.y}, {x: mx, y: b.y}, 8);
    if (dOpt(d, 'vp')) tag(`${dp >= 0 ? '+' : ''}${fmt(dp)} (${pct(dp / d.a.p * 100)})`, mx + 8, (a.y + b.y) / 2, mc, 'left', readableOn(mc));
  }
  else if (t === 'daterange') {
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = geo.plotTop, y2 = geo.h - geo.axisH, ym = (a.y + b.y) / 2, mc = d.col || '#548fff';
    g.fillStyle = mc; g.strokeStyle = mc; fillA(.08, () => g.fillRect(x1, y1, x2 - x1, y2 - y1));
    seg({x: x1, y: y1}, {x: x1, y: y2}); seg({x: x2, y: y1}, {x: x2, y: y2}); seg({x: a.x, y: ym}, {x: b.x, y: ym}); arrowHead({x: a.x, y: ym}, {x: b.x, y: ym}, 8);
    if (dOpt(d, 'vb')) tag(`${Math.abs(bars)} velas · ${fmtDur(d.b.t - d.a.t)}`, (x1 + x2) / 2 - 40, ym - 14, mc, 'left', readableOn(mc));
  }
  else if (t === 'ellipse') {
    g.beginPath(); g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(1, Math.abs(b.x - a.x) / 2), Math.max(1, Math.abs(b.y - a.y) / 2), 0, 0, Math.PI * 2); fillA(.12, () => g.fill()); bd();
  }
  else if (t === 'triangle') {
    if (!d.c) seg(a, b); else { poly([a, b, px(d.c)], true); fillA(.12, () => g.fill()); bd(); }
  }
  else if (t === 'pitchfork') {
    if (!d.c) { seg(a, b); return; }
    const R = pitchRays(d); poly([R[1][0], R[1][1], R[2][1], R[2][0]], true); fillA(.08, () => g.fill());
    R.forEach(([p, q], k) => { g.lineWidth = k === 0 ? lw : 1.2; seg(p, q); }); g.lineWidth = lw; dash(() => seg(R[1][0], R[2][0]));
    if (dOpt(d, 'ml')) { const M = {x: (R[1][0].x + R[2][0].x) / 2, y: (R[1][0].y + R[2][0].y) / 2}; [1, 2].forEach(k => { const s0 = {x: (M.x + R[k][0].x) / 2, y: (M.y + R[k][0].y) / 2}; dash(() => seg(s0, {x: s0.x + R[k][1].x - R[k][0].x, y: s0.y + R[k][1].y - R[k][0].y})); }); }
  }
  else if (t === 'fibtime') {
    const i0 = idxOfTime(d.a.t), u = idxOfTime(d.b.t) - i0, sl = dOpt(d, 'sl'); if (dOpt(d, 'tl')) dash(() => seg(a, b)); g.font = '10px system-ui';
    dLv(d).forEach(nn => { const x = X(i0 + u * nn); if (x < geo.left - 1 || x > rightX) return; const c = dLvCol(d, nn, col); g.globalAlpha = nn <= 1 ? 1 : .7; g.lineWidth = 1; g.strokeStyle = c; seg({x, y: geo.plotTop}, {x, y: geo.h - geo.axisH}); g.globalAlpha = 1; if (sl) { g.fillStyle = c; g.fillText(String(nn), x + 3, geo.plotTop + 11); } }); g.lineWidth = lw; g.strokeStyle = col; g.fillStyle = col;
  }
  else if (t === 'fibfan') {
    g.font = '10px system-ui'; const FL = dLv(d), sl = dOpt(d, 'sl');
    fanRays(d).forEach(([p, q], k) => { const lv = FL[k], c = dLvCol(d, lv, col); g.globalAlpha = lv === 1 ? 1 : .8; g.lineWidth = lv === 1 ? lw : 1; g.strokeStyle = c; seg(p, q); g.globalAlpha = 1; if (sl) { g.fillStyle = c; g.fillText(String(lv), b.x + 4, a.y + (b.y - a.y) * lv + 3); } }); g.lineWidth = lw; g.strokeStyle = col; g.fillStyle = col;
  }
  else if (t === 'fibcircle') {
    const {m, R} = fibCircle(d), sl = dOpt(d, 'sl'); if (dOpt(d, 'tl')) dash(() => seg(a, b)); g.font = '10px system-ui';
    dLv(d).forEach(lv => { const c = dLvCol(d, lv, col); g.globalAlpha = lv === 1 ? 1 : .75; g.lineWidth = 1; g.strokeStyle = c; g.beginPath(); g.arc(m.x, m.y, R * lv, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; if (sl) { g.fillStyle = c; g.fillText(String(lv), m.x + 3, m.y - R * lv - 2); } }); g.lineWidth = lw; g.strokeStyle = col; g.fillStyle = col;
  }
  else if (t === 'regression') {
    const R = regLines(d); if (!R) { seg(a, b); return; }
    const [m, u, l] = R.lines; poly([u[0], u[1], l[1], l[0]], true); fillA(.08, () => g.fill());
    g.lineWidth = lw; seg(m[0], m[1]); dash(() => { seg(u[0], u[1]); seg(l[0], l[1]); });
    if (dOpt(d, 'lb')) { const dv = dOpt(d, 'dv'); g.font = '10px system-ui'; g.fillStyle = col; g.fillText(`+${dv}σ`, Math.max(u[1].x, l[1].x) + 6, u[1].y + 3); g.fillText(`-${dv}σ`, Math.max(u[1].x, l[1].x) + 6, l[1].y + 3); }
  }
  else if (t === 'cyclic') {
    const i0 = idxOfTime(d.a.t), u = idxOfTime(d.b.t) - i0, nb = dOpt(d, 'nb'); if (dOpt(d, 'gl')) dash(() => seg(a, b)); if (!u) return; g.font = '10px system-ui';
    for (let k = 0; k < 200; k++) { const x = X(i0 + u * k); if (x > rightX) break; if (x < geo.left) continue; g.globalAlpha = .75; g.lineWidth = 1; seg({x, y: geo.plotTop}, {x, y: geo.h - geo.axisH}); g.globalAlpha = 1; if (nb) g.fillText(String(k + 1), x + 3, geo.plotTop + 11); }
    g.lineWidth = lw;
  }
  else if (t === 'sinewave') { const P = sinePts(d, rightX); if (P.length > 1) { poly(P); g.stroke(); } if (dOpt(d, 'gl')) dash(() => seg(a, b)); }
  else if (t === 'gannfan') {
    g.font = '10px system-ui'; const GL = dLv(d), sl = dOpt(d, 'sl');
    gannRays(d).forEach(([p, q], k) => { const one = GL[k] === 1, c = dLvCol(d, GL[k], col); g.globalAlpha = one ? 1 : .75; g.lineWidth = one ? lw : 1; g.strokeStyle = c; seg(p, q); g.globalAlpha = 1; g.fillStyle = c; const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1, tx = Math.min(rightX - 26, p.x + dx / L * Math.min(L, 200)), ty = p.y + dy / L * Math.min(L, 200); if (sl && tx > p.x + 20) g.fillText(CCTDrawCfg.levelLabel(d, GL[k]), tx, ty - 3); });
    g.lineWidth = lw; g.strokeStyle = col; g.fillStyle = col;
  }
  else if (t === 'gannbox') {
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y), w = x2 - x1, h = y2 - y1;
    fillA(.07, () => g.fillRect(x1, y1, w, h)); g.strokeRect(x1, y1, w, h); g.lineWidth = 1;
    dLv(d).forEach(f => { g.globalAlpha = f === .5 ? .8 : .45; seg({x: x1, y: y1 + h * f}, {x: x2, y: y1 + h * f}); seg({x: x1 + w * f, y: y1}, {x: x1 + w * f, y: y2}); });
    if (dOpt(d, 'dg')) { g.globalAlpha = .8; seg({x: x1, y: y1}, {x: x2, y: y2}); seg({x: x2, y: y1}, {x: x1, y: y2}); } g.globalAlpha = 1; g.lineWidth = lw;
  }
  else if (t === 'circle') { g.beginPath(); g.arc(a.x, a.y, Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), 0, Math.PI * 2); fillA(.12, () => g.fill()); bd(); }
  else if (t === 'diamond') { const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2; poly([{x: cx, y: Math.min(a.y, b.y)}, {x: Math.max(a.x, b.x), y: cy}, {x: cx, y: Math.max(a.y, b.y)}, {x: Math.min(a.x, b.x), y: cy}], true); fillA(.12, () => g.fill()); bd(); }
  else if (t === 'parallelogram') { if (!d.c) seg(a, b); else { const c = px(d.c); poly([a, b, c, {x: a.x + c.x - b.x, y: a.y + c.y - b.y}], true); fillA(.12, () => g.fill()); bd(); } }
  else if (t === 'callout') {
    g.font = dFont(d, d.ts || 12); const txt = d.text || '', w = g.measureText(txt).width + 16;
    seg(a, b); if (dOpt(d, 'pt')) { g.beginPath(); g.arc(a.x, a.y, 3, 0, 7); g.fill(); }
    g.fillStyle = col; fillA(.95, () => { roundRect(b.x - w / 2, b.y - 12, w, 24, 5); g.fill(); }); if (dOpt(d, 'br')) { g.strokeStyle = d.tc || readableOn(col); g.lineWidth = 1; roundRect(b.x - w / 2, b.y - 12, w, 24, 5); g.stroke(); g.strokeStyle = col; g.lineWidth = lw; } g.fillStyle = d.tc || readableOn(col); g.textAlign = 'center'; g.fillText(txt, b.x, b.y + 4); g.textAlign = 'left';
  }
  else if (t === 'flag') { seg(a, {x: a.x, y: a.y - 26}); poly([{x: a.x, y: a.y - 26}, {x: a.x + 17, y: a.y - 20}, {x: a.x, y: a.y - 13}], true); g.fill(); g.beginPath(); g.arc(a.x, a.y, 2.5, 0, 7); g.fill(); }
  else if (t === 'check') { g.lineWidth = 3.2; g.lineCap = 'round'; g.lineJoin = 'round'; poly([{x: a.x - 8, y: a.y}, {x: a.x - 2.5, y: a.y + 6}, {x: a.x + 8, y: a.y - 7}]); g.stroke(); g.lineCap = 'butt'; g.lineJoin = 'miter'; g.lineWidth = lw; }
  else if (t === 'xmark') { g.lineWidth = 3.2; g.lineCap = 'round'; seg({x: a.x - 7, y: a.y - 7}, {x: a.x + 7, y: a.y + 7}); seg({x: a.x + 7, y: a.y - 7}, {x: a.x - 7, y: a.y + 7}); g.lineCap = 'butt'; g.lineWidth = lw; }
  else if (t === 'star') { const P = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.8 : 11, an = -Math.PI / 2 + i * Math.PI / 5; P.push({x: a.x + Math.cos(an) * r, y: a.y + Math.sin(an) * r}); } poly(P, true); if (!dOpt(d, 'ol')) g.fill(); g.lineJoin = 'round'; g.stroke(); g.lineJoin = 'miter'; }
  else if (t === 'arrowleft' || t === 'arrowright') { const sx = t === 'arrowleft' ? 1 : -1; poly([a, {x: a.x + 13 * sx, y: a.y - 9}, {x: a.x + 13 * sx, y: a.y - 3.5}, {x: a.x + 36 * sx, y: a.y - 3.5}, {x: a.x + 36 * sx, y: a.y + 3.5}, {x: a.x + 13 * sx, y: a.y + 3.5}, {x: a.x + 13 * sx, y: a.y + 9}], true); g.fill(); }
  else if (t === 'note') {
    g.font = dFont(d, d.ts || 12); const txt = d.text || '', w = g.measureText(txt).width + 14, h = 24, bx = a.x - 6, by = a.y - h - 9;
    g.fillStyle = col; fillA(.95, () => { roundRect(bx, by, w, h, 5); g.fill(); }); if (dOpt(d, 'br')) { g.strokeStyle = d.tc || readableOn(col); g.lineWidth = 1; roundRect(bx, by, w, h, 5); g.stroke(); g.strokeStyle = col; g.lineWidth = lw; }
    g.beginPath(); g.moveTo(a.x - 2, by + h - 1); g.lineTo(a.x + 7, by + h - 1); g.lineTo(a.x, a.y); g.closePath(); g.fill();
    g.fillStyle = d.tc || readableOn(col); g.fillText(txt, bx + 7, by + 16);
  }
  else if (t === 'label') {
    g.font = 'bold 11px system-ui'; const txt = fmt(d.a.p), w = g.measureText(txt).width + 12, bx = a.x + 10;
    g.beginPath(); g.arc(a.x, a.y, 3, 0, 7); g.fill(); seg(a, {x: bx, y: a.y});
    g.fillStyle = col; roundRect(bx, a.y - 9, w, 18, 4); g.fill(); g.fillStyle = readableOn(col); g.fillText(txt, bx + 6, a.y + 4);
  }
  else if (t === 'arrowup' || t === 'arrowdown') {
    const s = t === 'arrowup' ? 1 : -1; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x - 9, a.y + 14 * s); g.lineTo(a.x - 3.5, a.y + 14 * s); g.lineTo(a.x - 3.5, a.y + 28 * s); g.lineTo(a.x + 3.5, a.y + 28 * s); g.lineTo(a.x + 3.5, a.y + 14 * s); g.lineTo(a.x + 9, a.y + 14 * s); g.closePath(); g.fill();
  }
}
function drawBrush(d, selected, col) {
  const P = d.pts.map(q => ({x: X(idxOfTime(q[0])), y: Y(q[1])})); if (P.length < 2) return;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([]);
  const trace = () => { g.beginPath(); g.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length - 1; i++) g.quadraticCurveTo(P[i].x, P[i].y, (P[i].x + P[i + 1].x) / 2, (P[i].y + P[i + 1].y) / 2); g.lineTo(P[P.length - 1].x, P[P.length - 1].y); };
  if (selected) { g.strokeStyle = '#fff'; g.globalAlpha = .35; g.lineWidth = d.w + 6; trace(); g.stroke(); g.globalAlpha = 1; }
  g.strokeStyle = d.col || col; g.lineWidth = d.w || 3; g.globalAlpha = (dOpt(d, 'op') || (d.hl ? 35 : 100)) / 100; trace(); g.stroke(); g.restore();
}
/* Estilo propio del dibujo (grosor y estilo de línea): se aplica a cada trazo que hace el dibujo sin tocar cada herramienta */
function styleWrap(d) {
  const f = d.lw ? d.lw / 1.5 : 1, ds = d.ds; if (f === 1 && !ds) return () => {};
  const proto = CanvasRenderingContext2D.prototype, S = proto.stroke, R = proto.strokeRect;
  const wrap = fn => function (...a) {
    const w = g.lineWidth, ld = g.getLineDash(), cap = g.lineCap; g.lineWidth = w * f;
    if (ds && !ld.length) { const u = Math.max(1, g.lineWidth); g.setLineDash(ds === 'dash' ? [u * 4.5, u * 3] : [u * .1, u * 2.8]); if (ds === 'dot') g.lineCap = 'round'; }
    fn.apply(g, a); g.lineWidth = w; g.setLineDash(ld); g.lineCap = cap;
  };
  g.stroke = wrap(S); g.strokeRect = wrap(R);
  return () => { delete g.stroke; delete g.strokeRect; };
}
function drawLabel(d, a, b, col) { // texto que el usuario añade a un dibujo
  if (!d.label || SB_TEXT.has(d.type)) return;
  const sz = d.ts || 12, c = d.tc || col; let x, y, al = 'left';
  if (d.type === 'horizontal') { x = geo.left + 8; y = a.y - 6; }
  else if (d.type === 'vertical') { x = a.x + 6; y = geo.plotTop + 16; }
  else if (b) { x = (a.x + b.x) / 2; y = (a.y + b.y) / 2 - 8; al = 'center'; }
  else { x = a.x + 10; y = a.y - 10; }
  g.save(); g.font = `bold ${sz}px system-ui`; g.textAlign = al; g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(9,14,25,.85)'; g.strokeText(d.label, x, y); g.fillStyle = c; g.fillText(d.label, x, y); g.restore();
}
function drawShape(d, selected, col, textCol) {
  if (d.hide) return;
  if (d.type === 'brush') { drawBrush(d, selected, col); return; }
  if (d.col) col = d.col;
  if (d.type === 'text' && d.tc) col = d.tc;
  const unwrap = styleWrap(d);
  const a = d.type === 'horizontal' ? {x: 0, y: Y(d.a.p)} : px(d.a), b = d.b ? px(d.b) : null;
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = selected ? 2.2 : 1.5; g.setLineDash([]);
  const rightX = geo.w - geo.right;
  if (d.type === 'horizontal') {
    g.beginPath(); g.moveTo(geo.left, a.y); g.lineTo(rightX, a.y); g.stroke();
    if (dOpt(d, 'pl')) { g.font = '10px system-ui'; g.fillRect(rightX + 2, a.y - 9, geo.right - 3, 18); g.fillStyle = '#10151f'; g.fillText(fmt(d.a.p), rightX + 5, a.y + 3.5); }
  } else if (d.type === 'trend') {
    const [p, q] = dExt(d, a, b); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
    if (dOpt(d, 'ar')) arrowHead(a, b, 11);
    dStat(d, a, b);
  } else if (d.type === 'rect') {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = (dOpt(d, 'xr') ? rightX : Math.max(a.x, b.x)) - x, h = Math.abs(b.y - a.y);
    if (dOpt(d, 'fl')) { g.globalAlpha = dOpt(d, 'fo') / 100; g.fillStyle = dOpt(d, 'fc') || col; g.fillRect(x, y, w, h); g.globalAlpha = 1; g.fillStyle = col; }
    if (dOpt(d, 'bd')) g.strokeRect(x, y, w, h);
    if (dOpt(d, 'ml')) { g.setLineDash([5, 4]); g.beginPath(); g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); g.stroke(); g.setLineDash([]); }
  } else if (d.type === 'fib') {
    const sp = dFibSpan(d, a, b); dFibRows(d, dLv(d), lv => dFibPrice(d, lv), sp.x1, sp.x2, rightX, col, .75);
    if (dOpt(d, 'tl')) { g.setLineDash([4, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); }
  }
  const sz = dOpt(d, 'sz'), scaled = !!sz && sz !== 1; if (scaled) { g.save(); g.translate(a.x, a.y); g.scale(sz, sz); g.translate(-a.x, -a.y); } // iconos y marcas con tamaño propio
  drawShapeExtra(d, a, b, rightX, col);
  drawShapeNew(d, a, b, rightX, col, selected);
  if (scaled) g.restore();
  unwrap(); drawLabel(d, a, b, col);
  if (selected) for (const hnd of handlesOf(d)) { g.fillStyle = '#fff'; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(hnd.x, hnd.y, 7, 0, 7); g.fill(); g.stroke(); }
}

/* ───────── Gestos: pan, pellizco, retícula, dibujo ───────── */
const area = $('#chartArea'), ptrs = new Map();
let gest = null, pinch = null, lastTap = null, brushLive = null, alHinted = false;
const local = e => { const r = $('#priceCanvas').getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
area.addEventListener('pointerdown', e => { stopMotion();
  if (e.target.closest('.chart-controls,.draw-hint,.leg-row,.pbar,.pbar-pop,.pbar-hidden,.leg-toggle,.favbar,.fav-fab,.brand-fab,.wl-add-fab,.al-confirm')) return;
  if (alConfirm) closeAlConfirm(true);
  try { area.setPointerCapture(e.pointerId); } catch {} ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (!geo) return;
  if (ptrs.size === 2) { startPinch(); return; }
  if (ptrs.size > 2) return;
  const pt = local(e);
  gest = {id: e.pointerId, x0: e.clientX, y0: e.clientY, pan0: pan, moved: false, mode: 'pending', start: null, handle: null, timer: 0};
  const paneAx = pt.x >= geo.w - geo.right - 4 ? paneHit.find(q => pt.y >= q.top0 && pt.y < q.top0 + q.H) : null;
  { const ip = !paneAx && pt.x < geo.w - geo.right - 4 ? paneHit.find(q => pt.y >= q.top0 && pt.y < q.top0 + q.H) : null; if (ip) gest.inPane = {key: ip.key, min0: ip.mn, max0: ip.mx, H: Math.max(30, ip.H - 10)}; } // dedo dentro de un panel (oscilador, RSI…): al arrastrar también se desplaza en vertical
  const onPriceAxis = !paneAx && pt.x >= geo.w - geo.right - 4 && pt.y <= geo.plotTop + geo.plotH + 8, onTimeAxis = pt.y >= geo.h - 34 && pt.x < geo.w - geo.right;
  if (paneAx) { gest.mode = 'scaleP'; gest.pane = {key: paneAx.key, min0: paneAx.mn, max0: paneAx.mx}; cross = null; } // barra derecha de un panel (oscilador, RSI…): arrastrar = agrandar/achicar su escala
  else if (onPriceAxis || onTimeAxis) { // arrastrar la barra derecha = escala de precio · barra inferior = escala de tiempo
    gest.mode = onPriceAxis ? 'scaleY' : 'scaleX'; gest.min0 = geo.min; gest.max0 = geo.max; gest.vis0 = visible; gest.pan1 = pan; cross = null;
  } else if (isBrushTool(drawTool) && (pt.y < geo.plotTop || pt.y > geo.plotTop + geo.plotH || pt.x < geo.left || pt.x > geo.left + geo.plotW)) { gest.mode = 'ignore'; toast('El pincel dibuja sobre el gráfico de precio'); }
  else if (isBrushTool(drawTool)) { gest.mode = 'brush'; selectedId = null; brushLive = [[timeOfIdx(IDX(pt.x)), PRICE(pt.y)]]; gest.lx = pt.x; gest.ly = pt.y; updateDrawUI(); scheduleRender(); }
  else if (drawTool) gest.start = snapPoint(pt);
  else if (selectedId && gest.mode === 'pending') {
    const d = getDrawings().find(x => x.id === selectedId);
    const hnd = d && handlesOf(d).find(hh => Math.hypot(hh.x - pt.x, hh.y - pt.y) < 24);
    if (hnd) { gest.mode = 'handle'; gest.handle = hnd.key; }
    else if (d && !d.lock && !DOPT.lock && !DOPT.hide && !d.hide && distToDrawing(d, pt) < 18) startDMove(d, pt);
  }
  if (gest.mode === 'pending' && !drawTool && !PANE && trHit.length) { // botones y líneas de las operaciones demo
    const b = trHit.find(q => !q.line && pt.x >= q.x && pt.x <= q.x + q.w && pt.y >= q.y && pt.y <= q.y + q.h);
    if (b && b.act !== 'drag' && b.act !== 'sel') { gest.mode = 'trbtn'; gest.tr = b; clearTimeout(gest.timer); }
    else { const tol = e.pointerType === 'mouse' ? 6 : 14, ln = b ? trHit.find(q => q.line && q.id === b.id && q.kind === b.kind) : trHit.filter(q => q.line).sort((u, v) => Math.abs(u.yy - pt.y) - Math.abs(v.yy - pt.y)).find(q => Math.abs(q.yy - pt.y) <= tol);
      if (ln) { gest.mode = 'trmove'; gest.tr = {id: ln.id, kind: ln.kind, dy: pt.y - ln.yy}; } }
  }
  if (gest.mode === 'pending' && !drawTool && !PANE && selAlertId) { const al = alertHit(pt, e); if (al && al.id === selAlertId) { gest.mode = 'almove'; gest.al = {id: al.id}; gest.snapY = pt.y - Y(al.price); } } // línea de alerta seleccionada: arrastrarla cambia su precio
  if (gest.mode === 'pending' && !drawTool)
    gest.timer = setTimeout(() => { if (gest && !gest.moved && gest.mode === 'pending') { gest.mode = 'cross'; cross = pt; navigator.vibrate?.(8); scheduleRender(); } }, 380);
});
function alertHit(pt, e) { // alerta de precio activa del símbolo actual cuya línea está bajo el dedo/cursor
  if (PANE || !geo || !(pt.x >= geo.left && pt.x <= geo.w - geo.right) || pt.y < geo.plotTop || pt.y > geo.plotTop + geo.plotH) return null;
  const tol = e && e.pointerType === 'mouse' ? 7 : 16; let best = null, bd = tol;
  for (const a of state.alerts) { if (a.kind === 'ind' || !a.on || a.symbol !== state.symbol) continue; const d = Math.abs(Y(a.price) - pt.y); if (d <= bd) { bd = d; best = a; } }
  return best;
}
function closeAlConfirm(cancel) { if (!alConfirm) return; alConfirm.el.remove(); document.removeEventListener('keydown', alConfirm.key, true); alConfirm = null; if (cancel) { alDrag = null; scheduleRender(); } }
function askMoveAlert(id, p) { // pide confirmación antes de cambiar el precio de la alerta
  const a = state.alerts.find(x => x.id === id); closeAlConfirm(); if (!a || !geo) { alDrag = null; scheduleRender(); return; }
  p = +p.toPrecision(8); alDrag = {id, p};
  const box = document.createElement('div'); box.className = 'al-confirm'; box.setAttribute('role', 'dialog');
  box.innerHTML = `<div class="alc-t">¿Mover la alerta aquí?</div><div class="alc-p"><s>${fmt(a.price)}</s><span>→</span><b>${fmt(p)}</b></div><div class="alc-b"><button type="button" data-k="no">Cancelar</button><button type="button" data-k="ok" class="ok">Mover</button></div>`;
  const cr = $('#priceCanvas').getBoundingClientRect(), ar = area.getBoundingClientRect(), ny = Y(p) + cr.top - ar.top, top = ny > ar.height * .55 ? ny - 104 : ny + 16;
  box.style.top = Math.max(8, Math.min(ar.height - 120, top)) + 'px';
  area.appendChild(box);
  const key = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); closeAlConfirm(true); } else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); ok(); } };
  const ok = () => {
    const al = state.alerts.find(x => x.id === id), cur = curPrice(al && al.symbol); if (!al) return closeAlConfirm(true);
    if (Number.isFinite(cur) && p === cur) { toast('El precio ya está en ese nivel'); return closeAlConfirm(true); }
    if (Number.isFinite(cur) && al.cond === 'up' && p < cur) { toast('Es una alerta de cruce ascendente: debe quedar sobre el precio actual'); return closeAlConfirm(true); }
    if (Number.isFinite(cur) && al.cond === 'down' && p > cur) { toast('Es una alerta de cruce descendente: debe quedar bajo el precio actual'); return closeAlConfirm(true); }
    al.price = p; if (Number.isFinite(cur)) al.dir = p > cur ? 'up' : 'down'; al.wait = false; if (!al.wait) delete al.wait;
    closeAlConfirm(); alDrag = null; save(); renderAlerts(); scheduleRender(); toast('Alerta movida a ' + fmt(p));
  };
  box.onclick = ev => { const b = ev.target.closest('button'); if (!b) return; if (b.dataset.k === 'ok') ok(); else closeAlConfirm(true); };
  document.addEventListener('keydown', key, true); alConfirm = {el: box, key};
}
function startDMove(d, pt) {
  gest.mode = 'dmove'; gest.dm = {id: d.id, orig: JSON.parse(JSON.stringify(d)), i0: IDX(pt.x), p0: PRICE(pt.y), snap: false};
}
function applyDMove(d, pt) {
  const m = gest.dm, o = m.orig, di = IDX(pt.x) - m.i0, dp = PRICE(pt.y) - m.p0;
  const mv = q => Array.isArray(q) ? [Math.round(timeOfIdx(idxOfTime(q[0]) + di)), q[1] + dp] : {t: Math.round(timeOfIdx(idxOfTime(q.t) + di)), p: q.p + dp};
  const mt = q => Array.isArray(q) ? [Math.round(timeOfIdx(idxOfTime(q[0]) + di)), q[1]] : {...q, t: Math.round(timeOfIdx(idxOfTime(q.t) + di))};
  const mp = q => Array.isArray(q) ? [q[0], q[1] + dp] : {...q, p: q.p + dp};
  const f = o.type === 'horizontal' ? mp : o.type === 'vertical' ? mt : mv;
  for (const k of ['a', 'b', 'c']) if (o[k]) d[k] = f(o[k]);
  if (o.pts) { d.pts = o.pts.map(f); if (MULTI[o.type] || o.type === 'brush') d.a = o.type === 'brush' ? {t: d.pts[0][0], p: d.pts[0][1]} : d.pts[0]; }
  if (Number.isFinite(o.sp)) d.sp = o.sp + dp;
}
area.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (pinch && ptrs.size >= 2) { doPinch(); return; }
  if (!gest || e.pointerId !== gest.id || !geo) return;
  const pt = local(e);
  if (!gest.moved && Math.hypot(e.clientX - gest.x0, e.clientY - gest.y0) > 8) { gest.moved = true; clearTimeout(gest.timer); if (gest.mode === 'pending' && !drawTool) gest.mode = 'pan'; }
  if (gest.mode === 'ignore') return;
  if (gest.mode === 'brush') { // los eventos agrupados del navegador dan trazos más suaves en pantallas táctiles de alta frecuencia
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) { const q = local(ev); q.x = clamp(q.x, geo.left, geo.left + geo.plotW); q.y = clamp(q.y, geo.plotTop, geo.plotTop + geo.plotH); if (Math.hypot(q.x - gest.lx, q.y - gest.ly) < 2.5 || brushLive.length >= 1500) continue; gest.lx = q.x; gest.ly = q.y; brushLive.push([timeOfIdx(IDX(q.x)), PRICE(q.y)]); }
    scheduleRender(); return;
  }
  if (gest.mode === 'cross') { cross = pt; scheduleRender(); }
  else if (gest.mode === 'trmove') { if (!gest.moved) return; trDrag = {id: gest.tr.id, kind: gest.tr.kind, p: clamp(PRICE(pt.y - gest.tr.dy), 1e-12, 1e15)}; scheduleRender(); }
  else if (gest.mode === 'almove') { if (!gest.moved) return; alDrag = {id: gest.al.id, p: clamp(PRICE(pt.y - (gest.snapY || 0)), 1e-12, 1e15)}; gest.al.p = alDrag.p; scheduleRender(); }
  else if (gest.mode === 'dmove') {
    if (!gest.moved) return; const d = getDrawings().find(x => x.id === gest.dm.id); if (!d) return;
    if (!gest.dm.snap) { gest.dm.snap = true; const arr = getDrawings(); drawHist.u.push(JSON.stringify(arr.map(x => x.id === d.id ? gest.dm.orig : x))); if (drawHist.u.length > 60) drawHist.u.shift(); drawHist.r.length = 0; } // deshacer vuelve a la posición anterior
    applyDMove(d, pt); updateDrawUI(); scheduleRender();
  }
  else if (gest.mode === 'handle') {
    const arr = getDrawings(), d = arr.find(x => x.id === selectedId); if (!d) return;
    const s = snapPoint(pt);
    if (gest.handle === 's' && (d.type === 'long' || d.type === 'short')) { const dir = Math.sign(d.b.p - d.a.p) || 1, p = dir > 0 ? Math.min(s.p, d.a.p - 1e-9 * Math.abs(d.a.p)) : Math.max(s.p, d.a.p + 1e-9 * Math.abs(d.a.p)); d.sp = p; }
    else if (d.type === 'horizontal') d.a = {t: d.a.t, p: s.p}; else if (d.type === 'vertical') d.a = {t: s.t, p: d.a.p}; else if (/^p\d+$/.test(gest.handle) && d.pts) { d.pts[+gest.handle.slice(1)] = s; d.a = d.pts[0]; } else d[gest.handle] = s;
    scheduleRender();
  }
  else if (gest.mode === 'scaleY') { // arriba = agrandar · abajo = achicar
    const f = clamp(Math.exp(-(e.clientY - gest.y0) / 160), .05, 25), c = (gest.min0 + gest.max0) / 2, half = (gest.max0 - gest.min0) / 2 / f;
    priceMan = {min: c - half, max: c + half}; updateAutoBtn(); scheduleRender();
  }
  else if (gest.mode === 'scaleP') { // arriba = agrandar · abajo = achicar
    const q = gest.pane, f = clamp(Math.exp(-(e.clientY - gest.y0) / 140), .1, 20), c = (q.min0 + q.max0) / 2, half = (q.max0 - q.min0) / 2 / f;
    paneMan[q.key] = {min: c - half, max: c + half}; scheduleRender();
  }
  else if (gest.mode === 'scaleX') { // derecha = más grande · izquierda = más chico
    const f = clamp(Math.exp((e.clientX - gest.x0) / 180), .1, 12); visible = clamp(gest.vis0 / f, 15, 400); scheduleRender();
  }
  else if (gest.mode === 'pan') {
    if (gest.inPane) { const q = gest.inPane, dy = (e.clientY - gest.y0) / q.H * (q.max0 - q.min0); paneMan[q.key] = {min: q.min0 + dy, max: q.max0 + dy}; gest.paneMoved = q.key; scheduleRender(); return; } // dentro del oscilador: solo se mueve el oscilador (sube/baja su rango), las velas se quedan quietas
    const p0 = pan; pan = gest.pan0 + (e.clientX - gest.x0) / geo.step; const tn = performance.now(); if (gest.tl) { const dt = tn - gest.tl; if (dt > 0) gest.vel = .6 * (gest.vel || 0) + .4 * ((pan - p0) / dt); } gest.tl = tn;
    if (priceMan) { if (gest.pm0 == null) gest.pm0 = {min: priceMan.min, max: priceMan.max}; const dy = (e.clientY - gest.y0) / geo.plotH * (gest.pm0.max - gest.pm0.min); priceMan = {min: gest.pm0.min + dy, max: gest.pm0.max + dy}; } // con escala manual también se mueve en vertical
    scheduleRender();
  }
  else if (drawTool && gest.moved && !ONEPT.includes(drawTool) && !MULTI[drawTool]) { preview = pending2 ? {a: pending2.a, b: pending2.b, c: snapPoint(pt)} : {a: gest.start, b: snapPoint(pt)}; scheduleRender(); }
});
function endPointer(e, cancelled) {
  const had = ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; if (!ptrs.size) gest = null; return; }
  if (!had || !gest || e.pointerId !== gest.id) return;
  const gs = gest; gest = null; clearTimeout(gs.timer);
  if (gs.mode === 'ignore') return;
  if (gs.mode === 'brush') { const live = brushLive; brushLive = null; if (!cancelled) commitBrush(live); scheduleRender(); return; }
  if (cancelled) { cross = null; preview = null; scheduleRender(); return; }
  if (gs.mode === 'cross') { cross = null; scheduleRender(); return; }
  if (gs.mode === 'trbtn') { const q = gs.tr; if (!gs.moved && window.CCTTrade) { if (q.act === 'more') { const k = q.id + '|' + q.kind; trOpen = trOpen === k ? '' : k; scheduleRender(); return; } trOpen = ''; if (q.act === 'x') CCTTrade.xLine(q.id, q.kind); else if (q.act === 'addtp') CCTTrade.addTpSl(q.id, 'tp'); else if (q.act === 'addsl') CCTTrade.addTpSl(q.id, 'sl'); } return; }
  if (gs.mode === 'trmove') { const d = trDrag; trDrag = null; if (gs.moved && d && d.p != null && window.CCTTrade) CCTTrade.moveLine(d.id, d.kind, d.p); else scheduleRender(); return; }
  if (gs.mode === 'almove') { if (gs.moved && gs.al.p != null) askMoveAlert(gs.al.id, gs.al.p); else { alDrag = null; scheduleRender(); } return; }
  if (gs.mode === 'handle') { save(); render(); return; }
  if (gs.mode === 'dmove') { if (gs.moved) { save(); updateDrawUI(); render(); return; } selectedId = gs.picked ? gs.dm.id : (distToDrawing(getDrawings().find(x => x.id === gs.dm.id) || {}, local(e)) < 13 ? selectedId : null); updateDrawUI(); render(); return; }
  if (gs.paneMoved) savePaneMan(gs.paneMoved);
  if (gs.mode === 'scaleP') { if (gs.moved) savePaneMan(gs.pane.key); if (!gs.moved) { const now = Date.now(); if (now - lastAxisTap < 320) { lastAxisTap = 0; delete paneMan[gs.pane.key]; savePaneMan(gs.pane.key); render(); } else lastAxisTap = now; } return; } // doble toque = escala automática
  if (gs.mode === 'scaleY' || gs.mode === 'scaleX') {
    if (!gs.moved) { const now = Date.now(); if (now - lastAxisTap < 320) { lastAxisTap = 0; if (gs.mode === 'scaleY') { priceMan = null; updateAutoBtn(); } else visible = defaultVisible(); render(); } else lastAxisTap = now; }
    return;
  }
  if (gs.mode === 'pan') { if (!cancelled && gs.vel && performance.now() - (gs.tl || 0) < 90) inertia(gs.vel); return; }
  if (!geo) return;
  const pt = local(e);
  if (drawTool && MULTI[drawTool]) {
    const q = snapPoint(pt), last = multi[multi.length - 1];
    if (last) { const A = px(last), B = px(q); if (Math.hypot(A.x - B.x, A.y - B.y) < 8) return; }
    multi.push(q); if (multi.length >= MULTI[drawTool].n) commitMulti(); else { updateDrawUI(); scheduleRender(); }
    return;
  }
  if (drawTool) {
    if (pending2) { const {a, b} = pending2; pending2 = null; preview = null; commitDrawing(a, b, snapPoint(pt)); return; }
    if (ONEPT.includes(drawTool)) { commitDrawing(snapPoint(pt)); return; }
    if (gs.moved && !pending) { preview = null; commitDrawing(gs.start, snapPoint(pt)); return; }
    if (!pending) { pending = gs.start; updateDrawUI(); scheduleRender(); return; }
    const a = pending; pending = null; commitDrawing(a, snapPoint(pt)); return;
  }
  // toque simple: doble toque ajusta; un toque selecciona/deselecciona un dibujo
  const now = Date.now();
  if (lastTap && now - lastTap.t < 300 && Math.hypot(pt.x - lastTap.x, pt.y - lastTap.y) < 24) { lastTap = null; const ah = hitTest(pt) ? null : alertHit(pt, e); if (ah) { selAlertId = ah.id; openAlertDialog({edit: ah}); render(); return; } fit(); return; } // doble toque sobre una alerta = editarla
  lastTap = {t: now, x: pt.x, y: pt.y};
  const hit = hitTest(pt), ah = hit ? null : alertHit(pt, e);
  if (ah) { const first = selAlertId !== ah.id; selAlertId = ah.id; selectedId = null; updateDrawUI(); render(); if (first && !alHinted) { alHinted = true; toast('Arrastra la línea para mover la alerta · doble clic para editarla'); } return; }
  selAlertId = null; selectedId = hit ? hit.id : null; updateDrawUI(); render();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && selAlertId && !alConfirm && !document.querySelector('.cfg-overlay')) { selAlertId = null; scheduleRender(); } });
area.addEventListener('pointerup', e => endPointer(e, false));
area.addEventListener('pointercancel', e => endPointer(e, true));
function startPinch() {
  if (gest) clearTimeout(gest.timer); gest = null; cross = null; preview = null; brushLive = null;
  const [a, b] = [...ptrs.values()], r = $('#priceCanvas').getBoundingClientRect(), cx = (a.x + b.x) / 2 - r.left;
  pinch = {d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, v0: visible, idx: IDX(cx)};
}
function doPinch() {
  const [a, b] = [...ptrs.values()], r = $('#priceCanvas').getBoundingClientRect(), cx = (a.x + b.x) / 2 - r.left;
  const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  visible = clamp(pinch.v0 * pinch.d0 / d, 15, 400);
  const step = geo.plotW / visible, start = pinch.idx + .5 - (cx - geo.left) / step;
  pan = candles.length - (start + visible); scheduleRender();
}
area.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !geo) return;
  if (ptrs.has(e.pointerId)) { if (cross && gest && gest.mode !== 'cross') { cross = null; scheduleRender(); } return; }
  cross = local(e); { const ah = !drawTool && alertHit(cross, e), cu = ah ? (ah.id === selAlertId ? 'ns-resize' : 'pointer') : ''; if (area.style.cursor !== cu) area.style.cursor = cu; }
  scheduleRender();
});
area.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !ptrs.size && cross) { cross = null; scheduleRender(); } });
area.addEventListener('wheel', e => { e.preventDefault(); cancelAnimationFrame(inertiaRaf); const base = glideT && glideT.visible != null ? glideT.visible : visible; glide({visible: clamp(base * (e.deltaY > 0 ? 1.12 : .89), 15, 400)}); }, {passive: false});
function fit() { priceMan = null; updateAutoBtn(); glide({visible: defaultVisible(), pan: 0}); }
function updateAutoBtn() { const b = $('#autoScale'); if (b) b.hidden = !priceMan; }
$('#autoScale').onclick = () => { priceMan = null; updateAutoBtn(); render(); };
$('#zoomIn').onclick = () => glide({visible: clamp((glideT && glideT.visible != null ? glideT.visible : visible) / 1.3, 15, 400)});
$('#zoomOut').onclick = () => glide({visible: clamp((glideT && glideT.visible != null ? glideT.visible : visible) * 1.3, 15, 400)});

/* Clic derecho sobre el gráfico (como en TradingView): Restablecer gráfico = vuelve el zoom, el desplazamiento, la escala de precio y las alturas de los paneles a su tamaño original */
function resetChart() {
  priceMan = null; paneMan = {_k: state.symbol + '|' + state.interval}; paneManSaved = {}; try { localStorage.removeItem('cct_paneMan_v1'); } catch {} if (typeof paneH === 'object') { for (const k of Object.keys(paneH)) delete paneH[k]; savePaneH(); }
  updateAutoBtn(); legSig = ''; glide({visible: defaultVisible(), pan: 0}); scheduleRender(); toast('Gráfico restablecido');
}
/* ───────── Diseños: guardar la configuración completa del gráfico (indicadores, colores, orden, fondo, tamaños…) y aplicarla en cualquier gráfico ─────────
   Los diseños viajan en el estado de la cuenta (state.designs). Los gráficos extra (iframes) leen la lista del gráfico principal y le piden los cambios por postMessage. */
const designSnap = () => ({indicators: {...state.indicators}, stdParams: structuredClone(state.stdParams || {}), stdHide: {...(state.stdHide || {})}, pine: structuredClone(state.pine || []), chartStyle: {...(state.chartStyle || {})}, ctype: state.ctype, novaParams: structuredClone(state.novaParams || {}), novaSaved: state.novaSaved ? {...state.novaSaved} : null, pn: {paneH: {...paneH}, paneScale, order: [...paneOrder]}});
const designsStoreKey = () => uid ? `cct_mobile_v1_${uid}` : 'cct_mobile_v1';
const designsList = () => PANE ? sanDesigns(readLocal(designsStoreKey()).designs) : (state.designs || []);
function applyDesign(d) {
  const sn = d.snap || {}, next = {...state}; for (const k of DESIGN_KEYS) if (k !== 'pn' && sn[k] !== undefined) next[k] = structuredClone(sn[k]);
  if (sn.pn) { const panes = Object.assign({}, (state.ui || {}).panes); panes[devClass()] = {paneH: sn.pn.paneH, paneScale: sn.pn.paneScale, order: sn.pn.order}; next.ui = {...(state.ui || {}), panes}; }
  applyState(next, true); syncUi(); // syncUi vuelca los tamaños y guarda (cuenta incluida)
  priceMan = null; legSig = ''; pineKey = ''; if (candles.length) { calcNova(); calcExtra(); } schedulePine(); scheduleRender();
}
function designsOp(m) { // en el gráfico principal: cambia la lista y guarda; en un gráfico extra: se lo pide al principal
  if (PANE) { try { parent.postMessage({cct: 'designs', ...m}, location.origin); } catch {} return; }
  let l = (state.designs || []).slice();
  if (m.op === 'add') l.push({id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: String(m.name || 'Plantilla').slice(0, 40), t: Date.now(), snap: m.snap});
  else if (m.op === 'del') l = l.filter(x => x.id !== m.id);
  else if (m.op === 'ren') l = l.map(x => x.id === m.id ? {...x, name: String(m.name || x.name).slice(0, 40)} : x);
  else if (m.op === 'upd') l = l.map(x => x.id === m.id ? {...x, t: Date.now(), snap: m.snap} : x);
  state.designs = sanDesigns(l); save(); persistLocal(); if (document.querySelector('.dz-back')) renderDesigns();
}
/* Código de los indicadores Nova Nexus PRO: ya no viaja en los archivos públicos de la página. Se descarga de tu cuenta (Firestore, colección «pro»)
   solo si tu cuenta tiene el plan Infinity; las reglas de Firestore lo niegan a cualquier otra. Vive solo en memoria (no se guarda en el dispositivo). */
function applyProCode(map) {
  let n = 0; for (const c of window.CCTCatalog || []) if (c.tier === 'pro' && !c.code && typeof map[c.id] === 'string' && map[c.id]) { c.code = map[c.id]; n++; }
  if (!n) return; scripts = withCatalog(scripts.filter(x => !x.builtin)); pineKey = ''; renderScripts(); renderIndicators(); countIndicators(); if (candles.length) schedulePine(); scheduleRender();
  if (!PANE) document.querySelectorAll('iframe').forEach(f => { try { f.contentWindow.postMessage({cct: 'proCode', map}, location.origin); } catch {} });
}
function proMap() { const m = {}; for (const c of window.CCTCatalog || []) if (c.tier === 'pro' && c.code) m[c.id] = c.code; return m; }
async function loadProCode() {
  if (PANE || !db || !fbUser) return; const ids = (window.CCTCatalog || []).filter(c => c.tier === 'pro' && !c.code).map(c => c.id); if (!ids.length) return;
  const map = {}; for (const id of ids) { try { const sn = await db.collection('pro').doc(id).get(); if (sn.exists) map[id] = sn.data().code; } catch { return; } } // sin permiso = la cuenta no es Infinity
  applyProCode(map);
}
function proForget() { let n = 0; for (const c of window.CCTCatalog || []) if (c.tier === 'pro' && c.code) { c.code = ''; n++; } if (n) { scripts = withCatalog(scripts.filter(x => !x.builtin)); pineKey = ''; renderScripts(); renderIndicators(); scheduleRender(); } }
if (PANE) { window.addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.cct === 'proCode' && e.data.map) applyProCode(e.data.map); }); try { parent.postMessage({cct: 'proReq'}, location.origin); } catch {} }
else window.addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.cct === 'proReq') { const m = proMap(); if (Object.keys(m).length && e.source) try { e.source.postMessage({cct: 'proCode', map: m}, location.origin); } catch {} } });
window.CCT_proReload = () => loadProCode();
if (PANE) window.addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.cct === 'refresh') { closeWS(); loadCandles(true); fetchTicker(); } });
if (!PANE) window.addEventListener('message', e => { const m = e.data; if (e.origin !== location.origin || !m || m.cct !== 'designs' || !['add', 'del', 'ren', 'upd'].includes(m.op)) return; designsOp({op: m.op, id: typeof m.id === 'string' ? m.id : '', name: m.name, snap: m.snap}); });
function renderDesigns() {
  const box = document.querySelector('.dz-box .dz-list'); if (!box) return; const list = designsList();
  const cnt = d => Object.entries((d.snap || {}).indicators || {}).filter(([, v]) => v).length + ((d.snap || {}).pine || []).filter(p => p.on !== false).length;
  box.innerHTML = list.length ? list.map(d => `<div class="dz-row" data-id="${esc(d.id)}"><button class="dz-apply" data-a="apply" title="Aplicar esta plantilla al gráfico"><span class="dz-sw" style="background:${esc((d.snap.chartStyle || {}).bg || CHART_DEF.bg)}"><i style="background:${esc((d.snap.chartStyle || {}).up || CHART_DEF.up)}"></i><i style="background:${esc((d.snap.chartStyle || {}).down || CHART_DEF.down)}"></i></span><span class="dz-nm"><b>${esc(d.name)}</b><small>${cnt(d)} indicadores${d.t ? ' · ' + new Date(d.t).toLocaleDateString() : ''}</small></span></button><button class="dz-ic" data-a="upd" title="Actualizar con el gráfico actual">${SV('<path d="M4 12a8 8 0 0 1 14-5.3M20 4v4.5h-4.5M20 12a8 8 0 0 1-14 5.3M4 20v-4.5h4.5"/>', 16)}</button><button class="dz-ic" data-a="ren" title="Cambiar nombre">${SV('<path d="M4 20h4L19 9l-4-4L4 16z"/>', 16)}</button><button class="dz-ic dz-del" data-a="del" title="Borrar">${SV('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>', 16)}</button></div>`).join('') : '<p class="dz-empty">Aún no tienes plantillas. Deja el gráfico como te gusta (fondo, indicadores, colores, orden) y toca «Guardar plantilla actual».</p>';
}
function openDesigns() {
  document.querySelectorAll('.dz-back').forEach(x => x.remove());
  const back = document.createElement('div'); back.className = 'dz-back';
  back.innerHTML = `<div class="dz-box" role="dialog" aria-label="Plantillas"><div class="dz-head"><b>Plantillas</b><button class="dz-x" data-a="close" aria-label="Cerrar">✕</button></div><p class="dz-note">Cada plantilla guarda todo el gráfico: fondo, colores, indicadores y sus ajustes, orden y tamaño de paneles. Tócala para aplicarla a este gráfico${PANE ? '' : ' (también a los que abras al lado)'}. Se guardan en tu cuenta.</p><div class="dz-list"></div><button class="dz-save" data-a="save">${SV('<path d="M12 5v14M5 12h14"/>', 16)}<span>Guardar plantilla actual</span></button></div>`;
  document.body.appendChild(back); renderDesigns();
  const close = () => { back.remove(); document.removeEventListener('keydown', esc2, true); }, esc2 = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc2, true);
  const refresh = () => setTimeout(renderDesigns, PANE ? 300 : 0);
  back.addEventListener('click', e => {
    if (e.target === back) return close();
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, row = b.closest('.dz-row'), id = row && row.dataset.id, d = id && designsList().find(x => x.id === id);
    if (a === 'close') close();
    else if (a === 'save') { const n = (prompt('Nombre de la plantilla:', 'Plantilla ' + (designsList().length + 1)) || '').trim().slice(0, 40); if (!n) return; designsOp({op: 'add', name: n, snap: designSnap()}); refresh(); toast('Plantilla guardada'); }
    else if (a === 'apply' && d) { applyDesign(d); close(); toast('Plantilla aplicada: ' + d.name); }
    else if (a === 'upd' && d) { if (!confirm(`¿Reemplazar «${d.name}» con el gráfico actual?`)) return; designsOp({op: 'upd', id, snap: designSnap()}); refresh(); toast('Plantilla actualizada'); }
    else if (a === 'ren' && d) { const n = (prompt('Nombre de la plantilla:', d.name) || '').trim(); if (!n) return; designsOp({op: 'ren', id, name: n}); refresh(); }
    else if (a === 'del' && d) { if (!confirm(`¿Borrar la plantilla «${d.name}»?`)) return; designsOp({op: 'del', id}); refresh(); }
  });
}
{ const b = $('#designsBtn'); if (b) b.onclick = openDesigns; }
function copyText(txt, msg) {
  const ok = () => toast(msg || 'Copiado'), old = () => { const t = document.createElement('textarea'); t.value = txt; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch { toast('No se pudo copiar'); } t.remove(); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, old); else old();
}
function alertAtPrice(price) { // abre el diálogo de alerta con el activo y el precio del clic ya puestos
  if (!(price > 0)) { toast('No se pudo leer el precio de ese punto'); return; }
  openAlertDialog({symbol: state.symbol, price});
}
area.addEventListener('contextmenu', e => {
  if (e.target.closest('.chart-label, .leg-row, button, .pop-menu, .favbar')) return;
  e.preventDefault(); document.querySelectorAll('.chart-ctx').forEach(x => x.remove());
  let ctxPrice = NaN; try { const q = local(e); if (geo && q.y >= 0) ctxPrice = +PRICE(q.y).toPrecision(8); } catch {}
  const m = document.createElement('div'); m.className = 'pop-menu chart-ctx';
  window.__ctxPrice = ctxPrice;
  m.innerHTML = `<button data-a="reset">${SV('<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4.5h4.5"/>', 16)}<span>Restablecer gráfico</span></button><button data-a="copyp">${SV('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>', 16)}<span>Copiar precio ${fmt(ctxPrice)}</span></button>${PANE ? '' : `<button data-a="alertp">${SV('<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>', 16)}<span>Añadir alerta en ${fmt(ctxPrice)}</span></button>`}<i class="ctx-sep"></i>` // lo que más se usa, arriba
    + (window.CCTTrade && ctxPrice > 0 ? `<button data-a="trbuy" class="ctx-buy">${SV('<path d="M12 19V5M6 11l6-6 6 6"/>', 16)}<span>Comprar en ${fmt(ctxPrice)}</span></button><button data-a="trsell" class="ctx-sell">${SV('<path d="M12 5v14M6 13l6 6 6-6"/>', 16)}<span>Vender en ${fmt(ctxPrice)}</span></button>` : '') + `<button data-a="auto">${SV('<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>', 16)}<span>Escala de precio automática</span></button><i class="ctx-sep"></i><button data-a="risk">${SV('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11v6M8 14h2M12 14h2M8 17h2M12 17h2"/>', 16)}<span>Calculadora de riesgo</span></button><button data-a="style">${SV('<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10" r="1.2" fill="currentColor" stroke="none"/><path d="M12 21c-1.5 0-2-1.2-1.4-2.3.6-1.1.3-2.2-1-2.2H8"/>', 16)}<span>Aspecto del gráfico…</span></button>${!PANE ? `<button data-a="favbar">${I('star', 16)}<span>${FB.show ? 'Ocultar' : 'Mostrar'} barra de favoritos</span></button>` : ''}`;
  document.body.appendChild(m); m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, e.clientX)) + 'px'; m.style.top = Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, e.clientY)) + 'px';
  const close = () => { uxOut(m); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); }, away = ev => { if (!m.contains(ev.target)) close(); }, esc = ev => { if (ev.key === 'Escape') close(); };
  setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', esc, true); });
  m.onclick = ev => { const b = ev.target.closest('[data-a]'); if (!b) return; close(); if (b.dataset.a === 'trbuy' || b.dataset.a === 'trsell') { CCTTrade.at(b.dataset.a === 'trbuy' ? 1 : -1, window.__ctxPrice); return; } if (b.dataset.a === 'risk') { const sel = curDraw(); openRisk(isPos(sel) ? sel : null, window.__ctxPrice); } else if (b.dataset.a === 'reset') resetChart(); else if (b.dataset.a === 'style') openChartStyle(); else if (b.dataset.a === 'copyp') copyText(String(ctxPrice), 'Precio copiado: ' + fmt(ctxPrice)); else if (b.dataset.a === 'alertp') alertAtPrice(ctxPrice); else if (b.dataset.a === 'favbar') setFavBar(!FB.show); else { priceMan = null; updateAutoBtn(); scheduleRender(); } };
});
function syncFullscreenLabel() {} // los botones Expandir y Ajustar ya no existen (se hace con el doble toque y el botón A)
const setPaneScale = v => { paneScale = Math.max(.6, Math.min(3, Math.round(v * 100) / 100)); try { localStorage.setItem('cct_paneScale', String(paneScale)); } catch {} syncUi(); scheduleRender(); toast(`Altura de paneles ${Math.round(paneScale * 100)}%`); };

if (window.ResizeObserver) new ResizeObserver(() => { scheduleRender(); if (!deskMQ.matches && typeof placeFab === 'function') placeFab(); }).observe(area);
window.addEventListener('resize', scheduleRender);

/* ───────── Barra de progreso de la cuenta ─────────
   Una barra sencilla: la mitad es tu capital inicial; si ganas sube y se queda verde, si pierdes se vacía y pasa de verde a amarillo, naranja y rojo.
   El saldo lo escribes tú o llega solo desde Nexus Lens (equity de BingX) mientras «Actualizar automático» esté activo. */
function acctInfo() {
  const A = state.acct || {}, ok = A.start > 0 && Number.isFinite(A.cur) && (A.cur > 0 || A.start > 0);
  if (!ok) return {ok: false, pct: 0, color: '', ratio: null, text: '—', tip: 'Saldo de la cuenta · toca para configurarlo'};
  const r = A.cur / A.start, hue = Math.round(clamp(r, 0, 1) * 120), fill = r <= 0.03 ? 6 : clamp(r / 2 * 100, 3, 100), ch = (r - 1) * 100;
  const usd = n => '$' + n.toLocaleString('en-US', {maximumFractionDigits: 2});
  return {ok: true, pct: fill, color: `hsl(${hue},${r >= 1 ? 62 : 78}%,${r >= 1 ? 46 : 50}%)`, ratio: r, text: (ch >= 0 ? '+' : '') + Math.round(ch) + '%', tip: `${usd(A.cur)} de ${usd(A.start)} · ${(ch >= 0 ? '+' : '') + ch.toFixed(1)}%`};
}
function renderAcct() {
  const i = acctInfo();
  for (const root of document.querySelectorAll('[data-acct-bar]')) {
    const f = root.querySelector('.ab-fill'), v = root.querySelector('.ab-val');
    root.classList.toggle('empty', !i.ok); root.classList.toggle('broke', i.ok && i.ratio <= 0.03);
    if (f) { f.style.setProperty('--ab-p', i.pct + '%'); f.style.background = i.color || 'transparent'; }
    if (v) { v.textContent = i.text; v.style.color = i.color || ''; }
    if (root.classList.contains('rr-btn')) root.dataset.tip = i.tip; else if (root.id === 'stAcct') root.title = i.tip;
  }
  const sub = $('#acctSub'); if (sub) sub.textContent = i.ok ? i.tip : 'Sin configurar. Pon tu capital inicial y tu saldo actual';
}
function openAcctDialog() {
  document.querySelectorAll('.acct-pop').forEach(x => x.remove());
  const A = state.acct || {}, m = document.createElement('div'); m.className = 'acct-pop';
  m.innerHTML = `<b>Saldo de la cuenta</b><small>La mitad de la barra es tu capital inicial. Si ganas sube y se pone verde; si pierdes se vacía y pasa a amarillo, naranja y rojo. Úsala para cuidar tu stop loss.</small>
    <label>Capital inicial (USD)<input id="acStart" inputmode="decimal" value="${A.start || ''}" placeholder="1000"></label>
    <label>Saldo actual (USD)<input id="acCur" inputmode="decimal" value="${A.start ? A.cur : ''}" placeholder="1000"></label>
    <label class="ac-chk"><input id="acAuto" type="checkbox" ${A.auto !== false ? 'checked' : ''}><span>Actualizar automático desde Nexus Lens (equity de BingX)</span></label>
    <div class="ac-btns"><button class="small-button" data-ac="clear" type="button">Quitar</button><button class="small-button" data-ac="close" type="button">Cancelar</button><button class="primary" data-ac="ok" type="button">Guardar</button></div>`;
  document.body.appendChild(m);
  const num = v => { const n = parseFloat(String(v).replace(/[^0-9.,-]/g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : NaN; };
  const close = () => { uxOut(m); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); }, away = e => { if (!m.contains(e.target) && !e.target.closest('[data-acct-open]')) close(); }, esc = e => { if (e.key === 'Escape') close(); };
  setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', esc, true); const f = $('#acStart'); if (f) f.focus(); });
  m.onclick = e => {
    const b = e.target.closest('[data-ac]'); if (!b) return;
    if (b.dataset.ac === 'close') return close();
    if (b.dataset.ac === 'clear') { state.acct = {start: 0, cur: 0, auto: true}; save(); renderAcct(); return close(); }
    const st = num($('#acStart').value); let cu = num($('#acCur').value);
    if (!(st > 0)) { toast('Escribe tu capital inicial en dólares'); return; }
    if (!Number.isFinite(cu)) cu = st;
    state.acct = sanAcct({start: st, cur: cu, auto: $('#acAuto').checked}); save(); renderAcct(); close(); toast('Barra de la cuenta actualizada');
  };
}
document.addEventListener('click', e => { if (e.target.closest('[data-acct-open]')) { e.preventDefault(); openAcctDialog(); } });
window.addEventListener('message', e => { // Nexus Lens (iframe del mismo sitio) avisa el equity de la cuenta
  if (e.origin !== location.origin || !e.data || e.data.cct !== 'equity') return;
  const v = +e.data.value; if (!Number.isFinite(v) || v < 0 || !state.acct || state.acct.auto === false) return;
  const A = state.acct; if (A.cur === Math.round(v * 100) / 100 && A.start > 0) return;
  state.acct = sanAcct({start: A.start > 0 ? A.start : v, cur: v, auto: true}); save(); renderAcct();
});
renderAcct();

/* ───────── Configuración: preferencias, notificaciones y acerca de ───────── */
function setPref(k, v, sub) { // guarda una preferencia, la manda a la cuenta y repinta lo que depende de ella
  const n = JSON.parse(JSON.stringify(PR)); if (sub) n.n[k] = v; else n[k] = v; PR = CCTPrefs.sanitize(n);
  syncUi(); renderPrefs(); try { render(); renderWatch(); updateChartHeader(); renderAlerts(); renderMoveAlerts(); } catch {}
  if (sub && k === 'discord') { try { window.CCTBotLabSave && CCTBotLabSave(); } catch {} try { window.CCTPushSync && CCTPushSync(); } catch {} } // el cambio llega al servidor y a los bots enseguida
}
function renderPrefs() {
  const pb = $('#prefsBox'), nb = $('#notifBox'), ab = $('#aboutBox'); if (!pb || !nb || !ab) return; alTabCount();
  const seg = (k, cur, opts) => `<div class="seg" role="group">${opts.map(([v, t]) => `<button type="button" data-pk="${k}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${t}</button>`).join('')}</div>`;
  const row = (t, sm, ctl) => `<div class="pref-row"><div class="pref-l"><b>${t}</b>${sm ? `<small>${sm}</small>` : ''}</div><div class="pref-c">${ctl}</div></div>`;
  const sw = (id, on, t, sm) => row(t, sm, `<button type="button" class="toggle${on ? ' on' : ''}" data-sw="${id}" role="switch" aria-checked="${!!on}" aria-label="${t}"></button>`);
  const t0 = Date.UTC(2026, 10, 4, 15, 5), ex = `${CCTPrefs.full(t0, PR)} · ${CCTPrefs.formatPrice(67890.1234, PR)}`;
  pb.innerHTML = `<div class="pref-list">`
    + row('Zona horaria', 'Para la hora del gráfico', `<select class="pref-sel" data-pk="tz" aria-label="Zona horaria">${CCTPrefs.TZ.map(([v, t]) => `<option value="${v}" ${PR.tz === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`)
    + row('Hora', '', seg('clock', PR.clock, [['24', '24 h'], ['12', '12 h']]))
    + row('Fecha', '', seg('date', PR.date, [['dmy', 'D/M'], ['mdy', 'M/D'], ['iso', 'ISO']]))
    + row('Decimales', 'En precios', seg('dec', PR.dec, [['auto', 'Auto'], [0, '0'], [2, '2'], [4, '4'], [6, '6'], [8, '8']]))
    + row('Separadores', '', seg('sep', PR.sep, [['en', '1,234.5'], ['es', '1.234,5'], ['sp', '1 234,5'], ['none', '1234.5']]))
    + row('Símbolo', 'Delante del precio', seg('sym', PR.sym, [['', 'Ninguno'], ['$', '$'], ['US$', 'US$']]))
    + `<div class="pref-ex" aria-live="polite">${esc(ex)}</div></div>`;
  const soundOn = PR.sound !== 'off', ico = (c, d) => `<span class="sg-ic" style="--c:${c}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg></span>`;
  const irow = (ic, t, sm, ctl, cls) => `<div class="pref-row${cls ? ' ' + cls : ''}">${ic}<div class="pref-l"><b>${t}</b>${sm ? `<small>${sm}</small>` : ''}</div><div class="pref-c">${ctl}</div></div>`;
  const tg = (id, on, t) => `<button type="button" class="toggle${on ? ' on' : ''}" data-sw="${id}" role="switch" aria-checked="${!!on}" aria-label="${t}"></button>`;
  const mOn = window.VortexPush ? VortexPush.master : soundOn, M = state.moveAlerts || {on: true, pct: 2}, S = state.scrPush || {};
  const near = MOVE_LEVELS.reduce((a, l) => Math.abs(l[0] - M.pct) < Math.abs(a[0] - M.pct) ? l : a), sub = 'pref-sub';
  nb.innerHTML = `<div class="pref-list">`
    + irow(ico('#f5a623', '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'), 'Tono', 'El sonido de tus avisos', `<select class="pref-sel" data-pk="tone" aria-label="Tono" ${mOn ? '' : 'disabled'}>${CCTPrefs.TONES.map(([v, t]) => `<option value="${v}" ${PR.tone === v ? 'selected' : ''}>${t}</option>`).join('')}</select><button type="button" class="pref-play" data-play aria-label="Probar sonido" title="Probar sonido"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg></button>`, mOn ? '' : 'off')
    + `</div><div class="sg-label">Qué te avisamos</div>${mOn ? '' : '<p class="small-note nt-hint">Enciende «Activar notificaciones» para recibir estos avisos.</p>'}<div class="pref-list${mOn ? '' : ' nt-off'}">`
    + irow(ico('#548fff', '<path d="M4 17l5-5 4 3 7-8"/><path d="M15 7h5v5"/>'), 'Alertas de precio', 'Cuando el precio toca tu nivel', tg('price', PR.n.price, 'Alertas de precio'))
    + irow(ico('#b07cff', '<path d="M5 4v16M5 14c3-6 6 2 9-4s4-2 5-3"/>'), 'Alertas de indicador', 'Señales de tus indicadores, también con la app cerrada (al cerrar la vela; puede tardar unos minutos)', tg('ind', PR.n.ind, 'Alertas de indicador'))
    + irow(ico('#f5b942', '<path d="M3 17l6-6 4 4 8-8"/><circle cx="21" cy="7" r="1.6" fill="currentColor"/><path d="M3 21h18"/>'), 'Mis trades abiertos', 'Ganancia o pérdida, cerca de TP, SL o liquidación, regreso a la entrada y tus niveles. Solo con trades abiertos', tg('trade', PR.n.trade !== false, 'Mis trades abiertos'))
    + (PR.n.trade !== false ? irow('<span class="sg-ic pref-ind" aria-hidden="true"></span>', 'Avisar cada', 'Escalón de ganancia o pérdida sobre tu margen (ROE, como lo muestra el exchange)', `<select id="tradeStep" class="pref-sel" aria-label="Avisar cada">${(window.CCTTradeWatch ? CCTTradeWatch.STEPS : [10]).map(v => `<option value="${v}" ${(window.CCTTradeWatch ? CCTTradeWatch.step() : 10) === v ? 'selected' : ''}>±${v} %</option>`).join('')}</select>`, sub) : '')
    + irow(ico('#7c87ff', '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>'), 'Mis bots (Nova Bot Lab)', 'Cuando un bot encendido compra, vende o cierra, también con la app cerrada', tg('bots', PR.n.bots !== false, 'Mis bots'))
    + irow(ico('#f06b79', '<path d="M3 12h4l2-6 4 12 2-6h6"/>'), 'Movimientos bruscos', 'Sube o cae fuerte en minutos · top 5 (BTC, ETH, BNB, XRP, SOL)', tg('move', !!M.on, 'Movimientos bruscos'))
    + (M.on ? irow('<span class="sg-ic pref-ind" aria-hidden="true"></span>', 'Sensibilidad', `También avisa si pasa ±${(M.pct * 2.5).toFixed(M.pct * 2.5 % 1 ? 1 : 0)} % en 1 hora`, `<select id="moveLvl" class="pref-sel" aria-label="Sensibilidad">${MOVE_LEVELS.map(l => `<option value="${l[0]}" ${l[0] === near[0] ? 'selected' : ''}>${l[1]}</option>`).join('')}</select>`, sub) : '')
    + irow(ico('#c084fc', '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/>'), 'Grandes oportunidades', 'Nexus Pixel revisa el Screener cada hora, filtra, lo confirma con IA y aprende de los resultados', tg('radar', !!(window.CCTRadar && CCTRadar.on()), 'Grandes oportunidades'))
    + irow(ico('#20bf9f', '<path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2"/><path d="M7 15l3-4 3 2 4-5"/>'), 'Señales del Screener', 'LONG, SHORT y RANGO del top 50 por volumen', tg('scr', !!S.on, 'Señales del Screener'))
    + (S.on ? irow('<span class="sg-ic pref-ind" aria-hidden="true"></span>', 'Temporalidad 1 hora', 'Al empezar cada hora', tg('scrH1', S.h1 !== false, 'Señales de 1 hora'), sub)
      + irow('<span class="sg-ic pref-ind" aria-hidden="true"></span>', 'Temporalidad 4 horas', 'Cada 4 horas', tg('scrH4', S.h4 !== false, 'Señales de 4 horas'), sub) : '')
    + `</div><div class="sg-label">Discord</div><div class="pref-list">`
    + `<button type="button" class="pref-row pref-link" id="alDiscord">${ico('#7c87ff', '<path d="M8 8.5c2.5-1 5.5-1 8 0M7.5 16c3 1.2 6 1.2 9 0"/><circle cx="9.5" cy="12.5" r="1"/><circle cx="14.5" cy="12.5" r="1"/>')}<div class="pref-l"><b>Servidor Nova Nexus</b><small>Unirte y elegir tu canal</small></div><div class="pref-c"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></div></button>`
    + irow(ico('#7c87ff', '<path d="M4 12h12M12 6l6 6-6 6"/>'), 'Enviar avisos a Discord', 'También llegan al canal #vortex de Nova Nexus', tg('discord', PR.n.discord, 'Enviar avisos a Discord'))
    + `</div>`;
  const cl = window.CCT_CHANGELOG || [], cur = cl[0] || {v: '—', d: ''};
  ab.innerHTML = `<div class="about-card"><img data-app-icon class="about-ic" width="52" height="52" alt=""><div class="about-t"><svg class="brand-word wm-sm" viewBox="0 -1 160 45" role="img" aria-label="VORTEX"><g transform="rotate(-7 80 22)" fill="none" stroke-linecap="round"><path class="ring-back" d="M8 22A72 9 0 0 1 152 22"/></g><text x="80" y="29" text-anchor="middle">VORTEX</text><g transform="rotate(-7 80 22)" fill="none" stroke-linecap="round"><path class="ring-gap" d="M152 22A72 9 0 0 1 8 22"/><path class="ring-front" d="M152 22A72 9 0 0 1 8 22"/></g><path class="ring-star" d="M80 .6l1.55 3.75 3.75 1.55-3.75 1.55L80 11.2l-1.55-3.75-3.75-1.55 3.75-1.55z"/></svg><small>Powered by Nova Nexus</small><span class="about-v">Versión ${esc(cur.v)} <span id="buildNo"></span></span></div></div>`
    + `<div class="sg-label">Novedades</div><div class="cl-list">${cl.map((r, i) => `<details class="cl-ver"${i === 0 ? ' open' : ''}><summary><span class="cl-v">${esc(r.v)}</span><span class="cl-h"><b>${esc(r.t || 'Versión ' + r.v)}</b><small>${esc(r.d)}</small></span>${i === 0 ? '<span class="cl-new">Nuevo</span>' : ''}<svg class="cl-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><ul>${r.items.map(it => `<li>${esc(it)}</li>`).join('')}</ul></details>`).join('')}</div>`;
  if (window.CCTAppIcons) try { CCTAppIcons.apply(CCTAppIcons.selected); } catch {}
  if (window.caches && caches.keys) caches.keys().then(k => { const m = k.map(x => /^cct-shell-v(\d+)$/.exec(x)).filter(Boolean).map(x => +x[1]).sort((a, b) => b - a)[0]; const e = $('#buildNo'); if (e && m) e.textContent = '· compilación ' + m; }).catch(() => {});
}
{
  const onClick = e => {
    const b = e.target.closest('[data-pk]'); if (b && b.tagName === 'BUTTON') { const v = b.dataset.v; setPref(b.dataset.pk, /^\d+$/.test(v) ? +v : v); return; }
    const w = e.target.closest('[data-sw]');
    if (w) { const k = w.dataset.sw; if (k === 'sound') { setPref('sound', PR.sound === 'off' ? 'on' : 'off'); return; } if (k === 'radar') { if (window.CCTRadar) { CCTRadar.setOn(!CCTRadar.on()); toast(CCTRadar.on() ? 'Radar encendido: Nexus Pixel te avisará de las grandes oportunidades' : 'Radar apagado'); } renderPrefs(); } else if (k === 'move') { const on = !(state.moveAlerts || {}).on; state.moveAlerts = sanMoveAlerts({...state.moveAlerts, on}); save(); renderPrefs(); renderMoveAlerts(); if (window.VortexPush) VortexPush.sync(true); } else if (k === 'scr' || k === 'scrH1' || k === 'scrH4') { const S = {...(state.scrPush || {})}; if (k === 'scr') S.on = !S.on; else if (k === 'scrH1') S.h1 = S.h1 === false; else S.h4 = S.h4 === false; state.scrPush = sanScrPush(S); save(); renderPrefs(); renderScrPush(); if (window.VortexPush) VortexPush.sync(true); } else { setPref(k, !PR.n[k], true); if (k === 'trade' && window.CCTTradeWatch) { CCTTradeWatch.refresh(); renderWatch(); } if (window.VortexPush) VortexPush.sync(true); }; return; }
    if (e.target.closest('[data-play]')) { const t = $('#notifBox select[data-pk=tone]'); alertBeep(true, t && t.value); return; }
    if (e.target.closest('[data-news]')) openNews();
  };
  const onChange = e => { if (e.target.id === 'tradeStep') { if (window.CCTTradeWatch) CCTTradeWatch.setStep(+e.target.value); return; } if (e.target.id === 'moveLvl') { state.moveAlerts = sanMoveAlerts({...state.moveAlerts, pct: +e.target.value}); save(); renderPrefs(); if (window.VortexPush) VortexPush.sync(true); return; } const s = e.target.closest('select[data-pk]'); if (s) { setPref(s.dataset.pk, s.value); if (s.dataset.pk === 'tone') alertBeep(true, s.value); } };
  for (const r of [$('#settingsView'), $('#customView'), $('#notifView')]) { r.addEventListener('click', onClick); r.addEventListener('change', onChange); }
  // Hora, fecha y formato: se despliega dentro de Personalización › Apariencia (mismo estilo que el resto de la app)
  const fb = $('#cuFmt'), fp = $('#prefsBox');
  if (fb && fp) fb.addEventListener('click', () => { const open = fp.hidden; fp.hidden = !open; fb.setAttribute('aria-expanded', String(open)); if (open) renderPrefs(); });
}
/* ───────── Personalización de la aplicación: tema, aspecto del gráfico, barra de favoritos e íconos de la app (los íconos los dibuja pwa.js en #appInstall) ───────── */
function renderCustom() {
  const box = $('#customBox'); if (!box) return;
  const ic = (c, d) => `<span class="sg-ic" style="--c:${c}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg></span>`;
  const chev = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  box.innerHTML = ``
    + `<div class="pref-row">${ic('#f5a623', state.light ? '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>' : '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>')}<div class="pref-l"><b>Tema claro</b><small>${state.light ? 'Activo · apágalo para el tema oscuro' : 'Ahora usas el tema oscuro'}</small></div><div class="pref-c"><button type="button" class="toggle${state.light ? ' on' : ''}" data-cu="theme" role="switch" aria-checked="${!!state.light}" aria-label="Tema claro"></button></div></div>`
    + `<button type="button" class="pref-row pref-link" data-cu="style">${ic('#548fff', '<path d="M6 20V10M12 20V4M18 20v-7"/>')}<div class="pref-l"><b>Aspecto del gráfico</b><small>Colores de velas, fondo, cuadrícula, cursor y línea de alertas</small></div><div class="pref-c">${chev}</div></button>`
    + `<div class="pref-row">${ic('#f6d27a', '<path d="M12 3.5 14.6 9l6 .7-4.5 4.1 1.2 5.9L12 16.8 6.7 19.7l1.2-5.9L3.4 9.7l6-.7z"/>')}<div class="pref-l"><b>Barra de herramientas favoritas</b><small>Tus herramientas de dibujo con estrella, siempre a la mano</small></div><div class="pref-c"><button type="button" class="toggle${FB.show ? ' on' : ''}" data-cu="fav" role="switch" aria-checked="${!!FB.show}" aria-label="Barra de herramientas favoritas"></button></div></div>`;
}
{
  const cv = $('#customView');
  if (cv) cv.addEventListener('click', e => {
    const b = e.target.closest('[data-cu]'); if (!b) return; const k = b.dataset.cu;
    if (k === 'theme') { state.light = !state.light; save(); theme(); renderCustom(); }
    else if (k === 'style') openChartStyle();
    else if (k === 'fav') { setFavBar(!FB.show); renderCustom(); }
  });
}
/* ───────── Sesiones de las bolsas: barra de estado abajo a la derecha del gráfico; al pasar el cursor (o tocar) sale la ventana con Nueva York, Londres, Tokio… ───────── */
{
  const btn = $('#ssBtn'), txt = $('#ssTxt'), dots = $('#ssDots'), clk = $('#ssClock'); let pop = null, lastMin = -1;
  const p2 = n => String(n).padStart(2, '0'), hm = t => { const q = CCTPrefs.parts(t, PR.tz); return `${p2(q.h)}:${p2(q.mi)}`; };
  const tzLabel = () => { if (PR.tz === 'UTC') return 'UTC'; try { const z = PR.tz === 'auto' ? undefined : PR.tz, o = new Intl.DateTimeFormat('es', {timeZone: z, timeZoneName: 'short'}).formatToParts(new Date()).find(x => x.type === 'timeZoneName'); return o ? o.value : ''; } catch { return ''; } };
  const dayStart = now => { if (PR.tz === 'auto') { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); } const f = CCTSessions.fields(now, PR.tz); return CCTSessions.zonedToUtc(f.y, f.mo, f.d, 0, 0, PR.tz); };
  function paintBar() {
    const now = Date.now(), all = CCTSessions.all(now), hd = CCTSessions.headline(now);
    dots.innerHTML = all.map(x => `<i class="${x.open ? 'on' : ''}" style="--c:${x.m.color}"></i>`).join('');
    txt.textContent = hd ? (hd.kind === 'close' ? `${hd.m.short} cierra ${CCTSessions.dur(hd.until - now)}` : `${hd.m.short} abre en ${CCTSessions.dur(hd.until - now)}`) : '—';
  }
  function tick() {
    const q = CCTPrefs.parts(Date.now(), PR.tz), d = new Date(), s = PR.tz === 'auto' ? d.getSeconds() : d.getUTCSeconds();
    clk.textContent = `${tzLabel()} ${PR.clock === '12' ? `${q.h % 12 || 12}:${p2(q.mi)}:${p2(s)} ${q.h < 12 ? 'a. m.' : 'p. m.'}` : `${p2(q.h)}:${p2(q.mi)}:${p2(s)}`}`;
    if (q.mi !== lastMin) { lastMin = q.mi; paintBar(); if (pop) paintPop(); }
  }
  function paintPop() {
    const now = Date.now(), ds = dayStart(now), DAY = 864e5, pos = t => Math.max(0, Math.min(100, (t - ds) / DAY * 100));
    const rows = CCTSessions.all(now).map(x => {
      const iv = CCTSessions.intervals(x.m, now), j = iv.findIndex(v => v[1] > now), c = iv[j], n = x.m.parts.length;
      let range = '—'; if (c) { const f = iv[j - c[2]], l = iv[j - c[2] + n - 1]; if (f && l) range = `${hm(f[0])} - ${hm(l[1])}`; }
      const segs = iv.filter(v => v[1] > ds && v[0] < ds + DAY).map(v => `<span class="ss-seg" style="left:${pos(v[0])}%;width:${Math.max(1, pos(v[1]) - pos(v[0]))}%"></span>`).join('');
      const st = x.open ? `Abierta · cierra en ${CCTSessions.dur(x.until - now)}` : (x.until ? `Cerrada · abre en ${CCTSessions.dur(x.until - now)}` : 'Cerrada');
      return `<div class="ss-row${x.open ? ' open' : ''}" style="--c:${x.m.color}"><div class="ss-n"><i></i><div><b>${esc(x.m.name)}</b><small>${st}</small></div></div><div class="ss-track">${segs}<span class="ss-now" style="left:${pos(now)}%"></span></div><div class="ss-r">${range}</div></div>`;
    }).join('');
    pop.innerHTML = `<div class="ss-ax"><span style="left:0">00:00</span><span style="left:25%">06:00</span><span style="left:50%">12:00</span><span style="left:75%">18:00</span></div>${rows}<p class="ss-note">Horario regular de cada bolsa (sin feriados), en ${esc(PR.tz === 'auto' ? 'la hora de tu dispositivo' : tzLabel())}.</p>`;
    place();
  }
  function place() { if (!pop) return; const r = btn.getBoundingClientRect(); pop.style.right = Math.max(8, innerWidth - r.right - 4) + 'px'; pop.style.bottom = (innerHeight - r.top + 8) + 'px'; }
  const show = () => { if (pop) return; pop = document.createElement('div'); pop.className = 'ss-pop'; pop.setAttribute('role', 'tooltip'); document.body.appendChild(pop); paintPop(); btn.setAttribute('aria-expanded', 'true'); };
  const hide = () => { if (pop) { pop.remove(); pop = null; btn.setAttribute('aria-expanded', 'false'); } };
  let hv = 0;
  btn.addEventListener('mouseenter', () => { clearTimeout(hv); show(); }); btn.addEventListener('mouseleave', () => { hv = setTimeout(hide, 150); });
  btn.addEventListener('focus', show); btn.addEventListener('blur', hide);
  btn.addEventListener('click', e => { e.stopPropagation(); pop ? hide() : show(); }); // celular: un toque abre y otro cierra
  document.addEventListener('pointerdown', e => { if (pop && !e.target.closest('#ssBtn, .ss-pop')) hide(); }, true);
  window.addEventListener('resize', place);
  tick(); setInterval(tick, 1000);
}

function openNews() {
  document.querySelectorAll('.news-pop').forEach(x => x.remove());
  const cl = window.CCT_CHANGELOG || [], m = document.createElement('div'); m.className = 'acct-pop news-pop';
  m.innerHTML = `<b>Novedades</b>${cl.map(r => `<div class="nw-ver"><span>Versión ${esc(r.v)}</span><small>${esc(r.d)}</small></div><ul>${r.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}<div class="acct-act"><button class="small-button" type="button" data-close>Cerrar</button></div>`;
  document.body.appendChild(m); m.querySelector('[data-close]').onclick = () => m.remove();
}
renderPrefs();

/* ───────── Tema, exportar e importar ───────── */
window.addEventListener('cct-theme', () => { try { if (typeof render === 'function' && candles) render(); } catch {} });
function theme() { if (typeof pushPaneTheme === 'function') pushPaneTheme(); document.body.classList.toggle('light', !!state.light); document.documentElement.style.colorScheme = state.light ? 'light' : 'dark'; render(); }
const srcBtn = $('#sourceSetting');
function paintSource() { if (srcBtn) srcBtn.textContent = SOURCES[state.source] || 'Binance Spot'; const sl = $('#srcLabel'); if (sl) sl.textContent = (SOURCES[dataSrc || srcOf(state.symbol)] || 'Binance Spot').toUpperCase() + ' ▾'; }
function setSource(k) { if (!SOURCES[k]) return; state.source = k; save(); paintSource(); closeWS(); candles = []; ind = {}; loadCandles(); }
function pickSource(anchor) { // menú para elegir la fuente de velas (Binance Spot/Futuros, Bybit, OKX, Coinbase)
  const old = document.querySelector('.src-menu'); if (old) { old.remove(); return; }
  const m = document.createElement('div'); m.className = 'src-menu';
  m.innerHTML = Object.entries(SOURCES).map(([k, v]) => `<button data-src="${k}" class="${k === state.source ? 'on' : ''}">${v}</button>`).join('') + '<small>Si la fuente no tiene el par o la temporalidad, se usa Binance Spot.</small>';
  document.body.appendChild(m); const r = anchor.getBoundingClientRect(); m.style.top = Math.max(8, Math.min(innerHeight - 280, r.bottom + 6)) + 'px'; m.style.left = Math.max(8, Math.min(innerWidth - 230, r.left)) + 'px';
  const close = () => { uxOut(m); document.removeEventListener('pointerdown', away, true); }, away = e => { if (!m.contains(e.target) && e.target !== anchor) close(); };
  setTimeout(() => document.addEventListener('pointerdown', away, true));
  m.onclick = e => { const b2 = e.target.closest('[data-src]'); if (b2) { close(); setSource(b2.dataset.src); } };
}
paintSource(); window.__paintSource = paintSource;
{ const sl = $('#srcLabel'); if (sl) sl.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); openSheet(); }); } // el exchange se elige al buscar el activo
document.querySelectorAll('.theme-sw').forEach(b => b.onclick = () => { state.light = !state.light; save(); theme(); renderCustom(); });
$('#exportData').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'vortex-config.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
};
$('#importFile').onchange = async e => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(data.symbols) || typeof data.symbol !== 'string') throw Error();
    applyState(data); save(); toast('Configuración importada');
  } catch { toast('Archivo de configuración inválido'); }
  e.target.value = '';
};
document.addEventListener('keydown', e => {
  const tg = e.target, typing = tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable), mod = e.ctrlKey || e.metaKey;
  if (!typing && mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? redoDrawing() : undoDrawing(); return; }
  if (!typing && mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redoDrawing(); return; }
  if (!typing && selectedId && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteSelected(); return; }
  if (e.key !== 'Escape') return;
  if (selectedId) { selectedId = null; updateDrawUI(); render(); }
  closeSheet(); if (drawTool) { drawTool = ''; pending = null; pending2 = null; multi = []; preview = null; updateDrawUI(); }
  document.body.classList.remove('expanded'); syncFullscreenLabel(); requestAnimationFrame(render);
});



/* ───────── Mis scripts (Pine): guardado local + cuenta ───────── */
const SCRIPTS_KEY = 'cct_scripts_v1', SCRIPTS_MAX = 3 * 1024 * 1024, SCRIPTS_DOC_MAX = 990000;
/* Los scripts se guardan comprimidos (gzip + base64, prefijo «gz1:») cuando son grandes: el código Pine se reduce 5-8 veces y así caben muchos más en tu cuenta (1 documento de máx. 1 MB) */
async function packStr(raw) {
  if (raw.length < 200000 || typeof CompressionStream === 'undefined') return raw;
  try { const buf = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(), u = new Uint8Array(buf); let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return 'gz1:' + btoa(b); } catch { return raw; }
}
async function unpackStr(str) {
  if (typeof str !== 'string' || !str.startsWith('gz1:')) return str;
  const bin = atob(str.slice(4)), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
const scriptsKey = () => uid ? `${SCRIPTS_KEY}_${uid}` : SCRIPTS_KEY;
const readScripts = () => { const o = readLocal(scriptsKey()); if (typeof o.gz === 'string') { unpackStr(o.gz).then(raw => { try { const arr = JSON.parse(raw); if (Array.isArray(arr) && !scripts.some(x => !x.builtin)) { scripts = withCatalog(arr); renderScripts(); } } catch {} }).catch(() => {}); return []; } return Array.isArray(o.items) ? o.items : []; };
const catalogScripts = () => (window.CCTCatalog || []).filter(c => c.code).map(c => ({id: 'cat:' + c.id, name: c.name, code: c.code, size: 0, lines: c.code.split('\n').length, addedAt: 0, builtin: true}))
  .concat((window.CCTFree || []).map(f => ({id: 'free:' + f.id, name: f.name, code: f.code, size: 0, lines: f.code.split('\n').length, addedAt: 0, builtin: true, free: true})));
const withCatalog = arr => catalogScripts().concat((Array.isArray(arr) ? arr : []).filter(x => x && !x.builtin && !String(x.id).startsWith('cat:')));
const userScripts = () => scripts.filter(x => !x.builtin && !x.temp); // los de prueba del Laboratorio IA (temp) no se guardan
let scripts = withCatalog(readScripts()), viewScriptId = null, scriptsRemote = '', scriptsTimer = 0;
const scriptsBytes = arr => arr.reduce((a, x) => a + (x.size || 0), 0);
function saveScripts() { saveScriptsLocal(); pushScripts(); }
function saveScriptsLocal() {
  const raw = JSON.stringify(userScripts());
  try { localStorage.setItem(scriptsKey(), JSON.stringify({items: userScripts()})); }
  catch { packStr(raw).then(p => { try { localStorage.setItem(scriptsKey(), JSON.stringify(p.startsWith('gz1:') ? {gz: p} : {items: userScripts()})); } catch { toast('No se pudo guardar en este dispositivo (almacenamiento lleno)'); } }); }
}
function pushScripts() {
  if (!uid || !db || !fbUser) return;
  clearTimeout(scriptsTimer);
  scriptsTimer = setTimeout(async () => {
    const str = JSON.stringify(userScripts()); if (str === scriptsRemote) return; scriptsRemote = str;
    const packed = await packStr(str); if (packed.length > SCRIPTS_DOC_MAX) { scriptsRemote = ''; toast('Tus scripts ya no caben en la cuenta: borra alguno que no uses'); return; }
    try { await db.doc(`users/${uid}/data/scripts`).set({items: packed, updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); }
    catch { scriptsRemote = ''; toast('No se pudieron guardar los scripts en tu cuenta'); }
  }, 1200);
}
function convertPine(code, name) { // convertidor profesional (pasos + corrección con IA); sin él, se guarda directo
  if (window.CCTConvert) { if (!candles.length) { toast('Abre un gráfico y espera a que carguen las velas'); return; } window.CCTConvert.open(code, name); }
  else addScript(code, name);
}
window.CCT_toast = t => toast(t);
window.CCT_botNotify = (title, body, tag) => { if (PR.n.bots === false) return; toast(title.replace(/^VORTEX · /, '') + ' · ' + body); if (PR.sound !== 'off') { alertBeep(); try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch {} } if (!(window.VortexPush && VortexPush.on)) sysNotify(title, body, tag); }; // avisos de tus bots de Nova Bot Lab
function addScript(code, fallbackName, quiet) {
  code = String(code || '').replace(/\r\n?/g, '\n');
  if (!code.trim()) { toast('El script está vacío'); return false; }
  const same = scripts.find(x => x.code === code); if (same) { if (!quiet) toast('Ese script ya estaba guardado'); return same.id; }
  const size = new Blob([code]).size;
  if (scriptsBytes(userScripts()) + size > SCRIPTS_MAX) { toast('Se pasa del límite de 3 MB de scripts por cuenta: borra alguno que no uses'); return false; }
  const m = code.match(/indicator\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/) || code.match(/strategy\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/);
  const sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  scripts.push({id: sid, name: (m ? m[1] : fallbackName || 'Script').slice(0, 80), code, size, lines: code.split('\n').length, addedAt: Date.now()});
  saveScripts(); renderScripts(); toast('Script guardado'); const ns = scripts.find(x => x.id === sid); if (ns) setTimeout(() => genPrev(ns), 300); return sid;
}
function migrateCatalog() { // copias antiguas (pegadas a mano) de los scripts incluidos: pasan a la versión integrada, sin tocar sus ajustes
  const cat = scripts.filter(x => x.builtin); let changed = false;
  for (const p of state.pine.slice()) { const s = scripts.find(x => x.id === p.sid && !x.builtin), c = s && cat.find(x => x.code === s.code); if (!c) continue;
    if (state.pine.some(q => q.sid === c.id)) state.pine = state.pine.filter(q => q !== p); else p.sid = c.id; changed = true; }
  const dup = scripts.filter(x => !x.builtin && cat.some(c => c.code === x.code) && !state.pine.some(p => p.sid === x.id));
  if (dup.length) { scripts = scripts.filter(x => !dup.includes(x)); changed = true; }
  if (changed) { save(); saveScripts(); }
}
function renderScripts() {
  migrateCatalog();
  const mine = userScripts();
  $('#scriptList').innerHTML = mine.length ? mine.map(x => `<div class="setting-row script-row"><div><b>${esc(nnName(x.name))}</b><small>${x.lines} líneas · ${Math.max(1, Math.round(x.size / 1024))} KB · guardado</small></div><div class="script-btns"><button class="small-button" data-pine-add="${x.id}">Al gráfico</button><button class="small-button" data-view-script="${x.id}">Ver</button><button class="small-button danger" data-del-script="${x.id}" aria-label="Eliminar">✕</button></div></div>`).join('')
    : '<div class="setting-row"><div><b>Sin scripts guardados</b><small>Importa un archivo .pine o pega el código.</small></div></div>';
  renderIndicators(); pineKey = ''; schedulePine();
}
$('#scriptList').addEventListener('click', e => {
  const v = e.target.closest('[data-view-script]'), d = e.target.closest('[data-del-script]');
  if (v) { viewScriptId = v.dataset.viewScript; openSheet('script'); }
  if (d) { const x = scripts.find(y => y.id === d.dataset.delScript); if (x && confirm(`¿Eliminar "${x.name}"?`)) { scripts = scripts.filter(y => y.id !== x.id); state.pine = state.pine.filter(q => q.sid !== x.id); delete pineRes[x.id]; save(); saveScripts(); renderScripts(); scheduleRender(); } }
});
/* ───────── Nova Nexus: un solo indicador con todos sus módulos ───────── */
const NOVA_GROUPS = [
  ['Señales', ['nnIa', 'nnTp', 'nnRules']],
  ['Tendencia y bandas', ['nnEma', 'nnTrail', 'nnRev']],
  ['Estructura y niveles', ['nnSmc', 'nnOb', 'nnPiv', 'nnSR']],
  ['Liquidez y volumen', ['nnLiq', 'nnLiqBars', 'nnVP']]
], NOVA_DEFAULT = ['nnIa', 'nnEma', 'nnTp'];
const novaTitle = k => (indicatorMeta.find(m => m[0] === k) || [])[1].replace('Nova Nexus · ', '');
const novaDesc = k => (indicatorMeta.find(m => m[0] === k) || [])[2];
function novaPreviewSvg() {
  let c = '', tag = (x, y, t, f) => `<rect x="${x}" y="${y}" width="${t.length * 5.6 + 8}" height="12" rx="3" fill="${f}"/><text x="${x + 4}" y="${y + 9}" font-size="8" font-weight="700" fill="#fff">${t}</text>`;
  const cs = []; let v = 78; for (let i = 0; i < 26; i++) { const o = v, d = Math.sin(i / 3.1) * 5 - 1.2 + (i % 3) * .8, cl = o - d; v = cl; cs.push([o, cl, Math.max(o, cl) + 2 + (i % 4), Math.min(o, cl) - 2 - (i % 3)]); }
  const X = i => 14 + i * 9.6;
  const top = cs.map((k, i) => `${X(i)},${(k[0] + k[1]) / 2 + 9}`).join(' '), bot = cs.slice().reverse().map((k, i) => `${X(cs.length - 1 - i)},${(k[0] + k[1]) / 2 + 17}`).join(' ');
  c += `<polygon points="${top} ${bot}" fill="#8a97b3" opacity=".22"/>`;
  c += `<rect x="150" y="26" width="86" height="14" fill="#ff5252" opacity=".18"/><rect x="150" y="26" width="86" height="14" fill="none" stroke="#ff5252" stroke-width=".8" opacity=".6"/>`;
  c += `<rect x="40" y="84" width="70" height="12" fill="#26a69a" opacity=".18"/>`;
  [18, 50, 66].forEach((y, i) => c += `<line x1="14" x2="262" y1="${y}" y2="${y}" stroke="#22ab94" stroke-width=".9" opacity="${.55 - i * .12}"/>`);
  c += `<polyline points="${cs.map((k, i) => `${X(i)},${k[1] + 17}`).join(' ')}" fill="none" stroke="#119c7e" stroke-width="1.6"/>`;
  cs.forEach((k, i) => { const up = k[1] <= k[0], col = up ? '#089981' : '#f23645'; c += `<line x1="${X(i)}" x2="${X(i)}" y1="${k[2]}" y2="${k[3]}" stroke="${col}" stroke-width="1"/><rect x="${X(i) - 2.8}" y="${Math.min(k[0], k[1])}" width="5.6" height="${Math.max(1.5, Math.abs(k[0] - k[1]))}" fill="${col}"/>`; });
  c += tag(34, 100, 'BUY 4★', '#11cf77') + tag(150, 8, 'SELL 3★', '#d11645');
  c += `<line x1="196" x2="262" y1="92" y2="92" stroke="#ff4444" stroke-dasharray="3 2"/><line x1="196" x2="262" y1="60" y2="60" stroke="#11cf77" stroke-dasharray="3 2"/><line x1="196" x2="262" y1="48" y2="48" stroke="#00aaff" stroke-dasharray="3 2"/>`;
  [[12, 40], [22, 30], [32, 52], [42, 44], [52, 24], [62, 36], [72, 16]].forEach(([y, w], i) => c += `<rect x="${316 - w}" y="${y + 6}" width="${w}" height="7" fill="${i === 4 ? '#ffeb3b' : '#8294a8'}" opacity="${i === 4 ? .85 : .45}"/>`);
  return `<svg class="nova-prev" viewBox="0 0 320 120" role="img" aria-label="Vista previa de lo que dibuja Nova Nexus: velas, nube EMA, señales BUY/SELL, niveles TP/SL, soporte y resistencia, liquidaciones y perfil de volumen"><rect width="320" height="120" rx="10" fill="#0d1421"/>${c}</svg>`;
}
function novaCard() {
  const on = novaOn(), act = NN_KEYS.filter(k => state.indicators[k]).length;
  return `<div class="nova-card ${on ? 'on' : ''}" data-feat="novaNexus">${novaPreviewSvg()}<div class="nova-body"><div><b>Nova Nexus</b><small>${on ? `${act} de ${NN_KEYS.length} módulos activos` : 'Apagado'} · señales IA, nube EMA, SMC, liquidaciones, perfil de volumen y más</small></div><div class="script-btns"><button class="small-button" data-nova-set="1">${I('gear', 14)} Configurar</button><button class="toggle ${on ? 'on' : ''}" data-nova-tog="1" aria-pressed="${on}" aria-label="Activar Nova Nexus"></button></div></div></div>`;
}
function novaToggleAll(on) {
  if (on) { const sv = state.novaSaved; for (const k of NN_KEYS) state.indicators[k] = sv ? !!sv[k] : NOVA_DEFAULT.includes(k); if (!novaOn()) NOVA_DEFAULT.forEach(k => state.indicators[k] = true); state.novaSaved = null; }
  else { state.novaSaved = Object.fromEntries(NN_KEYS.map(k => [k, !!state.indicators[k]])); for (const k of NN_KEYS) state.indicators[k] = false; }
}
function novaAfter() { save(); renderIndicators(); countIndicators(); if (candles.length) { calcNova(); calcExtra(); } if (['indicators', 'novaSet'].includes(sheetMode) && $('#sheet').classList.contains('open')) renderSheet(); scheduleRender(); }
function renderNovaSettings(list) {
  const on = novaOn(), row = k => { const dis = k === 'nnLiqBars' && !state.indicators.nnLiq; return `<div class="setting-row ${dis ? 'dim' : ''}"><div><b>${novaTitle(k)}</b><small>${novaDesc(k)}</small></div><button class="toggle ${state.indicators[k] ? 'on' : ''}" data-ind="${k}" aria-label="${novaTitle(k)}" aria-pressed="${!!state.indicators[k]}"></button></div>`; };
  list.innerHTML = `${novaPreviewSvg()}<div class="setting-row"><div><b>Nova Nexus</b><small>Un solo indicador: elige abajo qué módulos se dibujan. Los parámetros de cada módulo usan los valores por defecto del Pine.</small></div><button class="toggle ${on ? 'on' : ''}" data-nova-tog="1" aria-pressed="${on}" aria-label="Activar Nova Nexus"></button></div>`
    + `<div class="pine-actions"><button class="small-button" data-nova-all="1">Activar todos</button><button class="small-button" data-nova-all="0">Desactivar todos</button></div>`
    + NOVA_GROUPS.map(([t, ks]) => `<div class="pine-head"><b>${t}</b></div>${ks.map(row).join('')}`).join('');
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-nova-set],[data-nova-tog],[data-nova-all]'); if (!t) return;
  if (t.dataset.novaSet) { openNovaDialog(); return; }
  if (t.dataset.novaTog) { novaToggleAll(!novaOn()); novaAfter(); return; }
  if (t.dataset.novaAll !== undefined) { if (t.dataset.novaAll === '1') { for (const k of NN_KEYS) state.indicators[k] = k !== 'nnLiqBars'; } else for (const k of NN_KEYS) state.indicators[k] = false; state.novaSaved = null; novaAfter(); }
});
/* ───────── Scripts de Pine en el gráfico (intérprete propio: pine.js; dibujo: pine-draw.js) ───────── */
const activePine = () => state.pine.filter(p => p.on && scripts.some(s => s.id === p.sid) && !(proSid(p.sid) && !planOk('novaNexus')) && !(PLUS_FREE.some(id => p.sid === 'free:' + id) && !planOk('proInd'))); // los Nova Nexus PRO solo se calculan con el plan que los incluye (no se borran de tu configuración)
/* Nombres de tus indicadores Nova: siempre «Nova Nexus© - Nombre» (Personal, IA Signals, Oscilador, Señales, Screener, LITE…) */
function nnName(t) {
  t = String(t || '').trim().replace(/^cr[iy]pto\s*-?\s*cham[aá]n\s*[·:\-–—|]*\s*(?=nova|nexus)/i, ''); // «CriptoChaman - Nova Nexus©» → «Nova Nexus©»
  if (!/^\s*(nova|nexus)/i.test(t)) return t;
  let r = t.replace(/^\s*nova\s*nexus\s*(©|\(c\))?/i, '').replace(/^\s*nova\b\s*(©)?/i, '').replace(/^[\s·:\-–—|]+/, '').trim();
  r = r.replace(/\s*\[.*$/, '').replace(/\s+v?\d+(\.\d+)*\s*$/i, '').replace(/\s+\d+\s*cryptos?$/i, '').trim();
  if (/^oscillat/i.test(r)) r = 'Oscilador';
  else if (/^se[ñn]ales\s*i?a\b|^signals?\b/i.test(r)) r = 'Señales';
  else if (/^i?a\s*signals?/i.test(r)) r = 'IA Signals';
  else if (/^screener/i.test(r)) r = 'Screener';
  else if (/^lite\b/i.test(r)) r = 'LITE';
  else r = r.replace(/\s+v\d+.*$/i, '');
  return r ? 'Nova Nexus© - ' + r : 'Nova Nexus©';
}
const pineName = sid => { const s = scripts.find(x => x.id === sid); return s ? nnName(s.name) : 'Script'; };
function pineInline(code, opts) {
  try { return window.CCTPine ? CCTPine.run(code, opts.cs || candles, opts) : {ok: false, error: {msg: 'El motor de Pine no está disponible', line: 0}}; }
  catch (e) { return {ok: false, error: {msg: String(e && e.message || e), line: 0}}; }
}
const pineWorkers = [], pineQueue = [], PINE_POOL = Math.max(2, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
function pineDispatch() {
  while (pineQueue.length) {
    let w = pineWorkers.find(x => !x.job);
    if (!w && pineWorkers.length < PINE_POOL) { w = {job: null, wk: null}; pineWorkers.push(w); }
    if (!w) return;
    const j = pineQueue.shift();
    try {
      if (!w.wk) {
        w.wk = new Worker('pine.js');
        w.wk.onmessage = e => { const cur = w.job; if (cur && cur.id === e.data.id) { clearTimeout(cur.t); w.job = null; cur.ok(e.data.result); pineDispatch(); } };
        w.wk.onerror = () => { pineNoWorker = true; try { w.wk.terminate(); } catch {} w.wk = null; const cur = w.job; w.job = null; if (cur) { clearTimeout(cur.t); cur.ok(pineInline(cur.code, cur.opts)); } pineDispatch(); };
      }
      j.id = ++pineSeq; w.job = j;
      j.t = setTimeout(() => { try { w.wk.terminate(); } catch {} w.wk = null; w.job = null; j.ok({ok: false, error: {msg: 'El script tardó demasiado y se detuvo (límite de tiempo en este dispositivo)', line: 0}}); pineDispatch(); }, 45000);
      const o2 = Object.assign({}, j.opts); delete o2.cs; w.wk.postMessage({id: j.id, code: j.code, candles: j.opts.cs || candles, opts: o2});
    } catch { pineNoWorker = true; w.job = null; j.ok(pineInline(j.code, j.opts)); }
  }
}
function pineRunRaw(code, opts) { // Workers aislados (un grupo pequeño: un script pesado no bloquea a los demás), con tiempo límite por script
  opts = Object.assign({}, opts); // exchange del activo: syminfo.tickerid y request.security sin prefijo usan el mismo exchange del gráfico
  if (String(opts.symbol || '').includes('@')) { opts.symKey = opts.symbol; opts.exch = srcOf(opts.symbol); opts.symbol = symOf(opts.symbol); }
  else if (!opts.exch && opts.symbol && opts.symbol === symOf(state.symbol)) { opts.symKey = state.symbol; opts.exch = srcOf(state.symbol); }
  if (typeof Worker === 'undefined' || pineNoWorker) return Promise.resolve(pineInline(code, opts));
  return new Promise(ok => { pineQueue.push({code, opts, ok}); pineDispatch(); });
}
// request.security: la app descarga las velas de Binance que pide el script y repite la corrida una vez
const pineSecCache = new Map();
async function pineSecCandles(sym, itv) {
  const key = sym + '|' + itv, hit = pineSecCache.get(key); if (hit && Date.now() - hit.at < 30000) return hit.data;
  let data = [];
  if (sym.includes('@')) { try { data = await CCTMarkets.klinesAny(sym, itv, 1000, {closedOnly: false}); } catch {} pineSecCache.set(key, {at: Date.now(), data}); return data; } // otro exchange (BINGX:…, BYBIT:…): sus propias velas
  try {
    if (/^x\d+$/.test(itv)) { // temporalidad sin velas propias en Binance (3 h, 2 D, 45 min…): se juntan velas de la mayor temporalidad que la divide
      const M = +itv.slice(1), base = [[10080, '1w'], [4320, '3d'], [1440, '1d'], [720, '12h'], [480, '8h'], [360, '6h'], [240, '4h'], [120, '2h'], [60, '1h'], [30, '30m'], [15, '15m'], [5, '5m'], [3, '3m'], [1, '1m']].find(([b]) => b <= M && M % b === 0);
      const raw = await getJSON(`${API}/klines?symbol=${sym}&interval=${base[1]}&limit=1000`), out = [], span = M * 6e4;
      for (const d of raw) { const t = Math.floor(d[0] / span) * span, last = out[out.length - 1], c = {t, o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]}; if (last && last.t === t) { last.h = Math.max(last.h, c.h); last.l = Math.min(last.l, c.l); last.c = c.c; last.v += c.v; } else out.push(c); }
      data = out; pineSecCache.set(key, {at: Date.now(), data}); return data;
    }
    const agg = itv === '3M' ? 'q' : itv === '12M' ? 'y' : null, raw = await getJSON(`${API}/klines?symbol=${sym}&interval=${agg ? '1M' : itv}&limit=1000`);
    let cs = raw.map(d => ({t: d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]}));
    if (agg) { const out = [], bucket = t => { const d = new Date(t); return agg === 'y' ? d.getUTCFullYear() : d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3); }; for (const c of cs) { const b = bucket(c.t), last = out[out.length - 1]; if (last && last.b === b) { last.h = Math.max(last.h, c.h); last.l = Math.min(last.l, c.l); last.c = c.c; last.v += c.v; } else out.push({b, t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v}); } cs = out.map(({b, ...r}) => r); }
    data = cs;
  } catch {}
  pineSecCache.set(key, {at: Date.now(), data}); return data;
}
async function pineRunFull(code, opts) {
  let res = await pineRunRaw(code, opts);
  if (res && res.ok && res.needs && res.needs.length) {
    const sec = Object.assign({}, opts.sec);
    const need = res.needs.slice(0, 40);
    for (let i = 0; i < need.length; i += 8) await Promise.all(need.slice(i, i + 8).map(async n => { sec[n.symbol + '|' + n.interval] = await pineSecCandles(n.symbol, n.interval); }));
    res = await pineRunRaw(code, Object.assign({}, opts, {sec, timeLimitMs: need.length > 6 ? 26000 : opts.timeLimitMs}));
  }
  return res;
}
async function pineRunOne(p) {
  if (pineBusy[p.sid]) { pineDirty[p.sid] = true; return; }
  const code = (scripts.find(x => x.id === p.sid) || {}).code; if (!code || !candles.length) return;
  const key = `${state.symbol}|${state.interval}|${candles[0].t}`; pineBusy[p.sid] = true;
  const res = await pineRunFull(code, {inputs: p.inputs, interval: state.interval, symbol: symOf(state.symbol), name: pineName(p.sid), timeLimitMs: 12000});
  pineBusy[p.sid] = false; res._key = key; pineRes[p.sid] = res;
  if (!res.ok && /tard/.test((res.error && res.error.msg) || '') && !pineRetried.has(p.sid)) { pineRetried.add(p.sid); setTimeout(() => { pineKey = ''; schedulePine(); }, 3000); } else if (res.ok) pineRetried.delete(p.sid); if (res.stats) pineLastMs = Math.max(pineLastMs * .5, res.stats.ms); // los scripts pesados se recalculan con menos frecuencia
  if (pineDirty[p.sid]) { pineDirty[p.sid] = false; pineKey = ''; schedulePine(); }
  if ((sheetMode === 'indicators' && $('#sheet').classList.contains('open'))) { renderIndicators(); if (sheetMode === 'indicators') ibRefresh(); }
  scheduleRender();
}
// Estilo y visibilidad elegidos en la ventana de configuración (no obligan a recalcular el script)
function pineVisibleOn(p, iv) {
  const v = p.vis; if (!v) return true; const m = /^(\d+)([mhdwM])$/.exec(iv); if (!m) return true;
  const o = v[m[2]]; if (!o) return true; if (o.on === false) return false;
  const n = +m[1]; return !((o.min != null && n < o.min) || (o.max != null && n > o.max));
}
function pineStyled(res, p) {
  if (!res || !res.ok || !p.style || !Object.keys(p.style).length) return res;
  const sig = JSON.stringify(p.style); if (res._stSig === sig) return res._st;
  const st = p.style, pal = res.palette.slice(), idxOf = c => { const k = CCTSettings.hexOf(c.color), a = ((c.op != null ? c.op : k.op) / 100).toFixed(3), col = `rgba(${parseInt(k.hex.slice(1, 3), 16)},${parseInt(k.hex.slice(3, 5), 16)},${parseInt(k.hex.slice(5, 7), 16)},${a})`; let i = pal.indexOf(col); if (i < 0) { pal.push(col); i = pal.length - 1; } return i; };
  const out = Object.assign({}, res, {palette: pal});
  out.plots = res.plots.map((pl, i) => { const o = (st.plots || {})[pl.id !== undefined ? pl.id : i]; if (!o) return pl; const q = Object.assign({}, pl); if (o.on === false) q.hidden = true; if (o.lw) q.lw = o.lw; if (o.type) q.style = o.type; if (o.dash) q.dash = o.dash; if (o.color) { const ci = idxOf(o); if (pl.cc !== undefined) q.cc = ci; else q.ci = pl.ci.map(x => x === null ? null : ci); } return q; });
  out.hlines = res.hlines.map((h, i) => { const o = (st.hlines || {})[i]; if (!o) return h; const q = Object.assign({}, h); if (o.on === false) q.hidden = true; if (o.lw) q.lw = o.lw; if (o.dash) q.style = o.dash; if (o.color) q.ci = idxOf(o); return q; });
  out.candles = (res.candles || []).map((k, i) => { const o = (st.plots || {})['c' + i]; return o && o.on === false ? Object.assign({}, k, {hidden: true}) : k; });
  for (const k of ['labels', 'lines', 'boxes', 'tables', 'polylines', 'linefills', 'bgcolors', 'barcolors']) if (st.objs && st.objs[k] && st.objs[k].on === false) out[k] = [];
  if (st.shapes) out.shapes = res.shapes.map((s2, i) => { const o = st.shapes[i]; if (!o) return s2; if (o.on === false) return null; const q = Object.assign({}, s2); if (o.size) q.size = o.size; if (o.color || o.tcolor) { const ci = o.color ? idxOf(o) : null, ti = o.tcolor ? idxOf({color: o.tcolor, op: 100}) : null; q.pts = s2.pts.map(pt => { const r = pt.slice(); if (ci !== null) r[2] = ci; if (ti !== null && r.length > 3) r[3] = ti; return r; }); } return q; }).filter(Boolean);
  out.fills = res.fills.map((f, i) => { const o = (st.fills || {})[i]; if (!o) return f; const q = Object.assign({}, f); if (o.on === false) q.hidden = true; if (o.color) { delete q.ci; q.cc = idxOf(o); } return q; });
  const G = st.general && st.general.g; if (G) { if (typeof G.prec === 'number') out._prec = G.prec; if (G.vals === false) out._noVals = true; } res._stSig = sig; res._st = out; return out;
}
function pineDialogData(p, r) {
  const colorOf = ci => ci === null || ci === undefined || ci < 0 ? null : r.palette[ci];
  const toHex = c => { const m = /rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?/.exec(c || ''); return m ? '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('') + (m[4] !== undefined && +m[4] < 1 ? Math.round(+m[4] * 255).toString(16).padStart(2, '0') : '') : '#2962ff'; };
  const plots = r.plots.map((pl, i) => { const u = pl.cc !== undefined ? [pl.cc] : [...new Set((pl.ci || []).filter(x => x !== null))]; return {key: pl.id !== undefined ? pl.id : i, title: pl.title, color: toHex(colorOf(u[0])), dynamic: u.length > 1, lw: pl.lw || 2, canWidth: true, type: /^(line|stepline|histogram|columns|area|areabr|circles|cross|linebr|steplinebr|stepline_diamond)$/.test(pl.style) ? pl.style : 'line', dash: 'solid'}; })
    .concat((r.candles || []).map((k, i) => ({key: 'c' + i, title: k.title, color: toHex(colorOf(k.ci.find(x => x !== null && x !== undefined))), dynamic: true, lw: 1, canWidth: false})));
  const objects = [['labels', 'Etiquetas'], ['lines', 'Líneas'], ['boxes', 'Cajas'], ['polylines', 'Polilíneas'], ['linefills', 'Rellenos entre líneas'], ['tables', 'Tablas'], ['bgcolors', 'Fondo coloreado (bgcolor)'], ['barcolors', 'Velas coloreadas (barcolor)']].map(([key, label]) => ({key, label, count: key === 'bgcolors' || key === 'barcolors' ? (r[key] || []).filter(e => e.pts && e.pts.length).length : (r[key] || []).length}));
  return {title: pineName(p.sid), inputs: r.inputs, values: p.inputs || {}, plots, hlines: r.hlines.map((h, i) => ({key: i, title: h.title, price: h.price, color: toHex(colorOf(h.ci)), lw: h.lw || 1, dash: h.style || 'dashed'})), fills: r.fills.map((f, i) => ({key: i, title: 'Relleno ' + (i + 1), color: toHex(colorOf(f.cc !== undefined ? f.cc : (f.ci || []).find(x => x !== null && x !== undefined))), dynamic: f.cc === undefined})), objects, shapes: r.shapes.map((s2, i) => ({key: i, title: s2.title, kind: s2.kind, color: toHex(colorOf((s2.pts[0] || [])[2])), tcolor: toHex(colorOf((s2.pts[0] || [])[3])), size: s2.size || 'auto'})), style: p.style || {}, vis: p.vis || {}};
}
function openPineDialog(sid) {
  const p = state.pine.find(x => x.sid === sid), r = pineRes[sid];
  if (!p) return; if (!r || !r.ok) { toast(r ? 'Error del script: ' + ((r.error && r.error.msg) || 'desconocido') + (r.error && r.error.line ? ' (línea ' + r.error.line + ')' : '') : 'Espera a que termine de calcularse'); return; }
  CCTSettings.open(liveCfg(Object.assign(pineDialogData(p, r), {onApply: res => {
    const inChanged = JSON.stringify(res.inputs) !== JSON.stringify(p.inputs || {});
    p.inputs = res.inputs; p.style = res.style; p.vis = res.vis; if (!Object.keys(p.style).length) delete p.style; if (!Object.keys(p.vis).length) delete p.vis;
    save(); if (inChanged) { pineKey = ''; schedulePine(); } renderIndicators(); scheduleRender(); toast('Configuración aplicada');
  }}), () => ({inputs: jcopy(p.inputs), style: jcopy(p.style), vis: jcopy(p.vis)}),
  s0 => { const inCh = JSON.stringify(s0.inputs || {}) !== JSON.stringify(p.inputs || {}); for (const k of ['inputs', 'style', 'vis']) { if (s0[k] === undefined) delete p[k]; else p[k] = s0[k]; } if (inCh) { pineKey = ''; schedulePine(); } renderIndicators(); scheduleRender(); }));
}
/* ───────── Imagen de referencia de cada script que subes (se genera sola, en este dispositivo) ───────── */
const PREV_KEY = 'cct_prev_v1', prevBusy = new Set();
let prevStore = (() => { try { return JSON.parse(localStorage.getItem(PREV_KEY)) || {}; } catch { return {}; } })();
const codeHash = c => { let h = 5381; for (let i = 0; i < c.length; i++) h = ((h << 5) + h + c.charCodeAt(i)) | 0; return c.length + ':' + h; };
function scriptPrev(x) { const e = prevStore[x.id]; if (e && e.h === codeHash(x.code)) return e.u; genPrev(x); return null; }
async function genPrev(x) {
  if (prevBusy.has(x.id) || !window.CCTPinePreview || !window.CCTPine) return; prevBusy.add(x.id);
  const h = codeHash(x.code); let u = '';
  try {
    const cs = CCTPinePreview.sampleCandles(), res = await pineRunRaw(x.code, {interval: '60', symbol: 'BTCUSDT', name: x.name, timeLimitMs: 9000, cs});
    u = res && res.ok ? CCTPinePreview.render(res, cs, {title: x.name}) : 'err';
  } catch { u = 'err'; }
  prevBusy.delete(x.id); prevStore[x.id] = {h, u};
  try { localStorage.setItem(PREV_KEY, JSON.stringify(prevStore)); } catch { for (const k of Object.keys(prevStore)) if (k !== x.id) delete prevStore[k]; try { localStorage.setItem(PREV_KEY, JSON.stringify(prevStore)); } catch {} }
  if (sheetMode === 'indicators' && $('#sheet').classList.contains('open')) ibRefresh();
  renderIndicators();
}
const prevImg = x => { if (x.id === 'cat:nova-lite') return novaLitePreviewSvg().replace('class="nova-prev"', 'class="pine-prev nl-prev"'); const u = scriptPrev(x); return u && u !== 'err' ? `<img class="pine-prev" alt="Imagen de ${esc(x.name)}" src="${u}">` : `<div class="pine-prev ph">${u === 'err' ? 'Sin imagen: el script no se pudo calcular' : 'Generando imagen…'}</div>`; };
window.__cctScripts = {addScript, store: () => prevStore}; // expuesto para pruebas
const pineRetried = new Set();
function schedulePine() {
  if (!candles.length || !activePine().length) return;
  const key = `${state.symbol}|${state.interval}|${candles[0].t}|${candles.length}`, wait = key !== pineKey ? 0 : Math.max(0, Math.max(1500, 6 * pineLastMs) - (Date.now() - pineLast));
  clearTimeout(pineTimer);
  pineTimer = setTimeout(() => { pineKey = key; pineLast = Date.now(); activePine().forEach(pineRunOne); }, wait);
}

/* ───────── Catálogo: indicadores Pine listos para añadir ───────── */
const CAT_SYMS = 'BTC ETH BNB SOL XRP DOGE ADA AVAX LINK DOT TRX LTC BCH ATOM UNI NEAR APT ARB OP FIL INJ SUI SEI TIA RUNE AAVE MKR ALGO XLM HBAR ETC SAND MANA GALA IMX PEPE SHIB WLD FET RNDR'.split(' ').map(x => 'BINANCE:' + x + 'USDT');
/* Vista previa de Nova LITE · Smart Money Concepts: estructura (HH/HL, BOS, CHoCH), order blocks, FVG, barrida de liquidez y premium/descuento */
function novaLitePreviewSvg() {
  const W = 320, X = i => 18 + i * 10.6, F = 'font-family="Inter,system-ui,sans-serif"';
  // la historia: baja con mínimos más bajos → barre la liquidez → CHoCH → mínimo más alto → BOS → retroceso al FVG / order block → máximo más alto
  const path = [66, 72, 70, 80, 95, 84, 74, 64, 70, 78, 86, 76, 66, 56, 48, 44, 50, 56, 60, 52, 44, 38, 34, 30, 34, 28, 24];
  let c = '', v = 60; const cs = path.map((t, i) => { const o = v, cl = t; v = cl; return [o, cl, Math.min(o, cl) - 3 - (i % 3), Math.max(o, cl) + 3 + ((i + 1) % 3)]; });
  const tag = (x, y, t, f) => `<rect x="${x}" y="${y}" width="${t.length * 5.4 + 9}" height="12" rx="3.5" fill="${f}"/><text x="${x + 4.5}" y="${y + 8.8}" font-size="7.6" font-weight="800" fill="#fff" ${F}>${t}</text>`;
  c += `<rect x="10" y="8" width="${W - 20}" height="30" rx="4" fill="#f23645" opacity=".07"/><rect x="10" y="82" width="${W - 20}" height="30" rx="4" fill="#089981" opacity=".08"/>`;
  c += `<text x="16" y="18" font-size="6.8" fill="#f2364599" font-weight="800" letter-spacing=".6" ${F}>PREMIUM</text><text x="${W - 14}" y="108" font-size="6.8" fill="#08998199" text-anchor="end" font-weight="800" letter-spacing=".6" ${F}>DESCUENTO</text>`;
  c += `<line x1="10" x2="${W - 10}" y1="60" y2="60" stroke="#8796ab" stroke-dasharray="2 4" opacity=".35"/>`;
  c += `<rect x="${X(10) - 5}" y="80" width="${X(26) - X(10) + 10}" height="10" fill="#089981" opacity=".22"/><rect x="${X(10) - 5}" y="80" width="${X(26) - X(10) + 10}" height="10" fill="none" stroke="#14b88f" stroke-width=".8" opacity=".75"/>` + tag(X(13), 92, 'OB +', '#0b8f72');
  c += `<rect x="${X(14) - 5}" y="50" width="${X(26) - X(14) + 10}" height="9" fill="#ffd54f" opacity=".17"/>` + tag(X(23), 38.5, 'FVG', '#a8861a');
  c += `<line x1="${X(1)}" x2="${X(4) + 6}" y1="98.5" y2="98.5" stroke="#c792ea" stroke-width="1" stroke-dasharray="1.5 2.2"/><text x="${X(0) - 4}" y="107" font-size="6.6" fill="#d7a8f5" font-weight="700" ${F}>$$$ barrida</text>`;
  c += `<line x1="${X(1)}" x2="${X(8)}" y1="66" y2="66" stroke="#ffb74d" stroke-width="1.1" stroke-dasharray="4 2"/><text x="${X(2)}" y="63" font-size="7.4" font-weight="800" fill="#ffb74d" ${F}>CHoCH</text>`;
  c += `<line x1="${X(7)}" x2="${X(13)}" y1="61" y2="61" stroke="#8ab4ff" stroke-width="1.1" stroke-dasharray="4 2"/><text x="${X(9)}" y="58" font-size="7.4" font-weight="800" fill="#8ab4ff" ${F}>BOS</text>`;
  cs.forEach((k, i) => { const up = k[1] <= k[0], col = up ? '#12b886' : '#f23645'; c += `<line x1="${X(i)}" x2="${X(i)}" y1="${k[2]}" y2="${k[3]}" stroke="${col}" stroke-width="1.1"/><rect x="${X(i) - 3.2}" y="${Math.min(k[0], k[1])}" width="6.4" height="${Math.max(1.6, Math.abs(k[0] - k[1]))}" rx=".8" fill="${col}"/>`; });
  [[4, 'LL', 1], [7, 'LH', 0], [10, 'HL', 1], [15, 'HH', 0], [18, 'HL', 1], [26, 'HH', 0]].forEach(([i, t, lo]) => { const k = cs[i]; c += `<text x="${X(i)}" y="${lo ? k[3] + 9 : k[2] - 4}" font-size="7" font-weight="800" fill="${lo ? '#4cd6b0' : '#ff8a95'}" text-anchor="middle" ${F}>${t}</text>`; });
  return `<svg class="nova-prev" viewBox="0 0 ${W} 120" role="img" aria-label="Vista previa de Nova LITE: estructura de mercado (LL, HL, HH), CHoCH, BOS, order block, FVG, barrida de liquidez y zonas premium y descuento"><defs><linearGradient id="nlBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d1421"/><stop offset="1" stop-color="#111b2e"/></linearGradient></defs><rect width="${W}" height="120" rx="10" fill="url(#nlBg)"/>${c}</svg>`;
}
function catPreviewSvg(id) {
  if (id === 'nova-nexus') return novaPreviewSvg();
  if (id === 'nova-lite') return novaLitePreviewSvg(); // ilustración propia, con el mismo estilo que Nova Nexus
  const bg = '<rect width="300" height="130" fill="#0b0e14"/>';
  if (id === 'nova-osc') {
    let a = '', b = '', f = ''; const n = 40, X = i => 8 + i * 7.1;
    const flux = i => 65 - Math.sin(i / 4.2) * 30 - Math.cos(i / 9) * 10, mom = i => 65 - Math.sin((i - 3) / 4.2) * 24 - Math.cos(i / 9) * 8;
    for (let i = 0; i < n; i++) { a += `${i ? 'L' : 'M'}${X(i).toFixed(1)},${flux(i).toFixed(1)}`; b += `${i ? 'L' : 'M'}${X(i).toFixed(1)},${mom(i).toFixed(1)}`; }
    f = `${a}L${X(n - 1)},65L${X(0)},65Z`;
    return `<svg class="nova-prev" viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg">${bg}<line x1="0" x2="300" y1="30" y2="30" stroke="#444" stroke-dasharray="3 3"/><line x1="0" x2="300" y1="100" y2="100" stroke="#444" stroke-dasharray="3 3"/><line x1="0" x2="300" y1="65" y2="65" stroke="#333"/><path d="${f}" fill="rgba(0,230,118,.22)"/><path d="${a}" fill="none" stroke="#00e676" stroke-width="1.6"/><path d="${b}" fill="none" stroke="#ff9800" stroke-width="1.2"/><circle cx="${X(10)}" cy="${flux(10)}" r="3" fill="#ff2d55"/><circle cx="${X(29)}" cy="${flux(29)}" r="3" fill="#00e676"/><rect x="0" y="120" width="300" height="10" fill="#1c1c3d"/><rect x="${X(20)}" y="120" width="60" height="10" fill="#00e676" opacity=".7"/><text x="8" y="12" font-size="9" fill="#a5a5ff" font-weight="700">Nova Oscillator · Flux + Momentum</text></svg>`;
  }
  if (id === 'nova-sig') {
    let cs = '', px = 0; const n = 30, X = i => 10 + i * 6.4, yy = v => 112 - v;
    const ser = i => 48 + Math.sin(i / 3.2) * 20 + (i > 15 ? (i - 15) * 1.6 : 0);
    for (let i = 0; i < n; i++) { const o = ser(i), c = ser(i + 1), hi = Math.max(o, c) + 5, lo = Math.min(o, c) - 5, up = c >= o, col = up ? '#11cf77' : '#d11645'; cs += `<line x1="${X(i)}" x2="${X(i)}" y1="${yy(hi)}" y2="${yy(lo)}" stroke="${col}"/><rect x="${X(i) - 2.2}" y="${yy(Math.max(o, c))}" width="4.4" height="${Math.max(2, Math.abs(c - o))}" fill="${col}"/>`; }
    const ex = X(14), ey = yy(ser(15) - 6), tp = k => `<line x1="${ex}" x2="248" y1="${k[0]}" y2="${k[0]}" stroke="${k[1]}" stroke-dasharray="${k[2] ? '4 3' : ''}"/><rect x="248" y="${k[0] - 5}" width="22" height="10" rx="2" fill="${k[1]}" opacity=".85"/><text x="259" y="${k[0] + 3}" font-size="7" fill="#fff" text-anchor="middle" font-weight="700">${k[3]}</text>`;
    return `<svg class="nova-prev" viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg">${bg}${cs}${tp([ey + 14, '#ff4444', 0, 'SL'])}${tp([ey - 16, '#11cf77', 1, 'TP1'])}${tp([ey - 30, '#00aaff', 1, 'TP2'])}${tp([ey - 46, '#ff9900', 1, 'TP3'])}<line x1="${ex}" x2="248" y1="${ey}" y2="${ey}" stroke="#8796ab" stroke-dasharray="3 3" opacity=".7"/><rect x="${ex - 17}" y="${ey + 6}" width="34" height="13" rx="3" fill="#11cf77"/><text x="${ex}" y="${ey + 15.5}" font-size="8" fill="#fff" text-anchor="middle" font-weight="700">▲ D+</text><rect x="${X(26) - 10}" y="${yy(ser(27) + 11) - 15}" width="20" height="12" rx="3" fill="#d11645"/><text x="${X(26)}" y="${yy(ser(27) + 11) - 6}" font-size="8" fill="#fff" text-anchor="middle" font-weight="700">▼</text><rect x="198" y="108" width="96" height="16" fill="#000" opacity=".6" stroke="#555"/><text x="204" y="119" font-size="8" fill="#11cf77" font-weight="700">BUY</text><text x="236" y="119" font-size="8" fill="#11cf77" font-weight="700">4/5 ****</text></svg>`;
  }
  let rows = ''; const names = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA'], sg = [1, 0, -1, 2, 0, -2, 1];
  names.forEach((nm, i) => { const y = 26 + i * 14, c = sg[i] > 0 ? '#00e676' : sg[i] < 0 ? '#ff2d55' : '#40405c', t = sg[i] > 0 ? 'LONG' : sg[i] < 0 ? 'SHORT' : '—'; rows += `<rect x="40" y="${y - 10}" width="220" height="13" fill="${i % 2 ? '#0c0c16' : '#13131f'}"/><text x="48" y="${y}" font-size="9" fill="#eaeaff" font-weight="700">${nm}</text><text x="130" y="${y}" font-size="9" fill="${c}" font-weight="700">${t}</text><text x="200" y="${y}" font-size="9" fill="#b366ff">${sg[i] ? Math.abs(sg[i]) + 2 + '/5' : ''}</text>`; });
  return `<svg class="nova-prev" viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg">${bg}<rect x="39" y="5" width="222" height="120" fill="none" stroke="#8a6bff"/><rect x="40" y="6" width="220" height="13" fill="#1c1c3d"/><text x="48" y="16" font-size="9" fill="#a5a5ff" font-weight="700">SÍMBOLO</text><text x="130" y="16" font-size="9" fill="#a5a5ff" font-weight="700">SEÑAL</text><text x="200" y="16" font-size="9" fill="#a5a5ff" font-weight="700">SCORE</text>${rows}</svg>`;
}
const catPineOf = c => state.pine.find(p => p.sid === 'cat:' + c.id);
function catalogCards(list) {
  return (list || window.CCTCatalog || []).map(c => {
    const p = catPineOf(c);
    return `<div class="nova-card ${p && p.on ? 'on' : ''}">${catPreviewSvg(c.id)}<div class="nova-body"><div><b>${esc(nnName(c.name))} ${c.tier === 'pro' ? '<span class="prem-tag"><svg viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>PRO</span>' : '<span class="free-tag">GRATIS</span>'}</b><small>${esc(c.desc)}</small>${p ? (pineRes[p.sid] ? (pineRes[p.sid].ok ? '' : `<small class="pine-err">Error${pineRes[p.sid].error.line ? ' · línea ' + pineRes[p.sid].error.line : ''}: ${esc(pineRes[p.sid].error.msg)}</small><button class="small-button" data-pine-retry="${p.sid}">↻ Reintentar</button>`) : '<small>Calculando…</small>') : ''}</div><div class="script-btns">${p ? `<button class="small-button" data-pine-set="${p.sid}">${I('gear', 14)} Configurar</button><button class="toggle ${p.on ? 'on' : ''}" data-pine-tog="${p.sid}" aria-pressed="${!!p.on}" aria-label="Activar ${esc(c.name)}"></button>` : `<button class="small-button" data-cat-add="${c.id}">＋ Añadir</button>`}</div></div></div>`;
  }).join('');
}
document.addEventListener('click', e => { const b = e.target.closest('[data-std-set]'); if (b) openStdDialog(b.dataset.stdSet); const r = e.target.closest('[data-pine-retry]'); if (r) { delete pineRes[r.dataset.pineRetry]; pineKey = ''; schedulePine(); renderIndicators(); if (sheetMode === 'indicators' && $('#sheet').classList.contains('open')) ibRefresh(); } });
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-cat-add]'); if (!b) return;
  const c = (window.CCTCatalog || []).find(x => x.id === b.dataset.catAdd); if (!c) return;
  if (!c.code) { if (fbUser) { toast('Cargando el indicador desde tu cuenta…'); loadProCode(); } else { toast('Inicia sesión con tu cuenta Infinity para usar este indicador'); if (window.CCT_signIn) CCT_signIn(); } return; }
  if (activePine().length >= PINE_MAX) { toast(`Máximo ${PINE_MAX} scripts activos`); return; }
  const sid = 'cat:' + c.id;
  const inputs = {};
  if (c.id === 'nova-scr') { const r = await pineRunRaw(c.code, {interval: state.interval, symbol: symOf(state.symbol), timeLimitMs: 12000}); if (r && r.ok) r.inputs.filter(i => i.type === 'symbol').forEach((i, k) => { inputs[i.key] = CAT_SYMS[k] || ''; }); }
  if (!state.pine.some(p => p.sid === sid)) state.pine.push({sid, on: true, inputs});
  save(); renderIndicators(); countIndicators(); pineKey = ''; schedulePine(); toast(c.id === 'nova-scr' ? 'Añadido: calcula 40 símbolos, puede tardar unos segundos' : 'Añadido al gráfico');
  if (sheetMode === 'indicators' && $('#sheet').classList.contains('open')) ibRefresh();
});

function pineSection() {
  const rows = state.pine.map(p => {
    const s = scripts.find(x => x.id === p.sid); if (!s) return ''; if ((window.CCTCatalog || []).some(c => c.code === s.code)) return ''; const r = pineRes[p.sid]; let st;
    if (!p.on) st = 'Apagado'; else if (!r) st = 'Calculando…';
    else if (!r.ok) st = `<span class="pine-err">Error${r.error.line ? ' · línea ' + r.error.line : ''}: ${esc(r.error.msg)}</span>`;
    else { const u = r.warnings.filter(w => w.level === 'unsupported').length; st = `${r.plots.length} plot${r.plots.length === 1 ? '' : 's'} · ` + (u ? `<span class="pine-warn">${I('warn', 14)} ${u} aviso${u > 1 ? 's' : ''} de no soportado</span>` : r.warnings.length ? `${r.warnings.length} aviso${r.warnings.length > 1 ? 's' : ''}` : 'sin avisos') + (r.meta.overlay ? '' : ' · panel propio') + (r.strategy ? ` · <b class="${r.strategy.stats.net >= 0 ? 'positive' : 'negative'}">Estrategia ${r.strategy.stats.net >= 0 ? '+' : ''}${r.strategy.stats.netPct.toFixed(2)}% · ${r.strategy.tradesTotal} ops</b>` : ''); }
    return `<div class="setting-row pine-row">${prevImg(s)}<div><b>${esc(nnName(s.name))}</b><small>${st}</small>${r && r.ok ? `<select class="pane-sel" data-pine-pane="${p.sid}" aria-label="Panel"><option value="" ${!p.pane ? 'selected' : ''}>Panel: automático (${r.meta.overlay ? 'sobre el gráfico' : 'abajo'})</option><option value="main" ${p.pane === 'main' ? 'selected' : ''}>Panel: sobre el gráfico</option><option value="top" ${p.pane === 'top' ? 'selected' : ''}>Panel: arriba (propio)</option><option value="bottom" ${p.pane === 'bottom' ? 'selected' : ''}>Panel: abajo (propio)</option></select>` : ''}</div><div class="script-btns">${r && r.ok && r.strategy ? `<button class="small-button" data-pine-rep="${p.sid}" aria-label="Informe">${I('chart', 16)}</button>` : ''}<button class="small-button" data-pine-set="${p.sid}" aria-label="Ajustes">${I('gear', 16)}</button><button class="small-button danger" data-pine-del="${p.sid}" aria-label="Quitar">✕</button><button class="toggle ${p.on ? 'on' : ''}" data-pine-tog="${p.sid}" aria-pressed="${p.on}" aria-label="Activar"></button></div></div>`;
  }).join('');
  return `<div class="pine-head"><b>Scripts de Pine</b><small>Pega código de TradingView: se interpreta aquí y se dibuja en el gráfico</small></div>${rows}<div class="setting-row"><button class="primary" data-pine-new="1">＋ Pegar / convertir Pine</button></div>`;
}

/* ───────── Informe de estrategia (backtest) ───────── */
async function fetchKlinesPaged(sym, itv, count) { // hasta 10 000 velas, de 1000 en 1000 hacia atrás
  let out = [], end = null; count = Math.min(10000, count);
  while (out.length < count) {
    const raw = await getJSON(`${API}/klines?symbol=${sym}&interval=${itv}&limit=1000${end ? '&endTime=' + end : ''}`);
    if (!raw.length) break; out = raw.map(d => ({t: d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]})).concat(out); end = raw[0][0] - 1; if (raw.length < 1000) break;
  }
  return out.slice(-count);
}
function downloadText(name, text, mime = 'text/csv') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: mime + ';charset=utf-8'})); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function openStrategyReport(sid) {
  const r0 = pineRes[sid]; if (!r0 || !r0.ok || !r0.strategy) { toast('Esta estrategia aún no tiene resultados'); return; }
  let S = r0.strategy, rc = candles, rsym = state.symbol, ritv = state.interval, nBars = candles.length, busy = false;
  const money = v => v == null ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', {maximumFractionDigits: 2}), pc = v => v == null || !Number.isFinite(v) ? '—' : v.toFixed(2) + '%', cls = v => v > 0 ? 'positive' : v < 0 ? 'negative' : '';
  const card = (l, v, c) => `<div class="rep-card"><small>${l}</small><b class="${c || ''}">${v}</b></div>`;
  const el = document.createElement('div'); el.className = 'cfg-overlay';
  el.innerHTML = `<div class="cfg-dlg" role="dialog" aria-modal="true" aria-label="Informe de estrategia"><div class="cfg-head"><strong>${esc(S.title || pineName(sid))}</strong><button class="cfg-x" aria-label="Cerrar">✕</button></div>
    <div class="rep-ctl"><select id="rpSym" aria-label="Activo">${[...new Set([state.symbol, ...state.symbols])].map(s => `<option value="${s}" ${s === rsym ? 'selected' : ''}>${esc(base(s))}</option>`).join('')}</select><select id="rpTf" aria-label="Temporalidad">${INTERVALS.map(t => `<option ${t === ritv ? 'selected' : ''}>${t}</option>`).join('')}</select><select id="rpN" aria-label="Historial">${[500, 1000, 3000, 5000, 10000].map(n => `<option value="${n}" ${n === 1000 ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="small-button" id="rpGo">Recalcular</button></div>
    <div class="cfg-tabs"><button data-rt="sum" class="on">Resumen</button><button data-rt="tr">Operaciones</button><button data-rt="par">Supuestos</button></div>
    <div class="cfg-body" id="repBody"></div><div class="cfg-foot"><button class="cfg-btn" data-act="csvT">${I('download', 14)} Operaciones</button><button class="cfg-btn" data-act="csvE">${I('download', 14)} Capital</button><span class="cfg-sp"></span><button class="cfg-btn cfg-ok" data-act="cancel">Cerrar</button></div></div>`;
  document.body.appendChild(el);
  const body = el.querySelector('#repBody'); let tab = 'sum';
  const drawEq = cv => {
    const eq = S.equity, n = eq.length, st = S.stats, w = cv.clientWidth || 320, h = 150, dpr = window.devicePixelRatio || 1; cv.width = w * dpr; cv.height = h * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const vals = eq.filter(v => v != null); if (vals.length < 2) return; let mn = Math.min(...vals, st.init), mx = Math.max(...vals, st.init); if (mx === mn) { mx += 1; mn -= 1; }
    const X = i => 4 + i / (n - 1) * (w - 8), Y = v => h - 8 - (v - mn) / (mx - mn) * (h - 16), css = getComputedStyle(document.body);
    g.strokeStyle = css.getPropertyValue('--line') || '#263244'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(0, Y(st.init)); g.lineTo(w, Y(st.init)); g.stroke(); g.setLineDash([]);
    g.strokeStyle = vals[vals.length - 1] >= st.init ? '#26a69a' : '#ef5350'; g.lineWidth = 2; g.beginPath(); let started = false; eq.forEach((v, i) => { if (v == null) return; if (!started) { g.moveTo(X(i), Y(v)); started = true; } else g.lineTo(X(i), Y(v)); }); g.stroke();
  };
  const show = () => {
    const st = S.stats, cur = S.currency || 'USDT'; el.querySelectorAll('.cfg-tabs button').forEach(b => b.classList.toggle('on', b.dataset.rt === tab));
    const span = rc.length ? `${new Date(rc[0].t).toLocaleDateString()} → ${new Date(rc[rc.length - 1].t).toLocaleDateString()} · ${rc.length} velas · ${base(rsym)} ${ritv}` : '';
    if (tab === 'sum') {
      body.innerHTML = `<p class="cfg-note">${span}</p><canvas id="repEq" style="width:100%;height:150px;display:block;margin-bottom:12px"></canvas><div class="rep-grid">`
        + card('Beneficio neto', `${money(st.net)} ${cur}<br><small>${pc(st.netPct)}</small>`, cls(st.net)) + card('Capital final', money(st.equity), cls(st.equity - st.init)) + card('Operaciones cerradas', st.trades) + card('% ganadoras', st.winRate == null ? '—' : pc(st.winRate))
        + card('Factor de beneficio', st.profitFactor == null ? '—' : st.profitFactor === Infinity ? '∞' : st.profitFactor.toFixed(2)) + card('Reducción máx. (drawdown)', `${money(st.maxDD)}<br><small>${pc(st.maxDDpct)}</small>`, 'negative')
        + card('Ganancia media', money(st.avgWin), 'positive') + card('Pérdida media', money(st.avgLoss), 'negative') + card('Mayor ganancia', money(st.largestWin), 'positive') + card('Mayor pérdida', money(st.largestLoss), 'negative')
        + card('Largos / Cortos', `${st.longs} / ${st.shorts}`) + card('Comisiones', money(st.commission)) + card('Abiertas ahora', `${st.openTrades}<br><small>${money(st.openProfit)}</small>`, cls(st.openProfit)) + card('Comprar y mantener', pc(st.buyHoldPct), cls(st.buyHoldPct)) + `</div>`;
      drawEq(body.querySelector('#repEq'));
    } else if (tab === 'tr') {
      const rows = S.open.map(t => [...t, 1]).concat([...S.trades].reverse().map(t => [...t, 0])).slice(0, 300);
      const dt = i => { const c = rc[i]; return c ? new Date(c.t).toLocaleDateString() : ''; };
      body.innerHTML = rows.length ? `<p class="cfg-note">Mostrando ${rows.length} de ${S.tradesTotal + S.open.length} (más recientes primero). Descarga el CSV para ver todas.</p><div class="rep-tbl"><table><thead><tr><th>#</th><th>Lado</th><th>Entrada</th><th>Salida</th><th>Cant.</th><th>Resultado</th></tr></thead><tbody>${rows.map(t => `<tr><td>${esc(t[0])}</td><td>${t[1] === 1 ? 'Largo' : 'Corto'}</td><td>${fmt(t[3])}<small>${dt(t[4])}</small></td><td>${t[9] ? '<i>abierta</i>' : fmt(t[5]) + `<small>${dt(t[6])} · ${esc(t[8])}</small>`}</td><td>${(+t[2].toFixed(6))}</td><td class="${cls(t[7])}">${money(t[7])}</td></tr>`).join('')}</tbody></table></div>` : '<p class="cfg-empty">La estrategia no hizo operaciones en estas velas.</p>';
    } else {
      const P = S.params, qt = {fixed: 'contratos fijos', cash: 'efectivo fijo', percent_of_equity: '% del capital'}[P.qtyType];
      body.innerHTML = `<div class="rep-note"><p><b>Capital inicial:</b> ${money(st.init)} ${cur} · <b>Tamaño:</b> ${P.qtyVal} (${qt}) · <b>Pyramiding:</b> ${P.pyramiding} · <b>Comisión:</b> ${P.commVal} (${P.commType}) · <b>Deslizamiento:</b> ${P.slippage} ticks · <b>Ejecución:</b> ${P.onClose ? 'al cierre de la vela' : 'en la apertura de la vela siguiente'}</p>
      <p>Cómo se simula: las órdenes de mercado se ejecutan en la apertura de la vela siguiente (nunca con datos futuros); límites y stops dentro de la vela siguiendo la ruta O→H→L→C (o O→L→H→C si el mínimo está más cerca de la apertura); trailing stop aproximado. No se simulan margen, liquidaciones, calc_on_every_tick ni datos intravela. Los resultados son reproducibles: mismo script, mismos datos y mismos ajustes dan el mismo informe. Es un backtest histórico: <b>no garantiza resultados futuros ni coincide exactamente con TradingView</b>. Solo análisis; no se ejecutan órdenes reales.</p></div>`;
    }
  };
  const csvEsc = v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const iso = i => rc[i] ? new Date(rc[i].t).toISOString() : '';
  el.addEventListener('click', async e => {
    if (e.target === el || e.target.closest('.cfg-x') || e.target.closest('[data-act=cancel]')) { el.remove(); return; }
    const b = e.target.closest('[data-rt]'); if (b) { tab = b.dataset.rt; show(); return; }
    const nm = `${base(rsym)}_${ritv}_${(pineName(sid) || 'estrategia').replace(/[^\w-]+/g, '_')}`;
    if (e.target.closest('[data-act=csvT]')) {
      const head = ['n', 'entrada_id', 'lado', 'cantidad', 'entrada_fecha_utc', 'entrada_precio', 'salida_fecha_utc', 'salida_precio', 'resultado', 'salida_motivo'];
      const rows = S.trades.map((t, i) => [S.tradesTotal - S.trades.length + i + 1, t[0], t[1] === 1 ? 'largo' : 'corto', t[2], iso(t[4]), t[3], iso(t[6]), t[5], t[7], t[8]]).concat(S.open.map(t => ['', t[0], t[1] === 1 ? 'largo' : 'corto', t[2], iso(t[4]), t[3], '', '', t[7], 'abierta']));
      downloadText(nm + '_operaciones.csv', [head, ...rows].map(r => r.map(csvEsc).join(',')).join('\n')); return;
    }
    if (e.target.closest('[data-act=csvE]')) { downloadText(nm + '_capital.csv', ['fecha_utc,capital', ...S.equity.map((v, i) => v == null ? null : `${iso(i)},${v}`).filter(Boolean)].join('\n')); return; }
    if (e.target.closest('#rpGo')) {
      if (busy) return; busy = true; const go = el.querySelector('#rpGo'); go.textContent = 'Calculando…'; go.disabled = true;
      try {
        const sym = el.querySelector('#rpSym').value, itv = el.querySelector('#rpTf').value, n = +el.querySelector('#rpN').value;
        const cs = await fetchKlinesPaged(sym, itv, n); if (cs.length < 30) throw new Error('Pocas velas disponibles');
        const s = scripts.find(x => x.id === sid), p = state.pine.find(x => x.sid === sid);
        const res = await pineRunFull(s.code, {inputs: (p && p.inputs) || {}, interval: itv, symbol: sym, name: s.name, cs, timeLimitMs: 25000});
        if (!res || !res.ok) throw new Error(res && res.error ? res.error.msg : 'Error al calcular');
        if (!res.strategy) throw new Error('El script no produjo un backtest');
        S = res.strategy; rc = cs; rsym = sym; ritv = itv; show(); if (!res.complete) toast('Aviso: hay partes del script sin soporte; el resultado puede diferir');
      } catch (err) { toast('No se pudo recalcular: ' + (err.message || err)); }
      busy = false; go.textContent = 'Recalcular'; go.disabled = false;
    }
  });
  show();
}
function pineMsgHtml(res, code) {
  if (!res.ok) { const src = (code || '').split('\n')[res.error.line - 1]; return `<div class="pine-box err"><b>No se pudo interpretar</b><div>${res.error.line ? 'Línea ' + res.error.line + ': ' : ''}${esc(res.error.msg)}</div>${src ? `<pre>${esc(src.trim().slice(0, 160))}</pre>` : ''}</div>`; }
  const un = res.warnings.filter(w => w.level === 'unsupported'), fx = res.warnings.filter(w => w.level === 'fix'), rest = res.warnings.filter(w => w.level !== 'unsupported' && w.level !== 'fix');
  const li = w => `<li>${w.line ? 'Línea ' + w.line + ' · ' : ''}${esc(w.msg)}</li>`;
  return `<div class="pine-box ${res.complete ? 'ok' : 'warn'}"><b>${res.complete ? '✓ Interpretado: no se detectó nada sin soporte' : I('warn', 14) + ' Interpretado con partes SIN soporte: el resultado puede diferir de TradingView'}</b>`
    + `<div>${res.plots.length + (res.candles || []).length} plot(s) · ${res.shapes.length} forma(s) · ${res.labels.length + res.lines.length + res.boxes.length + (res.polylines || []).length + (res.tables || []).length + (res.linefills || []).length} objeto(s) · ${res.stats.ms} ms</div>`
    + (fx.length ? `<div class="pine-fix"><b>${I('wrench', 14)} Reparado automáticamente (${fx.length})</b><ul class="info">${fx.map(li).join('')}</ul></div>` : '') + (un.length ? `<ul>${un.map(li).join('')}</ul>` : '') + (rest.length ? `<ul class="info">${rest.map(li).join('')}</ul>` : '') + '</div>';
}
const PINE_EXAMPLE = `//@version=5
indicator("Cruce de EMAs (ejemplo)", overlay=true)
fast = input.int(9, "EMA rápida", minval=1)
slow = input.int(21, "EMA lenta", minval=1)
emaF = ta.ema(close, fast)
emaS = ta.ema(close, slow)
plot(emaF, "Rápida", color.aqua, 2)
plot(emaS, "Lenta", color.orange, 2)
up = ta.crossover(emaF, emaS)
dn = ta.crossunder(emaF, emaS)
plotshape(up, "Compra", shape.triangleup, location.belowbar, color.lime, size=size.small)
plotshape(dn, "Venta", shape.triangledown, location.abovebar, color.red, size=size.small)
bgcolor(emaF > emaS ? color.new(color.green, 92) : color.new(color.red, 92))
`;
function renderPineEditor(list) {
  list.innerHTML = `<input id="pineName" class="paste-name" placeholder="Nombre (opcional)" autocomplete="off"><textarea id="pineCode" placeholder="Pega aquí tu código de Pine Script (v5 o anterior)…" spellcheck="false" autocapitalize="off"></textarea>
    <div class="pine-actions"><button class="primary" id="pineRun">Añadir al gráfico</button><button class="small-button" id="pineExample">Ejemplo</button><button class="small-button" id="pineFile">Abrir archivo</button></div>
    <div id="pineMsg"></div>
    <p class="small-note">Es un intérprete propio, no TradingView: soporta una parte de Pine (indicadores, ta.*, plot/plotshape/bgcolor/fill/hline, label/line/box, input.*, arrays, funciones). Lo que no soporta se avisa con su línea; no se omite en silencio. Solo análisis: no se ejecutan órdenes.</p>`;
  $('#pineName').value = pineDraft.name; $('#pineCode').value = pineDraft.code;
  $('#pineCode').oninput = () => { pineDraft.code = $('#pineCode').value; }; $('#pineName').oninput = () => { pineDraft.name = $('#pineName').value; };
  $('#pineExample').onclick = () => { pineDraft.code = PINE_EXAMPLE; $('#pineCode').value = PINE_EXAMPLE; };
  $('#pineFile').onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.pine,.txt,text/plain'; i.onchange = async () => { const f = i.files[0]; if (!f) return; if (f.size > SCRIPTS_MAX) { toast('Archivo demasiado grande (máx. 3 MB)'); return; } pineDraft.code = await f.text(); if (!pineDraft.name) pineDraft.name = f.name.replace(/\.[^.]+$/, ''); renderPineEditor(list); }; i.click(); };
  $('#pineRun').onclick = async () => {
    const code = $('#pineCode').value, msg = $('#pineMsg'), btn = $('#pineRun');
    if (!code.trim()) { msg.innerHTML = '<div class="pine-box err">Pega primero el código.</div>'; return; }
    if (!candles.length) { msg.innerHTML = '<div class="pine-box err">Abre un gráfico y espera a que carguen las velas.</div>'; return; }
    if (window.CCTConvert) { closeSheet(); convertPine(code, pineDraft.name.trim() || 'Script de Pine'); pineDraft.code = ''; pineDraft.name = ''; return; }
    if (activePine().length >= PINE_MAX) { msg.innerHTML = `<div class="pine-box err">Máximo ${PINE_MAX} scripts activos a la vez. Apaga o quita alguno.</div>`; return; }
    btn.disabled = true; btn.textContent = 'Interpretando…';
    const key = `${state.symbol}|${state.interval}|${candles[0].t}`;
    const res = await pineRunFull(code, {interval: state.interval, symbol: symOf(state.symbol), name: pineDraft.name || 'Script', timeLimitMs: 12000});
    btn.disabled = false; btn.textContent = 'Añadir al gráfico';
    msg.innerHTML = pineMsgHtml(res, code);
    if (!res.ok) return;
    const sid = addScript(code, pineDraft.name.trim() || 'Script de Pine'); if (!sid) return;
    res._key = key; pineRes[sid] = res;
    const ex = state.pine.find(p => p.sid === sid); if (ex) ex.on = true; else state.pine.push({sid, on: true, inputs: {}});
    save(); renderIndicators(); countIndicators(); scheduleRender(); toast('Script añadido al gráfico');
    if (res.complete && !res.warnings.length) closeSheet();
  };
}
function renderPineSettings(list) {
  const p = state.pine.find(x => x.sid === pineSetSid), s = scripts.find(x => x.id === pineSetSid), r = pineRes[pineSetSid];
  if (!p || !s) { list.innerHTML = ''; return; }
  const inputs = r && r.ok ? r.inputs : [];
  const ctl = i => {
    const v = i.value, id = 'pin_' + i.key;
    if (i.options && i.options.length) return `<select id="${id}" data-k="${i.key}" data-t="${i.type}">${i.options.map(o => `<option value="${esc(o)}" ${String(o) === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    if (i.type === 'bool') return `<button class="toggle ${v ? 'on' : ''}" id="${id}" data-k="${i.key}" data-t="bool" data-on="${v ? 1 : 0}" aria-pressed="${!!v}"></button>`;
    if (i.type === 'color') return `<input type="color" id="${id}" data-k="${i.key}" data-t="color" value="${esc(String(v).slice(0, 7))}">`;
    if (i.type === 'int' || i.type === 'float') return `<input type="number" id="${id}" data-k="${i.key}" data-t="${i.type}" value="${esc(v)}" ${i.min != null ? `min="${i.min}"` : ''} ${i.max != null ? `max="${i.max}"` : ''} step="${i.step || (i.type === 'int' ? 1 : 'any')}">`;
    return `<input type="text" id="${id}" data-k="${i.key}" data-t="${i.type}" value="${esc(v)}">`;
  };
  list.innerHTML = `<p class="small-note"><b>${esc(s.name)}</b> · ${s.lines} líneas</p>${r ? pineMsgHtml(r, s.code) : '<p class="small-note">Calculando…</p>'}`
    + (inputs.length ? `<div class="pine-head"><b>Parámetros</b></div>` + inputs.map(i => `<div class="setting-row pine-in"><label for="pin_${i.key}"><b>${esc(i.title)}</b>${i.group ? `<small>${esc(i.group)}</small>` : ''}</label>${ctl(i)}</div>`).join('') + `<div class="pine-actions"><button class="primary" id="pineApply">Aplicar</button><button class="small-button" id="pineReset">Restablecer</button></div>` : '')
    + `<div class="pine-actions"><button class="small-button" id="pineView">Ver código</button></div>`;
  $$('#sheetList .toggle[data-k]').forEach(b => b.onclick = () => { const on = b.dataset.on !== '1'; b.dataset.on = on ? 1 : 0; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  const ap = $('#pineApply'); if (ap) ap.onclick = () => {
    const o = {}; $$('#sheetList [data-k]').forEach(el => { const t = el.dataset.t; o[el.dataset.k] = t === 'bool' ? el.dataset.on === '1' : (t === 'int' || t === 'float' || t === 'time') ? (el.value === '' ? null : +el.value) : el.value; });
    p.inputs = o; save(); pineKey = ''; schedulePine(); toast('Parámetros aplicados'); closeSheet();
  };
  const rs = $('#pineReset'); if (rs) rs.onclick = () => { p.inputs = {}; save(); pineKey = ''; schedulePine(); toast('Parámetros restablecidos'); closeSheet(); };
  $('#pineView').onclick = () => { viewScriptId = pineSetSid; openSheet('script'); };
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-pine-new],[data-pine-set],[data-pine-del],[data-pine-tog],[data-pine-add],[data-pine-rep]'); if (!t) return;
  const d = t.dataset;
  if (d.pineRep) { openStrategyReport(d.pineRep); return; }
  if (d.pineNew) { openSheet('pine'); return; }
  if (d.pineSet) { pineSetSid = d.pineSet; openPineDialog(d.pineSet); return; }
  if (d.pineAdd) {
    if (state.pine.some(p => p.sid === d.pineAdd)) { toast('Ya está en el gráfico'); return; }
    if (activePine().length >= PINE_MAX) { toast(`Máximo ${PINE_MAX} scripts activos`); return; }
    state.pine.push({sid: d.pineAdd, on: true, inputs: {}}); save(); renderIndicators(); pineKey = ''; schedulePine(); toast('Añadido al gráfico: revisa Indicadores'); return;
  }
  const p = state.pine.find(x => x.sid === (d.pineDel || d.pineTog)); if (!p) return;
  if (d.pineDel) { state.pine = state.pine.filter(x => x !== p); delete pineRes[p.sid]; }
  else { if (!p.on && activePine().length >= PINE_MAX) { toast(`Máximo ${PINE_MAX} scripts activos`); return; } p.on = !p.on; if (p.on) { pineKey = ''; schedulePine(); } }
  save(); renderIndicators(); if (sheetMode === 'indicators' && $('#sheet').classList.contains('open')) ibRefresh(); scheduleRender();
});
function drawPinePane(x, top0, H, lo, hi, o) {
  if (!x) return; const {left, w, right, line, text, step, plotW} = o, r = x.r, top = top0 + 4, height = H - 10;
  const rg = CCTPineDraw.range(r, lo, hi); let mn = rg ? rg.min : 0, mx = rg ? rg.max : 1;
  if (mx === mn) { mx += 1; mn -= 1; } let pad = (mx - mn) * .08; mn -= pad; mx += pad;
  const pkey = 'pine:' + x.p.sid, pm = paneMan[pkey]; if (pm) { mn = pm.min; mx = pm.max; pad = 0; }
  paneHit.push({key: pkey, top0, H, mn, mx});
  const Yp = v => top + (mx - v) / (mx - mn) * height;
  g.save(); g.beginPath(); g.rect(left, top0, w - left, H); g.clip();
  g.strokeStyle = line; g.lineWidth = .6; g.setLineDash([]); g.beginPath(); g.moveTo(left, top0); g.lineTo(w - right + 2, top0); g.stroke();
  g.font = '10px system-ui'; g.fillStyle = text; g.textAlign = 'left';
  { const tx = nnName(r.meta.title || r.meta.short || '').slice(0, 30); legLabel(tx, left + 4, top + 16, {t: 'pine', sid: x.p.sid, pane: x.p.pane || 'bottom'}); }
  g.fillText(CCTPineDraw.fmtV(mx - pad), w - right + 6, top + 9); g.fillText(CCTPineDraw.fmtV(mn + pad), w - right + 6, top + height);
  const pr = w - right; // el panel usa todo el ancho hasta el eje (incluye el margen derecho del gráfico): si no, al desplazarse quedaba un cuadro vacío que tapaba las últimas velas
  g.beginPath(); g.rect(left, top0, pr - left + 2, H); g.clip();
  CCTPineDraw.draw(g, r, {X, Y: Yp, lo, hi, left, right: pr, top: top0 + 2, bottom: top0 + H - 2, step, candles, overlay: false});
  g.restore();
}

$('#pasteScript').onclick = () => openSheet('paste');
$('#scriptFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > SCRIPTS_MAX) { toast('El archivo es demasiado grande (máx. 3 MB)'); return; }
  convertPine(await f.text(), f.name.replace(/\.[^.]+$/, ''));
};

/* ───────── Aplicar estado completo (importar / nube) ───────── */
function applyState(data, soft = false) {
  const sameChart = soft && data.symbol === state.symbol && data.interval === state.interval;
  // Cambio remoto (nube) sobre el mismo gráfico: no se toca nada mientras el dedo está sobre el gráfico y, si no cambió nada, no se hace nada.
  // Antes cada aviso de la nube borraba la escala de precio manual (y el trazo en curso) y el gráfico «saltaba» de vuelta a la escala automática.
  if (sameChart && (gest || pinch)) { clearTimeout(applyState.t); applyState.t = setTimeout(() => applyState(data, soft), 350); return; }
  const next = merge(withLocalLayout(data));
  if (sameChart && JSON.stringify(next) === JSON.stringify(state)) return;
  const prevSource = state.source; state = next; listSig = listSigOf(state); applyUi(); if (typeof renderTabs === 'function') renderTabs(); if (data.ui === undefined) syncUi(); if (window.__paintSource) window.__paintSource();
  if (sameChart) { drawHist.u.length = drawHist.r.length = 0; updateDrawUI(); } else clearTransient(); // mismo gráfico: se conserva la escala manual, la retícula y lo que se esté dibujando
  if (typeof applyLayout === 'function') applyLayout(); syncCtypeBtn(); theme(); renderIndicators(); countIndicators(); renderFrames(); renderWatch(); updateChartHeader(); renderAcct(); renderMoveAlerts();
  if (!sameChart || prevSource !== state.source) { closeWS(); candles = []; ind = {}; loadCandles(); }
  if (window.CCTPlans && state.plan) CCTPlans.importSaved(state.plan);
}

/* ───────── Cuenta de Google + guardado en la nube (Firebase Auth + Firestore) ───────── */
function loadScript(src) { return new Promise((ok, fail) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = () => fail(Error('No se pudo cargar ' + src)); document.head.appendChild(el); }); }
/* ───────── Derivados en vivo: chips junto al precio, ventana con el detalle y paneles (interés abierto, funding, long/short, delta) ───────── */
const DV_CRYPTO = new Set(['binance', 'binancef', 'bybit', 'bybitf', 'okx', 'okxf', 'coinbase', 'bingx', 'bingxf', 'kucoin', 'gate', 'mexc', 'bitget', 'htx', 'kraken']);
function dvSym() { // símbolo de futuros perpetuos de Binance para el activo del gráfico (los datos de Binance sirven de referencia para cualquier exchange)
  if (!window.CCTDerivs || !DV_CRYPTO.has(srcOf(state.symbol))) return null;
  const [b, q] = splitSym(state.symbol); if (!b || !['USDT', 'USDC', 'USD', 'FDUSD', ''].includes(q || '')) return null;
  const fs = String(b).replace(/[^A-Z0-9]/gi, '').toUpperCase() + 'USDT'; return CCTDerivs.unsupported(fs) ? null : fs;
}
function dvLast(a) { if (!a) return null; for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; }
function dvBig(v, plain) { if (v == null || !Number.isFinite(v)) return ''; const a = Math.abs(v), u = plain ? '' : '$'; return a >= 1e9 ? u + (v / 1e9).toFixed(2) + ' mil M' : a >= 1e6 ? u + (v / 1e6).toFixed(2) + ' M' : a >= 1e3 ? u + (v / 1e3).toFixed(1) + ' K' : u + v.toFixed(2); }
const DV_PANES = ['oi', 'funding', 'lsr', 'taker'];
function dvCalc() {
  const fs = dvSym(), iv = IV_MS[state.interval] || 36e5, I = state.indicators;
  for (const k of DV_PANES) ind[k] = null;
  if (!fs || !candles.length || replay) return;
  const want = DV_PANES.filter(k => I[k]);
  for (const k of want) ind[k] = CCTDerivs.series(fs, iv, k, candles);
  if (want.length) CCTDerivs.loadSeries(fs, iv, want);
}
let dvTimer = 0, dvTickT = 0, dvFs = '';
function dvPriceChg24() { const n = candles.length, iv = IV_MS[state.interval] || 36e5; if (!n) return NaN; const k = Math.min(n - 1, Math.round(864e5 / iv)); return k > 0 ? (candles[n - 1].c / candles[n - 1 - k].c - 1) * 100 : NaN; }
function dvCountdown(t) { const ms = t - Date.now(); if (!(ms > 0)) return '—'; const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4), sc = Math.floor(ms % 6e4 / 1e3); return `${h}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`; }
function dvRender() {
  const head = $('#chartSymHead'); if (!head) return;
  let box = $('#dvChips'); const fs = dvSym(), on = !!state.indicators.derivs && !replay && isDesktop(); // en el celular no: ocupa mucho espacio del gráfico
  if (!on || !fs) { if (box) { box.remove(); scheduleRender(); } return; }
  if (!box) { box = document.createElement('button'); box.type = 'button'; box.id = 'dvChips'; box.className = 'dv-chips'; box.title = 'Derivados en vivo · toca para ver el detalle'; head.appendChild(box); box.addEventListener('pointerdown', e => e.stopPropagation()); box.addEventListener('click', e => { e.stopPropagation(); dvOpen(); }); }
  const S = CCTDerivs.summary(fs);
  if (!S) { box.innerHTML = '<span class="dv-c dim">Derivados…</span>'; return; }
  const fc = S.fund >= 0 ? 'up' : 'dn', oc = !Number.isFinite(S.oiChg) ? '' : S.oiChg >= 0 ? 'up' : 'dn';
  const before = box.offsetHeight;
  box.innerHTML = `<span class="dv-c"><i>Funding</i><b class="${fc}">${S.fund >= 0 ? '+' : ''}${S.fund.toFixed(4)}%</b><em data-dv-cd>${dvCountdown(S.next)}</em></span>`
    + `<span class="dv-c"><i>Int. abierto</i><b>${dvBig(S.oiUsd)}</b>${Number.isFinite(S.oiChg) ? `<em class="${oc}">${S.oiChg >= 0 ? '+' : ''}${S.oiChg.toFixed(1)}%</em>` : ''}</span>`
    + (Number.isFinite(S.ls) ? `<span class="dv-c"><i>Long/Short</i><b>${S.ls.toFixed(2)}</b><em>${S.longPct.toFixed(0)}% L</em></span>` : '');
  if (box.offsetHeight !== before) scheduleRender(); // si la franja cambió de alto, la leyenda se acomoda
}
async function dvRefresh(force) {
  const fs = dvSym(); if (!fs) { dvRender(); return; }
  if (fs !== dvFs) { dvFs = fs; dvRender(); }
  if (!state.indicators.derivs && !DV_PANES.some(k => state.indicators[k])) return;
  if (document.hidden || currentView !== 'chartView') return;
  const S = CCTDerivs.summary(fs); if (force || !S || Date.now() - S.at > 25e3) await CCTDerivs.loadSummary(fs);
  dvRender(); const p = $('#dvPop'); if (p) dvFill(p);
}
function dvClose() { const p = $('#dvPop'); if (p) p.remove(); document.removeEventListener('pointerdown', dvAway, true); }
function dvAway(e) { if (!e.target.closest('#dvPop, #dvChips')) dvClose(); }
function dvOpen() {
  if ($('#dvPop')) { dvClose(); return; }
  const p = document.createElement('div'); p.id = 'dvPop'; p.className = 'dv-pop'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Derivados en vivo');
  $('#chartArea').appendChild(p); dvFill(p); if (!CCTDerivs.summary(dvSym() || '')) dvRefresh(true); p.addEventListener('pointerdown', e => e.stopPropagation()); p.addEventListener('wheel', e => e.stopPropagation(), {passive: true});
  const hb = $('#chartSymHead').getBoundingClientRect(), ab = $('#chartArea').getBoundingClientRect(); p.style.top = (hb.bottom - ab.top + 6) + 'px'; p.style.left = Math.max(6, hb.left - ab.left) + 'px';
  p.addEventListener('click', e => { if (e.target.closest('[data-dv-x]')) dvClose(); if (e.target.closest('[data-ind]')) setTimeout(() => { dvFill(p); dvRefresh(); }, 30); });
  setTimeout(() => document.addEventListener('pointerdown', dvAway, true));
}
function dvFill(p) {
  const fs = dvSym(), S = fs && CCTDerivs.summary(fs), pct = (v, d = 2) => Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(d) + '%' : '—', cls = v => !Number.isFinite(v) ? '' : v >= 0 ? 'up' : 'dn';
  const row = (k, v, sub) => `<div class="dv-row"><span>${k}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const tg = (k, t) => `<button type="button" class="dv-tg ${state.indicators[k] ? 'on' : ''}" data-ind="${k}">${state.indicators[k] ? '✓ ' : '+ '}${t}</button>`;
  p.innerHTML = `<div class="dv-hd"><div><b>Derivados en vivo</b><small>${esc(fs || '')} · perpetuo de Binance</small></div><button type="button" class="dv-x" data-dv-x aria-label="Cerrar">✕</button></div>`
    + (S ? `<div class="dv-grid">`
      + row('Funding actual', `<span class="${cls(S.fund)}">${pct(S.fund, 4)}</span>`, `Anualizado ${pct(S.fund * 3 * 365, 1)}`)
      + row('Próximo cobro', `<span data-dv-cd>${dvCountdown(S.next)}</span>`, S.fund >= 0 ? 'Pagan los largos' : 'Pagan los cortos')
      + row('Interés abierto', dvBig(S.oiUsd), `${dvBig(S.oi, true)} contratos · 24 h <span class="${cls(S.oiChg)}">${pct(S.oiChg, 1)}</span>`)
      + row('Long/Short (cuentas)', Number.isFinite(S.ls) ? S.ls.toFixed(2) : '—', Number.isFinite(S.longPct) ? `${S.longPct.toFixed(1)}% en largo · ${(100 - S.longPct).toFixed(1)}% en corto` : '')
      + row('Precio mark', fmt(S.mark), `Índice ${fmt(S.idx)}`)
      + row('Prima (basis)', `<span class="${cls(S.basis)}">${pct(S.basis, 3)}</span>`, S.basis >= 0 ? 'Futuros por encima del spot' : 'Futuros por debajo del spot')
      + `</div>${(() => { const r = CCTDerivs.reading(S, dvPriceChg24()); return r ? `<p class="dv-read">${esc(r)}</p>` : ''; })()}`
      : `<p class="dv-read">${fs ? 'Cargando datos de futuros…' : 'Este activo no tiene futuros perpetuos en Binance.'}</p>`)
    + `<div class="dv-sub">Ver en el gráfico</div><div class="dv-tgs">${tg('oi', 'Interés abierto')}${tg('funding', 'Funding')}${tg('lsr', 'Long/Short')}${tg('taker', 'Delta agresivo')}</div>`
    + `<p class="dv-note">Datos públicos de Binance Futuros. Lectura educativa, no es una recomendación.</p>`;
}
setInterval(() => { document.querySelectorAll('[data-dv-cd]').forEach(el => { const S = dvFs && CCTDerivs.summary(dvFs); if (S) el.textContent = dvCountdown(S.next); }); }, 1000);
if (window.CCTDerivs) {
  CCTDerivs.on(() => { clearTimeout(dvTickT); dvTickT = setTimeout(() => { if (candles.length && DV_PANES.some(k => state.indicators[k])) { dvCalc(); scheduleRender(); } dvRender(); }, 60); });
  dvTimer = setInterval(() => dvRefresh(), 30e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) dvRefresh(); });
}
if (window.CCTJournal) CCTJournal.bind({sym: () => state.symbol, base: s => base(s), fmt, toast, go: s => { if (s !== state.symbol) selectSymbol(s); else switchView('chartView'); },
  snap: () => { try { const cv = $('#priceCanvas'); if (!cv || !cv.width) return null; const W = 720, k = W / cv.width, o = document.createElement('canvas'); o.width = W; o.height = Math.round(cv.height * k); const c = o.getContext('2d'); c.fillStyle = cstyle().bg || '#07090e'; c.fillRect(0, 0, o.width, o.height); c.drawImage(cv, 0, 0, o.width, o.height); return o.toDataURL('image/jpeg', .72); } catch { return null; } }});
if (window.CCTBook) {
  CCTBook.bind({sym: () => state.symbol, src: () => srcOf(state.symbol), split: s => splitSym(s), fmt, render: scheduleRender, toast, base: s => base(s)});
  const bb = $('#bookBtn'); if (bb) bb.addEventListener('click', () => CCTBook.toggle());
}
{ const jb = $('#journalBtn'); if (jb) jb.addEventListener('click', () => window.CCTJournal && CCTJournal.open()); }
if (window.CCTTrade) {
  CCTTrade.bind({sym: () => state.symbol, price: s => { const v = s === state.symbol && candles.length && !replay ? candles[candles.length - 1].c : curPrice(s); return +v; }, fmt, render: scheduleRender, toast, base: s => base(s), go: s => { if (s !== state.symbol) selectSymbol(s); }});
  const tb = $('#tradeBtn'); if (tb) tb.addEventListener('click', () => CCTTrade.toggle());
  window.CCT_trHit = () => { const r = $('#priceCanvas').getBoundingClientRect(); return trHit.map(q => Object.assign({}, q, {px: r.left, py: r.top})); }; // para pruebas
}
/* Puente para exchange.js: documentos privados de tu cuenta (Firestore) y separador de pares */
window.CCT_split = s => splitSym(s);
window.CCTCloudPriv = {ready: () => !!(uid && db && fbUser), get: async n => { const sn = await db.doc(`users/${uid}/data/${n}`).get(); return sn.exists ? sn.data() : null; }, set: (n, o) => db.doc(`users/${uid}/data/${n}`).set(o)};
function exSub() { const x = window.CCTExchange && CCTExchange.info(), s = x && CCTExchange.snap(); $$('[data-ex-sub]').forEach(el => { el.textContent = x ? `${x.name} conectado · ${s && s.err ? 'revisa la conexión' : Number.isFinite(s && s.equity) ? 'saldo $' + s.equity.toLocaleString('es-MX', {maximumFractionDigits: 2}) : 'leyendo saldo…'}` : 'Conecta BingX, Binance, Bybit o cualquier otro'; }); }
if (window.CCTExchange) CCTExchange.onChange(s => { exSub(); if (acctMenu) paintAcctMenu(); if (Number.isFinite(s.equity) && s.equity >= 0 && !s.err && !(state.acct && state.acct.auto === false)) { const v = Math.round(s.equity * 100) / 100, A = state.acct || {}; if (A.cur !== v || !(A.start > 0)) { state.acct = sanAcct({start: A.start > 0 ? A.start : v, cur: v, auto: true}); save(); if (typeof renderAcct === 'function') renderAcct(); } } }); // el saldo real de tu exchange alimenta la barra de saldo de la cuenta
function renderAccount() {
  exSub(); if (fbUser && window.CCTExchange) CCTExchange.cloudSync(uid); if (fbUser && window.CCTRadar && renderAccount.rUid !== uid) { renderAccount.rUid = uid; CCTRadar.cloudLoad(); }
  const box = $('#accountBox'), top = $('#accountBtn');
  if (window.CCTPlans) CCTPlans.setUser(fbUser);
  queueMicrotask(() => { const r = $('#rrAccount'); if (!r) return; r.hidden = top.hidden; const t = fbUser ? 'Cuenta' : 'Iniciar sesión'; r.dataset.tip = t; r.setAttribute('aria-label', t); r.classList.toggle('on-acc', !!fbUser); });
  if (!cloudEnabled) {
    top.hidden = true;
    box.innerHTML = `<div class="setting-row"><div><b>Cuenta de Google</b><small>No configurada. Tus datos se guardan solo en este dispositivo. Quien administra la app debe completar <code>firebase-config.js</code>.</small></div><span class="pill">Desactivada</span></div>`;
    return;
  }
  if (fbUser) { // la tarjeta de la cuenta y «Cerrar sesión» viven en el botón de la cuenta (foto), no en Configuración
    top.hidden = false; top.innerHTML = fbUser.photoURL ? `<img src="${esc(fbUser.photoURL)}" alt="" referrerpolicy="no-referrer">` : I('user', 18); top.title = 'Cuenta';
    box.innerHTML = '';
    queueMicrotask(() => { const r = $('#rrAccount'); if (r) r.innerHTML = fbUser.photoURL ? `<img class="rr-avatar" src="${esc(fbUser.photoURL)}" alt="" referrerpolicy="no-referrer">` : RR_USER; });
    if (acctMenu) paintAcctMenu();
  } else {
    top.hidden = false; top.textContent = 'Iniciar sesión'; top.title = 'Iniciar sesión con Google';
    box.innerHTML = `<div class="setting-row"><div><b>Guarda todo en tu cuenta</b><small>${esc(syncStatus) || 'Inicia sesión con Google para conservar tu seguimiento, indicadores y dibujos en cualquier dispositivo.'}</small></div></div><button class="google-btn" id="signInBtn"><span class="g">G</span> Iniciar sesión con Google</button>`;
    $('#signInBtn').onclick = signIn;
    queueMicrotask(() => { const r = $('#rrAccount'); if (r) r.innerHTML = RR_USER; });
    closeAcctMenu();
  }
}
const RR_USER = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.7-5.4 7-5.4s6.2 1.8 7 5.4"/></svg>';
/* Menú de la cuenta: se abre desde la foto (barra derecha en PC, arriba en el celular) con tu nombre, correo, plan y «Cerrar sesión» */
let acctMenu = null, acctAnchor = null;
function paintAcctMenu() {
  if (!acctMenu || !fbUser) return;
  const plan = window.CCTPlans ? CCTPlans.TIERS[CCTPlans.real ? CCTPlans.real() : CCTPlans.current()] : null;
  acctMenu.innerHTML = `<div class="am-head">${fbUser.photoURL ? `<img class="am-av" src="${esc(fbUser.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span class="am-av">${I('user', 26)}</span>`}<div class="am-t"><b>${esc(fbUser.displayName || 'Cuenta de Google')}</b><small>${esc(fbUser.email || '')}</small></div></div>
    <div class="am-sync">${I('check', 14)}<span>${esc(syncStatus || 'Todo se guarda en tu cuenta')}</span></div>
    <button type="button" class="am-it" data-ex-open>${SV('<path d="M7 7h11l-3-3M17 17H6l3 3"/>', 17)}<span>${window.CCTExchange && CCTExchange.connected() ? esc(CCTExchange.info().name) : 'Conectar exchange'}</span>${window.CCTExchange && CCTExchange.connected() ? '<em class="am-plan am-ok">Conectado</em>' : ''}</button>
    ${plan ? `<button type="button" class="am-it" data-plans-open>${SV('<path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19 18H5z"/>', 17)}<span>Tu plan</span><em class="am-plan">${esc(plan.n)}</em></button>` : ''}
    <button type="button" class="am-it danger" id="signOutBtn">${I('power', 17)}<span>Cerrar sesión</span></button>`;
  acctMenu.querySelector('#signOutBtn').onclick = () => { closeAcctMenu(); signOut(); };
  placeAcctMenu();
}
function placeAcctMenu() {
  if (!acctMenu || !acctAnchor) return; const r = acctAnchor.getBoundingClientRect(), w = acctMenu.offsetWidth, h = acctMenu.offsetHeight;
  let x = r.left < innerWidth / 2 ? r.right + 10 : r.left - w - 10, y = r.top; // PC: al lado del botón; celular: debajo
  if (r.top < 80) { x = r.right - w; y = r.bottom + 8; }
  acctMenu.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px'; acctMenu.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
}
function closeAcctMenu() { if (!acctMenu) return; acctMenu.remove(); acctMenu = null; document.removeEventListener('pointerdown', acctAway, true); document.removeEventListener('keydown', acctKey, true); }
const acctAway = e => { if (acctMenu && !acctMenu.contains(e.target) && !(acctAnchor && acctAnchor.contains(e.target))) closeAcctMenu(); }, acctKey = e => { if (e.key === 'Escape') closeAcctMenu(); };
function toggleAcctMenu(anchor) {
  if (acctMenu) { closeAcctMenu(); return; }
  acctAnchor = anchor; acctMenu = document.createElement('div'); acctMenu.className = 'acct-menu'; acctMenu.setAttribute('role', 'menu'); acctMenu.setAttribute('aria-label', 'Tu cuenta');
  document.body.appendChild(acctMenu); paintAcctMenu();
  acctMenu.addEventListener('click', e => { if (e.target.closest('[data-plans-open], [data-ex-open]')) closeAcctMenu(); });
  setTimeout(() => { document.addEventListener('pointerdown', acctAway, true); document.addEventListener('keydown', acctKey, true); });
}
$('#accountBtn').onclick = () => { if (fbUser) toggleAcctMenu($('#accountBtn')); else signIn(); };
{ const r = $('#rrAccount'); if (r) r.onclick = () => { if (fbUser) toggleAcctMenu(r); else signIn(); }; }
window.addEventListener('resize', () => placeAcctMenu());
async function signIn() {
  if (!auth) { toast('El servicio de cuentas no está disponible'); return; }
  const provider = new firebase.auth.GoogleAuthProvider(); provider.setCustomParameters({prompt: 'select_account'});
  try { await auth.signInWithPopup(provider); }
  catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) { auth.signInWithRedirect(provider); return; }
    if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) toast('No se pudo iniciar sesión: ' + (e.code || e.message));
  }
}
async function signOut() { if (!auth) return; clearTimeout(pushTimer); try { await cloudPushNow(); } catch {} auth.signOut(); } // antes de salir se sube lo último que cambiaste (el envío tiene 1 s de espera)
/* Bienvenida: al abrir VORTEX sin sesión aparece una ventana para iniciar sesión con Google (y ver tu plan).
   Si la cierras sigues usando el gráfico con el plan Gratis. Sale una vez cada vez que abres la app. */
function showWelcome() {
  if (PANE || fbUser || !cloudEnabled || document.querySelector('.vw-ov')) return;
  try { if (sessionStorage.getItem('cct_welcome')) return; sessionStorage.setItem('cct_welcome', '1'); } catch {}
  const ov = document.createElement('div'); ov.className = 'vw-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Bienvenido a VORTEX');
  const T = window.CCTPlans ? CCTPlans.TIERS : null, row = (k, t) => `<li class="vw-t ${k}"><b>${t}</b><small>${T && T[k] ? esc(T[k].sub) : ''}</small></li>`;
  ov.innerHTML = `<div class="vw-box"><canvas class="vw-fx" aria-hidden="true"></canvas><button type="button" class="vw-x" data-wl="close" aria-label="Cerrar y seguir gratis">✕</button>
    <img class="vw-logo" src="icons/vortex-mark.png" alt="VORTEX">
    <h2>Bienvenido a VORTEX</h2><p>Inicia sesión con Google para guardar tu gráfico en todos tus dispositivos y desbloquear tu plan. Nada se cobra.</p>
    <ul class="vw-tiers">${row('free', 'Gratis')}${row('plus', 'Plus')}${row('infinity', 'Infinity')}</ul>
    <button type="button" class="google-btn vw-go" data-wl="login"><span class="g">G</span> Iniciar sesión con Google</button>
    <div class="vw-alt"><button type="button" data-wl="plans">Ver los planes</button><button type="button" data-wl="close">Seguir con el plan Gratis</button></div></div>`;
  document.body.appendChild(ov); requestAnimationFrame(() => ov.classList.add('open'));
  // fondo de estrellas que se mueven despacio
  const cv = ov.querySelector('.vw-fx'), g = cv.getContext('2d'); let raf = 0, stars = null;
  const draw = t => { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(r.width * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); stars = Array.from({length: 90}, () => ({x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + .3, v: Math.random() * .012 + .003, p: Math.random() * 6})); }
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height);
    for (const s of stars) { s.x -= s.v / 60; if (s.x < 0) s.x = 1; g.fillStyle = `rgba(255,255,255,${.25 + .45 * (.5 + .5 * Math.sin(t / 700 + s.p))})`; g.beginPath(); g.arc(s.x * r.width, s.y * r.height, s.r, 0, 7); g.fill(); }
    if (ov.isConnected) raf = requestAnimationFrame(draw); };
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(draw);
  const close = () => { cancelAnimationFrame(raf); ov.classList.remove('open'); setTimeout(() => ov.remove(), 220); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') { close(); toast('Usando VORTEX con el plan Gratis'); } };
  document.addEventListener('keydown', key);
  ov.addEventListener('click', e => { const b = e.target.closest('[data-wl]'); if (e.target === ov || (b && b.dataset.wl === 'close')) { close(); toast('Usando VORTEX con el plan Gratis'); return; } if (!b) return;
    if (b.dataset.wl === 'login') { close(); signIn(); } else if (b.dataset.wl === 'plans') { close(); if (window.CCTPlans) CCTPlans.open(); } });
}
window.CCT_signIn = () => signIn(); window.CCT_showWelcome = showWelcome;
window.CCT_planSave = p => { if (PANE || !fbUser) return; state.plan = p; save(); }; // el plan verificado viaja en tu cuenta a tus otros dispositivos
var planSeen = '';
window.CCT_planChanged = t => { if (t === planSeen) return; const first = !planSeen; planSeen = t; if (first) return; // al cambiar de plan se recalcula lo que depende de él (liquidaciones, indicadores Nova Nexus)
  try { pineKey = ''; renderIndicators(); countIndicators(); if (candles.length) { calcExtra(); schedulePine(); } scheduleRender(); loadProCode(); } catch {} };
function planOk(f) { return !window.CCTPlans || CCTPlans.can(f); }
function proSid(sid) { return typeof sid === 'string' && sid.startsWith('cat:') && (window.CCTCatalog || []).some(c => 'cat:' + c.id === sid && c.tier === 'pro'); }
async function onUser(user) {
  if (unsubCloud) { unsubCloud(); unsubCloud = null; }
  if (unsubScripts) { unsubScripts(); unsubScripts = null; }
  clearTimeout(pushTimer); fbUser = user;
  if (!user) {
    try { localStorage.removeItem(LASTUID); } catch {}
    if (uid) { uid = null; stateUid = null; lastRemote = ''; scriptsRemote = ''; applyState(readLocal(STORE)); scripts = withCatalog(readScripts()); renderScripts(); } // vuelve al estado local sin sesión; los datos de la cuenta no se quedan visibles
    proForget(); syncStatus = ''; renderAccount(); showWelcome(); return;
  }
  const firstLogin = !uid; uid = user.uid; try { localStorage.setItem(LASTUID, uid); } catch {} setTimeout(loadProCode, 0);
  if (firstLogin && !isDesktop() && !PANE) switchView('chartView'); // recién iniciaste sesión: directo al gráfico
  if (stateUid !== uid && lsGet(storeKey())) { try { applyState(readLocal(storeKey())); } catch {} } // cambios de esta cuenta guardados aquí que aún no subieron (no el estado de «sin sesión»)
  stateUid = uid;
  const anonScripts = (readLocal(SCRIPTS_KEY).items || []).filter(x => x && typeof x.id === 'string'); // scripts guardados antes de iniciar sesión
  scripts = withCatalog(readScripts()); scriptsRemote = ''; renderScripts();
  syncStatus = 'Sincronizando…'; renderAccount();
  const ref = db.doc(CLOUD_DOC(uid));
  try {
    const snap = await ref.get();
    const pendingLocal = (() => { try { return !!localStorage.getItem(dirtyKey()); } catch { return false; } })();
    const rdata = snap.exists ? snap.data() : null, rstr = rdata ? await readRemote(rdata) : '';
    let rstate = null; try { rstate = rstr ? JSON.parse(rstr) : null; } catch {}
    if (rstate) {
      const rr = revOf(rstate, rdata), lr = +state.rev || 0; remoteRev = rr; lastRemote = rstr;
      if (pendingLocal && lr >= rr) { await cloudPushNow(); } // lo de aquí es más nuevo: se sube
      else if (pendingLocal) { const merged = reconcile(state, rstate); applyState(merged); persistLocal(); remoteRev = 0; await cloudPushNow(true); } // ambos cambiaron: se mezclan
      else { applyState(rstate); persistLocal(); try { localStorage.removeItem(dirtyKey()); } catch {} }
    } else { // primera vez en esta cuenta: se sube lo que ya había en este dispositivo
      state.rev = Math.max(Date.now(), (+state.rev || 0)); const mine = JSON.stringify(state); persistLocal();
      await ref.set({...(await packState(mine)), updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); lastRemote = mine; remoteRev = state.rev;
    }
    let snapSeq = 0;
    unsubCloud = ref.onSnapshot(async sn => { // cambios hechos desde otro dispositivo
      if (sn.metadata.hasPendingWrites || !sn.exists) return;
      { const f = sn.data().force; if (f && f.by !== DEV_ID && +f.at > forceSeen && Math.abs(Date.now() - f.at) < 300000) { forceSeen = +f.at; setTimeout(() => forceSync(true), 50); } } // otro dispositivo apretó el botón VORTEX: este también guarda y se actualiza
      const seq = ++snapSeq, data = sn.data(), str = await readRemote(data); if (seq !== snapSeq || !str || str === lastRemote) return;
      let st; try { st = JSON.parse(str); } catch { return; }
      const rr = revOf(st, data); remoteRev = Math.max(remoteRev, rr);
      const rl = +st.listRev || 0, ll = +state.listRev || 0;
      if (rr <= (+state.rev || 0)) { // eco viejo o igual a lo que ya tengo: se ignora… salvo que traiga una lista (orden de monedas y secciones) más reciente que la mía
        if (rl <= ll) return;
        lastRemote = str; try { applyState({...state, symbols: st.symbols, groups: st.groups, symGroup: st.symGroup, symColor: st.symColor, listRev: rl}, true); persistLocal(); } catch {} return;
      }
      lastRemote = str;
      try {
        const dirty = (() => { try { return !!localStorage.getItem(dirtyKey()); } catch { return false; } })();
        if (dirty) { const merged = reconcile(state, st); applyState(merged, true); persistLocal(); cloudPush(); } // lo que acabas de cambiar aquí todavía no se sube: se mezcla, no se pisa
        else if (ll > rl) { applyState({...st, symbols: state.symbols, groups: state.groups, symGroup: state.symGroup, symColor: state.symColor, listRev: ll}, true); cloudPush(); } // mi lista es más nueva que la de la nube (otro dispositivo con cambios no relacionados): se conserva y se sube
        else applyState(st, true);
        persistLocal(); refreshPineAfterSync();
      } catch {}
    }, () => {});
    const sref = db.doc(`users/${uid}/data/scripts`), ssnap = await sref.get();
    if (ssnap.exists && ssnap.data().items) { try { scriptsRemote = await unpackStr(ssnap.data().items); scripts = withCatalog(JSON.parse(scriptsRemote)); saveScriptsLocal(); renderScripts(); } catch {} }
    else { // la cuenta aún no tiene scripts: se suben los de este dispositivo (los de la cuenta local + los guardados antes de iniciar sesión)
      const have = new Set(scripts.map(x => x.id)); for (const x of anonScripts) if (!have.has(x.id)) scripts.push(x);
      if (userScripts().length) { scriptsRemote = JSON.stringify(userScripts()); saveScriptsLocal(); await sref.set({items: await packStr(scriptsRemote), updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); renderScripts(); }
    }
    unsubScripts = sref.onSnapshot(async sn => { // scripts cambiados desde otro dispositivo
      if (sn.metadata.hasPendingWrites || !sn.exists) return;
      let str = sn.data().items; if (!str) return; try { str = await unpackStr(str); } catch { return; } if (str === scriptsRemote) return;
      try { const arr = JSON.parse(str); if (!Array.isArray(arr)) return; scriptsRemote = str; scripts = withCatalog(arr); saveScriptsLocal(); renderScripts(); refreshPineAfterSync(); } catch {}
    }, () => {});
    refreshPineAfterSync();
    syncStatus = 'Guardado en tu cuenta · ' + syncSummary();
  } catch (e) {
    const hint = ['permission-denied', 'failed-precondition', 'unavailable', 'not-found'].includes(e.code) ? ' Revisa en Firebase Console que Firestore esté creado y que las reglas de firestore.rules estén publicadas.' : '';
    syncStatus = 'No se pudo sincronizar (' + (e.code || 'error') + '). Tus datos siguen guardados en este dispositivo.' + hint;
  }
  renderAccount();
}
const syncSummary = () => `${state.pine.length} script${state.pine.length === 1 ? '' : 's'} en el gráfico · ${scripts.length} guardado${scripts.length === 1 ? '' : 's'} · ${state.alerts.length} alerta${state.alerts.length === 1 ? '' : 's'}`;
function refreshPineAfterSync() { renderIndicators(); countIndicators(); renderAlerts(); pineKey = ''; for (const k of Object.keys(pineRes)) if (!scripts.some(s => s.id === k)) delete pineRes[k]; schedulePine(); scheduleRender(); }
/* ───────── Sincronización con la nube: versiones (rev), mezcla y compresión ─────────
   Cada cambio lleva un número de versión (rev). Un cambio de la nube solo se aplica si es MÁS NUEVO que lo que hay aquí; así un eco viejo
   ya no deshace lo último que hiciste (antes borraba dibujos y monedas recién añadidos). Si dos dispositivos cambian a la vez, se mezclan
   (monedas, dibujos y alertas de ambos) en lugar de pisarse. Si el estado es muy grande se comprime. */
const revOf = (st, data) => { const r = st && +st.rev; if (r > 0) return r; try { const u = data && data.updatedAt; return u && u.toMillis ? u.toMillis() : 0; } catch { return 0; } };
async function gz(str) { const bs = await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(); let b = ''; const u = new Uint8Array(bs); for (let i = 0; i < u.length; i += 8192) b += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(b); }
async function gunz(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); }
async function readRemote(data) { // → cadena JSON del estado guardado en la nube
  if (data && data.stateZ) { try { return await gunz(data.stateZ); } catch { return ''; } }
  return (data && data.state) || '';
}
async function packState(str) { // → campos del documento (comprime si el estado se acerca al tope de 1 MiB)
  if (str.length > 600000 && typeof CompressionStream === 'function') { try { return {state: '', stateZ: await gz(str)}; } catch {} }
  return {state: str, stateZ: ''};
}
function reconcile(local, remote) { // mezcla de dos dispositivos que cambiaron a la vez: base = la nube + lo que solo existe aquí
  const out = JSON.parse(JSON.stringify(remote));
  const L = local || {};
  const lNew = (+L.listRev || 0) >= (+remote.listRev || 0); // la lista más recientemente cambiada manda (orden de monedas y secciones, sección y color)
  if (lNew && Array.isArray(L.symbols)) {
    const rs = Array.isArray(remote.symbols) ? remote.symbols : [], rg = Array.isArray(remote.groups) ? remote.groups : [], lg = Array.isArray(L.groups) ? L.groups : [];
    out.symbols = [...L.symbols, ...rs.filter(k => !L.symbols.includes(k))];
    out.groups = [...lg, ...rg.filter(g => g && !lg.some(x => x.id === g.id))];
    out.symGroup = {}; out.symColor = {};
    for (const k of out.symbols) { const inL = L.symbols.includes(k), src = inL ? L : remote; if (src.symGroup && src.symGroup[k]) out.symGroup[k] = src.symGroup[k]; if (src.symColor && src.symColor[k]) out.symColor[k] = src.symColor[k]; }
    out.listRev = +L.listRev || 0;
  } else {
    if (Array.isArray(L.symbols)) { out.symbols = Array.isArray(out.symbols) ? out.symbols : []; for (const k of L.symbols) if (!out.symbols.includes(k)) out.symbols.push(k); }
    if (L.symGroup && typeof L.symGroup === 'object') { out.symGroup = {...L.symGroup, ...(out.symGroup || {})}; }
    if (L.symColor && typeof L.symColor === 'object') { out.symColor = {...L.symColor, ...(out.symColor || {})}; }
    if (Array.isArray(L.groups)) { out.groups = Array.isArray(out.groups) ? out.groups : []; for (const g of L.groups) if (!out.groups.some(x => x.id === g.id)) out.groups.push(g); }
  }
  if (L.drawings && typeof L.drawings === 'object') { out.drawings = out.drawings && typeof out.drawings === 'object' ? out.drawings : {}; for (const [k, arr] of Object.entries(L.drawings)) { const cur = Array.isArray(out.drawings[k]) ? out.drawings[k] : []; const ids = new Set(cur.map(d => d && d.id)); const extra = (Array.isArray(arr) ? arr : []).filter(d => d && !ids.has(d.id)); if (extra.length) out.drawings[k] = [...cur, ...extra].slice(-300); } }
  if (Array.isArray(L.designs)) { out.designs = Array.isArray(out.designs) ? out.designs : []; for (const d of L.designs) if (d && !out.designs.some(x => x.id === d.id)) out.designs.push(d); }
  if (Array.isArray(L.tabs) && L.tabs.length && (+L.tabRev || 0) > (+remote.tabRev || 0)) { out.tabs = L.tabs; out.tab = L.tab; out.tabRev = +L.tabRev; } // pestañas de gráficos: las que se cambiaron más recientemente mandan
  if (Array.isArray(L.alerts)) { out.alerts = Array.isArray(out.alerts) ? out.alerts : []; for (const a of L.alerts) if (a && !out.alerts.some(x => x.id === a.id)) out.alerts.push(a); }
  out.rev = Math.max(Date.now(), (+L.rev || 0), (+remote.rev || 0)) + 1;
  return out;
}
const CLOUD_MAX = 950000; // Firestore limita cada documento a 1 MiB
async function cloudPushNow(force) {
  if (!uid || !db || !fbUser) return;
  const str = JSON.stringify(state);
  if (str === lastRemote && !force) { try { localStorage.removeItem(dirtyKey()); } catch {} return; }
  const mine = uid, ref = db.doc(CLOUD_DOC(mine)), myRev = +state.rev || Date.now();
  try {
    const body = await packState(str);
    if ((body.state || body.stateZ).length > CLOUD_MAX) { syncStatus = 'Tu configuración es demasiado grande para la nube (' + Math.round(str.length / 1024) + ' KB). Borra algunos trazos del pincel: siguen guardados en este dispositivo.'; if (!cloudPushNow.warned) { cloudPushNow.warned = 1; toast('Tu configuración es muy grande para sincronizar; borra trazos del pincel'); } renderAccount(); return; }
    let merged = null;
    if (navigator.onLine !== false) {
      await db.runTransaction(async tx => { // si otro dispositivo guardó algo más nuevo desde la última vez, se mezcla en lugar de pisarlo
        const sn = await tx.get(ref), data = sn.exists ? sn.data() : null; let st = null;
        if (data) { try { st = JSON.parse(await readRemote(data)); } catch {} }
        const rr = st ? revOf(st, data) : 0;
        if (st && rr > remoteRev) { merged = reconcile(JSON.parse(str), st); const m = JSON.stringify(merged); tx.set(ref, {...(await packState(m)), updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); lastRemote = m; remoteRev = merged.rev; }
        else { tx.set(ref, {...body, updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); lastRemote = str; remoteRev = myRev; }
      });
    } else { await ref.set({...body, updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); lastRemote = str; remoteRev = myRev; } // sin conexión: Firestore lo guarda y lo sube al volver
    if (merged && uid === mine) { applyState(merged, true); persistLocal(); }
    if (uid === mine) { try { localStorage.removeItem(dirtyKey()); } catch {} syncStatus = 'Guardado en tu cuenta · ' + syncSummary(); }
  } catch (e) { syncStatus = 'No se pudo guardar en la nube. Se reintentará al próximo cambio.'; lastRemote = ''; setTimeout(() => { if (uid === mine) cloudPush(); }, 15000); }
  renderAccount();
}
function cloudPush() {
  if (!uid || !db || !fbUser) return;
  clearTimeout(pushTimer); pushTimer = setTimeout(cloudPushNow, 1200);
}
// al cerrar o mandar la pestaña a segundo plano (móvil) se sube de inmediato lo pendiente, sin esperar el retardo
/* Botón del logo VORTEX: guarda TODO ahora mismo (gráficos, ajustes, lista, indicadores, scripts, alertas) en este dispositivo y en la cuenta,
   baja lo más nuevo de la cuenta y vuelve a cargar velas, precios y conexión en vivo (útil si el celular se quedó trabado). El guardado automático sigue igual. */
let forceBusy = false, forceSeen = 0; const DEV_ID = Math.random().toString(36).slice(2, 10);
async function forceSync(remote) { // remote = lo pidió otro dispositivo con el botón VORTEX
  if (remote !== true) remote = false;
  if (forceBusy) return; forceBusy = true; const t0 = Date.now();
  const btns = $$('#forceSync'); btns.forEach(b => b.classList.add('syncing')); toast(remote ? 'Otro dispositivo pidió guardar y actualizar…' : 'Guardando y actualizando en todos tus dispositivos…');
  let msg = '';
  try {
    try { syncUi(); } catch {}
    save(); saveScriptsLocal();
    clearTimeout(pushTimer); clearTimeout(scriptsTimer);
    const online = navigator.onLine !== false;
    if (uid && db && fbUser) {
      if (!online) msg = 'Sin conexión: guardado en este dispositivo, se subirá a tu cuenta al volver';
      else {
        await cloudPushNow(true); // sube (y mezcla con lo más nuevo de la cuenta si otro dispositivo guardó algo)
        const sref = db.doc(`users/${uid}/data/scripts`), local = JSON.stringify(userScripts());
        if (local !== scriptsRemote) { await sref.set({items: await packStr(local), updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); scriptsRemote = local; } // scripts nuevos o borrados aquí
        else { const sn = await sref.get({source: 'server'}), str = sn.exists ? await unpackStr(sn.data().items) : ''; if (str && str !== scriptsRemote) { const arr = JSON.parse(str); if (Array.isArray(arr)) { scriptsRemote = str; scripts = withCatalog(arr); saveScriptsLocal(); renderScripts(); } } } // sin cambios locales: se baja lo de la cuenta
        const okCloud = !/^No se pudo/.test(syncStatus);
        if (okCloud && !remote) { try { forceSeen = Date.now(); await db.doc(CLOUD_DOC(uid)).set({force: {at: forceSeen, by: DEV_ID}}, {merge: true}); } catch {} } // señal: los demás dispositivos abiertos guardan lo suyo (se mezcla, no se pisa) y se actualizan
        msg = !okCloud ? 'No se pudo guardar en la nube; sigue guardado en este dispositivo' : remote ? 'Guardado y actualizado (lo pidió otro dispositivo) ✓' : 'Guardado y actualizado en todos tus dispositivos abiertos ✓';
      }
    } else msg = 'Guardado en este dispositivo. Inicia sesión para guardarlo también en tu cuenta';
    pineKey = ''; try { applyUi(); } catch {}
    renderWatch(); renderIndicators(); countIndicators(); renderAlerts(); renderAccount();
    if (online) { // actualiza el gráfico de verdad: corta el tiempo real (puede haberse quedado colgado), baja las velas más recientes y reconecta
      closeWS(); const hang = setTimeout(() => { if (fetchCtl) fetchCtl.abort(); }, 12000);
      const [cr] = await Promise.allSettled([loadCandles(true), fetchTicker(), loadSparks()]); clearTimeout(hang);
      if (!(cr.status === 'fulfilled' && cr.value)) { connectWS(); if (candles.length) msg = 'Guardado, pero no se pudo actualizar el gráfico: revisa tu conexión'; }
      document.querySelectorAll('iframe').forEach(f => { try { f.contentWindow.postMessage({cct: 'refresh'}, location.origin); } catch {} }); // los gráficos de al lado también
    }
    schedulePine(); scheduleRender(); updateChartHeader();
  } catch (e) { msg = 'No se pudo completar: ' + (e && (e.code || e.message) || 'error'); }
  const left = 1800 - (Date.now() - t0); if (left > 0) await new Promise(r => setTimeout(r, left)); // la animación se ve completa aunque el guardado sea rápido
  btns.forEach(b => { b.classList.remove('syncing'); b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 900); }); forceBusy = false; toast(msg || 'Listo');
}
// saveScriptsLocal está definida arriba (guarda comprimido si no cabe)
document.addEventListener('click', e => { if (e.target.closest('#forceSync')) forceSync(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(pushTimer); cloudPushNow(); } });
window.addEventListener('pagehide', () => { clearTimeout(pushTimer); cloudPushNow(); });
async function initCloud() {
  if (PANE) return;
  renderAccount();
  if (!cloudEnabled) return;
  try {
    const B = 'https://www.gstatic.com/firebasejs/10.12.2/';
    await loadScript(B + 'firebase-app-compat.js');
    await Promise.all([loadScript(B + 'firebase-auth-compat.js'), loadScript(B + 'firebase-firestore-compat.js')]);
    firebase.initializeApp(CFG); auth = firebase.auth(); db = firebase.firestore();
    auth.getRedirectResult().catch(e => toast('No se pudo iniciar sesión: ' + (e.code || e.message)));
    auth.onAuthStateChanged(onUser);
  } catch { syncStatus = 'No se pudo contactar con el servicio de cuentas.'; renderAccount(); }
}

/* ───────── Ancho de los paneles laterales (solo escritorio): arrastrar, doble clic para ocultar ───────── */
(function layoutSplit() {
  const main = document.querySelector('main'), KEY = 'cct_layout_v1', LIM = {wl: [230, 520, 270], side: [260, 680, 310]}; // wl (columna izquierda) ya no se redimensiona: ahora es la barra de dibujo
  let L = {}; try { L = JSON.parse(lsGet(KEY) || '{}') || {}; } catch {}
  const wide = () => window.innerWidth;
  const apply = () => {
    const mx = k => Math.min(LIM[k][1], Math.max(LIM[k][0], wide() * (k === 'wl' ? .4 : .45)));
    main.style.removeProperty('--wl-w'); document.body.classList.remove('wl-off');
    for (const [k, v] of [['side', '--side-w']]) {
      const off = L[k + 'Off'], w = L[k] ? Math.min(mx(k), Math.max(LIM[k][0], L[k])) : null;
      document.body.classList.toggle(k + '-off', !!off);
      if (off) main.style.setProperty(v, '0px'); else if (w) main.style.setProperty(v, w + 'px'); else main.style.removeProperty(v);
    }
    const sl = document.getElementById('splitL'), sr = document.getElementById('splitR');
    sl.classList.toggle('collapsed', !!L.wlOff); sr.classList.toggle('collapsed', !!L.sideOff);
    document.getElementById('splitLBtn').textContent = L.wlOff ? '›' : '‹'; document.getElementById('splitRBtn').textContent = L.sideOff ? '‹' : '›';
    scheduleRender();
  };
  const store = () => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch {} };
  const curW = k => { const el = document.getElementById(k === 'wl' ? 'watchView' : (document.body.dataset.side || 'watchView')); return Math.round(el.getBoundingClientRect().width) || LIM[k][2]; };
  const bind = (id, k) => {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.split-btn') || !isDesktop()) return; e.preventDefault();
      const x0 = e.clientX, w0 = L[k + 'Off'] ? 0 : curW(k); el.setPointerCapture(e.pointerId); el.classList.add('drag');
      const mv = ev => { const d = ev.clientX - x0, w = k === 'wl' ? w0 + d : w0 - d; if (w < 90) { L[k + 'Off'] = true; } else { L[k + 'Off'] = false; L[k] = Math.round(Math.min(LIM[k][1], Math.max(LIM[k][0], w))); } apply(); };
      const up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); store(); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
    const toggle = () => { L[k + 'Off'] = !L[k + 'Off']; store(); apply(); };
    el.addEventListener('dblclick', e => { if (!e.target.closest('.split-btn')) toggle(); });
    el.querySelector('.split-btn').addEventListener('click', toggle);
  };
  bind('splitR', 'side');
  // al cambiar de panel derecho (indicadores / alertas / ajustes) se mantiene el ancho; si estaba oculto, se muestra al elegir una pestaña
  document.querySelectorAll('.right-rail [data-side]').forEach(b => b.addEventListener('click', () => { if (L.sideOff) L.sideOff = false; else if (prevSide === b.dataset.side) L.sideOff = true; else return; store(); apply(); })); // si estaba oculto se muestra; tocar el icono del panel abierto lo oculta
  window.addEventListener('resize', () => { if (isDesktop()) apply(); });
  apply();
})();

/* ───────── Arranque ───────── */
renderFrames(); renderIndicators(); countIndicators(); renderWatch(); updateChartHeader(); buildRail(); updateDrawUI(); renderFavBar(); renderTabs(); theme(); syncFullscreenLabel(); renderScripts(); renderAlerts();
if (isDesktop()) onLayoutChange();
fetchTicker(); loadCandles(); initCloud(); if (!PANE) refreshPop();

/* Solo para pruebas automáticas: se activa añadiendo ?cct_debug=1 a la dirección */
if (/[?&]cct_debug=1/.test(location.search)) window.CCT_DEBUG = {applyState, save, setDrawings, pickTool, get FB() { return FB; }, get FAVS() { return FAVS; }, get state() { return state; }, get drawTool() { return drawTool; }, get geo() { return geo; }, toggleFav, handlesOf, cancelTool, select: id => { selectedId = id; updateDrawUI(); render(); }, get view() { return {pan, visible}; }, getDrawings, hitTest, groupOf, TOOL_GROUPS, ONEPT, THREEPT, MULTI, DOPT, addCopy, isCopy, stdName, sp, calcExtra, scheduleRender, sanStdParams, newTab, switchTab, closeSheet, get ind() { return ind; }, setState: o => { state = o; }, setIbCat: c => { ibCat = c; }};

/* ───────── Puente para el Screener (screener.js) ───────── */
window.CCT_switchView = id => switchView(id);
window.CCT_tzInfo = () => ({tz: PR.tz, clock: PR.clock}); // la zona horaria y el formato de hora elegidos (los usa la barra de eventos económicos)
window.CCT_discordStore = {get: () => state.discord, set: patch => { state.discord = sanDiscord({...state.discord, ...patch, on: {...(state.discord || {}).on, ...(patch.on || {})}, sent: {...(state.discord || {}).sent, ...(patch.sent || {})}}); save(); return state.discord; }};
/* Radar de Nexus Pixel (radar.js): cómo te avisa */
window.CCT_radarHost = {notify(title, body, tag) { if (PR.sound !== 'off') { alertBeep(); try { navigator.vibrate && navigator.vibrate([200, 100, 200, 100, 300]); } catch {} } toast(title); sysNotify('VORTEX · ' + title, body, tag); }, discord: () => !!(PR.n.discord && alDiscordReady())};
window.CCT_host = {
  interval: () => state.interval,
  async top(n) { try { if (!popAll.length) await loadPopTickers(); } catch {} return popAll.slice(0, n).map(t => ({symbol: t.symbol, price: +t.lastPrice, chg: +t.priceChangePercent})); },
  mine() { return state.symbols.map(k => ({symbol: k, name: meta(k)[0], price: +tickers[k]?.lastPrice || 0, chg: +tickers[k]?.priceChangePercent || 0})); }, // lista de Mi seguimiento (cada una con su exchange)
  async klines(sym, itv) { // 1000 velas: más historia = EMA 200 y RMA convergen como en TradingView
    return (await fetchKlinesAny(sym, itv, undefined, 1000)).cs;
  },
  openSignal(sym, itv) { // abre el gráfico de la moneda con Nova Nexus activo para ver la señal
    if (INTERVALS.includes(itv)) state.interval = itv;
    const p = state.pine.find(x => x.sid === 'cat:nova-nexus'); if (p) p.on = true; else if (state.pine.length < 12) state.pine.unshift({sid: 'cat:nova-nexus', on: true, inputs: {}});
    wlAdd(sym);
    renderFrames(); renderIndicators(); countIndicators(); pineKey = ''; schedulePine(); selectSymbol(sym);
  }
};
/* ───────── Nova Bot Lab: ganchos mínimos (historial de velas, guardado en la cuenta y marcadores en el gráfico) ───────── */
window.CCT_bot = {
  key: () => 'cct_botlab_v1' + (uid ? '_' + uid : ''),
  cloud: () => (uid && db && fbUser) ? {get: async () => { const sn = await db.doc(`users/${uid}/data/botlab`).get(); return sn.exists ? (sn.data().items || null) : null; }, set: str => db.doc(`users/${uid}/data/botlab`).set({items: str, updatedAt: firebase.firestore.FieldValue.serverTimestamp()}), server: async () => { const sn = await db.doc(`users/${uid}/data/botlab_server`).get(); if (!sn.exists) return null; const d = sn.data(); return {results: d.results || null, paper: d.paper || null}; }} : null,
  claudio: () => (uid && db && fbUser) ? {cfg: async () => { const sn = await db.doc(`users/${uid}/data/claudio`).get(); return sn.exists ? sn.data() : null; }, setCfg: o => db.doc(`users/${uid}/data/claudio`).set(Object.assign({}, o, {updatedAt: firebase.firestore.FieldValue.serverTimestamp()}), {merge: true}), server: async () => { const sn = await db.doc(`users/${uid}/data/claudio_server`).get(); if (!sn.exists) return null; const d = sn.data(); let s = null; try { s = d.s ? JSON.parse(d.s) : null; } catch {} return {s, summary: d.summary || null, at: d.updatedAt && d.updatedAt.toMillis ? d.updatedAt.toMillis() : null}; }} : null, // Claudio: config (la escribe la app) y sesión (la escribe el servidor)
  chart: () => ({symbol: symOf(state.symbol), interval: state.interval, n: candles.length, from: candles.length ? candles[0].t : null, to: candles.length ? candles[candles.length - 1].t : null}),
  seek(t) { if (!candles.length) return; pan = Math.max(0, Math.round(candles.length - 1 - idxOfTime(t) + visible * .25)); scheduleRender(); },
  async history(sym, itv, count) { // velas CERRADAS de Binance Spot, paginadas hacia atrás (máx. 6000)
    const want = Math.min(6000, Math.max(100, count | 0)), out = []; let end = Date.now();
    while (out.length < want) {
      const raw = await getJSON(`${API}/klines?symbol=${encodeURIComponent(sym)}&interval=${itv}&limit=1000&endTime=${end}`); if (!raw.length) break;
      out.unshift(...raw.map(d => ({t: d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5], ct: d[6]}))); end = raw[0][0] - 1; if (raw.length < 1000) break;
    }
    return out.filter(c => c.ct < Date.now()).slice(-want).map(({ct, ...c}) => c); // se descarta la vela en formación
  },
  marks(m) { botMarks = m; scheduleRender(); },
  open(sym, itv, t) { // muestra el gráfico del bot (y centra la operación si está en las velas cargadas)
    const go = () => { if (t && candles.length) { const i = idxOfTime(t); pan = Math.max(0, Math.round(candles.length - 1 - i - visible / 2)); } scheduleRender(); };
    if (symOf(state.symbol) !== sym || state.interval !== itv) { if (INTERVALS.includes(itv)) state.interval = itv; renderFrames(); selectSymbol(sym); setTimeout(go, 1800); setTimeout(go, 3500); } else { switchView('chartView'); setTimeout(go, 150); }
  },
  scripts: () => scripts.filter(x => x.code && !x.temp).map(x => ({id: x.id, name: x.name, lines: x.lines, own: !x.builtin})).sort((a, b) => b.own - a.own), // indicadores Pine del usuario (solo lectura)
  async runPine(sid, sym, itv, cs) { // ejecuta un indicador del usuario sobre las velas dadas (no toca el gráfico ni sus indicadores)
    const x = scripts.find(y => y.id === sid); if (!x) return {ok: false, error: {msg: 'No encuentro ese indicador'}}; const inst = state.pine.find(p => p.sid === sid);
    return pineRunFull(x.code, {cs, inputs: inst && inst.inputs, interval: itv, symbol: sym, name: x.name, timeLimitMs: 30000, alertCap: 30000, logLabels: true});
  },
  toast: m => toast(m)
};
/* ───────── Ganchos para la pestaña IA (solo lectura del gráfico + motor Pine existente; no cambian nada más) ───────── */
window.CCT_ai = {
  capture(maxW) { // captura JPEG del gráfico tal como se ve (velas, indicadores, dibujos, alertas); null si no hay velas
    if (!candles.length) return null;
    const cv = $('#priceCanvas'), view = $('#chartView'), prev = currentView; if (!cv || !view) return null;
    /* En el celular el gráfico vive en otra pestaña (oculto) y el sistema puede borrar su imagen al salir de la app: antes salía en negro.
       Ahora se vuelve a dibujar en ese momento, fuera de la pantalla, con el tamaño del celular, y se captura. */
    const hidden = !cv.getBoundingClientRect().width, css = view.style.cssText, wasActive = view.classList.contains('active');
    try {
      if (hidden) { view.classList.add('active'); view.style.cssText = css + `;position:fixed!important;left:-10000px!important;top:0!important;width:${Math.max(320, innerWidth)}px!important;height:${Math.max(460, innerHeight - 130)}px!important;visibility:visible!important;pointer-events:none!important;z-index:-1`; }
      currentView = 'chartView'; renderCore();
      if (!cv.width || !cv.height || !cv.getBoundingClientRect().width) return null;
      const k = Math.min(1, (maxW || 1100) / cv.width, (maxW || 1100) * 1.1 / cv.height), w = Math.round(cv.width * k), h = Math.round(cv.height * k), o = document.createElement('canvas'); o.width = w; o.height = h;
      const g2 = o.getContext('2d'), bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#0b0e11'; g2.fillStyle = bg; g2.fillRect(0, 0, w, h); g2.drawImage(cv, 0, 0, w, h);
      return {url: o.toDataURL('image/jpeg', .82), w, h, symbol: symOf(state.symbol), interval: state.interval, at: Date.now()};
    } catch { return null; }
    finally { currentView = prev; if (hidden) { view.style.cssText = css; if (!wasActive) view.classList.remove('active'); } }
  },
  candles: () => candles.slice(),
  async run(code, name) { if (!candles.length) return {ok: false, error: {msg: 'Abre un gráfico y espera a que carguen las velas.'}}; return pineRunFull(code, {interval: state.interval, symbol: symOf(state.symbol), name: name || 'Indicador IA', timeLimitMs: 12000}); },
  msg: (res, code) => pineMsgHtml(res, code),
  list: () => scripts.filter(x => x.ai).map(x => ({id: x.id, name: x.name, code: x.code, temp: !!x.temp, on: state.pine.some(p => p.sid === x.id && p.on)})),
  tryOnChart(code, name, res, replaceId) { // pone el indicador en el gráfico sin guardarlo (temp); reemplaza la prueba anterior
    if (replaceId) this.remove(replaceId, true);
    if (activePine().length >= PINE_MAX) { toast(`Máximo ${PINE_MAX} scripts activos`); return null; }
    const m = code.match(/indicator\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/), sid = 'ai' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
    scripts.push({id: sid, name: (m ? m[1] : name || 'Indicador IA').slice(0, 80), code, size: new Blob([code]).size, lines: code.split('\n').length, addedAt: Date.now(), temp: true, ai: true});
    if (res && res.ok && candles.length) { res._key = `${state.symbol}|${state.interval}|${candles[0].t}`; pineRes[sid] = res; }
    state.pine.push({sid, on: true, inputs: {}}); save(); renderIndicators(); countIndicators(); pineKey = ''; schedulePine(); scheduleRender(); return sid;
  },
  keep(sid) { const x = scripts.find(y => y.id === sid); if (!x) return false; if (scriptsBytes(scripts.filter(y => !y.temp)) + x.size > SCRIPTS_MAX) { toast('Se pasa del límite de scripts por cuenta'); return false; } x.temp = false; saveScripts(); renderScripts(); toast('Indicador guardado'); return true; },
  remove(sid, quiet) { scripts = scripts.filter(y => y.id !== sid); state.pine = state.pine.filter(q => q.sid !== sid); delete pineRes[sid]; save(); if (!quiet) { saveScripts(); renderScripts(); } else renderIndicators(); countIndicators(); scheduleRender(); },
  update(sid, code, res) { // cambia el código de un indicador ya puesto en el gráfico (se ve en vivo); si estaba guardado, se guarda el cambio
    const x = scripts.find(y => y.id === sid); if (!x) return false; const m = code.match(/indicator\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/);
    x.code = code; x.size = new Blob([code]).size; x.lines = code.split('\n').length; if (m) x.name = m[1].slice(0, 80);
    if (res && res.ok && candles.length) { res._key = `${state.symbol}|${state.interval}|${candles[0].t}`; pineRes[sid] = res; } else delete pineRes[sid];
    if (!x.temp) saveScripts(); if (!state.pine.some(p => p.sid === sid)) state.pine.push({sid, on: true, inputs: {}}); else state.pine.find(p => p.sid === sid).on = true;
    save(); renderIndicators(); countIndicators(); if (!x.temp) renderScripts(); pineKey = ''; schedulePine(); scheduleRender(); return true;
  },
  saveConverted(code, name, res, onChart, replaceId) { // lo usa el convertidor: guarda en «Mis indicadores» (cuenta + imagen) y, si funciona, lo pone en el gráfico
    let sid; const old = replaceId && scripts.find(y => y.id === replaceId && !y.builtin);
    if (old) { old.code = code; old.size = new Blob([code]).size; old.lines = code.split('\n').length; old.temp = false; sid = old.id; delete prevStore[sid]; saveScripts(); renderScripts(); setTimeout(() => genPrev(old), 300); }
    else sid = addScript(code, name, true); if (!sid) return null;
    const x = scripts.find(y => y.id === sid); if (x && name && x.name !== name && !/indicator\s*\(/.test(code)) x.name = name;
    if (onChart) {
      if (res && res.ok && candles.length) { res._key = `${state.symbol}|${state.interval}|${candles[0].t}`; pineRes[sid] = res; }
      const ex = state.pine.find(p => p.sid === sid); if (ex) ex.on = true; else if (activePine().length < PINE_MAX) state.pine.push({sid, on: true, inputs: {}}); else toast(`Máximo ${PINE_MAX} scripts activos: se guardó pero no se puso en el gráfico`);
      save(); renderIndicators(); countIndicators(); pineKey = ''; schedulePine(); scheduleRender();
    }
    return sid;
  },
  toggle(sid, on) { const p = state.pine.find(q => q.sid === sid); if (p) p.on = on; else if (on) state.pine.push({sid, on: true, inputs: {}}); save(); renderIndicators(); countIndicators(); pineKey = ''; schedulePine(); scheduleRender(); },
  res: sid => pineRes[sid] || null
};
/* ───────── Instantánea del mercado para el «Brief del día» de la IA (las 25 monedas con más volumen en Binance Spot) ───────── */
window.CCT_getMarketSnapshot = async function (n) {
  try { if (!popAll.length) await loadPopTickers(); } catch {}
  return popAll.slice(0, n || 25).map(t => ({symbol: base(t.symbol), price: +t.lastPrice, chg24h: +t.priceChangePercent, volUsd: +t.quoteVolume}));
};
/* ───────── Contexto para la IA: lo que el usuario ve en el gráfico ───────── */
/* ───────── Puente para NEXUS PIXEL (pixel.js): leer las velas en pantalla, convertir tiempo/precio a píxeles y dibujar en el gráfico ───────── */
window.CCT_pixel = {
  ready: () => !!(geo && candles.length && currentView === 'chartView'),
  visible() { if (!geo || !candles.length) return []; const a = Math.max(0, Math.floor(geo.start)), b = Math.min(candles.length - 1, Math.ceil(geo.end)); return candles.slice(a, b + 1); },
  offset() { const cv = $('#priceCanvas'), ar = $('#chartArea'); if (!cv || !ar) return {x: 0, y: 0}; const r1 = cv.getBoundingClientRect(), r2 = ar.getBoundingClientRect(); return {x: r1.left - r2.left, y: r1.top - r2.top}; },
  toScreen(pt) { if (!geo) return null; const o = this.offset(), q = px(pt); return {x: q.x + o.x, y: q.y + o.y}; }, // en píxeles de #chartArea
  plot() { if (!geo) return null; const o = this.offset(); return {left: geo.left + o.x, top: geo.plotTop + o.y, w: geo.plotW, h: geo.plotH, right: geo.w - geo.right + o.x}; },
  add(ds) { if (!ds || !ds.length) return 0; snapDraw(); setDrawings([...getDrawings(), ...ds.map(d => ({...d, id: newDrawId(), pix: 1}))]); updateDrawUI(); render(); return ds.length; },
  list: () => getDrawings().map((d, i) => ({id: d.id, type: d.type, label: d.label || d.text || '', col: d.col || '', lw: d.lw || 0, ds: d.ds || '', pix: !!d.pix, grp: d.grp || '', p: [d.a, d.b, d.c].filter(Boolean).map(q => q.p), pts: [d.a, d.b, d.c].filter(Boolean).map(q => ({t: q.t, p: q.p})), order: i})), // dibujos del gráfico actual (para que Pixel los edite)
  patch(ids, f) { const set = new Set(ids); if (!set.size) return 0; snapDraw(); let n = 0; setDrawings(getDrawings().map(d => { if (!set.has(d.id)) return d; n++; const o = {...d}; if (f.col) o.col = f.col; if (f.lw) o.lw = f.lw; if (f.ds !== undefined) { if (f.ds) o.ds = f.ds; else delete o.ds; } if (Number.isFinite(f.price) && d.type === 'horizontal') o.a = {...d.a, p: f.price}; if (f.label !== undefined) o.label = f.label; return o; })); updateDrawUI(); render(); return n; },
  remove(ids) { const set = new Set(ids), a = getDrawings(), keep = a.filter(d => !set.has(d.id)); if (keep.length === a.length) return 0; snapDraw(); setDrawings(keep); selectedId = null; updateDrawUI(); render(); return a.length - keep.length; },
    clearMine() { const a = getDrawings(), keep = a.filter(d => !d.pix); if (keep.length === a.length) return 0; snapDraw(); setDrawings(keep); selectedId = null; updateDrawUI(); render(); return a.length - keep.length; },
  symbol: () => symOf(state.symbol), interval: () => state.interval, last: () => candles.length ? candles[candles.length - 1].c : null, fmt: v => fmt(v),
  onChart: () => currentView === 'chartView',
  /* Pixel en TODA la app: en qué sección estás, ir a otra, buscar herramientas, abrir monedas y crear alertas */
  view: () => currentView, desktop: () => isDesktop(), side: () => document.body.dataset.side || 'watchView',
  go(v) { if (isDesktop()) { if (v === 'chartView') return; const b = document.querySelector(`.right-rail [data-side="${v}"]`); if (b) b.click(); else setSide(v); } else { const b = document.querySelector(`.bottom-nav [data-view="${v}"]`); if (b) b.click(); else switchView(v); } },
  tools: () => TOOL_GROUPS.flatMap(gr => gr.tools.map(t => ({k: t[0], t: t[1], d: t[2], g: gr.name, gid: gr.id}))),
  pickTool: k => { switchView('chartView'); pickTool(k); },
  openSymbol(sym, itv) { if (itv && INTERVALS.includes(itv)) { state.interval = itv; renderFrames(); } if (wlAdd(sym)) { save(); renderWatch(); } selectSymbol(sym); },
  async price(sym) { let p = curPrice(sym); if (!Number.isFinite(p)) { try { p = +(await getJSON(`${API}/ticker/price?symbol=${sym}`)).price; } catch {} } return Number.isFinite(p) ? p : null; },
  current: () => symOf(state.symbol), symbols: () => state.symbols.slice(),
  addAlert(f) { // misma lógica que el diálogo de crear alerta
    const a = {id: 'al' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), symbol: f.symbol, on: true, created: Date.now(), firedAt: 0, firedPrice: null, price: f.price, dir: f.dir, note: String(f.note || '').slice(0, 140), notify: ['app', 'discord', 'both'].includes(f.notify) ? f.notify : 'app'};
    if (f.cond === 'up' || f.cond === 'down') a.cond = f.cond; if (f.repeat === 'every') a.repeat = 'every'; if (f.exp > Date.now()) a.exp = f.exp;
    if (!sanAlert(a)) return null; state.alerts.unshift(a); alertPrice[f.symbol] = f.last; save(); renderAlerts(); scheduleRender(); try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch {} return a;
  },
  removeAlert(id) { const n = state.alerts.length; state.alerts = state.alerts.filter(a => a.id !== id); if (state.alerts.length !== n) { save(); renderAlerts(); scheduleRender(); return true; } return false; },
  alerts: () => state.alerts.map(a => ({symbol: a.symbol, price: a.price, dir: a.dir, cond: a.cond, on: a.on, kind: a.kind, label: a.label, note: a.note})),
    cfg: () => sanPixel(state.pixel), opts: PIX_OPT, intervals: () => INTERVALS.slice(),
  setCfg(c) { state.pixel = sanPixel(Object.assign({}, c, {at: Date.now()})); save(); try { window.dispatchEvent(new CustomEvent('cct-pixel-cfg', {detail: state.pixel})); } catch {} return state.pixel; }
};
window.CCT_getAIContext = function () {
  const n = candles.length; if (n < 30) return null;
  const lastV = a => { if (!a) return null; for (let i = a.length - 1; i >= 0; i--) if (a[i] != null && Number.isFinite(a[i])) return a[i]; return null; };
  const active = Object.keys(state.indicators).filter(k => state.indicators[k] && !(state.stdHide && state.stdHide[k]) && !(PLUS_IND.includes(k) && !planOk('proInd'))), values = {}; // solo lo que se VE en el gráfico (lo oculto con el ojito no cuenta)
  const RN = x => x == null || !Number.isFinite(+x) ? null : +(+x).toPrecision(Math.abs(+x) >= 1000 ? 6 : 4); // números cortos para la IA (sin 73.43352000000003)
  if (ind.vwap) values.vwap = lastV(ind.vwap);
  if (ind.stDir) { const d = lastV(ind.stDir); if (d != null) values.supertrend = -d; } // en Supertrend, -1 = alcista
  if (ind.trail && ind.trail.trend) { const t = ind.trail.trend[n - 1]; if (t) values.trailTrend = t; }
  if (ind.stoch) values.stochK = lastV(ind.stoch.k);
  if (ind.obv) values.obvSlope = ind.obv[n - 1] - ind.obv[Math.max(0, n - 21)];
  const zones = {sup: [], res: []};
  if (ind.sr && ind.sr.boxes) for (const b of ind.sr.boxes) { if (b.deleted) continue; (b.kind === 'sup' ? zones.sup : zones.res).push({top: Math.max(b.top, b.bot), bot: Math.min(b.top, b.bot)}); }
  zones.sup = zones.sup.slice(-3); zones.res = zones.res.slice(-3);
  const vp = ind.vp ? {poc: ind.vp.pocPrice, lo: ind.vp.lo, hi: ind.vp.hi} : null;
  const pine = activePine().filter(p => !p.hide).map(p => { const r = pineRes[p.sid], sc = scripts.find(x => x.id === p.sid); if (!r || !r.ok) return null;
    const plots = (r.plots || []).slice(0, 8).map(pl => ({title: String(pl.title || '').slice(0, 30), value: RN(lastV(pl.values))}));
    const table = []; for (const t of (r.tables || []).slice(0, 3)) { const rows = {}; for (const c of t.cells || []) { if (c.text == null || String(c.text).trim() === '') continue; (rows[c.r] = rows[c.r] || []).push(String(c.text).replace(/\s+/g, ' ').trim().slice(0, 40)); } Object.keys(rows).sort((a, b) => a - b).slice(0, 14).forEach(k => table.push(rows[k].join(': '))); }
    return {name: String((sc && sc.name) || (r.meta && r.meta.title) || 'Script').slice(0, 40), plots, table};
  }).filter(Boolean).slice(0, 6);
  let nova = null; // lectura de Nova Nexus (nube EMA, oscilador, flujo, ADX, señal IA, SMC) calculada siempre, aunque los módulos no estén encendidos
  try {
    if (window.NovaNexus && n >= 60 && activePine().some(p => !p.hide && /^cat:nova-(nexus|sig)$/.test(p.sid))) { // solo si tienes Nova Nexus visible en el gráfico
      const NP = novaP, r = NovaNexus.compute(candles, {smc: true, emaLen: NP('emaLen'), emaMult: NP('emaMult'), minScore: NP('minScore'), cooldown: NP('cooldown'), cdBoth: NP('cdBoth'), slMult: NP('slMult'), tp1Mult: NP('tp1'), tp2Mult: NP('tp2'), tp3Mult: NP('tp3'), tpBars: NP('tpBars'), smcOpts: {mslen: NP('smcLen'), window: NP('smcWindow'), swingLimit: NP('smcSwing'), sweep: NP('smcSweep'), oblast: NP('obLast'), obmiti: NP('obMiti')}}), i = n - 1, sg = r.last;
      nova = {base: RN(lastV(r.emaBase)), top: RN(lastV(r.emaTop)), bot: RN(lastV(r.emaBot)), osc: RN(lastV(r.osc)), sig: null, flux: RN(lastV(r.flux)), adx: RN(lastV(r.adx)), ema200: RN(lastV(r.ema200)), smcTrend: r.smc ? r.smc.trend : 0,
        last: sg ? {side: sg.side, score: sg.score, div: !!sg.div, ago: i - sg.i, price: sg.price, sl: sg.sl, tp1: sg.tp1, tp2: sg.tp2, tp3: sg.tp3} : null};
      if (r.osc && n >= 4) { const a = r.osc.slice(-3).filter(Number.isFinite); if (a.length === 3) nova.sig = a[0] / 3 + a[1] / 3 + a[2] / 3; } // media de 3 del oscilador = línea de señal
    }
  } catch (e) { nova = null; }
  /* Lecturas de TODOS los indicadores activos (EMA, SMA, Bollinger, RSI, MACD, Estocástico, ADX, Ichimoku…): la IA las usa para comentar
     cada uno con su valor, pendiente, posición del precio y último cruce (antes solo recibía unos cuantos y no veía la EMA, por ejemplo). */
  const lecturas = {}; let visible = null, dibujos = [];
  try {
    const px = candles[n - 1].c, R = RN;
    const at = (a, k) => { const i = a.length - 1 - k; return i >= 0 ? a[i] : null; };
    const lastCross = (a, b, look = 60) => { for (let i = a.length - 1, m = Math.max(1, a.length - look); i >= m; i--) { const x0 = a[i - 1], y0 = typeof b === 'function' ? b(i - 1) : b[i - 1], x1 = a[i], y1 = typeof b === 'function' ? b(i) : b[i]; if ([x0, y0, x1, y1].every(Number.isFinite) && Math.sign(x0 - y0) !== Math.sign(x1 - y1)) return {hace_velas: a.length - 1 - i, tipo: x1 > y1 ? 'cruzó hacia ARRIBA' : 'cruzó hacia ABAJO'}; } return null; };
    const serie = a => { if (!Array.isArray(a) || !a.length || !a.some(Number.isFinite)) return null; const v = at(a, 0); if (!Number.isFinite(v)) return null; const v5 = at(a, 5), vis = a.slice(-120).filter(Number.isFinite);
      const o = {ultimo: R(v), hace_1: R(at(a, 1)), hace_5: R(v5), hace_20: R(at(a, 20)), pendiente: Number.isFinite(v5) ? (v > v5 * 1.0005 ? 'sube' : v < v5 * .9995 ? 'baja' : 'plana') : null, max_120: R(Math.max(...vis)), min_120: R(Math.min(...vis))};
      if (v > 0 && px / v > .5 && px / v < 2) { o.precio_vs_linea = (px >= v ? 'precio ARRIBA ' : 'precio ABAJO ') + Math.abs((px / v - 1) * 100).toFixed(2) + '%'; const cr = lastCross(candles.map(k => k.c), a); if (cr) o.ultimo_cruce_del_precio = cr; }
      return o; };
    const objeto = ob => { const out = {}, arrs = Object.entries(ob).filter(([, v]) => Array.isArray(v) && v.some(Number.isFinite)); for (const [k, v] of arrs.slice(0, 6)) { const sr = serie(v); if (sr) out[k] = sr; } if (arrs.length >= 2) { const cr = lastCross(arrs[0][1], arrs[1][1]); if (cr) out['cruce_' + arrs[0][0] + '_vs_' + arrs[1][0]] = cr; } return Object.keys(out).length ? out : null; };
    const SRC = {ema20: ind.ema20, ema50: ind.ema50, sma200: ind.sma200, wma20: ind.wma20, bollinger: ind.bbU ? {superior: ind.bbU, media: ind.bbU.map((u, i) => u == null || ind.bbL[i] == null ? null : (u + ind.bbL[i]) / 2), inferior: ind.bbL} : null, vwap: ind.vwap, supertrend: ind.stDir ? {linea: ind.stDir.map((d, i) => d < 0 ? ind.stUp && ind.stUp[i] : ind.stDn && ind.stDn[i])} : null, rsi: ind.rsi,
      macd: ind.macd, stoch: ind.stoch, atr: ind.atr, obv: ind.obv, adx: ind.adx, cci: ind.cci, willr: ind.willr, mfi: ind.mfi, roc: ind.roc, stochrsi: ind.stochrsi, ao: ind.ao, cmf: ind.cmf, donchian: ind.donchian, keltner: ind.keltner, ichimoku: ind.ichimoku, psar: ind.psar};
    for (const k of active) {
      const v = SRC[k]; let r = null; if (!v) continue;
      r = Array.isArray(v) ? (typeof v[0] === 'object' && v[0] && !Array.isArray(v[0]) ? null : serie(v)) : typeof v === 'object' ? objeto(v) : null;
      if (k === 'rsi' && r) r.zona = r.ultimo >= 70 ? 'SOBRECOMPRA (≥70)' : r.ultimo <= 30 ? 'SOBREVENTA (≤30)' : 'neutral (30-70)';
      if (k === 'bollinger' && r && r.superior && r.inferior) { const u = r.superior.ultimo, l = r.inferior.ultimo; r.posicion_precio_en_bandas_pct = R((px - l) / ((u - l) || 1) * 100); r.ancho_pct = R((u - l) / px * 100); }
      if (k === 'supertrend' && ind.stDir) r = Object.assign(r || {}, {tendencia: ind.stDir[n - 1] < 0 ? 'ALCISTA' : 'BAJISTA'});
      if (r) lecturas[(typeof stdName === 'function' ? stdName(k) : k) + (state.stdHide && state.stdHide[k] ? ' (oculto)' : '')] = r;
    }
    if (active.includes('ema20') && active.includes('ema50') && ind.ema20 && ind.ema50) { const cr = lastCross(ind.ema20, ind.ema50, 200); lecturas['Cruce ' + stdName('ema20') + ' / ' + stdName('ema50')] = {rapida_sobre_lenta: ind.ema20[n - 1] > ind.ema50[n - 1], ultimo_cruce: cr}; }
    if (active.includes('volume')) { const vs = candles.slice(-21, -1).map(k => k.v), avg = vs.reduce((a, b) => a + b, 0) / (vs.length || 1); lecturas['Volumen'] = {ultima_vela: R(candles[n - 1].v), promedio_20: R(avg), relacion: R(candles[n - 1].v / (avg || 1))}; }
    if (geo) { const a = Math.max(0, Math.floor(geo.start)), b = Math.min(n - 1, Math.ceil(geo.end)), cs = candles.slice(a, b + 1); if (cs.length) visible = {velas_en_pantalla: cs.length, desde: new Date(cs[0].t).toISOString(), maximo: R(Math.max(...cs.map(k => k.h))), minimo: R(Math.min(...cs.map(k => k.l))), cambio_pct: R((cs[cs.length - 1].c / cs[0].o - 1) * 100)}; }
    dibujos = getDrawings().filter(d => !d.hide).slice(-20).map(d => ({tipo: d.type, etiqueta: d.label || d.text || undefined, precios: [d.a, d.b, d.c].filter(Boolean).map(q => R(q.p)), de_nexus_pixel: d.pix ? true : undefined}));
  } catch (e) {}
  const tk = tickers[state.symbol];
  return {lecturas, visible, dibujos, nova, symbol: symOf(state.symbol), exchange: exName(state.symbol), interval: state.interval, candles: candles.slice(-400).map(c => ({t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v})), change24h: tk ? Number(tk.priceChangePercent) : null, active, values, zones, vp, pine};
};
/* ───────── Divisiones: de 1 a 5 gráficos ─────────
   Cada gráfico extra es la misma app dentro de un iframe (con su propio activo, temporalidad e indicadores). 3, 4 y 5 gráficos solo en pantallas anchas. */
const LR = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.6"/>`;
const LAYOUTS = [
  ['1', 'Un gráfico', LR(4, 5, 16, 14)],
  ['2v', 'Dos · lado a lado', LR(3.5, 5, 7.5, 14) + LR(13, 5, 7.5, 14)],
  ['2h', 'Dos · arriba y abajo', LR(4, 3.5, 16, 7.5) + LR(4, 13, 16, 7.5)],
  ['3', 'Tres · uno grande y dos', LR(3.5, 4.5, 9, 15) + LR(14.5, 4.5, 6, 6.8) + LR(14.5, 12.7, 6, 6.8)],
  ['4', 'Cuatro · cuadrícula', LR(3.5, 3.5, 8, 8) + LR(12.5, 3.5, 8, 8) + LR(3.5, 12.5, 8, 8) + LR(12.5, 12.5, 8, 8)],
  ['5', 'Cinco · dos arriba y tres abajo', LR(3, 3.5, 8.6, 8) + LR(12.4, 3.5, 8.6, 8) + LR(3, 12.5, 5.4, 8) + LR(9.3, 12.5, 5.4, 8) + LR(15.6, 12.5, 5.4, 8)]
];
const LAY_PANES = {'1': 0, '2v': 1, '2h': 1, '3': 2, '4': 3, '5': 4}, LAY_ICON = id => SV((LAYOUTS.find(l => l[0] === id) || LAYOUTS[0])[2], 16);
const effLayout = () => state.layout !== '1' && innerWidth < 1024 ? '2h' : state.layout; // en pantalla angosta solo caben uno arriba y otro abajo
function paneSrc(n) {
  const order = state.symbol === 'ETHUSDT' ? ['BTCUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'] : ['ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'BTCUSDT'];
  const sym = order.filter(x => x !== state.symbol)[n - 2] || 'BTCUSDT';
  return `index.html?pane=${n}&sym=${encodeURIComponent(sym)}&light=${state.light ? 1 : 0}`;
}
function applyLayout() {
  if (PANE) return;
  const eff = effLayout(), need = LAY_PANES[eff] || 0;
  document.body.dataset.lay = eff;
  document.body.classList.toggle('split', eff !== '1'); document.body.classList.toggle('split-v', eff === '2v'); document.body.classList.toggle('split-h', eff === '2h');
  for (const k of ['3', '4', '5']) document.body.classList.toggle('split-' + k, eff === k);
  for (let n = 2; n <= 5; n++) {
    let fr = $('#pane' + n);
    if (n - 1 > need) { if (fr) fr.remove(); continue; }
    if (!fr) { fr = document.createElement('iframe'); fr.id = 'pane' + n; fr.className = 'pane-fr'; fr.title = 'Gráfico ' + n; fr.src = paneSrc(n); fr.allow = 'fullscreen'; $('main').appendChild(fr); }
  }
  const b = $('#layoutBtn'); if (b) b.innerHTML = LAY_ICON(state.layout) + ' Diseño';
  requestAnimationFrame(() => { render(); window.dispatchEvent(new Event('resize')); });
}
function pushPaneTheme() { document.querySelectorAll('.pane-fr').forEach(fr => { if (fr.contentWindow) { try { fr.contentWindow.postMessage({cct: 'light', light: !!state.light}, location.origin); } catch {} } }); }
if (PANE) {
  window.addEventListener('message', e => { if (e.origin !== location.origin || !e.data || e.data.cct !== 'light') return; state.light = !!e.data.light; theme(); });
  switchView('chartView');
} else {
  if (uid && !isDesktop()) switchView('chartView'); // con la sesión iniciada, la app siempre abre en el gráfico (sin sesión sale la ventana para iniciar sesión)
  $('#layoutBtn').onclick = e => {
    e.stopPropagation(); const old = $('#layoutMenu'); if (old) { old.remove(); return; }
    const m = document.createElement('div'); m.id = 'layoutMenu'; m.className = 'pop-menu';
    m.innerHTML = LAYOUTS.filter(l => !(l[0] === '2v' && innerWidth < 700) && !(['3', '4', '5'].includes(l[0]) && innerWidth < 1024)).map(l => `<button data-ly="${l[0]}" class="${state.layout === l[0] ? 'on' : ''}"><span>${LAY_ICON(l[0])}</span>${l[1]}</button>`).join('');
    const r = e.currentTarget.getBoundingClientRect(); document.body.appendChild(m);
    m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + 'px'; m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6) + 'px';
    m.onclick = ev => { const k = ev.target.closest('[data-ly]'); if (!k) return; state.layout = layoutNow = k.dataset.ly; try { localStorage.setItem(LAY_KEY, state.layout); } catch {} save(); applyLayout(); m.remove(); };
    setTimeout(() => document.addEventListener('click', function f() { m.remove(); document.removeEventListener('click', f); }), 0);
  };
  window.addEventListener('resize', () => { if (document.body.dataset.lay !== effLayout()) applyLayout(); });
  layoutNow = state.layout; applyLayout();
}
setInterval(fetchTicker, 30000);
setInterval(() => { if (!document.hidden && !PANE) refreshPop(); }, 120000);
setInterval(() => { if (!document.hidden) checkAlertsPoll(); }, 10000);
setInterval(movePoll, 15000); setTimeout(movePoll, 3000);
setInterval(() => { if (currentView === 'chartView' && !wsOpen && candles.length && !document.hidden) loadCandles(true); }, 20000);
})();

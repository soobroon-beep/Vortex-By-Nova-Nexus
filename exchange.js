/* VORTEX · Tu exchange conectado (una sola vez para toda la app).
   Eliges tu exchange de la lista (todos los que soporta CCXT: BingX, Binance, Bybit, OKX, Bitget, KuCoin, Gate, MEXC…), pegas tu API Key una vez
   y la usan el saldo de la cuenta, Operar desde el gráfico (si permites operar en vivo) y Nexus Lens (BingX).
   La firma de cada consulta se calcula EN TU DISPOSITIVO con CCXT; el Worker «vortex-exchange» solo la reenvía (los exchanges bloquean CORS).
   Las claves se guardan en este dispositivo y, si iniciaste sesión, en tu cuenta (documento privado que solo tú puedes leer). */
(function (root) {
  'use strict';
  const CCXT_URL = 'https://cdn.jsdelivr.net/npm/ccxt@4.5.92/dist/ccxt.browser.min.js';
  const PROXY = 'https://vortex-exchange.soobroon.workers.dev/?';
  const LS = 'cct_exchange_v1', DOC = 'exchanges';
  const FEATURED = [['bingx', 'BingX'], ['binance', 'Binance'], ['bybit', 'Bybit'], ['okx', 'OKX'], ['bitget', 'Bitget'], ['kucoin', 'KuCoin'], ['gate', 'Gate'], ['mexc', 'MEXC'], ['htx', 'HTX'], ['kraken', 'Kraken'], ['coinbase', 'Coinbase'], ['bitmart', 'BitMart'], ['cryptocom', 'Crypto.com'], ['bitfinex', 'Bitfinex'], ['phemex', 'Phemex'], ['hyperliquid', 'Hyperliquid'], ['woo', 'WOO X'], ['deribit', 'Deribit'], ['blofin', 'BloFin'], ['lbank', 'LBank']];
  const NAME = Object.fromEntries(FEATURED);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const toast = m => { if (root.CCT_toast) root.CCT_toast(m); };
  const svg = (p, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const load = () => { try { const o = JSON.parse(localStorage.getItem(LS) || 'null'); return o && o.id && o.apiKey ? o : null; } catch { return null; } };
  let cfg = load(), ex = null, ccxtP = null, snap = {equity: NaN, free: NaN, positions: [], orders: [], at: 0, err: ''}, subs = [], pollT = 0, busy = false, busyAt = 0, soonT = 0, soonAt = 0, cloudUid = '';
  const storeLocal = () => { try { if (cfg) localStorage.setItem(LS, JSON.stringify(cfg)); else localStorage.removeItem(LS); } catch {} };
  const nameOf = id => NAME[id] || (ex && ex.id === id && ex.name) || (root.ccxt && root.ccxt[id] && (root.ccxt[id].prototype && root.ccxt[id].prototype.name)) || (id.charAt(0).toUpperCase() + id.slice(1));

  function loadCcxt() {
    if (root.ccxt) return Promise.resolve(root.ccxt);
    if (ccxtP) return ccxtP;
    ccxtP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = CCXT_URL; s.async = true; s.onload = () => root.ccxt ? res(root.ccxt) : rej(new Error('CCXT no cargó')); s.onerror = () => { ccxtP = null; rej(new Error('No se pudo descargar el conector de exchanges (¿sin internet o bloqueador?)')); }; document.head.appendChild(s); });
    return ccxtP;
  }
  async function make(c) {
    const X = await loadCcxt(); if (!X[c.id]) throw new Error('Exchange no disponible: ' + c.id);
    const e = new X[c.id]({apiKey: c.apiKey, secret: c.secret, password: c.password || undefined, uid: c.uid || undefined, enableRateLimit: true, options: {defaultType: c.market === 'spot' ? 'spot' : 'swap', adjustForTimeDifference: true}});
    e.proxyUrl = PROXY; return e;
  }
  const emit = () => { for (const f of subs) try { f(snap, cfg); } catch {} };
  const num = v => { v = +v; return Number.isFinite(v) ? v : NaN; };

  /* Saldo, posiciones y órdenes abiertas (para el saldo de la cuenta y el panel Operar en modo real) */
  async function refresh() {
    if (!cfg || (busy && Date.now() - busyAt < 30000)) return snap; busy = true; busyAt = Date.now(); const my = busyAt; // si una lectura se colgó más de 30 s, ya no bloquea las siguientes
    try { const r = await Promise.race([read(), new Promise((_, no) => setTimeout(() => no(new Error('El exchange tardó demasiado en responder')), 25000))]); if (busyAt === my) snap = r; }
    catch (e) { snap = Object.assign({}, snap, {err: errText(e), at: Date.now()}); }
    finally { if (busyAt === my) busy = false; }
    emit(); return snap;
  }
  async function read() {
    {
      if (!ex) ex = await make(cfg);
      const bal = await ex.fetchBalance(), q = ['USDT', 'USDC', 'USD'].find(k => bal.total && Number.isFinite(+bal.total[k]) && +bal.total[k] > 0) || 'USDT';
      let positions = [], orders = [];
      let posErr = '';
      if (cfg.market !== 'spot' && ex.has.fetchPositions) { // posiciones abiertas (si una forma falla, se intenta otra y se muestra el motivo)
        const live = p => Math.abs(num(p.contracts)) > 0 || Math.abs(num(p.info && (p.info.positionAmt || p.info.availableAmt || p.info.size || p.info.pos))) > 0;
        for (const args of [[], [undefined, {type: 'swap'}], [undefined, {subType: 'linear'}]]) { try { positions = (await ex.fetchPositions(...args)).filter(live); posErr = ''; break; } catch (e) { posErr = errText(e); } }
      }
      if (ex.has.fetchOpenOrders) { try { orders = await ex.fetchOpenOrders(); } catch (e) { try { orders = await ex.fetchOpenOrders(undefined, undefined, undefined, {type: cfg.market === 'spot' ? 'spot' : 'swap'}); } catch {} } }
      if (cfg.market !== 'spot' && ex.has.fetchOpenOrders) { try { const tr = await ex.fetchOpenOrders(undefined, undefined, undefined, {stop: true, trigger: true}); for (const o of tr || []) if (!orders.some(x => x.id === o.id)) orders.push(o); } catch {} } // órdenes condicionales (TP/SL)
      const upnl = positions.reduce((a, p) => a + (num(p.unrealizedPnl) || 0), 0), info = bal.info || {}, bxEq = num(info.data && info.data.balance && info.data.balance.equity);
      return {equity: Number.isFinite(bxEq) ? bxEq : num(bal.total && bal.total[q]) + (cfg.market !== 'spot' ? upnl : 0), free: num(bal.free && bal.free[q]), quote: q, positions, orders, posErr, at: Date.now(), err: ''};
    }
  }
  /* El mensaje exacto del exchange (código + texto) para saber qué arreglar */
  function rawOf(e) { const m = String(e && e.message || e); const j = m.match(/\{.*\}/); if (j) { try { const o = JSON.parse(j[0]); const c = o.code ?? o.retCode ?? o.ret_code, t = o.msg ?? o.retMsg ?? o.message ?? o.ret_msg; if (c != null || t) return `${c != null ? 'código ' + c + ': ' : ''}${t || ''}`.slice(0, 160); } catch {} } return m.replace(/^[a-z]+ /, '').slice(0, 160); }
  function tradeErr(e) { // al operar: la lectura ya funcionó, así que casi siempre es un permiso de la API
    const m = String(e && e.message || e), raw = rawOf(e), auth = /AuthenticationError|PermissionDenied|Invalid API|-2015|-2014|permission|10005|50120|40014/i.test((e && e.constructor && e.constructor.name) + ' ' + m);
    if (!auth) return errText(e) + (raw && !errText(e).includes(raw) ? ` (${raw})` : '');
    const tip = {binance: cfg.market === 'spot' ? 'En Binance › Gestión de API, edita la clave y activa «Habilitar trading spot y de margen».' : 'En Binance › Gestión de API, edita la clave y activa «Habilitar futuros» (tu cuenta de Futuros debe estar abierta ANTES de crear la clave; si es más vieja, crea una nueva).', bybit: 'En Bybit › API, dale permiso de «Contratos/Órdenes» (o Spot) a la clave.', bingx: /created without the permission|100004/i.test(raw) ? 'BingX no deja agregar ese permiso a una clave que ya existe: crea una API Key NUEVA en BingX › Gestión de API marcando «Trading de futuros perpetuos» (sin retiros) y pégala en Conectar exchange.' : 'En BingX › Gestión de API, activa «Trading de futuros perpetuos» (o Spot).', okx: 'En OKX › API, dale permiso «Trade» a la clave.', bitget: 'En Bitget › API, activa el permiso de trading de Futuros/Spot.'}[cfg.id] || 'En tu exchange, dale permiso de trading (Futuros o Spot) a la API Key.';
    return `Tu API Key lee bien pero ${nameOf(cfg.id)} no la deja operar. ${tip} (${raw})`;
  }
  function errText(e) {
    const m = String(e && e.message || e);
    if (/AuthenticationError|Invalid API|signature|apikey|api-key|API key|40001|10001|-2015|-2014/i.test((e && e.constructor && e.constructor.name) + ' ' + m)) return 'El exchange rechazó tu API Key: revisa la clave, el secret (y passphrase si tu exchange la pide) y los permisos.';
    if (/451|restricted location|not available in your region|CloudFront/i.test(m)) return 'El exchange bloquea la región del servidor puente. Prueba más tarde o con otro exchange.';
    if (/Failed to fetch|NetworkError|vortex-exchange/i.test(m)) return 'Sin conexión con el puente de exchanges. Si es la primera vez, puede que aún se esté publicando.';
    return m.replace(/^[a-z]+ /, '').slice(0, 220);
  }
  /* Lectura periódica: cada 8 s si tienes posiciones u órdenes abiertas (para que al cerrarse se quiten sus líneas enseguida) y cada 60 s si no */
  function startPoll() {
    clearTimeout(pollT); if (!cfg) return;
    const loop = async () => { if (!cfg) return; if (document.visibilityState === 'visible') await refresh(); const live = (snap.positions || []).length || (snap.orders || []).length; pollT = setTimeout(loop, live ? 8000 : 60000); };
    pollT = setTimeout(loop, 400);
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && cfg) refreshSoon(); });
  /* Lectura extra pronto (se junta si se pide varias veces): al tocar el precio un TP, SL o la liquidación, o justo después de operar */
  function refreshSoon(ms = 600) { if (!cfg) return; const at = Date.now() + ms; if (soonT && soonAt <= at) return; clearTimeout(soonT); soonAt = at; soonT = setTimeout(() => { soonT = 0; refresh(); }, ms); }
  const burst = () => { refreshSoon(800); setTimeout(() => refreshSoon(0), 3000); setTimeout(() => refreshSoon(0), 8000); }; // el exchange tarda unos segundos en reflejar el cierre

  /* ───────── Operar en vivo (solo si lo permitiste al conectar) ───────── */
  const pair = s => { const sp = root.CCT_split ? root.CCT_split(s) : [String(s).replace(/USDT$/, ''), 'USDT']; return [sp[0], sp[1] || 'USDT']; };
  async function symOf(s) {
    if (!ex) ex = await make(cfg); await ex.loadMarkets();
    const [b, q] = pair(s), cands = cfg.market === 'spot' ? [`${b}/${q}`] : [`${b}/${q}:${q}`, `${b}/USDT:USDT`, `1000${b}/${q}:${q}`];
    const m = cands.find(k => ex.markets[k]); if (!m) throw new Error(`${b}/${q} no existe en ${nameOf(cfg.id)} (${cfg.market === 'spot' ? 'spot' : 'perpetuos'})`); return m;
  }
  const hedgeErr = e => /position ?side|hedge|positionSide|dual|one-way|oneway|mode/i.test(String(e && e.message || e));
  async function order(o) { // o: {sym, side: 1|-1, type: market|limit|stop, qty, price, lev, tp, sl}
    if (!canTrade()) throw new Error('Activa «Permitir operar en vivo» en tu exchange conectado');
    const m = await symOf(o.sym), side = o.side > 0 ? 'buy' : 'sell', amount = +ex.amountToPrecision(m, o.qty);
    if (!(amount > 0)) throw new Error('El tamaño es menor que el mínimo del exchange');
    if (cfg.market !== 'spot' && o.lev && ex.has.setLeverage) { try { await ex.setLeverage(o.lev, m); } catch {} }
    const p = {}; if (o.tp > 0) p.takeProfit = {triggerPrice: +ex.priceToPrecision(m, o.tp)}; if (o.sl > 0) p.stopLoss = {triggerPrice: +ex.priceToPrecision(m, o.sl)};
    let type = o.type === 'limit' ? 'limit' : 'market', price = o.type === 'limit' ? +ex.priceToPrecision(m, o.price) : undefined;
    if (o.type === 'stop') p.triggerPrice = +ex.priceToPrecision(m, o.price);
    let r; try { r = await ex.createOrder(m, type, side, amount, price, p); }
    catch (e) { if (cfg.market === 'spot' || !hedgeErr(e)) throw new Error(tradeErr(e)); r = await ex.createOrder(m, type, side, amount, price, Object.assign({}, p, {positionSide: o.side > 0 ? 'LONG' : 'SHORT', hedged: true})).catch(e2 => { throw new Error(tradeErr(e2)); }); }
    burst(); return r;
  }
  async function closePosition(pos, frac = 1) {
    if (!canTrade()) throw new Error('Activa «Permitir operar en vivo»');
    if (!ex) ex = await make(cfg); await ex.loadMarkets();
    const long = String(pos.side).toLowerCase() === 'long', amount = +ex.amountToPrecision(pos.symbol, Math.abs(num(pos.contracts)) * frac), side = long ? 'sell' : 'buy';
    try { await ex.createOrder(pos.symbol, 'market', side, amount, undefined, {reduceOnly: true}); }
    catch (e) { if (!hedgeErr(e)) throw new Error(tradeErr(e)); await ex.createOrder(pos.symbol, 'market', side, amount, undefined, {positionSide: long ? 'LONG' : 'SHORT', hedged: true}).catch(e2 => { throw new Error(tradeErr(e2)); }); }
    burst();
  }
  /* TP y SL de una posición real: se leen de sus órdenes condicionales y se cambian desde el gráfico */
  const trig = o => num(o.triggerPrice || o.stopPrice || o.takeProfitPrice || o.stopLossPrice || (o.info && (o.info.stopPrice || o.info.triggerPrice)));
  const baseOf = s => String(s || '').split(/[/:]/)[0].replace(/^1000/, '');
  function protections(pos) {
    const long = String(pos.side).toLowerCase() === 'long', e = num(pos.entryPrice), out = {tp: null, sl: null};
    for (const o of snap.orders || []) {
      if (o.symbol !== pos.symbol) continue; const t = trig(o); if (!(t > 0)) continue; const closes = (o.side === 'sell') === long; if (!closes) continue;
      const k = /take|profit/i.test(String(o.type) + JSON.stringify(o.info || {}).slice(0, 300)) ? 'tp' : /stop|loss/i.test(String(o.type)) && !/take/i.test(String(o.type)) ? 'sl' : ((t > e) === long ? 'tp' : 'sl');
      if (!out[k]) out[k] = {id: o.id, price: t, o};
    }
    return out;
  }
  async function setTpSl(pos, kind, price) {
    if (!canTrade()) throw new Error('Activa «Permitir operar en vivo» en tu exchange conectado');
    if (!ex) ex = await make(cfg); await ex.loadMarkets();
    const long = String(pos.side).toLowerCase() === 'long', prev = protections(pos)[kind], amount = +ex.amountToPrecision(pos.symbol, Math.abs(num(pos.contracts))), p = +ex.priceToPrecision(pos.symbol, price), side = long ? 'sell' : 'buy';
    const base = kind === 'tp' ? {takeProfitPrice: p} : {stopLossPrice: p};
    try { await ex.createOrder(pos.symbol, 'market', side, amount, undefined, Object.assign({reduceOnly: true}, base)); }
    catch (e) { if (!hedgeErr(e)) throw new Error(tradeErr(e)); await ex.createOrder(pos.symbol, 'market', side, amount, undefined, Object.assign({positionSide: long ? 'LONG' : 'SHORT', hedged: true}, base)).catch(e2 => { throw new Error(tradeErr(e2)); }); }
    if (prev) { try { await ex.cancelOrder(prev.id, pos.symbol, {stop: true, trigger: true}); } catch { try { await ex.cancelOrder(prev.id, pos.symbol); } catch {} } } // se quita el anterior DESPUÉS de poner el nuevo (nunca queda sin protección)
    burst();
  }
  async function removeTpSl(pos, kind) { const prev = protections(pos)[kind]; if (!prev) return; if (!ex) ex = await make(cfg); try { await ex.cancelOrder(prev.id, pos.symbol, {stop: true, trigger: true}); } catch (e) { try { await ex.cancelOrder(prev.id, pos.symbol); } catch (e2) { throw new Error(tradeErr(e2)); } } burst(); }
  async function cancel(o) { if (!ex) ex = await make(cfg); try { await ex.cancelOrder(o.id, o.symbol); } catch (e) { throw new Error(tradeErr(e)); } burst(); }
  const canTrade = () => !!(cfg && cfg.trade);

  /* ───────── Guardado: dispositivo + cuenta ───────── */
  async function cloudSave() { const C = root.CCTCloudPriv; if (!C || !C.ready()) return false; try { await C.set(DOC, cfg ? {cfg: JSON.stringify(cfg), at: Date.now()} : {cfg: '', at: Date.now()}); return true; } catch { return false; } }
  async function cloudSync(uid) { // al iniciar sesión: si tu cuenta ya tiene un exchange guardado, se usa aquí sin volver a pedirlo
    const C = root.CCTCloudPriv; if (!C || !C.ready() || !uid || cloudUid === uid) return; cloudUid = uid;
    try {
      const d = await C.get(DOC); let rc = null; try { rc = d && d.cfg ? JSON.parse(d.cfg) : null; } catch {}
      if (rc && rc.id && rc.apiKey && (!cfg || (rc.at || 0) >= (cfg.at || 0))) { const same = cfg && cfg.id === rc.id && cfg.apiKey === rc.apiKey; cfg = rc; storeLocal(); ex = null; if (!same) { lensLink(); toast(`${nameOf(cfg.id)} conectado desde tu cuenta`); } startPoll(); paint(); }
      else if (cfg && (!rc || (cfg.at || 0) > (rc.at || 0))) cloudSave();
    } catch {}
  }
  /* Nexus Lens (BingX) usa la misma clave: se le escribe en su almacenamiento y se recarga si estaba abierto */
  function lensLink() {
    if (!cfg || cfg.id !== 'bingx' || !root.indexedDB) return;
    try {
      const rq = indexedDB.open('nova_nexus', 1); rq.onupgradeneeded = e => e.target.result.createObjectStore('config');
      rq.onsuccess = e => { const db = e.target.result, tx = db.transaction('config', 'readwrite'), st = tx.objectStore('config'); st.put(cfg.apiKey, 'bx_k'); st.put(cfg.secret, 'bx_s'); tx.oncomplete = () => { const f = document.getElementById('lensFrame'); if (f && f.src) try { f.contentWindow.location.reload(); } catch {} }; };
    } catch {}
  }

  /* Permisos reales de la clave (Binance los informa): para avisar ANTES de intentar operar */
  let perms = null;
  async function checkPerms() {
    perms = null; if (!cfg || cfg.id !== 'binance') return null;
    try { if (!ex) ex = await make(cfg); const r = await ex.sapiGetAccountApiRestrictions(); perms = {futures: !!r.enableFutures, spot: !!r.enableSpotAndMarginTrading, ip: !!r.ipRestrict}; } catch {}
    return perms;
  }
  const permWarn = () => { if (!perms || !cfg || !cfg.trade) return ''; const need = cfg.market === 'spot' ? perms.spot : perms.futures; if (need) return ''; return cfg.market === 'spot' ? 'Tu clave de Binance no tiene «Habilitar trading spot y de margen»: puede leer pero no operar.' : 'Tu clave de Binance no tiene «Habilitar futuros»: puede leer pero no operar. Edítala en Binance › Gestión de API (si tu cuenta de Futuros se abrió después de crear la clave, crea una nueva).' + (perms.ip ? '' : ' Si Binance te pide restringir por IP para activarlo, avísame: el puente no tiene una IP fija.'); };
  async function connect(c) {
    const t = await make(c); t.checkRequiredCredentials();
    await t.fetchBalance(); // prueba real: si la clave no sirve, aquí falla
    cfg = Object.assign({}, c, {at: Date.now()}); ex = t; storeLocal(); const cloud = await cloudSave(); lensLink(); startPoll(); await checkPerms();
    return cloud;
  }
  async function disconnect() { cfg = null; ex = null; clearTimeout(pollT); snap = {equity: NaN, free: NaN, positions: [], orders: [], at: 0, err: ''}; storeLocal(); await cloudSave(); emit(); }

  /* ───────── Ventana: lista de exchanges → claves → conectado ───────── */
  let ov = null, step = 'list', pickId = '', q = '', all = null;
  const REQ = {apiKey: ['API Key', 'Tu clave pública'], secret: ['Secret Key', 'Tu clave secreta'], password: ['Passphrase', 'La frase que elegiste al crear la API'], uid: ['UID', 'Tu ID de usuario del exchange']};
  /* Logo de cada exchange: el de CCXT; si no carga, el ícono de su sitio; si tampoco, sus iniciales */
  const logoCache = {}, SITE = {bingx: 'bingx.com', binance: 'binance.com', bybit: 'bybit.com', okx: 'okx.com', bitget: 'bitget.com', kucoin: 'kucoin.com', gate: 'gate.com', mexc: 'mexc.com', htx: 'htx.com', kraken: 'kraken.com', coinbase: 'coinbase.com', bitmart: 'bitmart.com', cryptocom: 'crypto.com', bitfinex: 'bitfinex.com', phemex: 'phemex.com', hyperliquid: 'hyperliquid.xyz', woo: 'woox.io', deribit: 'deribit.com', blofin: 'blofin.com', lbank: 'lbank.com', binanceus: 'binance.us', bitstamp: 'bitstamp.net', gemini: 'gemini.com', upbit: 'upbit.com', bithumb: 'bithumb.com', whitebit: 'whitebit.com', bitso: 'bitso.com', poloniex: 'poloniex.com', xt: 'xt.com', weex: 'weex.com', toobit: 'toobit.com', aster: 'asterdex.com', dydx: 'dydx.exchange', backpack: 'backpack.exchange'};
  function logoOf(id) {
    if (logoCache[id] !== undefined) return logoCache[id]; let u = null;
    if (SITE[id]) return (logoCache[id] = {logo: '', fav: `https://www.google.com/s2/favicons?domain=${SITE[id]}&sz=64`, alt: `https://icons.duckduckgo.com/ip3/${SITE[id]}.ico`}); // los populares: logo al instante, sin esperar a CCXT
    try { const X = root.ccxt; if (X && X[id]) { const d = X[id].prototype.describe(), w = d.urls || {}; let www = Array.isArray(w.www) ? w.www[0] : w.www; const host = www ? new URL(www).hostname : ''; u = {logo: typeof w.logo === 'string' ? w.logo : '', fav: host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : ''}; } } catch {}
    if (root.ccxt) logoCache[id] = u; return u; // sin CCXT cargado aún no se guarda (se vuelve a intentar al pintar)
  }
  function lg(id, big) {
    const L = logoOf(id), ini = esc(nameOf(id).slice(0, 2)), src = L && (L.fav || L.logo);
    return `<span class="xc-lg${big ? ' big' : ''}${src ? ' img' : ''}">${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-alt="${esc(L.alt || (L.logo && L.fav ? L.logo : ''))}" onerror="if(this.dataset.alt){this.src=this.dataset.alt;this.dataset.alt=''}else{this.parentNode.classList.remove('img');this.replaceWith(document.createTextNode('${ini}'))}">` : ini}</span>`;
  }
  function listHtml() {
    const ids = all || FEATURED.map(x => x[0]), qq = q.trim().toLowerCase(), feat = FEATURED.map(x => x[0]);
    const rows = ids.filter(id => !qq || id.includes(qq) || nameOf(id).toLowerCase().includes(qq)).sort((a, b) => { const ia = feat.indexOf(a), ib = feat.indexOf(b); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b); });
    return rows.map(id => `<button type="button" class="xc-it${cfg && cfg.id === id ? ' on' : ''}" data-xc-pick="${esc(id)}">${lg(id)}<span class="xc-nm">${esc(nameOf(id))}</span>${feat.includes(id) ? '<em>Popular</em>' : ''}${cfg && cfg.id === id ? '<i>Conectado</i>' : ''}</button>`).join('') || '<p class="xc-empty">No encontré ese exchange.</p>';
  }
  async function credsFor(id) { try { const X = await loadCcxt(), r = new X[id]().requiredCredentials || {}; return Object.keys(REQ).filter(k => r[k]); } catch { return ['apiKey', 'secret']; } }
  async function paint() {
    if (!ov || ov.hidden) return; const box = ov.querySelector('.xc-body');
    if (step === 'list') {
      box.innerHTML = `${cfg ? statusHtml() : ''}<label class="xc-search">${svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', 16)}<input type="search" placeholder="Busca tu exchange" value="${esc(q)}" data-xc-q autocomplete="off"></label><div class="xc-list">${listHtml()}</div>${all ? `<p class="xc-note">${all.length} exchanges disponibles.</p>` : '<p class="xc-note">Cargando la lista completa…</p>'}`;
      if (!all) loadCcxt().then(X => { all = (Array.isArray(X.exchanges) ? X.exchanges.slice() : Object.keys(X.exchanges || {}).length ? Object.keys(X.exchanges) : Object.keys(X).filter(k => /^[a-z0-9]+$/.test(k) && typeof X[k] === 'function' && X[k].prototype && typeof X[k].prototype.describe === 'function')).filter(k => typeof X[k] === 'function'); if (ov && !ov.hidden && step === 'list') { const qi = ov.querySelector('[data-xc-q]'), hadF = qi && document.activeElement === qi; paint(); if (hadF) { const q2 = ov.querySelector('[data-xc-q]'); q2 && q2.focus(); } return; } const l = ov && ov.querySelector('.xc-list'); if (l) { l.innerHTML = listHtml(); const n = ov.querySelector('.xc-note'); if (n) n.textContent = all.length + ' exchanges disponibles.'; } }).catch(e => { const n = ov && ov.querySelector('.xc-note'); if (n) n.textContent = e.message; });
      return;
    }
    const id = pickId, same = cfg && cfg.id === id, need = await credsFor(id), mk = same ? cfg.market : 'swap';
    box.innerHTML = `<button type="button" class="xc-back" data-xc-back>${svg('<path d="m15 6-6 6 6 6"/>', 16)} Exchanges</button>
      <div class="xc-hd">${lg(id, true)}<div><b>${esc(nameOf(id))}</b><small>Crea una API en tu cuenta de ${esc(nameOf(id))} y pégala aquí. Nunca actives el permiso de <b>retiro</b>.</small></div></div>
      ${need.map(k => `<label class="xc-f"><span>${REQ[k][0]}</span><input type="${k === 'secret' || k === 'password' ? 'password' : 'text'}" data-xc-in="${k}" placeholder="${REQ[k][1]}" autocomplete="off" spellcheck="false" value="${same && cfg[k] ? esc(cfg[k]) : ''}"></label>`).join('')}
      <div class="xc-f"><span>Mercado</span><div class="seg" role="group"><button type="button" data-xc-mk="swap" aria-pressed="${mk !== 'spot'}">Futuros perpetuos</button><button type="button" data-xc-mk="spot" aria-pressed="${mk === 'spot'}">Spot</button></div></div>
      <div class="xc-trade"><div><b>Permitir operar en vivo</b><small>Operar desde el gráfico mandará órdenes reales con tu dinero (siempre te pide confirmar). Apagado = solo lectura: saldo, posiciones y Nexus Lens.</small></div><button type="button" class="toggle${same && cfg.trade ? ' on' : ''}" data-xc-trade role="switch" aria-checked="${!!(same && cfg.trade)}" aria-label="Permitir operar en vivo"></button></div>
      <p class="xc-err" data-xc-err hidden></p>
      <button type="button" class="primary xc-go" data-xc-go>${same ? 'Guardar cambios' : 'Conectar ' + esc(nameOf(id))}</button>
      <p class="xc-note">${root.CCTCloudPriv && root.CCTCloudPriv.ready() ? 'Se guarda en tu cuenta: no te la vuelve a pedir en otros dispositivos.' : 'Inicia sesión con Google para que se guarde en tu cuenta; si no, solo queda en este dispositivo.'} La firma se hace en tu dispositivo; tu Secret Key nunca pasa por nuestros servidores.</p>`;
    box.dataset.mk = mk;
  }
  function statusHtml() {
    const s = snap, eq = Number.isFinite(s.equity) ? s.equity.toLocaleString('es-MX', {style: 'currency', currency: 'USD'}) : '…';
    return `<div class="xc-cur">${lg(cfg.id)}<div class="xc-cur-t"><b>${esc(nameOf(cfg.id))} conectado</b><small>${s.err ? '⚠ ' + esc(s.err) : `Saldo ${eq} · ${cfg.market === 'spot' ? 'Spot' : 'Perpetuos'} · ${cfg.trade ? 'puede operar' : 'solo lectura'}`}</small>${permWarn() ? `<small class="xc-warn">⚠ ${esc(permWarn())}</small>` : ''}</div><button type="button" class="tr-mini" data-xc-pick="${esc(cfg.id)}">Editar</button><button type="button" class="tr-mini dn" data-xc-off>Desconectar</button></div><div class="sg-label">Cambiar de exchange</div>`;
  }
  function open() {
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'xc-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Conectar exchange');
      ov.innerHTML = `<div class="xc-box"><div class="xc-top"><div><small>TU CUENTA</small><h2>Conectar exchange</h2></div><button type="button" class="xc-x" data-xc-close aria-label="Cerrar">✕</button></div><div class="xc-body"></div></div>`;
      ov.addEventListener('click', onClick); ov.addEventListener('input', e => { if (e.target.matches('[data-xc-q]')) { q = e.target.value; ov.querySelector('.xc-list').innerHTML = listHtml(); } });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov && !ov.hidden) close(); });
      document.body.appendChild(ov);
    }
    step = 'list'; q = ''; ov.hidden = false; paint(); if (cfg) refresh().then(() => { if (step === 'list') paint(); });
  }
  function close() { if (ov) ov.hidden = true; }
  async function onClick(e) {
    const t = e.target;
    if (t === ov || t.closest('[data-xc-close]')) return close();
    const pk = t.closest('[data-xc-pick]'); if (pk) { pickId = pk.dataset.xcPick; step = 'form'; return paint(); }
    if (t.closest('[data-xc-back]')) { step = 'list'; return paint(); }
    const mk = t.closest('[data-xc-mk]'); if (mk) { ov.querySelectorAll('[data-xc-mk]').forEach(b => b.setAttribute('aria-pressed', String(b === mk))); ov.querySelector('.xc-body').dataset.mk = mk.dataset.xcMk; return; }
    const tg = t.closest('[data-xc-trade]'); if (tg) { const on = !tg.classList.contains('on'); tg.classList.toggle('on', on); tg.setAttribute('aria-checked', String(on)); return; }
    if (t.closest('[data-xc-off]')) { if (!confirm(`¿Desconectar ${nameOf(cfg.id)}? Se borra la clave de este dispositivo y de tu cuenta.`)) return; await disconnect(); toast('Exchange desconectado'); return paint(); }
    const go = t.closest('[data-xc-go]'); if (go) {
      const body = ov.querySelector('.xc-body'), c = {id: pickId, market: body.dataset.mk === 'spot' ? 'spot' : 'swap', trade: !!ov.querySelector('[data-xc-trade].on')}, er = ov.querySelector('[data-xc-err]');
      ov.querySelectorAll('[data-xc-in]').forEach(i => { c[i.dataset.xcIn] = i.value.trim(); });
      if (!c.apiKey || !c.secret) { er.hidden = false; er.textContent = 'Pega tu API Key y tu Secret Key.'; return; }
      if (c.trade && !confirm('Vas a permitir que VORTEX mande órdenes REALES a tu exchange desde Operar.\nCada orden te pedirá confirmación. ¿Continuar?')) return;
      go.disabled = true; go.textContent = 'Comprobando…'; er.hidden = true;
      try { const cloud = await connect(c); toast(`${nameOf(c.id)} conectado${cloud ? ' y guardado en tu cuenta' : ''}`); step = 'list'; paint(); }
      catch (err) { er.hidden = false; er.textContent = errText(err); go.disabled = false; go.textContent = 'Reintentar'; }
    }
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-ex-open]')) { e.preventDefault(); open(); } });
  if (cfg) { startPoll(); setTimeout(checkPerms, 1500); }

  root.CCTExchange = {open, close, refresh, refreshSoon, order, closePosition, cancel, canTrade, cloudSync, connected: () => !!cfg, protections, setTpSl, removeTpSl, baseOf, permWarn: () => permWarn(), checkPerms, info: () => cfg ? {id: cfg.id, name: nameOf(cfg.id), market: cfg.market, trade: !!cfg.trade} : null, snap: () => snap, onChange: f => { subs.push(f); }, FEATURED};
})(typeof self !== 'undefined' ? self : this);

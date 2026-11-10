/* VORTEX · Operar desde el gráfico (cuenta demo). Boleta de órdenes, posiciones, órdenes e historial.
   Las líneas en el gráfico (entrada, TP, SL, órdenes, liquidación) las dibuja app.js con CCTTrade.lines(). */
(function (root) {
  'use strict';
  const E = root.CCTTradeEngine, LS = 'cct_trade_v1', LSU = 'cct_trade_ui_v1';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const fin = Number.isFinite;
  let A = load(), H = {sym: () => '', price: () => NaN, fmt: v => String(v), render: () => {}, toast: () => {}, base: s => s};
  let ui = Object.assign({open: false, type: 'market', lev: 10, amt: '', unit: 'usdt', tpOn: false, slOn: false, tab: 'pos', mode: 'demo'}, loadUi());
  /* Modo real: tu exchange conectado (exchange.js) con «Permitir operar en vivo». Cada orden pide confirmación. */
  const X = () => root.CCTExchange, real = () => ui.mode === 'real' && !!(X() && X().canTrade()), xs = () => (X() ? X().snap() : {}) || {};
  const last = {}; let panel = null, timer = 0, listT = 0;

  function load() { try { return E.san(JSON.parse(localStorage.getItem(LS) || 'null')); } catch { return E.newAcct(); } }
  function loadUi() { try { return JSON.parse(localStorage.getItem(LSU) || '{}') || {}; } catch { return {}; } }
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(A)); } catch {} };
  const saveUi = () => { try { const {open, type, lev, unit, tpOn, slOn, tab, mode} = ui; localStorage.setItem(LSU, JSON.stringify({open, type, lev, unit, tpOn, slOn, tab, mode})); } catch {} };
  const px = s => { const v = +H.price(s); return v > 0 ? v : NaN; };
  const f = v => fin(v) ? H.fmt(v) : '—';
  const usd = (v, sign) => fin(v) ? (sign && v > 0 ? '+' : v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '—';
  const qf = q => q >= 100 ? q.toLocaleString('es-MX', {maximumFractionDigits: 2}) : q >= 1 ? +q.toFixed(4) + '' : +q.toPrecision(4) + '';
  const coin = s => H.base(s) || s;
  const rp = v => { v = +v; if (!(v > 0)) return ''; const d = Math.max(2, Math.min(8, 5 - Math.floor(Math.log10(v)))); return +v.toFixed(d); }; // precio con decimales razonables

  function changed(ev) {
    save(); if (root.CCTJournal) CCTJournal.sync(A); H.render(); renderPanel();
    for (const e of ev || []) {
      const s = coin(e.sym), sd = e.side > 0 ? 'Long' : 'Short';
      if (e.k === 'open') H.toast(`Abriste ${sd} ${qf(e.qty)} ${s} a ${f(e.price)}`);
      else if (e.k === 'filled') H.toast(`Se ejecutó tu orden ${e.type === 'limit' ? 'límite' : 'stop'} de ${s} a ${f(e.price)}`);
      else if (e.k === 'close') H.toast(`${e.why}: ${sd} ${s} cerrado a ${f(e.price)} · ${usd(e.pnl, true)}`);
      else if (e.k === 'liq') H.toast(`Liquidación de tu ${sd} ${s} · ${usd(e.pnl, true)}`);
      if (e.k === 'close' || e.k === 'liq' || e.k === 'filled') try { navigator.vibrate && navigator.vibrate(e.k === 'liq' ? [60, 40, 60] : 25); } catch {}
    }
  }

  // precio nuevo de un activo: revisa órdenes, TP/SL y liquidación con el rango recorrido desde el último precio
  function tick(sym, p) {
    if (!(p > 0)) return; const prev = last[sym] > 0 ? last[sym] : p; last[sym] = p;
    if (!A.pos.some(x => x.sym === sym) && !A.ord.some(x => x.sym === sym)) return;
    const ev = E.tick(A, sym, Math.min(prev, p), Math.max(prev, p), p);
    if (ev.length) changed(ev); else if (panel && !panel.hidden) { clearTimeout(listT); listT = setTimeout(renderLive, 250); }
  }
  function poll() { const syms = new Set([...A.pos.map(p => p.sym), ...A.ord.map(o => o.sym)]); for (const s of syms) tick(s, px(s)); }

  /* ───────── líneas para el gráfico ───────── */
  /* Modo real: líneas de tu posición del exchange (entrada, TP, SL y liquidación). TP y SL se arrastran para moverlos; × los quita. */
  const symBase = s => String(s || '').split('@')[0].replace(/(USDT|USDC|USD)$/, '').replace(/^1000/, '');
  function realLines(sym) {
    const S = xs(), b = symBase(sym), out = [];
    (S.positions || []).forEach((p, i) => {
      if (X().baseOf(p.symbol) !== b) return; const L = +p.contracts * (String(p.side).toLowerCase() === 'long' ? 1 : -1), e = +p.entryPrice, pr = X().protections(p), id = 'x' + i, sd = L > 0 ? 1 : -1, q = Math.abs(+p.contracts) * (+p.contractSize || 1);
      out.push({id, kind: 'pos', price: e, side: sd, txt: `${sd > 0 ? 'LONG' : 'SHORT'} REAL ${qf(q)}${+p.leverage ? ' · ' + p.leverage + 'x' : ''}`, pnl: +p.unrealizedPnl, sub: fin(+p.percentage) ? (+p.percentage >= 0 ? '+' : '') + (+p.percentage).toFixed(2) + '%' : '', x: 1, addTp: !pr.tp, addSl: !pr.sl, real: 1});
      if (pr.tp) out.push({id, kind: 'tp', price: pr.tp.price, txt: 'TP', pnl: (pr.tp.price - e) * q * sd, drag: 1, x: 1, real: 1});
      if (pr.sl) out.push({id, kind: 'sl', price: pr.sl.price, txt: 'SL', pnl: (pr.sl.price - e) * q * sd, drag: 1, x: 1, real: 1});
      if (+p.liquidationPrice > 0) out.push({id, kind: 'liq', price: +p.liquidationPrice, txt: 'Liquidación', real: 1});
    });
    return out;
  }
  const realPos = id => (xs().positions || [])[+String(id).slice(1)];
  function lines(sym) { const rl = X() && X().connected() ? realLines(sym) : []; if (real()) return rl; // tu posición REAL del exchange se ve siempre que la tengas abierta (también junto a la demo)
    return rl.concat(demoLines(sym)); }
  function demoLines(sym) {
    const out = [], L = px(sym);
    for (const p of A.pos) if (p.sym === sym) {
      const pn = fin(L) ? E.upnl(p, L) : NaN, roe = pn / E.margin(p) * 100;
      out.push({id: p.id, kind: 'pos', price: p.entry, side: p.side, txt: `${p.side > 0 ? 'LONG' : 'SHORT'} ${qf(p.qty)} · ${p.lev}x`, pnl: pn, sub: fin(roe) ? (roe >= 0 ? '+' : '') + roe.toFixed(2) + '%' : '', x: 1, addTp: !p.tp, addSl: !p.sl});
      if (p.tp) out.push({id: p.id, kind: 'tp', price: p.tp, txt: 'TP', pnl: (p.tp - p.entry) * p.qty * p.side, drag: 1, x: 1});
      if (p.sl) out.push({id: p.id, kind: 'sl', price: p.sl, txt: 'SL', pnl: (p.sl - p.entry) * p.qty * p.side, drag: 1, x: 1});
      out.push({id: p.id, kind: 'liq', price: p.liq, txt: 'Liquidación'});
    }
    for (const o of A.ord) if (o.sym === sym) {
      out.push({id: o.id, kind: 'ord', price: o.price, side: o.side, txt: `${o.side > 0 ? 'COMPRA' : 'VENTA'} ${o.type === 'limit' ? 'LÍMITE' : 'STOP'} ${qf(o.qty)}`, drag: 1, x: 1});
      if (o.tp) out.push({id: o.id, kind: 'tp', price: o.tp, txt: 'TP', pnl: (o.tp - o.price) * o.qty * o.side, drag: 1, x: 1, pend: 1});
      if (o.sl) out.push({id: o.id, kind: 'sl', price: o.sl, txt: 'SL', pnl: (o.sl - o.price) * o.qty * o.side, drag: 1, x: 1, pend: 1});
    }
    return out;
  }
  function moveLine(id, kind, price) { if (/^x\d+$/.test(id) && X()) { const p = realPos(id); if (!p || (kind !== 'tp' && kind !== 'sl')) return false; if (!root.confirm(`¿Mover el ${kind.toUpperCase()} REAL de ${X().baseOf(p.symbol)} a ${f(price)}?`)) { H.render(); return false; } H.toast('Enviando a tu exchange…'); X().setTpSl(p, kind, price).then(() => H.toast((kind === 'tp' ? 'TP' : 'SL') + ' real en ' + f(price)), e => { H.toast('No se pudo: ' + e.message); H.render(); }); return true; } const r = E.move(A, id, kind, rp(price), px(H.sym())); if (r.error) { H.toast(r.error); H.render(); return false; } changed(); H.toast(kind === 'ord' ? 'Orden movida a ' + f(price) : (kind === 'tp' ? 'TP' : 'SL') + ' en ' + f(price)); return true; }
  function xLine(id, kind) { // botón × de la línea
    if (/^x\d+$/.test(id) && X()) { const p = realPos(id); if (!p) return; if (kind === 'tp' || kind === 'sl') { if (root.confirm(`¿Quitar el ${kind.toUpperCase()} REAL?`)) X().removeTpSl(p, kind).then(() => H.toast('Quitado'), e => H.toast('No se pudo: ' + e.message)); } else if (kind === 'pos' && root.confirm(`¿Cerrar tu posición REAL de ${X().baseOf(p.symbol)} a mercado?`)) X().closePosition(p, 1).then(() => H.toast('Posición cerrada'), e => H.toast('No se pudo: ' + e.message)); return; }
    if (kind === 'tp' || kind === 'sl') { E.setTpSl(A, id, kind === 'tp' ? 0 : undefined, kind === 'sl' ? 0 : undefined); changed(); H.toast((kind === 'tp' ? 'TP' : 'SL') + ' quitado'); return; }
    if (kind === 'ord') { E.cancel(A, id); changed(); H.toast('Orden cancelada'); return; }
    if (kind === 'pos') { const p = A.pos.find(x => x.id === id); if (!p) return; if (!confirmClose(p)) return; changed(E.closePos(A, id, px(p.sym))); }
  }
  function addTpSl(id, kind) { // +TP / +SL desde la etiqueta: lo pone a 2 % (TP) o 1 % (SL) para que luego lo arrastres
    if (/^x\d+$/.test(id) && X()) { const p = realPos(id); if (!p) return; const long = String(p.side).toLowerCase() === 'long', e = +p.markPrice || +p.entryPrice, pr = kind === 'tp' ? e * (long ? 1.02 : .98) : e * (long ? .99 : 1.01); if (!root.confirm(`¿Poner ${kind.toUpperCase()} REAL en ${f(pr)}? (luego lo arrastras)`)) return; X().setTpSl(p, kind, pr).then(() => H.toast(kind.toUpperCase() + ' puesto'), e2 => H.toast('No se pudo: ' + e2.message)); return; }
    const p = A.pos.find(x => x.id === id); if (!p) return; const L = px(p.sym) || p.entry, ref = p.side > 0 ? Math.max(L, p.entry) : Math.min(L, p.entry);
    let v = kind === 'tp' ? ref * (1 + .02 * p.side) : (p.side > 0 ? Math.min(L, p.entry) : Math.max(L, p.entry)) * (1 - .01 * p.side);
    if (kind === 'sl' && (p.side > 0 ? v <= p.liq : v >= p.liq)) v = (p.entry + p.liq) / 2;
    E.setTpSl(A, id, kind === 'tp' ? rp(v) : undefined, kind === 'sl' ? rp(v) : undefined); changed(); H.toast(`${kind.toUpperCase()} puesto en ${f(v)} · arrástralo a tu nivel`);
  }
  const confirmClose = p => { const L = px(p.sym), pn = fin(L) ? E.upnl(p, L) : NaN; return root.confirm(`¿Cerrar tu ${p.side > 0 ? 'Long' : 'Short'} de ${coin(p.sym)} a mercado?${fin(pn) ? '\nResultado: ' + usd(pn, true) : ''}`); };

  /* ───────── boleta ───────── */
  const svg = (p, s = 16) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  function shell() {
    panel = document.createElement('div'); panel.className = 'tr-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Operar · cuenta demo');
    panel.innerHTML = `<div class="tr-head"><div><b>Operar</b><span class="tr-mode" data-tr-mode></span></div><div class="tr-eq" data-tr-eq></div><button type="button" class="tr-jr" data-tr-journal title="Diario de trading">Diario</button><button type="button" class="tr-x" data-tr-close aria-label="Cerrar">✕</button></div>
      <div class="tr-body">
        <div class="tr-seg" data-tr-types>${[['market', 'Mercado'], ['limit', 'Límite'], ['stop', 'Stop']].map(([k, l]) => `<button type="button" data-tr-type="${k}">${l}</button>`).join('')}</div>
        <label class="tr-f tr-price"><span>Precio</span><input type="text" inputmode="decimal" data-tr-in="price" autocomplete="off"><button type="button" class="tr-mini" data-tr-last>Último</button></label>
        <label class="tr-f"><span>Monto</span><input type="text" inputmode="decimal" data-tr-in="amt" autocomplete="off" placeholder="0"><button type="button" class="tr-unit" data-tr-unit></button></label>
        <div class="tr-pcts">${[10, 25, 50, 100].map(v => `<button type="button" data-tr-pct="${v}">${v}%</button>`).join('')}</div>
        <div class="tr-lev"><span>Apalancamiento</span><input type="range" min="1" max="125" step="1" data-tr-lev><b data-tr-levv></b></div>
        <div class="tr-tpsl">
          <label class="tr-chk"><input type="checkbox" data-tr-on="tp"> TP</label><input type="text" inputmode="decimal" data-tr-in="tp" placeholder="Precio objetivo" autocomplete="off">
          <label class="tr-chk"><input type="checkbox" data-tr-on="sl"> SL</label><input type="text" inputmode="decimal" data-tr-in="sl" placeholder="Precio de stop" autocomplete="off">
        </div>
        <div class="tr-calc" data-tr-calc></div>
        <p class="tr-err" data-tr-err hidden></p>
        <div class="tr-go"><button type="button" class="tr-buy" data-tr-side="1"><b>Comprar</b><small data-tr-bl>Long</small></button><button type="button" class="tr-sell" data-tr-side="-1"><b>Vender</b><small data-tr-sl>Short</small></button></div>
        <div class="tr-tabs">${[['pos', 'Posiciones'], ['ord', 'Órdenes'], ['hist', 'Historial']].map(([k, l]) => `<button type="button" data-tr-tab="${k}">${l}<i data-tr-n="${k}"></i></button>`).join('')}</div>
        <div class="tr-list" data-tr-list></div>
        <div class="tr-foot"><span data-tr-stats></span><button type="button" class="tr-mini" data-tr-reset>Reiniciar demo</button></div>
      </div>`;
    const host = document.getElementById('chartArea') || document.body; host.appendChild(panel);
    panel.addEventListener('click', onClick); panel.addEventListener('input', onInput); panel.addEventListener('change', onInput);
    panel.addEventListener('pointerdown', e => e.stopPropagation()); panel.addEventListener('wheel', e => e.stopPropagation(), {passive: true});
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); toggle(false); } });
  }
  const $p = s => panel.querySelector(s), inp = k => panel.querySelector(`[data-tr-in="${k}"]`);
  const num = k => { const v = parseFloat(String(inp(k).value || '').replace(/\s/g, '').replace(',', '.')); return fin(v) ? v : NaN; };

  function entryPrice() { const L = px(H.sym()); return ui.type === 'market' ? L : num('price'); }
  function sizing() { // a partir del monto (USDT de margen o cantidad de monedas) → cantidad
    const e = entryPrice(), a = num('amt'); if (!(e > 0) || !(a > 0)) return null;
    const qty = ui.unit === 'usdt' ? a * ui.lev / e : a; return {qty, notional: qty * e, margin: qty * e / ui.lev, e};
  }
  function renderCalc() {
    if (!panel) return; const s = sizing(), box = $p('[data-tr-calc]'), sym = H.sym(), av = avail();
    let h = `<span>Disponible <b>${usd(av)}</b></span>`;
    if (s) {
      h += `<span>Tamaño <b>${qf(s.qty)} ${esc(coin(sym))}</b> · ${usd(s.notional)}</span><span>Margen <b>${usd(s.margin)}</b></span>`;
      const tp = ui.tpOn ? num('tp') : NaN, sl = ui.slOn ? num('sl') : NaN;
      const lq = [1, -1].map(sd => E.liqOf(sd, s.e, ui.lev));
      h += `<span>Liquidación <b class="up">L ${f(lq[0])}</b> · <b class="dn">S ${f(lq[1])}</b></span>`;
      if (sl > 0) { const loss = Math.abs(sl - s.e) * s.qty, pct = loss / Math.max(1e-9, E.equity(A, px)) * 100; h += `<span>Riesgo en el SL <b class="dn">${usd(-loss)}</b> · ${pct.toFixed(2)}% de tu cuenta</span>`; if (tp > 0) h += `<span>R:R <b>1 : ${(Math.abs(tp - s.e) / Math.abs(sl - s.e)).toFixed(2)}</b></span>`; }
    }
    box.innerHTML = h;
    const lbl = ui.type === 'market' ? ['Long a mercado', 'Short a mercado'] : ui.type === 'limit' ? ['Long límite', 'Short límite'] : ['Long stop', 'Short stop'];
    $p('[data-tr-bl]').textContent = lbl[0]; $p('[data-tr-sl]').textContent = lbl[1];
  }
  const avail = () => real() ? +xs().free : E.available(A, px);
  function renderLive() { if (!panel || panel.hidden) return; renderEq(); renderList(); renderCalc(); }
  function renderEq() { if (real()) { const S = xs(); $p('[data-tr-eq]').innerHTML = `<b>${usd(+S.equity)}</b><small class="${S.err ? 'dn' : ''}">${S.err ? 'Revisa tu conexión' : 'Saldo real'}</small>`; return; } const eq = E.equity(A, px), net = eq - A.start; $p('[data-tr-eq]').innerHTML = `<b>${usd(eq)}</b><small class="${net >= 0 ? 'up' : 'dn'}">${usd(net, true)} · ${(net / A.start * 100).toFixed(2)}%</small>`; }
  function renderList() {
    const box = $p('[data-tr-list]'); if (!box) return;
    if (real()) return renderListReal(box);
    $p('[data-tr-n="pos"]').textContent = A.pos.length || ''; $p('[data-tr-n="ord"]').textContent = A.ord.length || '';
    panel.querySelectorAll('[data-tr-tab]').forEach(b => b.classList.toggle('on', b.dataset.trTab === ui.tab));
    let h = '';
    if (ui.tab === 'pos') h = A.pos.length ? A.pos.map(p => { const L = px(p.sym), pn = fin(L) ? E.upnl(p, L) : NaN, roe = pn / E.margin(p) * 100;
      return `<div class="tr-row"><div class="tr-r1"><b class="${p.side > 0 ? 'up' : 'dn'}">${p.side > 0 ? 'Long' : 'Short'}</b> <button type="button" class="tr-sym" data-tr-go="${esc(p.sym)}">${esc(coin(p.sym))}</button> <small>${p.lev}x · ${qf(p.qty)}</small><span class="tr-pn ${pn >= 0 ? 'up' : 'dn'}">${usd(pn, true)}<small>${fin(roe) ? (roe >= 0 ? '+' : '') + roe.toFixed(2) + '%' : ''}</small></span></div>
        <div class="tr-r2"><span>Entrada <b>${f(p.entry)}</b></span><span>Precio <b>${f(L)}</b></span><span>Liq. <b>${f(p.liq)}</b></span><span>TP <b>${p.tp ? f(p.tp) : '—'}</b></span><span>SL <b>${p.sl ? f(p.sl) : '—'}</b></span></div>
        <div class="tr-r3"><button type="button" data-tr-half="${p.id}">Cerrar 50%</button><button type="button" class="dn" data-tr-closep="${p.id}">Cerrar a mercado</button></div></div>`; }).join('') : '<div class="tr-empty">Sin posiciones abiertas.<br>Usa Comprar o Vender. En PC también puedes dar clic derecho en el gráfico para poner una orden en ese precio.</div>';
    else if (ui.tab === 'ord') h = A.ord.length ? A.ord.map(o => `<div class="tr-row"><div class="tr-r1"><b class="${o.side > 0 ? 'up' : 'dn'}">${o.side > 0 ? 'Compra' : 'Venta'} ${o.type === 'limit' ? 'límite' : 'stop'}</b> <button type="button" class="tr-sym" data-tr-go="${esc(o.sym)}">${esc(coin(o.sym))}</button> <small>${o.lev}x · ${qf(o.qty)}</small><button type="button" class="tr-cancel" data-tr-cancel="${o.id}">Cancelar</button></div>
        <div class="tr-r2"><span>Precio <b>${f(o.price)}</b></span><span>Actual <b>${f(px(o.sym))}</b></span><span>TP <b>${o.tp ? f(o.tp) : '—'}</b></span><span>SL <b>${o.sl ? f(o.sl) : '—'}</b></span></div></div>`).join('') : '<div class="tr-empty">Sin órdenes pendientes.</div>';
    else h = A.hist.length ? A.hist.slice(0, 40).map(x => `<div class="tr-row tr-h"><div class="tr-r1"><b class="${x.side > 0 ? 'up' : 'dn'}">${x.side > 0 ? 'Long' : 'Short'}</b> ${esc(coin(x.sym))} <small>${x.lev}x · ${esc(x.why)}</small><span class="tr-pn ${x.pnl >= 0 ? 'up' : 'dn'}">${usd(x.pnl, true)}</span></div>
        <div class="tr-r2"><span>${f(x.entry)} → ${f(x.exit)}</span><span>${new Date(x.t).toLocaleString('es-MX', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'})}</span></div></div>`).join('') : '<div class="tr-empty">Aún no cierras operaciones.</div>';
    box.innerHTML = h;
    const st = E.stats(A); $p('[data-tr-stats]').textContent = st.n ? `${st.n} operaciones · ${st.win.toFixed(0)}% ganadoras` : 'Saldo inicial ' + usd(A.start);
  }
  function renderListReal(box) { // posiciones y órdenes de tu exchange (se actualizan cada minuto y después de cada orden)
    const S = xs(), P = S.positions || [], O = S.orders || [], n2 = v => fin(+v) ? +v : NaN;
    $p('[data-tr-n="pos"]').textContent = P.length || ''; $p('[data-tr-n="ord"]').textContent = O.length || '';
    panel.querySelectorAll('[data-tr-tab]').forEach(b => b.classList.toggle('on', b.dataset.trTab === ui.tab));
    let h = '';
    if (ui.tab === 'pos') h = P.length ? P.map((p, i) => { const L = String(p.side).toLowerCase() === 'long', pn = n2(p.unrealizedPnl), sym = String(p.symbol || '').split(':')[0];
      return `<div class="tr-row"><div class="tr-r1"><b class="${L ? 'up' : 'dn'}">${L ? 'Long' : 'Short'}</b> <b>${esc(sym)}</b> <small>${fin(n2(p.leverage)) ? n2(p.leverage) + 'x · ' : ''}${qf(Math.abs(n2(p.contracts)))}</small><span class="tr-pn ${pn >= 0 ? 'up' : 'dn'}">${usd(pn, true)}<small>${fin(n2(p.percentage)) ? (n2(p.percentage) >= 0 ? '+' : '') + n2(p.percentage).toFixed(2) + '%' : ''}</small></span></div>
        <div class="tr-r2"><span>Entrada <b>${f(n2(p.entryPrice))}</b></span><span>Precio <b>${f(n2(p.markPrice))}</b></span><span>Liq. <b>${f(n2(p.liquidationPrice))}</b></span></div>
        <div class="tr-r3"><button type="button" data-tr-xhalf="${i}">Cerrar 50%</button><button type="button" class="dn" data-tr-xclose="${i}">Cerrar a mercado</button></div></div>`; }).join('') : `<div class="tr-empty">${S.err ? esc(S.err) : S.posErr ? 'No pude leer tus posiciones: ' + esc(S.posErr) : 'Sin posiciones abiertas en tu exchange (' + (X().info() || {}).name + ' · ' + ((X().info() || {}).market === 'spot' ? 'Spot' : 'Futuros perpetuos') + ').'}</div>`;
    else if (ui.tab === 'ord') h = O.length ? O.map((o, i) => `<div class="tr-row"><div class="tr-r1"><b class="${o.side === 'buy' ? 'up' : 'dn'}">${o.side === 'buy' ? 'Compra' : 'Venta'} ${esc(o.type || '')}</b> <b>${esc(String(o.symbol || '').split(':')[0])}</b> <small>${qf(+o.amount || 0)}</small><button type="button" class="tr-cancel" data-tr-xcancel="${i}">Cancelar</button></div><div class="tr-r2"><span>Precio <b>${f(n2(o.price || o.triggerPrice || o.stopPrice))}</b></span></div></div>`).join('') : '<div class="tr-empty">Sin órdenes pendientes en tu exchange.</div>';
    else h = '<div class="tr-empty">El historial real está en Nexus Lens (barra derecha) y en tu exchange.</div>';
    box.innerHTML = h; $p('[data-tr-stats]').textContent = S.at ? 'Actualizado ' + new Date(S.at).toLocaleTimeString('es-MX', {hour: '2-digit', minute: '2-digit'}) : 'Leyendo tu exchange…';
  }
  function renderMode() {
    const el = $p('[data-tr-mode]'), x = X() && X().info(), can = !!(X() && X().canTrade());
    if (!can && ui.mode === 'real') ui.mode = 'demo';
    el.innerHTML = can ? `<span class="tr-seg tr-msw"><button type="button" data-tr-m="demo" class="${ui.mode !== 'real' ? 'on' : ''}">Demo</button><button type="button" data-tr-m="real" class="${ui.mode === 'real' ? 'on real' : ''}">Real · ${esc(x.name)}</button></span>` : `<span class="tr-demo">Cuenta demo</span>${x ? '' : '<button type="button" class="tr-mini" data-ex-open>Conectar exchange</button>'}`;
    panel.classList.toggle('is-real', real()); $p('[data-tr-reset]').hidden = real();
    const eb = $p('[data-tr-err]'), pw = real() && X().permWarn ? X().permWarn() : ''; if (pw) { eb.textContent = pw; eb.hidden = false; } else if (!real()) eb.hidden = true;
  }
  function renderPanel() {
    if (!panel || panel.hidden) return; renderMode();
    panel.querySelectorAll('[data-tr-type]').forEach(b => b.classList.toggle('on', b.dataset.trType === ui.type));
    $p('.tr-price').hidden = ui.type === 'market';
    $p('[data-tr-unit]').textContent = ui.unit === 'usdt' ? 'USDT' : coin(H.sym());
    $p('[data-tr-lev]').value = ui.lev; $p('[data-tr-levv]').textContent = ui.lev + 'x';
    for (const k of ['tp', 'sl']) { $p(`[data-tr-on="${k}"]`).checked = !!ui[k + 'On']; inp(k).disabled = !ui[k + 'On']; }
    renderLive();
  }

  function submit(side) {
    const s = sizing(), sym = H.sym(); if (!s) { H.toast(ui.type === 'market' ? 'Escribe el monto' : 'Escribe el precio y el monto'); return; }
    const o = {sym, side, qty: s.qty, lev: ui.lev, type: ui.type, price: ui.type === 'market' ? undefined : s.e, tp: ui.tpOn ? num('tp') : null, sl: ui.slOn ? num('sl') : null};
    if (ui.type !== 'market') { const L = px(sym); if (fin(L)) o.type = side > 0 ? (s.e <= L ? 'limit' : 'stop') : (s.e >= L ? 'limit' : 'stop'); }
    if (real()) { // orden REAL: siempre se confirma
      const x = X().info(), msg = `ORDEN REAL en ${x.name}\n\n${side > 0 ? 'COMPRA (Long)' : 'VENTA (Short)'} ${qf(s.qty)} ${coin(sym)}\n${o.type === 'market' ? 'A mercado (~' + f(s.e) + ')' : (o.type === 'limit' ? 'Límite en ' : 'Stop en ') + f(s.e)}\nValor ${usd(s.notional)} · ${ui.lev}x · margen ${usd(s.margin)}${o.tp ? '\nTP ' + f(o.tp) : ''}${o.sl ? '\nSL ' + f(o.sl) : ''}\n\n¿Enviar la orden?`;
      if (!root.confirm(msg)) return;
      H.toast('Enviando orden a ' + x.name + '…');
      const eb = $p('[data-tr-err]'); eb.hidden = true;
      X().order(o).then(() => { H.toast(`Orden enviada a ${x.name}`); ui.tab = o.type === 'market' ? 'pos' : 'ord'; renderList(); }, e => { eb.textContent = e.message || String(e); eb.hidden = false; H.toast('No se pudo enviar la orden (detalle en el panel)'); });
      return;
    }
    const r = E.place(A, o, px); if (r.error) { H.toast(r.error); return; }
    if (r.ord) H.toast(`Orden ${r.ord.type === 'limit' ? 'límite' : 'stop'} de ${side > 0 ? 'compra' : 'venta'} en ${f(r.ord.price)}`);
    changed(r.ev.filter(e => e.k !== 'placed'));
  }

  function onClick(e) {
    const t = e.target;
    if (t.closest('[data-tr-close]')) return toggle(false);
    if (t.closest('[data-tr-journal]')) { if (root.CCTJournal) CCTJournal.open(); return; }
    const ty = t.closest('[data-tr-type]'); if (ty) { ui.type = ty.dataset.trType; if (ui.type !== 'market' && !(num('price') > 0)) inp('price').value = rp(px(H.sym())); saveUi(); renderPanel(); return; }
    if (t.closest('[data-tr-last]')) { inp('price').value = rp(px(H.sym())); renderCalc(); return; }
    if (t.closest('[data-tr-unit]')) { const s = sizing(); ui.unit = ui.unit === 'usdt' ? 'coin' : 'usdt'; if (s) inp('amt').value = ui.unit === 'usdt' ? +s.margin.toFixed(2) : +s.qty.toPrecision(6); saveUi(); renderPanel(); return; }
    const pc = t.closest('[data-tr-pct]'); if (pc) { const av = Math.max(0, avail() || 0) * +pc.dataset.trPct / 100 * .998, e2 = entryPrice(); inp('amt').value = ui.unit === 'usdt' ? av.toFixed(2) : (e2 > 0 ? +(av * ui.lev / e2).toPrecision(6) : ''); renderCalc(); return; }
    const sd = t.closest('[data-tr-side]'); if (sd) return submit(+sd.dataset.trSide);
    const md = t.closest('[data-tr-m]'); if (md) { ui.mode = md.dataset.trM; saveUi(); if (ui.mode === 'real') X().refresh().then(renderLive); renderPanel(); H.render(); return; }
    const xc = t.closest('[data-tr-xclose], [data-tr-xhalf]'); if (xc) { const P = xs().positions || [], p = P[+(xc.dataset.trXclose || xc.dataset.trXhalf)], fr = xc.dataset.trXhalf != null ? .5 : 1; if (!p) return; if (!root.confirm(`¿Cerrar ${fr < 1 ? 'el 50% de ' : ''}tu ${String(p.side).toLowerCase() === 'long' ? 'Long' : 'Short'} REAL de ${String(p.symbol).split(':')[0]} a mercado?`)) return; X().closePosition(p, fr).then(() => H.toast('Posición cerrada'), e => H.toast('No se pudo: ' + e.message)); return; }
    const xo = t.closest('[data-tr-xcancel]'); if (xo) { const o = (xs().orders || [])[+xo.dataset.trXcancel]; if (o) X().cancel(o).then(() => H.toast('Orden cancelada'), e => H.toast('No se pudo: ' + e.message)); return; }
    const tb = t.closest('[data-tr-tab]'); if (tb) { ui.tab = tb.dataset.trTab; saveUi(); renderList(); return; }
    const cp = t.closest('[data-tr-closep]'); if (cp) { const p = A.pos.find(x => x.id === cp.dataset.trClosep); if (p && confirmClose(p)) changed(E.closePos(A, p.id, px(p.sym))); return; }
    const hf = t.closest('[data-tr-half]'); if (hf) { const p = A.pos.find(x => x.id === hf.dataset.trHalf); if (p) changed(E.closePos(A, p.id, px(p.sym), .5)); return; }
    const cn = t.closest('[data-tr-cancel]'); if (cn) { E.cancel(A, cn.dataset.trCancel); changed(); H.toast('Orden cancelada'); return; }
    const go = t.closest('[data-tr-go]'); if (go && H.go) { H.go(go.dataset.trGo); return; }
    if (t.closest('[data-tr-reset]')) {
      const v = root.prompt('Reiniciar la cuenta demo: se borran posiciones, órdenes e historial.\nSaldo inicial en USDT:', String(A.start)); if (v == null) return;
      const n = parseFloat(String(v).replace(/[^\d.]/g, '')); if (!(n >= 10 && n <= 1e9)) { H.toast('Escribe un saldo entre 10 y 1,000,000,000'); return; }
      A = E.newAcct(n); changed(); H.toast('Cuenta demo reiniciada con ' + usd(n));
    }
  }
  function onInput(e) {
    const t = e.target;
    if (t.matches('[data-tr-lev]')) { ui.lev = Math.max(1, Math.min(125, +t.value || 1)); $p('[data-tr-levv]').textContent = ui.lev + 'x'; saveUi(); renderCalc(); return; }
    const on = t.closest('[data-tr-on]'); if (on) { const k = on.dataset.trOn; ui[k + 'On'] = on.checked; inp(k).disabled = !on.checked; if (on.checked && !(num(k) > 0)) { const e2 = entryPrice(); if (e2 > 0) inp(k).value = rp(e2 * (k === 'tp' ? 1.02 : .99)); } saveUi(); renderCalc(); if (on.checked) inp(k).focus(); return; }
    if (t.matches('[data-tr-in]')) renderCalc();
  }

  function toggle(on) {
    if (!panel) shell(); ui.open = on == null ? panel.hidden : !!on; panel.hidden = !ui.open; saveUi();
    const b = document.getElementById('tradeBtn'); if (b) { b.classList.toggle('on', ui.open); b.setAttribute('aria-pressed', ui.open); }
    if (ui.open) { renderPanel(); if (real()) X().refresh(); }
  }
  // clic derecho en el gráfico → boleta lista con ese precio (límite o stop según el lado)
  function at(side, price) {
    toggle(true); const L = px(H.sym());
    ui.type = fin(L) ? (side > 0 ? (price <= L ? 'limit' : 'stop') : (price >= L ? 'limit' : 'stop')) : 'limit';
    inp('price').value = rp(price);
    if (ui.tpOn) inp('tp').value = rp(price * (1 + .02 * side)); // TP y SL se acomodan al nuevo precio y lado
    if (ui.slOn) inp('sl').value = rp(price * (1 - .01 * side));
    saveUi(); renderPanel(); inp('amt').focus();
    H.toast(`Escribe el monto y toca ${side > 0 ? 'Comprar' : 'Vender'}`);
  }

  function bind(h) {
    Object.assign(H, h); if (X()) X().onChange(() => { if (panel && !panel.hidden) { renderMode(); renderLive(); } H.render(); }); // las líneas de tu posición real se actualizan en el gráfico clearInterval(timer); timer = setInterval(poll, 2000); if (root.CCTJournal) setTimeout(() => CCTJournal.sync(A), 0);
    if (ui.open) setTimeout(() => toggle(true), 0);
  }
  const symChanged = () => { if (panel && !panel.hidden) { inp('price').value = ''; if (ui.type !== 'market') inp('price').value = rp(px(H.sym())); renderPanel(); } };
  root.CCTTrade = {bind, tick, lines, moveLine, xLine, addTpSl, toggle, at, symChanged, acct: () => A, isOpen: () => !!(panel && !panel.hidden)};
})(typeof self !== 'undefined' ? self : this);

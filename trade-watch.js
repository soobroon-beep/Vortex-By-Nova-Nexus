/* VORTEX · Seguimiento de tus trades abiertos (cuenta del exchange conectada en exchange.js).
   Solo trabaja cuando tienes posiciones abiertas; sin trades no revisa nada ni manda avisos.
   Te avisa cuando:
     · tu trade gana o pierde otro escalón de ROE (cada 10 % por defecto: +10, +20, +30… / −10, −20…)
     · se acerca a tu TP (80 % del camino) o lo toca
     · se acerca a tu stop loss (75 % del camino) o lo toca; si va perdiendo y no tienes SL también te lo recuerda
     · se acerca a la liquidación (le queda menos del 30 % del camino)
     · después de ir ganando regresa a tu precio de entrada (para que protejas con SL en breakeven)
     · cruza un nivel importante que tú marcaste en el gráfico (líneas y rayos horizontales)
   Al empezar a seguir un trade no avisa de lo que ya pasó: solo de lo nuevo.
   La misma lógica (funciones puras) la usa el servidor de avisos (worker/push-alerts.mjs) para avisarte con la app CERRADA.
   No es asesoría financiera: solo te dice cómo va tu trade. */
(function (root) {
  'use strict';
  const STEPS = [5, 10, 20, 25, 50], DEF_STEP = 10, MAX_TRADES = 10, MAX_LV = 12;
  const TP_NEAR = .8, SL_NEAR = .75, LIQ_NEAR = .7, BE_BAND = .15, LV_COOL = 30 * 60000;
  const fin = Number.isFinite;
  const num = v => { v = +v; return fin(v) ? v : NaN; };
  const r6 = v => +(+v).toPrecision(8);
  const fmt0 = p => { if (!fin(p)) return '—'; const a = Math.abs(p), d = a >= 1000 ? 1 : a >= 1 ? 2 : a >= .01 ? 4 : 8; return p.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d}); };
  const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 1) + ' %';
  const stripBase = b => String(b || '').toUpperCase().replace(/^(1000000|1000|1M)(?=[A-Z])/, '');

  /* ───────── Funciones puras (app y servidor) ───────── */
  function san(t) {
    if (!t || typeof t !== 'object') return null;
    const side = +t.side === -1 ? -1 : +t.side === 1 ? 1 : 0, entry = num(t.entry);
    const k = String(t.k || ''), b = String(t.b || '').toUpperCase();
    if (!side || !(entry > 0) || !/^[A-Za-z0-9_.:-]{2,40}(@[a-z]{2,10})?$/.test(k) || !/^[A-Z0-9.]{1,20}$/.test(b)) return null;
    const pos = v => { v = num(v); return v > 0 ? r6(v) : 0; };
    const lv = (Array.isArray(t.lv) ? t.lv : []).map(num).filter(v => v > 0).map(r6);
    return {id: String(t.id || idOf(b, side, entry)).slice(0, 48), k, b, side, entry: r6(entry), lev: Math.max(1, Math.min(200, Math.round(+t.lev) || 1)), tp: pos(t.tp), sl: pos(t.sl), liq: pos(t.liq),
      lv: [...new Set(lv)].slice(0, MAX_LV), ex: String(t.ex || '').slice(0, 20)};
  }
  const idOf = (b, side, entry) => `${b}:${side > 0 ? 'L' : 'S'}:${r6(entry)}`;
  const movePct = (t, p) => (p / t.entry - 1) * 100 * t.side; // % que se movió el precio a tu favor
  const roe = (t, p) => movePct(t, p) * t.lev; // ganancia/pérdida sobre tu margen (lo que enseña el exchange)
  const progress = (t, p, target) => { const d = target - t.entry; return d ? (p - t.entry) / d : 0; }; // 0 = en la entrada, 1 = llegó al objetivo
  const sideTxt = t => (t.side > 0 ? 'LONG' : 'SHORT') + (t.lev > 1 ? ' ' + t.lev + 'x' : '');

  /* Revisa un trade con el precio actual. mem guarda lo ya avisado (se modifica). Devuelve {msgs, changed}.
     La primera vez solo toma nota del estado (no avisa de lo que ya pasó). */
  function evalTrade(t, price, mem, now = Date.now(), opt = {}) {
    const msgs = []; let changed = false;
    if (!t || !(price > 0) || !mem || mem.done) return {msgs, changed};
    const step = STEPS.includes(+opt.step) ? +opt.step : DEF_STEP, f = typeof opt.fmt === 'function' ? opt.fmt : fmt0, url = opt.url || '';
    const R = roe(t, price), M = movePct(t, price), who = `${t.b} ${sideTxt(t)}`, now$ = `ahora ${f(price)}`, tag = k => 'tw-' + t.id + '-' + k;
    const ku = Math.max(0, Math.floor(R / step)), kd = Math.max(0, Math.floor(-R / step));
    const pTp = t.tp ? progress(t, price, t.tp) : NaN, pSl = t.sl ? progress(t, price, t.sl) : NaN, pLiq = t.liq ? progress(t, price, t.liq) : NaN;
    const lvSide = {}; for (const L of t.lv) lvSide[L] = price > L ? 1 : price < L ? -1 : 0;
    const set = (k, v) => { if (mem[k] !== v) { mem[k] = v; changed = true; } };
    const push = (kind, title, body) => msgs.push({kind, title: 'VORTEX · ' + title, body, tag: tag(kind), url});
    if (!mem.i) { // primera vez: se toma nota de dónde va y no se avisa nada viejo
      mem.i = 1; mem.up = ku; mem.dn = kd; mem.be = ku; mem.tpN = pTp >= TP_NEAR ? 1 : 0; mem.slN = pSl >= SL_NEAR ? 1 : 0; mem.lqN = pLiq >= LIQ_NEAR ? 1 : 0; mem.noSl = kd >= 1 ? 1 : 0;
      mem.ls = {}; for (const L of t.lv) if (lvSide[L]) mem.ls[L] = lvSide[L];
      return {msgs, changed: true};
    }
    // 1) Tocó TP / SL / liquidación: se avisa y se deja de seguir (lo más probable es que ya se cerró)
    if (pTp >= 1) { push('tp', 'Tocó tu TP', `${who} llegó a tu TP en ${f(t.tp)} · ${sgn(R)} · ${now$}`); set('done', 1); return {msgs, changed: true}; }
    if (pSl >= 1) { push('sl', 'Tocó tu stop loss', `${who} tocó tu SL en ${f(t.sl)} · ${sgn(R)} · ${now$}`); set('done', 1); return {msgs, changed: true}; }
    if (pLiq >= 1) { push('liq', 'Liquidación', `${who} llegó al precio de liquidación (${f(t.liq)})`); set('done', 1); return {msgs, changed: true}; }
    // 2) Peligro primero: cerca de la liquidación
    if (pLiq >= LIQ_NEAR && !mem.lqN) { push('liqN', 'Cuidado: cerca de liquidación', `${who} está a ${Math.abs((t.liq / price - 1) * 100).toFixed(2)} % de liquidarse (${f(t.liq)}) · ${sgn(R)} · ${now$}`); set('lqN', 1); }
    else if (mem.lqN && !(pLiq >= .5)) set('lqN', 0);
    // 3) Cerca del stop loss / del TP (se vuelve a armar si se aleja)
    if (pSl >= SL_NEAR && !mem.slN) { push('slN', 'Cerca de tu stop loss', `${who} va al ${Math.round(pSl * 100)} % del camino a tu SL (${f(t.sl)}) · ${sgn(R)} · ${now$}`); set('slN', 1); }
    else if (mem.slN && !(pSl >= .4)) set('slN', 0);
    if (pTp >= TP_NEAR && !mem.tpN) { push('tpN', 'Cerca de tu TP', `${who} ya recorrió el ${Math.round(pTp * 100)} % hacia tu TP (${f(t.tp)}) · ${sgn(R)} · ${now$}`); set('tpN', 1); }
    else if (mem.tpN && !(pTp >= .5)) set('tpN', 0);
    // 4) Escalones de ganancia y de pérdida (ROE)
    if (ku >= 1 && ku > (mem.up || 0)) { push('up', 'Tu trade va ganando', `${who}: ${sgn(R)} (precio ${sgn(M)}) · ${now$}${t.sl ? '' : ' · Considera poner un stop loss'}`); set('up', ku); }
    if (kd >= 1 && kd > (mem.dn || 0)) { push('dn', 'Tu trade va perdiendo', `${who}: ${sgn(R)} (precio ${sgn(M)}) · ${now$}${t.sl ? ' · SL en ' + f(t.sl) : ' · No tienes stop loss'}`); set('dn', kd); }
    // 5) Iba ganando y regresó a la entrada
    if ((mem.up || 0) >= 1 && (mem.be || 0) < mem.up && M <= BE_BAND) { push('be', 'Regresó a tu entrada', `${who} llegó a ${sgn((mem.up || 0) * step)} y volvió a tu entrada (${f(t.entry)}) · ${now$}. Puedes proteger con SL en breakeven`); set('be', mem.up); }
    // 6) Niveles importantes que marcaste en el gráfico
    mem.ls = mem.ls || {}; mem.lt = mem.lt || {};
    for (const L of t.lv) {
      const s = lvSide[L], prev = mem.ls[L]; if (!s) continue;
      if (!prev) { mem.ls[L] = s; changed = true; continue; }
      if (s === prev) continue;
      mem.ls[L] = s; changed = true;
      if (now - (mem.lt[L] || 0) < LV_COOL) continue; mem.lt[L] = now;
      const fav = s === t.side; push('lv', 'Nivel importante', `${t.b} cruzó tu nivel ${f(L)} hacia ${s > 0 ? 'arriba' : 'abajo'} (${fav ? 'a favor' : 'en contra'} de tu ${sideTxt(t)}) · ${sgn(R)} · ${now$}`);
    }
    for (const k of Object.keys(mem.ls)) if (!t.lv.includes(+k)) { delete mem.ls[k]; delete mem.lt[k]; changed = true; } // niveles que borraste
    return {msgs, changed};
  }

  /* Junta lo que manda la app con lo que ya tenía el servidor: conserva la memoria de cada trade que sigue abierto */
  function merge(incoming, current) {
    const cur = new Map((Array.isArray(current) ? current : []).map(t => [t.id, t]));
    return (Array.isArray(incoming) ? incoming : []).map(san).filter(Boolean).slice(0, MAX_TRADES).map(t => { const o = cur.get(t.id); return Object.assign(t, {m: o && o.m && typeof o.m === 'object' ? o.m : {}}); });
  }

  /* Clave de precio (formato de markets.js) para una posición de CCXT: se usa el mismo exchange si se puede */
  function keyFor(ccxtSym, exId, market) {
    const [bq] = String(ccxtSym || '').split(':'), [b, q0] = bq.split('/'), base = String(b || '').toUpperCase(), q = String(q0 || 'USDT').toUpperCase();
    if (!/^[A-Z0-9]{1,20}$/.test(base)) return '';
    if (market === 'spot') return base + (q === 'USD' ? 'USDT' : q);
    if (exId === 'bingx') return `${base}-${q}@bingxf`;
    if (exId === 'bybit') return `${base}${q}@bybitf`;
    if (exId === 'okx') return `${base}-${q}-SWAP@okxf`;
    return `${base}${q === 'USD' ? 'USDT' : q}@binancef`;
  }

  const api = {san, evalTrade, merge, keyFor, roe, movePct, progress, idOf, stripBase, STEPS, DEF_STEP, MAX_TRADES};

  /* ───────── En la app (navegador) ───────── */
  if (typeof document !== 'undefined' && typeof localStorage !== 'undefined') {
    const LS = 'cct_tw_v1', POLL = 15000;
    const load = () => { try { const o = JSON.parse(localStorage.getItem(LS) || '{}') || {}; return {step: STEPS.includes(+o.step) ? +o.step : DEF_STEP, mem: o.mem && typeof o.mem === 'object' ? o.mem : {}}; } catch { return {step: DEF_STEP, mem: {}}; } };
    let C = load(), H = null, trades = [], live = {}, timer = 0, busy = false, lastSig = '', subs = [];
    const store = () => { try { localStorage.setItem(LS, JSON.stringify(C)); } catch {} };
    const X = () => root.CCTExchange;
    const on = () => !(H && H.prefs && H.prefs().n && H.prefs().n.trade === false);
    const emit = () => { for (const f of subs) try { f(trades); } catch {} };

    function build() { // tus posiciones del exchange → trades a seguir
      const x = X(); if (!x || !x.connected()) return [];
      const S = x.snap() || {}, info = x.info() || {};
      return (S.positions || []).map(p => {
        const sideS = String(p.side || '').toLowerCase(), side = sideS === 'short' ? -1 : sideS === 'long' ? 1 : (+p.contracts < 0 ? -1 : 1);
        const k = keyFor(p.symbol, info.id, info.market), raw = String(p.symbol || '').split('/')[0].toUpperCase(), b = stripBase(raw);
        let pr = {}; try { pr = x.protections(p) || {}; } catch {}
        const lv = H && H.levels ? H.levels(b) : [];
        const t = san({k, b, side, entry: p.entryPrice, lev: p.leverage, tp: pr.tp && pr.tp.price, sl: pr.sl && pr.sl.price, liq: p.liquidationPrice, lv, ex: info.id});
        if (t) { const mk = num(p.markPrice); if (mk > 0 && !(live[t.id] > 0)) live[t.id] = mk; }
        return t;
      }).filter(Boolean).slice(0, MAX_TRADES);
    }
    function refresh() {
      const prev = trades, x = X(), ok = !!(x && x.connected() && !(x.snap() || {}).err); trades = build();
      const ids = new Set(trades.map(t => t.id));
      if (ok) for (const t of prev) if (!ids.has(t.id) && !trades.some(n => n.b === t.b && n.side === t.side)) { // se cerró (o lo cerraste): un último aviso
        const m = C.mem[t.id]; if (on() && m && m.i && !m.done && H) H.notify('VORTEX · Trade cerrado', `Tu ${t.b} ${t.side > 0 ? 'LONG' : 'SHORT'} ya no está abierto en tu exchange`, 'tw-' + t.id + '-closed');
      }
      for (const id of Object.keys(C.mem)) if (!ids.has(id)) delete C.mem[id];
      for (const id of Object.keys(live)) if (!ids.has(id)) delete live[id];
      store();
      const sig = JSON.stringify([on(), C.step, trades]);
      if (sig !== lastSig) { lastSig = sig; if (root.VortexPush) try { root.VortexPush.sync(); } catch {} }
      schedule(); emit();
    }
    function schedule() {
      clearTimeout(timer); if (!trades.length || !on()) return; // sin trades abiertos no se revisa nada
      timer = setTimeout(tick, POLL);
    }
    async function tick() {
      if (busy) return schedule(); busy = true;
      try {
        if (!trades.length || !on()) return;
        const keys = [...new Set(trades.map(t => t.k))]; let px = {};
        try { px = H && H.prices ? await H.prices(keys) : {}; } catch {}
        let any = false;
        for (const t of trades) {
          const p = num(px[t.k]) > 0 ? num(px[t.k]) : live[t.id]; if (!(p > 0)) continue; live[t.id] = p;
          const m = C.mem[t.id] || (C.mem[t.id] = {}), r = evalTrade(t, p, m, Date.now(), {step: C.step, fmt: H && H.fmt});
          if (r.changed) any = true;
          for (const msg of r.msgs) if (H) H.notify(msg.title, msg.body, msg.tag, msg.kind);
        }
        if (any) store(); emit();
      } finally { busy = false; schedule(); }
    }

    Object.assign(api, {
      host(h) { H = h; refresh(); },
      refresh,
      list: () => trades.slice(),
      on, step: () => C.step,
      setStep(v) { if (STEPS.includes(+v)) { C.step = +v; store(); refresh(); } },
      of(base) { const b = stripBase(base); const t = trades.find(x => x.b === b); if (!t) return null; const p = live[t.id]; return {side: t.side, lev: t.lev, roe: p > 0 ? roe(t, p) : NaN, entry: t.entry}; },
      payload: () => on() ? trades.map(t => Object.assign({}, t)) : [],
      onChange: f => { subs.push(f); }
    });
    const hook = () => { const x = X(); if (x && x.onChange) x.onChange(() => refresh()); };
    hook();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && trades.length) tick(); });
  }

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTTradeWatch = api;
})(typeof self !== 'undefined' ? self : this);

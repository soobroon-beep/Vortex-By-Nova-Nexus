/* VORTEX · Panel macro: lo que mueve al mercado por fuera de la cripto (dólar, bolsa, oro, petróleo, bonos, VIX,
   miedo y codicia, dominancia). Los datos los junta el servidor VORTEX (/macro) con caché de 5 min. Lectura educativa. */
(function (root) {
  'use strict';
  const URL_ = 'https://vortex-push.soobroon.workers.dev/macro', LS = 'cct_macro_v1', TTL = 5 * 60e3;
  const st = {d: null, at: 0, loading: false, err: '', el: null, timer: 0};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const fin = Number.isFinite;
  const nf = (v, d) => fin(v) ? v.toLocaleString('es-MX', {minimumFractionDigits: d, maximumFractionDigits: d}) : '—';
  const pct = v => fin(v) ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : '—';
  const cls = (v, inv) => !fin(v) || Math.abs(v) < 0.005 ? 'flat' : ((v > 0) !== !!inv ? 'up' : 'dn');

  // cada tarjeta: cómo se muestra y qué suele significar para la cripto (inv = subir es malo para el riesgo)
  const CARDS = [
    {k: 'dxy', n: 'Dólar (DXY)', s: 'Índice del dólar', f: v => nf(v, 2), inv: true,
      r: d => d.d1 > 0.05 ? 'Dólar fuerte: suele frenar a la cripto y al oro.' : d.d1 < -0.05 ? 'Dólar débil: suele dar aire a la cripto.' : 'Dólar estable hoy.'},
    {k: 'spx', n: 'S&P 500', s: 'Bolsa de EE. UU.', f: v => nf(v, 0),
      r: d => d.d1 > 0.1 ? 'Apetito por riesgo en la bolsa; la cripto suele acompañar.' : d.d1 < -0.1 ? 'La bolsa cae: la cripto suele sentirlo.' : 'Bolsa sin cambios fuertes.'},
    {k: 'ndx', n: 'Nasdaq', s: 'Tecnológicas', f: v => nf(v, 0),
      r: d => d.d1 > 0.1 ? 'Tecnológicas al alza: la más ligada a BTC.' : d.d1 < -0.1 ? 'Tecnológicas a la baja: ojo con BTC.' : 'Tecnológicas tranquilas.'},
    {k: 'us10y', n: 'Bono 10 años', s: 'Rendimiento EE. UU.', f: v => nf(v, 2) + '%', inv: true,
      r: d => d.d1 > 0.3 ? 'Rendimientos al alza: el dinero se encarece y pesa sobre el riesgo.' : d.d1 < -0.3 ? 'Rendimientos a la baja: alivio para activos de riesgo.' : 'Rendimientos estables.'},
    {k: 'vix', n: 'VIX', s: 'Índice del miedo', f: v => nf(v, 2), inv: true,
      r: d => d.last >= 30 ? 'Miedo alto en Wall Street: volatilidad fuerte.' : d.last >= 20 ? 'Nervios en el mercado: más volatilidad.' : d.last < 15 ? 'Mercado en calma.' : 'Volatilidad normal.'},
    {k: 'gold', n: 'Oro', s: 'Refugio · USD/oz', f: v => '$' + nf(v, 1),
      r: d => d.d1 > 0.3 ? 'Se busca refugio o protección contra la inflación.' : d.d1 < -0.3 ? 'Sale dinero del refugio.' : 'Oro estable.'},
    {k: 'oil', n: 'Petróleo WTI', s: 'USD por barril', f: v => '$' + nf(v, 2), inv: true,
      r: d => d.d1 > 1 ? 'Petróleo sube: presión sobre la inflación.' : d.d1 < -1 ? 'Petróleo baja: menos presión inflacionaria.' : 'Petróleo sin grandes cambios.'}
  ];
  const FNG = {'Extreme Fear': 'Miedo extremo', Fear: 'Miedo', Neutral: 'Neutral', Greed: 'Codicia', 'Extreme Greed': 'Codicia extrema'};
  const fngLabel = v => v < 25 ? 'Miedo extremo' : v < 45 ? 'Miedo' : v <= 55 ? 'Neutral' : v <= 75 ? 'Codicia' : 'Codicia extrema';
  const fngColor = v => v < 25 ? '#f6465d' : v < 45 ? '#f0883e' : v <= 55 ? '#c9b458' : v <= 75 ? '#7ccf6b' : '#0ecb81';

  function spark(arr, c) {
    const a = (arr || []).filter(fin); if (a.length < 2) return '';
    const w = 120, h = 34, mn = Math.min(...a), mx = Math.max(...a), rg = mx - mn || 1;
    const pts = a.map((v, i) => `${(i / (a.length - 1) * w).toFixed(1)},${(h - 3 - (v - mn) / rg * (h - 6)).toFixed(1)}`).join(' ');
    const col = c === 'up' ? 'var(--green)' : c === 'dn' ? 'var(--red)' : 'var(--muted)';
    return `<svg class="mc-sp" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  // resumen: cuántas señales favorecen o castigan a los activos de riesgo hoy
  function mood(d) {
    let s = 0, n = 0; const add = v => { s += v; n++; };
    if (d.dxy) add(d.dxy.d1 < -0.05 ? 1 : d.dxy.d1 > 0.05 ? -1 : 0);
    if (d.spx) add(d.spx.d1 > 0.1 ? 1 : d.spx.d1 < -0.1 ? -1 : 0);
    if (d.ndx) add(d.ndx.d1 > 0.1 ? 1 : d.ndx.d1 < -0.1 ? -1 : 0);
    if (d.us10y) add(d.us10y.d1 < -0.3 ? 1 : d.us10y.d1 > 0.3 ? -1 : 0);
    if (d.vix) add(d.vix.last < 18 ? 1 : d.vix.last >= 22 ? -1 : 0);
    if (!n) return null;
    const r = s / n;
    return r >= 0.34 ? {c: 'up', t: 'Favorable al riesgo', p: 'Dólar, bolsa, bonos y volatilidad acompañan hoy a los activos de riesgo como la cripto.'}
      : r <= -0.34 ? {c: 'dn', t: 'Ambiente defensivo', p: 'El contexto macro presiona hoy a los activos de riesgo: más cuidado con el apalancamiento.'}
      : {c: 'flat', t: 'Ambiente mixto', p: 'Las señales macro no apuntan en una sola dirección: manda más el propio gráfico.'};
  }

  function card(c, d) {
    if (!d) return `<div class="mc-card off"><div class="mc-h"><b>${c.n}</b><small>${c.s}</small></div><div class="mc-v">—</div><p class="mc-r">Sin datos ahora.</p></div>`;
    const k = cls(d.d1);
    return `<div class="mc-card"><div class="mc-h"><b>${c.n}</b><small>${c.s}</small></div>
      <div class="mc-row"><div class="mc-v">${c.f(d.last)}</div><span class="mc-ch ${k}">${pct(d.d1)}</span></div>
      ${spark(d.spark, cls(d.m1))}
      <div class="mc-per"><span>7 d <i class="${cls(d.w1)}">${pct(d.w1)}</i></span><span>30 d <i class="${cls(d.m1)}">${pct(d.m1)}</i></span></div>
      <p class="mc-r"><span class="mc-dot ${cls(d.d1, c.inv)}"></span>${esc(c.r(d))}</p></div>`;
  }

  function fngCard(f) {
    if (!f) return `<div class="mc-card mc-wide off"><div class="mc-h"><b>Miedo y codicia</b><small>Cripto</small></div><p class="mc-r">Sin datos ahora.</p></div>`;
    const v = f.last, col = fngColor(v), lab = FNG[f.label] || fngLabel(v), a = Math.PI * (1 - v / 100), x = 60 + 46 * Math.cos(a), y = 56 - 46 * Math.sin(a);
    return `<div class="mc-card mc-wide mc-fng"><div class="mc-h"><b>Miedo y codicia</b><small>Sentimiento cripto</small></div>
      <div class="mc-gauge"><svg viewBox="0 0 120 64" aria-hidden="true"><defs><linearGradient id="mcG" x1="0" x2="1"><stop offset="0" stop-color="#f6465d"/><stop offset=".45" stop-color="#f0b90b"/><stop offset="1" stop-color="#0ecb81"/></linearGradient></defs>
        <path d="M14 56 A46 46 0 0 1 106 56" fill="none" stroke="url(#mcG)" stroke-width="8" stroke-linecap="round" opacity=".9"/>
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${col}" stroke="#0b0e14" stroke-width="2.5"/></svg>
        <div class="mc-gv"><b style="color:${col}">${v}</b><span>${lab}</span></div></div>
      <div class="mc-per"><span>Ayer <i>${fin(f.prev) ? f.prev : '—'}</i></span><span>Hace 7 d <i>${fin(f.w1) ? f.w1 : '—'}</i></span></div>
      <p class="mc-r">${v < 25 ? 'Pánico: históricamente ha coincidido con zonas de oportunidad, pero también con caídas que siguen.' : v > 75 ? 'Euforia: el mercado suele estar extendido; cuidado con perseguir precio.' : 'Sentimiento sin extremos.'}</p></div>`;
  }

  function domCard(m) {
    if (!m) return `<div class="mc-card mc-wide off"><div class="mc-h"><b>Dominancia</b><small>Cripto</small></div><p class="mc-r">Sin datos ahora.</p></div>`;
    const st_ = (m.usdt || 0) + (m.usdc || 0), alt = Math.max(0, 100 - (m.btc || 0) - (m.eth || 0) - st_);
    const bar = (v, c) => `<i style="width:${Math.max(0, v).toFixed(2)}%;background:${c}"></i>`;
    const capT = fin(m.cap) ? '$' + (m.cap / 1e12).toLocaleString('es-MX', {maximumFractionDigits: 2}) + ' B' : '—';
    return `<div class="mc-card mc-wide"><div class="mc-h"><b>Dominancia</b><small>Reparto del mercado cripto</small></div>
      <div class="mc-dom">${bar(m.btc, '#f7931a')}${bar(m.eth, '#7b8cff')}${bar(st_, '#26a17b')}${bar(alt, '#8b93a7')}</div>
      <div class="mc-leg"><span><em style="background:#f7931a"></em>BTC ${nf(m.btc, 1)}%</span><span><em style="background:#7b8cff"></em>ETH ${nf(m.eth, 1)}%</span><span><em style="background:#26a17b"></em>Estables ${nf(st_, 1)}%</span><span><em style="background:#8b93a7"></em>Altcoins ${nf(alt, 1)}%</span></div>
      <div class="mc-per"><span>Capitalización total <i>${capT}</i></span><span>24 h <i class="${cls(m.capChg)}">${pct(m.capChg)}</i></span></div>
      <p class="mc-r">${st_ >= 7 ? 'Mucho dinero refugiado en estables: el mercado está a la defensiva.' : m.btc >= 58 ? 'BTC domina: las altcoins suelen quedarse atrás.' : 'Reparto equilibrado entre BTC y altcoins.'}</p></div>`;
  }

  function render() {
    const el = st.el; if (!el) return; const d = st.d;
    if (!d) { el.innerHTML = `<div class="mc-msg ${st.err ? 'warn' : ''}">${st.err ? esc(st.err) : 'Cargando datos macro…'}</div>`; return; }
    const m = mood(d), ago = Math.max(0, Math.round((Date.now() - (d.at || st.at)) / 60e3));
    el.innerHTML = `${m ? `<div class="mc-mood ${m.c}"><div><small>Contexto macro de hoy</small><b>${m.t}</b><p>${m.p}</p></div></div>` : ''}
      <div class="mc-grid">${fngCard(d.fng)}${domCard(d.dom)}${CARDS.map(c => card(c, d[c.k])).join('')}</div>
      <div class="mc-foot"><span>${st.loading ? 'Actualizando…' : 'Actualizado ' + (ago < 1 ? 'hace un momento' : `hace ${ago} min`)} · bolsa con hasta 15 min de retraso</span><button class="nw-ref" data-mc-ref>↻ Actualizar</button></div>
      <p class="mc-note">Lectura educativa del contexto, no es una recomendación de inversión.</p>`;
  }

  async function load(force) {
    if (st.loading) return; if (!force && st.d && Date.now() - st.at < TTL) { render(); return; }
    st.loading = true; st.err = ''; render();
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(URL_, {signal: ctl.signal}); clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(); if (!j || typeof j !== 'object' || j.error) throw new Error(j && j.error || 'sin datos');
      if (!j.dom || j.dom.partial) try { // el navegador sí llega a CoinGecko aunque el servidor no
        const g = (await (await fetch('https://api.coingecko.com/api/v3/global')).json()).data;
        if (g) j.dom = {btc: g.market_cap_percentage.btc, eth: g.market_cap_percentage.eth, usdt: g.market_cap_percentage.usdt, usdc: g.market_cap_percentage.usdc, cap: g.total_market_cap.usd, capChg: g.market_cap_change_percentage_24h_usd};
      } catch {}
      st.d = j; st.at = Date.now(); try { localStorage.setItem(LS, JSON.stringify({at: st.at, d: j})); } catch {}
    } catch (e) { if (!st.d) st.err = 'No se pudieron cargar los datos macro ahora. Revisa tu conexión y toca «Actualizar».'; }
    st.loading = false; render();
    if (st.err && st.el && !st.el.querySelector('[data-mc-ref]')) st.el.insertAdjacentHTML('beforeend', '<div class="mc-foot"><span></span><button class="nw-ref" data-mc-ref>↻ Actualizar</button></div>');
  }

  function show(el) {
    if (el && el !== st.el) {
      st.el = el;
      el.addEventListener('click', e => { if (e.target.closest('[data-mc-ref]')) load(true); });
      if (!st.d) try { const c = JSON.parse(localStorage.getItem(LS) || 'null'); if (c && c.d) { st.d = c.d; st.at = c.at || 0; } } catch {}
    }
    load(false);
    clearInterval(st.timer); st.timer = setInterval(() => { if (document.visibilityState === 'visible' && st.el && st.el.offsetParent !== null) load(true); }, TTL);
  }
  root.CCTMacro = {show, load, mood, data: () => st.d};
})(typeof self !== 'undefined' ? self : this);

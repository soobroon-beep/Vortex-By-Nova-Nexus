/* Interfaz de la pestaña IA: tres herramientas (Analizar gráfico · Briefing del día · Laboratorio de indicadores).
   Usa modelos abiertos y gratuitos a través de llm.js; si el modelo no responde, cae al analista local de reglas (ai.js).
   Solo esta sección es nueva: toca el resto de la app únicamente mediante window.CCT_ai (captura del gráfico y motor Pine) y CCT_getAIContext. */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search)) return;
  const AI = window.CCTAICore, LLM = window.CCTLLM; if (!AI || !LLM) return;
  const $ = (s, e) => (e || document).querySelector(s), esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const st = {view: 'home', busy: false, calendar: null, calAt: 0, abort: null,
    chart: {hist: [], shot: null}, brief: {text: '', at: 0, by: '', sym: ''}, lab: {hist: [], code: '', name: '', sid: null, res: null, metrics: null, msgs: [], pending: null, req: '', reqImg: null, img: null}};
  let root;

  function md(t) { // Markdown mínimo y seguro
    const out = []; let list = false;
    for (const ln of String(t).split('\n')) {
      const h = esc(ln).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/(^|[\s(])_(.+?)_(?=[\s).,;:]|$)/g, '$1<i>$2</i>'), li = /^\s*(?:[-•*]|\d+[.)]) (.*)/.exec(h);
      if (li) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + li[1] + '</li>'); continue; }
      if (list) { out.push('</ul>'); list = false; }
      const hd = /^#{1,4} (.*)/.exec(h); if (hd) out.push('<h4>' + hd[1] + '</h4>'); else if (h.trim()) out.push('<p>' + h + '</p>');
    }
    if (list) out.push('</ul>'); return out.join('');
  }
  const ico = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    chart: ico('<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 5-6"/><circle cx="8" cy="15" r="1"/><circle cx="19" cy="7" r="1"/>'),
    brief: ico('<path d="M5 4h11a2 2 0 0 1 2 2v13a1 1 0 0 0 1 1H7a2 2 0 0 1-2-2z"/><path d="M18 9h2a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2"/><path d="M9 8h5M9 12h5M9 16h3"/>'),
    lab: ico('<path d="M9 3h6"/><path d="M10 3v6L5 19a1.5 1.5 0 0 0 1.4 2h11.2A1.5 1.5 0 0 0 19 19l-5-10V3"/><path d="M8 15h8"/>'),
    back: ico('<path d="M15 6l-6 6 6 6"/>'), gear: ico('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    send: ico('<path d="M5 12l14-7-5 14-2.5-5.5z"/>')
  };
  const unsup = r => ((r && r.warnings) || []).filter(w => w.level === 'unsupported'), good = r => !!(r && r.ok && !unsup(r).length); // un script con funciones no soportadas «corre» pero devuelve na: no cuenta como válido
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'hora local'; } catch { return 'hora local'; } };
  const hhmm = t => new Date(t).toLocaleString('es', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false});

  async function loadCalendar() {
    if (st.calendar && Date.now() - st.calAt < 600e3) return st.calendar;
    try { const r = await fetch('calendar-data.json?_=' + Math.floor(Date.now() / 6e4), {cache: 'no-store'}); if (r.ok) { const j = await r.json(); st.calendar = j.events || []; st.calAt = Date.now(); st.calUpdated = j.at || 0; } } catch {}
    return st.calendar;
  }
  async function gather(withMarket, nMarket, noCtx) {
    const within = (p, ms, dflt) => Promise.race([p, new Promise(r => setTimeout(() => r(dflt), ms))]); // con mala señal (celular) nada se queda esperando
    const ctx = !noCtx && window.CCT_getAIContext && window.CCT_getAIContext(), news = window.CCTNews && window.CCTNews.items ? window.CCTNews.items() : [], cal = await within(loadCalendar(), 6000, st.calendar);
    let market = []; if (withMarket && window.CCT_getMarketSnapshot) { try { market = (await within(window.CCT_getMarketSnapshot(nMarket), 8000, [])) || []; } catch {} }
    return {ctx, extra: {news, calendar: cal || [], market, now: Date.now()}};
  }

  /* ───────── Mensajes para el modelo ───────── */
  const SYS = AI.SYSTEM + `\nIDIOMA: responde SIEMPRE en español.\nHONESTIDAD: no inventes datos, horarios, noticias ni precios; si falta un dato, dilo. Distingue hechos confirmados, opiniones y rumores. Nunca prometas ganancias ni des órdenes de compra/venta: solo escenarios educativos.`;
  const SYS_CHART = SYS + `\nTAREA: eres el analista del gráfico abierto del usuario. Recibirás una CAPTURA del gráfico (si el modelo la admite) y los DATOS de SUS indicadores (JSON: indicadores activos, valores, zonas, perfil de volumen, scripts Pine con sus líneas/tablas y las últimas velas).
REGLA CLAVE: básate SOLO en los indicadores y niveles que el usuario realmente tiene en el gráfico. La sección «lecturas_de_mis_indicadores» trae CADA indicador activo con su nombre y configuración (p. ej. «EMA 20»), valor actual, valores de hace 1/5/20 velas, pendiente, dónde está el precio respecto a la línea y su último cruce; «lo_que_se_ve_en_pantalla» es el tramo visible y «mis_dibujos_en_el_grafico» sus líneas y zonas. Comenta TODOS los indicadores de esas lecturas (ninguno se omite) y también sus scripts Pine y Nova Nexus si vienen. NO hables de indicadores que no estén en sus datos. Los números son reales; no inventes precios.
FORMATO (máximo ~260 palabras, viñetas cortas): ### Niveles clave (soportes y resistencias con precio: usa sus dibujos, zonas, medias y bandas; máximo 3 de cada uno) ### Qué dicen mis indicadores (UNA línea por CADA indicador de las lecturas: valor, si sube o baja, precio arriba/abajo y cruces recientes, p. ej. «EMA 20 (63,100): sube, precio 0.4% arriba, lo cruzó hacia arriba hace 3 velas») ### Niveles a vigilar (1-3, con qué pasaría si se pierden/rompen) ### Lectura rápida (1-2 frases: sesgo según la suma de sus indicadores y qué esperar). En preguntas de seguimiento responde corto y directo.`;
  const SYS_BRIEF = SYS + `\nTAREA: genera el BRIEFING DEL DÍA como RESUMEN CORTO del entorno de mercado GENERAL (máximo ~320 palabras, viñetas de una línea): sector cripto, bolsa de valores e inteligencia artificial. NO te enfoques en ninguna moneda en particular ni en el gráfico o la moneda que el usuario tenga abierta; NO analices gráficos ni menciones indicadores. Usa SOLO los datos entregados (calendario, noticias, mercado). Secciones (### con título), en este orden:
### Eventos importantes (los 3-5 más relevantes para la bolsa de valores y las criptomonedas: nombre, hora en la zona horaria indicada y en una frase por qué importa; si no hay eventos de impacto, dilo)
### Noticias que mueven el mercado (máx. 5 viñetas con fuente; distingue hecho, opinión o rumor)
### Novedades de IA (máx. 3 viñetas sobre lo nuevo o futuro de la inteligencia artificial que aparezca en las noticias; si no hay, di que las fuentes no traen novedades)
### Criptomonedas más sonadas (las 4-6 de las que más se habla ahora y con mayor movimiento: combina las MENCIONES en noticias con los MAYORES MOVIMIENTOS; di el porqué SOLO si las noticias o los datos lo explican, si no, solo el dato)
### Mi lectura del mercado (OBLIGATORIA: 2-3 frases con tu opinión como analista tras leer todo lo anterior: si es más probable que el mercado siga bajando, lateralice o suba, y por qué; usa lenguaje de probabilidad, nunca certezas)
### Qué vigilar hoy (1-2 líneas de cautela y horarios)
Cierra con «Análisis educativo, no asesoría financiera.»`;
  const NOVA_RE = /nova\s*nexus|novanexus|cripto\s*chaman|criptochaman/i; // nombre de tu indicador Nova Nexus (faltaba: el análisis tronaba con scripts Pine en el gráfico)
  function userData(ctx) { // solo lo que el usuario realmente tiene en el gráfico (sin EMA/RSI/MACD calculados por la app)
    const c = ctx.candles, r = x => x == null ? null : +(+x).toPrecision(7), hi = Math.max(...c.slice(-120).map(k => k.h)), lo = Math.min(...c.slice(-120).map(k => k.l));
    const novaOn = (ctx.pine || []).some(p => NOVA_RE.test(p.name)) || (ctx.active || []).some(k => /^nn|nova/i.test(k));
    return JSON.stringify({activo: ctx.symbol, marco: ctx.interval, precio: r(c[c.length - 1].c), cambio24h_pct: ctx.change24h, maximo_120_velas: r(hi), minimo_120_velas: r(lo),
      indicadores_activos_del_usuario: ctx.active, lecturas_de_mis_indicadores: ctx.lecturas, lo_que_se_ve_en_pantalla: ctx.visible, mis_dibujos_en_el_grafico: ctx.dibujos, valores_de_esos_indicadores: ctx.values, zonas_soporte_resistencia_dibujadas: ctx.zones, perfil_volumen: ctx.vp, scripts_pine_del_usuario: ctx.pine, nova_nexus: novaOn ? ctx.nova : undefined,
      ultimas_velas_OHLC: c.slice(-30).map(k => [r(k.o), r(k.h), r(k.l), r(k.c)])});
  }
  function dataBlock(ctx, extra) { return ctx ? userData(ctx) : JSON.stringify({sin_grafico: true}); }
  const COINS = [['BTC', /bitcoin|\bbtc\b/i], ['ETH', /ethereum|\bether\b|\beth\b/i], ['XRP', /\bxrp\b|ripple/i], ['SOL', /solana|\bsol\b/i], ['BNB', /\bbnb\b|binance coin/i], ['DOGE', /dogecoin|\bdoge\b/i], ['ADA', /cardano|\bada\b/i], ['TRX', /\btron\b|\btrx\b/i], ['AVAX', /avalanche|\bavax\b/i], ['LINK', /chainlink/i], ['SUI', /\bsui\b/i], ['TON', /toncoin/i], ['SHIB', /shiba/i], ['PEPE', /\bpepe\b/i], ['LTC', /litecoin/i], ['DOT', /polkadot/i], ['HYPE', /hyperliquid/i], ['ZEC', /zcash/i], ['XLM', /stellar/i], ['USDT', /tether|\busdt\b/i], ['USDC', /\busdc\b|circle/i]];
  function buzz(news, market, now) { // monedas más mencionadas en noticias recientes + mayores movimientos de 24 h (calculado aquí, no por el modelo)
    const rec = (news || []).filter(n => n.t > now - 36 * 36e5), cnt = {};
    const pats = COINS.slice(); for (const m of market || []) if (m.symbol && m.symbol.length >= 3 && !pats.some(c => c[0] === m.symbol)) pats.push([m.symbol, new RegExp('\\b' + m.symbol.replace(/[^A-Z0-9]/gi, '') + '\\b')]);
    for (const n of rec) { const t = n.title + ' ' + (n.desc || '').slice(0, 160); for (const [sym, re] of pats) if (re.test(t)) { (cnt[sym] = cnt[sym] || {n: 0, h: n.title}).n++; } }
    const ment = Object.entries(cnt).sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([sym, v]) => `- ${sym}: ${v.n} noticia(s) · p. ej. «${v.h.slice(0, 90)}»`).join('\n') || '(ninguna moneda destaca en las noticias cargadas)';
    const mv = (market || []).filter(m => m.volUsd > 2e6).sort((a, b) => Math.abs(b.chg24h) - Math.abs(a.chg24h)).slice(0, 8).map(m => `- ${m.symbol}: ${m.chg24h >= 0 ? '+' : ''}${(+m.chg24h).toFixed(1)}% en 24 h · volumen ${Math.round(m.volUsd / 1e6)} M USD`).join('\n') || '(sin datos)';
    return {ment, mv};
  }
  function briefExtras(extra) { // eventos y noticias con fecha/hora explícitas en la zona del usuario, para que el modelo no tenga que calcular horarios
    const now = extra.now, ev = (extra.calendar || []).filter(e => e.t > now - 3 * 36e5 && e.t < now + 72 * 36e5 && /high|medium|alto|medio/i.test(e.impact || '')).sort((a, b) => a.t - b.t).slice(0, 16);
    const evs = ev.map(e => `- ${hhmm(e.t)} (${tz()}) · ${e.country} · ${e.title} · impacto ${e.impact} · previsión ${e.forecast || '—'} · previo ${e.previous || '—'}${e.actual ? ' · REAL ' + e.actual : ''}`).join('\n') || '(sin eventos de impacto medio/alto en las próximas 72 h)';
    const rec = (extra.news || []).filter(n => n.t > now - 36 * 36e5), isAI = n => /\b(IA|AI)\b|inteligencia artificial|openai|anthropic|nvidia|chatgpt|gemini|claude|chip/i.test(n.title), pick = [...rec.filter(n => n.cat === 'cripto').slice(0, 10), ...rec.filter(n => n.cat === 'bolsa' || n.cat === 'macro').slice(0, 10), ...rec.filter(isAI).slice(0, 8)], seen = new Set(), nws = pick.filter(n => !seen.has(n.title) && seen.add(n.title)).sort((a, b) => b.t - a.t).map(n => `- ${hhmm(n.t)} · ${n.src || 'fuente'} · [${isAI(n) ? 'IA' : n.cat || 'mercado'}] ${n.title}`).join('\n') || '(sin noticias recientes cargadas)';
    const b = buzz(extra.news, extra.market, now);
    return `AHORA: ${new Date(now).toLocaleString('es', {dateStyle: 'full', timeStyle: 'short'})} (${tz()})\nCALENDARIO ECONÓMICO (hora local ${tz()}):\n${evs}\nNOTICIAS RECIENTES (fuente y fecha):\n${nws}\nMENCIONES DE MONEDAS EN NOTICIAS (más habladas):\n${b.ment}\nMAYORES MOVIMIENTOS EN 24 H (monedas con volumen):\n${b.mv}`;
  }

  /* ───────── Llamada con transmisión a una burbuja ───────── */
  async function callLLM(messages, opts, bubble) {
    const rend = (opts && opts.render) || (t => md(t));
    const o = Object.assign({}, opts, {onToken: t => { if (bubble) { bubble.innerHTML = rend(t) + '<span class="aiv-cursor"></span>'; scroll(); } }, onProgress: p => { if (bubble && p && p.text) bubble.innerHTML = `<p class="aiv-dim">${esc(p.text)}</p>`; }});
    const r = await LLM.chat(messages, o); if (bubble) bubble.innerHTML = rend(r.text); return r;
  }
  const scroll = () => { const l = $('#aivLog'); if (l) l.scrollTop = l.scrollHeight; };
  function bubble(role, html, cls) { const log = $('#aivLog'); const d = document.createElement('div'); d.className = 'aiv-msg ' + role + (cls ? ' ' + cls : ''); d.innerHTML = html; log.appendChild(d); scroll(); return d; }
  const setBusy = b => { st.busy = b; root.querySelectorAll('[data-busy-off]').forEach(x => { x.disabled = b; }); };
  const note = t => `<p class="aiv-dim">${esc(t)}</p>`;

  /* ───────── Pantalla de inicio ───────── */
  function head(title, sub) {
    const c = window.CCT_getAIContext && window.CCT_getAIContext();
    return `<div class="aiv-top">${st.view !== 'home' ? `<button class="aiv-ib" data-act="home" aria-label="Volver">${ICONS.back}</button>` : ''}<div class="aiv-title"><b>${esc(title)}</b><small>${esc(sub || (c ? c.symbol + ' · ' + c.interval : 'Sin gráfico cargado'))}</small></div><button class="aiv-ib" data-act="cfg" aria-label="Ajustes de la IA" title="Ajustes de la IA">${ICONS.gear}</button></div>`;
  }
  function home() {
    st.view = 'home';
    root.innerHTML = head('Asistente IA', LLM.providerLabel()) + `<div class="aiv-cards">
      <button class="aiv-card aiv-pixel" data-act="pixel"><span class="aivp-glow" aria-hidden="true"></span><span class="aivp-bot" aria-hidden="true">${window.NexusPixelHead ? window.NexusPixelHead('v') : ''}<i class="aivp-sp s1"></i><i class="aivp-sp s2"></i><i class="aivp-sp s3"></i></span><span class="aivp-txt"><em>Tu bot amigo</em><b>Nexus Pixel</b><small>Platica contigo y te dibuja canales, rangos y soportes en tu gráfico.</small><span class="aivp-go">Personalizar <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span></span></button>
      <button class="aiv-card" data-act="chart">${ICONS.chart}<span><b>Analizar gráfico con IA</b><small>Toma una captura de tu gráfico (con indicadores y dibujos), marca soportes y resistencias, y puedes seguir preguntándole.</small></span></button>
      <button class="aiv-card" data-act="brief">${ICONS.brief}<span><b>Briefing del día</b><small>Resumen corto de eventos importantes, noticias, novedades de IA, criptos más sonadas y la opinión de la IA sobre el mercado.</small></span></button>
      <button class="aiv-card" data-act="lab">${ICONS.lab}<span><b>Laboratorio de indicadores IA</b><small>Describe un indicador con tus palabras; la IA lo programa, lo valida y lo prueba en tu gráfico.</small></span></button>
    </div><p class="aiv-foot">Cada herramienta usa su propia IA gratuita (Pollinations): Análisis → GPT-5.4 nano con visión · Laboratorio → GPT-5.4 mini para código · Nexus Pixel → la suya de siempre. Si una no responde, pasa sola a otra. Análisis educativo, no asesoría financiera.</p>`;
  }

  /* ───────── 1 · Analizar gráfico ───────── */
  function chartView() {
    st.view = 'chart';
    root.innerHTML = head('Analizar gráfico') + `<div class="aiv-log" id="aivLog" aria-live="polite"></div>
      <div class="aiv-chips"><button data-act="reshot" data-busy-off>Nueva captura y análisis</button>${['¿Dónde están los soportes?', '¿Y las resistencias?', '¿Qué dicen mis indicadores?', 'Dame un plan con invalidación'].map(q => `<button data-q="${esc(q)}" data-busy-off>${esc(q)}</button>`).join('')}</div>
      <form class="aiv-form" id="aivForm"><input id="aivIn" placeholder="Pregunta sobre lo que ves en el gráfico…" autocomplete="off" maxlength="600"><button class="aiv-send" data-busy-off aria-label="Enviar">${ICONS.send}</button></form>`;
    if (!st.chart.hist.length) analyzeChart(); else { for (const m of st.chart.hist) if (!m.hidden) bubble(m.role === 'user' ? 'user' : 'bot', m.role === 'user' ? `<p>${esc(m.show || m.text)}</p>` : md(m.text)); }
  }
  async function analyzeChart() {
    if (st.busy) return; const g = await gather(false), ctx = g.ctx;
    if (!ctx) { bubble('bot', md('Aún no hay un gráfico con velas cargadas. Abre la pestaña **Gráfico**, espera a que cargue y vuelve aquí.')); return; }
    st.chart.hist = []; $('#aivLog').innerHTML = ''; setBusy(true);
    let cap = null; try { cap = window.CCT_ai && window.CCT_ai.capture(1100); } catch {} st.chart.shot = cap;
    if (cap) bubble('user', `<img class="aiv-shot" alt="Captura del gráfico" src="${cap.url}"><p>Analiza mi gráfico ${esc(cap.symbol)} · ${esc(cap.interval)}</p>`);
    else bubble('user', `<p>Analiza mi gráfico ${esc(ctx.symbol)} · ${esc(ctx.interval)}</p>`);
    let prompt, msgs; const b = bubble('bot', note('Analizando…'), 'typing');
    try { // si algo falla al preparar los datos, se avisa y se libera el botón (antes se quedaba «Analizando…» para siempre)
    prompt = `Resume este gráfico de ${ctx.symbol} en ${ctx.interval} usando solo mis indicadores (captura y datos).\n\nDATOS DE MIS INDICADORES (JSON, actualizados ahora):\n${dataBlock(ctx, g.extra)}`;
    msgs = [{role: 'system', content: SYS_CHART}, cap ? LLM.imageMessage(prompt, cap.url) : {role: 'user', content: prompt}];
      const r = await callLLM(msgs, {purpose: 'chart', needVision: !!cap, maxTokens: 1400}, b); b.classList.remove('typing');
      b.insertAdjacentHTML('beforeend', note(cap ? (r.image ? 'La IA recibió la captura del gráfico junto con los datos.' : 'La captura no se pudo usar en este momento: la IA analizó los datos reales de tus velas e indicadores.') : 'No se pudo tomar la captura (abre la pestaña Gráfico primero): analizó solo los datos numéricos.') + note('Modelo: ' + r.model));
      st.chart.hist.push({role: 'user', content: msgs[1].content, text: prompt, hidden: true}, {role: 'assistant', content: r.text, text: r.text});
    } catch (e) { b.classList.remove('typing'); let loc = ''; try { loc = AI.answerLocal('Analiza el gráfico', ctx, g.extra); } catch {} b.innerHTML = md('**No pude consultar el modelo de IA.** ' + LLM.friendly(e) + (loc ? '\n\nTe dejo el análisis local por reglas:\n\n' + loc : '')); }
    finally { setBusy(false); }
  }
  async function followUp(q) {
    q = String(q || '').trim(); if (!q || st.busy) return; if (!st.chart.hist.length) { await analyzeChart(); }
    const g = await gather(false), ctx = g.ctx; setBusy(true); bubble('user', `<p>${esc(q)}</p>`);
    if (!ctx) { bubble('bot', md('Abre un gráfico con velas para que pueda responderte con datos reales.')); setBusy(false); return; }
    const b = bubble('bot', note('Pensando…'), 'typing'); let text;
    try { text = `${q}\n\nDATOS ACTUALES DE MIS INDICADORES (JSON):\n${dataBlock(ctx, g.extra)}`; const hist = st.chart.hist.slice(-7);
      const msgs = [{role: 'system', content: SYS_CHART}, ...hist.map(m => ({role: m.role, content: m.content})), {role: 'user', content: text}];
      const r = await callLLM(msgs, {purpose: 'chart', needVision: LLM.hasImage(msgs), maxTokens: 800}, b); b.classList.remove('typing'); st.chart.hist.push({role: 'user', content: text, text: q, show: q, hidden: true}, {role: 'assistant', content: r.text, text: r.text}); }
    catch (e) { b.classList.remove('typing'); let loc = ''; try { loc = AI.answerLocal(q, ctx, g.extra); } catch {} b.innerHTML = md('**El modelo no respondió.** ' + LLM.friendly(e) + (loc ? '\n\nRespuesta local:\n\n' + loc : '')); }
    finally { setBusy(false); }
  }

  /* ───────── 2 · Briefing del día ───────── */
  function briefView(auto) {
    st.view = 'brief';
    root.innerHTML = head('Briefing del día') + `<div class="aiv-log" id="aivLog"></div><div class="aiv-bar"><button class="aiv-btn" data-act="rebrief" data-busy-off>Actualizar briefing</button></div>`;
    if (st.brief.text) renderBrief(); else if (auto !== false) makeBrief();
  }
  function renderBrief() {
    const b = st.brief; $('#aivLog').innerHTML = `<div class="aiv-msg bot full">${md(b.text)}</div>` + note(`Datos al ${new Date(b.at).toLocaleString('es', {dateStyle: 'medium', timeStyle: 'short'})} (${tz()}) · ${b.by}`) + `<details class="aiv-det"><summary>Fuentes de los datos</summary><p class="aiv-dim">Calendario económico: snapshot de ForexFactory${st.calUpdated ? ' actualizado ' + new Date(st.calUpdated).toLocaleString('es', {dateStyle: 'short', timeStyle: 'short'}) : ''} · Noticias: fuentes que ya tienes en la pestaña Noticias · Mercado: Binance Spot. Lo que no aparece en estas fuentes, la IA no lo conoce.</p></details>`;
  }
  async function makeBrief() {
    if (st.busy) return; setBusy(true); const log = $('#aivLog'); log.innerHTML = `<div class="aiv-msg bot typing">${note('Reuniendo calendario, noticias y mercado…')}</div>`;
    const g = await gather(true, 60, true), b = log.firstChild, prompt = `Genera el briefing del día (resumen corto del mercado, sin análisis de gráficos).\n\n${briefExtras(g.extra)}`;
    try {
      const r = await callLLM([{role: 'system', content: SYS_BRIEF}, {role: 'user', content: prompt}], {maxTokens: 1000, timeout: 120000}, b);
      st.brief = {text: r.text, at: Date.now(), by: 'Modelo: ' + r.model};
    } catch (e) {
      st.brief = {text: `**No pude consultar el modelo de IA** (${LLM.friendly(e)}). Este es el resumen por reglas con tus datos reales:\n\n` + AI.briefLocal(null, g.extra), at: Date.now(), by: 'Analista local por reglas (sin modelo)'};
    }
    renderBrief(); setBusy(false);
  }

  /* ───────── 3 · Laboratorio de indicadores ───────── */
  const LAB_EX = ['RSI con señales de compra al cruzar 30 hacia arriba y venta al cruzar 70 hacia abajo', 'Bandas de Bollinger que marquen cuando el precio cierra fuera de la banda y vuelve a entrar', 'Cruce de EMA 9 y EMA 21 con flechas y un fondo suave según la tendencia', 'ATR con un stop dinámico tipo Chandelier sobre el precio'];
  const DEF_Q = [['¿Va sobre las velas o en un panel aparte?', 'sobre las velas / panel aparte'], ['¿Qué periodos o parámetros quieres (editables)?', 'los típicos / personalizados'], ['¿Qué señales quieres que marque?', 'flechas compra-venta / solo líneas / fondo de color'], ['¿Qué condición debe cumplirse para una señal?', 'cruce / sobrecompra-sobreventa / ruptura'], ['¿Colores o estilo preferido?', 'verde-rojo / mis colores / tú eliges']];
  const partial = t => { const i = t.indexOf('```'), head = i >= 0 ? t.slice(0, i) : t; return md(head) + (i >= 0 ? `<p class="aiv-dim">⌨ Escribiendo el código… ${Math.max(0, t.slice(i).split('\n').length - 1)} líneas (no se muestra aquí: lo verás en «Ver código»)</p>` : ''); };
  function addMsg(role, html, cls) { // los mensajes del Laboratorio se guardan para que la conversación no se pierda al salir y volver
    const log = $('#aivLog'), out = $('#labOut'), d = document.createElement('div'); d.className = 'aiv-msg ' + role + (cls ? ' ' + cls : ''); d.innerHTML = html; log.insertBefore(d, out); scroll();
    const m = {role, html, el: d, cls}; st.lab.msgs.push(m); return m;
  }
  const setMsg = (m, html) => { m.html = html; m.el.innerHTML = html; m.el.classList.remove('typing'); scroll(); };
  function labView() {
    st.view = 'lab'; const L = st.lab;
    root.innerHTML = head('Laboratorio de indicadores IA') + `<div class="aiv-lab" id="aivLog">
      <div class="aiv-msg bot full">${md('Cuéntame qué indicador quieres. Antes de escribir el código te haré unas **5 preguntas** sobre lo que pides, para que quede lo más cercano posible a lo que buscas; luego lo programo, lo **valido** y lo pruebas en tu gráfico.')}</div>
      <div id="labOut"></div></div>
      <div class="aiv-chips">${LAB_EX.map(q => `<button data-lab="${esc(q)}" data-busy-off>${esc(q.length > 44 ? q.slice(0, 42) + '…' : q)}</button>`).join('')}</div>
      <div class="aiv-prev" id="labPrev" hidden></div><form class="aiv-form" id="labForm"><button type="button" class="aiv-ib" data-act="attach" aria-label="Adjuntar imagen de referencia" title="Adjuntar una imagen de cómo quieres el indicador"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.5l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.3-8.3"/></svg></button><input type="file" id="labFile" accept="image/*" hidden><textarea id="labIn" rows="2" placeholder="${L.code ? 'Pide un cambio: «hazlo más sensible», «añade alerta»…' : 'Ej.: indicador que marque cruces de EMA 20/50 con flechas'}" maxlength="900"></textarea><button class="aiv-send" data-busy-off aria-label="Enviar">${ICONS.send}</button></form>
      <div class="aiv-saved" id="labSaved"></div>`;
    const old = L.msgs; L.msgs = []; for (const m of old) addMsg(m.role, m.html, m.cls && m.cls !== 'typing' ? m.cls : ''); renderTail(); renderSaved();
  }
  function renderPrev() {
    const el = $('#labPrev'); if (!el) return; const L = st.lab; el.hidden = !L.img;
    el.innerHTML = L.img ? `<img src="${L.img}" alt="Imagen de referencia"><span class="aiv-dim">Imagen de referencia adjunta${LLM.load().lab === 'webllm' ? '. Con el modelo del navegador las imágenes son pesadas; si falla, cambia el Laboratorio a «Gratis» en ⚙.' : '.'}</span><button type="button" class="aiv-mini" data-act="unattach">Quitar</button>` : '';
  }
  function loadImage(file) { // reduce la imagen (máx. 1024 px) antes de enviarla al modelo
    return new Promise(res => { const fr = new FileReader(); fr.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, 1024 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .85)); }; im.onerror = () => res(null); im.src = fr.result; }; fr.onerror = () => res(null); fr.readAsDataURL(file); });
  }
  const userHtml = (txt, img) => (img ? `<img class="aiv-shot" alt="Imagen de referencia" src="${img}">` : '') + `<p>${esc(txt)}</p>`;
  function metricsHtml(m) {
    if (!m || !m.signals.length) return '<p class="aiv-dim">Este indicador no dibuja señales de compra/venta (marcas bajo/sobre la vela), así que no hay estadística de señales que mostrar.</p>';
    const row = s => `<tr><td>${esc(s.title)}</td><td>${s.n}</td>${[5, 10, 20].map(H => { const x = s.h[H]; return `<td>${x ? x.hit + '% · ' + (x.avg > 0 ? '+' : '') + x.avg + '%' : '—'}</td>`; }).join('')}</tr>`;
    return `<div class="aiv-tbl"><table><thead><tr><th>Señal</th><th>N</th><th>+5 velas</th><th>+10</th><th>+20</th></tr></thead><tbody>${m.signals.map(row).join('')}</tbody></table></div><p class="aiv-dim">«Acierto · media» = % de señales tras las que el precio se movió a favor y movimiento medio. ${esc(m.note)}</p>`;
  }
  function renderTail() { // al final de la conversación: el formulario de preguntas o la tarjeta del indicador (con sus botones)
    const out = $('#labOut'); if (!out) return; const L = st.lab;
    if (!L.code) { out.innerHTML = ''; return; }
    const val = L.res ? (good(L.res) ? '<div class="pine-box ok">✔ Código validado con el motor de tu app y ejecutado sobre las velas reales de este gráfico.</div>' + (L.res.warnings && L.res.warnings.length ? window.CCT_ai.msg(L.res, L.code) : '') : '<div class="pine-box err">No pude dejar el código libre de errores tras 3 intentos. Puedes pedirle un cambio con «Editar con IA».</div>' + window.CCT_ai.msg(L.res, L.code)) : '';
    out.innerHTML = `${val}
      <div class="aiv-actions"><button class="aiv-btn" data-act="try" ${good(L.res) ? '' : 'disabled'}>Probar en gráfico</button><button class="aiv-btn" data-act="save" ${L.sid && good(L.res) ? '' : 'disabled'}>Guardar indicador</button><button class="aiv-btn ghost" data-act="copy">Copiar código</button><button class="aiv-btn ghost" data-act="edit">Editar con IA</button><button class="aiv-btn ghost danger" data-act="del" ${L.sid ? '' : 'disabled'}>Eliminar</button></div>
      <details class="aiv-det"><summary>Ver código Pine (${L.code.split('\n').length} líneas)</summary><pre class="aiv-code">${esc(L.code)}</pre></details>
      ${good(L.res) ? `<details class="aiv-det" open><summary>Señales sobre el historial cargado (descriptivo)</summary>${metricsHtml(L.metrics)}</details>` : ''}`;
    scroll();
  }
  function renderSaved() {
    const el = $('#labSaved'); if (!el) return; const list = window.CCT_ai ? window.CCT_ai.list().filter(x => !x.temp) : [];
    el.innerHTML = list.length ? `<h4>Mis indicadores IA</h4>` + list.map(x => `<div class="aiv-saved-row"><b>${esc(x.name)}</b><span><button class="aiv-mini" data-sv="tog" data-id="${x.id}">${x.on ? 'Quitar del gráfico' : 'Al gráfico'}</button><button class="aiv-mini" data-sv="edit" data-id="${x.id}">Editar con IA</button><button class="aiv-mini danger" data-sv="del" data-id="${x.id}">Eliminar</button></span></div>`).join('') : '';
  }
  async function labSubmit(req) { // 1.ª petición: la IA pregunta en la conversación; tu respuesta → crea el indicador; con indicador ya hecho → edición directa
    const L = st.lab, img = L.img; req = String(req || '').trim() || (img ? 'Hazme un indicador como el de la imagen' : ''); if (!req || st.busy) return; L.img = null; renderPrev();
    if (L.code) return labGenerate(req, '', true, img);
    if (L.req) { const r0 = L.req, i0 = img || L.reqImg; L.req = ''; L.reqImg = null; return labGenerate(r0, 'Respuestas del usuario a tus preguntas (respétalas; si dejó algo sin responder o dijo que decidas tú, decide con criterio):\n' + req, true, i0, req, img); }
    addMsg('user', userHtml(req, img)); setBusy(true); const m = addMsg('bot', note('Pensando en qué preguntarte…'), 'typing'); let txt = '';
    const q = 'Indicador pedido: ' + req + (img ? ' (adjunto una imagen de referencia de cómo lo quiero)' : '');
    try { const r = await LLM.chat([{role: 'system', content: 'Eres un asistente que ayuda a definir indicadores técnicos de trading. El usuario pide un indicador. NO escribas código todavía. Responde en español con una frase breve y luego EXACTAMENTE 5 preguntas numeradas, cortas y específicas para ESE indicador (tipo de visualización: sobre las velas u oscilador en panel aparte; qué debe medir; parámetros o periodos; señales y condiciones; colores o estilo). Si hay imagen, no preguntes lo que ya se ve en ella. Al final de cada pregunta sugiere 2-3 opciones entre paréntesis. Termina con: «Respóndeme en un solo mensaje (puedes contestar solo algunas, o decir "tú decides")».'}, img ? LLM.imageMessage(q, img) : {role: 'user', content: q}], {purpose: 'lab', maxTokens: 500, temperature: .3, budget: 45000, needVision: !!img}); txt = r.text; } catch {}
    if ((txt.match(/^\s*\d+[.)]/gm) || []).length < 3) txt = 'Para dejarlo a tu gusto, cuéntame:\n' + DEF_Q.map((x, i) => `${i + 1}. ${x[0]} (${x[1]})`).join('\n') + '\n\nRespóndeme en un solo mensaje (puedes contestar solo algunas, o decir «tú decides»).';
    L.req = req; L.reqImg = img; setMsg(m, md(txt)); setBusy(false); const i = $('#labIn'); if (i) { i.placeholder = 'Responde a las preguntas (o «tú decides»)…'; i.focus(); }
  }
  const EDIT_SYS = '\nMODO EDICIÓN: modifica SOLO lo que pide el usuario; NO reescribas el indicador completo. Responde con 1-2 líneas explicando el cambio y después UNO O MÁS bloques de cambio con este formato EXACTO (copia las líneas a reemplazar tal cual están en el código actual):\n<<<<<<< SEARCH\n(líneas exactas del código actual)\n=======\n(líneas nuevas)\n>>>>>>> REPLACE\nPara AÑADIR algo, busca una línea existente cercana, repítela y agrega lo nuevo debajo. Para QUITAR algo, deja vacío el bloque de reemplazo. El cambio debe notarse: nunca devuelvas el mismo código.';
  function supportedList() { // funciones que de verdad entiende el motor Pine de tu app (así la IA no inventa funciones que fallan)
    try { const a = window.CCTPine && window.CCTPine.supported ? window.CCTPine.supported().filter(x => /^(ta|math|str|array|color|input|label|line|box|table|plot|plotshape|plotchar|hline|fill|bgcolor|barcolor|nz|na|fixnan|request\.security)/.test(x) && !/^(strategy|alert|request\.(financial|economic|earnings|dividends|splits))/.test(x)) : []; return a.length ? '\nFUNCIONES DISPONIBLES EN EL MOTOR (usa SOLO estas): ' + a.join(', ') : ''; } catch { return ''; }
  }
  async function labGenerate(...args) { // envoltura de seguridad: pase lo que pase, el Laboratorio nunca se queda bloqueado
    try { return await labGenerateRun(...args); }
    catch (e) { console.warn('[Laboratorio IA]', e); const m = addMsg('bot', md('**Algo falló al crear el indicador.** ' + esc(String(e && e.message || e)).slice(0, 160) + '\n\nInténtalo otra vez; si se repite, descríbelo con otras palabras.')); m.el.classList.remove('typing'); setBusy(false); renderTail(); }
  }
  async function labGenerateRun(req, prefs, showUser, img, shownText, shownImg) {
    req = String(req || '').trim(); if (!req || st.busy) return; const L = st.lab; setBusy(true); L.pending = null; $('#labOut').innerHTML = '';
    if (showUser) addMsg('user', userHtml(shownText || req, shownImg === undefined ? img : shownImg));
    const editing = !!L.code, base = L.code, bb = addMsg('bot', note(editing ? 'Aplicando solo tu cambio…' : 'Diseñando el indicador…'), 'typing');
    const mk = txt => img ? LLM.imageMessage(txt + '\n(Adjunto una imagen de referencia: imítala.)', img) : {role: 'user', content: txt};
    const ask = (editing ? `Código actual:\n\`\`\`pine\n${base}\n\`\`\`\nCambio pedido: ` : 'Quiero este indicador: ') + req + (prefs ? '\n\n' + prefs : '');
    const sys = LLM.PINE_GUIDE + supportedList() + '\nIMPORTANTE: en tu explicación NO repitas el código; explica en 2-4 líneas qué hace y cómo leerlo, y entrega el código SOLO dentro del bloque ```pine.' + (editing ? EDIT_SYS : '');
    const msgs = [{role: 'system', content: sys}, ...(editing ? [] : L.hist.slice(-4)), mk(ask)];
    let code = '', expl = '', res = null, err = '', mode = editing ? 'patch' : 'full', cur = base, patched = 0, lastR = null;
    const fix = (why) => `${why}\nCódigo actual (con tus cambios hasta ahora):\n\`\`\`pine\n${cur}\n\`\`\`\n` + (mode === 'patch' ? 'Corrígelo con bloques SEARCH/REPLACE.' : 'Devuélvelo corregido y completo en un bloque ```pine.');
    try {
      const labEnd = Date.now() + 260000; // todo el proceso (crear + corregir) en máximo ~4 minutos
      for (let tries = 0; tries < 4; tries++) {
        if (tries && Date.now() > labEnd - 25000) break;
        const r = await callLLM(msgs, {purpose: 'code', maxTokens: 4000, temperature: .2, budget: Math.max(25000, Math.min(170000, labEnd - Date.now())), render: partial}, tries ? null : bb.el); lastR = r;
        expl = LLM.stripCode(r.text.replace(/<{3,}\s*SEARCH[\s\S]*$/, '')) || expl; msgs.push({role: 'assistant', content: r.text}); code = '';
        if (mode === 'patch') {
          const pr = LLM.applyPatch(cur, r.text);
          if (pr.applied && pr.changed) { code = pr.code; patched += pr.applied; if (pr.failed.length) expl += '\n\n_(No pude aplicar una parte del cambio.)_'; }
          else if (!pr.found) { const full = LLM.extractCode(r.text); if (full && full !== cur) code = full; } // el modelo devolvió el código completo con el cambio
          if (!code) { err = pr.failed.length ? 'No encontré esas líneas en el código: ' + pr.failed.join(' | ') : 'No hubo ningún cambio en el código.'; if (tries >= 1) mode = 'full'; msgs.push({role: 'user', content: fix(err + (mode === 'full' ? ' Devuelve el código completo con el cambio ya aplicado, en un bloque ```pine.' : ' Copia las líneas EXACTAS y aplica el cambio pedido: ' + req))}); bb.el.classList.add('typing'); bb.el.innerHTML = note('Ajustando el cambio…'); continue; }
        } else {
          code = LLM.extractCode(r.text);
          if (!code) { err = 'La respuesta no incluyó un bloque de código Pine.'; msgs.push({role: 'user', content: 'Falta el bloque ```pine con el código completo. Devuélvelo.'}); continue; }
          if (editing && code === base) { err = 'No cambiaste nada'; msgs.push({role: 'user', content: `Devolviste el MISMO código. Aplica de verdad este cambio: ${req}`}); continue; }
        }
        res = await window.CCT_ai.run(code, 'Indicador IA'); cur = code;
        if (good(res)) { err = ''; break; }
        err = (res && res.error && res.error.msg) || unsup(res).map(w => `línea ${w.line}: ${w.msg}`).join('; ') || 'Error desconocido'; bb.el.classList.add('typing'); bb.el.innerHTML = note(`Corrigiendo un error del código (intento ${tries + 1}/4)…`);
        msgs.push({role: 'user', content: fix(`El código falló en el intérprete de Pine de la app: «${err}»${res && res.error && res.error.line ? ' (línea ' + res.error.line + ')' : ''}. Esas funciones no existen en el intérprete: reemplázalas por cálculos con ta.*, math.* u operaciones básicas. Revisa paréntesis y comas, y que cada llamada quede en una sola línea.`)});
      }
    } catch (e) { setMsg(bb, md('**No pude consultar el modelo de IA.** ' + LLM.friendly(e) + '\n\nPuedes cambiar de proveedor en ⚙ e intentarlo otra vez.')); setBusy(false); renderTail(); return; }
    const unchanged = editing && (!code || code === base);
    setMsg(bb, md((expl || (unchanged ? '' : 'Listo, aquí está.')) + (unchanged ? '\n\n**No logré aplicar tu cambio.** El indicador quedó igual. Intenta describirlo con otras palabras o más específico (por ejemplo: «cambia el periodo de la media rápida a 12»).' : editing && patched ? `\n\n_Cambio aplicado sobre el indicador actual (${patched} bloque${patched > 1 ? 's' : ''}); ya se ve en el gráfico._` : '')) + (img && lastR && !lastR.image ? note('El modelo no pudo ver la imagen; trabajé con tu descripción.') : ''));
    if (code && !unchanged) {
      L.code = code; L.res = res; L.metrics = good(res) ? LLM.signalMetrics(window.CCT_ai.candles(), res) : null;
      L.hist.push({role: 'user', content: req}, {role: 'assistant', content: (expl || 'Listo.').slice(0, 400)}); if (L.hist.length > 8) L.hist.splice(0, 2);
      if (good(res)) { if (L.sid && window.CCT_ai.list().some(x => x.id === L.sid)) window.CCT_ai.update(L.sid, code, res); else L.sid = window.CCT_ai.tryOnChart(code, 'Indicador IA', res); } // en vivo: el mismo indicador se actualiza en el gráfico
      else if (L.sid) { window.CCT_ai.remove(L.sid, true); L.sid = null; }
    }
    setBusy(false); renderTail(); renderSaved(); const i = $('#labIn'); if (i) i.placeholder = 'Pide un cambio: «hazlo más sensible», «añade alerta»…';
  }
  const copyText = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} a.remove(); return ok; } };

  /* ───────── Personalizar a Nexus Pixel (se abre desde su tarjeta) ───────── */
  const PXN = {sr: 'Soportes y resistencias', trend: 'Tendencia', channel: 'Canal', range: 'Rango', fib: 'Fibonacci'}, PXC = {purple: '#b46bff', blue: '#4cc3ff', orange: '#ff9d3c', mint: '#3ff0c0', red: '#ff4d6d'};
  function pixelView() {
    const B = window.CCT_pixel; if (!B || !B.cfg) return; const c = B.cfg(), O = B.opts; st.view = 'pixel';
    const chips = (k, list, cur, multi) => `<div class="pxc-chips">${list.map(([v, n]) => `<button type="button" data-pxk="${k}" data-v="${esc(v)}" ${multi ? 'data-multi="1"' : ''} class="${(multi ? cur.includes(v) : cur === v) ? 'on' : ''}">${esc(n)}</button>`).join('')}</div>`;
    const head2 = window.NexusPixelHead ? window.NexusPixelHead('v') : '';
    root.innerHTML = head('Nexus Pixel', 'Personaliza a tu bot amigo') + `<div class="pxc">
      <div class="pxc-hero"><span class="pxc-prev" data-c="${c.color}">${head2}</span><div><b>Hazlo a tu forma</b><small>Pixel usará esto cada vez que platiques con él o le pidas dibujar. Se guarda en tu cuenta (PC y celular).</small></div></div>
      <button class="aiv-btn pxc-call" type="button" data-act="pxcall">Llamar a Pixel al gráfico</button>
      <label class="pxc-l">¿Cómo te llamo?<input id="pxNombre" maxlength="30" value="${esc(c.nombre)}" placeholder="Tu nombre o apodo"></label>
      <div class="pxc-l">Cómo operas${chips('estilo', O.estilo.map(x => [x, x[0].toUpperCase() + x.slice(1)]), c.estilo)}</div>
      <div class="pxc-l">Tus temporalidades favoritas${chips('tfs', B.intervals().map(x => [x, x]), c.tfs, true)}</div>
      <div class="pxc-l">Nivel de riesgo${chips('riesgo', O.riesgo.map(x => [x, x[0].toUpperCase() + x.slice(1)]), c.riesgo)}</div>
      <label class="pxc-l">Tus reglas de trading<textarea id="pxReglas" rows="4" maxlength="1500" placeholder="Ej.: Solo opero a favor de la EMA 200. No entro si el RSI está en sobrecompra. Siempre con stop loss bajo el último mínimo.">${esc(c.reglas)}</textarea></label>
      <label class="pxc-l">Cosas que siempre debe recordar<textarea id="pxNotas" rows="3" maxlength="1000" placeholder="Ej.: Mi indicador principal es Nova Nexus. Me interesan las zonas de liquidez. Opero BTC y SOL.">${esc(c.notas)}</textarea></label>
      <div class="pxc-l">Cómo te habla${chips('tono', O.tono.map(x => [x, x[0].toUpperCase() + x.slice(1)]), c.tono)}${chips('trato', O.trato.map(x => [x, x[0].toUpperCase() + x.slice(1)]), c.trato)}</div>
      <div class="pxc-l">«Análisis completo» dibuja${chips('completo', O.completo.map(x => [x, PXN[x]]), c.completo, true)}</div>
      <label class="pxc-l">Soportes y resistencias por lado<input id="pxSr" type="range" min="1" max="5" value="${c.sr}"><small class="pxc-n" id="pxSrN">${c.sr}</small></label>
      <div class="pxc-l pxc-cols"><label>Color de soportes<input id="pxColSup" type="color" value="${c.colSup || '#20bf9f'}"></label><label>Color de resistencias<input id="pxColRes" type="color" value="${c.colRes || '#f06b79'}"></label></div>
      <div class="pxc-l">Color de su luz${chips('color', O.color.map(x => [x, '']), c.color)}</div>
      <div class="pxc-l">Sugerencias (se asoma de vez en cuando a ofrecerte ayuda)${chips('tips', [['on', 'Sí'], ['off', 'No']], c.tips === false ? 'off' : 'on')}</div>
      <div class="aiv-actions"><button class="aiv-btn" type="button" data-act="pxsave">Guardar</button></div><p class="aiv-dim" id="pxMsg"></p></div>`;
    root.querySelectorAll('[data-pxk="color"]').forEach(b => { b.style.background = PXC[b.dataset.v]; b.setAttribute('aria-label', b.dataset.v); });
    const r = $('#pxSr'); if (r) r.oninput = () => { $('#pxSrN').textContent = r.value; };
  }
  function pixelSave() {
    const B = window.CCT_pixel; if (!B) return; const on = k => [...root.querySelectorAll(`[data-pxk="${k}"].on`)].map(b => b.dataset.v), one = k => on(k)[0];
    const c = B.setCfg({nombre: $('#pxNombre').value.trim(), estilo: one('estilo'), riesgo: one('riesgo'), tono: one('tono'), trato: one('trato'), color: one('color'), tfs: on('tfs'), completo: on('completo'), reglas: $('#pxReglas').value.trim(), notas: $('#pxNotas').value.trim(), sr: +$('#pxSr').value, colSup: $('#pxColSup').value, colRes: $('#pxColRes').value, tips: one('tips') !== 'off'});
    const m = $('#pxMsg'); if (m) { m.textContent = `✓ Guardado. Pixel ya te conoce${c.nombre ? ', ' + c.nombre : ''}.`; m.className = 'aiv-dim ok'; }
  }

  /* ───────── Ajustes ───────── */
  function cfgView() {
    const c = LLM.load(), prev = st.view; st.cfgPrev = prev; st.view = 'cfg';
    root.innerHTML = head('Ajustes de la IA', 'Proveedor del modelo') + `<div class="aiv-cfg">
      <label>Proveedor<select id="cfProv"><option value="free">Gratis · modelos abiertos (sin clave)</option><option value="compat">Mi servidor / Ollama / servicio con clave gratuita</option><option value="webllm">En mi navegador (WebLLM, experimental)</option></select></label>
      <label>Proveedor del Laboratorio de indicadores (código)<select id="cfLab"><option value="webllm">En mi navegador (WebLLM) — recomendado</option><option value="free">Gratis · modelos abiertos (sin clave)</option><option value="compat">Mi servidor / Ollama</option></select></label>
      <div class="aiv-srv"><b>IA lista para usar</b><small id="cfSrvSt" class="ok">✓ Configurada: cualquier persona puede usar la IA sin poner claves ni datos.</small></div>
      <div id="cfCompat"><label>URL compatible con OpenAI<input id="cfUrl" value="${esc(c.compat.url)}" autocomplete="off" spellcheck="false" placeholder="http://localhost:11434/v1"></label>
        <label>Modelo<input id="cfModel" value="${esc(c.compat.model)}" autocomplete="off" spellcheck="false" placeholder="qwen2.5vl:7b"></label>
        <label>Clave (opcional)<input id="cfKey" type="password" value="${esc(c.compat.key)}" autocomplete="off" placeholder="solo si el servicio la pide"></label>
        <label class="aiv-chk"><input id="cfVis" type="checkbox" ${c.compat.vision ? 'checked' : ''}> El modelo entiende imágenes (necesario para analizar la captura)</label>
        <p class="aiv-dim">Ejemplos gratuitos: <b>Ollama</b> en tu computadora (<code>http://localhost:11434/v1</code>, modelo <code>qwen2.5vl</code> o <code>llama3.2-vision</code>; para usarlo desde esta web ejecuta Ollama con <code>OLLAMA_ORIGINS=*</code>), <b>LM Studio</b>, o los planes gratuitos de Groq / OpenRouter con su clave.</p></div>
      <p class="aiv-dim" id="cfNote"></p>
      <div class="aiv-actions"><button class="aiv-btn" data-act="cfsave">Guardar</button><button class="aiv-btn ghost" data-act="cftest">Probar conexión</button></div><div id="cfOut"></div></div>`;
    $('#cfProv').value = c.provider; $('#cfLab').value = c.lab; const sync = () => { const p = $('#cfProv').value; $('#cfCompat').hidden = p !== 'compat' && $('#cfLab').value !== 'compat'; $('#cfNote').textContent = p === 'free' ? 'Privacidad: tu pregunta, los datos del gráfico y la captura viajan al servicio gratuito de terceros (Pollinations), que usa modelos abiertos. No incluyas nada que no quieras compartir. Es un servicio comunitario: puede ir lento o saturarse.' : p === 'webllm' ? 'El modelo se descarga una vez (cientos de MB) y corre en tu equipo con WebGPU: nada sale de tu navegador. Necesita Chrome/Edge de escritorio reciente y buena memoria gráfica. Es experimental.' : 'Los datos van solo a la URL que indiques (si es tu computadora, no salen de ella). La clave se guarda solo en este navegador.'; };
    $('#cfProv').onchange = sync; $('#cfLab').onchange = sync; sync();
  }
  function readCfg() { return {provider: $('#cfProv').value, lab: $('#cfLab').value, webllmOptIn: $('#cfProv').value === 'webllm' || $('#cfLab').value === 'webllm', pkey: '', compat: {url: $('#cfUrl').value.trim(), key: $('#cfKey').value.trim(), model: $('#cfModel').value.trim(), vision: $('#cfVis').checked}}; }

  /* ───────── Eventos ───────── */
  function onClick(e) {
    const t = e.target.closest('[data-act],[data-q],[data-lab],[data-sv],[data-pxk]'); if (!t) return;
    if (t.dataset.q) return followUp(t.dataset.q);
    if (t.dataset.lab) { const i = $('#labIn'); if (i) { i.value = t.dataset.lab; i.focus(); } return; }
    if (t.dataset.sv) { const L = st.lab, A = window.CCT_ai, id = t.dataset.id, x = A.list().find(y => y.id === id); if (!x) return;
      if (t.dataset.sv === 'tog') { A.toggle(id, !x.on); renderSaved(); } else if (t.dataset.sv === 'del') { if (confirm(`¿Eliminar el indicador «${x.name}»?`)) { A.remove(id); if (L.sid === id) { L.sid = null; L.code = ''; L.res = null; } renderTail(); renderSaved(); } }
      else { L.code = x.code; L.sid = id; L.res = null; L.req = ''; L.hist = []; addMsg('bot', md(`Editando **${x.name}**. Dime qué quieres cambiar.`)); renderTail(); const i = $('#labIn'); if (i) i.focus(); } return; }
    const a = t.dataset.act, L = st.lab, A = window.CCT_ai;
    if (a === 'pixel') { pixelView(); return; }
    if (a === 'pxcall') { if (window.CCT_switchView) window.CCT_switchView('chartView'); setTimeout(() => { if (window.NexusPixel) window.NexusPixel.show(true); }, 350); return; }
    if (a === 'pxsave') { pixelSave(); return; }
    if (t.dataset.pxk) { const k = t.dataset.pxk, v = t.dataset.v; if (t.dataset.multi) t.classList.toggle('on'); else { root.querySelectorAll(`[data-pxk="${k}"]`).forEach(b => b.classList.toggle('on', b === t)); } if (k === 'color') { const h = root.querySelector('.pxc-prev'); if (h) h.dataset.c = v; } return; }
    if (a === 'home') home(); else if (a === 'chart') chartView(); else if (a === 'brief') briefView(); else if (a === 'lab') labView(); else if (a === 'cfg') cfgView();
    else if (a === 'cfsk') { const i = $('#cfSk'), st2 = $('#cfSrvSt'), k = i ? i.value.trim() : ''; if (!/^sk_/.test(k)) { if (st2) st2.textContent = 'Pega tu clave sk_…'; return; } if (st2) st2.textContent = 'Guardando…'; LLM.serverSetKey(k).then(() => { i.value = ''; if (st2) { st2.textContent = '✓ Guardada para siempre en tu servidor. Ya puedes usar la IA en todos tus dispositivos.'; st2.className = 'ok'; } }).catch(e => { if (st2) { st2.textContent = '✗ ' + (e.message || 'No se pudo guardar'); st2.className = 'err'; } }); return; }
    else if (a === 'reshot') analyzeChart(); else if (a === 'rebrief') makeBrief();
    else if (a === 'try') { if (L.sid && A.list().some(x => x.id === L.sid)) { A.toggle(L.sid, true); } else if (good(L.res)) L.sid = A.tryOnChart(L.code, 'Indicador IA', L.res); renderTail(); }
    else if (a === 'save') { if (L.sid && A.keep(L.sid)) { renderSaved(); const b = document.createElement('div'); b.className = 'pine-box ok'; b.textContent = 'Guardado en «Mis indicadores IA» y en tus scripts de Pine.'; $('#labOut').prepend(b); } }
    else if (a === 'attach') { const f = $('#labFile'); if (f) f.click(); }
    else if (a === 'unattach') { L.img = null; renderPrev(); }
    else if (a === 'copy') { copyText(L.code).then(ok => { const b = t; const o = b.textContent; b.textContent = ok ? '¡Copiado!' : 'No se pudo copiar'; setTimeout(() => { b.textContent = o; }, 1500); }); }
    else if (a === 'edit') { const i = $('#labIn'); if (i) { i.focus(); i.placeholder = 'Dime qué cambiar: «hazlo más sensible», «añade una alerta»…'; } }
    else if (a === 'del') { if (L.sid && confirm('¿Quitar este indicador del gráfico y eliminarlo?')) { A.remove(L.sid); L.sid = null; L.code = ''; L.res = null; L.hist = []; renderTail(); renderSaved(); } }
    else if (a === 'cfsave') { LLM.save(readCfg()); home(); }
    else if (a === 'cftest') { const out = $('#cfOut'); out.innerHTML = note('Probando…'); LLM.chat([{role: 'user', content: 'Responde solo: OK'}], {cfg: readCfg(), maxTokens: 20, timeout: 45000}).then(r => { out.innerHTML = `<div class="pine-box ok">✔ Conectado. Modelo: ${esc(r.model)}</div>`; }).catch(er => { out.innerHTML = `<div class="pine-box err">${esc(LLM.friendly(er))}</div>`; }); }
  }
  function init() {
    root = document.getElementById('aiRoot'); if (!root) return; root.classList.add('aiv');
    root.addEventListener('click', onClick);
    root.addEventListener('change', async e => { if (e.target.id === 'labFile' && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ''; if (f.size > 12e6) return; const u = await loadImage(f); if (u) { st.lab.img = u; renderPrev(); } } });
    root.addEventListener('submit', e => {
      e.preventDefault();
      if (e.target.id === 'aivForm') { const i = $('#aivIn'), v = i.value; i.value = ''; followUp(v); }
      else if (e.target.id === 'labForm') { const i = $('#labIn'), v = i.value; i.value = ''; labSubmit(v); }
    });
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'labIn') { e.preventDefault(); const i = e.target, v = i.value; i.value = ''; labSubmit(v); } });
    home();
    document.addEventListener('click', e => { if (e.target.closest('[data-side="aiView"],[data-view="aiView"]') && st.view === 'home') setTimeout(home, 60); });
  }
  window.CCTAIUI = Object.assign(window.CCTAIUI || {}, {md});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

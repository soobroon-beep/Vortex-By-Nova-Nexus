/* Próximo evento importante del calendario económico, en la barra inferior del gráfico (solo escritorio).
   Muestra impacto, país, nombre, hora, cuenta atrás, previsión y, cuando sale, el resultado publicado.
   Los datos vienen de calendar-data.json (ForexFactory, lo actualiza un flujo de GitHub); este archivo solo los lee. Las funciones puras se prueban aparte. */
(function (root) {
  'use strict';
  const REL = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'ALL'], LIVE_MS = 30 * 6e4, KEEP_MS = 6 * 36e5;
  const COUNTRY = {USD: 'EE. UU.', EUR: 'Eurozona', GBP: 'Reino Unido', JPY: 'Japón', CNY: 'China', CAD: 'Canadá', AUD: 'Australia', CHF: 'Suiza', NZD: 'Nueva Zelanda', ALL: 'Global'};
  const imp = e => /high|alto/i.test(e.impact) ? 2 : /medium|medio/i.test(e.impact) ? 1 : 0;
  const has = v => v !== undefined && v !== null && String(v).trim() !== '';
  const num = s => { if (!has(s)) return null; const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  function arrow(e) { // el dato publicado frente a la previsión: 1 por encima, -1 por debajo, 0 igual, null si no se puede comparar
    const a = num(e.actual), f = num(e.forecast); if (a == null || f == null) return null; return a > f ? 1 : a < f ? -1 : 0;
  }
  function shortName(title) { // «NFP · Non-Farm…» → solo la parte en español si existe
    const s = root.CCTAICore && root.CCTAICore.trCal ? root.CCTAICore.trCal(String(title || '')) : String(title || ''), i = s.indexOf(' · '); return i > 0 ? s.slice(0, i) : s;
  }
  function group(list) { // eventos a la misma hora (p. ej. IPC e IPC subyacente): uno principal + cuántos más
    if (!list.length) return null; const t = list[0].t, same = list.filter(e => e.t === t), main = same.find(e => has(e.forecast) || has(e.actual)) || same[0];
    return {main, extra: same.length - 1, all: same};
  }
  function pick(events, now) { // {mode: 'live'|'next', ev: grupo} o null si no hay nada importante cerca
    if (!Array.isArray(events)) return null;
    const hi = events.filter(e => e && Number.isFinite(e.t) && imp(e) === 2 && REL.includes(e.country));
    const live = hi.filter(e => e.t <= now && now - e.t < LIVE_MS).sort((a, b) => b.t - a.t), next = hi.filter(e => e.t > now).sort((a, b) => a.t - b.t);
    if (live.length) return {mode: 'live', ev: group(live)};
    if (next.length) return {mode: 'next', ev: group(next)};
    return null;
  }
  function lists(events, now) { // para la ventana: resultados recientes (últimas 24 h con dato) y próximos (72 h, impacto medio o alto)
    const ok = e => e && Number.isFinite(e.t) && imp(e) >= 1 && REL.includes(e.country);
    const recent = events.filter(e => ok(e) && e.t <= now && now - e.t < 24 * 36e5 && has(e.actual)).sort((a, b) => b.t - a.t).slice(0, 4);
    const upcoming = events.filter(e => ok(e) && e.t > now && e.t - now < 72 * 36e5).sort((a, b) => a.t - b.t || imp(b) - imp(a)).slice(0, 7);
    return {recent, upcoming};
  }
  function left(ms) { // «en 2 h 15 m», «en 12 m», «en 45 s»
    if (ms < 0) return 'ahora'; const s = Math.ceil(ms / 1000); if (s < 90) return 'en ' + s + ' s'; const m = Math.round(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    return 'en ' + (d >= 1 ? `${d} d ${h % 24} h` : h ? (m % 60 ? `${h} h ${m % 60} m` : `${h} h`) : `${m} m`);
  }
  /* Nombres en español para los eventos que la traducción general no cubre */
  const ES = [[/mpc .*votes/i, 'Votos de tasas del Banco de Inglaterra'], [/unemployment claims/i, 'Peticiones de subsidio por desempleo'], [/average hourly earnings/i, 'Salario medio por hora'], [/^employment change/i, 'Cambio en el empleo'],
    [/congressional elections/i, 'Elecciones legislativas'], [/parliamentary elections/i, 'Elecciones parlamentarias'], [/monetary policy summary/i, 'Resumen de política monetaria'],
    [/monetary policy (statement|report)/i, 'Informe de política monetaria'], [/official bank rate/i, 'Tasa oficial del banco central'], [/cash rate|rate statement|main refinancing rate|interest rate decision|federal funds rate/i, 'Decisión de tasas de interés'],
    [/(prelim )?uom inflation expectations/i, 'Expectativas de inflación (U. de Michigan)'], [/(prelim )?uom consumer sentiment/i, 'Confianza del consumidor (U. de Michigan)'],
    [/core cpi flash/i, 'IPC subyacente preliminar'], [/cpi flash estimate/i, 'IPC preliminar'], [/annual budget/i, 'Presupuesto anual'], [/press conference/i, 'Conferencia de prensa'],
    [/ivey pmi/i, 'PMI Ivey'], [/gdp/i, 'PIB'], [/retail sales/i, 'Ventas minoristas'], [/trade balance/i, 'Balanza comercial']];
  function esName(title) { // nombre en español del evento (sin la parte original en inglés)
    const t = String(title || ''); for (const [re, es] of ES) if (re.test(t)) return es;
    const sp = /^(.*?)\s+(?:Gov\s+|President\s+|Chairman\s+|Chair\s+)?(\w+)\s+Speaks$/i.exec(t); if (sp && !/^(fed|fomc)/i.test(t)) return 'Discurso de ' + sp[2] + ' (' + sp[1].replace(/\s+(Gov|President|Chair)$/i, '').replace(/BOE/i, 'Banco de Inglaterra').replace(/ECB/i, 'BCE').replace(/BOJ/i, 'Banco de Japón').replace(/RBA/i, 'Banco de Australia').replace(/BOC/i, 'Banco de Canadá').replace(/SNB/i, 'Banco Nacional Suizo') + ')';
    const s2 = shortName(t); return s2;
  }
  function parts(ms) { // {d, h, m, s} de lo que falta
    const s = Math.max(0, Math.floor(ms / 1000)); return {d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60};
  }
  function clock(ms) { // «2 d 14 h», «05:12:09», «00:04:31»
    const q = parts(ms), z = n => String(n).padStart(2, '0'); return q.d >= 1 ? `${q.d} d ${q.h} h` : `${z(q.h)}:${z(q.m)}:${z(q.s)}`;
  }
  const WIN = 24 * 36e5;
  function progress(t, now, win) { // 0 → 1 en las últimas 24 h antes del evento (la línea avanza mientras se acerca)
    const w = win || WIN, r = 1 - (t - now) / w; return Math.max(0, Math.min(1, r));
  }
  function expect(e) { // qué se espera frente al dato anterior
    const f = num(e && e.forecast), p = num(e && e.previous); if (f == null || p == null) return null; return f > p ? 1 : f < p ? -1 : 0;
  }
  const api = {imp, num, arrow, shortName, esName, group, pick, lists, left, has, COUNTRY, parts, clock, progress, expect};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTEcon = api;
  if (typeof document === 'undefined') return;

  /* ───────── Interfaz ───────── */
  const $ = s => document.querySelector(s), esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const deskMQ = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : {matches: true, addEventListener() {}};
  let events = [], loadedAt = 0, pop = null, sig = '', busy = false, timer = 0, loadT = 0;
  const tzInfo = () => (window.CCT_tzInfo ? window.CCT_tzInfo() : {tz: 'auto', clock: '24'}), p2 = n => String(n).padStart(2, '0');
  function when(t, now) { // «hoy 07:30», «mañana 07:30», «vie 07:30» en la zona elegida
    const {tz, clock} = tzInfo(), P = root.CCTPrefs, q = P ? P.parts(t, tz) : {h: new Date(t).getHours(), mi: new Date(t).getMinutes(), d: new Date(t).getDate()}, n = P ? P.parts(now, tz) : {d: new Date(now).getDate()};
    const hm = clock === '12' ? `${q.h % 12 || 12}:${p2(q.mi)} ${q.h < 12 ? 'a. m.' : 'p. m.'}` : `${p2(q.h)}:${p2(q.mi)}`, tm = P ? P.parts(now + 864e5, tz).d : new Date(now + 864e5).getDate();
    let day; if (q.d === n.d) day = 'hoy'; else if (q.d === tm) day = 'mañana'; else { try { day = new Intl.DateTimeFormat('es', {weekday: 'short', timeZone: tz === 'auto' ? undefined : tz}).format(new Date(t)).replace('.', ''); } catch { day = ''; } }
    return `${day} ${hm}`.trim();
  }
  const bars = e => `<span class="ec-imp i${imp(e)}" aria-label="${imp(e) === 2 ? 'Impacto alto' : 'Impacto medio'}"><i></i><i></i><i></i></span>`;
  const arrowHtml = e => { const a = arrow(e); return a == null ? '' : `<span class="ec-ar ${a > 0 ? 'up' : a < 0 ? 'dn' : ''}" title="${a > 0 ? 'Por encima de lo previsto' : a < 0 ? 'Por debajo de lo previsto' : 'Igual a lo previsto'}">${a > 0 ? '▲' : a < 0 ? '▼' : '='}</span>`; };
  const kv = (k, v) => has(v) ? `<span class="ec-kv"><em>${k}</em><b>${esc(v)}</b></span>` : '';
  const weekend = now => { const d = new Date(now).getUTCDay(); return d === 6 || d === 0 || (d === 5 && new Date(now).getUTCHours() >= 21); };
  const level = (ms) => ms < 10 * 6e4 ? 'urgent' : ms < 36e5 ? 'soon' : ms < WIN ? 'today' : 'far';
  function chipHtml(r, now) {
    if (!r) return `<span class="ec-dot" aria-hidden="true"></span><span class="ec-tag">Calendario</span><span class="ec-nm ec-idle">${weekend(now) ? 'Sin eventos de alto impacto · la semana nueva se publica el domingo' : 'Sin eventos de alto impacto próximos'}</span>`;
    const {main: e, extra} = r.ev, nm = esc(esName(e.title)) + (extra ? `<small class="ec-more">+${extra}</small>` : '');
    if (r.mode === 'live') {
      const out = has(e.actual);
      return `<span class="ec-live${out ? ' got' : ''}" aria-hidden="true"></span><span class="ec-tag live">${out ? 'Publicado' : 'En curso'}</span>${bars(e)}<b class="ec-cc">${esc(e.country)}</b><span class="ec-nm">${nm}</span>`
        + (out ? `<span class="ec-res"><em>Real</em><b>${esc(e.actual)}</b>${arrowHtml(e)}</span>` : `<span class="ec-wait">esperando el dato…</span>`) + kv('Previsto', e.forecast) + kv('Anterior', e.previous);
    }
    return `<span class="ec-dot" aria-hidden="true"></span>${bars(e)}<b class="ec-cc">${esc(e.country)}</b><span class="ec-nm">${nm}</span>${kv('Previsto', e.forecast)}${kv('Anterior', e.previous)}`
      + `<span class="ec-cd" title="${esc(when(e.t, now))}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg><span class="ec-clk">${clock(e.t - now)}</span></span><i class="ec-prog" aria-hidden="true"></i>`;
  }
  function row(e, now) {
    const done = has(e.actual);
    return `<div class="ec-row"><span class="ec-rt">${esc(when(e.t, now))}</span>${bars(e)}<span class="ec-rn"><b>${esc(e.country)}</b> ${esc(esName(e.title))}</span><span class="ec-rv">${done ? `<span class="ec-res"><em>Real</em><b>${esc(e.actual)}</b>${arrowHtml(e)}</span>` : ''}${kv('Prev.', e.forecast)}${kv('Ant.', e.previous)}</span></div>`;
  }
  function heroHtml(r, now) { // tarjeta grande del próximo evento: cuenta regresiva por segmentos, línea de progreso y datos
    if (!r) return `<div class="ec-hero idle"><b>Sin eventos de alto impacto por ahora</b><p>${weekend(now) ? 'El calendario de la semana nueva se publica el domingo por la tarde.' : 'Cuando se acerque uno importante aparecerá aquí con su cuenta regresiva.'}</p></div>`;
    const e = r.ev.main, live = r.mode === 'live', ms = e.t - now, q = parts(ms), x = expect(e), out = has(e.actual);
    const seg = (n, l) => `<div class="ec-seg"><b>${String(n).padStart(2, '0')}</b><small>${l}</small></div>`;
    const exTxt = x == null ? '' : x > 0 ? 'Se espera un dato <b class="up">más alto</b> que el anterior' : x < 0 ? 'Se espera un dato <b class="dn">más bajo</b> que el anterior' : 'Se espera <b>igual</b> que el anterior';
    const tile = (k, v, cls) => `<div class="ec-tile ${cls || ''}"><small>${k}</small><b>${has(v) ? esc(v) : '—'}</b></div>`;
    const others = r.ev.all.filter(o => o !== e).map(o => `<li>${esc(esName(o.title))}${has(o.forecast) ? ` <span>prev. ${esc(o.forecast)}</span>` : ''}</li>`).join('');
    return `<div class="ec-hero ${live ? 'live' : level(ms)}" style="--p:${live ? 1 : progress(e.t, now).toFixed(4)}">
      <div class="ec-h1">${bars(e)}<span>${imp(e) === 2 ? 'Impacto alto' : 'Impacto medio'}</span><i>·</i><span>${esc(COUNTRY[e.country] || e.country)}</span><span class="ec-h1t">${esc(when(e.t, now))}</span></div>
      <div class="ec-ht">${esc(esName(e.title))}</div>${esName(e.title) !== e.title ? `<div class="ec-hs">${esc(e.title)}</div>` : ''}
      ${live ? `<div class="ec-livebox"><span class="ec-live${out ? ' got' : ''}"></span>${out ? 'Dato publicado' : 'En curso · esperando el dato'}</div>`
        : `<div class="ec-cdbig" aria-label="Falta ${esc(left(ms))}">${q.d ? seg(q.d, q.d === 1 ? 'día' : 'días') : ''}${seg(q.h, 'horas')}${seg(q.m, 'min')}${seg(q.s, 'seg')}</div>
      <div class="ec-bar"><i></i></div><div class="ec-barl"><span>${ms > WIN ? 'Faltan más de 24 h' : 'Últimas 24 h'}</span><span>${Math.round(progress(e.t, now) * 100)}%</span></div>`}
      <div class="ec-tiles">${tile('Previsto', e.forecast, 'f')}${tile('Anterior', e.previous)}${tile('Real', e.actual, out ? (arrow(e) > 0 ? 'up' : arrow(e) < 0 ? 'dn' : '') : 'pend')}</div>
      ${exTxt ? `<p class="ec-exp">${exTxt}</p>` : ''}${others ? `<div class="ec-oth"><small>A la misma hora</small><ul>${others}</ul></div>` : ''}
    </div>`;
  }
  function popHtml(now) {
    const L = lists(events, now), r = pick(events, now), main = r && r.ev.main, up = L.upcoming.filter(e => !r || !r.ev.all.includes(e));
    const sec = (t, a) => a.length ? `<div class="ec-sec">${t}</div>${a.map(e => row(e, now)).join('')}` : '';
    return heroHtml(r, now) + sec('Después', up.slice(0, 6)) + sec('Resultados recientes', L.recent)
      + `<div class="ec-foot"><button type="button" id="ecOpen">Calendario completo</button><small>Hora: ${esc(tzInfo().tz === 'auto' ? 'tu dispositivo' : tzInfo().tz)} · ForexFactory</small></div>` + (main ? '' : '');
  }
  function paintLive(now) { // cada segundo: solo números y la línea (sin redibujar todo)
    const btn = $('#stEcon'), r = pick(events, now); if (!btn || !r || r.mode !== 'next') return false;
    const e = r.ev.main, ms = e.t - now, c = btn.querySelector('.ec-clk'); if (c) c.textContent = clock(ms);
    btn.style.setProperty('--p', progress(e.t, now).toFixed(4)); btn.dataset.lv = level(ms);
    if (pop) { const h = pop.querySelector('.ec-hero'), q = parts(ms), segs = pop.querySelectorAll('.ec-seg b'), v = (q.d ? [q.d] : []).concat([q.h, q.m, q.s]);
      if (h) { h.style.setProperty('--p', progress(e.t, now).toFixed(4)); h.className = 'ec-hero ' + level(ms); }
      if (segs.length === v.length) segs.forEach((b, i) => { const t = String(v[i]).padStart(2, '0'); if (b.textContent !== t) { b.textContent = t; b.classList.remove('tick'); void b.offsetWidth; b.classList.add('tick'); } });
      const pl = pop.querySelector('.ec-barl span:last-child'); if (pl) pl.textContent = Math.round(progress(e.t, now) * 100) + '%'; }
    return true;
  }
  function paint(force) {
    const btn = $('#stEcon'); if (!btn) return; const now = Date.now(), r = pick(events, now);
    if (!events.length) { btn.hidden = true; sig = ''; if (pop) hide(); return; }
    const html = chipHtml(r, now), s = (r ? r.mode + '|' + r.ev.main.t + '|' + r.ev.main.title + '|' + r.ev.main.actual + '|' + Math.floor((r.ev.main.t - now) / 864e5) : 'none') + '|' + Math.floor(now / 6e4);
    if (btn.hidden) btn.hidden = false;
    btn.classList.toggle('live', !!r && r.mode === 'live'); btn.classList.toggle('idle', !r);
    if (force || s !== sig) { sig = s; btn.innerHTML = html; btn.title = r ? `${esName(r.ev.main.title)} · ${COUNTRY[r.ev.main.country] || r.ev.main.country} · ${when(r.ev.main.t, now)}` : 'Calendario económico'; if (pop) { pop.innerHTML = popHtml(now); place(); } }
    paintLive(now);
  }
  function place() { const b = $('#stEcon'); if (!pop || !b) return; const r = b.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + 'px'; pop.style.bottom = (innerHeight - r.top + 8) + 'px'; }
  function show() { if (pop) return; pop = document.createElement('div'); pop.className = 'ec-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Próximo evento económico'); document.body.appendChild(pop); pop.innerHTML = popHtml(Date.now()); place(); paintLive(Date.now()); const b = $('#stEcon'); if (b) b.setAttribute('aria-expanded', 'true'); }
  function hide() { if (pop) { pop.remove(); pop = null; const b = $('#stEcon'); if (b) b.setAttribute('aria-expanded', 'false'); } }
  async function load() {
    if (busy || !deskMQ.matches) return; busy = true;
    try { const r = await fetch((window.CCT_DATA ? CCT_DATA('calendar-data.json') : 'calendar-data.json') + '?_=' + Math.floor(Date.now() / 6e4), {cache: 'no-store'}); if (r.ok) { const j = await r.json(); if (Array.isArray(j.events)) { events = j.events; loadedAt = Date.now(); } } } catch {}
    busy = false; paint(true);
  }
  function wantFresh(now) { // tras un evento importante sin dato, se vuelve a pedir cada minuto (el resultado aparece cuando el flujo lo publica)
    return events.some(e => imp(e) >= 1 && e.t <= now && now - e.t < 3 * 36e5 && !has(e.actual) && REL.includes(e.country));
  }
  function tick() {
    if (!deskMQ.matches || document.hidden) return; const now = Date.now();
    if (now - loadedAt > (wantFresh(now) ? 60e3 : 5 * 60e3)) load(); else paint(false);
  }
  function start() {
    const btn = $('#stEcon'); if (!btn) return;
    btn.addEventListener('click', e => { e.stopPropagation(); pop ? hide() : show(); });
    document.addEventListener('pointerdown', e => { if (pop && !e.target.closest('#stEcon, .ec-pop')) hide(); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
    document.addEventListener('click', e => { if (!e.target.closest('#ecOpen')) return; hide(); const n = document.querySelector('[data-view="newsView"]'); if (n) { n.click(); setTimeout(() => { const c = document.querySelector('[data-nw-tab="cal"]'); if (c) c.click(); }, 120); } });
    window.addEventListener('resize', () => { place(); if (!deskMQ.matches) hide(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
    load(); clearInterval(timer); timer = setInterval(tick, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof self !== 'undefined' ? self : this);

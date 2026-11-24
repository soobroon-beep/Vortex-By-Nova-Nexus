/* VORTEX · Uso de la app.
   1) Latido anónimo de cada dispositivo (presence/{id}): cuándo se vio, desde cuándo, PC o celular, app instalada, zona horaria,
      idioma, versión y plan. Sin correo ni nombre; si hay sesión, solo el uid propio (lo comprueban las reglas). Cada 10 min con la app a la vista.
      No cuenta navegadores automáticos (Vigía) ni pruebas en tu computadora (localhost).
   2) Panel «Usuarios de VORTEX» (Desarrollador, solo el creador): en línea ahora, activos hoy / 7 / 30 días, cuentas nuevas,
      planes, celular o PC, app instalada, regiones, gráfica de 30 días y la lista de cuentas con buscador.
      El resumen lo arma cada hora scripts/usage.js (users/<creador>/data/usage); «En línea ahora» se lee en vivo. */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search)) return;
  const $ = (s, e) => (e || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const C = () => window.CCTCloudPriv, P = () => window.CCTPlans;
  const isOwner = () => !!(P() && P().owner && C() && C().ready());

  /* ───────── 1) Latido ───────── */
  const BEAT = 10 * 6e4, LS_ID = 'vx_dev_id', LS_OK = 'vx_dev_ok';
  const bot = () => !!navigator.webdriver || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) || /HeadlessChrome|Lighthouse/i.test(navigator.userAgent);
  const devId = () => { let id = ''; try { id = localStorage.getItem(LS_ID) || ''; } catch (e) {} if (!/^[A-Za-z0-9]{16,32}$/.test(id)) { const a = new Uint8Array(15); crypto.getRandomValues(a); id = [...a].map(b => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 62]).join('') + 'vx'; try { localStorage.setItem(LS_ID, id); } catch (e) {} } return id; };
  const devType = () => { const w = Math.min(screen.width, screen.height), touch = matchMedia('(pointer:coarse)').matches; return !touch ? 'pc' : w >= 700 ? 'tab' : 'm'; };
  const pwa = () => !!(matchMedia('(display-mode: standalone)').matches || navigator.standalone);
  const planNow = () => { try { const p = P(); if (!p || !p.user) return ''; if (p.owner) return 'dev'; return String(p.real ? p.real() : '').slice(0, 12); } catch (e) { return ''; } };
  const ver = () => { try { return String((window.CCT_CHANGELOG && CCT_CHANGELOG[0] && CCT_CHANGELOG[0].v) || '').slice(0, 12); } catch (e) { return ''; } };
  const srcHost = () => { try { const r = document.referrer && new URL(document.referrer).hostname; return r && r !== location.hostname ? r.slice(0, 60) : ''; } catch (e) { return ''; } };
  const sv = v => typeof v === 'boolean' ? {booleanValue: v} : typeof v === 'number' ? {integerValue: String(v)} : {stringValue: String(v)};
  let last = 0, sent = false, busy = false;
  async function beat(session) {
    if (bot() || busy || !window.CCT_FIREBASE) return; busy = true;
    try {
      const F = window.CCT_FIREBASE, id = devId(), name = `projects/${F.projectId}/databases/(default)/documents/presence/${id}`, url = `https://firestore.googleapis.com/v1/projects/${F.projectId}/databases/(default)/documents:commit?key=${F.apiKey}`;
      let tok = ''; try { tok = C() && C().ready() ? await C().token() : ''; } catch (e) {}
      const uid = tok && C() ? C().uid() : '';
      let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
      const base = {uid, dev: devType(), pwa: pwa(), tz: tz.slice(0, 48), lang: (navigator.language || '').slice(0, 12), ver: ver(), plan: planNow()};
      const post = body => fetch(url, {method: 'POST', headers: Object.assign({'content-type': 'application/json'}, tok ? {authorization: 'Bearer ' + tok} : {}), body: JSON.stringify(body), keepalive: true});
      const known = (() => { try { return localStorage.getItem(LS_OK) === '1'; } catch (e) { return false; } })();
      const create = () => post({writes: [{update: {name, fields: Object.fromEntries(Object.entries(Object.assign({}, base, {n: 1, src: srcHost()})).map(([k, v]) => [k, sv(v)]))}, currentDocument: {exists: false}, updateTransforms: [{fieldPath: 'at', setToServerValue: 'REQUEST_TIME'}, {fieldPath: 'first', setToServerValue: 'REQUEST_TIME'}]}]});
      const update = () => post({writes: [{update: {name, fields: Object.fromEntries(Object.entries(base).map(([k, v]) => [k, sv(v)]))}, updateMask: {fieldPaths: Object.keys(base)}, currentDocument: {exists: true}, updateTransforms: [{fieldPath: 'at', setToServerValue: 'REQUEST_TIME'}].concat(session ? [{fieldPath: 'n', increment: {integerValue: '1'}}] : [])}]});
      let r = known ? await update() : await create();
      if (!r.ok) { r = known ? await create() : await update(); } // ya existía / se borró por antigüedad
      if (r.ok) { try { localStorage.setItem(LS_OK, '1'); } catch (e) {} last = Date.now(); sent = true; }
    } catch (e) {} finally { busy = false; }
  }
  const tick = () => { if (document.visibilityState === 'visible' && Date.now() - last >= BEAT) beat(!sent); };
  setTimeout(() => beat(true), 4000);
  setInterval(tick, 60e3);
  document.addEventListener('visibilitychange', tick);

  /* ───────── 2) Panel del desarrollador ───────── */
  let ov = null, doc = null, live = [], err = '', q = '', filt = 'all', more = 100, liveT = 0;
  const ago = t => { if (!t) return '—'; const d = Date.now() - t, m = d / 6e4; return m < 2 ? 'ahora' : m < 60 ? `hace ${Math.round(m)} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : m < 43200 ? `hace ${Math.round(m / 1440)} d` : new Date(t).toLocaleDateString('es-MX', {day: 'numeric', month: 'short', year: '2-digit'}); };
  const dt = t => t ? new Date(t).toLocaleDateString('es-MX', {day: 'numeric', month: 'short', year: '2-digit'}) : '—';
  const PLN = {free: ['Gratis', 'f'], plus: ['Plus', 'p'], infinity: ['Infinity', 'i'], dev: ['Creador', 'd']};
  const DEV = {pc: '💻', m: '📱', tab: '📲'};
  const tzName = z => { if (!z || z === '—') return 'Sin dato'; const c = z.split('/').pop().replace(/_/g, ' '); return ({'Mexico City': 'Ciudad de México', 'Bogota': 'Bogotá', 'Buenos Aires': 'Buenos Aires', 'New York': 'Nueva York (EE. UU.)', 'Los Angeles': 'Los Ángeles (EE. UU.)', 'Chicago': 'Chicago (EE. UU.)', 'Madrid': 'Madrid', 'Lima': 'Lima', 'Santiago': 'Santiago', 'Caracas': 'Caracas', 'Monterrey': 'Monterrey', 'Cancun': 'Cancún', 'Tijuana': 'Tijuana', 'Hermosillo': 'Hermosillo', 'Merida': 'Mérida', 'Guatemala': 'Guatemala', 'Panama': 'Panamá'}[c]) || c; };
  const n = v => (+v || 0).toLocaleString('es-MX');
  const pct = (a, b) => b ? Math.round(a / b * 100) + ' %' : '—';
  async function load() {
    err = '';
    try { doc = await C().get('usage'); } catch (e) { doc = null; err = 'No se pudo leer el resumen: ' + (e.message || e); }
    await loadLive(); paint();
  }
  async function loadLive() { try { live = await C().pres(Date.now() - 24 * 3600e3); } catch (e) { live = null; } }
  function chart(D) { // 30 días: barras = cuentas nuevas, línea = dispositivos activos
    const days = []; for (let i = 29; i >= 0; i--) days.push(new Date(Date.now() - i * 864e5).toLocaleDateString('en-CA', {timeZone: 'America/Mexico_City'}));
    const su = days.map(k => (D.signups || {})[k] || 0), ac = days.map(k => (D.hist || {})[k] || 0), mx = Math.max(1, ...su, ...ac), W = 600, H = 150, bw = W / 30;
    const bars = su.map((v, i) => v ? `<rect x="${(i * bw + bw * .2).toFixed(1)}" y="${(H - v / mx * (H - 14)).toFixed(1)}" width="${(bw * .6).toFixed(1)}" height="${(v / mx * (H - 14)).toFixed(1)}" rx="2" class="us-bar"><title>${days[i]}: ${v} cuenta(s) nueva(s)</title></rect>` : '').join('');
    const pts = ac.map((v, i) => `${(i * bw + bw / 2).toFixed(1)},${(H - v / mx * (H - 14)).toFixed(1)}`), hasA = ac.some(Boolean);
    return `<svg viewBox="0 0 ${W} ${H + 18}" class="us-chart" preserveAspectRatio="none" role="img" aria-label="Últimos 30 días">${[.25, .5, .75].map(f => `<line x1="0" x2="${W}" y1="${H - f * (H - 14)}" y2="${H - f * (H - 14)}" class="us-grid"/>`).join('')}${bars}${hasA ? `<polyline points="${pts.join(' ')}" class="us-line"/>${ac.map((v, i) => v ? `<circle cx="${(i * bw + bw / 2).toFixed(1)}" cy="${(H - v / mx * (H - 14)).toFixed(1)}" r="2.6" class="us-dot"><title>${days[i]}: ${v} dispositivo(s) activo(s)</title></circle>` : '').join('')}` : ''}
      <text x="0" y="${H + 14}" class="us-ax">${days[0].slice(5).replace('-', '/')}</text><text x="${W}" y="${H + 14}" text-anchor="end" class="us-ax">hoy</text></svg>
      <div class="us-leg"><span><i class="b"></i>Cuentas nuevas</span><span><i class="l"></i>Dispositivos activos por día</span><span class="us-mx">máx. ${mx}</span></div>`;
  }
  const kpi = (t, v, s, cls) => `<div class="us-kpi ${cls || ''}"><small>${t}</small><b>${v}</b>${s ? `<em>${s}</em>` : ''}</div>`;
  const barList = rows => { const mx = Math.max(1, ...rows.map(r => r[1])); return rows.map(([k, v, c]) => `<div class="us-bl"><span>${k}</span><i style="--w:${(v / mx * 100).toFixed(1)}%;--c:${c || 'var(--accent)'}"></i><b>${n(v)}</b></div>`).join(''); };
  function paint() {
    if (!ov) return; const box = $('.us-body', ov), D = doc || {}, A = D.acc || {}, V = D.dev || {}, PL = D.plans || {};
    const now = Date.now(), on12 = (live || []).filter(p => p.at >= now - 12 * 6e4), list = Array.isArray(D.list) ? D.list : [], byUid = {}; list.forEach(u => { byUid[u.uid] = u; });
    $('.us-sub', ov).textContent = D.at ? `Resumen ${ago(D.at)} · se actualiza cada hora · «En línea» en vivo` : 'El primer resumen sale en menos de una hora';
    if (!D.at && !err) { box.innerHTML = `<div class="us-empty"><b>Preparando tu panel…</b><p>El resumen de cuentas y dispositivos se arma cada hora en el servidor. Mientras tanto, «En línea ahora» ya funciona.</p></div>` + onlineHtml(on12, byUid); return; }
    const ql = q.trim().toLowerCase(), wk = now - 7 * 864e5, mo = now - 30 * 864e5;
    const rows = list.filter(u => (filt === 'all' || (filt === 'act' && u.l >= wk) || (filt === 'new' && u.c >= mo) || (filt === 'pay' && (u.p === 'plus' || u.p === 'infinity')) || (filt === 'app' && u.pwa)) && (!ql || (u.n || '').toLowerCase().includes(ql) || (u.e || '').toLowerCase().includes(ql)));
    box.innerHTML = (err ? `<p class="us-err">${esc(err)}</p>` : '') + `
      <div class="us-kpis">
        ${kpi('En línea ahora', `<span class="us-live"></span>${n(on12.length)}`, 'últimos 12 min', 'hot')}
        ${kpi('Activos hoy', n(V.d1), 'dispositivos')}
        ${kpi('Activos 7 días', n(V.d7), 'dispositivos')}
        ${kpi('Activos 30 días', n(V.d30), `${n(V.logged30)} con cuenta · ${n(V.anon30)} sin cuenta`)}
        ${kpi('Cuentas', n(A.total), `+${n(A.new7)} esta semana · +${n(A.new1)} hoy`)}
        ${kpi('Cuentas activas', n(A.act7), `7 días · ${n(A.act30)} en 30 días`)}
        ${kpi('App instalada', pct(V.pwa, V.d30), `${n(V.pwa)} dispositivos`)}
        ${kpi('Regresan', pct(V.ret30, V.d30), `${n(V.newDev30)} nuevos en 30 días`)}
      </div>
      <div class="us-card"><div class="us-h"><b>Últimos 30 días</b></div>${chart(D)}</div>
      <div class="us-two">
        <div class="us-card"><div class="us-h"><b>Planes</b></div>${barList([['Gratis', PL.free || 0, '#8a8f98'], ['Plus', PL.plus || 0, '#f0b90b'], ['Infinity', PL.infinity || 0, '#a98bff'], ['Creador', PL.dev || 0, '#20bf9f']])}</div>
        <div class="us-card"><div class="us-h"><b>Dispositivos (30 días)</b></div>${barList([['📱 Celular', V.m || 0, '#38bdf8'], ['💻 PC', V.pc || 0, '#548fff'], ['📲 Tableta', V.tab || 0, '#a98bff'], ['Instalada como app', V.pwa || 0, '#20bf9f']])}</div>
        <div class="us-card"><div class="us-h"><b>Regiones</b><small>por zona horaria</small></div>${(D.tzTop || []).length ? barList(D.tzTop.map(([z, v]) => [esc(tzName(z)), v])) : '<p class="us-mut">Sin datos todavía.</p>'}</div>
        <div class="us-card"><div class="us-h"><b>De dónde llegan</b><small>30 días</small></div>${(D.src || []).length ? barList(D.src.map(([s, v]) => [esc(s), v])) : '<p class="us-mut">La mayoría entra directo (enlace o app instalada).</p>'}</div>
      </div>
      ${onlineHtml(on12, byUid)}
      <div class="us-card"><div class="us-h"><b>Cuentas</b><small>${n(rows.length)} de ${n(A.total || list.length)}</small></div>
        <input class="us-q" type="search" placeholder="Buscar por nombre o correo" value="${esc(q)}">
        <div class="us-chips">${[['all', 'Todas'], ['act', 'Activas 7 días'], ['new', 'Nuevas 30 días'], ['pay', 'De pago'], ['app', 'Con app instalada']].map(([k, t]) => `<button type="button" data-uf="${k}" class="${filt === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="us-tbl">${rows.slice(0, more).map(u => { const pl = PL_(u.p); return `<div class="us-u"><span class="us-av">${u.ph ? `<img src="${esc(u.ph)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : esc((u.n || u.e || '?').slice(0, 1).toUpperCase())}</span><div class="us-un"><b>${esc(u.n || 'Sin nombre')}</b><small>${esc(u.e || '')}</small></div><em class="us-pl ${pl[1]}">${pl[0]}</em><div class="us-ud"><small>Creada ${dt(u.c)}</small><small>Activa ${ago(u.l)} ${(u.d || '').split(',').filter(Boolean).map(d => DEV[d] || '').join('')}${u.pwa ? ' · app' : ''}</small></div></div>`; }).join('') || '<p class="us-mut">Nadie con ese filtro.</p>'}</div>
        ${rows.length > more ? `<button type="button" class="us-more" data-umore="1">Ver más (${n(rows.length - more)})</button>` : ''}
      </div>`;
  }
  const PL_ = p => PLN[p] || PLN.free;
  function onlineHtml(on12, byUid) {
    return `<div class="us-card"><div class="us-h"><b>En línea ahora</b><small>${live === null ? 'no se pudo leer (¿reglas publicadas?)' : n(on12.length) + ' dispositivo(s)'}</small></div>${on12.length ? `<div class="us-tbl">${on12.slice(0, 60).map(p => { const u = p.uid && byUid[p.uid]; return `<div class="us-u sm"><span class="us-av">${DEV[p.dev] || '💻'}</span><div class="us-un"><b>${u ? esc(u.n || u.e) : p.uid ? 'Con cuenta' : 'Visitante sin cuenta'}</b><small>${esc(tzName(p.tz))}${p.pwa ? ' · app instalada' : ''}${p.n > 1 ? ` · ${n(p.n)} visitas` : ' · primera visita'}</small></div><div class="us-ud"><small>${ago(p.at)}</small>${p.plan ? `<em class="us-pl ${PL_(p.plan)[1]}">${PL_(p.plan)[0]}</em>` : ''}</div></div>`; }).join('')}</div>` : '<p class="us-mut">Nadie en este momento.</p>'}</div>`;
  }
  function openPanel() {
    if (!isOwner() || ov) return;
    ov = document.createElement('div'); ov.className = 'us-ov';
    ov.innerHTML = `<div class="us-box" role="dialog" aria-label="Usuarios de VORTEX"><div class="us-head"><div><b>Usuarios de VORTEX</b><small class="us-sub">Cargando…</small></div><button type="button" class="us-rf" aria-label="Actualizar" title="Actualizar">↻</button><button type="button" class="us-x" aria-label="Cerrar">✕</button></div><div class="us-body"><div class="us-empty">Cargando…</div></div></div>`;
    document.body.appendChild(ov); requestAnimationFrame(() => ov && ov.classList.add('open'));
    ov.addEventListener('click', e => {
      if (e.target === ov || e.target.closest('.us-x')) return closePanel();
      if (e.target.closest('.us-rf')) { load(); return; }
      const f = e.target.closest('[data-uf]'); if (f) { filt = f.dataset.uf; more = 100; paint(); return; }
      if (e.target.closest('[data-umore]')) { more += 200; paint(); }
    });
    ov.addEventListener('input', e => { if (e.target.classList.contains('us-q')) { q = e.target.value; const pos = e.target.selectionStart; paint(); const i = $('.us-q', ov); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (er) {} } } });
    document.addEventListener('keydown', onKey, true);
    load(); clearInterval(liveT); liveT = setInterval(async () => { if (!ov || document.hidden) return; await loadLive(); paint(); }, 30e3);
  }
  const onKey = e => { if (e.key === 'Escape' && ov) { e.stopPropagation(); closePanel(); } };
  function closePanel() { clearInterval(liveT); document.removeEventListener('keydown', onKey, true); if (!ov) return; const o = ov; ov = null; o.classList.remove('open'); setTimeout(() => o.remove(), 200); }
  function row() {
    const z = $('#devZone .sg'); if (!z) return;
    let r = $('#setUsage');
    if (!r) { z.insertAdjacentHTML('afterbegin', `<button class="sg-row dev-glow" id="setUsage" aria-label="Usuarios de VORTEX" type="button" hidden><span class="sg-ic" style="--c:#f0b90b"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M16 5.5a3 3 0 0 1 0 5.6M18 14.5c1.4.7 2.3 2.2 2.6 4.5"/></svg></span><span class="sg-t"><b>Usuarios de VORTEX</b><small>Quién entra, cuentas nuevas, activos y en línea ahora</small></span><svg class="sg-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`); r = $('#setUsage'); }
    r.hidden = !isOwner();
  }
  document.addEventListener('click', e => { if (e.target.closest('#setUsage')) openPanel(); });
  const boot = () => { row(); setInterval(row, 3000); };
  if (document.readyState === 'complete') boot(); else addEventListener('load', boot);
  window.CCTUsage = {open: openPanel, beat};
})();

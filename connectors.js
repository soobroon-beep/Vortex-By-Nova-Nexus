/* VORTEX · Conectores (Configuración › Conectores). Todo abierto y sin depender de una sola empresa:
   · Telegram: tus avisos llegan a tu chat por un bot tuyo (lo creas con @BotFather; token + tu chat).
   · Webhook genérico: cada aviso se manda como JSON a la dirección que quieras (n8n, Make, Zapier, Home Assistant, tu servidor…).
   · Google Calendar: suscríbete al calendario económico de VORTEX (se actualiza solo) o descárgalo como .ics.
   · IA en tu computadora (Ollama / LM Studio): se configura en «Tu IA», gratis y privada.
   Los datos (token, chat, URL) se guardan en TU cuenta (privada) y en este dispositivo. Con «Activar notificaciones» encendido, el servidor de
   avisos también los manda con la app cerrada (alertas de precio e indicador, movimientos bruscos y tus trades). */
(function () {
  'use strict';
  if (typeof window === 'undefined' || /[?&]pane=/.test(location.search)) return;
  const $ = (s, e) => (e || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const TG_TOKEN = /^\d{5,12}:[A-Za-z0-9_-]{30,60}$/, TG_CHAT = /^(-?\d{3,20}|@[A-Za-z]\w{3,40})$/;
  const okUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' && u.length < 500 && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(x.hostname); } catch { return false; } };
  const KINDS = [['price', 'Alertas de precio'], ['ind', 'Alertas de indicador'], ['move', 'Movimientos bruscos'], ['trade', 'Mis trades'], ['bots', 'Mis bots'], ['radar', 'Grandes oportunidades']];
  const store = () => window.CCT_connStore, get = () => (store() && store().get()) || {tg: {}, wh: {}};
  let open = false, st = {tg: {t: '', c: ''}, wh: {t: '', c: ''}, cal: {t: '', c: ''}};

  /* ── Envío ── */
  async function tgSend(c, title, text) {
    const r = await fetch(`https://api.telegram.org/bot${c.token}/sendMessage`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({chat_id: c.chat, text: `<b>VORTEX · ${esc(title)}</b>\n${esc(text)}`, parse_mode: 'HTML', disable_web_page_preview: true})});
    let j = {}; try { j = await r.json(); } catch {} if (!r.ok || j.ok === false) throw new Error(j.description || 'Telegram respondió ' + r.status); return true;
  }
  async function whSend(c, kind, title, text, extra) {
    const body = JSON.stringify(Object.assign({source: 'vortex', kind, title, text, at: new Date().toISOString(), app: location.origin}, extra || {}));
    try { const r = await fetch(c.url, {method: 'POST', headers: {'content-type': 'application/json'}, body}); if (!r.ok) throw new Error('Tu webhook respondió ' + r.status); return true; }
    catch (e) { if (e instanceof TypeError) { await fetch(c.url, {method: 'POST', mode: 'no-cors', headers: {'content-type': 'text/plain'}, body}); return 'sin-cors'; } throw e; } // el navegador no deja leer la respuesta: se manda igual
  }
  const SERVER_KINDS = ['price', 'ind', 'move', 'trade']; // con avisos de app cerrada encendidos, estos los manda el servidor (sin duplicados)
  function send(kind, title, text, extra) {
    const D = get(), srv = !!(window.VortexPush && window.VortexPush.on) && SERVER_KINDS.includes(kind);
    if (srv) return;
    const tg = D.tg || {}, wh = D.wh || {};
    if (tg.on && TG_TOKEN.test(tg.token || '') && TG_CHAT.test(tg.chat || '') && (tg.k || {})[kind] !== false) tgSend(tg, title, text).catch(e => console.warn('telegram', e.message));
    if (wh.on && okUrl(wh.url || '') && (wh.k || {})[kind] !== false) whSend(wh, kind, title, text, extra).catch(e => console.warn('webhook', e.message));
  }
  /* Lo que viaja al servidor de avisos (push.js) para mandarlo con la app cerrada */
  function serverCfg() {
    const D = get(), o = {}, tg = D.tg || {}, wh = D.wh || {};
    if (tg.on && TG_TOKEN.test(tg.token || '') && TG_CHAT.test(tg.chat || '')) o.tg = {token: tg.token, chat: tg.chat, k: Object.fromEntries(SERVER_KINDS.map(k => [k, (tg.k || {})[k] !== false]))};
    if (wh.on && okUrl(wh.url || '')) o.wh = {url: wh.url, k: Object.fromEntries(SERVER_KINDS.map(k => [k, (wh.k || {})[k] !== false]))};
    return o;
  }
  const sync = () => { try { window.CCTPushSync && window.CCTPushSync(); } catch {} try { window.CCT_renderPrefs && window.CCT_renderPrefs(); } catch {} };

  /* ── Telegram: encontrar tu chat solo (después de escribirle /start a tu bot) ── */
  async function tgFindChat(token) {
    const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=20`); const j = await r.json();
    if (!j.ok) throw new Error(j.description || 'Token no válido');
    const u = (j.result || []).map(x => x.message || x.channel_post || x.my_chat_member).filter(Boolean).pop();
    if (!u || !u.chat) throw new Error('Aún no veo mensajes: abre tu bot en Telegram, toca Iniciar (/start) y vuelve a intentar');
    return String(u.chat.id);
  }

  /* ── Google Calendar ── */
  const icsUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'calendar.ics';
  const gcalUrl = () => 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(icsUrl().replace(/^https?:/, 'webcal:'));
  async function downloadIcs() {
    const r = await fetch('calendar-data.json?_=' + Date.now()); const j = await r.json();
    const txt = window.CCTIcs.build(j.events || [], {minImpact: 'Medium'}), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], {type: 'text/calendar'})); a.download = 'vortex-calendario-economico.ics'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ── Panel ── */
  const chips = (sec, k) => `<div class="cx-chips">${KINDS.map(([id, n]) => `<button type="button" class="nt-chip${(k || {})[id] !== false ? ' on' : ''}" data-cx-k="${sec}:${id}" aria-pressed="${(k || {})[id] !== false}">${n}</button>`).join('')}</div>`;
  const msg = m => m.t ? `<p class="cx-msg ${m.c}">${esc(m.t)}</p>` : '';
  const sw = (id, on) => `<button type="button" class="toggle${on ? ' on' : ''}" data-cx-on="${id}" role="switch" aria-checked="${!!on}" aria-label="Activar"></button>`;
  let sel = ''; // conector abierto (solo uno a la vez): '' = solo la fila de iconos
  const ICS = {tg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M21.6 4.2 2.9 11.4c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.3-1.5zM9.8 14.2l-.4 4 -1.5-4.6 10.2-6.4z"/></svg>', wh: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><circle cx="12" cy="6" r="2.5"/><path d="M10.8 8.3 7.2 14.8M8.5 17h7M13.2 8.3l3.6 6.5"/></svg>', gc: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h3v3H8z" fill="currentColor"/></svg>', ai: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16v4M8 9.5h.01M12 9.5h.01M16 9.5h.01"/></svg>'};
  const NAMES = {tg: ['Telegram', 'Tus avisos a tu chat, al instante'], wh: ['Webhook', 'Cada aviso como JSON a tu URL (n8n, Make, Zapier…)'], gc: ['Google Calendar', 'Calendario económico (impacto medio y alto)'], ai: ['IA local', 'Ollama o LM Studio: gratis, privada y sin claves']};
  const stOf = (k, D) => k === 'tg' ? ((D.tg || {}).on ? 'on' : (D.tg || {}).token ? 'off' : '') : k === 'wh' ? ((D.wh || {}).on ? 'on' : (D.wh || {}).url ? 'off' : '') : '';
  const detail = (k, D) => {
    const tg = D.tg || {}, wh = D.wh || {}, head = (extra) => `<div class="cx-h"><span class="cx-ic ${k}">${ICS[k]}</span><div><b>${NAMES[k][0]}</b><small>${NAMES[k][1]}</small></div>${extra || ''}</div>`;
    if (k === 'tg') return head(sw('tg', tg.on)) + `
        ${tg.token && tg.chat ? '' : '<ol class="cx-steps"><li>En Telegram abre <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> → <b>/newbot</b> y copia el <b>token</b>.</li><li>Abre tu bot nuevo y toca <b>Iniciar</b>.</li><li>Pega el token aquí y toca <b>Buscar mi chat</b>.</li></ol>'}
        <input class="dc-input" id="cxTgTok" type="password" placeholder="Token del bot (123456:ABC…)" value="${esc(tg.token || '')}" autocomplete="off" spellcheck="false">
        <div class="cx-row"><input class="dc-input" id="cxTgChat" placeholder="Tu chat (se llena solo)" value="${esc(tg.chat || '')}" autocomplete="off" spellcheck="false"><button type="button" class="dc-btn" data-cx="tgfind">Buscar mi chat</button></div>
        <div class="dc-row"><button type="button" class="dc-btn pri" data-cx="tgsave">Guardar</button><button type="button" class="dc-btn" data-cx="tgtest" ${tg.token && tg.chat ? '' : 'disabled'}>Enviar prueba</button>${tg.token ? '<button type="button" class="dc-btn" data-cx="tgdel">Quitar</button>' : ''}</div>
        ${msg(st.tg)}<details class="cx-fmt"><summary>Qué se envía a Telegram</summary>${chips('tg', tg.k)}</details>`;
    if (k === 'wh') return head(sw('wh', wh.on)) + `
        <input class="dc-input" id="cxWhUrl" type="url" placeholder="https://tu-servidor.com/webhook" value="${esc(wh.url || '')}" autocomplete="off" spellcheck="false">
        <div class="dc-row"><button type="button" class="dc-btn pri" data-cx="whsave">Guardar</button><button type="button" class="dc-btn" data-cx="whtest" ${wh.url ? '' : 'disabled'}>Enviar prueba</button>${wh.url ? '<button type="button" class="dc-btn" data-cx="whdel">Quitar</button>' : ''}</div>
        ${msg(st.wh)}<details class="cx-fmt"><summary>Qué se envía al webhook</summary>${chips('wh', wh.k)}</details><details class="cx-fmt"><summary>Formato que recibe tu URL</summary><pre>{"source":"vortex","kind":"price","title":"Alerta de precio",
 "text":"BTC subió a 70,000 (ahora 70,012)","at":"2026-11-21T05:00:00Z"}</pre><small>kind: price · ind · move · trade · bots · radar</small></details>`;
    if (k === 'gc') return head() + `
        <div class="dc-row"><a class="dc-btn pri" href="${esc(gcalUrl())}" target="_blank" rel="noopener">Suscribirme en Google Calendar</a><button type="button" class="dc-btn" data-cx="ics">Descargar .ics</button><button type="button" class="dc-btn" data-cx="icscopy">Copiar enlace</button></div>
        <small class="cx-note">Suscrito se actualiza solo. También sirve en Apple Calendar u Outlook con el enlace.</small>${msg(st.cal)}`;
    return head() + `
        <p class="cx-p">Instala <a href="https://ollama.com" target="_blank" rel="noopener">Ollama</a>, descarga un modelo (<code>ollama pull llama3.2</code>) y ábrelo permitiendo VORTEX:<br><code>OLLAMA_ORIGINS=${esc(location.origin)} ollama serve</code><br>Luego en <b>Tu IA</b> elige «Ollama». Funciona en la PC donde corre Ollama.</p>
        <div class="dc-row"><button type="button" class="dc-btn pri" data-cx="ollama">Configurar en Tu IA</button></div>`;
  };
  function paint() {
    const box = $('#connBox'), sub = $('#connSub'), D = get(), tg = D.tg || {}, wh = D.wh || {};
    if (sub) { const n = [tg.on && 'Telegram', wh.on && 'Webhook'].filter(Boolean); sub.textContent = n.length ? 'Activos: ' + n.join(', ') : 'Telegram, webhook, Google Calendar e IA local'; }
    if (!box) return; box.hidden = !open; if (!open) return;
    const tiles = ['tg', 'wh', 'gc', 'ai'].map(k => { const s0 = stOf(k, D); return `<button type="button" class="cx-tile${sel === k ? ' sel' : ''}" data-cx-sel="${k}" aria-expanded="${sel === k}" title="${NAMES[k][0]}"><span class="cx-ic ${k}">${ICS[k]}</span><span class="cx-tn">${{tg: 'Telegram', wh: 'Webhook', gc: 'Calendario', ai: 'IA local'}[k]}</span>${s0 ? `<i class="cx-dot ${s0}" title="${s0 === 'on' ? 'Activo' : 'Configurado, apagado'}"></i>` : ''}</button>`; }).join('');
    box.innerHTML = `<div class="cx-grid">${tiles}</div>` + (sel ? `<div class="cx-card cx-det" data-k="${sel}">${detail(sel, D)}</div>` : '<p class="cx-hint">Toca un conector para configurarlo.</p>');
  }
  const flash = (sec, t, c) => { st[sec] = {t, c}; paint(); };
  document.addEventListener('click', async e => {
    if (e.target.closest('#setConn')) { open = !open; paint(); if (open) $('#connBox').scrollIntoView({block: 'nearest', behavior: 'smooth'}); return; }
    const ts = e.target.closest('[data-cx-sel]'); if (ts) { sel = sel === ts.dataset.cxSel ? '' : ts.dataset.cxSel; paint(); return; }
    const on = e.target.closest('[data-cx-on]'); if (on) { const k = on.dataset.cxOn, D = get(), c = D[k] || {};
      if (!c.on && (k === 'tg' ? !(c.token && c.chat) : !c.url)) { flash(k, k === 'tg' ? 'Primero guarda tu token y tu chat.' : 'Primero guarda la URL de tu webhook.', 'err'); return; }
      store().set({[k]: Object.assign({}, c, {on: !c.on})}); paint(); sync(); return; }
    const kk = e.target.closest('[data-cx-k]'); if (kk) { const [sec, id] = kk.dataset.cxK.split(':'), c = get()[sec] || {}, k = Object.assign({}, c.k); k[id] = k[id] === false; store().set({[sec]: Object.assign({}, c, {k})}); paint(); sync(); return; }
    const b = e.target.closest('[data-cx]'); if (!b || !store()) return; const a = b.dataset.cx, D = get();
    try {
      if (a === 'tgfind') { const tok = $('#cxTgTok').value.trim(); if (!TG_TOKEN.test(tok)) return flash('tg', 'Ese token no parece de @BotFather (123456789:ABC…).', 'err'); flash('tg', 'Buscando tu chat…', ''); const chat = await tgFindChat(tok); $('#cxTgChat') && ($('#cxTgChat').value = chat); store().set({tg: Object.assign({}, D.tg, {token: tok, chat, on: true})}); flash('tg', 'Listo: chat encontrado y guardado. Toca «Enviar prueba».', 'ok'); sync(); }
      else if (a === 'tgsave') { const tok = $('#cxTgTok').value.trim(), chat = $('#cxTgChat').value.trim(); if (!TG_TOKEN.test(tok)) return flash('tg', 'Ese token no parece de @BotFather (123456789:ABC…).', 'err'); if (!TG_CHAT.test(chat)) return flash('tg', 'Falta tu chat: toca «Buscar mi chat».', 'err'); store().set({tg: Object.assign({}, D.tg, {token: tok, chat, on: true})}); flash('tg', 'Guardado y activado.', 'ok'); sync(); }
      else if (a === 'tgtest') { flash('tg', 'Enviando…', ''); await tgSend(D.tg, 'Conectado', 'Aquí te llegarán tus avisos de VORTEX ✅'); flash('tg', 'Prueba enviada: revisa Telegram.', 'ok'); }
      else if (a === 'tgdel') { store().set({tg: {on: false, token: '', chat: '', k: (D.tg || {}).k}}); flash('tg', 'Telegram quitado.', ''); sync(); }
      else if (a === 'whsave') { const u = $('#cxWhUrl').value.trim(); if (!okUrl(u)) return flash('wh', 'Pon una dirección https:// pública.', 'err'); store().set({wh: Object.assign({}, D.wh, {url: u, on: true})}); flash('wh', 'Guardado y activado.', 'ok'); sync(); }
      else if (a === 'whtest') { flash('wh', 'Enviando…', ''); const r = await whSend(D.wh, 'test', 'Prueba', 'Webhook de VORTEX conectado ✅'); flash('wh', r === 'sin-cors' ? 'Enviada (tu servidor no permite que el navegador lea la respuesta; revisa que haya llegado).' : 'Prueba enviada: tu URL respondió bien.', 'ok'); }
      else if (a === 'whdel') { store().set({wh: {on: false, url: '', k: (D.wh || {}).k}}); flash('wh', 'Webhook quitado.', ''); sync(); }
      else if (a === 'ics') { await downloadIcs(); flash('cal', 'Descargado: ábrelo para agregarlo a tu calendario.', 'ok'); }
      else if (a === 'icscopy') { await navigator.clipboard.writeText(icsUrl()); flash('cal', 'Enlace copiado: ' + icsUrl(), 'ok'); }
      else if (a === 'ollama') { const r = $('#setOwnAI'); if (r) { r.click(); setTimeout(() => { const s = $('#oaProv'); if (s) { s.value = 'ollama'; s.dispatchEvent(new Event('change', {bubbles: true})); } }, 80); } }
    } catch (er) { const sec = a.startsWith('tg') ? 'tg' : a.startsWith('wh') ? 'wh' : 'cal'; flash(sec, 'No funcionó: ' + String(er && er.message || er).slice(0, 160), 'err'); }
  });
  window.CCTConn = {send, serverCfg, paint, KINDS, TG_TOKEN, TG_CHAT, okUrl, tgSend, whSend};
  const boot = () => paint(); if (document.readyState === 'complete') boot(); else addEventListener('load', boot);
})();

/* VORTEX · Avisos con la app CERRADA (Web Push).
   Registra este celular en el Worker «vortex-push» (worker/push-alerts.mjs) y le manda tus alertas de PRECIO y la configuración de
   movimientos bruscos. El Worker las revisa cada minuto y te manda la notificación aunque VORTEX esté cerrada.
   Las alertas con indicador siguen revisándose solo con la app abierta.
   Lee tus alertas a través de window.CCTPushBridge (app.js, que se carga antes). */
(function () {
  'use strict';
  const B = window.CCTPushBridge; if (!B) return;
  const st = () => B.state(), toast = m => B.toast(m);
  const KEY = 'cct_push_v1', DEF_URL = 'https://vortex-push.soobroon.workers.dev';
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const store = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };
  let cfg = load(), lastSig = '', busy = false, lastErr = '', lastMaster = null;
  if (!cfg.id) { const r = new Uint8Array(18); crypto.getRandomValues(r); cfg.id = 'd_' + Array.from(r, b => b.toString(16).padStart(2, '0')).join(''); store(cfg); }
  const url = () => String(cfg.url || DEF_URL).replace(/\/+$/, '');
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  const b64ToU8 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '='.repeat((4 - s.length % 4) % 4)); return Uint8Array.from(bin, c => c.charCodeAt(0)); };
  async function api(path, body) {
    const r = await fetch(url() + path, body ? {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)} : {});
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) throw new Error(j.error || 'El servidor de avisos respondió ' + r.status);
    return j;
  }
  const priceAlerts = () => (st().alerts || []).filter(a => a.kind !== 'ind').map(a => ({id: a.id, symbol: a.symbol, on: a.on, price: a.price, dir: a.dir, cond: a.cond, repeat: a.repeat, wait: a.wait, exp: a.exp, expired: a.expired, note: a.note, notify: a.notify, firedAt: a.firedAt || 0, firedPrice: a.firedPrice}));
  const payload = () => ({alerts: priceAlerts(), move: {on: !!(st().moveAlerts || {}).on, pct: (st().moveAlerts || {}).pct || 2}, scr: {on: !!(st().scrPush || {}).on, h1: (st().scrPush || {}).h1 !== false, h4: (st().scrPush || {}).h4 !== false}, priceOn: !((B.prefs() || {}).n && B.prefs().n.price === false)});

  function applyBack(back) { // alertas que el servidor disparó mientras la app estaba cerrada
    let ch = false;
    for (const s of back || []) {
      const a = (st().alerts || []).find(x => x.id === s.id); if (!a || !(s.firedAt > (a.firedAt || 0))) continue;
      for (const k of ['on', 'dir', 'firedAt', 'firedPrice']) a[k] = s[k];
      if (s.wait) a.wait = true; else delete a.wait; if (s.expired) a.expired = true;
      ch = true;
    }
    if (ch) { try { B.save(); B.renderAlerts(); B.scheduleRender(); } catch {} }
  }
  async function sync(force) {
    if (!cfg.on || busy) return; const p = payload(), sig = JSON.stringify(p);
    if (!force && sig === lastSig && Date.now() - (cfg.at || 0) < 6 * 3600e3) return;
    busy = true;
    try {
      const reg = await navigator.serviceWorker.ready, sub = await ensureSub(reg);
      if (!sub) { lastErr = Notification.permission === 'denied' ? 'El celular bloqueó las notificaciones de VORTEX: actívalas en Ajustes del sistema → Apps → VORTEX/Chrome → Notificaciones. El interruptor sigue encendido y se reanuda solo.' : 'Esperando el permiso de notificaciones del celular.'; return; } // NUNCA se apaga solo: solo tú lo apagas
      const j = await api('/sync', {id: cfg.id, sub: sub.toJSON(), since: cfg.since || 0, ...p});
      applyBack(j.back); cfg.since = j.now || Date.now(); cfg.at = Date.now(); store(cfg);
      lastSig = JSON.stringify(payload()); lastErr = '';
    } catch (e) { lastErr = e.message || 'Sin conexión con el servidor de avisos'; }
    finally { busy = false; render(); }
  }
  /* Si el navegador renovó o perdió la suscripción (pasa al salir de la app, al actualizarse o tras días sin uso),
     se crea otra sola —sin preguntarte— mientras el permiso siga concedido. Así el interruptor se queda encendido para siempre. */
  async function ensureSub(reg) {
    let sub = await reg.pushManager.getSubscription(); if (sub) return sub;
    if (!ok || Notification.permission !== 'granted') return null;
    if (!cfg.key) { cfg.key = (await api('/vapid')).key; store(cfg); }
    try { sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64ToU8(cfg.key)}); }
    catch { const {key} = await api('/vapid'); cfg.key = key; store(cfg); sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64ToU8(key)}); }
    return sub;
  }
  /* El service worker también necesita saber a quién avisar si el sistema cambia la suscripción con la app cerrada (evento pushsubscriptionchange). */
  const meta = on => { try { caches.open('vortex-meta').then(c => on ? c.put('push-meta', new Response(JSON.stringify({id: cfg.id, url: url(), key: cfg.key || ''}))) : c.delete('push-meta')).catch(() => {}); } catch {} };
  async function enable() {
    if (!ok) { toast(ios && !standalone ? 'En iPhone primero añade VORTEX a la pantalla de inicio y ábrela desde ahí' : 'Este navegador no permite notificaciones push'); return false; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast(isPC ? 'Necesito tu permiso: toca el candado junto a la dirección → Notificaciones → Permitir' : 'Necesito tu permiso de notificaciones (Ajustes del celular → Apps → Chrome/VORTEX → Notificaciones)'); return false; }
    try {
      const reg = await navigator.serviceWorker.ready, {key} = await api('/vapid');
      let sub = await reg.pushManager.getSubscription();
      if (sub && cfg.key && cfg.key !== key) { await sub.unsubscribe(); sub = null; } // el servidor cambió de claves
      if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64ToU8(key)});
      cfg.on = true; cfg.noPush = false; cfg.key = key; store(cfg); meta(true); await sync(true);
      if (!lastErr) toast('Notificaciones activadas: te aviso aunque VORTEX esté cerrada');
    } catch (e) {
      const m = e.message || String(e);
      /* En PC, Brave (y algunos Chromium) bloquean el servicio push de Google: «Registration failed - push service error».
         Se quedan activos el sonido y las notificaciones con la app abierta, y se explica cómo habilitar la app cerrada. */
      if (/push service|registration failed|AbortError|not supported/i.test(m + ' ' + (e.name || ''))) { cfg.noPush = true; store(cfg); lastErr = ''; toast(isBrave ? 'Activadas con VORTEX abierta. Brave bloquea los avisos con la app cerrada (mira cómo habilitarlos abajo)' : 'Activadas con VORTEX abierta. Tu navegador no permite avisos con la app cerrada'); }
      else { lastErr = m; toast('No se pudo activar: ' + m); }
    }
    render(); return !!cfg.on || !!cfg.noPush;
  }
  async function disable() {
    cfg.on = false; store(cfg); meta(false);
    try { await api('/sync', {id: cfg.id, off: true}); } catch {}
    try { const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch {}
    render(); toast('Notificaciones desactivadas');
  }
  async function testPush() {
    try { await sync(true); const j = await api('/test', {id: cfg.id}); toast(j.ok ? 'Prueba enviada: cierra la app y mira tu celular' : 'El servicio push respondió ' + j.status); }
    catch (e) { toast('No se pudo enviar la prueba: ' + e.message); }
  }

  /* Un solo interruptor: «Activar notificaciones» enciende sonido + vibración + notificaciones del sistema + avisos con la app cerrada.
     Si el navegador no permite push (p. ej. iPhone sin instalar), enciende lo demás y explica cómo tener también la app cerrada. */
  const soundOn = () => ((B.prefs() || {}).sound) !== 'off';
  const isBrave = !!navigator.brave, isPC = !/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  const master = () => ok && !cfg.noPush ? !!cfg.on : soundOn(); // sin push (navegador que lo bloquea): «activado» = sonido + notificaciones con la app abierta
  async function turnOn() {
    if (B.setSound) B.setSound(true);
    if (ok) { const on = await enable(); if (!on && B.setSound) B.setSound(false); render(); return; }
    try { if (window.Notification && Notification.permission === 'default') await Notification.requestPermission(); } catch {}
    toast(ios && !standalone ? 'Notificaciones activadas. Para recibirlas con la app cerrada en iPhone, añade VORTEX a la pantalla de inicio' : 'Notificaciones activadas');
    render();
  }
  async function turnOff() {
    if (B.setSound) B.setSound(false);
    if (cfg.noPush) { cfg.noPush = false; store(cfg); }
    if (ok && cfg.on) { await disable(); return; }
    render(); toast('Notificaciones desactivadas');
  }
  function render() {
    const box = document.getElementById('pushBox'); if (!box) return;
    const on = master(), n = priceAlerts().filter(a => a.on).length, mv = !!(st().moveAlerts || {}).on;
    const why = !on ? 'Un solo botón: sonido, vibración y aviso en tu celular aunque VORTEX esté cerrada.'
      : cfg.noPush ? (isBrave ? 'Activas con VORTEX abierta. Para recibirlas también con la app cerrada en Brave: abre brave://settings/privacy, enciende «Usar los servicios de Google para la mensajería push», reinicia Brave y toca Reintentar.' : 'Activas con VORTEX abierta. Este navegador no permite avisos con la app cerrada; en Chrome o Edge sí funcionan.')
      : !ok ? (ios && !standalone ? 'Activas con la app abierta. Para la app cerrada: Compartir → Añadir a pantalla de inicio.' : 'Activas con la app abierta. Este navegador no permite avisos con la app cerrada.')
      : lastErr ? '⚠ ' + lastErr : `Activas, también con la app cerrada · vigilando ${n} alerta${n === 1 ? '' : 's'} de precio${mv ? ' y movimientos bruscos' : ''}`;
    box.innerHTML = `<div class="setting-row nt-master${on ? ' on' : ''}"><div><b>Activar notificaciones</b><small>${why}</small></div><button class="toggle ${on ? 'on' : ''}" id="pushOn" type="button" aria-label="Activar notificaciones" aria-pressed="${on}"></button></div>`
      + (on && cfg.noPush ? `<div class="setting-row"><div><b>Avisos con la app cerrada</b><small>Bloqueados por el navegador</small></div><button class="small-button" id="pushRetry" type="button">Reintentar</button></div>` : '')
      + (on && ok && cfg.on ? `<div class="setting-row"><div><b>Probar</b><small>Manda una notificación de prueba a este celular</small></div><button class="small-button" id="pushTest" type="button">Enviar</button></div>` : '');
    if (on !== lastMaster) { lastMaster = on; if (B.renderPrefs) try { B.renderPrefs(); } catch {} } // «Qué te avisamos» cambia según esté encendido
  }
  document.addEventListener('click', e => {
    if (e.target.closest('#pushOn')) { master() ? turnOff() : turnOn(); }
    else if (e.target.closest('#pushTest')) testPush();
    else if (e.target.closest('#pushRetry')) enable();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(true); }); // al volver a la app trae lo que disparó el servidor
  setInterval(() => sync(false), 10000); // si cambian tus alertas, se mandan al servidor en ≤10 s
  window.addEventListener('pageshow', () => { if (cfg.on) sync(true); }); // al volver desde otra app (Android puede congelar la página)
  render(); if (cfg.on) { meta(true); sync(true); }
  window.VortexPush = {sync, enable, disable, render, get on() { return !!cfg.on; }, get master() { return master(); }};
})();

/* VORTEX · Ajustes en tu cuenta (los que antes se quedaban solo en el dispositivo).
   Gráfico, indicadores, dibujos, bots, scripts, alertas, Tu IA, diario y exchange ya se guardan en tu cuenta por su lado;
   esto suma el resto: Nexus Pixel (reglas y personalización), cuenta demo de Operar, avisos de tus trades, libro de órdenes,
   filtros de Noticias, última herramienta de cada grupo, leyenda abierta/cerrada, posición de la cápsula del celular, Claudio local
   la configuración de la IA y el estilo de la app (Clásico, Minimal o Espacial). Cada cambio sube solo (users/<tú>/data/prefs) y en tus otros dispositivos se aplica al abrir VORTEX.
   Gana siempre el cambio más reciente de cada ajuste. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.localStorage || /[?&]pane=/.test(location.search)) return;
  const KEYS = ['cct_pixel_v1', 'cct_trade_v1', 'cct_trade_ui_v1', 'cct_tw_v1', 'cct_book_ui_v1', 'cct_news_filter', 'cct_news_tab', 'cct_railLast_v1', 'cct_legOpen_v1', 'cct_pill_pos_v1', 'cct_claudio_local_v1', 'cct_llm_v1', 'vx-style', 'vx-perf'];
  const RELOAD = ['cct_pixel_v1', 'cct_trade_v1', 'cct_tw_v1', 'cct_claudio_local_v1', 'cct_llm_v1']; // los únicos que necesitan recargar para aplicarse
  const META = 'cct_prefs_at', MAX_VAL = 250000, LS = window.localStorage, t0 = Date.now();
  const C = () => window.CCTCloudPriv;
  let at = {}; try { at = JSON.parse(LS.getItem(META) || '{}') || {}; } catch {}
  let applying = false, busy = false, pulled = false, timer = 0, uidSeen = '';
  const set0 = Storage.prototype.setItem, rem0 = Storage.prototype.removeItem;
  const mark = k => { at[k] = Date.now(); try { set0.call(LS, META, JSON.stringify(at)); } catch {} clearTimeout(timer); timer = setTimeout(push, 2000); };
  Storage.prototype.setItem = function (k, v) { set0.call(this, k, v); if (this === LS && !applying && KEYS.includes(k)) mark(k); };
  Storage.prototype.removeItem = function (k) { rem0.call(this, k); if (this === LS && !applying && KEYS.includes(k)) mark(k); };

  async function push() {
    clearTimeout(timer); const c = C(); if (!pulled || !c || !c.ready()) return;
    const v = {}, a = {};
    for (const k of KEYS) { if (!at[k]) continue; const x = LS.getItem(k); if (x != null && x.length > MAX_VAL) continue; v[k] = x; a[k] = at[k]; }
    try { await c.set('prefs', {v, at: a, upd: Date.now()}); } catch (e) { /* sin conexión: se reintenta en el siguiente cambio o al ocultar la app */ }
  }
  async function pull() {
    const c = C(); if (!c || !c.ready()) return;
    const uid = (c.uid && c.uid()) || 'x'; if (pulled && uid === uidSeen) return; uidSeen = uid;
    if (busy) return; busy = true;
    let d = null; try { d = await c.get('prefs'); } catch { return; } finally { busy = false; }
    pulled = true; const changed = [];
    { let ow = ''; try { ow = LS.getItem('cct_prefs_uid') || ''; } catch {} if (ow && ow !== uid) { at = {}; } try { set0.call(LS, 'cct_prefs_uid', uid); } catch {} } // ajustes de otra cuenta en este navegador: gana lo de TU cuenta y no se suben a ella
    const ra = (d && d.at) || {}, rv = (d && d.v) || {};
    applying = true;
    try { for (const k of KEYS) { const t = +ra[k] || 0; if (t > (at[k] || 0)) { if (rv[k] == null) LS.removeItem(k); else LS.setItem(k, rv[k]); at[k] = t; changed.push(k); } } }
    finally { applying = false; }
    try { set0.call(LS, META, JSON.stringify(at)); } catch {}
    if (KEYS.some(k => (at[k] || 0) > (+ra[k] || 0))) push(); // lo de este dispositivo que es más nuevo, a tu cuenta
    if (changed.includes('vx-style') && window.VXTheme && window.VXTheme.refresh) window.VXTheme.refresh(); // el estilo se aplica al momento
    if (changed.includes('vx-perf') && window.VXTheme && window.VXTheme.refreshPerf) window.VXTheme.refreshPerf(); // modo ligero/completo: al momento
    // Solo los ajustes que un módulo guarda en memoria al abrir (y podría volver a escribir con su copia vieja) piden recargar.
    // Lo visual (leyenda abierta, posición de la cápsula, filtros de noticias, última herramienta…) se aplica la próxima vez que abras, sin recargar:
    // antes cualquier cambio en otro dispositivo hacía que la app cargara dos veces (y la animación de apertura saliera dos veces).
    if (changed.some(k => RELOAD.includes(k))) {
      let once = false; try { once = sessionStorage.getItem('cct_prefs_rl') === '1'; } catch {}
      if (Date.now() - t0 < 25000 && !once) {
        try { sessionStorage.setItem('cct_prefs_rl', '1'); if (document.getElementById('vxSplash')) sessionStorage.setItem('vx_splash_resume', String(Date.now())); } catch {} // la animación de apertura sigue donde iba, sin empezar de nuevo
        location.reload();
      }
    }
  }
  // Al abrir se revisa seguido (en cuanto la sesión esté lista) para que, si hay que recargar, sea durante la animación de apertura y no después.
  const early = setInterval(() => { if (pulled || Date.now() - t0 > 15000) { clearInterval(early); return; } pull(); }, 250);
  setInterval(pull, 3000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') push(); else if (pulled) { pulled = false; uidSeen = ''; pull(); } });
  window.addEventListener('pagehide', () => push());
  window.CCTPrefsSync = {push, pull, KEYS};
})();

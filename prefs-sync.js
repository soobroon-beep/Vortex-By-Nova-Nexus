/* VORTEX · Ajustes en tu cuenta (los que antes se quedaban solo en el dispositivo).
   Gráfico, indicadores, dibujos, bots, scripts, alertas, Tu IA, diario y exchange ya se guardan en tu cuenta por su lado;
   esto suma el resto: Nexus Pixel (reglas y personalización), cuenta demo de Operar, avisos de tus trades, libro de órdenes,
   filtros de Noticias, última herramienta de cada grupo, leyenda abierta/cerrada, posición de la cápsula del celular, Claudio local
   y la configuración de la IA. Cada cambio sube solo (users/<tú>/data/prefs) y en tus otros dispositivos se aplica al abrir VORTEX.
   Gana siempre el cambio más reciente de cada ajuste. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.localStorage || /[?&]pane=/.test(location.search)) return;
  const KEYS = ['cct_pixel_v1', 'cct_trade_v1', 'cct_trade_ui_v1', 'cct_tw_v1', 'cct_book_ui_v1', 'cct_news_filter', 'cct_news_tab', 'cct_railLast_v1', 'cct_legOpen_v1', 'cct_pill_pos_v1', 'cct_claudio_local_v1', 'cct_llm_v1'];
  const META = 'cct_prefs_at', MAX_VAL = 250000, LS = window.localStorage, t0 = Date.now();
  const C = () => window.CCTCloudPriv;
  let at = {}; try { at = JSON.parse(LS.getItem(META) || '{}') || {}; } catch {}
  let applying = false, pulled = false, timer = 0, uidSeen = '';
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
    let d = null; try { d = await c.get('prefs'); } catch { return; }
    pulled = true; const changed = [];
    const ra = (d && d.at) || {}, rv = (d && d.v) || {};
    applying = true;
    try { for (const k of KEYS) { const t = +ra[k] || 0; if (t > (at[k] || 0)) { if (rv[k] == null) LS.removeItem(k); else LS.setItem(k, rv[k]); at[k] = t; changed.push(k); } } }
    finally { applying = false; }
    try { set0.call(LS, META, JSON.stringify(at)); } catch {}
    if (KEYS.some(k => (at[k] || 0) > (+ra[k] || 0))) push(); // lo de este dispositivo que es más nuevo, a tu cuenta
    if (changed.length) { // los módulos leen sus ajustes al abrir: si acabas de abrir, se recarga una vez; si no, se aplican la próxima vez
      let once = false; try { once = sessionStorage.getItem('cct_prefs_rl') === '1'; } catch {}
      if (Date.now() - t0 < 25000 && !once) { try { sessionStorage.setItem('cct_prefs_rl', '1'); } catch {} location.reload(); }
    }
  }
  setInterval(pull, 3000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') push(); else if (pulled) { pulled = false; uidSeen = ''; pull(); } });
  window.addEventListener('pagehide', () => push());
  window.CCTPrefsSync = {push, pull, KEYS};
})();

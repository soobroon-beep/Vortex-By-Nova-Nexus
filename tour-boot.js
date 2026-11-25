/* VORTEX · Recorrido de bienvenida interactivo (tour.html).
   Sale una sola vez: la primera vez que alguien abre VORTEX en ese navegador. Se puede volver a ver en Configuración › Acerca de › «Ver recorrido».
   Al terminar, tour.html avisa (postMessage) con el estilo y el plan que eligió la persona: el estilo se aplica al momento
   y, si eligió Plus o Infinity, se abre la ventana de planes en ese plan. Si salta el recorrido no se cambia nada. */
(function () {
  'use strict';
  var KEY = 'vortex_tour_done';
  if (/[?&]pane=/.test(location.search)) return; // paneles incrustados: nunca
  function seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return true; } }
  var fr = null;
  function open() {
    if (fr) return;
    fr = document.createElement('iframe');
    fr.src = 'tour.html'; fr.title = 'Recorrido de bienvenida de VORTEX'; fr.setAttribute('allow', 'autoplay; fullscreen');
    fr.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483600;background:#03050a;opacity:0;transition:opacity .45s ease';
    document.body.appendChild(fr);
    requestAnimationFrame(function () { requestAnimationFrame(function () { if (fr) fr.style.opacity = '1'; }); });
    fr.addEventListener('load', function () { try { fr.contentWindow.focus(); } catch (e) {} });
  }
  function close() {
    if (!fr) return; var f = fr; fr = null;
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    f.style.opacity = '0'; setTimeout(function () { f.remove(); }, 500);
  }
  addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'vortex:tour-finished') return;
    var d = e.data; close();
    if (d.skipped) return;
    try { if (d.theme && window.VXTheme && d.theme !== window.VXTheme.get()) window.VXTheme.set(d.theme); } catch (err) {}
    if (d.plan === 'plus' || d.plan === 'infinity') setTimeout(function () {
      try { var P = window.CCTPlans; if (P && P.current && P.current() !== d.plan && P.current() !== 'infinity') P.open(d.plan); } catch (err) {}
    }, 700);
  });
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-vx-tour]')) { e.preventDefault(); open(); } });
  window.VXTour = { open: open, close: close };
  if (!seen()) { if (document.body) open(); else document.addEventListener('DOMContentLoaded', open); }
})();

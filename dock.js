/* VORTEX · efecto "dock" (como el Floating Dock de Aceternity): al pasar el ratón por una barra de iconos, el icono bajo el cursor crece y
   sus vecinos crecen menos, con un resorte suave. Solo escala el dibujo del icono: no mueve ni reordena nada. Solo con ratón y sin "reducir movimiento". */
(function () {
  'use strict';
  const mq = q => window.matchMedia && matchMedia(q).matches;
  if (mq('(prefers-reduced-motion: reduce)') || !mq('(hover: hover) and (pointer: fine)')) return;
  const RANGE = 96, K = 150, C = 12, M = 0.1; // alcance en px, crecimiento máximo y resorte (misma sensación que el original)
  function dock(rail, sel, MAX, gsel, range, key) { // MAX: cuánto crece el icono bajo el cursor
    if (!rail) return;
    let mouse = Infinity, raf = 0, last = 0, mids = null; const st = new Map();
    // Las posiciones de los iconos se miden UNA vez al entrar (y al cambiar de tamaño la ventana), no en cada cuadro:
    // antes se leía getBoundingClientRect() de cada icono justo después de escribir su escala, lo que obligaba al navegador
    // a recalcular toda la página en cada cuadro y se sentía un brinco/glitch al pasar el ratón.
    const measure = () => { mids = new Map(); for (const b of rail.querySelectorAll(sel)) { const r = b.getBoundingClientRect(); mids.set(b, r.top + r.height / 2); } };
    const glyph = b => b.querySelector(gsel || ':scope > svg, :scope > img, :scope > .ic, :scope > i'), kOf = b => key ? key(b) : b;
    function frame(now) {
      const dt = Math.min(1 / 30, (now - last) / 1000 || 1 / 60); last = now; let busy = mouse !== Infinity;
      for (const b of rail.querySelectorAll(sel)) {
        const g = glyph(b); if (!g) continue; const kk = kOf(b); let s = st.get(kk); if (!s) st.set(kk, s = {x: 1, v: 0});
        let target = 1; if (mouse !== Infinity) { if (!mids || !mids.has(b)) measure(); const d = Math.abs(mouse - mids.get(b)); target = 1 + (MAX - 1) * Math.max(0, 1 - d / (range || RANGE)); }
        for (let i = 0; i < 4; i++) { const a = (K * (target - s.x) - C * s.v) / M, h = dt / 4; s.v += a * h; s.x += s.v * h; }
        const vOnly = b.classList.contains('theme-sw'); // sol/luna: ya usan transform para girar al cambiar de tema → crecen con la variable --dk (CSS «scale»)
        if (Math.abs(s.x - 1) < .003 && Math.abs(s.v) < .02 && target === 1) { s.x = 1; s.v = 0; if (g.style.transform || b.style.getPropertyValue('--dk')) { if (!vOnly) g.style.transform = ''; b.style.zIndex = ''; b.style.removeProperty('--dk'); } g.style.willChange = ''; continue; }
        busy = true; const moving = Math.abs(s.v) > .05 || Math.abs(target - s.x) > .004; if (!vOnly) { g.style.transition = 'none'; g.style.transform = `scale(${s.x.toFixed(3)})`; if (g.style.willChange !== (moving ? 'transform' : '')) g.style.willChange = moving ? 'transform' : ''; } // mientras se mueve va en la GPU (sin repintar la página); quieto se vuelve a dibujar nítido b.style.setProperty('--dk', s.x.toFixed(3)); { const z = s.x > 1.001 ? '3' : ''; if (b.style.zIndex !== z) b.style.zIndex = z; } // sin will-change: así el icono vectorial se vuelve a dibujar nítido en cada tamaño (no se pixela)
      }
      raf = busy ? requestAnimationFrame(frame) : 0;
    }
    const go = () => { if (lite() || ignore) return; if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    const snap = () => { // todo de vuelta a su tamaño al instante (sin resorte)
      mouse = Infinity; cancelAnimationFrame(raf); raf = 0;
      for (const b of rail.querySelectorAll(sel)) { const s = st.get(kOf(b)); if (s) { s.x = 1; s.v = 0; } const g = glyph(b); if (g && !b.classList.contains('theme-sw')) g.style.transform = ''; b.style.zIndex = ''; b.style.removeProperty('--dk'); }
    };
    rail.addEventListener('mousemove', e => {
      if (e.buttons) return; /* arrastrando: no interfiere */
      // Al volver a la ventana (estaba minimizada o en otra app) el navegador manda un «mousemove» con la última posición del ratón aunque no lo muevas:
      // antes eso inflaba los iconos y luego se encogían solos. Ahora solo crecen cuando el ratón de verdad se mueve sobre la barra.
      if (ignore) { if (ignore === true) { ignore = {x: e.clientX, y: e.clientY}; return; } if (Math.hypot(e.clientX - ignore.x, e.clientY - ignore.y) < 3) return; ignore = null; }
      mouse = e.clientY; go();
    });
    rail.addEventListener('mouseleave', () => { mouse = Infinity; go(); });
    rail.addEventListener('mouseenter', () => { mids = null; });
    window.addEventListener('resize', () => { mids = null; }); window.addEventListener('scroll', () => { mids = null; }, true);
    resets.push(snap);
  }
  let ignore = null; const resets = [];
  const lite = () => document.documentElement.classList.contains('vx-lite'); // Modo ligero: sin efecto dock
  const away = () => { ignore = true; resets.forEach(f => f()); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) away(); else ignore = true; });
  window.addEventListener('blur', away); window.addEventListener('focus', () => { ignore = true; });
  document.addEventListener('mouseleave', () => resets.forEach(f => f())); // el ratón salió de la ventana
  const init = () => { dock(document.getElementById('rightRail'), '.rr-btn', 1.9); dock(document.getElementById('toolRail'), 'button', 1.6);
    dock(document.getElementById('watchRows'), '.watch-row[data-symbol]', 1.25, '.coin-icon', 80, b => b.dataset.symbol); /* lista de seguimiento: crece la foto de la moneda */ };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

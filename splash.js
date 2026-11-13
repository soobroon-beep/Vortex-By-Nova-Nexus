/* VORTEX · animación de apertura (al abrir o recargar). Espacio con estrellas que viajan hacia ti, nebulosa,
   el logo que aparece con su órbita trazándose y, al terminar de cargar, un salto a velocidad luz.
   Se quita sola cuando el gráfico ya tiene velas (app.js llama a CCT_splashDone) o, como máximo, a los 8 s. */
(function () {
  'use strict';
  var el = document.getElementById('vxSplash'); if (!el) return;
  if (/[?&]pane=/.test(location.search)) { el.remove(); return; } // paneles incrustados: sin animación
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t0 = performance.now(), MIN = reduce ? 500 : 1500, done = false, warp = 0, raf = 0;
  try { var id = window.CCTAppIcons && CCTAppIcons.selected; if (id) el.querySelector('.vxs-logo').src = 'icons/pc/' + id + '-192.png'; } catch (e) {}

  /* Estrellas en 3D: salen del centro hacia afuera; con «warp» se estiran en rayas de luz */
  var cv = el.querySelector('canvas'), g = cv.getContext('2d'), W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1), stars = [];
  function size() { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function star(z) { return {x: (Math.random() - .5) * 2, y: (Math.random() - .5) * 2, z: z == null ? Math.random() : z, h: Math.random() < .18 ? (Math.random() < .5 ? 265 : 205) : 0}; }
  size(); addEventListener('resize', size);
  var N = Math.min(420, Math.round(W * H / 2600)); for (var i = 0; i < N; i++) stars.push(star());
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(50, now - last) / 1000; last = now;
    var sp = reduce ? 0 : .07 + warp * 2.6, cx = W / 2, cy = H / 2, R = Math.max(W, H) * .62;
    g.fillStyle = warp ? 'rgba(4,6,14,.35)' : 'rgba(4,6,14,1)'; g.fillRect(0, 0, W, H);
    for (var k = 0; k < stars.length; k++) {
      var s = stars[k], pz = s.z; s.z -= sp * dt; if (s.z <= .02) { stars[k] = star(1); continue; }
      var x = cx + s.x / s.z * R * .5, y = cy + s.y / s.z * R * .5; if (x < -20 || x > W + 20 || y < -20 || y > H + 20) { stars[k] = star(1); continue; }
      var a = Math.min(1, (1 - s.z) * 1.4), r = Math.max(.4, (1 - s.z) * 1.9);
      g.strokeStyle = g.fillStyle = s.h ? 'hsla(' + s.h + ',90%,78%,' + a + ')' : 'rgba(230,236,255,' + a + ')';
      if (warp > .05) { var px = cx + s.x / pz * R * .5, py = cy + s.y / pz * R * .5; g.lineWidth = r; g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke(); }
      else { g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); }
    }
    if (warp) warp = Math.min(1, warp + dt * 2.2);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function finish() {
    if (done) return; done = true;
    var wait = Math.max(0, MIN - (performance.now() - t0));
    setTimeout(function () {
      warp = reduce ? 0 : .06; el.classList.add('out');
      setTimeout(function () { cancelAnimationFrame(raf); removeEventListener('resize', size); el.remove(); }, reduce ? 350 : 900);
    }, wait);
  }
  window.CCT_splashDone = finish;
  setTimeout(finish, 8000); // nunca se queda atorada
  addEventListener('load', function () { setTimeout(finish, 3000); }); // si abres en otra pantalla que no es el gráfico
})();

/* VORTEX · animación de apertura (al abrir o recargar). Espacio con estrellas que viajan hacia ti, nebulosa,
   el logo que aparece con su órbita trazándose y, al terminar de cargar, un salto a velocidad luz.
   Se quita sola cuando el gráfico ya tiene velas (app.js llama a CCT_splashDone) o, como máximo, a los 8 s. */
(function () {
  'use strict';
  var el = document.getElementById('vxSplash'); if (!el) return;
  if (/[?&]pane=/.test(location.search)) { el.remove(); return; } // paneles incrustados: sin animación
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t0 = performance.now(), MIN = reduce ? 500 : 1500, done = false, warp = 0, raf = 0;
  // Siempre el logo OFICIAL: la V blanca sin fondo (icons/vortex-mark.png); los iconos de color son variantes

  /* Estrellas en 3D: salen del centro hacia afuera; con «warp» se estiran en rayas de luz */
  var cv = el.querySelector('canvas'), g = cv.getContext('2d'), W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1), stars = [];
  function size() { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function star(z) { return {x: (Math.random() - .5) * 2, y: (Math.random() - .5) * 2, z: z == null ? Math.random() : z, b: Math.random() < .07, tw: Math.random() * 6.28}; } // b: estrellas brillantes con destello en cruz
  size(); addEventListener('resize', size);
  var N = Math.min(650, Math.round(W * H / 1500)); for (var i = 0; i < N; i++) stars.push(star());
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(50, now - last) / 1000; last = now;
    var sp = reduce ? 0 : .11 + warp * 2.6, cx = W / 2, cy = H / 2, R = Math.max(W, H) * .62;
    g.fillStyle = warp ? 'rgba(0,0,0,.35)' : '#000'; g.fillRect(0, 0, W, H);
    for (var k = 0; k < stars.length; k++) {
      var s = stars[k], pz = s.z; s.z -= sp * dt; if (s.z <= .02) { stars[k] = star(1); continue; }
      var x = cx + s.x / s.z * R * .5, y = cy + s.y / s.z * R * .5; if (x < -20 || x > W + 20 || y < -20 || y > H + 20) { stars[k] = star(1); continue; }
      var near = 1 - s.z, a = Math.min(1, near * 1.5) * (.75 + .25 * Math.sin(now / 260 + s.tw)), r = Math.max(.35, near * near * 3.2 + near * .6); // crecen al acercarse y titilan
      g.strokeStyle = g.fillStyle = 'rgba(240,244,255,' + a + ')';
      if (warp > .05) { var px = cx + s.x / pz * R * .5, py = cy + s.y / pz * R * .5; g.lineWidth = r; g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke(); }
      else {
        if (near > .45) { var gl = g.createRadialGradient(x, y, 0, x, y, r * 4); gl.addColorStop(0, 'rgba(255,255,255,' + a * .35 + ')'); gl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gl; g.beginPath(); g.arc(x, y, r * 4, 0, 6.283); g.fill(); g.fillStyle = 'rgba(240,244,255,' + a + ')'; }
        g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
        if (s.b && near > .3) { var L = r * 7 * a; g.lineWidth = .7; g.globalAlpha = a * .7; g.beginPath(); g.moveTo(x - L, y); g.lineTo(x + L, y); g.moveTo(x, y - L); g.lineTo(x, y + L); g.stroke(); g.globalAlpha = 1; }
      }
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

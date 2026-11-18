/* VORTEX · Estilos de la app (estilo elegible): «clasico», «minimal» y «espacial».
   - Pone html.vx-min o html.vx-space lo antes posible (se carga en <head>) para que no parpadee.
   - Espacial: dibuja un fondo de estrellas que se mueven muy despacio y cambia los iconos
     de las barras por iconos espaciales (al salir del tema se restauran los originales).
   - Se elige en Configuración → Personalización → Estilo de la app, o con ?estilo=clasico|minimal|espacial.
   Quitarlo: borrar este archivo, vx-min.css, vx-space.css y sus líneas en index.html. */
(function () {
  var KEY = 'vx-style', D = document.documentElement, STYLES = ['clasico', 'minimal', 'espacial'];
  function read() {
    try {
      var q = (new URLSearchParams(location.search).get('estilo') || '').toLowerCase().replace('á', 'a');
      if (STYLES.indexOf(q) >= 0) localStorage.setItem(KEY, q);
      var v = localStorage.getItem(KEY);
      return STYLES.indexOf(v) >= 0 ? v : 'clasico'; // sin elegir: el estilo de siempre
    } catch (e) { return 'clasico'; }
  }
  var cur = read();
  function classes(s) { D.classList.toggle('vx-min', s === 'minimal'); D.classList.toggle('vx-space', s === 'espacial'); D.setAttribute('data-vx-style', s); }
  classes(cur);

  /* ───── Fondo de estrellas ───── */
  var cv, ctx, stars = [], raf = 0, last = 0, W = 0, H = 0, DPR = 1, still = false;
  function mk() {
    if (cv) return;
    cv = document.createElement('canvas'); cv.id = 'vxStars'; cv.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(cv, document.body.firstChild);
    ctx = cv.getContext('2d');
    try { still = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    addEventListener('resize', size);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (cur === 'espacial') go(); });
  }
  function size() {
    if (!cv) return;
    DPR = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    var n = Math.round(Math.min(420, W * H / 3200)); stars = [];
    for (var i = 0; i < n; i++) {
      var z = Math.random(); // profundidad: las lejanas son más chicas, tenues y lentas
      var c = Math.random(), tint = c < .68 ? 0 : c < .8 ? 1 : c < .9 ? 2 : 3; // blancas y algunas moradas, azules y rosas
      stars.push({ x: Math.random() * W, y: Math.random() * H, r: .45 + z * z * 1.15, a: .3 + z * .6, v: 1.2 + z * 5.5, t: Math.random() * 6.28, f: .4 + Math.random() * 1.2, c: tint });
    }
    draw(0);
  }
  var TINT_D = ['255,255,255', '196,181,253', '147,197,253', '249,168,212'], TINT_L = ['40,50,110', '109,40,217', '37,99,235', '219,39,119'];
  var shoot = null, nextShoot = 4;
  function draw(dt) {
    var light = document.body.classList.contains('light'), T = light ? TINT_L : TINT_D, k = light ? .6 : 1;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      if (dt) { s.x -= s.v * dt; s.y += s.v * .18 * dt; s.t += s.f * dt; if (s.x < -2) { s.x = W + 2; s.y = Math.random() * H; } if (s.y > H + 2) s.y = -2; }
      var a = s.a * k * (.65 + .35 * Math.sin(s.t));
      ctx.fillStyle = 'rgba(' + T[s.c] + ',' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
      if (s.r > 1.15 && !light) { ctx.fillStyle = 'rgba(' + T[s.c] + ',' + (a * .12).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 3.2, 0, 6.2832); ctx.fill(); } // halo suave de las más cercanas
    }
    // estrella fugaz de vez en cuando (cada 7–16 s), muy sutil
    if (dt) {
      nextShoot -= dt;
      if (!shoot && nextShoot <= 0) { shoot = { x: W * (.3 + Math.random() * .7), y: H * Math.random() * .45, l: 0, d: .9 + Math.random() * .5, c: 1 + Math.floor(Math.random() * 3) }; nextShoot = 7 + Math.random() * 9; }
      if (shoot) {
        shoot.l += dt; var p = shoot.l / shoot.d, len = 120, sx = shoot.x - p * 340, sy = shoot.y + p * 150, f = Math.sin(Math.min(1, p) * Math.PI) * (light ? .35 : .55);
        var g = ctx.createLinearGradient(sx, sy, sx + len * .92, sy - len * .4); g.addColorStop(0, 'rgba(' + T[0] + ',' + f.toFixed(3) + ')'); g.addColorStop(.25, 'rgba(' + T[shoot.c] + ',' + (f * .6).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + T[shoot.c] + ',0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + len * .92, sy - len * .4); ctx.stroke();
        if (p >= 1) shoot = null;
      }
    }
  }
  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (t - last < 33) return; // ~30 cuadros por segundo: suficiente y cuida la batería
    var dt = last ? Math.min(.1, (t - last) / 1000) : 0; last = t; draw(dt);
  }
  function go() { if (!cv) { mk(); size(); } if (still) { draw(0); return; } if (!raf) { last = 0; raf = requestAnimationFrame(loop); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  /* ───── Iconos espaciales ───── */
  var A = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  var ICONS = {
    watchView: '<circle cx="5" cy="17.5" r="1.5"/><circle cx="10" cy="8.5" r="1.5"/><circle cx="17" cy="12.5" r="1.5"/><circle cx="19.5" cy="4.5" r="1.1"/><path d="m5.8 16.1 3.4-6.2M11.4 9.2l4.3 2.6M17.4 11l1.6-5"/>',
    chartView: '<path d="M12 2.8c3.1 2.1 4.6 5.6 4.3 9.7L14.2 16H9.8l-2.1-3.5C7.4 8.4 8.9 4.9 12 2.8z"/><circle cx="12" cy="9.2" r="1.7"/><path d="M7.8 12.4 5.2 15l2.9 1M16.2 12.4l2.6 2.6-2.9 1M10.4 18.6 12 21.4l1.6-2.8"/>',
    newsView: '<path d="m11.3 7.1 5.6 5.6-2.8 2.8-5.6-5.6z"/><path d="m3.1 9.6 3.2-3.2 2.4 2.4-3.2 3.2zM15.2 15.3l2.4 2.4 3.2-3.2-2.4-2.4"/><path d="M6.5 18.8a4.4 4.4 0 0 0-1.3-3.1M9.4 20.2a7.3 7.3 0 0 0-5.6-5.6"/>',
    alertsView: '<circle cx="16.3" cy="7.7" r="3.3"/><path d="M13.9 10.1 4 20M12.6 8.1l-5.8 5.8M16.1 11.3l-5.6 5.6"/>',
    screenerView: '<path d="m3.2 12.8 11.2-5.7 2 4-11.2 5.7z"/><path d="m14.4 7.1 3.4-1.7 2 4-3.4 1.7"/><path d="m9.6 14.6-2.3 6.1M10.8 14l3.2 6.7"/>',
    botLabView: '<ellipse cx="12" cy="13.2" rx="9.2" ry="3.2"/><path d="M7.4 11.6a4.6 4.6 0 0 1 9.2 0"/><path d="m7.6 17.2-1.4 3M16.4 17.2l1.4 3M12 16.6v3.8"/><circle cx="12" cy="8.6" r=".5"/>',
    lensView: '<circle cx="12" cy="12" r="5"/><path d="M6.6 14.3c-3 1.8-4.4 3.5-3.7 4.3 1.1 1.3 6.6-.8 12.2-4.7s9.3-8.4 8.2-9.7c-.6-.8-2.8-.4-5.5.9"/>',
    aiView: '<path d="M12 12c0-1.4 1.9-1.9 2.9-.9 1.6 1.6.1 4.4-2.9 4.4-3.4 0-5-3.4-3.4-6.4 1.7-3.2 6.3-4 9-1.7 3.1 2.6 2.6 8-1 10.5-3.6 2.5-9.2 2-11.3-2"/><circle cx="19.4" cy="4.6" r=".6"/><circle cx="4.6" cy="6.8" r=".6"/>',
    settingsView: '<circle cx="12" cy="12" r="1.9"/><ellipse cx="12" cy="12" rx="9.2" ry="3.6"/><ellipse cx="12" cy="12" rx="9.2" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.2" ry="3.6" transform="rotate(120 12 12)"/>',
    account: '<circle cx="12" cy="10.2" r="6.8"/><rect x="7.8" y="7.6" width="8.4" height="5.4" rx="2.7"/><path d="M7.6 16.4 6.8 21h10.4l-.8-4.6"/>'
  };
  var TARGETS = [
    ['.right-rail .rr-btn[data-side="%"] > svg', null], ['.bottom-nav button[data-view="%"] svg', null],
    ['#rrAccount > svg', 'account'], ['#settingsBtn > svg', 'settingsView'], ['#topAlertsBtn > svg', 'alertsView']
  ];
  function eachIcon(fn) {
    TARGETS.forEach(function (t) {
      if (t[1]) { document.querySelectorAll(t[0]).forEach(function (el) { fn(el, t[1]); }); return; }
      Object.keys(ICONS).forEach(function (k) { document.querySelectorAll(t[0].replace('%', k)).forEach(function (el) { fn(el, k); }); });
    });
  }
  function icons(on) {
    eachIcon(function (svg, k) {
      if (on) {
        if (svg.getAttribute('data-vx-ic') === k) return;
        if (!svg.hasAttribute('data-vx-orig')) svg.setAttribute('data-vx-orig', svg.innerHTML);
        svg.innerHTML = ICONS[k]; svg.setAttribute('data-vx-ic', k);
        ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'].forEach(function (a) { if (!svg.hasAttribute('data-vx-' + a)) svg.setAttribute('data-vx-' + a, svg.getAttribute(a) || ''); });
        A.replace(/(\S+)="([^"]*)"/g, function (_, a, v) { svg.setAttribute(a, v); });
      } else if (svg.hasAttribute('data-vx-orig')) {
        svg.innerHTML = svg.getAttribute('data-vx-orig'); svg.removeAttribute('data-vx-orig'); svg.removeAttribute('data-vx-ic');
        ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'].forEach(function (a) { var v = svg.getAttribute('data-vx-' + a); if (v) svg.setAttribute(a, v); else svg.removeAttribute(a); svg.removeAttribute('data-vx-' + a); });
      }
    });
  }

  /* ───── Cursor «Estrella» del gráfico: se enciende solo en el tema Espacial ───── */
  var prevCur = null, wrapped = false;
  function starCursor(on) {
    var C = window.CCTStarCursor; if (!C || !C.setMode) return;
    if (!wrapped) { // si la app vuelve a poner «Cruz» mientras está el tema Espacial, se queda la estrella
      var orig = C.setMode; wrapped = true;
      C.setMode = function (m) { prevCur = m; return orig.call(C, cur === 'espacial' && m === 'Cruz' ? 'Estrella' : m); };
      C._vxOrig = orig;
    }
    if (prevCur === null) prevCur = C.mode || 'Cruz';
    C._vxOrig.call(C, on && prevCur === 'Cruz' ? 'Estrella' : prevCur);
  }

  /* ───── Selector en Configuración → Personalización ───── */
  var NAMES = { clasico: 'Clásico', minimal: 'Minimal', espacial: 'Espacial' };
  function paint() {
    document.querySelectorAll('[data-vx-pick]').forEach(function (b) { var on = b.getAttribute('data-vx-pick') === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    var ex = document.getElementById('cuStyleEx'); if (ex) ex.textContent = NAMES[cur] + (cur === 'clasico' ? ' · el estilo de siempre' : cur === 'minimal' ? ' · limpio y plano' : ' · galaxia y estrellas');
  }
  function apply(s) {
    cur = s; classes(s);
    if (!document.body) return;
    if (s === 'espacial') go(); else stop();
    icons(s === 'espacial'); paint();
    if (window.CCTStarCursor) starCursor(s === 'espacial');
  }
  window.VXTheme = {
    get: function () { return cur; },
    set: function (s) { if (STYLES.indexOf(s) < 0) return; try { localStorage.setItem(KEY, s); } catch (e) {} apply(s); dispatchEvent(new Event('resize')); }
  };
  function init() {
    apply(cur);
    addEventListener('load', function () { setTimeout(function () { starCursor(cur === 'espacial'); }, 400); });
    document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-vx-pick]'); if (b) { e.preventDefault(); window.VXTheme.set(b.getAttribute('data-vx-pick')); } });
    // al cambiar claro/oscuro las estrellas cambian de tinta sin esperar al siguiente cuadro
    new MutationObserver(function () { if (cur === 'espacial' && cv) draw(0); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // si la app vuelve a pintar un botón (p. ej. al iniciar sesión), se le pone otra vez su icono espacial
    var pend = 0, mo = new MutationObserver(function () { if (cur !== 'espacial' || pend) return; pend = setTimeout(function () { pend = 0; icons(true); }, 120); });
    document.querySelectorAll('.right-rail, .bottom-nav, .topbar').forEach(function (el) { mo.observe(el, { childList: true, subtree: true }); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

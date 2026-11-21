/* ───────── Cursor «Estrella» de VORTEX ─────────
   Una estrella de cuatro puntas (como la del logo) que sigue al puntero sobre el gráfico.
   Al dejar presionado (arrastrar el gráfico o mantener el dedo) deja una estela de luz con chispas
   que se desvanece en dorado → magenta → violeta. Se dibuja en un lienzo fijo encima de todo,
   sin recibir clics, y solo se anima mientras se ve la estrella o queda estela por apagarse.
   Modos: 'Cruz' (por defecto, la retícula del gráfico), 'Flecha', 'Estrella' y 'Órbita'.
   «Órbita» (nuevo, propio de VORTEX): un punto exacto con un anillo planetario inclinado que lo sigue con un poco de inercia y una lunita
   que le da vueltas dejando cola de cometa; al presionar el anillo se cierra como un enfoque y suelta una onda. */
(() => {
  'use strict';
  let mode = 'Cruz', cv = null, g = null, dpr = 1, raf = 0;
  const P = {x: 0, y: 0, on: false, down: false, t: 0}; // puntero
  let trail = [], sparks = [], lastT = 0;
  const COLS = [[255, 214, 102], [255, 122, 69], [255, 79, 216], [139, 92, 255]]; // dorado, naranja, magenta, violeta (colores del logo)
  const mix = f => { f = Math.max(0, Math.min(.999, f)) * (COLS.length - 1); const i = Math.floor(f), k = f - i, a = COLS[i], b = COLS[i + 1]; return a.map((v, j) => Math.round(v + (b[j] - v) * k)); };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function ensure() {
    if (cv) return;
    cv = document.createElement('canvas'); cv.id = 'starCursor'; cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:65';
    document.body.appendChild(cv); g = cv.getContext('2d'); size();
    addEventListener('resize', size);
  }
  function size() { if (!cv) return; dpr = Math.min(1.5, devicePixelRatio || 1); /* 1.5 basta para que la estrella se vea nítida y mueve muchos menos píxeles */ cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); }

  // ¿El puntero está sobre el gráfico «limpio» (lienzo), sin herramienta de dibujo ni otro cursor especial?
  function overChart(e) {
    const t = e.target; if (!t || !t.closest) return null;
    const area = t.closest('.chart-area'); if (!area) return null;
    if (t !== area && t.tagName !== 'CANVAS') return null; // botones, leyenda, barras… conservan su cursor normal
    if (area.classList.contains('drawing') || area.style.cursor) return null; // dibujando o sobre una línea de alerta
    return area;
  }
  const FX = () => mode === 'Estrella' || mode === 'Órbita';
  const O = {x: 0, y: 0, vx: 0, vy: 0, a: 0, ok: false}; let pings = [], moon = []; // anillo de «Órbita» (sigue al puntero con inercia), ondas y cola de la luna
  function onMove(e) {
    if (!FX()) return;
    const was = P.on; P.on = !!overChart(e) || (P.down && e.pointerType !== 'mouse');
    if (P.down && e.pointerType === 'mouse' && !(e.buttons & 1)) P.down = false;
    const nx = e.clientX, ny = e.clientY;
    if (P.down && P.on && mode === 'Estrella') addTrail(was ? P.x : nx, was ? P.y : ny, nx, ny);
    P.x = nx; P.y = ny; kick();
  }
  function onDown(e) {
    if (!FX() || !overChart(e)) return;
    P.down = true; P.on = true; P.x = e.clientX; P.y = e.clientY; P.t = performance.now();
    if (mode === 'Órbita') pings.push({x: P.x, y: P.y, t: P.t}); else for (let i = 0; i < 10; i++) spark(P.x, P.y, 1.6); // pequeño destello al presionar
    kick();
  }
  function onUp(e) { P.down = false; if (e.pointerType !== 'mouse') P.on = false; kick(); }
  function onLeave() { P.on = false; P.down = false; kick(); }

  function addTrail(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.ceil(d / 6)), now = performance.now();
    for (let i = 1; i <= steps; i++) { const k = i / steps; trail.push({x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, t: now}); }
    if (trail.length > 260) trail.splice(0, trail.length - 260);
    const n = Math.min(4, 1 + Math.floor(d / 10)); for (let i = 0; i < n; i++) spark(x1, y1, 1);
  }
  function spark(x, y, power) {
    const a = Math.random() * Math.PI * 2, v = (.15 + Math.random() * .6) * power;
    sparks.push({x: x + (Math.random() - .5) * 6, y: y + (Math.random() - .5) * 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v - .08, life: 1, dec: .012 + Math.random() * .02, s: 1.2 + Math.random() * 2.4, c: Math.random(), rot: Math.random() * 3});
    if (sparks.length > 180) sparks.splice(0, sparks.length - 180);
  }

  function star4(x, y, R, r, rot) { // estrella de 4 puntas con lados curvos (como la del logo)
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = rot + i * Math.PI / 2, b = a + Math.PI / 4, c = a + Math.PI / 2;
      const px = x + Math.cos(a) * R, py = y + Math.sin(a) * R, qx = x + Math.cos(c) * R, qy = y + Math.sin(c) * R, mx = x + Math.cos(b) * r, my = y + Math.sin(b) * r;
      if (!i) g.moveTo(px, py);
      g.quadraticCurveTo(mx, my, qx, qy);
    }
    g.closePath();
  }

  function frame(now) {
    raf = 0; if (!g) return;
    const dt = Math.min(48, now - (lastT || now)); lastT = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    g.globalCompositeOperation = 'lighter';
    // estela: cinta que se adelgaza y se apaga con el tiempo
    const LIFE = 520; trail = trail.filter(p => now - p.t < LIFE);
    if (trail.length > 1) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i], age = (now - b.t) / LIFE, k = 1 - age, c = mix(age);
        g.strokeStyle = rgba(c, .16 * k); g.lineWidth = 14 * k + 2; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        g.strokeStyle = rgba(c, .75 * k); g.lineWidth = 3.6 * k + .6; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    }
    // chispas: estrellitas que flotan y titilan
    for (const s of sparks) {
      s.x += s.vx * dt / 16; s.y += s.vy * dt / 16; s.vx *= .985; s.vy *= .985; s.life -= s.dec * dt / 16; s.rot += .05;
      if (s.life <= 0) continue;
      const c = mix(s.c * .6 + (1 - s.life) * .4), tw = .6 + .4 * Math.sin(now / 70 + s.rot * 9);
      g.fillStyle = rgba(c, s.life * tw); star4(s.x, s.y, s.s * 1.9, s.s * .38, s.rot); g.fill();
    }
    sparks = sparks.filter(s => s.life > 0);
    // la estrella del cursor
    if (P.on && mode === 'Estrella') {
      if (P.down && Math.random() < .35) spark(P.x, P.y, .7); // chispas suaves mientras se mantiene presionado
      const pulse = 1 + .06 * Math.sin(now / 260), grow = P.down ? 1.22 : 1, R = 11 * pulse * grow, rot = now / 2400;
      g.globalCompositeOperation = 'lighter';
      const halo = g.createRadialGradient(P.x, P.y, 0, P.x, P.y, R * 2.6);
      halo.addColorStop(0, 'rgba(255,214,102,.42)'); halo.addColorStop(.45, 'rgba(255,79,216,.16)'); halo.addColorStop(1, 'rgba(139,92,255,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(P.x, P.y, R * 2.6, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
      const body = g.createRadialGradient(P.x, P.y, 0, P.x, P.y, R);
      body.addColorStop(0, '#fffbe8'); body.addColorStop(.35, '#ffe08a'); body.addColorStop(1, '#ffb43a');
      g.shadowColor = 'rgba(255,190,70,.9)'; g.shadowBlur = 10;
      g.fillStyle = body; star4(P.x, P.y, R, R * .26, rot); g.fill();
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(P.x, P.y, 1.4, 0, Math.PI * 2); g.fill(); // punto exacto del puntero
    }
    if (mode === 'Órbita') orbit(now, dt);
    g.globalCompositeOperation = 'source-over';
    if ((P.on && FX()) || trail.length || sparks.length || pings.length || moon.length) kick();
    else g.clearRect(0, 0, innerWidth, innerHeight);
  }
  /* ── «Órbita» ── */
  function orbit(now, dt) {
    const k = Math.min(1, dt / 16);
    if (!O.ok) { O.x = P.x; O.y = P.y; O.ok = true; }
    const px = O.x, py = O.y; O.x += (P.x - O.x) * Math.min(1, .34 * k); O.y += (P.y - O.y) * Math.min(1, .34 * k); // el anillo llega un poquito después
    O.vx = O.vx * .8 + (O.x - px) * .2; O.vy = O.vy * .8 + (O.y - py) * .2;
    const sp = Math.min(1, Math.hypot(O.vx, O.vy) / 14); O.a += (.0021 + sp * .006) * dt; // la luna acelera si mueves rápido
    pings = pings.filter(q => now - q.t < 700);
    g.globalCompositeOperation = 'lighter';
    for (const q of pings) { const f = (now - q.t) / 700, r = 8 + f * 34; g.strokeStyle = `rgba(122,231,255,${(.55 * (1 - f)).toFixed(3)})`; g.lineWidth = 1.6 * (1 - f) + .4; g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.stroke(); }
    if (!P.on) { moon = moon.filter(m => now - m.t < 300); for (const m of moon) { const f = 1 - (now - m.t) / 300; g.fillStyle = `rgba(167,139,250,${(.5 * f).toFixed(3)})`; g.beginPath(); g.arc(m.x, m.y, 1.6 * f, 0, Math.PI * 2); g.fill(); } return; }
    const tilt = -.42 + Math.max(-.35, Math.min(.35, O.vx * .02)), squash = P.down ? .62 : 1, RX = 15 * squash, RY = 5.4 * squash;
    // halo muy suave detrás
    const hg = g.createRadialGradient(O.x, O.y, 0, O.x, O.y, 26); hg.addColorStop(0, 'rgba(122,170,255,.16)'); hg.addColorStop(1, 'rgba(122,170,255,0)'); g.fillStyle = hg; g.beginPath(); g.arc(O.x, O.y, 26, 0, Math.PI * 2); g.fill();
    // anillo inclinado: mitad de atrás más tenue, mitad de adelante más brillante (efecto planeta)
    g.save(); g.translate(O.x, O.y); g.rotate(tilt);
    g.lineWidth = 1.3; g.strokeStyle = 'rgba(159,180,255,.38)'; g.beginPath(); g.ellipse(0, 0, RX, RY, 0, Math.PI, Math.PI * 2); g.stroke();
    const gr = g.createLinearGradient(-RX, 0, RX, 0); gr.addColorStop(0, 'rgba(122,231,255,.95)'); gr.addColorStop(.5, 'rgba(167,139,250,.95)'); gr.addColorStop(1, 'rgba(255,122,214,.9)');
    g.lineWidth = 1.7; g.strokeStyle = gr; g.beginPath(); g.ellipse(0, 0, RX, RY, 0, 0, Math.PI); g.stroke();
    const mx = Math.cos(O.a) * RX, my = Math.sin(O.a) * RY; g.restore();
    const ct = Math.cos(tilt), st2 = Math.sin(tilt), wx = O.x + mx * ct - my * st2, wy = O.y + mx * st2 + my * ct;
    moon.push({x: wx, y: wy, t: now}); moon = moon.filter(m => now - m.t < 260);
    for (const m of moon) { const f = 1 - (now - m.t) / 260; g.fillStyle = `rgba(167,139,250,${(.45 * f).toFixed(3)})`; g.beginPath(); g.arc(m.x, m.y, .5 + 1.6 * f, 0, Math.PI * 2); g.fill(); }
    const front = Math.sin(O.a) > 0; g.fillStyle = front ? '#ffffff' : 'rgba(220,230,255,.55)'; g.shadowColor = 'rgba(122,231,255,.9)'; g.shadowBlur = front ? 8 : 3; g.beginPath(); g.arc(wx, wy, front ? 2.3 : 1.7, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
    g.globalCompositeOperation = 'source-over';
    // marcas finas de precisión (arriba, abajo, izquierda, derecha) y el punto exacto
    g.strokeStyle = 'rgba(220,230,255,.55)'; g.lineWidth = 1; g.beginPath();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { g.moveTo(P.x + dx * 21, P.y + dy * 21); g.lineTo(P.x + dx * 26, P.y + dy * 26); }
    g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(P.x, P.y, 1.6, 0, Math.PI * 2); g.fill();
  }
  function kick() { if (!raf && cv) raf = requestAnimationFrame(frame); }

  function setMode(m) {
    m = ['Cruz', 'Flecha', 'Estrella', 'Órbita'].includes(m) ? m : 'Cruz';
    document.querySelectorAll('.chart-area').forEach(a => { a.classList.toggle('cur-arrow', m === 'Flecha'); a.classList.toggle('cur-star', m === 'Estrella' || m === 'Órbita'); });
    if (m === mode) return; mode = m; O.ok = false;
    if (m === 'Estrella' || m === 'Órbita') ensure(); else { P.on = false; P.down = false; }
    kick();
  }
  addEventListener('pointermove', onMove, {passive: true, capture: true});
  addEventListener('pointerdown', onDown, {passive: true, capture: true});
  addEventListener('pointerup', onUp, {passive: true, capture: true});
  addEventListener('pointercancel', onUp, {passive: true, capture: true});
  document.addEventListener('pointerleave', onLeave);
  addEventListener('blur', onLeave);
  window.CCTStarCursor = {setMode, get mode() { return mode; }};
})();

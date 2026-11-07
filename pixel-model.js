/* NEXUS PIXEL · modelo 3D (three.js, sin archivos externos de modelo: todo se construye aquí con formas).
   Fiel a la hoja del personaje: casco blanco brillante, visor negro con el logo V + órbita + estrella, audífonos con aro morado
   de neón, antenas hacia atrás, traje blanco con partes azul marino, pecho con la V iluminada, botas con aro de luz y propulsores.
   El visor es una pantalla: muestra expresiones (neutral, feliz, entusiasmado, guiño, sorprendido, pensando, analizando, enfocado,
   contento, dormido). Poses: idle, wave, point, draw, think, celebrate, fly, thumbs. Se puede girar 360° (setYaw / addYaw).
   Se carga solo al abrir el avatar (import dinámico), así no pesa en el arranque de la app. */
import * as THREE from './vendor/three.module.min.js';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';

const NEON = {purple: '#b46bff', blue: '#4cc3ff', orange: '#ff9d3c', mint: '#3ff0c0', red: '#ff4d6d'};

export function create(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power', premultipliedAlpha: true});
  renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(), pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .85;
  const camera = new THREE.PerspectiveCamera(28, 1, .1, 50); camera.position.set(0, 1.0, 6.7); camera.lookAt(0, .8, 0);
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1033, .7));
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(2.5, 4, 5); scene.add(key);
  const rim = new THREE.PointLight(0xa855f7, 9, 8); rim.position.set(-2.2, 2.4, -1.6); scene.add(rim);
  const rim2 = new THREE.PointLight(0x5b8cff, 5, 8); rim2.position.set(2.4, .6, -1.2); scene.add(rim2);

  /* ── materiales ── */
  const white = new THREE.MeshPhysicalMaterial({color: 0xf1f2fa, roughness: .28, metalness: 0, clearcoat: 1, clearcoatRoughness: .12});
  const lilac = new THREE.MeshPhysicalMaterial({color: 0xdcd8f4, roughness: .35, clearcoat: .8, clearcoatRoughness: .2});
  const navy = new THREE.MeshPhysicalMaterial({color: 0x1b1e38, roughness: .38, metalness: .2, clearcoat: .7, clearcoatRoughness: .25});
  const visorM = new THREE.MeshPhysicalMaterial({color: 0x04050b, roughness: .06, metalness: .3, clearcoat: 1, clearcoatRoughness: .04});
  const neon = new THREE.MeshStandardMaterial({color: 0xc59bff, emissive: new THREE.Color(NEON.purple), emissiveIntensity: 2.4, roughness: .3});
  const neonSoft = new THREE.MeshStandardMaterial({color: 0x2a1748, emissive: new THREE.Color(NEON.purple), emissiveIntensity: .7, roughness: .4});

  /* ── pantalla del visor (expresiones) ── */
  const faceCv = document.createElement('canvas'); faceCv.width = 512; faceCv.height = 256; const fx = faceCv.getContext('2d');
  const faceTex = new THREE.CanvasTexture(faceCv); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 4;
  const chestCv = document.createElement('canvas'); chestCv.width = chestCv.height = 128; const cx2 = chestCv.getContext('2d');
  const chestTex = new THREE.CanvasTexture(chestCv); chestTex.colorSpace = THREE.SRGBColorSpace;

  const rootG = new THREE.Group(); scene.add(rootG); const body = new THREE.Group(); rootG.add(body);
  const add = (geo, mat, parent, p, r, s) => { const m = new THREE.Mesh(geo, mat); if (p) m.position.set(...p); if (r) m.rotation.set(...r); if (s) m.scale.set(...s); (parent || body).add(m); return m; };

  /* cabeza */
  const head = new THREE.Group(); head.position.set(0, 1.3, 0); body.add(head);
  add(new THREE.SphereGeometry(.64, 56, 40), white, head, null, null, [1.1, .96, 1]);
  add(new THREE.SphereGeometry(.64, 64, 44), visorM, head, [0, -.035, .25], null, [1.0, .76, .66]); // visor negro: óvalo grande y liso que sobresale del casco
  const face = add(new THREE.CylinderGeometry(.73, .73, .78, 48, 1, true, -.86, 1.72), new THREE.MeshBasicMaterial({map: faceTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.FrontSide}), head, [0, -.04, -.04], null, [1.0, 1, 1]);
  face.renderOrder = 2;
  for (const s of [-1, 1]) { // audífonos y antenas
    const ear = new THREE.Group(); ear.position.set(s * .69, -.04, -.02); head.add(ear);
    add(new THREE.CylinderGeometry(.25, .25, .17, 44), white, ear, [0, 0, 0], [0, 0, Math.PI / 2]);
    add(new THREE.CylinderGeometry(.17, .17, .05, 36), navy, ear, [s * .085, 0, 0], [0, 0, Math.PI / 2]);
    add(new THREE.TorusGeometry(.2, .036, 16, 56), neon, ear, [s * .09, 0, 0], [0, Math.PI / 2, 0]);
    add(new THREE.CylinderGeometry(.1, .1, .06, 28), neonSoft, ear, [s * .1, 0, 0], [0, 0, Math.PI / 2]);
    const ant = new THREE.Group(); ant.position.set(s * .42, .5, -.12); ant.rotation.set(-.85, 0, -s * .3); head.add(ant);
    add(new THREE.CapsuleGeometry(.07, .42, 8, 18), white, ant, [0, .25, 0]);
    add(new THREE.CapsuleGeometry(.028, .3, 6, 12), neon, ant, [0, .27, .055]);
  }
  /* torso */
  add(new THREE.CylinderGeometry(.15, .2, .16, 24), navy, body, [0, .7, 0]);
  add(new THREE.CapsuleGeometry(.37, .26, 10, 32), white, body, [0, .36, 0], null, [1.06, 1, .86]);
  add(new THREE.SphereGeometry(.27, 32, 24), navy, body, [0, .42, .2], null, [1, .86, .5]); // placa del pecho
  add(new THREE.PlaneGeometry(.3, .3), new THREE.MeshBasicMaterial({map: chestTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}), body, [0, .43, .335]);
  add(new THREE.TorusGeometry(.35, .055, 12, 48), navy, body, [0, .12, 0], [Math.PI / 2, 0, 0], [1.06, .88, 1]);
  add(new THREE.SphereGeometry(.3, 28, 20), navy, body, [0, .02, 0], null, [1.05, .55, .85]);
  /* brazos (pivote en el hombro; codo y mano) */
  const arm = s => {
    const sh = new THREE.Group(); sh.position.set(s * .46, .56, 0); body.add(sh);
    add(new THREE.SphereGeometry(.15, 24, 18), white, sh);
    add(new THREE.CapsuleGeometry(.085, .16, 6, 16), navy, sh, [0, -.17, 0]);
    const el = new THREE.Group(); el.position.set(0, -.3, 0); sh.add(el);
    add(new THREE.SphereGeometry(.09, 16, 12), navy, el);
    add(new THREE.CapsuleGeometry(.105, .16, 8, 18), white, el, [0, -.14, 0]);
    add(new THREE.TorusGeometry(.1, .02, 8, 24), neonSoft, el, [0, -.24, 0], [Math.PI / 2, 0, 0]);
    const hand = new THREE.Group(); hand.position.set(0, -.34, 0); el.add(hand);
    add(new THREE.SphereGeometry(.12, 22, 16), navy, hand, null, null, [1, 1.05, .9]);
    add(new THREE.CapsuleGeometry(.04, .07, 4, 10), navy, hand, [s * -.09, .04, .05], [0, 0, s * .6]);
    return {sh, el, hand};
  };
  const R = arm(-1), L = arm(1); // L = brazo del lado derecho de la pantalla: sostiene el lápiz
  const pen = new THREE.Group(); pen.position.set(.02, -.1, .06); pen.rotation.set(.5, 0, .25); L.hand.add(pen);
  add(new THREE.CylinderGeometry(.025, .025, .34, 12), white, pen);
  const penTip = add(new THREE.SphereGeometry(.04, 12, 10), neon, pen, [0, -.19, 0]); pen.visible = false;
  /* piernas, botas, aros de luz y propulsores */
  const legs = [], flames = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * .17, -.05, 0); body.add(hip);
    add(new THREE.CapsuleGeometry(.1, .1, 6, 14), navy, hip, [0, -.1, 0]);
    add(new THREE.SphereGeometry(.18, 26, 18), white, hip, [0, -.3, .04], null, [1, .72, 1.3]);
    add(new THREE.TorusGeometry(.13, .022, 10, 32), neon, hip, [0, -.4, .04], [Math.PI / 2, 0, 0], [1, 1.35, 1]);
    const fl = add(new THREE.ConeGeometry(.085, .5, 18, 1, true), new THREE.MeshBasicMaterial({color: 0x9b6bff, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}), hip, [0, -.66, .04], [Math.PI, 0, 0]);
    const core = add(new THREE.ConeGeometry(.04, .3, 12, 1, true), new THREE.MeshBasicMaterial({color: 0xcfe6ff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}), hip, [0, -.56, .04], [Math.PI, 0, 0]);
    legs.push(hip); flames.push(fl, core);
  }
  /* brillo en el piso (sombra de luz) */
  const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128; { const g = glowCv.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(180,107,255,.75)'); gr.addColorStop(.5, 'rgba(120,80,255,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(glowCv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false})); glow.rotation.x = -Math.PI / 2; glow.position.y = -.95; rootG.add(glow);

  /* ── expresiones (se dibujan en la pantalla del visor) ── */
  let expr = 'neutral', blinkAt = 0, exprT0 = 0, accent = NEON.purple;
  const glowStroke = (fn, color = '#f4eeff', blur = 22) => { fx.save(); fx.strokeStyle = fx.fillStyle = color; fx.shadowColor = accent; fx.shadowBlur = blur; fx.lineCap = 'round'; fx.lineJoin = 'round'; fn(); fx.shadowBlur = blur / 2; fn(); fx.restore(); };
  const D = 190; // centros de los ojos (x = 256 ± D/2)
  const star = (x, y, r) => { fx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * .28 : r; fx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } fx.closePath(); fx.fill(); };
  function drawLogo(cv, w, h, s) { // V + órbita + estrella (el logo de VORTEX)
    const g = cv; g.save(); g.translate(w / 2, h / 2); g.scale(s, s);
    g.beginPath(); g.moveTo(-58, -42); g.lineTo(-30, -42); g.lineTo(0, 22); g.lineTo(30, -42); g.lineTo(58, -42); g.lineTo(8, 52); g.lineTo(-8, 52); g.closePath(); g.fill();
    g.lineWidth = 7; g.beginPath(); g.ellipse(2, 6, 78, 20, -.32, .15, Math.PI * 1.02); g.stroke(); g.beginPath(); g.ellipse(2, 6, 78, 20, -.32, Math.PI * 1.25, Math.PI * 1.95); g.stroke();
    g.restore();
  }
  function paintFace(now) {
    fx.clearRect(0, 0, 512, 256); const t = (now - exprT0) / 1000, blink = now < blinkAt + 140 && now > blinkAt;
    const eyes = (fn) => { for (const s of [-1, 1]) fn(256 + s * D / 2, 128, s); };
    if (expr === 'neutral') { glowStroke(() => { fx.lineWidth = 7; drawLogo(fx, 512, 268, 1.5); star(344, 46, 22); }); }
    else if (expr === 'happy') glowStroke(() => { fx.lineWidth = 15; eyes((x, y) => { fx.beginPath(); fx.arc(x, y + 18, 34, Math.PI * 1.12, Math.PI * 1.88); fx.stroke(); }); });
    else if (expr === 'excited') glowStroke(() => { fx.lineWidth = 15; eyes((x, y) => { fx.beginPath(); fx.moveTo(x - 32, y + 16); fx.lineTo(x, y - 18); fx.lineTo(x + 32, y + 16); fx.stroke(); }); star(410, 52, 16 + Math.sin(t * 8) * 4); star(102, 60, 10); });
    else if (expr === 'wink') glowStroke(() => { fx.lineWidth = 15; fx.beginPath(); fx.arc(256 - D / 2, 128, 26, 0, 7); fx.fill(); fx.beginPath(); fx.moveTo(256 + D / 2 + 30, 102); fx.lineTo(256 + D / 2 - 18, 128); fx.lineTo(256 + D / 2 + 30, 154); fx.stroke(); });
    else if (expr === 'surprised') glowStroke(() => { fx.lineWidth = 12; eyes((x, y) => { fx.beginPath(); fx.arc(x, y, blink ? 4 : 34, 0, 7); fx.stroke(); fx.beginPath(); fx.arc(x, y, blink ? 2 : 13, 0, 7); fx.fill(); }); });
    else if (expr === 'thinking') glowStroke(() => { fx.lineWidth = 14; eyes((x, y) => { fx.beginPath(); fx.moveTo(x - 30, y + 4); fx.lineTo(x + 30, y + 4); fx.stroke(); }); fx.font = 'bold 64px system-ui'; fx.fillText('?', 395 + Math.sin(t * 3) * 4, 82); });
    else if (expr === 'analyzing') glowStroke(() => { for (let i = 0; i < 9; i++) { const h = 22 + Math.abs(Math.sin(t * 6 + i * .9)) * 74, x = 256 + (i - 4) * 30; fx.fillRect(x - 10, 172 - h, 20, h); } }, '#e7dcff', 18);
    else if (expr === 'focused') glowStroke(() => { fx.lineWidth = 16; eyes((x, y, s) => { fx.beginPath(); fx.moveTo(x - 32, y - 4 + (s < 0 ? -14 : 14)); fx.lineTo(x + 32, y - 4 + (s < 0 ? 14 : -14)); fx.stroke(); fx.beginPath(); fx.arc(x, y + 18, blink ? 2 : 11, 0, 7); fx.fill(); }); }, '#e4f2ff');
    else if (expr === 'love') glowStroke(() => { eyes((x, y) => { const k = 1 + Math.sin(t * 5) * .08; fx.save(); fx.translate(x, y); fx.scale(k, k); fx.beginPath(); fx.moveTo(0, 26); fx.bezierCurveTo(-46, -6, -24, -44, 0, -18); fx.bezierCurveTo(24, -44, 46, -6, 0, 26); fx.fill(); fx.restore(); }); }, '#ffc1e8');
    else if (expr === 'sleep') glowStroke(() => { fx.lineWidth = 13; eyes((x, y) => { fx.beginPath(); fx.arc(x, y - 6, 28, Math.PI * .15, Math.PI * .85); fx.stroke(); }); fx.font = 'bold 40px system-ui'; fx.globalAlpha = .6 + Math.sin(t * 2) * .4; fx.fillText('z', 392, 82 - (t * 10 % 20)); fx.font = 'bold 28px system-ui'; fx.fillText('z', 428, 52 - (t * 10 % 20)); fx.globalAlpha = 1; });
    else if (expr === 'blinkEyes') glowStroke(() => { fx.lineWidth = 14; eyes((x, y) => { fx.beginPath(); fx.arc(x, y, 26, 0, 7); fx.fill(); }); });
    faceTex.needsUpdate = true;
  }
  function paintChest() { cx2.clearRect(0, 0, 128, 128); cx2.save(); cx2.fillStyle = '#efe6ff'; cx2.shadowColor = accent; cx2.shadowBlur = 14; cx2.beginPath(); cx2.moveTo(30, 30); cx2.lineTo(46, 30); cx2.lineTo(64, 76); cx2.lineTo(82, 30); cx2.lineTo(98, 30); cx2.lineTo(70, 100); cx2.lineTo(58, 100); cx2.closePath(); cx2.fill(); cx2.fill(); cx2.restore(); chestTex.needsUpdate = true; }
  paintChest();

  /* ── poses ── (rotaciones objetivo; se mezclan suavemente) */
  const P = {
    idle: {R: [0, 0, -.18], Re: [-.25, 0, 0], L: [0, 0, .18], Le: [-.25, 0, 0], legs: [.12, -.08], lean: 0},
    wave: {R: [0, 0, -2.55], Re: [0, 0, -.5], L: [0, 0, .2], Le: [-.3, 0, 0], legs: [.1, -.05], lean: 0},
    point: {R: [0, 0, -.2], Re: [-.3, 0, 0], L: [-.35, 0, 1.45], Le: [0, 0, .1], legs: [.1, -.05], lean: 0},
    draw: {R: [.2, 0, -.35], Re: [-.6, 0, 0], L: [-.7, 0, 1.15], Le: [-.35, 0, .2], legs: [.25, .05], lean: .15},
    think: {R: [-2.3, 0, -.25], Re: [-1.9, 0, 0], L: [0, 0, .25], Le: [-.4, 0, 0], legs: [.05, -.1], lean: -.05},
    celebrate: {R: [0, 0, -2.7], Re: [0, 0, -.25], L: [0, 0, 2.7], Le: [0, 0, .25], legs: [.4, -.3], lean: 0},
    thumbs: {R: [-1.3, 0, -.2], Re: [-1.3, 0, 0], L: [0, 0, .2], Le: [-.3, 0, 0], legs: [.1, -.05], lean: 0},
    fly: {R: [.75, 0, -.45], Re: [-.2, 0, 0], L: [.75, 0, .45], Le: [-.2, 0, 0], legs: [.55, .45], lean: .45}
  };
  let pose = 'idle', yaw = 0, yawTarget = 0, tiltX = 0, tiltZ = 0, vel = {x: 0, y: 0}, thrust = .35, paused = false, raf = 0, last = 0;
  const lerp = (a, b, k) => a + (b - a) * k, setRot = (o, r, k) => { o.rotation.x = lerp(o.rotation.x, r[0], k); o.rotation.y = lerp(o.rotation.y, r[1], k); o.rotation.z = lerp(o.rotation.z, r[2], k); };
  let W = 0, H = 0;
  function size() { const r = canvas.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1), w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height)); if (w === W && h === H) return; W = w; H = h; renderer.setPixelRatio(d); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function frame(now) {
    raf = requestAnimationFrame(frame); if (paused) return; if (now - last < 1000 / 45) return; const dt = Math.min(.05, (now - (last || now)) / 1000); last = now; size();
    const t = now / 1000, k = 1 - Math.pow(.0015, dt), p = P[pose] || P.idle;
    if (now > blinkAt + 3200 + Math.random() * 1500) blinkAt = now;
    setRot(R.sh, p.R, k); setRot(R.el, p.Re, k); setRot(L.sh, p.L, k); setRot(L.el, p.Le, k);
    if (pose === 'wave') R.el.rotation.z = -.5 + Math.sin(t * 11) * .55;
    if (pose === 'draw') { L.sh.rotation.x += Math.sin(t * 9) * .06; L.el.rotation.z += Math.sin(t * 7) * .08; }
    if (pose === 'celebrate') { R.sh.rotation.z += Math.sin(t * 12) * .25; L.sh.rotation.z -= Math.sin(t * 12) * .25; }
    legs[0].rotation.x = lerp(legs[0].rotation.x, p.legs[0] + Math.sin(t * 2.2) * .05, k); legs[1].rotation.x = lerp(legs[1].rotation.x, p.legs[1] - Math.sin(t * 2.2) * .05, k);
    const bob = Math.sin(t * 2.1) * .07 + (pose === 'celebrate' ? Math.abs(Math.sin(t * 6)) * .18 : 0); body.position.y = bob; glow.material.opacity = .65 - bob * 1.5; glow.scale.setScalar(1 - bob * .6);
    tiltX = lerp(tiltX, p.lean + vel.y * .0025, k); tiltZ = lerp(tiltZ, -vel.x * .0022 + Math.sin(t * .9) * .04, k); body.rotation.x = tiltX; body.rotation.z = tiltZ;
    yaw = lerp(yaw, yawTarget + (pose === 'celebrate' ? t * 5 % (Math.PI * 2) : 0), Math.min(1, k * 1.4)); rootG.rotation.y = yaw + Math.sin(t * .55) * .12;
    head.rotation.y = Math.sin(t * .7) * .12 + (pose === 'draw' ? .35 : 0); head.rotation.x = (pose === 'think' ? .12 : 0) + Math.sin(t * 1.3) * .03; head.rotation.z = (pose === 'think' ? .12 : 0);
    const th = pose === 'fly' ? 1.25 : thrust; flames.forEach((f, i) => { const fl = th * (.85 + Math.random() * .3); f.scale.set(1, fl * (i % 2 ? .8 : 1), 1); f.material.opacity = Math.min(1, .35 + th * .5); });
    neon.emissiveIntensity = 2.2 + Math.sin(t * 2.4) * .5 + (expr === 'analyzing' ? .8 : 0);
    paintFace(now); renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);
  const v3 = new THREE.Vector3();
  return {
    setExpr(e) { if (e !== expr) { expr = e; exprT0 = performance.now(); } },
    setPose(p) { if (P[p]) pose = p; pen.visible = p === 'draw' || p === 'point'; },
    get pose() { return pose; }, get expr() { return expr; },
    setYaw(y) { yawTarget = y; }, addYaw(d) { yawTarget += d; }, get yaw() { return yawTarget; },
    setVel(x, y) { vel = {x, y}; }, setThrust(v) { thrust = v; },
    setColor(name) { const c = NEON[name] || name; accent = c; neon.emissive.set(c); neonSoft.emissive.set(c); rim.color.set(c); paintChest(); },
    handScreen() { // dónde está la punta del lápiz, en píxeles del lienzo (para que el trazo salga de su mano)
      scene.updateMatrixWorld(); penTip.getWorldPosition(v3); v3.project(camera); return {x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * H};
    },
    pause(on) { paused = !!on; if (!on) last = 0; },
    dispose() { cancelAnimationFrame(raf); renderer.dispose(); pmrem.dispose(); }
  };
}

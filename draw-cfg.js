/* Ajustes propios de cada herramienta de dibujo de VORTEX (funciones puras, se prueban aparte).
   Cada herramienta declara aquí qué se puede configurar (niveles, fondo, extensiones, textos…).
   Los valores viven en d.o del dibujo y solo se guarda lo que difiere del valor por defecto,
   así que los dibujos anteriores se ven igual que antes. app.js pinta el panel a partir de este esquema. */
(function (root) {
  'use strict';
  const HEX = /^#[0-9a-f]{6}$/i;
  const bool = (k, n, def = false) => ({t: 'bool', k, n, def});
  const pick = (k, n, def, opts) => ({t: 'pick', k, n, def, opts});
  const range = (k, n, def, min = 0, max = 100, step = 1, u = '%') => ({t: 'range', k, n, def, min, max, step, u});
  const col = (k, n, def = '') => ({t: 'col', k, n, def}); // def '' = usa el color de línea del dibujo
  const levels = (n, all, def, x = {}) => ({t: 'levels', k: 'lv', n, all, def, custom: x.custom !== false, min: x.min == null ? 1 : x.min, labels: x.labels || null});
  const sec = n => ({t: 'sec', n});

  const EXT = [bool('xl', 'Extender a la izquierda'), bool('xr', 'Extender a la derecha')];
  const FILL = (fo, on = true) => [bool('fl', 'Fondo', on), col('fc', 'Color del fondo'), range('fo', 'Opacidad del fondo', fo, 0, 60)];
  const SHAPE = fo => [sec('Forma'), bool('bd', 'Borde', true), ...FILL(fo)];
  const SIZE = [pick('sz', 'Tamaño', 1, [[.75, 'S'], [1, 'M'], [1.5, 'L'], [2, 'XL']])];
  const PATTERN = [sec('Patrón'), bool('lb', 'Letras de los puntos', true), ...FILL(12)];
  const FONT = (bo) => [bool('bo', 'Negrita', bo), bool('it', 'Cursiva')];
  const FIB_ALL = [0, .236, .382, .5, .618, .65, .705, .786, 1, 1.272, 1.414, 1.618, 2, 2.618, 3.618, 4.236];
  const FIB_LBL = [bool('sl', 'Mostrar el nivel', true), bool('sv', 'Mostrar el precio', true), pick('lp', 'Posición de las etiquetas', 'l', [['l', 'Izquierda'], ['r', 'Derecha']])];
  const GAN = [.125, .25, .3333, .5, 1, 2, 3, 4, 8], GAN_LAB = ['1x8', '1x4', '1x3', '1x2', '1x1', '2x1', '3x1', '4x1', '8x1'];

  const SCHEMA = {
    // Líneas
    trend: [sec('Línea de tendencia'), ...EXT, bool('ar', 'Flecha en la punta'), bool('st', 'Mostrar precio, % y velas')],
    ray: [sec('Rayo'), bool('st', 'Mostrar precio, % y velas')],
    extended: [sec('Línea extendida'), bool('st', 'Mostrar precio, % y velas')],
    info: [sec('Línea de información'), bool('vp', 'Mostrar precio y %', true), bool('vb', 'Mostrar número de velas', true), bool('vt', 'Mostrar tiempo')],
    angle: [sec('Ángulo'), bool('sa', 'Mostrar los grados', true), bool('gl', 'Línea guía horizontal', true)],
    arrow: [sec('Flecha'), pick('hs', 'Tamaño de la punta', 11, [[8, 'S'], [11, 'M'], [15, 'L'], [20, 'XL']]), bool('a2', 'Punta en los dos extremos')],
    horizontal: [sec('Línea horizontal'), bool('pl', 'Precio en la escala', true)],
    hray: [sec('Rayo horizontal'), bool('pl', 'Mostrar el precio'), bool('pt', 'Punto de inicio', true)],
    vertical: [sec('Línea vertical'), bool('dl', 'Mostrar fecha y hora')],
    crossline: [sec('Línea cruzada'), bool('pl', 'Mostrar el precio'), bool('dl', 'Mostrar fecha y hora')],
    channel: [sec('Canal paralelo'), ...EXT, bool('ml', 'Línea media'), ...FILL(10)],
    regression: [sec('Canal de regresión'), pick('dv', 'Desviaciones (σ)', 2, [[1, '1'], [1.5, '1.5'], [2, '2'], [2.5, '2.5'], [3, '3']]), bool('lb', 'Mostrar etiquetas ±σ', true), ...FILL(8)],
    cyclic: [sec('Líneas cíclicas'), bool('nb', 'Numerar las líneas'), bool('gl', 'Línea guía', true)],
    sinewave: [sec('Línea sinusoidal'), bool('gl', 'Línea guía', true)],
    // Fibonacci, Gann y horquilla
    fib: [levels('Niveles', FIB_ALL, [0, .236, .382, .5, .618, .786, 1]), bool('mc', 'Un color por nivel'), sec('Retroceso'), bool('xl', 'Extender a la izquierda'), bool('xr', 'Extender a la derecha', true), bool('tl', 'Línea de tendencia', true), bool('rv', 'Invertir niveles'), ...FIB_LBL, ...FILL(6)],
    fibext: [levels('Niveles', FIB_ALL, [0, .618, 1, 1.272, 1.618, 2.618]), bool('mc', 'Un color por nivel'), sec('Extensión'), bool('xl', 'Extender a la izquierda'), bool('xr', 'Extender a la derecha', true), bool('tl', 'Líneas de tendencia', true), ...FIB_LBL, ...FILL(6, false)],
    fibtime: [levels('Zonas', [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144], [0, 1, 2, 3, 5, 8, 13, 21, 34, 55]), bool('mc', 'Un color por zona'), sec('Zonas de tiempo'), bool('sl', 'Mostrar los números', true), bool('tl', 'Línea guía', true)],
    fibfan: [levels('Niveles', [.236, .25, .382, .5, .618, .75, .786, 1], [.25, .382, .5, .618, .75, 1]), bool('mc', 'Un color por nivel'), sec('Abanico'), bool('sl', 'Mostrar los niveles', true)],
    fibcircle: [levels('Niveles', [.236, .382, .5, .618, .786, 1, 1.272, 1.618, 2, 2.618], [.382, .5, .618, .786, 1, 1.272, 1.618]), bool('mc', 'Un color por nivel'), sec('Círculos'), bool('sl', 'Mostrar los niveles', true), bool('tl', 'Línea guía', true)],
    gannfan: [levels('Rayos', GAN, GAN, {custom: false, labels: GAN_LAB}), bool('mc', 'Un color por rayo'), sec('Abanico de Gann'), bool('sl', 'Mostrar los nombres', true)],
    gannbox: [levels('Divisiones', [.25, .382, .5, .618, .75], [.25, .5, .75], {min: 0}), sec('Caja de Gann'), bool('dg', 'Diagonales', true), ...FILL(7)],
    pitchfork: [sec('Horquilla'), bool('ml', 'Líneas intermedias (50 %)'), ...FILL(8)],
    // Patrones
    xabcd: PATTERN, abcd: [sec('Patrón'), bool('lb', 'Letras de los puntos', true), bool('gl', 'Líneas guía', true)], trianglep: PATTERN,
    hs: [sec('Patrón'), bool('lb', 'Textos (hombro, cabeza)', true), bool('nk', 'Línea de cuello', true)],
    impulse: [sec('Onda'), bool('lb', 'Números de las ondas', true)], abc: [sec('Onda'), bool('lb', 'Letras de las ondas', true)],
    // Proyección y medición
    long: [sec('Posición'), pick('rr', 'Stop automático (beneficio : riesgo)', 2, [[1, '1:1'], [1.5, '1.5:1'], [2, '2:1'], [3, '3:1']]), range('zo', 'Opacidad de las zonas', 16, 0, 60), bool('bd', 'Borde de las zonas', true), col('ec', 'Color de la línea de entrada', '#a0aab9'), bool('pc', 'Mostrar porcentajes', true)],
    measure: [sec('Medición'), col('uc', 'Color al subir', '#089981'), col('dc', 'Color al bajar', '#f23645'), bool('vp', 'Mostrar precio y %', true), bool('vb', 'Mostrar velas y tiempo', true), ...FILL(12).filter(f => f.k !== 'fc')],
    pricerange: [sec('Rango de precio'), col('uc', 'Color al subir', '#089981'), col('dc', 'Color al bajar', '#f23645'), bool('vp', 'Mostrar precio y %', true), ...FILL(12).filter(f => f.k !== 'fc')],
    daterange: [sec('Rango de fechas'), bool('vb', 'Mostrar velas y tiempo', true), ...FILL(8)],
    // Pincel y formas
    brush: [sec('Pincel'), range('op', 'Opacidad', 100, 10, 100, 5)],
    highlighter: [sec('Resaltador'), range('op', 'Opacidad', 35, 10, 100, 5)],
    rect: [sec('Rectángulo'), bool('bd', 'Borde', true), bool('ml', 'Línea media'), bool('xr', 'Extender a la derecha'), ...FILL(13)],
    ellipse: SHAPE(12), triangle: SHAPE(12), circle: SHAPE(12), diamond: SHAPE(12), parallelogram: SHAPE(12),
    // Texto y notas
    text: [sec('Texto'), ...FONT(true), bool('bg', 'Fondo'), col('bc', 'Color del fondo', '#131722'), bool('br', 'Borde')],
    note: [sec('Nota'), ...FONT(false), bool('br', 'Borde')],
    callout: [sec('Llamada'), ...FONT(false), bool('br', 'Borde'), bool('pt', 'Punto en el origen', true)],
    label: [sec('Etiqueta de precio'), ...SIZE],
    marker: [sec('Marcador'), bool('vp', 'Mostrar el precio', true), ...SIZE],
    arrowup: SIZE, arrowdown: SIZE, arrowleft: SIZE, arrowright: SIZE, flag: SIZE, check: SIZE, xmark: SIZE, star: [...SIZE, bool('ol', 'Solo contorno')]
  };
  SCHEMA.short = SCHEMA.long;
  const INDEX = {}; for (const [k, list] of Object.entries(SCHEMA)) { INDEX[k] = {}; for (const f of list) if (f.k) INDEX[k][f.k] = f; }

  const kindOf = d => !d ? '' : d.type === 'brush' ? (d.hl ? 'highlighter' : 'brush') : d.type;
  const schema = d => SCHEMA[kindOf(d)] || [];
  const field = (d, k) => (INDEX[kindOf(d)] || {})[k] || null;
  const has = (d, k) => !!field(d, k);
  /* Valor de un ajuste (el del dibujo o, si no lo tiene, el de fábrica). undefined si la herramienta no tiene ese ajuste. */
  function get(d, k) { const f = field(d, k); if (!f) return undefined; const v = d.o ? d.o[k] : undefined; return v == null ? f.def : v; }
  const r4 = v => +(+v).toFixed(4);
  const same = (a, b) => Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
  /* Devuelve el nuevo d.o tras cambiar un ajuste (null si queda todo de fábrica). No modifica el dibujo. */
  function set(d, k, v) {
    const o = {...(d.o || {})}, f = field(d, k);
    if (Array.isArray(v)) v = [...new Set(v.map(r4))].sort((a, b) => a - b);
    if (v == null || (f && same(v, f.def))) delete o[k]; else o[k] = v;
    return Object.keys(o).length ? o : null;
  }
  /* Niveles activos (ordenados) de las herramientas con niveles. */
  function levelsOf(d) { const f = field(d, 'lv'); if (!f) return []; const v = d.o && Array.isArray(d.o.lv) ? d.o.lv : f.def; return v; }
  const LV_COL = {0: '#787b86', 0.236: '#f23645', 0.382: '#ff9800', 0.5: '#4caf50', 0.618: '#089981', 0.705: '#40c4ff', 0.786: '#00bcd4', 1: '#787b86', 1.272: '#7c4dff', 1.414: '#e91e63', 1.618: '#2962ff', 2: '#b07cff', 2.618: '#f23645', 3.618: '#9c27b0', 4.236: '#e91e63'};
  const LV_PAL = ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#9c27b0', '#e91e63'];
  /* Color de un nivel: el que le puso el usuario; si no, la paleta por nivel (con «un color por nivel») o el color del dibujo. */
  function levelColor(d, lv, base) {
    const lk = d.o && d.o.lk, own = lk && lk[String(r4(lv))]; if (own) return own;
    if (!get(d, 'mc')) return base;
    if (LV_COL[r4(lv)]) return LV_COL[r4(lv)];
    const i = levelsOf(d).indexOf(lv); return LV_PAL[(i < 0 ? Math.round(lv * 7) : i) % LV_PAL.length];
  }
  function levelLabel(d, lv) { const f = field(d, 'lv'); if (f && f.labels) { const i = f.all.findIndex(x => Math.abs(x - lv) < 1e-3); if (i >= 0) return f.labels[i]; } return String(lv); }
  /* Limpia d.o al cargar el estado (de este dispositivo o de la cuenta): solo claves cortas y valores simples. */
  function sanitize(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null; const out = {};
    for (const [k, v] of Object.entries(o).slice(0, 24)) {
      if (!/^[a-z][a-z0-9]{0,7}$/.test(k)) continue;
      if (typeof v === 'boolean') out[k] = v;
      else if (typeof v === 'number') { if (Number.isFinite(v) && Math.abs(v) <= 1e6) out[k] = v; }
      else if (typeof v === 'string') { if (HEX.test(v) || /^[a-z0-9_-]{1,12}$/i.test(v)) out[k] = v; }
      else if (Array.isArray(v)) { const a = [...new Set(v.filter(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1e4).map(r4))].sort((x, y) => x - y).slice(0, 24); out[k] = a; }
      else if (v && typeof v === 'object') { const m = {}; for (const [q, c] of Object.entries(v).slice(0, 24)) if (/^-?\d+(\.\d{1,4})?$/.test(q) && typeof c === 'string' && HEX.test(c)) m[q] = c; if (Object.keys(m).length) out[k] = m; }
    }
    return Object.keys(out).length ? out : null;
  }
  const api = {SCHEMA, kindOf, schema, field, has, get, set, levelsOf, levelColor, levelLabel, sanitize, r4};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTDrawCfg = api;
})(typeof self !== 'undefined' ? self : this);

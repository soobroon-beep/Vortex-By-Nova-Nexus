/* NOVA BOT LAB · apariencia de cada bot: color de fondo + personaje espacial a color (PNG propios en icons/bots/, inspirados en la galaxia de Nova Nexus / VORTEX). */
(function (root) {
  'use strict';
  const COLORS = [['#7c5cff', 'Nebulosa'], ['#548fff', 'Órbita'], ['#22d3ee', 'Cometa'], ['#20bf9f', 'Aurora'], ['#f0b90b', 'Sol'], ['#fb923c', 'Marte'], ['#f06b79', 'Supernova'], ['#f472b6', 'Pulsar'], ['#a3e635', 'Exoplaneta'], ['#94a3b8', 'Luna']];
  /* Personajes espaciales a color (PNG en icons/bots/), estilo del robot de Claudio */
  const ICONS = {robot: 'Robot', astronauta: 'Astronauta', alien: 'Alien', cohete: 'Cohete', planeta: 'Planeta', estrella: 'Estrella', ovni: 'OVNI', luna: 'Luna', cometa: 'Cometa', pulpo: 'Pulpo espacial', satelite: 'Satélite', vortice: 'Vórtice'};
  const OLD = {galaxia: 'vortice', vortex: 'vortice', orbita: 'planeta', constelacion: 'estrella'}; // iconos de la versión anterior
  const KEYS = Object.keys(ICONS);
  const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  const of = b => { const l = (b && b.look) || {}, h = hash(b && b.id), ic = OLD[l.icon] || l.icon; return {color: l.color || COLORS[h % COLORS.length][0], icon: ICONS[ic] ? ic : KEYS[h % KEYS.length]}; };
  const svg = (k, s) => `<img src="icons/bots/${ICONS[OLD[k] || k] ? (OLD[k] || k) : 'robot'}.png" width="${s}" height="${s}" alt="" draggable="false" loading="lazy">`;
  /* Avatar: cuadro redondeado con degradado del color elegido y el icono en blanco */
  const avatar = (look, size) => { size = size || 34; return `<span class="bl-av" style="--av:${look.color};width:${size}px;height:${size}px">${svg(look.icon, Math.round(size * .8))}</span>`; };
  const picker = look => `<div class="bl-look"><div class="bl-look-prev">${avatar(look, 46)}</div><div class="bl-look-c"><small>Color</small><div class="bl-sw">${COLORS.map(([c, n]) => `<button type="button" title="${n}" data-a="lk" data-t="color" data-v="${c}" class="${look.color === c ? 'on' : ''}" style="--c:${c}"></button>`).join('')}</div>
    <small>Icono</small><div class="bl-ics">${KEYS.map(k => `<button type="button" title="${ICONS[k]}" data-a="lk" data-t="icon" data-v="${k}" class="${look.icon === k ? 'on' : ''}" style="--c:${look.color}">${svg(k, 30)}</button>`).join('')}</div></div></div>`;
  root.CCTBotLook = {COLORS, ICONS, KEYS, of, avatar, picker, svg};
})(typeof window !== 'undefined' ? window : globalThis);

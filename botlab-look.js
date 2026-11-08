/* NOVA BOT LAB · apariencia de cada bot: color + icono espacial (inspirados en la galaxia de Nova Nexus / VORTEX). Iconos SVG propios, pequeños. */
(function (root) {
  'use strict';
  const COLORS = [['#7c5cff', 'Nebulosa'], ['#548fff', 'Órbita'], ['#22d3ee', 'Cometa'], ['#20bf9f', 'Aurora'], ['#f0b90b', 'Sol'], ['#fb923c', 'Marte'], ['#f06b79', 'Supernova'], ['#f472b6', 'Pulsar'], ['#a3e635', 'Exoplaneta'], ['#94a3b8', 'Luna']];
  const ICONS = { // trazos de 24×24, línea blanca
    planeta: ['Planeta', '<circle cx="12" cy="12" r="5"/><path d="M3.5 15.5c-1-1.9 2.8-4.8 8.5-6.4s10.6-1.4 11 .7c.4 1.9-3.4 4.6-8.9 6.2-5.5 1.6-10.1 1.4-10.6-.5z"/>'],
    cohete: ['Cohete', '<path d="M12 3c3 2 4.5 5.2 4.5 9L14 16h-4l-2.5-4c0-3.8 1.5-7 4.5-9z"/><circle cx="12" cy="9.5" r="1.6"/><path d="M8.3 13.5 5.5 16l1 3 3-1.5M15.7 13.5 18.5 16l-1 3-3-1.5M11 19.5l1 2 1-2"/>'],
    estrella: ['Estrella', '<path d="M12 2.8l2.6 6.1 6.6.6-5 4.4 1.5 6.5L12 17l-5.7 3.4 1.5-6.5-5-4.4 6.6-.6z"/>'],
    cometa: ['Cometa', '<circle cx="16.5" cy="7.5" r="3.2"/><path d="M14.2 9.8 4 20M13 8.2 5.5 12.5M16 10.8 11.5 18.5"/>'],
    galaxia: ['Galaxia', '<path d="M12 12c0-2 1.6-3.2 3.2-2.6 2 .8 2.2 3.8 0 5.4-2.8 2-7 .6-7.6-3-.6-4 3.4-7.4 7.6-6.4"/><path d="M12 12c0 2-1.6 3.2-3.2 2.6-2-.8-2.2-3.8 0-5.4 2.8-2 7-.6 7.6 3 .6 4-3.4 7.4-7.6 6.4"/>'],
    satelite: ['Satélite', '<rect x="9.5" y="9.5" width="5" height="5" rx="1" transform="rotate(45 12 12)"/><path d="M8.2 8.2 4.5 4.5M3 7.5l4.5-4.5M15.8 15.8l3.7 3.7M16.5 21 21 16.5M15 6a4 4 0 0 1 3 3M15 3a7 7 0 0 1 6 6"/>'],
    astronauta: ['Astronauta', '<circle cx="12" cy="10" r="6.5"/><rect x="8" y="7.5" width="8" height="5" rx="2.5"/><path d="M6.5 15.5 5 21h14l-1.5-5.5"/>'],
    orbita: ['Órbita', '<circle cx="12" cy="12" r="2.4"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)"/><circle cx="19" cy="8" r="1.2" fill="currentColor"/>'],
    luna: ['Luna', '<path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z"/><circle cx="17.5" cy="5" r=".9" fill="currentColor"/><circle cx="20.5" cy="9" r=".6" fill="currentColor"/>'],
    ovni: ['OVNI', '<path d="M8 10.5a4 4 0 0 1 8 0"/><ellipse cx="12" cy="12.5" rx="9" ry="3"/><path d="M8 16l-1.5 3M16 16l1.5 3M12 15.5V19"/>'],
    constelacion: ['Constelación', '<circle cx="5" cy="17" r="1.3"/><circle cx="10" cy="9" r="1.3"/><circle cx="15" cy="13" r="1.3"/><circle cx="19" cy="5" r="1.3"/><path d="M6 16l3.3-6M11.2 9.8l2.6 2.4M15.8 12l2.6-5.8"/>'],
    vortex: ['Vórtice', '<path d="M5 6l7 13 7-13"/><path d="M3.5 12.5c3-3.2 14-3.2 17 0"/><path d="M18.5 3.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor"/>']
  };
  const KEYS = Object.keys(ICONS);
  const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  const of = b => { const l = (b && b.look) || {}, h = hash(b && b.id); return {color: l.color || COLORS[h % COLORS.length][0], icon: ICONS[l.icon] ? l.icon : KEYS[h % KEYS.length]}; };
  const svg = (k, s) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(ICONS[k] || ICONS.planeta)[1]}</svg>`;
  /* Avatar: cuadro redondeado con degradado del color elegido y el icono en blanco */
  const avatar = (look, size) => { size = size || 34; return `<span class="bl-av" style="--av:${look.color};width:${size}px;height:${size}px">${svg(look.icon, Math.round(size * .58))}</span>`; };
  const picker = look => `<div class="bl-look"><div class="bl-look-prev">${avatar(look, 46)}</div><div class="bl-look-c"><small>Color</small><div class="bl-sw">${COLORS.map(([c, n]) => `<button type="button" title="${n}" data-a="lk" data-t="color" data-v="${c}" class="${look.color === c ? 'on' : ''}" style="--c:${c}"></button>`).join('')}</div>
    <small>Icono</small><div class="bl-ics">${KEYS.map(k => `<button type="button" title="${ICONS[k][0]}" data-a="lk" data-t="icon" data-v="${k}" class="${look.icon === k ? 'on' : ''}" style="--c:${look.color}">${svg(k, 18)}</button>`).join('')}</div></div></div>`;
  root.CCTBotLook = {COLORS, ICONS, KEYS, of, avatar, picker, svg};
})(typeof window !== 'undefined' ? window : globalThis);

/* Paleta de colores de VORTEX en TODA la app: cualquier cuadrito de color (ajustes de indicadores, Nova Nexus, scripts Pine,
   Aspecto del gráfico, alertas…) abre la misma paleta que las herramientas de dibujo, con «Mis colores» abajo.
   Mis colores: hasta 20, se guardan en tu cuenta (state.ui.myColors) y salen en todas las paletas, también en la de los dibujos.
   El cambio se aplica al momento (se manda el evento input/change del cuadrito, así la vista previa en vivo sigue funcionando). */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search) && !window.CCTColors) return;
  const C = () => window.CCTColors, hex = v => /^#[0-9a-f]{6}$/i.test(v || '');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  let pop = null, target = null, edit = false;

  const sw = (c, cur, mine) => `<button type="button" class="cp-sw${String(cur).toLowerCase() === c ? ' on' : ''}" data-c="${c}" style="background:${c}" aria-label="${c}">${mine && edit ? '<i data-del="' + c + '" aria-label="Quitar">×</i>' : ''}</button>`;
  function html() {
    const cur = (target && target.value || '').toLowerCase(), pal = (C() && C().pal()) || [], mine = C() ? C().get() : [], saved = C() && C().has(cur);
    return `<div class="cp-grid">${pal.flat().map(c => sw(c, cur)).join('')}</div>
      <div class="cp-mine"><div class="cp-h"><span>Mis colores <small>${mine.length}/20</small></span><span class="cp-acts">${mine.length ? `<button type="button" data-edit>${edit ? 'Listo' : 'Editar'}</button>` : ''}<button type="button" class="cp-add" data-save ${saved || !hex(cur) ? 'disabled' : ''} title="${saved ? 'Ya está en Mis colores' : 'Guardar este color en Mis colores'}" aria-label="Guardar este color en Mis colores">${saved ? '✓' : '+'}</button></span></div>
        ${mine.length ? `<div class="cp-grid">${mine.map(c => sw(c, cur, true)).join('')}</div>` : '<small class="cp-empty">Guarda hasta 20 colores: aparecerán aquí en todas las paletas de la app.</small>'}</div>
      <label class="cp-other"><span class="cp-prev" style="background:${esc(hex(cur) ? cur : '#000000')}"></span><span>Otro color</span><input type="color" data-native value="${esc(hex(cur) ? cur : '#e9c36e')}"><b>${esc(cur.toUpperCase())}</b></label>`;
  }
  function paint() { if (pop) pop.innerHTML = html(); }
  function place() {
    if (!pop || !target) return; const r = target.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, m = 8;
    if (innerWidth <= 640) { pop.style.left = Math.max(m, (innerWidth - w) / 2) + 'px'; pop.style.top = Math.max(m, innerHeight - h - m - 12) + 'px'; return; }
    let x = r.left, y = r.bottom + 6; if (x + w > innerWidth - m) x = innerWidth - w - m; if (y + h > innerHeight - m) y = Math.max(m, r.top - h - 6);
    pop.style.left = Math.max(m, x) + 'px'; pop.style.top = y + 'px';
  }
  function open(inp) {
    close(); target = inp; edit = false;
    pop = document.createElement('div'); pop.className = 'cp-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Paleta de colores');
    pop.innerHTML = html(); document.body.appendChild(pop); place(); requestAnimationFrame(() => pop && pop.classList.add('open'));
    pop.addEventListener('click', onClick); pop.addEventListener('input', onNative);
  }
  function close() { if (!pop) return; const p = pop; pop = null; target = null; p.classList.remove('open'); setTimeout(() => p.remove(), 140); }
  function apply(c) { if (!target || !hex(c)) return; target.value = c; target.dispatchEvent(new Event('input', {bubbles: true})); target.dispatchEvent(new Event('change', {bubbles: true})); }
  function toast(m) { const t = document.getElementById('toast'); if (!t) return; t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => { t.style.display = 'none'; }, 2200); }
  function save(c) { const r = C() && C().add(c); if (r === 'full') toast('Ya tienes 20 colores: quita uno con «Editar» para guardar otro'); else if (r) toast('Color guardado en tu paleta'); return r; }
  function onClick(e) {
    const d = e.target.closest('[data-del]'); if (d) { e.stopPropagation(); C().remove(d.dataset.del); paint(); return; }
    if (e.target.closest('[data-edit]')) { edit = !edit; paint(); return; }
    if (e.target.closest('[data-save]')) { if (target) save(target.value); paint(); return; }
    const s = e.target.closest('[data-c]'); if (s) { if (edit) return; apply(s.dataset.c); paint(); }
  }
  function onNative(e) { if (!e.target.matches('[data-native]')) return; apply(e.target.value); const pv = pop.querySelector('.cp-prev'), b = pop.querySelector('.cp-other b'); if (pv) pv.style.background = e.target.value; if (b) b.textContent = e.target.value.toUpperCase(); pop.querySelectorAll('.cp-sw').forEach(x => x.classList.toggle('on', x.dataset.c === e.target.value.toLowerCase())); const sv = pop.querySelector('[data-save]'); if (sv) { const has = C().has(e.target.value); sv.disabled = has; sv.textContent = has ? '✓' : '+'; } }

  // cualquier cuadrito de color de la app abre la paleta (menos el «Otro color» nativo de las paletas)
  const own = el => el.matches('input[type=color]') && !el.closest('.cp-pop, .pp-custom') && !el.hasAttribute('data-native') && !el.disabled;
  document.addEventListener('click', e => { const el = e.target; if (!(el instanceof Element) || !own(el)) return; e.preventDefault(); e.stopPropagation(); if (target === el && pop) close(); else open(el); }, true);
  document.addEventListener('pointerdown', e => { if (pop && !pop.contains(e.target) && e.target !== target) close(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pop) { e.stopImmediatePropagation(); e.preventDefault(); close(); } }, true);
  addEventListener('resize', () => close()); document.addEventListener('scroll', e => { if (pop && !pop.contains(e.target)) place(); }, true);

  // «+ Guardar» de la paleta de los dibujos: guarda el color actual y redibuja «Mis colores» ahí mismo
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-mycol-add]'); if (!b) return; e.preventDefault(); e.stopPropagation();
    const box = b.closest('.pp-mine'), wrap = box && box.parentElement, ref = wrap && wrap.querySelector('.pp-grid .pp-sw'); if (!ref) return;
    const attr = ref.getAttributeNames().find(n => n.startsWith('data-p')); const on = wrap.querySelector('.pp-grid .pp-sw.on'), inp = wrap.querySelector('.pp-custom input[type=color]');
    const cur = (on && on.getAttribute(attr)) || (inp && inp.value) || b.dataset.mycolAdd; if (!save(cur)) return;
    const m = C().get(), grid = box.querySelector('.pp-grid') || Object.assign(document.createElement('div'), {className: 'pp-grid'}), em = box.querySelector('.pp-mine-e'); if (em) em.replaceWith(grid);
    grid.innerHTML = m.map(c => `<button class="pp-sw${c === String(cur).toLowerCase() ? ' on' : ''}" ${attr}="${c}" style="background:${c}" aria-label="${c}"></button>`).join('');
  }, true);
  window.CCTColorPick = {open, close};
})();

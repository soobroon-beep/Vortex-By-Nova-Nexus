/* VORTEX · Animación de TODO lo que aparece (menús, ventanas, paneles, confirmaciones…).
   No hace falta tocar cada ventana: un observador detecta cuando aparece algo «flotante» (se agrega a la página o se le quita «hidden»)
   y le pone una entrada con resorte, desenfoque que se aclara y un destello de luz. Los menús abren sus opciones en cascada.
   Las capas oscuras de fondo solo se desvanecen; la ventana de adentro es la que «salta».
   Respeta «reducir movimiento» del sistema; en modo Ligero es más corta y sin desenfoque. Quitarlo: borrar este archivo y vx-motion.css. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.MutationObserver) return;
  let reduced = false; try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  const SKIP = '.sheet,.sheet-backdrop,.vxa-back,.vxa-dlg,#toast,#connPill,#starCursor,#vxStars,#vxSplash,.px-layer,.px-ink,.px-bub,.px-tip,.px-peek,.px-av,.cfg-tip,.vxm-out,.ux-out,canvas,svg,script,style,link,.tradingview-widget-container,.tab-prev,.mg-hint,.br-dot,.dc-st,.aiv-msg,.ok,.err';
  const OVER = /-(ov|overlay|back|backdrop|bg|dim)$|^(overlay|backdrop)$/; // capas de fondo: solo se desvanecen
  const POP = /-(pop|popup|menu|dlg|dialog|modal|fly|panel|drop|dropdown|picker|box|confirm|tree)$|^(popup|dialog|modal|dropdown)$/;
  const MENU = /(^|-)(menu|fly)$/;
  const isEl = n => n && n.nodeType === 1;
  function kind(el) {
    if (!isEl(el) || el.matches(SKIP) || el.closest('.vxm-in')) return '';
    const role = el.getAttribute('role') || '', cls = el.classList;
    let over = false, pop = /^(dialog|alertdialog|menu|listbox)$/.test(role);
    for (const c of cls) { if (OVER.test(c)) over = true; else if (POP.test(c)) pop = true; }
    if (!over && !pop) return '';
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return '';
    if (cs.position !== 'fixed' && cs.position !== 'absolute' && !over && role !== 'dialog') return ''; // solo lo que flota encima
    return over ? 'over' : 'pop';
  }
  function origin(el) { // la ventana «crece» desde el lado más cercano a donde se tocó (su esquina más cercana al centro de la pantalla)
    try { const r = el.getBoundingClientRect(); if (!r.width) return '50% 0%'; const cx = r.left + r.width / 2, cy = r.top + r.height / 2, W = innerWidth, H = innerHeight;
      if (r.width > W * .8 && r.height > H * .6) return '50% 60%';
      const x = cx < W * .35 ? '0%' : cx > W * .65 ? '100%' : '50%', y = cy < H * .4 ? '0%' : cy > H * .6 ? '100%' : '50%'; return x + ' ' + y; } catch (e) { return '50% 0%'; }
  }
  function play(el, k) {
    if (reduced || !el.isConnected || el.dataset.vxmNo != null) return;
    const lite = document.documentElement.classList.contains('vx-lite');
    if (k === 'over') {
      add(el, 'vxm-fade');
      const inner = [...el.children].find(c => !c.matches(SKIP) && c.getBoundingClientRect().width > 40);
      if (inner) { inner.style.setProperty('--vxm-o', '50% 40%'); add(inner, '', !lite); stagger(inner); }
      return;
    }
    el.style.setProperty('--vxm-o', origin(el));
    const r = el.getBoundingClientRect(), fromBottom = r.top > innerHeight * .55 && r.height < innerHeight * .6;
    add(el, fromBottom ? 'vxm-rise' : [...el.classList].some(c => MENU.test(c)) || el.getAttribute('role') === 'menu' ? 'vxm-drop' : '', !lite && r.width > 220 && r.height > 120);
    stagger(el);
  }
  function add(el, extra, glint) {
    if (glint) { try { if (getComputedStyle(el).position === 'static') glint = false; } catch (e) { glint = false; } } // el destello necesita una caja posicionada (nunca se cambia su posición)
    const cls = ['vxm-in'].concat(extra ? [extra] : [], glint ? ['vxm-glint'] : []);
    el.classList.add.apply(el.classList, cls);
    const done = e => { if (e && e.target !== el) return; el.classList.remove.apply(el.classList, cls); el.removeEventListener('animationend', done); };
    el.addEventListener('animationend', done); setTimeout(done, 1200); // al terminar se quita: no estorba a sus propias transiciones de cierre
  }
  function stagger(el) { // opciones de un menú: en cascada (solo listas cortas)
    const kids = [...el.children].filter(c => /^(BUTTON|A|LABEL|LI)$/.test(c.tagName) || c.classList.contains('pp-item') || c.classList.contains('setting-row'));
    if (kids.length < 3 || kids.length > 28 || kids.length !== el.children.length && kids.length < 4) return;
    kids.forEach((c, i) => c.style.setProperty('--i', Math.min(i, 14)));
    el.classList.add('vxm-stagger'); setTimeout(() => { el.classList.remove('vxm-stagger'); kids.forEach(c => c.style.removeProperty('--i')); }, 1000);
  }
  const seen = new WeakSet(), byCls = new Map(); // lo que se vuelve a crear muy seguido (p. ej. al repintar) no se anima otra vez
  function check(el) {
    if (seen.has(el)) return; const k = kind(el); if (!k) return; seen.add(el); setTimeout(() => seen.delete(el), 400);
    const sig = el.className + '|' + (el.id || ''), now = Date.now(), last = byCls.get(sig) || 0; byCls.set(sig, now); if (now - last < 900) return;
    if (byCls.size > 300) byCls.clear();
    play(el, k);
  }
  const mo = new MutationObserver(recs => {
    for (const r of recs) {
      if (r.type === 'attributes') { if (r.attributeName === 'hidden' && r.oldValue !== null && !r.target.hidden) check(r.target); else if (r.attributeName === 'class' && r.target.classList.contains('open') && !(r.oldValue || '').split(' ').includes('open')) check(r.target); continue; }
      for (const n of r.addedNodes) { if (!isEl(n)) continue; check(n); if (n.children.length && n.children.length < 6) for (const c of n.children) if (c.matches('[role=dialog],[role=menu]')) check(c); }
    }
  });
  function start() {
    mo.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'], attributeOldValue: true});
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  /* Salida animada para quien la pida: VXMotion.out(el) (la usan los cierres que ya tenían uxOut) */
  window.VXMotion = {
    out(el, ms) { if (!el || !el.isConnected) return; if (reduced) { el.remove(); return; } el.classList.add('vxm-out'); el.querySelectorAll('[id]').forEach(x => x.removeAttribute('id')); if (el.id) el.removeAttribute('id'); setTimeout(() => el.remove(), ms || 170); },
    play: el => play(el, kind(el) || 'pop')
  };
})();

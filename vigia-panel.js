/* VIGÍA DE VORTEX · panel (solo la cuenta del creador): Configuración › Vigía.
   Muestra lo que encontró la revisión diaria (scripts/vigia.js) y te deja aprobar o descartar cada cambio.
   Nada se aplica solo: lo aprobado queda en la lista «Aprobados» para aplicarlo en la versión de pruebas (dev).
   Datos: users/<tu uid>/data/vigia (privado). Aquí también se guarda el webhook de tu canal PRIVADO de Discord. */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search)) return;
  const $ = (s, e) => (e || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const HOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;
  const C = () => window.CCTCloudPriv, isOwner = () => !!(window.CCTPlans && CCTPlans.owner && C() && C().ready());
  const TABS = [['nuevo', 'Por decidir'], ['aprobado', 'Aprobados'], ['descartado', 'Descartados'], ['resuelto', 'Resueltos']];
  const SEVN = {alta: 'Alta', media: 'Media', baja: 'Baja'};
  let doc = null, tab = 'nuevo', ov = null, busy = false, open1 = '';

  const when = t => { if (!t) return '—'; const d = Date.now() - t, h = d / 3600e3; return h < 1 ? 'hace ' + Math.max(1, Math.round(d / 6e4)) + ' min' : h < 24 ? 'hace ' + Math.round(h) + ' h' : new Date(t).toLocaleDateString('es-MX', {day: 'numeric', month: 'short'}); };
  async function load() { try { doc = (await C().get('vigia')) || {items: []}; } catch (e) { doc = {items: [], err: 'No se pudo leer tu revisión: ' + (e.message || e)}; } if (!Array.isArray(doc.items)) doc.items = []; }
  async function save() { if (busy) return; busy = true; try { const o = Object.assign({}, doc); delete o.err; await C().set('vigia', o); } catch (e) { toast(/permission|insufficient/i.test(String(e && (e.code || e.message))) ? 'Falta publicar las reglas de Firestore para guardar tus decisiones (ver Vigía: «Publicar reglas de Firestore»)' : 'No se pudo guardar: ' + (e.message || e)); } busy = false; }
  const toast = m => { const t = $('#toast'); if (!t) return; t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => { t.style.display = 'none'; }, 2600); };

  function row() { // fila en Configuración (solo para ti)
    const z = $('#devZone'), dev = !!(window.CCTPlans && CCTPlans.owner); if (z) z.hidden = !dev; // zona de desarrollador: Vigía y Vista de membresía, solo para el creador
    const r = $('#setVigia'); if (!r) return; const own = isOwner(); r.hidden = !own; if (!own) return;
    const n = (doc && doc.items || []).filter(o => o.status === 'nuevo').length, b = $('.vg-count', r);
    if (b) { b.textContent = n; b.hidden = !n; }
  }

  function card(o) {
    const op = open1 === o.id, acts = o.status === 'nuevo' ? `<button type="button" class="vg-btn ok" data-vg="aprobado" data-id="${o.id}">Aplicar</button><button type="button" class="vg-btn" data-vg="descartado" data-id="${o.id}">Descartar</button>`
      : o.status === 'resuelto' ? '' : `<button type="button" class="vg-btn" data-vg="nuevo" data-id="${o.id}">Deshacer</button>`;
    return `<article class="vg-card s-${esc(o.sev)}${op ? ' open' : ''}" data-open="${o.id}">
      <div class="vg-top"><span class="vg-sev">${SEVN[o.sev] || 'Media'}</span><span class="vg-area">${esc(o.area)}</span><span class="vg-when">${o.seen > 1 ? 'visto ' + o.seen + ' veces · ' : ''}${when(o.last)}</span></div>
      <h4>${esc(o.title)}</h4>
      ${o.detail ? `<p>${esc(o.detail)}</p>` : ''}
      <div class="vg-more">${o.fix ? `<div class="vg-fix"><b>Cambio propuesto</b><p>${esc(o.fix)}</p></div>` : ''}${o.ev ? `<details><summary>Evidencia técnica</summary><pre>${esc(o.ev)}</pre></details>` : ''}${o.where ? `<small>Dónde: ${esc(o.where)}</small>` : ''}</div>
      ${acts ? `<div class="vg-acts">${acts}</div>` : ''}</article>`;
  }

  function paint() {
    if (!ov) return; const items = doc.items || [], cnt = k => items.filter(o => o.status === k).length, list = items.filter(o => o.status === tab);
    $('.vg-body', ov).innerHTML = `
      ${doc.err ? `<div class="vg-err">${esc(doc.err)}</div>` : ''}
      <div class="vg-sum"><div><b>${doc.at ? 'Última revisión ' + when(doc.at) : 'Aún no hay revisión'}</b><p>${esc(doc.summary || 'La primera revisión corre mañana a las 7:17 a. m. o en cuanto se publique un cambio en la app.')}</p></div>
        ${doc.stats ? `<small>Botones probados: ${Object.entries(doc.stats).map(([k, v]) => k + ' ' + (v.botones || 0)).join(' · ')}</small>` : ''}</div>
      <div class="vg-tabs" role="tablist">${TABS.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}<i>${cnt(k)}</i></button>`).join('')}</div>
      <div class="vg-list">${list.length ? list.map(card).join('') : `<div class="vg-empty">${tab === 'nuevo' ? 'Nada pendiente. Todo en orden.' : 'Vacío por ahora.'}</div>`}</div>
      ${tab === 'aprobado' && list.length ? '<p class="vg-hint">Lo aprobado se aplica primero en la versión de pruebas (dev). Pídeselo a Claude con: «aplica lo aprobado del Vigía».</p>' : ''}
      <div class="vg-dc"><b>Resumen diario en Discord</b><small>Pega el webhook de un canal <u>privado</u> (Ajustes del canal › Integraciones › Webhooks). No uses #vortex: ese canal es público.</small>
        <div class="vg-dc-row"><input type="password" id="vgHook" placeholder="https://discord.com/api/webhooks/…" value="${esc(doc.hook || '')}" autocomplete="off" spellcheck="false"><button type="button" class="vg-btn ok" data-vg-hook>Guardar</button></div></div>`;
    row();
  }

  async function openPanel() {
    if (!isOwner()) return; if (ov) return;
    ov = document.createElement('div'); ov.className = 'vg-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Vigía de VORTEX');
    ov.innerHTML = `<div class="vg-box"><div class="vg-head"><div><b>Vigía de VORTEX</b><small>Revisión diaria · nada se cambia sin tu aprobación</small></div><button type="button" class="vg-x" aria-label="Cerrar">✕</button></div><div class="vg-body"><div class="vg-empty">Cargando…</div></div></div>`;
    document.body.appendChild(ov); requestAnimationFrame(() => ov && ov.classList.add('open'));
    ov.addEventListener('click', onClick);
    await load(); paint();
  }
  function closePanel() { if (!ov) return; const o = ov; ov = null; o.classList.remove('open'); setTimeout(() => o.remove(), 200); }

  async function onClick(e) {
    const t = e.target;
    if (t === ov || t.closest('.vg-x')) return closePanel();
    const tb = t.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; open1 = ''; paint(); return; }
    const b = t.closest('[data-vg]');
    if (b) { const o = doc.items.find(x => x.id === b.dataset.id); if (!o) return; o.status = b.dataset.vg; o.decided = Date.now(); paint(); await save();
      toast(o.status === 'aprobado' ? 'Aprobado: queda en «Aprobados» para aplicarlo' : o.status === 'descartado' ? 'Descartado: no se volverá a proponer' : 'Regresó a «Por decidir»'); return; }
    if (t.closest('[data-vg-hook]')) { const v = ($('#vgHook', ov).value || '').trim(); if (v && !HOOK.test(v)) { toast('Ese enlace no parece un webhook de Discord'); return; } doc.hook = v; await save(); toast(v ? 'Webhook guardado: el resumen llegará ahí cada mañana' : 'Webhook quitado'); return; }
    const c = t.closest('[data-open]'); if (c && !t.closest('button, details, input')) { open1 = open1 === c.dataset.open ? '' : c.dataset.open; paint(); }
  }

  document.addEventListener('click', e => { if (e.target.closest('#setVigia')) openPanel(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov) closePanel(); });
  // la fila aparece cuando sabe que eres tú (la sesión tarda unos segundos)
  let loading = false; const tick = async () => { if (isOwner() && !doc && !loading) { loading = true; await load(); loading = false; } row(); };
  setInterval(tick, 4000); if (document.readyState === 'complete') tick(); else addEventListener('load', tick);
  setInterval(() => { if (isOwner() && !ov) load().then(row); }, 30 * 60e3);
  window.CCTVigia = {open: openPanel};
})();

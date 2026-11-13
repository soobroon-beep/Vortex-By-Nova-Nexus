/* VORTEX · Conexión con Neural Brain (Configuración › zona de desarrollador, solo el creador).
   Muestra si tus datos están llegando a tu cerebro y si lo que aprende regresa a VORTEX:
   · el conector «brain-sync» (cada 30 min manda tu actividad de VORTEX a Neural Brain) y el aprendizaje nocturno («brain-learn»),
     leídos del historial público de GitHub Actions (sin datos tuyos);
   · lo que tu cerebro devolvió a VORTEX: users/<tu uid>/data/brain y data/brain_bots (privado, solo lo lees tú). */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search)) return;
  const $ = (s, e) => (e || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const REPO = 'soobroon-beep/Vortex-By-Nova-Nexus';
  const C = () => window.CCTCloudPriv, isOwner = () => !!(window.CCTPlans && CCTPlans.dev && C() && C().ready());
  let ov = null, st = null, busy = false;
  const when = t => { if (!t) return '—'; const d = Date.now() - t, h = d / 3600e3; return h < 1 ? 'hace ' + Math.max(1, Math.round(d / 6e4)) + ' min' : h < 48 ? 'hace ' + Math.round(h) + ' h' : new Date(t).toLocaleDateString('es-MX', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}); };
  const ms = v => !v ? 0 : typeof v === 'number' ? v : v.toMillis ? v.toMillis() : v.seconds ? v.seconds * 1000 : Date.parse(v) || 0;

  async function lastRun(wf) {
    try { const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${wf}/runs?per_page=6`, {headers: {accept: 'application/vnd.github+json'}}); if (!r.ok) return {err: 'GitHub respondió ' + r.status};
      const j = await r.json(), runs = (j.workflow_runs || []), done = runs.find(x => x.status === 'completed'), run = runs[0];
      return {at: done ? Date.parse(done.updated_at) : 0, ok: done ? done.conclusion === 'success' : null, running: !!(run && run.status !== 'completed'), fails: runs.filter(x => x.conclusion === 'failure').length, url: done ? done.html_url : ''};
    } catch (e) { return {err: 'Sin conexión con GitHub'}; }
  }
  async function check() {
    if (busy) return; busy = true; paint();
    const [sync, learn, brain, bots] = await Promise.all([lastRun('brain-sync.yml'), lastRun('brain-learn.yml'), C().get('brain').catch(e => ({err: String(e.message || e)})), C().get('brain_bots').catch(e => ({err: String(e.message || e)}))]);
    st = {sync, learn, brain: brain || {}, bots: bots || {}, at: Date.now()}; busy = false; paint(); row();
  }
  function level() {
    if (!st) return ['', 'Revisando…'];
    const s = st.sync, bAt = ms(st.brain.at), fresh = s.ok && Date.now() - s.at < 3 * 3600e3;
    if (s.err || s.ok === false) return ['bad', s.err ? 'No pude revisar el conector' : 'El último envío a tu cerebro falló'];
    if (!fresh) return ['warn', 'El conector no ha corrido en las últimas 3 horas'];
    if (!bAt || Date.now() - bAt > 6 * 3600e3) return ['warn', 'Se manda tu actividad, pero tu cerebro no ha devuelto lo aprendido recientemente'];
    return ['ok', 'Todo conectado: tus datos llegan y lo aprendido regresa'];
  }
  function row() {
    const r = $('#setBrain'); if (!r) return; const own = isOwner(); r.hidden = !own; if (!own) return;
    const [lv, txt] = level(), d = $('#brDot'), sub = $('#brSub'); if (d) d.className = 'br-dot ' + lv; if (sub && st) sub.textContent = txt;
  }
  const item = (ok, title, body) => `<div class="br-it ${ok === true ? 'ok' : ok === false ? 'bad' : 'warn'}"><span class="br-i">${ok === true ? '✓' : ok === false ? '!' : '•'}</span><div><b>${title}</b><small>${body}</small></div></div>`;
  function paint() {
    if (!ov) return; const body = $('.vg-body', ov);
    if (!st) { body.innerHTML = '<div class="vg-empty">Revisando la conexión con tu cerebro…</div>'; return; }
    const [lv, txt] = level(), s = st.sync, l = st.learn, br = st.brain, bb = st.bots, bAt = ms(br.at), names = Array.isArray(br.brains) ? br.brains : [], nb = bb.bots ? Object.keys(bb.bots).length : 0;
    body.innerHTML = `<div class="br-top ${lv}"><span class="br-big"></span><div><b>${esc(txt)}</b><small>Revisado ${when(st.at)}</small></div></div>
      ${item(s.err ? false : s.ok, 'VORTEX → Neural Brain', s.err ? esc(s.err) : `Último envío ${when(s.at)} · ${s.ok ? 'sin errores' : 'con error'}${s.running ? ' · corriendo ahora' : ''}${s.fails ? ` · ${s.fails} fallo(s) en los últimos 6` : ''} · corre cada 30 min${s.url ? ` · <a href="${esc(s.url)}" target="_blank" rel="noopener">ver</a>` : ''}`)}
      ${item(br.err ? false : bAt && Date.now() - bAt < 6 * 3600e3 ? true : null, 'Neural Brain → VORTEX', br.err ? esc(br.err) : bAt ? `Lo aprendido llegó ${when(bAt)}${names.length ? ` · cerebros: ${names.map(esc).join(', ')}` : ''}${br.text ? ` · ${String(br.text).length.toLocaleString('es-MX')} caracteres para la IA` : ''}` : 'Todavía no ha llegado nada de tus cerebros')}
      ${item(bb.err ? false : nb ? true : null, 'Bots conectados a un cerebro', bb.err ? esc(bb.err) : nb ? `${nb} bot(s) · actualizado ${when(ms(bb.at))}` : 'Ningún bot está conectado a un cerebro todavía')}
      ${item(l.err ? false : l.ok, 'Aprendizaje nocturno', l.err ? esc(l.err) : l.at ? `Última vez ${when(l.at)} · ${l.ok ? 'sin errores' : 'con error'}` : 'Aún no ha corrido')}
      <div class="vg-acts"><button type="button" class="vg-btn ok" data-br-check ${busy ? 'disabled' : ''}>${busy ? 'Revisando…' : 'Revisar otra vez'}</button></div>`;
  }
  async function openPanel() {
    if (!isOwner() || ov) return;
    ov = document.createElement('div'); ov.className = 'vg-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Conexión con Neural Brain');
    ov.innerHTML = `<div class="vg-box"><div class="vg-head"><div><b>Conexión con Neural Brain</b><small>Solo para el creador · ¿llegan bien tus datos a tu cerebro?</small></div><button type="button" class="vg-x" aria-label="Cerrar">✕</button></div><div class="vg-body"></div></div>`;
    document.body.appendChild(ov); requestAnimationFrame(() => ov && ov.classList.add('open'));
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.vg-x')) return closePanel(); if (e.target.closest('[data-br-check]')) check(); });
    paint(); check();
  }
  function closePanel() { if (!ov) return; const o = ov; ov = null; o.classList.remove('open'); setTimeout(() => o.remove(), 200); }
  document.addEventListener('click', e => { if (e.target.closest('#setBrain')) openPanel(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov) closePanel(); });
  let first = false; setInterval(() => { row(); if (isOwner() && !first) { first = true; check(); } }, 4000);
})();

/* Encabezados de Noticias, Alertas y Screener con su icono grande (el mismo de la barra lateral, sin marco) */
(function () {
  const C = {newsView: '#548fff', alertsView: '#f5a623', screenerView: '#20bf9f'};
  function put() {
    for (const [id, col] of Object.entries(C)) {
      const v = document.getElementById(id), h = v && v.querySelector('.view-head'), t = h && h.querySelector('h1'), src = document.querySelector(`.rr-btn[data-side="${id}"] svg`);
      if (!h || !t || !src || h.querySelector('.vh-ic')) continue; const box = t.parentElement, ic = document.createElement('span'); ic.className = 'vh-ic'; ic.style.setProperty('--c', col); ic.setAttribute('aria-hidden', 'true'); ic.appendChild(src.cloneNode(true)); box.parentElement.insertBefore(ic, box); h.classList.add('vh-t');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', put); else put();
})();

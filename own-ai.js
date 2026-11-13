/* VORTEX · «Tu IA» (Configuración › Cuenta): conecta tu propia IA (OpenAI, Claude, Gemini, Grok, DeepSeek, Mistral, Groq, OpenRouter…)
   con tu clave. Todo lo que usa IA en la app la usa primero (Nexus Pixel, briefing, consejos de bots, Analizar gráfico, Laboratorio);
   si no la configuras o falla, se usa la IA gratis de VORTEX. La clave se guarda SOLO en este dispositivo y va directo al proveedor. */
(function () {
  'use strict';
  const L = () => window.CCTLLM, $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  let open = false, models = [], msg = {t: '', c: ''}, busy = false, draft = null;

  function sub() { const el = $('#ownAiSub'); if (!el || !L()) return; const c = L().ownLoad(); el.textContent = c.on ? `Conectada: ${L().OWN[c.provider].name} · ${c.model}` : 'Conecta tu propia IA para respuestas más inteligentes'; }
  function paint() {
    const box = $('#ownAiBox'); if (!box || !L()) return; box.hidden = !open; sub(); if (!open) return;
    const O = L().OWN, saved = L().ownLoad(), c = draft || Object.assign({}, saved), P = O[c.provider] || null;
    box.innerHTML = `<div class="oa-h"><b>Tu IA</b><small>${saved.on ? `Ahora todo lo de IA usa <b>${esc(O[saved.provider].name)}</b> (${esc(saved.model)}).` : 'Conéctala para que todo lo de IA responda mejor.'}</small></div>
      <p class="oa-p">Conecta tu propia IA con tu clave (API key): Nexus Pixel, el briefing, los consejos de los bots, Analizar gráfico y el Laboratorio la usan y te responden mucho mejor. Tu clave se guarda <b>solo en este dispositivo</b> y va directo a tu proveedor.</p>
      <label class="oa-f"><span>IA</span><select id="oaProv"><option value="">Elige tu IA…</option>${Object.entries(O).map(([k, v]) => `<option value="${k}" ${c.provider === k ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
      ${P ? `${c.provider === 'custom' ? `<label class="oa-f"><span>URL del servidor</span><input id="oaUrl" type="url" placeholder="https://…/v1" value="${esc(c.url)}"></label>` : ''}
      <label class="oa-f"><span>Clave (API key)${P.site ? ` · consíguela en <a href="https://${esc(P.site)}" target="_blank" rel="noopener">${esc(P.site)}</a>` : ''}</span><input id="oaKey" type="password" autocomplete="off" placeholder="${esc(P.keyHint)}" value="${esc(c.key)}"></label>
      <label class="oa-f"><span>Modelo ${models.length ? `(${models.length} disponibles con tu clave)` : ''}</span>${models.length ? `<select id="oaModel">${[...new Set([c.model, ...models].filter(Boolean))].map(m => `<option ${m === c.model ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>` : `<input id="oaModel" type="text" value="${esc(c.model)}" placeholder="${esc(P.model)}">`}</label>
      <div class="oa-b"><button type="button" class="oa-btn" data-oa="models" ${busy ? 'disabled' : ''}>Ver mis modelos</button><button type="button" class="oa-btn pri" data-oa="save" ${busy ? 'disabled' : ''}>${busy ? 'Probando…' : 'Probar y guardar'}</button>${saved.on ? '<button type="button" class="oa-btn" data-oa="off">Quitar mi IA</button>' : ''}</div>` : (saved.on ? '<div class="oa-b"><button type="button" class="oa-btn" data-oa="off">Quitar mi IA</button></div>' : '')}
      ${msg.t ? `<p class="oa-msg ${msg.c}">${esc(msg.t)}</p>` : ''}`;
  }
  const read = () => { const p = $('#oaProv'), O = L().OWN, prov = p ? p.value : ''; const d = Object.assign({}, draft || L().ownLoad(), {provider: prov}); const k = $('#oaKey'), m = $('#oaModel'), u = $('#oaUrl');
    if (k) d.key = k.value.trim(); if (m) d.model = m.value.trim(); if (u) d.url = u.value.trim(); if (prov && O[prov] && prov !== 'custom') d.url = O[prov].url; if (prov && !d.model) d.model = O[prov].model; return d; };
  document.addEventListener('click', async e => {
    if (e.target.closest('#setOwnAI')) { open = !open; draft = null; models = []; msg = {t: '', c: ''}; paint(); if (open) $('#ownAiBox').scrollIntoView({block: 'nearest', behavior: 'smooth'}); return; }
    const b = e.target.closest('[data-oa]'); if (!b || !L()) return; const a = b.dataset.oa;
    if (a === 'off') { L().ownSave(null); draft = null; models = []; msg = {t: 'Listo: se quitó tu IA de este dispositivo.', c: 'ok'}; paint(); return; }
    const d = read(); draft = d; if (!d.key) { msg = {t: 'Pega tu clave (API key) primero.', c: 'err'}; paint(); return; } if (d.provider === 'custom' && !/^https?:\/\//.test(d.url)) { msg = {t: 'Escribe la URL del servidor (termina en /v1).', c: 'err'}; paint(); return; }
    busy = true; msg = {t: a === 'models' ? 'Buscando tus modelos…' : 'Probando tu IA…', c: ''}; paint();
    try {
      if (a === 'models') { models = await L().ownModels(d); msg = {t: models.length ? 'Elige el modelo que quieras usar.' : 'Tu clave funciona, pero no devolvió la lista: escribe el nombre del modelo.', c: 'ok'}; if (!models.length) models = []; }
      else { const r = await L().ownTest(d); L().ownSave({on: true, provider: d.provider, key: d.key, model: d.model, url: d.url}); draft = null; msg = {t: `Conectada. Tu IA respondió «${String(r).slice(0, 40)}». Desde ahora todo lo de IA la usa.`, c: 'ok'}; }
    } catch (er) { msg = {t: 'No funcionó: ' + String(er && er.message || er).slice(0, 180) + '. Revisa la clave y el modelo.', c: 'err'}; }
    busy = false; paint();
  });
  document.addEventListener('change', e => { if (e.target && e.target.id === 'oaProv') { const O = L().OWN, p = e.target.value; draft = Object.assign(read(), {provider: p, key: '', model: p ? O[p].model : '', url: p ? O[p].url : ''}); models = []; msg = {t: '', c: ''}; paint(); } });
  document.addEventListener('DOMContentLoaded', sub); setTimeout(sub, 800);
})();

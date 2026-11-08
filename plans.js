/* VORTEX · Planes: Gratis, Plus (suscriptores de YouTube) e Infinity (cuenta BingX con el código de referido).
   Por ahora solo muestra los planes y guarda la solicitud; la verificación automática (YouTube y API de afiliado de BingX)
   se hará en el servidor VORTEX y será la que active cada plan. Nada se bloquea todavía. */
(function (root) {
  'use strict';
  const YT = 'https://www.youtube.com/@CriptoChaman', YT_SUB = YT + '?sub_confirmation=1';
  const BX = 'https://bingxdao.com/invite/YCXE5W/', BX_CODE = 'YCXE5W', LS = 'cct_plan_v1';
  const OWNER = 'a8d56a29aa7c5208d7748a84e75e4b14c713c521136174e8a652b7a76ac19b28'; // sha-256 del correo del dueño (no se publica el correo)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const load = () => { try { return Object.assign({tier: 'free'}, JSON.parse(localStorage.getItem(LS) || '{}')); } catch { return {tier: 'free'}; } };
  const save = s => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch {} };
  let st = load(), owner = false, ov = null;

  const TIERS = {
    free: {n: 'Gratis', c: 'free', sub: 'Para todos', ic: '<path d="M12 3.5 14.6 9l6 .7-4.5 4.1 1.2 5.9L12 16.8 6.7 19.7l1.2-5.9L3.4 9.7l6-.7z"/>',
      f: ['Gráficos en vivo de cripto, bolsa y forex', 'Indicadores gratuitos y dibujos', 'Noticias, calendario económico y panel macro', 'Alertas de precio dentro de la app', 'Indicador Nova LITE']},
    plus: {n: 'Plus', c: 'plus', sub: 'Suscriptores de YouTube', ic: '<rect x="3" y="6" width="18" height="12" rx="3.5"/><path d="m10.5 9.5 4 2.5-4 2.5z" fill="currentColor"/>',
      f: ['Todo lo de Gratis', 'Análisis del gráfico con IA', 'Repetición del mercado', 'Calculadora de riesgo integrada', 'Alertas al celular con la app cerrada', 'Acceso a Discord Nova Nexus']},
    infinity: {n: 'Infinity', c: 'inf', sub: 'Cuenta BingX con mi código', ic: '<path d="M6.5 8.5c-2 0-3.5 1.6-3.5 3.5s1.5 3.5 3.5 3.5c3.5 0 7.5-7 11-7 2 0 3.5 1.6 3.5 3.5s-1.5 3.5-3.5 3.5c-3.5 0-7.5-7-11-7z"/>',
      f: ['Todo lo de Plus', 'Indicadores PRO de Nova Nexus', 'Nova Bot Lab y Nexus Lens', 'Mapa de calor de liquidaciones', 'Convertidor de Pine profesional', 'Todas las herramientas nuevas']}
  };
  const current = () => owner ? 'infinity' : (TIERS[st.tier] ? st.tier : 'free');
  const svg = (p, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const CHK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';

  function badge() {
    const t = TIERS[current()];
    document.querySelectorAll('[data-plan-badge]').forEach(el => { el.className = 'pl-badge ' + t.c; el.innerHTML = svg(t.ic, 13) + esc(t.n); });
    document.querySelectorAll('[data-plan-sub]').forEach(el => { el.textContent = owner ? 'Cuenta del creador · acceso total' : st.yt || st.bx ? 'Solicitud guardada · pendiente de verificar' : 'Gratis, Plus o Infinity'; });
  }

  function col(k) {
    const t = TIERS[k], cur = current() === k;
    let act = '';
    if (k === 'free') act = `<div class="pl-act"><button type="button" class="pl-btn ghost" disabled>${cur ? 'Tu plan actual' : 'Incluido'}</button></div>`;
    if (k === 'plus') act = `<ol class="pl-steps"><li><b>Suscríbete a CriptoChaman</b><small>Con la misma cuenta de Google con la que entras a VORTEX.</small><a class="pl-btn plus" href="${YT_SUB}" target="_blank" rel="noopener noreferrer" data-pl-yt>${svg(TIERS.plus.ic, 16)} Suscribirme en YouTube</a></li>
        <li><b>Verifica tu suscripción</b><small>${st.yt ? 'Solicitud guardada. La activaremos en cuanto la verificación automática esté lista.' : 'La verificación automática con Google llega muy pronto.'}</small><button type="button" class="pl-btn ghost" data-pl-ytok ${st.yt ? 'disabled' : ''}>${st.yt ? svg(CHK, 15) + ' Solicitud guardada' : 'Ya me suscribí'}</button></li></ol>`;
    if (k === 'infinity') act = `<ol class="pl-steps"><li><b>Crea tu cuenta en BingX con mi código</b><small>Código de referido <button type="button" class="pl-code" data-pl-copy title="Copiar código">${BX_CODE} ${svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>', 13)}</button></small><a class="pl-btn inf" href="${BX}" target="_blank" rel="noopener noreferrer">${svg(TIERS.infinity.ic, 16)} Abrir cuenta en BingX</a></li>
        <li><b>Escribe tu UID de BingX</b><small>Lo ves en tu perfil de BingX. Solo lo usamos para comprobar que entraste con el código.</small><div class="pl-uid"><input inputmode="numeric" autocomplete="off" maxlength="14" placeholder="Ej. 123456789" value="${esc(st.bx || '')}" data-pl-uid aria-label="UID de BingX"><button type="button" class="pl-btn ghost" data-pl-uidok>Guardar</button></div><small class="pl-msg" data-pl-uidmsg>${st.bx ? 'UID guardado: se verificará automáticamente.' : ''}</small></li></ol>`;
    return `<section class="pl-col ${t.c}${cur ? ' cur' : ''}"><header><span class="pl-ic">${svg(t.ic, 22)}</span><div><b>${t.n}</b><small>${t.sub}</small></div>${cur ? '<em class="pl-now">Tu plan</em>' : ''}</header>
      <ul class="pl-f">${t.f.map(x => `<li>${svg(CHK, 14)}${esc(x)}</li>`).join('')}</ul>${act}</section>`;
  }

  function render() {
    if (!ov) return;
    ov.querySelector('.pl-cols').innerHTML = col('free') + col('plus') + col('infinity');
  }
  function open() {
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'pl-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Planes de VORTEX');
      ov.innerHTML = `<div class="pl-box"><div class="pl-top"><div><small>VORTEX</small><h2>Elige tu plan</h2><p>Plus es gratis para los suscriptores del canal y Infinity para quien abre su cuenta de BingX con mi código. Durante el lanzamiento todas las herramientas siguen abiertas.</p></div><button type="button" class="pl-x" data-pl-close aria-label="Cerrar">✕</button></div><div class="pl-cols"></div></div>`;
      ov.addEventListener('click', e => {
        if (e.target === ov || e.target.closest('[data-pl-close]')) return close();
        if (e.target.closest('[data-pl-ytok]')) { st.yt = Date.now(); save(st); render(); badge(); toast('Solicitud de Plus guardada'); return; }
        if (e.target.closest('[data-pl-copy]')) { (navigator.clipboard ? navigator.clipboard.writeText(BX_CODE) : Promise.reject()).then(() => toast('Código ' + BX_CODE + ' copiado'), () => toast('Código: ' + BX_CODE)); return; }
        if (e.target.closest('[data-pl-uidok]')) {
          const v = (ov.querySelector('[data-pl-uid]').value || '').replace(/\D/g, ''), m = ov.querySelector('[data-pl-uidmsg]');
          if (!/^\d{6,14}$/.test(v)) { m.textContent = 'El UID son solo números (de 6 a 14 dígitos).'; m.classList.add('bad'); return; }
          st.bx = v; st.bxAt = Date.now(); save(st); render(); badge(); toast('UID de BingX guardado'); return;
        }
      });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov && !ov.hidden) close(); });
      document.body.appendChild(ov);
    }
    render(); ov.hidden = false; requestAnimationFrame(() => ov.classList.add('open'));
  }
  function close() { if (!ov) return; ov.classList.remove('open'); ov.hidden = true; }
  const toast = m => { if (root.CCT_toast) root.CCT_toast(m); };

  async function setUser(u) {
    let o = false;
    if (u && u.email && root.crypto && crypto.subtle) try {
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(u.email).trim().toLowerCase()));
      o = [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('') === OWNER;
    } catch {}
    owner = o; badge(); if (ov && !ov.hidden) render();
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-plans-open]')) open(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', badge); else badge();
  root.CCTPlans = {open, close, current, setUser, TIERS, links: {youtube: YT, bingx: BX, code: BX_CODE}};
})(typeof self !== 'undefined' ? self : this);

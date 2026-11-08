(() => {
  'use strict';
  if (window.top !== window.self) return;
  const icons = window.CCTAppIcons, root = document.getElementById('appInstall');
  if (!icons || !root) return;
  let promptEvent = null, waitingWorker = null, reloadForUpdate = false;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  root.innerHTML = `
    <div class="sg-label">Ícono e instalación</div>
    <div class="pwa-card">
      <div class="pwa-preview"><span class="pwa-prev-ic"><img data-app-icon width="64" height="64" alt="Ícono seleccionado"></span><div class="pwa-prev-t"><svg class="brand-word wm-sm" viewBox="0 -1 160 45" role="img" aria-label="VORTEX"><g transform="rotate(-7 80 22)" fill="none" stroke-linecap="round"><path class="ring-back" d="M8 22A72 9 0 0 1 152 22"/></g><text x="80" y="29" text-anchor="middle">VORTEX</text><g transform="rotate(-7 80 22)" fill="none" stroke-linecap="round"><path class="ring-gap" d="M152 22A72 9 0 0 1 8 22"/><path class="ring-front" d="M152 22A72 9 0 0 1 8 22"/></g><path class="ring-star" d="M80 .6l1.55 3.75 3.75 1.55-3.75 1.55L80 11.2l-1.55-3.75-3.75-1.55 3.75-1.55z"/></svg><small id="appIconName"></small><span class="pwa-prev-k">Ícono de la app · toca uno para cambiarlo</span></div></div>
      <div class="pwa-icons" role="group" aria-label="Ícono de la aplicación"></div>
      <button type="button" class="pwa-more" id="pwaMore" aria-expanded="false"><span>Ver los ${icons.variants.length} íconos</span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
      <button class="primary" id="installApp" type="button">Instalar aplicación</button>
      <p id="installStatus" class="small-note" role="status" aria-live="polite"></p>
      <details id="installHelp"><summary>Cómo instalar o cambiar el ícono</summary>
        <p><b>Android:</b> abre esta página en Chrome, elige un ícono y toca Instalar aplicación. Si no aparece el aviso, usa el menú ⋮ → Instalar aplicación o Añadir a pantalla de inicio.</p>
        <p><b>iPhone / iPad:</b> abre esta página en Safari, elige un ícono y usa Compartir → Añadir a pantalla de inicio. Activa «Abrir como app» si aparece.</p>
        <p><b>Si ya está instalada:</b> el ícono de inicio no cambia inmediatamente desde estos ajustes. El navegador puede ofrecer una actualización; si conserva el anterior, vuelve a añadir la aplicación con el ícono elegido.</p>
        <p>Antes de eliminar una instalación, exporta tu configuración desde Datos o confirma que esté guardada en tu cuenta. El sistema puede borrar datos locales al eliminar la app.</p>
        <p>Los precios, noticias, IA y sincronización necesitan conexión a internet.</p>
      </details>
      <button id="updateApp" class="small-button" type="button" hidden>Actualizar aplicación</button>
    </div>`;
  { const mb = root.querySelector('#pwaMore'); mb.addEventListener('click', () => { const open = root.querySelector('.pwa-card').classList.toggle('all'); mb.setAttribute('aria-expanded', String(open)); mb.querySelector('span').textContent = open ? 'Ver menos' : `Ver los ${icons.variants.length} íconos`; }); }
  const grid = root.querySelector('.pwa-icons'), button = root.querySelector('#installApp'), status = root.querySelector('#installStatus');
  for (const [id, name] of icons.variants) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pwa-icon-option'; b.dataset.icon = id;
    b.setAttribute('aria-label', name); b.title = name; b.innerHTML = `<img src="icons/${id}-192.png" width="56" height="56" alt="" loading="lazy"><i class="pwa-ck" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></i>`;
    b.addEventListener('click', () => {
      if (id === icons.selected) return;
      promptEvent = null; icons.apply(id);
      const url = new URL(location.href); url.searchParams.set('appIcon', id); history.replaceState(null, '', url);
      render();
      status.textContent = 'Ícono elegido. Toca Preparar instalación para continuar con esta opción. Si ya está instalada, consulta las instrucciones.';
    }); grid.appendChild(b);
  }
  function render() {
    icons.apply(icons.selected);
    grid.querySelectorAll('button').forEach((b, i) => { const on = b.dataset.icon === icons.selected; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('pin', on && i >= 12); }); // el elegido se ve aunque esté más abajo
    root.querySelector('#appIconName').textContent = icons.variants.find(v => v[0] === icons.selected)[1];
    button.textContent = icons.selected !== icons.initial ? 'Preparar instalación' : standalone() ? 'Ver instrucciones de instalación' : promptEvent ? 'Instalar aplicación' : ios ? 'Ver pasos para iPhone / iPad' : 'Ver cómo instalar';
  }
  render();
  status.textContent = standalone() ? 'Abierta como aplicación instalada.' : ios ? 'Instala desde el menú Compartir de Safari.' : 'Si tu navegador permite la instalación, podrás iniciarla aquí o desde su menú.';
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); if (icons.selected === icons.initial) promptEvent = e; render(); });
  window.addEventListener('appinstalled', () => { promptEvent = null; status.textContent = 'Instalación solicitada al sistema. Busca VORTEX en tu pantalla de inicio.'; render(); });
  button.addEventListener('click', async () => {
    if (icons.selected !== icons.initial) {
      const url = new URL(location.href); url.searchParams.set('appIcon', icons.selected); url.searchParams.set('install', '1');
      location.assign(url.href); return;
    }
    if (promptEvent && !standalone()) {
      const event = promptEvent; promptEvent = null; button.disabled = true;
      try { await event.prompt(); const choice = await event.userChoice; status.textContent = choice.outcome === 'accepted' ? 'Instalación aceptada. El sistema añadirá la aplicación.' : 'Instalación cancelada. Puedes intentarlo desde el menú del navegador.'; }
      catch { status.textContent = 'Abre el menú del navegador y elige Instalar aplicación o Añadir a pantalla de inicio.'; }
      finally { button.disabled = false; render(); }
    } else { root.querySelector('#installHelp').open = true; status.textContent = standalone() ? 'Ya estás usando la aplicación. Consulta cómo aplicar otro ícono abajo.' : 'Sigue los pasos para tu celular que aparecen abajo.'; }
  });
  if (new URLSearchParams(location.search).get('install') === '1') {
    if (window.CCT_switchView) CCT_switchView('customView'); else document.getElementById('settingsBtn').click();
    setTimeout(() => root.scrollIntoView({block: 'start'}), 60);
    const url = new URL(location.href); url.searchParams.delete('install'); history.replaceState(null, '', url);
  }
  const offline = document.createElement('div'); offline.id = 'pwaOffline'; offline.setAttribute('role', 'status');
  offline.textContent = 'Sin conexión · los precios y noticias no se están actualizando.';
  document.getElementById('app').prepend(offline);
  const network = () => { offline.hidden = navigator.onLine; }; network();
  window.addEventListener('online', network); window.addEventListener('offline', network);
  if ('serviceWorker' in navigator && window.isSecureContext) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { // versión nueva lista: se recarga una sola vez para no quedarse con código viejo
      let last = 0; try { last = +sessionStorage.getItem('cct_sw_reload') || 0; } catch {}
      if ((reloadForUpdate || hadController) && Date.now() - last > 60000) { try { sessionStorage.setItem('cct_sw_reload', String(Date.now())); } catch {} location.reload(); }
    });
    const showUpdate = worker => { waitingWorker = worker; root.querySelector('#updateApp').hidden = false; };
    root.querySelector('#updateApp').addEventListener('click', () => { if (waitingWorker) { reloadForUpdate = true; waitingWorker.postMessage({type: 'ACTIVATE_UPDATE'}); } });
    navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'}).then(reg => {
      if (reg.waiting) showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker); });
      });
    }).catch(() => { status.textContent += ' No se pudo preparar el modo sin conexión; vuelve a cargar con internet.'; });
  }
})();

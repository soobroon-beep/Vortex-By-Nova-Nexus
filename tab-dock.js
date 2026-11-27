/* VORTEX · Dock de la tablet (solo con html.vx-tab).
   Mismo orden que la barra derecha de la PC: Gráfico | Seguimiento, Noticias, Alertas, Radar, Screener, Bots, Lens, IA, Desarrollador |
   Cuenta, Tema, Ajustes. La sección abierta se marca con una burbuja de cristal que se desliza hasta ella y muestra su icono y su nombre.
   Tocar otra vez la sección abierta regresa al gráfico (como en la PC). */
(function () {
  const root = document.documentElement;
  const $ = s => document.querySelector(s);
  /* Celular: la misma burbuja deslizante en su barra de abajo (mismos botones de siempre, solo cambia el estilo) */
  if (!root.classList.contains('vx-tab')) {
    const ready = () => {
      const nav = $('.bottom-nav'); if (!nav || nav.querySelector('.td-bub')) return;
      nav.classList.add('vx-dock'); const b = document.createElement('i'); b.className = 'td-bub'; b.setAttribute('aria-hidden', 'true'); nav.prepend(b);
      const markP = (view, instant) => {
        if (getComputedStyle(nav).display === 'none') return;
        const btns = [...nav.querySelectorAll('button')].filter(x => getComputedStyle(x).display !== 'none'), act = btns.find(x => x.dataset.view === view);
        btns.forEach(x => x.classList.toggle('on', x === act)); placeBub(nav, b, btns, act, x => x.querySelector('span'), x => x.querySelector('small'), instant);
      };
      document.addEventListener('vx:view', e => markP(e.detail, false));
      addEventListener('resize', () => markP(window.CCT_view ? CCT_view() : '', true));
      markP(window.CCT_view ? CCT_view() : ((nav.querySelector('button.active') || {}).dataset || {}).view, true);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(ready, 0)); else setTimeout(ready, 0);
    return;
  }
  const svgOf = sel => { const e = $(sel); const sv = e && e.querySelector('svg, img'); return sv ? sv.outerHTML : ''; };
  const ITEMS = [
    {v: 'chartView', t: 'Gráfico', ic: () => svgOf('.bottom-nav [data-view="chartView"]')},
    'sep',
    {v: 'watchView', t: 'Seguimiento', ic: () => svgOf('.right-rail [data-side="watchView"]')},
    {v: 'newsView', t: 'Noticias', ic: () => svgOf('.right-rail [data-side="newsView"]')},
    {v: 'alertsView', t: 'Alertas', ic: () => svgOf('.right-rail [data-side="alertsView"]')},
    {v: 'mapView', t: 'Radar', ic: () => svgOf('.right-rail [data-side="mapView"]')},
    {v: 'screenerView', t: 'Screener', ic: () => svgOf('.right-rail [data-side="screenerView"]')},
    {v: 'botLabView', t: 'Bots', ic: () => svgOf('.right-rail [data-side="botLabView"]')},
    {v: 'lensView', t: 'Lens', ic: () => svgOf('.right-rail [data-side="lensView"]')},
    {v: 'aiView', t: 'IA', ic: () => svgOf('.right-rail [data-side="aiView"]')},
    {v: 'devView', t: 'Dev', dev: true, ic: () => svgOf('#rrDev')},
    'sep',
    {a: 'acct', t: 'Cuenta', ic: () => { const r = $('#rrAccount'); return r ? r.innerHTML : ''; }},
    {a: 'theme', t: 'Tema', ic: () => svgOf('#rrTheme')},
    {v: 'settingsView', t: 'Ajustes', ic: () => svgOf('.right-rail [data-side="settingsView"]')}
  ];
  const SUB = {customView: 'settingsView', notifView: 'settingsView', discordView: 'settingsView'}; // sub-pantallas: se marca su sección

  let dock, bub, cur = 'chartView';
  function build() {
    const nav = $('.bottom-nav'); if (!nav || $('#tabDock')) return;
    dock = document.createElement('nav'); dock.id = 'tabDock'; dock.setAttribute('aria-label', 'Secciones');
    dock.innerHTML = '<i class="td-bub" aria-hidden="true"></i>' + ITEMS.map(it => it === 'sep' ? '<span class="td-sep" aria-hidden="true"></span>'
      : `<button type="button" class="td-btn${it.dev ? ' td-dev' : ''}" ${it.v ? `data-v="${it.v}"` : `data-a="${it.a}"`} aria-label="${it.t}"><span class="td-ic">${it.ic()}</span><span class="td-lb">${it.t}</span></button>`).join('');
    nav.after(dock); bub = dock.querySelector('.td-bub');
    dock.addEventListener('click', e => {
      const b = e.target.closest('.td-btn'); if (!b) return;
      b.classList.remove('td-tap'); void b.offsetWidth; b.classList.add('td-tap');
      if (b.dataset.a === 'acct') { if (window.CCT_acct) CCT_acct(b); return; }
      if (b.dataset.a === 'theme') { const t = $('#rrTheme') || $('.theme-sw'); if (t) t.click(); setTimeout(syncIcons, 60); return; }
      const v = b.dataset.v, now = window.CCT_view ? CCT_view() : cur;
      if (window.CCT_switchView) CCT_switchView(v !== 'chartView' && (now === v || SUB[now] === v) ? 'chartView' : v);
    });
    syncDev(); syncIcons(); mark(window.CCT_view ? CCT_view() : 'chartView', true);
    const dev = $('#rrDev'); if (dev) new MutationObserver(() => { syncDev(); mark(cur, true); }).observe(dev, {attributes: true, attributeFilter: ['hidden']});
    const ac = $('#rrAccount'); if (ac) new MutationObserver(syncIcons).observe(ac, {childList: true, subtree: true});
    const th = $('#rrTheme'); if (th) new MutationObserver(syncIcons).observe(th, {childList: true, subtree: true, attributes: true});
    addEventListener('resize', () => mark(cur, true));
  }
  function syncDev() { const d = $('#rrDev'), b = dock && dock.querySelector('.td-dev'); if (b) b.hidden = !d || d.hidden; }
  function syncIcons() {
    if (!dock) return;
    const a = dock.querySelector('[data-a="acct"] .td-ic'), r = $('#rrAccount'); if (a && r && a.innerHTML !== r.innerHTML) a.innerHTML = r.innerHTML;
    const t = dock.querySelector('[data-a="theme"] .td-ic'), ts = svgOf('#rrTheme'); if (t && ts && t.innerHTML !== ts) t.innerHTML = ts;
    const al = dock.querySelector('[data-a="acct"] .td-lb'); if (al && r) al.textContent = r.dataset.tip === 'Iniciar sesión' ? 'Entrar' : 'Cuenta';
  }
  /* La burbuja va a la sección abierta. El ancho final de cada botón se calcula antes de animar (icono + nombre solo en el activo),
     así la burbuja y el nombre crecen juntos, en el mismo tiempo, sin saltos. */
  function mark(view, instant) {
    if (!dock) return; cur = view; const key = SUB[view] || view;
    const btns = [...dock.querySelectorAll('.td-btn')], act = btns.find(b => b.dataset.v === key) || null;
    btns.forEach(b => b.classList.toggle('on', b === act));
    if (!act) { bub.style.opacity = '0'; return; }
    placeBub(dock, bub, btns, act, el => el.querySelector('.td-ic'), el => el.querySelector('.td-lb'), instant);
  }
  document.addEventListener('vx:view', e => mark(e.detail, false));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(build, 0)); else setTimeout(build, 0);
  /* Coloca la burbuja en el botón activo. El ancho final de cada botón se calcula antes de animar (icono + nombre solo en el activo),
     así la burbuja y el nombre crecen juntos, en el mismo tiempo, sin saltos. Los botones van centrados en la barra. */
  function placeBub(box, bub, btns, act, icOf, lbOf, instant) {
    if (!act) { bub.style.opacity = '0'; return; }
    const cs = getComputedStyle(box), padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0, gap = parseFloat(cs.columnGap || cs.gap) || 0;
    const items = [...box.children].filter(el => el !== bub && !el.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).position !== 'absolute');
    const W = items.map(el => {
      if (btns.includes(el)) { const ic = icOf(el), lb = lbOf(el), bs = getComputedStyle(el); return (ic ? ic.offsetWidth : 20) + (parseFloat(bs.paddingLeft) || 0) + (parseFloat(bs.paddingRight) || 0) + (el === act && lb ? 6 + lb.scrollWidth : 0); }
      const m = getComputedStyle(el); return el.offsetWidth + (parseFloat(m.marginLeft) || 0) + (parseFloat(m.marginRight) || 0);
    });
    const total = W.reduce((a, b) => a + b, 0) + gap * Math.max(0, W.length - 1), inner = box.clientWidth - padL - padR;
    let x = padL + (cs.justifyContent === 'center' ? Math.max(0, (inner - total) / 2) : 0), left = 0, width = 0;
    items.forEach((el, i) => { if (el === act) { left = x; width = W[i]; } x += W[i] + gap; });
    bub.style.transition = instant ? 'none' : '';
    bub.style.opacity = '1'; bub.style.width = width + 'px'; bub.style.transform = `translateX(${left}px)`;
    if (instant) { void bub.offsetWidth; bub.style.transition = ''; }
  }
})();

/* VORTEX · Selector de emoji con nombre (listas de seguimiento y lo que lo necesite).
   CCTEmoji.ask({title, name, emo, ok}) → Promise<{name, emo} | null>. Trae TODOS los emoji del sistema (se generan de los
   bloques Unicode y se filtran con \p{Emoji_Presentation}), agrupados por categoría, más banderas. Sin dependencias. */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const CATS = [
    ['Sugeridos', null],
    ['Caras', [[0x1F600, 0x1F64F], [0x1F910, 0x1F92F], [0x1F970, 0x1F97A], [0x1FAE0, 0x1FAEF], [0x1F9D0, 0x1F9DF]]],
    ['Naturaleza', [[0x1F400, 0x1F43F], [0x1F980, 0x1F9AE], [0x1F330, 0x1F344], [0x1FAB0, 0x1FABF], [0x1F300, 0x1F32F]]],
    ['Comida', [[0x1F345, 0x1F37F], [0x1F950, 0x1F96F], [0x1F9C0, 0x1F9CB], [0x1FAD0, 0x1FADF]]],
    ['Lugares', [[0x1F680, 0x1F6FF], [0x1F3D4, 0x1F3F0]]],
    ['Objetos', [[0x1F380, 0x1F3D3], [0x1F3F1, 0x1F3FF], [0x1F440, 0x1F5FF], [0x1F930, 0x1F96F], [0x1F97B, 0x1F97F], [0x1F9AF, 0x1F9FF], [0x1FA70, 0x1FAAF], [0x1FAC0, 0x1FACF], [0x1FAF0, 0x1FAFF]]],
    ['Símbolos', [[0x2600, 0x27BF], [0x2B00, 0x2BFF], [0x1F190, 0x1F1FF]]],
    ['Banderas', 'flags']
  ];
  const SUG = ['🪙', '📈', '📉', '💹', '💰', '💵', '💶', '💴', '💷', '🏦', '📊', '🚀', '🔥', '⭐', '🌟', '💎', '🧠', '🎯', '⚡', '🐂', '🐻', '🐋', '🦈', '🌙', '☀️', '🌍', '🛢️', '🥇', '🏆', '🔔', '👀', '✅', '❤️', '🟢', '🔴', '🟡', '🔵', '🟣', '⚫', '⚪'];
  const FLAGS = 'MX US CA BR AR CO CL PE ES GB EU DE FR IT PT CH NL SE NO JP CN HK KR IN SG AU NZ TR AE SA ZA RU UA'.split(' ').map(c => String.fromCodePoint(...[...c].map(x => 0x1F1A5 + x.charCodeAt(0))));
  let cache = null;
  function build() {
    if (cache) return cache; const seen = new Set(SUG), out = [];
    let re; try { re = new RegExp('^\\p{Emoji_Presentation}$', 'u'); } catch (e) { re = null; }
    for (const [n, R] of CATS) {
      if (!R) { out.push([n, SUG]); continue; }
      if (R === 'flags') { out.push([n, FLAGS]); continue; }
      const list = []; for (const [a, b] of R) for (let c = a; c <= b; c++) { const ch = String.fromCodePoint(c); if (seen.has(ch) || (re ? !re.test(ch) : c < 0x1F300)) continue; seen.add(ch); list.push(ch); }
      out.push([n, list]);
    }
    return (cache = out);
  }
  function ask(o) {
    o = o || {};
    return new Promise(done => {
      const cats = build(); let emo = o.emo || '🪙', tab = 0;
      const back = document.createElement('div'); back.className = 'emo-back';
      back.innerHTML = `<div class="emo-dlg" role="dialog" aria-label="${esc(o.title || 'Elige un emoji')}"><div class="emo-head"><b>${esc(o.title || 'Elige un emoji')}</b><button type="button" class="emo-x" aria-label="Cerrar">✕</button></div>
        <div class="emo-top"><button type="button" class="emo-cur" aria-label="Emoji elegido">${esc(emo)}</button><input class="emo-name" maxlength="30" placeholder="${esc(o.placeholder || 'Nombre')}" value="${esc(o.name || '')}"></div>
        <div class="emo-tabs" role="tablist">${cats.map(([n, l], i) => `<button type="button" role="tab" data-et="${i}" title="${n}" aria-selected="${i === 0}">${l[0]}</button>`).join('')}</div>
        <div class="emo-grid" role="listbox"></div>
        <div class="emo-foot"><button type="button" class="emo-cancel">Cancelar</button><button type="button" class="emo-ok">${esc(o.ok || 'Guardar')}</button></div></div>`;
      document.body.appendChild(back);
      const q = s => back.querySelector(s), grid = q('.emo-grid'), inp = q('.emo-name');
      const paint = () => { const [n, l] = cats[tab]; grid.innerHTML = `<div class="emo-cat">${n}</div>` + l.map(ch => `<button type="button" class="emo-e${ch === emo ? ' on' : ''}" data-e="${ch}">${ch}</button>`).join(''); grid.scrollTop = 0; back.querySelectorAll('[data-et]').forEach(b => b.setAttribute('aria-selected', String(+b.dataset.et === tab))); };
      paint();
      const close = v => { document.removeEventListener('keydown', key, true); back.classList.add('ux-out'); setTimeout(() => back.remove(), 160); done(v); };
      const ok = () => { const name = inp.value.trim().slice(0, 30); if (o.needName !== false && !name) { inp.focus(); inp.classList.add('err'); return; } close({name, emo}); };
      const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } else if (e.key === 'Enter' && e.target === inp) { e.preventDefault(); ok(); } };
      document.addEventListener('keydown', key, true);
      back.addEventListener('click', e => {
        if (e.target === back || e.target.closest('.emo-x,.emo-cancel')) return close(null);
        if (e.target.closest('.emo-ok')) return ok();
        const t = e.target.closest('[data-et]'); if (t) { tab = +t.dataset.et; paint(); return; }
        const b = e.target.closest('[data-e]'); if (b) { emo = b.dataset.e; q('.emo-cur').textContent = emo; grid.querySelectorAll('.emo-e.on').forEach(x => x.classList.remove('on')); b.classList.add('on'); }
      });
      setTimeout(() => { if (matchMedia('(pointer:fine)').matches) inp.focus(); }, 60);
    });
  }
  window.CCTEmoji = {ask, all: () => build()};
})();

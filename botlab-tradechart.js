/* NOVA BOT LAB · gráfico de velas de cada bot con sus compras y ventas (solo PC).
   ▲ verde = compra (largo) · ▼ roja = venta (corto) · ● salida (verde si ganó, roja si perdió) · línea punteada = la operación completa.
   Arrastra para moverte, rueda para acercar/alejar, pasa el cursor sobre una operación para ver su detalle. */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const fmt = x => { const a = Math.abs(x); return x.toLocaleString('es', {maximumFractionDigits: a >= 1000 ? 0 : a >= 1 ? 2 : 6}); };
  const dt = t => new Date(t).toLocaleString('es', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'});
  function mount(host, o) {
    const C = o.candles || [], T = (o.trades || []).filter(t => t.entryT != null).slice().sort((a, b) => a.entryT - b.entryT), iv = o.iv || (C.length > 1 ? C[1].t - C[0].t : 36e5);
    host.innerHTML = `<div class="tc-bar"><button type="button" data-tc="prev">‹ Anterior</button><span class="tc-lab"></span><button type="button" data-tc="next">Siguiente ›</button><button type="button" data-tc="all">Ver todo</button><button type="button" data-tc="last">Última</button></div><div class="tc-wrap"><canvas class="tc-cv"></canvas><div class="tc-tip" hidden></div></div><div class="tc-leg"><span><i class="l"></i>Compra</span><span><i class="s"></i>Venta</span><span><i class="w"></i>Salida con ganancia</span><span><i class="x"></i>Salida con pérdida</span>${o.live && o.live.length ? '<span><i class="v"></i>En vivo</span>' : ''}</div>`;
    const cv = host.querySelector('.tc-cv'), tip = host.querySelector('.tc-tip'), lab = host.querySelector('.tc-lab'), ctx = cv.getContext('2d'), H = o.height || 320;
    if (!C.length) { lab.textContent = 'Sin velas'; return {focus() {}}; }
    const idxOf = t => { let lo = 0, hi = C.length - 1; if (t <= C[0].t) return 0; if (t >= C[hi].t) return hi; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (C[m].t <= t) lo = m; else hi = m; } return lo; };
    const all = T.map(t => Object.assign({live: false}, t)).concat((o.live || []).map(t => Object.assign({live: true}, t)));
    let vis = Math.min(140, C.length), end = C.length - 1, cur = -1, hover = null, W = 0, geo = null;
    const css = n => getComputedStyle(host).getPropertyValue(n).trim();
    function draw() {
      const dpr = window.devicePixelRatio || 1; W = cv.clientWidth || host.clientWidth || 600; cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      vis = Math.max(20, Math.min(C.length, vis)); end = Math.max(vis - 1, Math.min(C.length - 1, end)); const s = end - vis + 1, pr = 64, pb = 22, cw = (W - pr) / vis;
      let lo = Infinity, hi = -Infinity; for (let i = s; i <= end; i++) { lo = Math.min(lo, C[i].l); hi = Math.max(hi, C[i].h); } const pad = (hi - lo) * .08 || hi * .01; lo -= pad; hi += pad;
      const X = i => (i - s + .5) * cw, Y = p => 8 + (hi - p) / (hi - lo) * (H - pb - 16), line = css('--line') || '#1e2635', muted = css('--muted') || '#8796ab';
      ctx.font = '10px system-ui,sans-serif'; ctx.fillStyle = muted; ctx.strokeStyle = line; ctx.lineWidth = 1;
      for (let k = 0; k <= 4; k++) { const p = lo + (hi - lo) * k / 4, y = Y(p); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W - pr, y); ctx.stroke(); ctx.fillText(fmt(p), W - pr + 6, y + 3); }
      for (let k = 0; k < 4; k++) { const i = s + Math.round((vis - 1) * (k + .5) / 4); ctx.fillText(dt(C[i].t), Math.max(0, X(i) - 30), H - 6); }
      const bw = Math.max(1, cw * .62);
      for (let i = s; i <= end; i++) { const c = C[i], up = c.c >= c.o; ctx.strokeStyle = ctx.fillStyle = up ? '#20bf9f' : '#f06b79'; ctx.beginPath(); ctx.moveTo(X(i), Y(c.h)); ctx.lineTo(X(i), Y(c.l)); ctx.stroke(); const y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c)); ctx.fillRect(X(i) - bw / 2, y1, bw, Math.max(1, y2 - y1)); }
      const t0 = C[s].t, t1 = C[end].t + iv, hits = [];
      for (const t of all) {
        const xT = t.exitT || C[C.length - 1].t; if (xT < t0 || t.entryT > t1) continue; const ie = idxOf(t.entryT), ix = idxOf(xT), win = t.open ? null : t.net >= 0;
        const xe = X(ie), ye = Y(t.entry), xx = X(ix), yx = Y(t.exit != null ? t.exit : C[ix].c), col = t.live ? '#f0b90b' : t.side === 'long' ? '#20bf9f' : '#f06b79', sel = hover === t || all[cur] === t;
        ctx.setLineDash([4, 3]); ctx.strokeStyle = win == null ? muted : win ? 'rgba(32,191,159,.8)' : 'rgba(240,107,121,.8)'; ctx.lineWidth = sel ? 2.4 : 1.6; ctx.beginPath(); ctx.moveTo(xe, ye); ctx.lineTo(xx, yx); ctx.stroke(); ctx.setLineDash([]);
        const c = C[ie], long = t.side === 'long', ty = long ? Y(c.l) + 12 : Y(c.h) - 12, sz = sel ? 8 : 6.5; ctx.fillStyle = col; ctx.beginPath();
        if (long) { ctx.moveTo(xe, ty - sz); ctx.lineTo(xe - sz, ty + sz * .7); ctx.lineTo(xe + sz, ty + sz * .7); } else { ctx.moveTo(xe, ty + sz); ctx.lineTo(xe - sz, ty - sz * .7); ctx.lineTo(xe + sz, ty - sz * .7); } ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(xe, ye, 2.6, 0, 7); ctx.fill();
        if (!t.open) { ctx.fillStyle = win ? '#20bf9f' : '#f06b79'; ctx.strokeStyle = css('--bg') || '#05070c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(xx, yx, sel ? 5.5 : 4.2, 0, 7); ctx.fill(); ctx.stroke();
          if (sel || vis <= 90) { const p = ((t.exit / t.entry - 1) * 100 * (long ? 1 : -1)); ctx.fillStyle = win ? '#20bf9f' : '#f06b79'; ctx.font = 'bold 10px system-ui,sans-serif'; ctx.fillText((p >= 0 ? '+' : '') + p.toFixed(1) + '%', xx + 6, yx - 6); ctx.font = '10px system-ui,sans-serif'; } }
        hits.push({t, x1: Math.min(xe, xx) - 8, x2: Math.max(xe, xx) + 8, ys: [ye, yx, ty]});
      }
      geo = {hits}; const n = all.filter(t => t.entryT >= t0 && t.entryT <= t1).length; lab.textContent = `${n} de ${all.length} operaciones en pantalla`;
    }
    const center = i => { const t = all[i]; if (!t) return; cur = i; const a = idxOf(t.entryT), b = idxOf(t.exitT || C[C.length - 1].t), span = b - a + 1; if (vis < span + 20) vis = Math.min(C.length, span + 40); end = Math.min(C.length - 1, Math.round((a + b) / 2 + vis / 2)); hover = t; draw(); showTip(t, null); };
    function showTip(t, e) {
      if (!t) { tip.hidden = true; return; } const long = t.side === 'long', p = t.exit != null ? (t.exit / t.entry - 1) * 100 * (long ? 1 : -1) : null;
      tip.innerHTML = `<b class="${long ? 'pos' : 'neg'}">${long ? 'Compra' : 'Venta'}${t.live ? ' · en vivo' : ''}</b><small>${dt(t.entryT)} @ ${fmt(t.entry)}</small>${t.open ? '<small>Aún abierta</small>' : `<small>Salida ${dt(t.exitT)} @ ${fmt(t.exit)}</small><b class="${t.net >= 0 ? 'pos' : 'neg'}">${t.net >= 0 ? '+' : '−'}$${fmt(Math.abs(t.net))}${p != null ? ` (${p >= 0 ? '+' : ''}${p.toFixed(2)} %)` : ''}</b>`}${t.why ? `<small>${esc(t.why)}</small>` : ''}${t.reasonIn ? `<small class="tc-dim">${esc(String(t.reasonIn).slice(0, 140))}</small>` : ''}`;
      tip.hidden = false; const r = cv.getBoundingClientRect(), x = e ? e.clientX - r.left : W / 2; tip.style.left = Math.max(4, Math.min(W - tip.offsetWidth - 70, x + 14)) + 'px'; tip.style.top = '10px';
    }
    let drag = null;
    cv.addEventListener('pointerdown', e => { drag = {x: e.clientX, end}; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointerup', () => { drag = null; });
    cv.addEventListener('pointermove', e => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (drag) { const cw = (W - 64) / vis; end = drag.end - Math.round((e.clientX - drag.x) / cw); draw(); return; }
      const h = geo && geo.hits.filter(q => x >= q.x1 && x <= q.x2).sort((a, b) => Math.min(...a.ys.map(v => Math.abs(v - y))) - Math.min(...b.ys.map(v => Math.abs(v - y))))[0];
      const t = h && Math.min(...h.ys.map(v => Math.abs(v - y))) < 40 ? h.t : null; if (t !== hover) { hover = t; draw(); } showTip(t, e);
    });
    cv.addEventListener('pointerleave', () => { hover = null; drag = null; tip.hidden = true; draw(); });
    cv.addEventListener('wheel', e => { e.preventDefault(); const f = e.deltaY > 0 ? 1.15 : 1 / 1.15, r = cv.getBoundingClientRect(), frac = (e.clientX - r.left) / Math.max(1, W - 64), anchor = end - vis + 1 + frac * vis; vis = Math.round(vis * f); vis = Math.max(20, Math.min(C.length, vis)); end = Math.round(anchor + (1 - frac) * vis); draw(); }, {passive: false});
    host.querySelector('.tc-bar').addEventListener('click', e => { const b = e.target.closest('[data-tc]'); if (!b) return; const a = b.dataset.tc;
      if (a === 'all') { vis = C.length; end = C.length - 1; cur = -1; hover = null; tip.hidden = true; draw(); } else if (a === 'last') center(all.length - 1); else if (a === 'next') center(Math.min(all.length - 1, cur + 1)); else if (a === 'prev') center(Math.max(0, cur < 0 ? all.length - 1 : cur - 1)); });
    if (root.ResizeObserver) new ResizeObserver(() => { if (cv.clientWidth && Math.abs(cv.clientWidth - W) > 4) draw(); }).observe(host);
    draw(); if (all.length) center(all.length - 1); tip.hidden = true;
    return {focus: t => { const i = all.findIndex(x => x.entryT === t.entryT && !x.live); if (i >= 0) center(i); }, redraw: draw};
  }
  root.CCTTradeChart = {mount};
})(typeof window !== 'undefined' ? window : globalThis);

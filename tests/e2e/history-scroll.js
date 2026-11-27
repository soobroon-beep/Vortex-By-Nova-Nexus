// Historial completo: al desplazar el gráfico a la izquierda se cargan solas las velas más viejas, bloque tras bloque, hasta la primera vela
// de la moneda, sin que la vista salte. También: alejar hasta 2000 velas y el refresco silencioso no borra la historia (uso: node history-scroll.js)
const {chromium} = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..') + '/', out = process.env.SHOTS || '/tmp/';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'};
const H = 36e5, NOW = Math.floor(Date.now() / H) * H, N = 6500, LIST = NOW - (N - 1) * H; // la «moneda» tiene 6500 velas de 1 h de historia
const all = []; let p = 30000; for (let i = 0; i < N; i++) { const c = p * (1 + Math.sin(i / 37) * .004 + (i % 7 - 3) * .0008); all.push([LIST + i * H, p, Math.max(p, c) * 1.002, Math.min(p, c) * .998, c, 100 + (i % 13)]); p = c; }
const ok = (c, m) => { console.log((c ? 'OK    · ' : 'FALLA · ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const srv = http.createServer((q, r) => { const u = q.url.split('?')[0]; const f = root + (u === '/' ? 'index.html' : u.slice(1)); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', mime[path.extname(f)] || 'text/plain'); r.end(d); }); });
  await new Promise(r => srv.listen(0, r));
  const br = await chromium.launch({executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox']});
  const page = await br.newPage({viewport: {width: 1440, height: 860}}); await page.addInitScript(() => { try { localStorage.setItem('vortex_tour_done', '1'); } catch {} }); const errs = []; page.on('pageerror', e => errs.push(e.message));
  let olderCalls = 0;
  await page.route('**/*', route => { const u = route.request().url();
    if (/binance.*\/klines/.test(u)) { const q = new URL(u), lim = +(q.searchParams.get('limit') || 500), e = q.searchParams.get('endTime'); if (e) olderCalls++; const rows = all.filter(k => !e || k[0] <= +e).slice(-lim); return route.fulfill({json: rows, headers: {'access-control-allow-origin': '*'}}); }
    if (u.startsWith('http://localhost')) return route.continue(); return route.abort(); });
  await page.routeWebSocket(/binance/, () => {});
  await page.goto('http://localhost:' + srv.address().port + '/'); await page.waitForTimeout(3500);
  await page.evaluate(() => { const x = document.querySelector('.vw-ov [data-wl="close"]'); if (x) x.click(); }); await page.waitForTimeout(400);
    const st = () => page.evaluate(() => window.__cctHist.state());
  let s = await st(); ok(s.n === 1000, 'al abrir: 1000 velas (' + s.n + ')');
  const cv = await page.$eval('#priceCanvas', c => { const r = c.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; });
  const shot = n => page.screenshot({path: out + n, clip: {x: cv.x, y: cv.y, width: cv.w, height: cv.h}});
  // desplazar a la izquierda: la hora que está en el centro no debe cambiar cuando llegan las velas viejas
  const drag = async () => { await page.mouse.move(cv.x + cv.w * .2, cv.y + cv.h * .4); await page.mouse.down(); await page.mouse.move(cv.x + cv.w * .85, cv.y + cv.h * .4, {steps: 10}); await page.waitForTimeout(150); await page.mouse.up(); /* pausa antes de soltar: sin inercia, así cualquier movimiento sería un salto real */ await page.waitForTimeout(350); };
  const midT = async () => (await st()).mid;
  let jumps = 0;
  for (let k = 0; k < 80 && !(await st()).done; k++) { const before = (await st()).n; const m0 = await midT(); await page.waitForTimeout(250); const after = (await st()).n; if (after !== before) { const m1 = await midT(); if (Math.abs(m1 - m0) > 2 * H) jumps++; } await drag(); }
  await page.waitForTimeout(1200); s = await st();
  ok(s.n === N, `desplazando hacia atrás se carga TODA la historia (${s.n} de ${N} velas)`);
  ok(s.first === LIST, 'la primera vela es la del listado de la moneda');
  ok(s.done, 'al llegar al inicio ya no se piden más velas');
  ok(jumps === 0, 'la vista no salta cuando llegan las velas viejas');
  const calls = olderCalls; await drag(); await drag(); await page.waitForTimeout(600); ok(olderCalls === calls, 'con la historia completa no hay más consultas');
  await shot('hist_inicio.png');
  // sin huecos ni repetidas
  const gaps = (await st()).gaps; ok(gaps === 0, 'sin huecos ni velas repetidas');
  // alejar al máximo
  for (let i = 0; i < 25; i++) await page.click('#zoomOut').catch(() => {}); await page.waitForTimeout(900);
  s = await st(); ok(s.visible > 400, 'se puede alejar más que antes (' + Math.round(s.visible) + ' velas en pantalla)'); await shot('hist_lejos.png');
  // refresco silencioso (botón VORTEX / volver a la app): la historia vieja se conserva
  await page.evaluate(() => window.__cctHist.refresh()); await page.waitForTimeout(800); s = await st();
  ok(s.n === N && s.first === LIST, 'el refresco del gráfico no borra la historia cargada (' + s.n + ')');
  // cambiar de temporalidad empieza de nuevo
  ok(errs.length === 0, 'sin errores en la página' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await br.close(); srv.close();
})();

// Árbol de objetos, niveles del dibujo en la escala de precios, «Mis colores» en todas las paletas y planes fuera del inicio
// (uso: node obj-tree.js)
const {chromium} = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..') + '/', out = process.env.SHOTS || '/tmp/';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'};
let seed = 5; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
const t0 = Math.floor((Date.now() - 600 * 36e5) / 36e5) * 36e5; let p = 77000; const kl = [];
for (let i = 0; i < 600; i++) { const o = p, c = o + Math.sin(i / 30) * 70 + (rnd() - .5) * 250; kl.push([t0 + i * 36e5, o, Math.max(o, c) + rnd() * 60, Math.min(o, c) - rnd() * 60, c, 100 + rnd() * 40]); p = c; }
const T = i => t0 + i * 36e5, lastC = kl[599][4];
const draws = [
  {id: 'r1', type: 'rect', a: {t: T(540), p: lastC - 400}, b: {t: T(570), p: lastC + 300}, col: '#7c5cff'},
  {id: 't1', type: 'trend', a: {t: T(545), p: lastC - 300}, b: {t: T(592), p: lastC + 200}},
  {id: 'l1', type: 'long', a: {t: T(575), p: lastC}, b: {t: T(595), p: lastC + 350}},
  {id: 'f1', type: 'fib', a: {t: T(550), p: lastC - 500}, b: {t: T(585), p: lastC + 450}}
];
const ok = (c, m) => { console.log((c ? 'OK    · ' : 'FALLA · ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const srv = http.createServer((q, r) => { const u = q.url.split('?')[0]; const f = root + (u === '/' ? 'index.html' : u.slice(1)); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', mime[path.extname(f)] || 'text/plain'); r.end(d); }); });
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const br = await chromium.launch({executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox']});
  const ctx = await br.newContext({viewport: {width: 1440, height: 860}});
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept(d.defaultValue()));
  await page.addInitScript(d => { localStorage.setItem('cct_mobile_v1', JSON.stringify({interval: '1h', indicators: {rsi: true, ema20: true}, drawings: {BTCUSDT: d}, ui: {myColors: ['#ff00aa', '#12ab34']}})); }, draws);
  await page.route('**/*', route => { const u = route.request().url();
    if (u.includes('/klines')) return route.fulfill({json: kl, headers: {'access-control-allow-origin': '*'}});
    if (u.includes('api.binance.com')) return route.fulfill({json: [], headers: {'access-control-allow-origin': '*'}});
    if (u.startsWith('http://localhost')) return route.continue(); return route.abort(); });
  await page.goto(`http://localhost:${port}/`); await page.waitForTimeout(4000);
  ok(!(await page.$('.pl-ov:not([hidden])')), 'al abrir no salen los planes');
  const welcome = await page.$('.vw-ov'); if (welcome) { ok(!(await page.$('.vw-ov .vw-tiers, .vw-ov [data-wl="plans"]')), 'la bienvenida solo pide iniciar sesión (sin planes)'); await page.click('.vw-ov [data-wl="close"]'); await page.waitForTimeout(400); }
  ok(!(await page.$('#settingsView .pl-row')), 'Configuración ya no tiene la fila «Tu plan»');
  await page.screenshot({path: out + 'ot0.png'});
  // árbol de objetos
  ok(!!(await page.$('#toolRail [data-opt="tree"]')), 'botón del árbol de objetos en la barra izquierda');
  await page.click('#toolRail [data-opt="tree"]'); await page.waitForTimeout(500);
  const rows = await page.$$eval('#objTree [data-otd]', e => e.map(x => x.dataset.otd)); console.log('dibujos en el árbol:', rows.join(','));
  ok(rows.join(',') === 'f1,l1,t1,r1', 'el árbol lista los dibujos del frente al fondo');
  const inds = await page.$$eval('#objTree [data-oti]', e => e.map(x => x.querySelector('.ot-n').textContent)); console.log('indicadores:', inds.join(' | '));
  ok(inds.length >= 2, 'el árbol lista los indicadores');
  await page.screenshot({path: out + 'ot1_tree.png'});
  // arrastrar el rectángulo (fondo) hasta arriba (frente)
  const g = await (await page.$('#objTree [data-otd="r1"] .ot-grip')).boundingBox(), t = await (await page.$('#objTree [data-otd="f1"]')).boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await page.mouse.down(); await page.mouse.move(g.x + 5, t.y + 6, {steps: 8}); await page.mouse.move(g.x + 5, t.y + 2, {steps: 2}); await page.mouse.up(); await page.waitForTimeout(400);
  const order = (await page.evaluate(() => JSON.parse(localStorage.getItem('cct_mobile_v1')).drawings.BTCUSDT.map(d => d.id))).join(',');
  ok(order.endsWith('r1'), 'arrastrar en el árbol pasa el dibujo al frente (' + order + ')');
  await page.click('#objTree [data-otd="r1"] [data-ot="bk"]'); await page.waitForTimeout(300);
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('cct_mobile_v1')).drawings.BTCUSDT.find(d => d.id === 'r1').bk)) === true, '«detrás de las velas» se guarda');
  await page.click('#objTree [data-otd="t1"] [data-ot="eye"]'); await page.waitForTimeout(300);
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('cct_mobile_v1')).drawings.BTCUSDT.find(d => d.id === 't1').hide)) === true, 'el ojo del árbol oculta el dibujo');
  // seleccionar el Long desde el árbol → niveles en la escala
  await page.click('#objTree [data-otd="l1"] .ot-n'); await page.waitForTimeout(500);
  await page.screenshot({path: out + 'ot2_long_sel.png'});
  const box = await page.$eval('#priceCanvas', c => { const r = c.getBoundingClientRect(); return {x: r.right - 60, y: r.top, w: 60, h: r.height}; });
  await page.screenshot({path: out + 'ot2_axis.png', clip: {x: box.x - 260, y: box.y, width: 320, height: box.h}});
  await page.click('#objTree [data-otd="f1"] .ot-n'); await page.waitForTimeout(400);
  await page.screenshot({path: out + 'ot3_fib_axis.png', clip: {x: box.x - 260, y: box.y, width: 320, height: box.h}});
  // Mis colores en la paleta del Long
  await page.click('#objTree [data-otd="l1"] .ot-n'); await page.waitForTimeout(400);
  await page.click('#objTree [data-ot-close]'); await page.waitForTimeout(300);
  if (await page.$('#selBar [data-sb="col"]')) { await page.click('#selBar [data-sb="col"]'); await page.waitForTimeout(300); const mine = await page.$$eval('#selPop .pp-mine .pp-sw', e => e.length); ok(mine >= 4, 'Long/Short: «Mis colores» en las dos paletas (' + mine + ')'); await page.screenshot({path: out + 'ot4_long_colors.png'}); }
  else ok(false, 'barra del dibujo seleccionado');
  // «Mis colores» en la paleta de Aspecto del gráfico (velas) y en los ajustes de un indicador
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.mouse.click(box.x - 400, box.y + 300, {button: 'right'}); await page.waitForTimeout(300); await page.click('[data-a="style"]'); await page.waitForTimeout(700);
  const ci = await page.$('.cfg-dlg input[type=color]'); if (ci) { await ci.click(); await page.waitForTimeout(300); const n = await page.$$eval('.cp-pop .cp-mine .cp-sw', e => e.length); ok(n === 2, 'Aspecto del gráfico: «Mis colores» en la paleta (' + n + ')'); await page.screenshot({path: out + 'ot5_aspect_colors.png'}); } else ok(false, 'cuadro de color en Aspecto del gráfico');
  console.log('errores:', errs.slice(0, 5));
  await br.close(); srv.close();
})();

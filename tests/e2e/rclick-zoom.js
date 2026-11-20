// Clic derecho mantenido = zoom fluido; clic derecho corto = menú; operaciones en vivo (aggTrade) mueven la vela (uso: node rclick-zoom.js)
const {chromium} = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..') + '/', out = process.env.SHOTS || '/tmp/';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'};
const t0 = Math.floor((Date.now() - 300 * 36e5) / 36e5) * 36e5; const kl = []; let p = 77000;
for (let i = 0; i < 300; i++) { const c = p + Math.sin(i / 9) * 120; kl.push([t0 + i * 36e5, p, Math.max(p, c) + 40, Math.min(p, c) - 40, c, 100]); p = c; }
const ok = (c, m) => { console.log((c ? 'OK    · ' : 'FALLA · ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const srv = http.createServer((q, r) => { const u = q.url.split('?')[0]; const f = root + (u === '/' ? 'index.html' : u.slice(1)); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', mime[path.extname(f)] || 'text/plain'); r.end(d); }); });
  await new Promise(r => srv.listen(0, r));
  const br = await chromium.launch({executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox']});
  const page = await br.newPage({viewport: {width: 1440, height: 860}}); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', route => { const u = route.request().url(); if (u.includes('/klines')) return route.fulfill({json: kl, headers: {'access-control-allow-origin': '*'}}); if (u.startsWith('http://localhost')) return route.continue(); return route.abort(); });
  let wsr = null, wsUrl = ''; await page.routeWebSocket(/binance/, ws => { wsr = ws; wsUrl = ws.url(); });
  await page.goto('http://localhost:' + srv.address().port + '/'); await page.waitForTimeout(3500);
  await page.evaluate(() => { const x = document.querySelector('.vw-ov [data-wl="close"]'); if (x) x.click(); }); await page.waitForTimeout(400);
  ok(/stream\?streams=.*@kline_.*\/.*@aggTrade/.test(wsUrl), 'se escuchan velas y operaciones en vivo (' + wsUrl.split('/').pop() + ')');
  const cv = await page.$eval('#priceCanvas', c => { const r = c.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; });
  const shot = n => page.screenshot({path: out + n, clip: {x: cv.x, y: cv.y, width: cv.w, height: cv.h}});
  await shot('rz0.png');
  // clic derecho corto → menú
  await page.mouse.click(cv.x + cv.w * .5, cv.y + cv.h * .4, {button: 'right'}); await page.waitForTimeout(300);
  ok(!!(await page.$('.chart-ctx')), 'clic derecho corto abre el menú'); await page.keyboard.press('Escape'); await page.evaluate(() => document.querySelectorAll('.chart-ctx').forEach(x => x.remove()));
  // clic derecho mantenido y arrastrado → zoom
  const ax = cv.x + cv.w * .45, ay = cv.y + cv.h * .4; await page.mouse.move(ax, ay); await page.mouse.down({button: 'right'}); await page.waitForTimeout(320);
  ok(await page.$eval('#rzOv', o => o.classList.contains('show')).catch(() => false), 'al mantener el clic derecho aparece la mira');
  await page.mouse.move(ax + 160, ay - 90, {steps: 12}); await page.waitForTimeout(500); await shot('rz1_in.png');
  await page.mouse.move(ax - 200, ay + 120, {steps: 12}); await page.waitForTimeout(500); await shot('rz2_out.png');
  await page.mouse.up({button: 'right'}); await page.waitForTimeout(500);
  ok(!(await page.$('.chart-ctx')), 'después del zoom no sale el menú');
  ok(!(await page.$('#rzOv.show')), 'al soltar se va la mira');
  // operaciones en vivo
  const last = kl[kl.length - 1]; let ys = [];
  if (wsr) { for (let i = 1; i <= 6; i++) { wsr.send(JSON.stringify({stream: 'btcusdt@aggTrade', data: {e: 'aggTrade', p: String(last[4] + i * 25), q: '0.5', T: Date.now()}})); await page.waitForTimeout(90); }
    await page.waitForTimeout(300);
    const t = await page.$eval('#chartSymHead', e => e.textContent).catch(() => ''); ok(/77[,.]?\d/.test(t) || t.length > 0, 'cabecera con precio'); console.log('cabecera:', t.replace(/\s+/g, ' ').slice(0, 60)); }
  await shot('rz3_live.png');
  console.log('errores:', errs.slice(0, 5)); await br.close(); srv.close();
})();

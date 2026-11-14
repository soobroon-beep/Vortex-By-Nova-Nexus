// Nexus Pixel más listo: pregunta de decisión SIN dibujar, ojos (captura) + cerebro, zona con precios al instante y dibujos libres de la IA
const {chromium} = require('playwright-core'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..') + '/', out = process.env.SHOTS || '/tmp/'; fs.mkdirSync(out, {recursive: true});
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'};
let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
const t0 = Date.UTC(2026, 9, 1); let p = 64000; const kl = [];
for (let i = 0; i < 500; i++) { const o = p, c = o + 12 + Math.sin(i / 14) * 160 + (rnd() - .5) * 120; kl.push([t0 + i * 36e5, o, Math.max(o, c) + rnd() * 60, Math.min(o, c) - rnd() * 60, c, 100 + rnd() * 40]); p = c; }
const ticker = ['BTCUSDT', 'ETHUSDT'].map(s => ({symbol: s, lastPrice: String(p), priceChangePercent: '1.4'}));
const ok = (c, m) => { console.log((c ? 'OK    · ' : 'FALLA · ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const srv = http.createServer((q, r) => { const u = q.url.split('?')[0]; const f = root + (u === '/' ? 'index.html' : u.slice(1)); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', mime[path.extname(f)] || 'text/plain'); r.end(d); }); });
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const br = await chromium.launch({executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']}), page = await br.newPage({viewport: {width: 1500, height: 900}}), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const calls = [];
  await page.route('**/*', route => { const u = route.request().url(), cors = {'access-control-allow-origin': '*'};
    if (/vortex-push\.soobroon\.workers\.dev\/ai$/.test(u)) { const b = JSON.parse(route.request().postData() || '{}'); calls.push(b); const last = b.messages[b.messages.length - 1], txt = typeof last.content === 'string' ? last.content : last.content.map(x => x.text || '').join(' ');
      let content = '';
      if (b.task === 'see') content = 'Se ve una tendencia alcista con un canal ascendente; el precio está arriba de la nube.';
      else if (/cerrar mi long/i.test(txt)) content = '```json\n{"reply":"Yo mantendría el long, pero sube el stop al último mínimo (P1).\\nLa estructura sigue alcista y el RSI no está en sobrecompra.","actions":[{"do":"sr"}]}\n```';
      else if (/zona de demanda/i.test(txt)) content = '{"reply":"Te marco la zona de demanda del último mínimo.","actions":[{"do":"draw","shape":"rect","p":["P1",[-8,' + Math.round(p * .99) + ']],"label":"Zona de demanda","col":"#20bf9f"},{"do":"draw","shape":"text","p":[[0,' + Math.round(p * 1.01) + ']],"text":"Objetivo"}]}';
      else content = '{"reply":"Veo el gráfico alcista.","actions":[]}';
      return route.fulfill({json: {object: 'chat.completion', model: 'qwen3.6-27b · Groq', image: b.task === 'see', choices: [{message: {role: 'assistant', content}}]}, headers: cors}); }
    if (u.includes('/klines')) return route.fulfill({json: kl, headers: cors});
    if (u.includes('api.binance.com')) return route.fulfill({json: ticker, headers: cors});
    if (u.startsWith('http://localhost')) return route.continue(); return route.abort(); });
  await page.goto(`http://localhost:${port}/`); await page.waitForTimeout(3500);
  await page.evaluate(() => { const g = document.getElementById('plGate'); if (g) g.remove(); });
  const ready = await page.evaluate(() => !!(window.CCT_pixel && window.CCT_pixel.ready() && window.NexusPixelBrain && window.NexusPixel));
  ok(ready, 'el gráfico, el cerebro y Pixel cargan');
  const count = () => page.evaluate(() => window.CCT_pixel.list().filter(d => d.pix).length);
  const reply = () => page.$eval('.px-msg', e => e.textContent);
  const ask = async (q, waitMs = 9000) => { await page.evaluate(q => window.NexusPixel.ask(q), q); await page.waitForTimeout(waitMs); };
  await page.evaluate(() => window.NexusPixel.show(false)); await page.waitForTimeout(2500);

  // 1) decisión: responde con lectura, NO dibuja aunque la IA mande «sr»
  const n0 = await count();
  await ask('¿Debería cerrar mi long?');
  const pxCall = calls.find(c => c.task === 'pixel'), user = pxCall && pxCall.messages[pxCall.messages.length - 1].content;
  ok(!!pxCall && pxCall.json === true, 'Pixel usa su propia IA gratis (task pixel, modo JSON)');
  ok(user && /ESTRUCTURA/.test(user) && /PUNTOS DE GIRO/.test(user) && /NIVELES CLAVE/.test(user) && /SU POSICIÓN/.test(user) && /EMA 200/.test(user), 'la IA recibe estructura, giros, niveles, medias y la posición');
  ok(/mantendría el long/.test(await reply()), 'muestra la respuesta de la decisión');
  ok(await count() === n0, 'no llena el gráfico de soportes/resistencias si solo preguntaste');
  await page.screenshot({path: out + 'pixel-decision.png'});

  // 2) ojos: «¿cómo ves mi gráfico?» manda la captura al modelo con visión y su descripción al que razona
  calls.length = 0; await ask('¿Cómo ves mi gráfico?');
  const see = calls.find(c => c.task === 'see'), px2 = calls.find(c => c.task === 'pixel');
  ok(!!see && Array.isArray(see.messages[1].content) && see.messages[1].content.some(x => x.type === 'image_url'), 'manda la captura del gráfico a sus ojos (task see)');
  ok(!!px2 && /LO QUE SE VE EN LA CAPTURA/.test(px2.messages[px2.messages.length - 1].content), 'lo que ve llega al modelo que razona');

  // 3) zona con precios: al instante, sin IA
  calls.length = 0; const lo = Math.round(p * .97), hi = Math.round(p * .98);
  await ask(`dibuja un rectángulo entre ${lo} y ${hi}`, 6000);
  const rect = await page.evaluate(() => window.CCT_pixel.list().filter(d => d.pix && d.type === 'rect').pop());
  ok(!!rect && Math.round(Math.max(...rect.p)) === hi && Math.round(Math.min(...rect.p)) === lo, 'dibuja el rectángulo en los precios pedidos');
  ok(!calls.length, 'la zona con precios no espera a la IA');

  // 4) dibujo libre de la IA: rectángulo desde un punto de giro + texto
  await ask('marca con un rectángulo la zona de demanda', 9000);
  const mine = await page.evaluate(() => window.CCT_pixel.list().filter(d => d.pix));
  ok(mine.some(d => d.type === 'rect' && d.label === 'Zona de demanda' && d.col === '#20bf9f'), 'dibuja la zona que propone la IA (con P1)');
  ok(mine.some(d => d.type === 'text' && d.label === 'Objetivo'), 'escribe texto en el gráfico');
  await page.screenshot({path: out + 'pixel-draw.png'});

  // 5) dibujo sencillo: motor local sin IA
  calls.length = 0; await ask('dibújame el canal', 7000);
  ok((await page.evaluate(() => window.CCT_pixel.list().some(d => d.pix && d.type === 'channel'))) && !calls.length, '«dibújame el canal» sigue siendo instantáneo');
  ok(errs.length === 0, 'sin errores de JS ' + errs.join(' | '));
  await br.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });

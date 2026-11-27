// Nexus Pixel SIEMPRE responde: servidor caído → IA gratis sin clave; nunca habla de créditos/BingX si no preguntaste; nunca usa «Tu IA»
const {chromium} = require('playwright-core'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..') + '/', out = process.env.SHOTS || '/tmp/'; fs.mkdirSync(out, {recursive: true});
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'};
let seed = 3; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
const t0 = Date.UTC(2026, 9, 1); let p = 91000; const kl = [];
for (let i = 0; i < 500; i++) { const o = p, c = o + Math.sin(i / 12) * 220 + (rnd() - .5) * 160; kl.push([t0 + i * 36e5, o, Math.max(o, c) + rnd() * 80, Math.min(o, c) - rnd() * 80, c, 100 + rnd() * 40]); p = c; }
const ticker = ['BTCUSDT', 'ETHUSDT'].map(s => ({symbol: s, lastPrice: String(p), priceChangePercent: '1.4'}));
const ok = (c, m) => { console.log((c ? 'OK    · ' : 'FALLA · ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const srv = http.createServer((q, r) => { const u = q.url.split('?')[0]; const f = root + (u === '/' ? 'index.html' : u.slice(1)); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', mime[path.extname(f)] || 'text/plain'); r.end(d); }); });
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const br = await chromium.launch({executablePath: process.env.CHROME || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await br.newPage({viewport: {width: 1500, height: 900}}), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  let serverDown = true; const anon = [], paid = [], own = [], server = [];
  await page.addInitScript(() => { try { localStorage.setItem('vortex_tour_done', '1'); localStorage.setItem('cct_ownai_v1', JSON.stringify({on: true, provider: 'anthropic', key: 'sk-ant-sin-saldo', model: 'claude-sonnet-5-5'})); } catch {} }); // «Tu IA» configurada y SIN saldo
  await page.route('**/*', route => { const u = route.request().url(), cors = {'access-control-allow-origin': '*'}, h = route.request().headers();
    if (/api\.anthropic\.com/.test(u)) { own.push(u); return route.fulfill({status: 400, json: {error: {message: 'Your credit balance is too low to access the Anthropic API.'}}, headers: cors}); }
    if (/gen\.pollinations\.ai/.test(u)) { paid.push(u); return route.fulfill({status: 402, json: {error: 'insufficient credits'}, headers: cors}); }
    if (/vortex-push\.soobroon\.workers\.dev\/ai$/.test(u)) { server.push(JSON.parse(route.request().postData() || '{}'));
      if (serverDown) return route.fulfill({status: 502, json: {error: 'La IA gratis no respondió', kind: 'busy'}, headers: cors});
      return route.fulfill({json: {model: 'qwen3.8-27b · PixelGroq', choices: [{message: {role: 'assistant', content: '{"reply":"Sigue alcista sobre la nube; esperaría un retroceso para entrar.","actions":[]}'}}]}, headers: cors}); }
    if (/text\.pollinations\.ai\/openai/.test(u)) { const b = JSON.parse(route.request().postData() || '{}'); anon.push({b, auth: h.authorization || ''}); const last = b.messages[b.messages.length - 1], txt = typeof last.content === 'string' ? last.content : '';
      let content = '{"reply":"Veo tendencia alcista: el precio respeta la media y el último mínimo.","actions":[]}';
      if (/posiciones/i.test(txt)) content = '{"reply":"Tu API de BingX no está conectada y tu clave no tiene créditos. Ahorita no veo posiciones abiertas en este gráfico; el precio está arriba de la media.","actions":[]}';
      return route.fulfill({json: {choices: [{message: {role: 'assistant', content}}], model: 'gpt-oss-20b'}, headers: cors}); }
    if (u.includes('/klines')) return route.fulfill({json: kl, headers: cors});
    if (u.includes('api.binance.com')) return route.fulfill({json: ticker, headers: cors});
    if (u.startsWith('http://localhost')) return route.continue(); return route.abort(); });
  await page.goto(`http://localhost:${port}/`); await page.waitForTimeout(3500);
  await page.evaluate(() => { const g = document.getElementById('plGate'); if (g) g.remove(); const c = document.querySelector('[data-wl="close"]'); if (c) c.click(); }); await page.waitForTimeout(600);
  ok(await page.evaluate(() => !!(window.CCT_pixel && window.CCT_pixel.ready() && window.NexusPixel)), 'el gráfico y Pixel cargan');
  const reply = () => page.$eval('.px-msg', e => e.textContent);
  const ask = async (q, waitMs = 9000) => { await page.evaluate(q => window.NexusPixel.ask(q), q); await page.waitForTimeout(waitMs); };
  await page.evaluate(() => window.NexusPixel.show(false)); await page.waitForTimeout(2500);

  // 1) tu servidor de IA caído: Pixel igual responde con la IA gratis SIN clave
  await ask('¿Long o short ahorita?');
  ok(server.length >= 1, 'primero intenta tu servidor VORTEX (task pixel)');
  ok(anon.length >= 1 && anon.every(a => !a.auth), 'si tu servidor no responde, usa la IA gratis sin clave (sin mandar claves)');
  ok(/tendencia alcista/.test(await reply()), 'y contesta lo que le pediste: ' + (await reply()).slice(0, 80));
  await page.screenshot({path: out + 'pixel-ventana.png'});
  const box = await page.$('.px-bub'); if (box) await box.screenshot({path: out + 'pixel-ventana-zoom.png'});

  // 2) la IA repite avisos de créditos / BingX que no pediste: Pixel los quita y deja lo útil
  anon.length = 0; await ask('¿Cómo van mis posiciones en este gráfico?');
  const r2 = await reply();
  ok(!/cr[eé]dito|bingx|api|conect/i.test(r2), 'no te habla de créditos, API ni BingX si no preguntaste: «' + r2.slice(0, 90) + '»');
  ok(/posiciones abiertas|media/.test(r2), 'sí contesta tu pregunta');
  ok(!/necesito tu exchange conectado/i.test(r2), 'ya no te manda a conectar el exchange por preguntar por tus posiciones');

  // 3) con tu servidor de nuevo arriba, usa su IA exclusiva
  serverDown = false; anon.length = 0; await ask('¿Qué ves en la estructura?');
  ok(/nube/.test(await reply()) && !anon.length, 'con tu servidor arriba responde su IA exclusiva');

  ok(!own.length, 'Pixel nunca usa «Tu IA» (aunque esté configurada y sin saldo)');
  ok(!paid.length, 'Pixel nunca usa rutas de pago de Pollinations');
  ok(errs.length === 0, 'sin errores de JS ' + errs.join(' | '));
  await br.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });

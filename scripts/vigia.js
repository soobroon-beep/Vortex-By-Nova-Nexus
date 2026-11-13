#!/usr/bin/env node
/* VIGÍA DE VORTEX · revisión diaria automática (GitHub Actions).
   1) Abre VORTEX como un usuario (PC y celular) con un navegador real: errores de código, botones que no responden,
      partes que se traban (cuadros perdidos y tareas largas), cosas que se salen de la pantalla, carga de velas y animación de apertura.
   2) Revisa lo que corre por detrás: tareas automáticas que fallaron, señales del Screener a tiempo y las pruebas del código.
   3) Una IA gratis (Groq) explica cada hallazgo nuevo y propone el cambio. Sin clave, se usa un texto automático.
   4) Lo guarda en TU cuenta (users/<uid del creador>/data/vigia): ahí lo apruebas o descartas desde VORTEX › Configuración › Vigía.
      Nada se cambia solo. Lo que descartas no se vuelve a proponer; lo que deja de aparecer se marca «resuelto».
   5) Si pegaste en el panel el webhook de un canal PRIVADO de Discord, te manda el resumen ahí.
   6) Neural Brain lo recibe con el conector de siempre (scripts/brain-sync.js) para ir aprendiendo.
   El repo es público: el registro solo imprime conteos, nunca el detalle. */
'use strict';
const crypto = require('crypto');
const { execSync } = require('child_process');

const URL0 = process.env.VIGIA_URL || 'https://vortex-nexus.pages.dev/';
const OWNER = 'a8d56a29aa7c5208d7748a84e75e4b14c713c521136174e8a652b7a76ac19b28'; // sha-256 del correo del creador (el mismo de plans.js)
const HOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;
const MAX_ITEMS = 150, MISS_TO_RESOLVE = 2;
const SKIP = /borrar|elimin|desconect|cerrar sesi|salir|reset|restablec|comprar|vender|cerrar posici|importar|exportar|limpiar|quitar|papelera|cancelar orden|iniciar sesi|google|instalar|descargar|discord\.gg|unirme/i;

/* ───────── utilidades puras (tests/vigia.test.js) ───────── */
const sha = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10);
const norm = s => String(s || '').toLowerCase().replace(/https?:\/\/\S+/g, 'URL').replace(/\b[0-9a-f]{8,}\b/g, 'ID').replace(/\d+(\.\d+)?/g, 'N').replace(/\s+/g, ' ').trim().slice(0, 180);
const keyOf = f => sha(f.area + '|' + f.kind + '|' + norm(f.sig || f.title));
const clip = (s, n) => { s = String(s == null ? '' : s).trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const SEV = { alta: 3, media: 2, baja: 1 };

/* Junta lo que ya había con lo encontrado hoy. Respeta tus decisiones: lo descartado no vuelve; lo resuelto que reaparece vuelve a «nuevo». */
function merge(prev, found, now) {
  const out = new Map((Array.isArray(prev) ? prev : []).filter(x => x && x.id).map(x => [x.id, Object.assign({}, x)]));
  const fresh = [];
  for (const f of found) {
    const id = keyOf(f), o = out.get(id);
    if (o) {
      o.last = now; o.seen = (o.seen || 1) + 1; o.miss = 0; o.ev = clip(f.ev || o.ev, 600); o.where = f.where || o.where;
      if (o.status === 'resuelto') { o.status = 'nuevo'; o.back = now; fresh.push(o); }
    } else {
      const it = { id, area: f.area, kind: f.kind, sev: f.sev || 'media', title: clip(f.title, 140), detail: clip(f.detail || '', 600), fix: clip(f.fix || '', 700), ev: clip(f.ev || '', 600), where: f.where || '', first: now, last: now, seen: 1, miss: 0, status: 'nuevo' };
      out.set(id, it); fresh.push(it);
    }
  }
  const seenNow = new Set(found.map(keyOf));
  for (const o of out.values()) if (!seenNow.has(o.id)) {
    o.miss = (o.miss || 0) + 1;
    if (o.miss >= MISS_TO_RESOLVE && (o.status === 'nuevo' || o.status === 'aprobado')) { o.status = 'resuelto'; o.solved = now; }
  }
  const rank = o => (o.status === 'nuevo' ? 4 : o.status === 'aprobado' ? 3 : o.status === 'resuelto' ? 1 : 0) * 10 + (SEV[o.sev] || 1);
  const items = [...out.values()].sort((a, b) => rank(b) - rank(a) || b.last - a.last).slice(0, MAX_ITEMS);
  return { items, fresh: fresh.filter(f => items.includes(f)) };
}

/* Lo que aprendió de tus decisiones: qué áreas apruebas y cuáles descartas (se le pasa a la IA) */
function learnOf(items) {
  const by = {};
  for (const o of items || []) { if (o.status !== 'aprobado' && o.status !== 'descartado' && o.status !== 'resuelto') continue; const a = by[o.area] = by[o.area] || { ok: 0, no: 0 }; if (o.status === 'descartado') a.no++; else a.ok++; }
  const dismissed = (items || []).filter(o => o.status === 'descartado').slice(0, 25).map(o => o.title);
  return { by, dismissed };
}

function discordPayload(doc, fresh, runUrl) {
  const open = (doc.items || []).filter(o => o.status === 'nuevo'), alta = open.filter(o => o.sev === 'alta').length;
  const lines = fresh.slice(0, 8).map(o => `**${o.sev === 'alta' ? 'ALTA' : o.sev === 'media' ? 'Media' : 'Baja'}** · ${o.area} — ${o.title}`);
  return { username: 'Vigía de VORTEX', allowed_mentions: { parse: [] }, embeds: [{
    title: `Revisión diaria · ${new Date(doc.at).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long' })}`,
    description: clip([doc.summary, '', fresh.length ? `**${fresh.length} nuevo(s) hoy:**\n` + lines.join('\n') : 'Nada nuevo hoy.', '', `Pendientes por decidir: **${open.length}**${alta ? ` (${alta} de prioridad alta)` : ''}. Apruébalos o descártalos en VORTEX › Configuración › Vigía.`].join('\n'), 3900),
    color: alta ? 0xf06b79 : fresh.length ? 0xf0b90b : 0x20bf9f, url: runUrl || undefined, footer: { text: 'Nada se cambia sin tu aprobación' }, timestamp: new Date(doc.at).toISOString() }] };
}

/* ───────── 1) La app en un navegador real ───────── */
async function probe(browser, dev) {
  const found = [], add = f => found.push(Object.assign({ where: dev.name }, f));
  const ctx = await browser.newContext({ viewport: dev.vp, isMobile: dev.mobile, hasTouch: dev.mobile, deviceScaleFactor: dev.mobile ? 2 : 1, locale: 'es-MX', timezoneId: 'America/Mexico_City' });
  const page = await ctx.newPage(); let where = 'al cargar';
  const origin = new URL(URL0).origin;
  page.on('pageerror', e => add({ area: 'Código', kind: 'js', sev: 'alta', title: 'Error de código ' + where, sig: e.message, ev: `${e.message}\n${String(e.stack || '').split('\n').slice(1, 3).join('\n')}` }));
  page.on('console', m => { if (m.type() !== 'error') return; const t = m.text(); if (/Failed to load resource|favicon|ERR_BLOCKED|net::ERR_|google|gstatic|firebase.*offline|Cross-Origin-Opener/i.test(t)) return; add({ area: 'Código', kind: 'console', sev: 'media', title: 'Error en la consola ' + where, sig: t, ev: t }); });
  page.on('response', r => { const u = r.url(); if (r.status() >= 500 || (r.status() >= 400 && u.startsWith(origin) && !/favicon/.test(u))) add({ area: 'Servidor', kind: 'http', sev: r.status() >= 500 ? 'alta' : 'media', title: `Respuesta ${r.status()} de ${new URL(u).host}`, sig: r.status() + ' ' + new URL(u).host + new URL(u).pathname.replace(/\d+/g, 'N'), ev: `${r.status()} ${u.split('?')[0]}` }); });
  await page.addInitScript(() => { try { sessionStorage.setItem('cct_welcome', '1'); } catch (e) {} window.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch (e) {} });

  const t0 = Date.now();
  await page.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const splashOk = await page.waitForFunction(() => !document.getElementById('vxSplash'), null, { timeout: 12000 }).then(() => true, () => false);
  if (!splashOk) add({ area: 'Animaciones', kind: 'splash', sev: 'alta', title: 'La animación de apertura no se quita sola', ev: 'Seguía en pantalla a los 12 s' });
  await page.keyboard.press('Escape').catch(() => {});
  for (const sel of ['.vw-ov [data-wl=close]']) { const b = await page.$(sel).catch(() => null); if (b && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); break; } }

  // velas del gráfico
  if (dev.mobile) { const g = await page.$('[data-view="chartView"]'); if (g) await g.click().catch(() => {}); }
  const candles = await page.waitForFunction(() => { const f = document.querySelector('.chart-feedback'); const busy = f && f.offsetParent && /cargando|no hay datos/i.test(f.textContent); return !busy && document.querySelector('#priceCanvas'); }, null, { timeout: 25000 }).then(() => true, () => false);
  const loadMs = Date.now() - t0;
  if (!candles) { const msg = await page.$eval('.chart-feedback', e => e.textContent).catch(() => ''); add({ area: 'Gráfico', kind: 'candles', sev: 'alta', title: 'El gráfico no carga las velas', ev: clip(msg || 'Sin velas a los 25 s', 300) }); }
  else if (loadMs > 9000) add({ area: 'Rendimiento', kind: 'slow', sev: 'media', title: 'La app tarda en estar lista', sig: 'carga lenta', ev: `Lista en ${(loadMs / 1000).toFixed(1)} s` });

  // fluidez: mover y hacer zoom al gráfico midiendo cuadros
  const box = await page.$eval('#priceCanvas', e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }).catch(() => null);
  if (box && box.w > 50) {
    await page.evaluate(() => { window.__fr = []; let l = performance.now(); const f = t => { window.__fr.push(t - l); l = t; if (window.__fr.length < 400) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await page.mouse.move(box.x, box.y);
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, i % 2 ? 240 : -240); await page.waitForTimeout(60); }
    await page.mouse.down(); for (let i = 0; i < 20; i++) await page.mouse.move(box.x - i * 12, box.y, { steps: 2 }); await page.mouse.up();
    await page.waitForTimeout(400);
    const fr = await page.evaluate(() => window.__fr || []); const bad = fr.filter(x => x > 50).length, worst = Math.round(Math.max(0, ...fr));
    if (fr.length > 30 && (bad / fr.length > 0.12 || worst > 400)) add({ area: 'Rendimiento', kind: 'jank', sev: worst > 700 ? 'alta' : 'media', title: 'El gráfico se traba al moverlo o hacer zoom', sig: 'jank grafico', ev: `${bad} de ${fr.length} cuadros tardaron más de 50 ms; el peor ${worst} ms` });
  }

  // botones: se aprieta cada uno y se ve si pasa algo (sin tocar nada que borre, opere o cierre sesión)
  const sig = () => page.evaluate(() => { const c = document.querySelector('#priceCanvas'); let h = 0; try { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4001) h = (h * 31 + d[i]) | 0; } catch (e) {} const t = document.body.innerHTML; let k = 0; for (let i = 0; i < t.length; i += 3) k = (k * 33 + t.charCodeAt(i)) | 0; return k + ':' + location.hash + ':' + h; });
  const btns = await page.$$eval('button, [role="button"]', (els, skip) => {
    const re = new RegExp(skip, 'i'), out = [], seen = new Set();
    for (const e of els) { const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue; const st = getComputedStyle(e); if (st.visibility === 'hidden' || st.pointerEvents === 'none' || e.disabled) continue;
      const name = (e.getAttribute('aria-label') || e.getAttribute('title') || e.dataset.tip || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50); if (!name || re.test(name) || re.test(e.className) || e.closest('#vxSplash')) continue;
      const id = e.id ? '#' + e.id : null; const k = id || name; if (seen.has(k)) continue; seen.add(k); out.push({ name, x: r.left + r.width / 2, y: r.top + r.height / 2, id }); }
    return out.slice(0, 70);
  }, SKIP.source).catch(() => []);
  let tried = 0, dead = [];
  for (const b of btns) {
    where = `al tocar «${b.name}» (${dev.name})`; const s0 = await sig(); const lt0 = await page.evaluate(() => window.__lt.length);
    const el = b.id ? await page.$(b.id) : null; const target = el && await el.isVisible().catch(() => false) ? el : null;
    try { if (target) await target.click({ timeout: 2500 }); else await page.mouse.click(b.x, b.y); } catch (e) { continue; }
    tried++; await page.waitForTimeout(650);
    const s1 = await sig(); if (s0 === s1) dead.push(b.name);
    const lts = await page.evaluate(n => window.__lt.slice(n), lt0); const big = Math.max(0, ...lts);
    if (big > 600) add({ area: 'Rendimiento', kind: 'freeze', sev: big > 1500 ? 'alta' : 'media', title: `Se congela un momento al abrir «${b.name}»`, sig: 'freeze ' + b.name, ev: `Tarea de ${big} ms (${dev.name})` });
    for (let i = 0; i < 2; i++) await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(150);
  }
  // segunda oportunidad: cada botón «sin reacción» se prueba solo, con la app recién abierta (evita falsas alarmas por un menú que quedó abierto)
  const really = [];
  for (const n of dead.slice(0, 15)) {
    where = `al tocar «${n}» (${dev.name})`;
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await page.waitForFunction(() => !document.getElementById('vxSplash'), null, { timeout: 12000 }).catch(() => {}); await page.waitForTimeout(2500);
    const b = btns.find(x => x.name === n), el = b && b.id ? await page.$(b.id) : null, s0 = await sig();
    try { if (el && await el.isVisible()) await el.click({ timeout: 2500 }); else if (b) await page.mouse.click(b.x, b.y); else continue; } catch (e) { continue; }
    await page.waitForTimeout(1200); if (s0 === await sig()) really.push(n);
  }
  dead = really;
  where = 'después de usar los botones';
  for (const n of dead) add({ area: 'Botones', kind: 'dead', sev: 'baja', title: `El botón «${n}» no hace nada visible`, sig: 'dead ' + n, ev: `Se tocó en ${dev.name} y la pantalla no cambió en 0.65 s (puede ser algo que solo cambia por dentro).` });

  // cosas que se salen de la pantalla (sobre todo en el celular)
  const over = await page.evaluate(() => { if (document.documentElement.scrollWidth <= innerWidth + 2) return []; const o = []; for (const e of document.querySelectorAll('body *')) { const r = e.getBoundingClientRect(); if (r.width && r.right > innerWidth + 4 && getComputedStyle(e).position !== 'fixed' && !e.closest('[hidden]')) o.push((e.id ? '#' + e.id : e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : e.tagName.toLowerCase())); if (o.length > 6) break; } return o; });
  if (over.length) add({ area: 'Diseño', kind: 'overflow', sev: dev.mobile ? 'media' : 'baja', title: `Algo se sale de la pantalla en ${dev.name}`, sig: 'overflow ' + over.slice(0, 2).join(','), ev: 'Elementos: ' + over.join(', ') });
  const shot = `vigia-${dev.name}.png`; await page.screenshot({ path: shot }).catch(() => {});
  await ctx.close();
  return { found, tried, loadMs };
}

/* ───────── 2) Lo que corre por detrás ───────── */
async function background() {
  const found = [], repo = process.env.GITHUB_REPOSITORY, tok = process.env.GITHUB_TOKEN;
  if (repo && tok) try {
    const since = new Date(Date.now() - 26 * 3600e3).toISOString().slice(0, 19);
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/runs?status=failure&per_page=100&created=${encodeURIComponent(">" + since)}`, { headers: { authorization: 'Bearer ' + tok, accept: 'application/vnd.github+json' } });
    const j = await r.json(), by = {};
    for (const run of j.workflow_runs || []) { if (/vigía|vigia/i.test(run.name)) continue; (by[run.name] = by[run.name] || []).push(run.html_url); }
    for (const [n, urls] of Object.entries(by)) found.push({ area: 'Tareas automáticas', kind: 'workflow', sev: urls.length > 3 ? 'alta' : 'media', title: `La tarea «${n}» falló`, sig: 'wf ' + n, ev: `${urls.length} vez/veces en 24 h · ${urls[0]}`, where: 'servidor' });
  } catch (e) { console.log('No se pudo leer GitHub Actions'); }
  try {
    const st = await (await fetch('https://vortex-push.soobroon.workers.dev/scr/state')).json(), last = st.last || {};
    for (const [tf, lim] of [['1h', 2.5], ['4h', 6]]) { const at = last[tf] && last[tf].at; if (!at || Date.now() - at > lim * 3600e3) found.push({ area: 'Screener', kind: 'scr', sev: 'alta', title: `Las señales ${tf} del Screener no han salido a tiempo`, sig: 'scr ' + tf, ev: at ? `Última hace ${((Date.now() - at) / 3600e3).toFixed(1)} h` : 'Sin registro', where: 'servidor' }); }
  } catch (e) { found.push({ area: 'Servidor', kind: 'push', sev: 'alta', title: 'El servidor de avisos no responde', sig: 'push down', ev: String(e.message || e).slice(0, 200), where: 'servidor' }); }
  try { execSync('node --test tests/*.test.js', { stdio: 'pipe', encoding: 'utf8', timeout: 8 * 60e3, shell: '/bin/bash' }); }
  catch (e) { const out = String(e.stdout || '') + String(e.stderr || ''); const bad = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]).filter(x => !/^tests\//.test(x)).slice(0, 8);
    for (const t of bad) found.push({ area: 'Pruebas', kind: 'test', sev: 'media', title: `Falla la prueba «${clip(t, 90)}»`, sig: 'test ' + t, ev: 'node --test', where: 'código' }); }
  return found;
}

/* ───────── 3) IA gratis: explica y propone el cambio ───────── */
async function ai(fresh, learn) {
  const key = process.env.GROQ_KEY; if (!key || !fresh.length) return null;
  const sys = 'Eres el vigía de calidad de VORTEX, una terminal de trading web (JS vanilla, PWA, gráfico en canvas). Respondes SOLO JSON válido, en español de México, claro y sin tecnicismos innecesarios. Para cada hallazgo: title (máx 90 caracteres, qué falla), detail (por qué pasa o qué ve el usuario, 1-2 frases), fix (el cambio concreto que propones, 1-3 frases), sev (alta|media|baja). Si un hallazgo parece falsa alarma (por ejemplo un botón que solo cambia algo interno), dilo en detail y baja la sev. El dueño suele descartar cosas parecidas a: ' + JSON.stringify(learn.dismissed) + '. Sus decisiones por área: ' + JSON.stringify(learn.by) + '. También da "summary": 2-3 frases del estado general de la app hoy.';
  const user = JSON.stringify({ hallazgos: fresh.map(f => ({ id: f.id, area: f.area, tipo: f.kind, sev: f.sev, titulo: f.title, evidencia: f.ev, donde: f.where })) });
  for (const model of ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile']) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify({ model, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: user + '\nDevuelve {"summary": "...", "items": [{"id","title","detail","fix","sev"}]}' }] }) });
      if (!r.ok) continue; const j = await r.json(); const o = JSON.parse(j.choices[0].message.content); if (o && Array.isArray(o.items)) return o;
    } catch (e) {}
  }
  return null;
}

/* ───────── principal ───────── */
async function main() {
  const now = Date.now(), runUrl = process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '';
  const { chromium } = require('playwright');
  const browser = await chromium.launch(process.env.VIGIA_CHROME ? { executablePath: process.env.VIGIA_CHROME, args: ['--no-sandbox'] } : {});
  const found = [], stats = {};
  for (const dev of [{ name: 'PC', vp: { width: 1366, height: 800 }, mobile: false }, { name: 'celular', vp: { width: 390, height: 844 }, mobile: true }]) {
    try { const r = await probe(browser, dev); found.push(...r.found); stats[dev.name] = { botones: r.tried, cargaMs: r.loadMs }; }
    catch (e) { found.push({ area: 'Vigía', kind: 'probe', sev: 'media', title: `No se pudo revisar la app en ${dev.name}`, sig: 'probe ' + dev.name, ev: clip(e.message, 300), where: dev.name }); }
  }
  await browser.close();
  found.push(...await background());
  const uniq = [...new Map(found.map(f => [keyOf(f), f])).values()];
  console.log(`Hallazgos de hoy: ${uniq.length} · botones probados: ${Object.values(stats).map(s => s.botones).join(' / ')}`);

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT; if (!raw) { console.log('Falta FIREBASE_SERVICE_ACCOUNT: no se guarda nada.'); return; }
  const admin = require('firebase-admin'); admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) }); const db = admin.firestore();
  let uid = null, page;
  do { const r = await admin.auth().listUsers(1000, page); page = r.pageToken; for (const u of r.users) if (u.email && crypto.createHash('sha256').update(u.email.trim().toLowerCase()).digest('hex') === OWNER) uid = u.uid; } while (page && !uid);
  if (!uid) { console.log('No se encontró la cuenta del creador.'); return; }
  // salud del servidor: que el Motor siga vivo y que las velas de VORTEX estén al día
  try {
    const mo = (await db.doc('server/motor').get()).data() || {};
    if (!mo.beat || now - mo.beat > 40 * 6e4) uniq.push({ area: 'Tareas automáticas', kind: 'motor', sev: 'alta', title: 'El Motor del servidor está detenido (alertas, bots y Screener)', sig: 'motor parado', ev: mo.beat ? `Último latido hace ${Math.round((now - mo.beat) / 6e4)} min` : 'Sin latido registrado', where: 'servidor', fix: 'Lanzar a mano «Motor del servidor» en GitHub Actions (Run workflow).' });
    const cd = (await db.doc('candles/BTCUSDT_1h').get()).data();
    if (!cd || now - (cd.at || 0) > 3 * 3600e3) uniq.push({ area: 'Datos de mercado', kind: 'candles', sev: 'media', title: 'Las velas de VORTEX no se están guardando', sig: 'velas propias', ev: cd ? `Última actualización hace ${((now - cd.at) / 3600e3).toFixed(1)} h (fuente ${cd.src})` : 'Aún no hay velas guardadas', where: 'servidor' });
    else if (cd.src && cd.src !== 'binance') uniq.push({ area: 'Datos de mercado', kind: 'source', sev: 'baja', title: `Binance no respondió al servidor: las velas salen de ${cd.src}`, sig: 'fuente respaldo', ev: `Fuente actual: ${cd.src}`, where: 'servidor' });
  } catch (e) { console.log('No se pudo revisar la salud del servidor'); }
  const ref = db.collection('users').doc(uid).collection('data').doc('vigia'), prev = (await ref.get()).data() || {};
  const { items, fresh } = merge(prev.items, uniq, now), learn = learnOf(items);
  const res = await ai(fresh.filter(f => f.seen === 1), learn);
  if (res) for (const a of res.items) { const it = items.find(x => x.id === a.id); if (!it) continue; if (a.title) it.title = clip(a.title, 140); if (a.detail) it.detail = clip(a.detail, 600); if (a.fix) it.fix = clip(a.fix, 700); if (SEV[a.sev]) it.sev = a.sev; it.ai = 1; }
  for (const it of fresh) if (!it.fix) it.fix = 'Revisar con Claude y aplicar el arreglo en la versión de pruebas (dev).';
  const open = items.filter(o => o.status === 'nuevo');
  const summary = clip((res && res.summary) || (open.length ? `Hay ${open.length} punto(s) por revisar; ${open.filter(o => o.sev === 'alta').length} de prioridad alta.` : 'Todo en orden: no se encontraron fallas nuevas.'), 600);
  const doc = { at: now, items, summary, stats, runUrl, fresh: fresh.length, learn: learn.by, v: 1 };
  if (typeof prev.hook === 'string') doc.hook = prev.hook;
  // en una transacción: si aprobaste o descartaste algo mientras corría la revisión (o cambiaste el webhook), se respeta lo tuyo
  await db.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data() || {}, before = new Map((prev.items || []).map(x => [x.id, x.decided || 0]));
    for (const c of cur.items || []) { const it = items.find(x => x.id === c.id); if (it && c.decided && c.decided > (before.get(c.id) || 0)) { it.status = c.status; it.decided = c.decided; } }
    if (typeof cur.hook === 'string') doc.hook = cur.hook;
    tx.set(ref, doc);
  });
  console.log(`Guardado: ${items.length} en la lista · ${fresh.length} nuevos o de regreso · IA: ${res ? 'sí' : 'no'}`);
  if (HOOK.test(doc.hook || '')) {
    try { const r = await fetch(doc.hook + '?wait=false', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(discordPayload(doc, fresh, runUrl)) }); console.log('Discord: ' + r.status); } catch (e) { console.log('Discord: sin conexión'); }
  } else console.log('Discord: sin webhook privado configurado en el panel.');
}

if (require.main === module) main().catch(e => { console.log('ERROR: ' + (e.message || e)); process.exit(1); });
module.exports = { keyOf, norm, merge, learnOf, discordPayload, SKIP, probe };

// Descarga los feeds en español desde el servidor (sin CORS) y deja news-data.json junto a la app. Lo ejecuta .github/workflows/news.yml cada ~10 min.
const fs = require('fs'), N = require('../news.js');
(async () => {
  const now = Date.now(), lists = [], status = {};
  await Promise.all(N.SOURCES.map(async src => {
    try {
      const r = await fetch(src.url, {headers: {'user-agent': 'Mozilla/5.0 (compatible; CCTNews/1.0)', accept: 'application/rss+xml, application/xml, text/xml, */*'}, signal: AbortSignal.timeout(20000)});
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const items = N.buildItems(N.parseFeed(await r.text()), src, now); lists.push(items); status[src.id] = items.length;
    } catch (e) { status[src.id] = 'error: ' + e.message; }
  }));
  const items = N.mergeItems(lists, now).map(({id, title, link, t, desc, src, cat, cats, impact}) => ({id, title, link, t, desc, src, cat, cats, impact}));
  // Calendario económico de la semana (ForexFactory vía faireconomy). Se pide como mucho cada ~50 min para no abusar.
  let cal = null; try { cal = JSON.parse(fs.readFileSync(__dirname + '/../calendar-data.json', 'utf8')); } catch {}
  // Refresco rápido: si un evento importante salió hace menos de 3 h y aún no tiene dato, se vuelve a pedir la semana en curso cada ~8 min (solo ella, para no abusar); el resto de eventos se conserva.
  const waiting = !!cal && (cal.events || []).some(e => /high|medium/i.test(e.impact) && e.t <= now && now - e.t < 3 * 36e5 && !e.actual);
  const fast = !!cal && waiting && now - (cal.at || 0) > 8 * 60e3 && now - (cal.at || 0) <= 50 * 60e3;
  if (!cal || now - (cal.at || 0) > 50 * 60e3 || fast) {
    const evs = [];
    for (const f of fast ? ['thisweek'] : ['thisweek', 'nextweek']) {
      try { const r = await fetch(`https://nfs.faireconomy.media/ff_calendar_${f}.json`, {headers: {'user-agent': 'Mozilla/5.0 (compatible; CCTNews/1.0)'}, signal: AbortSignal.timeout(20000)});
        if (r.ok) { const j = await r.json(); if (Array.isArray(j)) for (const e of j) { const t = Date.parse(e.date); if (Number.isFinite(t) && e.title) evs.push({t, title: String(e.title), country: String(e.country || ''), impact: String(e.impact || ''), forecast: e.forecast || '', previous: e.previous || '', actual: e.actual || ''}); } status['cal_' + f] = 'ok'; } else status['cal_' + f] = 'HTTP ' + r.status;
      } catch (e) { status['cal_' + f] = 'error: ' + e.message; }
    }
    // Semanas siguientes: ForexFactory solo publica «nextweek» casi al final de la semana (antes daba 404 y el widget decía «sin eventos»).
    // Se completan las próximas 3 semanas con el calendario público de TradingView (sin duplicar lo que ya trae ForexFactory).
    if (!fast) try {
      const CUR = {US: 'USD', EU: 'EUR', GB: 'GBP', JP: 'JPY', CN: 'CNY', CA: 'CAD', AU: 'AUD', CH: 'CHF', NZ: 'NZD', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR'};
      const from = new Date(now - 2 * 864e5).toISOString(), to = new Date(now + 22 * 864e5).toISOString();
      const r = await fetch(`https://economic-calendar.tradingview.com/events?from=${from}&to=${to}&countries=US,EU,GB,JP,CN,CA,AU,CH,NZ`, {headers: {'user-agent': 'Mozilla/5.0 (compatible; CCTNews/1.0)', origin: 'https://www.tradingview.com', referer: 'https://www.tradingview.com/'}, signal: AbortSignal.timeout(20000)});
      if (r.ok) { const j = await r.json(), list = Array.isArray(j) ? j : (j && j.result) || []; const lastFF = evs.length ? Math.max(...evs.map(e => e.t)) : now; let n = 0;
        for (const e of list) { const t = Date.parse(e.date); if (!Number.isFinite(t) || t <= lastFF || !e.title) continue; const cur = e.currency || CUR[e.country] || ''; if (!cur) continue;
          evs.push({t, title: String(e.title), country: cur, impact: e.importance >= 1 ? 'High' : e.importance === 0 ? 'Medium' : 'Low', forecast: e.forecast == null ? '' : String(e.forecast) + (e.unit || ''), previous: e.previous == null ? '' : String(e.previous) + (e.unit || ''), actual: e.actual == null ? '' : String(e.actual) + (e.unit || ''), src: 'tv'}); n++; }
        status.cal_tv = 'ok ' + n; } else status.cal_tv = 'HTTP ' + r.status;
    } catch (e) { status.cal_tv = 'error: ' + e.message; }
    if (!fast && cal && evs.length) { const lastNew = Math.max(...evs.map(e => e.t)); for (const e of cal.events || []) if (e.t > lastNew) evs.push(e); } // nunca se pierden eventos futuros que ya se tenían
    if (fast && evs.length) { const k = e => e.t + '|' + e.country + '|' + e.title, m = new Map((cal.events || []).map(e => [k(e), e])); for (const e of evs) m.set(k(e), e); evs.length = 0; evs.push(...m.values()); }
    if (evs.length) { evs.sort((a, b) => a.t - b.t); fs.writeFileSync(__dirname + '/../calendar-data.json', JSON.stringify({at: now, events: evs})); }
  }
  console.log(status, items.length);
  if (!items.length) { console.error('Sin noticias: no se sobrescribe news-data.json'); process.exit(0); }
  fs.writeFileSync(__dirname + '/../news-data.json', JSON.stringify({at: now, status, items}));
})();

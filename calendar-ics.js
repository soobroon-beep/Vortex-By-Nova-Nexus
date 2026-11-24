/* VORTEX · Calendario económico en formato iCalendar (.ics) para Google Calendar, Apple Calendar u Outlook.
   Lo usa la app (botón «Descargar .ics») y scripts/fetch-news.js (escribe calendar.ics junto a la app para poder SUSCRIBIRSE y que se actualice solo). */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.CCTIcs = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const RANK = {low: 0, medium: 1, high: 2, holiday: -1};
  const p2 = n => String(n).padStart(2, '0');
  const stamp = t => { const d = new Date(t); return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`; };
  const txt = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = line => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
  const uidOf = e => (String(e.t) + '-' + String(e.country || '') + '-' + String(e.title || '')).replace(/[^\w-]+/g, '').slice(0, 90) + '@vortex';
  const FLAG = {USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CNY: '🇨🇳', CAD: '🇨🇦', AUD: '🇦🇺', CHF: '🇨🇭', NZD: '🇳🇿'};
  /* events: [{t, title, country, impact, forecast, previous, actual}] · o.minImpact: 'Low' | 'Medium' | 'High' */
  function build(events, o) {
    o = o || {}; const min = RANK[String(o.minImpact || 'Medium').toLowerCase()] ?? 1, now = o.now || Date.now();
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VORTEX by Nova Nexus//Calendario economico//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:VORTEX · Calendario económico', 'X-WR-CALDESC:Eventos económicos de impacto medio y alto (VORTEX by Nova Nexus)', 'REFRESH-INTERVAL;VALUE=DURATION:PT3H', 'X-PUBLISHED-TTL:PT3H'];
    for (const e of (events || [])) {
      if (!e || !Number.isFinite(+e.t) || !e.title) continue; const r = RANK[String(e.impact || '').toLowerCase()]; if (r == null || r < min) continue;
      const imp = r >= 2 ? 'ALTO' : r === 1 ? 'MEDIO' : 'BAJO', star = r >= 2 ? '🔴 ' : '🟠 ';
      const desc = [`Impacto: ${imp}`, e.forecast ? `Previsión: ${e.forecast}` : '', e.previous ? `Anterior: ${e.previous}` : '', e.actual ? `Resultado: ${e.actual}` : '', 'VORTEX by Nova Nexus'].filter(Boolean).join('\n');
      L.push('BEGIN:VEVENT', 'UID:' + uidOf(e), 'DTSTAMP:' + stamp(now), 'DTSTART:' + stamp(+e.t), 'DTEND:' + stamp(+e.t + 15 * 6e4),
        fold('SUMMARY:' + txt(`${star}${FLAG[e.country] ? FLAG[e.country] + ' ' : ''}${e.country ? e.country + ' · ' : ''}${e.title}`)), fold('DESCRIPTION:' + txt(desc)), 'TRANSP:TRANSPARENT');
      if (r >= 2) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + txt(e.title), 'TRIGGER:-PT15M', 'END:VALARM'); // aviso 15 min antes de los de impacto alto
      L.push('END:VEVENT');
    }
    L.push('END:VCALENDAR'); return L.join('\r\n') + '\r\n';
  }
  return {build};
});

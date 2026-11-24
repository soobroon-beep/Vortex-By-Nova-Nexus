'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), ICS = require('../calendar-ics.js');
test('calendar.ics: solo impacto medio y alto, con aviso 15 min antes en los altos', () => {
  const t = Date.UTC(2026, 10, 25, 13, 30), txt = ICS.build([{t, title: 'CPI m/m', country: 'USD', impact: 'High', forecast: '0.3%'}, {t, title: 'Algo', country: 'JPY', impact: 'Low'}, {t, title: 'PMI', country: 'EUR', impact: 'Medium'}], {minImpact: 'Medium', now: t});
  assert.equal((txt.match(/BEGIN:VEVENT/g) || []).length, 2); assert.match(txt, /DTSTART:20261125T133000Z/); assert.equal((txt.match(/BEGIN:VALARM/g) || []).length, 1); assert.match(txt, /^BEGIN:VCALENDAR\r\n/);
});
test('servidor: Telegram y webhook se validan (token, chat y solo https públicos)', async () => {
  const {sanCx} = await import('../worker/push-alerts.mjs');
  assert.deepEqual(sanCx({tg: {token: 'x', chat: '1'}, wh: {url: 'http://a.com'}}), {});
  assert.deepEqual(Object.keys(sanCx({tg: {token: '123456:' + 'A'.repeat(35), chat: '-100123'}, wh: {url: 'https://hooks.n8n.cloud/x'}})), ['tg', 'wh']);
  assert.deepEqual(sanCx({wh: {url: 'https://127.0.0.1/x'}}), {});
});

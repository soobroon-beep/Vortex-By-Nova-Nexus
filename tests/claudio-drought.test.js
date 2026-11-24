'use strict';
// Anti-sequía: si un agente lleva mucho sin operar, el umbral baja a su percentil 85 (nunca < 62 %) y vuelve al normal cuando opera.
const test = require('node:test'), assert = require('node:assert/strict'), K = require('../claudio-core.js');
const H = 36e5, T0 = Date.UTC(2026, 10, 1);
const sess = () => { const s = K.newSession({startT: T0, symbols: ['BTCUSDT']}); for (let i = 0; i < 200; i++) s.preds.push({t: T0 + i * H, sym: 'BTCUSDT', dir: 'long', conf: 0.55 + (i % 20) / 100, z: 0, o: null}); return s; };
test('sin sequía el umbral es el normal (80 %)', () => { const s = sess(); assert.equal(K.droughtConf(s, 0.8, T0 + 10 * H).minConf, 0.8); });
test('tras 24 h sin operar baja al percentil 85 de sus confianzas, con piso de 60 %', () => {
  const d = K.droughtConf(sess(), 0.8, T0 + 30 * H); assert.equal(d.on, true); assert.ok(d.minConf >= K.DROUGHT_FLOOR && d.minConf < 0.8, String(d.minConf));
});
test('si acaba de abrir una posición, vuelve al umbral normal', () => { const s = sess(); s.positions.BTCUSDT = {entryT: T0 + 29 * H}; assert.equal(K.droughtConf(s, 0.8, T0 + 30 * H).on, false); });
test('Claudia (5 min) entra en anti-sequía antes (6 h)', () => assert.equal(K.claudia.DROUGHT_H, 6));
test('ampliar el universo no reinicia la sesión ni su historial', () => {
  const s = K.newSession({startT: T0, symbols: ['BTCUSDT']}); s.ledger.push({n: 1}); const s2 = K.prepare({enabled: true}, s, T0 + H, ['BTCUSDT', 'XRPUSDT']);
  assert.equal(s2, s); assert.deepEqual(s2.symbols, ['BTCUSDT', 'XRPUSDT']); assert.equal(s2.ledger.length, 1);
});

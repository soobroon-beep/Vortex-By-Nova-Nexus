'use strict';
const test = require('node:test'), assert = require('node:assert');
require('../pixel-draw.js');
const B = require('../pixel-brain.js');

// Velas sintéticas: tendencia alcista con ondas (máximos y mínimos crecientes)
function mk(n = 260, t0 = 1.7e12, iv = 3600e3) {
  const cs = []; let p = 100;
  for (let i = 0; i < n; i++) { const w = Math.sin(i / 6) * 2.2, base = 100 + i * .12 + w, o = p, c = base, h = Math.max(o, c) + .4, l = Math.min(o, c) - .4; cs.push({t: t0 + i * iv, o, h, l, c, v: 1000 + (i % 7) * 50}); p = c; }
  return cs;
}

test('foto técnica: medias, RSI, MACD, estructura y niveles', () => {
  const cs = mk(), s = B.snapshot(cs);
  assert.ok(s && s.emas.length === 3);
  assert.ok(s.rsi.v > 0 && s.rsi.v < 100);
  assert.match(s.st.bias, /ALCISTA|compresi|expansi|lateral/);
  assert.ok(s.st.swings.length >= 4 && s.st.swings[0].id === 'P1');
  for (let i = 1; i < s.st.swings.length; i++) assert.notEqual(s.st.swings[i].kind, s.st.swings[i - 1].kind, 'los giros se alternan');
  assert.ok(s.st.swings.every(p => cs[p.i] && p.bars === cs.length - 1 - p.i));
  assert.equal(B.snapshot(cs.slice(0, 10)), null);
});

test('entiende si preguntas o pides dibujar', () => {
  const a = B.intent('¿Debería cerrar mi long?'); assert.ok(a.ask && a.decide && !a.draw);
  const b = B.intent('dibújame el canal'); assert.ok(b.draw && !b.decide);
  assert.ok(B.intent('¿Cómo ves mi gráfico?').see);
  assert.ok(B.intent('¿entro en short o en long?').decide);
  assert.ok(B.needsAI('dibuja un rectángulo en la zona de demanda'));
  assert.ok(!B.needsAI('dibújame el canal'));
});

test('zona/rectángulo con precios sin esperar a la IA', () => {
  const z = B.parseZone('dibuja un rectángulo entre 64.000 y 65.500', {lo: 60000, hi: 70000, visN: 80});
  assert.equal(z[0].shape, 'rect'); assert.deepEqual(z[0].p, [[79, 65500], [-8, 64000]]);
  assert.equal(B.parseZone('marca la zona de demanda de 3.2 a 3.45', {lo: 3, hi: 4, visN: 50})[0].col, '#20bf9f');
  assert.equal(B.parseZone('dibuja un rectángulo', {lo: 1, hi: 2}), null);
  assert.equal(B.parseZone('¿qué es una zona?', {lo: 1, hi: 2}), null);
});

test('dibujos libres de la IA → dibujos reales', () => {
  const cs = mk(), s = B.snapshot(cs), n = cs.length, iv = 3600e3;
  const r = B.toDrawings({do: 'draw', shape: 'rect', p: [[40, 128], [-10, 126]], label: 'Zona'}, cs, s.st).drawings[0];
  assert.equal(r.type, 'rect'); assert.equal(r.a.t, cs[n - 41].t); assert.equal(r.b.t, cs[n - 1].t + 10 * iv); assert.equal(r.label, 'Zona');
  const p = B.toDrawings({do: 'draw', shape: 'trend', p: ['P3', 'P1']}, cs, s.st).drawings[0];
  assert.equal(p.a.p, s.st.swings[2].p); assert.equal(p.b.p, s.st.swings[0].p);
  const L = B.toDrawings({do: 'draw', shape: 'long', entry: 130, sl: 128, tp: 135}, cs, s.st).drawings[0];
  assert.equal(L.type, 'long'); assert.equal(L.sp, 128); assert.equal(L.b.p, 135);
  assert.equal(B.toDrawings({do: 'draw', shape: 'long', entry: 130, sl: 132, tp: 135}, cs).drawings.length, 0, 'stop del lado equivocado');
  assert.equal(B.toDrawings({do: 'draw', shape: 'text', p: [[0, 130]], text: 'Aquí'}, cs).drawings[0].text, 'Aquí');
  assert.equal(B.toDrawings({do: 'draw', shape: 'hline', p: [129.5]}, cs).drawings[0].type, 'horizontal');
  assert.equal(B.toDrawings({do: 'draw', shape: 'vline', p: [5]}, cs).drawings[0].a.t, cs[n - 6].t);
  assert.equal(B.toDrawings({do: 'draw', shape: 'rect', p: [[10, 999999], [0, 1]]}, cs).drawings.length, 0, 'precios fuera del gráfico');
  assert.equal(B.toDrawings({do: 'draw', shape: 'abcd', p: [[40, 120], [30, 125], [20, 122], [10, 128]]}, cs).drawings[0].pts.length, 4);
  assert.equal(B.toDrawings({do: 'draw', shape: 'nave'}, cs).drawings.length, 0);
});

test('lee la respuesta de la IA aunque venga sucia', () => {
  assert.deepEqual(B.parseReply('```json\n{"reply":"Hola","actions":[{"do":"sr"},]}\n```').actions, [{do: 'sr'}]);
  assert.equal(B.parseReply('<think>x</think>Texto previo {"reply":"Mantén el long","actions":[]} fin').reply, 'Mantén el long');
  assert.equal(B.parseReply('solo texto sin json').reply, 'solo texto sin json');
  assert.equal(B.parseReply('{"reply":"con } llave","actions":[]}').reply, 'con } llave');
});

test('posición real, demo y dibujo Long/Short + resumen para la IA', () => {
  const cs = mk(), s = B.snapshot(cs);
  const pos = B.positions({real: [{symbol: 'BTC/USDT:USDT', side: 'long', entryPrice: 120, markPrice: 126, leverage: 5, contracts: 1, unrealizedPnl: 6}], demo: [{sym: 'ETHUSDT', side: 1, qty: 1, entry: 1, lev: 2}], draws: [{type: 'short', p: [130, 120], stop: 133}]}, 'BTCUSDT', 126);
  assert.equal(pos.length, 2); assert.equal(pos[0].side, 'LONG'); assert.equal(Math.round(pos[0].move), 5); assert.equal(pos[1].side, 'SHORT');
  const txt = B.brief(s, {sym: 'BTCUSDT', tf: '1h', pos, ind: {nova: {top: 125, bot: 124, base: 124.5, osc: 30, sig: 20, adx: 28, last: {side: 'buy', score: 4, ago: 2, price: 124, sl: 122, tp1: 127, tp2: 129, tp3: 131}}, lecturas: {'RSI 14': {ultimo: 61.2, pendiente: 'sube', zona: 'neutral (30-70)'}}, pine: [{name: 'Mi script', plots: [{title: 'Señal', value: 1}], table: ['Tendencia: Alcista']}]}});
  for (const k of ['ESTRUCTURA', 'PUNTOS DE GIRO', 'NIVELES CLAVE', 'Nova Nexus', 'modo COMPRA', 'última señal LONG', 'RSI 14 61.2', 'Mi script', 'REAL (exchange): LONG', 'SIN stop loss']) assert.ok(txt.includes(k), 'falta: ' + k);
  assert.ok(txt.length < 9000, 'compacto para la IA: ' + txt.length);
  assert.match(B.posText([], 1), /No tiene posición/);
});

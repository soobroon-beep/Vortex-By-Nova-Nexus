// VORTEX · Radar de Nexus Pixel EN EL SERVIDOR (Cloudflare Worker «vortex-push»): trabaja aunque la app y el celular estén cerrados.
// Después de cada ronda del Screener (1h y 4h), toma las monedas con señal recién salida, aplica los filtros de radar.js,
// pide la opinión de la IA (Pollinations, la misma de Nexus Pixel) y si es una GRAN oportunidad avisa por push a los celulares
// que encendieron «Grandes oportunidades» y a Discord. Sigue cada oportunidad hasta su objetivo o su stop y aprende (pesos y exigencia).
// Cada paso pesado va en su propia llamada interna para no pasar los 10 ms de CPU del plan gratis.
import RADM from '../radar.js';
const RD = globalThis.CCTRadar || RADM; // en el Worker queda en self.CCTRadar; en Node llega como módulo
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api1.binance.com'];
const AI_URL = 'https://gen.pollinations.ai/v1/chat/completions';
const MAX_CANDS = 5, MAX_FOLLOW = 10, MAX_LOG = 120;

export async function klines(sym, tf, limit = 500) {
  let last;
  for (const h of HOSTS) { try { const r = await fetch(`${h}/api/v3/klines?symbol=${sym}&interval=${tf}&limit=${limit}`); if (!r.ok) { last = new Error('HTTP ' + r.status); continue; } const raw = await r.json(), now = Date.now(); return raw.filter(k => k[6] < now).map(k => ({t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5]})); } catch (e) { last = e; } }
  // Binance bloquea a Cloudflare: el mismo par en MEXC y después en Gate (velas cerradas, mismo formato {t,o,h,l,c,v})
  const p = /^([A-Z0-9]+?)(USDT|USDC)$/.exec(sym), MX = {'15m': '15m', '1h': '60m', '4h': '4h', '1d': '1d'}, GT = {'15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d'}, now = Date.now();
  if (MX[tf]) { try { const r = await fetch(`https://api.mexc.com/api/v3/klines?symbol=${sym}&interval=${MX[tf]}&limit=${Math.min(500, limit)}`); if (r.ok) { const d = await r.json(); if (Array.isArray(d) && d.length) return d.filter(k => +k[6] < now).map(k => ({t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5]})); } } catch (e) { last = e; } }
  if (p && GT[tf]) { try { const r = await fetch(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${p[1]}_${p[2]}&interval=${GT[tf]}&limit=${Math.min(1000, limit)}`); if (r.ok) { const d = await r.json(), ms = {'15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5}[tf]; if (Array.isArray(d) && d.length) return d.map(x => ({t: x[0] * 1000, c: +x[2], h: +x[3], l: +x[4], o: +x[5], v: +x[6]})).filter(c => c.t + ms <= now); } } catch (e) { last = e; } }
  throw last || new Error('sin velas');
}
export async function loadState(env) { const s = (await env.KV.get('radar', 'json')) || {}; return Object.assign(JSON.parse(JSON.stringify(RD.DEF)), s, {w: Object.assign({}, RD.DEF.w, s.w || {}), log: Array.isArray(s.log) ? s.log : [], seen: s.seen || {}}); }
async function saveState(env, st) { st.log = st.log.slice(0, MAX_LOG); for (const k of Object.keys(st.seen)) if (Date.now() - st.seen[k] > 3 * 864e5) delete st.seen[k]; await env.KV.put('radar', JSON.stringify(st)); }
export function pickCands(rows) { // del Screener: señal recién salida (cerró hace 0-1 velas), sin rango y con buen puntaje
  return (rows || []).filter(r => r && r.sg && !r.sg.range && r.sg.ago <= 1 && r.sg.score >= 3).sort((a, b) => (a.sg.ago - b.sg.ago) || (b.sg.score - a.sg.score)).slice(0, MAX_CANDS);
}
async function ask(env, P, key) {
  const r = await fetch(AI_URL, {method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer ' + key}, body: JSON.stringify({model: 'openai', temperature: .2, max_tokens: 300, messages: [{role: 'system', content: P.sys}, {role: 'user', content: P.user}]})});
  if (!r.ok) throw new Error('IA HTTP ' + r.status); const j = await r.json(); return RD.parseAI(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content);
}
const base = s => String(s).replace(/(USDT|USDC|FDUSD)$/, '');
const fmt = v => { v = +v; if (!Number.isFinite(v)) return '—'; const a = Math.abs(v); return v.toLocaleString('en-US', {maximumFractionDigits: a >= 1000 ? 1 : a >= 1 ? 3 : 6}); };
export function opText(op) {
  const long = op.side === 'buy', title = `${op.v === 'fuerte' ? 'Gran oportunidad' : 'Buena oportunidad'} · ${base(op.symbol)} ${long ? 'LONG' : 'SHORT'} ${op.tf}`;
  return {title, body: `Entrada ~${fmt(op.entry)} · stop ${fmt(op.stop)} · objetivo ${fmt(op.target)} · confianza IA ${op.ai}%. ${op.why}`};
}

/* Rutas internas (llamadas con self(), con la ficha x-vx-int) */
export async function radarInternal(path, b, env, h) {
  if (path === '/radar/run') { // orquesta: seguimiento + candidatas (cada una en su propia llamada)
    const st = await loadState(env), now = Date.now(), tf = b.tf === '4h' ? '4h' : '1h';
    const open = st.log.filter(o => !o.res).slice(0, MAX_FOLLOW);
    if (open.length) { const res = await h.pool(open, 4, o => h.self('/radar/follow', {op: o})); res.forEach((r, i) => { if (r && r.res) Object.assign(open[i], r.res); }); for (const o of open) if (o.res && !o.learned) { RD.learn(st, o); o.learned = 1; } }
    const anyOn = await h.anyRadar(); if (!anyOn) { st.at = now; st.note = 'nadie tiene el radar encendido'; await saveState(env, st); return {ok: true, skip: 'apagado'}; }
    const cands = pickCands(b.rows).filter(r => !st.seen[`${r.symbol}|${tf}|${r.sg.t || r.sg.price}`]);
    let btcUp = null; try { const r = await h.self('/radar/btc', {}); btcUp = r.up; } catch {}
    const found = [];
    const res = await h.pool(cands, 3, c => h.self('/radar/one', {symbol: c.symbol, tf, sg: c.sg, chg: c.chg || 0, btcUp, st: {min: st.min, w: st.w, log: st.log.slice(0, 40)}}));
    res.forEach((r, i) => { const c = cands[i]; st.seen[`${c.symbol}|${tf}|${c.sg.t || c.sg.price}`] = now; if (r && r.op) found.push(r.op); });
    for (const op of found) { st.log.unshift(op); const t = opText(op); try { await h.self('/radar/push', {msg: {title: t.title, body: t.body, tag: 'radar-' + op.id, url: h.appUrl + '#alertas'}}); } catch {} try { await h.discord(t, op); } catch {} }
    st.at = now; st.note = `${tf}: ${cands.length} candidata${cands.length === 1 ? '' : 's'} · ${found.length} gran${found.length === 1 ? '' : 'des'} oportunidad${found.length === 1 ? '' : 'es'}`; await saveState(env, st);
    return {ok: true, cands: cands.length, found: found.length};
  }
  if (path === '/radar/btc') { const cs = await klines('BTCUSDT', '4h', 300), c = cs.map(k => k.c), a = RD.ema(c, 50), z = RD.ema(c, 200); return {up: a[a.length - 1] > z[z.length - 1] ? true : a[a.length - 1] < z[z.length - 1] ? false : null}; }
  if (path === '/radar/one') { // una moneda: velas + temporalidad mayor → filtros → IA
    const tf = b.tf === '4h' ? '4h' : '1h', cs = await klines(b.symbol, tf, 400); let htf = null; try { htf = await klines(b.symbol, RD.HTF[tf], 300); } catch {}
    const sig = {side: b.sg.side, score: b.sg.score, ago: b.sg.ago, div: b.sg.div}, ev = RD.evaluate(cs, sig, htf, b.btcUp), score = RD.scoreOf(ev.f, b.st.w || RD.DEF.w);
    if (score < (b.st.min || 70)) return {op: null, score};
    const c = {symbol: b.symbol, tf, sig, side: sig.side, ev, score, chg: b.chg, btcUp: b.btcUp, closes: cs.slice(-24).map(x => x.c), t: cs[cs.length - 1].t};
    let ai = null; try { ai = await ask(env, RD.buildPrompt(c, {min: b.st.min, w: b.st.w, log: b.st.log || []}), await h.aiKey()); } catch {}
    if (!ai || !(ai.v === 'fuerte' || ai.v === 'buena') || ai.conf < 70) return {op: null, score, ai: ai && ai.v};
    const long = sig.side === 'buy', okS = v => v > 0 && (long ? v < ev.entry : v > ev.entry), okT = v => v > 0 && (long ? v > ev.entry : v < ev.entry);
    return {op: {id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), symbol: b.symbol, tf, side: sig.side, t: c.t, at: Date.now(), entry: ev.entry, stop: okS(ai.stop) ? ai.stop : ev.stop, target: okT(ai.target) ? ai.target : ev.target, score, ai: ai.conf, v: ai.v, why: ai.why, f: ev.f, srv: 1}};
  }
  if (path === '/radar/follow') { const o = b.op; try { const cs = await klines(o.symbol, o.tf, 200), r = RD.resolve(o, cs); return {res: r ? {res: r.r, resAt: r.at, resPx: r.px} : null}; } catch { return {res: null}; } }
  return null;
}

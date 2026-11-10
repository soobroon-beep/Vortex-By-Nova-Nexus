/* Nexus Pixel · vigía de tus reglas (funciones puras, se prueban aparte).
   Cada cierto tiempo Pixel mira el gráfico, lo compara con las reglas que le configuraste y se asoma con un mensajito:
   te recuerda la regla que aplica ahora y te dice su lectura («yo creo que va a seguir bajando…»).
   Aquí solo va la parte sin IA: leer los indicadores (nube, oscilador, EMA 200, ADX, RSI, última señal), armar lo que se le manda
   al modelo y un mensaje de respaldo por si el modelo no contesta. No es asesoría financiera. */
(function (root) {
  'use strict';
  const fin = Number.isFinite, EVERY = [0, 5, 15, 30], DEF_EVERY = 15;
  const SYS = 'Eres Nexus Pixel, el compañero de trading del usuario dentro de VORTEX. Cada cierto tiempo miras su gráfico y le dejas UN mensajito breve en español: '
    + 'máximo 2 frases y 230 caracteres, sin saludo, sin markdown, sin listas y como mucho un emoji. '
    + '1) Si alguna de SUS REGLAS o de las cosas que te pidió recordar aplica a lo que pasa ahora, recuérdasela («Recuerda: …») y dile cómo está el gráfico respecto a ella. '
    + '2) Termina con tu lectura empezando por «Yo creo que…» (va a seguir bajando, va a seguir subiendo, es buen momento para un rebote, o mejor esperar confirmación). '
    + 'Usa SOLO los datos que recibes; no inventes niveles ni indicadores que no estén. No des órdenes de compra o venta: es tu opinión, no asesoría financiera.';
  const every = cfg => { const v = cfg ? cfg.vigia : null; return v != null && v !== '' && EVERY.includes(+v) ? +v : DEF_EVERY; }; // minutos entre avisos (0 = apagado)

  /* Lectura del gráfico a partir de CCT_getAIContext(). null si no hay datos suficientes. */
  function read(ctx) {
    const cs = ctx && Array.isArray(ctx.candles) ? ctx.candles : []; if (cs.length < 30) return null;
    const px = cs[cs.length - 1].c, nv = ctx.nova || {}, L = ctx.lecturas || {}, items = [], sig = []; let bias = 0;
    if (fin(nv.top) && fin(nv.bot)) {
      const hi = Math.max(nv.top, nv.bot), lo = Math.min(nv.top, nv.bot), s = px > hi ? 1 : px < lo ? -1 : 0;
      items.push({k: 'nube', b: s, t: s > 0 ? 'el precio está por ARRIBA de la nube (alcista)' : s < 0 ? 'el precio está por DEBAJO de la nube (bajista)' : 'el precio está DENTRO de la nube (indeciso)'}); bias += 2 * s; sig.push('n' + s);
    }
    if (fin(nv.osc) && fin(nv.sig)) { const s = nv.osc > nv.sig ? 1 : nv.osc < nv.sig ? -1 : 0; if (s) { items.push({k: 'oscilador', b: s, t: `el oscilador está en modo ${s > 0 ? 'COMPRA' : 'VENTA'}`}); bias += s; } sig.push('o' + s); }
    if (fin(nv.ema200)) { const s = px >= nv.ema200 ? 1 : -1; items.push({k: 'ema200', b: s, t: `el precio va por ${s > 0 ? 'ARRIBA' : 'DEBAJO'} de la EMA 200`}); bias += s; sig.push('e' + s); }
    if (fin(nv.adx)) { const a = Math.round(nv.adx), s = a >= 25 ? 't' : a < 18 ? 'r' : 'm'; if (s !== 'm') items.push({k: 'adx', b: 0, t: s === 't' ? `la tendencia tiene fuerza (ADX ${a})` : `el mercado está en rango (ADX ${a})`}); sig.push('a' + s); }
    if (nv.last && (nv.last.side === 'buy' || nv.last.side === 'sell') && fin(nv.last.ago) && nv.last.ago <= 5) { const s = nv.last.side === 'buy' ? 1 : -1; items.push({k: 'señal', b: s, t: `hay señal de ${s > 0 ? 'COMPRA' : 'VENTA'} de Nova Nexus hace ${nv.last.ago} vela${nv.last.ago === 1 ? '' : 's'}`}); bias += s; sig.push('s' + s); }
    const rsi = L.rsi && fin(L.rsi.ultimo) ? L.rsi.ultimo : null;
    if (rsi != null && (rsi >= 70 || rsi <= 30)) { items.push({k: 'rsi', b: rsi >= 70 ? -1 : 1, t: `el RSI está en ${rsi >= 70 ? 'sobrecompra' : 'sobreventa'} (${Math.round(rsi)})`}); sig.push('r' + (rsi >= 70 ? 1 : -1)); }
    if (!items.length) return null;
    return {price: px, items, bias, estado: bias >= 2 ? 'alcista' : bias <= -2 ? 'bajista' : 'mixto', sig: sig.join('|'), rebote: (rsi != null && rsi <= 30) || false};
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  /* La regla del usuario que habla de lo que está pasando ahora (por palabras clave: nube, oscilador, EMA 200, RSI, rango/tendencia). '' si ninguna. */
  const KEYS = {nube: /nube/i, oscilador: /oscilador/i, ema200: /ema\s*200|media\s*(de\s*)?200/i, rsi: /\brsi\b/i, adx: /\badx\b|rango|lateral/i, 'señal': /señal/i};
  function rule(cfg, R) {
    const txt = String((cfg && cfg.reglas) || '').trim(); if (!txt) return '';
    const parts = txt.split(/\n+|(?<=[.!?;])\s+/).map(x => x.trim().replace(/^[-•*\d.)\s]+/, '')).filter(x => x.length > 8);
    for (const it of R.items) { const re = KEYS[it.k], hit = re && parts.find(p => re.test(p)); if (hit) return hit.length > 130 ? hit.slice(0, 127).replace(/\s+\S*$/, '') + '…' : hit.replace(/[.;]+$/, ''); }
    return '';
  }
  /* Mensaje sin IA (respaldo): la regla que aplica (si hay), los hechos principales y la lectura. */
  function local(R, sym, tf, cfg) {
    const main = R.items.filter(i => i.k !== 'adx').slice(0, 2).map(i => i.t), adx = R.items.find(i => i.k === 'adx'), ru = rule(cfg, R);
    const view = R.estado === 'bajista' ? (R.rebote ? 'puede venir un rebote, pero la tendencia sigue bajista' : 'va a seguir bajando') : R.estado === 'alcista' ? 'va a seguir subiendo' : 'todavía no hay dirección clara: mejor esperar confirmación';
    return `${ru ? `Recuerda: «${ru}». Ahora en ` : ''}${sym} ${tf}: ${main.join(' y ')}${!ru && adx ? '; ' + adx.t : ''}. Yo creo que ${view}.`;
  }
  /* Lo que se le manda al modelo: hechos ya leídos + lecturas de los indicadores activos (para reglas sobre EMA, RSI, MACD…). */
  function prompt(R, sym, tf, ctx) {
    let lec = ''; try { lec = JSON.stringify((ctx && ctx.lecturas) || {}).slice(0, 900); } catch {}
    const nv = (ctx && ctx.nova) || {}, r = v => fin(v) ? +(+v).toPrecision(6) : null;
    return `GRÁFICO: ${sym} en ${tf}. Precio ${r(R.price)}.\nHECHOS AHORA:\n- ${R.items.map(i => cap(i.t)).join('\n- ')}\nLECTURA GENERAL: ${R.estado}.\n`
      + `NOVA NEXUS: ${JSON.stringify({nube_arriba: r(nv.top), nube_abajo: r(nv.bot), oscilador: r(nv.osc), senal_oscilador: r(nv.sig), flujo: r(nv.flux), adx: r(nv.adx), ema200: r(nv.ema200)})}\n`
      + (lec && lec !== '{}' ? `OTROS INDICADORES ACTIVOS: ${lec}\n` : '') + 'Escribe ahora tu mensajito.';
  }
  /* Limpia la respuesta del modelo: sin markdown ni comillas, una sola línea y corta (corta en el final de una frase). */
  function clean(t) {
    let s = String(t == null ? '' : t).replace(/```[\s\S]*?```/g, ' ').replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim().replace(/^["«“']+|["»”']+$/g, '').trim();
    if (s.length < 12 || /^\s*\{/.test(s)) return '';
    if (s.length > 260) { const cut = s.slice(0, 260), k = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? ')); s = k > 90 ? cut.slice(0, k + 1) : cut.replace(/\s+\S*$/, '') + '…'; }
    return s;
  }
  const api = {SYS, EVERY, DEF_EVERY, every, read, rule, local, prompt, clean};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NexusPixelWatch = api;
})(typeof self !== 'undefined' ? self : this);

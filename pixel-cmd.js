/* NEXUS PIXEL · entender lo que le pides a la APP (funciones puras, se prueban en tests/pixel-cmd.test.js).
   Antes, si le pedías algo que no fuera dibujar o preguntar por el gráfico («cambia los colores de los soportes», «ponme el RSI»,
   «cámbiate a 4 horas», «fondo negro»), la frase se iba a la IA genérica o, en la PC, a la sección que tuvieras abierta a la derecha
   (por ejemplo Nexus Lens), y contestaba cosas que no tenían nada que ver («cómo conectar tu API»).
   Aquí se entiende en español lo que quieres HACER en la app y se convierte en órdenes concretas:
     {do:'tf', value:'4h'}                 temporalidad
     {do:'symbol', value:'ETH'}            abrir otra moneda
     {do:'ind', key:'rsi', on:true}        poner o quitar un indicador común
     {do:'look', key:'up'|'down'|'bg'|'grid'|'cross', col}   colores del gráfico · {do:'look', key:'grid', on:false}
     {do:'ctype', value:'ha'}              tipo de gráfico (velas, Heikin Ashi, línea…)
     {do:'cursor', value:'Órbita'}         cursor
     {do:'theme', value:'light'|'dark'}    tema · {do:'appstyle', value:'espacial'}
     {do:'askColor', target:'sup'}         quieres cambiar un color pero no dijiste cuál: Pixel te ofrece colores
     {do:'undo'} · {do:'fit'}              deshacer, ajustar el gráfico
   Si no reconoce nada devuelve [] y Pixel sigue con lo de siempre (dibujar o la IA). */
(function (root) {
  'use strict';
  const nz = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  const COLORS = {'verde lima': '#a3e635', 'azul marino': '#1e3a8a', 'azul claro': '#60a5fa', 'azul cielo': '#38bdf8', 'verde claro': '#4ade80', 'verde oscuro': '#15803d', 'rojo oscuro': '#b91c1c', 'gris oscuro': '#374151', 'gris claro': '#d1d5db',
    rojo: '#ef4444', roja: '#ef4444', rojos: '#ef4444', rojas: '#ef4444', verde: '#22c55e', verdes: '#22c55e', azul: '#3b82f6', azules: '#3b82f6', amarillo: '#facc15', amarilla: '#facc15', amarillos: '#facc15', amarillas: '#facc15',
    naranja: '#f97316', naranjas: '#f97316', anaranjado: '#f97316', morado: '#a855f7', morada: '#a855f7', morados: '#a855f7', moradas: '#a855f7', violeta: '#8b5cf6', purpura: '#a855f7', lila: '#c4b5fd', rosa: '#ec4899', rosado: '#ec4899', rosada: '#ec4899', rosas: '#ec4899',
    fucsia: '#d946ef', blanco: '#ffffff', blanca: '#ffffff', blancos: '#ffffff', blancas: '#ffffff', negro: '#000000', negra: '#000000', negros: '#000000', gris: '#9ca3af', grises: '#9ca3af', cian: '#22d3ee', celeste: '#38bdf8', turquesa: '#2dd4bf', aqua: '#22d3ee',
    dorado: '#f0b90b', dorada: '#f0b90b', oro: '#f0b90b', cafe: '#a16207', marron: '#a16207', menta: '#3ff0c0', lima: '#a3e635'};
  const COLOR_KEYS = Object.keys(COLORS).sort((a, b) => b.length - a.length);
  function colorIn(s) { const h = s.match(/#[0-9a-f]{6}\b/); if (h) return h[0]; for (const k of COLOR_KEYS) if (new RegExp('\\b' + k + '\\b').test(s)) return COLORS[k]; return null; }
  function colorsIn(s) { const out = []; let rest = s; for (;;) { let best = null; for (const k of COLOR_KEYS) { const m = new RegExp('\\b' + k + '\\b').exec(rest); if (m && (!best || m.index < best.i)) best = {i: m.index, k}; } if (!best) break; out.push(COLORS[best.k]); rest = rest.slice(best.i + best.k.length); } return out; }

  /* ── temporalidad ── */
  const TF_WORDS = [[/\b(1|un|una)\s*(minuto|min)\b|\b1m\b/, '1m'], [/\b5\s*(minutos|min|m)\b|\b5m\b/, '5m'], [/\b15\s*(minutos|min|m)\b|\b15m\b|cuarto de hora/, '15m'], [/\b30\s*(minutos|min|m)\b|\b30m\b|media hora/, '30m'],
    [/\b(1|una)\s*(hora|h)\b|\b1h\b|\bhoraria\b|\bhorario\b/, '1h'], [/\b4\s*(horas|hrs|h)\b|\b4h\b|cuatro horas/, '4h'], [/\b(1|un)\s*dia\b|\b1d\b|\bdiari[oa]\b|\bdia\b(?!s)/, '1d'], [/\b(1|una)\s*semana\b|\b1w\b|\bsemanal\b/, '1w'], [/\b(1|un)\s*mes\b|\b1M\b|\bmensual\b/, '1M']];
  function tfOf(s, raw) {
    if (/\b1M\b/.test(raw || '')) return '1M';
    if (!/(temporalidad|marco|cambia(te|lo|r)?|pon(lo|me|er)?|pasa(te|lo)?|ver|ve(lo)?|muestra(me)?|abre|vamos a|en)\b/.test(s)) return null;
    for (const [re, v] of TF_WORDS) if (re.test(s)) return v; return null;
  }
  /* ── monedas ── */
  const COINS = {bitcoin: 'BTC', btc: 'BTC', ethereum: 'ETH', eth: 'ETH', ether: 'ETH', solana: 'SOL', sol: 'SOL', xrp: 'XRP', ripple: 'XRP', bnb: 'BNB', 'binance coin': 'BNB', doge: 'DOGE', dogecoin: 'DOGE', ada: 'ADA', cardano: 'ADA', pepe: 'PEPE', sui: 'SUI', link: 'LINK', chainlink: 'LINK', avax: 'AVAX', avalanche: 'AVAX', ton: 'TON', trx: 'TRX', tron: 'TRX', shib: 'SHIB', ltc: 'LTC', litecoin: 'LTC', dot: 'DOT', polkadot: 'DOT', near: 'NEAR', apt: 'APT', aptos: 'APT', arb: 'ARB', arbitrum: 'ARB', op: 'OP', optimism: 'OP', wif: 'WIF', bonk: 'BONK', zec: 'ZEC', zcash: 'ZEC', hype: 'HYPE', hyperliquid: 'HYPE', ena: 'ENA', inj: 'INJ', tia: 'TIA', sei: 'SEI', fet: 'FET', render: 'RENDER', uni: 'UNI', uniswap: 'UNI', aave: 'AAVE', atom: 'ATOM', cosmos: 'ATOM', fil: 'FIL', etc: 'ETC', bch: 'BCH', xlm: 'XLM', stellar: 'XLM', hbar: 'HBAR', algo: 'ALGO', pol: 'POL', matic: 'POL', trump: 'TRUMP', virtual: 'VIRTUAL', ondo: 'ONDO', jup: 'JUP', kas: 'KAS', 'usdt d': 'USDT.D', dominancia: 'USDT.D'};
  function coinOf(s, known) {
    if (!/\b(abre|abreme|cambia(te|me)? a|pasa(te|me)? a|muestra(me)?|pon(me)?|ve(te)? a|vamos a|grafico de|grafica de|quiero ver|ensename)\b/.test(s)) return null;
    for (const [w, b] of Object.entries(COINS)) if (new RegExp('\\b' + w + '\\b').test(s)) return b;
    const words = s.split(' '); for (const w of words) { const up = w.toUpperCase(); if (/^[A-Z0-9]{2,10}$/.test(up) && (known || []).some(k => k === up || k === up + 'USDT' || k.startsWith(up + 'USDT@'))) return up; }
    return null;
  }
  /* ── indicadores comunes ── */
  const INDS = [[/\brsi\b|fuerza relativa/, 'rsi'], [/\bmacd\b/, 'macd'], [/\bvwap\b/, 'vwap'], [/bollinger|bandas? de bol/, 'bollinger'], [/supertrend|super trend/, 'supertrend'], [/estocastico rsi|stoch ?rsi/, 'stochrsi'], [/estocastico|stoch\b/, 'stoch'], [/\batr\b|rango verdadero/, 'atr'], [/\bobv\b/, 'obv'],
    [/volumen(?! profile| de rango)|\bvol\b/, 'volume'], [/ichimoku|nube de ichimoku/, 'ichimoku'], [/parabolic|sar\b/, 'psar'], [/donchian/, 'donchian'], [/keltner/, 'keltner'], [/\badx\b|\bdmi\b/, 'adx'], [/\bcci\b/, 'cci'], [/williams|%r\b/, 'willr'], [/\bmfi\b|flujo de dinero/, 'mfi'],
    [/\broc\b/, 'roc'], [/awesome|\bao\b/, 'ao'], [/\bcmf\b|chaikin/, 'cmf'], [/sma ?200|media (movil )?simple( de)? 200/, 'sma200'], [/ema ?50|media (movil )?exponencial( de)? 50/, 'ema50'], [/\bema\b|media movil exponencial/, 'ema20'], [/wma|ponderada/, 'wma20'],
    [/cruces? (de )?ema/, 'cross'], [/perfil de volumen|vpvr|volume profile/, 'vpvr'], [/canales dinamicos/, 'dchan'], [/patrones/, 'patterns'], [/mapa de calor|liquidaciones|heatmap/, 'liqmap']];
  function indOf(s) { for (const [re, k] of INDS) if (re.test(s)) return k; return null; }
  const ON_RE = /\b(pon(me|le|er)?|agrega(me|r)?|anade(me|r)?|activa(me|r)?|muestra(me)?|ensename|enciende|mete(le)?|quiero (ver )?(el|la|los|las)|abre|carga)\b/, OFF_RE = /\b(quita(me|r|lo|la)?|elimina(r|lo|la)?|desactiva(r|lo|la)?|oculta(r|lo|la)?|apaga(r|lo|la)?|borra(r|lo|la)?|saca(r|lo|la)?|sin el|sin la)\b/;
  /* ── tipo de gráfico ── */
  const CT = [[/heikin|ashi/, 'ha'], [/velas huecas/, 'hollow'], [/barras hlc/, 'hlc'], [/barras|ohlc/, 'bars'], [/escalon/, 'step'], [/\barea\b/, 'area'], [/(grafico|grafica) de linea|\blinea\b|lineal/, 'line'], [/\bvelas\b|japonesas/, 'candles']];

  /* El dibujo del que hablas (para cambiarle el color) */
  const DRAW_T = [[/canal(es)?/, 'channel'], [/soportes? y resistencias?|resistencias? y soportes?|niveles|s ?\/ ?r/, 'sr'], [/soportes?/, 'sup'], [/resistencias?/, 'res'], [/tendencias?|directriz/, 'trend'], [/fibo(nacci)?|retroceso/, 'fib'], [/rangos?/, 'range'], [/lineas?/, 'line'], [/dibujos?|lo que dibujaste/, 'all']];
  function drawTarget(s) { for (const [re, k] of DRAW_T) if (re.test(s)) return k; return null; }

  function parse(text, ctx) {
    ctx = ctx || {}; const raw = String(text || ''), s = nz(raw); if (!s || s.length > 220) return [];
    const out = [], col = colorIn(s), wantsColor = /\bcolor(es)?\b|pinta|colorea|tono/.test(s) || !!col, verb = /\b(cambia(le|r|lo|la)?|pon(le|la|lo|las|los|er)?|pinta(la|lo|las|los|r)?|colorea|haz(la|lo|las|los)?|deja(la|lo)?|que (sea|sean|este|esten)|quiero)\b/.test(s);
    // 1) colores del GRÁFICO (velas, fondo, cuadrícula, cursor)
    const candlesT = /\bvelas?\b/.test(s), bgT = /\bfondo\b/.test(s), gridT = /cuadricula|rejilla|\bgrid\b|lineas de fondo/.test(s), crossT = /\b(cursor|cruz|reticula|crosshair)\b/.test(s) && wantsColor;
    if (gridT && OFF_RE.test(s)) return [{do: 'look', key: 'grid', on: false}];
    if (gridT && ON_RE.test(s) && !col) return [{do: 'look', key: 'grid', on: true}];
    if ((candlesT || bgT || gridT || crossT) && (wantsColor || verb) && !drawTarget(s.replace(/\bvelas?\b/g, ''))) {
      if (!col && wantsColor) return [{do: 'askColor', target: candlesT ? (/(alcista|verde|de subida|que suben)/.test(s) ? 'up' : /(bajista|roja|de bajada|que bajan)/.test(s) ? 'down' : 'candles') : bgT ? 'bg' : gridT ? 'grid' : 'cross'}];
      if (col) {
        if (bgT) out.push({do: 'look', key: 'bg', col});
        else if (gridT) out.push({do: 'look', key: 'grid', col});
        else if (crossT) out.push({do: 'look', key: 'cross', col});
        else if (candlesT) {
          const sideOf = t => /alcista|de subida|que suben|positiv|\bverdes?\b/.test(t) ? 'up' : /bajista|de bajada|que bajan|negativ|\brojas?\b/.test(t) ? 'down' : null;
          const strip = t => t.replace(/\b(velas?|las|los) (verdes?|rojas?)\b/g, '$1').replace(/^\s*(verdes?|rojas?)\b/, '');
          const parts = s.split(/\s+y\s+|,/);
          if (parts.length > 1) for (const p of parts) { const sd = sideOf(p), c = colorIn(strip(p)); if (sd && c && !out.some(o => o.key === sd)) out.push({do: 'look', key: sd, col: c}); } // «alcistas en azul y bajistas en naranja»
          if (!out.length) {
            const sd = sideOf(s), cs = colorsIn(strip(s));
            if (sd && cs.length) out.push({do: 'look', key: sd, col: cs[cs.length - 1]});
            else if (cs.length >= 2) { out.push({do: 'look', key: 'up', col: cs[0]}); out.push({do: 'look', key: 'down', col: cs[1]}); } // «velas azules y naranjas»
            else return [{do: 'askColor', target: 'candles', col}]; // un solo color: ¿las alcistas, las bajistas o ambas?
          }
        }
        if (out.length) return out;
      }
    }
    // 2) cambiar el color de un DIBUJO sin decir el color → ofrecer colores (antes se iba a la IA y contestaba cualquier cosa)
    const dt = drawTarget(s);
    if (dt && wantsColor && !col && verb) return [{do: 'askColor', target: dt}];
    // 3) tipo de gráfico
    if (/(tipo de grafico|grafico de|grafica de|cambia(lo)? a|pon(lo)? en|ver en)/.test(s) && !indOf(s)) for (const [re, v] of CT) if (re.test(s) && !(v === 'line' && dt)) return [{do: 'ctype', value: v}];
    // 4) cursor
    if (/\bcursor\b/.test(s) && !col) { const m = /orbita|planeta/.test(s) ? 'Órbita' : /estrella/.test(s) ? 'Estrella' : /flecha|normal/.test(s) ? 'Flecha' : /cruz|reticula/.test(s) ? 'Cruz' : null; if (m) return [{do: 'cursor', value: m}]; }
    // 5) tema y estilo
    if (/(tema|modo) (claro|blanco|de dia)|\bmodo claro\b/.test(s)) return [{do: 'theme', value: 'light'}];
    if (/(tema|modo) (oscuro|negro|de noche)|\bmodo oscuro\b/.test(s)) return [{do: 'theme', value: 'dark'}];
    { const m = s.match(/\b(estilo|tema) (clasico|minimal|espacial)\b/); if (m) return [{do: 'appstyle', value: m[2]}]; }
    // 6) indicadores comunes (poner / quitar)
    const ik = indOf(s);
    if (ik && !dt && !wantsColor && !/\b(que (dice|opinas|ves)|como (esta|va|ves)|lee|analiza|explica|significa)\b/.test(s)) {
      if (OFF_RE.test(s)) return [{do: 'ind', key: ik, on: false}];
      if (ON_RE.test(s)) { const m = ik === 'ema20' && s.match(/\bema ?(\d{1,3})\b|exponencial (?:de )?(\d{1,3})\b/), len = m ? +(m[1] || m[2]) : 0; return [Object.assign({do: 'ind', key: ik, on: true}, len >= 2 && len <= 500 && len !== 20 ? {len} : {})]; }
    }
    // 7) temporalidad y moneda (se pueden pedir juntas: «abre ETH en 4h»)
    const tf = tfOf(s, raw), coin = coinOf(s, ctx.symbols);
    if (coin) out.push({do: 'symbol', value: coin});
    if (tf && (coin || /(temporalidad|marco|cambia|pon|pasa|ve(lo)?\b|vamos)/.test(s))) out.push({do: 'tf', value: tf});
    if (out.length) return out;
    // 8) cosas rápidas
    if (/^(deshaz|deshacer|regresa(lo)?|ctrl ?z)\b/.test(s)) return [{do: 'undo'}];
    if (/\b(ajusta|centra|restablece|resetea|reinicia) (el )?(grafico|grafica|zoom)\b|\bautoajusta\b/.test(s)) return [{do: 'fit'}];
    return [];
  }
  /* ¿La frase habla del gráfico? (para no mandarla a la sección del panel derecho en la PC) */
  const chartish = text => /grafic|vela|indicador|\bema\b|\bsma\b|rsi|macd|soporte|resistencia|tendencia|dibuj|canal|fibo|linea|color|fondo|cuadricula|cursor|temporalidad|zona|rectangulo|nivel|precio|long|short|stop|objetivo|tp\b|sl\b|patron|figura|nube|oscilador/.test(nz(text));
  const COLOR_CHIPS = [['Rojo', '#ef4444'], ['Verde', '#22c55e'], ['Azul', '#3b82f6'], ['Amarillo', '#facc15'], ['Morado', '#a855f7'], ['Naranja', '#f97316'], ['Blanco', '#ffffff'], ['Cian', '#22d3ee']];
  const TNAME = {sup: 'los soportes', res: 'las resistencias', sr: 'los soportes y resistencias', channel: 'el canal', trend: 'la tendencia', fib: 'el Fibonacci', range: 'el rango', line: 'las líneas', all: 'tus dibujos', candles: 'las velas', up: 'las velas alcistas', down: 'las velas bajistas', bg: 'el fondo', grid: 'la cuadrícula', cross: 'el cursor'};
  const api = {parse, chartish, colorIn, colorsIn, tfOf, coinOf, indOf, drawTarget, COLORS, COLOR_CHIPS, TNAME, nz};
  root.NexusPixelCmd = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

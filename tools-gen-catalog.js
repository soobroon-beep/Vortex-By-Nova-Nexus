// Genera catalog.js a partir de catalog/*.pine (node tools-gen-catalog.js). Solo incluye el código de los gratuitos (Nova LITE).
const fs = require('fs');
const items = [
  {id: 'nova-lite', file: 'nova-lite.pine', tier: 'free', name: 'Nova LITE · Smart Money Concepts', desc: 'Estructura de mercado (BOS / CHoCH con barridos), order blocks volumétricos con actividad de compra y venta, breakers, FVG, EMA Cloud y señales'},
  {id: 'nova-nexus', tier: 'pro', file: 'nova-nexus.pine', name: 'Nova Nexus', desc: 'Tu script original completo: todas sus entradas, colores y opacidades configurables (estrategias Mobile / Cloud / SMC incluidas)'},
  {id: 'nova-osc', tier: 'pro', file: 'nova-oscillator.pine', name: 'Nova Oscillator 1.1', desc: 'Oscilador Flux + Momentum, medidores, squeeze, divergencias, cinta de fuerza y tabla institucional'},
  {id: 'nova-sig', tier: 'pro', file: 'nova-signals.pine', name: 'Nova Nexus · Señales iA 2.7', desc: 'Señales BUY / SELL con score de 1 a 5 estrellas, cooldown, divergencias y niveles TP1-TP3 / SL por ATR, con tabla de score'},
  {id: 'nova-scr', tier: 'pro', file: 'nova-screener.pine', name: 'Nova Screener 40 Cryptos', desc: 'Tabla de 40 criptos con señal, score y persistencia (se rellena con 40 pares de Binance; cámbialos en ⚙)'}
].map(x => Object.assign({}, x, {code: x.tier === 'pro' ? '' : fs.readFileSync(__dirname + '/catalog/' + x.file, 'utf8').replace(/\r\n?/g, '\n')})); // el código PRO NO va en la página: vive en Firestore («pro»), solo para cuentas Infinity
fs.writeFileSync(__dirname + '/catalog.js', '/* Generado por tools-gen-catalog.js: no editar a mano */\n(function (root) { root.CCTCatalog = ' + JSON.stringify(items.map(({file, ...r}) => r)) + '; })(typeof self !== \'undefined\' ? self : this);\n');

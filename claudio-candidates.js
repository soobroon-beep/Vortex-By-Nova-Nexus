/* CLAUDIO · capa de investigación (trabajo del «cerebro», con fecha). Universo que el reflejo (Jev) evalúa en cada vela.
   Fuente de cada dato en docs/claudio/INVESTIGACION.md. Nada aquí es una recomendación de inversión: son hipótesis con su forma de invalidarse.
   Regla: si un dato no se pudo confirmar se marca como «estimación»; nunca se inventan métricas. Revisar cada mes (o antes si cambia el régimen). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.CCTClaudioResearch = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ASOF = '2026-11-08';
  const REGIME = {
    asOf: ASOF, label: 'Aversión al riesgo (risk-off) con liquidez en contracción',
    points: [
      'BTC ≈ 75 800 USD el 7-nov, −2,4 % en 7 días y −6,6 % en un mes; ≈ 40 % bajo su máximo. Defiende la zona 75 000–76 500 (media de 50 semanas / EMA 200 diaria).',
      'Dominancia de BTC 58–60 % y subiendo; ETH ≈ 10,4 % del mercado. El dinero se refugia en BTC y sale de las altcoins.',
      'Stablecoins ≈ 293 000 M USD y cayendo: la peor semana de 2026 (≈ −6 700 M en 7 días). Menos «pólvora seca» para comprar.',
      'Financiación (funding) positiva en casi todos los perpetuos mientras el precio baja: largos apalancados pagando en tendencia bajista = riesgo de liquidaciones.',
      'Fed en 3,75–4,00 %, votación 10–2 con dos votos a favor de subir; el mercado da ≈ 77–85 % de subida el 9-dic. IPC de octubre: martes 10-nov 8:30 ET.',
      'ETF de BTC al contado: ≈ −1 280 M USD de salidas del 2 al 6-nov. Miedo y codicia: 28 (miedo).',
      'Choque de confianza: hackeo de Binance del 29-oct (≈ 6 300 M USD, atribuido a Corea del Norte); retiros reabiertos el 1-nov.'
    ],
    stance: 'Defensivo: el agente solo opera setups de calidad ≥ 2 con confianza > 80 %; en «crisis» no abre posiciones y reduce las abiertas.'
  };
  const C = [
    {sym: 'BTCUSDT', name: 'Bitcoin', bias: 'neutral → largo solo en soporte', thesis: 'Activo refugio dentro de cripto: la dominancia sube mientras las altcoins se drenan. La zona 75–76,5 k concentra soportes técnicos de largo plazo.',
      catalysts: ['IPC de octubre (10-nov): uno blando bajaría la probabilidad de subida de tipos', 'Vuelta de entradas a los ETF', 'Estabilización de la oferta de stablecoins por encima de 293 000 M'],
      bear: ['Subida de tipos el 9-dic (77–85 % descontado)', 'Salidas de ETF persistentes', 'Contracción de stablecoins', 'Mercados de predicción: 61 % de tocar 72 500 en noviembre'],
      invalid: 'Cierre diario bajo 72 500 o una segunda semana seguida de contracción fuerte de stablecoins.', value: 'No aplica (no hay flujos de caja); el valor depende de la demanda neta.', confirmed: ['Fecha del IPC y de la Fed'], speculative: ['Rebote por IPC blando']},
    {sym: 'ETHUSDT', name: 'Ethereum', bias: 'débil (preferencia corto/evitar)', thesis: 'Rinde peor que BTC (dominancia 10,4 % y bajando). Un comprador grande (Bitmine) dejaría de comprar a fin de mes.',
      catalysts: ['Fin de las compras de Bitmine (fin de noviembre, estimación de la fuente)', 'Flujos de ETF de ETH'],
      bear: ['Ya está descontado en parte: ETH lleva meses de caídas', 'Un giro del mercado arrastra primero a ETH por su beta'],
      invalid: 'ETH/BTC recupera y la dominancia de ETH vuelve sobre 11 %.', value: 'Comisiones de red bajas: el valor generado repercute poco en el token hoy.', confirmed: ['Pérdida de dominancia'], speculative: ['Fecha exacta del fin de compras de Bitmine']},
    {sym: 'HYPEUSDT', name: 'Hyperliquid', bias: 'largo selectivo', thesis: 'El token con más ingresos devueltos al poseedor: ≈ 97–99 % de las comisiones a recompras; ≈ 64 M USD de ingresos al poseedor en 30 días (fin de octubre).',
      catalysts: ['Recompras diarias automáticas', 'Volumen de perpetuos en mercados volátiles'],
      bear: ['Desbloqueo del 6-nov: máximo programado ≈ 923 M USD, aunque solo ≈ 15,8 M se rastreaban como comprometidos', 'Posicionamiento muy largo en derivados', 'Las recompras dependen del volumen, que cae si el mercado se enfría'],
      invalid: 'Los ingresos al poseedor caen > 40 % mes contra mes o los tokens desbloqueados llegan a exchanges en volumen.', value: 'Sí: las comisiones se convierten en recompra y quema del token.', confirmed: ['Mecanismo de recompra activo'], speculative: ['Cuánto del desbloqueo se vende'], verifyListing: true},
    {sym: 'AAVEUSDT', name: 'Aave', bias: 'neutral (vigilar TVL)', thesis: 'Líder de préstamos con recompras automáticas (Aavenomics 3.0) e ingresos ≈ 402 M USD anualizados (estimación de la fuente).',
      catalysts: ['Recompras automáticas diarias', 'Adopción de Aave V4'],
      bear: ['TVL cayó de ≈ 19 100 M (4-oct) a ≈ 16 400 M (3-nov)', 'Presupuesto de recompra recortado de ≈ 50 a 30 M USD/año', 'En risk-off baja la demanda de préstamo y con ella los ingresos'],
      invalid: 'TVL bajo 14 000 M o nuevo recorte del presupuesto de recompra.', value: 'Parcial: una parte del ingreso recompra AAVE; el resto queda en la tesorería.', confirmed: ['Caída de TVL', 'Recompras activas'], speculative: ['Repunte del préstamo']},
    {sym: 'UNIUSDT', name: 'Uniswap', bias: 'neutral', thesis: 'Interruptor de comisiones activo; ingresos del protocolo del T3 ≈ 29,2 M USD (+117 % vs T2) tras extenderlo a v4 en 7 redes.',
      catalysts: ['Crecimiento del ingreso diario (≈ 325 k USD/día tras v4)'],
      bear: ['Los ingresos son pequeños frente a la capitalización: la reducción de oferta es ≈ 0,4 % anual', 'El volumen DEX cae en mercados bajistas'],
      invalid: 'El ingreso diario vuelve bajo 150 k USD.', value: 'Sí pero pequeño: quema UNI con ≈ 17 % de las comisiones de swap.', confirmed: ['Fee switch activo'], speculative: ['Revalorización por flujos de caja']},
    {sym: 'SOLUSDT', name: 'Solana', bias: 'neutral, evento cercano', thesis: 'Catalizador con fecha: conferencia Breakpoint en Londres desde el 15-nov.',
      catalysts: ['Breakpoint (15-nov)'],
      bear: ['≈ 75–78 % de cuentas largas en perpetuos (posicionamiento saturado)', 'Los eventos de conferencia suelen «venderse en la noticia»'],
      invalid: 'Pierde 80 USD en cierre diario antes del evento.', value: 'Comisiones y MEV de la red; repercuten vía staking más que vía recompra.', confirmed: ['Fecha de Breakpoint'], speculative: ['Anuncios en Breakpoint']},
    {sym: 'ENAUSDT', name: 'Ethena', bias: 'débil (corto/evitar)', thesis: 'El interruptor de comisiones (hasta 95 % a recompras) depende de que USDe llegue a 7 500 M; USDe rondaba ≈ 4 100 M (agosto), lejos del umbral.',
      catalysts: ['Crecimiento de USDe', 'Producto Earn+ en Aave V4'],
      bear: ['Con funding bajo, el rendimiento de sUSDe pierde atractivo y USDe se contrae', 'Desbloqueos mensuales del equipo (≈ 17 M USD el 5-nov)'],
      invalid: 'USDe supera 7 500 M y se activa el interruptor.', value: 'Hoy no: el valor no repercute en ENA hasta activar el interruptor.', confirmed: ['Umbral de 7 500 M aprobado'], speculative: ['Fecha de activación']},
    {sym: 'PENDLEUSDT', name: 'Pendle', bias: 'neutral', thesis: '80 % de las comisiones financian recompras para quien hace staking (sPENDLE).',
      catalysts: ['Mercados de rendimiento fijo en sUSDe y otros activos'],
      bear: ['Su volumen depende del rendimiento de USDe y del apetito por riesgo', 'No se encontró una cifra reciente fiable de ingresos (dato pendiente)'],
      invalid: 'TVL o ingresos caen de forma sostenida (falta fuente para fijar el umbral).', value: 'Sí, vía sPENDLE.', confirmed: ['Reparto 80 % a recompras'], speculative: ['Nivel actual de ingresos (sin dato)']}
  ];
  const WRONG = [
    '¿La ventaja es orgánica o está impulsada por incentivos? Las recompras de HYPE, AAVE y UNI son reales, pero HYPE depende del volumen y AAVE ya recortó su presupuesto.',
    '¿El catalizador ya está descontado? Una subida de tipos al 77–85 % ya está en el precio; la sorpresa sería un IPC blando, no la subida.',
    '¿El valor repercute en el token? Solo en HYPE, AAVE, UNI y PENDLE (parcialmente). En ENA aún no. En BTC/ETH/SOL no hay flujo de caja directo.',
    '¿Sigue siendo rentable tras costos? La simulación descuenta 0,1 % de comisión por lado + 0,05 % de deslizamiento; no incluye la financiación de los perpetuos en los cortos.',
    '¿Se le delegó al modelo un límite que debería estar en el código? No: drawdown, pérdida diaria, tamaño, número de posiciones e interruptor están en código congelado; Jev solo opina.',
    'El evaluador local (sin clave de Jev) es un conjunto de reglas, no un modelo entrenado: su «confianza» solo vale después de calibrarla con datos (Brier).',
    'Con 1 h por vela y GitHub Actions como reloj, el agente puede llegar minutos tarde a la vela; no es apto para alta frecuencia.',
    'Un backtest o paper trading positivo no garantiza dinero real: el deslizamiento real y los huecos de liquidez son peores en crisis.',
    'En vivo el libro de órdenes se lee unos minutos después del cierre de la vela, pero la orden se simula al precio de apertura de la vela siguiente: es un sesgo pequeño a favor que solo desaparece con ejecución real.'
  ];
  const SOURCES = [
    ['Precio de BTC 7-nov y mercados de predicción', 'https://news.bitcoin.com/price-predictions/prediction-markets-favor-another-drop-as-year-end-bitcoin-price-forecasts-sour/'],
    ['Liquidez, dominancia y stablecoins (7-nov)', 'https://martyau79.substack.com/p/07nov2026-crypto-and-macro-liquidity'],
    ['Stablecoins: peor semana de 2026', 'https://cryptonews.net/news/analytics/33719810/'],
    ['Resumen semanal y fechas clave (IPC 10-nov)', 'https://cryptoticker.io/en/crypto-news-this-week-recap-key-dates-november-2026/'],
    ['Fed: decisión 28-oct y probabilidades', 'https://zerocap.com/insights/weekly-crypto-market-wrap/weekly-crypto-market-wrap-4-november-2026/'],
    ['Funding e interés abierto (6-nov)', 'https://www.tokenpost.com/news/investing/51350'],
    ['Desbloqueos de noviembre', 'https://coinalertnews.com/news/2026/10/30/hyperliquid-november-token-unlocks'],
    ['Recompras y fee switch (ingresos al poseedor)', 'https://github.com/Ricosworks1/governance-research-reports/releases/tag/governance-fee-switch-equity-gap-20261106'],
    ['Aave: TVL (DefiLlama)', 'https://defillama.com/protocol/aave?denomination=ETH'],
    ['Hackeo de Binance', 'https://stealthex.io/blog/binance-hack-everything-we-know-about-the-6-3b-theft/'],
    ['Candidatos de noviembre (Breakpoint, Bitmine)', 'https://crypto.com/en/market-updates/best-crypto-november-2026'],
    ['Jev / API System One', 'https://docs.typesafe.ai/primitives']
  ];
  return {ASOF, REGIME, CANDIDATES: C, WRONG, SOURCES, symbols: () => C.map(c => c.sym)};
});

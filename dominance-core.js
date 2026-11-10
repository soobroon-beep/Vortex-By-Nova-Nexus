/* Dominancia de mercado (USDT.D, BTC.D) con la fórmula CRYPTOCAP — funciones puras.
   Las usan el flujo de GitHub (scripts/fetch-dominance.js) y el servidor de Cloudflare (worker/push-alerts.mjs),
   para que la muestra de cada 15 min salga igual venga de donde venga:
   moneda.D = capitalización de la moneda / suma de la capitalización de las 125 criptomonedas más grandes × 100. */
(function (root) {
  'use strict';
  const TOP = 125, METHOD = 'cryptocap-top125-v1';
  // Fichas que solo «envuelven» a otra (wBTC, stETH, WETH, puentes…): no son criptomonedas aparte y contarlas duplicaría capitalización
  const DERIV = /(^|-)(wrapped|staked|restaked|bridged|binance-peg|liquid-staking)(-|$)|^(weth|wbtc|steth|wsteth|weeth|reth|cbbtc|cbeth|lbtc|solvbtc|ezeth|rseth|meth|jitosol|msol|bnsol|susde|susds|usdtb|wbeth|tbtc|sweth|oseth|ethx|lseth|pumpbtc|fbtc|clbtc|ebtc|unibtc|jupsol|bbsol|wbnb|usdt0|kbtc)$|staked-|-staked|wrapped-|-wrapped|-bridged|rocket-pool-eth|lido-staked|coinbase-wrapped|kelp-dao|renzo-restaked|ether-fi-staked|mantle-staked|binance-staked|jito-staked|marinade-staked|lombard-staked|solv-protocol|ethena-staked/i;
  // Fondos y valores tokenizados (bonos del Tesoro, créditos…): no son criptomonedas y no están en el listado de monedas que usa CRYPTOCAP
  const FUNDS = /^(figr_heloc|buidl|usyc|ustb|jaaa|jtrsy|eutbl|ousg|benji|usdtb|ustbl|tbill|wtgxx|fobxx|ylds)$/i;
  const isDeriv = c => DERIV.test(c.id || '') || DERIV.test(String(c.symbol || '').toLowerCase()) || FUNDS.test(String(c.symbol || ''));
  /* Las 125 más grandes (sin fichas envueltas) y la dominancia de ese momento */
  function top125(markets, skipDeriv = true) { return markets.filter(c => c && c.market_cap > 0 && !(skipDeriv && isDeriv(c))).sort((a, b) => b.market_cap - a.market_cap).slice(0, TOP); }
  function domOf(list) { const tot = list.reduce((a, c) => a + c.market_cap, 0), cap = id => (list.find(c => c.id === id) || {}).market_cap || 0; return {total: tot, usdt: cap('tether') / tot * 100, btc: cap('bitcoin') / tot * 100}; }
  /* Muestra a partir de la respuesta de /coins/markets (250 monedas). null si la respuesta no sirve: nunca se inventa un punto. */
  function sample(markets) {
    if (!Array.isArray(markets) || markets.length < 150) return null;
    const cur = domOf(top125(markets)); return cur.usdt > 0 && cur.usdt < 100 && cur.btc > 0 && cur.btc < 100 ? cur : null;
  }
  /* Une muestras [t, %] por hueco de `bucket` ms (la más nueva de cada hueco gana) y descarta las anteriores a `since`. */
  function mergeSamples(old, add, bucket, since = 0) {
    const m = new Map();
    for (const p of [...(old || []), ...(add || [])]) if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > 0 && p[1] < 100) m.set(Math.floor(p[0] / bucket) * bucket, p[1]);
    return [...m.entries()].filter(([t]) => t >= since).sort((a, b) => a[0] - b[0]).map(([t, v]) => [t, +v.toFixed(4)]);
  }
  const api = {TOP, METHOD, isDeriv, top125, domOf, sample, mergeSamples};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CCTDominance = api;
})(typeof self !== 'undefined' ? self : this);

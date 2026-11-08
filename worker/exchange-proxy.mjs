// VORTEX · puente con los exchanges (Cloudflare Worker «vortex-exchange»). Lo publica .github/workflows/deploy-exchange-worker.yml.
// ¿Para qué? Los exchanges (BingX, Binance, Bybit, OKX…) no dejan que una página web les hable directo (bloquean CORS).
// La app firma cada consulta EN TU DISPOSITIVO (con CCXT) y este Worker solo la reenvía tal cual al exchange y devuelve la respuesta.
// Tu Secret Key NUNCA llega aquí: solo viajan la API Key y la firma, igual que si tu navegador hablara directo con el exchange.
// Formato (el de CCXT con proxyUrl): https://vortex-exchange.<cuenta>.workers.dev/?<URL del exchange (codificada si lleva «?»)>
// Opcional: Ajustes → Variables → ALLOWED_ORIGIN = tus sitios separados por coma (por defecto https://soobroon-beep.github.io).
const DEFAULT_ORIGINS = 'https://soobroon-beep.github.io';
const DROP = new Set(['host', 'origin', 'referer', 'cookie', 'content-length', 'connection', 'accept-encoding', 'x-forwarded-for', 'x-real-ip', 'true-client-ip']);

export function targetOf(reqUrl) { // URL del exchange que viene después del «?»
  const i = reqUrl.indexOf('?'); if (i < 0) return null;
  let t = reqUrl.slice(i + 1); if (/^https?%3A/i.test(t)) { try { t = decodeURIComponent(t); } catch { return null; } }
  let u; try { u = new URL(t); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const h = u.hostname.toLowerCase();
  // solo nombres de dominio públicos (nada de IPs, localhost ni redes internas)
  if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || /(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(h) || h.endsWith('.workers.dev')) return null;
  return u;
}
export function originOk(origin, env) {
  const allowed = String((env && env.ALLOWED_ORIGIN) || DEFAULT_ORIGINS).split(',').map(s => s.trim()).filter(Boolean);
  return allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('origin') || '', ok = originOk(origin, env);
    const cors = {'access-control-allow-origin': ok ? origin : 'null', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS', 'access-control-allow-headers': req.headers.get('access-control-request-headers') || '*', 'access-control-expose-headers': '*', 'access-control-max-age': '86400', vary: 'origin'};
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    if (!ok) return new Response('Origen no permitido', {status: 403, headers: cors});
    const t = targetOf(req.url); if (!t) return new Response('Destino no válido', {status: 400, headers: cors});
    const headers = new Headers(); for (const [k, v] of req.headers) { const l = k.toLowerCase(); if (!DROP.has(l) && !l.startsWith('cf-') && !l.startsWith('sec-') && !l.startsWith('access-control-')) headers.set(k, v); }
    const init = {method: req.method, headers, redirect: 'manual'}; if (!['GET', 'HEAD'].includes(req.method)) init.body = await req.arrayBuffer();
    let r; try { r = await fetch(t.toString(), init); } catch (e) { return new Response(JSON.stringify({error: 'No se pudo contactar al exchange: ' + (e && e.message || e)}), {status: 502, headers: {...cors, 'content-type': 'application/json'}}); }
    const out = new Headers(cors); const ct = r.headers.get('content-type'); if (ct) out.set('content-type', ct);
    return new Response(r.body, {status: r.status, headers: out});
  }
};

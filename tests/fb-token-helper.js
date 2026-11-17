// Ayuda de pruebas: tokens de sesión de Firebase de mentira (firmados con una llave RSA de prueba) y su JWKS,
// para probar que el servidor solo cree en cuentas verificadas.
const {subtle} = globalThis.crypto;
const b64u = buf => Buffer.from(buf).toString('base64url');
let kp = null;
const KID = 'test-kid-1';
async function keys() {
  if (!kp) kp = await subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  return kp;
}
async function jwks() { const {publicKey} = await keys(), j = await subtle.exportKey('jwk', publicKey); return {keys: [{kty: 'RSA', n: j.n, e: j.e, alg: 'RS256', use: 'sig', kid: KID}]}; }
async function mint(uid, {project = 'criptochart-bd774', email = uid.toLowerCase() + '@ejemplo.com', exp, aud, iss, kid = KID, now = Date.now()} = {}) {
  const {privateKey} = await keys(), t = Math.floor(now / 1000);
  const head = b64u(JSON.stringify({alg: 'RS256', kid, typ: 'JWT'}));
  const body = b64u(JSON.stringify({iss: iss || 'https://securetoken.google.com/' + project, aud: aud || project, auth_time: t - 10, user_id: uid, sub: uid, iat: t - 10, exp: exp != null ? exp : t + 3600, email, email_verified: true}));
  const sig = await subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(head + '.' + body));
  return head + '.' + body + '.' + b64u(sig);
}
const isJwks = url => String(url).includes('securetoken@system.gserviceaccount.com');
async function jwksResponse() { return new Response(JSON.stringify(await jwks()), {headers: {'cache-control': 'public, max-age=3600'}}); }
// Envuelve un fetch de prueba para que también conteste las llaves públicas de Google
function withJwks(inner) { return async (url, init) => isJwks(url) ? jwksResponse() : inner(url, init); }
module.exports = {mint, jwks, withJwks, isJwks, jwksResponse, KID};

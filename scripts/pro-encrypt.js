// Cifra un indicador PRO para subirlo sin exponer su código: node scripts/pro-encrypt.js <archivo.pine> <id>
// Usa la clave pública docs/pro-pubkey.pem (la privada solo existe en Firestore). Escribe catalog/<id>.pine.enc;
// al subirlo a main, el flujo «Proteger código Nova Nexus» lo descifra en el servidor y lo guarda en Firestore («pro»).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [file, id] = process.argv.slice(2); if (!file || !id) { console.log('Uso: node scripts/pro-encrypt.js <archivo.pine> <id>'); process.exit(1); }
const pub = fs.readFileSync(path.join(__dirname, '..', 'docs', 'pro-pubkey.pem'), 'utf8');
const key = crypto.randomBytes(32), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([c.update(fs.readFileSync(file)), c.final()]);
const k = crypto.publicEncrypt({key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256'}, key);
fs.writeFileSync(path.join(__dirname, '..', 'catalog', id + '.pine.enc'), JSON.stringify({v: 1, k: k.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64')}));
console.log('Cifrado: catalog/' + id + '.pine.enc');

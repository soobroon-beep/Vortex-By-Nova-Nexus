// Protege el código de los indicadores Nova Nexus PRO: lo sube a Firestore (colección «pro», solo lectura para cuentas Infinity)
// y marca la cuenta del creador como Infinity en plans/{uid}. Se ejecuta en GitHub Actions con FIREBASE_SERVICE_ACCOUNT.
// Uso: node scripts/pro-catalog.js   (no imprime código ni correos; solo conteos)
//
// Indicadores nuevos SIN pasar el código por el repo público: se suben cifrados como catalog/<id>.pine.enc
// (AES-256-GCM con la clave envuelta en RSA-OAEP). La clave privada se genera aquí una sola vez y vive solo en
// Firestore (proKeys/main, bloqueada para cualquier cliente por las reglas); la pública queda en docs/pro-pubkey.pem
// para cifrar. Cifrar: node scripts/pro-encrypt.js <archivo.pine> <id>
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const OWNER = 'a8d56a29aa7c5208d7748a84e75e4b14c713c521136174e8a652b7a76ac19b28'; // sha-256 del correo del creador (el mismo de plans.js)
const PRO = [['nova-nexus', 'nova-nexus.pine'], ['nova-osc', 'nova-oscillator.pine'], ['nova-sig', 'nova-signals.pine'], ['nova-scr', 'nova-screener.pine']];
(async () => {
  const raw = process.env.SA; if (!raw) { console.log('Falta FIREBASE_SERVICE_ACCOUNT'); return; }
  const admin = require('firebase-admin'); admin.initializeApp({credential: admin.credential.cert(JSON.parse(raw))}); const db = admin.firestore();
  // clave para los indicadores cifrados (se crea la primera vez)
  const kref = db.collection('proKeys').doc('main'); let ks = await kref.get(), priv;
  if (!ks.exists) {
    const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 3072, publicKeyEncoding: {type: 'spki', format: 'pem'}, privateKeyEncoding: {type: 'pkcs8', format: 'pem'}});
    await kref.set({pub: publicKey, priv: privateKey, at: Date.now()}); priv = privateKey; console.log('Clave de cifrado creada');
  } else priv = ks.data().priv;
  const pub = crypto.createPublicKey(priv).export({type: 'spki', format: 'pem'});
  fs.mkdirSync(path.join(__dirname, '..', 'docs'), {recursive: true}); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'pro-pubkey.pem'), pub);
  let up = 0;
  const catDir = path.join(__dirname, '..', 'catalog');
  for (const f of fs.readdirSync(catDir).filter(x => x.endsWith('.pine.enc'))) {
    const id = f.replace(/\.pine\.enc$/, '');
    try {
      const e = JSON.parse(fs.readFileSync(path.join(catDir, f), 'utf8'));
      const key = crypto.privateDecrypt({key: priv, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256'}, Buffer.from(e.k, 'base64'));
      const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'base64')); d.setAuthTag(Buffer.from(e.tag, 'base64'));
      const code = Buffer.concat([d.update(Buffer.from(e.ct, 'base64')), d.final()]).toString('utf8').replace(/\r\n?/g, '\n');
      await db.collection('pro').doc(id).set({code, lines: code.split('\n').length, updatedAt: admin.firestore.FieldValue.serverTimestamp()}); up++;
      console.log(`${id}: subido desde cifrado (${code.split('\n').length} líneas)`);
    } catch (err) { console.log(`${id}: no se pudo descifrar (${err.message})`); }
  }
  for (const [id, file] of PRO) {
    const f = path.join(__dirname, '..', 'catalog', file); if (!fs.existsSync(f)) { console.log(`${id}: sin archivo en el repo (ya protegido)`); continue; }
    const code = fs.readFileSync(f, 'utf8').replace(/\r\n?/g, '\n');
    await db.collection('pro').doc(id).set({code, lines: code.split('\n').length, updatedAt: admin.firestore.FieldValue.serverTimestamp()}); up++;
    console.log(`${id}: subido (${code.split('\n').length} líneas)`);
  }
  let owner = 0, page;
  do { const r = await admin.auth().listUsers(1000, page); page = r.pageToken;
    for (const u of r.users) if (u.email && crypto.createHash('sha256').update(u.email.trim().toLowerCase()).digest('hex') === OWNER) { await db.collection('plans').doc(u.uid).set({tier: 'infinity', by: 'creador', at: Date.now()}); owner++; }
  } while (page);
  // comprobación: lo que quedó en la colección
  const got = await db.collection('pro').get();
  console.log(`Subidos: ${up} · en Firestore: ${got.size} indicadores (${got.docs.map(d => d.id).join(', ')}) · cuenta del creador marcada Infinity: ${owner}`);
})().catch(e => { console.log('ERROR: ' + (e.message || e)); process.exit(1); });

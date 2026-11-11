// Protege el código de los indicadores Nova Nexus PRO: lo sube a Firestore (colección «pro», solo lectura para cuentas Infinity)
// y marca la cuenta del creador como Infinity en plans/{uid}. Se ejecuta en GitHub Actions con FIREBASE_SERVICE_ACCOUNT.
// Uso: node scripts/pro-catalog.js   (no imprime código ni correos; solo conteos)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const OWNER = 'a8d56a29aa7c5208d7748a84e75e4b14c713c521136174e8a652b7a76ac19b28'; // sha-256 del correo del creador (el mismo de plans.js)
const PRO = [['nova-nexus', 'nova-nexus.pine'], ['nova-osc', 'nova-oscillator.pine'], ['nova-sig', 'nova-signals.pine'], ['nova-scr', 'nova-screener.pine']];
(async () => {
  const raw = process.env.SA; if (!raw) { console.log('Falta FIREBASE_SERVICE_ACCOUNT'); return; }
  const admin = require('firebase-admin'); admin.initializeApp({credential: admin.credential.cert(JSON.parse(raw))}); const db = admin.firestore();
  let up = 0;
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

// Estado de tus bots de Nova Bot Lab (solo lectura): si están encendidos, si el servidor los avanza y si se reentrenan.
// Se corre a mano (.github/workflows/bots-status.yml). No imprime cuentas, correos ni montos: solo nombres de bots, estados, fechas y conteos.
'use strict';
const ago = t => t ? ((Date.now() - t) / 36e5).toFixed(1) + ' h' : '—';
(async () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT; if (!raw) { console.log('Sin FIREBASE_SERVICE_ACCOUNT'); return; }
  const admin = require('firebase-admin'); admin.initializeApp({credential: admin.credential.cert(JSON.parse(raw))}); const db = admin.firestore();
  try { const pro = await db.collection('pro').get(); console.log('Scripts PRO en el servidor: ' + pro.docs.map(d => d.id + (d.data().code ? '' : ' (vacío)')).join(', ')); } catch (e) { console.log('Scripts PRO: ' + e.message); }
  const users = await db.collection('users').listDocuments(); let n = 0;
  for (const u of users) {
    const bd = await u.collection('data').doc('botlab').get(); if (!bd.exists) continue; let S; try { S = JSON.parse(bd.data().items || '{}'); } catch (e) { console.log('botlab ilegible:', e.message); continue; }
    const sd = await u.collection('data').doc('botlab_server').get(), srv = sd.exists ? sd.data() : {};
    { const sc = await u.collection('data').doc('scripts').get(); let it = sc.exists ? sc.data().items || '' : '', gz = typeof it === 'string' && it.startsWith('gz1:'); try { if (gz) it = require('zlib').gunzipSync(Buffer.from(it.slice(4), 'base64')).toString('utf8'); const v = JSON.parse(it || '[]'), l = Array.isArray(v) ? v : v.items || []; console.log(`Mis indicadores: ${l.length} scripts${gz ? ' (guardados comprimidos)' : ''} · ${l.map(x => x.id + ' «' + x.name + '»').join(', ')}`); } catch (e) { console.log('Mis indicadores: ilegibles · ' + e.message); } }
    const upd = bd.data().updatedAt && bd.data().updatedAt.toMillis ? bd.data().updatedAt.toMillis() : 0, kb = Math.round(JSON.stringify(bd.data()).length / 1024);
    console.log(`\n=== Cuenta ${++n}: ${(S.bots || []).length} bots · documento ${kb} KB · guardado por la app hace ${ago(upd)} · servidor: ${Object.keys(srv.results || {}).length} reentrenos, ${Object.keys(srv.paper || {}).length} con paper`);
    for (const b of S.bots || []) {
      const c = b.cycle || {}, r = (srv.results || {})[b.id], sp = (srv.paper || {})[b.id] || [];
      { const mv = (b.versions || []).find(v => v.v === b.mainV), sids = new Set(); const sp0 = mv && mv.spec; if (sp0) for (const g of [sp0.entry, sp0.exit]) for (const sd of ['long', 'short']) for (const cc of (g && g[sd]) || []) for (const x of [cc.a, cc.b]) if (x && x.k === 'user') sids.add(x.sid + ' «' + (x.sname || '') + '»'); if (sids.size) console.log('    usa tus indicadores: ' + [...sids].join(', ')); }
      console.log(`- ${b.name} [${b.status}]${b.preset ? ' preset ' + b.preset : ''} · v${b.mainV} · ciclo de mejora: ${c.enabled ? 'SÍ cada ' + (c.everyHours || 24) + ' h' : 'no'}${c.auto ? ' (aplica solo)' : ''}`);
      if (r) console.log(`    último reentreno del servidor: hace ${ago(r.at)} · ${r.status} · decisión ${r.decision || '—'}${r.reason ? ' · ' + String(r.reason).slice(0, 120) : ''}${r.monitor ? ` · ${r.monitor.n} ops de prueba, veredicto ${r.monitor.verdict}` : ''}`);
      for (const s of b.paper || []) { const ss = sp.find(x => x.id === s.id); console.log(`    paper ${s.spec && s.spec.symbol} ${s.spec && s.spec.interval} [${s.status}] · última vela (app) hace ${ago(s.last && s.last.t)} · (servidor) hace ${ago(ss && ss.last && ss.last.t)} · ${(s.ledger || []).length} cierres (app) / ${ss ? (ss.ledger || []).length : '—'} (servidor)${s.err ? ' · error: ' + String(s.err).slice(0, 100) : ''}${ss && ss.err ? ' · error servidor: ' + String(ss.err).slice(0, 100) : ''}`); }
      const hist = (b.journal || []).filter(h => /reentren|mejora|propuesta|aplic|versi/i.test((h.kind || '') + ' ' + (h.text || ''))).slice(-4);
      for (const h of hist) console.log(`    diario (hace ${ago(h.t)}): ${String(h.text || '').slice(0, 150)}`);
    }
  }
})().catch(e => { console.log('Error:', e.message); process.exit(1); });

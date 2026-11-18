// Bots repetidos de Nova Bot Lab (misma plantilla, p. ej. dos «Lucas 1H»): se queda el que MEJOR funciona y el otro se borra en todos tus dispositivos.
// «Mejor» = más ganancia neta en su simulación en vivo (paper); si empatan, mejor rendimiento en su backtest principal; si empatan, el más antiguo.
// Se corre a mano (.github/workflows/bots-dedupe.yml). APPLY=1 borra; sin APPLY solo muestra lo que haría. Imprime nombres y resultados de simulación, nada de la cuenta.
'use strict';
const net = b => (b.paper || []).reduce((s, x) => s + (x.ledger || []).reduce((t, l) => t + (+l.net || 0), 0), 0);
const ops = b => (b.paper || []).reduce((s, x) => s + (x.ledger || []).length, 0);
const bt = b => { const r = (b.runs || []).filter(x => x && x.metrics && x.v === b.mainV).slice(-1)[0] || (b.runs || []).filter(x => x && x.metrics).slice(-1)[0]; return r ? +r.metrics.retPct || 0 : -1e9; };
const better = (a, b) => net(a) !== net(b) ? net(a) > net(b) : bt(a) !== bt(b) ? bt(a) > bt(b) : (a.createdAt || 0) <= (b.createdAt || 0);
(async () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT; if (!raw) return console.log('Sin FIREBASE_SERVICE_ACCOUNT');
  const admin = require('firebase-admin'); admin.initializeApp({credential: admin.credential.cert(JSON.parse(raw))}); const db = admin.firestore(), now = Date.now(), APPLY = process.env.APPLY === '1';
  for (const u of await db.collection('users').listDocuments()) {
    const ref = u.collection('data').doc('botlab'), d = await ref.get(); if (!d.exists) continue; let S; try { S = JSON.parse(d.data().items || '{}'); } catch { continue; }
    const live = (S.bots || []).filter(b => b && b.status !== 'archived' && !((S.deleted || {})[b.id] >= (b.updatedAt || 0))), groups = new Map();
    for (const b of live) { const k = b.preset || ('nombre:' + String(b.name || '').trim().toLowerCase()); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
    const drop = [];
    for (const [k, g] of groups) { if (g.length < 2) continue; let keep = g[0]; for (const b of g.slice(1)) if (better(b, keep)) keep = b;
      console.log(`\n«${keep.name}» (${k}): ${g.length} copias`);
      for (const b of g) console.log(`  ${b === keep ? 'SE QUEDA' : 'SE BORRA'} · v${b.mainV} · simulación en vivo: ${ops(b)} operaciones, neto ${net(b).toFixed(2)} · backtest ${bt(b) === -1e9 ? '—' : bt(b).toFixed(2) + '%'} · creado ${b.createdAt ? new Date(b.createdAt).toISOString().slice(0, 10) : '—'}`);
      for (const b of g) if (b !== keep) drop.push(b); }
    if (!drop.length) { console.log('No hay bots repetidos.'); continue; }
    if (!APPLY) { console.log('\n(Solo vista previa: no se borró nada)'); continue; }
    const fd = await ref.get(), F = JSON.parse(fd.data().items || '{}'); F.deleted = F.deleted || {};
    for (const b of drop) { const cur = (F.bots || []).find(x => x.id === b.id); F.deleted[b.id] = Math.max(now, ((cur || b).updatedAt || 0) + 1); }
    F.bots = (F.bots || []).filter(x => !drop.some(b => b.id === x.id));
    await ref.set({items: JSON.stringify(F), updatedAt: admin.firestore.FieldValue.serverTimestamp()});
    const sref = u.collection('data').doc('botlab_server'), sd = await sref.get();
    if (sd.exists) { const v = sd.data(), upd = {}; for (const f of ['results', 'paper', 'brainMem']) if (v[f]) { const o = Object.assign({}, v[f]); for (const b of drop) delete o[b.id]; upd[f] = o; } await sref.set(upd, {merge: true}); }
    console.log(`\nBorrados ${drop.length} bot(s) repetidos en tu cuenta (desaparecen también en la app al abrirla).`);
  }
})().catch(e => { console.log('Error:', e.message); process.exit(1); });

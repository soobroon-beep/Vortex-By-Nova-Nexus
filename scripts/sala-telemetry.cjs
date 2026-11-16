'use strict';
// Auditor: solo lecturas Firestore. Nunca importa motores, conectores ni módulos de trading.
const fs=require('node:fs'),crypto=require('node:crypto');
const NAME='Sala · telemetría de solo lectura';
const stamp=()=>new Date().toISOString();
const toMs=v=>{const n=v?.toMillis?v.toMillis():typeof v==='string'?Date.parse(v):Number(v);return Number.isFinite(n)&&n>0?n:null};
const age=(v,now)=>{const t=toMs(v);return t===null?null:Math.max(0,Math.round((now-t)/60000))};
const alias=(key,type,id)=>type+'-'+crypto.createHmac('sha256',key).update(id).digest('hex').slice(0,10);
function botRecord(bot,server,key,now){
 const paper=Array.isArray(server.paper?.[bot.id])?server.paper[bot.id]:[],local=Array.isArray(bot.paper)?bot.paper:[];
 const sessions=[...new Map([...local,...paper].map((s,i)=>[s.id||'sin-id-'+i,s])).values()];const latest=Math.max(0,...sessions.map(s=>toMs(s.last?.t)||0));const active=sessions.filter(s=>s.status==='running');const err=sessions.filter(s=>s.err).length;
 const opens=active.filter(s=>s.open);const missing=opens.filter(s=>!(Number(s.open.sl)>0&&Number(s.open.tp)>0)).length;
 return {alias:alias(key,'bot',bot.id),estado_declarado:['running','active','paused','stopped','archived','draft','ready'].includes(bot.status)?bot.status:'otro',sesiones_servidor:paper.length,sesiones_app:local.length,sesiones_activas:active.length,ultima_vela_minutos:latest?age(latest,now):null,errores_observados:err,posiciones_paper_abiertas:opens.length,protecciones_paper_ausentes:missing,reentreno_minutos:age(server.results?.[bot.id]?.at,now),ciclo_habilitado:bot.cycle?.enabled===true,alcance:'Estado persistido y sesiones paper; no confirma órdenes reales ni ejecución actual del proceso.'};
}
function brainRecord(id,b,notes,key,now){
 const learned=toMs(b.learned?.at),lastNote=Math.max(0,...notes.map(n=>toMs(n.updatedAt||n.createdAt)||0));
 return {alias:alias(key,'cerebro',id),bot_alias:b.bot?.id?alias(key,'bot',b.bot.id):null,tipo:b.kind==='bot'?'bot':'general',aprendizaje_automatico:b.autoLearn!==false,aprendizaje_registrado:!!(learned&&String(b.learned?.text||'').trim()),ultimo_aprendizaje:learned?new Date(learned).toISOString():null,aprendizaje_minutos:age(learned,now),notas_contadas:notes.length,notas_posteriores:!!(lastNote&&(!learned||lastNote>learned)),salida_vortex:b.toVortex===true,alcance:'Existencia y fecha de un aprendizaje guardado; no evalúa calidad ni demuestra mejora autónoma.'};
}
async function collect(){
 const now=Date.now(),report={version_telemetria:1,fecha:stamp(),solo_lectura:true,resultado:'NO SE PUDO COMPROBAR',bots:[],cerebros:[],conexiones:[],bloqueos:[],limites:{cuentas:10,bots_por_cuenta:100,cerebros_por_cuenta:100,notas_por_cerebro:100},cobertura_completa:false};
 if(!process.env.FIREBASE_SERVICE_ACCOUNT){report.bloqueos.push('Credencial de servidor no disponible.');return report;}
 const admin=require('firebase-admin'),cred=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT),key=cred.private_key;
 const vx=admin.initializeApp({credential:admin.credential.cert(cred)},'sala-vortex');const db=vx.firestore();
 const nb=admin.initializeApp({credential:admin.credential.cert(cred),projectId:'neural-brain-148a4'},'sala-neural').firestore();
 try{const snap=await db.doc('server/motor').get();report.motor={latido_minutos:age(snap.data()?.beat,now)};}catch{report.bloqueos.push('No se pudo leer el latido del motor.');}
 try{const users=await db.collection('users').listDocuments();report.cuentas_limitadas=users.length>10;
  for(const u of users.slice(0,10)){try{const [bd,sd]=await Promise.all([u.collection('data').doc('botlab').get(),u.collection('data').doc('botlab_server').get()]);if(!bd.exists)continue;let items=bd.data().items||'{}';if(typeof items==='string'&&items.startsWith('gz1:'))items=require('node:zlib').gunzipSync(Buffer.from(items.slice(4),'base64'),{maxOutputLength:2000000}).toString();const state=typeof items==='string'?JSON.parse(items):items;const bots=Array.isArray(state)?state:state.bots||[];if(bots.length>100)report.bloqueos.push('Inventario de bots limitado a 100 por cuenta.');for(const b of bots.slice(0,100))if(b?.id)report.bots.push(botRecord(b,sd.data()||{},key,now));}catch{report.bloqueos.push('Una cuenta de bots no se pudo leer.');}}
 }catch{report.bloqueos.push('No se pudo consultar el inventario privado de bots.');}
 try{const users=await nb.collection('users').listDocuments();if(users.length>10)report.bloqueos.push('Inventario de cerebros limitado a diez cuentas.');
  for(const u of users.slice(0,10)){try{const brains=await u.collection('brains').limit(101).get();if(brains.size>100)report.bloqueos.push('Inventario de cerebros limitado a cien por cuenta.');for(const b of brains.docs.slice(0,100)){const notes=await b.ref.collection('notes').limit(100).get();report.cerebros.push(brainRecord(b.id,b.data(),notes.docs.map(n=>n.data()),key,now));}for(const app of ['vortex','novahub']){const sync=await u.collection('sync').doc(app).get(),d=sync.data();if(d)report.conexiones.push({aplicacion:app,ultima_sincronizacion:toMs(d.at)?new Date(toMs(d.at)).toISOString():null,sincronizacion_minutos:age(d.at,now),eventos_ultima_ronda:Number.isFinite(d.lastEvents)?d.lastEvents:null});}}catch{report.bloqueos.push('Una cuenta de Neural Brain no se pudo leer.');}}
 }catch{report.bloqueos.push('No se pudo consultar Neural Brain con la conexión existente.');}
 report.bloqueos=[...new Set(report.bloqueos)];report.resultado=report.bloqueos.length?'NO SE PUDO COMPROBAR':'FUNCIONA';return report;
}
async function main(){
 let report;try{report=await collect();}catch{report={version_telemetria:1,fecha:stamp(),resultado:'NO SE PUDO COMPROBAR',solo_lectura:true,bots:[],cerebros:[],conexiones:[],bloqueos:['No se pudo completar la lectura. No se publican mensajes internos ni credenciales.']};}
 fs.mkdirSync('out-sala',{recursive:true});fs.writeFileSync('out-sala/telemetria.json',JSON.stringify(report,null,2));
 const summary=`Lectura de servidor: ${report.resultado}. ${report.bots.length} bots y ${report.cerebros.length} cerebros observados. No certifica órdenes reales ni calidad de aprendizaje.`;
 const body={name:NAME,head_sha:process.env.GITHUB_SHA,status:'completed',conclusion:'neutral',output:{title:'Telemetría observada · solo lectura',summary,text:JSON.stringify(report)}};
 if(Buffer.byteLength(body.output.text)>58000){report.bots=report.bots.slice(0,30);report.cerebros=report.cerebros.slice(0,30);report.bloqueos.push('Índice limitado: consultar artefacto completo.');body.output.text=JSON.stringify(report);}
 const response=await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/check-runs`,{method:'POST',headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!response.ok)throw Error('No se pudo registrar telemetría: HTTP '+response.status);console.log(summary);
}
module.exports={botRecord,brainRecord,age};if(require.main===module)main().catch(()=>{console.error('Falló la entrega de telemetría; consultar el artefacto seguro.');process.exitCode=1});

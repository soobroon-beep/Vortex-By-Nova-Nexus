const test=require('node:test');test('pausar cierra la posición y conserva el historial',()=>{
const P=require('../botlab-paper.js');const assert=require('assert');
const s=P.newSession({id:'a',v:1,spec:{symbol:'BTCUSDT',interval:'1h',risk:{capital:1000}},capital:1000,startT:1});
s.open={side:'long',entryT:5,entry:100,qty:2,unreal:10};s.last={t:9,c:105};
P.closeOpen(s,10,'x');assert.equal(s.ledger.length,1);assert.equal(s.cash,1010);assert.ok(P.verify(s));assert.equal(s.open,null);console.log('ok',P.stats(s).nClosed);
});

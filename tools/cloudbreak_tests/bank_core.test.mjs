import assert from 'node:assert/strict';
import {mkPlayer,handlers,players} from '@minecraft/server';
import * as C from './clans.js';
import * as B from './bank.js';
import * as K from './core.js';
import {setBalance,getBalance,sellMult} from './eco/economy.js';
let n=0; const t=(name,f)=>{f();n++;console.log('ok -',name);};
const [a,b]=['A','B'].map((x,i)=>mkPlayer('q'+i,x));
const clan=C.createClan(a,'Bankers').clan; clan.island={slot:0,x:20000,y:100,z:20000,size:100}; C.saveClan(clan);
C.invitePlayer(a,b); C.acceptInvite(b);
K.registerCore();
t('deposit/withdraw rules',()=>{setBalance(a,100000);setBalance(b,50000);assert.equal(B.deposit(a,200000).ok,false);assert.ok(B.deposit(a,60000).ok);assert.ok(B.deposit(b,50000).ok);assert.equal(B.bankOf(C.getClan(clan.id)),110000);assert.equal(B.withdraw(b,1000).ok,false,'member cannot withdraw');assert.ok(B.withdraw(a,10000).ok);assert.equal(getBalance(a),50000);assert.equal(B.withdraw(a,1e9).ok,false);assert.equal(C.getClan(clan.id).ledger.length,3);});
t('upgrade by member, cost doubles, size grows',()=>{assert.ok(K.buyUpgrade(b,'size').ok);let c=C.getClan(clan.id);assert.equal(c.island.size,125);assert.equal(B.bankOf(c),50000);assert.equal(K.buyUpgrade(b,'size').ok,false,'needs 100k');assert.equal(c.spent,50000);});
const tick=()=>handlers.load.forEach(h=>h());
t('sell multiplier active',()=>{const c=C.getClan(clan.id);c.up.sell=4;C.saveClan(c);assert.equal(sellMult(a),2);});
t('tax charges hourly while online, grace, shield down, restore',()=>{
  // run taxTick directly via an exported helper: simulate 60 minutes
  const c=C.getClan(clan.id); c.bank=15000; C.saveClan(c);
  for(let i=0;i<60;i++) K._taxTickForTests();
  assert.equal(C.getClan(clan.id).bank,5000,'paid 10k');
  for(let i=0;i<60;i++) K._taxTickForTests();
  let cc=C.getClan(clan.id); assert.ok(cc.owed); assert.ok(cc.unpaidSince); assert.ok(!cc.shieldDown);
  cc.unpaidSince=Date.now()-31*60000; C.saveClan(cc); K._taxTickForTests();
  cc=C.getClan(clan.id); assert.equal(cc.shieldDown,true); assert.equal(sellMult(a),1,'upgrades off'); assert.equal(K.activeLevel(cc,'size'),1,'size stays');
  cc.bank=20000; C.saveClan(cc); K.settleTax(cc); cc=C.getClan(clan.id); assert.equal(cc.shieldDown,false); assert.equal(cc.bank,10000); assert.equal(sellMult(a),2);
});
t('no tax while everyone offline',()=>{players.splice(0); const before=C.getClan(clan.id).taxSeconds; K._taxTickForTests(); assert.equal(C.getClan(clan.id).taxSeconds,before);});
console.log(`\n${n} tests passed`);

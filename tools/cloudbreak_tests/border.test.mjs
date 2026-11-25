import assert from 'node:assert/strict';
import {mkPlayer} from '@minecraft/server';
import * as C from './clans.js';
import {inBorder} from './islands.js';
import {patchesFor} from './border.js';
let n=0; const t=(name,f)=>{f();n++;console.log('ok -',name);};
const a=mkPlayer('b0','Edge'); a.dimension={id:'minecraft:overworld'};
const clan=C.createClan(a,'Edgy').clan; clan.island={slot:0,x:20000,y:100,z:20000,size:100}; C.saveClan(clan);
t('no wall in the middle of the island',()=>{a.location={x:20000.5,y:101,z:20000.5}; assert.equal(patchesFor(a).length,0);});
t('east wall appears near the east edge, in the first block outside the border',()=>{
  a.location={x:20045.5,y:101,z:20003.5};
  const w=patchesFor(a); assert.equal(w.length,1); assert.equal(w[0].type,'cb:border_x');
  const x=w[0].from.x; assert.ok(inBorder(clan,{x:x-1,y:0,z:20000})); assert.ok(!inBorder(clan,{x,y:0,z:20000}));
  assert.equal(w[0].to.z-w[0].from.z,16);
});
t('a corner shows both walls',()=>{a.location={x:20048.5,y:101,z:19952.5}; const w=patchesFor(a); assert.deepEqual(w.map(x=>x.type).sort(),['cb:border_x','cb:border_z']);});
t('bigger island moves the wall out',()=>{clan.island.size=150; C.saveClan(clan); a.location={x:20073.5,y:101,z:20000.5}; const w=patchesFor(a); assert.equal(w[0].from.x,20076);});
console.log(`\n${n} tests passed`);

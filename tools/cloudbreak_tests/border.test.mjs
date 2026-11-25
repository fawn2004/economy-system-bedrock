import assert from 'node:assert/strict';
import {mkPlayer} from '@minecraft/server';
import * as C from './clans.js';
import {inBorder} from './islands.js';
import {patchesFor, allowedAt} from './border.js';
let n=0; const t=(name,f)=>{f();n++;console.log('ok -',name);};
const a=mkPlayer('b0','Edge'); a.dimension={id:'minecraft:overworld'};
const clan=C.createClan(a,'Edgy').clan; clan.island={slot:0,x:20000,y:100,z:20000,size:100}; C.saveClan(clan);
t('no wall in the middle of the island',()=>{a.location={x:20000.5,y:101,z:20000.5}; assert.equal(patchesFor(a).length,0);});
t('east wall appears near the east edge, in the first block outside the border',()=>{
  a.location={x:20045.5,y:101,z:20003.5};
  const w=patchesFor(a); assert.equal(w.length,1); assert.equal(w[0].type,'cb:border_x');
  const x=w[0].from.x; assert.ok(inBorder(clan,{x:x-1,y:0,z:20000})); assert.ok(!inBorder(clan,{x,y:0,z:20000}));
  assert.equal(w[0].to.z-w[0].from.z,24);
});
t('a corner shows both walls',()=>{a.location={x:20048.5,y:101,z:19952.5}; const w=patchesFor(a); assert.deepEqual(w.map(x=>x.type).sort(),['cb:border_x','cb:border_z']);});
t('bigger island moves the wall out',()=>{clan.island.size=150; C.saveClan(clan); a.location={x:20073.5,y:101,z:20000.5}; const w=patchesFor(a); assert.equal(w[0].from.x,20076);});
t('wall runs from the bottom of the world to the top',()=>{a.location={x:20073.5,y:101,z:20000.5}; const w=patchesFor(a)[0]; assert.equal(w.from.y,-64); assert.equal(w.to.y,319);});
t('players can be inside but not outside the border',()=>{
  assert.ok(allowedAt(a,{x:20070.5,y:101,z:20000.5}));
  assert.ok(!allowedAt(a,{x:20080.5,y:101,z:20000.5}));
});
t('admins can go past it (any capitals, or an operator)',()=>{
  a.addTag('Admin'); assert.ok(allowedAt(a,{x:20080.5,y:101,z:20000.5})); a.removeTag('Admin');
  a.playerPermissionLevel=2; assert.ok(allowedAt(a,{x:20080.5,y:101,z:20000.5})); delete a.playerPermissionLevel;
  assert.ok(!allowedAt(a,{x:20080.5,y:101,z:20000.5}));
});
console.log(`\n${n} tests passed`);

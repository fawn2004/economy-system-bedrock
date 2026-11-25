import assert from 'node:assert/strict';
import {mkPlayer} from '@minecraft/server';
import {ActionFormData, shown} from '@minecraft/server-ui';
import * as C from './clans.js';
import * as M from './menus.js';
import {UPGRADES} from './config.js';
let n=0; const t=async(name,f)=>{await f();n++;console.log('ok -',name);};
const a=mkPlayer('ct0','Ash');
const clan=C.createClan(a,'Night').clan; clan.island={slot:0,x:20000,y:100,z:20000,size:100}; clan.bank=500000; C.saveClan(clan);
const last=()=>shown[shown.length-1];
await t('terminal form uses the terminal marker and tags every button',async()=>{
  await M.coreTerminal(a);
  const f=last();
  assert.ok(f._title.startsWith('§c§t§m§r'),'terminal marker');
  assert.ok(!f._title.includes('§e§c§o'),'not the tile layout');
  assert.ok(f._title.includes('[ON]'),'shield badge');
  const tags=f._buttons.map(b=>b.text.match(/^\[(MOD|DEP|TAB|HDR)\]/)?.[1]);
  assert.equal(tags.filter(x=>x==='MOD').length,UPGRADES.length);
  assert.deepEqual(tags.slice(UPGRADES.length),['DEP','TAB','TAB','TAB','TAB','TAB','HDR']);
  assert.ok(f._buttons[UPGRADES.length+1].text.includes('[ON]'),'Modules tab is open');
  assert.ok(f._body.includes('ISLAND CORE'));
  for(const b of f._buttons.slice(0,UPGRADES.length)) assert.ok(b.icon,'module icon');
});
await t('tapping a module card asks to upgrade it',async()=>{
  ActionFormData.queue.push(0);
  await M.coreTerminal(a);
  assert.ok(shown.length>=3);
});
console.log(`\n${n} tests passed`);

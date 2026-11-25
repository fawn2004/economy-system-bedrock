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
const tagsOf=(f)=>f._buttons.map(b=>b.text.match(/^\[([A-Z0-9_]+)\]/)?.[1]);
await t('core terminal: its screen marker, module cards first, every button tagged',async()=>{
  await M.coreTerminal(a);
  const f=last();
  assert.ok(f._title.startsWith('§c§b§t§r'),'terminal marker');
  const tags=tagsOf(f);
  assert.deepEqual(tags.slice(0,UPGRADES.length),UPGRADES.map(()=> 'MOD'),'grid items come first');
  assert.ok(tags.every(Boolean),'every button has a zone tag');
  for(const b of f._buttons.slice(0,UPGRADES.length)) assert.ok(b.icon,'module icon');
});
await t('tapping a module card upgrades it straight away (no confirm)',async()=>{
  const before=C.getClan(clan.id).up?.size ?? 0;
  const bank=C.getClan(clan.id).bank;
  ActionFormData.queue.push(0); // first card = Island Size
  await M.coreTerminal(a);
  const c=C.getClan(clan.id);
  assert.equal(c.up.size, before+1, 'level went up');
  assert.ok(c.bank < bank, 'paid from the clan bank');
  assert.ok(last()._title.startsWith('§c§b§t§r'), 'back on the Core Terminal, not a confirm screen');
});
await t('every menu screen opens with its own marker',async()=>{
  const want={tower:'0',members:'1',bank:'2',dispatch:'5',insurance:'6',raidlog:'9',boards:'a'};
  const calls={tower:()=>M.tower(a),members:()=>M.membersMenu(a),bank:()=>M.bankMenu(a),dispatch:()=>M.raidMenu(a),insurance:()=>M.insuranceMenu(a),raidlog:()=>M.raidLogMenu(a),boards:()=>M.leaderboardsMenu(a)};
  for(const [id,fn] of Object.entries(calls)){
    await fn();
    const f=last();
    assert.ok(f._title.startsWith(`§c§b§${want[id]}§r`),id);
    assert.ok(tagsOf(f).every(Boolean),`${id}: every button has a zone tag`);
  }
});
await t('main menu: one tap on a tile opens that menu (no floors, no Core Terminal)',async()=>{
  await M.tower(a);
  const f=last();
  const tiles=f._buttons.filter(b=>b.text.startsWith('[TL]'));
  assert.ok(tiles.length>=9 && tiles.length<=10);
  assert.ok(!f._buttons.some(b=>/floor|core terminal/i.test(b.text)),'no floors, no terminal tile');
  const bank=f._buttons.findIndex(b=>b.text.startsWith('[TL]')&&b.text.includes('Clan Bank'));
  ActionFormData.queue.push(bank);
  await M.tower(a);
  assert.ok(last()._title.startsWith('§c§b§2§r'),'the Clan Bank screen opened');
});
await t('Back returns to the main menu, or to the Core Terminal when opened from it',async()=>{
  const backIdx=()=>last()._buttons.findIndex(b=>b.text.startsWith('[BACK]'));
  // main menu -> Clan Bank -> Back
  await M.tower(a);
  const bankTile=last()._buttons.findIndex(b=>b.text.startsWith('[TL]')&&b.text.includes('Clan Bank'));
  ActionFormData.queue.push(bankTile); await M.tower(a);
  assert.ok(last()._title.startsWith('§c§b§2§r'),'bank open'); assert.ok(backIdx()>=0,'bank has a back arrow');
  ActionFormData.queue.push(backIdx()); await M.bankMenu(a);
  assert.ok(last()._title.startsWith('§c§b§0§r'),'back to the main menu');
  // Core Terminal -> Upkeep tab -> Back
  await M.coreTerminal(a);
  const upkeep=last()._buttons.findIndex(b=>b.text.startsWith('[TAB]')&&b.text.includes('Upkeep'));
  ActionFormData.queue.push(upkeep); await M.coreTerminal(a);
  ActionFormData.queue.push(backIdx()); await M.bankMenu(a);
  assert.ok(last()._title.startsWith('§c§b§t§r'),'back to the Core Terminal');
  // no back arrow on the main menu or the Core Terminal
  await M.tower(a); assert.equal(backIdx(),-1);
  await M.coreTerminal(a); assert.equal(backIdx(),-1);
});
console.log(`\n${n} tests passed`);

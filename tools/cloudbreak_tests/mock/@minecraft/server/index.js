const props=new Map();
export const handlers={};
const sig=(n)=>({subscribe:(f)=>{(handlers[n]??=[]).push(f);return f;}});
export const players=[];
export const world={
  getDynamicProperty:(k)=>props.get(k), setDynamicProperty:(k,v)=>v===undefined?props.delete(k):props.set(k,v),
  getPlayers:(o)=>o?.name?players.filter(p=>p.name===o.name):players, getEntity:(id)=>players.find(p=>p.id===id),
  getDimension:()=>({id:'minecraft:overworld',getBlock:(l)=>({isValid:true,typeId:'minecraft:air',location:l,setPermutation(){}}),fillBlocks(){} }),
  beforeEvents:{playerBreakBlock:sig('break'),playerInteractWithBlock:sig('interact'),explosion:sig('explosion'),entityHurt:sig('hurt')},
  afterEvents:{worldLoad:sig('load'),playerSpawn:sig('spawn'),itemUse:sig('use'),playerBreakBlock:sig('abreak'),playerLeave:sig('leave'),playerPlaceBlock:sig('place'),entityDie:sig('die')},
};
export const system={run:(f)=>f(),runTimeout:(f)=>f(),waitTicks:async()=>{},afterEvents:{scriptEventReceive:sig('se')},beforeEvents:{startup:sig('startup')}};
export class BlockPermutation{static resolve(){return {};}} export class BlockVolume{} export class ItemStack{} export const ItemTypes={get:()=>true};
export const ItemLockMode={inventory:'inventory'}; export const CommandPermissionLevel={Any:0}; export const CustomCommandParamType={String:'String',Enum:'Enum'}; export const CustomCommandStatus={Success:0,Failure:1};
export function mkPlayer(id,name,tags=[]){const pp=new Map();const p={id,name,isValid:true,tags:new Set(tags),addTag(t){this.tags.add(t)},removeTag(t){this.tags.delete(t)},teleport(l){this.location=l},addEffect(){},setSpawnPoint(){},playSound(){},location:{x:0,y:0,z:0},dimension:{id:'minecraft:overworld'},isSneaking:false,msgs:[],sendMessage(m){this.msgs.push(m)},getDynamicProperty:(k)=>pp.get(k),setDynamicProperty:(k,v)=>v===undefined?pp.delete(k):pp.set(k,v),hasTag(t){return this.tags.has(t)},onScreenDisplay:{setActionBar(){},setTitle(){}}};players.push(p);return p;}
export const _props=props;
export const BlockStates={get:()=>({validValues:[0,1,2,3,4,5,6,7]})};

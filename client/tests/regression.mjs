import {TREASURES,TREASURE_KEYS,keyGoals} from '../dist/treasure-data.js';
import {createAdventureStore} from '../dist/adventure-state.js';
import {BUILDINGS} from '../dist/buildings.js';
import assert from 'node:assert/strict';
import * as THREE from '../dist/three.module.js';
import {setupRpg} from '../dist/rpg.js';
import {CREATURES,REGIONS} from '../dist/rpg-data.js';
import {createFishingStore} from '../dist/fishing-state.js';
import {parkPosition} from '../dist/magic-data.js';
import {CHAPTERS} from '../dist/adventure-data.js';
const nodes=new Map(),all=[],ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
const make=(id='')=>({id,tagName:'DIV',innerHTML:'',textContent:'',value:'',hidden:false,open:false,disabled:false,style:{},dataset:{},listeners:{},children:[],classList:{add(){},remove(){},toggle(){}},append(...x){this.children.push(...x)},setAttribute(){},addEventListener(k,f){(this.listeners[k]||=[]).push(f)},showModal(){this.open=true},close(){this.open=false;for(const f of this.listeners.close||[])f({})},getBoundingClientRect:()=>({width:700,height:650,left:0,top:0}),getContext:id==='#rpg-preview'?undefined:()=>ctx,clientWidth:360,clientHeight:320,click(){this.onclick?.()},focus(){},select(){}});
function el(id){if(id==='dialog[open]')return [...nodes.values()].find(x=>x.open)||null;if(!nodes.has(id))nodes.set(id,make(id));return nodes.get(id)}
const tabs=['map','book'].map(id=>{const b=make();b.dataset.rpgTab=id;return b});
globalThis.document={hidden:false,querySelector:el,querySelectorAll:s=>s==='dialog[open]'?[...nodes.values()].filter(x=>x.open):s==='[data-rpg-tab]'?tabs:s==='[data-ad-tab]'?all.filter(x=>x.dataset.adTab):[],createElement:tag=>{const e=make();e.tagName=tag.toUpperCase();all.push(e);return e},body:make('body')};globalThis.window={};globalThis.addEventListener=()=>{};globalThis.devicePixelRatio=1;globalThis.innerWidth=1440;globalThis.innerHeight=900;Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
// The island reads missions.json the way the browser does; serve it from disk.
globalThis.fetch=async(u)=>{const {readFile}=await import('node:fs/promises');const {fileURLToPath}=await import('node:url');const dir=fileURLToPath(new URL('../dist/',import.meta.url));const text=await readFile(dir+String(u),'utf8');return {ok:true,status:200,async json(){return JSON.parse(text)}}};
const saves=new Map([['uspeak-fishing-v1',JSON.stringify({coins:12000,inventory:{'fish-1':2},caught:2})],['uspeak-avatar-v1','avatar-progress']]);globalThis.localStorage={getItem:k=>saves.get(k)||null,setItem:(k,v)=>saves.set(k,v)};
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),player=new THREE.Group(),water=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial());scene.add(player,water);const geo=new THREE.BoxGeometry(),materials=new Map();const box=(x,y,z,w,h,d,c,parent=scene)=>{if(!materials.has(c))materials.set(c,new THREE.MeshStandardMaterial({color:c}));const m=new THREE.Mesh(geo,materials.get(c));m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);return m};const messages=[],learned=[],park={state:{busy:false,inPark:false},arrive(v){this.state.inPark=v}},fishing={open(name){this.lastPage=name},store:createFishingStore(localStorage),refreshWallet(){},state:{busy:false},isOpen:false,setTravelContext(f,op){this.away=f}};
const rpg=setupRpg({scene,camera,player,water,box,park,fishing,avatars:{isOpen:false,config:{id:'kai'}},atmosphere:{state:{night:0,targetNight:0}},toast:m=>messages.push(m),speak(){},learn:(...v)=>learned.push(v),getBaseXp:()=>0});
async function action(name,data={}){const b={dataset:{adAction:name,...data},disabled:false};for(const f of el('#rpg-content').listeners.click||[])await f({target:{closest:()=>b}})}
const html=()=>el('#rpg-content').innerHTML;

async function magicAction(name,data={}){const b={dataset:{magicAction:name,...data},disabled:false};for(const f of el('#rpg-content').listeners.click||[])await f({target:{closest:s=>s==='[data-magic-action]'?b:null}})}
rpg.adventure.open('journey');await action('starter');rpg.close();
const room=rpg.adventure.magic.interior,originalSave=JSON.stringify(rpg.store.state),originalBag=JSON.stringify(fishing.store.state);
assert.equal(rpg.insidePark,false);assert.equal(rpg.interiorScene,null);rpg.adventure.magic.open();await magicAction('visit');assert.equal(rpg.insidePark,true);assert.equal(el('#rpg-dialog').open,false,'entering opens the actual room, not a modal');assert.equal(player.parent,room.scene);assert.notEqual(rpg.interiorScene,scene);assert.equal(room.origin,'willow');assert.equal(rpg.blocked(0,6.3),false);assert.equal(rpg.blocked(0,-6),true);assert.equal(rpg.blocked(14,0),true);assert.equal(rpg.blocked(0,10.2),true);assert.equal(rpg.nearby(),null);assert.equal(fishing.away(),true);assert.equal(rpg.encounter('companion-1'),false);assert.equal(rpg.mapSmall(ctx),true);
assert.ok(room.scene.children.some(g=>g!==player&&g.userData.archetype),'buddy is in the room scene');
// Buying/healing requires the corresponding indoor counter.
rpg.adventure.progress.setHealth('companion-1',1);rpg.adventure.magic.open('care');await magicAction('heal');assert.equal(rpg.adventure.progress.health('companion-1').hp,1);await magicAction('counter');assert.equal(room.at('care'),true);await magicAction('heal');assert.equal(rpg.adventure.progress.health('companion-1').hp,rpg.adventure.progress.health('companion-1').max);rpg.close();assert.equal(rpg.insidePark,true);
room.go('wands');assert.equal(rpg.parkNearby(),true);assert.ok(rpg.sanctuaryLabel.includes('杖'));rpg.openSanctuary();assert.ok(html().includes('星詠みの杖'));await magicAction('buy',{id:'tide'});assert.equal(fishing.store.state.coins,11880);assert.equal(fishing.store.state.wand,'tide');await magicAction('buy',{id:'tide'});assert.equal(fishing.store.state.coins,11880);rpg.close();room.go('legends');rpg.openSanctuary();assert.ok(html().includes('10'));rpg.close();
rpg.interiorCamera({yaw:.55,pitch:.04,zoom:32,dt:.016,firstPerson:false});assert.ok(camera.position.toArray().every(Number.isFinite));rpg.interiorCamera({yaw:1,pitch:.1,zoom:32,dt:.016,firstPerson:true});assert.equal(camera.position.x,player.position.x);
assert.equal(rpg.leaveSanctuary(),true);assert.equal(rpg.insidePark,false);assert.equal(player.parent,scene);assert.equal(player.position.x,0);assert.equal(player.position.z,0);assert.equal(rpg.interiorScene,null);assert.equal(JSON.stringify(rpg.store.state),originalSave);assert.equal(saves.get('uspeak-avatar-v1'),'avatar-progress');assert.deepEqual(fishing.store.state.inventory,JSON.parse(originalBag).inventory);
// Every existing region returns to its own entrance and all counters are reachable.
rpg.store.restore({...rpg.store.state,legacyCleared:REGIONS.map(r=>r.id),rulesVersion:2});
for(const r of [{id:'willow'},...REGIONS]){rpg.activate(r.id);const p=parkPosition(r.id);player.position.set(p.x,0,p.z+5);rpg.openSanctuary();assert.equal(room.active,true,r.id);assert.equal(room.origin,r.id);const queue=[[0,6]],seen=new Set(['0,6']);for(let i=0;i<queue.length;i++){const [x,z]=queue[i];for(const [dx,dz]of [[.5,0],[-.5,0],[0,.5],[0,-.5]]){const nx=x+dx,nz=z+dz,key=nx+','+nz;if(seen.has(key)||room.blocked(nx,nz))continue;seen.add(key);queue.push([nx,nz]);}}for(const s of room.stations)assert.ok(queue.some(([x,z])=>Math.hypot(x-s.x,z-s.z)<s.radius),r.id+' '+s.id);room.update(10,2,false);player.position.set(0,0,9.3);room.update(11,.016,false);assert.equal(room.active,false);assert.equal(rpg.state.current,r.id);assert.equal(player.position.x,p.x);assert.equal(player.position.z,p.z+5);assert.equal(player.parent,scene);room.update(13,2,false);player.position.set(p.x,0,p.z+3.3);room.update(13.1,.016,false);assert.equal(room.active,true,'walking through door auto-enters '+r.id);rpg.leaveSanctuary();}
rpg.activate('willow');player.position.set(0,0,0);rpg.openSanctuary();assert.equal(room.active,true);assert.equal(rpg.fly('meadow'),true);assert.equal(room.active,false,'flight leaves indoor scene cleanly');assert.equal(player.parent,scene);rpg.finishFlight();assert.equal(rpg.state.current,'meadow');assert.equal(rpg.insidePark,false);assert.equal(rpg.interiorScene,null);assert.equal(saves.get('uspeak-avatar-v1'),'avatar-progress');
console.log('PASS: independent indoor scene; entry via doorway and menu; counter interactions, heal and coin purchase; room collision/navigation; indoor minimap/cameras; buddy reparenting; exit and return to all 11 island entrances; flight cleanup; save and inventory retention. Mocked DOM and renderer, real Three.js geometry; no GPU/browser QA.');

const callbackServices=[];
assert.equal(new Set(BUILDINGS.map(b=>b.id)).size,BUILDINGS.length);
for(const b of BUILDINGS){
 rpg.activate(b.region);player.position.set(b.x,0,b.z+b.dir*.8);assert.equal(rpg.parkNearby(),true,b.id+' near');assert.ok(rpg.sanctuaryLabel.includes(b.name));rpg.openSanctuary();assert.equal(room.active,true,b.id+' E enters');assert.equal(room.building.id,b.id);assert.equal(player.parent,room.scene);
 const queue=[[0,6]],seen=new Set(['0,6']);for(let i=0;i<queue.length;i++){const [x,z]=queue[i];for(const [dx,dz]of [[.5,0],[-.5,0],[0,.5],[0,-.5]]){const nx=x+dx,nz=z+dz,key=nx+','+nz;if(seen.has(key)||room.blocked(nx,nz))continue;seen.add(key);queue.push([nx,nz])}}for(const station of room.stations)assert.ok(queue.some(([x,z])=>Math.hypot(x-station.x,z-station.z)<station.radius),b.id+' reachable '+station.id);
 assert.equal(room.blocked(0,-6),true);assert.equal(room.blocked(0,6.3),false);assert.equal(rpg.mapSmall(ctx),true);room.go(b.service);
 if(['bag','shop'].includes(b.service)){rpg.openSanctuary();assert.equal(fishing.lastPage,b.service)}
 if(b.service==='rest'){rpg.adventure.progress.setHealth('companion-1',1);rpg.openSanctuary();assert.equal(rpg.adventure.progress.health('companion-1').hp,rpg.adventure.progress.health('companion-1').max)}
 if(b.service==='story'){rpg.openSanctuary();assert.ok(html().includes(CHAPTERS[b.region].title));rpg.close()}
 el('#dialog').showModal();rpg.leaveSanctuary();assert.equal(el('#dialog').open,false);assert.equal(player.parent,scene);assert.equal(rpg.state.current,b.region);assert.equal(player.position.x,b.x);assert.ok(Math.abs(player.position.z-b.z)<2);assert.equal(rpg.interiorScene,null);
 room.update(20,2,false);assert.equal(room.active,false,'exit does not bounce '+b.id);player.position.set(b.x,0,b.z);room.update(21,.016,false);assert.equal(room.active,true,'automatic door '+b.id);rpg.leaveSanctuary();
}
console.log('PASS: all '+BUILDINGS.length+' building entrances, automatic transitions, BFS reception and exit accessibility, themed collisions, fishing service bridge, inn healing, shrine story, dialog cleanup, same-door return and no reentry bounce.');

const progress=rpg.adventure.progress,treasure=rpg.adventure.treasure;
assert.equal(TREASURES.length,36);assert.equal(new Set(TREASURES.map(c=>c.id)).size,36);
for(const id of new Set(TREASURES.map(c=>c.region)))assert.equal(TREASURES.filter(c=>c.region===id).length,3);
const unlocked=TREASURES.find(c=>!c.key),locked=TREASURES.find(c=>c.key==='bronze');
assert.throws(()=>progress.claimTreasure(locked.id,locked.region),/鍵/);assert.throws(()=>progress.claimTreasure(unlocked.id,'sky'),/場所/);
const dust=progress.state.stardust;progress.claimTreasure(unlocked.id,unlocked.region);assert.equal(progress.state.stardust,dust+20);assert.throws(()=>progress.claimTreasure(unlocked.id,unlocked.region),/開封済み/);assert.equal(progress.state.stardust,dust+20);
for(const key of TREASURE_KEYS){assert.throws(()=>progress.claimTreasureKey(key.id,key.region),/封印/);const backup=progress.backup();backup.adventure.story[key.region]=2;backup.adventure.badges=key.badges?REGIONS.slice(0,6).map(r=>r.id).concat([key.region]):[];progress.restore(backup);assert.ok(keyGoals(key,progress.state).every(g=>g.done));assert.throws(()=>progress.claimTreasureKey(key.id,'willow'),/祭壇/);progress.claimTreasureKey(key.id,key.region);assert.throws(()=>progress.claimTreasureKey(key.id,key.region),/入手済み/);}
for(const c of TREASURES.filter(c=>c.key))progress.claimTreasure(c.id,c.region);assert.equal(progress.state.treasureKeys.length,3,'keys are reusable');assert.equal(progress.state.treasureOpened.length,25);assert.equal(TREASURES.filter(c=>c.relic&&progress.state.treasureOpened.includes(c.id)).length,12);
const reloaded=createAdventureStore(localStorage,rpg.store);assert.deepEqual(reloaded.state.treasureOpened,progress.state.treasureOpened);assert.deepEqual(reloaded.state.treasureKeys,progress.state.treasureKeys);assert.equal(reloaded.state.stardust,progress.state.stardust);
const closed=TREASURES.find(c=>!progress.state.treasureOpened.includes(c.id)),before=progress.state,set=localStorage.setItem;localStorage.setItem=()=>{throw Error('quota')};assert.throws(()=>progress.claimTreasure(closed.id,closed.region),/保存/);assert.deepEqual(progress.state,before);localStorage.setItem=set;
for(const c of TREASURES){rpg.activate(c.region);player.position.set(c.x,0,c.z+1.9);assert.equal(treasure.nearby()?.data.id,c.id);assert.equal(rpg.blocked(c.x,c.z),true);assert.notEqual(rpg.blocked(c.x,c.z+1.9),true,'accessible approach '+c.id);treasure.update(1,.1);assert.ok(treasure.models.find(m=>m.data.id===c.id).g.parent.visible)}
rpg.activate('willow');player.position.set(unlocked.x,0,unlocked.z+1.9);treasure.interact();const td=all.find(e=>e.id==='treasure-dialog');assert.equal(td.open,true);assert.ok(td.innerHTML.includes('入手済み'));td.close();rpg.adventure.magic.enter();assert.equal(treasure.nearby(),null);treasure.update(2,.1);assert.ok(treasure.models.every(m=>!m.g.parent.visible));rpg.leaveSanctuary();
console.log('PASS: 36 chests in 12 areas, 3 gated permanent keys, all tiers, 12 relics, no double rewards, migration/reload, failed-save rollback, outdoor approaches, treasure dialogue, and indoor isolation.');

// --- おつかい島: the errand island is walked, so its geometry has to allow the walk ---
{
 const {MISSIONS:_}={};
 const data=await rpg.errand.ready;
 const island=data.island;
 assert.ok(island&&island.spots.length>=5,'the island loaded from missions.json');
 rpg.activate('errand');
 assert.equal(rpg.state.current,'errand');
 assert.equal(rpg.onErrandIsland,true);
 assert.equal(rpg.errand.visible,true,'the island is shown on arrival');
 // Spawned on the dock, inside the island and not inside anything solid.
 assert.ok(!rpg.blocked(player.position.x,player.position.z),'the arrival point is walkable');
 assert.ok(rpg.blocked(island.x+40,island.z),'the island has an edge');
 // Every spot can be stood in and reports itself, and all of them are reachable on
 // foot from the point a child arrives at — walking round the shops, as they would.
 const plaza=island.spots.find(s=>s.kind==='plaza');
 const key=(x,z)=>x+','+z;
 const start=[Math.round(player.position.x-island.x),Math.round(player.position.z-island.z)];
 const seen=new Set([key(...start)]),queue=[start];
 for(let i=0;i<queue.length;i++){const [x,z]=queue[i];
  for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz;
   if(seen.has(key(nx,nz))||rpg.blocked(island.x+nx,island.z+nz))continue;
   seen.add(key(nx,nz));queue.push([nx,nz]);}}
 for(const spot of island.spots){
  player.position.set(island.x+spot.x,0,island.z+spot.z);
  assert.ok(!rpg.blocked(player.position.x,player.position.z),spot.id+' is standable');
  assert.equal(rpg.errandNearby()?.spot.id,spot.id,spot.id+' reports itself');
  assert.ok(seen.has(key(Math.round(spot.x),Math.round(spot.z))),spot.id+' is reachable on foot from the dock');
 }
 // Standing between spots is standing in none of them: no leg can be skipped.
 player.position.set(island.x+(plaza.x+island.spots[1].x)/2,0,island.z+(plaza.z+island.spots[1].z)/2);
 assert.equal(rpg.errandNearby(),null,'the middle of the path belongs to no spot');
 rpg.errand.setTarget('bakery');
 assert.equal(rpg.errand.target,'bakery');
 assert.equal(rpg.mapSmall(ctx),true,'the island draws its own minimap');
 rpg.errand.update(1,player);
 // Leaving hides it again and hands collision back to the place we went to.
 rpg.activate('willow');
 assert.equal(rpg.errand.visible,false);
 assert.equal(rpg.onErrandIsland,false);
 assert.equal(rpg.errandNearby(),null);
 assert.equal(rpg.blocked(3,8),null,'Willow collision is unaffected');
 console.log('PASS: おつかい島 loads from missions.json, all '+island.spots.length+' spots are standable, walkable from the plaza and mutually exclusive; arrival, minimap, beacon and departure.');
}

// --- 学習の島: every place must be standable, reachable, and served by a clear path ----
for(const [hub,mod,near] of [['school','school','schoolNearby'],['arena','arena','arenaNearby'],['pet','pet','petNearby']]){
 const data=await rpg[mod].ready;
 const island=data.island;
 assert.ok(island&&island.spots.length>=3,hub+' loaded its island data');
 rpg.activate(hub);
 assert.equal(rpg.state.current,hub);
 assert.equal(rpg[mod].visible,true);
 assert.ok(!rpg.blocked(player.position.x,player.position.z),hub+': the landing is walkable');
 // Flood fill from where a child lands: every place has to be gettable to on foot.
 const key=(x,z)=>x+','+z;
 const start=[Math.round(player.position.x-island.x),Math.round(player.position.z-island.z)];
 const seen=new Set([key(...start)]),queue=[start];
 for(let i=0;i<queue.length;i++){const [x,z]=queue[i];
  for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz;
   if(seen.has(key(nx,nz))||rpg.blocked(island.x+nx,island.z+nz))continue;
   seen.add(key(nx,nz));queue.push([nx,nz]);}}
 for(const spot of island.spots){
  player.position.set(island.x+spot.x,0,island.z+spot.z);
  assert.ok(!rpg.blocked(player.position.x,player.position.z),hub+': '+spot.id+' is standable');
  assert.equal(rpg[near]()?.spot.id,spot.id,hub+': '+spot.id+' reports itself');
  assert.ok(seen.has(key(Math.round(spot.x),Math.round(spot.z))),hub+': '+spot.id+' is reachable on foot');
  // The line the island paves is the line a child walks. A building standing on it is
  // invisible in a screenshot and a dead end on foot, so walk every drawn path.
  const steps=Math.ceil(Math.hypot(spot.x-spot.path.x,spot.z-spot.path.z)*4);
  for(let i=0;i<=steps;i++){const t=i/steps;
   const x=island.x+spot.path.x+(spot.x-spot.path.x)*t,z=island.z+spot.path.z+(spot.z-spot.path.z)*t;
   assert.ok(!rpg.blocked(x,z),hub+': the paved path to '+spot.id+' runs through a building');}
  // And two places must never be standable at once, or a child could answer the easy
  // questions from the hard building.
  for(const other of island.spots){
   if(other.id===spot.id)continue;
   assert.ok(Math.hypot(spot.x-other.x,spot.z-other.z)>10,hub+': '+spot.id+' and '+other.id+' overlap');}
 }
 assert.equal(rpg.mapSmall(ctx),true,hub+': the island draws its own minimap');
 rpg.activate('willow');
 assert.equal(rpg[mod].visible,false);
 assert.equal(rpg[near](),null);
 console.log('PASS: '+island.name+' — '+island.spots.length+' places standable, reachable on foot, each with a clear paved path, none overlapping.');
}


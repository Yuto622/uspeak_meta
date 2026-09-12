// Before anything else: every file the browser will load has to parse. game.js is the
// one module a headless test cannot import (it needs a canvas), and a stray newline
// inside a string there is a blank page rather than a failing test — which is exactly
// what happened once. Parsing is cheap; do it for all of them.
{
  const { readdirSync, readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const vm = await import('node:vm');
  // Parsing a module needs a flag. Rather than making everyone remember it, run
  // ourselves again with it: `node tests/regression.mjs` keeps working.
  if (typeof vm.SourceTextModule !== 'function') {
    const { spawnSync } = await import('node:child_process');
    const self = fileURLToPath(import.meta.url);
    const again = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', self], { stdio: 'inherit' });
    process.exit(again.status ?? 1);
  }
  const dir = fileURLToPath(new URL('../dist/', import.meta.url));
  const skip = new Set(['three.module.js']);
  const files = readdirSync(dir).filter((f) => f.endsWith('.js') && !skip.has(f));
  for (const f of files) {
    try { new vm.SourceTextModule(readFileSync(dir + f, 'utf8')); } catch (err) {
      console.error(`FAIL: ${f} does not parse — ${err.message}`);
      process.exit(1);
    }
  }
  console.log(`PASS: all ${files.length} browser modules parse.`);
}

// And no stylesheet may give a closed <dialog> a `display`. The browser's own
// `dialog:not([open]) { display: none }` is a plain rule, and an id selector beats it: a
// closed panel then sits over the island, invisible against the sky and swallowing every
// tap that lands on it. It has been shipped that way twice — おつかい島 and 英会話島 —
// and both times it was found by a child, not by a test.
{
  const { readdirSync, readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const dir = fileURLToPath(new URL('../dist/', import.meta.url));
  const sheets = readdirSync(dir).filter((f) => f.endsWith('.css'));
  const bad = [];
  for (const f of sheets) {
    const css = readFileSync(dir + f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/(^|[;\s])display\s*:/.test(body)) continue;
      for (const sel of selectors.split(',')) {
        if (/(^|[\s>+~])(dialog|#[\w-]*dialog)$/.test(sel.trim())) bad.push(`${f}: ${sel.trim()}`);
      }
    }
  }
  if (bad.length) {
    console.error('FAIL: a closed <dialog> would still be laid out — put the display on [open]:\n  ' + bad.join('\n  '));
    process.exit(1);
  }
  console.log(`PASS: none of the ${sheets.length} stylesheets lays out a closed dialog.`);
}

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
 // The shops are buildings a child walks into; the plaza is a square, and a square has
 // no door to promise.
 {
  const doors=rpg.errand.doors;
  const shops=island.spots.filter(sp=>sp.kind==='shop');
  assert.equal(doors.length,shops.length,'errand: a door for every shop and nothing else');
  for(const d of doors){
   const spot=shops.find(sp=>sp.id===d.id);
   assert.ok(spot,'errand: a door belongs to no shop');
   player.position.set(island.x+spot.x,0,island.z+spot.z);
   assert.equal(rpg.errand.doorNear(player)?.id,d.id,'errand: arriving at '+d.id+' does not put a child in its doorway');
  }
  const plaza=island.spots.find(sp=>sp.kind!=='shop');
  if(plaza){
   player.position.set(island.x+plaza.x,0,island.z+plaza.z);
   assert.equal(rpg.errand.doorNear(player),null,'errand: the plaza is not a building');
  }
 }
 // Leaving hides it again and hands collision back to the place we went to.
 rpg.activate('willow');
 assert.equal(rpg.errand.visible,false);
 assert.equal(rpg.onErrandIsland,false);
 assert.equal(rpg.errandNearby(),null);
 assert.equal(rpg.blocked(3,8),null,'Willow collision is unaffected');
 console.log('PASS: おつかい島 loads from missions.json, all '+island.spots.length+' spots are standable, walkable from the plaza and mutually exclusive; arrival, minimap, beacon and departure.');
}

// --- ワールドマップ: no island may be drawn under another one ------------------------
{
 const {worldMapLayout}=await import('../dist/rpg-map.js');
 const {DESTINATIONS}=await import('../dist/rpg-data.js');
 for(const [w,h] of [[340,380],[640,590],[900,620],[1500,1100]]){
  const nodes=worldMapLayout(w,h);
  assert.equal(nodes.length,DESTINATIONS.length,'the map lost an island at '+w+'x'+h);
  for(let a=0;a<nodes.length;a++){
   for(let b=a+1;b<nodes.length;b++){
    const A=nodes[a],B=nodes[b];
    const ox=(A.hw+B.hw)-Math.abs(B.x-A.x);
    const oy=Math.min(A.y+A.bottom,B.y+B.bottom)-Math.max(A.y-A.top,B.y-B.top);
    assert.ok(ox<=0.5||oy<=0.5,`map ${w}x${h}: ${A.id} and ${B.id} overlap by ${Math.min(ox,oy).toFixed(1)}px`);
   }
  }
  // And nothing may be pushed off the chart while it is getting out of the way.
  for(const n of nodes){
   assert.ok(n.x-n.hw>=0&&n.x+n.hw<=w,`map ${w}x${h}: ${n.id} hangs off the side`);
   assert.ok(n.y-n.top>=0&&n.y+n.bottom<=h,`map ${w}x${h}: ${n.id} hangs off the top or bottom`);
  }
 }
 console.log('PASS: ワールドマップ — '+DESTINATIONS.length+'島が4つの画面サイズで重ならず、はみ出さない。');
}

// --- 学習の島: every place must be standable, reachable, and served by a clear path ----
// 英検の島は3つとも同じ間取りなので、同じ検査を3回通す（ready が返すのは島そのもの）。
for(const [hub,mod,near,unwrap] of [['school','school','schoolNearby'],['arena','arena','arenaNearby'],['pet','pet','petNearby'],['ride','ride','rideNearby'],['town','town','townNearby'],['eiken5','eiken5','eikenNearby',d=>d],['eiken4','eiken4','eikenNearby',d=>d],['eiken3','eiken3','eikenNearby',d=>d],['talk','talk','talkNearby'],['conv','conv','convNearby',d=>d]]){
 const data=await rpg[mod].ready;
 const island=unwrap?unwrap(data):data.island;
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
 // Every building a child can see has a way in, and the way in is where they arrive:
 // walking to the place puts them in its doorway, which is what takes them inside.
 const doors=rpg[mod].doors;
 // のりもの島 の スタートラインだけは建物ではない：レースはグリッドに乗って始めるもので、
 // 小屋に入って始めるものではない（ドアが線の上にあると走行中に中へ吸い込まれる）。
 const withDoors=island.spots.filter(sp=>!(hub==='ride'&&sp.kind==='start'));
 assert.equal(doors.length,withDoors.length,hub+': not every building has a door');
 for(const d of doors){
  const spot=withDoors.find(sp=>sp.id===d.id);
  assert.ok(spot,hub+': a door belongs to no place');
  assert.ok(Math.abs(d.x-spot.x)<0.01&&Math.abs(d.z-spot.z)<=1.4,hub+': the door of '+d.id+' is not where a child arrives');
  player.position.set(island.x+spot.x,0,island.z+spot.z);
  assert.equal(rpg[mod].doorNear(player)?.id,d.id,hub+': arriving at '+d.id+' does not put a child in its doorway');
  // And standing in one doorway is never standing in another's.
  const others=doors.filter(o=>o.id!==d.id&&Math.abs(o.x-d.x)<1.4&&Math.abs(o.z-d.z)<1.2);
  assert.equal(others.length,0,hub+': the doorways of '+d.id+' and '+others.map(o=>o.id).join(',')+' overlap');
 }
 player.position.set(island.x+island.spawn.x,0,island.z+island.spawn.z);
 assert.equal(rpg[mod].doorNear(player),null,hub+': the landing is not a doorway');
 assert.equal(rpg.mapSmall(ctx),true,hub+': the island draws its own minimap');
 rpg.activate('willow');
 assert.equal(rpg[mod].visible,false);
 assert.equal(rpg[near](),null);
 console.log('PASS: '+island.name+' — '+island.spots.length+' places standable, reachable on foot, each with a clear paved path, none overlapping.');
 // のりもの島 has one more thing to check: the road. A checkpoint a child cannot drive
 // to, or a stretch of road through a shop, would only be found by driving it.
 if(hub==='ride'){
  const course=data.course;
  assert.ok(course&&course.gates.length>=3,'ride: the course loaded');
  rpg.activate('ride');
  for(let g=0;g<course.gates.length;g++){
   const gate=course.gates[g],next=course.gates[(g+1)%course.gates.length];
   player.position.set(island.x+gate.x,0,island.z+gate.z);
   assert.ok(!rpg.blocked(player.position.x,player.position.z),'ride: checkpoint '+gate.id+' cannot be stood in');
   assert.equal(rpg.rideGate()?.id,gate.id,'ride: checkpoint '+gate.id+' reports itself');
   assert.ok(seen.has(key(Math.round(gate.x),Math.round(gate.z))),'ride: checkpoint '+gate.id+' is reachable on foot');
   const steps=Math.ceil(Math.hypot(next.x-gate.x,next.z-gate.z)*3);
   for(let i=0;i<=steps;i++){const t=i/steps;
    const x=island.x+gate.x+(next.x-gate.x)*t,z=island.z+gate.z+(next.z-gate.z)*t;
    assert.ok(!rpg.blocked(x,z),'ride: the road from '+gate.id+' to '+next.id+' runs through a building');}
   // Standing in one checkpoint must never count as standing in the next.
   assert.ok(Math.hypot(gate.x-next.x,gate.z-next.z)>course.reach*2,'ride: '+gate.id+' and '+next.id+' overlap');
  }
  // The dock is behind the grid, not on the line: a child who has just landed is not
  // standing in the finish, or their first step would count as a lap.
  player.position.set(island.x+island.spawn.x,0,island.z+island.spawn.z);
  assert.equal(rpg.rideGate(),null,'ride: the landing is not a checkpoint');
  // And the grid is on the road, behind the line, where a kart can actually start.
  for(const place of course.grid){
   assert.ok(!rpg.blocked(island.x+place.x,0+island.z+place.z),'ride: a grid place is inside something');
  }
  for(const box of [...course.items,...course.boosts]){
   assert.ok(!rpg.blocked(island.x+box.x,island.z+box.z),'ride: an item box or boost pad is inside something');
  }
  rpg.activate('willow');
  console.log('PASS: のりもの島のコース — '+course.gates.length+' checkpoints drivable, the road clear of buildings, none overlapping.');
 }
}


// --- カート: how a kart drives, which is the whole difference between this island and ----
// every other one. Pure physics, so it is checked here rather than in a browser.
{
 const {createKart,driveKart,boostKart,onRoad,placeOnGrid,KART}=await import('../dist/kart.js');
 const course=(await rpg.ride.ready).course;
 const kart=createKart();
 const pos={position:{x:0,y:0,z:0},rotation:{y:0}};
 const free=()=>false;
 const keys=new Set();
 const step=(n,dt=1/60,speed=1,extra={})=>{for(let i=0;i<n;i++)driveKart(kart,{dt,keys,player:pos,blocked:free,course,speed,now:i*dt*1000,...extra})};

 // The throttle: a kart builds speed rather than having it, and stops accelerating at
 // its top speed.
 keys.add('w');step(120);
 assert.ok(kart.speed>6,'the throttle builds speed ('+kart.speed.toFixed(1)+')');
 const flat=kart.speed;step(240);
 assert.ok(kart.speed<=KART.top+0.01&&kart.speed>=flat,'and stops at the top speed');
 // Off the road it is slower: the grass is what keeps a child on the racing line.
 kart.onRoad=false;step(120);
 assert.ok(kart.speed<KART.top*0.6,'the grass is slow ('+kart.speed.toFixed(1)+')');
 kart.onRoad=true;

 // Steering only turns a kart that is moving, and a drift turns it harder.
 keys.add('a');const before=pos.rotation.y;step(30);
 assert.ok(Math.abs(pos.rotation.y-before)>0.2,'the kart steers');
 const straight=Math.abs(pos.rotation.y-before);
 keys.add(' ');step(30);
 assert.ok(kart.driftWay!==0,'holding the drift key drifts');
 assert.ok(Math.abs(kart.slip)>0.05,'and the body slides out of line');
 // Held long enough, the drift charges; released, it pays a boost.
 step(90);
 assert.ok(kart.sparks>=1,'a held drift charges ('+kart.sparks+')');
 const chargedAt=90*(1000/60);
 keys.delete(' ');driveKart(kart,{dt:1/60,keys,player:pos,blocked:free,course,speed:1,now:chargedAt});
 assert.ok(kart.boostUntil>chargedAt,'and releasing it is a boost');
 assert.equal(kart.sparks,0,'the charge is spent');
 void straight;

 // A wall stops a kart rather than teleporting it through.
 const solid=(x)=>x>2;
 keys.clear();keys.add('w');
 const kart2=createKart();const pos2={position:{x:0,y:0,z:0},rotation:{y:0}};
 kart2.heading=Math.PI/2;
 for(let i=0;i<200;i++)driveKart(kart2,{dt:1/60,keys,player:pos2,blocked:solid,course,speed:1,now:i*16});
 assert.ok(pos2.position.x<=2.01,'a kart does not drive through a building');

 // The road: on it along the ring, off it in the middle of the island and out at sea.
 const gates=course.gates;
 assert.equal(onRoad(course,gates[0].x,gates[0].z),true,'a checkpoint is on the road');
 const mid={x:(gates[0].x+gates[3].x)/2,z:(gates[0].z+gates[3].z)/2};
 assert.equal(onRoad(course,mid.x,mid.z),false,'the middle of the island is not the road');
 assert.equal(onRoad(course,90,90),false,'and neither is the sea');
 for(const box of [...course.items,...course.boosts,...course.grid]){
  assert.equal(onRoad(course,box.x,box.z),true,'everything a kart drives over is on the road');
 }

 // The grid: every kart starts stopped, on its own square, pointing down the road.
 const kart3=createKart();const pos3={position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z}},rotation:{y:0}};
 placeOnGrid(kart3,pos3,{x:0,z:0},course.grid[0]);
 assert.equal(kart3.speed,0,'a kart on the grid is stopped');
 assert.ok(Math.abs(pos3.position.x-course.grid[0].x)<0.01);
 assert.ok(Math.abs(pos3.rotation.y-Math.PI/2)<0.01,'and faces the first corner');
 boostKart(kart3,'item',1000);
 assert.ok(kart3.boostUntil>1000&&kart3.speed>0,'an answered item box is a dash');
 console.log('PASS: カート — throttle, top speed, grass, steering, drift charge and release, collision, and the racing line.');
}

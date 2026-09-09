import * as THREE from './three.module.js';
import {CREATURE_BY_ID,REGION_BY_ID} from './rpg-data.js';
import {creatureModel,animateCreature} from './rpg-models.js';
import {WANDS,parkPosition} from './magic-data.js';
import {BUILDINGS,nearestBuilding,SERVICE_NAMES} from './buildings.js';
import {createBuildingRoom} from './building-room.js';
import {wandModel} from './magic-world.js';

// An independent scene keeps outdoor islands, weather and encounters out of the room.
export function createParkInterior(ctx){
 const {player,camera,state,progress,modal,toast}=ctx;
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x162e3b);
 const root=new THREE.Group();scene.add(root);
 const box=new THREE.BoxGeometry(),sphere=new THREE.SphereGeometry(1,16,12),gem=new THREE.OctahedronGeometry(1),materials=new Map();
 const obstacles=[],pads=[],actors=[],wandDisplays=[];
 let active=false,home=null,parent=null,cooldown=0,fadeTime=0,healTime=0,actorStamp='',built=false;
 const $=s=>document.querySelector(s);
 const stations=[
  {id:'care',name:'仲間の回復',x:0,z:-3.3,radius:2.6,label:'回復カウンターで話す'},
  {id:'wands',name:'魔法の杖',x:-6.6,z:1.1,radius:2.5,label:'魔法の杖ショップを見る'},
  {id:'legends',name:'伝説の書',x:6.6,z:1.1,radius:2.5,label:'伝説の書をひらく'},
  {id:'exit',name:'外へ出る',x:0,z:8.6,radius:1.8,label:'出口から島に戻る'}
 ];
 const parkStations=stations.map(s=>({...s}));
 const rooms=createBuildingRoom({scene,box,sphere,gem,material});
 const hud=document.createElement('aside');hud.id='park-interior-hud';hud.hidden=true;
 hud.innerHTML='<div class="rpg-eyebrow">COMPANION LOBBY</div><h2>U-Speak park</h2><p id="park-room-origin"></p><p class="park-room-help">中を歩いて、カウンターで話しかけよう。</p><div class="park-room-actions">'+stations.map(s=>`<button data-park-station="${s.id}">${s.name}<span>${s.id==='exit'?'↗':'→'}</span></button>`).join('')+'</div>';
 document.querySelector('main').append(hud);
 const fade=document.createElement('div');fade.id='park-transition';fade.setAttribute('aria-hidden','true');document.body.append(fade);
 function material(color,emissive=0){const key=color+':'+emissive;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:emissive,roughness:.48,metalness:.13}));return materials.get(key)}
 function mesh(geo,x,y,z,w,h,d,c,e=0,group=root){const m=new THREE.Mesh(geo,material(c,e));m.position.set(x,y,z);m.scale.set(w,h,d);m.receiveShadow=true;m.castShadow=true;group.add(m);return m}
 const B=(x,y,z,w,h,d,c,e=0)=>mesh(box,x,y,z,w,h,d,c,e);
 function solid(x,z,w,d){obstacles.push({x,z,w:w/2,d:d/2})}
 function sign(text,sub,x,y,z,w=5){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=230;const c=canvas.getContext('2d');c.fillStyle='#193f4a';c.fillRect(0,0,1024,230);c.strokeStyle='#d6c596';c.lineWidth=6;c.strokeRect(3,3,1018,224);c.fillStyle='#f5e6bb';c.textAlign='center';c.font='600 66px sans-serif';c.fillText(text,512,102,950);c.fillStyle='#b9e7d4';c.font='36px sans-serif';c.fillText(sub,512,170,950);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true}));s.position.set(x,y,z);s.scale.set(w,w*230/1024,1);root.add(s);return s}
 function person(x,z,color,hair){const g=new THREE.Group();g.position.set(x,0,z);root.add(g);mesh(box,0,1.28,0,.78,.87,.48,color,0,g);mesh(sphere,0,1.94,0,.36,.37,.33,0xe4bc98,0,g);mesh(sphere,0,2.14,-.06,.39,.23,.32,hair,0,g);for(const side of[-1,1]){mesh(box,side*.22,.42,0,.3,.85,.4,0x344853,0,g);mesh(box,side*.52,1.15,0,.23,.7,.27,color,0,g);mesh(sphere,side*.13,1.98,.3,.027,.033,.023,0x293a46,0,g);}return g;}
 function build(){if(built)return;built=true;
  scene.add(new THREE.HemisphereLight(0xe5fff2,0x596575,2.2));const key=new THREE.DirectionalLight(0xffeed4,3.1);key.position.set(-5,13,9);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-16,right:16,top:16,bottom:-16,near:.5,far:45});key.shadow.bias=-.0004;key.shadow.normalBias=.03;scene.add(key);const rim=new THREE.PointLight(0x85dfdd,32,28,2);rim.position.set(0,5,-5);scene.add(rim);
  B(0,-.2,0,23,.4,21,0x465d64);B(0,-.015,0,22,.12,20,0xccd5c2);
  for(let x=-10;x<=10;x+=2)for(let z=-9;z<=9;z+=2)B(x,.052,z,1.94,.025,1.94,(x+z)%4===1?0xc2cdbd:0xdce1cd);
  B(0,.09,2.3,3.8,.025,12.9,0x2a7378);for(const x of[-1.78,1.78])B(x,.11,2.3,.07,.02,12.9,0xe7cc8c);
  B(0,2.6,-10,22.6,5.2,.35,0xbfcfbf);for(const x of[-11.2,11.2]){B(x,1.8,0,.3,3.6,20,0x789b98);B(x,.5,0,.4,.8,20,0x356b73);}B(0,.5,-9.77,22,.8,.12,0x356b73);
  for(const x of[-10.5,-3.9,3.9,10.5]){B(x,2.7,-9.5,.45,5.4,.6,0x446a70);B(x,5.35,-9.5,.8,.16,.9,0xe3c68f);}for(const x of[-7.3,7.3]){B(x,3.15,-9.72,4.9,2.65,.05,0x548687,.2);for(let i=0;i<7;i++)mesh(gem,x-1.8+i*.6,3.05+Math.sin(i)*.5,-9.65,.05,.08,.035,0xf4e2ae,.8);}
  B(0,1,-6,6.7,1.75,1.55,0x3e8987);B(0,1.91,-6,7,.16,1.85,0xe9dcc0);solid(0,-6,7,1.85);person(0,-7.5,0xf3f0dc,0x59637b);
  sign('おかえりなさい','COMPANION CARE · FREE RECOVERY',0,3.65,-7.5,6.5);
  const padGeo=new THREE.TorusGeometry(.6,.045,8,48);for(let i=0;i<3;i++){const x=(i-1)*2;B(x,1.98,-5.8,1.45,.08,1.2,0x2b616c);const pad=mesh(padGeo,x,2.06,-5.8,1,1,1,0xa6f9d7,.7);pad.rotation.x=Math.PI/2;pads.push(pad);}
  B(-6.6,.98,-1.5,4.2,1.7,1.4,0x405879);B(-6.6,1.87,-1.5,4.5,.12,1.7,0xe7c993);solid(-6.6,-1.5,4.5,1.7);person(-6.6,-3,0x657dac,0xdbc8b0);sign('魔法の杖アトリエ','WAND ATELIER · 8 MAGICAL WANDS',-6.6,3.7,-2.6,5.8);
  B(-8,1.75,-6.8,4.4,3.3,.35,0x294b61);B(-8,3.48,-6.8,4.7,.15,.65,0xcbae79);solid(-8,-6.8,4.7,.65);
  for(let i=0;i<8;i++){const w=wandModel(WANDS[i].id);w.scale.setScalar(.66);w.position.set(-9.55+(i%4)*1.04,.5+Math.floor(i/4)*1.37,-6.4);w.rotation.z=-.15;root.add(w);wandDisplays.push(w);}
  B(6.6,.98,-1.5,4.2,1.7,1.4,0x67718a);B(6.6,1.87,-1.5,4.5,.12,1.7,0xd6c39a);solid(6.6,-1.5,4.5,1.7);person(6.6,-3,0x8c7ba3,0x503b56);sign('伝説の書','THE TEN GUARDIANS',6.6,3.7,-2.6,5.8);
  for(let i=0;i<10;i++){B(5.2+(i%5)*.65,1.5+Math.floor(i/5)*1.05,-6.7,.42,.7,.55,[0x6c7f99,0xbca184,0x739b92][i%3]);}B(6.6,.7,-6.8,4.3,.13,1,0x4d677a);B(6.6,2,-6.8,4.3,.13,1,0x4d677a);solid(6.6,-6.8,4.3,1);
  for(const side of[-1,1]){B(side*7.8,.5,5.8,3.8,.8,1.25,0x4e777b);B(side*7.8,1.18,6.25,3.8,1.05,.28,0x6b9995);solid(side*7.8,5.8,3.8,1.6);B(side*9.3,.47,8.3,1,.9,1,0xbba584);mesh(sphere,side*9.3,1.43,8.3,.72,.9,.72,0x79a890);solid(side*9.3,8.3,1.2,1.2);}
  const halo=mesh(new THREE.TorusGeometry(2.5,.045,8,80),0,4.7,-.6,1,1,1,0xe9d7a4,.5);halo.rotation.x=Math.PI/2;for(let i=0;i<8;i++){const a=i/8*Math.PI*2;mesh(gem,Math.cos(a)*2.5,4.55,-.6+Math.sin(a)*2.5,.1,.24,.1,0xb5eee1,.7);}
  for(const side of[-1,1]){B(side*1.75,1.8,9.5,.26,3.6,.4,0x3c777c);B(side*6.4,.38,9.8,9,.7,.3,0x759793);}B(0,3.53,9.5,3.7,.2,.5,0xe9d2a0);B(0,.1,8.85,2.9,.04,1.7,0x91b5a3);sign('出口 · EXIT','もとの島へ戻る',0,2.55,9.6,3.8);
 }
 function syncActors(){const ids=progress.state.team,stamp=ids.map(id=>id+':'+progress.entry(id).form).join('|');if(stamp===actorStamp)return;actorStamp=stamp;for(const g of actors)root.remove(g);actors.length=0;ids.forEach((id,i)=>{const g=creatureModel(CREATURE_BY_ID[id],progress.entry(id).form);g.scale.multiplyScalar(.38);g.position.set((i-1)*2,2.12,-5.8);root.add(g);actors.push(g)})}
 function entrance(){return nearestBuilding(state.current,player.position.x,player.position.z);}
 function enter(building=null){const b=building||BUILDINGS.find(b=>b.id==='park-'+state.current);if(active||!ctx.allowedUi()||!b||b.region!==state.current)return false;if(!progress.state.starter){ctx.openJourney();return false}build();home={region:state.current,building:b,position:{x:b.x,z:b.z-3.15},rotation:player.rotation.y,cameraPosition:camera.position.clone(),cameraQuaternion:camera.quaternion.clone()};parent=player.parent;modal.close();active=true;state.insidePark=true;state.mode='walk';root.visible=b.kind==='park';rooms.root.visible=!root.visible;if(!root.visible)rooms.load(b);
 stations.splice(0,stations.length,...(b.kind==='park'?parkStations:[{id:b.service,name:SERVICE_NAMES[b.service],label:SERVICE_NAMES[b.service],x:0,z:-3.3,radius:2.6},parkStations[3]]));
 hud.innerHTML='<div class="rpg-eyebrow">'+(b.kind==='park'?'COMPANION LOBBY':'WELCOME INSIDE')+'</div><h2>'+b.name+'</h2><p id="park-room-origin">'+REGION_BY_ID[b.region].name+'</p><p class="park-room-help">中を歩いて、受付で話しかけよう。</p><div class="park-room-actions">'+stations.map(s=>`<button data-park-station="${s.id}">${s.name}<span>→</span></button>`).join('')+'</div>';
 scene.add(player);player.position.set(0,0,6.3);player.rotation.y=Math.PI;cooldown=1;fadeTime=.45;fade.classList.add('active');document.body.classList.add('in-sanctuary');hud.hidden=false;$('.location').innerHTML='<span>✦</span> '+b.name+' <small>屋内</small>';$('.map-panel>div b').textContent=b.name;$('#area').textContent=b.name+' · 屋内';ctx.syncBuddy(true);syncActors();toast(b.name+'へようこそ。受付まで歩いて話しかけよう。');return true;}
 function leave(silent=false){if(!active)return false;for(const d of document.querySelectorAll('dialog[open]'))d.close();modal.close();active=false;state.insidePark=false;(parent||ctx.scene).add(player);const b=home.building;player.position.set(b.x,0,b.z+b.dir*(b.kind==='park'?1.85:.55));player.rotation.y=b.dir>0?0:Math.PI;cooldown=1.2;fadeTime=.45;fade.classList.add('active');document.body.classList.remove('in-sanctuary');hud.hidden=true;ctx.syncBuddy(true);ctx.activate(home.region,false);camera.position.copy(home.cameraPosition);camera.quaternion.copy(home.cameraQuaternion);if(!silent)toast(b.name+'の入口へ戻りました。');home=null;return true;}
 function nearby(){if(!active)return null;return stations.map(s=>({...s,d:Math.hypot(player.position.x-s.x,player.position.z-s.z)})).filter(s=>s.d<s.radius).sort((a,b)=>a.d-b.d)[0]||null}
 function at(id){const s=stations.find(s=>s.id===id);return active&&!!s&&Math.hypot(player.position.x-s.x,player.position.z-s.z)<s.radius;}
 function go(id){if(!active||state.busy||!ctx.allowedUi())return false;const s=stations.find(s=>s.id===id);if(!s)return false;if(id==='exit')return leave();player.position.set(s.x,0,s.z);player.rotation.y=Math.PI;return true;}
 function blocked(x,z){if(!active)return null;if(Math.abs(x)>10.65||z< -9.3||z>10.1)return true;if(home.building.kind!=='park')return rooms.blocked(x,z);return obstacles.some(o=>Math.abs(x-o.x)<o.w+.32&&Math.abs(z-o.z)<o.d+.32);}
 function update(t,dt,reduced){cooldown=Math.max(0,cooldown-dt);fadeTime=Math.max(0,fadeTime-dt);if(!fadeTime)fade.classList.remove('active');if(!active){const b=entrance();if(b&&!cooldown&&!document.querySelector('dialog[open]')&&ctx.allowedUi()&&Math.abs(player.position.x-b.x)<1.05&&Math.abs(player.position.z-b.z)<.43)enter(b);return}syncActors();hud.hidden=!!document.querySelector('dialog[open]');healTime=Math.max(0,healTime-dt);actors.forEach((g,i)=>{animateCreature(g,reduced?0:t,i,healTime?'happy':'idle');g.position.y=2.12+(reduced?0:Math.sin(t*2+i)*.035)});pads.forEach(p=>p.scale.setScalar(1+(healTime&&!reduced?Math.sin(t*6)*.12:0)));if(!cooldown&&!document.querySelector('dialog[open]')&&!state.busy&&Math.abs(player.position.x)<1.45&&player.position.z>9.15)leave();}
 function updateCamera({yaw,pitch,zoom,dt,firstPerson}){if(!active)return false;camera.aspect=globalThis.innerWidth/globalThis.innerHeight||camera.aspect;camera.updateProjectionMatrix();if(firstPerson){camera.position.set(player.position.x,2.05+player.position.y,player.position.z);camera.lookAt(player.position.x-Math.sin(yaw)*Math.cos(pitch)*10,camera.position.y+Math.sin(pitch)*10,player.position.z-Math.cos(yaw)*Math.cos(pitch)*10)}else{const distance=THREE.MathUtils.clamp(zoom*.56,11,19),focus=new THREE.Vector3(player.position.x*.58,1,player.position.z*.5-1.5),desired=new THREE.Vector3(focus.x+Math.sin(yaw)*distance,1+distance*.82,focus.z+Math.cos(yaw)*distance);if(fadeTime>.3)camera.position.copy(desired);else camera.position.lerp(desired,1-Math.exp(-dt*6));camera.lookAt(focus)}return true;}
 function minimap(c){if(!active)return false;c.clearRect(0,0,180,140);c.fillStyle='#193d4a';c.fillRect(0,0,180,140);c.fillStyle='#bbd0bb';c.fillRect(14,6,152,128);c.fillStyle='#307477';c.fillRect(78,27,24,107);c.font='11px sans-serif';c.textAlign='center';for(const s of stations){const x=90+s.x*6.5,y=70+s.z*6;c.fillStyle=s.id==='exit'?'#fae1ac':'#3a6169';c.fillRect(x-14,y-7,28,14);c.fillStyle=s.id==='exit'?'#31464d':'#fff1cf';c.fillText(({care:'回復',wands:'杖',legends:'伝説',exit:'出口'}[s.id]||'受付'),x,y+4)}c.fillStyle='#ffffff';c.beginPath();c.arc(90+player.position.x*6.5,70+player.position.z*6,3.5,0,Math.PI*2);c.fill();return true;}
 hud.addEventListener('click',e=>{const b=e.target.closest?.('[data-park-station]');if(!b||state.busy)return;const id=b.dataset.parkStation;if(go(id)&&id!=='exit')ctx.onService(id)});
 return {scene,root,stations,entrance,enter,leave,nearby,at,go,blocked,update,updateCamera,minimap,heal(){healTime=3;syncActors()},get building(){return home?.building||null},get active(){return active},get origin(){return home?.region||null},get cooling(){return cooldown>0}};
}

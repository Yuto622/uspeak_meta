import * as THREE from './three.module.js';
import {vocabulary,gradeLabels,gradeHints} from './vocab.js';
import {Net} from './net.js';
const $=id=>document.getElementById(id),TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),mod=(x,n)=>((x%n)+n)%n,lerp=(a,b,t)=>a+(b-a)*t;
const palette=[0xff7946,0x6af0c0,0xbd9bff,0xffe373,0x65b9ff,0xff8ab6,0xf4f6f5,0xea6157];
const colorNames=['TANGERINE','MINT','LILAC','SUNSHINE','AZURE','BLOSSOM'];
const names=['YOU','NOVA','MILO','LUNA','RIO','PIP','SKYE','BEAU'];
const courses=[
{name:'Coral Coast',jp:'コーラル・コースト',theme:'coast',sky:0x89cfdd,fog:0x9cd9de,ground:0x6cbb7e,road:0x394e60,edge:0xfff0cf,water:0x319db7,accent:0xff8862,grade:[1.02,1.0,.98],open:[[.16,.27],[.58,.70]],grav:[[.36,.48]],points:[[0,0,0],[110,6,15],[225,10,-85],[245,6,-230],[135,2,-310],[5,9,-260],[-100,18,-310],[-245,8,-230],[-255,2,-80],[-145,0,30]]},
{name:'Sunset Mesa',jp:'サンセット・メサ',theme:'mesa',sky:0xf2bda2,fog:0xf2c6ac,ground:0xcc855f,road:0x654f58,edge:0xffda8b,water:0xc87971,accent:0xffd376,grade:[1.06,.99,.94],open:[[.20,.33],[.62,.74]],grav:[[.40,.55]],points:[[0,0,0],[120,9,-25],[225,30,-120],[160,40,-210],[230,21,-320],[90,7,-380],[-70,16,-290],[-190,32,-340],[-270,12,-200],[-160,3,-100],[-170,0,15]]},
{name:'Starlight Pass',jp:'スターライト・パス',theme:'night',sky:0x13234c,fog:0x293557,ground:0x444977,road:0x303858,edge:0x90bfff,water:0x263966,accent:0xc29fff,grade:[.97,.99,1.08],open:[[.30,.42],[.72,.84]],grav:[[.48,.68],[.86,.98]],points:[[0,12,0],[135,28,-5],[245,38,-105],[135,26,-185],[210,44,-300],[50,38,-365],[-80,20,-245],[-240,35,-325],[-285,27,-160],[-175,10,-115],[-210,8,15],[-85,14,65]]},
{name:'Ember Forge',jp:'エンバー・フォージ',theme:'forge',sky:0x2b1020,fog:0x632a2c,ground:0x4b3038,road:0x2b242f,edge:0xffa257,water:0xff4f18,accent:0xff8a3c,grade:[1.05,.99,1.0],open:[[.12,.24],[.50,.62],[.80,.90]],grav:[[.26,.44],[.66,.78]],points:[[0,4,0],[150,14,30],[280,34,-60],[250,52,-200],[320,30,-330],[170,12,-395],[30,26,-330],[-60,44,-215],[-200,54,-300],[-320,26,-215],[-300,8,-60],[-160,2,40]]}
];
let renderer,scene,camera,world,curve,length=1,frames=[],racers=[],boxes=[],coins=[],pads=[],ramps=[],hazards=[],particles=[],projectiles=[],updrafts=[];
let mode='menu',selectedTrack=0,selectedColor=0,time=0,count=0,lastCount='',elapsed=0,toastTime=0,aiDifficulty=1,boost=0,drift=0,drifting=false,steer=0,heldItem=null,roulette=0,stun=0,air=0,airV=0,lapStart=0,lastLap=1,finishTime=0;
let keys={},audioContext,soundOn=false,menuAngle=0,last=0,camPos=new THREE.Vector3(),camLook=new THREE.Vector3(),finishOrder=[];
const clock=new THREE.Clock(),mapCtx=$('map').getContext('2d'),touch=matchMedia('(pointer:coarse)').matches;
if(touch)document.body.classList.add('touch-device');

const kartTypes=[
 {name:'SPRINT',role:'バランス型',class:'ALL-ROUNDER',description:'素直なハンドリング。どのコースでも頼れる相棒。',speed:102,accel:44,handling:13,charge:1,mass:1,grip:1,stats:[75,75,75]},
 {name:'COMET',role:'最高速重視',class:'SPEED SPECIALIST',description:'直線を支配する最高速。立ち上がりが勝負を分ける。',speed:109,accel:35,handling:11,charge:.92,mass:.94,grip:.9,stats:[96,55,60]},
 {name:'MISTRAL',role:'ドリフト重視',class:'CORNER ARTIST',description:'軽快な旋回と鋭い加速。ドリフトでコーナーを制する。',speed:97,accel:54,handling:15,charge:1.22,mass:.82,grip:1.18,stats:[60,95,96]},
 {name:'TITAN',role:'重量型',class:'HEAVY CRUISER',description:'当たり負けしない車体と、伸びつづける最高速。',speed:107,accel:37,handling:11.6,charge:.96,mass:1.55,grip:1.08,stats:[90,46,54]}
];
let selectedKart=0,gameMode='single',autoGas=false,quality='auto',viewMode=0,lateralSpeed=0,hop=0,hopV=0;
let gpRound=0,gpPoints=Array(8).fill(0),gpWins=Array(8).fill(0),gpFinished=false,finalOrder=[];
let lapTimes=[],driftCount=0,trickCount=0,coinTotal=0,comboCount=0,comboTimer=0,draftCharge=0,draftCooldown=0,trickDone=false,trickSpin=0,invulnerable=0,hitFlash=0,shake=0;
let trialBoosts=3,ghostModel=null,ghostRecord=null,ghostSamples=[],ghostClock=0,ghostIndex=0,ghostDistanceIndex=0,bestBefore=null,resultDelay=0,rankPrevious=8,rankFlash=0,accumulator=0,hudClock=0;
let atmosphere=null,skyMaterial=null,waterMaterial=null,auroraMaterial=null,ambientLight=null,sunLight=null,animatedObjects=[],shadowDiscs=[],skidSegments=[],garageScene=null,garageCamera=null,garageModel=null,garageFloor=null;
let padKeys={},gamepadPrevious={},fxWidth=0,fxHeight=0,reducedMotion=matchMedia('(prefers-reduced-motion:reduce)').matches;
let net=null,onlineRoster=[],netStartAt=0,netClock=0,playerName='',lobbyClosesIn=0,onlineResults=null;
const netSettings={quiz:true,grade:5,track:0,laps:3,mirror:false};
let quizGrade=5,quizGates=[],quizIndex=0,quizActive=null,quizClock=0,quizAsked=0,quizCorrect=0,quizStreak=0,quizBestStreak=0,quizLog=[],quizBoost=0,quizSeed=1,quizGateMeshes=[];
let introTime=0,introLength=2.8,inkSeed=0,blueSiren=0,star=0,bullet=0,shrunk=0,ink=0,rescue=0,dropY=0,rescueD=0,gliding=false,glideBoost=0,itemHeld=0,dragItem=null,dragMesh=null,blueWarn=0,offroadClock=0;
let totalLaps=3,mirrorMode=false,postWanted=true,pendingSound=false,topSpeed=0,bestCombo=0,magnet=0,tripleCharges=0,startPress=null,landDust=0,bumpCooldown=0,slowMotion=1,volume=.75,postEnabled=true,photoMode=false,photoAngle=0,photoHeight=1,perfectStart=0,lastBestLap=null,profile=null;
let fxContext=$('fx').getContext('2d'),mapBounds=null,bannerTime=0,helpPaused=false,frameAverage=1/60,autoLow=false;
const pointsTable=[15,12,10,8,6,4,2,1];
// Each rival drives differently: pace sets raw speed, nerve how late they lift for a
// corner, craft how tightly they hunt the racing line, aggression how eagerly they
// throw items, and wobble how often they simply get it wrong.
const rivals=[
 {name:'YOU',pace:1,nerve:1,aggression:1,craft:1,wobble:0,style:'PLAYER'},
 {name:'NOVA',pace:1.06,nerve:1.12,aggression:.95,craft:1.15,wobble:.25,style:'冷静な先行型'},
 {name:'MILO',pace:.99,nerve:.92,aggression:1.25,craft:.86,wobble:.75,style:'仕掛けるタイプ'},
 {name:'LUNA',pace:1.03,nerve:1.05,aggression:.7,craft:1.2,wobble:.3,style:'ライン職人'},
 {name:'RIO',pace:1.01,nerve:1.18,aggression:1.15,craft:.94,wobble:.6,style:'突っ込み重視'},
 {name:'PIP',pace:.94,nerve:.86,aggression:1.35,craft:.8,wobble:1.05,style:'いたずら好き'},
 {name:'SKYE',pace:1.04,nerve:.99,aggression:.85,craft:1.08,wobble:.45,style:'安定志向'},
 {name:'BEAU',pace:.97,nerve:1.08,aggression:1.05,craft:.9,wobble:.85,style:'気まぐれ'}
];
function pressed(k){return !!(keys[k]||padKeys[k])}
function rand(i){return mod(Math.sin(i*127.1+selectedTrack*311.7)*43758.5453,1)}
const theme=()=>courses[selectedTrack].theme,isDark=()=>theme()==='night'||theme()==='forge';
// The road is 12 wide, then a dirt shoulder that costs you speed. Most of the lap is
// railed; in the open sections there is nothing out there but a long drop.
const ROAD_EDGE=11.6,SHOULDER_EDGE=16.4,FALL_EDGE=17.4;
function inZone(d,key){const q=mod(d,length)/length,list=courses[selectedTrack][key]||[];for(const [a,b] of list)if(q>=a&&q<b)return true;return false}
const openAt=d=>inZone(d,'open'),gravAt=d=>inZone(d,'grav');
const pick=(map,fallback)=>map[theme()]??fallback;

const materialCache=new Map();
function mat(color,emissive=false){let key=color+':'+emissive;if(!materialCache.has(key))materialCache.set(key,new THREE.MeshStandardMaterial({color,roughness:.7,metalness:.08,emissive:emissive?color:0,emissiveIntensity:emissive?.55:0}));return materialCache.get(key)}
const unitBox=new THREE.BoxGeometry(1,1,1),ball=new THREE.SphereGeometry(1,12,8),cylinder=new THREE.CylinderGeometry(1,1,1,10),cone=new THREE.ConeGeometry(1,1,7);
function mesh(g,c,parent,x,y,z,sx=1,sy=1,sz=1){const m=new THREE.Mesh(g,mat(c));m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m}
function box(c,parent,x,y,z,sx,sy,sz){return mesh(unitBox,c,parent,x,y,z,sx,sy,sz)}
function sphere(c,parent,x,y,z,sx,sy=sx,sz=sx){return mesh(ball,c,parent,x,y,z,sx,sy,sz)}
function sample(distance,lane=0){const v=mod(distance,length)/length*frames.length,idx=Math.floor(v),a=frames[idx],b=frames[(idx+1)%frames.length],f=v-idx;const tangent=a.t.clone().lerp(b.t,f).normalize();const normal=new THREE.Vector3(tangent.z,0,-tangent.x).normalize();return{p:a.p.clone().lerp(b.p,f).addScaledVector(normal,lane),t:tangent,n:normal,yaw:Math.atan2(tangent.x,tangent.z)}}
const tireGeometry=new THREE.CylinderGeometry(1,1,1,16),torusGeometry=new THREE.TorusGeometry(1,.12,6,18);
const roundedShape=new THREE.Shape();roundedShape.moveTo(-.4,-.5);roundedShape.lineTo(.4,-.5);roundedShape.quadraticCurveTo(.5,-.5,.5,-.4);roundedShape.lineTo(.5,.4);roundedShape.quadraticCurveTo(.5,.5,.4,.5);roundedShape.lineTo(-.4,.5);roundedShape.quadraticCurveTo(-.5,.5,-.5,.4);roundedShape.lineTo(-.5,-.4);roundedShape.quadraticCurveTo(-.5,-.5,-.4,-.5);
const roundedGeometry=new THREE.ExtrudeGeometry(roundedShape,{depth:.84,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.08,bevelThickness:.08,curveSegments:3});roundedGeometry.translate(0,0,-.42);
function rounded(c,g,x,y,z,sx,sy,sz){return mesh(roundedGeometry,c,g,x,y,z,sx,sy,sz)}
function kart(color,type=selectedKart){
 const group=new THREE.Group(),body=new THREE.Group(),driver=new THREE.Group(),wheels=[];group.add(body);body.add(driver);
 const paint=mat(color);paint.roughness=.28;paint.metalness=.26;
 rounded(0x122335,body,0,.72,0,3.15,.45,4.35);
 rounded(color,body,0,1.12,.28,2.65,.8,3.5);
 sphere(color,body,0,1.02,1.53,1.38,.42,1.25);
 rounded(0xf0eee7,body,0,1.51,1.12,.24,.045,2.1);
 rounded(0x182b3d,body,0,1.21,2.38,2.7,.32,.38);
 for(const side of[-1,1]){
  rounded(color,body,side*1.38,1.15,-.15,.42,.55,2.5);
  rounded(0xf6fbdf,body,side*.82,1.25,2.36,.5,.18,.1).material=mat(0xffffd6,true);
  rounded(0x99bed0,body,side*1.21,.8,-2.04,.22,.23,.47);
  const exhaust=mesh(tireGeometry,0x4e6678,body,side*.65,.89,-2.22,.22,.5,.22);exhaust.rotation.x=Math.PI/2;
  rounded(0xdde4de,body,side*1.45,1.47,-.3,.04,.08,.9);
 }
 rounded(0x122435,body,0,1.68,-.8,1.35,1.02,.43);
 rounded(color,body,0,1.94,-2.07,3.65,.22,.75);
 for(const side of[-1,1]){rounded(0x213647,body,side*1.1,1.36,-2.03,.17,1,.18);rounded(color,body,side*1.88,2.02,-2.06,.16,.43,.9)}
 for(const x of[-1.7,1.7])for(const z of[-1.3,1.35]){
  const pivot=new THREE.Group(),spin=new THREE.Group();pivot.position.set(x,.71,z);pivot.add(spin);group.add(pivot);
  const tire=mesh(tireGeometry,0x101a25,spin,0,0,0,.7,.55,.7);tire.rotation.z=Math.PI/2;
  const rim=mesh(tireGeometry,0xa9bdc8,spin,Math.sign(x)*.3,0,0,.43,.05,.43);rim.rotation.z=Math.PI/2;
  const hub=mesh(tireGeometry,color,spin,Math.sign(x)*.34,0,0,.2,.05,.2);hub.rotation.z=Math.PI/2;
  for(let j=0;j<5;j++){const a=j*TAU/5;const spoke=box(0x1d3447,spin,Math.sign(x)*.335,Math.cos(a)*.25,Math.sin(a)*.25,.035,.28,.065);spoke.rotation.x=a}
  wheels.push({pivot,spin,front:z>0});
 }
 rounded(color,driver,0,1.94,-.07,1.19,1.0,.83);
 for(const x of[-.55,.55]){let arm=sphere(color,driver,x,2.03,.46,.31,.3,.58);arm.rotation.x=-.27;sphere(0xf5f0df,driver,x,2.15,.94,.24)}
 sphere(0xf4e6c9,driver,0,2.92,-.08,.83,.86,.81);
 sphere(color,driver,0,3.16,-.15,.87,.63,.86);
 sphere(0x173d55,driver,0,3.03,.6,.73,.36,.2);
 sphere(0x75d5e5,driver,-.19,3.13,.77,.3,.08,.023);
 rounded(0xf1f6ed,driver,0,3.64,-.05,.23,.035,.88);
 for(const side of[-1,1]){sphere(0x243f52,driver,side*.79,3,-.07,.12,.2,.22);sphere(0xdef48e,driver,side*.9,3,-.07,.025,.09,.1)}
 let steering=new THREE.Mesh(torusGeometry,mat(0x192d3c));steering.scale.setScalar(.48);steering.position.set(0,2.09,.94);steering.rotation.x=-.8;body.add(steering);
 const flame=new THREE.Group();for(const x of[-.65,.65]){let f=sphere(0x9ff8ff,flame,x,.9,-2.85,.27,.28,.85);f.material=mat(0x96eaff,true);let core=sphere(0xffffff,flame,x,.9,-2.45,.15,.17,.35);core.material=mat(0xffffff,true)}flame.visible=false;body.add(flame);
 const glider=new THREE.Group();
 for(const side of[-1,1]){const panel=rounded(color,glider,side*1.75,4.42,-1.1,3.3,.14,2.05);panel.rotation.z=side*.13;panel.rotation.y=side*.1}
 rounded(0xf2f6f3,glider,0,4.3,-1.1,1.3,.12,2.2);
 for(const side of[-1,1]){const strut=box(0xd7e2e6,glider,side*1.1,3.5,-.9,.12,1.9,.12);strut.rotation.z=side*.22}
 glider.visible=false;body.add(glider);
 const shieldMesh=new THREE.Mesh(ball,new THREE.MeshBasicMaterial({color:0x9adfff,transparent:true,opacity:.13,wireframe:true,depthWrite:false}));shieldMesh.position.set(0,1.7,0);shieldMesh.scale.set(2.65,2.7,3.4);shieldMesh.visible=false;group.add(shieldMesh);
 if(type===1){body.scale.z=1.14;rounded(0x142b3e,body,0,1.4,-1.49,.72,.55,.68);rounded(color,body,0,2.2,-2.15,4.1,.15,.7)}
 if(type===2){body.scale.set(.94,.96,.94);for(const x of[-1,1])rounded(0xecf4e0,body,x,1.53,-1.3,.48,.25,.55)}
 if(type===3){body.scale.set(1.12,1.04,1.05);rounded(0x1b3348,body,0,1.62,2.05,2.5,.42,.5);for(const x of[-1,1]){rounded(0x22394d,body,x*1.5,1.75,.35,.2,1.1,.22);rounded(0xd7e2e6,body,x*1.62,1.02,-.3,.22,.34,1.9)}rounded(0x22394d,body,0,2.32,.3,2.35,.18,.22)}
 group.traverse(o=>{if(o.isMesh){o.castShadow=!o.material.transparent;o.receiveShadow=true}});
 group.userData={flame,body,driver,wheels,shieldMesh,steering,glider};return group;
}
function ribbon(offset1,offset2,color,lift=0){const pos=[],norm=[],uv=[],N=frames.length;for(let i=0;i<N;i++){let a=sample(i/N*length,offset1).p,b=sample(i/N*length,offset2).p,c=sample((i+1)/N*length,offset1).p,d=sample((i+1)/N*length,offset2).p;for(const p of[a,c,b,b,c,d]){pos.push(p.x,p.y+lift,p.z);norm.push(0,1,0);uv.push(0,0)}}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));let m=new THREE.Mesh(g,mat(color));m.material.side=THREE.DoubleSide;world.add(m)}
function roadside(distance,lane){const f=sample(distance,lane);if(Math.abs(lane)>18)f.p.y=terrainHeight(f.p.x,f.p.z);return f.p}
function tree(p,i){let group=new THREE.Group();group.position.copy(p);if(theme()==='forge'){const trunk=mesh(cylinder,0x2d1d24,group,0,6,0,.85,12,.85);trunk.rotation.z=(rand(i*3)-.5)*.3;for(let j=0;j<4;j++){const b=box(0x3a252c,group,0,7+j*1.6,0,2.6-j*.4,.35,.35);b.rotation.y=j*1.1;b.rotation.z=(j%2?.4:-.4)}const ember=sphere(0xff7a2c,group,0,2.2,0,1.5,.5,1.5);ember.material=mat(0xff6a22,true)}else if(selectedTrack===1){mesh(cylinder,0x477768,group,0,5,0,1.1,10,1.1);for(let side of[-1,1]){box(0x477768,group,side*1.8,5,0,3.2,1.2,1.2);mesh(cylinder,0x477768,group,side*3,6.5,0,.7,4,.7)}}else if(selectedTrack===0){let trunk=mesh(cylinder,0x9b7660,group,0,5,0,.6,10,.6);trunk.rotation.z=.15;for(let j=0;j<6;j++){const leaf=mesh(cone,0x318d68,group,0,10,0,2.7,8,1);leaf.rotation.z=1.18;leaf.rotation.y=j*TAU/6;}}else{mesh(cylinder,0x66557d,group,0,3,0,.6,6,.6);for(let j=0;j<3;j++)mesh(cone,j%2?0x517d9a:0x477689,group,0,5+j*2.7,0,4-j*.8,7,4-j*.8)}group.rotation.y=i*2.4;world.add(group)}
function nameTag(text,colour){
 const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');
 ctx.fillStyle='rgba(9,22,34,.72)';ctx.beginPath();ctx.roundRect(6,26,500,76,38);ctx.fill();
 ctx.strokeStyle=colour;ctx.lineWidth=5;ctx.stroke();
 ctx.font='700 54px "Noto Sans JP",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffffff';
 ctx.fillText(text.slice(0,10),256,66);
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,depthTest:false}));
 sprite.scale.set(7.4,1.85,1);sprite.position.set(0,5.6,0);sprite.renderOrder=8;return sprite;
}
function labelTexture(text,bg,fg){const c=document.createElement('canvas');c.width=1024;c.height=192;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,1024,192);ctx.font='900 94px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=fg;ctx.fillText(text,512,99);return new THREE.CanvasTexture(c)}
function mergeWorld(){world.updateMatrixWorld(true);const buckets=new Map(),remove=[];world.traverse(o=>{if(o.isMesh&&!o.userData.keep&&!o.material.map&&!o.material.isShaderMaterial){const k=o.material.uuid;if(!buckets.has(k))buckets.set(k,{material:o.material,positions:[],normals:[]});const b=buckets.get(k),g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);b.positions.push(...g.attributes.position.array);b.normals.push(...g.attributes.normal.array);g.dispose();remove.push(o)}});for(const o of remove){o.removeFromParent();if(!sharedGeometries.has(o.geometry))o.geometry.dispose()}for(const b of buckets.values()){let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.normals,3));const merged=new THREE.Mesh(g,b.material);merged.receiveShadow=true;merged.castShadow=true;world.add(merged)}}
function buildCourse(){clearAtmosphere();if(world){scene.remove(world);world.traverse(o=>{if(o.geometry&&!o.isSprite&&!sharedGeometries.has(o.geometry))o.geometry.dispose();if(o.material&&!Array.from(materialCache.values()).includes(o.material)){if(o.material.map&&o.material.map!==glowTexture)o.material.map.dispose();o.material.dispose()}})}for(let r of racers){scene.remove(r.model);r.model.userData.shieldMesh?.material.dispose()}if(dragMesh){scene.remove(dragMesh);disposeUnique(dragMesh);dragMesh=null;dragItem=null}
for(const m of quizGateMeshes){scene.remove(m);disposeUnique(m)}quizGateMeshes=[];
for(let o of [...boxes,...coins,...hazards,...particles,...projectiles,...updrafts])if(o.mesh){scene.remove(o.mesh);disposeUnique(o.mesh)}boxes=[];coins=[];hazards=[];particles=[];projectiles=[];pads=[];ramps=[];updrafts=[];racers=[];world=new THREE.Group();scene.add(world);const cfg=courses[selectedTrack];scene.background=new THREE.Color(cfg.sky);scene.fog=new THREE.Fog(cfg.fog,220,850);curve=new THREE.CatmullRomCurve3(cfg.points.map(p=>new THREE.Vector3(mirrorMode?-p[0]:p[0],p[1],p[2])),true,'catmullrom',.3);length=curve.getLength();frames=Array.from({length:720},(_,i)=>({p:curve.getPointAt(i/720),t:curve.getTangentAt(i/720)}));
// Water is rendered by the animated environment shader.
world.add(createTerrain());
ribbon(-17,17,cfg.ground,-.3);ribbon(-13.5,13.5,cfg.edge,.05);ribbon(-12,12,cfg.road,.1);
for(let i=0;i<Math.floor(length/24);i++){const d=i*24;if(!gravAt(d))continue;for(const side of[-1,1]){const f=sample(d,side*11.1);const panel=box(0x7fd4ff,world,f.p.x,f.p.y+.22,f.p.z,.9,.1,9);panel.rotation.y=f.yaw;panel.material=mat(0x7fd4ff,true);
 const post=box(0x8fb6ff,world,0,0,0,.5,3.2,.5),pf=sample(d+12,side*13.4);post.position.copy(pf.p);post.position.y+=1.7;post.material=mat(0x8fb6ff,true)}}
for(let i=0;i<Math.floor(length/6);i++){let d=i*6;for(let side of[-1,1]){const f=sample(d,side*12.65);let strip=box(i%2===0?cfg.accent:cfg.edge,world,f.p.x,f.p.y+.18,f.p.z,1.25,.18,5.95);strip.rotation.y=f.yaw}if(i%3===0){let f=sample(d,0);let line=box(0xecedf0,world,f.p.x,f.p.y+.18,f.p.z,.16,.06,3.3);line.rotation.y=f.yaw}}
for(let i=0;i<9;i++)for(let j=0;j<3;j++){let f=sample(j*1.35,(i-4)*2.65);const check=box((i+j)%2?0xeef1ef:0x182b3d,world,f.p.x,f.p.y+.2,f.p.z,2.65,.08,1.35);check.rotation.y=f.yaw}
const gate=new THREE.Group(),f=sample(0);gate.position.copy(f.p);gate.rotation.y=f.yaw;box(0x24445b,gate,-14,6,0,1.6,12,1.6);box(0x24445b,gate,14,6,0,1.6,12,1.6);box(cfg.accent,gate,0,12,0,30,3.6,1.3);const sign=new THREE.Mesh(new THREE.PlaneGeometry(26,3.2),new THREE.MeshBasicMaterial({map:labelTexture('AURORA  /  KART','#1e374a','#e2ff8a'),side:THREE.DoubleSide}));sign.position.set(0,12,.69);gate.add(sign);world.add(gate);
for(let i=0;i<78;i++){const d=i/78*length;const side=i%2?1:-1;const p=roadside(d,side*(25+(Math.sin(i*42)*.5+.5)*35));tree(p,i);if(i%4===0){sphere(pick({mesa:0xb36b56,forge:0x33212a},0x73949d),world,p.x+7,p.y+2,p.z+7,5,3,4)}}
for(let i=0;i<25;i++){const a=i/25*TAU;let px=Math.sin(a)*520,pz=-150+Math.cos(a)*530;mesh(cone,pick({mesa:0xbf765e,night:0x394366,forge:0x38202c},0x78a8a2),world,px,20,pz,65,110+Math.sin(i*4)*40,65)}
for(let i=0;i<18;i++){const a=i*2.4;let p=new THREE.Vector3(Math.sin(a)*500,105+i%4*18,-150+Math.cos(a)*500);for(let j=0;j<3;j++)sphere(pick({night:0x657197,forge:0x5c3238},0xf5f0e9),world,p.x+j*17,p.y,p.z,24,10+j*2,11)}
// Barrier posts and colorful race flags.
for(let i=0;i<96;i++){const d=i/96*length;if(openAt(d))continue;const f=sample(d,(i%2?1:-1)*17.6);box(0xe9e6d9,world,f.p.x,f.p.y+1.7,f.p.z,.4,3.4,.4);if(i%8===0){let flag=box(cfg.accent,world,f.p.x+1.7,f.p.y+5.2,f.p.z,3.4,2,.15);flag.rotation.y=f.yaw;box(0xe9e6d9,world,f.p.x,f.p.y+3,f.p.z,.24,6,.24)}}
// Distinct landmarks beside the coast.
if(selectedTrack===0){const p=roadside(length*.36,-47);mesh(cylinder,0xfff4de,world,p.x,p.y+17,p.z,5,34,5);mesh(cylinder,0xff8461,world,p.x,p.y+22,p.z,5.15,5,5.15);mesh(cylinder,0x28485c,world,p.x,p.y+36,p.z,6.5,3,6.5);mesh(cone,0xff8461,world,p.x,p.y+41,p.z,7.5,7,7.5);for(let i=0;i<8;i++){const p=roadside(length*(.62+i*.014),-26);let g=new THREE.Group();g.position.copy(p);box(i%2?0xffb16a:0xffd889,g,0,3,0,8,6,7);let roof=mesh(cone,0xd66b56,g,0,8,0,7,5,7);roof.rotation.y=Math.PI/4;box(0x29556c,g,0,3,3.55,2.5,3,.2);world.add(g)}}
for(let q of [.13,.37,.62,.84]){for(let lane of[-8,0,8]){const f=sample(q*length,lane);const m=new THREE.Mesh(new THREE.BoxGeometry(2.7,2.7,2.7),new THREE.MeshStandardMaterial({color:0x95fff2,emissive:0x30a8bd,emissiveIntensity:.45,roughness:.25,metalness:.35}));m.position.copy(f.p).y+=3;scene.add(m);let inner=box(0xffffff,m,0,0,1.37,.4,1.5,.08);boxes.push({d:q*length,lane,mesh:m,cool:0,base:f.p.y+3})}}
for(let q of [.08,.24,.44,.56,.73,.92])for(let j=0;j<5;j++){const lane=q<.5?-5:5,d=(q*length+j*6)%length;const f=sample(d,lane);let m=mesh(cylinder,0xffdc64,scene,f.p.x,f.p.y+2,f.p.z,.78,.24,.78);m.rotation.z=Math.PI/2;coins.push({d,lane,mesh:m,cool:0,base:f.p.y+2,home:m.position.clone()})}
for(let q of [.21,.53,.79]){const d=q*length,lane=q===.53?-6:6;pads.push({d,lane,cool:0});for(let i=0;i<5;i++){let f=sample(d-4+i*2,lane);let m=box(0xdfff87,world,f.p.x,f.p.y+.24,f.p.z,5,.12,.9);m.rotation.y=f.yaw}}
// A wide launch ramp opens the glider, and the rings ahead keep you in the air.
{const d=.47*length,lane=0,f=sample(d,lane);ramps.push({d,lane,cool:0,big:true});
 const ramp=box(cfg.accent,world,f.p.x,f.p.y+1.3,f.p.z,14,2.4,13);ramp.rotation.set(-.24,f.yaw,0);
 for(let j=0;j<5;j++){const ff=sample(d-6+j*3,lane),m=box(cfg.edge,world,ff.p.x,ff.p.y+1.2+j*.42,ff.p.z,12,.18,.7);m.rotation.set(-.24,ff.yaw,0)}
 for(let side of[-1,1]){const post=box(0xe9e6d9,world,0,0,0,.9,7,.9),pf=sample(d+2,side*9);post.position.copy(pf.p);post.position.y+=3.5}
 for(let j=0;j<5;j++){const rd=d+26+j*22,rl=j%2?3.5:-3.5,rf=sample(rd,rl);
  const ring=new THREE.Mesh(torusGeometry,new THREE.MeshBasicMaterial({color:0x9bf0ff,transparent:true,opacity:.85}));
  ring.scale.setScalar(5.4);ring.position.copy(rf.p);ring.position.y+=9.5+j*1.1;ring.rotation.y=rf.yaw;scene.add(ring);
  addGlow(ring,0,0,0,0x8fe6ff,14);updrafts.push({d:rd,lane:rl,mesh:ring,cool:0})}}
for(let q of [.3,.68]){const d=q*length,lane=q===.3?6:-6;ramps.push({d,lane,cool:0});const f=sample(d,lane);let ramp=box(cfg.accent,world,f.p.x,f.p.y+.5,f.p.z,7,.8,9);ramp.rotation.set(-.1,f.yaw,0);for(let j=0;j<3;j++){let ff=sample(d-3+j*2,lane);let m=box(cfg.edge,world,ff.p.x,ff.p.y+1+j*.12,ff.p.z,5,.12,.5);m.rotation.y=ff.yaw}}
enhanceWorld();mergeWorld();
const field=gameMode==='online'?onlineField():null;
for(let i=0;i<(gameMode==='trial'?1:8);i++){
 const slot=field?field[i]:null,rival=rivals[i]||rivals[1];
 const colorIndex=slot?slot.color:(i===0?selectedColor:(i+selectedColor)%8);
 const model=kart(palette[colorIndex%8],slot?slot.kart%4:(i===0?selectedKart:(i+selectedKart)%4));scene.add(model);
 if(slot&&slot.remote&&!slot.cpu)model.add(nameTag(slot.name,'#'+palette[colorIndex%8].toString(16).padStart(6,'0')));
 const r={name:slot?slot.name:names[i],colorIndex:colorIndex%8,netId:slot?slot.id:0,remote:!!slot?.remote,cpu:slot?slot.cpu:i>0,buffer:[],quizScore:0,gone:false,air:0,airV:0,
  d:i===0?(gameMode==='trial'?-5:-25):-5-Math.floor((i-1)/2)*7,lane:i===0?(gameMode==='trial'?0:-4):(i%2?4:-4),speed:0,base:(86+rival.pace*9)|0,model,stun:0,boost:0,coins:0,finish:null,itemCooldown:6+i*2.2,
  pace:rival.pace,nerve:rival.nerve,aggression:rival.aggression,craft:rival.craft,wobble:rival.wobble,style:rival.style,
  mistake:0,driftGlow:0,lapsDone:0,best:null,lastLapAt:0,star:0,shrunk:0,inked:0,dragItem:null,item:null,targetLane:0,lineClock:0};
 racers.push(r);placeKart(r,0)}
$('courseTag').querySelector('b').textContent=cfg.name;$('courseTag').querySelector('span').textContent=['THE FIRST CIRCUIT','THE GOLDEN CIRCUIT','THE MIDNIGHT CIRCUIT','THE EMBER CIRCUIT'][selectedTrack];$('courseTag').querySelector('small').textContent=['海へ飛び出す、最初の一周。','夕陽を抜けて、頂点へ。','星のあいだを駆け抜ける。','溶けた鉄の谷を、突き抜ける。'][selectedTrack];finishWorldSetup();readBest();}
function placeKart(r,dt){
 const f=sample(r.d,r.lane),you=r===racers[0],u=r.model.userData; r.model.position.copy(f.p);r.model.position.y+=.36+(you?air+hop+dropY:(r.air||0)+Math.abs(Math.sin(r.d*.27))*.035);
 const yawOffset=you?steer*(drifting?.32:.085)+(drifting?driftDirection*.15:0):Math.sin(r.d*.025)*.05;
 const spin=you&&trickDone&&air>0?trickSpin:0,glide=(you?gliding:r.gliding)?-.14:0;r.model.rotation.set(-Math.asin(f.t.y)+glide,f.yaw+yawOffset+spin+(r.stun>0?(you?time*10:Math.sin(time*14)*.45):0),you?-steer*(drifting?.1:.045):0);
 u.body.position.y=(you&&air>0?0:Math.sin(r.d*1.1)*.023)*Math.min(1,r.speed/40);u.driver.rotation.z=you?-steer*.1:0;u.driver.rotation.y=you?-yawOffset*.3:0;u.steering.rotation.z=you?-steer*.6:Math.sin(r.d*.02)*.15;
 const grav=gravAt(r.d)?1:0;r.gravity=lerp(r.gravity||0,grav,1-Math.exp(-dt*4));
 r.model.position.y+=r.gravity*.55;
 for(const wheel of u.wheels){wheel.spin.rotation.x+=r.speed*dt/0.7;if(wheel.front)wheel.pivot.rotation.y=you?steer*.32:Math.sin(r.d*.02)*.06;
  wheel.pivot.rotation.z=r.gravity*(wheel.pivot.position.x>0?-1:1)*1.15;wheel.pivot.position.y=.71+r.gravity*.34}
 r.model.visible=!(you&&viewMode===3&&!photoMode&&(mode==='race'||mode==='countdown')&&!pressed('KeyR'));
 u.glider.visible=you?gliding:!!r.gliding;
 u.flame.visible=you?boost>0:r.boost>0;u.flame.scale.z=1+Math.sin(time*55)*.18;u.shieldMesh.visible=you?star>0:r.star>0;u.shieldMesh.rotation.y=time*.6;
 if(u.shieldMesh.visible)u.shieldMesh.material.color.setHSL(mod(time*.8,1),.85,.62);
 const small=you?shrunk>0:r.shrunk>0;r.model.scale.setScalar(lerp(r.model.scale.x,small?.52:1,1-Math.exp(-dt*9)));
}
function toast(message){$('toast').textContent=message;toastTime=2;$('toast').style.opacity=1}
function banner(title,subtitle=''){const el=$('raceBanner');el.innerHTML=`<b>${title}</b><small>${subtitle}</small>`;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');bannerTime=2.6;}
// ---- Audio ------------------------------------------------------------------
// One graph: a synthesised engine, a noise bed for tyres and wind, layered SFX and a
// step-sequenced soundtrack that follows the course and the speed you are carrying.
const buses={};let noiseBuffer=null,engineNodes=null,musicNext=0,musicStep=0,musicIntensity=0,crowdGain=null;
function noise(){if(!noiseBuffer){noiseBuffer=audioContext.createBuffer(1,audioContext.sampleRate*2,audioContext.sampleRate);const d=noiseBuffer.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}const src=audioContext.createBufferSource();src.buffer=noiseBuffer;src.loop=true;return src}
function buildAudio(){
 const ctx=audioContext,comp=ctx.createDynamicsCompressor();comp.threshold.value=-12;comp.ratio.value=7;comp.attack.value=.004;comp.release.value=.22;
 buses.master=ctx.createGain();buses.master.gain.value=volume;buses.master.connect(comp);comp.connect(ctx.destination);
 for(const [name,level] of [['sfx',.95],['music',.5],['engine',.5]]){buses[name]=ctx.createGain();buses[name].gain.value=level;buses[name].connect(buses.master)}
 const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=430;low.Q.value=6;
 const drive=ctx.createWaveShaper(),curve=new Float32Array(257);for(let i=0;i<257;i++){const x=i/128-1;curve[i]=Math.tanh(x*2.4)}drive.curve=curve;
 const gain=ctx.createGain();gain.gain.value=0;low.connect(drive);drive.connect(gain);gain.connect(buses.engine);
 const oscs=[['sawtooth',1,.5],['sawtooth',1.008,.42],['square',.5,.3]].map(([type,ratio,level])=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=60*ratio;g.gain.value=level;o.connect(g);g.connect(low);o.start();return{o,ratio}});
 const windSrc=noise(),wind=ctx.createBiquadFilter();wind.type='bandpass';wind.frequency.value=760;wind.Q.value=.8;const windGain=ctx.createGain();windGain.gain.value=0;windSrc.connect(wind);wind.connect(windGain);windGain.connect(buses.engine);windSrc.start();
 const skidSrc=noise(),skid=ctx.createBiquadFilter();skid.type='bandpass';skid.frequency.value=2400;skid.Q.value=2.4;const skidGain=ctx.createGain();skidGain.gain.value=0;skidSrc.connect(skid);skid.connect(skidGain);skidGain.connect(buses.engine);skidSrc.start();
 const crowdSrc=noise(),crowd=ctx.createBiquadFilter();crowd.type='bandpass';crowd.frequency.value=1150;crowd.Q.value=.55;crowdGain=ctx.createGain();crowdGain.gain.value=0;crowdSrc.connect(crowd);crowd.connect(crowdGain);crowdGain.connect(buses.music);crowdSrc.start();
 engineNodes={oscs,low,gain,windGain,skidGain};
}
function env(node,peak,attack,decay,at){const g=audioContext.createGain();g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),at+attack);g.gain.exponentialRampToValueAtTime(.0001,at+attack+decay);node.connect(g);return g}
function tone(freq,{type='sine',peak=.1,attack=.006,decay=.16,at=0,to='sfx',slide=0,detune=0}={}){
 if(!soundOn||!audioContext)return;const start=at||audioContext.currentTime,o=audioContext.createOscillator();o.type=type;o.frequency.setValueAtTime(freq,start);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,freq*slide),start+attack+decay);if(detune)o.detune.value=detune;
 const g=env(o,peak,attack,decay,start);g.connect(buses[to]||buses.sfx);o.start(start);o.stop(start+attack+decay+.05);
}
function burst({freq=900,q=1,peak=.18,decay=.2,at=0,slide=.25}={}){
 if(!soundOn||!audioContext)return;const start=at||audioContext.currentTime,src=noise(),f=audioContext.createBiquadFilter();f.type='bandpass';f.frequency.setValueAtTime(freq,start);f.frequency.exponentialRampToValueAtTime(Math.max(60,freq*slide),start+decay);f.Q.value=q;
 src.connect(f);const g=env(f,peak,.008,decay,start);g.connect(buses.sfx);src.start(start);src.stop(start+decay+.08);
}
const chord=(base,ratios,opts)=>ratios.forEach((r,i)=>tone(base*r,{...opts,at:(opts?.at||audioContext.currentTime)+i*(opts?.spread??.05)}));
function sfx(name,value=0){
 if(!soundOn||!audioContext)return;const now=audioContext.currentTime;
 switch(name){
  case 'coin':tone(880+Math.min(10,value)*60,{type:'triangle',peak:.09,decay:.13,slide:1.5});break;
  case 'item':tone(660,{type:'square',peak:.05,decay:.1,slide:2.2});break;
  case 'itemReady':chord(523,[1,1.26,1.5],{type:'triangle',peak:.08,decay:.22,spread:.045});break;
  case 'boost':burst({freq:2600,q:.7,peak:.22,decay:.42,slide:.12});tone(180,{type:'sawtooth',peak:.11,decay:.5,slide:3.4});break;
  case 'drift':tone(360+value*190,{type:'triangle',peak:.06,decay:.16,slide:1.35});break;
  case 'hit':burst({freq:1500,q:.5,peak:.3,decay:.42,slide:.08});tone(140,{type:'sawtooth',peak:.14,decay:.42,slide:.35});break;
  case 'bump':burst({freq:420,q:1.6,peak:.13,decay:.14,slide:.4});break;
  case 'wall':burst({freq:900,q:1.2,peak:.16,decay:.2,slide:.2});break;
  case 'shield':chord(392,[1,1.5,2,2.5],{type:'sine',peak:.08,decay:.5,spread:.06});break;
  case 'trick':chord(523,[1,1.5,2],{type:'triangle',peak:.09,decay:.24,spread:.05});break;
  case 'lap':chord(523.25,[1,1.26,1.5],{type:'triangle',peak:.1,decay:.4,spread:.07});break;
  case 'count':tone(440,{type:'square',peak:.09,decay:.2});break;
  case 'go':chord(660,[1,1.5,2],{type:'square',peak:.1,decay:.45,spread:.04});break;
  case 'finish':[[523.25,0],[659.25,.12],[783.99,.24],[1046.5,.38]].forEach(([f,t])=>tone(f,{type:'triangle',peak:.11,decay:t>.3?.8:.3,at:now+t}));break;
  case 'record':[0,.1,.2,.3,.46].forEach((t,i)=>tone([659.25,783.99,987.77,1318.5,1567.98][i],{type:'triangle',peak:.1,decay:.5,at:now+t}));break;
  case 'menu':tone(760,{type:'triangle',peak:.05,decay:.1});break;
  case 'star':[0,.07,.14,.21,.3].forEach((t,i)=>tone([523.25,659.25,783.99,1046.5,1318.5][i],{type:'square',peak:.075,decay:.3,at:now+t}));break;
  case 'bullet':burst({freq:520,q:.8,peak:.26,decay:.7,at:now,slide:3.2});tone(90,{type:'sawtooth',peak:.14,decay:.7,slide:3});break;
  case 'blue':[0,.18,.36].forEach(t=>{tone(1046.5,{type:'square',peak:.07,decay:.12,at:now+t});tone(784,{type:'square',peak:.07,decay:.12,at:now+t+.09})});break;
  case 'blast':burst({freq:2400,q:.3,peak:.34,decay:1,slide:.04});tone(58,{type:'sawtooth',peak:.2,decay:.9,slide:.4});break;
  case 'blooper':tone(420,{type:'sawtooth',peak:.1,decay:.5,slide:.25});burst({freq:700,q:1.4,peak:.14,decay:.5,slide:.3});break;
  case 'fall':tone(520,{type:'triangle',peak:.11,decay:.85,slide:.16});break;
  case 'quiz':chord(523.25,[1,1.5],{type:'triangle',peak:.07,decay:.22,spread:.07});break;
  case 'correct':[0,.08,.16,.26].forEach((t,i)=>tone([659.25,830.6,987.77,1318.5][i],{type:'triangle',peak:.1,decay:.34,at:now+t}));break;
  case 'wrong':tone(196,{type:'sawtooth',peak:.12,decay:.4,slide:.55});burst({freq:600,q:1.1,peak:.14,decay:.3,slide:.3});break;
  case 'overtake':chord(784,[1,1.33],{type:'triangle',peak:.05,decay:.14,spread:.05});break;
  case 'perfect':[0,.09,.18].forEach((t,i)=>tone([784,1046.5,1568][i],{type:'square',peak:.09,decay:.3,at:now+t}));break;
  case 'thunder':burst({freq:3200,q:.4,peak:.3,decay:.9,slide:.03});tone(70,{type:'sawtooth',peak:.16,decay:.9,slide:.5});break;
 }
}
// Each course gets its own key, tempo and drum feel; the mix opens up as you go faster.
const songs=[
 {bpm:132,root:261.63,scale:[0,2,4,7,9,12,16],pad:[0,5,3,7],wave:'triangle'},
 {bpm:118,root:220,scale:[0,3,5,7,10,12,15],pad:[0,3,5,10],wave:'sawtooth'},
 {bpm:146,root:196,scale:[0,2,3,7,9,10,14],pad:[0,7,3,5],wave:'square'},
 {bpm:158,root:174.61,scale:[0,1,5,7,8,12,13],pad:[0,5,8,3],wave:'sawtooth'}
];
const semitone=n=>Math.pow(2,n/12);
function musicTick(){
 if(!soundOn||!audioContext||!buses.music)return;
 const playing=mode==='race'||mode==='countdown'||mode==='finished';
 const target=mode==='menu'?.28:playing?.5:0;buses.music.gain.setTargetAtTime(target,audioContext.currentTime,.4);
 if(crowdGain){const near=mode==='race'&&racers[0]?Math.max(0,1-nearDistance(racers[0].d,0)/120):0;crowdGain.gain.setTargetAtTime(mode==='finished'?.06:near*.05,audioContext.currentTime,.5)}
 const song=songs[selectedTrack]||songs[0];
 const finalLap=mode==='race'&&lastLap>=totalLaps&&totalLaps>1,tempo=finalLap?1.18:1,pitch=finalLap?1.0595:1;
 const step=60/(song.bpm*tempo)/2;
 if(musicNext<audioContext.currentTime)musicNext=audioContext.currentTime+.06;
 const drive=clamp((racers[0]?.speed||0)/120+(boost>0?.35:0),0,1.35);musicIntensity=lerp(musicIntensity,mode==='menu'?.35:drive,.05);
 while(musicNext<audioContext.currentTime+.35){
  const i=musicStep,at=musicNext,bar=Math.floor(i/16)%4,beat=i%16,root=song.root*semitone(song.pad[bar])*pitch;
  if(beat%4===0)tone(root/2,{type:'sine',peak:.13,decay:step*2.6,at,to:'music'});
  if(musicIntensity>.18&&beat%2===0){const n=song.scale[(i*3+bar)%song.scale.length];tone(root*semitone(n),{type:song.wave,peak:.045+musicIntensity*.03,decay:step*1.3,at,to:'music'})}
  if(musicIntensity>.5&&beat%4===2){const n=song.scale[(i*5+2)%song.scale.length];tone(root*2*semitone(n),{type:'triangle',peak:.035,decay:step*.9,at,to:'music'})}
  if(star>0&&beat%2===0)tone(root*4*semitone(song.scale[i%song.scale.length]),{type:'square',peak:.05,decay:step*.55,at,to:'music'});
  if(playing){
   if(beat%4===0)burst({freq:150,q:2.6,peak:.16,decay:.13,at,slide:.35});
   if(beat%8===4)burst({freq:1900,q:.9,peak:.1,decay:.16,at,slide:.4});
   if(musicIntensity>.6&&beat%2===1)burst({freq:6200,q:1.4,peak:.028,decay:.05,at,slide:.7});
  }
  musicStep++;musicNext+=step;
 }
}
function updateEngineAudio(dt){
 if(!soundOn||!audioContext||!engineNodes)return;const ctx=audioContext,r=racers[0],driving=mode==='race'||mode==='countdown';
 const speed=driving?(r?.speed||0):0,load=clamp(speed/(kartTypes[selectedKart].speed+30),0,1.4);
 const base=42+speed*1.55+(boost>0?26:0)+(drifting?9:0);
 for(const {o,ratio} of engineNodes.oscs)o.frequency.setTargetAtTime(base*ratio,ctx.currentTime,.05);
 engineNodes.low.frequency.setTargetAtTime(380+speed*7+(boost>0?900:0),ctx.currentTime,.08);
 engineNodes.gain.gain.setTargetAtTime(driving?.1+load*.12:0,ctx.currentTime,.12);
 engineNodes.windGain.gain.setTargetAtTime(driving?Math.pow(load,2)*.07:0,ctx.currentTime,.15);
 engineNodes.skidGain.gain.setTargetAtTime(drifting&&speed>30?.055+driftStage*.02:0,ctx.currentTime,.05);
 buses.master.gain.setTargetAtTime(volume,ctx.currentTime,.1);
}
function enableAudio(){
 soundOn=!soundOn;
 try{if(soundOn&&!audioContext){audioContext=new(window.AudioContext||window.webkitAudioContext)();buildAudio()}
  if(soundOn){audioContext.resume();musicNext=audioContext.currentTime;musicStep=0;sfx('itemReady')}
  else if(buses.master)buses.master.gain.setTargetAtTime(0,audioContext.currentTime,.05);
 }catch{soundOn=false;toast('このブラウザでは音声を開始できませんでした')}
 $('sound').textContent=soundOn?'音声 ON':'音声 OFF';$('sound').setAttribute('aria-label',soundOn?'音声をオフにする':'音声をオンにする');$('sound').classList.toggle('on',soundOn);savePreferences();
}
// ---- Items -------------------------------------------------------------------
// Glyph, name and colour. Shells and bananas can be dragged behind the kart as a
// shield, exactly as they can in the game this owes everything to.
const itemData={
 boost:['⚡','ダッシュキノコ','#ff8a6a'],
 triple:['⚡','トリプルキノコ','#ff8a6a'],
 banana:['▲','バナナ','#ffd95e'],
 green:['◯','みどりこうら','#6ef0a8'],
 red:['◉','あかこうら','#ff6f6f'],
 star:['✦','スター','#ffe066'],
 thunder:['ϟ','サンダー','#bcd4ff'],
 bullet:['➤','キラー','#cfd8e0'],
 blue:['◈','トゲゾーこうら','#7fb4ff'],
 blooper:['✱','ゲッソー','#c9d6ff'],
 magnet:['❍','コインマグネット','#ffe274']
};
const draggable=new Set(['banana','green','red']);
// Slot odds by position, the way a kart racer keeps a race alive.
const itemTable=[
 ['banana','banana','green','boost','blooper'],
 ['banana','green','green','boost','blooper'],
 ['green','red','boost','banana','triple'],
 ['red','boost','triple','blue','green'],
 ['red','triple','blue','star','magnet'],
 ['star','triple','blue','thunder','bullet'],
 ['star','bullet','thunder','triple','blue'],
 ['bullet','star','thunder','triple','bullet']
];
function rollItem(){const row=itemTable[clamp(getRank(),1,8)-1];return row[Math.floor(Math.random()*row.length)]}
function updateItem(){
 const info=heldItem?itemData[heldItem]:['?','アイテムなし','#dcff7e'];
 $('itemIcon').textContent=info[0];$('itemIcon').style.color=info[2];$('itemName').textContent=info[1];
 $('item').classList.toggle('ready',!!heldItem);$('item').classList.toggle('dragging',!!dragItem);
 $('itemHint').textContent=gameMode==='trial'?`残り ${trialBoosts} 回`:heldItem==='triple'?`残り ${tripleCharges} 回`:dragItem?'はなして発射':draggable.has(heldItem)?'長押しでガード':'SPACE / タップ';
}
function gainItem(){if(heldItem||roulette>0||gameMode==='trial')return;roulette=1.05;sfx('item');spark(racers[0],0x8ef5ff,10)}
function activateBoost(duration,message){boost=Math.max(boost,duration);if(message)toast(message);shake=Math.max(shake,.12);sfx('boost')}
// --- holding and dragging ------------------------------------------------------
function pressItem(){if(mode!=='race')return;if(dragItem){releaseDrag();return}itemHeld=heldItem&&draggable.has(heldItem)&&gameMode!=='trial'?.001:0;if(!itemHeld)useItem()}
function releaseItemKey(){if(itemHeld>0){if(dragItem)releaseDrag();else useItem();itemHeld=0}}
function startDrag(){
 const type=heldItem;if(!type||!draggable.has(type))return;
 dragItem=type;heldItem=null;
 const colour=type==='banana'?0xffd95e:type==='green'?0x5fe09a:0xff6f6f;
 dragMesh=type==='banana'?mesh(cone,colour,scene,0,0,0,1.2,1.7,1.2):sphere(colour,scene,0,0,0,.95,.8,.95);
 dragMesh.material=mat(colour,true);updateItem();sfx('item');
}
function clearDrag(){if(dragMesh){scene.remove(dragMesh);disposeUnique(dragMesh);dragMesh=null}dragItem=null;updateItem()}
function releaseDrag(){const type=dragItem;clearDrag();if(type){heldItem=type;useItem()}}
// --- using an item -------------------------------------------------------------
function useItem(){
 if(mode!=='race'||!heldItem)return;const r=racers[0],type=heldItem,back=pressed('ArrowDown')||pressed('KeyS');
 heldItem=null;if(gameMode==='trial'){trialBoosts=Math.max(0,trialBoosts-1);if(trialBoosts>0)heldItem='boost'}
 updateItem();
 if(type==='boost')activateBoost(2.8,'ダッシュキノコ！');
 else if(type==='triple'){tripleCharges--;activateBoost(1.7,tripleCharges>0?`トリプルキノコ！ のこり ${tripleCharges}`:'トリプルキノコ！');if(tripleCharges>0)heldItem='triple';updateItem()}
 else if(type==='banana'){dropTrap(r,0);toast('バナナを置いた！');sfx('item')}
 else if(type==='green'){spawnShell(r,0,'green',null,back);toast(back?'みどりこうら（うしろ）！':'みどりこうら！')}
 else if(type==='red'){
  const target=racers.filter(a=>a!==r&&!a.finish&&a.d>r.d).sort((a,b)=>a.d-b.d)[0];
  if(target){spawnShell(r,0,'red',target,false);toast('あかこうら発射！')}
  else if(back||racers.length>1){spawnShell(r,0,'green',null,true);toast('うしろへ発射！')}
  else activateBoost(1.5,'前方クリア！ ブーストに変換');
 }
 else if(type==='star'){netEvent({k:'item',type:'star'});star=8;invulnerable=Math.max(invulnerable,.2);toast('スター！ 無敵だ');sfx('star');spark(r,0xffe066,24);addCombo()}
 else if(type==='thunder'){netEvent({k:'item',type:'thunder'});useThunder(0)}
 else if(type==='bullet'){bullet=6;toast('キラー！ つかまれ');sfx('bullet');shake=.4;spark(r,0xcfd8e0,20)}
 else if(type==='blue'){
  const leader=[...racers].filter(a=>!a.finish).sort((a,b)=>b.d-a.d)[0];
  if(leader&&leader!==r){spawnShell(r,0,'blue',leader,false);toast('トゲゾーこうら発射！');sfx('blue')}
  else activateBoost(1.6,'トップ！ ブーストに変換');
 }
 else if(type==='blooper'){netEvent({k:'item',type:'blooper'});useBlooper(r)}
 else if(type==='magnet'){magnet=7;toast('コインマグネット！');sfx('itemReady');spark(r,0xffe274,16)}
}
function useThunder(ownerIndex){
 const owner=racers[ownerIndex];hitFlash=.45;sfx('thunder');
 for(const a of racers){
  if(a===owner||a.finish)continue;
  if(a===racers[0]){if(star>0||bullet>0)continue;shrunk=9;stun=Math.max(stun,.5);a.stun=stun;a.coins=Math.max(0,a.coins-3);shake=.5;toast('サンダー！ ちぢんだ…')}
  else {a.shrunk=9;a.stun=Math.max(a.stun,.6);a.coins=Math.max(0,(a.coins||0)-3)}
  spark(a,0xbcd4ff,10);
 }
 if(ownerIndex===0)toast('サンダー！ 全員ちぢませた');
}
function useBlooper(owner){
 sfx('blooper');
 for(const a of racers){
  if(a===owner||a.finish||a.d<owner.d)continue;
  if(a===racers[0]){if(star>0||bullet>0)continue;ink=7.5;inkSeed=Math.random()*97;toast('ゲッソー！ 前が見えない')}
  else a.inked=6;
 }
 if(owner===racers[0])toast('ゲッソー！ 前の走者にスミを吹きかけた');
}
// --- shells --------------------------------------------------------------------
function spawnShell(owner,ownerIndex,kind,target,back=false){
 const colour=kind==='green'?0x5fe09a:kind==='blue'?0x6aa8ff:0xff6f6f;
 const m=sphere(colour,scene,0,0,0,kind==='blue'?1.05:.9);m.material=mat(colour,true);addGlow(m,0,0,0,colour,kind==='blue'?6:4);
 const speed=kind==='blue'?235:kind==='red'?168:back?-135:162;
 projectiles.push({kind,d:owner.d+(back?-4:5),lane:owner.lane,vlane:kind==='green'?(owner===racers[0]?steer*-4:0):0,bounces:3,
  target,mesh:m,life:kind==='green'?6:8,owner,ownerIndex,speed,grace:.28,spin:Math.random()*TAU});
 if(kind==='blue'&&target===racers[0])blueWarn=6;
 if(owner===racers[0])netEvent({k:'shell',kind,tid:target?.netId,back});
}
function shellStep(dt){
 for(let i=projectiles.length-1;i>=0;i--){
  const p=projectiles[i];p.life-=dt;p.grace=Math.max(0,p.grace-dt);
  if(p.kind==='green'){
   p.d+=p.speed*dt;p.lane+=p.vlane*dt;
   if(Math.abs(p.lane)>ROAD_EDGE){p.lane=clamp(p.lane,-ROAD_EDGE,ROAD_EDGE);p.vlane*=-1;if(--p.bounces<0)p.life=0;else sfx('wall')}
   for(const a of racers){if((a===p.owner&&p.grace>0)||a.finish||a.remote)continue;if(nearDistance(a.d,p.d)<3.6&&Math.abs(a.lane-p.lane)<2.5&&(a!==racers[0]||air<2.5)){hit(a);p.life=0;break}}
  }else if(p.kind==='blue'){
   p.d+=p.speed*dt;if(p.target)p.lane=lerp(p.lane,p.target.lane,1-Math.exp(-dt*4));
   if(!p.target||p.target.finish||p.d>=p.target.d-2){if(p.target&&!p.target.remote)blueBlast(p.target);else if(p.target){sfx('blast');spark(p.target,0x9ec8ff,20)}p.life=0}
  }else{
   p.d+=p.speed*dt;if(p.target)p.lane=lerp(p.lane,p.target.lane,1-Math.exp(-dt*7));
   if(!p.target||p.target.finish)p.life=0;else if(p.d>=p.target.d-2){if(!p.target.remote)hit(p.target);p.life=0}
  }
  const f=sample(p.d,p.lane);p.mesh.position.copy(f.p);p.mesh.position.y+=p.kind==='blue'?3.4+Math.sin(time*4)*.7:1.9;
  p.mesh.rotation.y=(p.spin+=dt*9);
  if(p.life<=0){scene.remove(p.mesh);disposeUnique(p.mesh);projectiles.splice(i,1);updateItem()}
 }
}
function blueBlast(target){
 sfx('blast');hit(target,1.6);spark(target,0x9ec8ff,26);
 for(const a of racers)if(a!==target&&!a.finish&&nearDistance(a.d,target.d)<12&&Math.abs(a.lane-target.lane)<7)hit(a);
 if(target===racers[0]){shake=.85;hitFlash=.6;blueWarn=0}
 banner('トゲゾー直撃','BLUE SHELL');
}
function hit(r,power=1){
 if(r===racers[0]){
  if(star>0||bullet>0||invulnerable>0)return;
  if(dragItem){clearDrag();toast('うしろのアイテムでガード！');sfx('bump');spark(r,0xffe9a8,12);return}
 }else{
  if(r.star>0)return;
  if(r.dragItem){r.dragItem=null;spark(r,0xffe9a8,8);return}
 }
 if(r.stun>.3)return;
 r.stun=1.5*power;r.speed*=.42;spark(r,0xffdd8c,15);
 if(r===racers[0]){stun=r.stun;invulnerable=2.4;drift=0;drifting=false;gliding=false;comboCount=0;comboTimer=0;r.coins=Math.max(0,r.coins-3);shake=.5+power*.2;hitFlash=.4;toast('スピン！');sfx('hit');if(dragItem)clearDrag()}
}
function spark(r,color,amount=1){if(particles.length>140)return;const f=sample(r.d-1.8,r.lane);for(let i=0;i<amount;i++){const side=i%2?1:-1;let m=sphere(color,scene,f.p.x+f.n.x*side*1.7,f.p.y+.55+air*.6,f.p.z+f.n.z*side*1.7,.13+Math.random()*.13);m.material=mat(color,true);particles.push({mesh:m,life:.35+Math.random()*.3,v:f.t.clone().multiplyScalar(-8-Math.random()*12).addScaledVector(f.n,(Math.random()-.5)*10).add(new THREE.Vector3(0,Math.random()*5,0))})}}
function smoke(r,color=0xdfe7ec,amount=1,spread=1.8){
 if(particles.length>170)return;const f=sample(r.d-2.2,r.lane);
 for(let i=0;i<amount;i++){const side=i%2?1:-1,m=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color,transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending}));
  m.position.set(f.p.x+f.n.x*side*spread,f.p.y+.5,f.p.z+f.n.z*side*spread);m.scale.setScalar(1.6+Math.random()*1.4);scene.add(m);
  particles.push({mesh:m,life:.45+Math.random()*.35,fade:true,v:new THREE.Vector3((Math.random()-.5)*4,2.4+Math.random()*2.6,(Math.random()-.5)*4).addScaledVector(f.t,-5)})}}
function addCombo(){comboCount=comboTimer>0?comboCount+1:1;comboTimer=4.5;bestCombo=Math.max(bestCombo,comboCount);if(comboCount>=3)sfx('overtake')}
let driftDirection=0,driftStage=0,wallCooldown=0,skidClock=0,trickPressed=false;
function doTrick(){if(mode==='race'&&air>1&&!trickDone){trickDone=true;trickCount++;trickSpin=0;toast('トリック成功！ 着地でブースト');sfx('trick');spark(racers[0],0xffe3a0,14)}}
function beginSession(){if(gameMode==='online'){openLobby();return}quizSeed=Math.floor(Math.random()*1e9);gpRound=0;gpPoints=Array(8).fill(0);gpWins=Array(8).fill(0);gpFinished=false;if(gameMode==='grandprix')selectedTrack=0;startRace()}
function startRace(){
 photoMode=false;document.body.classList.remove('photo-mode');keys={};padKeys={};elapsed=0;count=3.5;lastCount='';boost=0;drift=0;drifting=false;driftDirection=0;driftStage=0;heldItem=null;roulette=0;stun=0;air=0;airV=0;hop=0;hopV=0;finishTime=0;star=0;bullet=0;shrunk=0;ink=0;rescue=0;dropY=0;rescueD=0;gliding=false;glideBoost=0;itemHeld=0;dragItem=null;dragMesh=null;blueWarn=0;finishOrder=[];finalOrder=[];lastLap=1;lapStart=0;steer=0;lateralSpeed=0;lapTimes=[];driftCount=0;trickCount=0;coinTotal=0;comboCount=0;comboTimer=0;draftCharge=0;draftCooldown=0;trickDone=false;trickSpin=0;invulnerable=0;hitFlash=0;magnet=0;tripleCharges=0;startPress=null;slowMotion=1;perfectStart=0;lastBestLap=null;bumpCooldown=0;landDust=0;topSpeed=0;bestCombo=0;shake=0;wallCooldown=0;resultDelay=0;accumulator=0;hudClock=0;rankPrevious=8;trialBoosts=3;ghostSamples=[];ghostClock=0;ghostIndex=0;ghostDistanceIndex=0;ghostRecord=null;bestBefore=null;
 aiDifficulty=Number($('difficulty').value);buildCourse();buildQuiz();mode='intro';introTime=introLength;document.body.classList.add('racing','intro');document.body.classList.remove('airborne');$('menu').hidden=true;$('courseTag').hidden=true;$('hud').hidden=false;$('pause').hidden=false;$('pausePanel').hidden=true;$('results').hidden=true;$('helpPanel').hidden=true;$('touch').hidden=!touch;$('ghostDelta').textContent='';$('startLights').hidden=true;$('combo').innerHTML='';$('lapSplits').innerHTML='';$('nextRace').hidden=true;
 $('raceTip').textContent='↑ / W 加速　↓ / S ブレーキ　← → ハンドル　E トリック　C 視点　R 後方　F フォト';
 if(gameMode==='trial'){heldItem='boost';loadGhost()}updateItem();const f=sample(racers[0].d-20,racers[0].lane);camPos.copy(f.p).y+=12;camLook.copy(racers[0].model.position).y+=2;banner(courses[selectedTrack].name.toUpperCase(),gameMode==='grandprix'?`AURORA CUP · ROUND ${gpRound+1} / ${gpRaces}`:gameMode==='trial'?`TIME ATTACK · ${totalLaps} LAPS`:`SINGLE RACE · ${totalLaps} LAPS`);updateHUD();
}
const gpRaces=4;
function endIntro(){mode='countdown';document.body.classList.remove('intro');clock.getDelta();accumulator=0}
function nextGrandPrix(){if(gameMode!=='grandprix'||gpRound>=gpRaces-1)return;gpRound++;selectedTrack=gpRound;startRace()}
function backMenu(){mode='menu';photoMode=false;document.body.classList.remove('photo-mode','intro');keys={};padKeys={};document.body.classList.remove('racing','airborne');$('menu').hidden=false;$('courseTag').hidden=false;$('hud').hidden=true;$('pause').hidden=true;$('pausePanel').hidden=true;$('results').hidden=true;$('touch').hidden=true;$('countdown').textContent='';$('startLights').hidden=true;$('toast').style.opacity=0;$('raceBanner').classList.remove('show');boost=0;selectedTrack=gameMode==='grandprix'?0:selectedTrack;refreshSelections();buildCourse()}
let beforePause='race';function pauseGame(){if(mode==='intro'){endIntro();return}if(mode==='race'||mode==='countdown'){beforePause=mode;mode='paused';$('pausePanel').hidden=false;keys={};padKeys={}}else if(mode==='paused'){mode=beforePause;$('pausePanel').hidden=true;accumulator=0;clock.getDelta()}}
function formatTime(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}.${String(Math.floor(t*1000%1000)).padStart(3,'0')}`}
function storageKey(track=selectedTrack){return `aurora-v3-${gameMode==='trial'?'trial':'race'}-${track}-${selectedKart}-${gameMode==='trial'?'fixed':$('difficulty').value}-${totalLaps}${mirrorMode?'-m':''}`}
function storedTime(track){try{const v=Number(localStorage.getItem(storageKey(track)));return v>0?v:null}catch{return null}}
// The course list doubles as a record book for the settings you are about to race.
function renderRecords(){document.querySelectorAll('[data-track] i').forEach(el=>{const v=storedTime(Number(el.closest('[data-track]').dataset.track));el.textContent=v?formatTime(v):'↗';el.classList.toggle('has-time',!!v)})}
function loadProfile(){try{profile=JSON.parse(localStorage.getItem('aurora-profile')||'null')}catch{profile=null}
 if(!profile||typeof profile!=='object')profile={};for(const k of ['races','wins','cups','drifts','tricks','coins','podiums','words','asked'])if(!Number.isFinite(profile[k]))profile[k]=0;renderProfile()}
function saveProfile(){try{localStorage.setItem('aurora-profile',JSON.stringify(profile))}catch{}renderProfile()}
function renderProfile(){if(!profile)return;$('profileStrip').innerHTML=[['RACES',profile.races],['WINS',profile.wins],['CUPS',profile.cups],['WORDS',profile.words]].map(([k,v])=>`<span><b>${v}</b>${k}</span>`).join('')}
function readBest(){try{const v=Number(localStorage.getItem(storageKey()));$('best').textContent=v>0?`自己ベスト  ${formatTime(v)}${gameMode==='trial'?' · ゴーストと勝負':''}`:gameMode==='trial'?'3回のターボを、どこで使う？ 自己ベストを記録しよう。':''}catch{}}
function loadGhost(){try{bestBefore=Number(localStorage.getItem(storageKey()))||null;const data=JSON.parse(localStorage.getItem(storageKey()+'-ghost')||'null');if(data&&data.version===2&&Array.isArray(data.samples)&&data.samples.length>2&&data.samples.length<15000&&data.samples.every(a=>Array.isArray(a)&&a.length===4&&a.every(Number.isFinite))){ghostRecord=data;ghostModel=kart(0x8fe9ff,selectedKart);ghostModel.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.22;o.material.depthWrite=false;o.castShadow=false}});ghostModel.userData.shieldMesh.visible=false;scene.add(ghostModel)}}catch{ghostRecord=null}}
function updateGhost(dt){if(gameMode!=='trial')return;ghostClock+=dt;if(ghostClock>=.1){ghostClock-=.1;const r=racers[0];ghostSamples.push([Number(elapsed.toFixed(3)),Number(r.d.toFixed(3)),Number(r.lane.toFixed(3)),Number(air.toFixed(3))])}if(!ghostRecord||!ghostModel)return;const data=ghostRecord.samples;while(ghostIndex<data.length-2&&data[ghostIndex+1][0]<elapsed)ghostIndex++;const a=data[ghostIndex],b=data[Math.min(ghostIndex+1,data.length-1)],f=clamp((elapsed-a[0])/(b[0]-a[0]||.1),0,1);const d=lerp(a[1],b[1],f),lane=lerp(a[2],b[2],f),p=sample(d,lane);ghostModel.position.copy(p.p).y+=.36+lerp(a[3],b[3],f);ghostModel.rotation.set(-Math.asin(p.t.y),p.yaw,0);ghostModel.visible=elapsed<=data[data.length-1][0];while(ghostDistanceIndex<data.length-2&&data[ghostDistanceIndex+1][1]<racers[0].d)ghostDistanceIndex++;const ga=data[ghostDistanceIndex],gb=data[Math.min(ghostDistanceIndex+1,data.length-1)],gf=clamp((racers[0].d-ga[1])/(gb[1]-ga[1]||1),0,1),difference=lerp(ga[0],gb[0],gf)-elapsed;$('ghostDelta').textContent=(difference>=0?'−':'+')+Math.abs(difference).toFixed(2)+'s  GHOST';$('ghostDelta').style.color=difference>=0?'#b4fcda':'#ffbfa8'}
function finishRace(){
 const r=racers[0];if(r.finish!==null)return;r.finish=elapsed;finishTime=elapsed;finishOrder.push(r);mode='finished';resultDelay=2.3;slowMotion=.3;$('pause').hidden=true;$('touch').hidden=true;$('countdown').textContent='FINISH!';$('raceBanner').classList.remove('show');keys={};padKeys={};lapTimes.push(elapsed-lapStart);finalOrder=[...finishOrder,...racers.filter(a=>!finishOrder.includes(a)).sort((a,b)=>b.d-a.d)];
 for(const a of finalOrder)a.resultRemaining=Math.max(0,Math.round(length*totalLaps-a.d));
 if(gameMode==='grandprix'){for(let i=0;i<finalOrder.length;i++){const idx=racers.indexOf(finalOrder[i]);if(idx<0)continue;gpPoints[idx]+=pointsTable[i];if(i===0)gpWins[idx]++}gpFinished=gpRound===gpRaces-1;}
 if(profile){profile.races++;profile.drifts+=driftCount;profile.tricks+=trickCount;profile.coins+=coinTotal;profile.words+=quizCorrect;profile.asked+=quizLog.length;const rank=finalOrder.indexOf(r)+1;if(rank===1&&gameMode!=='trial')profile.wins++;if(rank<=3&&gameMode!=='trial')profile.podiums++;if(gameMode==='grandprix'&&gpFinished&&cupOrder()[0].name==='YOU')profile.cups++;saveProfile()}
 if(gameMode==='online'&&net&&net.state==='open')net.send({t:'fin',time:finishTime,correct:quizCorrect,asked:quizLog.length});
 sfx('finish');try{const prev=Number(localStorage.getItem(storageKey()));bestBefore=prev||null;if(!prev||finishTime<prev){localStorage.setItem(storageKey(),String(finishTime));if(gameMode==='trial'){ghostSamples.push([finishTime,r.d,r.lane,air]);localStorage.setItem(storageKey()+'-ghost',JSON.stringify({version:2,time:finishTime,samples:ghostSamples}))}}}catch{}
}
function wordReview(){
 if(!quizLog.length)return '';
 const missed=quizLog.filter(x=>!x.correct);
 if(!missed.length)return `<div class="word-review perfect">ぜんもん正解！ ${quizLog.length}語パーフェクト 🎉</div>`;
 return `<div class="word-review"><b>おぼえなおす単語</b>${missed.map(x=>`<span>${x.word[0]} ${x.word[1]} = <em>${x.word[2]}</em></span>`).join('')}</div>`;
}
function cupOrder(){return racers.map((r,i)=>({name:r.name,idx:i,points:gpPoints[i],wins:gpWins[i]})).sort((a,b)=>b.points-a.points||b.wins-a.wins||finalOrder.findIndex(r=>r.name===a.name)-finalOrder.findIndex(r=>r.name===b.name))}
function showResults(){
 $('countdown').textContent='';$('results').hidden=false;const r=racers[0],rank=finalOrder.indexOf(r)+1,newBest=!bestBefore||finishTime<bestBefore;$('resultEyebrow').textContent=(gameMode==='grandprix'?(gpFinished?'AURORA CUP / FINAL STANDINGS':`AURORA CUP / ROUND ${gpRound+1} OF ${gpRaces}`):gameMode==='trial'?'TIME ATTACK':'FINISH LINE')+(perfectStart?' / PERFECT START':'');
 $('resultTitle').textContent=gameMode==='trial'?(newBest?'NEW RECORD!':'TIME ATTACK'):gpFinished?(cupOrder()[0].name==='YOU'?'CHAMPION!':'CUP COMPLETE'):rank===1?'VICTORY!':'NICE RACE!';
 $('resultRank').textContent=gpFinished?`${cupOrder().findIndex(a=>a.name==='YOU')+1} 位 / 総合`:gameMode==='trial'?`${totalLaps} LAPS`:`${rank} 位 / ${racers.length}`;
 $('resultTime').textContent=formatTime(finishTime)+(newBest?' ★':'');
 $('recordLine').textContent=newBest?(bestBefore?`自己ベスト更新！ −${(bestBefore-finishTime).toFixed(3)}s`:'初記録を樹立'):bestBefore?`自己ベストまで +${(finishTime-bestBefore).toFixed(3)}s`:'';
 $('recordLine').classList.toggle('new-record',newBest);
 const stats=quizEnabled()
  ?[['せいかい',`${quizCorrect} / ${quizGates.length}`],['最大れんぞく',quizBestStreak+'×'],['ベストラップ',formatTime(Math.min(...lapTimes))],['ドリフト',driftCount],['コイン',coinTotal],['最高速',Math.round(topSpeed*1.45)+' km/h']]
  :[['ベストラップ',formatTime(Math.min(...lapTimes))],['ドリフト',driftCount],['トリック',trickCount],['コイン',coinTotal],['最高速',Math.round(topSpeed*1.45)+' km/h'],['コンボ最大',bestCombo+'×']];
 $('raceStats').innerHTML=stats.map(([label,value])=>`<div><b>${value}</b><span>${label}</span></div>`).join('');
 if(gameMode==='trial')$('standings').innerHTML=lapTimes.map((t,i)=>`<div class="standing"><b>LAP ${i+1}</b><span>${formatTime(t)}</span></div>`).join('');
 else if(gameMode==='grandprix')$('standings').innerHTML=cupOrder().map((a,i)=>`<div class="standing ${a.name==='YOU'?'you':''}"><b>${String(i+1).padStart(2,'0')}</b><span>${a.name}</span><span>${a.points} PTS</span></div>`).join('');
 else $('standings').innerHTML=finalOrder.map((a,i)=>`<div class="standing ${a===r?'you':''}"><b>${String(i+1).padStart(2,'0')}</b><span>${a.name}</span><span>${a.quizScore!==undefined?a.quizScore+' 語 · ':''}${a.finish?formatTime(a.finish):'残り '+a.resultRemaining+' m'}</span></div>`).join('');
 if(quizEnabled())$('standings').innerHTML+=wordReview();
 if(gameMode==='online'){$('resultEyebrow').textContent='ONLINE ROOM '+(net?.code||'');$('nextRace').hidden=true;$('again').textContent='待機室にもどる →';if(onlineResults)renderOnlineResults();else $('standings').innerHTML=`<div class="standing"><span>ほかのプレイヤーのゴールを待っています…</span></div>`+(quizEnabled()?wordReview():'')}
 $('nextRace').hidden=gameMode!=='grandprix'||gpFinished;$('nextRace').textContent=`次のコースへ (${Math.min(gpRaces,gpRound+2)}/${gpRaces}) →`;$('again').hidden=gameMode==='grandprix'&&!gpFinished;$('again').textContent=gameMode==='grandprix'?'もう一度グランプリ →':'もう一度レース →';
}
// Off the edge: you drop, something fishes you out, and you lose the time it costs.
function beginRescue(){if(rescue>0)return;const r=racers[0];rescue=2.1;dropY=0;drifting=false;drift=0;boost=0;star=0;bullet=0;gliding=false;lateralSpeed=0;r.speed=0;shake=.45;comboCount=0;comboTimer=0;sfx('fall');toast('コースアウト！')}
function rescueStep(dt){
 const r=racers[0];rescue-=dt;r.stun=0;drift=0;air=0;airV=0;
 if(rescue>1.2)dropY-=dt*30;
 else if(rescue>.4){dropY=lerp(dropY,7,1-Math.exp(-dt*5));r.lane=lerp(r.lane,0,1-Math.exp(-dt*4));r.d=lerp(r.d,rescueD,1-Math.exp(-dt*4))}
 else dropY=lerp(dropY,0,1-Math.exp(-dt*9));
 if(rescue<=0){rescue=0;dropY=0;r.lane=0;r.d=rescueD;r.speed=0;invulnerable=2.4;sfx('itemReady')}
 placeKart(r,dt);aiStep(dt,false);updateGhost(dt);
}
function raceStep(dt){
 const r=racers[0],cfg=kartTypes[selectedKart];elapsed+=dt;boost=Math.max(0,boost-dt);magnet=Math.max(0,magnet-dt);bumpCooldown=Math.max(0,bumpCooldown-dt);stun=Math.max(0,stun-dt);invulnerable=Math.max(0,invulnerable-dt);wallCooldown=Math.max(0,wallCooldown-dt);draftCooldown=Math.max(0,draftCooldown-dt);comboTimer=Math.max(0,comboTimer-dt);star=Math.max(0,star-dt);if(bullet>0){bullet=Math.max(0,bullet-dt);if(bullet===0){toast('キラー終了');racers[0].speed*=.82}}shrunk=Math.max(0,shrunk-dt);ink=Math.max(0,ink-dt);blueWarn=Math.max(0,blueWarn-dt);r.stun=stun;
 if(rescue>0){rescueStep(dt);return}
 // A lane offset runs along the road normal, which points to the driver's LEFT, so the
 // key direction is flipped once here: pressing right has to steer right on screen.
 const turn=(pressed('ArrowRight')||pressed('KeyD')?1:0)-(pressed('ArrowLeft')||pressed('KeyA')?1:0),input=-turn,gas=autoGas||pressed('ArrowUp')||pressed('KeyW'),brake=pressed('ArrowDown')||pressed('KeyS'),shift=pressed('ShiftLeft')||pressed('ShiftRight');
 steer=lerp(steer,input,1-Math.exp(-dt*10));
 const offroad=Math.abs(r.lane)>ROAD_EDGE&&star<=0&&bullet<=0;
 const max=(boost>0?cfg.speed+38:star>0?cfg.speed+24:cfg.speed+r.coins*.65)*(quizBoost>0?1.3:1)*(offroad&&boost<=0?.62*cfg.grip:1)*(stun>0?.43:1)*(shrunk>0?.68:1);
 if(offroad&&r.speed>22){shake=Math.max(shake,.06);offroadClock+=dt;if(offroadClock>.07){offroadClock=0;smoke(r,pick({mesa:0xd7a277,night:0x7c86b4,forge:0x6b4038},0xdacfa4),1,2.1)}}else offroadClock=0;
 if(air<1.5&&Math.abs(r.lane)<=SHOULDER_EDGE&&stun<=0)rescueD=r.d;
 if(gas&&!brake&&r.speed<max)r.speed=Math.min(max,r.speed+dt*(boost>0?88:cfg.accel));else if(!gas||brake)r.speed=Math.max(0,r.speed-dt*(brake?96:17));if(r.speed>max)r.speed=Math.max(max,r.speed-dt*75);
 if(shift&&!drifting&&Math.abs(input)>.4&&r.speed>38&&air<.1&&stun<=0){drifting=true;driftDirection=Math.sign(input);drift=0;driftStage=0;hopV=3.5;hop=.01}
 if(drifting){if(shift&&r.speed>32&&stun<=0&&air<.1){drift=Math.min(3.5,drift+dt*cfg.charge);const stage=drift>2.5?3:drift>1.3?2:drift>.65?1:0;if(stage>driftStage){driftStage=stage;sfx('drift',stage)}if(Math.random()<dt*38)spark(r,stage===3?0xcba2ff:stage===2?0xffb568:0x7eeaff,2);if(Math.random()<dt*26)smoke(r,stage===3?0xc8a6ff:stage===2?0xffc98c:0xcfe4ee,1,1.9);skidClock+=dt;if(skidClock>.06){skidClock=0;leaveSkid(r)}}else{if(drift>.65&&stun<=0){const duration=drift>2.5?2.6:drift>1.3?1.6:.8;activateBoost(duration,drift>2.5?'ウルトラ・ドリフト！':drift>1.3?'スーパー・ドリフト！':'ミニターボ！');driftCount++;addCombo()}drifting=false;drift=0;driftDirection=0;}}
 const f0=sample(r.d),f1=sample(r.d+10),angle=Math.atan2(Math.sin(f1.yaw-f0.yaw),Math.cos(f1.yaw-f0.yaw));
 const lateralTarget=(steer*cfg.handling*(drifting?.5:1)*(gliding?1.8:1)+(drifting?driftDirection*2.5:0))*Math.min(1,r.speed/28)-angle*r.speed*.47;
 lateralSpeed=lerp(lateralSpeed,lateralTarget,1-Math.exp(-dt*(drifting?3.5:8)));r.lane+=lateralSpeed*dt;
 if(bullet>0){
  r.lane=lerp(r.lane,racingLine(r.d+r.speed*.12,1),1-Math.exp(-dt*3.2));lateralSpeed=0;drifting=false;drift=0;
  r.speed=lerp(r.speed,cfg.speed+64,1-Math.exp(-dt*2.6));if(Math.random()<dt*34)spark(r,0xcfd8e0,2);
 }
 const exposed=openAt(r.d),edge=exposed?FALL_EDGE:SHOULDER_EDGE;
 if(Math.abs(r.lane)>edge){
  if(exposed)beginRescue();
  else{r.lane=clamp(r.lane,-edge,edge);lateralSpeed*=-.35;if(wallCooldown<=0&&r.speed>20){r.speed*=.82;wallCooldown=.7;shake=.18;sfx('wall');spark(r,0xffdf8a,5)}}
 }
 r.d+=r.speed*dt;const wasAir=air;airV-=dt*(gliding?7.6:29);air=Math.max(0,air+airV*dt);hopV-=dt*35;hop=Math.max(0,hop+hopV*dt);if(hop===0)hopV=0;
 if(air>0){if(pressed('KeyE')&&!trickPressed)doTrick();trickPressed=pressed('KeyE');if(trickDone)trickSpin=Math.min(TAU,trickSpin+dt*TAU*1.6);}if(air===0){airV=0;if(wasAir>0){shake=Math.max(shake,gliding?.12:.2+Math.min(.3,wasAir*.04));landDust=gliding?.1:.25;sfx('bump');smoke(r,0xe6ecef,5,2.4);
  if(gliding){gliding=false;activateBoost(.9,'グライダー着地！');addCombo()}spark(r,0xdfe6ea,Math.min(14,4+wasAir*2|0));if(trickDone){activateBoost(1.8,'トリック・ブースト！');addCombo();spark(r,0xffd27d,16)}trickDone=false;trickSpin=0}}
 if(racers.length>1&&r.speed>55&&boost<=0&&draftCooldown<=0){const following=racers.slice(1).some(a=>a.d-r.d>7&&a.d-r.d<32&&Math.abs(a.lane-r.lane)<2.3);draftCharge=clamp(draftCharge+dt*(following?1:-1.4),0,1.6);if(draftCharge>=1.6){activateBoost(1.7,'スリップストリーム！');draftCharge=0;draftCooldown=4;addCombo()}}else draftCharge=Math.max(0,draftCharge-dt);
 aiStep(dt,true);
 for(const b of boxes){b.cool=Math.max(0,b.cool-dt);b.mesh.visible=b.cool<=0&&gameMode!=='trial';b.mesh.rotation.x=time*.6;b.mesh.rotation.y=time*1.6;b.mesh.position.y=b.base+Math.sin(time*3+b.d)*.35;if(gameMode!=='trial'&&b.cool<=0&&nearDistance(r.d,b.d)<4&&Math.abs(r.lane-b.lane)<3&&!heldItem&&roulette<=0){b.cool=5;gainItem()}}
 const reach=magnet>0?15:3,spread=magnet>0?11:2.4;
 for(const c of coins){c.cool=Math.max(0,c.cool-dt);c.mesh.visible=c.cool<=0;c.mesh.rotation.y=time*3;
  const gap=nearDistance(r.d,c.d),pulled=magnet>0&&c.cool<=0&&gap<reach&&Math.abs(r.lane-c.lane)<spread;
  if(pulled)c.mesh.position.lerp(r.model.position,1-Math.exp(-dt*6));else{c.mesh.position.copy(c.home);c.mesh.position.y=c.base+Math.sin(time*3+c.d)*.2}
  if(c.cool<=0&&(pulled?c.mesh.position.distanceTo(r.model.position)<4.5:gap<3&&Math.abs(r.lane-c.lane)<2.4&&air<3)){c.cool=15;r.coins=Math.min(10,r.coins+1);coinTotal++;sfx('coin',r.coins);spark(r,0xffe274,3);if(magnet>0)addCombo()}}
 for(const p of pads){p.cool=Math.max(0,p.cool-dt);if(p.cool===0&&nearDistance(r.d,p.d)<5&&Math.abs(r.lane-p.lane)<3.6&&air<1){p.cool=2;activateBoost(1.35,'ダッシュプレート！');addCombo()}}
 for(const p of ramps){p.cool=Math.max(0,p.cool-dt);
  if(p.cool===0&&nearDistance(r.d,p.d)<(p.big?6:4)&&Math.abs(r.lane-p.lane)<(p.big?7.5:4)&&r.speed>40&&air===0){
   p.cool=2;trickDone=false;trickPressed=false;
   if(p.big){airV=17.5;air=.4;gliding=true;activateBoost(.6);toast('グライダー展開！ リングをくぐれ');sfx('star')}
   else{airV=15.5;air=.3;activateBoost(.7);toast(touch?'TRICKで空中トリック！':'Eで空中トリック！');sfx('trick')}}}
 for(const u of updrafts){u.mesh.rotation.z=time*.7;u.mesh.material.opacity=.55+Math.sin(time*3+u.d)*.25;u.cool=Math.max(0,u.cool-dt);
  if(gliding&&u.cool<=0&&nearDistance(r.d,u.d)<7&&Math.abs(r.lane-u.lane)<5.5){u.cool=3;airV=Math.max(airV,5.2);glideBoost=.8;spark(r,0x9bf0ff,8);sfx('coin',6);addCombo()}}
 for(let i=hazards.length-1;i>=0;i--){let h=hazards[i];h.life-=dt;for(let j=0;j<racers.length;j++){let a=racers[j];if((j!==h.owner||h.life<27)&&nearDistance(a.d,h.d)<3&&Math.abs(a.lane-h.lane)<2.5&&(j!==0||air<2)){hit(a);h.life=0;break}}if(h.life<=0){scene.remove(h.mesh);hazards.splice(i,1)}}
 shellStep(dt);sendNetState(dt,r);
 if(itemHeld>0&&heldItem){itemHeld+=dt;if(itemHeld>.16&&!dragItem)startDrag()}
 if(dragMesh){const f=sample(r.d-5.4,r.lane);dragMesh.position.copy(f.p);dragMesh.position.y+=1.15+hop*.5;dragMesh.rotation.y=f.yaw+time*(dragItem==='banana'?.6:5)}
 if(roulette>0){roulette-=dt;const k=Object.keys(itemData),pick=itemData[k[Math.floor(time*18)%k.length]];$('itemIcon').textContent=pick[0];$('itemIcon').style.color=pick[2];$('itemName').textContent='SELECTING';if(roulette<=0){heldItem=rollItem();if(heldItem==='triple')tripleCharges=3;updateItem();sfx('itemReady')}}
 const lap=Math.max(1,Math.floor(r.d/length)+1);if(lap>lastLap&&lap<=totalLaps){const split=elapsed-lapStart;lapTimes.push(split);lapStart=elapsed;lastLap=lap;const record=lastBestLap!==null&&split<lastBestLap;if(record||lastBestLap===null)lastBestLap=Math.min(lastBestLap??split,split);banner(lap===totalLaps?'FINAL LAP':`LAP ${lap} / ${totalLaps}`,formatTime(split)+(record?'  ★ BEST LAP':''));sfx('lap')}
 if(star>0&&Math.random()<dt*34)spark(r,[0xffe066,0x8ef5ff,0xff9ad5,0xb4ff8a][Math.floor(Math.random()*4)],2);
 if(blueWarn>0){blueSiren-=dt;if(blueSiren<=0){blueSiren=.55;sfx('blue')}}else blueSiren=0;
 quizStep(dt);
 if(quizBoost>0&&Math.random()<dt*30)spark(r,0xb6ff7e,2);
 topSpeed=Math.max(topSpeed,r.speed);if(boost>0&&Math.random()<dt*25)spark(r,0x99f3ff,2);placeKart(r,dt);updateGhost(dt);if(r.d>=length*totalLaps)finishRace();
}
function nearDistance(a,b){return Math.abs(mod(a-b+length/2,length)-length/2)}
function bendAt(d,span){const a=sample(d),b=sample(d+span);return Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw))}
// Positive lane is to the right of travel, and yaw grows through a right-hand bend, so
// leaning into the bend ahead while staying wide on approach traces a real racing line.
function racingLine(d,craft){
 const near=bendAt(d,26),far=bendAt(d+30,52);
 const apex=Math.tanh(near*2.6)*9.6,entry=Math.tanh(far*2.6)*6.8;
 return clamp((apex-entry)*craft,-10.4,10.4);
}
function aiStep(dt,interactions){
 const r=racers[0];
 for(let i=1;i<racers.length;i++){
  const a=racers[i];
  if(a.remote){netStep(a,dt);placeKart(a,dt);continue}
  a.stun=Math.max(0,a.stun-dt);a.boost=Math.max(0,a.boost-dt);a.itemCooldown-=dt;a.mistake=Math.max(0,a.mistake-dt);a.driftGlow=Math.max(0,a.driftGlow-dt);
  const bend=Math.abs(bendAt(a.d,16)),rubber=clamp((r.d-a.d)*.017,-6,8)*(gameMode==='grandprix'?1.1:1);
  // Braking for a corner is a personality trait: nerve decides how late they lift.
  const cornerHold=clamp(1-bend*(.3/Math.max(.6,a.nerve)),.74,1);
  const max=(a.base*aiDifficulty*a.pace+rubber+(a.boost>0?27:0))*cornerHold*(a.stun>0?.4:1)*(a.mistake>0?.68:1);
  a.speed=lerp(a.speed,max,1-Math.exp(-dt*(a.speed<max?.78:1.5)));a.d+=a.speed*dt;
  // A tidy racing line, personal drift, then reactions layered on top.
  a.lineClock-=dt;
  if(a.lineClock<=0){a.lineClock=.08;a.targetLane=racingLine(a.d+a.speed*.08,a.craft)+Math.sin(a.d*.008+i*2.2)*(1.4+a.wobble*2.6)}
  let targetLane=a.targetLane;
  if(a.mistake>0)targetLane+=Math.sin(time*7+i)*7;
  for(const h of hazards)if(mod(h.d-a.d,length)<30&&Math.abs(h.lane-targetLane)<3.4)targetLane=h.lane>0?targetLane-7:targetLane+7;
  for(const p of pads)if(nearDistance(p.d,a.d+18)<16&&Math.abs(p.lane-targetLane)<9)targetLane=lerp(targetLane,p.lane,.55*a.craft);
  if(!a.item&&gameMode!=='trial'){const next=boxes.filter(b=>b.cool<=0&&mod(b.d-a.d,length)<40).sort((b,c)=>mod(b.d-a.d,length)-mod(c.d-a.d,length))[0];if(next)targetLane=lerp(targetLane,next.lane,.7)}
  for(let j=1;j<racers.length;j++){if(j===i)continue;const o=racers[j];const gap=o.d-a.d;if(gap>1&&gap<11&&Math.abs(o.lane-targetLane)<3.1)targetLane+=(a.lane>=o.lane?1:-1)*4.2}
  a.lane=lerp(a.lane,clamp(targetLane,-11.4,11.4),1-Math.exp(-dt*(1.7+a.craft*1.1)));
  // Exiting a bend cleanly rewards them, exactly as a drift boost rewards the player.
  if(bend>.05&&a.speed>60&&a.driftGlow<=0&&Math.random()<dt*1.6*a.craft){a.boost=Math.max(a.boost,.9);a.driftGlow=1.1;spark(a,0x7eeaff,3)}
  if(interactions&&Math.random()<dt*.035*a.wobble*(2-aiDifficulty)&&a.mistake<=0&&elapsed>4){a.mistake=1.1;spark(a,0xffd08a,6)}
  if(interactions&&gameMode!=='trial'){
   if(!a.item&&a.itemCooldown<0){const ahead=racers.filter(o=>o!==a&&o.d>a.d).length;
    const pool=ahead===0?['banana','banana','star','boost','green']:ahead>=5?['red','boost','boost','green','thunder','blooper','star','blue']:['boost','red','green','banana','blooper'];
    a.item=pool[Math.floor(Math.random()*pool.length)];a.itemCooldown=3+Math.random()*4}
   else if(a.item&&a.itemCooldown<0){
       const ahead=racers.filter(o=>o!==a&&!o.finish&&o.d>a.d&&o.d-a.d<62).sort((x,y)=>x.d-y.d)[0];
    if(a.item==='red'&&ahead&&!projectiles.some(p=>p.target===ahead)&&Math.random()<a.aggression*.9){spawnShell(a,i,'red',ahead,false);a.item=null}
    else if(a.item==='green'&&Math.random()<a.aggression*.7){spawnShell(a,i,'green',null,!ahead);a.item=null}
    else if(a.item==='blue'){const leader=[...racers].filter(o=>!o.finish).sort((x,y)=>y.d-x.d)[0];if(leader&&leader!==a){spawnShell(a,i,'blue',leader,false);sfx('blue')}a.item=null}
    else if(a.item==='thunder'&&Math.random()<a.aggression*.5){useThunder(i);a.item=null}
    else if(a.item==='blooper'&&Math.random()<a.aggression*.6){useBlooper(a);a.item=null}
    else if(a.item==='banana'&&(!ahead||Math.random()<.3)){dropTrap(a,i);a.item=null}
    else if(a.item==='star'){a.star=7;a.item=null}
    else if(a.item==='boost'&&(bend<.04||a.nerve>1.05)){a.boost=Math.max(a.boost,1.9);a.item=null}
    a.itemCooldown=a.item?1.5:7+Math.random()*7/Math.max(.5,a.aggression);
   }
  }
  a.star=Math.max(0,(a.star||0)-dt);a.shrunk=Math.max(0,(a.shrunk||0)-dt);a.inked=Math.max(0,(a.inked||0)-dt);
  if(interactions&&Math.abs(a.d-r.d)<4.2&&Math.abs(a.lane-r.lane)<2.9&&air<2&&stun<=0){
   if(star>0||bullet>0){if(a.stun<=.3){hit(a);spark(a,0xffe066,16);sfx('bump');addCombo()}}
   else if(gravAt(r.d)&&bumpCooldown<=0){bumpCooldown=.5;activateBoost(.85,'スピンブースト！');a.boost=Math.max(a.boost,.8);spark(r,0x8fd8ff,14);spark(a,0x8fd8ff,10);addCombo()}
   else{
    const mine=kartTypes[selectedKart].mass*(shrunk>0?.45:1),sign=r.lane>a.lane?1:-1,push=clamp(1.25/mine,.5,2.2);
    lateralSpeed+=sign*dt*20*push;r.speed=Math.max(0,r.speed-dt*15*push);a.speed=Math.max(0,a.speed-dt*15/push);
    if(shrunk>0&&a.stun<=0&&bumpCooldown<=0)hit(r);
    if(bumpCooldown<=0){bumpCooldown=.45;shake=Math.max(shake,.12);sfx('bump')}
   }
  }
  a.airV=(a.airV||0)-dt*(a.gliding?7.6:29);a.air=Math.max(0,(a.air||0)+a.airV*dt);
  if(a.air===0){a.airV=0;if(a.gliding){a.gliding=false;a.boost=Math.max(a.boost,.8)}}
  for(const p of ramps)if(a.air<=0&&nearDistance(a.d,p.d)<(p.big?6:4)&&Math.abs(a.lane-p.lane)<(p.big?7.5:4.6)&&a.speed>42){
   if(p.big){a.airV=17.5;a.air=.4;a.gliding=true}else{a.airV=15.5;a.air=.3}a.boost=Math.max(a.boost,.7)}
  for(const p of pads)if(a.air<=0&&nearDistance(a.d,p.d)<5&&Math.abs(a.lane-p.lane)<3.6)a.boost=Math.max(a.boost,1.2);
  const lap=Math.floor(a.d/length);if(lap>a.lapsDone){a.lapsDone=lap;a.best=a.best===null?elapsed-a.lastLapAt:Math.min(a.best,elapsed-a.lastLapAt);a.lastLapAt=elapsed}
  if(a.d>=length*totalLaps&&a.finish===null){a.finish=elapsed;finishOrder.push(a)}
  placeKart(a,dt);
 }
}
function dropTrapAt(d,lane,index){const f=sample(d,lane),m=mesh(cone,0xffc55e,scene,f.p.x,f.p.y+1,f.p.z,1.35,2,1.35);hazards.push({d:mod(d,length),lane,mesh:m,life:30,owner:index})}
function dropTrap(owner,index){dropTrapAt(owner.d-7,owner.lane,index);if(index===0)netEvent({k:'trap',d:owner.d-7,lane:owner.lane})}
function getRank(){const r=racers[0];return r.finish!==null?finishOrder.indexOf(r)+1:1+racers.filter(a=>a!==r&&(a.finish!==null||a.d>r.d)).length}
function updateHUD(){
 const r=racers[0],rank=getRank();$('rank').textContent=gameMode==='trial'?'TT':rank;$('rankSuffix').innerHTML=gameMode==='trial'?'':'位 <small>/ 8</small>';$('cupStatus').textContent=gameMode==='grandprix'?`AURORA CUP / ${gpRound+1} OF ${gpRaces}`:gameMode==='trial'?'TIME ATTACK':'';
 $('lap').innerHTML=Math.min(totalLaps,Math.max(1,Math.floor(r.d/length)+1))+` <i>/ ${totalLaps}</i>`;$('timer').textContent=formatTime(elapsed);$('coin').textContent=String(r.coins).padStart(2,'0');$('speed').textContent=Math.round(r.speed*1.45);
 $('boostBar').style.width=boost>0?'100%':drift/3.5*100+'%';$('boostBar').style.background=boost>0?'#dcff7e':drift>2.5?'#c295ff':drift>1.3?'#ffb45f':'#6ce7ff';$('driftLabel').textContent=bullet>0?'BULLET BILL':star>0?'STAR '+star.toFixed(1)+'s':boost>0?'TURBO BOOST':gravAt(r.d)?'ANTI-GRAVITY':drifting?['DRIFT CHARGING','MINI TURBO','SUPER TURBO','ULTRA TURBO'][driftStage]:draftCharge>.2?'SLIPSTREAM':autoGas?'AUTO ACCELERATE':'SHIFT + ← → DRIFT';
 $('draftMeter').querySelector('span').style.width=draftCharge/1.6*100+'%';$('combo').innerHTML=comboTimer>0&&comboCount>1?`${comboCount}×<small>BOOST CHAIN</small>`:'';
 const incoming=projectiles.find(p=>p.target===r),chaser=racers.slice(1).find(a=>r.d-a.d>0&&r.d-a.d<7&&Math.abs(a.lane-r.lane)<3.5);
 $('alert').textContent=blueWarn>0?'⚠ トゲゾーこうら接近':incoming?'⚠ こうら接近':star>0?'✦ スター無敵':bullet>0?'➤ キラー走行中':shrunk>0?'ϟ サンダーで縮小中':ink>0?'✱ スミまみれ':magnet>0?'❍ マグネット作動中':chaser?'▲ 後方に '+chaser.name:'';
 $('alert').className='alert'+(blueWarn>0||incoming||shrunk>0||ink>0?' danger':star>0||bullet>0||magnet>0?' good':'');
 if(lastBestLap!==null&&lapTimes.length){const delta=(elapsed-lapStart)-lastBestLap;$('lapDelta').textContent=(delta>=0?'+':'−')+Math.abs(delta).toFixed(2)+'  LAP';$('lapDelta').style.color=delta<0?'#b4fcda':'#ffc6ae'}else $('lapDelta').textContent='';
 $('lapSplits').innerHTML=lapTimes.map((t,i)=>`<div><span>LAP ${i+1}</span><b>${formatTime(t)}</b></div>`).join('');
 if(gameMode!=='trial'){let order=[...racers].sort((a,b)=>b.d-a.d),shown=order.slice(0,3);if(!shown.includes(r))shown.push(r);$('leaderboard').innerHTML=shown.map(a=>`<div class="live-row ${a===r?'you':''}"><b>${order.indexOf(a)+1}</b><i style="--rc:#${palette[a.colorIndex??0].toString(16).padStart(6,'0')}"></i><span>${a.name}</span><small>${quizEnabled()?(a===r?quizCorrect:(a.quizScore||0))+' 語':a===r?'YOU':(a.d>r.d?'+':'−')+(Math.abs(a.d-r.d)/Math.max(50,r.speed)).toFixed(1)+'s'}</small></div>`).join('')}else $('leaderboard').innerHTML='';
 $('netBadge').innerHTML=gameMode==='online'&&net?`ROOM ${net.code} · <b>${net.latency}ms</b>`:'';
 document.body.classList.toggle('airborne',air>1);if(rank<rankPrevious&&elapsed>4){rankFlash=.35;sfx('overtake')}rankPrevious=rank;drawMap();
}
function drawMap(){const ctx=mapCtx,w=220,h=180;ctx.clearRect(0,0,w,h);const b=mapBounds,s=Math.min((w-30)/(b.maxX-b.minX),(h-25)/(b.maxZ-b.minZ)),map=p=>({x:(p.x-(b.maxX+b.minX)/2)*s+w/2,y:(p.z-(b.maxZ+b.minZ)/2)*s+h/2});ctx.lineWidth=9;ctx.strokeStyle='#0c253c9c';ctx.lineJoin='round';ctx.beginPath();frames.forEach((f,i)=>{const p=map(f.p);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.closePath();ctx.stroke();ctx.lineWidth=3;ctx.strokeStyle='#dcecf2b0';ctx.stroke();const start=map(frames[0].p);ctx.fillStyle='#dcff7e';ctx.fillRect(start.x-3,start.y-3,6,6);
 if(mode!=='menu'){ctx.fillStyle='#9ce8ff88';for(const b of boxes)if(b.mesh.visible){const p=map(sample(b.d,b.lane).p);ctx.fillRect(p.x-1.5,p.y-1.5,3,3)}
  ctx.fillStyle='#dfff8399';for(const pad of pads){const p=map(sample(pad.d,pad.lane).p);ctx.fillRect(p.x-1.5,p.y-1.5,3,3)}
  ctx.fillStyle='#ffb05e';for(const h of hazards){const p=map(sample(h.d,h.lane).p);ctx.beginPath();ctx.arc(p.x,p.y,2,0,TAU);ctx.fill()}}
 for(const r of[...racers.slice(1),racers[0]]){const p=map(sample(r.d,r.lane).p),you=r===racers[0];ctx.beginPath();ctx.arc(p.x,p.y,you?5:3.2,0,TAU);
  ctx.fillStyle=you?'#dcff7e':'#'+palette[r.colorIndex??0].toString(16).padStart(6,'0');ctx.fill();
  if(you){ctx.strokeStyle='#172739';ctx.lineWidth=2;ctx.stroke()}}if(ghostModel?.visible){const p=map(ghostModel.position);ctx.beginPath();ctx.arc(p.x,p.y,3,0,TAU);ctx.fillStyle='#8fdfff';ctx.fill()}}
function updateCamera(dt){
  const r=racers[0];
 if(mode==='intro'&&r){
  const t=clamp(1-introTime/introLength,0,1),ease=t*t*(3-2*t);
  const from=sample(r.d+330,-6).p.clone();from.y+=78;
  const to=sample(r.d-22,r.lane*.6).p.clone();to.y+=10;
  camera.position.lerpVectors(from,to,ease);camPos.copy(camera.position);
  const look=sample(r.d+lerp(150,10,ease),0).p.clone();look.y+=3;camLook.copy(look);camera.lookAt(look);
  camera.fov=lerp(74,64,ease);camera.updateProjectionMatrix();return;
 }
 if(mode==='menu'){menuAngle+=dt*.018;const focus=sample(length*.035).p;camera.position.set(focus.x+Math.sin(.3+menuAngle)*105,focus.y+68,focus.z+Math.cos(.3+menuAngle)*105);camera.lookAt(focus.x-20,focus.y+2,focus.z-25);camera.fov=60;camera.updateProjectionMatrix();return}
 if(photoMode){const p=r.model.position,radius=12+photoHeight*5;camera.position.set(p.x+Math.sin(photoAngle)*radius,p.y+2.4+photoHeight*6,p.z+Math.cos(photoAngle)*radius);camPos.copy(camera.position);camLook.set(p.x,p.y+1.7,p.z);camera.lookAt(camLook);camera.fov=lerp(camera.fov,46,Math.min(1,dt*4));camera.updateProjectionMatrix();return}
 const lookBack=pressed('KeyR'),cockpit=viewMode===3&&!lookBack,dist=[15.5,23,10.5,-1.1][viewMode],height=[6.8,10.5,4.7,2.55][viewMode];
 let behind=sample(r.d+(lookBack?10:-dist),r.lane*(cockpit?1:.9)).p;behind.y+=height+air*(cockpit?1:.55);
 let ahead=sample(r.d+(lookBack?-25:cockpit?34:22),r.lane*(cockpit?.9:.65)).p;ahead.y+=(cockpit?3.4:2.4)+air*.3;
 if(mode==='finished'&&resultDelay>0){const f=sample(r.d),orbit=time*.85;behind=r.model.position.clone().addScaledVector(f.n,Math.cos(orbit)*11.5).addScaledVector(f.t,Math.sin(orbit)*11.5);behind.y+=4.6;ahead=r.model.position.clone();ahead.y+=1.8;}
 behind.y-=landDust*3.2-dropY*.55;camPos.lerp(behind,1-Math.exp(-dt*(lookBack?12:cockpit?18:6.5)));ahead.y+=dropY*.85;camLook.lerp(ahead,1-Math.exp(-dt*(cockpit?11:8)));camera.position.copy(camPos);if(!reducedMotion&&shake>0){camera.position.x+=Math.sin(time*77)*shake*.17;camera.position.y+=Math.sin(time*91)*shake*.13}camera.lookAt(camLook);if(!reducedMotion)camera.rotateZ(-steer*(drifting?.012:.004));const target=boost>0&&!reducedMotion?76:viewMode===2?68:viewMode===3?72:64;camera.fov=lerp(camera.fov,target,Math.min(1,dt*5));camera.updateProjectionMatrix();
}
function drawEffects(dt){
 const ctx=fxContext,w=fxWidth,h=fxHeight;ctx.clearRect(0,0,w,h);if(mode==='menu'||mode==='paused')return;
 if(!reducedMotion&&boost>0&&!postEnabled){const cx=w*.5,cy=h*.45;ctx.lineWidth=1.5;for(let i=0;i<32;i++){const angle=i*2.39996,phase=mod(time*(.8+i%3*.12)+i*.137,1),start=.3+phase*.6,end=start+.035+phase*.045,dx=Math.cos(angle)*w*.68,dy=Math.sin(angle)*h*.85;ctx.strokeStyle=`rgba(204,244,255,${.08+phase*.22})`;ctx.beginPath();ctx.moveTo(cx+dx*start,cy+dy*start);ctx.lineTo(cx+dx*end,cy+dy*end);ctx.stroke()}}
 if(ink>0){
  const alpha=Math.min(.92,ink*.55);ctx.fillStyle=`rgba(14,20,38,${alpha})`;
  for(let i=0;i<9;i++){const hx=Math.sin(i*91.7+inkSeed)*.5+.5,hy=Math.cos(i*57.3+inkSeed*1.7)*.5+.5,rad=(.08+mod(Math.sin(i*23.1+inkSeed)*43.7,1)*.1)*Math.min(w,h);
   const x=hx*w,y=hy*h*.9;ctx.beginPath();ctx.arc(x,y,rad,0,TAU);ctx.fill();
   for(let j=0;j<3;j++){const a=(i*2.4+j*2.1),rr=rad*(.32+j*.12);ctx.beginPath();ctx.arc(x+Math.cos(a)*rad*1.15,y+Math.sin(a)*rad*1.1,rr,0,TAU);ctx.fill()}}
 }
 if(hitFlash>0&&!postEnabled){ctx.fillStyle=`rgba(223,228,255,${Math.min(.13,hitFlash*.15)})`;ctx.fillRect(0,0,w,h)}
 if(mode==='finished'&&(!reducedMotion)){for(let i=0;i<64;i++){const x=mod(i*139.3+Math.sin(time+i)*40,w),y=mod(time*75+i*31,h);ctx.save();ctx.translate(x,y);ctx.rotate(time+i);ctx.fillStyle=['#dcff7e','#ffaf77','#9ce8ee','#d2aeff'][i%4];ctx.fillRect(-2,-4,4,8);ctx.restore()}}
}
function pollGamepad(){padKeys={};const pad=navigator.getGamepads?.()[0];if(!pad||pad.mapping!=='standard')return;const value=pad.axes[0]||0;padKeys.ArrowLeft=value<-.2||pad.buttons[14]?.pressed;padKeys.ArrowRight=value>.2||pad.buttons[15]?.pressed;padKeys.ArrowUp=pad.buttons[7]?.pressed||pad.buttons[0]?.pressed;padKeys.ArrowDown=pad.buttons[6]?.pressed||pad.buttons[1]?.pressed;padKeys.ShiftLeft=pad.buttons[5]?.pressed;padKeys.KeyR=pad.buttons[3]?.pressed;padKeys.KeyE=pad.buttons[4]?.pressed;const itemButton=pad.buttons[2]?.pressed;if(itemButton&&!gamepadPrevious.item)pressItem();if(!itemButton&&gamepadPrevious.item)releaseItemKey();if(pad.buttons[9]?.pressed&&!gamepadPrevious.pause)pauseGame();gamepadPrevious={item:pad.buttons[2]?.pressed,pause:pad.buttons[9]?.pressed}}
function frame(){
 requestAnimationFrame(frame);const raw=clock.getDelta(),dt=Math.min(raw,.1);pollGamepad();frameAverage=lerp(frameAverage,Math.min(raw,.1),.015);if(quality==='auto'&&!autoLow&&time>12&&frameAverage>.035){autoLow=true;applyQuality()}
 if(photoMode){time+=dt*.35;updatePhoto(dt);updateCamera(dt);animateEnvironment(dt*.25);drawEffects(dt);updateEngineAudio(dt);musicTick();postTime+=dt;present();return}
 if(mode==='paused'){if(engineNodes)engineNodes.gain.gain.setTargetAtTime(0,audioContext.currentTime,.05);present();return}time+=dt;
  if(mode==='intro'){introTime-=dt;if(introTime<=0||pressed('Space')||pressed('ArrowUp')||pressed('KeyW')||pressed('Enter'))endIntro();}
 else if(mode==='countdown'){count-=dt;
  const lights=$('startLights'),lit=count>2.5?1:count>1.5?2:count>.5?3:4;
  lights.hidden=false;lights.classList.toggle('go',lit===4);
  [...lights.children].forEach((dot,i)=>dot.classList.toggle('on',lit===4||i<lit));const txt=count>.5?String(Math.ceil(count-.5)):'GO!';if(txt!==lastCount){$('countdown').textContent=txt;$('countdown').classList.remove('pop');void $('countdown').offsetWidth;$('countdown').classList.add('pop');lastCount=txt;sfx(txt==='GO!'?'go':'count')}const gas=pressed('ArrowUp')||pressed('KeyW');if(gas&&startPress===null)startPress=count;
  if(count<=0){mode='race';$('countdown').textContent='';$('startLights').hidden=true;const timing=autoGas?.4:startPress;
   if(timing===null)toast(touch?'GOを押して加速！':'↑ または W を押して加速！');
   else if(timing<=.42){activateBoost(2.5);perfectStart=1;banner('PERFECT START','ロケットスタート成功！');sfx('perfect')}
   else if(timing<=1.6)activateBoost(1.05,'スタートダッシュ！');
   else toast('「GO!」の瞬間に加速でロケットスタート');}}
 else if(mode==='race'){accumulator+=Math.min(raw,.15);let loops=0;while(accumulator>=1/60&&mode==='race'&&loops<9){raceStep(1/60);accumulator-=1/60;loops++}hudClock+=dt;if(hudClock>.05){updateHUD();hudClock=0}}
 else if(mode==='finished'){slowMotion=Math.min(1,slowMotion+dt*.45);const fdt=dt*slowMotion;if(resultDelay>0){resultDelay-=dt;if(resultDelay<=0)showResults()}for(const r of racers){r.speed=Math.max(0,r.speed-fdt*24);r.d+=r.speed*fdt;placeKart(r,fdt)}}
 else if(mode==='menu'){for(const b of boxes){b.mesh.rotation.x=time*.4;b.mesh.rotation.y=time;b.mesh.position.y=b.base+Math.sin(time*2)*.4}for(const c of coins)c.mesh.rotation.y=time*2}
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.mesh.position.addScaledVector(p.v,dt);
  if(p.fade){p.mesh.scale.multiplyScalar(1+dt*1.9);p.mesh.material.opacity=Math.max(0,p.life*.85);p.v.multiplyScalar(1-dt*1.6)}else p.mesh.scale.multiplyScalar(Math.max(0,1-dt*2));
  if(p.life<=0){scene.remove(p.mesh);if(p.fade)p.mesh.material.dispose();particles.splice(i,1)}}
 if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('toast').style.opacity=0}if(bannerTime>0){bannerTime-=dt;if(bannerTime<=0)$('raceBanner').classList.remove('show')}shake=Math.max(0,shake-dt);hitFlash=Math.max(0,hitFlash-dt);rankFlash=Math.max(0,rankFlash-dt);landDust=Math.max(0,landDust-dt*1.6);
 updateCamera(dt);animateEnvironment(dt);drawEffects(dt);updateEngineAudio(dt);musicTick();
 postTime+=dt;present();
}
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();fxWidth=$('fx').width=innerWidth;fxHeight=$('fx').height=innerHeight;applyQuality();if(postReady)resizePost()}
function savePreferences(){try{localStorage.setItem('aurora-preferences',JSON.stringify({autoGas,quality,selectedColor,selectedKart,viewMode,totalLaps,mirrorMode,postWanted,volume,soundOn,quizGrade}))}catch{}}
function loadPreferences(){try{const p=JSON.parse(localStorage.getItem('aurora-preferences')||'null');if(p){autoGas=!!p.autoGas;if(['auto','high','low'].includes(p.quality))quality=p.quality;if(Number.isInteger(p.selectedColor)&&p.selectedColor>=0&&p.selectedColor<colorNames.length)selectedColor=p.selectedColor;if(Number.isInteger(p.selectedKart)&&p.selectedKart>=0&&p.selectedKart<kartTypes.length)selectedKart=p.selectedKart;if([0,1,2,3].includes(p.viewMode))viewMode=p.viewMode;if([3,5,7].includes(p.totalLaps))totalLaps=p.totalLaps;mirrorMode=!!p.mirrorMode;postWanted=p.postWanted!==false;if(Number.isFinite(p.volume))volume=clamp(p.volume,0,1);pendingSound=!!p.soundOn;if([3,4,5].includes(p.quizGrade))quizGrade=p.quizGrade}}catch{}
 try{playerName=localStorage.getItem('aurora-name')||''}catch{}
 $('autoGas').setAttribute('aria-checked',String(autoGas));$('quality').value=quality;$('laps').value=String(totalLaps);
 $('mirror').setAttribute('aria-checked',String(mirrorMode));$('effects').setAttribute('aria-checked',String(postWanted));$('volume').value=String(Math.round(volume*100));loadProfile()}
const modeInfo={
 single:{meta:()=>`${totalLaps} LAPS · 8 RACERS`,text:()=>`8台で競う、${totalLaps}周の真剣勝負。`,start:'レースをはじめる'},
 grandprix:{meta:()=>`${gpRaces} RACES · AURORA CUP`,text:()=>`${gpRaces}コースの合計ポイントで、カップ王者を決める。`,start:'グランプリに挑む'},
 trial:{meta:()=>`${totalLaps} LAPS · GHOST`,text:()=>`ライバルは自己ベスト。ゴーストと最速の${totalLaps}周へ。`,start:'タイムアタック'},
 uspeak:{meta:()=>`${totalLaps} LAPS · ${gatesPerLap()*totalLaps} WORDS`,text:()=>`チェックポイントで英単語。正解でブースト、不正解でスピン。`,start:'U-SPEAK レース'},
 online:{meta:()=>'ROOM · 最大8人',text:()=>'合言葉でつないで、友だちと同時に走る。',start:'待機室をひらく'}
};
function refreshSelections(){
 for(const key of['track','color','kart','mode','grade'])document.querySelectorAll('[data-'+key+']').forEach(b=>{
  const value={track:selectedTrack,color:selectedColor,kart:selectedKart,mode:gameMode,grade:quizGrade}[key],active=String(value)===b.dataset[key];
  b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))});
 const info=modeInfo[gameMode]||modeInfo.single,quiz=gameMode==='uspeak'||gameMode==='online';
 $('colorName').textContent=colorNames[selectedColor];$('difficulty').disabled=gameMode==='trial';
 $('courseMeta').textContent=info.meta();$('modeDescription').textContent=info.text();
 $('start').innerHTML=`${info.start} <span>↗</span>`;
 $('gradeRow').hidden=!quiz;$('grades').hidden=!quiz;$('gradeHint').textContent=quiz?gradeHints[quizGrade]:'';
 readBest();renderRecords();
}
// Photo mode freezes the action and hands the camera over.
function togglePhoto(){if(mode==='menu'||!racers.length)return;photoMode=!photoMode;document.body.classList.toggle('photo-mode',photoMode);keys={};padKeys={};
 if(photoMode){photoAngle=.6;photoHeight=1;toast('フォトモード： ← → 回転　↑ ↓ 高さ　F で戻る')}else toast('レースに戻ります')}
function updatePhoto(dt){photoAngle+=((pressed('ArrowRight')||pressed('KeyD')?1:0)-(pressed('ArrowLeft')||pressed('KeyA')?1:0))*dt*1.3;
 photoHeight=clamp(photoHeight+((pressed('ArrowUp')||pressed('KeyW')?1:0)-(pressed('ArrowDown')||pressed('KeyS')?1:0))*dt*1.1,-.35,2.6)}
function openHelp(){helpPaused=false;if(mode==='race'||mode==='countdown'){pauseGame();helpPaused=true;$('pausePanel').hidden=true}$('helpPanel').hidden=false}
function closeHelp(){$('helpPanel').hidden=true;if(helpPaused&&mode==='paused')pauseGame();helpPaused=false}
function bind(){
 window.addEventListener('resize',resize);window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(e.code)&&mode!=='menu')e.preventDefault();if((e.code==='Escape'||e.code==='KeyP')&&!e.repeat){if(!$('helpPanel').hidden)closeHelp();else pauseGame()}if(e.code==='Space'&&!e.repeat)pressItem();if(e.code==='KeyE'&&!e.repeat)doTrick();if(e.code==='KeyC'&&!e.repeat){viewMode=(viewMode+1)%4;savePreferences();if(mode==='race')toast(['チェイスカメラ','ワイドカメラ','ローカメラ','コックピット'][viewMode])}if(e.code==='KeyF'&&!e.repeat)togglePhoto();if(!e.repeat&&/^Digit[123]$/.test(e.code))answerQuiz(Number(e.code.slice(5))-1);if(e.code==='Enter'&&mode==='menu'&&!['SELECT','BUTTON'].includes(document.activeElement.tagName)&&$('helpPanel').hidden)beginSession();keys[e.code]=true});window.addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='Space')releaseItemKey()});window.addEventListener('blur',()=>{keys={};padKeys={};if(mode==='race'||mode==='countdown')pauseGame()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&(mode==='race'||mode==='countdown'))pauseGame()});
 $('start').onclick=beginSession;$('again').onclick=()=>{if(gameMode==='online'){$('results').hidden=true;backMenu();openLobby();return}beginSession()};$('restart').onclick=startRace;$('nextRace').onclick=nextGrandPrix;$('back').onclick=backMenu;$('selectTrack').onclick=backMenu;$('pause').onclick=pauseGame;$('resume').onclick=pauseGame;$('sound').onclick=enableAudio;$('item').addEventListener('pointerdown',e=>{e.preventDefault();pressItem()});for(const ev of['pointerup','pointercancel','pointerleave'])$('item').addEventListener(ev,releaseItemKey);$('help').onclick=openHelp;$('closeHelp').onclick=closeHelp;$('difficulty').onchange=readBest;
 $('autoGas').onclick=()=>{autoGas=!autoGas;$('autoGas').setAttribute('aria-checked',String(autoGas));savePreferences()};$('quality').onchange=()=>{quality=$('quality').value;applyQuality()};
 $('createBtn').onclick=()=>{if(!net)return;net.connect().then(()=>net.join('',profilePayload())).catch(()=>lobbyStatus('サーバーに接続できません',true))};
 $('joinBtn').onclick=()=>{if(!net)return;const code=($('joinCode').value||'').trim().toUpperCase();if(!code){lobbyStatus('合言葉を入力してください',true);return}net.connect().then(()=>net.join(code,profilePayload())).catch(()=>lobbyStatus('サーバーに接続できません',true))};
 $('copyCode').onclick=()=>{navigator.clipboard?.writeText(net?.code||'').then(()=>lobbyStatus('合言葉をコピーしました'),()=>{})};
 $('lobbyStart').onclick=()=>net&&net.send({t:'start'});
 $('lobbyLeave').onclick=()=>{if(net&&net.id)net.leave();closeLobby();renderLobby()};
 $('playerName').onchange=()=>{const p=profilePayload();if(net&&net.id)net.send({t:'profile',...p})};
 $('joinCode').oninput=()=>{$('joinCode').value=$('joinCode').value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4)};
 $('quizChoices').addEventListener('click',e=>{const b=e.target.closest('[data-choice]');if(b)answerQuiz(Number(b.dataset.choice))});
 document.querySelectorAll('[data-grade]').forEach(b=>b.onclick=()=>{quizGrade=Number(b.dataset.grade);refreshSelections();savePreferences();if(net&&net.isHost)net.send({t:'settings',settings:{grade:quizGrade}})});
 $('mirror').onclick=()=>{mirrorMode=!mirrorMode;$('mirror').setAttribute('aria-checked',String(mirrorMode));savePreferences();refreshSelections();buildCourse();toast(mirrorMode?'ミラーモード：コースが左右反転します':'ミラーモード解除')};
 $('laps').onchange=()=>{totalLaps=Number($('laps').value)||3;savePreferences();refreshSelections()};
 $('effects').onclick=()=>{postWanted=!postWanted;$('effects').setAttribute('aria-checked',String(postWanted));applyQuality()};
 $('volume').oninput=()=>{volume=clamp(Number($('volume').value)/100,0,1);if(audioContext&&buses.master)buses.master.gain.setTargetAtTime(volume,audioContext.currentTime,.05);savePreferences()};
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{gameMode=b.dataset.mode;if(gameMode==='grandprix')selectedTrack=0;refreshSelections();buildCourse()});document.querySelectorAll('[data-track]').forEach(b=>b.onclick=()=>{if(gameMode==='grandprix'){selectedTrack=Number(b.dataset.track);toast('グランプリは01 → 04の順に走ります')}else selectedTrack=Number(b.dataset.track);menuAngle=0;refreshSelections();buildCourse()});
 document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{selectedColor=Number(b.dataset.color);refreshSelections();savePreferences();buildCourse()});document.querySelectorAll('[data-kart]').forEach(b=>b.onclick=()=>{selectedKart=Number(b.dataset.kart);refreshSelections();savePreferences();buildCourse()});
 document.querySelectorAll('[data-key]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys[b.dataset.key]=true;b.style.background='#dcff7e99';if(b.dataset.key==='KeyE')doTrick()});for(const ev of['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>{keys[b.dataset.key]=false;b.style.background=''})});refreshSelections();
 window.addEventListener('pointerdown',()=>{if(mode==='intro')endIntro()});
 const armSound=()=>{if(!pendingSound)return;pendingSound=false;if(!soundOn)enableAudio()};
 for(const ev of ['pointerdown','keydown'])window.addEventListener(ev,armSound,{once:true});
}

const sharedGeometries=new Set([unitBox,ball,cylinder,cone,tireGeometry,torusGeometry,roundedGeometry]);
function disposeUnique(root){root.traverse(o=>{if(o.geometry&&!o.isSprite&&!sharedGeometries.has(o.geometry))o.geometry.dispose();if(o.material&&!Array.from(materialCache.values()).includes(o.material)){if(o.material.map&&o.material.map!==glowTexture)o.material.map.dispose();o.material.dispose()}})}
function clearAtmosphere(){if(atmosphere){scene.remove(atmosphere);disposeUnique(atmosphere)}if(ghostModel){scene.remove(ghostModel);ghostModel.traverse(o=>{if(o.isMesh)o.material.dispose()});ghostModel=null}for(const s of shadowDiscs){scene.remove(s);s.material.dispose()}for(const s of skidSegments){scene.remove(s.mesh);s.mesh.material.dispose()}shadowDiscs=[];skidSegments=[];animatedObjects=[];skyMaterial=null;waterMaterial=null;auroraMaterial=null;atmosphere=null;}
function addGlow(parent,x,y,z,color,size){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color,transparent:true,opacity:.65,blending:THREE.AdditiveBlending,depthWrite:false}));sprite.position.set(x,y,z);sprite.scale.setScalar(size);parent.add(sprite);return sprite}
function radialTexture(){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.17,'rgba(255,255,255,.65)');g.addColorStop(.45,'rgba(255,255,255,.13)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)}
const glowTexture=radialTexture();
// Lightweight state probe, handy for debugging and automated smoke tests.
window.__aurora=()=>({mode,gameMode,track:selectedTrack,kart:selectedKart,elapsed:+elapsed.toFixed(2),lane:+(racers[0]?.lane??0).toFixed(2),speed:Math.round(racers[0]?.speed||0),d:Math.round(racers[0]?.d||0),rank:racers.length?getRank():0,boost:+boost.toFixed(2),drift:+drift.toFixed(2),item:heldItem,coins:racers[0]?.coins,fps:Math.round(1/Math.max(frameAverage,.001)),particles:particles.length,draws:renderer?.info.render.calls,tris:renderer?.info.render.triangles});

function terrainHeight(x,z){
 let nearest=Infinity,height=0;for(let i=0;i<frames.length;i+=5){const p=frames[i].p,d=(p.x-x)**2+(p.z-z)**2;if(d<nearest){nearest=d;height=p.y}}
 const dist=Math.sqrt(nearest),radius=Math.sqrt(x*x+((z+150)/1.07)**2),coast=clamp((radius-345)/75,0,1);
 const land=Math.max(-3.4,height-.55-Math.max(0,dist-15)*.42);
 return lerp(land,-12,coast*coast*(3-2*coast));
}
function createTerrain(){
 const rings=38,sides=104,pos=[0,terrainHeight(0,-150),-150],colors=[],index=[],cfg=courses[selectedTrack];
 const grass=new THREE.Color(cfg.ground),sand=new THREE.Color(pick({night:0x667fa8,forge:0x6d3528},cfg.edge));
 function colorAt(x,y,z){const c=grass.clone().lerp(sand,clamp((-y-1)/4,0,.85));c.multiplyScalar(.94+(Math.sin(x*.39+z*.73)*.5+.5)*.1);colors.push(c.r,c.g,c.b)}colorAt(0,pos[1],-150);
 for(let r=1;r<=rings;r++)for(let i=0;i<sides;i++){const angle=i/sides*TAU,rad=r/rings*425,x=Math.cos(angle)*rad,z=-150+Math.sin(angle)*rad*1.07,y=terrainHeight(x,z);pos.push(x,y,z);colorAt(x,y,z)}
 for(let i=0;i<sides;i++)index.push(0,1+(i+1)%sides,1+i);
 for(let r=1;r<rings;r++)for(let i=0;i<sides;i++){const a=1+(r-1)*sides+i,b=1+(r-1)*sides+(i+1)%sides,c=1+r*sides+i,d=1+r*sides+(i+1)%sides;index.push(a,b,c,b,d,c)}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(index);geo.computeVertexNormals();const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));m.receiveShadow=true;m.userData.keep=true;return m;
}

function enhanceWorld(){
 const cfg=courses[selectedTrack],th=cfg.theme,forge=th==='forge',night=th==='night'||forge;atmosphere=new THREE.Group();scene.add(atmosphere);
 const road=mat(cfg.road);road.roughness=night?.42:.82;road.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRoadWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRoadWorld=(modelMatrix*vec4(position,1.)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRoadWorld;').replace('#include <color_fragment>','#include <color_fragment>\nfloat roadGrain=fract(sin(dot(vRoadWorld.xz,vec2(127.1,311.7)))*43758.5453);diffuseColor.rgb*=.92+roadGrain*.16;');
 };road.customProgramCacheKey=()=> 'aurora-road-grain-v2';road.needsUpdate=true;mat(0xdfff87).emissive.set(0x7ea738);mat(0xdfff87).emissiveIntensity=.35;

 skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{topColor:{value:new THREE.Color(pick({night:0x080d29,forge:0x150512,mesa:0x8066a3},0x2b85be))},bottomColor:{value:new THREE.Color(cfg.fog)},sunColor:{value:new THREE.Color(pick({night:0x89a8d6,forge:0xff9b4e},0xffe6bd))},sunDir:{value:new THREE.Vector3(-.55,.23,-.65).normalize()}},vertexShader:`varying vec3 vDir; void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vDir;uniform vec3 topColor,bottomColor,sunColor,sunDir;void main(){vec3 d=normalize(vDir);float h=clamp(d.y*1.5,0.,1.);vec3 col=mix(bottomColor,topColor,pow(h,.7));float s=max(0.,dot(d,sunDir));col+=sunColor*pow(s,400.)*.75+sunColor*pow(s,15.)*.18;gl_FragColor=vec4(col,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
 const sky=new THREE.Mesh(new THREE.SphereGeometry(1200,32,16),skyMaterial);sky.renderOrder=-10;sky.userData.sky=true;atmosphere.add(sky);
 waterMaterial=new THREE.ShaderMaterial({transparent:false,uniforms:{uTime:{value:0},waterColor:{value:new THREE.Color(cfg.water)},highlight:{value:new THREE.Color(pick({night:0x689cd1,forge:0xffe2a0},0xb6f0e6))},uLava:{value:forge?1:0}},vertexShader:`varying vec3 vWorld;void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,fragmentShader:`varying vec3 vWorld;uniform float uTime,uLava;uniform vec3 waterColor,highlight;
float cell(vec2 p){vec2 i=floor(p),f=fract(p);float d=1e3;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=fract(sin(vec2(dot(i+g,vec2(127.1,311.7)),dot(i+g,vec2(269.5,183.3))))*43758.5453);d=min(d,length(g+o-f));}return d;}
void main(){vec3 col;float dist=length(vWorld.xz-cameraPosition.xz);
 if(uLava>.5){vec2 p=vWorld.xz*.012+vec2(uTime*.012,uTime*.008);float crack=cell(p*2.2+sin(p.yx*3.+uTime*.09)*.25);float crust=smoothstep(.03,.42,crack);vec3 glow=mix(vec3(1.,.92,.55),vec3(1.,.32,.05),smoothstep(0.,.34,crack));col=mix(glow*2.1,vec3(.09,.04,.05),crust);col+=highlight*pow(1.-crust,3.)*.35;col=mix(col,waterColor*.22+vec3(.14,.03,.01),clamp(dist/2200.,0.,.62));}
 else{float a=sin(vWorld.x*.09+vWorld.z*.08+uTime*.7);float b=sin(vWorld.x*.045-vWorld.z*.19-uTime*.9);float sparkle=pow(max(0.,a*b),12.);float waves=sin(vWorld.z*.3+sin(vWorld.x*.09+uTime)*1.6+uTime*1.1);col=waterColor*(.8+.12*waves)+highlight*sparkle*.42;col=mix(col,waterColor,clamp(dist/1500.,0.,.7));}
 gl_FragColor=vec4(col,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
 const water=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000),waterMaterial);water.rotation.x=-Math.PI/2;water.position.set(0,-7,-150);atmosphere.add(water);
 if(forge){
  const ember=new THREE.BufferGeometry(),ep=[];for(let i=0;i<560;i++)ep.push((rand(i)-.5)*1400,rand(i+7)*260,-150+(rand(i+31)-.5)*1400);ember.setAttribute('position',new THREE.Float32BufferAttribute(ep,3));
  const emberPoints=new THREE.Points(ember,new THREE.PointsMaterial({color:0xffa13c,size:3.4,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}));atmosphere.add(emberPoints);animatedObjects.push({mesh:emberPoints,type:'ember',base:0,phase:0});
  for(let i=0;i<7;i++){const a=i/7*TAU+.4,p=new THREE.Vector3(Math.cos(a)*470,-6,-150+Math.sin(a)*480),g=new THREE.Group();g.position.copy(p);mesh(cone,0x2a161d,g,0,52,0,74,118,74);const cap=mesh(cone,0xff5a1c,g,0,104,0,26,26,26);cap.material=mat(0xff6a22,true);addGlow(g,0,118,0,0xff8a3a,120);atmosphere.add(g)}
 }
 if(th==='night'){const vertices=[];for(let i=0;i<900;i++){const a=rand(i+3)*TAU,h=.12+rand(i+19)*.88,r=Math.sqrt(1-h*h)*950;vertices.push(Math.cos(a)*r,h*950,Math.sin(a)*r-150)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));atmosphere.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xd9eaff,size:1.4,transparent:true,opacity:.85,depthWrite:false})));
 auroraMaterial=new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;uniform float uTime;void main(){float wave=.3+.16*sin(vUv.x*9.+uTime*.13)+.07*sin(vUv.x*21.-uTime*.2);float band=exp(-pow((vUv.y-wave)*10.,2.));float curtain=.55+.45*sin(vUv.x*170.+sin(vUv.x*15.+uTime*.2)*4.);float fade=sin(vUv.x*3.14159);vec3 color=mix(vec3(.16,.85,.65),vec3(.42,.25,.88),vUv.x);gl_FragColor=vec4(color,band*curtain*fade*.48);
#include <colorspace_fragment>
}`});let aurora=new THREE.Mesh(new THREE.PlaneGeometry(1300,420),auroraMaterial);aurora.position.set(0,230,-780);atmosphere.add(aurora);
 }
 // Banks connect elevated road surfaces to the terrain.
 for(const side of[-1,1]){const pos=[];for(let i=0;i<frames.length;i++){const a=sample(i/frames.length*length,side*16.9).p,b=sample((i+1)/frames.length*length,side*16.9).p;for(const p of[a,new THREE.Vector3(a.x,-5,a.z),b,b,new THREE.Vector3(a.x,-5,a.z),new THREE.Vector3(b.x,-5,b.z)])pos.push(p.x,p.y,p.z)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();const m=new THREE.Mesh(g,mat(pick({mesa:0xa75f48,night:0x414b72,forge:0x3a2029},0xc9b890)));m.material.side=THREE.DoubleSide;world.add(m)}
 // Reflective safety barriers, panels and road studs.
 for(let i=0;i<Math.floor(length/12);i++){const d=i*12,exposed=openAt(d);for(let side of[-1,1]){const f=sample(d,side*16.8),g=new THREE.Group();g.position.copy(f.p);g.rotation.y=f.yaw;
  if(exposed){const post=box(cfg.accent,g,0,.7,0,.7,1.4,.7);box(0x1d2a35,g,0,1.55,0,.9,.5,.9);world.add(g);continue}
  box(pick({night:0x3b466b,forge:0x33222c},0xf0ede3),g,0,1.15,0,.65,1.5,11.7);box(cfg.accent,g,0,1.95,0,.78,.18,11.8);box(pick({night:0xaab8ff,forge:0xffb375},0x304e64),g,-side*.34,1.32,0,.04,.5,3.2);world.add(g);if(night&&i%4===0){const glow=addGlow(atmosphere,f.p.x,f.p.y+2.1,f.p.z,forge?0xff9040:0x8cbcff,3);glow.material.opacity=.4}}}
 // Direction chevrons anticipate the next curve.
 for(let i=0;i<20;i++){const d=(i+.5)/20*length,f=sample(d),next=sample(d+20),turn=Math.atan2(Math.sin(next.yaw-f.yaw),Math.cos(next.yaw-f.yaw));if(Math.abs(turn)<.07)continue;const side=turn>0?-1:1,loc=sample(d,side*18);const group=new THREE.Group();group.position.copy(loc.p);group.rotation.y=loc.yaw;box(0x223c50,group,0,4.3,0,5,2.4,.35);for(let j=0;j<2;j++){let bar=box(0xe5ff93,group,side*(j?-.25:.25),4.3+(j?-.4:.4),.21,1.8,.3,.07);bar.rotation.z=side*(j?-.55:.55)}box(0xb5c7ce,group,0,2,0,.25,4,.25);world.add(group)}
 // Stadium seating at the start, with an animated audience.
 for(let side of[-1,1])for(let row=0;row<3;row++){const f=sample(length-25,side*(23+row*3));const g=new THREE.Group();g.position.copy(f.p);g.rotation.y=f.yaw;box(0x3c5868,g,0,1+row*1.5,0,2.8,2+row*3,31);for(let j=0;j<12;j++){const col=[0xffb85e,0xa7eadc,0xfb8f9e,0xcee0f7][(row+j)%4];sphere(col,g,0,3+row*2,j*2.4-13,.49,.75,.49);sphere(0xf4d9b4,g,0,4+row*2,j*2.4-13,.42)}world.add(g)}
 // Course-specific large landmarks.
 if(selectedTrack===0){
  for(let k=0;k<4;k++){const a=k/4*TAU+.6,p=new THREE.Vector3(Math.cos(a)*430,-5.6,-150+Math.sin(a)*450);const boat=new THREE.Group();boat.position.copy(p);boat.position.y=-5.6;rounded(0xf8edcf,boat,0,0,0,5,2,12);box(0x996850,boat,0,7,0,.25,14,.25);const sail=new THREE.Mesh(new THREE.ConeGeometry(5,11,3),mat(k%2?0xffa778:0xe8f0d1));sail.scale.z=.12;sail.position.set(1.5,8,0);boat.add(sail);boat.rotation.y=k;atmosphere.add(boat);animatedObjects.push({mesh:boat,type:'boat',base:boat.position.y,phase:k})}
  for(let k=0;k<12;k++){const p=roadside(length*(.42+k*.008),-36);let g=new THREE.Group();g.position.copy(p);mesh(cone,k%2?0xff936f:0xffe68c,g,0,4,0,3.8,2,3.8);box(0xf1d6a4,g,0,2,0,.18,4,.18);box(0xe5f0e8,g,1.1,.6,0,1.6,.3,3.4);world.add(g)}
 }else if(selectedTrack===1){
  for(const q of[.28,.72]){const f=sample(length*q),arch=new THREE.Group();arch.position.copy(f.p);arch.rotation.y=f.yaw;for(let side of[-1,1]){mesh(cylinder,0xb4694c,arch,side*25,15,0,9,30,11);sphere(0xbe7757,arch,side*18,29,0,12,7,9)}box(0xb66e4e,arch,0,32,0,40,8,15);world.add(arch)}
  for(let k=0;k<22;k++){const p=roadside(length*(.46+k*.006),k%2?-40:40);const stack=new THREE.Group();stack.position.copy(p);for(let j=0;j<4;j++)mesh(cylinder,j%2?0xb66d51:0xd79064,stack,0,j*6+3,0,6-j*.6,6,6-j*.6);world.add(stack)}
  for(let i=0;i<3;i++){const balloon=new THREE.Group();let p=sample(length*(.25+i*.27),-130).p;balloon.position.copy(p);balloon.position.y+=85;sphere([0xf2bb68,0xffaa9b,0x9ad6cc][i],balloon,0,0,0,11,15,11);rounded(0x815c4c,balloon,0,-21,0,5,3,4);for(const x of[-2,2])box(0xe7d3b0,balloon,x,-16,0,.12,9,.12);atmosphere.add(balloon);animatedObjects.push({mesh:balloon,type:'balloon',base:balloon.position.y,phase:i})}
 }else if(th==='forge'){
  // Foundry gantries, lava falls and hanging cauldrons.
  for(let i=0;i<9;i++){const f=sample(length*(.06+i*.105)),g=new THREE.Group();g.position.copy(f.p);g.rotation.y=f.yaw;for(const side of[-1,1]){box(0x241720,g,side*17,9,0,2.2,18,2.2);box(0x30202a,g,side*17,18.4,0,4.4,1.4,4.4)}box(0x241720,g,0,18.4,0,36,1.6,2.4);const bar=box(0xff7a2c,g,0,17.2,0,32,.5,.7);bar.material=mat(0xff8b3c,true);world.add(g);addGlow(atmosphere,f.p.x,f.p.y+17,f.p.z,0xff8a3a,16)}
  for(const q of[.34,.71]){const p=roadside(length*q,-58),g=new THREE.Group();g.position.copy(p);mesh(cylinder,0x2c1a22,g,0,14,0,10,28,10);const pour=box(0xff6a22,g,0,6,7,5,26,1.4);pour.material=mat(0xff7e33,true);world.add(g);addGlow(atmosphere,p.x,p.y+3,p.z,0xff7326,60)}
  for(let k=0;k<14;k++){const p=roadside(length*(.1+k*.062),k%2?42:-42),g=new THREE.Group();g.position.copy(p);for(let j=0;j<3;j++)mesh(cylinder,j%2?0x33202a:0x442a33,g,0,j*5+3,0,5.4-j*.9,5,5.4-j*.9);const top=sphere(0xff8636,g,0,16,0,2.2);top.material=mat(0xff8636,true);world.add(g)}
 }else{
  // A neon arcade tunnel, with a clear road through its center.
  for(let i=0;i<12;i++){const f=sample(length*.5+i*6),g=new THREE.Group();g.position.copy(f.p);g.rotation.y=f.yaw;box(0x223551,g,-15,6,0,1,12,1);box(0x223551,g,15,6,0,1,12,1);box(0x223551,g,0,12,0,31,1,1);for(const side of[-1,1])box(i%2?0x9b88e6:0x68bac6,g,side*14.45,6,0,.12,11,.4).material=mat(i%2?0xa98dff:0x7aede2,true);box(0x9d8eff,g,0,11.45,0,28,.1,.4).material=mat(0xb89fff,true);world.add(g)}
  for(let i=0;i<26;i++){const f=sample(i/26*length,(i%2?1:-1)*25),g=new THREE.Group();g.position.copy(f.p);mesh(cone,i%2?0x678bbc:0x9977c1,g,0,4,0,2,8,2);world.add(g);addGlow(atmosphere,f.p.x,f.p.y+3,f.p.z,i%2?0x74d8ff:0xbc92ff,10)}
 }
 for(const b of boxes){b.mesh.material.roughness=.15;const edges=new THREE.LineSegments(new THREE.EdgesGeometry(b.mesh.geometry),new THREE.LineBasicMaterial({color:0xd2fff6,transparent:true,opacity:.85}));b.mesh.add(edges);addGlow(b.mesh,0,0,0,0x66e8ff,6);}
 if(ambientLight){ambientLight.intensity=forge?1.55:night?1.45:2.0;ambientLight.color.set(pick({night:0xa3b5ff,forge:0x7d8ed6},0xe0f5ff));ambientLight.groundColor.set(pick({night:0x373452,forge:0xd8471a},0xa69178))}
 if(sunLight){sunLight.intensity=forge?2.1:night?1.2:3.0;sunLight.color.set(pick({mesa:0xffc394,night:0xc8cfff,forge:0xffc49a},0xfff0d4))}
}
function finishWorldSetup(){
 const xs=frames.map(f=>f.p.x),zs=frames.map(f=>f.p.z);mapBounds={minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
 for(const r of racers){const disc=new THREE.Mesh(new THREE.PlaneGeometry(6,7),new THREE.MeshBasicMaterial({map:glowTexture,color:0x071421,transparent:true,opacity:.44,depthWrite:false}));disc.rotation.x=-Math.PI/2;scene.add(disc);shadowDiscs.push(disc)}
 if(gameMode==='trial')for(const b of boxes)b.mesh.visible=false;
 updateGarage();
}
function updateGarage(){
 if(!garageScene){garageScene=new THREE.Scene();garageCamera=new THREE.PerspectiveCamera(36,1,.1,100);garageCamera.position.set(7.9,4.8,8.8);garageCamera.lookAt(0,1.6,0);garageScene.add(new THREE.HemisphereLight(0xecfaff,0x254252,3));const key=new THREE.DirectionalLight(0xffffff,4);key.position.set(3,8,5);garageScene.add(key);const rim=new THREE.DirectionalLight(0x75d9ff,3);rim.position.set(-5,4,-4);garageScene.add(rim);garageFloor=new THREE.Mesh(new THREE.CircleGeometry(4.5,64),new THREE.MeshBasicMaterial({color:0xb1edee,transparent:true,opacity:.08,depthWrite:false}));garageFloor.rotation.x=-Math.PI/2;garageFloor.position.y=-.07;garageScene.add(garageFloor);const ring=new THREE.Mesh(new THREE.TorusGeometry(4.4,.025,4,80),mat(0xa1eff1,true));ring.rotation.x=-Math.PI/2;garageScene.add(ring)}
 if(garageModel){garageScene.remove(garageModel);garageModel.userData.shieldMesh.material.dispose()}
 garageModel=kart(palette[selectedColor],selectedKart);garageScene.add(garageModel);garageModel.rotation.y=-.32;
 const cfg=kartTypes[selectedKart];$('garageName').textContent=cfg.name;$('garageDescription').textContent=cfg.description;$('garageClass').textContent=cfg.class;$('garageNumber').textContent=`0${selectedKart+1} / 0${kartTypes.length}`;$('kartRole').textContent=cfg.role;$('kartStats').innerHTML=['最高速','加速','旋回'].map((label,i)=>`<div class="kart-stat"><span>${label}</span><b><i style="width:${cfg.stats[i]}%"></i></b></div>`).join('');
}
function renderGarage(){if(mode!=='menu'||innerWidth<=850||!garageScene)return;const x=innerWidth*.51,y=innerHeight*.3,w=innerWidth*.45,h=innerHeight*.48;garageCamera.aspect=w/h;garageCamera.updateProjectionMatrix();garageModel.rotation.y=-.35+Math.sin(time*.28)*.38;garageModel.userData.driver.rotation.y=Math.sin(time*.4)*.08;renderer.autoClear=false;renderer.clearDepth();renderer.setScissorTest(true);renderer.setScissor(x,y,w,h);renderer.setViewport(x,y,w,h);renderer.render(garageScene,garageCamera);renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);renderer.autoClear=true;}
function animateEnvironment(dt){
 if(waterMaterial)waterMaterial.uniforms.uTime.value=time;if(auroraMaterial)auroraMaterial.uniforms.uTime.value=time;
 if(atmosphere){const sky=atmosphere.children.find(x=>x.userData.sky);if(sky)sky.position.copy(camera.position)}
 for(const o of animatedObjects){
  if(o.type==='ember'){o.mesh.position.y=mod(time*7,120)-60;o.mesh.rotation.y=time*.012;o.mesh.material.opacity=.55+Math.sin(time*1.7)*.25;continue}
  o.mesh.position.y=o.base+Math.sin(time*.7+o.phase)*(o.type==='boat'?.4:2);o.mesh.rotation.z=Math.sin(time*.55+o.phase)*.025}
 for(let i=0;i<shadowDiscs.length;i++){const r=racers[i],p=sample(r.d,r.lane);shadowDiscs[i].position.copy(p.p).y+=.23;shadowDiscs[i].rotation.z=-p.yaw;shadowDiscs[i].material.opacity=.45-(r===racers[0]?Math.min(air,.9)*.12:0)}
 if(sunLight&&racers[0]){const p=racers[0].model.position;sunLight.position.set(p.x-40,p.y+65,p.z+30);sunLight.target.position.copy(p);sunLight.target.updateMatrixWorld()}
 for(let i=skidSegments.length-1;i>=0;i--){const s=skidSegments[i];s.life-=dt;s.mesh.material.opacity=Math.min(.32,s.life*.1);if(s.life<=0){scene.remove(s.mesh);s.mesh.material.dispose();skidSegments.splice(i,1)}}
}
function leaveSkid(r){if(skidSegments.length>160)return;for(const side of[-1,1]){const f=sample(r.d-1.3,r.lane+side*1.7),m=new THREE.Mesh(unitBox,new THREE.MeshBasicMaterial({color:0x0a1721,transparent:true,opacity:.3,depthWrite:false}));m.position.copy(f.p).y+=.24;m.scale.set(.37,.01,2.0);m.rotation.y=f.yaw;scene.add(m);skidSegments.push({mesh:m,life:6})}}
// ---- Online rooms -------------------------------------------------------------
// The server only relays. Each player simulates their own kart and streams it; the
// host also streams the CPU karts, so the computer racers match on every screen.
const NET_RATE=1/15,NET_DELAY=130;
function lobbyStatus(text,bad=false){$('lobbyStatus').textContent=text;$('lobbyStatus').classList.toggle('error',bad)}
function racerByNet(id){return racers.find(r=>r.netId===id)}
function openLobby(){
 $('lobby').hidden=false;onlineResults=null;
 $('playerName').value=playerName||'';
 if(!net){net=new Net();wireNet()}
 renderLobby();
 if(net.state!=='open'){
  lobbyStatus('サーバーに接続しています…');
  net.connect().then(()=>lobbyStatus('つながりました。部屋をつくるか、合言葉を入れて参加してください。'))
   .catch(()=>lobbyStatus('サーバーが見つかりません。`node server/server.mjs` で起動したアドレスから開いてください。',true));
 }else lobbyStatus(net.code?`ルーム ${net.code} に参加中`:'部屋をつくるか、合言葉を入れて参加してください。');
}
function closeLobby(){$('lobby').hidden=true}
function profilePayload(){
 playerName=($('playerName').value||'').trim().slice(0,10)||'PLAYER';
 try{localStorage.setItem('aurora-name',playerName)}catch{}
 return {name:playerName,kart:selectedKart,color:selectedColor};
}
function renderLobby(){
 const joined=net&&net.id>0,players=net?net.players:[];
 $('lobbyCodeRow').hidden=!joined;$('roomCode').textContent=net?.code||'----';
 $('lobbyStart').hidden=!(joined&&net.isHost);
 $('joinBtn').disabled=$('createBtn').disabled=joined;
 $('lobbyTitle').textContent=joined?`待機室 ${players.length} / 8`:'待機室';
 const rows=players.map(p=>`<div class="lobby-player ${p.id===net.id?'me':''}"><i style="--pc:#${palette[p.color%8].toString(16).padStart(6,'0')}"></i>${p.name}<small>${p.host?'HOST':kartTypes[p.kart].name}</small></div>`);
 for(let i=players.length;i<8;i++)rows.push(`<div class="lobby-player cpu"><i style="--pc:#7d8fa6"></i>CPU<small>じどう</small></div>`);
 $('lobbyPlayers').innerHTML=joined?rows.join(''):'<div class="lobby-player cpu"><i></i>まだ部屋に入っていません<small></small></div>';
 const s=net?.settings||netSettings,host=net&&net.isHost;
 $('lobbySettings').innerHTML=joined?`
  <label>コース <select data-net="track" ${host?'':'disabled'}>${courses.map((c,i)=>`<option value="${i}" ${s.track===i?'selected':''}>${c.jp}</option>`).join('')}</select></label>
  <label>周回 <select data-net="laps" ${host?'':'disabled'}>${[1,2,3].map(n=>`<option value="${n}" ${s.laps===n?'selected':''}>${n}周</option>`).join('')}</select></label>
  <label>英検 <select data-net="grade" ${host?'':'disabled'}>${[5,4,3].map(g=>`<option value="${g}" ${s.grade===g?'selected':''}>${g}級</option>`).join('')}</select></label>
  <label>単語クイズ <select data-net="quiz" ${host?'':'disabled'}><option value="1" ${s.quiz?'selected':''}>あり</option><option value="0" ${s.quiz?'':'selected'}>なし</option></select></label>`:'';
 $('lobbySettings').querySelectorAll('[data-net]').forEach(el=>el.onchange=()=>{
  const key=el.dataset.net,value=key==='quiz'?el.value==='1':Number(el.value);
  net.send({t:'settings',settings:{[key]:value}});
 });
 $('lobbyTimer').innerHTML=joined?`<span style="width:${Math.max(0,lobbyClosesIn)/60*100}%"></span>`:'';
}
function wireNet(){
 net.on('joined',m=>{lobbyClosesIn=m.closesIn??60;renderLobby();lobbyStatus(`ルーム ${m.code} — 合言葉を友だちに伝えてください`)});
 net.on('players',m=>{lobbyClosesIn=m.closesIn??lobbyClosesIn;renderLobby()});
 net.on('tick',m=>{lobbyClosesIn=m.closesIn;$('lobbyTimer').innerHTML=`<span style="width:${Math.max(0,m.closesIn)/60*100}%"></span>`;
  if(m.closesIn<=10&&!$('lobby').hidden)lobbyStatus(`あと ${m.closesIn} 秒でスタート`)});
 net.on('error',m=>lobbyStatus(m.reason||'エラーが発生しました',true));
 net.on('close',()=>{if(!$('lobby').hidden)lobbyStatus('サーバーとの接続が切れました',true);renderLobby()});
 net.on('left',m=>{const a=racerByNet(m.id);if(a)a.gone=true;if(mode==='race')toast(`${m.name} が退出しました`)});
 net.on('start',m=>beginOnlineRace(m));
 net.on('finished',m=>{if(mode==='race'||mode==='finished')toast(`${m.name} ゴール！ ${formatTime(m.time)}`)});
 net.on('results',m=>{onlineResults=m.rows;if(!$('results').hidden)renderOnlineResults()});
 net.on('s',m=>{
  const a=racerByNet(m.id);
  if(a){a.buffer.push({t:m.ts,d:m.d,lane:m.lane,air:m.air||0,sp:m.sp,st:m.st||0,b:m.b,g:m.g,sk:m.sk,sr:m.sr});if(a.buffer.length>8)a.buffer.shift();a.quizScore=m.q??a.quizScore}
  if(m.c)for(const [id,d,lane,sp,st,b] of m.c){
   const cpu=racerByNet(id);if(!cpu||!cpu.remote)continue;
   cpu.buffer.push({t:m.ts,d,lane,air:0,sp,st,b,g:0,sk:0,sr:0});if(cpu.buffer.length>8)cpu.buffer.shift();
  }
 });
 net.on('ev',m=>{
  const a=racerByNet(m.id);if(!a)return;
  if(m.k==='shell'){const target=m.tid!==undefined?racerByNet(m.tid):null;spawnShell(a,racers.indexOf(a),m.kind,target,!!m.back)}
  else if(m.k==='trap')dropTrapAt(m.d,m.lane,racers.indexOf(a));
  else if(m.k==='item'){if(m.type==='thunder')useThunder(racers.indexOf(a));else if(m.type==='blooper')useBlooper(a);else if(m.type==='star')a.star=7}
  else if(m.k==='quiz')a.quizScore=m.score;
 });
}
function netEvent(payload){if(gameMode==='online'&&net&&net.state==='open')net.send({t:'ev',...payload})}
function onlineField(){
 const roster=onlineRoster.length?onlineRoster:[{id:net?.id||1,name:playerName||'PLAYER',kart:selectedKart,color:selectedColor}];
 const me=roster.find(p=>p.id===net?.id)||roster[0];
 const field=[{name:me.name,kart:me.kart,color:me.color,id:me.id,remote:false,cpu:false}];
 for(const p of roster)if(p.id!==me.id)field.push({name:p.name,kart:p.kart,color:p.color,id:p.id,remote:true,cpu:false});
 let cpu=0;
 while(field.length<8){field.push({name:names[1+cpu%7],kart:(field.length+1)%4,color:(field.length+2)%6,id:-(cpu+1),remote:!(net&&net.isHost),cpu:true});cpu++}
 return field;
}
function beginOnlineRace(message){
 Object.assign(netSettings,message.settings||{});
 gameMode='online';selectedTrack=clamp(netSettings.track|0,0,courses.length-1);totalLaps=clamp(netSettings.laps|0,1,7);
 quizGrade=[3,4,5].includes(netSettings.grade)?netSettings.grade:5;mirrorMode=!!netSettings.mirror;
 quizSeed=message.seed||1;onlineRoster=message.players||[];netStartAt=message.startAt||0;onlineResults=null;
 closeLobby();startRace();
 mode='countdown';document.body.classList.remove('intro');
 count=clamp((netStartAt-net.now())/1000,.6,8);lastCount='';
 $('netBadge')&&($('netBadge').textContent='');
}
function netStep(a,dt){
 const buffer=a.buffer,target=net.now()-NET_DELAY;
 while(buffer.length>2&&buffer[1].t<=target)buffer.shift();
 if(buffer.length>=2){
  const [from,to]=buffer,span=Math.max(1,to.t-from.t),f=clamp((target-from.t)/span,0,2.2);
  a.d=lerp(from.d,to.d,f);a.lane=lerp(from.lane,to.lane,f);a.air=lerp(from.air,to.air,f);
  a.speed=to.sp;a.stun=to.st;a.boost=to.b?.6:0;a.gliding=!!to.g;a.shrunk=to.sk?4:0;a.star=to.sr?4:0;
 }else if(buffer.length===1&&!a.gone){
  const only=buffer[0];a.d=Math.max(a.d,only.d)+a.speed*dt;a.lane=lerp(a.lane,only.lane,1-Math.exp(-dt*6));a.speed=only.sp;a.stun=only.st;
 }else if(!a.gone)a.d+=a.speed*dt;
 const lap=Math.floor(a.d/length);if(lap>a.lapsDone)a.lapsDone=lap;
 if(a.d>=length*totalLaps&&a.finish===null){a.finish=elapsed;finishOrder.push(a)}
}
function sendNetState(dt,r){
 if(gameMode!=='online'||!net||net.state!=='open')return;
 netClock+=dt;if(netClock<NET_RATE)return;netClock=0;
 const message={t:'s',ts:net.now(),d:+r.d.toFixed(2),lane:+r.lane.toFixed(2),sp:Math.round(r.speed),
  air:+air.toFixed(1),st:+stun.toFixed(2),b:boost>0?1:0,g:gliding?1:0,sk:shrunk>0?1:0,sr:star>0?1:0,q:quizCorrect};
 if(net.isHost){message.c=[];for(const a of racers)if(a.cpu&&!a.remote)message.c.push([a.netId,+a.d.toFixed(1),+a.lane.toFixed(1),Math.round(a.speed),+a.stun.toFixed(1),a.boost>0?1:0])}
 net.send(message);
}
function renderOnlineResults(){
 if(!onlineResults)return;
 $('standings').innerHTML=onlineResults.map((row,i)=>`<div class="standing ${row.id===net?.id?'you':''}"><b>${String(i+1).padStart(2,'0')}</b><span>${row.name}</span><span>${row.correct?row.correct+' 語 · ':''}${row.time?formatTime(row.time):'---'}</span></div>`).join('')+(quizEnabled()?wordReview():'');
}
// ---- U-Speak Racers: the quiz that drives the race ---------------------------
// Checkpoints ask a word; a right answer is speed, a wrong one is a spin. Everyone in
// an online room is fed the same questions by seeding the shuffle from the room seed.
const QUIZ_TIME=8,QUIZ_BOOST=3;
function mulberry(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const quizEnabled=()=>gameMode==='uspeak'||(gameMode==='online'&&netSettings.quiz);
function gatesPerLap(){return totalLaps<=1?5:totalLaps===2?4:3}
function buildQuiz(){
 quizGates=[];quizIndex=0;quizActive=null;quizClock=0;quizAsked=0;quizCorrect=0;quizStreak=0;quizBestStreak=0;quizLog=[];quizBoost=0;
 $('quiz').hidden=true;document.body.classList.remove('quizzing');$('quizScore').innerHTML='';
 for(const m of quizGateMeshes){scene.remove(m);disposeUnique(m)}quizGateMeshes=[];
 if(!quizEnabled())return;
 const pool=vocabulary[quizGrade]||vocabulary[5],random=mulberry(quizSeed*7919+quizGrade*31+selectedTrack),per=gatesPerLap();
 const order=pool.map((w,i)=>i);
 for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]]}
 let pick=0;
 for(let lap=0;lap<totalLaps;lap++)for(let g=0;g<per;g++){
  const word=pool[order[pick%order.length]];pick++;
  const wrong=[];while(wrong.length<2){const c=pool[Math.floor(random()*pool.length)];if(c[2]!==word[2]&&!wrong.some(w=>w[2]===c[2]))wrong.push(c)}
  const choices=[word,...wrong];
  for(let i=choices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]]}
  quizGates.push({d:(lap+(g+.5)/per)*length,word,choices,answer:choices.findIndex(c=>c[2]===word[2]),lap});
 }
 buildQuizGates();updateQuizScore();
}
function buildQuizGates(){
 const seen=new Set();
 for(const gate of quizGates){
  const q=mod(gate.d,length);if(seen.has(Math.round(q)))continue;seen.add(Math.round(q));
  const f=sample(q),group=new THREE.Group();group.position.copy(f.p);group.rotation.y=f.yaw;
  for(const side of[-1,1]){const leg=box(0x1d3a4e,group,side*12.6,5,0,1.5,10,1.5);const lamp=box(0xdcff7e,group,side*12.6,10.4,0,2.2,.7,2.2);lamp.material=mat(0xdcff7e,true)}
  const beam=box(0x1d3a4e,group,0,10.9,0,26,1.5,1.4);
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(9,3.4),new THREE.MeshBasicMaterial({map:labelTexture('? WORD ?','#12283a','#dcff7e'),side:THREE.DoubleSide,transparent:true}));
  panel.position.set(0,10.9,.8);group.add(panel);
  const arch=box(0xdcff7e,group,0,9.9,0,25,.4,.5);arch.material=mat(0xdcff7e,true);
  scene.add(group);quizGateMeshes.push(group);addGlow(group,0,10.4,0,0xdcff7e,16);
 }
}
function updateQuizScore(){
 const on=quizEnabled()&&quizGates.length>0;
 $('wordBox').hidden=!on;$('quizScore').innerHTML=on&&quizStreak>1?`<i>${quizStreak} 連続せいかい</i>`:'';
 if(on)$('wordCount').innerHTML=`${quizCorrect}<i>/ ${quizGates.length}</i>`;
}
function askQuestion(gate){
 quizActive={gate,answered:false,time:QUIZ_TIME};quizClock=QUIZ_TIME;quizAsked++;
 const card=$('quiz').firstElementChild;card.className='quiz-card';
 $('quizGrade').textContent=gradeLabels[quizGrade];$('quizCount').textContent=`Q${quizAsked} / ${quizGates.length}`;
 $('quizEmoji').textContent=gate.word[0];$('quizJp').textContent=gate.word[1];$('quizResult').textContent='';
 $('quizChoices').innerHTML=gate.choices.map((c,i)=>`<button data-choice="${i}"><i>${i+1}</i>${c[2]}</button>`).join('');
 $('quizBar').style.width='100%';$('quiz').hidden=false;document.body.classList.add('quizzing');
 sfx('quiz');
}
function answerQuiz(index){
 if(!quizActive||quizActive.answered)return;
 const {gate}=quizActive,correct=index===gate.answer,card=$('quiz').firstElementChild;
 quizActive.answered=true;quizActive.time=.95;
 card.classList.add('answered',correct?'correct':'wrong');
 [...$('quizChoices').children].forEach((b,i)=>{b.classList.add(i===gate.answer?'right':i===index?'miss':'dim')});
 quizLog.push({word:gate.word,correct});
 if(correct){
  quizCorrect++;quizStreak++;quizBestStreak=Math.max(quizBestStreak,quizStreak);
  quizBoost=QUIZ_BOOST;$('quizResult').textContent=quizStreak>1?`せいかい！ ${quizStreak}連続でブースト`:'せいかい！ ブースト';
  banner('CORRECT!',gate.word[2].toUpperCase()+' = '+gate.word[1]);sfx('correct');addCombo();
  spark(racers[0],0xb6ff7e,20);
 }else{
  quizStreak=0;$('quizResult').textContent=`せいかい： ${gate.word[2]}`;
  spinOut();sfx('wrong');
 }
 updateQuizScore();
 if(gameMode==='online'&&net)net.send({t:'ev',k:'quiz',correct,asked:quizAsked,score:quizCorrect});
}
function spinOut(){
 const r=racers[0];stun=Math.max(stun,1);r.stun=stun;r.speed*=.22;drift=0;drifting=false;gliding=false;
 quizBoost=0;shake=.45;hitFlash=.3;spark(r,0xff9f8a,16);toast('スピン！');
}
function quizStep(dt){
 if(!quizEnabled())return;
 quizBoost=Math.max(0,quizBoost-dt);
 if(quizActive){
  quizActive.time-=dt;
  if(!quizActive.answered){quizClock=Math.max(0,quizClock-dt);$('quizBar').style.width=(quizClock/QUIZ_TIME*100).toFixed(1)+'%';
   if(quizClock<=0){$('quizResult').textContent=`じかんぎれ： ${quizActive.gate.word[2]}`;answerQuiz(-1)}}
  else if(quizActive.time<=0){quizActive=null;$('quiz').hidden=true;document.body.classList.remove('quizzing')}
 }
 const r=racers[0];
 while(quizIndex<quizGates.length&&r.d>=quizGates[quizIndex].d){
  const gate=quizGates[quizIndex];quizIndex++;
  if(quizActive)continue;
  askQuestion(gate);break;
 }
}
// ---- Post processing ---------------------------------------------------------
// A hand-rolled composer: the scene lands in a render target, bright areas are pulled
// out and blurred at two scales, and one composite pass adds bloom, a per-course grade,
// chromatic aberration, radial speed blur, heat haze and a vignette.
let sceneTarget=null,bloomTargets=[],postQuad=null,postCamera=null,brightMaterial=null,blurMaterial=null,compositeMaterial=null,postReady=false,postTime=0;
const quadVertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
// Half-float keeps the bloom smooth, but not every device can render to it.
let floatTargets=true;
function makeTarget(w,h,depth=false){return new THREE.WebGLRenderTarget(Math.max(2,w|0),Math.max(2,h|0),{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:depth,stencilBuffer:false,type:floatTargets?THREE.HalfFloatType:THREE.UnsignedByteType})}
function buildPost(){
 floatTargets=!!(renderer.capabilities.isWebGL2&&(renderer.extensions.has('EXT_color_buffer_half_float')||renderer.extensions.has('EXT_color_buffer_float')));
 postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 postQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial());
 brightMaterial=new THREE.ShaderMaterial({uniforms:{tDiffuse:{value:null},threshold:{value:.82},softness:{value:.24}},vertexShader:quadVertex,fragmentShader:`
  uniform sampler2D tDiffuse;uniform float threshold,softness;varying vec2 vUv;
  void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));float k=smoothstep(threshold,threshold+softness,l);gl_FragColor=vec4(c*k*k,1.);}`});
 blurMaterial=new THREE.ShaderMaterial({uniforms:{tDiffuse:{value:null},direction:{value:new THREE.Vector2(1,0)},texel:{value:new THREE.Vector2(1,1)}},vertexShader:quadVertex,fragmentShader:`
  uniform sampler2D tDiffuse;uniform vec2 direction,texel;varying vec2 vUv;
  void main(){vec2 o=direction*texel;vec3 sum=texture2D(tDiffuse,vUv).rgb*.2270270;
   sum+=texture2D(tDiffuse,vUv+o*1.3846153).rgb*.3162162;sum+=texture2D(tDiffuse,vUv-o*1.3846153).rgb*.3162162;
   sum+=texture2D(tDiffuse,vUv+o*3.2307692).rgb*.0702702;sum+=texture2D(tDiffuse,vUv-o*3.2307692).rgb*.0702702;
   gl_FragColor=vec4(sum,1.);}`});
 compositeMaterial=new THREE.ShaderMaterial({uniforms:{tDiffuse:{value:null},tBloom:{value:null},tWide:{value:null},
  uBloom:{value:.42},uGrade:{value:new THREE.Vector3(1,1,1)},uTime:{value:0},uSpeed:{value:0},uBoost:{value:0},uHaze:{value:0},uFlash:{value:0},uFlashColor:{value:new THREE.Color(0xffffff)},uVignette:{value:.46},uSaturation:{value:1.07}},
  vertexShader:quadVertex,fragmentShader:`
  uniform sampler2D tDiffuse,tBloom,tWide;uniform vec3 uGrade,uFlashColor;uniform float uBloom,uTime,uSpeed,uBoost,uHaze,uFlash,uVignette,uSaturation;varying vec2 vUv;
  void main(){
   vec2 centred=vUv-.5;float r=length(centred);
   // A touch of lens distortion that grows with speed, then heat shimmer on top.
   vec2 uv=.5+centred*(1.+uSpeed*.012*r*r);
   if(uHaze>0.)uv+=vec2(sin(vUv.y*44.+uTime*3.1),cos(vUv.x*38.-uTime*2.4))*uHaze*.0016;
   float ab=(.0009+uSpeed*.0022+uBoost*.0032)*r;
   vec3 base;base.r=texture2D(tDiffuse,uv+centred*ab).r;base.g=texture2D(tDiffuse,uv).g;base.b=texture2D(tDiffuse,uv-centred*ab).b;
   // Radial streaks while boosting read as raw speed without costing a blur pass.
   float streak=uBoost*smoothstep(.16,.72,r);
   if(streak>.001){vec3 acc=vec3(0.);for(int i=1;i<=5;i++){float t=float(i)/5.;acc+=texture2D(tDiffuse,uv-centred*t*.055*streak).rgb;}base=mix(base,acc/5.,streak*.55);}
   vec3 bloom=texture2D(tBloom,uv).rgb+texture2D(tWide,uv).rgb*.85;
   vec3 col=base+bloom*uBloom;
   col*=uGrade;
   float l=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(l),col,uSaturation);
   col=mix(col,uFlashColor,uFlash);
   col*=1.-uVignette*pow(r,2.6);
   col+=(fract(sin(dot(uv*uTime,vec2(12.9898,78.233)))*43758.5453)-.5)*.008;
   gl_FragColor=vec4(max(col,0.),1.);
   #include <colorspace_fragment>
  }`});
 postReady=true;
}
function resizePost(){
 if(!postReady)return;const size=renderer.getDrawingBufferSize(new THREE.Vector2());
 for(const t of [sceneTarget,...bloomTargets])t?.dispose();
 sceneTarget=makeTarget(size.x,size.y,true);
 bloomTargets=[makeTarget(size.x/2,size.y/2),makeTarget(size.x/2,size.y/2),makeTarget(size.x/6,size.y/6),makeTarget(size.x/6,size.y/6)];
}
function blit(material,target){postQuad.material=material;renderer.setRenderTarget(target||null);renderer.clear(true,false,false);renderer.render(postQuad,postCamera)}
function present(){
 if(!postEnabled||!postReady||!sceneTarget){renderer.setRenderTarget(null);renderer.render(scene,camera);renderGarage();return}
 const previousAutoClear=renderer.autoClear;
 renderer.setRenderTarget(sceneTarget);renderer.clear();renderer.render(scene,camera);renderGarage();
 postQuad.frustumCulled=false;
 brightMaterial.uniforms.tDiffuse.value=sceneTarget.texture;blit(brightMaterial,bloomTargets[0]);
 for(const [from,to,axis,scale] of [[0,1,'x',1],[1,0,'y',1],[0,2,'x',3],[2,3,'y',3]]){
  const source=bloomTargets[from],destination=bloomTargets[to];
  blurMaterial.uniforms.tDiffuse.value=source.texture;
  blurMaterial.uniforms.direction.value.set(axis==='x'?1:0,axis==='x'?0:1);
  blurMaterial.uniforms.texel.value.set(scale/source.width,scale/source.height);
  blit(blurMaterial,destination);
 }
 const u=compositeMaterial.uniforms,speed=racers[0]?.speed||0;
 u.tDiffuse.value=sceneTarget.texture;u.tBloom.value=bloomTargets[0].texture;u.tWide.value=bloomTargets[3].texture;
 u.uTime.value=postTime;u.uSpeed.value=mode==='menu'?0:clamp(speed/110,0,1.6);
 u.uBoost.value=reducedMotion?0:clamp(boost>0?.85:0,0,1)+clamp(draftCharge/1.6*.25,0,.25);
 u.uHaze.value=theme()==='forge'&&!reducedMotion?1:0;
 u.uFlash.value=Math.min(.34,hitFlash*.5+rankFlash*.25);u.uFlashColor.value.set(hitFlash>0?0xffe2c0:0xdfff83);
 u.uGrade.value.fromArray(courses[selectedTrack].grade||[1,1,1]);
 renderer.setRenderTarget(null);renderer.autoClear=previousAutoClear;blit(compositeMaterial,null);
}
function applyQuality(){const lightweight=quality==='low'||(quality==='auto'&&(touch||autoLow));renderer.setPixelRatio(Math.min(devicePixelRatio,lightweight?1:quality==='high'?2:1.6));postEnabled=postWanted&&!lightweight;if(postEnabled&&postReady)resizePost();renderer.shadowMap.enabled=!lightweight;renderer.shadowMap.type=THREE.PCFSoftShadowMap;if(sunLight){sunLight.castShadow=!lightweight;sunLight.shadow.mapSize.set(1024,1024);sunLight.shadow.camera.left=-50;sunLight.shadow.camera.right=50;sunLight.shadow.camera.top=50;sunLight.shadow.camera.bottom=-50;sunLight.shadow.camera.near=1;sunLight.shadow.camera.far=170;sunLight.shadow.bias=-.0006;sunLight.shadow.normalBias=.1;sunLight.shadow.camera.updateProjectionMatrix()}savePreferences()}

try{
 renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:true,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,.2,2200);
 ambientLight=new THREE.HemisphereLight(0xe0f5ff,0xa69178,2);scene.add(ambientLight);sunLight=new THREE.DirectionalLight(0xfff0d4,3);sunLight.position.set(-40,65,30);scene.add(sunLight);scene.add(sunLight.target);
 loadPreferences();buildPost();resize();buildCourse();bind();frame();
 $('game').addEventListener('webglcontextlost',event=>{event.preventDefault();if(mode==='race'||mode==='countdown')pauseGame();$('error').hidden=false});
}catch(error){console.error(error);$('error').hidden=false}

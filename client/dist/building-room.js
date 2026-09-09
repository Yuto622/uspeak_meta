import * as THREE from './three.module.js';
import {SERVICE_NAMES} from './buildings.js';
// All furniture uses shared primitives. Each room owns only its sign textures.
export function createBuildingRoom({scene,box,sphere,gem,material}){
 const root=new THREE.Group();scene.add(root);root.visible=false;let obstacles=[];
 const M=(geo,x,y,z,w,h,d,c)=>{const m=new THREE.Mesh(geo,material(c));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=m.receiveShadow=true;root.add(m);return m};
 const B=(x,y,z,w,h,d,c)=>M(box,x,y,z,w,h,d,c);
 const solid=(x,z,w,d)=>obstacles.push({x,z,w:w/2,d:d/2});
 function sign(title,sub,x,y,z,w=6){const c=document.createElement('canvas');c.width=1024;c.height=240;const t=c.getContext('2d');t.fillStyle='#193b4b';t.fillRect(0,0,1024,240);t.fillStyle='#f9e7ba';t.textAlign='center';t.font='600 62px sans-serif';t.fillText(title,512,100,950);t.fillStyle='#bde3da';t.font='34px sans-serif';t.fillText(sub,512,180,950);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texture}));s.position.set(x,y,z);s.scale.set(w,w*240/1024,1);root.add(s);}
 function load(b){root.traverse(o=>{if(o.isSprite){o.material.map.dispose();o.material.dispose()}});root.clear();obstacles=[];root.visible=true;
 const colors={bakery:[0xd29a76,0xe9cfa5],inn:[0x6e95a2,0xe0d6bd],library:[0x74977d,0xdac6a1],home:[0xba9583,0xe8d5b9],fish:[0x439ca9,0xcce1d8],gear:[0x8883ae,0xe0d1bb],airport:[0x557f9e,0xd5e1dd],castle:[0x6a759e,0xe4d5b0],ticket:[0xc08a97,0xe9dcc0],tower:[0x66968b,0xe3d3b5],shrine:[0x768599,0xd2d8ce]};const [accent,cream]=colors[b.kind]||colors.home;
 B(0,-.2,0,23,.4,21,0x455766);for(let x=-10;x<=10;x+=2)for(let z=-9;z<=9;z+=2)B(x,.035,z,1.97,.12,1.97,(x+z)%4===1?cream:0xece6d3);
 B(0,2.7,-10,22.5,5.4,.35,cream);for(const x of[-11.2,11.2]){B(x,1.75,0,.3,3.5,20,cream);B(x,.5,0,.4,.8,20,accent)}B(0,.5,-9.7,22,.8,.15,accent);
 B(0,.12,3.3,3.4,.04,11.5,accent);for(const x of[-1.6,1.6])B(x,.15,3.3,.06,.025,11.5,0xe6c88a);
 for(const x of[-7.5,7.5]){B(x,3.4,-9.75,4.4,2.4,.07,0x81b7c3);B(x,3.4,-9.65,.13,2.5,.12,0xe8d5a8);B(x,3.4,-9.65,4.5,.12,.12,0xe8d5a8)}
 B(0,1,-6,7,1.8,1.7,accent);B(0,1.96,-6,7.3,.15,1.95,0xf5e6c9);solid(0,-6,7.3,1.95);
 B(0,1.3,-7.5,.8,.9,.5,accent);M(sphere,0,1.99,-7.5,.36,.38,.34,0xe6be9a);M(sphere,0,2.2,-7.54,.39,.2,.34,0x675047);for(const x of[-.13,.13])M(sphere,x,2.02,-7.18,.03,.035,.02,0x243b48);
 sign(b.name,SERVICE_NAMES[b.service],0,4.3,-8.2,8);
 if(['bakery','fish','gear'].includes(b.kind)){
  for(const side of[-1,1]){const x=side*7.2;B(x,1.05,-1,4.2,1.8,2.2,accent);B(x,2,-1,4.5,.1,2.4,cream);solid(x,-1,4.5,2.4);
   for(let i=0;i<6;i++){const xx=x-1.3+(i%3)*1.3,zz=-1.5+Math.floor(i/3);if(b.kind==='bakery'){M(sphere,xx,2.25,zz,.43,.23,.3,i%2?0xc98c48:0xe3b96e);B(xx,2.43,zz,.05,.035,.3,0xf6d999)}else if(b.kind==='fish'){M(sphere,xx,2.25,zz,.4,.18,.19,[0x77bac3,0xe6a789,0xabb7d4][i%3]);M(gem,xx-.45,2.25,zz,.16,.2,.08,0x60949f)}else{B(xx,2.4,zz,.5,.65,.3,[0x618c9b,0xb58298,0xc5aa6d][i%3]);B(xx,2.68,zz,.85,.19,.3,accent)}}
  }
  if(b.kind==='bakery'){B(-7.2,1.9,-7,3.8,3.7,1.8,0x816252);B(-7.2,1.4,-5.99,2.5,1.7,.1,0x322f30);B(-7.2,1.05,-5.88,1.8,.3,.15,0xe7ae5a);solid(-7.2,-7,3.8,2)}
  if(b.kind==='fish'){B(7.3,1.4,-7,4,2.3,1.4,0x6fb4bd);for(let i=0;i<5;i++)M(sphere,5.8+i*.7,1.4+Math.sin(i)*.5,-6.2,.25,.12,.1,0xf1c887);solid(7.3,-7,4,1.5)}
 }else if(['inn','home'].includes(b.kind)){
  for(const x of[-7,7]){B(x,.55,-2,3.6,.9,5,accent);B(x,1.08,-2,3.5,.22,4.9,0xf6ead3);B(x,1.24,-3.65,2.8,.24,1,0xffffff);B(x,1.22,-.7,3.5,.12,2.2,accent);solid(x,-2,3.6,5)}
 }else if(['castle','shrine'].includes(b.kind)){
  for(const x of[-8,8])for(const z of[-6,2]){B(x,2.6,z,.7,5.2,.7,cream);B(x,5.1,z,1.2,.3,1.2,0xd9be81);solid(x,z,1.2,1.2)}
  for(const x of[-6.4,6.4]){B(x,.7,-2,2.5,1.2,2.5,accent);M(gem,x,2.4,-2,.8,1.4,.8,0xb3ded9);solid(x,-2,2.5,2.5)}
 }else if(b.kind==='library'){
  for(const x of[-7.6,7.6]){B(x,2,-2,3.5,4,.5,0x806b55);solid(x,-2,3.5,.8);for(let row=0;row<3;row++){B(x,.6+row*1.1,-1.7,3.7,.12,.8,cream);for(let j=0;j<7;j++)B(x-1.4+j*.45,1+row*1.1,-1.55,.32,.72,.4,[0x6f97a0,0xb17e78,0x98a66d][j%3])}}
 }else{
  for(const x of[-7.5,7.5]){B(x,2.5,-3,4,3,.35,0x294959);solid(x,-3,4,.4);for(let i=0;i<4;i++){B(x,3.5-i*.6,-2.78,3.3,.12,.05,i%2?0xb6d8cf:0xe8cd95)}sign(b.kind==='airport'?'DEPARTURES':b.kind==='ticket'?'RIDE GUIDE':'ISLAND GUIDE','WILLOW · WONDER · RPG',x,4.5,-3,4.5)}
 }
 for(const x of[-7.5,7.5]){B(x,.55,6,3.6,.85,1.4,accent);B(x,1.18,6.55,3.6,.85,.22,accent);solid(x,6,3.6,1.6);B(x,1,8.1,.7,1.8,.7,cream);M(sphere,x,2.3,8.1,.65,.8,.65,0x80a383);solid(x,8.1,1.1,1.1)}
 for(const x of[-1.75,1.75])B(x,1.8,9.5,.25,3.6,.4,accent);B(0,3.5,9.5,3.8,.18,.5,0xe9d2a0);sign('出口 · EXIT','入ってきた入口へ',0,2.5,9.6,3.8);
 }
 return {root,load,blocked:(x,z)=>obstacles.some(o=>Math.abs(x-o.x)<o.w+.32&&Math.abs(z-o.z)<o.d+.32)};
}

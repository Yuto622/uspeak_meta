import * as THREE from './three.module.js';
import {WANDS,WAND_BY_ID,parkPosition} from './magic-data.js';

const box=new THREE.BoxGeometry(),orb=new THREE.SphereGeometry(1,14,10),crystal=new THREE.OctahedronGeometry(1),mats=new Map();
function mat(color,glow=0){const key=color+':'+glow;if(!mats.has(key))mats.set(key,new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:glow,roughness:.4,metalness:.25}));return mats.get(key)}
function mesh(root,geo,x,y,z,sx,sy,sz,color,glow=0){const m=new THREE.Mesh(geo,mat(color,glow));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;}
const ringGeo=new THREE.TorusGeometry(1,.055,8,48),shaftGeo=new THREE.CylinderGeometry(.045,.065,1.65,10);
export function wandModel(id){const w=WAND_BY_ID[id]||WANDS[0],g=new THREE.Group();
 mesh(g,shaftGeo,0,.8,0,1,1,1,0x63535c);
 for(const y of[.08,.4,1.4])mesh(g,ringGeo,0,y,0,.085,.085,.085,0xe9ca8b).rotation.x=Math.PI/2;
 mesh(g,crystal,0,1.78,0,.18,.3,.16,w.color,.8);
 const halo=new THREE.Group();halo.position.y=1.8;g.add(halo);
 if(w.shape==='leaf'||w.shape==='flame'||w.shape==='drop')for(const side of[-1,1]){const p=mesh(halo,orb,side*.16,-.13,0,.09,.24,.06,w.color,.3);p.rotation.z=-side*.6;}
 if(w.shape==='crystal')for(const side of[-1,1])mesh(halo,crystal,side*.18,-.12,0,.09,.25,.09,w.color,.5);
 if(w.shape==='bolt')for(const side of[-1,1])for(let i=0;i<3;i++){const p=mesh(halo,box,side*(.15+i*.05),.2-i*.13,0,.075,.2,.065,w.color,.7);p.rotation.z=.6;}
 if(['moon','sun','star'].includes(w.shape)){const ring=mesh(halo,ringGeo,w.shape==='moon'?.09:0,0,-.03,.33,.33,.33,w.color,.7);if(w.shape==='moon')ring.scale.x=.2;const n=w.shape==='star'?5:w.shape==='sun'?8:3;for(let i=0;i<n;i++){const a=i/n*Math.PI*2;mesh(halo,crystal,Math.cos(a)*.33,Math.sin(a)*.33,0,.065,.11,.065,w.color,.8);}}
 g.userData.wand=id;g.userData.halo=halo;return g;
}
export function createMagicWorld({scene,player,state}){const cache=new Map();let equipped=null,wand=null,parent=null,healPulse=0;
 function build(id){const p=parkPosition(id);if(!p)return null;if(cache.has(id))return cache.get(id);const root=new THREE.Group();root.position.set(p.x,0,p.z);scene.add(root);const B=(x,y,z,w,h,d,c,e=0)=>mesh(root,box,x,y,z,w,h,d,c,e),gold=0xeacb8c,teal=0x399c98,ivory=0xe9eee0;
 B(0,.08,0,8.6,.16,7.3,0x6e9b9c);B(0,.18,0,7.8,.16,6.5,0xd5e1d5);B(0,.13,4.6,3,.18,3,0xc7d9cc);
 const walls=[{x:-3.9,z:0,w:.2,d:3.2},{x:3.9,z:0,w:.2,d:3.2},{x:0,z:-3.2,w:3.9,d:.18},{x:-2.7,z:3.2,w:1.2,d:.18},{x:2.7,z:3.2,w:1.2,d:.18}];
 for(const o of walls){B(o.x,1.55,o.z,o.w*2,2.9,o.d*2,ivory);B(o.x,.56,o.z,o.w*2+.025,.45,o.d*2+.025,teal);}
 for(const x of[-3.95,3.95])for(const z of[-3.2,3.2]){B(x,1.9,z,.3,3.7,.3,gold);mesh(root,crystal,x,3.95,z,.22,.43,.22,0x8eecdd,.7);}
 for(const x of[-2.7,2.7]){B(x,2,3.41,1.25,1.15,.04,0x6fb8be,.22);B(x,2,-3.41,1.2,1.1,.04,0x6fb8be,.2);}
 const roof=new THREE.Group();root.add(roof);const roofMat=new THREE.MeshStandardMaterial({color:teal,roughness:.35,metalness:.3,transparent:true,opacity:1});
 for(let i=0;i<4;i++){const m=new THREE.Mesh(box,roofMat);m.position.set(0,3.35+i*.27,0);m.scale.set(8.9-i*.8,.3,7.5-i*.64);roof.add(m)}
 const roofRing=mesh(roof,ringGeo,0,4.8,0,1.25,1.25,1.25,gold,.35);roofRing.rotation.x=Math.PI/2;mesh(roof,crystal,0,5,0,.52,.8,.52,0xb9fff0,.5);
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=192;const c=canvas.getContext('2d');c.fillStyle='#173d4b';c.fillRect(0,0,1024,192);c.strokeStyle='#edd196';c.lineWidth=8;c.strokeRect(4,4,1016,184);c.textAlign='center';c.fillStyle='#f7edcd';c.font='bold 70px sans-serif';c.fillText('U-Speak park',512,88);c.fillStyle='#b6eee4';c.font='32px sans-serif';c.fillText('COMPANION CARE  ·  WAND ATELIER',512,143);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sign=new THREE.Mesh(new THREE.PlaneGeometry(6.8,1.28),new THREE.MeshBasicMaterial({map:texture}));sign.position.set(0,3.25,3.83);root.add(sign);
 B(0,.95,-1.95,5.6,1.25,.85,teal);B(0,1.61,-1.95,5.9,.14,1,gold);const npc=new THREE.Group();npc.position.set(0,0,-2.6);root.add(npc);mesh(npc,orb,0,1.95,0,.32,.33,.29,0xe1ba98);mesh(npc,box,0,1.28,0,.68,.85,.4,0xf3efe3);mesh(npc,box,0,2.22,0,.7,.14,.54,teal);for(const x of[-.12,.12])mesh(npc,orb,x,1.98,.28,.025,.03,.02,0x243c48);
 const pads=[];for(let i=0;i<3;i++){const x=(i-1)*1.8;const pad=mesh(root,ringGeo,x,.36,.5,.63,.63,.63,0x7ae8d5,.7);pad.rotation.x=Math.PI/2;pads.push(pad);mesh(root,crystal,x,.49,.5,.13,.2,.13,0xb6ffee,.5);}
 for(let i=0;i<8;i++){const w=wandModel(WANDS[i].id);w.scale.setScalar(.48);w.position.set(-3.35,.75,-1.8+i*.52);w.rotation.z=-.3;root.add(w)}
 const data={root,p,walls,roof,roofMat,pads};cache.set(id,data);return data;
 }
 function near(){const p=parkPosition(state.current);if(!p)return false;const x=player.position.x-p.x,z=player.position.z-p.z;return Math.abs(x)<3.5&&z>-2.6&&z<6.3;}
 function blocked(x,z){const d=build(state.current);if(!d)return false;return d.walls.some(o=>Math.abs(x-d.p.x-o.x)<o.w+.3&&Math.abs(z-d.p.z-o.z)<o.d+.3);}
 function goto(){const d=build(state.current);if(!d)return false;player.position.set(d.p.x,0,d.p.z+4.7);return true;}
 function update(t,dt,id,reduced){build(state.current);for(const [key,d]of cache){d.root.visible=key===state.current||key===state.target;if(!d.root.visible)continue;const inside=key===state.current&&Math.abs(player.position.x-d.p.x)<4&&Math.abs(player.position.z-d.p.z)<3.9;d.roof.visible=!inside;for(const [i,p]of d.pads.entries())p.scale.setScalar(.63+(reduced?0:Math.sin(t*2+i)*.025)+healPulse*.13);}
 const arm=player.children[0]?.userData.limbs?.[2];if(arm&&(id!==equipped||arm!==parent)){wand?.removeFromParent();wand=wandModel(id);wand.scale.setScalar(.7);wand.position.set(0,-.55,.16);wand.rotation.x=.17;arm.add(wand);equipped=id;parent=arm;}if(wand)wand.visible=state.mode!=='flight'&&state.mode!=='show';healPulse=Math.max(0,healPulse-dt*.7);
 }
 return {build,cache,near,blocked,goto,update,heal:()=>{healPulse=1}};
}

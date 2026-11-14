import * as THREE from './three.module.js';
const bodyGeo=new THREE.SphereGeometry(1,12,8),cubeGeo=new THREE.BoxGeometry(1,1,1),finGeo=new THREE.ConeGeometry(1,1,3),mats=new Map();
function mat(color,glow=0){const key=color+':'+glow;if(!mats.has(key))mats.set(key,new THREE.MeshStandardMaterial({color,roughness:.45,metalness:.18,emissive:color,emissiveIntensity:glow}));return mats.get(key)}
function part(parent,geo,x,y,z,w,h,d,c,glow=0){const m=new THREE.Mesh(geo,mat(c,glow));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
export function fishModel(f){const g=new THREE.Group(),colors=[0xe4bd66,0xdca08e,0x73b4ad,0x7d9fc7,0xa193ce],base=colors[f.palette],accent=[0xf6de9c,0xefc7ab,0xb0e4cc,0xafd9e4,0xdfc1eb][f.palette],wide=f.shape===4?.78:f.shape===2?.18:.48,long=f.shape===2?1.55:f.shape===3?.7:1;
 part(g,bodyGeo,0,0,0,long,wide,f.shape===5?.24:.36,base);part(g,bodyGeo,.55*long,.03,0,.52,wide*.83,.32,base);const tail=new THREE.Group();tail.position.x=-long*.88;g.add(tail);const fin=part(tail,finGeo,-.4,0,0,.68,.76,.12,accent,f.rarity>=3?.25:0);fin.rotation.z=Math.PI/2;
 const dorsal=part(g,finGeo,-.18,wide*.9,0,.36,.5,.09,accent);dorsal.rotation.z=-.3;for(const side of[-1,1]){const p=part(g,finGeo,.05,-wide*.2,side*.33,.23,.45,.07,accent);p.rotation.x=side*1.15;p.rotation.z=-.6;part(g,bodyGeo,.76*long,.12,side*.29,.105,.115,.035,0xf1ecdb);part(g,bodyGeo,.79*long,.12,side*.321,.052,.061,.02,0x1c3c48);if(f.pattern===1||f.pattern===3)for(let i=0;i<3;i++)part(g,cubeGeo,-.45+i*.36,0,side*.345,.09,wide*1.5,.03,accent);if(f.pattern===2)for(let i=0;i<6;i++)part(g,bodyGeo,-.58+(i%3)*.38,(Math.floor(i/3)-.5)*.28,side*.34,.06,.055,.025,accent)}
 if(f.shape===4){for(const side of[-1,1]){const wing=part(g,finGeo,-.2,0,side*.65,.8,1.15,.14,base);wing.rotation.x=side*Math.PI/2;wing.rotation.z=.4}}if(f.rarity===4){part(g,finGeo,.6,wide+.15,0,.25,.45,.2,0xf2d082,.5)}g.userData.tail=tail;return g}
export function equipmentModel(item){const glow=item.glow??(item.id==='sunblade'?.35:0),g=new THREE.Group(),B=(x,y,z,w,h,d,c,gl=0)=>part(g,cubeGeo,x,y,z,w,h,d,c,gl),c=item.color,a=item.accent||0xe0c68d;
 if(item.kind==='outfit'){B(0,1.29,0,.96,.82,.56,c);if(item.style==='vest'){for(const x of[-.3,.3]){B(x,1.27,.31,.3,.64,.09,c);B(x,1.17,.38,.23,.22,.1,a)}B(0,1.01,.34,.94,.12,.1,0x81694c)}if(item.style==='sailor'){for(const x of[-.27,.27])B(x,1.65,.34,.27,.2,.1,a);B(0,1.43,.38,.14,.44,.07,a);B(0,1.68,-.34,.84,.16,.18,a)}if(['cape','royal','captain'].includes(item.style)){B(0,1.12,-.53,1.03,1.02,.1,c);for(const x of[-.51,.51])B(x,1.67,0,.28,.14,.6,a);B(0,1.53,.34,.17,.16,.1,a)}if(item.style==='royal'){B(0,2.49,0,.88,.15,.75,a);for(const x of[-.34,0,.34])B(x,2.64,.27,.12,.26,.14,a)}if(item.style==='captain'){B(0,2.47,0,1.15,.13,.83,c);B(0,2.66,-.03,.82,.32,.6,c);B(0,2.69,.3,.23,.16,.04,a)}return g}
 // ぶき（ぶきや の 100 本：形 10 × 素材 10）。持つ ところは 下（y=0）、上へ のびる。上の だんの 素材は 刃・先っぽが 光る（glow）。
 const st=item.style,G=glow,grip=0x756043;
 if(st!=='shield'&&st!=='boomerang')B(0,0,0,.13,.34,.13,grip);
 if(st==='sword'){B(0,.23,0,.52,.09,.14,a);B(0,.77,0,.19,1,.07,c,G);part(g,finGeo,0,1.36,0,.12,.24,.065,c,G?Math.max(G,.4):0)}
 if(st==='katana'){B(0,.21,0,.3,.06,.3,a);for(let k=0;k<6;k++){const p=B(.03*k,.42+k*.2,0,.11,.24,.05,c,G);p.rotation.z=-.06*k}part(g,finGeo,.2,1.6,0,.07,.2,.05,c,G)}
 if(st==='spear'){B(0,.6,0,.08,1.5,.08,0x8a6a45);B(0,1.36,0,.16,.06,.16,a);part(g,finGeo,0,1.6,0,.13,.42,.13,c,G?Math.max(G,.3):0)}
 if(st==='trident'){B(0,.47,0,.09,1.3,.09,c);B(0,1.1,0,.62,.09,.1,c);for(const x of[-.28,0,.28]){B(x,1.27,0,.08,.36,.08,c);part(g,finGeo,x,1.52,0,.065,.18,.065,a,G)}}
 if(st==='staff'){B(0,.51,0,.1,1.35,.1,0x796a83);part(g,new THREE.OctahedronGeometry(.23),0,1.31,0,1,1.3,1,c,Math.max(.4,G))}
 if(st==='wand'){B(0,.42,0,.07,.85,.07,0x5a4636);part(g,new THREE.OctahedronGeometry(.13),0,.95,0,1,1,1,c,Math.max(.5,G));for(const[x,y]of[[.14,1.02],[-.12,1.08],[.02,1.16]])part(g,cubeGeo,x,y,0,.04,.04,.04,a,.8)}
 if(st==='hammer'){B(0,.48,0,.1,1.05,.1,0x8a6a45);B(0,1.1,0,.56,.3,.3,c,G);B(.31,1.1,0,.06,.34,.34,a)}
 if(st==='shield'){B(0,.35,.04,.66,.78,.08,c,G*.6);B(0,.35,.09,.5,.6,.03,a,G);B(0,.35,.12,.16,.16,.04,c,G);part(g,finGeo,0,-.14,.04,.33,.22,.08,c,G*.6).rotation.z=Math.PI}
 if(st==='boomerang'){const L=B(-.2,.25,0,.55,.13,.05,c,G);L.rotation.z=.6;const R=B(.2,.25,0,.55,.13,.05,c,G);R.rotation.z=-.6;B(0,.4,0,.14,.14,.06,a,G)}
 if(st==='bow'){for(let i=0;i<7;i++){const angle=-1.2+i*.4;const p=B(Math.cos(angle)*.4-.4,Math.sin(angle)*.72+.4,0,.13,.27,.11,c,G);p.rotation.z=-angle+Math.PI/2}B(-.26,.4,0,.025,1.32,.025,0xd9d8b7)}
 return g}

import * as THREE from './three.module.js';
const sphere=new THREE.SphereGeometry(1,16,12),box=new THREE.BoxGeometry(),cone=new THREE.ConeGeometry(1,1,8),mats=new Map();
const geoCache=new Map();function geometry(Type,args){const key=Type.name+':'+args.join(',');if(!geoCache.has(key))geoCache.set(key,new Type(...args));return geoCache.get(key)}
const torus=(...args)=>geometry(THREE.TorusGeometry,args),octa=(...args)=>geometry(THREE.OctahedronGeometry,args);
function mat(c,e=0){const k=c+':'+e;if(!mats.has(k))mats.set(k,new THREE.MeshStandardMaterial({color:c,roughness:.58,metalness:.08,emissive:c,emissiveIntensity:e}));return mats.get(k)}
export function creatureModel(c,evolution=null,cosmetic=null){const g=new THREE.Group(),parts={},col=new THREE.Color(c.color).offsetHSL((c.slot-4)*.007+(c.variant%3)*.014,.04,(c.slot%3)*.025).getHex(),accent=c.accent,cream=0xf1e3c6,dark=0x233e4a;
 const P=(geo,x,y,z,w,h,d,color=col,parent=g,emissive=0)=>{const m=new THREE.Mesh(geo,mat(color,emissive));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m};
 const S=(x,y,z,w,h,d,color=col,parent=g)=>P(sphere,x,y,z,w,h,d,color,parent);
 function eyes(y,z,x=.23){for(const side of[-1,1]){S(side*x,y,z,.14,.18,.055,cream);S(side*x+.015,y,z+.047,.079,.12,.025,dark);S(side*x-.02,y+.053,z+.07,.028,.035,.012,0xffffff);S(side*(x+.1),y-.16,z-.015,.12,.05,.028,accent)}}
 function paws(){for(const x of[-.32,.32])for(const z of[-.3,.3])S(x,.13,z,.2,.16,.23,accent)}
 function ears(height=1.1){for(const side of[-1,1]){const e=P(cone,side*.4,1.64,0,.28,height,.28);e.rotation.z=-side*.23;P(cone,side*.4,1.66,.13,.13,height*.64,.09,accent)}}
 function wing(side,y,z,scale=1){const w=new THREE.Group();w.position.set(side*.45,y,z);g.add(w);for(let j=0;j<4;j++){const p=S(side*(.26+j*.19),.05+j*.08,-j*.08,.22*scale,.4*scale,.095,accent,w);p.rotation.z=-side*(.55+j*.12)}parts[side<0?'leftWing':'rightWing']=w;return w}
 const type=c.archetype;
 if(type==='fox'){S(0,.6,0,.48,.5,.69);S(0,1.14,.38,.51,.47,.44);S(0,.99,.76,.26,.18,.2,cream);S(0,1.04,.91,.08,.07,.06,dark);ears(.72);eyes(1.22,.78);paws();const tail=new THREE.Group();tail.position.set(0,.45,-.55);g.add(tail);const t=S(.27,.3,-.3,.3,.39,.69,col,tail);t.rotation.x=-.4;S(.38,.55,-.77,.24,.28,.25,accent,tail);parts.tail=tail}
 if(type==='owl'){S(0,.65,0,.56,.65,.4);S(0,1.15,.04,.57,.43,.39);for(const side of[-1,1])S(side*.25,1.14,.37,.27,.31,.065,cream);eyes(1.2,.43,.24);const beak=P(cone,0,1,.54,.1,.18,.12,0xdbb063);beak.rotation.x=Math.PI/2;wing(-1,.7,0,.85);wing(1,.7,0,.85);for(const x of[-.2,.2])S(x,.08,.08,.16,.1,.2,accent);for(const side of[-1,1])P(cone,side*.34,1.61,-.05,.14,.38,.2,accent)}
 if(type==='turtle'){S(0,.44,-.1,.7,.43,.78,accent);S(0,.57,-.15,.57,.4,.64);for(let i=0;i<5;i++){const a=i/5*Math.PI*2;S(Math.cos(a)*.35,.77,-.1+Math.sin(a)*.4,.18,.1,.2,accent)}S(0,.52,.68,.35,.29,.4);eyes(.59,.99,.15);for(const x of[-.61,.61])for(const z of[-.45,.4]){const f=S(x,.16,z,.3,.14,.24);f.rotation.y=x*z}parts.shell=g.children[1]}
 if(type==='deer'){S(0,.67,0,.4,.45,.58);S(0,1.07,.38,.25,.52,.25);S(0,1.42,.49,.38,.3,.34);S(0,1.28,.76,.2,.13,.19,cream);eyes(1.47,.77,.18);for(const side of[-1,1]){const e=S(side*.42,1.56,.29,.27,.12,.12,accent);e.rotation.z=side*.3;const h=P(cone,side*.24,1.93,.32,.055,.68,.055,accent);h.rotation.z=-side*.3;const twig=P(cone,side*.4,1.96,.32,.045,.28,.045,accent);twig.rotation.z=-side*1.1}for(const x of[-.26,.26])for(const z of[-.29,.29])S(x,.23,z,.11,.29,.12,accent)}
 if(type==='dragon'){S(0,.62,0,.48,.55,.48);S(0,1.27,.18,.43,.4,.4);S(0,1.13,.55,.3,.19,.28,accent);eyes(1.36,.51,.21);S(0,.57,.4,.3,.38,.07,cream);for(const side of[-1,1])P(cone,side*.25,1.74,.05,.1,.43,.12,accent);wing(-1,.95,-.2,1.3);wing(1,.95,-.2,1.3);paws();const tail=new THREE.Group();tail.position.set(0,.4,-.37);g.add(tail);for(let j=0;j<4;j++)S(j*.08,.02,-j*.23,.19-j*.035,.16-j*.025,.25,col,tail);parts.tail=tail}
 if(type==='slime'){S(0,.59,0,.71,.61,.59);S(0,1.1,-.03,.28,.34,.26,accent);eyes(.71,.54,.25);S(0,.42,.6,.12,.05,.025,dark);for(const x of[-.5,.5])S(x,.16,.07,.27,.13,.26,accent);P(torus(.23,.035,5,24),0,1.48,0,1,1,1,accent).rotation.x=Math.PI/2}
 if(type==='rabbit'){S(0,.52,0,.43,.46,.45);S(0,1.04,.1,.46,.41,.4);for(const side of[-1,1]){const e=S(side*.22,1.7,.03,.14,.55,.15);e.rotation.z=-side*.12;S(side*.22,1.7,.165,.064,.4,.025,accent);S(side*.29,.12,.17,.24,.13,.32,accent)}eyes(1.12,.46,.2);S(0,.95,.52,.07,.06,.04,accent);S(0,.43,-.45,.24,.23,.23,cream);P(box,0,.76,.05,.88,.1,.7,accent);P(box,.28,.58,.44,.13,.3,.06,accent)}
 if(type==='golem'){P(box,0,.7,0,.89,.8,.6);P(box,0,1.29,.02,.7,.5,.63);for(const side of[-1,1]){P(box,side*.65,.7,0,.33,.65,.35,accent);P(box,side*.25,.16,0,.35,.3,.45)}eyes(1.35,.35,.17);P(octa(.23),0,.8,.39,1,1.25,.5,accent,g,.3);for(const side of[-1,1])P(cone,side*.2,1.69,0,.15,.35,.15,accent)}
 if(type==='manta'){S(0,.72,0,.47,.23,.7);for(const side of[-1,1]){const w=new THREE.Group();w.position.set(side*.32,.69,-.05);g.add(w);const fin=P(cone,side*.53,0,-.13,.73,1.2,.14,accent,w);fin.rotation.z=-side*Math.PI/2;parts[side<0?'leftWing':'rightWing']=w}eyes(.82,.58,.19);const tail=new THREE.Group();tail.position.set(0,.73,-.48);g.add(tail);for(let j=0;j<5;j++)S(0,-j*.035,-j*.2,.055,.055,.22,accent,tail);parts.tail=tail}
 if(type==='lion'){S(0,.62,0,.52,.5,.67);for(let j=0;j<12;j++){const a=j/12*Math.PI*2;S(Math.cos(a)*.49,1.17+Math.sin(a)*.48,.33,.23,.26,.2,accent)}S(0,1.19,.51,.43,.4,.31);S(0,1.04,.8,.24,.16,.13,cream);eyes(1.3,.79,.19);S(0,1.13,.9,.08,.065,.04,dark);paws();P(torus(.43,.03,6,40),0,1.93,.1,1,1,1,accent,g,.6).rotation.x=Math.PI/2;for(const x of[-.26,0,.26])P(cone,x,1.76,.48,.09,.24,.09,accent)}
 // Region-specific silhouettes: leaves, coral, ice, lightning, ruins, flowers and stellar rings.
 const addY=type==='deer'||type==='rabbit'?2.12:type==='turtle'?1.05:1.8;
 if(c.variant===0||c.variant===1){for(const side of[-1,1]){const leaf=S(side*.12,addY,0,.12,.27,.055,accent);leaf.rotation.z=-side*.65}}
 if(c.variant===2){for(let j=0;j<3;j++){P(cone,(j-1)*.2,addY,-.1,.07,.26+j*.09,.07,accent)}}
 if(c.variant===3||c.variant===6){P(box,0,type==='turtle'?.5:.82,.14,type==='turtle'?1.18:1.01,.12,.83,accent);P(box,.33,type==='turtle'?.38:.57,.56,.14,.42,.09,accent)}
 if(c.variant===4){for(let j=0;j<3;j++)P(octa(.15),-.24+j*.24,addY,-.08,1,1.4,1,accent,g,.15)}
 if(c.variant===5){for(const side of[-1,1]){const bolt=P(box,side*.44,addY-.15,-.02,.07,.35,.08,accent,g,.3);bolt.rotation.z=-side*.4;P(cone,side*.53,addY+.07,-.02,.06,.2,.06,accent)}}
 if(c.variant===7){for(const side of[-1,1])P(box,side*.42,type==='turtle'?.5:.91,0,.12,.14,.75,accent);P(octa(.13),0,type==='turtle'?.4:.85,.61,1,1,1,accent,g,.35)}
 if(c.variant===8){const ring=P(torus(.27,.03,6,32),0,addY+.12,0,1,1,1,accent,g,.35);ring.rotation.x=Math.PI/2;for(let j=0;j<3;j++)S((j-1)*.18,addY,-.05,.09,.08,.07,accent)}
 if(c.variant===9){const h=P(torus(.55,.025,6,48),0,1.15,-.3,1,1,1,accent,g,.5);parts.halo=h;for(const side of[-1,1])S(side*.55,.9,-.13,.21,.39,.07,cream)}
 if(c.slot===9){const mantle=new THREE.Group();g.add(mantle);parts.legend=mantle;const gem=P(octa(.2),0,1.65,.8,1,1.35,.5,accent,mantle,.7);for(let i=0;i<3+c.variant%3;i++){const a=i/(3+c.variant%3)*Math.PI*2;P(octa(.065),Math.cos(a)*.88,1.3+Math.sin(a)*.6,-.1,1,1.5,1,accent,mantle,.6)}if(c.variant===7){for(const angle of[0,1.1,-1.1]){const r=P(torus(.92,.028,7,64),0,1,-.28,1,1,1,accent,mantle,.55);r.rotation.y=angle;} }else if(c.variant===8){const moon=P(torus(.96,.11,8,48,Math.PI*1.55),0,1.5,-.28,1,1,1,0xe6c7fa,mantle,.45);moon.rotation.z=-.86;for(const side of[-1,1])P(cone,side*.52,1.95,-.1,.12,.63,.12,accent);}else if(c.variant===9){wing(-1,1.2,-.25,1.8);wing(1,1.2,-.25,1.8);for(const side of[-1,1])for(let i=0;i<3;i++){const plume=P(cone,side*(.85+i*.2),1.15-i*.14,-.35,.15,.9,.12,0xf5e4b2,mantle,.16);plume.rotation.z=-side*.65;}}}
 // ひとり ひとりの とくちょう（2026-11：「キャラデザイン それぞれ 個性的に」）。同じ 形（archetype）の 10 ぴきは 地域（variant）で
 // こものが ぜんぶ ちがい、もよう・かおも 組み合わせで かわる＝100 ぴき ぜんぶ ちがう。頭の 場所は 形ごとの 表（HEAD）。
 {const H={fox:[1.14,.38,.5],owl:[1.15,.04,.56],turtle:[.52,.68,.34],deer:[1.42,.49,.38],dragon:[1.27,.18,.42],slime:[.62,0,.7],rabbit:[1.04,.1,.45],golem:[1.29,.02,.38],manta:[.74,.1,.46],lion:[1.19,.51,.42]}[type]||[1.1,.2,.45],hy=H[0],hz=H[1],hr=H[2],top=hy+hr*.92,front=hz+hr*.86,k=c.variant,sl=c.slot,alt=new THREE.Color(accent).offsetHSL(.5,0,-.05).getHex(),pale=new THREE.Color(col).offsetHSL(0,-.1,.22).getHex(),deep=new THREE.Color(col).offsetHSL(0,.05,-.2).getHex();
  // こもの（10）：地域ごとに 1 つ。
  if(k===0){S(0,top+.1,hz,.3,.07,.3,0xe2c77a);S(0,top+.2,hz,.2,.12,.2,0xe2c77a);P(box,0,top+.13,hz,.42,.04,.42,alt)}                                   // むぎわらぼうし
  else if(k===1){for(const side of[-1,1]){S(side*.12,hy-hr*.75,front-.08,.13,.1,.06,alt)}S(0,hy-hr*.75,front-.06,.06,.06,.05,0xffffff)}                // ちょうネクタイ
  else if(k===2){for(let j=0;j<5;j++){const a=j/5*Math.PI*2;S(Math.cos(a)*hr*.6,top+.02,hz+Math.sin(a)*hr*.6,.08,.07,.08,[0xf7a8c8,0xffe08a,0xffffff][j%3])}} // はなかんむり
  else if(k===3){for(const side of[-1,1]){P(torus(.1,.022,6,16),side*.2,hy+.06,front+.03,1,1,1,dark)}P(box,0,hy+.06,front+.03,.14,.025,.02,dark)}       // めがね
  else if(k===4){P(box,0,hy-hr*.8,hz,hr*1.9,.12,hr*1.7,alt);P(box,.2,hy-hr*.8-.2,front-.1,.12,.34,.05,alt)}                                           // マフラー
  else if(k===5){P(cone,0,top+.2,hz,.2,.42,.2,alt);S(0,top+.42,hz,.07,.07,.07,0xffffff);P(box,0,top+.02,hz,.46,.05,.46,alt)}                         // とんがりぼうし
  else if(k===6){P(box,0,top-.02,hz,hr*1.9,.1,hr*1.8,alt);for(const side of[-1,1])S(side*hr*.95,top-.12,hz-.1,.07,.18,.07,alt)}                       // はちまき
  else if(k===7){P(torus(hr*.7,.03,6,24),0,top-.04,hz,1,1,1,dark).rotation.x=Math.PI/2;for(const side of[-1,1])S(side*hr*.98,hy+.04,hz,.1,.17,.14,alt)} // ヘッドホン
  else if(k===8){P(box,0,top+.06,hz,.36,.1,.36,dark);P(box,0,top+.22,hz,.24,.26,.24,dark);P(box,0,top+.12,hz,.26,.05,.26,alt)}                          // シルクハット
  else{P(box,0,top+.04,hz,.4,.1,.4,0xffd447,g,.3);for(const x of[-.14,0,.14])P(cone,x,top+.16,hz,.06,.16,.06,0xffd447,g,.3);S(0,top+.06,hz+.2,.045,.045,.03,0xd8323c)} // おうかん
  // かお（4）：ほっぺ・まゆ・した・きば。
  const fz=front+.04,mood=(k+sl*3)%4;
  if(mood===0){for(const side of[-1,1])S(side*hr*.62,hy-.1,fz-.08,.09,.055,.03,0xf7a0a8)}
  else if(mood===1){for(const side of[-1,1]){const b=P(box,side*.2,hy+.24,fz-.06,.16,.035,.03,deep);b.rotation.z=side*.35}}
  else if(mood===2){S(0,hy-.2,fz-.04,.06,.08,.03,0xf28a9a)}
  else{for(const side of[-1,1])P(cone,side*.07,hy-.19,fz-.05,.025,.07,.025,0xffffff).rotation.x=Math.PI}
  // もよう（5）：くつした・しま・ほし・せなかの ぶち・おなかの ハート。
  const pat=(k*3+sl)%5;
  if(pat===0){for(const x of[-.32,.32])for(const z of[-.3,.3])S(x,.07,z,.21,.09,.24,pale)}
  else if(pat===1){for(let j=0;j<3;j++)P(box,0,.45+j*.16,-.05,.92-j*.12,.045,.9-j*.1,deep)}
  else if(pat===2){for(const[x,y,z]of[[-.3,.75,.3],[.32,.6,.25],[.1,.9,-.35]])P(octa(.07),x,y,z,1,1,.5,0xffe9a8,g,.5)}
  else if(pat===3){for(const[x,y,z]of[[-.2,.82,-.35],[.25,.7,-.4],[0,.55,-.5]])S(x,y,z,.13,.11,.06,deep)}
  else{for(const side of[-1,1])S(side*.06,.62,.5,.07,.07,.03,0xf7a0a8);P(cone,0,.54,.5,.1,.12,.03,0xf7a0a8).rotation.x=Math.PI}
 }
 // Unique signature crest and spots vary across all 100 companions, not only by hue.
 for(let j=0;j<1+c.number%4;j++){const a=(j-(c.number%4)/2)*.2;S(a,.69+(c.slot%3)*.06,.48,.045+.012*(c.variant%3),.06,.035,accent)}
 g.scale.set(1+(c.variant%3)*.055,1+(c.variant%4)*.027,1-(c.variant%3)*.035);
 if(evolution){const aura=new THREE.Group();g.add(aura);parts.aura=aura;const ec=evolution==='radiant'?0xffd788:0x93e8dd;const ring=P(torus(evolution==='radiant'?.83:.94,.045,8,48),0,1.02,-.35,1,1,1,ec,aura,.6);if(evolution==='guardian')ring.rotation.y=Math.PI/2;for(let j=0;j<5;j++){const a=j/5*Math.PI*2;P(octa(.13),Math.cos(a)*.94,1.1+Math.sin(a)*.8,-.2,1,1.6,1,ec,aura,.5)}if(evolution==='radiant'){wing(-1,1,-.25,1.1);wing(1,1,-.25,1.1)}else{for(const side of[-1,1])P(octa(.26),side*.52,.85,.04,1,1.2,.7,ec,g,.2)}}
 if(cosmetic){const cc={spring:0xffbdd5,summer:0x86edf4,autumn:0xffbd78,winter:0xd1d8ff,scholar:0x26395f,champion:0xffda75}[cosmetic]||accent;P(box,0,type==='turtle'?.42:.8,.03,.9,.12,.75,cc);const bow=P(octa(.17),.34,type==='turtle'?.45:.83,.48,1,.7,.5,cc);parts.bow=bow;if(cosmetic==='champion')for(let j=0;j<3;j++)P(cone,(j-1)*.2,addY+.05,0,.09,.24,.09,cc)}
 const scale=(c.slot===9?1.12:c.slot===5?.83:1)*(evolution?1.13:1);g.scale.multiplyScalar(scale);g.userData.parts=parts;g.userData.baseScale=scale;g.userData.seed=c.number;g.userData.archetype=type;g.userData.restScale=g.scale.clone();return g;
}
export function animateCreature(g,t,seed=0,mood='idle'){const p=g.userData.parts||{},s=seed||g.userData.seed||0,rate=mood==='happy'?5:mood==='flee'?8:2.2+(s%5)*.17;if(p.tail){p.tail.rotation.y=Math.sin(t*rate+s)*.26;p.tail.rotation.x=Math.sin(t*.7+s)*.07}if(p.leftWing)p.leftWing.rotation.z=Math.sin(t*(rate+1)+s)*.3;if(p.rightWing)p.rightWing.rotation.z=-Math.sin(t*(rate+1)+s)*.3;if(p.halo)p.halo.rotation.z=t*.25;if(p.aura)p.aura.rotation.y=Math.sin(t*.5)*.2;if(p.legend)p.legend.rotation.y=Math.sin(t*.45)*.16;if(p.bow)p.bow.rotation.z=Math.sin(t*2)*.1;const type=g.userData.archetype;g.rotation.z=Math.sin(t*(type==='slime'?3:1.2)+s)*(mood==='happy'?.07:type==='manta'?.07:.018);g.rotation.x=type==='deer'||type==='golem'?Math.sin(t*.9+s)*.025:0;}

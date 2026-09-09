import * as THREE from './three.module.js';
export const AVATARS=[
 {id:'kai',name:'Kai',type:'男性',style:'ショートヘア・冒険家',hair:0x343137,skin:0xe6b68e,shirt:0x397e87,cut:'short'},
 {id:'mia',name:'Mia',type:'女性',style:'ロングヘア・旅人',hair:0x55362b,skin:0xf1c9a2,shirt:0xc38189,cut:'long'},
 {id:'ren',name:'Ren',type:'中性的',style:'シルバーヘア・スカウト',hair:0xc3c9cb,skin:0xb98059,shirt:0x6774ad,cut:'bob'},
 {id:'leo',name:'Leo',type:'男性',style:'カーリーヘア・探検家',hair:0x302824,skin:0x865738,shirt:0xd2a34d,cut:'curly'},
 {id:'aya',name:'Aya',type:'女性',style:'ツインテール・トラベラー',hair:0x292e39,skin:0xdba57e,shirt:0x759768,cut:'twin'},
 {id:'noa',name:'Noa',type:'中性的',style:'ミントヘア・クリエイター',hair:0x8bb3aa,skin:0xf0d0b2,shirt:0xb67856,cut:'short'},
 {id:'nova',name:'Nova',type:'スペシャル',style:'宇宙服・スターエクスプローラー',hair:0x656f7b,skin:0xc68d65,shirt:0xe0e7e5,cut:'space'},
 {id:'bolt',name:'Bolt',type:'スペシャル',style:'ロボット・ことばの相棒',hair:0x425d6b,skin:0xadc4c7,shirt:0x5396ab,cut:'robot'}
];
const geometry=new THREE.BoxGeometry(),materials=new Map();const material=c=>{if(!materials.has(c))materials.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.7}));return materials.get(c)};
export function buildAvatar(config){const a=AVATARS.find(a=>a.id===config.id)||AVATARS[0],skin=config.skin??a.skin,shirt=config.shirt??a.shirt,g=new THREE.Group();
 function b(x,y,z,w,h,d,c,parent=g){const m=new THREE.Mesh(geometry,material(c));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
 const limbs=[];for(const side of[-1,1]){const leg=new THREE.Group();leg.position.set(side*.23,.91,0);g.add(leg);b(0,-.34,0,.34,.72,.43,a.cut==='space'?0xd0dadb:0x43515c,leg);b(0,-.75,.07,.39,.2,.57,0x35454b,leg);limbs.push(leg)}
 b(0,1.29,0,.94,.81,.54,shirt);b(0,1.61,.29,.31,.16,.04,0xf2dfb3);b(0,1.06,.29,.88,.08,.04,0xd6bd89);
 for(const side of[-1,1]){const arm=new THREE.Group();arm.position.set(side*.6,1.57,0);g.add(arm);b(0,-.2,0,.27,.5,.38,shirt,arm);b(0,-.53,.015,.25,.2,.34,skin,arm);limbs.push(arm)}
 b(0,1.98,0,.75,.66,.67,skin);b(-.17,2.03,.346,.075,.08,.028,0x26323c);b(.17,2.03,.346,.075,.08,.028,0x26323c);b(0,1.83,.35,.17,.045,.025,0x9b655a);
 if(a.cut==='robot'){b(0,2.33,0,.81,.13,.73,0x425d6b);b(0,2.48,0,.065,.22,.065,0xd5b465);b(0,2.62,0,.17,.15,.17,0xf2d891);b(0,2,.36,.6,.19,.04,0x244958);b(-.17,2.01,.39,.1,.09,.03,0x9cebe2);b(.17,2.01,.39,.1,.09,.03,0x9cebe2);for(const x of[-.45,.45])b(x,2,0,.14,.3,.3,shirt);b(0,1.33,.3,.38,.3,.05,0xf0d894)}
 else if(a.cut==='space'){b(0,2.4,0,.99,.15,.88,0xe8eddf);b(0,1.64,0,.98,.12,.86,0xe8eddf);for(const x of[-.46,.46])b(x,2.01,0,.15,.72,.84,0xe8eddf);b(0,2.11,.37,.65,.24,.05,0x629ba9);b(.2,1.33,.3,.16,.15,.05,0xe9a46e);b(0,1.35,-.44,.74,.8,.38,0xd2dddb)}
 else{b(0,2.32,0,.83,.18,.75,a.hair);b(0,2.2,-.3,.83,.25,.2,a.hair);b(-.28,2.19,.26,.29,.2,.18,a.hair);if(a.cut==='long'||a.cut==='bob'){const h=a.cut==='long'?.85:.48;b(0,2.11-h/2,-.32,.84,h,.2,a.hair);for(const x of[-.37,.37])b(x,2.14-h/2,0,.16,h,.57,a.hair)}if(a.cut==='twin')for(const x of[-.54,.54]){b(x,1.95,-.15,.27,.65,.3,a.hair);b(x,2.18,-.15,.31,.11,.32,shirt)}if(a.cut==='curly')for(let i=0;i<12;i++)b((i%4-.5*3)*.23,2.38+Math.floor(i/4)*.055,(Math.floor(i/4)-1)*.23,.29,.24,.29,a.hair);b(0,1.4,-.4,.65,.65,.24,0xb89962);for(const x of[-.33,.33])b(x,1.3,.3,.08,.69,.04,0xc9b07d)}
 g.userData.limbs=limbs;return g;
}
export function setupAvatars({player,toast,renderer:worldRenderer}){
 const $=s=>document.querySelector(s),modal=$('#avatar-dialog');let saved=null;try{saved=JSON.parse(localStorage.getItem('uspeak-avatar-v1'))}catch{}
 const valid=c=>c&&AVATARS.some(a=>a.id===c.id)&&['skin','shirt'].every(k=>c[k]===undefined||Number.isInteger(c[k])&&c[k]>=0&&c[k]<=0xffffff);
 if(!valid(saved))saved=null;let committed=saved||{id:'kai'},draft={...committed},model=null,previewModel=null,first=!saved,previewRenderer=null;const previewScene=new THREE.Scene(),previewCamera=new THREE.PerspectiveCamera(33,1,.1,30);
 previewScene.background=new THREE.Color(0xdde5d5);previewScene.add(new THREE.HemisphereLight(0xe9f4ff,0x8e9971,2.5));const light=new THREE.DirectionalLight(0xffe2b6,3);light.position.set(-3,6,5);previewScene.add(light);previewCamera.position.set(3,2.4,5.7);previewCamera.lookAt(0,1.35,0);
 const platform=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.2,.17,48),new THREE.MeshStandardMaterial({color:0xbccaaa,roughness:.85}));platform.position.y=-.15;previewScene.add(platform);
 const outfitColors=[0x397e87,0xc38189,0x6774ad,0xd2a34d,0x759768,0xb67856,0xe0e7e5,0x394b66],skinColors=[0xf0d0b2,0xe6b68e,0xc68d65,0xa9714d,0x865738,0x5c3d2f];
 function apply(){player.clear();model=buildAvatar(committed);player.add(model);$('#avatar-button').textContent='◉ '+AVATARS.find(a=>a.id===committed.id).name}
 function resize(){if(!previewRenderer)return;const c=$('#avatar-preview'),w=c.clientWidth||280,h=c.clientHeight||330;previewRenderer.setSize(w,h,false);previewCamera.aspect=w/h;previewCamera.updateProjectionMatrix()}
 function preview(){if(previewModel)previewScene.remove(previewModel);previewModel=buildAvatar(draft);previewScene.add(previewModel);const a=AVATARS.find(a=>a.id===draft.id);$('#avatar-name').textContent=a.name;$('#avatar-description').textContent=a.style;$('#avatar-skin-section').hidden=a.cut==='robot';renderChoices();resize()}
 function renderChoices(){$('#avatar-choices').innerHTML=AVATARS.map(a=>`<button type="button" class="avatar-choice ${a.id===draft.id?'chosen':''}" data-avatar="${a.id}" aria-pressed="${a.id===draft.id}"><span>${a.type}</span><strong>${a.name}</strong><small>${a.style}</small></button>`).join('');document.querySelectorAll('[data-avatar]').forEach(b=>b.onclick=()=>{draft={id:b.dataset.avatar};preview()});const a=AVATARS.find(a=>a.id===draft.id);for(const [target,key,colors]of[['#avatar-skins','skin',skinColors],['#avatar-outfits','shirt',outfitColors]]){$(target).innerHTML=colors.map((c,i)=>`<button type="button" class="avatar-swatch" style="--swatch:#${c.toString(16).padStart(6,'0')}" data-${key}="${c}" aria-label="${key==='skin'?'肌の色':'服の色'} ${i+1}" aria-pressed="${(draft[key]??a[key])===c}"></button>`).join('');document.querySelectorAll(`[data-${key}]`).forEach(b=>b.onclick=()=>{draft[key]=Number(b.dataset[key]);preview()})}}
 function open(){if(document.body.classList.contains('on-journey'))return;draft={...committed};$('#avatar-cancel').hidden=first;$('#avatar-confirm').textContent=first?'このアバターで冒険をはじめる →':'このアバターに変更する →';modal.showModal();if(!previewRenderer){try{previewRenderer=new THREE.WebGLRenderer({canvas:$('#avatar-preview'),antialias:true,alpha:false});previewRenderer.setPixelRatio(Math.min(devicePixelRatio,1.5));previewRenderer.outputColorSpace=THREE.SRGBColorSpace;previewRenderer.toneMapping=THREE.ACESFilmicToneMapping}catch{$('#avatar-preview').hidden=true;$('#avatar-preview-fallback').hidden=false}}preview()}
 $('#avatar-button').onclick=open;$('#avatar-cancel').onclick=()=>modal.close();modal.addEventListener('cancel',e=>{if(first)e.preventDefault()});$('#avatar-confirm').onclick=()=>{committed={...draft};apply();try{localStorage.setItem('uspeak-avatar-v1',JSON.stringify(committed))}catch{toast('アバターを変更しました。このブラウザでは選択を保存できません。')}first=false;modal.close();toast(`${AVATARS.find(a=>a.id===committed.id).name} で冒険へ！`)};
 addEventListener('resize',resize);apply();
 function update(t,moving){if(model){const limbs=model.userData.limbs;limbs.forEach((g,i)=>g.rotation.x=moving?Math.sin(t*10+(i%2)*Math.PI)*(i<2?.4:.3):0)}if(modal.open&&previewRenderer&&previewModel){previewModel.rotation.y=Math.sin(t*.4)*.4;previewRenderer.render(previewScene,previewCamera)}}
 return {open,update,get config(){return {...committed}},get isOpen(){return modal.open},get first(){return first}};
}

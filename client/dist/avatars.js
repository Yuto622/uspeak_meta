import * as THREE from './three.module.js';
// **この教材で2番目に読む文字がここにある**（1番目はクラスに入る枠）。画面は英語が既定で、
// ヘッダーの「あ」で日本語になる。`type` と `style` は**辞書の鍵**なので日本語のまま置く。
// `update(t, moving)` の `t` とぶつかるので、`t as tr` として import する（game.js と同じ）。
import {t as tr, onLangChange, isJa} from './i18n.js';
import {buildPremiumAvatar,isPremiumAvatar} from './avatar-bodies.js';
import {addStars} from './cosmic-kit.js';
// きせかえで「すがた」を きて いれば、体は その すがた（買った アバター）。なければ はじめに えらんだ 体。
export const bodyConfig=(config,items)=>{const it=(items||[]).find(i=>i&&i.slot==='avatar'&&isPremiumAvatar(i.kind));return it?{...config,id:it.kind}:config};
// きぐるみ（2026-11：「どうぶつ風の かぶりもの・子どもが もっと 好きそうな すがたに」）：はじめに えらべる 8 ぴき。
// きせかえ島で 買う すがた（ねこ・パンダ・ドラゴン・ユニコーン…）とは べつの どうぶつ＝お店の 品を ただに しない。
// なまえは 辞書に 入れない（うさぎ・くま は クイズの 答えでも ある）。`name`＝日本語、`en`＝英語を 両方 持ち、画面は CSS が えらぶ。
// `shirt` は きぐるみの 色（「ふくの いろ」で かえられる）。前からの 8 人（kai〜bolt）の id は そのまま＝保存と 部屋の 名簿に のこって いる。
export const AVATARS=[
 {id:'k-rabbit',name:'うさぎ',en:'Rabbit',icon:'🐰',type:'どうぶつ',style:'ながい みみ',en2:'Long ears',kigu:'rabbit',hair:0x55362b,skin:0xf1c9a2,shirt:0xf6b7c8,belly:0xfff3f6,cut:'kigu'},
 {id:'k-bear',name:'くま',en:'Bear',icon:'🐻',type:'どうぶつ',style:'まるい みみ',en2:'Round ears',kigu:'bear',hair:0x343137,skin:0xe6b68e,shirt:0xa9744a,belly:0xf0d9b4,cut:'kigu'},
 {id:'k-dino',name:'きょうりゅう',en:'Dino',icon:'🦖',type:'どうぶつ',style:'せなかに とげ',en2:'Spiky back',kigu:'dino',hair:0x302824,skin:0xdba57e,shirt:0x5fbf6a,belly:0xf4ecae,cut:'kigu'},
 {id:'k-penguin',name:'ペンギン',en:'Penguin',icon:'🐧',type:'どうぶつ',style:'しろい おなか',en2:'White tummy',kigu:'penguin',hair:0x292e39,skin:0xf0d0b2,shirt:0x2f4270,belly:0xffffff,cut:'kigu'},
 {id:'k-fox',name:'きつね',en:'Fox',icon:'🦊',type:'どうぶつ',style:'ふさふさ しっぽ',en2:'Fluffy tail',kigu:'fox',hair:0x55362b,skin:0xe6b68e,shirt:0xe98a3c,belly:0xfff4e0,cut:'kigu'},
 {id:'k-frog',name:'かえる',en:'Frog',icon:'🐸',type:'どうぶつ',style:'おおきな め',en2:'Big eyes',kigu:'frog',hair:0x343137,skin:0xc68d65,shirt:0x7ccf5a,belly:0xf1f7c4,cut:'kigu'},
 {id:'k-chick',name:'ひよこ',en:'Chick',icon:'🐥',type:'どうぶつ',style:'きいろい はね',en2:'Yellow wings',kigu:'chick',hair:0x55362b,skin:0xf1c9a2,shirt:0xffd84a,belly:0xfff6c4,cut:'kigu'},
 {id:'k-shark',name:'さめ',en:'Shark',icon:'🦈',type:'どうぶつ',style:'ギザギザの は',en2:'Sharp teeth',kigu:'shark',hair:0x302824,skin:0xa9714d,shirt:0x5b8fc4,belly:0xf3f8fb,cut:'kigu'},
 {id:'kai',icon:'🧒',name:'Kai',type:'おとこのこ',style:'みじかい かみ・ぼうけんか',hair:0x343137,skin:0xe6b68e,shirt:0x397e87,cut:'short'},
 {id:'mia',icon:'👧',name:'Mia',type:'おんなのこ',style:'ながい かみ・たびびと',hair:0x55362b,skin:0xf1c9a2,shirt:0xc38189,cut:'long'},
 {id:'ren',icon:'🧑',name:'Ren',type:'どちらでも',style:'ぎんいろの かみ・スカウト',hair:0xc3c9cb,skin:0xb98059,shirt:0x6774ad,cut:'bob'},
 {id:'leo',icon:'👦',name:'Leo',type:'おとこのこ',style:'くるくる かみ・たんけんか',hair:0x302824,skin:0x865738,shirt:0xd2a34d,cut:'curly'},
 {id:'aya',icon:'👧',name:'Aya',type:'おんなのこ',style:'ツインテール・トラベラー',hair:0x292e39,skin:0xdba57e,shirt:0x759768,cut:'twin'},
 {id:'noa',icon:'🧑',name:'Noa',type:'どちらでも',style:'ミントいろの かみ・クリエイター',hair:0x8bb3aa,skin:0xf0d0b2,shirt:0xb67856,cut:'short'},
 {id:'nova',icon:'🧑‍🚀',name:'Nova',type:'とくべつ',style:'うちゅうふく・ほしの たんけんか',hair:0x656f7b,skin:0xc68d65,shirt:0xe0e7e5,cut:'space'},
 {id:'bolt',icon:'🤖',name:'Bolt',type:'とくべつ',style:'ロボット・ことばの あいぼう',hair:0x425d6b,skin:0xadc4c7,shirt:0x5396ab,cut:'robot'}
];
const geometry=new THREE.BoxGeometry(),materials=new Map();const material=c=>{if(!materials.has(c))materials.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.7}));return materials.get(c)};
export function buildAvatar(config){if(isPremiumAvatar(config?.id))return buildPremiumAvatar(config.id);const a=AVATARS.find(a=>a.id===config.id)||AVATARS[0],skin=config.skin??a.skin,shirt=config.shirt??a.shirt,g=new THREE.Group();
 function b(x,y,z,w,h,d,c,parent=g){const m=new THREE.Mesh(geometry,material(c));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
 const kigu=a.cut==='kigu',feet=kigu?(a.kigu==='penguin'||a.kigu==='chick'?0xf2a03c:a.belly):0x35454b;
 const limbs=[];for(const side of[-1,1]){const leg=new THREE.Group();leg.position.set(side*.23,.91,0);g.add(leg);b(0,-.34,0,.34,.72,.43,kigu?shirt:a.cut==='space'?0xd0dadb:0x43515c,leg);b(0,-.75,.07,.39,.2,.57,feet,leg);limbs.push(leg)}
 b(0,1.29,0,.94,.81,.54,shirt);if(kigu)b(0,1.26,.285,.6,.62,.04,a.belly);else{b(0,1.61,.29,.31,.16,.04,0xf2dfb3);b(0,1.06,.29,.88,.08,.04,0xd6bd89)}
 for(const side of[-1,1]){const arm=new THREE.Group();arm.position.set(side*.6,1.57,0);g.add(arm);b(0,-.2,0,.27,.5,.38,shirt,arm);b(0,-.53,.015,.25,.2,.34,kigu?a.belly:skin,arm);limbs.push(arm)}
 b(0,1.98,0,.75,.66,.67,skin);b(-.17,2.03,.346,.075,.08,.028,0x26323c);b(.17,2.03,.346,.075,.08,.028,0x26323c);b(0,1.83,.35,.17,.045,.025,0x9b655a);
 if(a.cut==='kigu')kigurumi(a,b,g,limbs,shirt);
 else if(a.cut==='robot'){b(0,2.33,0,.81,.13,.73,0x425d6b);b(0,2.48,0,.065,.22,.065,0xd5b465);b(0,2.62,0,.17,.15,.17,0xf2d891);b(0,2,.36,.6,.19,.04,0x244958);b(-.17,2.01,.39,.1,.09,.03,0x9cebe2);b(.17,2.01,.39,.1,.09,.03,0x9cebe2);for(const x of[-.45,.45])b(x,2,0,.14,.3,.3,shirt);b(0,1.33,.3,.38,.3,.05,0xf0d894)}
 else if(a.cut==='space'){b(0,2.4,0,.99,.15,.88,0xe8eddf);b(0,1.64,0,.98,.12,.86,0xe8eddf);for(const x of[-.46,.46])b(x,2.01,0,.15,.72,.84,0xe8eddf);b(0,2.11,.37,.65,.24,.05,0x629ba9);b(.2,1.33,.3,.16,.15,.05,0xe9a46e);b(0,1.35,-.44,.74,.8,.38,0xd2dddb)}
 else{b(0,2.32,0,.83,.18,.75,a.hair);b(0,2.2,-.3,.83,.25,.2,a.hair);b(-.28,2.19,.26,.29,.2,.18,a.hair);if(a.cut==='long'||a.cut==='bob'){const h=a.cut==='long'?.85:.48;b(0,2.11-h/2,-.32,.84,h,.2,a.hair);for(const x of[-.37,.37])b(x,2.14-h/2,0,.16,h,.57,a.hair)}if(a.cut==='twin')for(const x of[-.54,.54]){b(x,1.95,-.15,.27,.65,.3,a.hair);b(x,2.18,-.15,.31,.11,.32,shirt)}if(a.cut==='curly')for(let i=0;i<12;i++)b((i%4-.5*3)*.23,2.38+Math.floor(i/4)*.055,(Math.floor(i/4)-1)*.23,.29,.24,.29,a.hair);b(0,1.4,-.4,.65,.65,.24,0xb89962);for(const x of[-.33,.33])b(x,1.3,.3,.08,.69,.04,0xc9b07d)}
 // Where きせかえ hangs things. The avatar is a stack of boxes with no skeleton, so the
 // wardrobe needs named places rather than bone names: an empty group at the top of the
 // head, one at the face, one at the chest, one behind the shoulders, one at each foot.
 // They are groups rather than coordinates so an item can be added and removed without
 // knowing anything about how this body is built — and so a taller head or a different
 // cut moves its hat with it.
 const anchors={};
 for(const [name,x,y,z] of [['head',0,kigu?2.45:2.31,0],['face',0,2.03,.34],['chest',0,1.42,.28],['back',0,1.5,-.28],['hand',0,-.53,.015]]){
  const a=new THREE.Group();a.position.set(x,y,z);anchors[name]=a;
  (name==='hand'?limbs[3]:g).add(a);
 }
 g.userData.limbs=limbs;g.userData.anchors=anchors;
 // What is being worn, so a re-dress can take the last lot off again.
 g.userData.worn=new Map();
 return g;
}

// きぐるみの フード・みみ・しっぽ。顔は 出て いる（だれか 分かる）。箱だけ＝ほかの 体と 同じ 作り。
function kigurumi(a,b,g,limbs,suit){
 const k=a.kigu,in2=a.belly,dark=0x26323c;
 b(0,2.3,.2,.5,.1,.3,a.hair);                                   // まえがみが 少し のぞく
 b(0,2.4,-.02,.93,.22,.84,suit);b(0,2.0,-.36,.93,.78,.2,suit);  // フード：上・うしろ
 for(const x of[-.42,.42])b(x,2.0,-.02,.13,.74,.74,suit);       // フード：よこ
 b(0,1.63,-.02,.93,.1,.74,suit);                                // えり
 if(k==='rabbit'){for(const x of[-.22,.22]){b(x,2.9,-.05,.2,.8,.14,suit);b(x,2.9,.025,.1,.6,.03,0xff8fb0)}b(0,1.05,-.33,.26,.26,.2,0xffffff)}
 else if(k==='bear'){for(const x of[-.34,.34]){b(x,2.58,0,.28,.26,.16,suit);b(x,2.58,.085,.15,.14,.03,in2)}b(0,1.02,-.32,.2,.2,.16,suit)}
 else if(k==='dino'){for(let i=0;i<4;i++)b(0,2.58-i*.03,.22-i*.2,.12,.2,.14,0xf4c542);for(let i=0;i<3;i++)b(0,1.55-i*.24,-.31,.12,.16,.14,0xf4c542);for(const x of[-.27,-.09,.09,.27])b(x,2.26,.4,.1,.1,.05,0xffffff);const t=b(0,.92,-.52,.3,.26,.6,suit);t.rotation.x=-.35;b(0,.78,-.86,.18,.16,.3,suit)}
 else if(k==='penguin'){b(0,2.36,.42,.2,.09,.14,0xf2a03c);for(const x of[-.2,.2]){b(x,2.45,.4,.11,.11,.04,0xffffff);b(x,2.45,.425,.05,.05,.02,dark)}limbs[2].children[0].scale.x=.2;limbs[3].children[0].scale.x=.2}
 else if(k==='fox'){for(const x of[-.3,.3]){b(x,2.6,0,.26,.24,.14,suit);b(x,2.78,0,.14,.14,.12,dark);b(x,2.6,.075,.12,.12,.03,in2)}const t=b(0,1.05,-.58,.3,.3,.66,suit);t.rotation.x=.5;const tip=b(0,1.3,-.88,.26,.26,.24,0xffffff);tip.rotation.x=.5}
 else if(k==='frog'){for(const x of[-.25,.25]){b(x,2.62,.18,.28,.26,.26,suit);b(x,2.63,.32,.18,.17,.04,0xffffff);b(x,2.63,.345,.08,.09,.02,dark)}}
 else if(k==='chick'){b(0,2.58,0,.12,.16,.3,0xf0603c);b(0,2.36,.42,.18,.09,.14,0xf2a03c);for(const x of[-.2,.2])b(x,2.45,.405,.07,.07,.03,dark);for(const x of[-.52,.52])b(x,1.3,-.22,.1,.5,.42,0xffc22e)}
 else if(k==='shark'){b(0,2.72,-.08,.12,.44,.44,suit);b(0,1.5,-.34,.1,.4,.36,suit);for(const x of[-.3,-.15,0,.15,.3])b(x,2.26,.41,.09,.12,.05,0xffffff);for(const x of[-.2,.2]){b(x,2.45,.405,.08,.08,.03,dark)}const t=b(0,.95,-.5,.14,.5,.3,suit);t.rotation.x=-.5}
}

// Put a set of wardrobe items on a body built by buildAvatar. Idempotent: called again
// with a different list, it takes off what is no longer worn rather than stacking.
export function dressAvatar(model,items,build){
 const anchors=model?.userData?.anchors;if(!anchors)return;
 const worn=model.userData.worn||(model.userData.worn=new Map());
 const want=new Set((items||[]).map(i=>i.id));
 for(const [id,mesh] of [...worn]){if(want.has(id))continue;mesh.parent?.remove(mesh);worn.delete(id)}
 for(const item of items||[]){
  if(item.slot==='avatar')continue; // 体そのもの（bodyConfig）。のせる ものでは ない
  if(worn.has(item.id))continue;
  const anchor=anchors[item.slot==='hat'?'head':item.slot==='face'?'face':item.slot==='back'?'back':'chest'];
  if(!anchor)continue;
  const mesh=build(item);if(!mesh)continue;
  anchor.add(mesh);worn.set(item.id,mesh);
 }
}
export function setupAvatars({player,toast,renderer:worldRenderer}){
 const $=s=>document.querySelector(s),modal=$('#avatar-dialog');let saved=null;try{saved=JSON.parse(localStorage.getItem('uspeak-avatar-v1'))}catch{}
 const valid=c=>c&&AVATARS.some(a=>a.id===c.id)&&['skin','shirt'].every(k=>c[k]===undefined||Number.isInteger(c[k])&&c[k]>=0&&c[k]<=0xffffff);
 if(!valid(saved))saved=null;let committed=saved||{id:AVATARS[0].id},draft={...committed},model=null,previewModel=null,first=!saved,previewRenderer=null;const previewScene=new THREE.Scene(),previewCamera=new THREE.PerspectiveCamera(33,1,.1,30);
 previewScene.background=new THREE.Color(0x08160f);addStars(previewScene,{count:260,radius:16});previewScene.add(new THREE.HemisphereLight(0xfff4e6,0x3f7a5f,2.6));const light=new THREE.DirectionalLight(0xffe2b6,3);light.position.set(-3,6,5);previewScene.add(light);previewCamera.position.set(3,2.4,5.7);previewCamera.lookAt(0,1.35,0);
 const platform=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.2,.17,48),new THREE.MeshStandardMaterial({color:0x1f5a45,roughness:.6,emissive:0x1f5a45,emissiveIntensity:.5}));platform.position.y=-.15;previewScene.add(platform);const ring=new THREE.Mesh(new THREE.TorusGeometry(1.22,.035,8,64),new THREE.MeshBasicMaterial({color:0xffb066}));ring.rotation.x=Math.PI/2;ring.position.y=-.06;previewScene.add(ring);
 const outfitColors=[0xf6b7c8,0xffd84a,0x7ccf5a,0x5b8fc4,0xe98a3c,0xa9744a,0xb48cf0,0x2f4270,0x397e87,0xe0e7e5],skinColors=[0xf0d0b2,0xe6b68e,0xc68d65,0xa9714d,0x865738,0x5c3d2f];
 // きせかえ: what this child has on. Held here so that rebuilding the body — a new face,
 // a new colour — puts the clothes back on rather than quietly undressing them.
 let outfit=[],dressWith=null;
 function apply(){player.clear();model=buildAvatar(bodyConfig(committed,outfit));player.add(model);if(dressWith)dressWith(model,outfit);$('#avatar-button').textContent='◉ '+label(AVATARS.find(a=>a.id===committed.id))}
 const label=a=>a.en&&!isJa()?a.en:a.name,both=(ja,en)=>en?`<b class="en">${en}</b><i class="ja">${ja}</i>`:ja;
 function resize(){if(!previewRenderer)return;const c=$('#avatar-preview'),w=c.clientWidth||280,h=c.clientHeight||330;previewRenderer.setSize(w,h,false);previewCamera.aspect=w/h;previewCamera.updateProjectionMatrix()}
 function preview(){if(previewModel)previewScene.remove(previewModel);previewModel=buildAvatar(draft);previewScene.add(previewModel);const a=AVATARS.find(a=>a.id===draft.id);$('#avatar-name').innerHTML=(a.icon?a.icon+' ':'')+both(a.name,a.en);$('#avatar-name').setAttribute('translate','no');$('#avatar-description').innerHTML=a.en2?both(a.style,a.en2):tr(a.style);if(a.en2)$('#avatar-description').setAttribute('translate','no');else $('#avatar-description').removeAttribute('translate');$('#avatar-skin-section').hidden=a.cut==='robot';renderChoices();resize()}
 function renderChoices(){$('#avatar-choices').innerHTML=AVATARS.map(a=>`<button type="button" class="avatar-choice ${a.cut==='kigu'?'kigu':''} ${a.id===draft.id?'chosen':''}" data-avatar="${a.id}" aria-pressed="${a.id===draft.id}"><em class="avatar-icon" aria-hidden="true">${a.icon||'🙂'}</em><span>${tr(a.type)}</span><strong translate="no">${both(a.name,a.en)}</strong><small ${a.en2?'translate="no"':''}>${a.en2?both(a.style,a.en2):tr(a.style)}</small></button>`).join('');document.querySelectorAll('[data-avatar]').forEach(b=>b.onclick=()=>{draft={id:b.dataset.avatar};preview()});const a=AVATARS.find(a=>a.id===draft.id);for(const [target,key,colors]of[['#avatar-skins','skin',skinColors],['#avatar-outfits','shirt',outfitColors]]){$(target).innerHTML=colors.map((c,i)=>`<button type="button" class="avatar-swatch" style="--swatch:#${c.toString(16).padStart(6,'0')}" data-${key}="${c}" aria-label="${tr(key==='skin'?'はだの いろ':'ふくの いろ')} ${i+1}" aria-pressed="${(draft[key]??a[key])===c}"></button>`).join('');document.querySelectorAll(`[data-${key}]`).forEach(b=>b.onclick=()=>{draft[key]=Number(b.dataset[key]);preview()})}}
 // はじめては「スキップ」（あとで えらべる）、2 回目からは「キャンセル」。
 function cancelLabel(){const b=$('#avatar-cancel');b.hidden=false;b.textContent=tr(first?'スキップ（あとで えらぶ）':'キャンセル');b.classList.toggle('avatar-skip',first)}
 function open(){if(document.body.classList.contains('on-journey'))return;draft={...committed};cancelLabel();$('#avatar-confirm').textContent=tr(first?'この すがたで はじめる →':'この すがたに かえる →');modal.showModal();if(!previewRenderer){try{previewRenderer=new THREE.WebGLRenderer({canvas:$('#avatar-preview'),antialias:true,alpha:false});previewRenderer.setPixelRatio(Math.min(devicePixelRatio,1.5));previewRenderer.outputColorSpace=THREE.SRGBColorSpace;previewRenderer.toneMapping=THREE.ACESFilmicToneMapping}catch{$('#avatar-preview').hidden=true;$('#avatar-preview-fallback').hidden=false}}preview()}
 $('#avatar-button').onclick=open;$('#avatar-cancel').removeAttribute('data-t');$('#avatar-cancel').onclick=()=>{if(first){/* はじめての 人の スキップ（2026-11）：いまの すがた（Kai）の まま はじめる。あとで 上の バーの すがたから かえられる */committed={...committed};apply();try{localStorage.setItem('uspeak-avatar-v1',JSON.stringify(committed))}catch{}first=false;modal.close();toast(tr('すがたは あとで かえられるよ'));return}modal.close()};modal.addEventListener('cancel',e=>{if(first)e.preventDefault()});$('#avatar-confirm').onclick=()=>{committed={...draft};apply();try{localStorage.setItem('uspeak-avatar-v1',JSON.stringify(committed))}catch{toast(tr('アバターを変更しました。このブラウザでは選択を保存できません。'))}first=false;modal.close();toast(tr('{name} で冒険へ！',{name:label(AVATARS.find(a=>a.id===committed.id))}))};
// 言語を切り替えたら、**開いているときだけ**カードを書き直す（閉じていれば次に開くとき）。
onLangChange(()=>{$('#avatar-button').textContent='◉ '+label(AVATARS.find(a=>a.id===committed.id));if(modal.open){renderChoices();cancelLabel();$('#avatar-confirm').textContent=tr(first?'この すがたで はじめる →':'この すがたに かえる →')}});
 addEventListener('resize',resize);apply();
 function update(t,moving){if(model){const limbs=model.userData.limbs;limbs.forEach((g,i)=>g.rotation.x=moving?Math.sin(t*10+(i%2)*Math.PI)*(i<2?.4:.3):0)}if(modal.open&&previewRenderer&&previewModel){previewModel.rotation.y=Math.sin(t*.4)*.4;previewRenderer.render(previewScene,previewCamera)}}
 return {open,update,get config(){return {...committed}},get isOpen(){return modal.open},get first(){return first},
  // The wardrobe hands in both the list and the way to build it, so avatars.js does
  // not have to know what an item looks like.
  setOutfit(items,dresser){const was=bodyConfig(committed,outfit).id;outfit=items||[];if(dresser)dressWith=dresser;if(bodyConfig(committed,outfit).id!==was){apply();return}if(model&&dressWith)dressWith(model,outfit)},
  // いま 見えて いる 体（買った すがたを きて いれば それ）。部屋へ 送るのは config（はじめに えらんだ 体）の まま。
  get body(){return bodyConfig(committed,outfit)},
  get outfit(){return [...outfit]}};
}

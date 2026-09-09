import {CREATURES,CREATURE_BY_ID,REGIONS,REGION_BY_ID} from './rpg-data.js';
import {STARTERS,LEGEND_BY_ID,captureChance} from './magic-data.js';
import {LESSONS,SEASONS,levelFor,companionStats} from './adventure-data.js';

import {TREASURE_BY_ID,KEY_BY_ID,keyGoals} from './treasure-data.js';

const KEY='uspeak-adventure-v1';
const intervals=[120000,86400000,259200000,604800000,1814400000];
const clone=x=>JSON.parse(JSON.stringify(x));
const n=(v,max=1e8)=>Number.isFinite(v)?Math.max(0,Math.min(max,Math.floor(v))):0;
const ids=(a,table,max=100)=>[...new Set(Array.isArray(a)?a:[])].filter(v=>Object.hasOwn(table,v)).slice(0,max);
const dayKey=t=>new Date(t).toISOString().slice(0,10);
const weekKey=t=>{const d=new Date(t);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10)};
export function createAdventureStore(storage,rpg,onError=()=>{},clock=Date.now){
 const initial=()=>({version:1,treasureOpened:[],treasureKeys:[],seen:[],entries:{},team:[],words:{},story:{},badges:[],claims:[],memories:[],days:{},research:{week:weekKey(clock()),correct:0,claimed:false},settings:{grade:'auto',minutes:15,reduced:false,sound:true,season:SEASONS[Math.floor((new Date(clock()).getMonth()+1)%12/3)].id},stardust:0,cosmetics:[],equipped:null,exhibits:[],giftClaims:[],issuedGifts:[],stats:{correct:0,attempts:0,captures:0,flights:0,seconds:0},castMisses:{},starterId:null,starter:false});
 function sanitize(d,ownedIds=rpg.state.caught){const s=initial();if(!d||typeof d!=='object')d={};s.treasureOpened=ids(d.treasureOpened,TREASURE_BY_ID);s.treasureKeys=ids(d.treasureKeys,KEY_BY_ID);s.seen=ids(d.seen,CREATURE_BY_ID);for(const id of ownedIds){const e=d.entries?.[id]||{};s.entries[id]={damage:n(e.damage,1000),xp:n(e.xp,17000),bond:n(e.bond,999),form:['radiant','guardian'].includes(e.form)?e.form:null,joined:n(e.joined)||clock()};if(!s.seen.includes(id))s.seen.push(id)}s.team=ids(d.team,CREATURE_BY_ID,3).filter(id=>ownedIds.includes(id));if(!s.team.length)s.team=ownedIds.slice(0,3);
 for(const [id,w]of Object.entries(d.words||{})){if(!Object.hasOwn(LESSONS,id)||!w||typeof w!=='object')continue;s.words[id]={box:n(w.box,4),due:n(w.due,9e15),ok:n(w.ok),miss:n(w.miss),formats:[...new Set(Array.isArray(w.formats)?w.formats:[])].filter(x=>['meaning','reverse','context','listen','spell','speak'].includes(x)),last:n(w.last,9e15)}}
 for(const r of REGIONS)s.story[r.id]=n(d.story?.[r.id],2);s.badges=ids(d.badges,REGION_BY_ID).filter(id=>!REGION_BY_ID[id].hub);s.claims=(Array.isArray(d.claims)?d.claims:[]).filter(x=>typeof x==='string'&&x.length<80).slice(-200);s.memories=(Array.isArray(d.memories)?d.memories:[]).filter(m=>m&&typeof m.text==='string').slice(-30).map(m=>({text:m.text.slice(0,120),time:n(m.time,9e15)}));
 for(const [k,v]of Object.entries(d.days||{}).slice(-60)){if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&v)s.days[k]={correct:n(v.correct),attempts:n(v.attempts),seconds:n(v.seconds),words:ids(v.words,LESSONS)}}
 if(d.research?.week===s.research.week)s.research={week:s.research.week,correct:n(d.research.correct),claimed:!!d.research.claimed};s.settings={grade:['auto','5','4','3','準2','2'].includes(d.settings?.grade)?d.settings.grade:'auto',minutes:[5,10,15,20,30].includes(d.settings?.minutes)?d.settings.minutes:15,reduced:!!d.settings?.reduced,sound:d.settings?.sound!==false,season:SEASONS.some(x=>x.id===d.settings?.season)?d.settings.season:s.settings.season};s.stardust=n(d.stardust);s.cosmetics=(Array.isArray(d.cosmetics)?d.cosmetics:[]).filter(x=>['spring','summer','autumn','winter','scholar','champion'].includes(x));s.equipped=s.cosmetics.includes(d.equipped)?d.equipped:null;s.exhibits=(Array.isArray(d.exhibits)?d.exhibits:[]).filter(x=>x?.kind==='exhibit').slice(-8).map(x=>({kind:'exhibit',name:String(x.name||'旅人').slice(0,24),team:ids(x.team,CREATURE_BY_ID,3),badges:ids(x.badges,REGION_BY_ID),message:['hello','thanks','fly'].includes(x.message)?x.message:'hello'}));s.giftClaims=(Array.isArray(d.giftClaims)?d.giftClaims:[]).filter(x=>typeof x==='string'&&x.length<70).slice(-100);s.issuedGifts=(Array.isArray(d.issuedGifts)?d.issuedGifts:[]).filter(x=>typeof x==='string').slice(-100);for(const k of Object.keys(s.stats))s.stats[k]=n(d.stats?.[k]);s.starterId=STARTERS.some(c=>c.id===d.starterId)&&ownedIds.includes(d.starterId)?d.starterId:null;for(const [id,v]of Object.entries(d.castMisses||{}))if(Object.hasOwn(CREATURE_BY_ID,id))s.castMisses[id]=n(v,4);s.starter=!!d.starter||ownedIds.length>0;return s;
 }
 let raw;try{raw=JSON.parse(storage.getItem(KEY))}catch{}let s=sanitize(raw),warning=false;
 const save=()=>{try{storage.setItem(KEY,JSON.stringify(s))}catch{if(!warning){onError();warning=true}}};
 const entry=id=>s.entries[id]||(s.entries[id]={xp:0,bond:0,form:null,damage:0,joined:clock()});
 const memory=text=>{s.memories.push({text,time:clock()});s.memories=s.memories.slice(-30)};
 const today=()=>s.days[dayKey(clock())]||(s.days[dayKey(clock())]={correct:0,attempts:0,seconds:0,words:[]});
 const owned=id=>rpg.state.caught.includes(id);
 const regionalWords=id=>CREATURES.filter(c=>c.region===id).map(c=>s.words[c.wordId]).filter(Boolean);
 const progress=id=>{const w=regionalWords(id);return {caught:rpg.count(id),seen:s.seen.filter(c=>CREATURE_BY_ID[c].region===id).length,correct:w.reduce((a,x)=>a+x.ok,0),mastered:w.filter(x=>x.box>=2&&x.formats.length>=2).length,story:s.story[id]||0,badge:s.badges.includes(id)}};
 const cleared=id=>{const p=progress(id);return p.story===2&&(p.caught>=3||p.mastered>=6)||p.badge};
 const due=(grade='all')=>Object.keys(s.words).filter(id=>s.words[id].due<=clock()&&(grade==='all'||LESSONS[id].grade===grade)).sort((a,b)=>s.words[a].due-s.words[b].due);
 const API={get state(){return clone(s)},settingsSnapshot:()=>({...s.settings}),storyStatus:id=>s.story[id]||0,entry:id=>clone(entry(id)),progress,cleared,due,
 // One persisted snapshot owns both the claim and its reward, including backups.
 claimTreasure(id,region){const c=TREASURE_BY_ID[id];if(!c||c.region!==region||!rpg.unlocked(region))throw new Error('この宝箱の場所まで冒険してください。');if(s.treasureOpened.includes(id))throw new Error('この宝箱は開封済みです。');if(c.key&&!s.treasureKeys.includes(c.key))throw new Error(KEY_BY_ID[c.key].name+'が必要です。');const before=clone(s);s.treasureOpened.push(id);s.stardust+=c.reward;memory(c.name+'から星のかけら'+c.reward+(c.relic?'・'+c.relic:''));try{storage.setItem(KEY,JSON.stringify(s))}catch{s=before;throw new Error('保存できませんでした。宝箱は未開封のままです。')}return clone(c)},
 claimTreasureKey(id,region){const k=KEY_BY_ID[id];if(!k||k.region!==region||!rpg.unlocked(region))throw new Error('鍵の祭壇まで冒険してください。');if(s.treasureKeys.includes(id))throw new Error('この鍵は入手済みです。');if(!keyGoals(k,s).every(g=>g.done))throw new Error('祭壇の封印はまだ解けていません。');const before=clone(s);s.treasureKeys.push(id);memory(k.name+'を手に入れた');try{storage.setItem(KEY,JSON.stringify(s))}catch{s=before;throw new Error('保存できませんでした。もう一度調べてください。')}return clone(k)},
 health(id){if(!owned(id))return {hp:0,max:0};const max=companionStats(CREATURE_BY_ID[id],entry(id)).hp;return {hp:Math.max(0,max-entry(id).damage),max}},
 setHealth(id,hp){if(!owned(id)||!Number.isFinite(hp))return;entry(id).damage=Math.max(0,this.health(id).max-Math.max(0,Math.floor(hp)));save()},
 healAll(){for(const id of rpg.state.caught)entry(id).damage=0;memory('U-Speak parkで仲間全員の集中力を回復した');save()},
 castFailures:id=>s.castMisses[id]||0,
 cast(id,wandId,random=Math.random){const c=CREATURE_BY_ID[id];if(!c||!rpg.unlocked(c.region))throw new Error('この地域で仲間を探そう。');const rate=captureChance(c,wandId,s.castMisses[id]||0),success=random()*100<rate;s.castMisses[id]=success?0:Math.min(4,(s.castMisses[id]||0)+1);save();return {success,rate}},
 see(id){if(!CREATURE_BY_ID[id]||s.seen.includes(id))return false;s.seen.push(id);save();return true},
 capture(id){if(!owned(id))throw new Error('仲間にしてから育てよう。');const e=entry(id);e.xp+=20;e.bond+=2;s.stats.captures++;this.see(id);if(!s.team.length)s.team.push(id);memory(CREATURE_BY_ID[id].name+' と心がつながった');s.starter=true;save()},
 chooseStarter(id){if(s.starter||!STARTERS.some(c=>c.id===id))throw new Error('最初のパートナーは選択済みです。');rpg.capture(id);this.capture(id);rpg.selectBuddy(id);s.starterId=id;memory('はじめてのパートナーを選んだ');save()},
 recordAnswer({wordId,correct,mode='meaning',assisted=false,companionId=rpg.state.buddy}){if(!Object.hasOwn(LESSONS,wordId))return {xp:0};const t=clock(),w=s.words[wordId]||(s.words[wordId]={box:0,due:0,ok:0,miss:0,formats:[],last:0}),wasDue=w.due<=t,day=today();day.attempts++;s.stats.attempts++;let xp=0;
 if(correct){w.ok++;day.correct++;s.stats.correct++;if(!day.words.includes(wordId))day.words.push(wordId);if(!assisted&&!w.formats.includes(mode))w.formats.push(mode);if(wasDue&&!assisted){w.due=t+intervals[w.box];w.box=Math.min(4,w.box+1);xp=6}else{xp=assisted?1:2;if(wasDue)w.due=t+120000}if(s.research.week!==weekKey(t))s.research={week:weekKey(t),correct:0,claimed:false};s.research.correct++;if(companionId&&owned(companionId)){const e=entry(companionId);e.xp=Math.min(17000,e.xp+xp);e.bond=Math.min(999,e.bond+1)}}else{w.miss++;w.box=0;w.due=t+120000}w.last=t;save();return {xp,wasDue,box:w.box}},
 setTeam(id){if(!owned(id))throw new Error('仲間にしたキャラクターを選んでください。');if(s.team.includes(id)){if(s.team.length===1)throw new Error('チームには1体以上残してください。');s.team=s.team.filter(x=>x!==id)}else{if(s.team.length===3)throw new Error('チームは3体まで。1体外してから選ぼう。');s.team.push(id)}save()},
 evolve(id,form){const e=entry(id);if(!owned(id)||!['radiant','guardian'].includes(form)||levelFor(e.xp)<3||e.bond<10||e.form)throw new Error('進化にはレベル3と絆10が必要です。');e.form=form;memory(CREATURE_BY_ID[id].name+' が'+(form==='radiant'?'光彩':'守護')+'の姿に進化');save()},
 startStory(id){if(!rpg.unlocked(id)||!REGIONS.some(r=>r.id===id))throw new Error('地域を解放してから訪れよう。');s.story[id]=Math.max(s.story[id]||0,1);save()},
 finishStory(id){const p=progress(id);if(p.story!==1||!(p.seen>=3||p.correct>=6))throw new Error('3種類を見つけるか、地域のことばに6回正解しよう。');s.story[id]=2;s.stardust+=30;memory(REGION_BY_ID[id].name+' の物語をクリア');save()},
 badge(id){if(!rpg.unlocked(id)||!cleared(id))throw new Error('地域の物語と探索目標を先に達成しよう。');const first=!s.badges.includes(id);if(first){s.badges.push(id);s.stardust+=80;memory(REGION_BY_ID[id].name+' のリーグで勝利');if(s.badges.length===10&&!s.cosmetics.includes('champion'))s.cosmetics.push('champion')}save();return first},
 claim(id){if(s.claims.includes(id))throw new Error('この報酬は受け取り済みです。');let reward=0;if(id.startsWith('dex:')){const r=id.slice(4);if(rpg.count(r)!==10)throw new Error('この地域の10種類を集めよう。');reward=120}else if(id==='research:'+s.research.week){if(s.research.correct<30||s.research.claimed)throw new Error('今週の正解を30回集めよう。');reward=60;s.research.claimed=true}else if(id.startsWith('season:')){const season=id.slice(7);if(!SEASONS.some(x=>x.id===season)||s.stats.correct<20)throw new Error('英語チャレンジに20回正解しよう。');reward=25;if(!s.cosmetics.includes(season))s.cosmetics.push(season)}else throw new Error('受け取れない報酬です。');s.stardust+=reward;s.claims.push(id);memory('研究報酬を受け取った');save();return reward},
 buyCosmetic(){if(s.cosmetics.includes('scholar')||s.stardust<150)throw new Error('星のかけらが150必要です。');s.stardust-=150;s.cosmetics.push('scholar');save()},
 equip(id){if(id&&!s.cosmetics.includes(id))throw new Error('まだ持っていない装飾です。');s.equipped=id||null;save()},
 settings(next){s.settings=sanitize({...s,settings:{...s.settings,...next}}).settings;save()},
 time(seconds){const v=Math.max(0,Math.min(60,seconds));s.stats.seconds+=v;today().seconds+=v;save()},
 flight(id){s.stats.flights++;memory(REGION_BY_ID[id].name+' に空の旅');save()},
 remember: text=>{memory(text);save()},
 exportProfile(message='hello'){return {kind:'exhibit',v:1,name:'ことばの旅人',team:[...s.team],badges:[...s.badges],message}},
 importProfile(d){if(d?.kind!=='exhibit'||d.v!==1||!Array.isArray(d.team)||d.team.length>3||d.team.some(id=>!CREATURE_BY_ID[id]))throw new Error('展示コードの形式が違います。');const x={kind:'exhibit',name:String(d.name||'旅人').slice(0,24),team:[...d.team],badges:ids(d.badges,REGION_BY_ID),message:['hello','thanks','fly'].includes(d.message)?d.message:'hello'};s.exhibits.push(x);s.exhibits=s.exhibits.slice(-8);save();return clone(x)},
 gift(){if(s.stardust<20)throw new Error('ギフトには星のかけら20が必要です。');const id=globalThis.crypto?.randomUUID?.()||String(clock())+Math.random();s.stardust-=20;s.issuedGifts.push(id);save();return {kind:'gift',v:1,id,amount:15}},
 receiveGift(d){if(d?.kind!=='gift'||d.v!==1||d.amount!==15||typeof d.id!=='string'||d.id.length>70||s.giftClaims.includes(d.id)||s.issuedGifts.includes(d.id))throw new Error('無効または受取済みのギフトです。');s.giftClaims.push(d.id);s.stardust+=15;save()},
 npcTrade(give,take){if(!owned(give)||owned(take)||!CREATURE_BY_ID[take]||(!rpg.unlocked(CREATURE_BY_ID[take].region)||LEGEND_BY_ID[take])||entry(give).bond<15)throw new Error('絆15以上の仲間の紹介と、解放済み地域の未所持の仲間が必要です。');entry(give).bond-=10;rpg.capture(take);this.capture(take);memory('旅人の紹介で新しい仲間に出会った');save()},
 removeExhibit(i){s.exhibits.splice(i,1);save()},
 backup:()=>({kind:'uspeak-adventure',v:1,rpg:rpg.state,adventure:clone(s)}),
 restore(d){if(d?.kind!=='uspeak-adventure'||d.v!==1||!d.adventure||!d.rpg||!Array.isArray(d.rpg.caught))throw new Error('U-Speakのバックアップを選んでください。');const candidate=sanitize(d.adventure,ids(d.rpg.caught,CREATURE_BY_ID));rpg.restore(d.rpg);s=candidate;save()}
 };
 save();return API;
}

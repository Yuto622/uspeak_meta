import {CREATURES,REGION_BY_ID} from './rpg-data.js';

export const STARTERS=[CREATURES[0],CREATURES[1],CREATURES[4]];
export const WANDS=[
 {id:'sprout',name:'芽吹きの杖',en:'FIRSTLIGHT',price:0,bonus:0,color:0xa8e7a4,shape:'leaf',description:'最初の相棒と一緒にもらえる、冒険の杖。'},
 {id:'tide',name:'潮騒の杖',en:'TIDECALL',price:120,bonus:5,color:0x6bdbec,shape:'drop',description:'海のしずくが、仲間の心にそっと届く。'},
 {id:'ember',name:'灯火の杖',en:'EMBERSONG',price:300,bonus:11,color:0xffb776,shape:'flame',description:'温かな炎で、ためらう心を照らす。'},
 {id:'crystal',name:'水晶の杖',en:'CRYSTAL',price:650,bonus:18,color:0xc2beff,shape:'crystal',description:'澄んだ水晶が、ことばの力を高める。'},
 {id:'storm',name:'雷鳴の杖',en:'STORMWEAVER',price:1100,bonus:25,color:0xffe783,shape:'bolt',description:'稲妻の輝きで、強い絆を結ぶ。'},
 {id:'moon',name:'月影の杖',en:'MOONWHISPER',price:1800,bonus:33,color:0xe6b9ff,shape:'moon',description:'月の魔法が、伝説の心にも寄り添う。'},
 {id:'sun',name:'暁光の杖',en:'DAWNCROWN',price:2800,bonus:42,color:0xffd17d,shape:'sun',description:'夜明けの輪が、出会いを強く引き寄せる。'},
 {id:'astral',name:'星詠みの杖',en:'ASTRAL OATH',price:4500,bonus:54,color:0xc9fff1,shape:'star',description:'8本の頂点。星の誓いが、最も強い捕獲の魔法に。'}
];
export const WAND_BY_ID=Object.assign(Object.create(null),Object.fromEntries(WANDS.map(w=>[w.id,w])));
export const LEGENDS=CREATURES.filter(c=>c.slot===9).map((c,i)=>({
 id:c.id,region:c.region,badges:i===7?4:i===8?6:i===9?9:1,
 title:['芽吹きを守る者','森の記憶を紡ぐ者','潮の歌を聴く者','夕日の道を開く者','白銀の静寂を守る者','嵐にことばを灯す者','太陽の約束を守る者','星時計の観測者','月の夢をつなぐ者','夜明けを呼ぶ翼'][i],
 oath:['Small words can grow into big dreams.','Every voice belongs in the forest.','Listen, and the sea will answer.','Courage begins with a single step.','Even in silence, we understand.','Your voice is stronger than the storm.','Keep your promise, and follow the sun.','Every moment holds a new possibility.','Dreams connect us across the night.','Together, our words can change the world.'][i],
 grand:i>=7
}));
export const LEGEND_BY_ID=Object.assign(Object.create(null),Object.fromEntries(LEGENDS.map(l=>[l.id,l])));
export function legendGoals(c,s){const l=LEGEND_BY_ID[c.id];return l?[
 {text:REGION_BY_ID[c.region].name+'の物語をクリア',done:s.story[c.region]===2},
 {text:'この地域のリーダーに勝利',done:s.badges.includes(c.region)},
 ...(l.badges>1?[{text:'リーグの紋章を'+l.badges+'個集める',done:s.badges.length>=l.badges}]:[])
 ]:[];}
export function captureChance(c,wandId,failures=0){
 const base=LEGEND_BY_ID[c.id]?.grand?12:LEGEND_BY_ID[c.id]?20:c.slot>=7?30:42;
 const bonus=(WAND_BY_ID[wandId]||WANDS[0]).bonus;
 return failures>=4?100:Math.min(98,base+bonus+Math.max(0,failures)*10);
}
// おつかい島 has its own places to walk to and no companion sanctuary, so it gets no
// U-Speak park building — otherwise one would appear between the plaza and the shops.
export function parkPosition(id){const r=REGION_BY_ID[id];if(!r||id==='park'||id==='errand')return null;return {x:r.x+(id==='willow'?0:-11),z:r.z+(id==='willow'?-5:8.5)};}

import {DESTINATIONS,REGION_BY_ID,isActivityHub} from './rpg-data.js';
export const TREASURE_KEYS=[
 {id:'bronze',name:'古の銅の鍵',region:'canyon',color:0xd99b54,hint:'夕映えの渓谷の物語をクリアし、北端の鍵の祭壇を調べる。',badges:0},
 {id:'silver',name:'星銀の鍵',region:'ruins',color:0xa7d5ed,hint:'星時計の遺跡の物語と地域リーダーを攻略し、北端の鍵の祭壇へ。',badges:1},
 {id:'celestial',name:'天空の鍵',region:'sky',color:0xe4bbff,hint:'天空の聖域の物語と地域リーダーを攻略し、紋章を6個以上集めて北端の祭壇へ。',badges:6}
];
export const KEY_BY_ID=Object.fromEntries(TREASURE_KEYS.map(k=>[k.id,k]));
const relics=['若葉の羅針盤','夢色のチケット','暁のブローチ','古樹のしずく','潮騒の真珠','夕映えの勾玉','雪結晶の王冠','雷鳴の羽根','砂時計の涙','星時計の歯車','月のオルゴール','天翼の紋章'];
export const TREASURES=DESTINATIONS.filter(r=>!isActivityHub(r.id)).flatMap((r,i)=>{
 const positions=r.id==='willow'?[[-17,2],[-18,13],[11,5]]:r.id==='park'?[[-12,3],[12,8],[0,-17]]:[[-20,0],[20,0],[0,-18]];
 return positions.map(([x,z],j)=>{const key=j===0?null:j===1?'bronze':i%2?'celestial':'silver';return {id:r.id+'-chest-'+j,region:r.id,x:r.x+x,z:r.z+z,key,name:['旅人の宝箱','古代の宝箱',key==='celestial'?'天空の宝箱':'星銀の宝箱'][j],reward:key==='celestial'?240:key==='silver'?120:key==='bronze'?60:20,relic:j===2?relics[i]:null,hint:r.hub?['広場の西側','散策路のそば','島の奥を探索'][j]:['西の石畳','東の石畳','北へ続く道の奥'][j]};});
});
export const TREASURE_BY_ID=Object.fromEntries(TREASURES.map(c=>[c.id,c]));
export function keyGoals(key,s){return [{text:REGION_BY_ID[key.region].name+'の物語をクリア',done:s.story[key.region]===2},...(key.badges?[{text:'この地域のリーダーに勝利',done:s.badges.includes(key.region)}]:[]),...(key.badges>1?[{text:'リーグの紋章を'+key.badges+'個集める',done:s.badges.length>=key.badges}]:[])];}

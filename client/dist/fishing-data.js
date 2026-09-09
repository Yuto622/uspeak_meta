// Original game fish. Grade labels are study-difficulty guides, not an official exam word list.
const vocabulary={
 '5':[['apple','りんご'],['book','本'],['water','水'],['school','学校'],['friend','友だち'],['happy','うれしい'],['morning','朝'],['family','家族'],['house','家'],['music','音楽'],['small','小さい'],['white','白い'],['swim','泳ぐ'],['play','遊ぶ'],['eat','食べる'],['read','読む'],['beautiful','美しい'],['animal','動物'],['flower','花'],['weather','天気']],
 '4':[['arrive','到着する'],['borrow','借りる'],['decide','決める'],['invite','招待する'],['remember','覚えている'],['forget','忘れる'],['practice','練習する'],['travel','旅行する'],['country','国'],['village','村'],['different','異なる'],['important','重要な'],['famous','有名な'],['enjoy','楽しむ'],['holiday','休日'],['hospital','病院'],['kitchen','台所'],['careful','注意深い'],['together','一緒に'],['usually','たいてい']],
 '3':[['environment','環境'],['experience','経験'],['improve','改善する'],['protect','守る'],['continue','続ける'],['believe','信じる'],['explain','説明する'],['foreign','外国の'],['popular','人気のある'],['necessary','必要な'],['instead','代わりに'],['opinion','意見'],['culture','文化'],['volunteer','ボランティア'],['receive','受け取る'],['promise','約束する'],['discover','発見する'],['prepare','準備する'],['future','未来'],['success','成功']],
 '準2':[['opportunity','機会'],['responsibility','責任'],['influence','影響'],['advantage','利点'],['communicate','意思を伝える'],['encourage','励ます'],['relationship','関係'],['knowledge','知識'],['attitude','態度'],['available','利用できる'],['increase','増加する'],['reduce','減らす'],['avoid','避ける'],['achieve','達成する'],['support','支援する'],['consider','よく考える'],['provide','提供する'],['community','地域社会'],['situation','状況'],['confidence','自信']],
 '2':[['sustainable','持続可能な'],['consequence','結果・影響'],['significant','重大な'],['contribute','貢献する'],['alternative','代替の選択肢'],['evaluate','評価する'],['establish','設立する'],['potential','潜在的な可能性'],['diversity','多様性'],['conservation','自然保護'],['innovation','革新'],['efficient','効率のよい'],['perspective','物事の見方'],['negotiate','交渉する'],['investment','投資'],['evidence','証拠'],['essential','不可欠な'],['approximately','およそ'],['reliable','信頼できる'],['resolve','解決する']]
};
export const GRADES=['5','4','3','準2','2'];
export const ZONES=[{id:'pond',name:'こもれび池',english:'SUNLIT POND',grades:['5','4'],hint:'身近なことばから。ゆったり練習。',position:[-10,0,10],cast:[-14,.52,10],color:0x78bba8},{id:'river',name:'せせらぎ川',english:'WHISPER RIVER',grades:['3'],hint:'会話で使うことばに挑戦。',position:[20,0,3],cast:[23.4,.52,3],color:0x78bed0},{id:'sea',name:'星海の桟橋',english:'STARLIGHT SEA',grades:['準2','2'],hint:'少し難しいことばと、希少な魚。',position:[17,0,19],cast:[17,-1.35,25],color:0x698ed0}];
const bases=['メダカ','コイ','フナ','タナゴ','キンギョ','ドジョウ','ナマズ','マス','ウグイ','ハゼ','アユ','イワナ','ウナギ','タイ','エイ','カジキ','サメ','リュウグウ','クリスタルフィッシュ','クラウンフィッシュ'];
const prefixes=['コモレビ','ヒダマリ','セイリュウ','シオカゼ','ホシウミ'];
export const RARITIES=[{id:'common',name:'コモン',color:'#7d9e84',weight:7},{id:'uncommon',name:'アンコモン',color:'#499daa',weight:4},{id:'rare',name:'レア',color:'#7788ce',weight:2},{id:'epic',name:'エピック',color:'#ad79bd',weight:1},{id:'legendary',name:'レジェンド',color:'#c69848',weight:.45}];
export const FISH=GRADES.flatMap((grade,g)=>vocabulary[grade].map(([word,meaning],i)=>{const rarity=i<8?0:i<13?1:i<17?2:i<19?3:4;return {id:`fish-${g*20+i+1}`,number:g*20+i+1,name:prefixes[g]+bases[i],word,meaning,grade,zone:g<2?'pond':g===2?'river':'sea',rarity,price:Math.round((18+g*18+i*3)*[1,1.5,2.5,4,7][rarity]),size:Math.round((8+i*5+g*4)*(1+rarity*.18)),shape:i%6,palette:g,pattern:i%4}}));
export const FISH_BY_ID=Object.assign(Object.create(null),Object.fromEntries(FISH.map(f=>[f.id,f])));
export const ITEMS=[
 {id:'vest',name:'リバーガイドのベスト',kind:'outfit',price:90,color:0x7b9c78,accent:0xe0c889,style:'vest',description:'大きなポケットと革のベルト。'},
 {id:'sailor',name:'星海のセーラー',kind:'outfit',price:180,color:0xf0e5d1,accent:0x305e85,style:'sailor',description:'海を思わせる襟とネクタイ。'},
 {id:'ranger',name:'森のレンジャー',kind:'outfit',price:320,color:0x40694e,accent:0xaebd79,style:'cape',description:'肩から揺れる、深緑のマント。'},
 {id:'royal',name:'ロイヤル・アングラー',kind:'outfit',price:620,color:0x6c6095,accent:0xeacb83,style:'royal',description:'金の飾りと王冠で、島の主役に。'},
 {id:'aurora',name:'オーロラの旅装',kind:'outfit',price:950,color:0x398e9b,accent:0x9ce3d4,style:'cape',description:'光る留め具を備えた旅の装い。'},
 {id:'captain',name:'レジェンド・キャプテン',kind:'outfit',price:1500,color:0x253e60,accent:0xf1ce76,style:'captain',description:'船長帽と金の肩章の特別な服。'},
 {id:'wood-sword',name:'旅立ちの木剣',kind:'weapon',price:80,color:0xa98a5e,style:'sword',description:'気軽に持てる、冒険の最初の一本。'},
 {id:'steel-sword',name:'波紋の剣',kind:'weapon',price:240,color:0xbacfd8,style:'sword',description:'海の光を映す銀色の刀身。'},
 {id:'bow',name:'ウィローの弓',kind:'weapon',price:360,color:0x896943,style:'bow',description:'木のしなりを生かした美しい弓。'},
 {id:'trident',name:'潮騒のトライデント',kind:'weapon',price:650,color:0x53b8b8,style:'trident',description:'三つの穂先が光る、海の槍。'},
 {id:'staff',name:'星詠みの杖',kind:'weapon',price:1000,color:0xaa90d2,style:'staff',description:'先端に星の結晶を宿す杖。'},
 {id:'sunblade',name:'暁のレジェンドソード',kind:'weapon',price:1800,color:0xf1ce76,style:'sword',description:'あたたかな光を放つ特別な剣。'}
];
export const ITEM_BY_ID=Object.assign(Object.create(null),Object.fromEntries(ITEMS.map(i=>[i.id,i])));
export function chooseFish(zone,grade='all',random=Math.random){const pool=FISH.filter(f=>f.zone===zone&&(grade==='all'||f.grade===grade));if(!pool.length)throw new Error('釣り場と級が一致しません');let n=random()*pool.reduce((s,f)=>s+RARITIES[f.rarity].weight,0);return pool.find(f=>(n-=RARITIES[f.rarity].weight)<0)||pool.at(-1)}
export function choicesFor(fish,random=Math.random){const rest=FISH.filter(f=>f.id!==fish.id&&f.grade===fish.grade);const options=[fish];while(options.length<4){const i=Math.min(rest.length-1,Math.floor(random()*rest.length));options.push(rest.splice(i,1)[0])}for(let i=options.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[options[i],options[j]]=[options[j],options[i]]}return options.map(f=>({id:f.id,meaning:f.meaning}))}

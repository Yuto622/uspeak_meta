import {FISH} from './fishing-data.js';
export const REGIONS=[
{id:'meadow',name:'ことばの草原',en:'FIRSTLIGHT MEADOW',x:0,z:-170,biome:'grass',color:0x87af77,accent:0xf0ce78,needs:[],hint:'仲間と物語をつなぐ、最初の一歩。森と海を目指そう。'},
{id:'forest',name:'ささやきの森',en:'WHISPERWOOD',x:-165,z:-210,biome:'forest',color:0x477c68,accent:0xb6d795,needs:['meadow'],hint:'大樹と光る草花が見守る、緑の迷い道。'},
{id:'reef',name:'水晶のサンゴ礁',en:'CRYSTAL REEF',x:175,z:-210,biome:'reef',color:0x65b7b9,accent:0xc6eee1,needs:['meadow'],hint:'透き通る入り江と、波に歌うクリスタル。'},
{id:'canyon',name:'夕映えの渓谷',en:'AMBER CANYON',x:-300,z:-50,biome:'canyon',color:0xbf9467,accent:0xf0bc78,needs:['forest'],hint:'赤い岩の間を、あたたかな風が渡る。'},
{id:'snow',name:'白銀の峰',en:'FROSTPEAK',x:320,z:-55,biome:'snow',color:0xbad7df,accent:0x8fc7f2,needs:['reef'],hint:'雪と氷に包まれた、静かな青い世界。'},
{id:'storm',name:'風鳴りの高原',en:'TEMPEST HIGHLANDS',x:90,z:-350,biome:'storm',color:0x8499bb,accent:0xf0df8a,needs:['forest','reef'],hint:'雷を宿す石と、空を泳ぐ仲間たち。'},
{id:'desert',name:'黄金の砂丘',en:'SUNGLASS DUNES',x:-220,z:170,biome:'desert',color:0xd5ba80,accent:0xffdc86,needs:['canyon'],hint:'砂の神殿と小さなオアシスを探そう。'},
{id:'ruins',name:'星時計の遺跡',en:'ASTRAL RUINS',x:300,z:170,biome:'ruins',color:0x939894,accent:0xb2d8bd,needs:['snow'],hint:'古代の門の向こうで、眠る物語が目を覚ます。'},
{id:'moon',name:'月影の庭',en:'MOONLIT GARDEN',x:-85,z:300,biome:'moon',color:0x9f90b9,accent:0xe2bcf2,needs:['storm','desert'],hint:'月の花が咲く、幻想的な夜の庭。'},
{id:'sky',name:'天空の聖域',en:'CELESTIAL SANCTUARY',x:145,z:340,biome:'sky',color:0xc1cba6,accent:0xffe6ab,needs:['moon','ruins'],hint:'旅の先で待つ、光の翼を持つ仲間たち。'}];
export const HUBS=[{id:'willow',name:'Willow Island',en:'WILLOW ISLAND',x:0,z:0,color:0x8da876,accent:0xddc891,hub:true,hint:'英会話クエスト、100種の英単語釣り、魚の買取・装備店。'},{id:'park',name:'U-Speak Roblox テーマパーク',en:'WONDER PARK',x:135,z:0,color:0x799eaf,accent:0xe7c08d,hub:true,hint:'大観覧車・コースター・メリーゴーランドと夜の花火。'},{id:'errand',name:'おつかい島',en:'ERRAND ISLAND',x:-150,z:75,color:0xd8b98a,accent:0xf2d9a0,hub:true,hint:'英語でおつかい。広場で受けて、お店で話して、届けてクリア。'},{id:'school',name:'ことばの学校島',en:'WORD SCHOOL',x:170,z:130,color:0x9cb46e,accent:0xe8c46a,hub:true,hint:'3つの小屋で10問クイズ。やさしい・ふつう・むずかしい。'},{id:'arena',name:'えいごアリーナ島',en:'WORD ARENA',x:-140,z:-110,color:0x9aa88f,accent:0xc9a3d4,hub:true,hint:'英語で答えて わざを出す バトル。らくらく・ふつう・つよい。'},{id:'pet',name:'ペット島',en:'PET ISLAND',x:-30,z:250,color:0xa2bd85,accent:0xe8d4a0,hub:true,hint:'たまごから ペット。ごはんと なでなでで そだつ。'},{id:'ride',name:'のりもの島',en:'RIDE ISLAND',x:210,z:-140,color:0x9ab27a,accent:0xd9c07a,hub:true,hint:'レベルとコインで のりものを 開放。6つの ことばの ゲートを 走る。'}];
// Islands built around one learning activity. They get no treasure chests and no
// companion sanctuary: their ground is taken by the activity's own buildings, and the
// point of going there is the activity. Add a new one here and it stays clean.
export const ACTIVITY_HUBS=new Set(['errand','school','arena','pet','ride']);
export const isActivityHub=id=>ACTIVITY_HUBS.has(id);
export const DESTINATIONS=[...HUBS,...REGIONS];
export const REGION_BY_ID=Object.assign(Object.create(null),Object.fromEntries(DESTINATIONS.map(r=>[r.id,r])));
const names=[
['コノフィ','ポポル','ミドタル','ハルディア','メブリュウ','プルリ','ミミハ','モスタ','ヒラリム','フロレオン'],
['ミツネラ','ヨルホウ','コケロン','ツノモリ','リフドラン','モチモス','シダミミ','ルートン','ハカゼラ','グロウガル'],
['ナミフォ','パルオウル','コーラトル','シェルディ','アクアリュ','ポヨマリン','ラグミミ','クリスタム','リーフィン','ネプティオ'],
['アカネコ','サバクル','イワタル','サンドリア','アンバリュ','キャラプル','スナミル','ロックドム','ヒナカゼ','サンラオン'],
['ユキフォル','シロホル','フロストル','コオリディ','ブリザリュ','スノプル','フワユキ','アイスガム','シラフィン','シロガルディ'],
['ライフォル','テンライル','ボルタル','フウディア','サンダリュ','ビリプル','カミミル','ストムガム','カザフィン','テンペリオン'],
['キンフォ','ホシフク','サバクトル','オアディア','ソラリュウ','アメプル','ヒミミル','ガラストム','サンフィン','ヘリオガル'],
['トキフォ','ルナホル','コダイトル','ルンディア','クロノリュ','ルンプル','ロロミル','モノリタン','トキフィン','アストリオン'],
['ツキフォル','ユメホル','ムーントル','ヨイディア','ルナリュウ','ユメプル','ホシミミ','ネブラドム','ユメフィン','セレナリオン'],
['アマフォル','セイホル','セレストル','ヒカディア','コスモリュ','ヒカプル','アマミミ','エテルガム','アマフィン','エオスレオン']];
export const ARCHETYPES=['fox','owl','turtle','deer','dragon','slime','rabbit','golem','manta','lion'];
const traits=['大きな耳で、小さな声にも気づく','羽ばたきとともに新しいことばを運ぶ','きらめく甲羅に旅の思い出を刻む','角の先に季節の光を灯す','小さな翼で大きな夢を追いかける','うれしいと体がぷるぷる弾む','長い耳で友だちの声を聞き分ける','不器用だけれど頼りになる守り手','風や波に乗って自由に泳ぐ','仲間を守る、誇り高い光の獣'];
export const CREATURES=REGIONS.flatMap((r,i)=>names[i].map((name,j)=>{const word=FISH[i*10+j];return {id:`companion-${i*10+j+1}`,number:i*10+j+1,name,region:r.id,archetype:ARCHETYPES[j],variant:i,slot:j,color:r.color,accent:r.accent,grade:word.grade,word:word.word,meaning:word.meaning,wordId:word.id,rarity:j===9?'LEGEND':j>=7?'RARE':'DISCOVER',lore:r.name+'に暮らし、'+traits[j]+'。',title:['芽吹き','深緑','潮騒','琥珀','雪花','雷光','砂金','星時計','月影','天空'][i]+'の'+['小狐','梟','守り亀','精霊鹿','小竜','しずく','長耳','石の子','風泳ぎ','獅子'][j]}}));
export const CREATURE_BY_ID=Object.assign(Object.create(null),Object.fromEntries(CREATURES.map(c=>[c.id,c])));
export const ENCOUNTER_POSITIONS=Array.from({length:10},(_,i)=>{const a=i/10*Math.PI*2+.2;return {x:Math.cos(a)*23,z:Math.sin(a)*19}});

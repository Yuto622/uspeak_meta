import {CREATURES,REGIONS} from './rpg-data.js';
import {FISH} from './fishing-data.js';

export const ROLES=[
 {id:'spark',name:'ひらめき',icon:'✦',color:'#ffd787',skill:'意味',strong:'echo'},
 {id:'echo',name:'こだま',icon:'◉',color:'#8de6e1',skill:'聞き取り',strong:'verse'},
 {id:'verse',name:'ことのは',icon:'❧',color:'#c5b1ff',skill:'文脈',strong:'spark'}
];
export const FORMS=[{id:'radiant',name:'光彩の姿',detail:'攻めのことばが得意。攻撃 +4',color:0xffd788},{id:'guardian',name:'守護の姿',detail:'落ち着いて支える。最大集中力 +18',color:0x93e8dd}];
export const SEASONS=[{id:'spring',name:'花めく季節',color:0xffbdd5},{id:'summer',name:'きらめく季節',color:0x86edf4},{id:'autumn',name:'実りの季節',color:0xffbd78},{id:'winter',name:'星降る季節',color:0xd1d8ff}];
export const WEATHER=[{id:'clear',name:'晴れ'},{id:'rain',name:'雨'},{id:'mist',name:'霧'},{id:'snow',name:'雪'}];
export const PERSONALITIES=['好奇心いっぱい','のんびり屋','世話好き','慎重派','冒険好き','照れ屋','おしゃべり','頼れる守り手','自由気まま','誇り高い'];
export const COMPANION_META=Object.fromEntries(CREATURES.map(c=>[c.id,{
 role:c.id==='companion-5'?'verse':ROLES[(c.slot+c.variant)%3].id,personality:PERSONALITIES[c.slot],
 phrase:['Let’s explore together!','I’m listening.','Take your time.','Every step counts.','Believe in yourself!','Small words, big dreams.','Can you hear me?','I am here for you.','Go with the flow.','We are stronger together.'][c.slot],
 pitch:180+c.number*7,voice:['sine','triangle','sine','triangle'][c.slot%4],
 condition:c.slot===9?'guardian':c.slot===8?'night':c.slot===7?'weather':'always',
 behavior:['sniff','flutter','sway','bow','stretch','bounce','hop','nod','glide','pride'][c.slot],
} ]));

const stories=[
 ['リオ','風の郵便屋さん','風で散らばった案内状を、一緒に届けてくれる？','Please find my letter.','手紙を見つけてください。','letter',['letter','river','music','window'],'みんなに案内状が届いた。森と海へ続く地図が光りはじめる。'],
 ['セナ','大樹の声','森の道しるべは、優しいお願いにだけ答えるんだ。','Please help me find the path.','道を見つけるのを手伝ってください。','help',['help','eat','sleep','swim'],'大樹が枝を開いた。森の奥に眠る渓谷への道が見える。'],
 ['マリン','珊瑚の合唱','歌を取り戻したサンゴは、遠くの島を教えてくれるよ。','Let’s listen to the sea.','海の音を聞こう。','listen',['listen','borrow','arrive','forget'],'海が歌を取り戻し、氷の峰に向けた新しい航路が現れた。'],
 ['アキ','風車の約束','止まった風車を、旅人への約束で動かそう。','We can travel together.','一緒に旅ができるよ。','together',['together','usually','different','famous'],'約束の風が吹く。砂の向こうに黄金の神殿が姿を見せた。'],
 ['ユキ','凍ったランタン','青いランタンを灯すには、守りたい気持ちが必要なんだ。','We must protect the forest.','森を守らなければならない。','protect',['protect','receive','explain','continue'],'ランタンの光が氷を越え、遺跡への航路を照らした。'],
 ['フウ','嵐の観測所','雲の向こうを知るには、準備と勇気が必要だよ。','Let’s prepare for the journey.','旅の準備をしよう。','prepare',['prepare','believe','discover','promise'],'嵐が静まり、観測所に月の庭からの便りが届いた。'],
 ['サハラ','オアシスの灯','見つけた水を、みんなのために分け合おう。','We can support our community.','地域社会を支えられる。','support',['support','avoid','reduce','increase'],'人々が集まり、砂の町にふたたび灯がともった。'],
 ['トワ','忘れられた時計','時計を動かすのは、違う意見に耳を傾ける力なんだ。','We should consider every idea.','すべての案をよく考えるべきだ。','consider',['consider','achieve','provide','communicate'],'時が動き出した。天空の聖域へ続く印が戻ってきた。'],
 ['ルネ','夢の図書館','正解を急がず、残された証拠から考えてみよう。','We need reliable evidence.','信頼できる証拠が必要だ。','reliable',['reliable','efficient','sustainable','significant'],'夢のページがつながり、夜空に聖域への星座が描かれた。'],
 ['アオ','世界をつなぐ声','違うことばを知るほど、世界は一つにつながっていく。','Together, we can resolve this problem.','一緒なら、この問題を解決できる。','resolve',['resolve','establish','evaluate','negotiate'],'100の仲間と歩む旅は、ここからも続いていく。世界の声が、あなたの声に応えた。']
];
export const CHAPTERS=Object.fromEntries(REGIONS.map((r,i)=>{const [npc,title,intro,sentence,translation,answer,options,ending]=stories[i];return [r.id,{npc,title,intro,sentence,translation,answer,options,ending,seal:['芽吹き','大樹','珊瑚','琥珀','雪灯','雷鳴','太陽','時空','月光','天空'][i],boss:['草原の案内人','大樹の語り部','珊瑚の歌い手','渓谷の旅人','白銀の守り手','嵐の観測者','砂丘の賢者','時を読む司書','月影の夢見人','天空のことば王'][i]}]}));

// Authored, fixed context sentences. Each target appears as a complete word.
const sentences=[
 'I eat an apple every day.','This book is about animals.','Please drink some water.','I walk to school.','You are my friend.','I am happy to see you.','Good morning, everyone!','My family lives here.','This is my house.','I like this music.',
 'The bird is small.','The cloud is white.','I can swim.','Let’s play together.','What do you want to eat?','I read every day.','The garden is beautiful.','A fox is an animal.','Look at that flower.','The weather is nice.',
 'We will arrive soon.','May I borrow your book?','Let’s decide where to go.','I will invite my friend.','I remember your name.','Don’t forget your bag.','We practice English together.','I want to travel abroad.','Japan is my country.','This village is quiet.',
 'We have different ideas.','Water is important.','That singer is famous.','I enjoy this game.','Tomorrow is a holiday.','The doctor works at a hospital.','She is in the kitchen.','Be careful near the river.','Let’s learn together.','I usually walk to school.',
 'We care about the environment.','It was a great experience.','I want to improve my English.','We must protect the forest.','Let’s continue our journey.','I believe in you.','Can you explain this word?','I want to learn a foreign language.','This game is popular.','A ticket is necessary.',
 'Let’s walk instead.','What is your opinion?','I want to learn about your culture.','I work as a volunteer.','You will receive a letter.','I promise to help you.','Let’s discover a new island.','Please prepare for the trip.','Think about the future.','Practice leads to success.',
 'This is a great opportunity.','Caring for pets is a responsibility.','Friends can have a positive influence.','Experience is an advantage.','We communicate in English.','I encourage you to try.','We have a good relationship.','Books give us knowledge.','A positive attitude helps.','Is this seat available?',
 'Exercise can increase your energy.','We should reduce waste.','Try to avoid mistakes.','You can achieve your goal.','We support each other.','Please consider my idea.','Trees provide shade.','Our community is friendly.','This situation is difficult.','Practice builds confidence.',
 'We need sustainable energy.','Every choice has a consequence.','This is a significant discovery.','Everyone can contribute.','We need an alternative.','Let’s evaluate the results.','They want to establish a school.','You have great potential.','We value diversity.','Wildlife conservation is important.',
 'Innovation can change the world.','This method is efficient.','Try a different perspective.','We can negotiate the price.','Education is an investment.','We need more evidence.','Water is essential for life.','It takes approximately ten minutes.','This guide is reliable.','We can resolve this problem.'
];
export const LESSONS=Object.fromEntries(FISH.map((f,i)=>[f.id,{...f,sentence:sentences[i],context:sentences[i].replace(new RegExp('\\b'+f.word+'\\b','i'),'_____')} ]));
export function levelFor(xp){return Math.min(30,1+Math.floor(Math.sqrt(Math.max(0,xp)/20)));}
export function xpForLevel(level){return (level-1)**2*20;}
export function companionStats(c,entry={}){const lv=levelFor(entry.xp||0),role=COMPANION_META[c.id].role;return {level:lv,role,hp:65+lv*5+(entry.form==='guardian'?18:0),attack:16+lv*2+(entry.form==='radiant'?4:0),bond:Math.min(10,1+Math.floor((entry.bond||0)/5))};}
export function masteryRank(card){if(!card)return '未学習';return card.box>=3?'定着中':card.box>=1?'復習中':'練習中';}

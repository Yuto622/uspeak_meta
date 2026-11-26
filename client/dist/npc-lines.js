// 住民の せいかく（8 しゅるい）と ことば（2026-11）。**データだけ**：画面は npc-talk.js、いえは npc-home.js。
//
// ・1 行は `{ en, ja, mood }`。英語は 7 さいが 読める みじかい 文、日本語は ひらがな 多め＋分かち書き。
//   せいかくごとに 語尾が ちがう（げんき＝「〜だよ！」／のんびり＝「〜だねえ」／てれや＝「……」／ものしり＝「〜なんだ」／
//   くいしんぼう＝「〜だなあ」／おしゃれ＝「〜よ・〜ね」／しっかり＝「〜です・ます」／いたずら＝「へへっ・〜だぜ」）。
// ・mood は かおの ひょうじょう：smile / happy / surprised / shy / sleepy / love（＝happy の かお＋♥）。
// ・ことばは 学習の 中身（英語と 日本語を 両方 見せる）＝ lang.json には 入れない。入れ物は translate="no"。
// ・なかよし（❤）の だんかい：0 / 1〜3 / 4〜6 / 7〜9 / 10。ふえる ほど くだけた 言いかたに なる。
const l = (en, ja, mood = 'smile') => ({ en, ja, mood });

export const PERSONALITIES = {
  cheerful: {
    ja: 'げんき', en: 'Cheerful', icon: '☀️',
    greet: [
      l('Hi! Nice to see you!', 'やっほー！ あえて うれしいよ！', 'happy'),
      l('Hello! What a great day!', 'こんにちは！ いい ひ だね！', 'happy'),
      l('Hey! You look happy today!', 'おーい！ きょうも げんき そう だね！'),
      l('Hi, hi! I was waiting for you!', 'やあ やあ！ まってたよ！', 'happy'),
    ],
    time: {
      day: l('The sun is up. Let\'s run!', 'おひさまが でてるよ。はしろう！', 'happy'),
      dusk: l('Look! The sky is orange!', 'みて！ そらが オレンジ だよ！', 'surprised'),
      night: l('I am not sleepy at all!', 'ぜんぜん ねむく ないよ！'),
      dawn: l('Good morning! I am up first!', 'おはよう！ いちばん のりだよ！', 'happy'),
    },
    season: {
      spring: l('Flowers are out! I love spring!', 'おはなが さいたよ！ はる だいすき！', 'happy'),
      summer: l('It is hot! Let\'s swim!', 'あついね！ およごうよ！', 'happy'),
      autumn: l('I can jump in the leaves!', 'おちばに とびこめるよ！', 'happy'),
      winter: l('It is cold! Let\'s make a snowman!', 'さむいね！ ゆきだるま つくろう！'),
    },
    tier: [
      l('I am new friends with everyone!', 'みんなと ともだちに なりたいんだ！'),
      l('I like to talk with you!', 'きみと はなすの、たのしいよ！', 'happy'),
      l('You are my good friend!', 'きみは もう いい ともだち だよ！', 'happy'),
      l('I tell you first when I am happy.', 'うれしい ことは きみに いちばんに いうよ。', 'happy'),
      l('You are my best friend! Yay!', 'きみは いちばんの ともだち！ やったー！', 'love'),
    ],
    thanks: l('Wow! Thank you so much!', 'わあ！ ありがとう！ うれしいよ！', 'happy'),
    favourite: l('My favorite! How did you know?', 'だいすきな やつ！ なんで わかったの？', 'love'),
    invite: l('Come to my house! Let\'s play!', 'うちに おいでよ！ いっしょに あそぼう！', 'happy'),
    welcome: l('Welcome! Come in, come in!', 'いらっしゃい！ はいって はいって！', 'happy'),
    later: l('OK! Come any time!', 'わかった！ いつでも きてね！'),
    home: [
      l('This is my room. It is sunny!', 'ここが ぼくの へや。ひあたり ばつぐん だよ！', 'happy'),
      l('I jump on my bed every day.', 'まいにち ベッドで ジャンプ するんだ。'),
      l('Let\'s play ball in here!', 'ここで ボールあそび しよう！', 'happy'),
    ],
  },
  relaxed: {
    ja: 'のんびり', en: 'Relaxed', icon: '🍃',
    greet: [
      l('Oh, hello. Nice and slow today.', 'やあ、こんにちは。きょうも のんびり だねえ。'),
      l('Hello. The wind feels good.', 'こんにちは。かぜが きもち いいねえ。'),
      l('Ah, it is you. Sit down.', 'ああ、きみかあ。まあ すわりなよ。'),
      l('Hi. No need to hurry.', 'やあ。いそがなくて いいよお。', 'sleepy'),
    ],
    time: {
      day: l('A nap in the sun is the best.', 'ひなたの おひるねは さいこう だねえ。', 'sleepy'),
      dusk: l('The sky is pretty. Let\'s just look.', 'そらが きれい だねえ。ながめて いよう。'),
      night: l('The stars are out. So quiet.', 'ほしが でたねえ。しずか だなあ。', 'sleepy'),
      dawn: l('Morning already? I am still sleepy.', 'もう あさ？ まだ ねむいよお。', 'sleepy'),
    },
    season: {
      spring: l('Spring is warm. I feel sleepy.', 'はるは あったかくて ねむく なるねえ。', 'sleepy'),
      summer: l('I sit in the shade in summer.', 'なつは こかげで すずむんだあ。'),
      autumn: l('I watch the leaves fall. Slowly.', 'おちばを みてるんだ。ゆっくり とねえ。'),
      winter: l('Hot tea is nice in winter.', 'ふゆは あったかい おちゃが いいねえ。', 'happy'),
    },
    tier: [
      l('Take your time here.', 'ゆっくり して いってねえ。'),
      l('It is nice to sit with you.', 'きみと いると ほっと するねえ。'),
      l('You can nap next to me.', 'となりで おひるね して いいよお。', 'happy'),
      l('Time is slow with you. I like it.', 'きみと いると じかんが ゆっくりで すきだなあ。', 'happy'),
      l('You are my best friend. Stay long.', 'いちばんの ともだち だねえ。ずっと いてよ。', 'love'),
    ],
    thanks: l('Oh, for me? Thank you.', 'おや、ぼくに？ ありがとねえ。', 'happy'),
    favourite: l('Ah, I love this one. So happy.', 'ああ、これ だいすき なんだあ。しあわせ。', 'love'),
    invite: l('Come to my house. We can rest.', 'うちに おいでよ。のんびり しようねえ。', 'happy'),
    welcome: l('Oh, welcome. Make yourself at home.', 'やあ、いらっしゃい。ゆっくり してねえ。'),
    later: l('Sure. Any time is fine.', 'いいよお。いつでも いいからねえ。'),
    home: [
      l('My sofa is very soft.', 'うちの ソファは ふかふか だよお。', 'happy'),
      l('I water my plants every day.', 'まいにち はっぱに みずを あげるんだあ。'),
      l('Shall we have some tea?', 'おちゃでも のむかい？'),
    ],
  },
  shy: {
    ja: 'てれや', en: 'Shy', icon: '🌸',
    greet: [
      l('Oh... hello.', 'あ……こんにちは。', 'shy'),
      l('Um... hi. You came.', 'えっと……きて くれたんだ。', 'shy'),
      l('H-hello. Nice to see you.', 'こ、こんにちは。あえて うれしい……な。', 'shy'),
      l('Oh! It is you. I am glad.', 'あっ、きみ……よかった。', 'surprised'),
    ],
    time: {
      day: l('It is bright... I like the shade.', 'まぶしいね……こかげが すき。', 'shy'),
      dusk: l('The sky is pink... so pretty.', 'そらが ピンク……きれい。'),
      night: l('It is dark... can you stay?', 'くらいね……そばに いて くれる？', 'shy'),
      dawn: l('Good morning... you are early.', 'おはよう……はやい ね。'),
    },
    season: {
      spring: l('I like small flowers... in spring.', 'はるの……ちいさい おはなが すき。'),
      summer: l('Summer is loud... but fun.', 'なつは にぎやか……でも たのしい。', 'shy'),
      autumn: l('The leaves are red... like my face.', 'はっぱが あかい……わたしの かお みたい。', 'shy'),
      winter: l('My hands are cold... and yours?', 'てが つめたいの……きみは？', 'shy'),
    },
    tier: [
      l('Um... I am not good at talking.', 'えっと……はなすの、にがて なの。', 'shy'),
      l('Thank you... for talking to me.', 'はなして くれて……ありがとう。', 'shy'),
      l('I can talk a little more now.', 'すこし……はなせる ように なったよ。'),
      l('I think about you... every day.', 'まいにち……きみの こと かんがえるの。', 'shy'),
      l('You are my best friend... really.', 'いちばんの ともだち……ほんとう だよ。', 'love'),
    ],
    thanks: l('For me...? Thank you...', 'わたしに……？ ありがとう……。', 'shy'),
    favourite: l('I love this...! You remembered.', 'これ……だいすき！ おぼえてて くれたの。', 'love'),
    invite: l('Um... will you come to my house?', 'あの……うちに きて くれる？', 'shy'),
    welcome: l('Oh... welcome. Please come in.', 'あ……いらっしゃい。どうぞ……。', 'shy'),
    later: l('OK... I will wait.', 'うん……まってる ね。', 'shy'),
    home: [
      l('I grow flowers... by the window.', 'まどの そばで……おはなを そだててるの。'),
      l('My room is small... but warm.', 'ちいさい へや だけど……あったかいの。', 'shy'),
      l('I am happy... you are here.', 'きて くれて……うれしい。', 'love'),
    ],
  },
  bookish: {
    ja: 'ものしり', en: 'Bookish', icon: '📚',
    greet: [
      l('Hello. Did you read a book today?', 'やあ。きょうは 本を よんだ かい？'),
      l('Oh, hello. I have a fun fact.', 'おや、こんにちは。おもしろい はなしが あるんだ。'),
      l('Good to see you. Let me think...', 'あえて よかった。ふむ、そう だなあ……。', 'sleepy'),
      l('Hello! I learned a new word.', 'こんにちは！ あたらしい ことばを おぼえたんだ。', 'happy'),
    ],
    time: {
      day: l('The sun is a big star, you know.', 'たいようは 大きな ほし なんだ。'),
      dusk: l('The sky turns red at dusk. Why?', 'ゆうがたは そらが あかい。なぜ だと おもう？', 'sleepy'),
      night: l('I can see many stars at night.', 'よるは ほしが たくさん 見えるんだ。'),
      dawn: l('Birds sing first in the morning.', 'あさは とりが いちばんに うたうんだ。'),
    },
    season: {
      spring: l('Bees work hard in spring.', 'はるは ハチが よく はたらくんだ。'),
      summer: l('Days are long in summer.', 'なつは ひるが ながいんだ。'),
      autumn: l('Leaves turn red when it gets cold.', 'さむく なると はっぱは あかく なるんだ。'),
      winter: l('No two snowflakes are the same.', 'ゆきの かたちは ぜんぶ ちがうんだ。', 'surprised'),
    },
    tier: [
      l('Books have many answers.', '本には こたえが たくさん あるんだ。'),
      l('You ask good questions.', 'きみは いい しつもんを するね。'),
      l('I want to show you my best book.', 'いちばん すきな 本を 見せたいな。', 'happy'),
      l('I learn new things from you, too.', 'きみからも いろいろ おそわるよ。', 'happy'),
      l('You are my best friend. That is a fact.', 'きみは いちばんの ともだち。これは たしか なんだ。', 'love'),
    ],
    thanks: l('For me? Thank you. How kind.', 'ぼくに？ ありがとう。やさしいんだね。', 'happy'),
    favourite: l('My favorite! How did you find out?', 'だいすきな ものだ！ どうやって しらべたの？', 'surprised'),
    invite: l('Come to my house. I have many books.', 'うちに おいで。本が たくさん あるんだ。', 'happy'),
    welcome: l('Welcome. Mind the books on the floor.', 'いらっしゃい。ゆかの 本に きを つけてね。'),
    later: l('I see. I will read and wait.', 'そうか。本を よんで まってるよ。'),
    home: [
      l('I have one hundred books here.', 'ここには 本が 百さつ あるんだ。', 'happy'),
      l('This clock is very old.', 'この とけいは とても ふるいんだ。'),
      l('Pick any book you like.', 'すきな 本を えらんで いいよ。'),
    ],
  },
  foodie: {
    ja: 'くいしんぼう', en: 'Foodie', icon: '🍩',
    greet: [
      l('Hi! Did you eat yet?', 'やあ！ もう ごはん たべた？'),
      l('Hello! I smell something good.', 'こんにちは！ いい においが するなあ。', 'happy'),
      l('Oh, hi! I am a little hungry.', 'おっ、やあ！ ちょっと おなか すいたなあ。'),
      l('Hi! What is your favorite food?', 'やっほー！ すきな たべものは なに？', 'happy'),
    ],
    time: {
      day: l('It is lunch time! Yum!', 'おひるごはんの じかん だなあ！', 'happy'),
      dusk: l('What is for dinner tonight?', 'こんやの ごはんは なにかなあ。', 'sleepy'),
      night: l('A snack at night is the best.', 'よるの おやつは さいこう だなあ。', 'happy'),
      dawn: l('I want eggs and toast.', 'たまごと トーストが たべたいなあ。'),
    },
    season: {
      spring: l('Strawberries are sweet in spring.', 'はるは いちごが あまいんだなあ。', 'happy'),
      summer: l('Ice cream! I want ice cream!', 'アイス！ アイスが たべたいなあ！', 'happy'),
      autumn: l('Autumn has so much good food.', 'あきは おいしい ものが いっぱい だなあ。', 'happy'),
      winter: l('Hot soup makes me warm.', 'あつい スープで ぽかぽか だなあ。'),
    },
    tier: [
      l('Food makes everyone happy.', 'たべものは みんなを しあわせに するなあ。'),
      l('Let\'s eat together some time.', 'こんど いっしょに たべようよ。'),
      l('I saved a cookie for you.', 'きみに クッキーを とって おいたよ。', 'happy'),
      l('Food is better when I eat with you.', 'きみと たべると もっと おいしいなあ。', 'happy'),
      l('I will share my last donut with you!', 'さいごの ドーナツも きみと はんぶんこ！', 'love'),
    ],
    thanks: l('Food! Thank you! Yum, yum!', 'たべもの だ！ ありがとう！ もぐもぐ。', 'happy'),
    favourite: l('My favorite! This is the best day!', 'だいこうぶつ！ きょうは さいこうの ひ だなあ！', 'love'),
    invite: l('Come to my house! I will cook!', 'うちに おいでよ！ ごちそう するよ！', 'happy'),
    welcome: l('Welcome! Are you hungry?', 'いらっしゃい！ おなか すいてる？', 'happy'),
    later: l('OK! I will keep it warm.', 'わかった！ あたためて まってるよ。'),
    home: [
      l('My table is always full of food.', 'うちの テーブルは いつも ごちそう だよ。', 'happy'),
      l('The pot is hot. Soup is ready soon.', 'おなべが あつい。もうすぐ スープが できるよ。'),
      l('Eat as much as you like!', 'すきな だけ たべてね！', 'happy'),
    ],
  },
  stylish: {
    ja: 'おしゃれ', en: 'Stylish', icon: '🎀',
    greet: [
      l('Hello! You look nice today.', 'こんにちは。きょうも すてき ね。', 'happy'),
      l('Oh, hi! I like your outfit.', 'あら、その ふく いいわね。'),
      l('Hello, hello. How do I look?', 'ごきげんよう。きょうの わたし、どう？'),
      l('Hi! That color is good on you.', 'あら！ その いろ、にあってるわ。', 'happy'),
    ],
    time: {
      day: l('A hat is a must in the sun.', 'ひざしの ひは ぼうしが だいじ よ。'),
      dusk: l('The sunset is the best color.', 'ゆうやけは いちばん きれいな いろ ね。', 'happy'),
      night: l('Stars are like small jewels.', 'ほしは ちいさな ほうせき みたい ね。'),
      dawn: l('I pick my clothes every morning.', 'まいあさ ふくを えらぶのが たのしみ なの。'),
    },
    season: {
      spring: l('Pink is the color of spring.', 'はるの いろは ピンク よ。', 'happy'),
      summer: l('A big hat is cool in summer.', 'なつは 大きな ぼうしが すずしいわ。'),
      autumn: l('I love my red scarf in autumn.', 'あきは あかい マフラーが おきにいり。'),
      winter: l('A warm coat can be cute, too.', 'あったかい コートも かわいく きるの よ。'),
    },
    tier: [
      l('Nice clothes make a nice day.', 'すてきな ふくは すてきな 一日を つくるの よ。'),
      l('You have good taste.', 'あなた、センスが いいわね。'),
      l('Let\'s go shopping together.', 'こんど いっしょに おかいもの しましょ。', 'happy'),
      l('I will pick a hat for you.', 'あなたに ぼうしを えらんで あげるわ。', 'happy'),
      l('We are best friends. We match!', 'わたしたち、いちばんの ともだち。おそろい ね！', 'love'),
    ],
    thanks: l('Oh, how nice! Thank you.', 'まあ、すてき！ ありがとう。', 'happy'),
    favourite: l('I love this! You know me so well.', 'これ だいすき なの！ よく わかってるわね。', 'love'),
    invite: l('Come to my house. I will show you my clothes.', 'うちに いらっしゃい。ふくを 見せて あげるわ。', 'happy'),
    welcome: l('Oh, welcome. Please come in.', 'あら、いらっしゃい。さあ どうぞ。', 'happy'),
    later: l('All right. I will be here.', 'わかったわ。まってるわね。'),
    home: [
      l('This mirror is my favorite thing.', 'この かがみは おきにいり なの。'),
      l('I have ten hats. Want to try one?', 'ぼうしが 十こ あるの。かぶって みる？', 'happy'),
      l('I change my room color each season.', 'きせつで へやの いろを かえるの よ。'),
    ],
  },
  earnest: {
    ja: 'しっかり', en: 'Earnest', icon: '✅',
    greet: [
      l('Hello. Let\'s do our best today.', 'こんにちは。きょうも がんばりましょう。'),
      l('Good day. You are on time.', 'こんにちは。じかん ぴったり ですね。', 'happy'),
      l('Hello. Did you finish your homework?', 'こんにちは。しゅくだいは おわりましたか？'),
      l('Hello. I am glad to see you.', 'こんにちは。あえて うれしいです。', 'happy'),
    ],
    time: {
      day: l('I clean my room at noon.', 'おひるに へやを そうじ します。'),
      dusk: l('It is time to go home soon.', 'そろそろ かえる じかん ですね。'),
      night: l('I go to bed at nine.', 'よるは 九じに ねます。', 'sleepy'),
      dawn: l('I get up early every day.', 'まいにち はやおき して います。', 'happy'),
    },
    season: {
      spring: l('Spring is a new start.', 'はるは あたらしい スタート です。'),
      summer: l('Drink water on hot days.', 'あつい ひは みずを のみましょう。'),
      autumn: l('Autumn is good for reading.', 'あきは 本を よむのに いい きせつ です。'),
      winter: l('Wash your hands in winter.', 'ふゆは てを よく あらいましょう。'),
    },
    tier: [
      l('I keep my promises.', 'やくそくは かならず まもります。'),
      l('You work hard. I like that.', 'あなたは がんばりやさん ですね。'),
      l('I can help you any time.', 'いつでも おてつだい しますよ。', 'happy'),
      l('I trust you very much.', 'あなたを とても しんじて います。', 'happy'),
      l('You are my best friend. I promise.', 'あなたは いちばんの ともだち です。やくそく します。', 'love'),
    ],
    thanks: l('Thank you very much. I will eat it well.', 'ありがとう ございます。だいじに たべます。', 'happy'),
    favourite: l('This is my favorite! I am so glad.', 'だいすきな もの です！ とても うれしいです。', 'love'),
    invite: l('Please come to my house. It is clean.', 'うちに きて ください。きれいに して あります。', 'happy'),
    welcome: l('Welcome. Please take off your shoes.', 'いらっしゃい。くつは そろえて くださいね。'),
    later: l('I see. I will wait for you.', 'わかりました。おまち して います。'),
    home: [
      l('I make my bed every morning.', 'まいあさ ベッドを きれいに します。'),
      l('My desk is for study.', 'この つくえで べんきょう します。'),
      l('Everything has its place.', 'ものは きまった ばしょに おきます。', 'happy'),
    ],
  },
  playful: {
    ja: 'いたずら', en: 'Playful', icon: '😜',
    greet: [
      l('Hehe! Did I surprise you?', 'へへっ！ びっくり した？', 'happy'),
      l('Hey! Catch me if you can!', 'おーい！ つかまえて みな！', 'happy'),
      l('Boo! Just kidding!', 'ばあ！ なーんてね！', 'surprised'),
      l('Yo! I have a secret.', 'よっ！ ひみつが あるんだぜ。'),
    ],
    time: {
      day: l('Let\'s play tag! You are it!', 'おにごっこ しようぜ！ きみが おに！', 'happy'),
      dusk: l('My shadow is so long! Look!', 'かげが ながーい！ 見て みて！', 'surprised'),
      night: l('Boo! Did you think I was a ghost?', 'ばあ！ おばけだと おもった？', 'happy'),
      dawn: l('I hid your shoes. Just kidding!', 'くつを かくしたぜ。うそ うそ！', 'happy'),
    },
    season: {
      spring: l('I put a flower on my head. Funny?', 'あたまに おはなを のせたぜ。おもしろい？', 'happy'),
      summer: l('Water fight! Ready, go!', 'みずでっぽう だ！ よーい、どん！', 'happy'),
      autumn: l('I made a big pile of leaves!', 'おちばの 山を つくったぜ！'),
      winter: l('Snowball! Watch out! Hehe.', 'ゆきだま だ！ よけろー！ へへっ。', 'happy'),
    },
    tier: [
      l('I like fun tricks. Hehe.', 'たのしい いたずらが すきなんだ。へへっ。'),
      l('You are fun to play with!', 'きみと あそぶの、おもしろいぜ！', 'happy'),
      l('I will show you my secret place.', 'ひみつの ばしょ、おしえて やるよ。'),
      l('I never play tricks on you. Maybe.', 'きみには いたずら しないぜ。たぶんね。', 'happy'),
      l('Best friends! That is no joke!', 'いちばんの ともだち！ これは うそじゃ ないぜ！', 'love'),
    ],
    thanks: l('For me? No trick? Thanks!', 'おれに？ ひっかけじゃ ない？ サンキュー！', 'surprised'),
    favourite: l('Whoa! My favorite! You got me!', 'うわっ！ だいすきな やつ！ やられたぜ！', 'love'),
    invite: l('Come to my house! I have toys!', 'うちに こいよ！ おもちゃが いっぱい だぜ！', 'happy'),
    welcome: l('Welcome! Watch your step. Hehe.', 'いらっしゃい！ あしもとに きを つけな。へへっ。', 'happy'),
    later: l('OK! I will set a trap. Kidding!', 'オッケー！ わなを しかけて まってるぜ。うそ！', 'happy'),
    home: [
      l('These blocks are my castle.', 'この つみきは おれの しろ だぜ。', 'happy'),
      l('Do not open that box. Hehe.', 'その はこは あけちゃ だめ だぜ。へへっ。'),
      l('Let\'s play ball in the room!', 'へやで ボールあそび しようぜ！', 'happy'),
    ],
  },
};

export const PERSONALITY_IDS = Object.keys(PERSONALITIES);

function hash(text) { let h = 2166136261; for (const c of String(text)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
// たね（または key）から せいかくを 決める。同じ 人は いつも 同じ。
export function personalityOf(seed, given = '') {
  if (given && PERSONALITIES[given]) return given;
  return PERSONALITY_IDS[(hash(seed) >>> 5) % PERSONALITY_IDS.length];
}
// ❤ の 数 → だんかい（0〜4）。
export const tierOf = (hearts = 0) => (hearts >= 10 ? 4 : hearts >= 7 ? 3 : hearts >= 4 ? 2 : hearts >= 1 ? 1 : 0);

// その せいかくの、いまの 時間・季節・なかよしに 合う ことば。favouriteKnown ＝ だいすきな たべものを もう 当てた。
export function linesFor({ personality, hearts = 0, phase = 'day', season = 'spring', favouriteKnown = false } = {}) {
  const p = PERSONALITIES[personality] || PERSONALITIES.cheerful;
  const tier = tierOf(hearts);
  return {
    greet: p.greet,
    time: p.time[phase] || p.time.day,
    season: p.season[season] || p.season.spring,
    tier: p.tier[tier],
    // なかよしに なったら、前の だんかいの ことばも まざる（話す たびに かわる）。
    small: [p.time[phase] || p.time.day, p.season[season] || p.season.spring, p.tier[tier], ...(tier > 0 ? [p.tier[tier - 1]] : [])],
    thanks: p.thanks,
    favourite: favouriteKnown ? p.favourite : p.thanks,
    invite: p.invite, welcome: p.welcome, later: p.later, home: p.home,
  };
}

// 1 回の 会話（2〜4 行）。turn ＝ その 人と 話した 回数（0 から）＝ 同じ 人でも 毎回 ちがう ならび。
// extra ＝ その 人だけの ことば（ひろばの 人の `lines`）。あれば 2 行目に まぜる。
export function conversation({ personality, hearts = 0, phase = 'day', season = 'spring', turn = 0, extra = [] } = {}) {
  const L = linesFor({ personality, hearts, phase, season });
  const out = [L.greet[turn % L.greet.length]];
  const own = (extra || []).filter((x) => x && (x.en || x.ja)).map((x) => ({ mood: 'smile', ...x }));
  const pool = L.small;
  const want = 2 + (turn % 3);                 // 2・3・4 行
  if (own.length) out.push(own[turn % own.length]);
  for (let i = 0; out.length < want && i < pool.length; i += 1) {
    const pick = pool[(turn + i) % pool.length];
    if (!out.includes(pick)) out.push(pick);
  }
  return out;
}

// いえの 中の 会話（1〜2 行）。
export function homeTalk({ personality, turn = 0, hearts = 0 } = {}) {
  const p = PERSONALITIES[personality] || PERSONALITIES.cheerful;
  const out = [p.home[turn % p.home.length]];
  if (turn % 2 === 1) out.push(p.tier[tierOf(hearts)]);
  return out;
}

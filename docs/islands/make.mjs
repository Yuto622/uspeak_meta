// 全島リストの PDF を つくる： node docs/islands/make.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const P = '⭐';
const groups = [
  ['はじまりの 島', [
    ['1', 'メインの島', 'Main Island', '', ['入ると さいしょに 立つ ホームの 島', '英単語ハウス 3けん（4たくの 単語クイズ・SUPER EASY / EASY）', 'つり場と、英検の 級ごとの さんばし（5級〜準1級）', '屋台 3つ（くだもの・スイーツ・のみもの）で たべものを かう', 'ふくや・ブロックや・いえの おみせ・ぶきや（100本）・さかなの かいとりや', '英会話の お店 5けん（けいたいや・でんきや・ほんや・ピザや・バーガーや）' + P, 'ほかの 島への ゲート、2D の しまの ちず']],
    ['2', 'U-Speak島', 'U-Speak Island', '', ['メインの島から 木の 橋で 歩いて わたれる', '英語の クイズに こたえる さかなつり（100匹の ずかん）', 'パンや・図書室・やどや などの 建物に 入れる', '公園の ロビー（なかまの 回復・魔法の 杖・伝説の 書）', 'レッスン、ひるよるの 時計と BGM']],
  ]],
  ['学ぶ 島', [
    ['3', 'ABC の 島', 'ABC Island', '', ['もじの なまえと おと（フォニックス）', '見て きく → うた → きいて えらぶ → 絵を えらぶ', '3もじを つなげて よむ、2もじの おと、ながい ぼいん、つみきで つづる', '8わりで つぎへ、にがての ふくしゅう']],
    ['4', 'よみもの島', 'Book Island', '', ['えほん 36さつ（12だんかい × 3）', 'きく → よむ → こえに だす → クイズ 5もん', 'ことばを おすと 発音と いみ', '先生が えほんを 宿題に できる']],
    ['5', 'ことばの学校島', 'Word School Island', '', ['3つの 小屋の 単語クイズ（やさしい〜むずかしい）', 'ことばの ジム（きく・かく・はなす、110語）']],
    ['6', 'しゅくだい島', 'Homework Island', '', ['先生が くばった 宿題を 7つの 形で とく（えらぶ・つづり・きいて えらぶ・タイピング・せんつなぎ・ならべかえ・あなうめ）', 'とちゅうから つづけられる、まちがえた ところを やりなおせる', '結果は 保護者レポートに のる']],
    ['7〜13', '英検の島（5級・4級・3級・準2級・2級・準1級・1級）', 'Eiken Islands', P, ['4つの 館＝4技能（よむ・きく・かく・はなす）', 'めんせつの間（二次試験の 練習。音読 → 質問、ウーピーが 面接官）', 'はんていの きびしさは 先生が 3だんかいで きめる', '7つとも 同じ 間取りで、英語と 見た目だけ かわる']],
    ['14', '英会話島', 'Conversation Island', P, ['4つの 家＝8つの 場面で、ウーピーと AI英会話', 'マイクで はなす、こたえの れい、ゆっくり、いみ', 'おわりに ふりかえり（言えた 文・もっと いい 言いかた）']],
    ['15', 'おつかい島', 'Errand Island', '', ['広場で うける → お店で 英語で はなす → とどける、の 3だんかい', 'とどけたら コイン']],
  ]],
  ['あそぶ 島', [
    ['16', 'つり島', 'Fishing Island', '', ['いけ（5級）・かわ（4級）・うみ（3級）の 3つの 水辺', '水辺に 立つと さおを なげ、7つの 形の 問題に 正解で つれる', 'さかな 70しゅるいの ずかん、うる']],
    ['17', 'えいごアリーナ島', 'Word Arena Island', '', ['3D の 対戦画面で マスターウーピーと バトル', '強い わざは 英語の 問題に 正解しないと 出ない', '道場（つった さかなが わざに なる）']],
    ['18', 'ペット島', 'Pet Island', '', ['たまごを かえす、ごはん、なでる', 'ペット（こいぬ・こねこ・うさぎ・かえる・パンダ・きつね）が どの 島でも 横を 歩く']],
    ['19', 'のりもの島', 'Ride Island', '', ['ガレージで のりものを かう', 'グランプリ（クラスの みんなと ライバルで 3しゅうの レース、📦は 英語の 3たく、正解で 加速）', 'AURORA KART（べつの カートゲーム。うんてんしゅは じぶんの アバター）']],
    ['20', 'ぼくじょう島', 'Farm Island', '', ['たねを かう・うえる・水やり・しゅうかく・出荷・料理', 'どうぶつの せわ（エサ・みず・ブラシ）', 'どの さぎょうも 英語の 問題に こたえて する', '季節・天気・おまつり・住人との なかよし度']],
    ['21', 'ミニゲーム島', 'Minigame Island', '', ['PUYO U-SPEAK（ぷよ × 英単語）', 'えいご スイカゲーム']],
    ['22', 'テーマパーク', 'Wonder Park', '', ['メリーゴーランド・かんらんしゃ・ジェットコースター（のる たびに コイン）']],
  ]],
  ['つくる・かざる 島', [
    ['23', 'まちづくり島', 'Town Island', '', ['かぐを かって じぶんの へやに おく', 'ブロックを かって ひろばに 建てる', 'BLOCKWILD（ブロックの 世界。クラスで 同じ 世界に 入れる）']],
    ['24', '土地島', 'Land Island', '', ['ふどうさんで じぶんだけの 島を かう（6だんかい × 2しゅるい、12の 世界）', '船で じぶんの 島へ、みんなの 島を 見に いける']],
    ['25', 'きせかえ島', 'Dress-up Island', '', ['5つの 店（ぼうし・めがね・かばん・アクセサリー・すがた）', 'かった ものは クラスの みんなに 見える']],
  ]],
  ['はなす 島', [
    ['26', 'みんなで はなす しま', 'Talk Island', P, ['島ぜんたいが 1つの 通話（100人まで）', 'ビデオ通話、画面共有、定型文の メッセージ', 'ブースは 6人までの 小さい 部屋']],
  ]],
];
const card = ([n, ja, en, prem, items]) => `<section class="card"><h3><span class="no">${n}</span>${ja}${prem ? ' <span class="prem">⭐ プレミアム</span>' : ''}<small>${en}</small></h3><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul></section>`;
const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><style>
@page { size: A4; margin: 16mm 14mm; }
body { font-family: "Noto Sans CJK JP", "Noto Sans JP", sans-serif; color: #1b3a2f; font-size: 10.5pt; line-height: 1.6; margin: 0; }
.cover { background: #1b3a2f; color: #fff; border-radius: 14px; padding: 18px 22px; margin-bottom: 14px; }
.cover h1 { margin: 0; font-size: 22pt; letter-spacing: .02em; } .cover h1 span { color: #e27a2d; }
.cover p { margin: 6px 0 0; font-size: 10.5pt; color: #d8e6dd; }
h2 { font-size: 13.5pt; margin: 16px 0 8px; padding: 4px 12px; border-left: 6px solid #e27a2d; background: #f4efe4; border-radius: 0 8px 8px 0; break-after: avoid; }
.card { border: 1px solid #d9d2c2; border-radius: 10px; padding: 8px 14px 9px; margin: 0 0 8px; break-inside: avoid; }
.card h3 { margin: 0 0 3px; font-size: 12pt; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.card h3 small { font-weight: 500; color: #6b7a72; font-size: 9pt; margin-left: auto; }
.no { background: #1b3a2f; color: #fff; border-radius: 999px; padding: 0 9px; font-size: 9.5pt; }
.prem { background: #fff1dc; color: #b85c12; border: 1px solid #e27a2d; border-radius: 999px; padding: 0 8px; font-size: 8.5pt; font-weight: 700; }
ul { margin: 0; padding-left: 1.3em; } li { margin: 1px 0; }
.regions { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 6px 0; }
.regions span { background: #eef5f0; border-radius: 8px; padding: 5px 4px; text-align: center; font-size: 9.5pt; font-weight: 600; }
.note { font-size: 9pt; color: #6b7a72; margin-top: 12px; }
</style><body>
<div class="cover"><h1>U-Speak <span>Web版</span>　全島リスト</h1><p>26の島 と ぼうけんの ちいき 10こ。⭐ は プレミアム（名簿で プレミアムが オンの 人だけ 入れる）。</p></div>
${groups.map(([t, list]) => `<h2>${t}</h2>${list.map(card).join('')}`).join('')}
<h2>ぼうけんの ちいき（10こ）</h2>
<div class="regions">${['ことばの草原', 'ささやきの森', '水晶のサンゴ礁', '夕映えの渓谷', '白銀の峰', '風鳴りの高原', '黄金の砂丘', '星時計の遺跡', '月影の庭', '天空の聖域'].map((r) => `<span>${r}</span>`).join('')}</div>
<section class="card"><ul><li>なかまの モンスターを つかまえる・そだてる、ずかん</li><li>物語、ちいきの リーダーと リーグ</li><li>宝箱 36こと 3しゅるいの 鍵</li></ul></section>
<h2>どの 島でも つかえる もの</h2>
<section class="card"><ul><li>しまの ちず（えらぶと その 島の だいひょうの 場所が すぐ ひらく）</li><li>コイン・マイページ（レベル、5技能の チャート）</li><li>ロードマップ（A・B・C・1〜9 の 12だんかい、英検の 合格見込み）</li><li>ランキング、たんごちょう、もちもの、にがて単語の ふくしゅう</li><li>チャット、先生の 授業モード（あつめる・とめる・ふくしゅう・いっしょに いどう）</li></ul></section>
<p class="note">U-Speak Lab ／ 2026年11月 時点の Web版（uspeak-multiplayer.fly.dev）の 内容です。</p>
</body></html>`;
writeFileSync(join(here, 'uspeak-islands.html'), html);
const b = await chromium.launch(); const p = await b.newPage();
await p.setContent(html, { waitUntil: 'load' });
await p.pdf({ path: join(here, 'U-Speak_Web版_全島リスト.pdf'), format: 'A4', printBackground: true });
await p.screenshot({ path: process.argv[2] || join(here, 'preview.png'), fullPage: false });
await b.close();

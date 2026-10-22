// LINE の 下の メニュー（リッチメニュー）と、その 返事。
//
// 保護者が 自分で 見に くる 機能だけ（こちらから 送る 回数は ふやさない）。返事は Reply API なので **通数に かぞえられない＝無料**。
// ボタンは 6 つ（v2）：📊 今週の がんばり・🗺 ロードマップ・📚 いまの 宿題・🏠 おうちで 1 分・🎮 ゲーム（URL）・⚙ とどく 回数。
// とどく 回数は「教室の 設定どおり／月に 1 回だけ／とめる」の 3 つ（ふやすは なし）。service.js の wantsNow() が 配信で まもる。
// 中身（だれの 子か・宿題・段階）は service.js が あつめて わたす。ここは 文を 作るだけ（テストしやすい ように）。
import { roadmapFlex } from './line.js';

export const PREFS = {
  class: '教室の 設定どおり',
  monthly: '月に 1 回だけ',
  stop: 'とめる',
};
const FREQ_JA = { weekly: '毎週', biweekly: '2 週に 1 回', monthly: '毎月' };

// リッチメニューの 形（richmenu-setup.js が 起動で LINE に 登録する）。画像は 2500×1686（大）。2026-10 v2：
//   上：📊 今週の がんばり（大）｜🗺 ロードマップ
//   下：📚 宿題｜🏠 おうちで 1 分｜🎮 そのまま あそぶ（全画面の やりかた＋PDF・動画＋Safari で ひらく）｜⚙ とどく 回数
// 続けて もらう（LTV）ための 形：毎週 ひらく 理由（がんばり）と、おうちで 声を かける きっかけ（1 分）と、そのまま 遊べる 入口を 大きく。
// 「回数」は 目立たせない（止める 人を ふやさない）が、かならず 置く（止められない メニューは 信用を なくす）。
export const GAME_URL = (process.env.REPORT_BASE_URL || 'https://uspeak-multiplayer.fly.dev').replace(/\/+$/, '');
// 「そのまま あそぶ」は すぐ ひらかず、全画面の やりかたを 先に 出す（LINE の 中の ブラウザでは バーが のこり、ホーム画面にも 追加できない）。
// PDF と 動画は ゲームと 同じ サーバー（client/dist/assets/app）。ゲームは ?openExternalBrowser=1 で LINE の 外（Safari）で ひらく。
export const FULLSCREEN = {
  pdf: `${GAME_URL}/assets/app/iphone-fullscreen-guide.pdf`,
  video: `${GAME_URL}/assets/app/add-to-home-safari.mp4`,
  videoChrome: `${GAME_URL}/assets/app/add-to-home.mp4`,
  play: `${GAME_URL}/?openExternalBrowser=1`,
};
const W = 2500; const H = 1686; const TOP = 900;
export const MENU_TILES = [
  { kind: 'report', label: '📊 今週の がんばり', bounds: { x: 0, y: 0, width: 1666, height: TOP } },
  { kind: 'roadmap', label: '🗺 ロードマップ', bounds: { x: 1666, y: 0, width: W - 1666, height: TOP } },
  { kind: 'homework', label: '📚 いまの 宿題', bounds: { x: 0, y: TOP, width: 625, height: H - TOP } },
  { kind: 'home', label: '🏠 おうちで 1 分', bounds: { x: 625, y: TOP, width: 625, height: H - TOP } },
  { kind: 'game', label: '🎮 ゲームを ひらく', bounds: { x: 1250, y: TOP, width: 625, height: H - TOP } },
  { kind: 'pref', label: '⚙ とどく 回数', bounds: { x: 1875, y: TOP, width: 625, height: H - TOP } },
];
export const RICH_MENU = {
  size: { width: W, height: H },
  selected: true,
  name: 'uspeak-parent-v3',
  chatBarText: 'U-Speak メニュー',
  areas: MENU_TILES.map(({ kind, label, bounds }) => ({
    bounds,
    action: { type: 'postback', data: `menu=${kind}`, displayText: label.replace(/^\S+\s/, '') },
  })),
};

// Webhook の できごと → { kind, pref? } か null。メニューの postback と、同じ ことばの メッセージ（打った とき）。
export function menuAction(e) {
  if (e?.type === 'postback') {
    const q = new URLSearchParams(String(e.postback?.data || ''));
    const kind = q.get('menu');
    if (kind === 'pref' && q.get('set') && PREFS[q.get('set')]) return { kind: 'pref', pref: q.get('set') };
    if (['report', 'homework', 'roadmap', 'home', 'game', 'pref'].includes(kind)) return { kind: kind === 'pref' ? 'ask-pref' : kind };
    return null;
  }
  if (e?.type === 'message' && e.message?.type === 'text') {
    const t = String(e.message.text || '').trim();
    if (t.length > 20) return null; // ふつうの 相談の 文には こたえない（教室の 人が 返す）
    if (/レポート|れぽーと/.test(t)) return { kind: 'report' };
    if (/宿題|しゅくだい/.test(t)) return { kind: 'homework' };
    if (/ロードマップ|段階/.test(t)) return { kind: 'roadmap' };
    if (/おうち|1分|１分/.test(t)) return { kind: 'home' };
    if (/あそぶ|遊ぶ|ゲーム|全画面/.test(t)) return { kind: 'game' };
    if (/回数|頻度|とどく|届く|停止|とめ|止め/.test(t)) return { kind: 'ask-pref' };
  }
  return null;
}

const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');
const text = (t) => ({ type: 'text', text: String(t).slice(0, 4800) });
const NOT_YET = 'まだ 登録が ありません。教室で もらった QR コードから 登録して ください。';

// 🎮 そのまま あそぶ：全画面の やりかた（iPhone）＋ PDF・動画 ＋ Safari で ひらく ボタン。
function gameCard() {
  const G = '#1B3A2F'; const O = '#E27A2D'; const M = '#6B7A74';
  const t = (text, o = {}) => ({ type: 'text', text, wrap: true, size: 'sm', color: '#1F2A26', ...o });
  const step = (n, body) => ({ type: 'box', layout: 'horizontal', margin: 'md', spacing: 'md', contents: [
    { type: 'box', layout: 'vertical', width: '24px', height: '24px', cornerRadius: '12px', backgroundColor: O, justifyContent: 'center', contents: [t(String(n), { color: '#FFFFFF', weight: 'bold', align: 'center', size: 'xs' })] },
    t(body, { flex: 1 }),
  ] });
  const btn = (label, uri, style = 'link', color = G) => ({ type: 'button', style, color, height: 'sm', action: { type: 'uri', label, uri } });
  return {
    type: 'flex',
    altText: '🎮 全画面で あそぶ には：ホーム画面に U-Speak を 追加（やりかたの PDF・動画つき）',
    contents: { type: 'bubble', size: 'mega',
      header: { type: 'box', layout: 'vertical', backgroundColor: G, paddingAll: '16px', contents: [
        t('🎮 U-Speak で あそぶ', { color: '#CFE3D8', size: 'xs' }),
        t('全画面で あそぶ には', { color: '#FFFFFF', size: 'xl', weight: 'bold', margin: 'sm' }),
        t('LINE や Safari の まま だと 上と 下に バーが のこります。ホーム画面に 1 回 追加すると、つぎから アイコンで 全画面に。', { color: '#CFE3D8', size: 'xs', margin: 'sm' }),
      ] },
      body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: [
        t('iPhone（1 分・はじめの 1 回だけ）', { size: 'xs', color: M, weight: 'bold' }),
        step(1, '下の「🎮 Safari で ひらく」を おす'),
        step(2, '画面の 下の「•••」→「共有」'),
        step(3, '「ホーム画面に追加」→ 右上の「追加」'),
        step(4, 'ホーム画面の 緑の u. から ひらく'),
        { type: 'box', layout: 'vertical', margin: 'lg', paddingAll: '10px', backgroundColor: '#F4F7F5', cornerRadius: '8px', contents: [
          t('Android・iPad は そのまま 全画面で あそべます。', { size: 'xs', color: M }),
        ] },
      ] },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', contents: [
        btn('🎮 Safari で ひらく', FULLSCREEN.play, 'primary', O),
        btn('📄 やりかた（PDF・写真つき）', FULLSCREEN.pdf),
        btn('▶ やりかたの 動画（19 秒）', FULLSCREEN.video),
      ] },
    },
  };
}

// 返事の 吹き出し（5 つまで）。ctx = { kids: [{nick, paused, frequency, report, page, homework, roadmap}], pref, registered }
export function menuReply(action, { kids = [], pref = 'class', registered = false } = {}) {
  if (action.kind === 'game') return [gameCard()];   // 登録が なくても 見せて よい（あそびかたの 案内だけ）
  if (!registered) return [text(NOT_YET)];
  const active = kids.filter((k) => !k.paused);
  const pausedLine = kids.filter((k) => k.paused).map((k) => `${k.nick}さんの レポートは 教室で 止めて います。`).join('\n');
  if (action.kind === 'report') {
    const out = [];
    const one = active.length === 1;
    for (const k of active) {
      if (one && k.report?.png) out.push({ type: 'image', originalContentUrl: k.report.png, previewImageUrl: k.report.thumb || k.report.png });
      const lines = [k.report ? `📊 ${k.nick}さんの さいしんの レポート（${k.report.range}）` : `📊 ${k.nick}さんの レポートは まだ ありません。`];
      if (k.page) lines.push(`これまでの 週も 見られます：${k.page}`);
      else if (k.report?.pdf) lines.push(`PDF：${k.report.pdf}`);
      out.push(text(lines.join('\n')));
    }
    if (pausedLine) out.push(text(pausedLine));
    return out.slice(0, 5);
  }
  if (action.kind === 'homework') {
    const blocks = active.map((k) => {
      const open = (k.homework || []).filter((h) => !h.done);
      if (!open.length) return `📚 ${k.nick}さん：いま のこって いる 宿題は ありません 🎉`;
      const rows = open.slice(0, 8).map((h) => `・${h.title}（${h.answered}/${h.total}問${h.due ? `・しめきり ${md(h.due)}${h.overdue ? ' すぎ' : ''}` : ''}）`);
      return [`📚 ${k.nick}さんの いまの 宿題 ${open.length} こ`, ...rows, ...(open.length > 8 ? [`ほか ${open.length - 8} こ`] : [])].join('\n');
    });
    return [text([...blocks, pausedLine].filter(Boolean).join('\n\n') || '宿題は ありません。')];
  }
  if (action.kind === 'roadmap') {
    const out = active.map((k) => roadmapFlex(k.nick, k.roadmap, { page: k.page, game: GAME_URL }) || text(`🗺 ${k.nick}さんの ロードマップは まだ ありません（ゲームで 問題に こたえると はじまります）。`));
    if (pausedLine) out.push(text(pausedLine));
    return out.slice(0, 5);
  }
  if (action.kind === 'home') {
    // おうちで 1 分：お子さんが 英語で 言い、おうちの方が いみを 当てる（日本語の 訳が なくても できる 形）。
    // ことばは ロードマップの「次に おぼえる」と 宿題で まちがえた もの。声かけが 続けて もらう いちばんの 理由（Kraft & Rogers 2015）。
    const blocks = active.map((k) => {
      const missed = (k.homework || []).flatMap((h) => h.missed || []);
      const words = [...new Set([...(k.roadmap?.words?.next || []), ...missed].filter((w) => typeof w === 'string' && /^[A-Za-z][A-Za-z' -]{0,30}$/.test(w)))].slice(0, 3);
      if (!words.length) return `🏠 ${k.nick}さんと 1 分：「きょう U-Speak で どんな 英語を おぼえた？」と きいて、1 つ 英語で 言って もらって ください。`;
      return [`🏠 ${k.nick}さんと 1 分クイズ`, `① ${k.nick}さんに 英語で 言って もらう：${words.map((w) => `「${w}」`).join('')}`, '② おうちの方が いみを 当てる（わからなければ おしえて もらう）', '③ 言えたら「すごい！」と ひとこと 🎉'].join('\n');
    });
    return [text([...blocks, pausedLine].filter(Boolean).join('\n\n') || NOT_YET)];
  }
  const freq = [...new Set(kids.map((k) => FREQ_JA[k.frequency] || '毎週'))].join('・');
  const items = Object.entries(PREFS).map(([key, label]) => ({ type: 'action', action: { type: 'postback', label: (key === pref ? `✓ ${label}` : label).slice(0, 20), data: `menu=pref&set=${key}`, displayText: label } }));
  if (action.kind === 'pref') {
    const done = action.pref === 'stop' ? 'レポートを とめました。また 見たく なったら メニューの ⚙ から もどせます（📊 さいしんの レポートは いつでも 見られます）。'
      : action.pref === 'monthly' ? 'レポートは 月に 1 回だけ とどきます。📊 さいしんの レポート から いつでも 見られます。'
        : `レポートは 教室の 設定どおり（${freq}）に とどきます。`;
    return [{ ...text(`✓ ${done}`), quickReply: { items } }];
  }
  return [{ ...text(`⚙ とどく 回数：いまは「${PREFS[pref] || PREFS.class}」です（教室の 設定は ${freq}）。\nかえる ときは 下から えらんで ください。`), quickReply: { items } }];
}

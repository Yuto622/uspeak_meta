// LINE の 下の メニュー（リッチメニュー）と、その 返事。
//
// 保護者が 自分で 見に くる 機能だけ（こちらから 送る 回数は ふやさない）。返事は Reply API なので **通数に かぞえられない＝無料**。
// ボタンは 4 つ：📊 さいしんの レポート・📚 いまの 宿題・🗺 ロードマップ・⚙ とどく 回数。
// とどく 回数は「教室の 設定どおり／月に 1 回だけ／とめる」の 3 つ（ふやすは なし）。service.js の wantsNow() が 配信で まもる。
// 中身（だれの 子か・宿題・段階）は service.js が あつめて わたす。ここは 文を 作るだけ（テストしやすい ように）。
import { roadmapText } from './line.js';

export const PREFS = {
  class: '教室の 設定どおり',
  monthly: '月に 1 回だけ',
  stop: 'とめる',
};
const FREQ_JA = { weekly: '毎週', biweekly: '2 週に 1 回', monthly: '毎月' };

// リッチメニューの 形（scripts/line-richmenu.mjs が LINE に 登録する）。画像は 2500×843 を 4 つに わける。
export const RICH_MENU = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: 'uspeak-parent-v1',
  chatBarText: 'メニュー',
  areas: [
    ['report', '📊 さいしんの レポート'],
    ['homework', '📚 いまの 宿題'],
    ['roadmap', '🗺 ロードマップ'],
    ['pref', '⚙ とどく 回数'],
  ].map(([kind, label], i) => ({
    bounds: { x: i * 625, y: 0, width: 625, height: 843 },
    action: { type: 'postback', data: `menu=${kind}`, displayText: label.replace(/^\S+\s/, '') },
  })),
};

// Webhook の できごと → { kind, pref? } か null。メニューの postback と、同じ ことばの メッセージ（打った とき）。
export function menuAction(e) {
  if (e?.type === 'postback') {
    const q = new URLSearchParams(String(e.postback?.data || ''));
    const kind = q.get('menu');
    if (kind === 'pref' && q.get('set') && PREFS[q.get('set')]) return { kind: 'pref', pref: q.get('set') };
    if (['report', 'homework', 'roadmap', 'pref'].includes(kind)) return { kind: kind === 'pref' ? 'ask-pref' : kind };
    return null;
  }
  if (e?.type === 'message' && e.message?.type === 'text') {
    const t = String(e.message.text || '').trim();
    if (t.length > 20) return null; // ふつうの 相談の 文には こたえない（教室の 人が 返す）
    if (/レポート|れぽーと/.test(t)) return { kind: 'report' };
    if (/宿題|しゅくだい/.test(t)) return { kind: 'homework' };
    if (/ロードマップ|段階/.test(t)) return { kind: 'roadmap' };
    if (/回数|頻度|とどく|届く|停止|とめ|止め/.test(t)) return { kind: 'ask-pref' };
  }
  return null;
}

const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');
const text = (t) => ({ type: 'text', text: String(t).slice(0, 4800) });
const NOT_YET = 'まだ 登録が ありません。教室で もらった QR コードから 登録して ください。';

// 返事の 吹き出し（5 つまで）。ctx = { kids: [{nick, paused, frequency, report, page, homework, roadmap}], pref, registered }
export function menuReply(action, { kids = [], pref = 'class', registered = false } = {}) {
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
    const out = active.map((k) => text(roadmapText(k.roadmap) ? `${k.nick}さん\n${roadmapText(k.roadmap)}` : `🗺 ${k.nick}さんの ロードマップは まだ ありません（ゲームで 問題に こたえると はじまります）。`));
    if (pausedLine) out.push(text(pausedLine));
    return out.slice(0, 5);
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

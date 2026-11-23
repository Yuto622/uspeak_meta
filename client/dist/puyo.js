// PUYO U-SPEAK — a whole other game, opened from ミニゲーム島.
//
// The frame, the exit and the reasons for both live in arcade.js. This one has no online
// mode to take away — it is single player and talks to nothing — so all it needs is a way
// home, in the row where its own mute and quit buttons already are.
import { createArcade, homeButton } from './arcade.js';

export function createPuyo({ toast, onOpen, onClose }) {
  return createArcade({
    id: 'puyo',
    home: './puyo/index.html',
    name: 'PUYO U-SPEAK',
    fit: true,
    hint: 'PUYO U-SPEAK。「← U-Speak」で 島に もどれます。',
    toast,
    onOpen,
    onClose,
    settle: (doc, { close }) => { try { kidTitle(doc); } catch { /* もとの 画面の まま */ } return homeButton(doc, doc.querySelector('.topbar'), close); },
  });
}

// はじめの 画面を 子どもに やさしく（2026-11：「もっと 子供に やさしい 画面に」）。
// 同梱の フォルダは さわらない：ひらいた あとの 画面（同じ オリジンの iframe）の 文と 見た目だけ かえる。ボタンの はたらきは あちらの まま。
// ・えらぶのは 大きな 3 まいの カード（絵・ひらがなの なまえ・1 行）。英語は 小さく そえる。
// ・こまかい 設定（はやさ・ことばの 長さ・つよさ…）は「⚙ せってい」の 中に しまう。コンピューターの つよさは はじめ「よわい」。
function kidTitle(doc) {
  const title = doc.querySelector('#title-screen'); if (!title || title.dataset.kid) return;
  title.dataset.kid = '1';
  const set = (sel, html) => { const el = title.querySelector(sel); if (el) el.innerHTML = html; };
  set('.logo__sub', 'どれで あそぶ？ <small>Pick a game</small>');
  const cards = {
    uspeak: ['🔤', 'ことばを つくる', 'Word Mode', 'もじを ならべて えいごの ことばに！ コインが もらえるよ'],
    classic: ['🟢', 'いろを そろえる', 'Classic', 'おなじ いろを 4つ つなげると きえるよ'],
    versus: ['🤖', 'コンピューターと たいせん', 'Versus', 'どっちが ながく のこれるかな'],
  };
  for (const [mode, [icon, ja, en, line]] of Object.entries(cards)) {
    const b = title.querySelector(`.mode[data-mode="${mode}"]`); if (!b) continue;
    b.innerHTML = `<span class="kid-icon" aria-hidden="true">${icon}</span><h2>${ja}</h2><span class="mode__tag">${en}</span><p>${line}</p><span class="kid-go">あそぶ ▶</span>`;
  }
  const labels = [['#opt-level', 'はじめの はやさ'], ['#opt-min-word', 'ことばの ながさ'], ['#opt-ai', 'コンピューターの つよさ'], ['#opt-ghost', 'おちる ばしょを 見せる'], ['#opt-sound', 'おと']];
  for (const [id, text] of labels) { const span = title.querySelector(id)?.closest('label')?.querySelector('span'); if (span) span.textContent = text; }
  const opts = { '#opt-min-word': ['3 もじ（やさしい）', '4 もじ（むずかしい）', '5 もじ（とても むずかしい）'], '#opt-ai': ['よわい', 'ふつう', 'つよい'] };
  for (const [id, names] of Object.entries(opts)) [...(title.querySelector(id)?.options || [])].forEach((o, i) => { if (names[i]) o.textContent = names[i]; });
  const ai = title.querySelector('#opt-ai'); if (ai && ai.value !== 'easy') { ai.value = 'easy'; ai.dispatchEvent(new Event('change', { bubbles: true })); }
  const options = title.querySelector('.options');
  if (options) {
    options.hidden = true;
    const gear = doc.createElement('button'); gear.type = 'button'; gear.className = 'kid-gear'; gear.textContent = '⚙ せってい';
    gear.onclick = () => { options.hidden = !options.hidden; gear.textContent = options.hidden ? '⚙ せってい' : '⚙ せってい を とじる'; };
    options.before(gear);
  }
  const coins = title.querySelector('.bank__coins'); if (coins) { const n = coins.querySelector('#bank-total'); coins.textContent = ''; const c = doc.createElement('span'); c.className = 'coin'; coins.append(c, ' コイン ', n); }
  const book = title.querySelector('#open-wordbook'); if (book) { const n = book.querySelector('#bank-words'); book.textContent = '📖 ことばちょう（'; book.append(n, '）'); }
  set('.controls-hint', '<b>← →</b> うごかす ・ <b>↓</b> おとす ・ <b>Z / X</b> まわす ・ <b>スペース</b> いっきに おとす');
  const st = doc.createElement('style');
  st.textContent = `
    #title-screen[data-kid] .overlay__card { background: linear-gradient(160deg, #fff8e6, #e9fbf1); color: #1b3a2f; border: 4px solid #ffd166; border-radius: 32px; }
    #title-screen[data-kid] .logo { color: #1b3a2f; } #title-screen[data-kid] .logo span { color: #e27a2d; }
    #title-screen[data-kid] .logo__sub { font-size: 26px; font-weight: 800; color: #1b3a2f; } #title-screen[data-kid] .logo__sub small { display: block; font-size: 14px; font-weight: 600; color: #5b6b62; }
    #title-screen[data-kid] .mode { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 18px 12px 16px; border-radius: 26px; border: 4px solid #fff; color: #fff; box-shadow: 0 8px 0 #0002; cursor: pointer; }
    #title-screen[data-kid] .mode[data-mode="uspeak"] { background: linear-gradient(160deg, #ffb347, #e27a2d); }
    #title-screen[data-kid] .mode[data-mode="classic"] { background: linear-gradient(160deg, #5fd08a, #2f8f5b); }
    #title-screen[data-kid] .mode[data-mode="versus"] { background: linear-gradient(160deg, #7db8ff, #3f6fd0); }
    #title-screen[data-kid] .mode:hover, #title-screen[data-kid] .mode:focus-visible { transform: translateY(-4px); outline: 4px solid #ffd166; }
    #title-screen[data-kid] .mode:active { transform: translateY(3px); box-shadow: 0 3px 0 #0002; }
    #title-screen[data-kid] .kid-icon { font-size: 54px; line-height: 1; }
    #title-screen[data-kid] .mode h2 { font-size: 22px; margin: 0; color: #fff; }
    #title-screen[data-kid] .mode .mode__tag { font-size: 12px; letter-spacing: .08em; color: #ffffffd9; }
    #title-screen[data-kid] .mode p { font-size: 15px; line-height: 1.5; margin: 0; color: #fff; }
    #title-screen[data-kid] .kid-go { margin-top: auto; padding: 8px 20px; border-radius: 999px; background: #fff; color: #1b3a2f; font-weight: 800; font-size: 16px; }
    #title-screen[data-kid] .kid-gear { display: block; margin: 14px auto 8px; padding: 10px 18px; min-height: 44px; border-radius: 999px; border: 2px solid #c9c0b0; background: #fff; color: #1b3a2f; font: inherit; font-weight: 700; font-size: 15px; cursor: pointer; }
    #title-screen[data-kid] .option { background: #fff; color: #1b3a2f; border-color: #e3d9c7; font-size: 15px; }
    #title-screen[data-kid] .option select { background: #fff; color: #1b3a2f; }
    #title-screen[data-kid] .bank { border-top-color: #e3d9c7; color: #1b3a2f; font-size: 17px; font-weight: 700; }
    #title-screen[data-kid] .link { color: #2f6fd0; font-size: 16px; font-weight: 700; }
    #title-screen[data-kid] .controls-hint { color: #5b6b62; font-size: 14px; }
    #title-screen[data-kid] .options[hidden] { display: none !important; }
    #title-screen[data-kid] .options { grid-template-columns: 1fr; max-width: 460px; margin-inline: auto; }
    #title-screen[data-kid] .option { justify-content: space-between; gap: 10px; }
    #title-screen[data-kid] .option select { max-width: 60%; font-size: 15px; }
    #title-screen[data-kid] .option output { color: #1b3a2f; font-weight: 700; }
    #title-screen[data-kid] .bank strong, #title-screen[data-kid] .bank b { color: #b85c12; }
    #title-screen[data-kid] .controls-hint b { color: #1b3a2f; background: #fff; border: 1px solid #c9c0b0; border-radius: 6px; padding: 1px 6px; }
    @media (pointer: coarse) { #title-screen[data-kid] .controls-hint { display: none; } }
    @media (max-height: 560px) { #title-screen[data-kid] .kid-icon { font-size: 34px; } #title-screen[data-kid] .mode p { display: none; } #title-screen[data-kid] .mode { padding: 10px 8px; } #title-screen[data-kid] .logo__sub { font-size: 18px; } }
  `;
  doc.head.append(st);
}

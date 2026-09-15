// 「?」の あそびかたガイド — 全部の島と、全部の きのうを、写真つきで1ページずつ。
//
// **これは「はじめて ひらいた子」のための画面。** ここを読むのは、島がいくつあるかも、
// どこを押せばいいかも 知らない子（と、その日はじめて教室で配られた iPad）なので、
// 作りは わざと ばかみたいに 単純にしてある：
//
//   * **1ページに 1つのこと。** 写真が1枚、短い文が3行。それだけ。
//   * **メニューを 読ませない。** 章は上のタブ、あとは「つぎへ」を押すだけで最後まで行く。
//   * **文は ぜんぶ ひらがな寄り。** 小学生が ひとりで 読める文にする。
//
// 中身は `guide.json` が唯一の定義元で、このファイルは並べるだけ。文言を直す人が
// JavaScript を読まなくていいように分けてある（missions.json / town.json と同じ考え）。
//
// **写真は開いているページの分しか読まない。** 40枚を一度に読むと3MBになり、
// 25台の教室では それだけで 授業の最初の1分が消える。いま見ているページと、
// 次のページだけ先に読む（「つぎへ」を押した瞬間に白いままにならないように）。

const SRC = 'guide.json';
const SHOT = (name) => `assets/guide/${name}.jpg`;

export function createGuide({ toast }) {
  const dialog = document.querySelector('#guide-dialog');
  const tabs = dialog.querySelector('#guide-tabs');
  const stage = dialog.querySelector('#guide-stage');
  const foot = dialog.querySelector('#guide-foot');
  const state = { data: null, chapter: 0, step: 0 };

  const chapter = () => state.data.chapters[state.chapter];
  const steps = () => chapter().steps;

  // いまのページと、次のページの写真だけを持たせる。
  function preload() {
    const next = steps()[state.step + 1];
    if (next) new Image().src = SHOT(next.shot);
  }

  function renderTabs() {
    tabs.innerHTML = state.data.chapters.map((c, i) => `
      <button type="button" data-chapter="${i}" aria-pressed="${i === state.chapter}">
        <b>${c.mark}</b><span>${c.en || c.name}<i class="ja">${c.name}</i></span>
      </button>`).join('');
    for (const b of tabs.querySelectorAll('[data-chapter]')) {
      b.onclick = () => { state.chapter = Number(b.dataset.chapter); state.step = 0; render(); };
    }
  }

  function render() {
    const c = chapter();
    const s = steps()[state.step];
    renderTabs();
    stage.innerHTML = `
      <figure class="guide-shot">
        <img src="${SHOT(s.shot)}" alt="${s.title}" decoding="async">
      </figure>
      <div class="guide-words">
        <div class="guide-chapter">${c.mark} ${c.en || c.name} · ${c.name}</div>
        <h3>${s.en ? `${s.en}<i class="ja">${s.title}</i>` : s.title}</h3>
        ${s.body.map((line) => `<p>${line}</p>`).join('')}
        ${s.tip ? `<p class="guide-tip"><b>ヒント</b>${s.tip}</p>` : ''}
      </div>`;
    // 何ページ中の何ページ目か。点は押せる（読み返したい子のため）。
    foot.innerHTML = `
      <button type="button" id="guide-prev" ${state.chapter === 0 && state.step === 0 ? 'disabled' : ''}>← まえ</button>
      <div class="guide-dots" role="tablist" aria-label="${c.name}のページ">
        ${steps().map((_, i) => `<button type="button" data-step="${i}" aria-pressed="${i === state.step}" aria-label="${i + 1}ページめ"></button>`).join('')}
      </div>
      <button type="button" id="guide-next" class="primary">${last() ? 'とじる' : 'つぎへ →'}</button>`;
    for (const b of foot.querySelectorAll('[data-step]')) {
      b.onclick = () => { state.step = Number(b.dataset.step); render(); };
    }
    foot.querySelector('#guide-prev').onclick = back;
    foot.querySelector('#guide-next').onclick = forward;
    stage.scrollTop = 0;
    preload();
  }

  const last = () => state.chapter === state.data.chapters.length - 1 && state.step === steps().length - 1;

  function forward() {
    if (last()) { dialog.close(); return; }
    if (state.step < steps().length - 1) state.step += 1;
    else { state.chapter += 1; state.step = 0; }
    render();
  }

  function back() {
    if (state.step > 0) state.step -= 1;
    else if (state.chapter > 0) { state.chapter -= 1; state.step = steps().length - 1; }
    else return;
    render();
  }

  // 矢印キーでもめくれる。読み物なので、そのほうが速い。
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); forward(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  });
  dialog.querySelector('#guide-close').onclick = () => dialog.close();

  return {
    get isOpen() { return dialog.open; },
    // `chapter` を渡すと、その章から開く（「のりもの島のやりかた」を島から呼べるように）。
    async open(chapterId = null) {
      if (!state.data) {
        try {
          state.data = await (await fetch(SRC)).json();
        } catch {
          toast?.('あそびかたを よみこめませんでした。');
          return;
        }
      }
      const at = chapterId ? state.data.chapters.findIndex((c) => c.id === chapterId) : 0;
      state.chapter = at < 0 ? 0 : at;
      state.step = 0;
      render();
      if (!dialog.open) dialog.showModal();
    },
  };
}

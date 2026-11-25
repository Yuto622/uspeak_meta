// AURORA KART — a whole other game, opened from のりもの島.
//
// The frame, the exit and the reasons for both live in arcade.js; this file is only the
// two things that are true of THIS guest.
import { createArcade, homeButton } from './arcade.js';

export function createRacers({ toast, onOpen, onClose, kart }) {
  return createArcade({
    id: 'racers',
    home: './racers/index.html',
    name: 'AURORA KART',
    fit: true,
    hint: 'AURORA KART。「← U-Speak」で 島に もどれます。',
    toast,
    onOpen,
    onClose,
    settle(doc, { close }) {
      // Its online tab talks WebSocket to the origin root, which here is the classroom's
      // Colyseus endpoint — it would knock on the wrong door and be turned away with an
      // error a child cannot read. Racing together already exists in this world, so the
      // tab is replaced by a sentence that says where.
      const online = doc.querySelector('[data-mode="online"]');
      if (online) {
        if (online.getAttribute('aria-pressed') === 'true') doc.querySelector('[data-mode="single"]')?.click();
        online.remove();
        const note = doc.createElement('p');
        note.className = 'mode-description';
        note.style.cssText = 'opacity:.72;margin-top:6px';
        note.textContent = 'みんなで いっしょに はしるのは、のりもの島の 「レースに でる」 から。';
        doc.querySelector('#modes')?.after(note);
      }
      // えいごの レース（ことばの ゲートを 車で くぐる）を はじめから えらんで おく。
      // ことばの ゲートの 問題・正解・コインは 教室の サーバーが 持つ（kart:*）。ゲームは これを 見つけたら サーバーの 問題で 走る。
      if (kart) doc.defaultView.USPEAK_KART = kart;
      doc.querySelector('[data-mode="uspeak"]')?.click();
      try { simpleMenu(doc); } catch { /* もとの メニューの まま */ }
      return homeButton(doc, doc.querySelector('.top-actions'), close);
    },
  });
}

// メニューを かんたんに（2026-11：「もっと 簡単な UI に」）。えらぶのは 3 つだけ：① コース ② くるま ③ えいごの レベル → ▶ スタート。
// モード・むずかしさ・オート加速・ミラー・周回・画質・音量 は「⚙ せってい」の 中（消して いない＝id の まま 動く）。
// 見た目は arcade-fit/racers.css の `body.uspeak-simple`。ゲームの 中身（racers/）は さわらない。
function simpleMenu(doc) {
  const menu = doc.querySelector('#menu'); if (!menu || doc.body.classList.contains('uspeak-simple')) return;
  doc.body.classList.add('uspeak-simple');
  const rows = [...menu.querySelectorAll('.label-row > span:first-child')];
  ['① コースを えらぶ', '② くるまを えらぶ', '③ えいごの レベル'].forEach((t, i) => { if (rows[i]) rows[i].textContent = t; });
  const level = ['★ やさしい', '★★ ふつう', '★★★ むずかしい', '★★★★ とても むずかしい'];
  menu.querySelectorAll('#tracks button').forEach((b, i) => { const sm = b.querySelector('small'); if (sm && level[i]) sm.textContent = level[i]; });
  const desc = menu.querySelector('#modeDescription');
  const say = () => { if (desc && desc.textContent !== 'ただしい えいごの レーンを はしろう！') desc.textContent = 'ただしい えいごの レーンを はしろう！'; };
  say(); if (desc) new doc.defaultView.MutationObserver(say).observe(desc, { childList: true, characterData: true, subtree: true });
  const start = menu.querySelector('#start');
  const go = () => { if (start && !start.dataset.kid) { start.dataset.kid = '1'; } if (start && !/スタート/.test(start.textContent)) start.textContent = '▶ スタート'; };
  go(); if (start) new doc.defaultView.MutationObserver(go).observe(start, { childList: true, characterData: true, subtree: true });
  const gear = doc.createElement('button'); gear.type = 'button'; gear.className = 'uspeak-gear'; gear.textContent = '⚙ せってい';
  gear.onclick = () => { const on = doc.body.classList.toggle('uspeak-more'); gear.textContent = on ? '⚙ せってい を とじる' : '⚙ せってい'; };
  start?.before(gear);
}

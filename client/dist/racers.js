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
      return homeButton(doc, doc.querySelector('.top-actions'), close);
    },
  });
}

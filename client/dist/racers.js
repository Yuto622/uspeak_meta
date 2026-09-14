// AURORA KART — a whole other game, opened from のりもの島.
//
// The frame, the exit and the reasons for both live in arcade.js; this file is only the
// two things that are true of THIS guest.
import { createArcade, homeButton } from './arcade.js';

export function createRacers({ toast, onOpen, onClose }) {
  return createArcade({
    id: 'racers',
    home: './racers/index.html',
    name: 'AURORA KART',
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
      return homeButton(doc, doc.querySelector('.top-actions'), close);
    },
  });
}

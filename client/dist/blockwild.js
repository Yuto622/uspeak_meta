// BLOCKWILD — a whole other game, opened from まちづくり島.
//
// The frame, the exit and the reasons for both live in arcade.js; this file is only the
// two things that are true of THIS guest.
import { createArcade, homeButton } from './arcade.js';

export function createBlockwild({ toast, onOpen, onClose }) {
  return createArcade({
    id: 'blockwild',
    home: './blockwild/index.html',
    name: 'BLOCKWILD',
    hint: 'BLOCKWILD。「← U-Speak」で 島に もどれます。',
    toast,
    onOpen,
    onClose,
    settle(doc, { close }) {
      // Its multiplayer opens a WebSocket at `/ws` on this origin. Colyseus's transport is
      // built with `{ server }` and no `path`, so it takes EVERY upgrade on this port —
      // including that one — and answers in a protocol BLOCKWILD does not speak. A child
      // pressing "このコードの世界に入る" would watch it fail with no way to act on it, so
      // the whole panel goes and says instead where building together does work.
      const panel = doc.querySelector('#netPanel');
      if (panel) {
        panel.innerHTML = `<div class="nethead"><span class="eyebrow">MULTIPLAYER</span><strong>友達と同じ世界で</strong></div>
          <div id="netStatus">ここでは ひとりの 世界です。みんなで つくるのは、まちづくり島の 「ひろば」 から。</div>`;
      }
      // Its own menu row, where a child already looks for 保存 and 設定.
      return homeButton(doc, doc.querySelector('.menulinks'), close);
    },
  });
}

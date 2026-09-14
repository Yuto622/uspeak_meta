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
    hint: 'PUYO U-SPEAK。「← U-Speak」で 島に もどれます。',
    toast,
    onOpen,
    onClose,
    settle: (doc, { close }) => homeButton(doc, doc.querySelector('.topbar'), close),
  });
}

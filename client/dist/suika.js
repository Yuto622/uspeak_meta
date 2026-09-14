// えいご スイカゲーム — a whole other game, opened from ミニゲーム島.
//
// The frame, the exit and the reasons for both live in arcade.js. Like PUYO this one is
// single player and talks to nothing, so all it needs is a way home among its own buttons.
import { createArcade, homeButton } from './arcade.js';

export function createSuika({ toast, onOpen, onClose }) {
  return createArcade({
    id: 'suika',
    home: './suika/index.html',
    name: 'えいご スイカゲーム',
    hint: 'えいご スイカゲーム。「← U-Speak」で 島に もどれます。',
    toast,
    onOpen,
    onClose,
    settle: (doc, { close }) => homeButton(doc, doc.querySelector('.topbar-btns') || doc.querySelector('.topbar'), close),
  });
}

// AURORA KART — a whole other game, opened from のりもの島.
//
// This file does not contain a game. It contains a door. The game itself lives untouched
// in `racers/` (see racers/SOURCE.json) and runs inside a same-origin iframe, and the
// reason it is a frame rather than a module is not squeamishness:
//
//   * it ships three.js r170 and the world outside runs r160. Two copies of three.js in
//     one page share a module registry and a set of globals, and the one that loses is
//     whichever island a child happens to be standing on.
//   * its stylesheet styles `header`, `main`, `button` — bare element selectors, as a
//     page that owns its whole window is entitled to do. Loaded next to style.css it
//     would repaint this game.
//   * it wants the arrow keys, Space, Shift and Esc. So does the world.
//
// A frame gives all three for free, and gives them back the moment it is removed. What it
// does NOT give is isolation from us: it is same-origin, so the two things this launcher
// has to do to it — take away a mode that cannot work here, and put a way home in its
// header — are done by reaching into its document rather than by editing its files. That
// keeps every vendored byte identical to the build that was handed over, which is what
// makes `racers/SOURCE.json` worth having.
const HOME = './racers/index.html';

export function createRacers({ toast, onOpen, onClose }) {
  const shell = document.createElement('div');
  shell.id = 'racers';
  shell.hidden = true;
  // A way out that does not depend on the game's own layout, in case the header this
  // launcher usually borrows is not where it was. Hidden unless the borrow failed.
  shell.innerHTML = '<button type="button" id="racers-exit" hidden>← もどる</button>';
  document.body.append(shell);

  let frame = null;
  let open = false;

  // The game's own online tab talks WebSocket to the origin root, which here is the
  // classroom's Colyseus endpoint — it would knock on the wrong door and be turned away
  // with an error a child cannot read. Racing together already exists in this world, so
  // the tab is replaced by a sentence that says where.
  function settle(doc) {
    if (!doc) return false;
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
    // Home, in the game's own header, styled like everything else in it.
    const actions = doc.querySelector('.top-actions');
    if (!actions) return false;
    const back = doc.createElement('button');
    back.type = 'button';
    back.id = 'racers-home';
    back.textContent = '← U-Speak';
    back.onclick = () => close();
    actions.prepend(back);
    return true;
  }

  function close() {
    if (!open) return;
    open = false;
    // The frame is destroyed rather than hidden: it holds a WebGL context, a WebAudio
    // graph and a 60Hz loop, and a paused tab full of those is a paused tab that still
    // costs an iPad its battery. Coming back reloads, which is what a child expects of a
    // game they walked out of anyway.
    frame?.remove();
    frame = null;
    shell.hidden = true;
    delete document.body.dataset.racers;
    onClose?.();
  }

  return {
    open() {
      if (open) return;
      open = true;
      document.body.dataset.racers = 'on';
      shell.hidden = false;
      frame = document.createElement('iframe');
      frame.id = 'racers-frame';
      frame.title = 'AURORA KART';
      frame.src = HOME;
      // Gamepads and sound are the two things this game asks the browser for that a
      // frame does not get by default.
      frame.setAttribute('allow', 'autoplay; gamepad; fullscreen');
      frame.addEventListener('load', () => {
        let borrowed = false;
        try { borrowed = settle(frame.contentDocument); } catch { borrowed = false; }
        document.querySelector('#racers-exit').hidden = borrowed;
        try { frame.contentWindow?.focus(); } catch { /* the keys will find it on a tap */ }
      });
      shell.append(frame);
      document.querySelector('#racers-exit').onclick = () => close();
      onOpen?.();
      toast?.('AURORA KART。「← U-Speak」で 島に もどれます。');
    },
    close,
    get isOpen() { return open; },
    get frame() { return frame; },
  };
}

// 同梱した外部ゲームを開くための、共通の「席」。
//
// This file does not contain a game. It contains a door, and two games use it: AURORA KART
// (racers.js) and BLOCKWILD (blockwild.js). Each of those lives untouched in its own folder
// — see its SOURCE.json — and runs inside a same-origin iframe. The frame is not
// squeamishness; all three of these break otherwise:
//
//   * both ship three.js r170 and the world outside runs r160. Two copies of three.js in
//     one page share a module registry and a set of globals, and the one that loses is
//     whichever island a child happens to be standing on.
//   * their stylesheets style `header`, `main`, `button` — bare element selectors, as a
//     page that owns its whole window is entitled to do. Loaded next to style.css they
//     would repaint this game.
//   * they want the arrow keys, WASD, Space, Shift and Esc, and one of them wants the
//     pointer locked. So does the world.
//
// A frame gives all three for free, and gives them back the moment it is removed. What it
// does NOT give is isolation from us: these are same-origin, so whatever each game needs
// doing to it here — taking away a mode that cannot work, putting a way home in its own
// header — is done by reaching into its document (`settle`) rather than by editing its
// files. That keeps every vendored byte identical to the build that was handed over,
// which is what makes each SOURCE.json worth having.
export function createArcade({ id, home, name, hint, settle, toast, onOpen, onClose }) {
  const shell = document.createElement('div');
  shell.className = 'arcade';
  shell.id = `arcade-${id}`;
  shell.hidden = true;
  // A way out that does not depend on the guest's own layout, in case the header this
  // launcher usually borrows is not where it was. Hidden unless the borrow failed.
  shell.innerHTML = `<button type="button" class="arcade-exit" hidden>← もどる</button>`;
  document.body.append(shell);
  const escape = shell.querySelector('.arcade-exit');

  let frame = null;
  let open = false;
  let watching = 0;

  function close() {
    if (!open) return;
    open = false;
    // The frame is destroyed rather than hidden: it holds a WebGL context, a WebAudio
    // graph and a frame loop, and a hidden tab full of those is a hidden tab that still
    // costs an iPad its battery. Coming back reloads, which is what a child expects of a
    // game they walked out of anyway.
    clearInterval(watching);
    frame?.remove();
    frame = null;
    shell.hidden = true;
    delete document.body.dataset.arcade;
    onClose?.();
  }

  return {
    open() {
      if (open) return;
      open = true;
      document.body.dataset.arcade = id;
      shell.hidden = false;
      frame = document.createElement('iframe');
      frame.className = 'arcade-frame';
      frame.title = name;
      frame.src = home;
      // Sound, gamepads, the pointer and the whole screen: the four things these games
      // ask the browser for that a frame is not given by default.
      frame.setAttribute('allow', 'autoplay; gamepad; fullscreen; pointer-lock');
      frame.addEventListener('load', () => {
        let borrowed = false;
        try { borrowed = !!settle?.(frame.contentDocument, { close }); } catch { borrowed = false; }
        escape.hidden = borrowed;
        // …but a borrowed button is only a way out while it is on screen, and these games
        // hide their own controls as they please: PUYO's toolbar is not up on its menu,
        // and a child sitting on that menu with no way back to the island is stuck in a
        // game they did not mean to stay in. So watch it, and put the plain exit up
        // whenever the borrowed one is not there. Half a second is quick enough that
        // nobody notices, and cheap enough that it does not matter.
        if (borrowed) {
          const seen = () => {
            try { return !!frame?.contentDocument?.querySelector('.arcade-home')?.getClientRects().length; }
            catch { return false; }
          };
          watching = setInterval(() => { if (open) escape.hidden = seen(); }, 500);
          escape.hidden = seen();
        }
        // Without this the first W press walks the child on the island behind.
        try { frame.contentWindow?.focus(); } catch { /* the keys will find it on a tap */ }
      });
      shell.append(frame);
      escape.onclick = () => close();
      onOpen?.();
      if (hint) toast?.(hint);
    },
    close,
    get isOpen() { return open; },
    get frame() { return frame; },
  };
}

// A way home, in the guest's own controls, dressed as one of them.
//
// Every one of these games keeps its buttons in a row somewhere; each launcher says which
// row. The class is copied off whatever button is already in that row rather than written
// here, so the way home looks native in a stylesheet this file has never read — and keeps
// looking native when the guest is replaced by a newer build.
export function homeButton(doc, host, close) {
  if (!host) return false;
  const back = doc.createElement('button');
  back.type = 'button';
  back.className = `${host.querySelector('button')?.className || ''} arcade-home`.trim();
  back.textContent = '← U-Speak';
  back.onclick = () => close();
  host.prepend(back);
  return true;
}

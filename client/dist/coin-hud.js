// コインの見える化 — coins you can see, not a number you have to find.
//
// Before this, a child's coins lived inside the 釣り button as a small "◈ 120", and money
// arriving was a line of toast text that had already gone by the time they looked up. The
// reference this is built from (DreaMagic) does two things instead, and both matter:
//
//   1. The balance is ALWAYS on screen, top right, wherever you are.
//   2. Coins can be SEEN, not just counted.
//
// The second one splits in two, and the split matters. Earning is frequent — a fish, a
// checkpoint, a right answer — so it has to be quick: a few coins into the badge and the
// number runs up. Leaving them lying along the bottom of the screen after every reward
// turns the thing that should feel like a moment into clutter that is always there.
//
// Looking at what you have is the opposite: rare, asked for, and worth making a show of.
// Tapping the balance pours the whole purse down the screen — じゃらじゃら — and how long
// it goes on is how much money there is. A seven-year-old with 800 coins should be able to
// SEE that it is more than 80, and a number cannot do that.
// Earning: quick, and gone.
const MAX_DRAWN = 10;      // coins drawn for a big win: past this it is a crowd
const RISE_MS = 620;
const TICK_MS = 520;
// Looking: the pour. Length and number are what say "this is a lot".
// Eighteen is the fewest that still reads as じゃらじゃら rather than a few coins going
// past; a child with their first hundred should get a proper pour too, or the feature
// only exists for children who are already rich.
const POUR_MIN = 18;
const POUR_MAX = 70;
const POUR_PER_COIN = 8;   // one drawn coin for every eight a child owns
const POUR_FALL_MS = 1150;
const POUR_GAP_MS = 34;    // between one coin leaving and the next

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const still = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

export function createCoinHud({ onOpen } = {}) {
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.id = 'coin-hud';
  badge.className = 'coin-hud';
  badge.setAttribute('aria-label', 'もっているコイン');
  badge.innerHTML = '<i class="coin-face" aria-hidden="true"></i><b id="coin-hud-count">0</b>';
  const count = badge.querySelector('#coin-hud-count');
  // The "look at my coins" button, and only that. It used to open マイページ as well,
  // which does not work: a modal <dialog> sits in the browser's top layer, above any
  // z-index this layer could be given, so the page covered the very coins the tap asked
  // to see. マイページ is opened from the level beside it instead — your coins and your
  // record are two different questions and now they are two different taps.
  badge.onclick = () => { if (!still()) pour(known ?? 0); onOpen?.(); };

  // The rail the falling coins land on. Fixed, never in the way: nothing in it takes a tap.
  const rain = document.createElement('div');
  rain.className = 'coin-rain';
  rain.setAttribute('aria-hidden', 'true');

  let shown = 0;          // what the badge currently reads
  let known = null;       // the last balance we were told about; null until the first set()
  let ticking = 0;
  let busyUntil = 0;      // …while coins are already in the air, see set()

  function mount() {
    if (badge.isConnected) return;
    const stats = document.querySelector('header .stats');
    if (stats) stats.insertBefore(badge, stats.firstChild);
    else document.body.append(badge);
    if (!rain.isConnected) document.body.append(rain);
  }

  // The number, counted rather than replaced. A balance that jumps from 40 to 95 tells a
  // child nothing about how much they just got; one that runs up through the fifties does.
  function tickTo(target, ms = TICK_MS) {
    cancelAnimationFrame(ticking);
    const from = shown;
    const gap = target - from;
    if (!gap) { shown = target; count.textContent = target.toLocaleString(); return; }
    if (still() || Math.abs(gap) > 5000) { shown = target; count.textContent = target.toLocaleString(); return; }
    const t0 = performance.now();
    const step = (now) => {
      const k = clamp((now - t0) / ms, 0, 1);
      // Ease out: quick at first, so the last few numbers are readable rather than a blur.
      shown = Math.round(from + gap * (1 - (1 - k) ** 3));
      count.textContent = shown.toLocaleString();
      if (k < 1) ticking = requestAnimationFrame(step);
      else { shown = target; count.textContent = target.toLocaleString(); }
    };
    ticking = requestAnimationFrame(step);
  }

  function pop(cls = 'up') {
    badge.classList.remove('coin-hud-up', 'coin-hud-down');
    // Reflow, or the same class twice in a row does not replay the animation.
    void badge.offsetWidth;
    badge.classList.add(`coin-hud-${cls}`);
  }

  // ---- the coins themselves ------------------------------------------------------------
  //
  // Moved by requestAnimationFrame rather than element.animate(), on purpose. The Web
  // Animations API is the tidier tool and is what this was written with first — but its
  // clock is the compositor's, and there are real conditions where that clock stops while
  // rAF keeps running: a software renderer, a throttled tab, a machine that cannot make
  // frames. Measured in the test container, document.timeline advanced 0 ms per 500 ms of
  // wall clock while the world carried on rendering, so every coin hung motionless at its
  // first keyframe. Driving them from the same clock the game already runs on means they
  // move wherever the game moves, and means a browser test can actually watch them fall.
  const live = new Set();
  let frame = 0;
  let ticks = 0;          // frames this loop has actually run: read by the browser test

  function tick(now) {
    frame = 0;
    ticks += 1;
    for (const c of [...live]) {
      const t = (now - c.born) / 1000;
      if (t >= c.life) { clearTimeout(c.sweep); c.el.remove(); live.delete(c); continue; }
      if (t < 0) continue;                      // still waiting its turn to be thrown
      const k = t / c.life;
      const swing = Math.sin(Math.PI * k);
      const x = c.x0 + (c.x1 - c.x0) * k + (c.xArc || 0) * swing;
      // Thrown, then falling: a parabola reads as weight, a straight line reads as a
      // sprite being moved.
      const y = c.y0 + (c.y1 - c.y0) * k + c.arc * swing;
      const fade = c.fade ? Math.min(1, (1 - k) * 4) : Math.min(1, k * 8);
      c.el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(c.spin * k).toFixed(0)}deg) scale(${c.scale})`;
      c.el.style.opacity = String(Math.max(0, Math.min(1, Math.min(fade, k < 0.06 ? k * 16 : 1))));
    }
    if (live.size) frame = requestAnimationFrame(tick);
  }

  function launch(coin) {
    live.add(coin);
    // Frames are not promised. A backgrounded tab stops getting them, and a slow machine
    // can go a second between them — measured at under two a second on the test
    // container — so the last thing a coin does is not allowed to depend on one arriving.
    // Without this, a child who switches tabs mid-pour comes back to coins frozen on
    // their screen for the rest of the lesson.
    coin.sweep = setTimeout(() => { coin.el.remove(); live.delete(coin); }, (coin.life + 0.6) * 1000 + Math.max(0, coin.born - performance.now()));
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function makeCoin(cls, scale) {
    const el = document.createElement('i');
    el.className = cls;
    el.style.setProperty('--coin-size', String(scale));
    el.style.opacity = '0';
    rain.append(el);
    return el;
  }

  // Earning. A handful of coins thrown out from under the badge and gathered back into it,
  // about a second, nothing left behind. Frequent, so it must not become clutter: no row
  // of coins parked along the bottom of the screen for the rest of the lesson.
  function burst(gain, target) {
    const n = clamp(Math.round(gain), 1, MAX_DRAWN);
    busyUntil = performance.now() + RISE_MS + n * 30;
    const to = badge.getBoundingClientRect();
    const cx = to.left + to.width / 2;
    const cy = to.top + to.height / 2;
    tickTo(target, RISE_MS);
    pop('up');
    for (let i = 0; i < n; i += 1) {
      const el = makeCoin('coin-fly', 1);
      el.style.left = `${Math.round(cx)}px`;
      el.style.top = `${Math.round(cy)}px`;
      // Out from under the badge and back into it: both ends are the badge, and the arc
      // is what happens in between, so a handful reads as coins being gathered up rather
      // than one coin blinking on and off.
      launch({
        el, born: performance.now() + i * 30, life: RISE_MS / 1000,
        x0: 0, x1: 0, xArc: (i - (n - 1) / 2) * 26,
        y0: 0, y1: 0, arc: 62,
        spin: 340, scale: 1, fade: true,
      });
    }
  }

  // Looking. The whole purse poured down the screen — じゃらじゃら — and the only place
  // coins are drawn falling the full height. How many fall, and for how long, is set by
  // the balance: that IS the visualisation. Ten coins and eight hundred must not look the
  // same, or the button is decoration.
  function pour(coins) {
    const n = clamp(Math.round(coins / POUR_PER_COIN), POUR_MIN, POUR_MAX);
    const h = window.innerHeight;
    const w = window.innerWidth;
    const last = (n - 1) * POUR_GAP_MS + POUR_FALL_MS;
    busyUntil = performance.now() + last;
    const now = performance.now();
    for (let i = 0; i < n; i += 1) {
      const scale = 0.72 + Math.random() * 0.5;
      const el = makeCoin('coin-pour', scale.toFixed(2));
      const x = w * (0.06 + Math.random() * 0.88);
      el.style.left = '0px';
      el.style.top = '0px';
      launch({
        el, born: now + i * POUR_GAP_MS, life: (POUR_FALL_MS * (0.82 + Math.random() * 0.4)) / 1000,
        x0: x, x1: x + (Math.random() - 0.5) * 90,
        y0: -h * 0.12, y1: h * 1.1,
        arc: 0, spin: 360 + Math.random() * 720, scale: scale.toFixed(2), fade: false,
      });
    }
    pop('up');
    return last;
  }

  return {
    get element() { return badge; },
    mount,
    // The one way in. Everything that changes a balance — the room's `wallet`, a purchase,
    // a sale, a reconcile after reconnecting — ends up here, so there is one place that
    // decides what a change looks like.
    set(coins) {
      const next = Math.max(0, Math.floor(Number(coins) || 0));
      mount();
      const first = known === null;
      const gain = first ? 0 : next - known;
      known = next;
      if (first) { shown = next; count.textContent = next.toLocaleString(); return; }
      if (gain === 0) return;
      if (gain < 0) { tickTo(next); pop('down'); return; }
      if (still() || document.hidden) { tickTo(next); pop('up'); return; }
      // One payment, one shower. Earning online lands twice — the page adds the coins
      // straight away and the room then confirms (or corrects) the balance a moment later
      // — and two showers for one reward is twice the coins on screen and half the sense
      // of what just happened. The second number still arrives; it arrives in the count.
      if (performance.now() < busyUntil) { tickTo(next); pop('up'); return; }
      burst(gain, next);
    },
    // Pour the purse down the screen on demand. Exposed so anything else that wants to
    // make a fuss of a balance — a shop, a result card — can use the same one.
    pour: () => pour(known ?? 0),
    // Some screens take the whole window (the race, the grand prix). The badge belongs to
    // the island, and goes away with the rest of its furniture.
    setVisible(on) { badge.hidden = !on; if (!on) rain.replaceChildren(); },
    get coins() { return known ?? 0; },
    // For the browser test and for real-device debugging: how many frames the coin loop
    // has run, and how many coins are in the air right now.
    get frames() { return ticks; },
    get flying() { return live.size; },
  };
}

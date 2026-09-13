// コインの見える化 — coins you can see, not a number you have to find.
//
// Before this, a child's coins lived inside the 釣り button as a small "◈ 120", and money
// arriving was a line of toast text that had already gone by the time they looked up. The
// reference this is built from (DreaMagic) does two things instead, and both matter:
//
//   1. The balance is ALWAYS on screen, top right, wherever you are.
//   2. When coins are earned they are physically drawn — they fall, they land in a row
//      along the bottom of the screen, they sit there long enough to be counted, and then
//      they fly up into the balance, which ticks as they arrive.
//
// The second one is the whole point. A seven-year-old who is told "+15🪙" has been
// informed; a seven-year-old who watches fifteen coins drop and get swept into their purse
// has been paid. It is the same number either way — the room decides it, not this file —
// but only one of them feels like earning something.
const MAX_DRAWN = 14;      // coins actually drawn for a big win: past this it is a crowd
const FALL_MS = 620;
const HOLD_MS = 520;       // …long enough to look at them. This is the "見える化" itself.
const SWEEP_MS = 460;
const TICK_MS = 520;

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
  badge.onclick = () => onOpen?.();

  // The rail the falling coins land on. Fixed, never in the way: nothing in it takes a tap.
  const rain = document.createElement('div');
  rain.className = 'coin-rain';
  rain.setAttribute('aria-hidden', 'true');

  let shown = 0;          // what the badge currently reads
  let known = null;       // the last balance we were told about; null until the first set()
  let ticking = 0;
  let showerUntil = 0;    // …while a shower is in the air, see set()

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

  // The shower. Coins fall from above, land in a row along the bottom — which is exactly
  // what the reference does, and what makes them countable — wait, then sweep up into the
  // badge. The balance ticks while they are sweeping, so the number and the coins arrive
  // together.
  function shower(gain, target) {
    const n = clamp(Math.round(gain), 1, MAX_DRAWN);
    showerUntil = performance.now() + FALL_MS + (n - 1) * 42 + HOLD_MS + SWEEP_MS + n * 26;
    const spread = Math.min(window.innerWidth - 64, n * 34);
    const left = (window.innerWidth - spread) / 2;
    const to = badge.getBoundingClientRect();
    const coins = [];
    for (let i = 0; i < n; i += 1) {
      const coin = document.createElement('i');
      coin.className = 'coin-drop';
      const x = n === 1 ? window.innerWidth / 2 : left + (spread / (n - 1)) * i;
      coin.style.left = `${Math.round(x)}px`;
      rain.append(coin);
      coins.push(coin);
      const delay = i * 42;
      coin.animate([
        { transform: 'translate(-50%, -22vh) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -18vh) rotate(40deg)', opacity: 1, offset: 0.12 },
        { transform: 'translate(-50%, 0) rotate(300deg)', opacity: 1, offset: 0.82 },
        // A small bounce off the floor: the difference between landing and stopping.
        { transform: 'translate(-50%, -14px) rotate(330deg)', opacity: 1, offset: 0.92 },
        { transform: 'translate(-50%, 0) rotate(340deg)', opacity: 1 },
      ], { duration: FALL_MS, delay, easing: 'cubic-bezier(.34,.72,.42,1)', fill: 'forwards' });
    }
    const landed = FALL_MS + (n - 1) * 42;
    setTimeout(() => {
      tickTo(target, SWEEP_MS + n * 26);
      pop('up');
      coins.forEach((coin, i) => {
        const from = coin.getBoundingClientRect();
        const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
        const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
        const fly = coin.animate([
          { transform: 'translate(-50%, 0) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx * 0.45}px), ${dy * 0.3}px) scale(1.15)`, opacity: 1, offset: 0.45 },
          { transform: `translate(calc(-50% + ${dx}px), ${dy}px) scale(.35)`, opacity: 0 },
        ], { duration: SWEEP_MS, delay: i * 26, easing: 'cubic-bezier(.5,-0.1,.5,1)', fill: 'forwards' });
        fly.onfinish = () => coin.remove();
        // A tab backgrounded mid-flight never fires onfinish, and a coin stuck on the
        // screen for the rest of the lesson is worse than one that vanished early.
        setTimeout(() => coin.remove(), SWEEP_MS + i * 26 + 400);
      });
    }, landed + HOLD_MS);
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
      if (performance.now() < showerUntil) { tickTo(next); pop('up'); return; }
      shower(gain, next);
    },
    // Some screens take the whole window (the race, the grand prix). The badge belongs to
    // the island, and goes away with the rest of its furniture.
    setVisible(on) { badge.hidden = !on; if (!on) rain.replaceChildren(); },
    get coins() { return known ?? 0; },
  };
}

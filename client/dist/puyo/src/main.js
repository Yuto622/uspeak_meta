import { Game } from './core/game.js';
import { ColorRule } from './core/rules/colorRule.js';
import { WordRule } from './core/rules/wordRule.js';
import { PuyoAi } from './core/ai.js';
import { Rng } from './core/rng.js';
import { FieldRenderer } from './ui/renderer.js';
import { InputController } from './ui/input.js';
import { Hud } from './ui/hud.js';
import { SoundBoard } from './ui/audio.js';
import { dictionary } from './core/wordlist.js';
import { profile } from './storage.js';

/** Fixed simulation step.  Rendering is free-running; physics is not. */
const STEP = 1 / 120;
/** Never simulate more than this much time in one frame after a stall. */
const MAX_FRAME = 0.25;

const dom = {
  app: document.getElementById('app'),
  stage: document.getElementById('stage'),
  modeBadge: document.getElementById('mode-badge'),
  coinTotal: document.getElementById('coin-total'),
  quit: document.getElementById('quit-button'),
  touch: document.getElementById('touch-controls'),
  title: document.getElementById('title-screen'),
  pause: document.getElementById('pause-screen'),
  gameOver: document.getElementById('gameover-screen'),
  wordbook: document.getElementById('wordbook-screen'),
  results: document.getElementById('results'),
  resultTitle: document.getElementById('result-title'),
  resultWords: document.getElementById('result-words'),
  bankTotal: document.getElementById('bank-total'),
  bankWords: document.getElementById('bank-words'),
  bankBest: document.getElementById('bank-best'),
  wordbookList: document.getElementById('wordbook-list'),
  optLevel: document.getElementById('opt-level'),
  optLevelOut: document.getElementById('opt-level-out'),
  optMinWord: document.getElementById('opt-min-word'),
  optAi: document.getElementById('opt-ai'),
  optGhost: document.getElementById('opt-ghost'),
  optSound: document.getElementById('opt-sound'),
  muteButton: document.getElementById('mute-button'),
  players: [document.getElementById('player-1'), document.getElementById('player-2')],
};

/** @type {{mode: string, sides: object[], running: boolean, paused: boolean}|null} */
let session = null;
let lastFrame = 0;
let accumulator = 0;
const sound = new SoundBoard({ muted: !profile.load().settings.sound });

// ------------------------------------------------------------------ setup --

/** @returns {object} the rule object a mode plays by. */
function ruleFor(mode, settings) {
  if (mode === 'uspeak') return new WordRule({ minWordLength: Number(settings.minWordLength) });
  return new ColorRule({ colorCount: 4 });
}

/**
 * Builds one side of a match: its game, renderer and HUD, wired together.
 *
 * @param {HTMLElement} root the `.player` section
 */
function createSide(root, { mode, settings, seed, versus, cpu }) {
  root.hidden = false;
  const rule = ruleFor(mode, settings);
  const usesLetters = rule.usesLetters;

  // The side object exists before the game does, because the engine emits its
  // first event (the opening spawn) from inside its own constructor.
  const side = {
    root,
    rule,
    hud: new Hud(root, { showLetters: usesLetters }),
    isCpu: Boolean(cpu),
    cpu: null,
  };
  side.hud.applyMode(mode);

  side.game = new Game({
    rule,
    seed,
    level: Number(settings.level),
    garbage: versus,
    onEvent: (event) => handleEvent(side, event),
  });

  side.renderer = new FieldRenderer(root.querySelector('[data-field="canvas"]'), side.game, {
    showGhost: Boolean(settings.ghost) && !cpu,
    showLetters: usesLetters,
  });

  if (cpu) {
    side.cpu = new PuyoAi(side.game, { level: settings.ai, rng: new Rng(seed ^ 0x5f3759df) });
  }
  return side;
}

/** Routes an engine event to the banners, the word log and the opponent. */
function handleEvent(side, event) {
  // Only the human's field makes noise; two fields chiming at once is a mess.
  const audible = !side.isCpu;
  switch (event.type) {
    case 'pop': {
      side.hud.showChain(event.chain);
      const words = event.step.words || [];
      if (words.length) side.hud.showWords(event.step);
      if (event.chain >= 3) side.renderer.bump(0.35 + event.chain * 0.12);
      if (audible) {
        if (words.length) {
          const longest = words.reduce((best, word) => (word.length > best.length ? word : best), '');
          sound.word({
            length: longest.length,
            chain: event.chain,
            common: dictionary.isCommon(longest),
          });
        } else {
          sound.chain(event.chain);
        }
      }
      for (const group of event.groups) {
        if (!group.word) continue;
        side.hud.addWord(group, side.rule.baseValue(group.word));
      }
      break;
    }
    case 'allclear':
      side.hud.showAllClear();
      side.renderer.bump(0.8);
      if (audible) sound.allClear();
      break;
    case 'lock':
      if (audible) sound.land();
      break;
    case 'move':
      if (audible) sound.move();
      break;
    case 'rotate':
      if (audible) sound.rotate();
      break;
    case 'garbage':
      if (audible && event.amount > 0) sound.garbage();
      break;
    case 'levelup':
      if (audible) sound.levelUp();
      break;
    case 'chainend': {
      // Nuisance is handed over once the whole chain has finished, which is
      // what makes offsetting a real decision rather than a race.
      if (!session || !session.versus) break;
      const opponent = session.sides.find((other) => other !== side);
      if (!opponent) break;
      const sending = side.game.flushOutgoing();
      if (sending > 0) opponent.game.receiveGarbage(sending);
      break;
    }
    case 'gameover':
      if (side === (session && session.sides[0])) sound.gameOver();
      finishGame(side);
      break;
    default:
      break;
  }
}

// ------------------------------------------------------------- game loop --

function frame(now) {
  if (!session) return;
  requestAnimationFrame(frame);

  const elapsed = Math.min(MAX_FRAME, (now - lastFrame) / 1000 || 0);
  lastFrame = now;

  if (!session.paused) {
    accumulator += elapsed;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      session.input.update(STEP);
      for (const side of session.sides) {
        if (side.cpu) side.cpu.update(STEP);
        side.game.update(STEP);
      }
    }
  }

  for (const side of session.sides) {
    side.renderer.draw(elapsed);
    side.hud.update(side.game, elapsed);
  }
}

// ---------------------------------------------------------------- screens --

function show(element, visible) {
  if (element) element.hidden = !visible;
}

function openTitle() {
  if (session) {
    // Walking away from a run still banks what it earned -- coins you played
    // for should not evaporate because you went back to the menu.
    bankSession();
    session.input.detach();
    session = null;
  }
  for (const player of dom.players) player.hidden = true;
  show(dom.app, false);
  show(dom.gameOver, false);
  show(dom.pause, false);
  show(dom.title, true);
  refreshBank();
}

function refreshBank() {
  const state = profile.load();
  const words = Object.keys(state.wordBook).length;
  dom.bankTotal.textContent = state.coins.toLocaleString('en-US');
  dom.bankWords.textContent = String(words);
  dom.coinTotal.textContent = state.coins.toLocaleString('en-US');
  const best = [
    ['U-SPEAK', state.best.uspeak],
    ['CLASSIC', state.best.classic],
    ['VS', state.best.versus],
  ]
    .filter(([, value]) => value > 0)
    .map(([label, value]) => `${label} ${value.toLocaleString('en-US')}`)
    .join('  ·  ');
  dom.bankBest.textContent = best ? `BEST  ${best}` : '';
}

/** @param {string} mode 'uspeak' | 'classic' | 'versus' */
function startGame(mode) {
  const settings = profile.saveSettings({
    level: Number(dom.optLevel.value),
    minWordLength: Number(dom.optMinWord.value),
    ghost: dom.optGhost.checked,
    ai: dom.optAi.value,
    sound: dom.optSound.checked,
  });
  sound.setMuted(!settings.sound);
  sound.unlock();

  const versus = mode === 'versus';
  const seed = (Math.random() * 0xffffffff) >>> 0;

  show(dom.title, false);
  show(dom.gameOver, false);
  show(dom.pause, false);
  show(dom.app, true);
  dom.modeBadge.textContent = { uspeak: 'U-SPEAK', classic: 'CLASSIC', versus: 'VS COM' }[mode];

  dom.players[1].hidden = true;
  const sides = [];
  session = { mode, versus, sides, paused: false, finished: false, banked: false, input: null };

  sides.push(createSide(dom.players[0], { mode, settings, seed, versus, cpu: false }));
  if (versus) {
    sides.push(createSide(dom.players[1], { mode, settings, seed, versus, cpu: true }));
  }

  const player = sides[0];
  session.input = new InputController({
    onMove: (direction) => player.game.move(direction),
    onRotate: (direction) => player.game.rotate(direction),
    onSoftDrop: (active) => player.game.setSoftDrop(active),
    onHardDrop: () => player.game.hardDrop(),
    onPause: () => togglePause(),
  });
  session.input.attach(window);
  session.input.attachTouchControls(dom.touch);

  for (const side of sides) side.renderer.resize();
  lastFrame = performance.now();
  accumulator = 0;
  requestAnimationFrame(frame);
}

function togglePause(force) {
  if (!session || session.finished) return;
  session.paused = force === undefined ? !session.paused : force;
  session.input.reset();
  show(dom.pause, session.paused);
  lastFrame = performance.now();
}

/**
 * Writes the current run into the profile.  Safe to call more than once: only
 * the first call for a given session counts, so topping out and then going
 * back to the menu does not bank the same coins twice.
 *
 * @param {boolean|null} won null outside versus
 * @returns {object|null} what the profile made of it
 */
function bankSession(won = null) {
  if (!session || session.banked) return null;
  const player = session.sides[0];
  const game = player.game;
  if (game.score === 0 && game.coins === 0 && won === null) return null;
  session.banked = true;
  return profile.record({
    mode: session.mode,
    score: game.score,
    coins: game.coins,
    maxChain: game.maxChain,
    words: game.wordLog,
    won,
  });
}

/** @param {object} side whichever field just topped out */
function finishGame(side) {
  if (!session || session.finished) return;
  session.finished = true;
  session.paused = true;
  session.input.enabled = false;
  session.input.reset();

  const player = session.sides[0];
  const playerLost = side === player;
  const won = session.versus ? !playerLost : null;

  const banked = bankSession(won)
    || { coins: profile.coins(), newWords: [], isBest: false };

  renderResults(player, { won, banked });
  show(dom.gameOver, true);
  refreshBank();
}

function renderResults(player, { won, banked }) {
  const stats = player.game.stats();
  dom.resultTitle.textContent = won === null ? 'GAME OVER' : won ? 'YOU WIN!' : 'YOU LOSE';

  const items = [
    { label: 'SCORE', value: stats.score.toLocaleString('en-US'), badge: banked.isBest ? 'NEW BEST' : '' },
    { label: 'BEST CHAIN', value: String(stats.maxChain) },
    { label: 'ALL CLEARS', value: String(stats.allClears) },
  ];
  if (session.mode === 'uspeak') {
    items.push({ label: 'WORDS', value: String(stats.words) });
    items.push({ label: 'COINS EARNED', value: stats.coins.toLocaleString('en-US'), coins: true });
  }

  dom.results.replaceChildren();
  for (const { label, value, badge, coins } of items) {
    const item = document.createElement('div');
    item.className = coins ? 'results__item results__item--coins' : 'results__item';
    const title = document.createElement('span');
    title.textContent = label;
    const strong = document.createElement('b');
    strong.textContent = value;
    item.append(title, strong);
    if (badge) {
      const tag = document.createElement('i');
      tag.className = 'results__badge';
      tag.textContent = badge;
      item.append(tag);
    }
    dom.results.append(item);
  }

  dom.resultWords.replaceChildren();
  const fresh = new Set(banked.newWords);
  const seen = new Set();
  for (const entry of player.game.wordLog) {
    if (seen.has(entry.word)) continue;
    seen.add(entry.word);
    const chip = wordChip(entry.word);
    if (entry.length >= 6) chip.classList.add('chip--long');
    else if (fresh.has(entry.word)) chip.classList.add('chip--new');
    dom.resultWords.append(chip);
  }
}

/**
 * A word chip carrying its Japanese, so every list doubles as a vocabulary
 * list rather than a scoreboard.
 *
 * @param {string} word
 * @returns {HTMLElement}
 */
function wordChip(word) {
  const chip = document.createElement('span');
  chip.className = 'chip';
  const english = document.createElement('b');
  english.textContent = word;
  chip.append(english);
  const japanese = dictionary.translate(word);
  if (japanese) {
    const meaning = document.createElement('i');
    meaning.textContent = japanese;
    chip.append(meaning);
  }
  return chip;
}

function openWordBook() {
  const words = profile.wordBook();
  dom.wordbookList.replaceChildren();
  if (!words.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No words yet. Play U-SPEAK mode to start filling this in.';
    dom.wordbookList.append(empty);
  }
  for (const word of words) {
    const chip = wordChip(word);
    if (word.length >= 6) chip.classList.add('chip--long');
    dom.wordbookList.append(chip);
  }
  show(dom.wordbook, true);
}

// ------------------------------------------------------------------ wiring --

/** @param {boolean} on */
function applySound(on) {
  sound.setMuted(!on);
  dom.optSound.checked = on;
  dom.muteButton.textContent = on ? '♪ ON' : '♪ OFF';
  dom.muteButton.setAttribute('aria-pressed', String(!on));
}

function wire() {
  if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) {
    document.body.classList.add('touch-device');
  }

  const settings = profile.load().settings;
  dom.optLevel.value = String(settings.level);
  dom.optLevelOut.value = String(settings.level);
  dom.optMinWord.value = String(settings.minWordLength);
  dom.optAi.value = settings.ai;
  dom.optGhost.checked = Boolean(settings.ghost);
  applySound(Boolean(settings.sound));

  // Browsers will not start audio until the page has been interacted with.
  const startAudio = () => sound.unlock();
  window.addEventListener('pointerdown', startAudio, { once: true });
  window.addEventListener('keydown', startAudio, { once: true });

  dom.muteButton.addEventListener('click', () => {
    const on = !dom.optSound.checked;
    applySound(on);
    profile.saveSettings({ sound: on });
    if (on) sound.unlock();
  });
  dom.optSound.addEventListener('change', () => {
    applySound(dom.optSound.checked);
    profile.saveSettings({ sound: dom.optSound.checked });
  });

  dom.optLevel.addEventListener('input', () => {
    dom.optLevelOut.value = dom.optLevel.value;
  });

  for (const button of dom.title.querySelectorAll('[data-mode]')) {
    button.addEventListener('click', () => startGame(button.dataset.mode));
  }

  document.getElementById('resume-button').addEventListener('click', () => togglePause(false));
  document.getElementById('pause-quit').addEventListener('click', openTitle);
  document.getElementById('retry-button').addEventListener('click', () => {
    const mode = session ? session.mode : 'uspeak';
    startGame(mode);
  });
  document.getElementById('menu-button').addEventListener('click', openTitle);
  dom.quit.addEventListener('click', openTitle);

  document.getElementById('open-wordbook').addEventListener('click', openWordBook);
  document.getElementById('wordbook-close').addEventListener('click', () => show(dom.wordbook, false));
  document.getElementById('wordbook-reset').addEventListener('click', () => {
    const ok = window.confirm('Clear your coins, high scores and word book? This cannot be undone.');
    if (!ok) return;
    profile.clear();
    show(dom.wordbook, false);
    refreshBank();
  });

  window.addEventListener('resize', () => {
    if (!session) return;
    for (const side of session.sides) side.renderer.resize();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && session && !session.finished) togglePause(true);
  });

  refreshBank();
}

wire();

// BLOCKWILD — a whole other game, opened from まちづくり島.
//
// The frame, the exit and the reasons for both live in arcade.js; this file is only the
// two things that are true of THIS guest.
import { createArcade, homeButton } from './arcade.js';
import { allowedIds, SHOP_TO_BLOCKWILD } from './blockwild-blocks.js';
import { t as tr, isJa } from './i18n.js';

// 買った物を覚えておく場所。オンラインのときに書いて、オフラインのときに読む。
// **ここを書き換えれば一人用の砂場でブロックは増やせる。** それでよい：コインは減らず、
// 学習の記録も動かない。改ざんして困るのはサーバーが持っている物だけで、これはその写し。
const CACHE = 'uspeak-blockwild-blocks-v1';

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE)) || []; } catch { return []; }
}
export function cacheBlocks(ids) {
  try { localStorage.setItem(CACHE, JSON.stringify([...new Set(ids || [])])); } catch { /* private window */ }
}

// ブロック屋で買ったものだけを、クリエイティブに出す。
//
// **同梱のゲームは1バイトも触らない。** 代わりに、あちらが自分で公開している開発用フック
// (`window.BLOCKWILD`) と、あちらが描いた DOM を外から使う。同一オリジンの iframe なので
// どちらも普通に届く。やることは2つだけ：
//
//   * 全ブロック一覧（`#creativeGrid`）から、買っていない物を消す。一覧はゲームが持ち物
//     画面を描き直すたびに作り直されるので、作り直されるたびに消す（数えに行くのではなく、
//     作られたときに反応する＝MutationObserver）。
//   * クリエイティブは最初から9個のブロックを手に持たせる。買っていない物はそこからも
//     取り除く（`BLOCKWILD.bag` は公開されている）。
//
// **サバイバルは触っていない。** あちらは「掘って手に入れる」ゲームで、掘ったものまで
// 取り上げるとゲームが成立しない。ブロック屋が面倒を見るのはクリエイティブ＝
// 「買って建てる世界」のほう。
function gate(doc, ownedShopIds) {
  const win = doc.defaultView;
  // Recomputed on every pass: the in-game shop (below) adds to the shelf while the game is open.
  const allowOf = () => allowedIds(typeof ownedShopIds === 'function' ? ownedShopIds() : ownedShopIds);
  let allow = allowOf();
  // What the in-game shop handed over (torches, tools, food…) is the child's: never swept.
  const granted = new Set();

  const prune = () => {
    allow = allowOf();
    for (const cell of doc.querySelectorAll('#creativeGrid [data-cont="creative"]')) {
      if (!allow.has(Number(cell.dataset.i))) cell.remove();
    }
  };
  // The palette is rebuilt whole every time the bag screen is drawn, so react to the
  // rebuild rather than counting on having pruned it once.
  const grid = doc.querySelector('#creativeGrid');
  if (grid) { new win.MutationObserver(prune).observe(grid, { childList: true }); prune(); }

  // …and the same for what the game puts straight into a child's hands.
  const sweep = () => {
    const bag = win.BLOCKWILD?.bag;
    if (!bag?.slots) return;
    let took = false;
    bag.slots.forEach((slot, i) => {
      if (slot && !allow.has(Number(slot.id)) && !granted.has(Number(slot.id))) { bag.slots[i] = null; took = true; }
    });
    if (took) win.BLOCKWILD.selectSlot?.(0);
  };
  sweep();
  const hotbar = doc.querySelector('#hotbar');
  if (hotbar) new win.MutationObserver(sweep).observe(hotbar, { childList: true, subtree: true });

  // And say where blocks come from, in the place a child is looking when they wonder.
  const label = () => {
    const head = doc.querySelector('#creativeBox .rowhead');
    if (!head) return;
    const title = head.querySelector('span');
    if (title) title.textContent = tr('クリエイティブ・もっているブロック（{n}）', { n: allow.size });
    const note = head.querySelector('small');
    if (note) note.textContent = allow.size > 1 ? tr('ブロックは 右上の「U-Speak コインで かう」か、まちづくり島の ブロック屋で かえます。') : tr('まだ き しか ありません。右上の「U-Speak コインで かう」から ふやせます。');
  };
  label();
  return { refresh() { prune(); sweep(); label(); }, grant(id) { granted.add(Number(id)); } };
}

// ---- the shop inside the game ------------------------------------------------------------
// U-Speak coins, shown in the game's own header, and a shop that spends them: the block
// shop's shelf (the same one as まちづくり島's ブロック屋) and the gear a survival game
// wants — swords, a bow, pickaxes, armour, bread, torches. Prices come from the room
// (`bw:shop`), the purchase is made by the room (`bw:buy` → `bw:bought`), and only then is
// the thing put in the child's hands (`BLOCKWILD.give`). Drawn by this file inside the
// game's document, in the game's own look, so the vendored files stay as they are.
const SHOP_CSS = `
#uspeakCoins { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; background:#1b3a2f; color:#f3dfaa; font-weight:800; font-size:14px; letter-spacing:.02em; }
#uspeakCoins small { font-weight:600; opacity:.8; font-size:11px; }
#uspeakShop { padding:5px 12px; border-radius:999px; border:0; background:#e27a2d; color:#fff; font-weight:800; font-size:13px; cursor:pointer; box-shadow:0 2px 0 #9a4a12; }
#uspeakShop:hover { filter:brightness(1.08); }
#uspeakShopBox { position:fixed; inset:0; z-index:60; display:flex; align-items:center; justify-content:center; background:#0b1a14cc; backdrop-filter:blur(3px); }
#uspeakShopBox[hidden] { display:none; }
.usp-panel { width:min(900px,94vw); max-height:92vh; overflow:auto; border-radius:18px; background:#f6f1e4; color:#2b3a2c; box-shadow:0 30px 80px #000a; font-family:system-ui,sans-serif; }
.usp-head { position:sticky; top:0; z-index:1; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 16px; background:#1b3a2f; color:#f3dfaa; border-radius:18px 18px 0 0; }
.usp-head b { font-size:17px; }
.usp-head .usp-coins { font-size:15px; font-weight:800; background:#ffffff22; padding:4px 10px; border-radius:10px; }
.usp-close { width:34px; height:34px; border-radius:10px; border:0; background:#ffffff2a; color:#f3dfaa; font-size:18px; cursor:pointer; }
.usp-body { padding:12px 16px 18px; }
.usp-body h3 { margin:10px 0 6px; font-size:14px; color:#4a6a3a; }
.usp-body h3 small { font-weight:400; color:#8a6a2a; margin-left:6px; }
.usp-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; }
.usp-card { background:#fff; border:1px solid #dfd6c2; border-radius:12px; padding:8px 10px; display:flex; flex-direction:column; gap:4px; font-size:12px; }
.usp-card .big { font-size:30px; line-height:1; }
.usp-card .sw { width:28px; height:28px; border-radius:6px; border:1px solid #0002; }
.usp-card b { font-size:14px; color:#1f3a22; }
.usp-card .price { font-weight:800; color:#a9721e; }
.usp-card button { min-height:34px; border-radius:10px; border:0; background:#4a7338; color:#fff; font-weight:800; cursor:pointer; }
.usp-card button[disabled] { background:#cfc5ad; color:#6b6b60; cursor:not-allowed; }
.usp-card.owned { border-color:#8bbf6a; background:#f3faee; }
.usp-note { font-size:12px; color:#5c6b57; margin:10px 0 0; line-height:1.6; }
.usp-toast { position:fixed; left:50%; bottom:120px; transform:translateX(-50%); z-index:61; background:#1b3a2f; color:#f3dfaa; padding:10px 16px; border-radius:12px; font-weight:800; font-size:15px; pointer-events:none; opacity:0; transition:opacity .2s; }
.usp-toast.on { opacity:1; }
@media (max-width:700px) { #uspeakCoins small { display:none; } #uspeakShop { font-size:12px; padding:5px 9px; } }
`;

function shopUI(doc, { send, shelf, coins, ownedBlocks, close, lang }) {
  const win = doc.defaultView;
  const style = doc.createElement('style'); style.textContent = SHOP_CSS; doc.head.append(style);
  const right = doc.querySelector('#hud-top .topright');
  const badge = doc.createElement('span'); badge.id = 'uspeakCoins';
  const btn = doc.createElement('button'); btn.id = 'uspeakShop'; btn.type = 'button'; btn.textContent = `🛒 ${tr('U-Speak コインで かう')}`;
  if (right) { right.prepend(btn); right.prepend(badge); }
  const box = doc.createElement('div'); box.id = 'uspeakShopBox'; box.hidden = true;
  box.innerHTML = `<div class="usp-panel" role="dialog"><div class="usp-head"><b>🛒 ${tr('U-Speak コインの みせ')}</b><span class="usp-coins">◈ <i>0</i></span><button type="button" class="usp-close" aria-label="close">×</button></div><div class="usp-body"></div></div>`;
  doc.body.append(box);
  const toastEl = doc.createElement('div'); toastEl.className = 'usp-toast'; doc.body.append(toastEl);
  let toastT = 0;
  const say = (msg) => { toastEl.textContent = msg; toastEl.classList.add('on'); win.clearTimeout(toastT); toastT = win.setTimeout(() => toastEl.classList.remove('on'), 2200); };
  const fmt = (n) => Number(n || 0).toLocaleString();
  const paintCoins = () => { const c = coins(); badge.innerHTML = `◈ ${fmt(c)} <small>U-Speak</small>`; const ic = box.querySelector('.usp-coins i'); if (ic) ic.textContent = fmt(c); };
  paintCoins();
  const KIND = { weapon: ['ぶき', 'Weapons'], tool: ['どうぐ', 'Tools'], armor: ['よろい', 'Armor'], food: ['たべもの', 'Food'], light: ['あかり', 'Light'], material: ['ざいりょう', 'Materials'] };
  function render() {
    const body = box.querySelector('.usp-body');
    const { blocks = [], gear = [] } = shelf() || {};
    const c = coins(); const ja = lang();
    const owned = new Set(ownedBlocks() || []);
    const blockCards = blocks.map((b) => {
      const mine = owned.has(b.id);
      const sw = typeof b.color === 'number' ? `#${b.color.toString(16).padStart(6, '0')}` : (b.color || '#ccc');
      return `<div class="usp-card ${mine ? 'owned' : ''}"><span class="sw" style="background:${sw}"></span><b translate="no">${b.word}</b><small translate="no">${b.ja}</small><span class="price">${mine ? '✓ ' + tr('もっている') : `◈ ${b.price}`}</span>${mine ? '' : `<button type="button" data-kind="block" data-id="${b.id}" ${c < b.price ? 'disabled' : ''}>${c < b.price ? tr('コインが たりない') : `🛒 ${tr('かう')}`}</button>`}</div>`;
    }).join('');
    const kinds = [...new Set(gear.map((g) => g.kind))];
    const gearCards = kinds.map((k) => `<h3>${ja ? KIND[k]?.[0] || k : KIND[k]?.[1] || k}</h3><div class="usp-grid">${gear.filter((g) => g.kind === k).map((g) => `<div class="usp-card"><span class="big">${g.emoji}</span><b>${ja ? g.ja : g.en}</b><span class="price">◈ ${g.price}</span><button type="button" data-kind="gear" data-id="${g.id}" ${c < g.price ? 'disabled' : ''}>${c < g.price ? tr('コインが たりない') : `🛒 ${tr('かう')}`}</button></div>`).join('')}</div>`).join('');
    body.innerHTML = `<p class="usp-note">${tr('U-Speak の コインは、島の べんきょうで もらった コイン。ここで つかうと、しまの コインも へる。')}</p>
      <h3>🧱 ${tr('ブロック')} <small>${tr('かうと クリエイティブで つかえる')}</small></h3><div class="usp-grid">${blockCards || `<p class="usp-note">${tr('よみこんで います…')}</p>`}</div>
      ${gearCards}
      <p class="usp-note">${tr('ぶき・どうぐ・よろい・たべものは、いまの もちものに 入る。サバイバルで つかおう。')}</p>`;
    paintCoins();
  }
  box.querySelector('.usp-close').onclick = () => { box.hidden = true; };
  box.addEventListener('click', (e) => {
    if (e.target === box) { box.hidden = true; return; }
    const b = e.target.closest('button[data-kind]');
    if (!b || b.disabled) return;
    b.disabled = true; b.textContent = '…';
    send('bw:buy', { kind: b.dataset.kind, id: b.dataset.id });
  });
  btn.onclick = () => { try { doc.exitPointerLock?.(); } catch { /* fine */ } box.hidden = false; render(); send('bw:shop', {}); };
  const tick = win.setInterval(paintCoins, 1000);
  return {
    render, say, paintCoins,
    stop() { win.clearInterval(tick); },
    bought(m) {
      const g = win.BLOCKWILD;
      if (m.kind === 'gear') {
        for (const id of m.items || []) g?.give?.(id, m.n || 1);
        say(`${m.emoji || '🛒'} ${lang() ? m.ja : m.en} ${tr('を かった！')}`);
      } else {
        const bwId = SHOP_TO_BLOCKWILD[m.id];
        say(`🧱 ${m.word} ${tr('を かった！')}${bwId !== undefined && g?.state?.mode === 'creative' ? ` ${tr('クリエイティブの もちものに 入った')}` : ''}`);
      }
      if (!box.hidden) render(); else paintCoins();
    },
    error(m) {
      say(m.reason === 'not enough coins' ? tr('コインが たりない。') : tr('できなかった: {why}', { why: m.reason }));
      if (!box.hidden) render();
    },
    close() { box.hidden = true; },
  };
}

export function createBlockwild({ toast, onOpen, onClose, ownedBlocks, session, send, shelf }) {
  let ui = null;        // the in-game shop, while the game is open
  let gated = null;
  const arcade = createArcade({
    id: 'blockwild',
    home: './blockwild/index.html',
    name: 'BLOCKWILD',
    hint: 'BLOCKWILD。「← U-Speak」で 島に もどれます。',
    toast,
    onOpen,
    onClose: () => { ui?.stop(); ui = null; gated = null; onClose?.(); },
    settle(doc, { close }) {
      // Its multiplayer opens a WebSocket at `/ws` on this origin, and this server now
      // answers it (server/src/blockwild/server.js): one shared world per class, twenty
      // children at once. So a child who is in a class is put straight into their class's
      // world — name filled in, address filled in, the join pressed for them — because the
      // vendored panel's "type the host's code" is a thing for a living room, not a
      // classroom. The inputs stay in the document (the game reads them by id, and keeps a
      // 20-second timer that reads `#hostCode` and `#menu`); they are only hidden.
      // Offline, or outside a class, it is the single-player sandbox it always was, and the
      // panel says where building together works.
      const me = session?.() || null;
      const status = doc.querySelector('#netStatus');
      if (me?.online && me.classCode) {
        const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/bw/${encodeURIComponent(me.classCode)}/ws`;
        const nameEl = doc.querySelector('#netName'); if (nameEl) nameEl.value = String(me.name || '').slice(0, 16);
        const codeEl = doc.querySelector('#netCode'); if (codeEl) codeEl.value = url;
        const row = doc.querySelector('#netPanel .netrow'); if (row) row.style.display = 'none';
        // While in the shared world, the buttons that would replace it with a local one
        // step aside (新しい世界 / 再開 / 読み込み). 保存 and 書き出し still work: a copy is harmless.
        for (const id of ['new', 'load', 'import']) { const b = doc.getElementById(id); if (b) b.style.display = 'none'; }
        const join = doc.querySelector('#netJoin');
        if (join) join.textContent = 'みんなの 世界に 入る';
        if (status) status.textContent = `クラス「${me.classCode}」の みんなの 世界に つなぎます…（いちどに 20人まで）`;
        setTimeout(() => { if (join && doc.defaultView && !doc.defaultView.BLOCKWILD?.state?.online) join.click(); }, 400);
      } else {
        doc.querySelector('#netPanel .netrow')?.remove();
        doc.querySelector('#netJoin')?.remove();
        if (status) status.textContent = 'ここでは ひとりの 世界です。みんなで つくるには、クラスに 入ってから ひらいてね。';
      }
      // **空の配列も配列なので、長さで見る。** `|| readCache()` だけだと、部屋から
      // まだ棚が届いていないとき（＝オフライン、あるいは入った直後）に空の配列が
      // そのまま通り、前回買った物が消えて見えた。
      gated = gate(doc, () => { const owned = ownedBlocks?.() || []; return owned.length ? owned : readCache(); });
      // U-Speak coins and the shop, in the game's own header. Only with a room to pay.
      if (me?.online && send) {
        ui = shopUI(doc, { send, shelf: () => shelf?.() || {}, coins: () => session?.()?.coins ?? 0, ownedBlocks: () => ownedBlocks?.() || [], close, lang: () => isJa() });
        send('bw:shop', {});
      }
      // Its own menu row, where a child already looks for 保存 and 設定.
      return homeButton(doc, doc.querySelector('.menulinks'), close);
    },
  });
  return Object.assign(arcade, {
    // From the room: the shelf, a purchase, a refusal.
    onShop() { ui?.render(); },
    onBought(m) { if (m.kind === 'gear') for (const id of m.items || []) gated?.grant(id); ui?.bought(m); gated?.refresh(); },
    onError(m) { ui?.error(m); },
    refresh() { gated?.refresh(); ui?.paintCoins(); },
  });
}

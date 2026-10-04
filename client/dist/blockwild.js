// BLOCKWILD — a whole other game, opened from まちづくり島.
//
// The frame, the exit and the reasons for both live in arcade.js; this file is only the
// two things that are true of THIS guest.
import { createArcade, homeButton } from './arcade.js';
import { allowedIds } from './blockwild-blocks.js';

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
  const allow = allowedIds(ownedShopIds);

  const prune = () => {
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
      if (slot && !allow.has(Number(slot.id))) { bag.slots[i] = null; took = true; }
    });
    if (took) win.BLOCKWILD.selectSlot?.(0);
  };
  sweep();
  const hotbar = doc.querySelector('#hotbar');
  if (hotbar) new win.MutationObserver(sweep).observe(hotbar, { childList: true, subtree: true });

  // And say where blocks come from, in the place a child is looking when they wonder.
  const head = doc.querySelector('#creativeBox .rowhead');
  if (head) {
    const title = head.querySelector('span');
    if (title) title.textContent = `クリエイティブ・もっているブロック（${allow.size}）`;
    const note = head.querySelector('small');
    if (note) {
      note.textContent = allow.size > 1
        ? 'ブロックは まちづくり島の ブロック屋で、U-Speak コインで かえます。'
        : 'まだ き しか ありません。まちづくり島の ブロック屋で、U-Speak コインで かいましょう。';
    }
  }
}

export function createBlockwild({ toast, onOpen, onClose, ownedBlocks, session }) {
  return createArcade({
    id: 'blockwild',
    home: './blockwild/index.html',
    name: 'BLOCKWILD',
    hint: 'BLOCKWILD。「← U-Speak」で 島に もどれます。',
    toast,
    onOpen,
    onClose,
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
      const owned = ownedBlocks?.() || [];
      gate(doc, owned.length ? owned : readCache());
      // Its own menu row, where a child already looks for 保存 and 設定.
      return homeButton(doc, doc.querySelector('.menulinks'), close);
    },
  });
}

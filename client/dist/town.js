// まちづくり島 — the block shop, the かぐ屋, the estate agent, and the building HUD.
//
// Two places to put something down, and the HUD serves whichever one a child is in:
// furniture in マイルーム, blocks on the ひろば. Prices, ownership, capacity and every
// piece placed are the server's. This module shows them and sends what a child asks for.
import { blockIcon } from './town-block-icon.js';
import { fullFurniture, FURNITURE_CATEGORIES, FURNITURE_STYLES } from './furniture-data.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (c) => `#${Number(c).toString(16).padStart(6, '0')}`;

export function createTownUI({ send, toast, speak, isOnline, learn, room, plaza }) {
  const state = { shop: null, props: null, spot: null, roomInfo: null };

  const dialog = document.createElement('dialog');
  dialog.id = 'town-dialog';
  dialog.setAttribute('aria-labelledby', 'town-title');
  dialog.innerHTML = `<div class="quiz-head">
      <div><span class="eyebrow">TOWN ISLAND</span><h2 id="town-title">まちづくり島</h2></div>
      <button type="button" id="town-close" aria-label="閉じる">×</button>
    </div><div id="town-body"></div>`;
  document.body.append(dialog);
  const body = () => $('#town-body', dialog);
  const close = () => { try { dialog.close(); } catch { /* already closed */ } };
  // とじたら まだ 焼いて いない 絵の たのみを やめる（下の バーの 分は のこす）。つぎに ひらく ときは 画面を 作りなおす。
  dialog.addEventListener('close', () => { kagu.built = false; kagu.note = ''; const b = $('#town-body', dialog); if (b) b.innerHTML = ''; dropShots(); });
  $('#town-close', dialog).onclick = close;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  // The building HUD: what is in hand, what is left, and the things you can do with it.
  // It has to work with a thumb, so all of them are buttons.
  const hud = document.createElement('aside');
  hud.id = 'room-hud';
  hud.hidden = true;
  hud.innerHTML = `<div class="room-hud-top"><b id="room-hud-name"></b><small id="room-hud-count"></small></div>
    <div id="room-palette" class="room-palette"></div>`;
  // The things you do, where a thumb already is. Minecraft puts them on the right of the
  // screen and so do we, because that is the game these children have already learned.
  const acts = document.createElement('div');
  acts.id = 'room-acts';
  acts.hidden = true;
  acts.innerHTML = `<button type="button" id="room-place">おく<small>Enter</small></button>
    <button type="button" id="room-remove">ほる<small>Q</small></button>
    <button type="button" id="room-turn" hidden>むき<small>R</small></button>
    <button type="button" id="room-exit">そとへ</button>`;
  document.querySelector('main').append(acts);
  document.querySelector('main').append(hud);
  // Whichever place a child is standing in is the one the buttons work on. Only one of
  // the two is ever active: a room is not the plaza.
  const builder = () => (room.active ? room : plaza.active ? plaza : null);
  $('#room-place', acts).onclick = () => builder()?.placeHere();
  $('#room-remove', acts).onclick = () => builder()?.removeHere();
  $('#room-turn', acts).onclick = () => { room.rotate(); refreshHud(); };
  $('#room-exit', acts).onclick = () => builder()?.leave();

  // The door and the square are walked into, so they never ask a child to press anything.
  function label(spot) {
    if (spot.kind === 'shop') return '🧱 ブロックを かう';
    if (spot.kind === 'furniture') return '🛋 かぐを かう';
    if (spot.kind === 'agent') return '🏠 ひっこしの そうだん';
    if (spot.kind === 'plaza') return '🧱 ひろばで つくる';
    if (spot.kind === 'blockwild') return '⛏ BLOCKWILD で あそぶ';
    return '🚪 マイルームに はいる';
  }

  function enter(spot) {
    if (!isOnline()) { toast('まちづくり島は オンラインで あそべます。'); return; }
    state.spot = spot;
    dialog.classList.remove('online-shop', 'kagu');
    dialog.querySelector('#town-title').textContent = 'まちづくり島';
    dialog.querySelector('.eyebrow').textContent = 'TOWN ISLAND';
    if (spot.kind === 'door') { send('room:enter', {}); return; }
    if (spot.kind === 'plaza') { send('plaza:enter', {}); return; }
    kagu.built = false;
    render('よみこみ中…');
    if (!dialog.open) dialog.showModal();
    send(spot.kind === 'furniture' ? 'prop:list' : 'block:list', {});
  }

  // じぶんの へやの パソコンから ひらく オンライン ショップ（2026-11）。中身は かぐ屋と 同じ（prop:list → prop:buy）。
  // 部屋（サーバー）は「かぐ屋の 前」か「じぶんの へやの 中」の ときだけ 売る。買った かぐは すぐ 下の バーに 出る。
  function openOnline() {
    if (!isOnline() || !room.active) return;
    state.spot = { kind: 'furniture', online: true };
    kagu.built = false;
    renderProps(state.props ? '' : 'よみこみ中…');
    if (!dialog.open) dialog.showModal();
    send('prop:list', {});
  }
  room.onShopRequest = openOnline;

  function render(note = '') {
    if (state.spot?.kind === 'agent') { renderAgent(note); return; }
    if (state.spot?.kind === 'furniture') { renderProps(note); return; }
    dialog.classList.remove('kagu');
    if (!state.shop) { body().innerHTML = `<p class="daily-note">${esc(note)}</p>`; return; }
    // ブロックの おみせ（まちづくり島の shop・メインの島の ブロックや）は 題も お店の 名前に（前は「まちづくり島」と 出ていた）。
    dialog.querySelector('#town-title').textContent = 'ブロック屋';
    dialog.querySelector('.eyebrow').textContent = 'BLOCK SHOP';
    body().innerHTML = `${note ? `<p class="ride-flash">${esc(note)}</p>` : ''}
      <p class="daily-note">かった ブロックは、ひろばと BLOCKWILD（ブロックの とびら）で つかえます。BLOCKWILD の クリエイティブに 出てくるのは、ここで かった ブロックだけ。</p>
      <div class="town-blocks">${state.shop.blocks.map((b) => `
        <button type="button" class="town-block ${b.owned ? 'owned' : ''}" data-block="${b.id}" ${b.owned ? 'disabled' : ''}>
          <span class="town-swatch"><img src="${blockIcon(b.id, Number(b.color))}" alt="" draggable="false"></span>
          <strong>${esc(b.word)}</strong><small>${esc(b.ja)}</small>
          <b>${b.owned ? 'もっている' : b.price === 0 ? 'むりょう' : `◈ ${b.price}`}</b>
        </button>`).join('')}</div>
      <div class="quiz-actions"><button type="button" class="primary" id="town-done">とじる</button></div>`;
    for (const b of body().querySelectorAll('[data-block]')) {
      b.onclick = () => { b.disabled = true; send('block:buy', { id: b.dataset.block }); };
    }
    $('#town-done', dialog).onclick = close;
  }

  // ---- かぐ屋と オンライン ショップ（1000 しゅるい いじょう・2026-11 の おわり）---------------------
  // 品ぞろえは furniture-data.js（部屋と 同じ 定義）から ここで 作る。部屋から 来るのは 前からの 31 の きろくと「もっている id」と コインだけ。
  // 画面に 出すのは 1 ページ（PAGE まい）だけ＝カードも 絵も その 分しか 作らない。絵（furniture-real.js の furnitureShot）は
  // 見えて いる カードの 分を 1 まいずつ 焼いて もらい、ページを めくったら まだの 分は やめる。
  // 買うのは 2 回おし：カードを えらぶ → 下の「かう」。値段と もちものを 決めるのは 部屋（prop:buy）。
  const PAGE = 24;
  const kagu = { list: null, byId: new Map(), owned: new Set(), coins: NaN, cat: 'all', style: 'all', q: '', sort: 'rec', own: false, page: 0, pick: '', note: '', built: false };
  const ja = () => { try { return document.documentElement.dataset.lang !== 'en'; } catch { return true; } };
  const L = (en, jp) => `<span class="en">${en}</span><span class="ja">${jp}</span>`;
  const mix = (id) => { let h = 2166136261; for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return h >>> 0; };

  let real = null, realAsked = false;
  function loadReal() {
    if (realAsked) return;
    realAsked = true;
    import('./furniture-real.js').then((m) => { real = m; paintShots(); if (builder() === room) refreshHud(); }).catch(() => { /* 色の 四角の まま */ });
  }
  // いま 出て いる わく（[data-shot]）に 絵を 入れる。まだ 焼けて いない ものは たのんで、できたら 入れる。
  function paintShots(root = document) {
    if (!real) { loadReal(); return; }
    for (const el of root.querySelectorAll('[data-shot]')) {
      const id = el.dataset.shot;
      if (el.dataset.shotDone === id) continue;
      const item = kagu.byId.get(id);
      if (!item) continue;
      const put = (url) => {
        if (!url || el.dataset.shot !== id || !el.isConnected) return;
        el.dataset.shotDone = id; el.style.background = `url(${url}) center/contain no-repeat`;
      };
      const now = real.furnitureShotNow(id);
      if (now) put(now); else real.furnitureShot(item).then(put);
    }
  }
  function dropShots() {
    if (!real) return;
    const keep = new Set([...document.querySelectorAll('[data-shot]')].map((el) => el.dataset.shot));
    real.cancelFurnitureShots(keep);
  }

  try {
    const css = document.createElement('style');
    css.id = 'kagu-css';
    css.textContent = `
#town-dialog.kagu{width:min(1040px,calc(100vw - 20px));height:min(92vh,860px);height:min(92dvh,860px);max-height:none}
#town-dialog.kagu #town-body{display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;overflow:hidden;padding:10px 14px 12px}
.kg-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.kg-top p{margin:0;flex:1;min-width:160px;font-size:13px;color:#4c5f55}
.kg-purse{font-weight:800;font-size:15px;color:#a0522d;white-space:nowrap;background:#fff4d6;border-radius:999px;padding:4px 12px}
.kg-row{display:flex;gap:6px;overflow-x:auto;padding:2px 0 4px;flex:none;scrollbar-width:thin;-webkit-overflow-scrolling:touch}
.kg-chip{flex:none;display:inline-flex;align-items:center;gap:5px;min-height:38px;padding:6px 12px;border:2px solid transparent;border-radius:999px;background:#f1eede;color:#263d33;font:700 13px/1.1 inherit;cursor:pointer;white-space:nowrap}
.kg-chip[aria-pressed="true"]{background:#1b3a2f;color:#fff4d6;border-color:#8ff0c8}
.kg-chip i{width:20px;height:20px;border-radius:50%;border:1px solid rgba(27,58,47,.35);flex:none;display:block}
.kg-chip small{font-size:11px;opacity:.75;font-weight:600}
.kg-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;flex:none}
.kg-tools input,.kg-tools select{min-height:40px;border:2px solid #d9d3bd;border-radius:12px;background:#fff;color:#263d33;font:600 14px/1.2 inherit;padding:6px 10px}
.kg-tools input{flex:1;min-width:130px}
.kg-tools input:focus,.kg-tools select:focus{outline:none;border-color:#e27a2d}
.kg-count{font-size:12px;color:#5d6d62;margin-left:auto;white-space:nowrap}
.kg-grid{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px;align-content:start;padding:2px}
.kg-card{position:relative;display:grid;justify-items:center;gap:2px;padding:8px 6px 9px;border:2px solid transparent;border-radius:14px;background:#f4f2e6;color:#263d33;font:inherit;cursor:pointer;text-align:center;min-width:0}
.kg-card.on{border-color:#e27a2d;background:#fff4d6}
.kg-card.owned{background:#e4f3e6}
.kg-card.owned.on{border-color:#3d6b4a}
.kg-pic{width:84px;height:84px;border-radius:12px;display:block;flex:none}
.kg-card strong{font-size:14px;line-height:1.15;overflow-wrap:anywhere}
.kg-card small{font-size:11px;line-height:1.25;color:#5d6d62;overflow-wrap:anywhere}
.kg-card b{font-size:13px;color:#a0522d}
.kg-card.owned b{color:#2f6b45}
.kg-card.poor b{color:#8a8f96}
.kg-tag{position:absolute;top:5px;right:5px;background:#1b3a2f;color:#8ff0c8;border-radius:999px;font-size:11px;font-weight:800;padding:2px 7px}
.kg-none{grid-column:1/-1;padding:28px 10px;text-align:center;color:#5d6d62;font-size:14px}
.kg-foot{flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.kg-pager{display:flex;align-items:center;gap:6px}
.kg-pager button{min-width:44px;min-height:44px;border-radius:12px;border:0;background:#1b3a2f;color:#fff4d6;font:800 18px/1 inherit;cursor:pointer}
.kg-pager button:disabled{opacity:.35;cursor:default}
.kg-pager span{font-weight:800;font-size:14px;min-width:64px;text-align:center;color:#263d33}
.kg-buy{flex:1;display:flex;align-items:center;gap:10px;min-width:240px;background:#0c241c;color:#fff4d6;border-radius:14px;padding:6px 8px 6px 10px;min-height:56px}
.kg-buy .kg-pic{width:44px;height:44px;border-radius:9px;background-color:rgba(255,255,255,.08)}
.kg-buy div{flex:1;min-width:0;display:grid}
.kg-buy strong{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kg-buy small{font-size:12px;color:#8ff0c8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kg-buy button{flex:none;min-height:44px;padding:8px 18px;border:0;border-radius:12px;background:#ffb066;color:#1b3a2f;font:800 15px/1.1 inherit;cursor:pointer}
.kg-buy button:disabled{background:#3a5347;color:#b9c9bf;cursor:default}
.kg-buy.empty{background:#f1eede;color:#5d6d62;font-size:13px;justify-content:center}
.kg-flash{flex:none;margin:0;padding:7px 12px;border-radius:12px;background:#8ff0c8;color:#0c241c;font-weight:800;font-size:14px}
.kg-close{flex:none;min-height:44px;padding:8px 16px;border:0;border-radius:12px;background:#f1eede;color:#263d33;font:700 14px/1.1 inherit;cursor:pointer}
.room-palette{scrollbar-width:thin;max-width:min(720px,calc(100vw - 48px))}
.room-palette button small{font-size:11px;max-width:66px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.room-palette button i{font-size:11px}
@media (max-height:520px){
  #town-dialog.kagu{height:calc(100vh - 12px);height:calc(100dvh - 12px);width:calc(100vw - 12px);max-width:none}
  #town-dialog.kagu .quiz-head{padding-top:6px;padding-bottom:6px}
  #town-dialog.kagu .quiz-head .eyebrow{display:none}
  #town-dialog.kagu #town-body{overflow-y:auto;gap:5px;padding:6px 10px 0}
  .kg-top p{display:none}
  .kg-top{position:absolute;right:58px;top:8px}
  .kg-grid{overflow:visible;flex:none;grid-template-columns:repeat(auto-fill,minmax(104px,1fr))}
  .kg-pic{width:64px;height:64px}
  .kg-chip{min-height:34px;padding:4px 10px}
  .kg-tools input,.kg-tools select{min-height:36px}
  .kg-foot{position:sticky;bottom:0;background:#fffaf0;padding:5px 0 6px;z-index:2}
  .kg-buy{min-height:48px}
}
@media (max-width:560px){.kg-grid{grid-template-columns:repeat(auto-fill,minmax(98px,1fr))}.kg-count{display:none}}`;
    document.head.append(css);
  } catch { /* 検査（DOM の ない ところ）では 見た目なし */ }

  // いまの しぼりこみに 合う 品（ならべた あと）。
  function kaguFiltered() {
    const q = kagu.q.trim().toLowerCase().replace(/\s+/g, ' '), qj = q.replace(/\s+/g, '');
    let list = (kagu.list || []).filter((f) => (kagu.cat === 'all' || f.cat === kagu.cat)
      && (kagu.style === 'all' || (kagu.style === 'classic' ? !f.style : f.style === kagu.style))
      && (!kagu.own || kagu.owned.has(f.id))
      && (!q || f.word.toLowerCase().includes(q) || f.ja.replace(/\s+/g, '').includes(qj)));
    if (kagu.sort === 'cheap') list = list.slice().sort((a, b) => a.price - b.price || a.rank - b.rank);
    else if (kagu.sort === 'dear') list = list.slice().sort((a, b) => b.price - a.price || a.rank - b.rank);
    else if (kagu.sort === 'name') list = list.slice().sort((a, b) => a.word.localeCompare(b.word));
    else list = list.slice().sort((a, b) => a.rank - b.rank);
    return list;
  }

  const priceText = (f) => (kagu.owned.has(f.id) ? `✓ ${ja() ? 'もっている' : 'Yours'}` : f.price === 0 ? (ja() ? 'むりょう' : 'Free') : `◈ ${f.price}`);

  function kaguGrid() {
    const grid = $('.kg-grid', dialog);
    if (!grid) return;
    const list = kaguFiltered(), pages = Math.max(1, Math.ceil(list.length / PAGE));
    kagu.page = Math.max(0, Math.min(pages - 1, kagu.page));
    const shown = list.slice(kagu.page * PAGE, kagu.page * PAGE + PAGE);
    grid.innerHTML = shown.length ? shown.map((f) => {
      const own = kagu.owned.has(f.id), poor = !own && Number.isFinite(kagu.coins) && kagu.coins < f.price;
      return `<button type="button" class="kg-card${own ? ' owned' : ''}${poor ? ' poor' : ''}${kagu.pick === f.id ? ' on' : ''}" data-prop="${f.id}" aria-pressed="${kagu.pick === f.id}">
        ${own ? `<span class="kg-tag">✓</span>` : ''}<span class="kg-pic" data-shot="${f.id}" style="background:${hex(f.color)}"></span>
        <strong translate="no">${esc(f.word)}</strong><small>${esc(f.ja)}</small><b translate="no">${priceText(f)}</b></button>`;
    }).join('') : `<p class="kg-none">${L('Nothing found. Try another word or filter.', 'みつからなかったよ。ほかの ことばや しぼりこみで さがしてね。')}</p>`;
    grid.scrollTop = 0;
    for (const b of grid.querySelectorAll('[data-prop]')) b.onclick = () => { kagu.pick = b.dataset.prop; kagu.note = ''; for (const o of grid.querySelectorAll('.kg-card')) { const on = o === b; o.classList.toggle('on', on); o.setAttribute('aria-pressed', on); } kaguFoot(); };
    const count = $('.kg-count', dialog);
    if (count) count.innerHTML = L(`${list.length} items`, `${list.length} しゅるい`);
    kagu.pages = pages;
    kaguFoot();
    dropShots();
    paintShots(dialog);
  }

  function kaguFoot() {
    const foot = $('.kg-foot', dialog);
    if (!foot) return;
    const f = kagu.byId.get(kagu.pick), pages = kagu.pages || 1;
    let buy = `<div class="kg-buy empty">${L('Tap a picture to choose.', 'えを おして えらんでね。')}</div>`;
    if (f) {
      const own = kagu.owned.has(f.id), short = Number.isFinite(kagu.coins) ? f.price - kagu.coins : 0;
      const label = own ? L('✓ Yours', '✓ もっている') : short > 0 ? L(`◈ ${short} more`, `あと ◈ ${short}`) : f.price === 0 ? L('Get it', 'もらう') : L(`Buy ◈ ${f.price}`, `◈ ${f.price} で かう`);
      buy = `<div class="kg-buy"><span class="kg-pic" data-shot="${f.id}" style="background:${hex(f.color)}"></span>
        <div><strong translate="no">${esc(f.word)}</strong><small>${esc(f.ja)}・${f.w} × ${f.d} ${ja() ? 'マス' : 'squares'}</small></div>
        <button type="button" id="kg-buy" ${own || short > 0 ? 'disabled' : ''}>${label}</button></div>`;
    }
    foot.innerHTML = `${kagu.note ? `<p class="kg-flash" role="status">${esc(kagu.note)}</p>` : ''}
      <div class="kg-pager"><button type="button" id="kg-prev" aria-label="${ja() ? 'まえの ページ' : 'Previous page'}" ${kagu.page <= 0 ? 'disabled' : ''}>‹</button><span translate="no">${kagu.page + 1} / ${pages}</span><button type="button" id="kg-next" aria-label="${ja() ? 'つぎの ページ' : 'Next page'}" ${kagu.page >= pages - 1 ? 'disabled' : ''}>›</button></div>
      ${buy}<button type="button" class="kg-close" id="town-done">${L('Close', 'とじる')}</button>`;
    $('#kg-prev', foot).onclick = () => { kagu.page -= 1; kaguGrid(); };
    $('#kg-next', foot).onclick = () => { kagu.page += 1; kaguGrid(); };
    $('#town-done', foot).onclick = close;
    const buyBtn = $('#kg-buy', foot);
    if (buyBtn) buyBtn.onclick = () => { buyBtn.disabled = true; send('prop:buy', { id: kagu.pick }); };
    paintShots(foot);
  }

  function renderProps(note = '') {
    const online = !!state.spot?.online;
    dialog.classList.toggle('online-shop', online);
    dialog.classList.add('kagu');
    if (online) {
      dialog.querySelector('#town-title').innerHTML = '<span class="en">🖥 Online Shop</span><span class="ja">🖥 オンライン ショップ</span>';
      dialog.querySelector('.eyebrow').textContent = 'ONLINE SHOP';
    } else if (state.spot?.kind === 'furniture') {
      dialog.querySelector('#town-title').textContent = 'かぐ屋';
      dialog.querySelector('.eyebrow').textContent = 'FURNITURE SHOP';
    }
    if (!kagu.list) { kagu.built = false; body().innerHTML = `<p class="daily-note">${esc(note)}</p>`; return; }
    if (note) kagu.note = note;
    const purse = $('.kg-purse', dialog);
    if (kagu.built && purse) {       // もう 出て いる：たなと 下の バーだけ 描きなおす（さがす らんの 文字と 位置は そのまま）
      purse.textContent = Number.isFinite(kagu.coins) ? `◈ ${kagu.coins}` : '';
      kaguGrid();
      return;
    }
    const chip = (kind, id, inner, on) => `<button type="button" class="kg-chip" data-${kind}="${id}" aria-pressed="${on}">${inner}</button>`;
    const total = kagu.list.length;
    body().innerHTML = `
      <div class="kg-top"><p>${online
    ? L('Choose a picture, then press Buy. It goes straight into the bar at the bottom of your room.', 'えを えらんで「かう」を おしてね。かった かぐは すぐ へやの 下の バーに 出るよ。')
    : L('Choose a picture, then press Buy. You can put it in your room any time.', 'えを えらんで「かう」を おしてね。かった かぐは マイルームに いつでも おけるよ。')}</p>
        <b class="kg-purse" translate="no">${Number.isFinite(kagu.coins) ? `◈ ${kagu.coins}` : ''}</b></div>
      <div class="kg-row" role="group" aria-label="${ja() ? 'しゅるい' : 'Category'}">
        ${chip('cat', 'all', `🏠 ${L('All', 'ぜんぶ')} <small translate="no">${total}</small>`, kagu.cat === 'all')}
        ${FURNITURE_CATEGORIES.map((c) => chip('cat', c.id, `${c.icon} ${L(c.en, c.ja)}`, kagu.cat === c.id)).join('')}</div>
      <div class="kg-row" role="group" aria-label="${ja() ? 'いろ・スタイル' : 'Style'}">
        ${chip('style', 'all', `🎨 ${L('Any style', 'どの スタイルも')}`, kagu.style === 'all')}
        ${chip('style', 'classic', `<i style="background:conic-gradient(#e58f6a,#f7d774,#8ff0c8,#6fa8dc,#e58f6a)"></i>${L('Classic', 'クラシック')}`, kagu.style === 'classic')}
        ${FURNITURE_STYLES.map((s) => chip('style', s.id, `<i style="background:${s.sw}"></i><span class="en" translate="no">${esc(s.en)}</span><span class="ja">${esc(s.ja.replace(/[のい]$/, ''))}</span>`, kagu.style === s.id)).join('')}</div>
      <div class="kg-tools">
        <input type="search" id="kg-q" inputmode="search" enterkeyhint="search" autocomplete="off" maxlength="30" value="${esc(kagu.q)}" placeholder="${ja() ? '🔍 なまえで さがす（れい：sofa・ベッド）' : '🔍 Search by name (sofa, bed…)'}" aria-label="${ja() ? 'なまえで さがす' : 'Search by name'}">
        <select id="kg-sort" aria-label="${ja() ? 'ならべかた' : 'Sort'}">${[['rec', 'Recommended', 'おすすめ'], ['cheap', 'Price: low to high', 'やすい じゅん'], ['dear', 'Price: high to low', 'たかい じゅん'], ['name', 'Name A–Z', 'なまえ A–Z']].map(([v, en, jp]) => `<option value="${v}" ${kagu.sort === v ? 'selected' : ''}>${ja() ? jp : en}</option>`).join('')}</select>
        ${chip('own', '1', `✓ ${L('Mine', 'もっている')}`, kagu.own)}
        <span class="kg-count"></span></div>
      <div class="kg-grid"></div>
      <div class="kg-foot"></div>`;
    kagu.built = true;
    const press = (kind, id) => { for (const b of body().querySelectorAll(`[data-${kind}]`)) b.setAttribute('aria-pressed', b.dataset[kind] === id); };
    for (const b of body().querySelectorAll('[data-cat]')) b.onclick = () => { kagu.cat = b.dataset.cat; kagu.page = 0; press('cat', kagu.cat); kaguGrid(); };
    for (const b of body().querySelectorAll('[data-style]')) b.onclick = () => { kagu.style = b.dataset.style; kagu.page = 0; press('style', kagu.style); kaguGrid(); };
    const own = body().querySelector('[data-own]');
    own.onclick = () => { kagu.own = !kagu.own; kagu.page = 0; own.setAttribute('aria-pressed', kagu.own); kaguGrid(); };
    const q = $('#kg-q', dialog);
    let typing = 0;
    q.oninput = () => { clearTimeout(typing); typing = setTimeout(() => { kagu.q = q.value; kagu.page = 0; kaguGrid(); }, 180); };
    // さがす らんの 中の キーは ゲームに わたさない（WASD で 歩かない・E で お店が とじない）。
    for (const ev of ['keydown', 'keyup', 'keypress']) q.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'keydown' && e.key === 'Enter') { e.preventDefault(); q.blur(); } });
    $('#kg-sort', dialog).onchange = (e) => { kagu.sort = e.target.value; kagu.page = 0; kaguGrid(); };
    for (const row of body().querySelectorAll('.kg-row')) row.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { row.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    kaguGrid();
  }

  function renderAgent(note = '') {
    dialog.classList.remove('kagu');
    const info = state.roomInfo;
    const next = info?.next;
    body().innerHTML = `${note ? `<p class="ride-flash">${esc(note)}</p>` : ''}
      <p class="daily-note">いまの へや：<b>${esc(info?.name || '—')}</b>${info ? `（${info.grid} × ${info.grid}・かぐ ${info.cap} こまで）` : ''}</p>
      ${next
        ? `<div class="town-move">
            <div><strong>${esc(next.name)}</strong><small>${next.grid} × ${next.grid}・かぐ ${next.props} こまで</small></div>
            <div class="town-move-need"><span>◈ ${next.price}</span><small>Lv.${next.level} から</small></div>
            <button type="button" class="primary" id="town-move">ひっこす</button>
          </div><p class="daily-note">いま おいた かぐは、そのまま ひっこし先にも のこります。</p>`
        : '<p class="daily-note">いちばん おおきな へやに すんでいます。</p>'}
      <div class="quiz-actions"><button type="button" id="town-done">とじる</button></div>`;
    const move = $('#town-move', dialog);
    if (move) move.onclick = () => { move.disabled = true; send('room:move', {}); };
    $('#town-done', dialog).onclick = close;
  }

  // ---- what the server says ---------------------------------------------------------

  function onShop(m) {
    state.shop = m;
    if (dialog.open && state.spot?.kind === 'shop') render();
  }

  function onBought(m) {
    speak(m.word);
    learn(m.word, m.ja);
    onShop(m);
    render(`${m.word}（${m.ja}）の ブロックを かいました！`);
  }

  function onPropShop(m) {
    state.props = m;
    // 品ぞろえは 1 回だけ 作る（前からの 31 の きろくは 部屋から、のこりは furniture-data.js）。「おすすめ」の じゅん＝前からの 品 → まぜた じゅん。
    if (!kagu.list && Array.isArray(m.furniture)) {
      kagu.list = fullFurniture(m.furniture.map(({ owned, ...f }) => f));
      kagu.list.forEach((f, i) => { f.rank = f.style ? 1000 + (mix(f.id) % 100000) : i; });
      kagu.byId = new Map(kagu.list.map((f) => [f.id, f]));
    }
    kagu.owned = new Set(Array.isArray(m.owned) ? m.owned : (m.furniture || []).filter((f) => f.owned).map((f) => f.id));
    kagu.coins = Number(m.coins);
    if (dialog.open && state.spot?.kind === 'furniture') renderProps();
  }

  function onPropBought(m) {
    speak(m.word);
    learn(m.word, m.ja);
    onPropShop(m);
    // へやの 中で 買った（オンライン ショップ）：すぐ 手に もって 下の バーに 出す。置くのは 子ども。
    if (room.active) { room.addOwned(m.id, kagu.byId.get(m.id)); refreshHud(); }
    kagu.pick = m.id;
    if (dialog.open && state.spot?.kind === 'furniture') renderProps(ja() ? `${m.word}（${m.ja}）を かいました！` : `You bought the ${m.word}!`);
  }

  // The catalogue whatever is being built from: furniture in the room, blocks on the
  // plaza. Before a shop list has arrived, the palette a builder is already holding is
  // the best colour source there is.
  const catalogueFor = (which) => (which === 'furniture'
    ? kagu.list || [...(room.state.palette?.values?.() || [])]
    : state.shop?.blocks || [...(plaza.state.palette?.values?.() || [])]);

  function paletteHtml() {
    const active = builder();
    if (!active) return '';
    const owned = active.state.owned || [];
    const list = catalogueFor(active === room ? 'furniture' : 'blocks');
    return owned.map((id) => {
      const item = list.find((x) => x.id === id) || active.state.palette.get(id);
      const color = item ? hex(item.color) : '#999';
      // 手に もつ ものの 絵：ブロックは お店と 同じ 立方体の 絵、かぐは 3D の 絵（できて いれば）。なければ 色。
      let pic = '';
      try { pic = active === room ? (real?.furnitureShotNow(id) || '') : (item ? blockIcon(id, Number(item.color), 26) : ''); } catch { pic = ''; }
      const look = pic ? `background:url(${pic}) center/contain no-repeat` : `background:${color}`;
      const shot = active === room ? ` data-shot="${id}"${pic ? ` data-shot-done="${id}"` : ''}` : '';
      const slot = owned.indexOf(id) + 1;
      return `<button type="button" data-hand="${id}" class="${active.hand === id ? 'on' : ''}" title="${esc(item?.word || id)}">
        <i>${slot <= 9 ? slot : ''}</i><span${shot} style="${look}"></span><small translate="no">${esc(item?.word || id)}</small></button>`;
    }).join('');
  }

  function refreshHud() {
    const active = builder();
    acts.hidden = !active;
    if (!active) { hud.hidden = true; return; }
    hud.hidden = false;
    $('#room-turn', acts).hidden = active !== room;
    $('#room-remove', acts).firstChild.nodeValue = active === room ? 'かたづけ' : 'ほる';
    $('#room-hud-name', hud).textContent = active.state.room?.name || '';
    $('#room-hud-count', hud).textContent = `${active.state.used} / ${active.state.cap}`;
    const palette = $('#room-palette', hud);
    palette.innerHTML = paletteHtml();
    for (const b of palette.querySelectorAll('[data-hand]')) {
      b.onclick = () => { active.setHand(b.dataset.hand); refreshHud(); };
    }
    // かぐが ふえても 使える ように：よこに スクロール（マウスの ホイールでも）、手に もった ものが 見える 位置へ。絵は 見えて いる 分を あとから 入れる。
    if (!palette.dataset.wheel) { palette.dataset.wheel = '1'; palette.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { palette.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false }); }
    if (palette.dataset.hand !== active.hand) { palette.dataset.hand = active.hand || ''; try { palette.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch { /* 古い ブラウザ */ } }
    if (active === room) paintShots(palette);
  }

  // The door was walked into: build the room and show the HUD.
  function onRoomState(m) {
    state.roomInfo = m;
    close();
    room.enter(m, catalogueFor('furniture'));
    refreshHud();
    toast(`${m.name}。かぐを えらんで「おく」。「かたづけ」で 手に もどして うごかせるよ。`);
  }

  // The square was walked into: the child's own lot, and the blocks they have bought.
  function onPlazaState(m) {
    close();
    plaza.enter(m, catalogueFor('blocks'));
    refreshHud();
    toast('ひろば。ブロックを えらんで「おく」。');
  }

  function onMoved(m) {
    state.roomInfo = m.room;
    render(`${m.room.name} に ひっこしました！`);
    if (room.active) { room.enter(m.room, catalogueFor('furniture')); refreshHud(); }
  }

  function said(m) {
    return {
      'too far': m.spot ? `${m.spot.name} まで あるいて いこう。` : 'もっと 近づいてね。',
      'already yours': 'もう もっています。',
      'not enough coins': `あと ◈ ${Math.max(0, (m.need || 0) - (m.coins || 0))} たりません。`,
      'level too low': `レベル ${m.need} から ひっこせます。`,
      'biggest already': 'いちばん おおきな へやに すんでいます。',
      'no such block': 'そのブロックは ありません。',
      'no such furniture': 'その かぐは ありません。',
    }[m.reason];
  }

  function onError(m) {
    const text = said(m);
    if (text) { toast(text); if (dialog.open) { if (state.spot?.kind === 'furniture') kagu.note = text; render(); } return; }
    room.onError(m);
  }

  function onPlazaError(m) {
    const text = said(m);
    if (text) { toast(text); return; }
    plaza.onError(m);
  }

  return {
    state, enter, label, onShop, onBought, onPropShop, onPropBought, onRoomState, onPlazaState,
    onMoved, onError, onPlazaError, refreshHud, openOnline,
    // Anything arriving or leaving changes the count in the HUD.
    onPlaced(m) { room.onPlaced(m); refreshHud(); },
    onRemoved(m) { room.onRemoved(m); refreshHud(); },
    onPlazaPlaced(m) { plaza.onPlaced(m); refreshHud(); },
    onPlazaRemoved(m) { plaza.onRemoved(m); refreshHud(); },
    hideHud() { hud.hidden = true; acts.hidden = true; },
    // Number keys pick what is in hand, exactly as they do in the game this borrows from.
    pickSlot(n) {
      const active = builder();
      const id = (active?.state.owned || [])[n - 1];
      if (id) { active.setHand(id); refreshHud(); }
    },
    turn() { if (room.active) { room.rotate(); refreshHud(); } },
    // The two shop lists double as the palettes' colours, so ask for them once on
    // arrival. Asked for on joining, before the mode has settled to online: the send is a
    // no-op while there is no room, and the answers are what colour the palettes.
    prime() { if (!state.shop) send('block:list', {}); if (!state.props) send('prop:list', {}); },
  };
}

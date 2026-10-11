// おなか（右上の 🍗 ゲージ・どの島でも）と メインの島の 3 つの屋台。
//
// おなかの 数・値段・かばんの中身は 部屋が決める（server/src/game/food.js）。ページは 届いた数を
// 同じ はやさで 減らして 見せ、押されたら 頼むだけ（food:open / food:buy / food:eat）。
// 0 に なっても しなない。歩くのが おそく なるだけ（speedFactor → net.speed）。
import { t as tr, isJa, onLangChange } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (en, ja) => `<b class="en">${en}</b><i class="ja">${ja}</i>`;
const ICONS = 10;

export function createFoodUI({ send, toast, speak, isOnline, onCoins = () => {}, onBagOpen = null, onChange = () => {}, onGoFood = null }) {
  const state = { hunger: 20, max: 20, rateMs: 0, slow: 0.6, at: performance.now(), bag: [], shop: '', menu: null, coins: 0, warned: '' };

  // ---- 右上の ゲージ ----
  const gauge = document.createElement('button');
  gauge.type = 'button';
  gauge.id = 'hunger';
  gauge.hidden = true;
  gauge.setAttribute('aria-label', 'もちもの と おなか');
  gauge.dataset.tLabel = 'もちもの と おなか';
  // 🎒 だけでは 押せると 分からなかった：「もちもの ›」の 札を つける（言語で 書きかえる）。
  gauge.innerHTML = `<span class="hg-bag" aria-hidden="true">🎒</span><span class="hg-cap"></span><span class="hg-icons" aria-hidden="true">${Array.from({ length: ICONS }, () => '<i></i>').join('')}</span><span class="hg-go" aria-hidden="true">›</span>`;
  const capPaint = () => { gauge.querySelector('.hg-cap').textContent = tr('もちもの'); };
  capPaint();
  onLangChange(capPaint);
  gauge.onclick = () => (onBagOpen ? onBagOpen() : openBag());
  document.body.append(gauge);

  // ---- おなかが すいた ときの 帯（上の まんなか）。0 の 間は 消えない。少ない ときは やさしく。 ----
  // 何が おきているか（歩くのが おそい わけ）と、どうすれば いいか（たべる・かう）を いっしょに 見せる。
  const notice = document.createElement('div');
  notice.id = 'hunger-notice';
  notice.hidden = true;
  notice.setAttribute('role', 'status');
  notice.innerHTML = `<span class="hn-ic" aria-hidden="true">🍗</span><span class="hn-text"><b class="hn-en en" translate="no"></b><i class="hn-ja"></i></span>
    <button type="button" class="hn-go"></button><button type="button" class="hn-x" aria-label="とじる" data-t-label="とじる">✕</button>`;
  document.body.append(notice);
  let noticeHiddenFor = '';
  $('.hn-x', notice).onclick = () => { noticeHiddenFor = notice.dataset.level || ''; notice.hidden = true; };
  $('.hn-go', notice).onclick = () => {
    if (state.bag.length || !onGoFood) (onBagOpen ? onBagOpen() : openBag());
    else onGoFood();
  };
  function paintNotice(level) {
    const busy = document.body.dataset.arcade || document.body.dataset.race || document.body.dataset.gp || document.body.dataset.main || document.body.classList.contains('on-journey');
    if (!level || !isOnline() || busy || noticeHiddenFor === level) { notice.hidden = true; if (!level) noticeHiddenFor = ''; return; }
    const food = state.bag.length > 0;
    const [en, ja] = level === 'empty'
      ? ["You're hungry, so you walk slowly. Buy food to walk fast again!", 'おなかが すいてるよ。ごはんを かって、あるく スピードを あげよう！']
      : ['Getting hungry. Eat something soon!', 'おなかが すいてきたよ。はやめに たべよう。'];
    notice.dataset.level = level;
    $('.hn-en', notice).textContent = en;
    $('.hn-ja', notice).textContent = ja;
    $('.hn-go', notice).innerHTML = food || !onGoFood ? bi('🎒 Eat', '🎒 たべる') : bi('🏠 Buy food', '🏠 かいに いく');
    notice.hidden = false;
  }

  // ---- 屋台と かばんの 画面 ----
  const dialog = document.createElement('dialog');
  dialog.id = 'food-dialog';
  dialog.innerHTML = `<div class="fd-head"><span class="fd-icon" id="fd-icon">🍎</span><div><small id="fd-kicker"></small><h2 id="fd-title"></h2></div>
      <span class="fd-coins">◈ <b id="fd-coins">0</b></span><button type="button" class="fd-x" aria-label="とじる" data-t-label="とじる">✕</button></div>
    <div id="fd-body"></div>`;
  document.body.append(dialog);
  const body = $('#fd-body', dialog);
  $('.fd-x', dialog).onclick = () => dialog.close();
  dialog.addEventListener('close', () => { state.shop = ''; state.menu = null; });

  const now = () => Math.max(0, state.hunger - (state.rateMs ? (performance.now() - state.at) / state.rateMs : 0));
  function apply(m) {
    if (!m) return;
    if (Number.isFinite(m.hunger)) { state.hunger = m.hunger; state.at = performance.now(); }
    if (m.max) state.max = m.max;
    if (m.rateMs !== undefined) state.rateMs = m.rateMs;
    if (m.slow) state.slow = m.slow;
    if (Array.isArray(m.bag)) state.bag = m.bag;
    if (m.wallet) { state.coins = m.wallet.coins; onCoins(m.wallet); }
    paintGauge();
    if (dialog.open) paint();
    onChange();
  }

  function paintGauge() {
    const h = now();
    const per = state.max / ICONS;
    gauge.querySelectorAll('.hg-icons i').forEach((el, i) => {
      const left = h - i * per;
      el.className = left >= per - 0.01 ? 'full' : left > 0.01 ? 'half' : '';
    });
    gauge.classList.toggle('low', h <= state.max * 0.3);
    gauge.classList.toggle('empty', h <= 0);
    gauge.title = `${Math.ceil(h)} / ${state.max}`;
    // 少なくなったとき・0 に なったとき：上の 帯（0 の 間は 出しっぱなし。✕ で その だんかいの 間だけ 消せる）。
    const level = !state.rateMs ? '' : h <= 0 ? 'empty' : h <= state.max * 0.3 ? 'low' : '';
    state.warned = level;
    paintNotice(level);
  }
  setInterval(() => { gauge.hidden = !isOnline() || document.body.dataset.arcade || document.body.dataset.race || document.body.dataset.gp ? true : false; if (!gauge.hidden) paintGauge(); else paintNotice(''); }, 1000);

  const fillIcons = (n) => `${'🍗'.repeat(Math.floor(n / 2))}${n % 2 ? '½' : ''}`;
  function itemCard(it) {
    const have = state.bag.find((b) => b.id === it.id)?.n || 0;
    const poor = state.coins < it.price;
    return `<div class="fd-item"><span class="fd-emoji">${it.icon}</span>
      <div class="fd-name" translate="no"><b>${esc(it.en)}</b><small>${esc(it.ja)}</small></div>
      <p class="fd-fill">${fillIcons(it.fill)} <small>+${it.fill}</small></p>
      <button type="button" class="fd-buy" data-buy="${esc(it.id)}" ${poor ? 'disabled' : ''}>${poor ? bi(`◈ ${it.price}`, `◈ ${it.price}`) : bi(`Buy ◈ ${it.price}`, `かう ◈ ${it.price}`)}</button>
      ${have ? `<span class="fd-have">×${have}</span>` : ''}</div>`;
  }
  function bagRow() {
    if (!state.bag.length) return `<p class="fd-empty">${bi('Your bag is empty. Buy food at the stalls on the Main Island.', 'かばんは からっぽ。メインの島の やたいで かえるよ。')}</p>`;
    const full = now() >= state.max - 0.01;
    return `<div class="fd-bag">${state.bag.map((b) => `<button type="button" class="fd-eat" data-eat="${esc(b.id)}" ${full ? 'disabled' : ''}><span class="fd-emoji">${b.icon}</span><span translate="no">${esc(b.en)}</span><small>×${b.n} · +${b.fill}</small></button>`).join('')}</div>
      ${full ? `<p class="fd-fine">${bi('You are full!', 'おなか いっぱい！')}</p>` : `<p class="fd-fine">${bi('Tap to eat.', 'おすと たべるよ。')}</p>`}`;
  }
  function meter() {
    const h = now();
    return `<div class="fd-meter"><span>🍗</span><i style="--p:${(h / state.max) * 100}%"></i><b>${Math.ceil(h)} / ${state.max}</b></div>`;
  }
  function paint() {
    $('#fd-coins', dialog).textContent = state.coins.toLocaleString();
    if (state.menu) {
      const m = state.menu;
      $('#fd-icon', dialog).textContent = m.icon;
      $('#fd-kicker', dialog).textContent = 'MAIN ISLAND · STALL';
      $('#fd-title', dialog).innerHTML = bi(esc(m.en), esc(m.ja));
      body.innerHTML = `${meter()}<div class="fd-items">${m.items.map(itemCard).join('')}</div>
        <h3 class="fd-h3">${bi('🎒 Your bag', '🎒 かばん')}</h3>${bagRow()}`;
    } else {
      $('#fd-icon', dialog).textContent = '🎒';
      $('#fd-kicker', dialog).textContent = 'HUNGER';
      $('#fd-title', dialog).innerHTML = bi('Your bag', 'かばん');
      body.innerHTML = `${meter()}${bagRow()}`;
    }
    body.querySelectorAll('[data-buy]').forEach((b) => { b.onclick = () => { b.disabled = true; send('food:buy', { shop: state.shop, id: b.dataset.buy }); }; });
    body.querySelectorAll('[data-eat]').forEach((b) => { b.onclick = () => { b.disabled = true; send('food:eat', { id: b.dataset.eat }); }; });
  }

  // メインの島の 屋台の前（戸口）で。部屋が 屋台の前か 確かめて メニューを 返す。
  function openShop(shop) {
    if (!isOnline()) { toast(tr('オンラインで あそべます。')); return; }
    state.shop = shop;
    send('food:open', { shop });
  }
  function openBag() {
    if (!isOnline()) return;
    state.shop = ''; state.menu = null;
    paint();
    if (!dialog.open) dialog.showModal();
    send('food:get', {});
  }

  function onMenu(m) { state.menu = m; state.shop = m.shop; apply(m); paint(); if (!dialog.open) dialog.showModal(); }
  function onBought(m) {
    apply(m);
    const it = state.menu?.items.find((x) => x.id === m.id);
    if (it) { toast(`${it.icon} ${tr('かったよ！')}`); speak?.(it.en, { japanese: false, rate: 0.85 }); }
  }
  function onAte(m) {
    apply(m);
    const b = m.bag.find((x) => x.id === m.id);
    toast(`😋 +${Math.round(m.gained)} 🍗`);
    if (b || m.id) speak?.(`Yum! ${b?.en || ''}`.trim(), { japanese: false, rate: 0.9 });
    gauge.classList.remove('yum'); void gauge.offsetWidth; gauge.classList.add('yum');
  }
  function onError(m) {
    const why = { 'too far': 'やたいの まえに たってね。', 'not enough coins': 'コインが たりないよ。', 'bag full': 'かばんが いっぱい（1しゅるい 9こ まで）。', full: 'おなか いっぱい！', 'none left': 'もう ないよ。' }[m.reason] || m.reason;
    toast(tr(why));
    if (dialog.open) paint();
  }

  onLangChange(() => { if (dialog.open) paint(); paintGauge(); });

  return {
    openShop, openBag, apply, onMenu, onBought, onAte, onError,
    // 歩く はやさに かける 数（0 で おそく）。
    speedFactor: () => (isOnline() && state.rateMs && now() <= 0 ? state.slow : 1),
    get hunger() { return now(); }, state, gauge, notice,
  };
}

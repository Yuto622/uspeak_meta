// よみあげ（🔊）— 幼児モードの どの 画面でも 使える 1 つの ボタン。
//
// 🔊 を おす → 「よんで ほしい ところを おしてね」→ つぎに さわった 文・ボタン・えらぶ ものを 読む（その 1 回は 押した ことに しない）。
// 画面ごとに 🔊 を つけて 回らなくても、宿題・クイズ・本だな・お店・ちず…… ぜんぶの 文が 読める。
// 日本語は 日本語の 声、英語は 英語の 声（speech.js の playVoice＝自然な 声。出なければ ブラウザーの 声）。
// ひらいて いる 画面（<dialog>）は いちばん 上の 層に 出るので、ボタンは その 中へ うつす（そうしないと かくれる）。
import { playVoice, stopVoice } from './speech.js';
import { isJa } from './i18n.js';

const JA = /[ぁ-んァ-ヶ一-龯]/;
// 絵文字・記号は 読まない（「星」「矢印」と 読んで しまう）。
const clean = (s) => String(s || '').replace(/[\p{Extended_Pictographic}‍️◈✦✧★☆→←↩⏏♫]/gu, ' ').replace(/\s+/g, ' ').trim();

export function createReadAloud({ speak = null, isOn = () => false } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'ra-button'; btn.hidden = true; btn.setAttribute('translate', 'no');
  btn.innerHTML = '<span aria-hidden="true">🔊</span><small><b class="en">Read it</b><i class="ja">よんで</i></small>';
  btn.setAttribute('aria-label', 'よみあげ：おしてから よんで ほしい ところを おす');
  const tip = document.createElement('div');
  tip.id = 'ra-tip'; tip.hidden = true; tip.setAttribute('translate', 'no');
  document.body.append(btn, tip);
  let armed = false; let timer = 0;

  const say = (text) => {
    const t = clean(text).slice(0, 220);
    if (!t) return false;
    const japanese = JA.test(t);
    try { stopVoice(); playVoice(t, { japanese, fallback: () => speak?.(t, { japanese }) }); } catch { /* 声が 出なくても 画面は つかえる */ }
    return true;
  };
  function arm(on) {
    armed = on; clearTimeout(timer);
    btn.classList.toggle('on', on); tip.hidden = !on;
    if (on) {
      document.body.dataset.ra = '1';
      tip.textContent = isJa() ? '👆 よんで ほしい ところを おしてね' : '👆 Tap what you want to hear';
      say(isJa() ? 'よんで ほしい ところを おしてね' : 'Tap what you want to hear');
      timer = setTimeout(() => arm(false), 12000);
    } else delete document.body.dataset.ra;
  }
  btn.addEventListener('click', (e) => { e.stopPropagation(); arm(!armed); });

  // さわった ところの 文。小さい 入れ物から 外へ さがす（ボタン・えらぶ もの・見出し・1 つの 文）。
  function textAt(target) {
    let el = target instanceof Element ? target : target?.parentElement;
    for (let i = 0; el && i < 7; i += 1, el = el.parentElement) {
      if (el === document.body || el.tagName === 'DIALOG' || el.tagName === 'CANVAS') break;
      const own = clean(el.innerText);
      if (own && own.length <= 220) {
        // さわった ところが 英語だけ・日本語だけ なら それを 読む（英語の 題名と 日本語の 説明を まぜて 読まない）。
        // 絵だけを さわった ときは、その ボタン ぜんたいを 読む。
        if (i === 0) return own;
        const host = el.closest('button, [role="button"], a, label, li, h1, h2, h3, h4, p');
        const whole = host ? clean(host.innerText) : '';
        return whole && whole.length <= 220 ? whole : own;
      }
      const label = clean(el.getAttribute?.('aria-label') || el.getAttribute?.('title'));
      if (label && /^(BUTTON|A|IMG)$/.test(el.tagName)) return label;
    }
    return '';
  }
  // 読む 1 回は「押した」ことに しない（つかまえる 段で 止める）。
  for (const type of ['click', 'pointerdown', 'pointerup', 'mousedown', 'touchstart']) {
    addEventListener(type, (e) => {
      if (!armed || btn.contains(e.target)) return;
      e.stopImmediatePropagation();
      // さわりはじめを 止めると 指では click が 来なく なるので、止めるのは click だけ。
      if (type !== 'click') return;
      if (e.cancelable) e.preventDefault();
      const text = textAt(e.target);
      if (text) say(text); else say(isJa() ? 'ここには もじが ないよ' : 'No words here');
      arm(false);
    }, { capture: true, passive: false });
  }

  // ひらいて いる 画面の 中へ うつす（いちばん 上の 層の 上には 出られない ため）。
  function place() {
    const on = isOn();
    btn.hidden = !on;
    if (!on) { if (armed) arm(false); return; }
    const open = [...document.querySelectorAll('dialog[open]')].filter((d) => d.id !== 'net-lobby');
    const host = open.length ? open[open.length - 1] : document.body;
    if (btn.parentElement !== host) { host.append(btn, tip); }
  }
  setInterval(place, 400);
  addEventListener('uspeak:kids', place);
  return { arm, place, say, get armed() { return armed; } };
}

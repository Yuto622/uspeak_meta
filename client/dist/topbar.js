// 上の バーの ボタンに ことばの 札を つける（👕 だけでは 押せると 分からなかった）。
// 札は CSS の ::after が data-cap を 出す。言語を かえたら 書きなおす。ボタンが あとから できても（⏏ は net-client）見る。
import { t as tr, isJa, onLangChange } from './i18n.js';

const CAPS = {
  '#avatar-button': 'すがた',
  '#wear-button': 'きせかえ',
  '#sound': 'おと',
  '#help': 'あそびかた',
  '#logout-button': 'ログアウト',
};

export function labelTopBar() {
  const paint = () => {
    for (const [sel, ja] of Object.entries(CAPS)) {
      const el = document.querySelector(sel);
      if (el) { el.dataset.cap = tr(ja); el.title = tr(ja); }
    }
    const lang = document.querySelector('#lang-toggle');
    if (lang) lang.dataset.cap = isJa() ? 'English' : '日本語';
    const rec = document.querySelector('#record-button');
    if (rec) rec.title = tr('マイページ');
  };
  paint();
  onLangChange(paint);
  return { refresh: paint };
}

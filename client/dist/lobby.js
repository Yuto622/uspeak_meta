// Join dialog: name (student identity), class code, optional teacher key. Offline play stays available.
//
// **この教材で最初に読む文字がここにある。** 画面の言語は英語が既定なので、
// この枠も英語で出る（`i18n.js`／ヘッダーの「あ」で日本語になる）。
// `data-t` は静的な文に、`t()` は JavaScript が組み立てる文に使う。
import { t, applyDom, onLangChange } from './i18n.js';

export function createLobby({ onJoin, onOffline, defaultClass, prefs }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'net-lobby';
  dialog.setAttribute('aria-labelledby', 'net-lobby-title');
  dialog.innerHTML = `<form method="dialog" id="net-lobby-form">
    <div class="eyebrow">U-SPEAK · CLASSROOM</div>
    <h2 id="net-lobby-title" data-t="クラスに参加しよう">クラスに参加しよう</h2>
    <p data-t="名前を入れると、同じクラスのみんなと同じ世界で冒険できます。">名前を入れると、同じクラスのみんなと同じ世界で冒険できます。</p>
    <label><span data-t="なまえ">なまえ</span><input id="net-name" name="name" maxlength="16" autocomplete="off" autocapitalize="off" required placeholder="例：Yuto" data-t-ph="例：Yuto"></label>
    <label><span data-t="クラスコード">クラスコード</span><input id="net-class" name="class" maxlength="24" autocomplete="off" autocapitalize="off" placeholder="先生から聞いたコード" data-t-ph="先生から聞いたコード"></label>
    <details id="net-teacher-details"><summary data-t="先生用">先生用</summary><label><span data-t="講師キー">講師キー</span><input id="net-key" name="key" type="password" autocomplete="off"></label></details>
    <p id="net-lobby-error" class="net-error" role="alert" hidden></p>
    <div class="net-lobby-actions">
      <button type="submit" class="primary" id="net-join" data-t="クラスに参加 →">クラスに参加 →</button>
      <button type="button" id="net-offline" data-t="ひとりで遊ぶ（オフライン）">ひとりで遊ぶ（オフライン）</button>
    </div>
    <p class="net-fine" data-t="オンラインではコイン・正解の記録はサーバーに保存され、先生と保護者向けレポートに使われます。">オンラインではコイン・正解の記録はサーバーに保存され、先生と保護者向けレポートに使われます。</p>
  </form>`;
  document.body.append(dialog);
  // この枠は JavaScript で建てるので、**建てたあとに一度 訳を当てる**
  // （`applyDom()` が走ったときには、まだ document に居なかった）。
  applyDom(dialog);
  // 訳し直したあとも、**つなぎに行っている最中かどうかは そのまま**にする
  // （ここで false にすると「接続中…」が「クラスに参加 →」に戻って、2回押せてしまう）。
  onLangChange(() => { applyDom(dialog); busy($('#net-join').disabled); });
  const $ = (s) => dialog.querySelector(s);
  $('#net-name').value = prefs?.name || '';
  $('#net-class').value = prefs?.classCode || defaultClass || '';
  $('#net-key').value = prefs?.teacherKey || '';
  if (prefs?.teacherKey) $('#net-teacher-details').open = true;

  function busy(v) { $('#net-join').disabled = v; $('#net-offline').disabled = v; $('#net-join').textContent = t(v ? '接続中…' : 'クラスに参加 →'); }
  function error(text) { $('#net-lobby-error').textContent = text || ''; $('#net-lobby-error').hidden = !text; }

  $('#net-lobby-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#net-name').value.trim();
    if (!name) { error(t('なまえを入れてね。')); return; }
    error('');
    onJoin({ name, classCode: $('#net-class').value.trim(), teacherKey: $('#net-key').value });
  });
  $('#net-offline').onclick = () => { close(); onOffline(); };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); });

  function open({ error: msg = '', name = '' } = {}) {
    if (name) $('#net-name').value = name;
    error(msg);
    busy(false);
    if (!dialog.open) dialog.showModal();
    setTimeout(() => $('#net-name').focus(), 50);
  }
  function close() { if (dialog.open) dialog.close(); }
  return { open, close, busy, error, get isOpen() { return dialog.open; } };
}

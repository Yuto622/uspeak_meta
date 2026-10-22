// Join dialog: name (student identity), class code, optional teacher key.
// クラスの あいことば（クラスコード）が ないと 入れない（2026-10 に ひとりで あそぶ＝オフラインを なくした）。
//
// **この教材で最初に読む文字がここにある。** 画面の言語は英語が既定なので、
// この枠も英語で出る（`i18n.js`／ヘッダーの「あ」で日本語になる）。
// `data-t` は静的な文に、`t()` は JavaScript が組み立てる文に使う。
import { t, applyDom, onLangChange } from './i18n.js';

export function createLobby({ onJoin, defaultClass, prefs }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'net-lobby';
  dialog.setAttribute('aria-labelledby', 'net-lobby-title');
  dialog.innerHTML = `<form method="dialog" id="net-lobby-form">
    <div class="eyebrow">U-SPEAK · CLASSROOM</div>
    <h2 id="net-lobby-title" data-t="クラスに はいろう">クラスに はいろう</h2>
    <p data-t="なまえを いれると、クラスの みんなと いっしょに あそべるよ。">なまえを いれると、クラスの みんなと いっしょに あそべるよ。</p>
    <label><span data-t="なまえ">なまえ</span><input id="net-name" name="name" maxlength="16" autocomplete="off" autocapitalize="off" placeholder="れい：ゆうと" data-t-ph="れい：ゆうと"></label>
    <label><span data-t="クラスの あいことば">クラスの あいことば</span><input id="net-class" name="class" maxlength="24" autocomplete="off" autocapitalize="off" placeholder="せんせいに きいた ことば" data-t-ph="せんせいに きいた ことば"></label>
    <label id="net-pin-label"><span data-t="じぶんの あいことば（あれば）">じぶんの あいことば（あれば）</span><input id="net-pin" name="pin" type="password" maxlength="40" autocomplete="off" autocapitalize="off"></label>
    <details id="net-teacher-details"><summary data-t="先生用">先生用</summary><label><span data-t="先生の あいことば">先生の あいことば</span><input id="net-key" name="key" type="password" autocomplete="off"></label></details>
    <p id="net-lobby-error" class="net-error" role="alert" hidden></p>
    <div class="net-lobby-actions">
      <button type="submit" class="primary" id="net-join" data-t="クラスに はいる →">クラスに はいる →</button>
    </div>
    <p class="net-fine" data-t="オンラインではコイン・正解の記録はサーバーに保存され、先生と保護者向けレポートに使われます。">オンラインではコイン・正解の記録はサーバーに保存され、先生と保護者向けレポートに使われます。 <a href="/privacy.html" target="_blank" rel="noopener" data-t="プライバシーポリシー">プライバシーポリシー</a></p>
  </form>`;
  document.body.append(dialog);
  // この枠は JavaScript で建てるので、**建てたあとに一度 訳を当てる**
  // （`applyDom()` が走ったときには、まだ document に居なかった）。
  applyDom(dialog);
  // 訳し直したあとも、**つなぎに行っている最中かどうかは そのまま**にする
  // （ここで false にすると「接続中…」が「クラスに はいる →」に戻って、2回押せてしまう）。
  onLangChange(() => { applyDom(dialog); busy($('#net-join').disabled); });
  const $ = (s) => dialog.querySelector(s);
  $('#net-name').value = prefs?.name || '';
  $('#net-class').value = prefs?.classCode || defaultClass || '';
  // 先生の 鍵は localStorage に 入れない・読まない（共用の iPad で 次の 子に 見えない ように）。
  $('#net-key').value = '';

  function busy(v) { $('#net-join').disabled = v; $('#net-join').textContent = t(v ? '接続中…' : 'クラスに はいる →'); }
  function error(text) { $('#net-lobby-error').textContent = text || ''; $('#net-lobby-error').hidden = !text; }

  $('#net-lobby-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#net-name').value.trim();
    if (!name) { error(t('なまえを いれてね。')); return; }
    const classCode = $('#net-class').value.trim();
    if (!classCode) { error(t('クラスの あいことばを いれてね。先生に きいてね。')); $('#net-class').focus(); return; }
    error('');
    onJoin({ name, classCode, teacherKey: $('#net-key').value, pin: $('#net-pin').value });
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); });

  function open({ error: msg = '', name = '' } = {}) {
    if (name) $('#net-name').value = name;
    error(msg);
    busy(false);
    if (!dialog.open) dialog.showModal();
    setTimeout(() => $('#net-name').focus(), 50);
  }
  function close() { if (dialog.open) dialog.close(); }
  // ログアウトの あと：前の 人の なまえ・クラス・講師キーを のこさない。
  function reset() {
    $('#net-name').value = '';
    $('#net-class').value = defaultClass || '';
    $('#net-key').value = '';
    $('#net-pin').value = '';
    $('#net-teacher-details').open = false;
  }
  return { open, close, busy, error, reset, get isOpen() { return dialog.open; } };
}

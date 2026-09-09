// Join dialog: name (student identity), class code, optional teacher key. Offline play stays available.
export function createLobby({ onJoin, onOffline, defaultClass, prefs }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'net-lobby';
  dialog.setAttribute('aria-labelledby', 'net-lobby-title');
  dialog.innerHTML = `<form method="dialog" id="net-lobby-form">
    <div class="eyebrow">U-SPEAK · CLASSROOM</div>
    <h2 id="net-lobby-title">クラスに参加しよう</h2>
    <p>名前を入れると、同じクラスのみんなと同じ世界で冒険できます。</p>
    <label>なまえ<input id="net-name" name="name" maxlength="16" autocomplete="off" autocapitalize="off" required placeholder="例：Yuto"></label>
    <label>クラスコード<input id="net-class" name="class" maxlength="24" autocomplete="off" autocapitalize="off" placeholder="先生から聞いたコード"></label>
    <details id="net-teacher-details"><summary>先生用</summary><label>講師キー<input id="net-key" name="key" type="password" autocomplete="off"></label></details>
    <p id="net-lobby-error" class="net-error" role="alert" hidden></p>
    <div class="net-lobby-actions">
      <button type="submit" class="primary" id="net-join">クラスに参加 →</button>
      <button type="button" id="net-offline">ひとりで遊ぶ（オフライン）</button>
    </div>
    <p class="net-fine">オンラインではコイン・正解の記録はサーバーに保存され、先生と保護者向けレポートに使われます。</p>
  </form>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s);
  $('#net-name').value = prefs?.name || '';
  $('#net-class').value = prefs?.classCode || defaultClass || '';
  $('#net-key').value = prefs?.teacherKey || '';
  if (prefs?.teacherKey) $('#net-teacher-details').open = true;

  function busy(v) { $('#net-join').disabled = v; $('#net-offline').disabled = v; $('#net-join').textContent = v ? '接続中…' : 'クラスに参加 →'; }
  function error(text) { $('#net-lobby-error').textContent = text || ''; $('#net-lobby-error').hidden = !text; }

  $('#net-lobby-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#net-name').value.trim();
    if (!name) { error('なまえを入れてね。'); return; }
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

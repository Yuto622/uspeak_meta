// Join dialog: name (student identity), class code, optional teacher key.
// クラスコードが ないと 入れない（2026-10 に ひとりで あそぶ＝オフラインを なくした）。
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
    <p data-t="ユーザーネームと パスワードを いれると、クラスの みんなと いっしょに あそべるよ。">ユーザーネームと パスワードを いれると、クラスの みんなと いっしょに あそべるよ。</p>
    <div id="net-pick" hidden><p class="net-pick-lead" data-t="じぶんの なまえを おしてね">じぶんの なまえを おしてね</p><div id="net-pick-list" role="list" translate="no"></div>
      <button type="button" class="net-pick-other" id="net-pick-other" data-t="なまえが ない とき">なまえが ない とき</button></div>
    <label><span data-t="ユーザーネーム">ユーザーネーム</span><input id="net-name" name="name" maxlength="16" autocomplete="off" autocapitalize="off" placeholder="れい：ゆうと" data-t-ph="れい：ゆうと"></label>
    <label><span data-t="パスワード">パスワード</span><input id="net-class" name="class" maxlength="24" autocomplete="off" autocapitalize="off" placeholder="せんせいに きいた パスワード" data-t-ph="せんせいに きいた パスワード"></label>
    <div id="net-teacher-details" class="net-optional" hidden><label><span class="net-opt-head"><span data-t="先生パスワード">先生パスワード</span> <small class="net-opt" data-t="先生だけ・こどもは いらない">先生だけ・こどもは いらない</small></span><input id="net-key" name="key" type="password" autocomplete="off"></label></div>
    <p id="net-lobby-error" class="net-error" role="alert" hidden></p>
    <div class="net-lobby-actions">
      <button type="submit" class="primary" id="net-join" data-t="クラスに はいる →">クラスに はいる →</button>
      <button type="button" class="net-fs" id="net-fs" data-fs-button hidden><span aria-hidden="true">⛶</span> <span data-t="ぜんがめんに する">ぜんがめんに する</span></button>
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
  // 入れるのは ユーザーネームと パスワードだけ。先生かは 名簿の「先生」列で きまる。講師キーの 欄は 運営用（?staff=1 の ときだけ 出す）。
  if (new URLSearchParams(location.search).has('staff')) $('#net-teacher-details').hidden = false;
  $('#net-key').value = '';

  function busy(v) { $('#net-join').disabled = v; $('#net-join').textContent = t(v ? '接続中…' : 'クラスに はいる →'); }
  function error(text) { $('#net-lobby-error').textContent = text || ''; $('#net-lobby-error').hidden = !text; }

  $('#net-lobby-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#net-name').value.trim();
    if (!name) { error(t('ユーザーネームを いれてね。')); return; }
    const classCode = $('#net-class').value.trim();
    if (!classCode) { error(t('パスワードを いれてね。先生に きいてね。')); $('#net-class').focus(); return; }
    error('');
    onJoin({ name, classCode, teacherKey: $('#net-key').value });
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); });

  // なまえを えらんで 入る（クラスの QR：?class=<コード>&k=<署名>）。先生が その クラスで オンに した ときだけ、
  // サーバーが その クラスの 子の なまえを 返す（server/src/classroom/join.js）。返らなければ いつもの 入力の まま。
  // 一覧は 入力の かわり：入れるか どうかは いつもどおり サーバーが きめる。先生は「なまえが ない とき」から 先生パスワードで 入る。
  const PICK_COLORS = ['#e2574c', '#e27a2d', '#d99a1e', '#4fa868', '#2f9a9a', '#3f86d0', '#5a66c8', '#8a5cc0', '#c0589a'];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 教室 まとめての QR（?room=<教室>&k=<署名>）：いくつかの クラスの 子が 1 つの 一覧に 出る。なまえごとに クラスが ついて くる（entries）。
  const pick = { classCode: '', names: [], classes: [] };
  function setPick(on) { dialog.classList.toggle('pick', on); $('#net-pick').hidden = !on; }
  (async () => {
    let q; try { q = new URLSearchParams(location.search); } catch { return; }
    const classCode = (q.get('class') || '').trim(); const room = (q.get('room') || '').trim(); const k = q.get('k') || '';
    if ((!classCode && !room) || !k) return;
    try {
      const by = room ? `room=${encodeURIComponent(room)}` : `class=${encodeURIComponent(classCode)}`;
      const res = await fetch(`/api/join/names?${by}&k=${encodeURIComponent(k)}`, { cache: 'no-store' });
      const data = res.ok ? await res.json() : null;
      if (!data?.ok || !Array.isArray(data.names) || !data.names.length) return;
      const list = (Array.isArray(data.entries) && data.entries.length ? data.entries : data.names.map((name) => ({ name, class: classCode })))
        .map((e) => ({ name: String(e?.name ?? '').slice(0, 16), class: String(e?.class ?? classCode).slice(0, 40) })).filter((e) => e.name && e.class).slice(0, 200);
      if (!list.length) return;
      pick.classCode = room ? '' : classCode; pick.names = list.map((e) => e.name); pick.classes = list.map((e) => e.class);
      // 同じ なまえが 2 つの クラスに いる ときだけ、クラスを 小さく そえる（見分けるため）。
      const twice = new Set(pick.names.filter((n, i) => pick.names.indexOf(n) !== i));
      $('#net-pick-list').innerHTML = pick.names.map((n, i) => { let h = 0; for (const c of n) h = (h * 31 + c.codePointAt(0)) >>> 0; return `<button type="button" class="net-pick-name" role="listitem" data-i="${i}"><i style="background:${PICK_COLORS[h % PICK_COLORS.length]}">${esc([...n][0] || '?')}</i><b>${esc(n)}</b>${twice.has(n) ? `<small>${esc(pick.classes[i])}</small>` : ''}</button>`; }).join('');
      if (!room) $('#net-class').value = classCode;
      setPick(true);
    } catch { /* いつもの 入力の まま */ }
  })();
  $('#net-pick-list').addEventListener('click', (e) => {
    const b = e.target.closest('.net-pick-name'); if (!b || $('#net-join').disabled) return;
    const i = Number(b.dataset.i); const name = pick.names[i]; const classCode = pick.classes[i] || pick.classCode; if (!name || !classCode) return;
    $('#net-name').value = name; $('#net-class').value = classCode; $('#net-key').value = '';
    error('');
    for (const x of dialog.querySelectorAll('.net-pick-name')) x.classList.toggle('on', x === b);
    onJoin({ name, classCode, teacherKey: '' });
  });
  $('#net-pick-other').addEventListener('click', () => { setPick(false); setTimeout(() => $('#net-name').focus(), 30); });

  // teacher: 先生パスワードが ちがった とき、その 欄に カーソルを 置く。
  // 先生パスワードの 欄は 2026-11 から たたまずに いつも 見せる（「先生だけ」の 札つき）。
  function open({ error: msg = '', name = '', teacher = false } = {}) {
    if (name) $('#net-name').value = name;
    error(msg);
    busy(false);
    if (!dialog.open) dialog.showModal();
    if (teacher) setPick(false); // 先生パスワードが ちがう：入力の 形に もどして その 欄へ
    if (!dialog.classList.contains('pick')) setTimeout(() => $(teacher ? '#net-key' : '#net-name').focus(), 50);
  }
  function close() { if (dialog.open) dialog.close(); }
  // ログアウトの あと：前の 人の なまえ・クラス・講師キーを のこさない。
  function reset() {
    if (pick.names.length) { setPick(true); for (const x of dialog.querySelectorAll('.net-pick-name')) x.classList.remove('on'); }
    $('#net-name').value = '';
    $('#net-class').value = pick.classCode || defaultClass || '';
    $('#net-key').value = '';
  }
  return { open, close, busy, error, reset, get isOpen() { return dialog.open; } };
}

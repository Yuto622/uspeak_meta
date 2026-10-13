// 保護者レポートの 画面（HTML）。依存なし・1 ファイルずつ。色は ブランド（深緑 #1B3A2F・オレンジ #E27A2D・クリーム #FFFBF5）。
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const BASE_CSS = `
*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans JP","Hiragino Sans",system-ui,sans-serif;background:#fffbf5;color:#1b3a2f;line-height:1.6}
.wrap{max-width:900px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:4px 0 12px}h2{font-size:17px;margin:0 0 8px}
.card{background:#fff;border:1px solid #e9e2d6;border-radius:16px;padding:16px;margin:12px 0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 16px;border:0;border-radius:12px;background:#1b3a2f;color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}
.btn.orange{background:#e27a2d}.btn.ghost{background:#efe8dc;color:#1b3a2f}.btn.danger{background:#b3372b}.btn[disabled]{opacity:.5;cursor:default}
.muted{color:#6e665c;font-size:13px}label{display:block;margin:8px 0}select,input[type=text],input[type=time]{font:inherit;padding:8px 10px;border:1px solid #d9d1c3;border-radius:10px;background:#fff}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:8px 6px;border-bottom:1px solid #efe8dc;text-align:left;vertical-align:middle}
.pill{display:inline-block;padding:1px 10px;border-radius:99px;background:#e6f2ea;color:#2e6b47;font-size:12px;font-weight:700}.pill.gray{background:#efe8dc;color:#6e665c}.pill.red{background:#f8e1dd;color:#9b2c20}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
`;

// ---- LIFF：保護者の 登録 ----------------------------------------------------------------------
export function liffHtml({ liffId, botBasicId }) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>学習レポートの受け取り</title>
<style>${BASE_CSS}.wrap{max-width:520px}.big{font-size:18px;font-weight:700}#ok{display:none}</style>
<script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script></head>
<body><div class="wrap">
<h1>学習レポートの受け取り</h1>
<div class="card" id="box"><p class="muted">読みこんでいます…</p></div>
<div class="card" id="ok"><p class="big">登録しました</p><p id="okText"></p><p id="friend"></p></div>
</div>
<script>
const LIFF_ID = ${JSON.stringify(liffId)};
const BOT = ${JSON.stringify(botBasicId)};
const box = document.getElementById('box');
const say = (html) => { box.innerHTML = html; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
(async () => {
  try {
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
    const t = new URLSearchParams(location.search).get('t') || '';
    const info = await post('/api/liff/info', { t });
    if (!info.ok) { say('<p>' + esc(info.error) + '</p>'); return; }
    say('<p class="big">' + esc(info.classroom) + 'に通う ' + esc(info.nickname) + ' さんの学習レポートを、このLINEで受け取ります。</p>'
      + '<p class="muted">お子さまの本名・ご連絡先はお預かりしません。教室のご判断でいつでも停止できます。</p>'
      + '<button class="btn orange" id="agree">同意して受け取る</button>');
    document.getElementById('agree').onclick = async (e) => {
      e.target.disabled = true;
      const r = await post('/api/liff/link', { t, idToken: liff.getIDToken(), consent: info.consentVersion });
      if (!r.ok) { say('<p>' + esc(r.error) + '</p>'); return; }
      box.style.display = 'none';
      document.getElementById('ok').style.display = 'block';
      document.getElementById('okText').textContent = r.nickname + ' さんのレポートが、決まった日にこのLINEに届きます。';
      try {
        const f = await liff.getFriendship();
        if (!f.friendFlag) document.getElementById('friend').innerHTML = 'レポートを受け取るには、公式アカウントを友だちに追加してください。'
          + (BOT ? '<br><a class="btn" href="https://line.me/R/ti/p/' + encodeURIComponent(BOT) + '">友だちに追加する</a>' : '');
      } catch {}
    };
  } catch (err) { say('<p>ひらけませんでした。LINEアプリで もう一度 QRコードを 読みとってください。</p>'); }
})();
</script></body></html>`;
}

// ---- お子さまごとの 専用ページ（/r/<QR の 合言葉>）--------------------------------------------
export function studentPageHtml({ token, nick, classroom, paused = false, latest = null, past = [], lineUrl = '' }) {
  const t = encodeURIComponent(token);
  const body = paused
    ? '<div class="card"><p>いまは 公開を 止めています。くわしくは 教室に お問い合わせください。</p></div>'
    : `<div class="card">${latest
      ? `<h2>${esc(latest.range)}</h2>${latest.png ? `<a href="/r/${encodeURIComponent(latest.token)}"><img src="/r/${encodeURIComponent(latest.token)}.png" alt="${esc(nick)}さんの英語きろく" style="width:100%;max-width:520px;border:1px solid #e9e2d6;border-radius:12px"></a>` : ''}
        <p class="row"><a class="btn" href="/r/${encodeURIComponent(latest.token)}">PDFで見る</a><a class="btn ghost" href="/r/${t}/month">先月の まとめ（PDF）</a></p>`
      : `<p class="muted">いまは レポートを 用意できませんでした。しばらくしてから もう一度 ひらいてください。</p>`}</div>
      ${lineUrl ? `<div class="card"><h2>LINE で 毎週 受け取る</h2><p class="muted">登録すると、毎週 決まった 日に この レポートが LINE に 届きます（登録しなくても、このページで いつでも 見られます）。</p><p><a class="btn orange" href="${esc(lineUrl)}">LINE で 受け取る</a></p></div>` : ''}
      ${past.length ? `<div class="card"><h2>これまでの 週</h2><ul>${past.map((p) => `<li><a href="/r/${encodeURIComponent(p.token)}">${esc(p.range)}</a></li>`).join('')}</ul></div>` : ''}`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(nick)}さんの英語きろく</title>
<style>${BASE_CSS}.wrap{max-width:560px}.row{display:flex;gap:8px;flex-wrap:wrap}</style></head>
<body><div class="wrap">
<p class="muted">${esc(classroom)}より</p>
<h1>${esc(nick)}さんの英語きろく</h1>
${body}
<p class="muted">このページは ${esc(nick)}さんの ご家族 専用です。ほかの 方には 送らないで ください。毎週 月曜日に 新しい 週に かわります。</p>
</div></body></html>`;
}

// ---- 先生の「保護者レポート」タブ ----------------------------------------------------------------
export function classTabHtml({ classCode, token, fromAdmin = false }) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>保護者レポート — ${esc(classCode)}</title>
<style>${BASE_CSS}#preview img{max-width:320px;width:100%;border:1px solid #e9e2d6;border-radius:12px}.cmt button{margin:3px 4px 3px 0;min-height:36px;font-weight:500}.cmt h3{font-size:14px;margin:10px 0 4px}</style></head>
<body><div class="wrap">
<p>${fromAdmin ? '<a href="/admin/reports">← 保護者レポートの管理</a>　' : ''}<a href="/class/${encodeURIComponent(classCode)}?t=${encodeURIComponent(token)}">← 教室のようす</a></p>
<h1>保護者レポート（LINE配信）</h1>
<div id="app"><p class="muted">読みこんでいます…</p></div>
</div>
<script>
const CODE = ${JSON.stringify(classCode)}, TOKEN = ${JSON.stringify(token)};
const API = '/class/' + encodeURIComponent(CODE) + '/parents/api';
const q = '?t=' + encodeURIComponent(TOKEN);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const get = (p) => fetch(API + p + q).then((r) => r.json());
const post = (p, body) => fetch(API + p + q, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'uspeak-class' }, body: JSON.stringify(body || {}) }).then((r) => r.json());
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const CAT = { praiseProcess: 'ほめる（過程）', praiseStrategy: 'ほめる（方略）', strategy: '具体的な方略', nextStep: '次の一歩', classroom: '教室とのつながり' };
let S = null, who = '';
async function load() { S = await get('/state'); render(); }
function render() {
  const s = S.settings;
  const next = S.next ? new Date(S.next.at) : null;
  const nextText = next ? (next.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) + '（' + S.next.range + '）') : '—';
  const commentNow = (u) => (S.comments || []).find((c) => (c.student_username || '') === u);
  document.getElementById('app').innerHTML = \`
  <div class="card"><h2>配信の設定</h2>
    \${S.lineReady ? '' : '<p class="pill red">LINE がまだ設定されていません（送信はテスト表示だけ）</p>'}
    <label><input type="checkbox" id="en" \${s.enabled ? 'checked' : ''}> 保護者レポートを配信する <span class="muted">（はじめはオフ。オンにするのは教室のご判断です）</span></label>
    <div class="row">
      <label>頻度 <select id="fr"><option value="weekly">毎週</option><option value="biweekly">隔週</option><option value="monthly">毎月</option></select></label>
      <label>曜日 <select id="wd">\${WD.map((d, i) => '<option value="' + i + '">' + d + '曜日</option>').join('')}</select></label>
      <label>時刻 <input type="time" id="tm" value="\${esc(s.send_time)}"></label>
    </div>
    <label><input type="checkbox" id="sz" \${s.skip_zero_week ? 'checked' : ''}> 英語をしなかった週は送らない</label>
    <label><input type="checkbox" id="mp" \${s.monthly_pdf ? 'checked' : ''}> 月のはじめに「1か月のまとめ（PDF）」も付ける</label>
    <div class="row">
      <label>教室名（レポートに出る名前） <input type="text" id="sn" value="\${esc(s.sender_name)}" placeholder="ツリーベル英会話教室"></label>
      <label>先生のよびかた <input type="text" id="tl" value="\${esc(s.teacher_label)}" placeholder="〇〇先生"></label>
    </div>
    <p class="muted">次の配信：\${esc(nextText)}　登録：\${S.registered} / \${S.total} 人</p>
    <button class="btn" id="save">保存</button>
  </div>
  <div class="card"><h2>生徒と保護者の登録</h2>
    <p class="row"><a class="btn orange" href="\${API}/cards.pdf\${q}" target="_blank">保護者用 QRカードを印刷（A4・8人）</a></p>
    <table><tr><th>ニックネーム</th><th>保護者</th><th></th></tr>
    \${S.students.map((st) => '<tr><td>' + esc(st.nick) + (st.paused ? ' <span class="pill gray">停止中</span>' : '') + '</td><td>'
      + (st.parents ? '<span class="pill">' + st.parents + '人 登録</span>' : '<span class="pill gray">未登録</span>') + (st.blocked ? ' <span class="pill red">ブロック ' + st.blocked + '</span>' : '')
      + '</td><td class="row"><button class="btn ghost" data-prev="' + esc(st.username) + '">プレビュー</button>'
      + (st.url ? '<button class="btn ghost" data-url="' + esc(st.url) + '">専用URLをコピー</button>' : '')
      + '<button class="btn ghost" data-tok="' + esc(st.username) + '">QRを作り直す</button>'
      + '<button class="btn ghost" data-stop="' + esc(st.username) + '" data-on="' + (st.paused ? 0 : 1) + '">' + (st.paused ? '配信を再開' : 'この生徒の配信を止める') + '</button></td></tr>').join('') || '<tr><td colspan=3 class="muted">まだ生徒がいません</td></tr>'}
    </table>
    <div id="preview"></div>
  </div>
  <div class="card cmt"><h2>先生のひとこと（次回分）</h2>
    \${S.next ? '<p class="muted">締め切り：配信の前日 23:59。えらんだ回だけレポートに載ります（えらばなければ欄ごと出ません）。</p>'
      + '<label>だれに <select id="who"><option value="">クラス全体</option>' + S.students.map((st) => '<option value="' + esc(st.username) + '"' + (who === st.username ? ' selected' : '') + '>' + esc(st.nick) + '</option>').join('') + '</select></label>'
      + '<p>いま：<b>' + esc(commentNow(who)?.text || '（なし）') + '</b> ' + (commentNow(who) ? '<button class="btn ghost" data-cmt="">とりけす</button>' : '') + '</p>'
      + Object.entries(S.candidates).map(([k, list]) => '<h3>' + CAT[k] + '</h3>' + list.map((t) => '<button class="btn ghost" data-cmt="' + esc(t) + '">' + esc(t) + '</button>').join('')).join('')
      : '<p class="muted">配信がオフのあいだは選べません。</p>'}
  </div>
  <div class="card"><h2>教室全体を停止</h2>
    <p class="muted">配信を止め、保護者の登録と レポートのURLを無効にします（登録は30日後に完全に削除）。</p>
    <button class="btn danger" id="stopAll">教室全体を停止する</button>
  </div>\`;
  document.getElementById('fr').value = s.frequency; document.getElementById('wd').value = String(s.send_weekday);
  document.getElementById('save').onclick = async () => {
    const r = await post('/settings', { enabled: en.checked, frequency: fr.value, send_weekday: Number(wd.value), send_time: tm.value, skip_zero_week: sz.checked, monthly_pdf: mp.checked, sender_name: sn.value, teacher_label: tl.value });
    if (r.ok) load();
  };
  document.querySelectorAll('[data-prev]').forEach((b) => { b.onclick = () => {
    const box = document.getElementById('preview');
    box.innerHTML = '<p class="muted">作っています…（数秒）</p>';
    const img = new Image(); img.alt = 'プレビュー';
    img.onload = () => { box.innerHTML = ''; box.append(img); };
    img.onerror = () => { box.innerHTML = '<p class="muted">プレビューを作れませんでした</p>'; };
    img.src = API + '/preview.png' + q + '&u=' + encodeURIComponent(b.dataset.prev);
  }; });
  document.querySelectorAll('[data-tok]').forEach((b) => { b.onclick = async () => { if (confirm('この生徒のQRを作り直しますか？（前のQRは使えなくなります。登録済みの保護者はそのままです）')) { await post('/student/token', { username: b.dataset.tok }); alert('作り直しました。QRカードを印刷しなおしてください。'); } }; });
  document.querySelectorAll('[data-url]').forEach((b) => { b.onclick = async () => {
    const url = new URL(b.dataset.url, location.origin).href;
    try { await navigator.clipboard.writeText(url); alert('コピーしました。この URL を 保護者の方に お送りください（LINE の 登録は いりません）。'); }
    catch { prompt('この URL を コピーして、保護者の方に お送りください。', url); }
  }; });
  document.querySelectorAll('[data-stop]').forEach((b) => { b.onclick = async () => { await post('/student/stop', { username: b.dataset.stop, stop: b.dataset.on === '1' }); load(); }; });
  const w = document.getElementById('who'); if (w) w.onchange = () => { who = w.value; render(); };
  document.querySelectorAll('[data-cmt]').forEach((b) => { b.onclick = async () => { const r = await post('/comment', { username: who, text: b.dataset.cmt }); if (!r.ok) alert(r.error); else { S.comments = r.comments; render(); } }; });
  document.getElementById('stopAll').onclick = async () => {
    const typed = prompt('本当に停止しますか？ 確認のため、クラスコード「' + CODE + '」を入力してください。');
    if (typed !== CODE) return;
    const r = await post('/stop-all', { confirm: CODE });
    alert(r.ok ? '停止しました。' : r.error); load();
  };
}
load();
</script></body></html>`;
}

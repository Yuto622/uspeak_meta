// /admin/reports — 運営者（真田）の 画面。ログインは 名簿の 管理ページと 同じ（roster-admin の extend）。
//   全体の 緊急停止・教室ごとの 状態（登録率・直近の 結果）・実行ログ・失敗の 再送・テスト送信（自分の LINE）・
//   テンプレートの 版・LINE の 今月の 送信数。LINE の ユーザー ID は 画面にも 出さない（mask）。
import express from 'express';
import { mask } from './line.js';
import { templateVersion } from './render-tex.js';
import { signClass } from '../game/report.js';

export function adminExtension({ service, reports, line, renderer, store = null, secret = '', opsUserId = process.env.OPS_LINE_USER_ID || '' }) {
  // 教室の 一覧：記録が ある 教室・名簿の 教室・設定ずみの 教室。教室ごとの 署名つき リンクを 探さなくても、ここから 設定を ひらける。
  async function classCodes(access) {
    const codes = new Set(reports.allSettings().map((s) => s.classroom_id));
    try { for (const c of store?.listClassCodes?.() || []) codes.add(String(c)); } catch { /* 記録が 読めなくても 一覧は 出す */ }
    for (const c of await service.robloxClassCodes()) codes.add(c);
    try { for (const r of (await access?.rows?.()) || []) if (r?.class && r.class !== '*') codes.add(String(r.class)); } catch { /* 名簿なし */ }
    return [...codes].filter(Boolean).sort();
  }
  return ({ router, api, authed, access }) => {
    // 名簿の API は 本文を 読む 設定を ルートごとに 持つので、ここでも 付ける（ないと 本文が 空＝教室コードが 空に なる）。
    api.use('/reports', express.json({ limit: '16kb' }));
    router.get('/reports', (req, res) => {
      if (!authed(req)) { res.redirect(303, '/admin'); return; }
      res.type('text/html; charset=utf-8').send(ADMIN_PAGE);
    });

    api.get('/reports/state', async (req, res) => {
      const classes = await Promise.all((await classCodes(access)).map(async (code) => {
        const s = reports.settings(code);
        const st = await service.classStatus(code);
        const open = secret ? `/class/${encodeURIComponent(code)}/parents?t=${encodeURIComponent(signClass(secret, code))}&from=admin` : '';
        return { classroom_id: code, name: s.sender_name || code, enabled: s.enabled, frequency: s.frequency, registered: st.registered, total: st.total, lastRun: st.lastRun, open };
      }));
      const versions = {};
      for (const r of reports.reports()) versions[r.template_version] = (versions[r.template_version] || 0) + 1;
      const runs = reports.runs().slice(-40).reverse().map((r) => ({ ...r, counts: JSON.parse(r.counts_json || '{}') }));
      const failed = reports.deliveries().filter((d) => d.status === 'failed' || d.status === 'blocked').slice(-50).reverse().map((d) => ({ id: d.id, run_id: d.run_id, status: d.status, to: mask(d.line_user_id), error: d.error, sent_at: d.sent_at, report_id: d.report_id }));
      res.json({
        ok: true, enabled: reports.meta.enabled !== false, classes, runs, failed,
        quota: await line.quota(), dryRun: line.dryRun, renderer: renderer.mode, rendererReady: await renderer.available(),
        template: templateVersion(), versions, opsSet: !!opsUserId,
        recent: (reports.meta.recent_contacts || []).map((c) => ({ ...c, linked: reports.links({ lineUserId: c.id }).length > 0 })),
      });
    });
    api.post('/reports/global', (req, res) => { reports.setMeta({ enabled: !!req.body?.enabled }); res.json({ ok: true, enabled: reports.meta.enabled }); });
    api.post('/reports/resend', async (req, res) => res.json(await service.resend(String(req.body?.id || ''))));
    api.post('/reports/test', async (req, res) => {
      if (!opsUserId) { res.status(409).json({ ok: false, error: 'OPS_LINE_USER_ID が未設定です' }); return; }
      const classCode = String(req.body?.classCode || '');
      if (!classCode) { res.status(400).json({ ok: false, error: '教室が えらばれていません' }); return; }
      const only = String(req.body?.username || '');
      const r = await service.deliverClass(classCode, { testTo: opsUserId, only, kind: req.body?.kind === 'monthly' ? 'monthly' : 'weekly' });
      res.json({ ok: !r.errors?.length, ...r });
    });
    api.get('/reports/students', async (req, res) => res.json({ ok: true, students: await service.students(String(req.query.c || '')) }));
  };
}

const ADMIN_PAGE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>保護者レポート — 管理</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans JP",system-ui,sans-serif;background:#fffbf5;color:#1b3a2f}.wrap{max-width:1000px;margin:0 auto;padding:16px}
.card{background:#fff;border:1px solid #e9e2d6;border-radius:16px;padding:16px;margin:12px 0}h1{font-size:22px}h2{font-size:17px;margin:0 0 8px}
.btn{min-height:40px;padding:0 14px;border:0;border-radius:10px;background:#1b3a2f;color:#fff;font:inherit;font-weight:700;cursor:pointer}.btn.ghost{background:#efe8dc;color:#1b3a2f}.btn.danger{background:#b3372b}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:6px;border-bottom:1px solid #efe8dc;text-align:left;vertical-align:top}.muted{color:#6e665c;font-size:13px}
.pill{display:inline-block;padding:1px 9px;border-radius:99px;font-size:12px;font-weight:700;background:#e6f2ea;color:#2e6b47}.pill.red{background:#f8e1dd;color:#9b2c20}.pill.gray{background:#efe8dc;color:#6e665c}
select,input{font:inherit;padding:6px 8px;border:1px solid #d9d1c3;border-radius:8px}</style></head>
<body><div class="wrap"><p><a href="/admin">← 名簿の管理</a></p><h1>保護者レポート（LINE配信）</h1><div id="app">読みこんでいます…</div></div>
<script>
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const get = (p) => fetch('/admin/api' + p).then((r) => r.json());
const post = (p, b) => fetch('/admin/api' + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'uspeak-admin' }, body: JSON.stringify(b || {}) }).then((r) => r.json());
const when = (s) => s ? new Date(s).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—';
const C = (c) => Object.entries(c || {}).filter(([, v]) => v).map(([k, v]) => k + ' ' + v).join('・') || '—';
async function load() {
  const S = await get('/reports/state');
  const q = S.quota || {};
  document.getElementById('app').innerHTML = \`
  <div class="card"><h2>全体</h2>
    <p>\${S.enabled ? '<span class="pill">配信 オン</span>' : '<span class="pill red">緊急停止中</span>'}
      <button class="btn \${S.enabled ? 'danger' : ''}" id="glob">\${S.enabled ? '全体を緊急停止' : '再開する'}</button></p>
    <p class="muted">LINE：\${S.dryRun ? '<b>dry-run（送らずにログだけ）</b>' : '本番'}　今月の送信数：\${q.used ?? '—'}\${q.limit ? ' / ' + q.limit + '（' + Math.round(q.used / q.limit * 100) + '%）' : ''}
      ／ 組版：\${esc(S.renderer)} \${S.rendererReady ? '' : '<span class="pill red">TeX がありません</span>'} ／ 運営者への通知：\${S.opsSet ? '設定済み' : '<span class="pill red">OPS_LINE_USER_ID 未設定</span>'}</p>
    <p class="muted">テンプレートの版：<b>\${esc(S.template)}</b>（作ったレポート：\${Object.entries(S.versions).map(([v, n]) => esc(v) + ' ' + n + '件').join('・') || 'なし'}）</p>
  </div>
  \${S.opsSet ? '' : '<div class="card"><h2>運営者の ユーザーID を さがす</h2><p class="muted">自分の LINE で 公式アカウントを 友だち追加するか、何か メッセージを 送ると、ここに ID が 出ます（7日・5人まで）。自分の ID を コピーして <code>fly secrets set -a uspeak-multiplayer OPS_LINE_USER_ID=…</code> に 入れてください。</p><table><tr><th>日時</th><th>きっかけ</th><th>ユーザーID</th></tr>' + ((S.recent || []).map((c) => '<tr><td>' + when(c.at) + '</td><td>' + (c.type === 'follow' ? '友だち追加' : 'メッセージ') + (c.linked ? ' <span class="pill gray">保護者として登録済み</span>' : '') + '</td><td><code>' + esc(c.id) + '</code></td></tr>').join('') || '<tr><td colspan=3 class="muted">まだ ありません</td></tr>') + '</table></div>'}
  <div class="card"><h2>教室</h2><table><tr><th>教室</th><th>状態</th><th>登録率</th><th>直近の配信</th><th>設定・QR・ひとこと</th><th>テスト送信（自分のLINEへ）</th></tr>
    \${S.classes.map((c) => '<tr><td>' + esc(c.name) + '<br><span class="muted">' + esc(c.classroom_id) + '</span></td><td>' + (c.enabled ? '<span class="pill">オン</span> ' + esc(c.frequency) : '<span class="pill gray">オフ</span>')
      + '</td><td>' + c.registered + ' / ' + c.total + (c.total ? '（' + Math.round(c.registered / c.total * 100) + '%）' : '') + '</td><td>' + (c.lastRun ? when(c.lastRun.finished_at) + '<br>' + C(c.lastRun.counts) : '—')
      + '</td><td>' + (c.open ? '<a class="btn" style="display:inline-flex;align-items:center;text-decoration:none" href="' + esc(c.open) + '">設定をひらく</a>' : '<span class="muted">REPORT_SECRET 未設定</span>')
      + '</td><td><button class="btn ghost" data-test="' + esc(c.classroom_id) + '">生徒をえらんで送る</button></td></tr>').join('') || '<tr><td colspan=6 class="muted">まだ 教室が ありません（生徒が 1回 遊ぶか、名簿に 教室を 入れると 出ます）</td></tr>'}
  </table></div>
  <div class="card"><h2>失敗した送信</h2><table><tr><th>日時</th><th>宛先</th><th>理由</th><th></th></tr>
    \${S.failed.map((d) => '<tr><td>' + when(d.sent_at) + '</td><td>' + esc(d.to) + '</td><td>' + (d.status === 'blocked' ? '<span class="pill gray">LINE が 受けつけない</span> ' : '') + esc(d.error) + '</td><td>' + (d.report_id ? '<button class="btn ghost" data-resend="' + esc(d.id) + '">再送</button>' : '') + '</td></tr>').join('') || '<tr><td colspan=4 class="muted">ありません</td></tr>'}
  </table></div>
  <div class="card"><h2>実行ログ</h2><table><tr><th>開始</th><th>教室・回</th><th>結果</th></tr>
    \${S.runs.map((r) => '<tr><td>' + when(r.started_at) + (r.test ? ' <span class="pill gray">テスト</span>' : '') + '</td><td>' + esc(r.run_key) + '</td><td>' + (r.finished_at ? C(r.counts) : '（実行中）') + '</td></tr>').join('') || '<tr><td colspan=3 class="muted">まだありません</td></tr>'}
  </table></div>\`;
  document.getElementById('glob').onclick = async () => { if (!S.enabled || confirm('すべての教室の配信を止めますか？')) { await post('/reports/global', { enabled: !S.enabled }); load(); } };
  document.querySelectorAll('[data-resend]').forEach((b) => { b.onclick = async () => { const r = await post('/reports/resend', { id: b.dataset.resend }); alert(r.ok ? '再送しました' : r.error); load(); }; });
  document.querySelectorAll('[data-test]').forEach((b) => { b.onclick = async () => {
    const st = (await get('/reports/students?c=' + encodeURIComponent(b.dataset.test))).students || [];
    const pick = prompt('送る生徒の番号：\\n' + st.map((s, i) => (i + 1) + '. ' + s.nick).join('\\n') + '\\n（月次版は 番号のあとに m）');
    if (!pick) return;
    const m = /m$/i.test(pick.trim()); const s = st[parseInt(pick, 10) - 1];
    if (!s) return;
    const r = await post('/reports/test', { classCode: b.dataset.test, username: s.username, kind: m ? 'monthly' : 'weekly' });
    alert(r.ok && r.counts?.sent ? 'テスト送信しました（' + C(r.counts) + '）' : r.ok ? '送れる レポートが ありませんでした（' + C(r.counts) + '）' : (r.error || (r.errors || []).join('\\n'))); load();
  }; });
}
load();
</script></body></html>`;

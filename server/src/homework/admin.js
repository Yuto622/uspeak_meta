// /admin/homework — 宿題を 入れる（どの 形式でも）→ 読みとった 下書きを 先生が たしかめて なおす → くばる → すすみぐあいを 見る。
// ログインは 名簿の 管理ページと 同じ（roster-admin の extend）。**くばるまで 子どもには 出ない。**
import express from 'express';
import { extractHomework } from './extract.js';
import { KINDS, KIND_JA, checkItems, buildItem } from './items.js';
import { page } from './page.js';
export { page };

// store.js の クラスの 書きかたに そろえる（名簿の「6-1」と 宿題の「6-1」が 同じ クラスに なるように）。
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const classKeyOf = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);

// 宿題の API。運営（/admin/api）は ぜんぶの クラス、教室（/teacher/api）は その 教室の クラスだけ（scope）。
// scope(req) → null（運営）か [クラス]（教室）。**どの クラスを さわれるかは いつも サーバーが きめる。**
export function mountHomeworkApi(api, { homework, aiReady = false, rosterClasses = async () => [], scope = () => null, header = 'uspeak-admin', extractLimit = null, log = console }) {
  api.use('/homework', express.json({ limit: '60mb' }));
  const guard = (req, res) => {
    if (req.get('x-requested-with') !== header) { res.status(403).json({ ok: false, error: 'header' }); return false; }
    return true;
  };
  const view = (a, allowed) => {
    const rows = homework.classProgress(a.id).filter((r) => !allowed || allowed.includes(r.classCode));
    return { ...a, problems: checkItems(a.items).problems, started: rows.length, finished: rows.filter((r) => r.done).length, editable: !allowed || a.classes.every((c) => allowed.includes(c)) };
  };
  // 教室の 先生が さわれる 宿題か（ぜんぶの クラスが その 教室の もの）。
  const mine = (req, res, id) => {
    const allowed = scope(req);
    const a = homework.get(id);
    if (!a) { res.status(404).json({ ok: false, error: 'ありません' }); return null; }
    if (allowed && !a.classes.every((c) => allowed.includes(c))) { res.status(403).json({ ok: false, error: 'この 教室の 宿題では ありません' }); return null; }
    return a;
  };
  // 教室の 先生が 書いた クラスを その 教室の クラスに しぼる。空なら 教室の クラス（1 つなら それ）。
  const classesFor = (req, res, body) => {
    const allowed = scope(req);
    if (!allowed) return body;
    const raw = body.classes;
    const asked = (Array.isArray(raw) ? raw : String(raw ?? '').split(/[,、\s]+/)).map(classKeyOf).filter(Boolean);
    const classes = asked.length ? asked : allowed.length === 1 ? allowed : [];
    const bad = classes.find((c) => !allowed.includes(c));
    if (bad) { res.status(403).json({ ok: false, error: `クラス「${bad}」は この 教室の クラスでは ありません` }); return null; }
    return { ...body, classes };
  };
  // クラスごとに 分けて 見る：名簿の クラスと、宿題に 書いて ある クラス。
  api.get('/homework', async (req, res) => {
    const allowed = scope(req);
    let classes;
    if (allowed) classes = [...allowed];
    else {
      let roster = [];
      try { roster = await rosterClasses(); } catch (err) { log.warn('[homework] roster classes failed:', err.message); }
      classes = [...new Set([...roster.map(classKeyOf), ...homework.assignments.flatMap((a) => a.classes)].filter((c) => c && c !== '*'))].sort();
    }
    const items = homework.assignments.filter((a) => !allowed || a.classes.some((c) => allowed.includes(c)));
    res.json({ ok: true, kinds: KINDS, kindJa: KIND_JA, ai: aiReady, classes, items: items.map((a) => view(a, allowed)) });
  });
  // 読みとるだけ（保存しない）。文・ファイル（写真・PDF・Word・Excel・CSV…）を まとめて。
  api.post('/homework/extract', async (req, res) => {
    if (!guard(req, res)) return;
    if (extractLimit && !extractLimit(req)) { res.status(429).json({ ok: false, error: '読みとりが 多すぎます。1 時間 ほど まって ください' }); return; }
    try { res.json(await extractHomework({ text: String(req.body?.text || ''), files: req.body?.files || [] }, { log })); }
    catch (err) { log.warn('[homework] extract failed:', err.message); res.status(500).json({ ok: false, error: err.message }); }
  });
  api.post('/homework', async (req, res) => {
    if (!guard(req, res)) return;
    const body = classesFor(req, res, req.body || {}); if (!body) return;
    const r = await homework.create(body); res.status(r.ok ? 200 : 400).json(r);
  });
  api.put('/homework/:id', async (req, res) => {
    if (!guard(req, res) || !mine(req, res, req.params.id)) return;
    const body = classesFor(req, res, req.body || {}); if (!body) return;
    const r = await homework.update(req.params.id, body); res.status(r.ok ? 200 : 400).json(r);
  });
  api.post('/homework/:id/publish', async (req, res) => { if (!guard(req, res) || !mine(req, res, req.params.id)) return; const r = await homework.publish(req.params.id, !!req.body?.on); res.status(r.ok ? 200 : 400).json(r); });
  api.delete('/homework/:id', async (req, res) => { if (!guard(req, res) || !mine(req, res, req.params.id)) return; res.json(await homework.remove(req.params.id)); });
  // 「せいとの 画面で みる」：子どもに 出る 形を 作って かえす（保存しない）。答えも つく（先生の ためし）。
  api.post('/homework/preview', (req, res) => {
    if (!guard(req, res)) return;
    const { items } = checkItems(Array.isArray(req.body?.items) ? req.body.items.slice(0, 200) : []);
    const formats = [];
    for (const it of items) { try { formats.push(buildItem(it, items)); } catch { formats.push(null); } }
    res.json({ ok: true, formats });
  });
  api.get('/homework/:id/progress', (req, res) => {
    const allowed = scope(req);
    if (!homework.get(req.params.id)) { res.status(404).json({ ok: false, error: 'ありません' }); return; }
    res.json({ ok: true, rows: homework.classProgress(req.params.id).filter((r) => !allowed || allowed.includes(r.classCode)) });
  });
}

export function homeworkAdminExtension({ homework, aiReady = false, rosterClasses = async () => [], log = console }) {
  return ({ router, api, authed }) => {
    router.get('/homework', (req, res) => {
      if (!authed(req)) { res.redirect(303, '/admin'); return; }
      res.type('text/html; charset=utf-8').send(page({ aiReady }));
    });
    mountHomeworkApi(api, { homework, aiReady, rosterClasses, log });
  };
}


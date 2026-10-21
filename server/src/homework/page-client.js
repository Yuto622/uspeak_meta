// 宿題の 画面の 動き（page.js が <script type="module"> の 中に そのまま 入れる。CFG は page.js が 先に 書く）。
// 判定・保存・どの クラスに くばれるかは ぜんぶ サーバー。ここは 入れて・見せて・送る だけ。
const $ = (s) => document.querySelector(s);
const H = { 'x-requested-with': CFG.header, 'content-type': 'application/json' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = (path, opts = {}) => fetch(CFG.api + path, { headers: H, ...opts }).then(async (r) => { if (r.status === 401) { location.href = CFG.home; return { ok: false }; } return r.json().catch(() => ({ ok: false, error: `${r.status}` })); });
const store = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } } };

// 7 つの 形（絵と ことば）。ok(it)：その 問題を この 形に できるか。
const KINDS = [
  { id: 'mc', icon: '🔘', ja: 'えらぶ', ok: (it) => !!(it.prompt ? it.answer : it.en && it.ja) },
  { id: 'listen', icon: '👂', ja: 'きいて えらぶ', ok: (it) => !it.prompt && !!(it.en && it.ja) },
  { id: 'match', icon: '🔗', ja: 'せんつなぎ', ok: (it) => !it.prompt && !!(it.en && it.ja) },
  { id: 'spell', icon: '🔤', ja: 'つづり', ok: (it) => !it.prompt && !!(it.en && it.ja) && /^[a-z' -]{2,20}$/i.test(it.en) },
  { id: 'type', icon: '⌨️', ja: 'タイピング', ok: (it) => !it.prompt && !!(it.en && it.ja) },
  { id: 'order', icon: '🧩', ja: 'ならべかえ', ok: (it) => !it.prompt && String(it.sentence || it.en || '').trim().split(/\s+/).length >= 3 },
  { id: 'fill', icon: '🕳', ja: 'あなうめ', ok: (it) => !it.prompt && !!(it.sentence || it.en) && !!it.blank },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));
const SAMPLE = 'apple = りんご\nbanana = バナナ\norange = オレンジ\nI (like) cats. わたしは ねこが すきです。\nI play soccer every day. わたしは まいにち サッカーを します。';

let picked = []; let items = []; let editing = null; let meta = { items: [], classes: [] };
let cls = store.get(CFG.clsKey);
const msg = (t, bad = false) => { const m = $('#msg'); m.textContent = t || ''; m.className = bad ? 'bad' : ''; };

// ---- タブと ステップ ----
function tab(which) {
  $('#tab-make').setAttribute('aria-selected', String(which === 'make'));
  $('#tab-list').setAttribute('aria-selected', String(which === 'list'));
  $('#make').hidden = which !== 'make'; $('#list-panel').hidden = which !== 'list';
  if (which === 'list') load();
}
function step(n) {
  for (const i of [1, 2, 3]) {
    $(`#step${i}`).hidden = i !== n;
    const li = $(`#st${i}`); li.className = i === n ? 'on' : i < n ? 'done' : '';
  }
  if (n === 3) summary();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('#tab-make').onclick = () => tab('make');
$('#tab-list').onclick = () => tab('list');

// ---- 使い方の 動画（はじめては 上に 案内。とじると この ブラウザでは 出さない）----
const vdlg = $('#video-dlg');
const openVideo = (t = 0) => { vdlg.showModal(); const v = $('#video'); try { v.currentTime = t; v.play().catch(() => {}); } catch { /* */ } };
$('#help').onclick = () => openVideo(0);
$('#first-play').onclick = () => openVideo(0);
$('#first-x').onclick = () => { $('#first').hidden = true; store.set('uspeak-hw-first-seen', '1'); };
if (store.get('uspeak-hw-first-seen')) $('#first').hidden = true;
$('#chapters').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { const v = $('#video'); v.currentTime = Number(b.dataset.t); v.play().catch(() => {}); } };
for (const d of document.querySelectorAll('dialog')) {
  d.querySelector('[data-close]').onclick = () => d.close();
  d.addEventListener('close', () => { const v = d.querySelector('video'); if (v) v.pause(); });
}

// ---- ① 入れる ----
// 写真は ブラウザで JPEG に して 小さく（iPhone の HEIC も ここで JPEG に なる）
function shrink(file) {
  return new Promise((ok) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { const k = Math.min(1, 2200 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok({ name: file.name.replace(/\.(heic|heif|png|webp)$/i, '.jpg'), type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85) }); };
    img.onerror = () => { URL.revokeObjectURL(url); ok(null); };
    img.src = url;
  });
}
const asData = (file) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok({ name: file.name, type: file.type, data: r.result }); r.readAsDataURL(file); });
async function add(list) {
  for (const f of list) {
    const isImg = /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name);
    const got = isImg ? (await shrink(f)) || (await asData(f)) : await asData(f);
    if (got) picked.push(got);
  }
  paintFiles();
}
function paintFiles() {
  $('#files').innerHTML = picked.map((f, i) => `<span>📎 ${esc(f.name)} <button type="button" data-x="${i}" aria-label="はずす">✕</button></span>`).join('');
  $('#read').disabled = !picked.length && !$('#text').value.trim();
}
$('#files').onclick = (e) => { const x = e.target.closest('[data-x]'); if (x) { picked.splice(Number(x.dataset.x), 1); paintFiles(); } };
$('#file').onchange = (e) => add([...e.target.files]);
$('#cam').onchange = (e) => add([...e.target.files]);
$('#text').oninput = paintFiles;
const drop = $('#drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('on'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('on'); }));
drop.addEventListener('drop', (e) => add([...e.dataTransfer.files]));
document.addEventListener('paste', (e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length && document.activeElement !== $('#text')) add(fs); });
$('#sample').onclick = () => { $('#paste-box').open = true; $('#text').value = SAMPLE; paintFiles(); read(); };
$('#tmpl').onclick = () => {
  const csv = '﻿英語,日本語,英文,あな,形式,まちがい\napple,りんご,,,えらぶ,\n,,I (like) cats.,like,あなうめ,"play, eat"\n';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'しゅくだい_ひながた.csv'; a.click();
};
async function read() {
  if (!picked.length && !$('#text').value.trim()) { msg('ファイルか 文を 入れて ください', true); return; }
  msg('🔍 読みとり中…（写真・PDF は 1 分ほど かかる ことが あります）'); $('#read').disabled = true;
  const r = await api('/homework/extract', { method: 'POST', body: JSON.stringify({ text: $('#text').value, files: picked }) }).catch((e) => ({ ok: false, error: String(e) }));
  $('#read').disabled = false;
  if (!r.ok) { msg(`読めませんでした：${r.error || ''}`, true); return; }
  if (!r.items?.length) { msg('問題が 見つかりませんでした。はりつけの 形を たしかめて ください', true); return; }
  msg('');
  editing = null; items = r.items;
  $('#title').value = r.title || '';
  if ($('#classes').tagName === 'INPUT' && $('#classes').type !== 'hidden') $('#classes').value = cls;
  setDue('');
  $('#check-banner').innerHTML = `🤖 <b>${items.length} もん</b> 読みとりました${r.via === 'ai' || r.via === 'file+ai' ? '（AI）' : ''}。<b>まちがいが ないか たしかめて ください。</b>子どもには まだ 出ません。${(r.warnings || []).length ? `<br><small>${r.warnings.map(esc).join('<br>')}</small>` : ''}`;
  paint(); step(2);
}
$('#read').onclick = read;
$('#read').disabled = true;

// ---- ② たしかめて なおす ----
const mainOf = (it) => (it.prompt ? it.prompt : (['order', 'fill'].includes(it.kind) ? it.sentence || it.en : it.en));
const secondOf = (it) => (it.prompt ? it.answer : it.ja);
function paintKinds() {
  $('#kinds').innerHTML = KINDS.map((k) => { const n = items.filter((it) => it.kind === k.id).length; return `<button type="button" data-kind="${k.id}"><span>${k.icon}</span>${esc(k.ja)}${n ? ` <small>(${n})</small>` : ''}</button>`; }).join('');
}
function paint() {
  paintKinds();
  $('#rows').innerHTML = items.map((it, i) => {
    const sel = `<select data-i="${i}" data-f="kind">${KINDS.map((k) => `<option value="${k.id}"${k.id === it.kind ? ' selected' : ''}${k.ok(it) || k.id === it.kind ? '' : ' disabled'}>${k.icon} ${esc(k.ja)}</option>`).join('')}</select>`;
    const isSent = ['order', 'fill'].includes(it.kind);
    return `<div class="q" data-row="${i}"><div class="n">${i + 1}</div>
      <div><label>形</label>${sel}</div>
      <div><label>${it.prompt ? '問題文' : isSent ? '英文' : '英語（ことば）'}</label><input data-i="${i}" data-f="main" value="${esc(mainOf(it))}"></div>
      <div><label>${it.prompt ? '正解' : '日本語の 意味'}</label><input data-i="${i}" data-f="second" value="${esc(secondOf(it))}"></div>
      <button type="button" class="btn warn del" data-del="${i}" aria-label="この 問題を 消す">🗑</button>
      <div class="more">${it.kind === 'fill' ? `<div><label>あなに する ことば</label><input data-i="${i}" data-f="blank" value="${esc(it.blank)}"></div>` : ''}
        <div><label>まちがいの こたえ（なくても よい・, で 区切る）</label><input data-i="${i}" data-f="wrong" value="${esc((it.wrong || []).join(', '))}"></div></div>
      <div class="why"></div></div>`;
  }).join('') || '<div class="empty"><b>📝</b>問題が ありません。「＋ 問題を 足す」で 作れます。</div>';
  check();
}
function readRows() {
  document.querySelectorAll('#rows [data-f]').forEach((el) => {
    const it = items[Number(el.dataset.i)]; const v = el.value.trim(); const f = el.dataset.f;
    if (f === 'kind') it.kind = v;
    else if (f === 'blank') it.blank = v;
    else if (f === 'wrong') it.wrong = v ? v.split(/\s*[,、]\s*/) : [];
    else if (f === 'main') { if (it.prompt) it.prompt = v; else if (['order', 'fill'].includes(it.kind)) { it.sentence = v; } else { it.en = v; } }
    else if (f === 'second') { if (it.prompt) it.answer = v; else it.ja = v; }
  });
}
function problems() {
  const bad = {};
  items.forEach((it, i) => {
    if (!mainOf(it)) bad[i] = '中身が ありません';
    else if (it.kind === 'fill' && !it.blank) bad[i] = 'あなに する ことばを 入れて ください';
    else if (it.kind === 'fill' && !String(it.sentence || it.en).toLowerCase().includes(String(it.blank).toLowerCase())) bad[i] = 'あなに する ことばが 英文の 中に ありません';
    else if (!it.prompt && ['mc', 'match', 'listen', 'spell', 'type'].includes(it.kind) && !it.ja) bad[i] = '日本語の 意味を 入れて ください';
    else if (it.prompt && !it.answer) bad[i] = '正解を 入れて ください';
  });
  return bad;
}
function mark(bad) {
  document.querySelectorAll('#rows .q').forEach((row) => { const i = Number(row.dataset.row); row.classList.toggle('bad', !!bad[i]); row.querySelector('.why').textContent = bad[i] ? `⚠ ${bad[i]}` : ''; });
  const n = Object.keys(bad).length;
  $('#bad-banner').hidden = !n;
  $('#bad-banner').textContent = n ? `⚠ ${n} もん なおす ところが あります（赤い 問題）。ほかの 問題は そのまま 使えます。なおすか 🗑 で 消して ください。` : '';
  $('#next3').disabled = !items.length || n > 0;
}
let timer = 0;
function check() { clearTimeout(timer); timer = setTimeout(() => { readRows(); mark(problems()); }, 120); }
$('#rows').addEventListener('input', check);
$('#rows').addEventListener('change', (e) => { if (e.target.dataset.f === 'kind') { readRows(); paint(); } else check(); });
$('#rows').onclick = (e) => { const d = e.target.closest('[data-del]'); if (d) { readRows(); items.splice(Number(d.dataset.del), 1); paint(); } };
$('#kinds').onclick = (e) => {
  const b = e.target.closest('[data-kind]'); if (!b) return;
  readRows(); const k = KIND[b.dataset.kind]; let n = 0;
  for (const it of items) if (k.ok(it)) { it.kind = k.id; n += 1; }
  paint(); msg(`${n} もんを「${k.ja}」に しました`);
};
$('#add').onclick = () => { readRows(); items.push({ kind: 'mc', en: '', ja: '', sentence: '', blank: '', wrong: [], prompt: '', answer: '' }); paint(); };
$('#back1').onclick = () => step(1);
$('#next3').onclick = () => { readRows(); const bad = problems(); mark(bad); if (Object.keys(bad).length) return; step(3); };

// せいとの 画面で みる（子どもに 出る 形を その まま。○× も ためせる。記録は のこらない）
let pv = { list: [], i: 0, ctl: null };
let ui = null;
async function preview() {
  readRows();
  const r = await api('/homework/preview', { method: 'POST', body: JSON.stringify({ items }) });
  if (!r.ok) { msg('プレビューを 作れませんでした', true); return; }
  ui = ui || { ...(await import('/formats-ui.js')), ...(await import('/formats-core.js')) };
  pv = { list: r.formats.filter(Boolean), i: 0, ctl: null };
  if (!pv.list.length) { msg('見せられる 問題が ありません', true); return; }
  $('#pv-dlg').showModal(); showPv();
}
function showPv() {
  pv.ctl?.destroy?.();
  const fmt = pv.list[pv.i];
  $('#pv-n').textContent = `${pv.i + 1} / ${pv.list.length}`;
  pv.ctl = ui.renderFormat($('#pv-host'), ui.publicFormat ? ui.publicFormat(fmt) : fmt, {
    onQuit: () => $('#pv-dlg').close(),
    onCheck: (answer) => pv.ctl.showResult(ui.checkFormat(fmt, answer)),
  });
}
$('#preview').onclick = preview;
$('#pv-prev').onclick = () => { if (pv.i > 0) { pv.i -= 1; showPv(); } };
$('#pv-next').onclick = () => { if (pv.i < pv.list.length - 1) { pv.i += 1; showPv(); } };
$('#pv-dlg').addEventListener('close', () => { pv.ctl?.destroy?.(); pv.ctl = null; });

// ---- ③ しめきりを きめて くばる ----
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function setDue(v) {
  $('#due').value = v;
  document.querySelectorAll('#quick [data-d]').forEach((b) => { const d = Number(b.dataset.d); const want = d ? ymd(new Date(Date.now() + d * 86400e3)) : ''; b.classList.toggle('on', want === v); });
  summary();
}
$('#quick').onclick = (e) => { const b = e.target.closest('[data-d]'); if (!b) return; const d = Number(b.dataset.d); setDue(d ? ymd(new Date(Date.now() + d * 86400e3)) : ''); };
$('#due').onchange = () => setDue($('#due').value);
$('#title').oninput = () => summary();
function classesValue() { return $('#classes').value.trim(); }
function summary() {
  const due = $('#due').value;
  const kinds = [...new Set(items.map((it) => it.kind))].map((k) => `${KIND[k]?.icon || ''} ${KIND[k]?.ja || k}`).join('・');
  $('#summary').innerHTML = `📋 <b>${esc($('#title').value || 'しゅくだい')}</b> ・ ${items.length} もん（${esc(kinds)}）<br>👥 クラス <b>${esc(classesValue() || '（まだ きまって いません）')}</b> ・ ⏰ しめきり <b>${due ? esc(due.slice(5).replace('-', '/')) : 'なし'}</b><br><small>「📤 くばる」を おすと、この クラスの 子の しゅくだい島に すぐ 出ます。</small>`;
}
async function save(pub) {
  readRows();
  if (!classesValue()) { msg('クラスを えらんで ください', true); return; }
  const body = { title: $('#title').value, classes: classesValue(), due: $('#due').value, items, via: CFG.room ? 'teacher' : 'admin' };
  const r = editing ? await api(`/homework/${editing}`, { method: 'PUT', body: JSON.stringify(body) }) : await api('/homework', { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) { step(2); mark(Object.fromEntries((r.problems || []).map((p) => [p.index, p.reason]))); msg(`保存できません：${r.error || ''}`, true); return; }
  const id = r.assignment.id;
  if (r.problems?.length) { editing = id; step(2); mark(Object.fromEntries(r.problems.map((p) => [p.index, p.reason]))); msg('下書きに 保存しました。赤い 問題を なおすと くばれます'); return; }
  if (pub) {
    const p = await api(`/homework/${id}/publish`, { method: 'POST', body: JSON.stringify({ on: true }) });
    if (!p.ok) { editing = id; step(2); mark(Object.fromEntries((p.problems || []).map((x) => [x.index, x.reason]))); msg(`くばれません：${p.error || ''}`, true); return; }
  }
  snack(pub ? '📤 くばりました！ 子どもの しゅくだい島に 出ています' : '💾 下書きに 保存しました');
  editing = null; picked = []; items = []; $('#text').value = ''; paintFiles(); step(1); tab('list');
}
$('#save').onclick = () => save(false);
$('#savepub').onclick = () => save(true);
$('#back2').onclick = () => step(2);

// ---- 📋 くばった 宿題 ----
let pending = null;   // 消す（10 秒 もとに もどせる）
function snack(text, undo = null) {
  const s = $('#snack'); $('#snack-text').textContent = text; $('#snack-undo').hidden = !undo; s.hidden = false;
  clearTimeout(snack.t); snack.t = setTimeout(() => { s.hidden = true; undo?.timeout?.(); }, undo ? 10000 : 4000);
  $('#snack-undo').onclick = () => { clearTimeout(snack.t); s.hidden = true; undo?.undo?.(); };
}
async function load() {
  const d = await api('/homework'); if (!d.ok) return;
  meta = d;
  if ($('#cls-list')) $('#cls-list').innerHTML = (d.classes || []).map((c) => `<option value="${esc(c)}">`).join('');
  const sel = $('#cls');
  sel.innerHTML = '<option value="">ぜんぶの クラス</option>' + (d.classes || []).map((c) => `<option${c === cls ? ' selected' : ''}>${esc(c)}</option>`).join('');
  if (cls && !(d.classes || []).includes(cls)) { cls = ''; sel.value = ''; }
  $('#list-count').textContent = String(d.items.filter((a) => a.status === 'published').length);
  render();
}
const today = () => ymd(new Date());
function card(a) {
  const late = a.status === 'published' && a.due && a.due < today();
  const chip = !a.classes.length ? '<span class="chip none">クラス なし</span>' : a.status === 'published' ? (late ? '<span class="chip late">⏰ しめきり すぎ</span>' : '<span class="chip pub">📤 くばっています</span>') : '<span class="chip draft">✏️ 下書き</span>';
  const pct = a.started ? Math.round((a.finished / Math.max(1, a.started)) * 100) : 0;
  const acts = a.editable === false ? '<p class="muted">ほかの 教室とも いっしょの 宿題なので、ここでは なおせません。</p>'
    : `<div class="row">${a.status === 'published' ? '' : `<button type="button" class="btn big" data-pub="${a.id}" data-on="1" style="min-height:48px;font-size:16px">📤 くばる</button>`}
        <button type="button" class="btn" data-prog="${a.id}">📊 すすみぐあい</button><button type="button" class="btn" data-edit="${a.id}">✏️ なおす</button>
        <span class="menu"><button type="button" class="btn" data-menu="${a.id}" aria-label="ほかの そうさ">… ほか</button><div hidden id="m-${a.id}">${a.status === 'published' ? `<button type="button" data-pub="${a.id}" data-on="0">⏸ くばるのを やめる</button>` : ''}<button type="button" data-rm="${a.id}">🗑 消す</button></div></span></div>`;
  return `<div class="card" id="c-${a.id}"><h3>${esc(a.title)} ${chip}</h3>
    <div class="muted">${a.items.length} もん ・ クラス ${a.classes.length ? esc(a.classes.join(', ')) : '<b style="color:var(--bad)">なし（なおす で 入れて ください）</b>'}${a.due ? ` ・ しめきり ${esc(a.due.slice(5).replace('-', '/'))}` : ''}${a.problems.length ? ` ・ <b style="color:var(--bad)">出せない 問題 ${a.problems.length}</b>` : ''}</div>
    ${a.status === 'published' ? `<div class="muted">👧 はじめた <b>${a.started}</b> 人 ・ ✅ おわった <b>${a.finished}</b> 人</div><div class="meter"><i style="width:${pct}%"></i></div>` : ''}
    ${acts}<div id="p-${a.id}"></div></div>`;
}
function render() {
  const items = meta.items.filter((a) => a.id !== pending?.id);
  const groups = cls ? [[cls, items.filter((a) => a.classes.includes(cls))]] : (meta.classes || []).map((c) => [c, items.filter((a) => a.classes.includes(c))]);
  const none = items.filter((a) => !a.classes.length);
  if (none.length) groups.push(['⚠ クラスが きまって いない（くばれません。「なおす」で クラスを 入れて ください）', none]);
  const html = groups.filter((g) => g[1].length).map((g) => `<h3 class="grp">${esc(g[0])} <span class="muted">${g[1].length} こ</span></h3>${g[1].map(card).join('')}`).join('');
  $('#list').innerHTML = html || '<div class="empty"><b>📭</b>まだ 宿題が ありません。<br><button type="button" class="btn big" id="go-make" style="margin-top:12px">✏️ 宿題を つくる</button></div>';
  $('#go-make')?.addEventListener('click', () => tab('make'));
}
$('#cls').onchange = () => { cls = $('#cls').value; store.set(CFG.clsKey, cls); render(); };
document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) document.querySelectorAll('.menu > div').forEach((m) => { m.hidden = true; }); });
$('#list').onclick = async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.menu) { const m = $(`#m-${b.dataset.menu}`); m.hidden = !m.hidden; return; }
  if (b.dataset.edit) {
    const a = meta.items.find((x) => x.id === b.dataset.edit); editing = a.id; items = JSON.parse(JSON.stringify(a.items));
    $('#title').value = a.title; if ($('#classes').type !== 'hidden') $('#classes').value = a.classes.join(', '); setDue(a.due || '');
    $('#check-banner').innerHTML = `✏️ 「<b>${esc(a.title)}</b>」を なおして います。`;
    tab('make'); paint(); step(2); if (a.problems.length) mark(Object.fromEntries(a.problems.map((p) => [p.index, p.reason])));
  }
  if (b.dataset.pub) {
    const on = b.dataset.on === '1';
    const r = await api(`/homework/${b.dataset.pub}/publish`, { method: 'POST', body: JSON.stringify({ on }) });
    snack(r.ok ? (on ? '📤 くばりました' : '⏸ くばるのを やめました（子どもには 見えなく なります）') : `できません：${r.error || ''}`);
    load();
  }
  if (b.dataset.rm) {
    const a = meta.items.find((x) => x.id === b.dataset.rm);
    // 子どもが はじめて いる 宿題だけ たしかめる。ほかは すぐ 消して 10 秒 もとに もどせる。
    if (a.started && !confirm(`${a.started} 人が はじめて います。消すと 子どもの 記録も 消えます。よろしいですか？`)) return;
    if (pending) await api(`/homework/${pending.id}`, { method: 'DELETE' });
    pending = a; render();
    snack(`🗑 「${a.title}」を 消しました`, {
      undo: () => { pending = null; render(); },
      timeout: async () => { if (pending?.id === a.id) { await api(`/homework/${a.id}`, { method: 'DELETE' }); pending = null; load(); } },
    });
  }
  if (b.dataset.prog) {
    const r = await api(`/homework/${b.dataset.prog}/progress`);
    $(`#p-${b.dataset.prog}`).innerHTML = r.rows?.length ? `<table class="prog"><tr><th>クラス</th><th>名前</th><th>すすみ</th><th>せいかい</th><th></th></tr>${r.rows.map((x) => `<tr><td>${esc(x.classCode)}</td><td>${esc(x.name)}</td><td>${x.answered} / ${x.total}</td><td>${x.correct}（${x.score}%）</td><td>${x.done ? '✅ おわり' : x.overdue ? '⏰ しめきり すぎ' : '✏️ とちゅう'}</td></tr>`).join('')}</table>` : '<p class="muted">まだ だれも はじめて いません。</p>';
  }
};
// 10 秒 たつ 前に ページを とじても、消した ものは 消す（もとに もどす を おして いなければ）。
window.addEventListener('pagehide', () => { if (pending) fetch(CFG.api + `/homework/${pending.id}`, { method: 'DELETE', headers: H, keepalive: true }); });

paintFiles(); step(1); load();

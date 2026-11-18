// 📚 えほんを くばる（3 ステップ：えらぶ → 生徒を えらぶ → おくる）。page.js が page-client.js の あとに そのまま 入れる。
// 本の 一覧・クラスの 子どもの 名前・だれに 出すかの 判定は ぜんぶ サーバー（/homework/books・/homework/students・POST /homework）。
{
  const B = { stages: [], stage: '', book: null, cls: '', names: [], all: true, picked: new Set(), due: '' };
  const bmsg = (t, bad = false) => { const m = $('#bk-msg'); m.textContent = t || ''; m.className = bad ? 'bad' : ''; };
  const bstep = (n) => {
    for (const i of [1, 2, 3]) { $(`#bk${i}`).hidden = i !== n; $(`#bst${i}`).className = i === n ? 'on' : i < n ? 'done' : ''; }
    if (n === 3) bsummary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const clsOf = () => String($('#bk-class').value || '').trim();
  function paintBooks() {
    $('#bk-stages').innerHTML = B.stages.map((s) => `<button type="button" data-stage="${esc(s.id)}" class="${s.id === B.stage ? 'on' : ''}">レベル ${esc(s.id)}</button>`).join('');
    const st = B.stages.find((s) => s.id === B.stage);
    $('#bk-books').innerHTML = (st?.books || []).map((b) => `<button type="button" class="bk-book${B.book?.id === b.id ? ' on' : ''}" data-book="${esc(b.id)}">
      <img src="${esc(b.cover)}" alt="" loading="lazy"><b>${esc(b.title)}</b><small>${esc(b.titleJa)} ・ ${b.words} 語</small></button>`).join('') || '<p class="muted">この レベルの 本は まだ ありません。</p>';
    $('#bk-next2').disabled = !B.book;
  }
  async function loadBooks() {
    if (B.stages.length) return;
    const r = await api('/homework/books'); if (!r.ok) { bmsg('本を 読みこめませんでした', true); return; }
    B.stages = r.stages; B.stage = B.stages[0]?.id || ''; paintBooks();
  }
  async function loadNames() {
    const c = clsOf(); B.cls = c; B.names = []; B.picked = new Set();
    if (c) { const r = await api(`/homework/students?class=${encodeURIComponent(c)}`); if (r.ok) B.names = r.names; }
    paintNames();
  }
  function paintNames() {
    $('#bk-all').checked = B.all;
    $('#bk-names').hidden = B.all;
    $('#bk-names').innerHTML = B.names.length
      ? B.names.map((n) => `<label class="bk-name"><input type="checkbox" value="${esc(n)}"${B.picked.has(n) ? ' checked' : ''}> ${esc(n)}</label>`).join('')
      : '<p class="muted">名簿に この クラスの 子が まだ いません（クラス ぜんいんに なら おくれます）。</p>';
    $('#bk-next3').disabled = !B.cls || (!B.all && !B.picked.size);
  }
  function bsummary() {
    const who = B.all ? `クラス <b>${esc(B.cls)}</b> の ぜんいん` : `クラス <b>${esc(B.cls)}</b> の <b>${B.picked.size}</b> 人（${esc([...B.picked].join('・'))}）`;
    $('#bk-summary').innerHTML = `📖 <b>${esc(B.book?.title || '')}</b>（${esc(B.book?.titleJa || '')}）<br>👥 ${who} ・ ⏰ しめきり <b>${B.due ? esc(B.due.slice(5).replace('-', '/')) : 'なし'}</b><br><small>「📤 おくる」を おすと、子どもの しゅくだいに 出ます。本を さいごまで 読んで ✓（きく・よむ・クイズ 8 わり）に なると「おわり」に なります。</small>`;
  }
  $('#tab-book').onclick = () => { tab('book'); loadBooks(); };
  $('#bk-stages').onclick = (e) => { const b = e.target.closest('[data-stage]'); if (b) { B.stage = b.dataset.stage; paintBooks(); } };
  $('#bk-books').onclick = (e) => { const b = e.target.closest('[data-book]'); if (!b) return; B.book = B.stages.flatMap((s) => s.books).find((x) => x.id === b.dataset.book) || null; paintBooks(); };
  $('#bk-next2').onclick = () => { bstep(2); loadNames(); };
  $('#bk-class').onchange = loadNames;
  $('#bk-all').onchange = () => { B.all = $('#bk-all').checked; paintNames(); };
  $('#bk-names').onchange = () => { B.picked = new Set([...document.querySelectorAll('#bk-names input:checked')].map((i) => i.value)); $('#bk-next3').disabled = !B.cls || (!B.all && !B.picked.size); };
  $('#bk-back1').onclick = () => bstep(1);
  $('#bk-next3').onclick = () => bstep(3);
  $('#bk-back2').onclick = () => bstep(2);
  const bdue = (v) => { B.due = v; $('#bk-due').value = v; document.querySelectorAll('#bk-quick [data-d]').forEach((b) => { const d = Number(b.dataset.d); b.classList.toggle('on', (d ? ymd(new Date(Date.now() + d * 86400e3)) : '') === v); }); bsummary(); };
  $('#bk-quick').onclick = (e) => { const b = e.target.closest('[data-d]'); if (!b) return; const d = Number(b.dataset.d); bdue(d ? ymd(new Date(Date.now() + d * 86400e3)) : ''); };
  $('#bk-due').onchange = () => bdue($('#bk-due').value);
  $('#bk-send').onclick = async () => {
    if (!B.book || !B.cls) return;
    $('#bk-send').disabled = true;
    const body = { title: `📖 ${B.book.title}`, classes: B.cls, book: B.book.id, students: B.all ? [] : [...B.picked], due: B.due, via: CFG.room ? 'teacher' : 'admin' };
    const r = await api('/homework', { method: 'POST', body: JSON.stringify(body) });
    const p = r.ok ? await api(`/homework/${r.assignment.id}/publish`, { method: 'POST', body: JSON.stringify({ on: true }) }) : r;
    $('#bk-send').disabled = false;
    if (!p.ok) { bmsg(`おくれません：${p.error || ''}`, true); return; }
    bmsg(''); snack('📤 えほんを おくりました！ 子どもの しゅくだいに 出ています');
    B.book = null; B.picked = new Set(); B.all = true; bdue(''); paintBooks(); bstep(1); tab('list');
  };
}

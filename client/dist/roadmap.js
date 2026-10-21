// 🗺 ロードマップ — A・B・C・1〜9 の 12 段階を すごろくの ように ならべ、いまの 場所に ⭐。
// 中身は ぜんぶ 部屋が きめる（rm:get → rm:state、段階が 上がると rm:up）。ページは ならべるだけ・お祝いするだけ。
// 英語を 大きく、日本語を 小さく 両方 出すので、入れ物は translate="no"（訳の 層が 2 重に しない）。
const SKILL = {
  read: ['Reading', 'よむ', '📖'], listen: ['Listening', 'きく', '🎧'], speak: ['Speaking', 'はなす', '🎤'], write: ['Writing', 'かく', '✏️'],
};
const EX_SKILL = { reading: ['Reading', 'よむ'], listening: ['Listening', 'きく'] };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (en, ja, cls = '') => `<span class="rm-bi ${cls}"><b>${esc(en)}</b><small>${esc(ja)}</small></span>`;

export function createRoadmapUI({ send, go = () => false, toast = () => {}, speak = () => {} }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'roadmap-dialog';
  dialog.setAttribute('translate', 'no');
  dialog.innerHTML = `<header class="rm-head"><div>${bi('🗺 Roadmap', 'ロードマップ', 'rm-title')}</div>
    <button type="button" class="rm-close" aria-label="close">×</button></header><div class="rm-body" id="rm-body"></div>
    <div class="rm-party" id="rm-party" hidden></div>`;
  document.body.append(dialog);
  const body = dialog.querySelector('#rm-body');
  const close = () => { try { dialog.close(); } catch { /* closed */ } };
  dialog.querySelector('.rm-close').onclick = close;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'roadmap-button';
  button.className = 'rank-button roadmap-button';
  button.hidden = true;
  button.setAttribute('translate', 'no');
  button.innerHTML = '<b class="en">🗺 Roadmap</b><i class="ja">ロードマップ</i>';
  button.onclick = () => open();
  const rail = document.querySelector('.right-rail');
  const rank = document.querySelector('#rank-button');
  if (rank?.parentElement) rank.after(button); else rail?.append(button);

  let last = null;

  function open() {
    if (!dialog.open) dialog.showModal();
    if (!last) body.innerHTML = `<p class="rm-wait">${bi('Loading…', 'よみこみ中…')}</p>`;
    send('rm:get', {});
  }

  function board(v) {
    return `<ol class="rm-board">${v.stages.map((s, i) => `<li class="${s.done ? 'done' : s.here ? 'here' : 'later'}" style="--i:${i}">
      <span class="rm-id">${esc(s.id)}</span>${s.here ? '<span class="rm-star" aria-label="you are here">⭐</span>' : s.done ? '<span class="rm-check">✓</span>' : ''}
      ${bi(s.en, s.ja, 'rm-name')}<em>${esc(s.gradeJa)}</em></li>`).join('')}</ol>`;
  }

  function nextCard(v) {
    if (v.last) return `<section class="rm-card rm-next">${bi('You reached the final stage!', 'さいごの 段階まで きたよ！', 'rm-big')}</section>`;
    const w = v.words; const q = v.quiz;
    const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 100);
    const en = []; const ja = [];
    if (w.left) { en.push(`${w.left} more word${w.left > 1 ? 's' : ''}`); ja.push(`単語 あと ${w.left} こ`); }
    if (q.left) { en.push(`${q.left} more quiz${q.left > 1 ? 'zes' : ''}`); ja.push(`クイズ あと ${q.left} 問`); }
    else if (q.acc !== null && q.acc < q.rate) { en.push(`${q.streakNeed} correct in a row`); ja.push(`あと ${q.streakNeed} 問 つづけて 正解`); }
    const head = v.ready ? bi('Ready for the next stage!', 'つぎの 段階に すすめるよ！', 'rm-big') : bi(`Next stage: ${en.join(' · ')}`, `次の 段階まで あと ${ja.join('・')}`, 'rm-big');
    return `<section class="rm-card rm-next">${head}
      <div class="rm-meters">
        <div>${bi(`Words ${w.known} / ${w.need}`, `覚えた 単語（${w.total} この 8 わり）`)}<i><b style="width:${pct(w.known, w.need)}%"></b></i></div>
        <div>${bi(`Quizzes ${Math.min(q.n, q.min)} / ${q.min}`, 'この 段階の クイズ')}<i><b style="width:${pct(q.n, q.min)}%"></b></i></div>
        <div>${bi(`Correct ${q.acc ?? 0}% / ${q.rate}%`, '正解率')}<i><b style="width:${pct(q.acc ?? 0, q.rate)}%"></b></i></div>
      </div>
      ${w.next?.length ? `<p class="rm-words">${bi('Words to learn next', 'つぎに 覚える ことば')} ${w.next.map((x) => `<span>${esc(x)}</span>`).join('')}</p>` : ''}</section>`;
  }

  function skillsCard(v) {
    return `<section class="rm-card">${bi('Your 4 skills', '4 つの 力', 'rm-sub')}<div class="rm-skills">${v.skills.map((s) => {
      const [en, ja, icon] = SKILL[s.key];
      const info = s.key === 'speak' ? `${s.n}×` : s.n ? `${s.acc}% · ${s.n}` : '—';
      return `<div class="rm-skill" data-k="${s.key}"><span>${icon}</span>${bi(en, ja)}<i><b style="width:${s.value}%"></b></i><em>${esc(info)}</em></div>`;
    }).join('')}</div></section>`;
  }

  function eikenCard(v) {
    if (!v.eiken?.length) return '';
    return `<section class="rm-card rm-eiken">${bi('Eiken outlook', '英検の 見こみ', 'rm-sub')}${v.eiken.map((c) => {
      if (c.chance === null) {
        const en = c.lacking.map((l) => `${l.more} more ${EX_SKILL[l.skill][0]}`).join(' · ');
        const ja = c.lacking.map((l) => `${EX_SKILL[l.skill][1]} あと ${l.more} 問`).join('・');
        return `<div class="rm-ex">${bi(`Eiken ${c.en}: not enough data yet`, `英検${c.ja}：まだ わからないよ`)}<p>${bi(`Answer ${en}`, `${ja} とくと わかるよ`)}</p></div>`;
      }
      let plan = '';
      if (c.plan?.kind === 'more') plan = bi(`Keep it up: ${c.plan.perSkill} more Reading & Listening each → 80%`, `この ちょうしで よむ・きく あと ${c.plan.perSkill} 問ずつ で 80%`);
      else if (c.plan?.kind === 'raise') plan = bi(`Raise ${EX_SKILL[c.plan.skill][0]} to ${c.plan.acc}% (now ${c.plan.now}%) → 80%`, `${EX_SKILL[c.plan.skill][1]}の 正解率を ${c.plan.acc}% に（いま ${c.plan.now}%）`);
      else plan = bi('Great! Keep practicing.', 'その ちょうし！');
      return `<div class="rm-ex"><div class="rm-gauge" style="--p:${c.chance}"><b>${c.chance}%</b></div>
        <div>${bi(`Eiken ${c.en} (1st stage) chance`, `英検${c.ja}（一次）の 合格見込み`)}<p>${plan}</p>
        ${c.basis === 'all' ? `<small class="rm-fine">${esc('単語クイズも 入れた 見こみ。英検の島の 問題を とくと もっと たしかに なるよ')}</small>` : ''}</div></div>`;
    }).join('')}<small class="rm-fine">${esc('練習問題の 正解と 英検の 問題数・合格の 目安（各技能 6 割 程度）から 計算した 見こみ。作文・面接は 入っていません。')}</small></section>`;
  }

  function placesCard(v) {
    const list = v.places?.list || [];
    if (!list.length) return '';
    const why = (p) => (p.why?.kind === 'words' ? bi(`${p.why.n} words`, `単語 ${p.why.n} こ`) : bi(`${p.why?.n || 10} questions`, `${p.why?.n || 10} 問`));
    return `<section class="rm-card">${bi('Where to practice', 'どこで れんしゅう する？', 'rm-sub')}<ul class="rm-places">${list.map((p, i) => `<li>
      <span class="rm-pi">${p.emoji}</span><div>${bi(p.en, p.ja)}<em>${why(p)}</em></div><button type="button" data-go="${i}">${bi('Go', 'いく')}</button></li>`).join('')}</ul>
      ${v.places.note ? `<small class="rm-fine">${esc(v.places.note)}</small>` : ''}</section>`;
  }

  function render(v) {
    if (v.off) { body.innerHTML = `<p class="rm-wait">${bi('Roadmap is not available now', 'いまは ロードマップを ひらけないよ')}</p>`; return; }
    const s = v.stage;
    body.innerHTML = `<section class="rm-now">${bi(`Stage ${s.id} · ${s.en}`, `いまの 段階：${s.id}「${s.ja}」${s.gradeJa}${s.jr ? ` ${s.jr}` : ''}`, 'rm-hero')}
      ${s.note ? `<small>${esc(s.note)}</small>` : ''}<span class="rm-week">${bi(`${v.weekDays} day${v.weekDays === 1 ? '' : 's'} this week`, `今週 ${v.weekDays} 日`)}</span></section>
      ${board(v)}<div class="rm-grid">${nextCard(v)}${skillsCard(v)}${eikenCard(v)}${placesCard(v)}</div>`;
    body.querySelectorAll('[data-go]').forEach((b) => {
      b.onclick = () => {
        const p = v.places.list[Number(b.dataset.go)];
        if (!p) return;
        if (p.spot === 'review') { close(); send('review:start', {}); return; }
        close();
        if (go(p) === false) toast(`${p.ja}へ いこう`);
      };
    });
    body.querySelector('.rm-board .here')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }

  function onState(v) { last = v; if (dialog.open) render(v); }

  // 段階が 上がった：紙ふぶき・⭐が となりへ・コイン。
  function onUp(m) {
    if (!dialog.open) dialog.showModal();
    const party = dialog.querySelector('#rm-party');
    party.hidden = false;
    party.innerHTML = `<div class="rm-confetti">${Array.from({ length: 36 }, (_, i) => `<i style="--x:${(i * 37) % 100};--d:${(i % 9) * 0.12}s;--h:${(i * 47) % 360}"></i>`).join('')}</div>
      <div class="rm-up"><span class="rm-up-star">⭐</span>${bi('Stage up!', 'だんかい アップ！', 'rm-up-title')}
      <p class="rm-up-step"><b>${esc(m.from)}</b> → <b>${esc(m.to)}</b></p>${bi(m.stage?.en || '', m.stage?.ja || '')}
      ${m.coins ? `<p class="rm-up-coins">◈ +${m.coins} ${bi('coins', 'コイン')}</p>` : ''}<button type="button" class="rm-up-ok">${bi('Yay!', 'やったね！')}</button></div>`;
    speak(`Stage up! Welcome to stage ${m.to}!`);
    party.querySelector('.rm-up-ok').onclick = () => { party.hidden = true; party.innerHTML = ''; send('rm:get', {}); };
    send('rm:get', {});
  }

  return {
    button, open, onState, onUp,
    setOnline(on) { button.hidden = !on; if (!on) { last = null; close(); } },
    get isOpen() { return dialog.open; },
  };
}

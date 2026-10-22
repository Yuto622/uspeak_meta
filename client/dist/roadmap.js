// 🗺 ロードマップ — A・B・C・1〜9 の 12 段階を 1 本の 旅の 道に ならべ、いまの 場所に ⭐（2026-10 作りなおし・下の hero() の 説明）。
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

  // ---- 2026-10 作りなおし：やる気の 研究から -------------------------------------------------
  // ① つぎまでの 輪（goal-gradient：ゴールが ちかいほど はやく なる＝Kivetz 2006）。
  // ② はじめた ぶんの スタンプは さいしょから ✓（endowed progress：2 こ おして ある カードは 34% vs 19%＝Nunes & Drèze 2006）。
  // ③ きょうの 1 歩（すぐ 先の 小さな 目標が 遠い 目標より 効く＝Bandura & Schunk 1981・小さな 前進＝Amabile & Kramer 2011）。
  // ④ 旅の 道は 1 本（Duolingo の path：つぎに やる ことが 迷わない）。つぎの 段階は 霧の 中で「めざす こと」だけ ちらっと（好奇心の すきま＝Loewenstein 1994）。
  // ⑤ できる ように なった ことの コレクション（できた 体験が 自信に なる＝Bandura の 自己効力感）。
  // ⑥ くわしい 数字・4 つの 力・英検は「くわしく」の 中に（小さい 子には 1 画面 1 つ）。
  const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 100);
  const STAMPS = [25, 50, 75];
  function progressOf(v) {
    if (v.last) return 100;
    if (v.ready) return 100;
    const w = v.words; const q = v.quiz;
    return Math.round((pct(w.known, w.need) * 0.5) + (pct(Math.min(q.n, q.min), q.min) * 0.3) + (pct(q.acc ?? 0, q.rate) * 0.2));
  }
  function todayStep(v) {
    const w = v.words; const q = v.quiz;
    if (v.last) return bi('You reached the top! Keep your words fresh.', 'いちばん 上まで きたよ！ ことばを わすれない ように つづけよう');
    if (v.ready) return bi('Open the game once more to level up!', 'つぎに ゲームを ひらくと だんかい アップ！');
    if ((v.refresh?.n || 0) >= 3) return bi('Refresh 5 old words today', 'きょうは わすれかけの ことばを 5 こ');
    const stamp = (v.checkpoints || []).find((c) => !c.reached);
    if (stamp && w.left) {
      const to = Math.max(1, Math.ceil((stamp.p / 100) * w.need) - w.known);
      return bi(`Learn ${to} more word${to > 1 ? 's' : ''} → stamp ${stamp.p}%`, `ことばを あと ${to} こ 覚えると 🎖 ${stamp.p}%`);
    }
    if (w.left) return bi(`Learn ${w.left} more words`, `ことばを あと ${w.left} こ 覚えよう`);
    if (q.left) { const n = Math.min(q.left, 10); return bi(`Answer ${n} quizzes today`, `きょうは クイズを ${n} 問`); }
    if (q.streakNeed) return bi(`${q.streakNeed} right in a row`, `あと ${q.streakNeed} 問 つづけて 正解`);
    return bi('Keep going!', 'この ちょうし！');
  }

  function hero(v) {
    const s = v.stage; const p = progressOf(v);
    const top = v.places?.list?.[0];
    // スタンプは 輪と 同じ ものさし（前は 単語だけで 見て いたので、輪が 32% でも スタンプが 0 だった）。
    const stamps = [{ p: 0, reached: true, start: true }, ...STAMPS.map((x) => ({ p: x, reached: p >= x }))];
    const nextStamp = STAMPS.find((x) => p < x);
    const fastNear = !v.ready && v.words.left === 0 && (v.quiz.acc ?? 0) >= 90 && v.quiz.n >= 5;
    return `<section class="rm2-hero">
      <div class="rm2-ringWrap"><div class="rm2-ring" style="--p:${p}"><div><b>${p}<small>%</small></b><span>${bi(v.last ? 'Top!' : `to stage ${esc(v.stages[v.index + 1]?.id || '')}`, v.last ? 'ゴール' : 'つぎまで')}</span></div></div>
        ${!v.last && !v.ready ? `<p class="rm2-almost">${nextStamp ? bi(`${nextStamp - p}% to 🎖`, `あと ${nextStamp - p}% で 🎖`) : bi(`${100 - p}% to ⭐`, `あと ${100 - p}% で ⭐ ゴール`)}</p>` : ''}</div>
      <div class="rm2-heroText">
        ${bi(`Stage ${s.id} · ${s.en}`, `いまの 段階 ${s.id}「${s.ja}」`, 'rm2-stage')}
        ${s.cando?.ja ? `<p class="rm2-goal">🎯 ${bi(s.cando.en, s.cando.ja)}</p>` : ''}
        <div class="rm2-stamps">${stamps.map((c) => `<span class="${c.reached ? 'on' : ''}" title="${c.start ? 'start' : `${c.p}%`}">${c.reached ? (c.start ? '🚩' : '🎖') : '○'}<small>${c.start ? 'スタート' : `${c.p}%`}</small></span>`).join('')}<span class="goal">${v.ready || v.last ? '⭐' : '☆'}<small>ゴール</small></span>
          ${v.last ? '' : `<span class="prize">🎁<small>${esc(`◈100・🏅 ${v.stages[v.index]?.id || ''}`)}</small></span>`}</div>
        <div class="rm2-today"><div>${bi('Today\'s step', 'きょうの 1 歩', 'rm2-todayHead')}${todayStep(v)}</div>
          ${top ? `<button type="button" class="rm-go-top" data-go="0"><span>${top.emoji}</span>${bi(top.en, top.ja)}<b>▶</b></button>` : ''}</div>
        ${fastNear ? `<p class="rm2-fast">🚀 ${bi('Fast track! 90% right skips the wait', 'とびきゅう チャンス！ 9 わり 正解で 20 問 またずに すすめる')}</p>` : ''}
      </div></section>`;
  }

  function path(v) {
    return `<ol class="rm2-path">${v.stages.map((s, i) => {
      const cls = s.done ? 'done' : s.here ? 'here' : i === v.index + 1 ? 'next' : 'fog';
      const tip = s.done || s.here ? (s.cando?.ja || '') : i === v.index + 1 ? (s.cando?.ja ? `つぎは「${s.cando.ja}」` : '') : '？';
      return `<li class="${cls}" style="--i:${i}" title="${esc(tip)}"><span class="rm2-node">${s.done ? '✓' : s.here ? '⭐' : cls === 'next' ? esc(s.id) : '🔒'}</span>
        <b>${esc(s.id)}</b>${cls === 'fog' ? '' : `<small>${esc(s.ja)}</small>`}${cls === 'next' && s.cando?.ja ? `<em>${esc(s.cando.ja)}</em>` : ''}</li>`;
    }).join('')}</ol>`;
  }

  function collection(v) {
    // バッジ 12 まいの わく（あいた わくが 見えると うめたく なる）。とった ものは 光る・いまの は ？・その先は 🔒。
    const got = v.stages.filter((s) => s.done && s.cando?.ja);
    const slots = v.stages.map((s) => `<li class="${s.done ? 'on' : s.here ? 'now' : ''}" title="${esc(s.done ? s.cando?.ja || '' : s.here ? `つぎの バッジ：${s.cando?.ja || ''}` : '')}"><span>${s.done ? '🏅' : s.here ? '❔' : '🔒'}</span><small>${esc(s.id)}</small></li>`).join('');
    const last = got[got.length - 1];
    return `<section class="rm-card rm2-got">${bi(`Badges ${got.length} / ${v.stages.length}`, `できる ように なった こと ${got.length} / ${v.stages.length}`, 'rm-sub')}
      <ol class="rm2-slots">${slots}</ol>
      ${last ? `<p class="rm2-lastBadge">🏅 ${bi(last.cando.en, last.cando.ja)}</p>` : `<p class="rm2-empty">${bi('Finish this stage to get your first badge!', `この 段階を おえると さいしょの バッジ「${v.stage.cando?.ja || ''}」`)}</p>`}</section>`;
  }

  function details(v) {
    const w = v.words; const q = v.quiz;
    return `<details class="rm2-more"><summary>${bi('Details', 'くわしく（ことば・クイズ・4 つの 力・英検）')}</summary>
      <section class="rm-card rm-next"><div class="rm-meters">
        <div>${bi(`Words ${w.known} / ${w.need}`, `覚えた 単語（${w.total} この 8 わり）`)}<i><b style="width:${pct(w.known, w.need)}%"></b></i></div>
        <div>${bi(`Quizzes ${Math.min(q.n, q.min)} / ${q.min}`, 'この 段階の クイズ')}<i><b style="width:${pct(q.n, q.min)}%"></b></i></div>
        <div>${bi(`Correct ${q.acc ?? 0}% / ${q.rate}% (last ${q.window || 30})`, `正解率（さいきんの ${q.window || 30} 問）`)}<i><b style="width:${pct(q.acc ?? 0, q.rate)}%"></b></i></div>
      </div>
      ${w.next?.length ? `<p class="rm-words">${bi('Words to learn next', 'つぎに 覚える ことば')} ${w.next.map((x) => `<span>${esc(x)}</span>`).join('')}</p>` : ''}
      ${w.fading ? `<p class="rm-fine">${esc(`わすれかけの ことば ${w.fading} こ（45 日 あいた ことばは 1 回 正解すると もどる）`)}</p>` : ''}</section>
      <div class="rm-grid">${skillsCard(v)}${eikenCard(v)}${placesCard(v)}</div></details>`;
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
    const list = (v.places?.list || []).slice(1); // 1 つめは 上の「つぎは これ」
    if (!list.length) return '';
    const why = (p) => (p.why?.kind === 'words' ? bi(`${p.why.n} words`, `単語 ${p.why.n} こ`) : bi(`${p.why?.n || 10} questions`, `${p.why?.n || 10} 問`));
    return `<section class="rm-card">${bi('Other places', 'ほかの ばしょ', 'rm-sub')}<ul class="rm-places">${list.map((p, i) => `<li>
      <span class="rm-pi">${p.emoji}</span><div>${bi(p.en, p.ja)}<em>${why(p)}</em></div><button type="button" data-go="${i + 1}">${bi('Go', 'いく')}</button></li>`).join('')}</ul>
      ${v.places.note ? `<small class="rm-fine">${esc(v.places.note)}</small>` : ''}</section>`;
  }

  function render(v) {
    if (v.off) { body.innerHTML = `<p class="rm-wait">${bi('Roadmap is not available now', 'いまは ロードマップを ひらけないよ')}</p>`; return; }
    body.innerHTML = `<div class="rm2">${hero(v)}${path(v)}
      <div class="rm2-row">${collection(v)}<section class="rm-card rm2-week">${bi(`${v.weekDays} day${v.weekDays === 1 ? '' : 's'} this week`, `今週 ${v.weekDays} 日 れんしゅう した`, 'rm-sub')}
        <div class="rm2-dots">${Array.from({ length: 7 }, (_, i) => `<i class="${i < v.weekDays ? 'on' : ''}">${i < v.weekDays ? '★' : ''}</i>`).join('')}</div>
        <p>${bi('Little and often beats long and rare.', 'すこしずつ なんども が いちばん のびる')}</p></section></div>
      ${details(v)}</div>`;
    body.querySelectorAll('[data-go]').forEach((b) => {
      b.onclick = () => {
        const p = v.places.list[Number(b.dataset.go)];
        if (!p) return;
        if (p.spot === 'review') { close(); send('review:start', p.refresh ? { refresh: true } : {}); return; }
        close();
        if (go(p) === false) toast(`${p.ja}へ いこう`);
      };
    });
    // scrollIntoView は ダイアログ ごと ずらすので、道の 中だけ 横に うごかす。
    const pathEl = body.querySelector('.rm2-path'); const here = pathEl?.querySelector('.here');
    if (pathEl && here) pathEl.scrollLeft = Math.max(0, here.offsetLeft - pathEl.clientWidth / 2 + here.offsetWidth / 2);
  }

  // とちゅうの スタンプを はじめて とった とき 1 回だけ おしらせ（この 端末に 覚える）。
  const STAMP_KEY = 'uspeak-rm-stamps-v1';
  function noteStamps(v) {
    if (!v?.stage || !v.checkpoints) return;
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(STAMP_KEY) || '{}') || {}; } catch { /* private mode */ }
    const pr = progressOf(v);
    const best = Math.max(0, ...STAMPS.filter((x) => pr >= x));
    const before = Number(seen[v.stage.id]) || 0;
    if (best > before) {
      seen[v.stage.id] = best;
      try { localStorage.setItem(STAMP_KEY, JSON.stringify(seen)); } catch { /* private mode */ }
      // はじめて 見た ときに もう 進んで いた ぶんは だまって 覚える（入った 日に 3 つ 出ない ように）。
      if (before || Object.keys(seen).length > 1) toast(`🎖 ${v.stage.id} の スタンプ ${best}%！ この ちょうし`);
    }
  }
  function onState(v) { last = v; noteStamps(v); if (dialog.open) render(v); }

  // 段階が 上がった：紙ふぶき・⭐が となりへ・コイン。
  function onUp(m) {
    if (!dialog.open) dialog.showModal();
    const party = dialog.querySelector('#rm-party');
    party.hidden = false;
    party.innerHTML = `<div class="rm-confetti">${Array.from({ length: 36 }, (_, i) => `<i style="--x:${(i * 37) % 100};--d:${(i % 9) * 0.12}s;--h:${(i * 47) % 360}"></i>`).join('')}</div>
      <div class="rm-up"><span class="rm-up-star">⭐</span>${bi('Stage up!', 'だんかい アップ！', 'rm-up-title')}
      <p class="rm-up-step"><b>${esc(m.from)}</b> → <b>${esc(m.to)}</b></p>${bi(m.stage?.en || '', m.stage?.ja || '')}
      ${m.stage?.cando?.ja ? `<p class="rm-cando">🎯 ${bi(m.stage.cando.en, `つぎは「${m.stage.cando.ja}」を めざそう`)}</p>` : ''}
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

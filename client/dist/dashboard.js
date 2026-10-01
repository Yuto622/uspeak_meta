// マイページ — what a child has actually done, in one screen.
//
// The third of the reference screens (DreaMagic). A coin balance says what they own; this
// says what they have learned, which is the thing the parent paying for this is buying and
// the thing a child cannot otherwise see. Three counters, each with how far to the next
// point, and a five-sided chart of the skills.
//
// Nothing here is worked out in the page. The room sends the shape (`dash:state`) because
// the room is the only thing that knows what was really answered — the same rule as coins,
// for the same reason: it ends up in front of a parent.
import { isJa, onLangChange } from './i18n.js';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The chart. Drawn rather than plotted with a library: five axes is a pentagon and a
// polygon, the whole thing is forty lines, and a chart library is 90 KB a class of thirty
// would each download to see it.
function drawRadar(canvas, skills) {
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 280;
  const h = canvas.clientHeight || 240;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2 + 4;
  const r = Math.min(w, h) / 2 - 34;      // room for the labels outside the shape
  const n = skills.length;
  const at = (i, k) => {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k];
  };

  // The web behind it: four rings, so a child can see roughly how far out they are.
  ctx.strokeStyle = '#d8ddcd';
  ctx.lineWidth = 1;
  for (const k of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) { const [x, y] = at(i, k); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath();
    ctx.stroke();
  }
  for (let i = 0; i < n; i += 1) {
    const [x, y] = at(i, 1);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
  }

  // The shape itself.
  ctx.beginPath();
  skills.forEach((s, i) => {
    const [x, y] = at(i, Math.max(0.02, s.score / 100));
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = '#e2705c33';
  ctx.fill();
  ctx.strokeStyle = '#dd6a55';
  ctx.lineWidth = 2;
  ctx.stroke();
  skills.forEach((s, i) => {
    const [x, y] = at(i, Math.max(0.02, s.score / 100));
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fillStyle = '#dd6a55'; ctx.fill();
  });

  // The labels, outside the web, each nudged so it does not sit on its own axis line.
  ctx.font = '600 11px "DM Sans", "Noto Sans JP", sans-serif';
  ctx.fillStyle = '#5d6b58';
  skills.forEach((s, i) => {
    const [x, y] = at(i, 1.19);
    ctx.textAlign = Math.abs(x - cx) < 6 ? 'center' : (x > cx ? 'left' : 'right');
    ctx.textBaseline = y < cy - 6 ? 'bottom' : (y > cy + 6 ? 'top' : 'middle');
    ctx.fillText(isJa() ? s.ja : (s.en || s.ja), x, y);
  });
}

// **サーバーが2つの言語で送ってくるもの**（カードの名前・5技能・月）は、両方を書いて
// `<html data-lang>` で見せ分ける（style.css の「12.」）。辞書を引かないので、
// 開いたまま言語を切り替えても その場で入れ替わる。
const UNIT_EN = { 分: ' min', 問: ' answers', 日: ' days' };
function bi(ja, en) {
  if (!en || en === ja) return esc(ja);
  return `<span class="ja">${esc(ja)}</span><span class="en">${esc(en)}</span>`;
}
// 「2026年10月」→「October 2026」。形がちがえば訳さない（そのまま出す）。
function monthEn(label) {
  const m = /^(\d{4})年(\d{1,2})月$/.exec(String(label || ''));
  if (!m) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, 15)).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function createDashboard({ send, isOnline, toast, onQuick = null }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'dash-dialog';
  dialog.innerHTML = `
    <button class="close" id="dash-close" aria-label="閉じる">×</button>
    <div class="dash-head">
      <div>
        <span class="dash-eyebrow">MY PAGE</span>
        <h2 id="dash-name">マイページ</h2>
      </div>
      <div class="dash-coins"><i class="coin-face" aria-hidden="true"></i><b id="dash-coins">0</b></div>
    </div>
    <div id="dash-body"><p class="dash-note">よみこみ中…</p></div>`;
  document.body.append(dialog);
  $('#dash-close', dialog).onclick = () => dialog.close();
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); dialog.close(); });

  let last = null;

  function render(m) {
    $('#dash-name', dialog).textContent = m.name ? `${m.name} のきろく` : 'マイページ';
    $('#dash-coins', dialog).textContent = (m.coins || 0).toLocaleString();
    const p = m.progress || { level: 1, xp: 0, need: 1 };
    const pct = Math.max(0, Math.min(100, Math.round((p.xp / (p.need || 1)) * 100)));
    const cards = (m.cards || []).map((c) => `
      <div class="dash-card">
        <small>${bi(c.ja, c.en)}</small>
        <b>${(c.value || 0).toLocaleString()}<span>${bi(c.unit, UNIT_EN[c.unit])}</span></b>
        <em>${bi(`✧ +1 まで あと ${c.toNext}${c.unit}`, `${c.toNext}${UNIT_EN[c.unit] || ''} to the next ✧`)}</em>
      </div>`).join('');
    // 今月のまとめ。**累計は増えるいっぽうだが、今月は毎月0から始まる。**
    // 「今日やれば今日増える」が見えるのはこちらで、7歳にはそれがぜんぶ。
    // 数字はサーバーが数えたもの（保護者レポートとまったく同じ `months`）。
    const months = Array.isArray(m.months) ? m.months : [];
    const now = months.find((x) => x.current);
    const before = months.find((x) => !x.current);
    // 先月とくらべる。**減っていても出す**（増えた月だけ褒めると、その月しか見なくなる）。
    const vs = now && before && before.days
      ? (now.days > before.days ? `先月より <b>${now.days - before.days}日</b> おおい`
        : now.days === before.days ? '先月と おなじ ペース'
          : `先月は ${before.days}日 きたよ`)
      : '';
    // **つづけた月数。** 日の連続ではなく「答えた月」の連続で、切れても何も言わない。
    // 毎日の連続を煽ると「連続を切らさないこと」が目的になり、学ぶことより大事に
    // なってしまう（調べた結果は `docs/uspeak-retention.md`）。出すのは
    // 「自分はこれを続けている人だ」のほう。2か月から出す（1か月は「連続」ではない）。
    const rows = Math.max(0, Math.floor(Number(m.inARow) || 0));
    const inARow = rows >= 2 ? `<b class="dash-row">${rows >= 14 ? '1年いじょう' : `${rows}かげつ`} つづいてるよ</b>` : '';
    // 去年の同じ月。1年たった子にしか出ない行。
    const ago = m.lastYear && now
      ? `<p class="dash-ago">きょねんの ${esc(String(m.lastYear.label).replace(/^\d+年/, ''))}は
         ${m.lastYear.days}日 ${m.lastYear.answers}問 だったよ。</p>`
      : '';
    const month = now ? `
      <section class="dash-month">
        <div class="dash-month-head"><h3>${bi(now.label, monthEn(now.label))}</h3>${vs ? `<small>${vs}</small>` : ''}${inARow}</div>
        <ul>
          <li><span>きた日</span><b>${now.days}<em>日</em></b></li>
          <li><span>もんだい</span><b>${now.answers}<em>問</em></b></li>
          ${now.accuracy === null ? '' : `<li><span>せいかい</span><b>${now.accuracy}<em>%</em></b></li>`}
          <li><span>じかん</span><b>${now.minutes}<em>分</em></b></li>
        </ul>${ago}
      </section>` : '';

    // What to go and do next. A chart a child cannot act on is a chart they look at once.
    const weak = m.weakest && m.weakest.attempts < (m.full || 60)
      ? `<p class="dash-next">つぎは <b>${bi(m.weakest.ja, m.weakest.en)}</b> を やってみよう。<small>${esc(m.weakest.en)} の れんしゅうが いちばん すくないよ。</small></p>`
      : '';
    // **きょうの 5ふん。** 島まで歩かなくても答えられる5問。級はサーバーが選ぶ
    // （その子が次にめざす級）。英検の目安に届いた級があれば、それも一言そえる。
    const G = { g5: '5級', g4: '4級', g3: '3級' };
    const exam = m.exam || null;
    const aim = exam?.aim || 'g5';
    const best = exam?.best ? `<small class="dash-best">✦ 英検${G[exam.best]}は れんしゅうで めやすに とどいたよ</small>` : '';
    const quick = onQuick ? `
      <section class="dash-quick">
        <div><b>きょうの 5ふん</b><small>英検${G[aim]}の もんだい 5もん（よむ 3・きく 2）。どこからでも できるよ。</small>${best}</div>
        <button type="button" class="primary" id="dash-quick">はじめる</button>
      </section>` : '';
    $('#dash-body', dialog).innerHTML = `
      ${quick}
      <div class="dash-level">
        <div class="dash-level-row"><span>レベル <b>${p.level}</b></span><small>つぎのレベルまで ${Math.max(0, (p.need || 0) - (p.xp || 0))} XP</small></div>
        <div class="dash-bar"><i style="width:${pct}%"></i></div>
      </div>
      ${month}
      <div class="dash-cards">${cards}</div>
      <section class="dash-radar">
        <div class="dash-radar-head">
          <h3>5つの ちから</h3>
          <small>${m.accuracy === null ? 'まだ きろくが ありません' : `せいかいりつ ${m.accuracy}%・${(m.attempts || 0).toLocaleString()}問`}</small>
        </div>
        <canvas id="dash-chart" aria-label="5技能のグラフ"></canvas>
        <ul class="dash-legend">${(m.skills || []).map((s) => `
          <li><span>${bi(s.ja, s.en)}</span><i><b style="width:${s.score}%"></b></i><small>${s.correct}/${s.attempts}</small></li>`).join('')}</ul>
        ${weak}
      </section>`;
    drawRadar($('#dash-chart', dialog), m.skills || []);
    const go = $('#dash-quick', dialog);
    if (go) go.onclick = () => { dialog.close(); onQuick(); };
  }

  // The canvas has no size until the dialog is open, so it is drawn after opening and
  // again whenever the window changes shape.
  window.addEventListener('resize', () => { if (dialog.open && last) drawRadar($('#dash-chart', dialog), last.skills || []); });
  // グラフの字は canvas なので、言語を切り替えたら描き直す。
  onLangChange(() => { if (dialog.open && last) drawRadar($('#dash-chart', dialog), last.skills || []); });

  return {
    open() {
      if (!isOnline()) { toast('マイページは オンラインで みられます。'); return; }
      if (!dialog.open) dialog.showModal();
      if (last) render(last); else $('#dash-body', dialog).innerHTML = '<p class="dash-note">よみこみ中…</p>';
      send('dash:get', {});
    },
    onState(m) {
      last = m;
      if (dialog.open) render(m);
    },
    get isOpen() { return dialog.open; },
    get dialog() { return dialog; },
  };
}

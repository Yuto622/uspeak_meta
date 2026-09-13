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
    ctx.fillText(s.ja, x, y);
  });
}

export function createDashboard({ send, isOnline, toast }) {
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
        <small>${esc(c.ja)}</small>
        <b>${(c.value || 0).toLocaleString()}<span>${esc(c.unit)}</span></b>
        <em>✧ +1 まで あと ${c.toNext}${esc(c.unit)}</em>
      </div>`).join('');
    // What to go and do next. A chart a child cannot act on is a chart they look at once.
    const weak = m.weakest && m.weakest.attempts < (m.full || 60)
      ? `<p class="dash-next">つぎは <b>${esc(m.weakest.ja)}</b> を やってみよう。<small>${esc(m.weakest.en)} の れんしゅうが いちばん すくないよ。</small></p>`
      : '';
    $('#dash-body', dialog).innerHTML = `
      <div class="dash-level">
        <div class="dash-level-row"><span>レベル <b>${p.level}</b></span><small>つぎのレベルまで ${Math.max(0, (p.need || 0) - (p.xp || 0))} XP</small></div>
        <div class="dash-bar"><i style="width:${pct}%"></i></div>
      </div>
      <div class="dash-cards">${cards}</div>
      <section class="dash-radar">
        <div class="dash-radar-head">
          <h3>5つの ちから</h3>
          <small>${m.accuracy === null ? 'まだ きろくが ありません' : `せいかいりつ ${m.accuracy}%・${(m.attempts || 0).toLocaleString()}問`}</small>
        </div>
        <canvas id="dash-chart" aria-label="5技能のグラフ"></canvas>
        <ul class="dash-legend">${(m.skills || []).map((s) => `
          <li><span>${esc(s.ja)}</span><i><b style="width:${s.score}%"></b></i><small>${s.correct}/${s.attempts}</small></li>`).join('')}</ul>
        ${weak}
      </section>`;
    drawRadar($('#dash-chart', dialog), m.skills || []);
  }

  // The canvas has no size until the dialog is open, so it is drawn after opening and
  // again whenever the window changes shape.
  window.addEventListener('resize', () => { if (dialog.open && last) drawRadar($('#dash-chart', dialog), last.skills || []); });

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

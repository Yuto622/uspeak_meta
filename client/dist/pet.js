// ペット島 — hatch, feed, and make a fuss of one pet.
//
// The pet's hunger and mood are the server's numbers, falling with real time. This
// screen shows them and asks; it never decides that a pet has been fed.
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const EGG_COST = 300;
const FEED_COST = 20;

export function createPetUI({ send, toast, isOnline, getPet, getWallet }) {
  let where = 'nest';

  const dialog = document.createElement('dialog');
  dialog.id = 'pet-dialog';
  dialog.setAttribute('aria-labelledby', 'pet-title');
  dialog.innerHTML = `<div class="quiz-head">
      <div><span class="eyebrow">PET ISLAND</span><h2 id="pet-title">ペット島</h2></div>
      <button type="button" id="pet-close" aria-label="閉じる">×</button>
    </div><div id="pet-body"></div>`;
  document.body.append(dialog);
  const body = () => $('#pet-body', dialog);

  const meter = (label, value, tone) => `<div class="pet-meter">
      <span>${esc(label)}</span>
      <div class="pet-bar ${tone}"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div>
      <b>${value}</b>
    </div>`;

  function render(flash = '') {
    const pet = getPet();
    const coins = getWallet()?.coins ?? 0;
    if (!pet) {
      body().innerHTML = `${flash ? `<p class="pet-flash">${esc(flash)}</p>` : ''}
        ${where === 'nest'
          ? `<div class="pet-egg"><span>🥚</span>
              <p>たまごから ペットが 生まれます。どの子が 出るかは おたのしみ。</p>
              <button type="button" class="primary" id="pet-hatch" ${coins < EGG_COST ? 'disabled' : ''}>◈ ${EGG_COST} で たまごを かう</button>
              ${coins < EGG_COST ? `<small>いまのコイン ◈ ${coins}。あと ◈ ${EGG_COST - coins}。</small>` : ''}</div>`
          : '<p class="dojo-empty">まだ ペットが いません。たまごの巣で たまごを かってね。</p>'}
        <div class="quiz-actions"><button type="button" id="pet-done">とじる</button></div>`;
      const hatchButton = $('#pet-hatch', dialog);
      if (hatchButton) hatchButton.onclick = () => { hatchButton.disabled = true; send('pet:hatch', {}); };
      $('#pet-done', dialog).onclick = close;
      return;
    }
    const patLabel = pet.canPat ? 'なでる（むりょう）' : `なでる（あと ${Math.ceil(pet.patIn / 1000)}秒）`;
    body().innerHTML = `${flash ? `<p class="pet-flash">${esc(flash)}</p>` : ''}
      <div class="pet-card">
        <span class="pet-face">${esc(pet.emoji)}</span>
        <div>
          <strong>${esc(pet.name)}</strong>
          <small>${esc(pet.ja)} · ${esc(pet.en)} · Lv.${pet.level}${pet.days ? ` · ${pet.days}日いっしょ` : ''}</small>
        </div>
      </div>
      ${meter('おなか', pet.hunger, 'hunger')}
      ${meter('ごきげん', pet.happy, 'happy')}
      <p class="quiz-hut">おなかと ごきげんは 時間とともに へります。まいにち 会いに来てね。</p>
      <div class="pet-actions">
        <button type="button" id="pet-feed" ${where !== 'kitchen' ? 'disabled' : ''}>🍚 ごはん（◈ ${FEED_COST}）</button>
        <button type="button" id="pet-pat" ${where !== 'meadow' || !pet.canPat ? 'disabled' : ''}>💚 ${esc(patLabel)}</button>
      </div>
      <p class="pet-where">${where === 'kitchen' ? 'ここは ごはん処。なでるのは ふれあい広場で。'
        : where === 'meadow' ? 'ここは ふれあい広場。ごはんは ごはん処で。'
        : 'ごはんは ごはん処、なでるのは ふれあい広場へ。'}</p>
      <div class="quiz-actions"><button type="button" id="pet-done">とじる</button></div>`;
    const feed = $('#pet-feed', dialog);
    const pat = $('#pet-pat', dialog);
    if (feed) feed.onclick = () => { feed.disabled = true; send('pet:act', { action: 'feed' }); };
    if (pat) pat.onclick = () => { pat.disabled = true; send('pet:act', { action: 'pat' }); };
    $('#pet-done', dialog).onclick = close;
  }

  function open() { if (!dialog.open) dialog.showModal(); render(); }
  function close() { dialog.close(); }

  $('#pet-close', dialog).onclick = close;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  return {
    label(spot) {
      const pet = getPet();
      if (spot.kind === 'nest') return pet ? `${spot.tone} ${spot.name}` : `${spot.tone} たまごを かう`;
      if (spot.kind === 'kitchen') return `${spot.tone} ${pet ? `${pet.name} に ごはん` : spot.name}`;
      return `${spot.tone} ${pet ? `${pet.name} を なでる` : spot.name}`;
    },
    enter(spot) {
      if (!isOnline()) { toast('ペット島は クラスに入っているときだけ 遊べます。'); return; }
      where = spot.kind;
      open();
    },
    onHatched(m) { toast(`${m.pet.name} が 生まれた！`); if (dialog.open) render(`${m.pet.name} が 生まれた！`); },
    onActed(m) { if (dialog.open) render(m.message); else toast(m.message); },
    onError(m) {
      if (m?.reason === 'too far') { toast(m.spot ? `${m.spot.ja} まで あるいて行こう。` : 'その場所まで あるいて行こう。'); close(); return; }
      toast({
        'not enough coins': `コインが たりません（◈ ${m.need || EGG_COST} ひつよう）。`,
        'already have one': 'もう ペットが います。',
        'already full': 'おなかが いっぱい みたい。',
        'too soon': 'さっき なでたばかり。すこし まってね。',
        'no pet': 'まだ ペットが いません。',
      }[m?.reason] || 'うまくいきませんでした。');
      if (dialog.open) render();
    },
    refresh() { if (dialog.open) render(); },
  };
}

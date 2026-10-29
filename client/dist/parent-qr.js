// 👪 おうちの ひとの LINE — 右の 列の ボタン。この 子 だけの 保護者ページの QR（先生が 印刷する QR カードと 同じ）。
// URL は 部屋が きめる（parent:qr）。ここは QR の 絵を かいて 見せる だけ。QR の 作り方は vendor/qrcode.js（押した ときだけ 読む）。
// 英語を 大きく、日本語を 小さく 両方 出すので、入れ物は translate="no"。
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (en, ja, cls = '') => `<span class="pq-bi ${cls}"><b>${esc(en)}</b><small>${esc(ja)}</small></span>`;

// QR の 黒い マスを 1 本の path に（白い ふち 4 マス）。
function qrSvg(create, text) {
  const { modules } = create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size; const q = 4; let d = '';
  for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) if (modules.get(y, x)) d += `M${x + q} ${y + q}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + q * 2} ${n + q * 2}" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#10302a"/></svg>`;
}

export function createParentQrUI({ send }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'parent-qr-dialog';
  dialog.setAttribute('translate', 'no');
  dialog.innerHTML = `<header class="pq-head">${bi('👪 Family LINE', 'おうちの ひとの LINE', 'pq-title')}
    <button type="button" class="pq-close" aria-label="close">×</button></header><div class="pq-body" id="pq-body"></div>`;
  document.body.append(dialog);
  const body = dialog.querySelector('#pq-body');
  const close = () => { try { dialog.close(); } catch { /* closed */ } };
  dialog.querySelector('.pq-close').onclick = close;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'parent-qr-button';
  button.className = 'rank-button parent-qr-button';
  button.hidden = true;
  button.setAttribute('translate', 'no');
  button.innerHTML = '<b class="en">👪 Family LINE</b><i class="ja">おうちの ひとの LINE</i>';
  button.onclick = () => open();
  const rail = document.querySelector('.right-rail');
  const road = document.querySelector('#roadmap-button') || document.querySelector('#rank-button');
  if (road?.parentElement) road.after(button); else rail?.append(button);

  let lib = null;
  function open() {
    if (!dialog.open) dialog.showModal();
    body.innerHTML = `<p class="pq-wait">${bi('Loading…', 'よみこみ中…')}</p>`;
    lib = lib || import('./vendor/qrcode.js');
    send('parent:qr', {});
  }

  async function onQr(m) {
    if (!dialog.open) return;
    if (!m?.ok || !m.url) {
      body.innerHTML = `<p class="pq-wait">${bi('Not available now. Ask your teacher.', 'いまは 出せません。せんせいに きいてね')}</p>`;
      return;
    }
    const url = new URL(m.url, location.origin).href;
    let svg = '';
    try { svg = qrSvg((await lib).create, url); } catch { /* 下の 字だけ */ }
    body.innerHTML = `<div class="pq-card"><div class="pq-qr">${svg}</div>
      <div class="pq-text">${bi(`${m.nick || ''}`, 'さん の QR', 'pq-nick')}
      <ol>
        <li>${bi('Show this to your family.', 'おうちの ひとに 見せてね')}</li>
        <li>${bi('They scan it with a phone camera.', 'スマホの カメラで よみとって もらう')}</li>
        <li>${bi('Tap "Get it on LINE" on the page.', 'ひらいた ページの「LINE で うけとる」を おす')}</li>
      </ol>
      <p class="pq-note">${bi('Your week comes on LINE every weekend.', 'まいしゅう がんばった ことが LINE に とどくよ')}</p>
      <p class="pq-note">${bi('This QR is only for you. Do not share it.', 'この QR は きみ だけの もの。ほかの 人に わたさないでね')}</p></div></div>`;
  }

  return {
    onQr,
    setOnline(on, teacher = false) { button.hidden = !on || teacher; if (!on) close(); },
    get isOpen() { return dialog.open; },
  };
}

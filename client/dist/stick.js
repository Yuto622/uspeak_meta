// 左下の operating stick — Roblox のモバイルと同じ、指で倒すまるいスティック。
//
// **十字キーを置き換えたもの。** ↑←↓→ の4つのボタンには2つ問題があった：
//   1. **斜めに歩けない。** 2つ同時に押すのは大人の指でも難しく、子どもはまず押さない。
//      島の道は斜めに走っているので、これは「歩きにくい」としてそのまま出る。
//   2. **速さが2段階しかない。** 押しているか、いないか。そっと近づくことができない。
// スティックは倒した向きと**倒した量**の両方を返すので、どちらも解ける。
//
// **返すのは向きと量だけで、キーには変換しない。** 8方向のキーに丸めると、せっかくの
// 倒した量が捨てられて十字キーに戻ってしまう。game.js はこの x/z をそのまま使う。
//
// 画面の座標そのままで返す（右が +x、**下が +z**）。game.js の dz は奥がマイナスなので、
// 上に倒す＝ dy がマイナス＝奥、で向きが合う。

const DEAD = 0.14;   // この中ではまだ歩かない。指を置いただけで動き出さないように

export function createStick(el) {
  const knob = el.querySelector('i');
  // mag は「どれだけ倒したか」（0〜1）。x/z は倒した向き × mag。
  const state = { x: 0, z: 0, mag: 0, active: false };
  let pointer = null;

  function centre() {
    // 毎フレーム呼ばれても安いように（ダイアログが開いている間、game.js が呼ぶ）。
    if (!state.active && !state.mag) return;
    knob.style.transform = 'translate(-50%, -50%)';
    state.x = 0; state.z = 0; state.mag = 0; state.active = false;
    el.classList.remove('on');
  }

  function track(e) {
    const box = el.getBoundingClientRect();
    // **どこまで倒せるか。** 見た目の半径いっぱいまでにすると、つまみが縁からはみ出す。
    const reach = box.width * 0.33;
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    const len = Math.hypot(dx, dy);
    const ux = len ? dx / len : 0;
    const uy = len ? dy / len : 0;
    const mag = Math.min(1, len / reach);
    knob.style.transform = `translate(calc(-50% + ${(ux * mag * reach).toFixed(1)}px), calc(-50% + ${(uy * mag * reach).toFixed(1)}px))`;
    // 遊び（デッドゾーン）の外に出てから歩き出し、そこから 0→1 に伸ばす。
    // 引き伸ばさないと、歩き始めがいきなり時速14%になる。
    const walk = mag <= DEAD ? 0 : (mag - DEAD) / (1 - DEAD);
    state.x = ux * walk;
    state.z = uy * walk;
    state.mag = walk;
  }

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointer = e.pointerId;
    el.setPointerCapture(e.pointerId);
    el.classList.add('on');
    state.active = true;
    track(e);
  });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === pointer) { e.preventDefault(); track(e); } });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    el.addEventListener(ev, (e) => { if (e.pointerId === pointer) { pointer = null; centre(); } });
  }
  // 指を置いたままタブが隠れると pointerup が来ないことがある。そのまま歩き続けさせない。
  addEventListener('blur', centre);

  return { state, release: centre };
}

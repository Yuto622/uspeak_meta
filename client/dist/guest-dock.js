// 島に立った時点で出る、別ゲームへの入口。画面の左下。
//
// **なぜ必要か。** 同梱の2本には、それぞれ島の中に扉がある — AURORA KART は
// スタート・ゴールのパネルの中、BLOCKWILD は「ブロックの とびら」という建物の中。
// どちらも「その場所まで歩いて、そこで開く」形で、島の作りとしては正しい。
// ただし**初めて来た子には見えない**：ガレージのパネルを開くまで AURORA KART が
// あることを知らないし、まちづくり島の建物6軒のうちどれが別のゲームかは、
// 近づいて札を読むまで分からない。
//
// なので入口を二重にする。島の扉はそのまま残し（歩いて行き当たる楽しみはそこにある）、
// **島に着いた瞬間から押せるボタン**を左下に出す。どちらを押しても同じ物が開く。
//
// 出すのは のりもの島 と まちづくり島 だけ。ミニゲーム島は家2軒がそのまま看板に
// なっていて、島に降りた時点で名前が見えているので、ここには足していない。
const GUESTS = {
  ride: [{ id: 'racers', mark: '🏁', name: 'AURORA KART', note: 'べつのゲーム・カートレース' }],
  town: [{ id: 'blockwild', mark: '⛏', name: 'BLOCKWILD', note: 'べつのゲーム・ブロックの世界' }],
};

export function createGuestDock({ open }) {
  const dock = document.createElement('div');
  dock.className = 'guest-dock';
  dock.hidden = true;
  document.body.append(dock);

  let shown = '';   // いま出している島。組み直しは島が変わったときだけ。

  // `space` は net-client の currentSpace()。建物の中にいるときは `in:town:shop` の形に
  // なるので、そこでは出さない — 店の中でカウンターの前に立っている子に、別のゲームへの
  // ボタンを出す理由がない。屋外に出れば戻る。
  function show(space) {
    const list = GUESTS[space] || null;
    const key = list ? space : '';
    if (key === shown) return;
    shown = key;
    dock.hidden = !list;
    if (!list) { dock.replaceChildren(); return; }
    dock.replaceChildren(...list.map((g) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'guest-launch';
      b.dataset.guest = g.id;
      b.innerHTML = `<span class="guest-launch-badge">${g.mark}</span>
        <span class="guest-launch-name"><strong>${g.name}</strong><small>${g.note}</small></span>
        <b>›</b>`;
      b.onclick = () => open(g.id);
      return b;
    }));
  }

  return { element: dock, show, get island() { return shown; } };
}

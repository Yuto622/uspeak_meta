// 遠くの こまかい 物を 描かない（2026-11：「広場に 行くと かくつく。原因を 特定し 全体的に 改善」）。
//
// はかった こと（1280×800・メインの島）：1 コマで 約 3,000 回 描いていた。目に 見える 物 4,500 の うち 3,900 が 影も 落とす。
// ほとんどは 1 人 20〜30 の 部品で できた 住民・広場の 人・屋台の 品・じてんしゃ・かんばんの 小物で、島の どこに いても
// 島ぜんぶの 人を 描き、影の 絵にも もう 1 回 描いていた。広場は 人と 品が いちばん 多い ので いちばん 重かった。
//
// やること：シーンの 中の「小さな まとまり」（半径 SMALL 以下で 部品が 3 つ 以上の Group）を 見つけて、
//   ・プレイヤーから FAR より 遠い → 描かない（カメラにも 影にも 出ない）
//   ・SHADOW より 遠い → 影を 落とさない（影の 絵の 範囲の ふちで、遠くの 人の 影は 見えない ほど 小さい）
// を 0.25 秒ごとに きめる。見えなく するのは `layers`（visible を さわらない＝ほかの コードの 出し入れと けんかしない）。
// 当たり判定・話しかけ・動きは そのまま（描かない だけ）。家の 中の シーンは さわらない。
import * as THREE from './three.module.js';

const SMALL = 6.5;        // これより 大きい まとまり（建物・島・海）は 相手に しない
const FAR = 62;           // ここより 遠い 人・小物は 描かない
const FAR_MID = 92;       // 中くらいの もの（半径 2.5 より 大きい）は もう少し 遠くまで
const SHADOW = 30;        // ここより 遠い ものは 影を 落とさない
const HIDE = 31;          // 描かない ときの レイヤー（カメラも 影の カメラも 0 しか 見ない）
const RESCAN = 3;         // 新しく 生まれた もの（島が 建つ・となりの 子が 来る）を 3 秒ごとに さがす

export function createDetailLod({ scene, player, skip = [] }) {
  const items = [];               // { g, r, off, far, shade }
  const known = new WeakSet();
  const box = new THREE.Box3(), sph = new THREE.Sphere(), at = new THREE.Vector3();
  let clock = 0, scanClock = RESCAN, enabled = true;

  const skipped = (o) => o === player || skip.includes(o);
  function meshesOf(g) {
    const out = [];
    g.traverse((o) => {
      if (!(o.isMesh || o.isSprite || o.isPoints || o.isLine)) return;
      if (o.userData.lodCast === undefined) o.userData.lodCast = o.castShadow;   // もとの 影の 設定（はじめて 見た とき）
      out.push(o);
    });
    return out;
  }
  function scan() {
    const walk = (o, depth) => {
      for (const c of o.children) {
        if (skipped(c) || c.userData?.noLod) continue;
        if (known.has(c)) continue;
        if (c.isGroup || (c.type === 'Object3D' && c.children.length)) {
          let n = 0; c.traverse((q) => { if (q.isMesh) n++; });
          if (n >= 3) {
            box.setFromObject(c, false);
            if (!box.isEmpty()) {
              box.getBoundingSphere(sph);
              // 中心が 原点から ずれた まとまりも ある（部品を 絶対の 位置に 置いた Group）。中心の ずれを 覚える。
              if (sph.radius <= SMALL) {
                c.updateWorldMatrix(true, false);
                const off = c.worldToLocal(sph.center.clone());
                known.add(c);
                items.push({ g: c, r: sph.radius, off, far: false, shade: true });
                continue;
              }
            }
          }
        }
        if (depth < 6 && c.children.length) walk(c, depth + 1);
      }
    };
    walk(scene, 0);
  }
  // かわる ときだけ 部品を 数えなおす（あとから 足された 部品＝ふきだし・きせかえ も ふくめる）。
  function setFar(it, far) {
    if (it.far === far) return; it.far = far;
    for (const m of meshesOf(it.g)) m.layers.set(far ? HIDE : 0);
  }
  function setShade(it, shade) {
    if (it.shade === shade) return; it.shade = shade;
    for (const m of meshesOf(it.g)) m.castShadow = shade ? m.userData.lodCast : false;
  }
  function update(dt) {
    if (!enabled) return;
    scanClock += dt; if (scanClock >= RESCAN) { scanClock = 0; scan(); }
    clock += dt; if (clock < 0.25) return; clock = 0;
    const px = player.position.x, pz = player.position.z;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!it.g.parent) { setFar(it, false); setShade(it, true); items.splice(i, 1); known.delete(it.g); continue; }   // 消えた もの
      at.copy(it.off); it.g.localToWorld(at);
      const d = Math.hypot(at.x - px, at.z - pz) - it.r;
      setFar(it, d > (it.r > 2.5 ? FAR_MID : FAR));
      setShade(it, d <= SHADOW);
    }
  }
  function setEnabled(on) { enabled = !!on; if (!enabled) for (const it of items) { setFar(it, false); setShade(it, true); } }
  return { update, scan, setEnabled, get count() { return items.length; }, get hidden() { return items.filter((q) => q.far).length; } };
}

// ゆぴちゃん（メインの島の おはなしルーム・2026-11）の 絵。
//
// 体は island-cast.js の `yupi`（島に 立つ 子と 同じ 形）。会話の 画面（conv.js の #conv-stage）と 住民の 会話（npc-talk.js）の
// 顔の 絵は、その 3D を food-real.js の `renderShots`（小さな レンダラーを 作って すぐ 捨てる）で 1 回だけ 絵に した もの。
// WebGL を 持ちつづけない。描けない とき（WebGL なし・Node）は null（画面は ピンクの まると 💗 に おちる）。
//   idle … いつもの にっこり ／ talk … 口を あけた 絵（話して いる 間だけ 出す・conv.css が ふわっと はねさせる）。
import * as THREE from './three.module.js';
import { buildCastMember } from './island-cast.js';

export const YUPI_NAME = { en: 'Yupi', ja: 'ゆぴちゃん' };

function model(mouth) {
  const body = buildCastMember('yupi', { mouth });
  if (!body) return null;
  const outer = new THREE.Group();
  body.scale.multiplyScalar(0.44);
  body.position.y = 0.02;
  outer.add(body);
  // renderShots は 描いた あと 形を dispose する。体の 形（island-cast の G）は みんなで 使うので、材質だけ 捨てさせる（npc-talk.js と 同じ）。
  outer.traverse = (fn) => { const seen = new Set(); THREE.Object3D.prototype.traverse.call(outer, (o) => { for (const m of [].concat(o.material || [])) seen.add(m); }); for (const m of seen) fn({ material: m }); };
  return outer;
}

let shots = null;
// { idle: dataURL, talk: dataURL } | null。1 回だけ 描いて おぼえる。
export function yupiShots() {
  if (!shots) {
    shots = import('./food-real.js')
      .then(({ renderShots }) => renderShots(['idle', 'talk'], (k) => model(k === 'talk' ? 'open' : 'smile'), { size: 480, look: 0.6, turn: -0.18 }))
      .catch(() => null);
  }
  return shots;
}

// 住民の 会話（npc-talk.js）の ひょうじょう 5 つに あてる（うれしい ときは 口を あけた 絵）。
export function yupiPortraits() {
  return yupiShots().then((s) => (s ? { smile: s.idle, happy: s.talk, surprised: s.talk, shy: s.idle, sleepy: s.idle } : null));
}

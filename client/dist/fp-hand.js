// 一人称の 手元（BLOCKWILD と 同じ 作り）：右下に いつも 自分の 腕が 見えていて、歩くと ゆれ、E や「はなす」で ふる。
// 本編とは 別の 小さな シーンと 別の 画角で、島を 描いた あとに 重ねて 描く（画面の 端でも 歪まない）。
// WebGL は 増やさない：島の renderer を そのまま 借りて、深さだけ 消して 上に 描く。
import * as THREE from './three.module.js';

export function createFpHand(renderer, mainCamera) {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(55, 1, 0.01, 6);
  scene.add(new THREE.HemisphereLight('#ffffff', '#5a6472', 2.2));
  const sun = new THREE.DirectionalLight('#fff3d6', 2.1);
  sun.position.set(-0.6, 1, 0.8);
  scene.add(sun);
  // 腕（袖と 手）。
  const arm = new THREE.Group();
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.34, 0.17), new THREE.MeshLambertMaterial({ color: '#3f6fb0' }));
  sleeve.position.y = -0.09;
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), new THREE.MeshLambertMaterial({ color: '#e0b48a' }));
  hand.position.y = 0.17;
  arm.add(sleeve, hand);
  arm.rotation.set(-0.5, 0.1, 0.38);
  scene.add(arm);

  const base = new THREE.Vector3();
  let aspect = 0;
  let bobT = 0;
  let swingT = 0;
  function layout() {
    const d = 0.62;
    cam.aspect = mainCamera.aspect;
    cam.updateProjectionMatrix();
    const vh = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * d;
    base.set(Math.min(vh * cam.aspect * 0.62, vh * 1.15) + vh * 0.2, -vh * 1.1, -d - 0.04);
    arm.scale.setScalar(vh * 2.0);
    aspect = mainCamera.aspect;
  }
  function swing() { swingT = 0.28; }
  // 服と はだの 色（アバターに あわせる。わからなければ そのまま）。
  function dress({ skin, shirt } = {}) {
    if (skin) hand.material.color.set(skin);
    if (shirt) sleeve.material.color.set(shirt);
  }
  function render(dt, moving, running) {
    if (aspect !== mainCamera.aspect) layout();
    bobT += dt * (moving ? (running ? 11 : 8) : 0);
    swingT = Math.max(0, swingT - dt);
    const s = swingT > 0 ? Math.sin((1 - swingT / 0.28) * Math.PI) : 0;
    const bobY = moving ? Math.sin(bobT) * 0.012 : 0;
    const bobX = moving ? Math.cos(bobT * 0.5) * 0.008 : 0;
    arm.position.set(base.x - s * 0.08 + bobX, base.y - s * 0.1 + bobY, base.z + s * 0.06);
    arm.rotation.x = -0.5 + s * 0.9;
    const was = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, cam);
    renderer.autoClear = was;
  }
  return { render, swing, dress };
}

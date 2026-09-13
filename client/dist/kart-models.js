// カートと ドライバー — twelve of these are on screen at once, so they are built to be
// cheap: eight boxes and a driver, one material each, no textures. The colour is what
// tells one kart from another at speed, which is why every racer gets a strong flat one
// rather than a shade of the same.
import * as THREE from './three.module.js';

const box = (w, h, d, colour) => new THREE.Mesh(
  new THREE.BoxGeometry(w, h, d),
  new THREE.MeshLambertMaterial({ color: colour }),
);

export const COLOURS = [
  0x4fa8e0, 0xef6f8a, 0x7bc86c, 0xffd166, 0xb08ae0, 0xf29551,
  0x5ad2c0, 0xe05a5a, 0x9ab4e0, 0xd9a03c, 0x74c39a, 0xc06fd0,
];

// One kart. `wheels` are returned so the game can spin them and turn the front pair; the
// body is tilted by the drift, which is most of what a kart looks like in a corner.
export function buildKart({ colour = COLOURS[0], skin = 0xe8c39a, hat = 0x2f6b7f } = {}) {
  const g = new THREE.Group();

  const chassis = box(1.9, 0.42, 3.0, colour);
  chassis.position.y = 0.52;
  const nose = box(1.5, 0.34, 0.9, colour);
  nose.position.set(0, 0.6, 1.7);
  const spoiler = box(1.9, 0.5, 0.22, 0xf3efe1);
  spoiler.position.set(0, 1.05, -1.45);
  const spoilerLeg = box(1.4, 0.35, 0.2, colour);
  spoilerLeg.position.set(0, 0.82, -1.4);
  const seat = box(0.95, 0.62, 0.8, 0x2b2b30);
  seat.position.set(0, 0.9, -0.5);

  const wheels = [];
  const rubber = new THREE.MeshLambertMaterial({ color: 0x25252a });
  for (const [wx, wz, front] of [[-1.02, 1.0, true], [1.02, 1.0, true], [-1.05, -1.05, false], [1.05, -1.05, false]]) {
    const w = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(front ? 0.42 : 0.5, front ? 0.42 : 0.5, 0.42, 8), rubber);
    tyre.rotation.z = Math.PI / 2;
    w.add(tyre);
    w.position.set(wx, front ? 0.42 : 0.5, wz);
    w.userData.front = front;
    g.add(w);
    wheels.push(w);
  }

  // The driver: the same blocky person the islands are full of, sitting down.
  const driver = new THREE.Group();
  const body = box(0.86, 0.7, 0.6, hat);
  body.position.y = 1.35;
  const head = box(0.72, 0.66, 0.66, skin);
  head.position.y = 2.0;
  const cap = box(0.8, 0.22, 0.74, hat);
  cap.position.y = 2.36;
  const armL = box(0.22, 0.2, 0.7, skin);
  armL.position.set(-0.5, 1.5, 0.35);
  const armR = armL.clone();
  armR.position.x = 0.5;
  driver.add(body, head, cap, armL, armR);
  driver.position.z = -0.35;

  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 10), new THREE.MeshLambertMaterial({ color: 0x1b1b1f }));
  wheel.position.set(0, 1.42, 0.42);
  wheel.rotation.x = 1.1;

  g.add(chassis, nose, spoiler, spoilerLeg, seat, driver, wheel);
  g.userData = { wheels, driver, colour };
  return g;
}

// The sparks a charged drift throws off the back wheels. Two puffs, coloured by how far the
// charge has got: the language every kart game speaks, and the reason a child holds a drift
// through a corner they could have driven round.
export function buildSparks() {
  const g = new THREE.Group();
  const mats = [
    new THREE.MeshBasicMaterial({ color: 0x63c7ff, transparent: true, opacity: 0.9 }),
    new THREE.MeshBasicMaterial({ color: 0xffa03c, transparent: true, opacity: 0.9 }),
    new THREE.MeshBasicMaterial({ color: 0xc06fd0, transparent: true, opacity: 0.95 }),
  ];
  const puffs = [];
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), mats[0]);
    m.position.set(side * 1.05, 0.42, -1.2);
    m.visible = false;
    g.add(m);
    puffs.push(m);
  }
  return {
    group: g,
    // level 0 hides them; 1..3 shows the colour of that charge.
    set(level, t) {
      for (const [i, p] of puffs.entries()) {
        p.visible = level > 0;
        if (!level) continue;
        p.material = mats[Math.min(2, level - 1)];
        const wob = Math.sin(t * 30 + i * 2) * 0.16;
        p.scale.setScalar(0.7 + wob + level * 0.18);
      }
    },
  };
}

// The flame behind a kart that is boosting. Cheap, and unmistakable.
export function buildBoostFlame() {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 2.2, 7),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85 }),
  );
  m.rotation.x = Math.PI / 2;
  m.position.set(0, 0.55, -2.1);
  m.visible = false;
  return m;
}

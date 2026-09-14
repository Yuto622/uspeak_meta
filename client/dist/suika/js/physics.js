/* =========================================================================
 * physics.js  --  まるい ものだけの かんたん 2D ぶつりエンジン
 * -------------------------------------------------------------------------
 * スイカゲームは「円」しか出てこないので、円 vs 円 と 円 vs 壁 だけを
 * あつかう インパルスベース(力積)の ソルバを 自前で 実装している。
 *
 *   1. じゅうりょくで はやさを ふやす      (integrateVelocity)
 *   2. ぶつかっている ペアを さがす        (detect / sweep and prune)
 *   3. はやさを なおす                     (solveVelocity * N かい)
 *   4. いちを うごかす                     (integratePosition)
 *   5. めりこみを おしもどす               (solvePosition * N かい)
 *
 * 外部ライブラリは つかわない(オフラインでも うごくように)。
 * ========================================================================= */
(function (global) {
  'use strict';

  // せっしょくの「あそび」。ぴったり くっついた ままでも あたりはんていを
  // つづけるための すきま。これが ないと 止まっている ものが じゅうりょくを
  // ためこんで いつか ふきとぶ。
  const SKIN = 0.6;

  /** 円のからだ */
  class Body {
    constructor(x, y, r, opts) {
      opts = opts || {};
      this.x = x;
      this.y = y;
      this.vx = opts.vx || 0;
      this.vy = opts.vy || 0;
      this.r = r;
      this.angle = opts.angle || 0;
      this.angVel = opts.angVel || 0;

      this.restitution = opts.restitution != null ? opts.restitution : 0.07; // はねかえり
      this.friction = opts.friction != null ? opts.friction : 0.28;          // まさつ

      const density = opts.density != null ? opts.density : 0.0013;
      this.mass = Math.PI * r * r * density;
      this.invMass = 1 / this.mass;
      // 一様な円ばん: I = 1/2 m r^2
      this.inertia = 0.5 * this.mass * r * r;
      this.invInertia = 1 / this.inertia;

      this.data = opts.data || {};   // ゲーム側のじょうほう(レベルなど)
      this.age = 0;                  // うまれてからの びょうすう
      this.overTime = 0;             // ゲームオーバーラインより 上にいた びょうすう
      this.dead = false;             // けされる よてい
      this.sleepTimer = 0;           // ほとんど 止まっている じかん
      this.touchedFloor = false;     // 一度でも なにかに ついたか
    }

    get speed() {
      return Math.hypot(this.vx, this.vy);
    }
  }

  /** せかい(はこの中) */
  class World {
    constructor(width, height, opts) {
      opts = opts || {};
      this.width = width;
      this.height = height;
      this.gravity = opts.gravity != null ? opts.gravity : 1500;
      this.bodies = [];
      this.contacts = [];
      this.substeps = opts.substeps || 2;
      this.velIterations = opts.velIterations || 8;
      this.posIterations = opts.posIterations || 4;
      this.linearDamping = opts.linearDamping != null ? opts.linearDamping : 0.9995;
      this.angularDamping = opts.angularDamping != null ? opts.angularDamping : 0.985;
      this.wallFriction = opts.wallFriction != null ? opts.wallFriction : 0.32;
      this.wallRestitution = opts.wallRestitution != null ? opts.wallRestitution : 0.05;
      this.maxSpeed = opts.maxSpeed || 2600;
      this.onCollide = null; // (bodyA, bodyB, impactSpeed) => void
    }

    add(body) {
      this.bodies.push(body);
      return body;
    }

    remove(body) {
      const i = this.bodies.indexOf(body);
      if (i >= 0) this.bodies.splice(i, 1);
    }

    clear() {
      this.bodies.length = 0;
      this.contacts.length = 0;
    }

    /** メインの 1 フレーム */
    step(dt) {
      const h = dt / this.substeps;
      let allContacts = [];
      for (let s = 0; s < this.substeps; s++) {
        this.integrateVelocity(h);
        const contacts = this.detect();
        for (let i = 0; i < this.velIterations; i++) this.solveVelocity(contacts);
        this.integratePosition(h);
        for (let i = 0; i < this.posIterations; i++) this.solvePosition(contacts);
        allContacts = contacts;
      }
      this.contacts = allContacts;
      for (const b of this.bodies) {
        b.age += dt;
        if (b.speed < 22 && Math.abs(b.angVel) < 1.2) b.sleepTimer += dt;
        else b.sleepTimer = 0;
      }
      return this.contacts;
    }

    integrateVelocity(h) {
      const g = this.gravity;
      for (const b of this.bodies) {
        b.vy += g * h;
        b.vx *= this.linearDamping;
        b.vy *= this.linearDamping;
        b.angVel *= this.angularDamping;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > this.maxSpeed) {
          const k = this.maxSpeed / sp;
          b.vx *= k; b.vy *= k;
        }
      }
    }

    integratePosition(h) {
      for (const b of this.bodies) {
        b.x += b.vx * h;
        b.y += b.vy * h;
        b.angle += b.angVel * h;
      }
    }

    /** ブロードフェーズ: x じくで ならべて となりだけ しらべる (sweep & prune) */
    detect() {
      const list = this.bodies.slice().sort((a, b) => (a.x - a.r) - (b.x - b.r));
      const contacts = [];
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        const aRight = a.x + a.r + SKIN;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (b.x - b.r > aRight) break; // これ以降は ぜったい あたらない
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const rr = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          const reach = rr + SKIN;
          if (d2 >= reach * reach) continue;
          let d = Math.sqrt(d2);
          let nx, ny;
          if (d < 1e-6) { d = 1e-6; nx = 0; ny = -1; } // ぴったり かさなった とき
          else { nx = dx / d; ny = dy / d; }
          const contact = {
            a: a, b: b, nx: nx, ny: ny,
            penetration: rr - d,
            impact: 0
          };
          const rvx = (b.vx - a.vx), rvy = (b.vy - a.vy);
          contact.impact = -(rvx * nx + rvy * ny);
          contacts.push(contact);
          if (this.onCollide) this.onCollide(a, b, contact.impact);
          a.touchedFloor = true;
          b.touchedFloor = true;
        }
      }
      return contacts;
    }

    /** はやさの しゅうせい(すべりと はねかえり) */
    solveVelocity(contacts) {
      for (const c of contacts) this.solvePair(c);
      for (const b of this.bodies) this.solveWalls(b);
    }

    solvePair(c) {
      const a = c.a, b = c.b;
      const nx = c.nx, ny = c.ny;
      // せっしょくてん(円なので 中心から n ほうこうに r)
      const rax = nx * a.r, ray = ny * a.r;
      const rbx = -nx * b.r, rby = -ny * b.r;

      // せっしょくてんの そうたいそくど
      let rvx = (b.vx - b.angVel * rby) - (a.vx - a.angVel * ray);
      let rvy = (b.vy + b.angVel * rbx) - (a.vy + a.angVel * rax);

      const vn = rvx * nx + rvy * ny;
      const invSum = a.invMass + b.invMass;
      let jn = 0;
      if (vn < 0) {
        const e = Math.min(a.restitution, b.restitution);
        // はやさが おそい ときは はねない(つみあげが あんていする)
        const bounce = Math.abs(vn) < 90 ? 0 : e;
        jn = -(1 + bounce) * vn / invSum;
        const ix = nx * jn, iy = ny * jn;
        a.vx -= ix * a.invMass; a.vy -= iy * a.invMass;
        b.vx += ix * b.invMass; b.vy += iy * b.invMass;
      }

      // まさつ(せっせん ほうこう)
      const tx = -ny, ty = nx;
      rvx = (b.vx - b.angVel * rby) - (a.vx - a.angVel * ray);
      rvy = (b.vy + b.angVel * rbx) - (a.vy + a.angVel * rax);
      const vt = rvx * tx + rvy * ty;
      const denomT = invSum
        + (a.r * a.r) * a.invInertia
        + (b.r * b.r) * b.invInertia;
      let jt = -vt / denomT;
      const mu = Math.sqrt(a.friction * b.friction);
      const maxF = mu * Math.abs(jn);
      if (jt > maxF) jt = maxF; else if (jt < -maxF) jt = -maxF;

      const fx = tx * jt, fy = ty * jt;
      a.vx -= fx * a.invMass; a.vy -= fy * a.invMass;
      b.vx += fx * b.invMass; b.vy += fy * b.invMass;
      // かいてん: w -= invI * (r x J)
      a.angVel -= a.invInertia * jt * a.r;
      b.angVel -= b.invInertia * jt * b.r;
    }

    /** ひだり・みぎ・したの かべ */
    solveWalls(b) {
      // n は かべから そとへ(ボールを おしだす ほうこう)
      const walls = [];
      if (b.x - b.r < SKIN) walls.push([1, 0, b.r - b.x]);
      if (b.x + b.r > this.width - SKIN) walls.push([-1, 0, b.x + b.r - this.width]);
      if (b.y + b.r > this.height - SKIN) walls.push([0, -1, b.y + b.r - this.height]);
      for (const w of walls) {
        const nx = w[0], ny = w[1];
        // せっしょくてんは 中心から -n ほうこう
        const rax = -nx * b.r, ray = -ny * b.r;
        let vpx = b.vx - b.angVel * ray;
        let vpy = b.vy + b.angVel * rax;
        const vn = vpx * nx + vpy * ny;
        let jn = 0;
        if (vn < 0) {
          const bounce = Math.abs(vn) < 90 ? 0 : Math.min(b.restitution, this.wallRestitution);
          jn = -(1 + bounce) * vn / b.invMass;
          b.vx += nx * jn * b.invMass;
          b.vy += ny * jn * b.invMass;
        }
        const tx = -ny, ty = nx;
        vpx = b.vx - b.angVel * ray;
        vpy = b.vy + b.angVel * rax;
        const vt = vpx * tx + vpy * ty;
        const denomT = b.invMass + (b.r * b.r) * b.invInertia;
        let jt = -vt / denomT;
        const mu = Math.sqrt(b.friction * this.wallFriction);
        const maxF = mu * Math.abs(jn);
        if (jt > maxF) jt = maxF; else if (jt < -maxF) jt = -maxF;
        b.vx += tx * jt * b.invMass;
        b.vy += ty * jt * b.invMass;
        b.angVel += b.invInertia * jt * (-b.r);
        b.touchedFloor = true;
      }
    }

    /** めりこみを おしもどす(いちの しゅうせい) */
    solvePosition(contacts) {
      const slop = 0.15;
      const percent = 0.55;
      for (const c of contacts) {
        const a = c.a, b = c.b;
        const dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) d = 1e-6;
        const pen = (a.r + b.r) - d;
        if (pen <= slop) continue;
        const nx = dx / d, ny = dy / d;
        const corr = (pen - slop) * percent / (a.invMass + b.invMass);
        a.x -= nx * corr * a.invMass;
        a.y -= ny * corr * a.invMass;
        b.x += nx * corr * b.invMass;
        b.y += ny * corr * b.invMass;
      }
      // かべは かたいので そのまま おしもどす
      for (const b of this.bodies) {
        if (b.x - b.r < 0) b.x = b.r;
        if (b.x + b.r > this.width) b.x = this.width - b.r;
        if (b.y + b.r > this.height) b.y = this.height - b.r;
      }
    }
  }

  global.Physics = { Body: Body, World: World };
})(window);

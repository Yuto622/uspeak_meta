/* =========================================================================
 * effects.js -- キラキラ・もじの ポップアップ・がめんの ゆれ
 * ========================================================================= */
(function (global) {
  'use strict';

  class Effects {
    constructor() {
      this.particles = [];
      this.popups = [];
      this.rings = [];
      this.shake = 0;
      this.confetti = [];
    }

    reset() {
      this.particles.length = 0;
      this.popups.length = 0;
      this.rings.length = 0;
      this.confetti.length = 0;
      this.shake = 0;
    }

    burst(x, y, color, count, power) {
      count = count || 14;
      power = power || 260;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = power * (0.35 + Math.random() * 0.85);
        this.particles.push({
          x: x, y: y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 90,
          r: 2 + Math.random() * 4.5,
          life: 0.5 + Math.random() * 0.5,
          age: 0,
          color: color
        });
      }
    }

    ring(x, y, r, color) {
      this.rings.push({ x: x, y: y, r: r, max: r * 2.1, life: 0.42, age: 0, color: color });
    }

    /** ごうたいした ときの「えいご たんごカード」 */
    wordPopup(x, y, en, ja, emoji, color) {
      this.popups.push({
        kind: 'word', x: x, y: y, en: en, ja: ja, emoji: emoji,
        color: color, life: 1.5, age: 0
      });
    }

    scorePopup(x, y, text, color) {
      this.popups.push({ kind: 'score', x: x, y: y, text: text, color: color || '#fff', life: 0.9, age: 0 });
    }

    cheer() {
      for (let i = 0; i < 70; i++) {
        this.confetti.push({
          x: Math.random() * 420,
          y: -20 - Math.random() * 300,
          vx: (Math.random() - 0.5) * 90,
          vy: 130 + Math.random() * 190,
          w: 5 + Math.random() * 7,
          h: 8 + Math.random() * 10,
          rot: Math.random() * Math.PI,
          rotV: (Math.random() - 0.5) * 9,
          color: ['#ff5f6d', '#ffc371', '#3ec6ff', '#8ee86b', '#c491ff', '#ffe66d'][(Math.random() * 6) | 0],
          life: 3.2, age: 0
        });
      }
    }

    addShake(v) { this.shake = Math.min(22, this.shake + v); }

    update(dt) {
      const g = 900;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.age += dt;
        if (p.age >= p.life) { this.particles.splice(i, 1); continue; }
        p.vy += g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.age += dt;
        if (r.age >= r.life) this.rings.splice(i, 1);
      }
      for (let i = this.popups.length - 1; i >= 0; i--) {
        const p = this.popups[i];
        p.age += dt;
        if (p.age >= p.life) { this.popups.splice(i, 1); continue; }
        p.y -= (p.kind === 'word' ? 26 : 46) * dt;
      }
      for (let i = this.confetti.length - 1; i >= 0; i--) {
        const c = this.confetti[i];
        c.age += dt;
        if (c.age >= c.life) { this.confetti.splice(i, 1); continue; }
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.rot += c.rotV * dt;
      }
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 42);
    }

    draw(ctx) {
      // つぶつぶ
      for (const p of this.particles) {
        const k = 1 - p.age / p.life;
        ctx.globalAlpha = Math.max(0, k);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.4 + k * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // わっか
      for (const r of this.rings) {
        const k = r.age / r.life;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 5 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r + (r.max - r.r) * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // かみふぶき
      for (const c of this.confetti) {
        const k = 1 - c.age / c.life;
        ctx.globalAlpha = Math.max(0, Math.min(1, k * 2));
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // もじ
      for (const p of this.popups) {
        const k = p.age / p.life;
        const alpha = k < 0.12 ? k / 0.12 : Math.max(0, 1 - (k - 0.12) / 0.88);
        ctx.globalAlpha = alpha;
        if (p.kind === 'score') {
          ctx.font = 'bold 26px "Baloo 2", "Hiragino Maru Gothic ProN", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 5;
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.strokeText(p.text, p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, p.x, p.y);
        } else {
          const pop = k < 0.15 ? 0.6 + 0.4 * (k / 0.15) : 1;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(pop, pop);
          const w = 178, h = 74;
          ctx.fillStyle = 'rgba(255,255,255,0.96)';
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 4;
          roundRect(ctx, -w / 2, -h / 2, w, h, 16);
          ctx.fill();
          ctx.stroke();
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.font = '30px serif';
          ctx.fillText(p.emoji, -w / 2 + 12, 0);
          ctx.fillStyle = '#1d2b3a';
          ctx.font = 'bold 22px "Baloo 2", system-ui, sans-serif';
          ctx.fillText(p.en, -w / 2 + 52, -12);
          ctx.fillStyle = '#6b7a8c';
          ctx.font = 'bold 15px "Hiragino Maru Gothic ProN", sans-serif';
          ctx.fillText(p.ja, -w / 2 + 52, 15);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  global.Effects = Effects;
  global.roundRect = roundRect;
})(window);

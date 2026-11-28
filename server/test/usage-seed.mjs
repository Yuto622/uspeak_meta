// 使用履歴の 検査用の つくりもの（本物の 子どもの 記録では ない）。usage.test.mjs と 画面の 確認で 使う。
// 何人かの 子が 何日も あそんだ ことに して、部屋の tick と 同じ 口（join・sample・count・end）で 箱に 入れる。
import { blankPlayerRecord } from '../src/store/records.js';

const SPACES = ['main', 'willow', 'talk', 'in:main:books', 'in:plaza', 'eiken5', 'farm', 'in:home.abc123'];
const DEVICES = ['tablet', 'tablet', 'pc', 'phone'];
const MODES = ['quiz', 'listen', 'type', 'eiken', 'fw-mc', 'reading'];

// 0〜1 の 決まった 乱数（同じ seed なら 同じ 数）。
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export function seedUsage(usage, { store = null, classes = { 'demo-a': ['Aoi', 'Ben', 'Chika', 'Daichi', 'Emi'], 'demo-b': ['Fuka', 'Gen', 'Hana'] }, days = 120, now = Date.now(), seed = 7, tickSec = 60 } = {}) {
  const r = rng(seed); let sid = 0;
  for (const [cls, names] of Object.entries(classes)) {
    names.forEach((name, ni) => {
      const keen = 0.25 + 0.6 * ((ni + 1) / names.length);
      let studied = 0;
      for (let d = days - 1; d >= 0; d -= 1) {
        const dayStart = now - d * 86400000;
        const wd = new Date(dayStart + 9 * 3600e3).getUTCDay();
        const p = (wd === 0 || wd === 6 ? 0.35 : 0.6) * keen;
        if (r() > p) continue;
        studied += 1;
        const sessions = r() < 0.3 ? 2 : 1;
        for (let k = 0; k < sessions; k += 1) {
          const hour = wd === 0 || wd === 6 ? 9 + Math.floor(r() * 8) : (r() < 0.5 ? 16 : 18) + Math.floor(r() * 3);
          const startJst = Math.floor((dayStart + 9 * 3600e3) / 86400000) * 86400000 + hour * 3600e3 + Math.floor(r() * 50) * 60e3;
          let t = startJst - 9 * 3600e3;
          if (t > now) continue;
          const id = `seed-${sid += 1}`;
          usage.join(id, cls, name, { device: DEVICES[(ni + k) % DEVICES.length], now: t });
          const minutes = 8 + Math.floor(r() * 40);
          let space = SPACES[Math.floor(r() * SPACES.length)];
          for (let m = 0; m < minutes; m += 1) {
            if (r() < 0.12) space = SPACES[Math.floor(r() * SPACES.length)];
            const active = r() < 0.78;
            usage.sample(id, cls, name, { active, space, sec: tickSec, now: t });
            if (active && r() < 0.7) usage.count(id, { mode: MODES[Math.floor(r() * MODES.length)], correct: r() < 0.55 + keen * 0.4, xp: 2 }, t);
            if (r() < 0.05) usage.count(id, { ai: 1 }, t);
            if (r() < 0.08) usage.count(id, { ch: 1 }, t);
            if (r() < 0.03) usage.count(id, { buy: 1 }, t);
            if (r() < 0.2) usage.count(id, { coin: 5 }, t);
            t += tickSec * 1000;
          }
          usage.end(id, t);
        }
      }
      if (store) {
        const rec = blankPlayerRecord(cls, name);
        rec.level = 3 + ni; rec.total_xp = 400 + ni * 230; rec.xp = 40; rec.coins = 120 + ni * 31; rec.login_streak = 1 + (ni % 5);
        rec.study_ms = studied * 25 * 60000; rec.study_days = studied; rec.correct = studied * 9; rec.attempts = studied * 12;
        rec.first_seen = new Date(now - days * 86400000).toISOString(); rec.last_seen = new Date(now - ni * 3600e3).toISOString();
        // 月ごとの まとめ（この 機能より 前から ある 記録）
        const months = {};
        for (let m = 0; m < 6; m += 1) {
          const key = new Date(now - m * 30 * 86400000 + 9 * 3600e3).toISOString().slice(0, 7);
          months[key] = { answers: 80 + m * 7 + ni * 5, correct: 60 + m * 5 + ni * 3, xp: 300 + ni * 40 + m * 20, coins: 150 + m * 11, seconds: (200 + ni * 60 + m * 30) * 60, days: [`${key}-03`, `${key}-10`, `${key}-17`], home: [], eg: {} };
        }
        rec.months_json = JSON.stringify(months);
        const wk = Math.floor(Math.floor((Math.floor(now / 1000) + 9 * 3600) / 86400) / 7);
        rec.week_hist_json = JSON.stringify(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [wk - i, 60 + Math.floor(r() * 200)])));
        store.savePlayer(rec);
      }
    });
  }
}

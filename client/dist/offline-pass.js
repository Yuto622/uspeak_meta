// ひとりで あそぶ（オフライン）の 期限。
//
// **名簿に ある 子は ずっと、名簿に ない 子は さいしょに ひとりで あそんだ 日から 14 日。**
// 名簿に あるかは サーバーしか 知らないので、クラスに 入った ときの welcome（`onRoster`）で この 端末に 覚える。
// オフラインには サーバーが いないので、判定は この 端末の 記録だけ（ブラウザの データを 消すと やりなおしに なる。
// それを 防ぐ 方法は オフラインには ない＝「試しに 使える 期間」として の 仕組み）。
//
// localStorage `uspeak-offline-pass-v1`：{ first: さいしょに ひとりで あそんだ 時刻, seen: いちばん 新しく 見た 時刻,
//   roster: { name, cls, at } … 名簿に ある と サーバーが 言った とき }
export const OFFLINE_DAYS = 14;
const KEY = 'uspeak-offline-pass-v1';
const DAY = 86400000;

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };

// 時計を 戻して 期限を のばす のを 防ぐ：いちばん 新しく 見た 時刻より 前には 戻らない。
function clock(p, now) { return Math.max(now, p.seen || 0); }

// のこり 日数（名簿に ある 子は Infinity。まだ 1 回も ひとりで あそんで いなければ 14）。
export function daysLeft(now = Date.now()) {
  const p = read();
  if (p.roster) return Infinity;
  if (!p.first) return OFFLINE_DAYS;
  const used = Math.floor((clock(p, now) - p.first) / DAY);
  return Math.max(0, OFFLINE_DAYS - used);
}

// ひとりで あそび はじめる。ゆるされれば true（はじめての ときは この 日から 数える）。
export function startOffline(now = Date.now()) {
  const p = read();
  if (p.roster) { write({ ...p, seen: clock(p, now) }); return true; }
  if (!p.first) p.first = now;
  p.seen = clock(p, now);
  write(p);
  return daysLeft(now) > 0;
}

// クラスに 入った ときの サーバーの 答え。名簿に あれば 覚え、名簿から 外された 同じ 子なら 忘れる。
export function noteRoster({ onRoster, name, classCode }, now = Date.now()) {
  const p = read();
  if (onRoster) { p.roster = { name, cls: classCode, at: now }; write(p); return; }
  if (p.roster && p.roster.name === name && p.roster.cls === classCode) { delete p.roster; write(p); }
}

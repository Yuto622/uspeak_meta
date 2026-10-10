// 授業モード（Class Mode）— Roblox 版 USpeakTeacherLive と 同じ 4 つ：
//   📣 Gather（先生の いる 場所へ あつめる・5 秒に 1 回）／ ⏸ Freeze ↔ ▶ Resume（10 分で 自動再開）／
//   📚 Review weak words（1 人ずつ 自分の 苦手を 最大 5 問）／ 🌍 Move together（5 秒の カウントダウン・15 秒に 1 回）。
// 先生の 操作は 1 秒に 1 回まで。判定は ぜんぶ 部屋（ClassRoom）が する。ここは 決まりごとと 行き先の 表。

export const LIMIT = { anyMs: 1000, gatherMs: 5000, moveMs: 15000, autoResumeMs: 10 * 60 * 1000, countdownSec: 5, gatherDelayMs: 1500, resultMs: 75000 };

// 行き先（Web に ある 場所）。`to` は クライアントの 島の id（rpg-data.js の HUBS）か、メインの島の 建物（hut_*）。
export const DESTINATIONS = [
  { id: 'main', en: 'Main Island', jp: 'メインの しま', icon: '🏠' },
  { id: 'hut_easy', en: 'Word House: EASY', jp: 'えいたんご ハウス（イージー）', icon: '📖', island: 'main' },
  { id: 'hut_medium', en: 'Word House: MEDIUM', jp: 'えいたんご ハウス（ミディアム）', icon: '📗', island: 'main' },
  { id: 'hut_hard', en: 'Word House: HARD', jp: 'えいたんご ハウス（ハード）', icon: '📕', island: 'main' },
  { id: 'fishworld', en: 'Fishing World', jp: 'つりワールド', icon: '🎣' },
  { id: 'willow', en: 'U-Speak Island', jp: 'ユースピークとう', icon: '🌳' },
  { id: 'conv', en: 'Conversation Island', jp: 'えいかいわ じま', icon: '💬' },
  { id: 'eiken5', en: 'Eiken 5 Island', jp: 'えいけん 5きゅうの しま', icon: '5️⃣' },
  { id: 'eiken4', en: 'Eiken 4 Island', jp: 'えいけん 4きゅうの しま', icon: '4️⃣' },
  { id: 'eiken3', en: 'Eiken 3 Island', jp: 'えいけん 3きゅうの しま', icon: '3️⃣' },
  { id: 'school', en: 'Word School Island', jp: 'ことばの がっこう じま', icon: '🏫' },
  { id: 'errand', en: 'Errand Island', jp: 'おつかい じま', icon: '🛍' },
  { id: 'farm', en: 'Farm Island', jp: 'ぼくじょう じま', icon: '🐄' },
  { id: 'talk', en: 'Talk Island', jp: 'おはなし じま', icon: '🎤' },
  { id: 'arena', en: 'Word Arena Island', jp: 'えいご アリーナ じま', icon: '⚔️' },
  { id: 'town', en: 'Town Island', jp: 'まちづくり じま', icon: '🧱' },
  { id: 'ride', en: 'Ride Island', jp: 'のりもの じま', icon: '🏁' },
  { id: 'pet', en: 'Pet Island', jp: 'ペット じま', icon: '🥚' },
  { id: 'wear', en: 'Dress-up Island', jp: 'きせかえ じま', icon: '👕' },
  { id: 'mini', en: 'Minigame Island', jp: 'ミニゲーム じま', icon: '🍉' },
];
export const DEST_BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]));

// ストップ中の 生徒から 受けつけない メッセージ（答える・始める・買う・走る）。
// 声と 文字の 通話・位置・名簿・プロフィールは 止めない（先生の 話を 聞く ための ものなので）。
const BLOCKED = /^(answer|economy|quiz:|gym:|eiken:|interview:|battle:|mission:|fw:|wh:|quick:|conv:|farm:act|farm:answer|race:|gp:|ghost:|review:|land:buy|land:restyle|wear:buy|block:buy|bw:buy|food:buy|prop:buy|ride:buy|room:|plaza:place|plaza:remove)/;
export const blockedWhilePaused = (type) => BLOCKED.test(String(type || ''));

// 先生が いる 場所の 名前（名簿の「いる場所」）。`in:main:hut_easy` → 'main · hut_easy'。
export function placeLabel(space) {
  const s = String(space || '');
  if (!s) return '';
  if (s.startsWith('in:')) { const [, island, spot] = s.split(':'); return `${island}${spot ? ` · ${spot}` : ''}`; }
  return s;
}

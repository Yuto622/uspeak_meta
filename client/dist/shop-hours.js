// お店の ひらく 時間（2026-11：「時間の概念を作って お店が閉まるように。空いてるときは窓から光が」）。
// 世界の 時計（world-clock.js・クラス みんな 同じ）の よる（night）の あいだ、メインの島の お店は しまる。あさ（dawn）に あく。
// しまるのは 買いものの お店だけ（SHOP_KINDS）。べんきょうの 場所（英単語ハウス・しゅくだい・つり場・ゲート）と じぶんの いえは いつでも。
// 見た目と 入口だけの きまり（ページが 決める）：コイン・判定は いままでどおり 部屋。自動の 検査（navigator.webdriver）では いつも あいて いる（?hours=1 で ためせる）。
import { phaseAt, PHASES } from './world-clock.js';

export const SHOP_KINDS = new Set(['food_shop', 'wear_shop', 'block_shop', 'land_shop', 'weapon_shop', 'fish_buy', 'talk_shop']);
let skew = 0;
export function setClockSkew(ms) { skew = Number(ms) || 0; }
const forced = (() => { try { return new URLSearchParams(location.search).get('hours'); } catch { return null; } })();
const auto = (() => { try { return !!navigator.webdriver; } catch { return true; } })();
export function shopsOpen(now = Date.now() + skew) {
  if (forced === 'closed') return false;
  if (auto && forced !== '1') return true;
  return phaseAt(now).id !== 'night';
}
// いま 夜か（ベッドで ねる・room-world.js）。お店と ちがい、自動の 検査でも 本当の 時計を 見る（?hours=closed は 夜あつかい）。
export function isNight(now = Date.now() + skew) { return forced === 'closed' || phaseAt(now).id === 'night'; }
export function nightEndsIn(now = Date.now() + skew) { const p = phaseAt(now); return p.id === 'night' ? Math.ceil(p.endsIn) : 0; }
// あくまでの 秒（あいて いれば 0）。
export function opensIn(now = Date.now() + skew) {
  if (shopsOpen(now)) return 0;
  const p = phaseAt(now); return p.id === 'night' ? Math.ceil(p.endsIn) : 0;
}
export const isShop = (spot) => !!spot && SHOP_KINDS.has(spot.kind);
export const NIGHT_SECONDS = PHASES.find((p) => p.id === 'night')?.seconds || 0;

// 世界の 時計を 24 時間の 時計に なおす（ひろばの 時計台の はり・2026-11）。0〜24 の 小数（7.5 ＝ 7:30）。
// ひるま 300 秒 ＝ 7:00〜17:00 ／ ゆうがた 120 秒 ＝ 17:00〜19:00 ／ よる 240 秒 ＝ 19:00〜5:30 ／ あさ 45 秒 ＝ 5:30〜7:00（それぞれの 中は まっすぐ）。
// お店と 同じ ずれ（setClockSkew）を 使うので、クラスの みんなが 同じ 時こくを 見る。
const HOUR_SPAN = { day: [7, 17], dusk: [17, 19], night: [19, 29.5], dawn: [5.5, 7] };
export function worldHour(now = Date.now() + skew) {
  const p = phaseAt(now), [a, b] = HOUR_SPAN[p.id] || [0, 24];
  const h = a + (b - a) * (p.seconds ? p.into / p.seconds : 0);
  return ((h % 24) + 24) % 24;
}

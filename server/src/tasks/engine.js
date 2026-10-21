// タスクの エンジン：/admin/tasks の「はじめの100」を、ゲームの 左の カードに する。
// 決めるのは ぜんぶ ここ（サーバー）。ページは 届いた 3 つを ならべるだけ。
//
// 1 行の「完了の しらべかた」（check 列）は 3 つの 形の どれか：
//   near:<場所の id>        … メインの島の その 場所の 近くに 立った（main_island.json の spots）
//   <できごと>:<数>         … 部屋が 数えた できごとが その 数に なった（数を 省くと 1）
//   $<数字の 名前>:<数>     … いまの 数字（コイン・つった 数・ずかん・レベル…）が その 数 以上
// できごとの 名前は ClassRoom が taskBump() に わたす もの（下の EVENTS に 一覧）。
// check が 空か 読めない 行は とばす（ゲームに 出さない）。
//
// 見せかたは「見せかたの ルール」の 表（rules）から 読む：一度に 出す 数（visible）、章の 大きさ（chapter_size）、
// 章を おえた ごほうび（chapter_reward）、さいしょの 1 つを おまけで すませる（endowed）、
// 「◯こ できた」と「あと ◯こ」の きりかえ（framing_switch）。
import { readFileSync } from 'node:fs';

const MAIN = (() => {
  try {
    const j = JSON.parse(readFileSync(new URL('../../../client/dist/main_island.json', import.meta.url), 'utf8'));
    const isl = j.island;
    return { id: isl.id, spots: new Map(isl.spots.map((s) => [s.id, { id: s.id, wx: isl.x + s.x, wz: isl.z + s.z }])) };
  } catch { return { id: 'main', spots: new Map() }; }
})();
export const NEAR_RADIUS = 7;
export const MAIN_SPOTS = MAIN.spots;

// ページが 言って よい できごと（ページにしか 分からない もの：画面を ひらいた・はなしかけた）。
// ここに ない 名前は 捨てる。どれも 1 回 すめば おわる 小さな タスクにしか 使わない こと。
export const UI_EVENTS = new Set([
  'fishdex', 'wordbook', 'homemap', 'homemap_poi', 'worldmap', 'bag', 'ranking', 'equip', 'quest',
  'emma', 'talk', 'buddy', 'ride', 'photo', 'minigame', 'blockwild', 'season',
]);

const MAX_KEYS = 400;
const MAX_WORDS = 150;

export function blankTasks() { return { done: [], c: {}, seen: [], w: [], run: 0, paid: [], at: 0 }; }

export function sanitizeTasks(raw) {
  const t = blankTasks();
  if (!raw || typeof raw !== 'object') return t;
  const ids = (v, max) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length <= 40).slice(0, max) : []);
  t.done = ids(raw.done, 3000);
  t.seen = ids(raw.seen, 64);
  t.w = ids(raw.w, MAX_WORDS);
  t.paid = (Array.isArray(raw.paid) ? raw.paid : []).filter((n) => Number.isInteger(n) && n >= 0 && n < 1000).slice(0, 500);
  t.run = Math.max(0, Math.min(9999, Math.floor(Number(raw.run) || 0)));
  t.at = Math.max(0, Math.floor(Number(raw.at) || 0));
  if (raw.c && typeof raw.c === 'object') {
    for (const [k, v] of Object.entries(raw.c).slice(0, MAX_KEYS)) {
      const n = Math.floor(Number(v));
      if (typeof k === 'string' && k.length <= 80 && n > 0) t.c[k] = Math.min(1e6, n);
    }
  }
  return t;
}

// "fish:3" → { key: 'fish', n: 3 }、"$coins:100" → { stat: 'coins', n: 100 }、"near:fishing_pier" → { near: 'fishing_pier' }
export function parseCheck(text) {
  const s = String(text || '').trim();
  if (!s || s.length > 80 || /\s/.test(s)) return null;
  const parts = s.split(':');
  let n = 1;
  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) n = Number(parts.pop());
  if (!parts.length || parts.some((p) => !p)) return null;
  if (parts[0] === 'near') return parts.length === 2 && MAIN.spots.has(parts[1]) ? { near: parts[1], n: 1 } : null;
  if (parts[0].startsWith('$')) {
    const stat = parts[0].slice(1);
    return parts.length === 1 && STATS.has(stat) ? { stat, n } : null;
  }
  return { key: parts.join(':'), n: Math.max(1, n) };
}

// 部屋が わたす いまの 数字。
export const STATS = new Set(['coins', 'fish', 'dex', 'level', 'streak', 'weekxp', 'clothes', 'pet', 'run', 'words', 'islands', 'friends']);

const tokens = (head, id) => {
  const segs = String(id || '').split(':').filter(Boolean).slice(0, 4);
  const out = [head];
  for (let i = 1; i <= Math.min(3, segs.length); i++) out.push(`${head}:${segs.slice(0, i).join(':')}`);
  if (segs.length > 1) out.push(`${head}:${segs[0]}:${segs[segs.length - 1]}`);
  return [...new Set(out)];
};

export function bump(prog, key, by = 1) {
  if (!key || key.length > 80) return;
  if (!(key in prog.c) && Object.keys(prog.c).length >= MAX_KEYS) return;
  prog.c[key] = Math.min(1e6, (prog.c[key] || 0) + by);
}

// コインが うごいた（applyOp の あと）。"award:quiz:easy" のように 名前の 頭から 数える。
export function onOp(prog, op) {
  if (!op?.type) return;
  for (const k of tokens(op.type, op.id)) bump(prog, k);
  if (op.type === 'sell' || op.type === 'sellAll' || String(op.id || '').startsWith('fish_sell:')) bump(prog, 'sell');
}

// 学習の 記録が 1 行 書かれた（appendLearning の 中）。
export function onAnswer(prog, { qid, mode, correct }) {
  const q = String(qid || '');
  for (const k of tokens('a', q)) bump(prog, k);
  if (mode) bump(prog, `a:${mode}`);
  const kinds = new Set([mode, String(mode || '').replace(/^fw-/, ''), q.split(':')[2]].filter(Boolean));
  if (correct) {
    for (const k of tokens('ok', q)) bump(prog, k);
    for (const k of kinds) bump(prog, `ok:${k}`);
    prog.run += 1;
    // 正解した ことば（さいごの 区切り。数字や 長い 文は 数えない）
    const word = q.split(':').pop();
    if (word && /^[A-Za-z][A-Za-z' -]{0,30}$/.test(word) && !prog.w.includes(word.toLowerCase()) && prog.w.length < MAX_WORDS) prog.w.push(word.toLowerCase());
  } else if (mode !== 'chat') prog.run = 0;
}

// 場所が かわった。"enter:fishworld"、建物は "enter:in:main:books" と "enter:in:main"。
export function onSpace(prog, space) {
  const s = String(space || '');
  if (!s) return;
  bump(prog, `enter:${s}`);
  if (s.startsWith('in:')) bump(prog, `enter:${s.split(':').slice(0, 2).join(':')}`);
  else if (!prog.seen.includes(s) && prog.seen.length < 64) prog.seen.push(s);
}

// メインの島で 立っている 場所。近くに きた 場所の id を 返す（さいしょの 1 回だけ 数える）。
export function onPosition(prog, space, x, z) {
  if (space !== MAIN.id) return null;
  for (const sp of MAIN.spots.values()) {
    if (Math.hypot(x - sp.wx, z - sp.wz) <= NEAR_RADIUS && !prog.c[`near:${sp.id}`]) { bump(prog, `near:${sp.id}`); return sp.id; }
  }
  return null;
}

export function met(prog, check, stats) {
  if (check.near) return (prog.c[`near:${check.near}`] || 0) >= 1;
  if (check.stat) return (Number(stats?.[check.stat]) || 0) >= check.n;
  return (prog.c[check.key] || 0) >= check.n;
}

export function have(prog, check, stats) {
  if (check.near) return Math.min(1, prog.c[`near:${check.near}`] || 0);
  if (check.stat) return Math.min(check.n, Math.max(0, Math.floor(Number(stats?.[check.stat]) || 0)));
  return Math.min(check.n, prog.c[check.key] || 0);
}


// 光の道の 行き先：{ island, spot? }。spot は メインの島の 場所（main_island.json）。分からなければ null。
const HUBS = new Set(['main', 'willow', 'park', 'errand', 'school', 'arena', 'pet', 'ride', 'town', 'eiken5', 'eiken4', 'eiken3', 'talk', 'conv', 'wear', 'mini', 'farm', 'land', 'fishworld', 'homework']);
const GO_RULES = [
  [/^(sell|award:fish_sell)/, { island: 'main', spot: 'fish_buy' }],
  [/^\$(fish|dex)$/, { island: 'main', spot: 'fishing_pier' }],
  [/^a:wh:Medium/, { island: 'main', spot: 'hut_medium' }],
  [/^a:wh:Hard/, { island: 'main', spot: 'hut_hard' }],
  [/^(a|ok):wh/, { island: 'main', spot: 'hut_easy' }],
  [/^(spend:wear|wear$)/, { island: 'main', spot: 'clothes' }],
  [/^spend:food/, { island: 'main', spot: 'shop_food0' }],
  [/^spend:block/, { island: 'main', spot: 'blocks' }],
  [/^ui:blockwild/, { island: 'main', spot: 'build_gate' }],
  [/^ui:homemap/, { island: 'main' }],
  [/^convdone:(cafe|market|school|dream)$/, { island: 'conv' }],
  [/^(award|a|ok|done):(eiken|interview):g5/, { island: 'eiken5' }],
  [/^(award|a|ok|done):(eiken|interview):g4/, { island: 'eiken4' }],
  [/^(award|a|ok|done):(eiken|interview):g3/, { island: 'eiken3' }],
  [/^award:mission/, { island: 'errand' }],
  [/^(spend:pet|\$pet$)/, { island: 'pet' }],
  [/^(ok|a):farm/, { island: 'farm' }],
  [/^(award|done):battle/, { island: 'arena' }],
  [/^award:(quiz|gym)/, { island: 'school' }],
  [/^(spend:ride|award:gp)/, { island: 'ride' }],
  [/^fwcatch:/, { island: 'fishworld' }],
  [/^ui:(emma|quest)/, { island: 'willow' }],
  [/^ui:ride/, { island: 'park' }],
  [/^ui:minigame/, { island: 'mini' }],
  [/^voice$/, { island: 'talk' }],
];
export function goOf(check) {
  if (!check) return null;
  if (check.near) return { island: MAIN.id, spot: check.near };
  const key = check.stat ? `$${check.stat}` : check.key;
  const enter = /^enter:([a-z0-9]+)$/.exec(key);
  if (enter) return HUBS.has(enter[1]) ? { island: enter[1] } : null;
  const shop = /^convdone:([a-z_]+)$/.exec(key);
  if (shop && MAIN.spots.has(shop[1])) return { island: MAIN.id, spot: shop[1], shop: 'talkshops' };
  for (const [re, go] of GO_RULES) if (re.test(key)) return { ...go };
  return null;
}

const truthy = (v) => /^(true|1|yes|on|はい)$/i.test(String(v ?? '').trim());

export function readRules(rows) {
  const by = new Map((rows || []).filter((r) => r.on !== false).map((r) => [r.key, r.value]));
  const int = (k, d, lo, hi) => { const n = Math.floor(Number(by.get(k))); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const frac = Number(by.get('framing_switch'));
  return {
    visible: int('visible', 3, 1, 5),
    chapterSize: int('chapter_size', 10, 2, 50),
    chapterReward: int('chapter_reward', 100, 0, 1000),
    endowed: by.has('endowed') ? truthy(by.get('endowed')) : true,
    framingSwitch: Number.isFinite(frac) && frac > 0 && frac < 1 ? frac : 0.5,
  };
}

// 出す ならび（採用で、しらべかたの 読める 行だけ）を 章に わける。章は「章」列が かわる ところか、chapter_size ごと。
export function plan(rows, rules) {
  const list = [];
  for (const r of rows || []) {
    const check = parseCheck(r.check);
    if (!check) continue;
    list.push({ row: r, check });
  }
  const chapters = [];
  let cur = null;
  for (const item of list) {
    const name = String(item.row.chapter || '').trim();
    if (!cur || (name && name !== cur.name) || (!name && cur.items.length >= rules.chapterSize)) {
      cur = { name: name || cur?.name || '', items: [] };
      chapters.push(cur);
    }
    cur.items.push(item);
  }
  return { list, chapters };
}

// できる ものを ぜんぶ すませる（見えている 3 つの 中だけ。すむと つぎが 見えて、それも すんでいれば つづけて すむ）。
// 返すのは あたらしく すんだ 行と、あたらしく おわった 章の 番号。
export function settle(prog, plan, rules, stats, skip = null) {
  const finished = [];
  const chaptersDone = [];
  const done = new Set(prog.done);
  for (let guard = 0; guard < 200; guard++) {
    const window = plan.list.filter((it) => !done.has(it.row.id) && !skip?.(it)).slice(0, rules.visible);
    const hit = window.find((it) => met(prog, it.check, stats));
    if (!hit) break;
    done.add(hit.row.id);
    prog.done.push(hit.row.id);
    finished.push(hit.row);
  }
  plan.chapters.forEach((ch, i) => {
    if (prog.paid.includes(i)) return;
    if (ch.items.every((it) => done.has(it.row.id) || skip?.(it))) { prog.paid.push(i); chaptersDone.push(i); }
  });
  return { finished, chaptersDone };
}

// ページに おくる 形。
export function view(prog, plan, rules, stats, skip = null) {
  const done = new Set(prog.done);
  const idx = plan.chapters.findIndex((ch) => ch.items.some((it) => !done.has(it.row.id) && !skip?.(it)));
  if (idx < 0) return { all: true, total: plan.list.length, done: plan.list.length, tasks: [] };
  const ch = plan.chapters[idx];
  const items = ch.items.filter((it) => !skip?.(it) || done.has(it.row.id));
  const size = items.length + (rules.endowed ? 1 : 0);
  const got = items.filter((it) => done.has(it.row.id)).length + (rules.endowed ? 1 : 0);
  const window = plan.list.filter((it) => !done.has(it.row.id) && !skip?.(it)).slice(0, rules.visible);
  return {
    chapter: { n: idx + 1, of: plan.chapters.length, name: ch.name.replace(/^\d+\s*/, ''), done: got, size, reward: rules.chapterReward },
    // はじめの 半分は「◯こ できた」、のこり 半分は「あと ◯こ」（Koo & Fishbach 2012）
    framing: got / size < rules.framingSwitch ? 'done' : 'left',
    total: plan.list.length,
    done: plan.list.filter((it) => done.has(it.row.id)).length,
    tasks: window.map((it) => ({
      id: it.row.id, ja: it.row.ja, en: it.row.en || it.row.ja, where: it.row.where || '',
      coins: it.row.coins || 0, xp: it.row.xp || 0,
      have: have(prog, it.check, stats), need: it.check.near ? 1 : it.check.n,
      near: it.check.near || null,
      go: goOf(it.check),
    })),
  };
}

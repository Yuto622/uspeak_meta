// Roblox の「アカウント管理」シート（教室マスタ・座席）を 読む。保護者レポートが Roblox だけで 遊ぶ 子を
// 自動で 教室に 入れる ため（貼りつけ・紐づけの 手作業を なくす）。読むだけ。10 分ごとに 読みなおす。
//   教室マスタ：code, name, seats, active      座席：code, userId, username, source, registeredAt
// 座席に ない アカウントも、同じ 名前の 型（Kagurazaka_01 と Kagurazaka_04 など）が 1 つの 教室に だけ ある ときは その 教室に 入れる。

const TTL_MS = 10 * 60 * 1000;
const norm = (s) => String(s ?? '').trim();
export const isTeacherName = (u) => /teacher|先生|管理/i.test(String(u || ''));
// 名前の 型：おしまいの 数字と 区切り（_ - ‗）を とった 小文字。短すぎる 型は 使わない。
export function namePrefix(username) {
  const p = String(username || '').replace(/\d+$/, '').replace(/[\s_\-‗]+$/, '').toLowerCase();
  return p.length >= 4 && p !== String(username || '').toLowerCase() ? p : '';
}

// rows（1 行目が 見出し）→ [{ 見出し: 値 }]
function table(rows) {
  const [head = [], ...body] = rows || [];
  const keys = head.map((h) => norm(h).toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, norm(r[i])]))).filter((o) => Object.values(o).some(Boolean));
}

export function parseSeats({ classRows = [], seatRows = [] }) {
  const classes = table(classRows)
    .filter((r) => r.code && String(r.active || 'true').toLowerCase() !== 'false')
    .map((r) => ({ code: r.code, name: r.name || r.code }));
  const seats = table(seatRows).filter((r) => r.code && r.username).map((r) => ({ code: r.code, username: r.username, userId: r.userid || '' }));
  return { classes, seats };
}

export function createRobloxSeats({ api, classTab = '教室マスタ', seatTab = '座席', log = console, now = Date.now } = {}) {
  let cache = { at: 0, classes: [], seats: [] };
  let lastError = '';
  let loading = null;
  const range = (tab) => `'${tab.replace(/'/g, "''")}'!A1:F2000`;
  async function refresh() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const [classRows, seatRows] = await Promise.all([api.getValues(range(classTab)), api.getValues(range(seatTab))]);
        cache = { at: now(), ...parseSeats({ classRows, seatRows }) };
        lastError = '';
      } catch (err) {
        lastError = err.message;
        cache.at = now();   // 失敗しても 10 分は 待つ（ログを あふれさせない）
        log.warn?.(`[parent-report] Roblox seat sheet could not be read: ${err.message} (is it shared with the service account?)`);
      } finally { loading = null; }
    })();
    return loading;
  }
  async function fresh() { if (!cache.at || now() - cache.at > TTL_MS) await refresh(); return cache; }
  return {
    refresh,
    async status() { await fresh(); return { ok: !lastError && cache.seats.length > 0, account: api.account || '', seats: cache.seats.length, classes: cache.classes.length, error: lastError }; },
    async classes() { return (await fresh()).classes; },
    async seats() { return (await fresh()).seats; },
  };
}

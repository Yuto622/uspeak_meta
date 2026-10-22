// LINE の 下の メニュー（リッチメニュー）を 登録する。サーバーの 起動の ときに 自動で（scripts/line-richmenu.mjs からも 同じ もの）。
//
// いまの 既定の メニューが RICH_MENU.name（uspeak-parent-v*）なら 何も しない。ちがえば：前の uspeak-parent-v* を 消す →
// 作る → 画像（templates/line-richmenu.png）を のせる → 友だち 全員の 既定に する。
// 鍵は サーバーの LINE_CHANNEL_ACCESS_TOKEN だけ（チャットや コマンドに 書かない）。
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RICH_MENU } from './menu.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const RICH_MENU_IMAGE = path.resolve(here, '../../templates/line-richmenu.png');

export async function ensureRichMenu({ token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '', force = false, fetchImpl = fetch, log = console } = {}) {
  if (!token) return { ok: false, reason: 'no token' };
  const call = async (method, url, body, type = 'application/json') => {
    const res = await fetchImpl(url, {
      method, signal: AbortSignal.timeout(20000),
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': type } : {}) },
      body: body && type === 'application/json' ? JSON.stringify(body) : body,
    });
    const text = await res.text();
    if (res.status === 404 && method === 'GET') return null;      // 既定の メニューが まだ ない
    if (!res.ok) throw new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, '')} → ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : {};
  };
  const menus = (await call('GET', 'https://api.line.me/v2/bot/richmenu/list'))?.richmenus || [];
  const current = (await call('GET', 'https://api.line.me/v2/bot/user/all/richmenu'))?.richMenuId || '';
  const live = menus.find((m) => m.richMenuId === current);
  if (!force && live?.name === RICH_MENU.name) return { ok: true, already: true, richMenuId: current };
  for (const m of menus.filter((x) => /^uspeak-parent-v/.test(x.name))) {
    await call('DELETE', `https://api.line.me/v2/bot/richmenu/${m.richMenuId}`);
    log.info?.(`[line] rich menu removed: ${m.name}`);
  }
  const { richMenuId } = await call('POST', 'https://api.line.me/v2/bot/richmenu', RICH_MENU);
  await call('POST', `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, await readFile(RICH_MENU_IMAGE), 'image/png');
  await call('POST', `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`);
  log.info?.(`[line] rich menu set as default for all friends: ${RICH_MENU.name}`);
  return { ok: true, created: true, richMenuId };
}

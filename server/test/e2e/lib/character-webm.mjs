// 録画・撮影用：ゆぴちゃん（ピンクの キャラクター・assets/character/*.mp4）を この 端末の Chromium でも 出す。
//
// 同梱の Chromium（Playwright）は H.264 を 再生できないので、ふつうに 撮ると character.js が
// 絵の フクロウに 切りかえる（教室の iPad では 動画が 出る）。撮る ときだけ 同じ 動画を VP9 の WebM に して
// わたす（ページは src の 名前しか 見ないので、中身が WebM でも 再生する）。本物の ファイルは さわらない。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../../../client/dist/assets/character');

export function characterWebm(tmpDir) {
  mkdirSync(tmpDir, { recursive: true });
  const out = {};
  for (const name of ['idle', 'talking']) {
    const to = path.join(tmpDir, `${name}.webm`);
    if (!existsSync(to)) {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(SRC, `${name}.mp4`), '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36',
        '-deadline', 'realtime', '-cpu-used', '8', '-vf', 'scale=960:-2', to]);
    }
    out[name] = to;
  }
  return out;
}

// context か page に つける。
export async function routeCharacter(target, files) {
  await target.route('**/assets/character/*.mp4', (route) => {
    const name = /talking\.mp4/.test(route.request().url()) ? 'talking' : 'idle';
    return route.fulfill({ path: files[name], contentType: 'video/webm', headers: { 'cache-control': 'no-store' } });
  });
}

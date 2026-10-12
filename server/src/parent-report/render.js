// .tex → PDF と 画像（PNG）。
//
// どこで 組むか（README「TeX の 実行環境」）：
//   - RENDER_URL が あれば、TeX の 入った 別の Fly アプリ（server/worker/）に 送る。Web の イメージは 軽いまま
//     （TeX Live ＋ 日本語フォントで 約 1GB。授業中の 本体に 積むと デプロイも 起動も 重くなる）。
//   - 無ければ この マシンの xelatex（開発・テスト・TeX を 入れた 環境）。
// どちらも 同じ compileTex()。xelatex は -no-shell-escape・使い捨ての 作業フォルダ・1 件 30 秒まで。
// 並列は 2 まで（queue）。失敗したら 1 回だけ やりなおす。
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
export const ENGINE = process.env.LATEX_BIN || 'xelatex';
export const LIMIT_MS = Number(process.env.REPORT_TEX_TIMEOUT_MS || 30000);

export class RenderError extends Error {}

// 画像の 大きさ。毎週版は LINE の 画像 1 枚（1040×1300）、月次版は A4 を 幅 1040。サムネイルは 幅 240（previewImageUrl・1MB 以下）。
export const RASTER = {
  weekly: { full: ['-scale-to-x', '1040', '-scale-to-y', '1300'], thumb: ['-scale-to-x', '240', '-scale-to-y', '300'] },
  monthly: { full: ['-scale-to-x', '1040', '-scale-to-y', '-1'], thumb: ['-scale-to-x', '240', '-scale-to-y', '-1'] },
  cards: null,
};

let available = null;
export async function localTexAvailable() {
  if (available !== null) return available;
  try { await run(ENGINE, ['--version'], { timeout: 8000 }); await run('pdftoppm', ['-v'], { timeout: 8000 }).catch((e) => { if (e.code === 'ENOENT') throw e; }); available = true; } catch { available = false; }
  return available;
}

// 1 件ぶん。{ pdf, png?, thumb? }（Buffer）。
export async function compileTex(source, { kind = 'weekly', name = 'report' } = {}) {
  const started = Date.now();
  const left = () => Math.max(1000, LIMIT_MS - (Date.now() - started));
  const dir = await mkdtemp(path.join(tmpdir(), 'uspeak-report-'));
  try {
    await writeFile(path.join(dir, 'r.tex'), source, 'utf8');
    // TikZ の remember picture は 2 回 組まないと 位置が 決まらない。
    for (let pass = 0; pass < 2; pass += 1) {
      await run(ENGINE, ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', 'r.tex'], {
        cwd: dir, timeout: left(), maxBuffer: 8 * 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: dir, TEXMFVAR: path.join(dir, 'texmf'), SOURCE_DATE_EPOCH: '0' },
      }).catch(async (err) => {
        const log = await readFile(path.join(dir, 'r.log'), 'utf8').catch(() => '');
        const why = (log.match(/^!.*$/m) || [])[0] || (err.killed ? 'timeout' : err.message);
        throw new RenderError(`${name}: ${String(why).slice(0, 200)}`);
      });
    }
    const out = { pdf: await readFile(path.join(dir, 'r.pdf')) };
    const raster = RASTER[kind];
    if (raster) {
      await run('pdftoppm', ['-png', '-f', '1', '-l', '1', '-singlefile', ...raster.full, 'r.pdf', 'full'], { cwd: dir, timeout: left() });
      await run('pdftoppm', ['-png', '-f', '1', '-l', '1', '-singlefile', ...raster.thumb, 'r.pdf', 'thumb'], { cwd: dir, timeout: left() });
      out.png = await readFile(path.join(dir, 'full.png'));
      out.thumb = await readFile(path.join(dir, 'thumb.png'));
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// TeX の worker（server/worker/render-server.js）に 送る。
async function remoteCompile(url, secret, source, { kind, name }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify({ tex: source, kind, name }),
    signal: AbortSignal.timeout(LIMIT_MS + 15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new RenderError(`${name}: worker ${res.status} ${body.error || ''}`.trim());
  const buf = (b) => (b ? Buffer.from(b, 'base64') : undefined);
  return { pdf: buf(body.pdf), png: buf(body.png), thumb: buf(body.thumb) };
}

// 並列 2・1 回 やりなおしの 窓口。
export function createRenderer({ url = process.env.RENDER_URL || '', secret = process.env.RENDER_SECRET || '', concurrency = 2, log = console, compile = null } = {}) {
  let active = 0;
  const waiting = [];
  const pump = () => {
    while (active < concurrency && waiting.length) {
      const job = waiting.shift();
      active += 1;
      job().finally(() => { active -= 1; pump(); });
    }
  };
  const once = (source, opts) => (compile ? compile(source, opts) : url ? remoteCompile(url, secret, source, opts) : compileTex(source, opts));
  const attempt = async (source, opts) => {
    try { return await once(source, opts); } catch (err) {
      log.warn?.(`[parent-report] render failed, retrying once: ${err.message}`);
      return once(source, opts);
    }
  };
  return {
    get mode() { return compile ? 'custom' : url ? 'worker' : 'local'; },
    async available() { return compile ? true : url ? true : localTexAvailable(); },
    render(source, opts = {}) {
      return new Promise((resolve, reject) => {
        waiting.push(() => attempt(source, opts).then(resolve, reject));
        pump();
      });
    },
    get busy() { return active + waiting.length; },
  };
}

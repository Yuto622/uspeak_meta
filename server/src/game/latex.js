// LaTeX を PDF にする — running the engine, when there is one.
//
// The .tex file is always available: it is generated from the record and needs nothing
// installed anywhere. Turning it into a PDF needs a TeX distribution, which is a gigabyte
// and which most servers do not have, so this checks first and says so plainly rather
// than failing in the middle of a parent's download.
//
// Two things make running a compiler on a web request safe enough to do:
//   - the document is written by us and every value in it is escaped (report-tex.js);
//   - the engine runs with -no-shell-escape in a fresh temporary directory, with no
//     network, a time limit, and nothing of the server's own filesystem in TEXINPUTS.
// Even so it is one child's report at a time: this is not a compiler service.
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// XeLaTeX, because the document sets Japanese with xeCJK. LuaLaTeX would need a different
// preamble, so it is not offered as a silent substitute.
export const ENGINE = process.env.LATEX_BIN || 'xelatex';
const TIMEOUT_MS = Number(process.env.LATEX_TIMEOUT_MS || 40000);

let cached = null;
export async function latexAvailable() {
  if (cached !== null) return cached;
  try {
    await run(ENGINE, ['--version'], { timeout: 8000 });
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}

export class LatexError extends Error {}

// The document is drawn with TikZ overlays positioned against the page, and those need a
// second pass to know where the page is: one pass gives a blank cover.
export async function texToPdf(source, { name = 'report' } = {}) {
  if (!await latexAvailable()) throw new LatexError('no engine');
  const dir = await mkdtemp(path.join(tmpdir(), 'uspeak-tex-'));
  try {
    const file = path.join(dir, 'report.tex');
    await writeFile(file, source, 'utf8');
    for (let pass = 0; pass < 2; pass += 1) {
      await run(ENGINE, ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', 'report.tex'], {
        cwd: dir,
        timeout: TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: dir, TEXMFVAR: path.join(dir, 'texmf'), SOURCE_DATE_EPOCH: '0' },
      }).catch(async (err) => {
        // The engine's own log says what is wrong far better than its exit code does.
        const log = await readFile(path.join(dir, 'report.log'), 'utf8').catch(() => '');
        const why = (log.match(/^!.*$/m) || [])[0] || err.message;
        throw new LatexError(`${name}: ${why.slice(0, 300)}`);
      });
    }
    return await readFile(path.join(dir, 'report.pdf'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

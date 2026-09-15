#!/usr/bin/env python3
"""紹介動画を作る。台本は docs/tour-cuts.json ひとつだけ。

    python3 docs/make-tour.py            # 全部
    python3 docs/make-tour.py player     # docs/tour.html だけ（速い）

出るもの:
  docs/tour.html                 ナレーション付きのプレーヤー（10分版 / 5分版）
  docs/uspeak-tour-10min.webm    動画ファイル（音声なし・字幕は焼き込み）
  docs/uspeak-tour-5min.webm
  docs/tour-script.md            収録用の台本（秒数つき）

**音声について。** この環境には音声合成も音声コーデックも無い（同梱の ffmpeg は
Playwright 付属の映像だけのビルド）。そこで声は2通りで届ける：

  * tour.html は**見る人のブラウザに読ませる**（Web Speech API）。Windows でも mac でも
    日本語の声が入っていればそのまま喋る。これが「ナレーション付きの動画」の実体。
  * .webm は音声なし・字幕焼き込み。ナレーションを人が録るなら tour-script.md を読む。

長さは秒数を手で持たず、文字数から出す（二重管理は必ずずれる）。
"""
import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parent
FIGS = DOCS / "figures"
CLIPS = DOCS / "clips"
FFMPEG = "/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux"
FONT_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

# 読む速さ。1秒5.6文字＝1分およそ336文字で、落ち着いたアナウンスの速さ。
PACE = 5.6
TAIL = 1.2      # 読み終わってから次のカットへ移るまでの間
FLOOR = 7.0     # どんなに短い文でも、絵がこれだけは映る
FLOOR5 = 6.0

INK = (26, 42, 36)
CREAM = (244, 241, 227)
DEEP = (12, 42, 36)
GREEN = (23, 63, 56)
GOLD = (232, 195, 104)
MINT = (116, 195, 154)


def load():
    data = json.loads((DOCS / "tour-cuts.json").read_text(encoding="utf-8"))
    return data["title"], data["cuts"]


def plan(cuts, short=False):
    """カットの一覧に、読む文と長さを足して返す。"""
    out, t = [], 0.0
    for c in cuts:
        if short and not c.get("in5", True):
            continue
        text = (c.get("short") or c["ja"]) if short else c["ja"]
        sec = max(FLOOR5 if short else FLOOR, len(text) / PACE + TAIL)
        row = {
            "chapter": c["chapter"], "fig": c["fig"], "title": c["title"],
            "text": text, "sec": round(sec, 1), "at": round(t, 1),
        }
        # 実際に動いているところ。静止画（fig）はそのまま残す — 動画が再生できない
        # ブラウザではそれが出るし、動画から切り出すより写真のほうが常に読みやすい。
        if c.get("clip"):
            row["clip"] = c["clip"]
            row["from"] = c.get("from", 0)
        out.append(row)
        t += sec
    return out, t


# ---- プレーヤー -----------------------------------------------------------------

def build_player(title, cuts):
    full, tf = plan(cuts, False)
    five, t5 = plan(cuts, True)
    payload = json.dumps({"full": full, "five": five}, ensure_ascii=False)
    mmss = lambda s: f"{int(s) // 60}:{int(s) % 60:02d}"
    html = PLAYER.replace("__DATA__", payload).replace("__TITLE__", title)
    html = html.replace("__LEN_FULL__", mmss(tf)).replace("__LEN_FIVE__", mmss(t5))
    (DOCS / "tour.html").write_text(html, encoding="utf-8")
    print(f"  docs/tour.html          10分版 {mmss(tf)} / 5分版 {mmss(t5)}")


# ---- 収録用の台本 ---------------------------------------------------------------

def build_script(title, cuts):
    lines = [f"# {title} — ナレーション台本", "",
             "`docs/tour-cuts.json` から生成しています。**直すのは JSON のほうです。**", "",
             "秒数は1分およそ336文字で読んだときの目安です。", ""]
    for name, short in (("10分版", False), ("5分版", True)):
        rows, total = plan(cuts, short)
        lines += [f"## {name}（全 {int(total) // 60}分{int(total) % 60}秒 ・ {len(rows)}カット）", ""]
        chapter = None
        for r in rows:
            if r["chapter"] != chapter:
                chapter = r["chapter"]
                lines += ["", f"### {chapter}", ""]
            lines += [f"**{int(r['at']) // 60}:{int(r['at']) % 60:02d}  {r['title']}**　"
                      f"<sub>{r['sec']}秒 ・ 図 `figures/{r['fig']}.jpg`</sub>", "",
                      f"> {r['text']}", ""]
        lines.append("")
    (DOCS / "tour-script.md").write_text("\n".join(lines), encoding="utf-8")
    print("  docs/tour-script.md")


# ---- 動画 -----------------------------------------------------------------------

def wrap(draw, text, font, width):
    """日本語は単語で折れないので、1文字ずつ入るところまで詰める。"""
    lines, line = [], ""
    for ch in text:
        if ch == "\n":
            lines.append(line); line = ""; continue
        trial = line + ch
        if draw.textlength(trial, font=font) > width and line:
            # 行頭に置けない約物は前の行に残す
            if ch in "、。」）・":
                lines.append(trial); line = ""
                continue
            lines.append(line); line = ch
        else:
            line = trial
    if line:
        lines.append(line)
    return lines


def chunks(draw, text, font, width, maxlines=2):
    """長いナレーションを、字幕らしく2行ずつに割る。

    5行の壁を一度に出しても誰も読まない（読み終わる前に次のカットへ行く）。句点で切って、
    2行に収まるところまで足していく。表示時間は文字数の割合で分けるので、読みと合う。
    """
    parts, cur = [], ""
    for piece in [p + "。" for p in text.split("。") if p] :
        trial = (cur + piece)
        if cur and len(wrap(draw, trial, font, width)) > maxlines:
            parts.append(cur); cur = piece
        else:
            cur = trial
    if cur:
        parts.append(cur)
    # それでも2行を超える一文は、そのまま出す（切るより読めるほうを取る）
    return parts


def clip_frames(clip, start, sec, fps, height, scratch):
    """クリップを PNG のならびにする。足りなければ頭から繰り返す。

    **高さに合わせる（切らない）。** 写真は縦に流して全体を見せられるが、動画は中身が
    動いているのでこちらで動かせない。横幅に合わせて切ると、順位・ラップ・速度という
    見せたいものがちょうど画面の外に出る（一度そうなった）。左右に余白が出るほうがまし。
    録画は 1024x576 なので、高さ 490 に収めても横は 871 — ほとんど縮んでいない。

    このビルドの ffmpeg は mjpeg を書けないので、取り出せるのは PNG だけ。1枚1MB弱に
    なるので、カットごとに出して、使ったらすぐ消す。
    """
    shutil.rmtree(scratch, ignore_errors=True)
    scratch.mkdir(parents=True, exist_ok=True)
    need = math.ceil(sec * fps)
    subprocess.run(
        [FFMPEG, "-y", "-ss", str(start), "-i", f"file:{CLIPS / f'clip-{clip}.webm'}",
         "-r", str(fps), "-frames:v", str(need), "-vf", f"scale=-2:{height}",
         "-c:v", "png", "-f", "image2", f"file:{scratch}/%05d.png"],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    shots = sorted(scratch.glob("*.png"))
    if not shots:
        raise SystemExit(f"clip-{clip}.webm gave no frames at {start}s")
    return [shots[i % len(shots)] for i in range(need)]


def build_video(title, cuts, short, out_name, fps=10, size=(1280, 720)):
    from PIL import Image, ImageDraw, ImageFont
    rows, total = plan(cuts, short)
    W, H = size
    BAND = 230   # 帯の高さ。見出し（40px）と字幕2行が触れない最小がこれ
    f_title = ImageFont.truetype(FONT_BOLD, 40, index=0)
    f_chap = ImageFont.truetype(FONT_BOLD, 20, index=0)
    f_sub = ImageFont.truetype(FONT_REG, 27, index=0)
    f_foot = ImageFont.truetype(FONT_REG, 18, index=0)

    proc = subprocess.Popen(
        # **JPEG で流し込む。** 同梱の ffmpeg は `--disable-everything` のビルドで、
        # 読めるのは mjpeg だけ（png は書けるが読めない）。PNG を流すと即 broken pipe。
        # 入力は `-` ではなく `pipe:0`。このビルドはプロトコルも pipe と file しか無く、
        # `-` の解決に失敗して "Protocol not found" で即死する。
        [FFMPEG, "-y", "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", str(fps), "-i", "pipe:0",
         "-c:v", "libvpx", "-b:v", "1800k", "-crf", "31", "-deadline", "good",
         "-cpu-used", "2", "-an", str(DOCS / out_name)],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    # 帯は毎フレーム同じなので一度だけ作る
    band = Image.new("RGBA", (W, BAND), (*DEEP, 232))
    ruler = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    scratch = DOCS / ".tour-frames"
    done = 0
    for i, r in enumerate(rows):
        shots = clip_frames(r["clip"], r["from"], r["sec"], fps, H - BAND, scratch) if r.get("clip") else None
        src = Image.open(FIGS / f"{r['fig']}.jpg").convert("RGB")
        # 写真は帯の上ぜんぶ。
        #
        # **横に寄せず、縦にゆっくり流す。** 元は 1280x800 の画面写真で、ここは 1280x490。
        # 拡大して横に振ると4割が永久に画面の外に出る — BLOCKWILD の回は「写真の下のバーに
        # き しか入っていない」と言っている最中に、そのバーが切れて写らなかった。
        # 横幅ぴったりに合わせて（文字の大きさは原寸のまま）、上から下へ流せば、
        # そのカットの間に写真のすみずみが一度は映る。
        stage_h = H - BAND
        scale = W / src.width
        big = src.resize((W, math.ceil(src.height * scale)), Image.LANCZOS)
        drop = big.height - stage_h
        frames = max(1, round(r["sec"] * fps))
        # 字幕は文字数の割合で切り替える。読み上げと同じ配分なので、声と字幕がずれない。
        parts = chunks(ruler, r["text"], f_sub, W - 112)
        spans, at = [], 0
        for p in parts:
            n = max(1, round(frames * len(p) / len(r["text"])))
            spans.append((at, at + n, wrap(ruler, p, f_sub, W - 112)))
            at += n
        spans[-1] = (spans[-1][0], frames + 1, spans[-1][2])
        for f in range(frames):
            lines = next(ln for a, b, ln in spans if a <= f < b)
            k = f / max(1, frames - 1)
            ease = 0.5 - 0.5 * math.cos(math.pi * k)       # 端で止まって見えるように
            frame = Image.new("RGB", (W, H), DEEP)
            if shots:
                # 動いているものは、こちらで動かさない。切らずに真ん中へ置く。
                live = Image.open(shots[min(f, len(shots) - 1)]).convert("RGB")
                frame.paste(live, ((W - live.width) // 2, 0))
            else:
                span = 0.10 + 0.80 * (ease if i % 2 == 0 else 1 - ease)
                y = max(0, min(drop, int(drop * span)))
                frame.paste(big.crop((0, y, W, y + stage_h)), (0, 0))
            frame.paste(band, (0, H - BAND), band)
            d = ImageDraw.Draw(frame)
            d.line([(0, H - BAND), (W, H - BAND)], fill=GOLD, width=3)
            d.text((56, H - BAND + 20), r["chapter"], font=f_chap, fill=MINT)
            d.text((56, H - BAND + 44), r["title"], font=f_title, fill=CREAM)
            for n, line in enumerate(lines[:2]):
                d.text((56, H - 116 + n * 38), line, font=f_sub, fill=(214, 226, 214))
            # 進みぐあい
            at = (r["at"] + f / fps) / total
            d.rectangle([0, H - 6, W, H], fill=(255, 255, 255, 30))
            d.rectangle([0, H - 6, int(W * at), H], fill=GOLD)
            d.text((W - 150, H - BAND + 16), "U-Speak Lab", font=f_foot, fill=(140, 170, 155))
            frame.save(proc.stdin, "JPEG", quality=92, subsampling=0)
            done += 1
        print(f"    {r['title']}  ({done} frames)", end="\r")
    shutil.rmtree(scratch, ignore_errors=True)
    proc.stdin.close()
    err = proc.stderr.read().decode("utf-8", "replace")
    if proc.wait() != 0:
        raise SystemExit("ffmpeg failed:\n" + err[-2000:])
    mb = (DOCS / out_name).stat().st_size / 1e6
    print(f"  docs/{out_name}  {int(total) // 60}分{int(total) % 60}秒 ・ {done} frames ・ {mb:.1f} MB")


PLAYER = r"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
  :root{--deep:#0c2a24;--green:#173f38;--cream:#f4f1e3;--gold:#e8c368;--mint:#74c39a;--rule:#2c4a43}
  *{box-sizing:border-box}
  body{margin:0;background:var(--deep);color:var(--cream);
       font-family:"Noto Sans JP","Hiragino Sans","Yu Gothic",system-ui,sans-serif}
  .wrap{max-width:1180px;margin:0 auto;padding:18px 18px 40px}
  header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:12px}
  header h1{font-size:19px;margin:0;letter-spacing:1px}
  header small{color:var(--mint);font-size:12px;letter-spacing:2px}
  /* 動画（uspeak-tour-*.webm）と同じ組み：上が写真、下が字幕の帯。写真の上に字を重ねると、
     画面写真そのものに文字が多いので、どちらも読めなくなる。 */
  .stage{position:relative;aspect-ratio:16/9;background:var(--deep);border-radius:14px;overflow:hidden;
         box-shadow:0 20px 60px #0008}
  .shot{position:absolute;left:0;right:0;top:0;height:calc(100% - 32%);overflow:hidden;background:#000}
  /* 動画と同じで、横には振らず縦に流す。写真は 1280x800、枠は横長なので、
     拡大して横に振ると下のバーが永久に切れる。 */
  .shot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;
            transition:opacity .6s ease;animation:drift 1s linear both}
  .shot img.on{opacity:1}
  @keyframes drift{from{object-position:50% 10%}to{object-position:50% 90%}}
  /* 実際に動いているところ。写真の上にかぶせ、再生できないブラウザでは写真のまま。 */
  .shot video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;
              opacity:0;transition:opacity .5s ease;background:#0c2a24}
  .shot video.on{opacity:1}
  .live{position:absolute;right:14px;top:12px;z-index:2;display:none;align-items:center;gap:7px;
        padding:5px 11px;border-radius:999px;background:#0c2a24cc;color:var(--cream);
        font-size:11px;letter-spacing:2px}
  .live.on{display:flex}
  .live i{width:8px;height:8px;border-radius:50%;background:#ff7a6b;animation:blink 1.4s infinite}
  @keyframes blink{50%{opacity:.25}}
  .caption{position:absolute;left:0;right:0;bottom:0;height:32%;padding:14px 30px 20px;
           background:var(--deep);border-top:3px solid var(--gold);display:flex;flex-direction:column}
  .caption .chap{font-size:12px;letter-spacing:3px;color:var(--mint);margin-bottom:4px}
  .caption h2{margin:0 0 8px;font-size:clamp(16px,2.2vw,27px);letter-spacing:1px}
  .caption p{margin:0;font-size:clamp(11px,1.45vw,17px);line-height:1.7;color:#d8e4dc;overflow:hidden}
  .bar{position:absolute;left:0;bottom:0;height:4px;background:var(--gold);width:0;transition:width .25s linear}
  .controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0 6px}
  button{font:inherit;color:inherit;background:#1d4239;border:1px solid var(--rule);
         border-radius:11px;padding:10px 16px;cursor:pointer}
  button:hover{border-color:var(--mint)}
  button.on{background:var(--gold);color:#22372f;border-color:var(--gold);font-weight:700}
  button.play{background:var(--mint);color:#12302a;border-color:var(--mint);font-weight:700;min-width:104px}
  .time{margin-left:auto;font-variant-numeric:tabular-nums;color:#9fb8ac;font-size:13px}
  .note{color:#8fa79b;font-size:12px;line-height:1.8;margin:10px 0 18px}
  .note b{color:var(--cream)}
  ol.chapters{list-style:none;margin:0;padding:0;display:grid;
              grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
  ol.chapters li button{width:100%;text-align:left;display:flex;gap:10px;align-items:baseline;
                        background:#12332c;padding:9px 12px}
  ol.chapters li button.now{background:#1f4a3c;border-color:var(--mint)}
  ol.chapters em{font-style:normal;color:#89a496;font-size:11px;font-variant-numeric:tabular-nums;flex:none}
  ol.chapters span{font-size:13px}
  @media(max-width:560px){.caption{padding:14px 16px 18px}.caption p{min-height:4.6em}}
</style></head><body><div class="wrap">
<header><h1>__TITLE__</h1><small>U-SPEAK LAB</small></header>

<div class="stage" id="stage">
  <div class="shot"><img id="a" alt=""><img id="b" alt="">
    <video id="clip" muted playsinline loop preload="auto"></video>
    <span class="live" id="live"><i></i>じっさいの プレー</span></div>
  <div class="caption">
    <div class="chap" id="chap"></div>
    <h2 id="title"></h2>
    <p id="sub"></p>
  </div>
  <div class="bar" id="bar"></div>
</div>

<div class="controls">
  <button class="play" id="play">▶ さいせい</button>
  <button id="prev">◀ まえ</button>
  <button id="next">つぎ ▶</button>
  <button id="len10" class="on">10分版（__LEN_FULL__）</button>
  <button id="len5">5分版（__LEN_FIVE__）</button>
  <button id="voice" class="on">🔊 ナレーション</button>
  <span class="time" id="time">0:00</span>
</div>

<p class="note">
  ナレーションは<b>このブラウザが読み上げます</b>（日本語の音声が入っている Windows・mac・iPad ならそのまま喋ります）。
  声が出ないときは「🔊 ナレーション」を押して切り替えるか、字幕だけでご覧ください。
  <b>画面録画すれば、そのまま動画ファイルになります</b>（Windows は <b>Win+Alt+R</b>、mac は <b>⌘+Shift+5</b>）。
</p>

<ol class="chapters" id="chapters"></ol>
</div>
<script>
const DATA = __DATA__;
let cuts = DATA.full, i = 0, playing = false, t0 = 0, elapsed = 0, timer = 0, speak = true, flip = false;
const $ = (id) => document.getElementById(id);
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const total = () => cuts.reduce((n, c) => n + c.sec, 0);

function paint() {
  const c = cuts[i];
  $('chap').textContent = c.chapter;
  $('title').textContent = c.title;
  $('sub').textContent = c.text;
  // 動くカットは動画をかぶせる。再生できないブラウザ（WebM 非対応の古い Safari など）
  // では video が黙って失敗するので、下の写真がそのまま見えるだけになる。
  const clip = $('clip');
  if (c.clip) {
    if (clip.dataset.of !== c.clip) { clip.dataset.of = c.clip; clip.src = `clips/clip-${c.clip}.webm`; }
    try { clip.currentTime = c.from || 0; } catch { /* まだ読めていない */ }
    clip.play?.().then(() => { clip.classList.add('on'); $('live').classList.add('on'); })
      .catch(() => { clip.classList.remove('on'); $('live').classList.remove('on'); });
  } else {
    clip.classList.remove('on'); $('live').classList.remove('on'); clip.pause?.();
  }
  // 2枚を交互に使ってクロスフェード。1枚だと切り替わりが瞬きになる。
  const show = flip ? $('a') : $('b'), hide = flip ? $('b') : $('a');
  flip = !flip;
  show.src = `figures/${c.fig}.jpg`;
  show.style.animationDuration = c.sec + 's';
  show.classList.add('on'); hide.classList.remove('on');
  [...$('chapters').children].forEach((li, n) => li.firstChild.classList.toggle('now', n === i));
  $('time').textContent = `${mmss(cuts.slice(0, i).reduce((n, x) => n + x.sec, 0))} / ${mmss(total())}`;
}

function say(text) {
  if (!speak || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  const jp = speechSynthesis.getVoices().find((v) => v.lang && v.lang.replace('_', '-').startsWith('ja'));
  if (jp) u.voice = jp;
  u.rate = 1.0; u.pitch = 1.0;
  speechSynthesis.speak(u);
}

function go(n, keepPlaying = true) {
  i = (n + cuts.length) % cuts.length;
  elapsed = 0; t0 = performance.now();
  paint();
  if (playing && keepPlaying) say(cuts[i].text); else speechSynthesis?.cancel();
}

function tick() {
  if (!playing) return;
  const c = cuts[i];
  elapsed = (performance.now() - t0) / 1000;
  $('bar').style.width = `${Math.min(100, (elapsed / c.sec) * 100)}%`;
  if (elapsed >= c.sec) {
    if (i === cuts.length - 1) { stop(); return; }
    go(i + 1);
  }
}

function start() { playing = true; $('play').textContent = '❚❚ ていし'; t0 = performance.now() - elapsed * 1000; say(cuts[i].text); }
function stop() { playing = false; $('play').textContent = '▶ さいせい'; speechSynthesis?.cancel(); }

$('play').onclick = () => (playing ? stop() : start());
$('prev').onclick = () => go(i - 1);
$('next').onclick = () => go(i + 1);
$('voice').onclick = () => {
  speak = !speak;
  $('voice').classList.toggle('on', speak);
  $('voice').textContent = speak ? '🔊 ナレーション' : '🔇 字幕だけ';
  if (!speak) speechSynthesis?.cancel(); else if (playing) say(cuts[i].text);
};
function setLength(which) {
  const was = playing; stop();
  cuts = which === 'five' ? DATA.five : DATA.full;
  $('len10').classList.toggle('on', which !== 'five');
  $('len5').classList.toggle('on', which === 'five');
  buildChapters(); go(0, false);
  if (was) start();
}
$('len10').onclick = () => setLength('full');
$('len5').onclick = () => setLength('five');

function buildChapters() {
  $('chapters').replaceChildren(...cuts.map((c, n) => {
    const at = cuts.slice(0, n).reduce((s, x) => s + x.sec, 0);
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.innerHTML = `<em>${mmss(at)}</em><span>${c.title}</span>`;
    b.onclick = () => go(n);
    li.append(b);
    return li;
  }));
}

speechSynthesis?.getVoices();
speechSynthesis && (speechSynthesis.onvoiceschanged = () => {});
buildChapters(); go(0, false);
setInterval(tick, 100);
</script></body></html>
"""


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    title, cuts = load()
    print(f"{title} — {len(cuts)} カット")
    build_player(title, cuts)
    build_script(title, cuts)
    if what == "player":
        return
    if not os.path.exists(FFMPEG):
        print(f"  (no ffmpeg at {FFMPEG} — 動画は作れません)")
        return
    build_video(title, cuts, False, "uspeak-tour-10min.webm")
    build_video(title, cuts, True, "uspeak-tour-5min.webm")


if __name__ == "__main__":
    main()

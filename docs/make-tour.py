#!/usr/bin/env python3
"""紹介動画を作る。台本は docs/tour-cuts.json ひとつだけ。

    python3 docs/make-tour.py            # 全部（10分ほど）
    python3 docs/make-tour.py player     # docs/tour.html だけ（速い）

出るもの:
  docs/uspeak-tour-10min.mp4     ナレーション入り・字幕焼き込み（H.264 + AAC）
  docs/uspeak-tour-5min.mp4      同・簡潔版
  docs/tour.html                 章立てから飛べるプレーヤー（上の mp4 を再生する）
  docs/tour-script.md            台本（読み上げの実測秒数つき）

**声は端末の中で作る。** 日本語の読み上げは pyopenjtalk（Open JTalk）。**外に何も
送らない** — この環境からは読み上げサービスへ出られないし、出せたとしても台本を
外部へ渡す理由がない。声は合成なので、人の声に差し替えたいときは tour-script.md を
読んで録り、docs/.tour-voice/ の wav を同じ名前で置き換えれば、そのまま組み直せる。

**尺は台本に書かない。読み上げた実測から決める。** 1カットの長さ＝その文を読み終える
のにかかった時間＋間（TAIL）。音と絵が必ず合うし、文を足せば自動で伸びる。

ffmpeg は imageio-ffmpeg（H.264 と AAC が入っている完全版）。同梱の Playwright 版は
映像だけのビルドで mp4 を書けない。
"""
import hashlib
import json
import math
import shutil
import subprocess
import sys
import wave
from pathlib import Path

DOCS = Path(__file__).resolve().parent
FIGS = DOCS / "figures"
CLIPS = DOCS / "clips"
VOICE = DOCS / ".tour-voice"          # 読み上げた wav の置き場（.gitignore 済み）


def ffmpeg_bin():
    """H.264 と AAC が書ける ffmpeg。"""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        raise SystemExit("pip install imageio-ffmpeg （mp4 を書くのに要ります）")


FFMPEG = ffmpeg_bin()
FONT_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

# 読み上げの速さ。1.0 で1秒5.2文字ほど。1.1 は「落ち着いて、でも間延びしない」あたり。
SPEED = 1.1
TAIL = 1.3      # 読み終わってから次のカットへ移るまでの間
FLOOR = 6.0     # どんなに短い文でも、絵がこれだけは映る
FPS = 10

INK = (26, 42, 36)
CREAM = (244, 241, 227)
DEEP = (12, 42, 36)
GREEN = (23, 63, 56)
GOLD = (232, 195, 104)
MINT = (116, 195, 154)


def load():
    data = json.loads((DOCS / "tour-cuts.json").read_text(encoding="utf-8"))
    return data["title"], data["cuts"]


SR = 48000          # pyopenjtalk が返す標本化周波数


def narrate(text):
    """その一文を読み上げた wav を返す（中身が同じなら作り直さない）。

    Open JTalk の合成は1文あたり0.3秒ほどだが、33カット×2版を毎回やると待たされるし、
    絵だけ直したいときにも音が作り直される。文をそのまま鍵にして残しておく。
    """
    VOICE.mkdir(exist_ok=True)
    key = hashlib.sha1(f"{SPEED}\n{text}".encode("utf-8")).hexdigest()[:16]
    path = VOICE / f"{key}.wav"
    if not path.exists():
        import numpy as np
        import pyopenjtalk
        x, sr = pyopenjtalk.tts(text, speed=SPEED)
        assert sr == SR, sr
        with wave.open(str(path), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
            w.writeframes(np.clip(x, -32768, 32767).astype("<i2").tobytes())
    with wave.open(str(path)) as w:
        return path, w.getnframes() / w.getframerate()


def plan(cuts, short=False):
    """カットの一覧に、読む文・読み上げた声・長さを足して返す。

    **長さは読み上げの実測から決める。** 文字数から見積もると、数字や英語の混じった文で
    必ずずれる（「1,501問」は4文字ぶんの時間では読めない）。読ませてから測れば合う。
    """
    out, t = [], 0.0
    for c in cuts:
        if short and not c.get("in5", True):
            continue
        text = (c.get("short") or c["ja"]) if short else c["ja"]
        wav, spoken = narrate(text)
        # 絵の長さは fps の整数倍に丸める。音もあとで同じ長さに詰めるので、33カット
        # 積み上げても音と絵がずれない。
        frames = max(round(FLOOR * FPS), math.ceil((spoken + TAIL) * FPS))
        sec = frames / FPS
        row = {
            "chapter": c["chapter"], "fig": c["fig"], "title": c["title"],
            "text": text, "sec": round(sec, 2), "at": round(t, 2),
            "wav": str(wav), "spoken": round(spoken, 2), "frames": frames,
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


def build_audio(rows, out_wav):
    """カットの声をつないで、1本の wav にする。

    各カットは絵と**同じ長さ**に詰める（読み終わったぶんは無音）。コマ数から出した
    長さに合わせるので、最後まで音と絵がずれない。
    """
    with wave.open(str(out_wav), "wb") as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(SR)
        for r in rows:
            want = int(round(r["frames"] / FPS * SR))
            with wave.open(r["wav"]) as w:
                pcm = w.readframes(w.getnframes())
            pcm = pcm[: want * 2] + b"\x00\x00" * max(0, want - len(pcm) // 2)
            out.writeframes(pcm)


def build_video(title, cuts, short, out_name, fps=FPS, size=(1280, 720)):
    from PIL import Image, ImageDraw, ImageFont
    rows, total = plan(cuts, short)
    W, H = size
    BAND = 230   # 帯の高さ。見出し（40px）と字幕2行が触れない最小がこれ
    f_title = ImageFont.truetype(FONT_BOLD, 40, index=0)
    f_chap = ImageFont.truetype(FONT_BOLD, 20, index=0)
    f_sub = ImageFont.truetype(FONT_REG, 27, index=0)
    f_foot = ImageFont.truetype(FONT_REG, 18, index=0)

    # 声を先に1本にまとめてから、絵と一緒に包む。
    track = DOCS / ".tour-track.wav"
    build_audio(rows, track)
    proc = subprocess.Popen(
        # 絵は JPEG で流し込む（PNG より速く、画質は字幕が読める程度に十分）。
        # `-` ではなく `pipe:0`：ビルドによっては `-` の解決に失敗する。
        [FFMPEG, "-y", "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", str(fps), "-i", "pipe:0",
         "-i", str(track),
         "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p",
         "-profile:v", "high", "-level", "4.0", "-movflags", "+faststart",
         "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
         "-shortest", str(DOCS / out_name)],
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
        frames = r["frames"]
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
    code = proc.wait()
    track.unlink(missing_ok=True)
    if code != 0:
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
  video{width:100%;aspect-ratio:16/9;background:#000;border-radius:14px;display:block;
        box-shadow:0 20px 60px #0008}
  .controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0 6px}
  button{font:inherit;color:inherit;background:#1d4239;border:1px solid var(--rule);
         border-radius:11px;padding:10px 16px;cursor:pointer}
  button:hover{border-color:var(--mint)}
  button.on{background:var(--gold);color:#22372f;border-color:var(--gold);font-weight:700}
  a.dl{margin-left:auto;color:var(--mint);font-size:13px}
  .note{color:#8fa79b;font-size:12px;line-height:1.8;margin:10px 0 18px}
  .note b{color:var(--cream)}
  h2.now{font-size:15px;margin:16px 0 8px;color:var(--gold);letter-spacing:1px}
  ol.chapters{list-style:none;margin:0;padding:0;display:grid;
              grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
  ol.chapters li button{width:100%;text-align:left;display:flex;gap:10px;align-items:baseline;
                        background:#12332c;padding:9px 12px}
  ol.chapters li button.now{background:#1f4a3c;border-color:var(--mint);color:var(--cream)}
  ol.chapters em{font-style:normal;color:#89a496;font-size:11px;font-variant-numeric:tabular-nums;flex:none}
  ol.chapters span{font-size:13px}
</style></head><body><div class="wrap">
<header><h1>__TITLE__</h1><small>U-SPEAK LAB</small></header>

<video id="v" controls playsinline preload="metadata" src="uspeak-tour-10min.mp4"></video>

<div class="controls">
  <button id="len10" class="on">10分版（__LEN_FULL__）</button>
  <button id="len5">5分版（__LEN_FIVE__）</button>
  <a class="dl" id="dl" href="uspeak-tour-10min.mp4" download>⤓ この動画をダウンロード</a>
</div>

<p class="note">
  ナレーションと字幕は<b>動画に入っています</b>。そのまま再生してください。
  下の章立てを押すと、その場面へ飛びます。
  <b>mp4 なので、PowerPoint に貼っても、メールで送っても、そのまま再生できます。</b>
</p>

<h2 class="now" id="now"></h2>
<ol class="chapters" id="chapters"></ol>
</div>
<script>
const DATA = __DATA__;
let cuts = DATA.full;
const $ = (id) => document.getElementById(id);
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function buildChapters() {
  $('chapters').replaceChildren(...cuts.map((c, n) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.innerHTML = `<em>${mmss(c.at)}</em><span>${c.title}</span>`;
    b.onclick = () => { $('v').currentTime = c.at + 0.05; follow(); $('v').play?.(); };
    li.append(b);
    return li;
  }));
}

// いま流れている場面を光らせる。動画の中の字幕と、下の一覧が同じところを指す。
function follow() {
  const t = $('v').currentTime;
  let i = 0;
  while (i + 1 < cuts.length && cuts[i + 1].at <= t) i += 1;
  $('now').textContent = `${cuts[i].chapter} ・ ${cuts[i].title}`;
  [...$('chapters').children].forEach((li, n) => li.firstChild.classList.toggle('now', n === i));
}

function setLength(which) {
  const five = which === 'five';
  cuts = five ? DATA.five : DATA.full;
  const src = five ? 'uspeak-tour-5min.mp4' : 'uspeak-tour-10min.mp4';
  $('v').src = src; $('dl').href = src;
  $('len10').classList.toggle('on', !five);
  $('len5').classList.toggle('on', five);
  buildChapters(); follow();
}
$('len10').onclick = () => setLength('full');
$('len5').onclick = () => setLength('five');
$('v').addEventListener('timeupdate', follow);

buildChapters(); follow();
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
    build_video(title, cuts, False, "uspeak-tour-10min.mp4")
    build_video(title, cuts, True, "uspeak-tour-5min.mp4")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""教室さま向けの解説動画を作る。**ナレーションなし・字幕だけ。**

    python3 docs/make-infra-video.py

出るもの:
  docs/uspeak-infra-video.mp4    字幕焼き込み（H.264・無音の音声トラックつき）
  docs/uspeak-infra-video.srt    同じ字幕。あとで別の字幕に差し替えたいとき用
  docs/infra-video-script.md     台本（カットと秒数の一覧）

台本は `docs/infra-cuts.json` ひとつだけ。**直すのはそちら。**

**声を入れない前提で作ってある。** `make-tour.py`（ナレーション入りの紹介動画）とは
考えかたが3つ違う：

1. **尺は「読む速さ」から決める。** あちらは読み上げた実測秒数で決めていたが、
   こちらには音が無い。日本語の字幕は**1秒に5文字**くらいが、絵も見ながら読める上限。
   そこに固定の間を足し、短い文にも下限を置く。
2. **字幕が本文。** 声が運んでくれないので、字幕は帯の主役にする（大きく・2行まで）。
   あちらより帯が高いのはそのため。
3. **見てほしいところを切り出す。** 声があれば「右下の…」と言えるが、無いので
   **その部分だけを大きく映す**（`crop`）。画面写真は縦に長いので、全体を出すと
   何も読めない。

**無音のトラックを1本入れてある。** 音が無い mp4 は、端末や SNS の再生機で
「壊れている」と扱われることがある（音量つまみが消える・変換で落ちる）。
ナレーションを足したくなったら、この無音を差し替えるだけで済む。
"""
import json
import math
import subprocess
from pathlib import Path

DOCS = Path(__file__).resolve().parent
FIGS = DOCS / "figures"


def ffmpeg_bin():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        raise SystemExit("pip install imageio-ffmpeg （mp4 を書くのに要ります）")


FFMPEG = ffmpeg_bin()
FONT_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

FPS = 12
W, H = 1280, 720
BAND = 260          # 帯の高さ。見出し（38px）と字幕2行（34px）が触れない最小
STAGE = H - BAND

# 読む速さ。**1秒に5文字**。放送の字幕はもう少し遅い（4文字前後）が、ここは
# 止められる資料なので、待たされない側に寄せてある。
CPS = 5.0
PAD = 1.7           # 読み終わってから次のカットへ移るまでの間
FLOOR = 4.2         # どんなに短い文でも、これだけは映る

INK = (26, 42, 36)
CREAM = (244, 241, 227)
DEEP = (12, 42, 36)
GREEN = (23, 63, 56)
GOLD = (232, 195, 104)
MINT = (116, 195, 154)
SUBFG = (222, 232, 221)


def load():
    data = json.loads((DOCS / "infra-cuts.json").read_text(encoding="utf-8"))
    return data["title"], data["cuts"]


def seconds_for(text):
    """その字幕を読むのにかかる秒数（フレーム数に丸める前）。"""
    return max(FLOOR, len(text) / CPS + PAD)


def plan(cuts):
    out, t = [], 0.0
    for c in cuts:
        frames = math.ceil(seconds_for(c["text"]) * FPS)
        row = dict(c)
        row.update(at=round(t, 2), sec=round(frames / FPS, 2), frames=frames)
        out.append(row)
        t += frames / FPS
    return out, t


# ---- 文字組み ---------------------------------------------------------------------

def wrap(draw, text, font, width):
    """日本語は単語で折れないので、1文字ずつ入るところまで詰める。"""
    lines, line = [], ""
    # 英数字のひとかたまりは途中で折らない（「Excel」が「Exc / el」になった）。
    import re as _re
    units = _re.findall(r"[A-Za-z0-9][A-Za-z0-9.\-]*|\n|.", text)
    for ch in units:
        if ch == "\n":
            lines.append(line); line = ""; continue
        trial = line + ch
        if draw.textlength(trial, font=font) > width and line:
            if ch in "、。」）・":          # 行頭に置けない約物は前の行に残す
                lines.append(trial); line = ""
                continue
            lines.append(line); line = ch
        else:
            line = trial
    if line:
        lines.append(line)
    return lines


def chunks(draw, text, font, width, maxlines=2):
    """字幕を2行ずつに割る。**声が無いぶん、1枚に詰め込まない。**"""
    parts, cur = [], ""
    for piece in [p + "。" for p in text.split("。") if p]:
        trial = cur + piece
        if cur and len(wrap(draw, trial, font, width)) > maxlines:
            parts.append(cur); cur = piece
        else:
            cur = trial
    if cur:
        parts.append(cur)
    return parts


# ---- 絵 -------------------------------------------------------------------------

def stage_image(row):
    """そのカットで映すところを、画面写真から切り出して返す（拡大はまだしない）。

    **画面写真は縦に長い。** 全体を出すと文字が読めないので、読ませたいところだけを
    `crop` で切る。
    """
    from PIL import Image
    src = Image.open(FIGS / f"{row['fig']}.jpg").convert("RGB")
    x, y, w, h = row.get("crop", [0, 0, 1, 1])
    box = (int(src.width * x), int(src.height * y),
           int(src.width * (x + w)), int(src.height * (y + h)))
    return src.crop(box)


def card_frame(row, base, fonts):
    """写真のないカット（章の変わり目）。**言い切りを大きく1枚。**"""
    from PIL import ImageDraw
    f_card, f_note = fonts
    frame = base.copy()
    d = ImageDraw.Draw(frame)
    lines = str(row["card"]).split("\n")
    total = len(lines) * 62
    top = (STAGE - total) // 2 - (14 if row.get("sub") else 0)
    for i, line in enumerate(lines):
        w = d.textlength(line, font=f_card)
        d.text(((W - w) / 2, top + i * 62), line, font=f_card, fill=CREAM)
    if row.get("sub"):
        for i, line in enumerate(wrap(d, row["sub"], f_note, W - 260)[:2]):
            w = d.textlength(line, font=f_note)
            d.text(((W - w) / 2, top + total + 16 + i * 30), line, font=f_note, fill=MINT)
    return frame


# ---- 組み立て ---------------------------------------------------------------------

def build(title, rows, total, out_name):
    from PIL import Image, ImageDraw, ImageFont
    f_title = ImageFont.truetype(FONT_BOLD, 38, index=0)
    f_chap = ImageFont.truetype(FONT_BOLD, 19, index=0)
    f_sub = ImageFont.truetype(FONT_BOLD, 34, index=0)      # 字幕が本文なので太く
    f_card = ImageFont.truetype(FONT_BOLD, 50, index=0)
    f_note = ImageFont.truetype(FONT_REG, 22, index=0)
    f_foot = ImageFont.truetype(FONT_REG, 17, index=0)

    proc = subprocess.Popen(
        [FFMPEG, "-y",
         "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", str(FPS), "-i", "pipe:0",
         # **無音を1本入れる。** 音の無い mp4 を「壊れている」と扱う再生機がある。
         "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
         "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
         "-profile:v", "high", "-level", "4.0", "-movflags", "+faststart",
         "-c:a", "aac", "-b:a", "64k", "-shortest", str(DOCS / out_name)],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    band = Image.new("RGBA", (W, BAND), (*DEEP, 236))
    card_base = Image.new("RGB", (W, STAGE), GREEN)
    ruler = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    done = 0
    for row in rows:
        frames = row["frames"]
        big = None if row.get("card") else stage_image(row)
        # 字幕は文字数の割合で切り替える。
        parts = chunks(ruler, row["text"], f_sub, W - 120)
        spans, at = [], 0
        for p in parts:
            n = max(1, round(frames * len(p) / len(row["text"])))
            spans.append((at, at + n, wrap(ruler, p, f_sub, W - 120)))
            at += n
        spans[-1] = (spans[-1][0], frames + 1, spans[-1][2])

        for f in range(frames):
            k = f / max(1, frames - 1)
            ease = 0.5 - 0.5 * math.cos(math.pi * k)
            frame = Image.new("RGB", (W, H), GREEN)
            if big is None:
                frame.paste(card_frame(row, card_base, (f_card, f_note)), (0, 0))
            else:
                # ゆっくり寄る（1.00 → 1.06）。**動かしすぎない** — 読ませる絵なので、
                # 目で追わせると字が読めない。
                # **切らずに、まるごと入れる**（contain）。ステージを覆う入れかた（cover）
                # にすると、横に長い切り抜き——「5かげつ つづいてるよ」の帯のような——は
                # 左右がごっそり画面の外に出る。**指さす代わりに切り抜いているのに、
                # その切り抜きが切れては意味がない**（実際に一度そうなった）。
                # 余る側には帯と同じ色を敷く。
                z = 1.0 + 0.03 * ease          # ごくゆっくり寄る。読ませる絵なので動かしすぎない
                fit = min(W / big.width, STAGE / big.height) * z
                iw, ih = max(1, int(big.width * fit)), max(1, int(big.height * fit))
                shot = big.resize((iw, ih), Image.LANCZOS)
                frame.paste(shot, ((W - iw) // 2, (STAGE - ih) // 2))
                # 画面写真だと分かるように、細い縁を引く（背景と同じ色の写真があるため）。
                ed = ImageDraw.Draw(frame)
                ed.rectangle([(W - iw) // 2, (STAGE - ih) // 2,
                              (W - iw) // 2 + iw - 1, (STAGE - ih) // 2 + ih - 1],
                             outline=(70, 96, 86), width=2)
            frame.paste(band, (0, STAGE), band)
            d = ImageDraw.Draw(frame)
            d.line([(0, STAGE), (W, STAGE)], fill=GOLD, width=3)
            d.text((60, STAGE + 20), row["chapter"], font=f_chap, fill=MINT)
            d.text((60, STAGE + 44), row["title"], font=f_title, fill=CREAM)
            lines = next(ln for a, b, ln in spans if a <= f < b)
            for n, line in enumerate(lines[:2]):
                d.text((60, STAGE + 108 + n * 46), line, font=f_sub, fill=SUBFG)
            here = (row["at"] + f / FPS) / total
            d.rectangle([0, H - 6, W, H], fill=(40, 60, 54))
            d.rectangle([0, H - 6, int(W * here), H], fill=GOLD)
            d.text((W - 160, STAGE + 20), "U-Speak Lab", font=f_foot, fill=(140, 170, 155))
            frame.save(proc.stdin, "JPEG", quality=92, subsampling=0)
            done += 1
        print(f"    {row['title']}  ({done} frames)", end="\r")

    proc.stdin.close()
    err = proc.stderr.read().decode("utf-8", "replace")
    if proc.wait() != 0:
        raise SystemExit("ffmpeg failed:\n" + err[-2000:])
    mb = (DOCS / out_name).stat().st_size / 1e6
    print(f"  docs/{out_name}  {int(total) // 60}分{int(total) % 60}秒 ・ {done} frames ・ {mb:.1f} MB")


# ---- 字幕ファイルと台本 -------------------------------------------------------------

def stamp(sec):
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(rows, out_name):
    """焼き込みと**同じ字幕**を、別ファイルにも出しておく。

    焼き込んだ字幕は直せない。訳を足したい・言い回しを変えたいときのために、
    同じものを外に出す（動画はそのまま、字幕だけ差し替えられる）。
    """
    from PIL import ImageDraw, ImageFont, Image
    ruler = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    f_sub = ImageFont.truetype(FONT_BOLD, 34, index=0)
    out, n = [], 0
    for row in rows:
        parts = chunks(ruler, row["text"], f_sub, W - 120)
        at = row["at"]
        for p in parts:
            dur = row["sec"] * len(p) / len(row["text"])
            n += 1
            out += [str(n), f"{stamp(at)} --> {stamp(at + dur)}",
                    "\n".join(wrap(ruler, p, f_sub, W - 120)[:2]), ""]
            at += dur
    (DOCS / out_name).write_text("\n".join(out), encoding="utf-8")
    print(f"  docs/{out_name}  {n} 枚")


def build_script(title, rows, total, out_name):
    lines = [f"# {title} — 解説動画（ナレーションなし・字幕）", "",
             "`docs/infra-cuts.json` から生成しています。**直すのは JSON のほうです。**", "",
             f"全 {int(total) // 60}分{int(total) % 60}秒 ・ {len(rows)}カット ・ "
             f"字幕は1秒{CPS:.0f}文字で読める長さに割ってあります。", ""]
    chapter = None
    for r in rows:
        if r["chapter"] != chapter:
            chapter = r["chapter"]
            lines += ["", f"## {chapter}", ""]
        where = f"図 `figures/{r['fig']}.jpg`" if r.get("fig") else "文字だけのカット"
        lines += [f"**{int(r['at']) // 60}:{int(r['at']) % 60:02d}  {r['title']}**　"
                  f"<sub>{r['sec']}秒 ・ {where}</sub>", "", f"> {r['text']}", ""]
    (DOCS / out_name).write_text("\n".join(lines), encoding="utf-8")
    print(f"  docs/{out_name}")


if __name__ == "__main__":
    title, cuts = load()
    rows, total = plan(cuts)
    print(f"{title} — {len(rows)}カット {int(total) // 60}分{int(total) % 60}秒")
    build_srt(rows, "uspeak-infra-video.srt")
    build_script(title, rows, total, "infra-video-script.md")
    build(title, rows, total, "uspeak-infra-video.mp4")

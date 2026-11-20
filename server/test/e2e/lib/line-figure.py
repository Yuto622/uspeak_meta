"""capture-line-report.mjs の 画像を、紹介動画の 図（1280×800）に ならべる。"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

src, out = Path(sys.argv[1]), Path(sys.argv[2])
BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
DEEP, CREAM, MINT, GOLD = (12, 42, 36), (244, 241, 227), (116, 195, 154), (232, 195, 104)


def fit(im, h):
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def phone(img, h=740):
    """スマホの 画面の わくに 入れる（どの アプリかは 書かない）。"""
    body = fit(img, h - 60)
    W = body.width + 36
    ph = Image.new("RGB", (W, h), (30, 30, 30))
    d = ImageDraw.Draw(ph)
    d.rounded_rectangle([0, 0, W - 1, h - 1], 36, fill=(24, 24, 24))
    ph.paste(body, (18, 40))
    d.rounded_rectangle([W // 2 - 40, 14, W // 2 + 40, 22], 4, fill=(60, 60, 60))
    return ph


def text(d, xy, s, size, fill, bold=False, width=520):
    f = ImageFont.truetype(BOLD if bold else REG, size, index=0)
    x, y = xy
    line = ""
    for ch in s:
        if ch == "\n" or d.textlength(line + ch, font=f) > width:
            d.text((x, y), line, font=f, fill=fill); y += size + 10; line = "" if ch == "\n" else ch
        else:
            line += ch
    if line:
        d.text((x, y), line, font=f, fill=fill); y += size + 10
    return y


# 1 まいめ：毎週 とどく 画像（スマホの 中）と 吹き出しの 文
wk = Image.open(src / "weekly.png").convert("RGB")
canvas = Image.new("RGB", (1280, 800), DEEP)
ph = phone(wk)
canvas.paste(ph, (70, 30))
d = ImageDraw.Draw(canvas)
x = 70 + ph.width + 60
y = text(d, (x, 70), "毎週、保護者の LINE に とどく", 34, GOLD, True, 1280 - x - 50)
y = text(d, (x, y + 10), "1 まいの 画像（1040×1300）と、PDF・文の 吹き出し", 22, MINT, False, 1280 - x - 50)
import re
# 絵文字は この フォントに ないので 消す（LINE の 中では 出る）。
bubble = "".join(ch for ch in (src / "bubble.txt").read_text(encoding="utf-8")
                 if ord(ch) < 0x2300 or 0x3000 <= ord(ch) < 0xFE00 or 0xFF00 <= ord(ch) < 0xFFF0)
bubble = "\n".join(l.strip() for l in bubble.splitlines()).strip()
if bubble:
    d.rounded_rectangle([x, y + 30, 1230, y + 30 + 40 + 34 * (bubble.count("\n") + 3)], 22, fill=(244, 241, 227))
    text(d, (x + 24, y + 50), bubble, 22, (30, 40, 36), False, 1230 - x - 48)
canvas.save(out / "tour-line-weekly.jpg", quality=88)

# 2 まいめ：月に 1 回の PDF（1 ページめ）
mo = Image.open(src / "monthly.png").convert("RGB")
canvas = Image.new("RGB", (1280, 800), DEEP)
page = fit(mo, 760)
canvas.paste(page, (70, 20))
d = ImageDraw.Draw(canvas)
x = 70 + page.width + 60
y = text(d, (x, 80), "月に 1 回は A4 の PDF", 34, GOLD, True, 1280 - x - 50)
text(d, (x, y + 10), "はじめた ころと いまの くらべ・覚えた 単語・よんだ 本・先生の ひとこと。印刷して 面談にも つかえます。", 22, CREAM, False, 1280 - x - 50)
canvas.save(out / "tour-line-monthly.jpg", quality=88)

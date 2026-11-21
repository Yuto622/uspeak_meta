#!/usr/bin/env python3
"""紹介動画を作る。台本は docs/tour-cuts.json ひとつだけ。

    python3 docs/make-tour.py            # 全部（15分ほど）
    python3 docs/make-tour.py player     # docs/tour.html だけ（速い）
    python3 docs/make-tour.py full       # 通し（もくじ＋章を つなぐ）だけ

出るもの:
  docs/tour/digest.mp4           1分少しの まとめ（digest の 文が ある カットだけ）
  docs/tour/ch-01.mp4 …          章ごとの 動画（1〜3分。ナレーション入り・字幕焼き込み・H.264 + AAC）
  docs/tour/full.mp4             通し：はじめに もくじ（何分から 何の 章か）＋ 章を つないだ もの。mp4 の チャプター入り
  docs/tour/toc.txt              通しの もくじ（メール・説明欄に はる 文）
  docs/tour.html                 えらんで 見る プレーヤー（まとめ → 見たい 章だけ）
  docs/tour-script.md            台本（読み上げの実測秒数つき）

**なぜ 章ごとに 分けるか。** 1 本の 長い 動画は 見られない（Wistia の 1,300 万本の 集計：
1 分を こえると 見られる 割合が 下がり、5〜10 分の 動画は はじめの 数秒で 17% が 去る）。
そして 見る 人ごとに 知りたい ところが ちがう（オーナーは 記録と 運用、先生は 宿題と 英検）。
だから さいしょに 1 分少しの まとめで ぜんたいを 見せ、あとは 見たい 章だけを 選んで 見る
（Mayer の segmenting principle：見る 人が 区切りを 進める 形の ほうが よく 伝わる）。

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


# 台本は 2 つ：Web 版（tour-cuts.json → tour/・tour.html）と Roblox 版（tour-roblox-cuts.json → tour-roblox/・tour-roblox.html）。
#   python3 docs/make-tour.py [all|player|full] [--script tour-roblox-cuts.json]
SCRIPT = "tour-cuts.json"
if "--script" in sys.argv:
    SCRIPT = sys.argv[sys.argv.index("--script") + 1]
    del sys.argv[sys.argv.index("--script"):sys.argv.index("--script") + 2]
_meta = json.loads((DOCS / SCRIPT).read_text(encoding="utf-8"))
NAME = _meta.get("out", "tour")                       # 動画の フォルダ（docs/<NAME>/）
PAGE = _meta.get("page", "tour.html")                 # プレーヤー
SCRIPT_MD = _meta.get("script_md", "tour-script.md")  # 台本
OUT = DOCS / NAME


def load():
    data = json.loads((DOCS / SCRIPT).read_text(encoding="utf-8"))
    return data["title"], data["cuts"], data.get("chapters", {})


def chapter_names(cuts):
    names = []
    for c in cuts:
        if c["chapter"] not in names:
            names.append(c["chapter"])
    return names


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


def plan(cuts, mode="full"):
    """カットの一覧に、読む文・読み上げた声・長さを足して返す。

    **長さは読み上げの実測から決める。** 文字数から見積もると、数字や英語の混じった文で
    必ずずれる（「1,501問」は4文字ぶんの時間では読めない）。読ませてから測れば合う。
    """
    out, t = [], 0.0
    for c in cuts:
        if mode == "digest":
            if not c.get("digest"):
                continue
            text = c["digest"]
        else:
            if mode != "full" and c["chapter"] != mode:
                continue
            text = c["ja"]
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
            if c.get("to"):   # ここまでで 止める（となりの 場面まで 流さない。足りない ぶんは さいごの こまで 待つ）
                row["to"] = c["to"]
        out.append(row)
        t += sec
    return out, t


# ---- プレーヤー -----------------------------------------------------------------

def mmss(s):
    return f"{int(s) // 60}:{int(s) % 60:02d}"


def build_player(title, cuts, meta):
    digest, td = plan(cuts, "digest")
    toc_row, toc = toc_plan(cuts)
    chapters, total = [], 0.0
    for n, name in enumerate(chapter_names(cuts), 1):
        rows, sec = plan(cuts, name)
        m = meta.get(name, {})
        chapters.append({
            "n": n, "name": name, "lead": m.get("lead", ""), "for": m.get("for", []),
            "file": f"{NAME}/ch-{n:02d}.mp4", "sec": round(sec, 1), "thumb": f"figures/{rows[0]['fig']}.jpg",
            "cuts": [{"title": r["title"], "at": r["at"]} for r in rows],
        })
        total += sec
    full_total = total + toc_row["sec"]
    payload = json.dumps({"digest": {"file": f"{NAME}/digest.mp4", "sec": round(td, 1),
                                      "cuts": [{"title": r["title"], "at": r["at"]} for r in digest]},
                          "chapters": chapters, "full": {"file": f"{NAME}/full.mp4", "sec": round(full_total, 1), "toc": toc}},
                         ensure_ascii=False)
    html = PLAYER.replace("__DATA__", payload).replace("__TITLE__", title)
    (DOCS / PAGE).write_text(html, encoding="utf-8")
    print(f"  docs/{PAGE}          まとめ {mmss(td)} ・ {len(chapters)} 章 ・ ぜんぶで {mmss(total)}")


# ---- 収録用の台本 ---------------------------------------------------------------

def build_script(title, cuts):
    lines = [f"# {title} — ナレーション台本", "",
             f"`docs/{SCRIPT}` から生成しています。**直すのは JSON のほうです。**", "",
             "秒数は1分およそ336文字で読んだときの目安です。", ""]
    for name, mode in (("まとめ", "digest"), ("章ごと（通し）", "full")):
        rows, total = plan(cuts, mode)
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
    (DOCS / SCRIPT_MD).write_text("\n".join(lines), encoding="utf-8")
    print(f"  docs/{SCRIPT_MD}")


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


def build_video(rows, total, out_path, fps=FPS, size=(1280, 720)):
    """rows（plan の 出力）を 1 本の mp4 に する。下の 進みぐあいの 線は この 1 本の 中での 位置。"""
    from PIL import Image, ImageDraw, ImageFont
    base = rows[0]["at"]
    W, H = size
    BAND = 176   # 帯の高さ（見出し 32px と 字幕 2 行）。写真を 大きく 見せるため 低め
    f_title = ImageFont.truetype(FONT_BOLD, 32, index=0)
    f_chap = ImageFont.truetype(FONT_BOLD, 18, index=0)
    f_sub = ImageFont.truetype(FONT_REG, 24, index=0)
    f_foot = ImageFont.truetype(FONT_REG, 18, index=0)

    # 声を先に1本にまとめてから、絵と一緒に包む。
    # **音は 入れない**（字幕だけ・2026-11 に「音は いらない」と 言われた）。台本の "audio": true で 声を もどせる。
    # 長さは いままでどおり 読み上げの 実測で 決める（字幕を 読みおえる 時間の めやすに なる）。
    track = DOCS / ".tour-track.wav"
    voice = bool(_meta.get("audio", False))
    if voice:
        build_audio(rows, track)
    proc = subprocess.Popen(
        # 絵は JPEG で流し込む（PNG より速く、画質は字幕が読める程度に十分）。
        # `-` ではなく `pipe:0`：ビルドによっては `-` の解決に失敗する。
        [FFMPEG, "-y", "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", str(fps), "-i", "pipe:0",
         *(["-i", str(track)] if voice else []),
         "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p",
         "-profile:v", "high", "-level", "4.0", "-movflags", "+faststart",
         *(["-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", "-shortest"] if voice else ["-an"]),
         str(out_path)],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    # 帯は毎フレーム同じなので一度だけ作る
    band = Image.new("RGBA", (W, BAND), (*DEEP, 232))
    ruler = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    scratch = DOCS / ".tour-frames"
    done = 0
    for i, r in enumerate(rows):
        shots = clip_frames(r["clip"], r["from"], min(r["sec"], r["to"] - r["from"]) if r.get("to") else r["sec"], fps, H - BAND, scratch) if r.get("clip") else None
        src = toc_image(r["toc"], W, H - BAND) if r.get("toc") else Image.open(FIGS / f"{r['fig']}.jpg").convert("RGB")
        # 写真は帯の上ぜんぶ。
        #
        # **横に寄せず、縦にゆっくり流す。** 元は 1280x800 の画面写真で、ここは 1280x490。
        # 拡大して横に振ると4割が永久に画面の外に出る — BLOCKWILD の回は「写真の下のバーに
        # き しか入っていない」と言っている最中に、そのバーが切れて写らなかった。
        # 横幅ぴったりに合わせて（文字の大きさは原寸のまま）、上から下へ流せば、
        # そのカットの間に写真のすみずみが一度は映る。
        # **写真は 動かさない**（2026-11：「上下に スライド しなくて いい・最初から 固定で 全画面」）。
        # 帯の 上に 写真の ぜんたいが 入る 大きさで、まんなかに 置く（どこも 切らない）。
        stage_h = H - BAND
        scale = min(W / src.width, stage_h / src.height)
        big = src.resize((round(src.width * scale), round(src.height * scale)), Image.LANCZOS)
        still = Image.new("RGB", (W, stage_h), DEEP)
        still.paste(big, ((W - big.width) // 2, (stage_h - big.height) // 2))
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
                frame.paste(still, (0, 0))
            frame.paste(band, (0, H - BAND), band)
            d = ImageDraw.Draw(frame)
            d.line([(0, H - BAND), (W, H - BAND)], fill=GOLD, width=3)
            d.text((48, H - BAND + 14), r["chapter"], font=f_chap, fill=MINT)
            d.text((48, H - BAND + 36), r["title"], font=f_title, fill=CREAM)
            for n, line in enumerate(lines[:2]):
                d.text((48, H - 92 + n * 34), line, font=f_sub, fill=(214, 226, 214))
            # 進みぐあい
            at = (r["at"] - base + f / fps) / total
            d.rectangle([0, H - 6, W, H], fill=(255, 255, 255, 30))
            d.rectangle([0, H - 6, int(W * at), H], fill=GOLD)
            d.text((W - 150, H - BAND + 12), "U-Speak Lab", font=f_foot, fill=(140, 170, 155))
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
    mb = out_path.stat().st_size / 1e6
    print(f"  {out_path.relative_to(DOCS.parent)}  {mmss(total)} ・ {done} frames ・ {mb:.1f} MB          ")


KANJI = "〇一二三四五六七八九十"


def toc_text(n):
    num = KANJI[n] if n <= 10 else f"十{KANJI[n - 10]}" if n < 20 else str(n)
    return (f"この動画の もくじです。{num}つの章に分かれています。"
            "見たいところがあれば、その時間まで飛ばしてご覧ください。もちろん、最初から通してご覧いただけます。")


def toc_plan(cuts):
    """通しの 頭に つける もくじの カットと、各章が 通しの 何秒から はじまるか。

    熱心な お客さまは 全部 見る。全部 見る 人にも「いま どこで、あと 何が あるか」と
    「ここだけ 見たい」を 最初に 渡す（YouTube の 説明欄の 目次と 同じ 考え）。
    """
    text = toc_text(len(chapter_names(cuts)))
    wav, spoken = narrate(text)
    frames = max(round(FLOOR * FPS), math.ceil((spoken + TAIL) * FPS))
    at = frames / FPS
    toc = []
    for n, name in enumerate(chapter_names(cuts), 1):
        _, sec = plan(cuts, name)
        toc.append({"n": n, "name": name, "at": round(at, 1)})
        at += sec
    row = {"chapter": "もくじ", "fig": "", "title": "この動画の もくじ", "text": text, "sec": frames / FPS,
           "at": 0.0, "wav": str(wav), "spoken": spoken, "frames": frames, "toc": toc}
    return row, toc


def toc_image(toc, W, Hs):
    """もくじの 絵（帯の 上ぜんぶ）。2 れつ。"""
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new("RGB", (W, Hs), GREEN)
    d = ImageDraw.Draw(im)
    f_h = ImageFont.truetype(FONT_BOLD, 30, index=0)
    f_t = ImageFont.truetype(FONT_BOLD, 26, index=0)
    f_n = ImageFont.truetype(FONT_REG, 26, index=0)
    d.text((56, 30), "もくじ", font=f_h, fill=GOLD)
    half = (len(toc) + 1) // 2
    for i, c in enumerate(toc):
        x = 56 + (i // half) * (W // 2)
        y = 92 + (i % half) * 76
        d.text((x, y), mmss(c["at"]), font=f_t, fill=MINT)
        d.text((x + 92, y), f"{c['n']}. {c['name']}", font=f_n, fill=CREAM)
    return im


def toc_lines(toc, total):
    return [f"{mmss(c['at'])} {c['n']}. {c['name']}" for c in toc] + [f"（ぜんぶで {mmss(total)}）"]


def build_full(cuts):
    """通し＝もくじ ＋ 章の mp4 を そのまま つなぐ（章は 作りなおさない）。mp4 の チャプターも 入れる。"""
    row, toc = toc_plan(cuts)
    build_video([row], row["sec"], OUT / ".toc.mp4")
    names = chapter_names(cuts)
    parts = [OUT / ".toc.mp4"] + [OUT / f"ch-{n:02d}.mp4" for n in range(1, len(names) + 1)]
    listing = OUT / ".concat.txt"
    listing.write_text("".join(f"file '{p.name}'\n" for p in parts), encoding="utf-8")
    total = toc[-1]["at"] + plan(cuts, names[-1])[1]
    # mp4 の チャプターは 場面ごと。ffmpeg は 1 つが 90 秒を こえる チャプターを 正しく 書けない
    # （時刻が 0 に つぶれる）ので、章 まるごとでは なく 場面（30 秒まで）で 区切る。
    marks, num = [(0.0, "もくじ")], {c["name"]: c["n"] for c in toc}
    rows, _ = plan(cuts, "full")
    for k, r in enumerate(rows):
        first = k == 0 or rows[k - 1]["chapter"] != r["chapter"]
        n = num[r["chapter"]]
        marks.append((row["sec"] + r["at"], f"{n}. {r['chapter']} ― {r['title']}" if first else f"{n}. {r['title']}"))
    meta = [";FFMETADATA1"]
    for k, (a, name) in enumerate(marks):
        b = marks[k + 1][0] if k + 1 < len(marks) else total
        meta += ["[CHAPTER]", "TIMEBASE=1/1000", f"START={int(a * 1000)}", f"END={int(b * 1000)}", f"title={name}"]
    meta_file = OUT / ".chapters.txt"
    meta_file.write_text("\n".join(meta) + "\n", encoding="utf-8")
    # つなぐ のと チャプターを 入れる のは 分ける（concat の 入力に チャプターを 足すと 時刻が くずれた）。
    joined = OUT / ".joined.mp4"
    code = subprocess.run([FFMPEG, "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
                           "-map", "0:v", "-map", "0:a?", "-c", "copy", str(joined)]).returncode
    if code == 0:
        code = subprocess.run([FFMPEG, "-y", "-v", "error", "-i", str(joined), "-f", "ffmetadata", "-i", str(meta_file),
                               "-map", "0:v", "-map", "0:a?", "-map_metadata", "1", "-map_chapters", "1",
                               "-c", "copy", "-movflags", "+faststart", str(OUT / "full.mp4")]).returncode
    for f in (listing, meta_file, joined, OUT / ".toc.mp4"):
        f.unlink(missing_ok=True)
    if code != 0:
        raise SystemExit("ffmpeg concat failed")
    (OUT / "toc.txt").write_text(f"{_meta['title']}（通し）もくじ\n" + "\n".join(toc_lines(toc, total)) + "\n",
                                 encoding="utf-8")
    print(f"  docs/{NAME}/full.mp4  {mmss(total)} ・ {(OUT / 'full.mp4').stat().st_size / 1e6:.1f} MB ・ もくじ docs/{NAME}/toc.txt")


def build_videos(cuts):
    """まとめ・章ごと・通し。"""
    OUT.mkdir(exist_ok=True)
    rows, total = plan(cuts, "digest")
    build_video(rows, total, OUT / "digest.mp4")
    for n, name in enumerate(chapter_names(cuts), 1):
        rows, total = plan(cuts, name)
        build_video(rows, total, OUT / f"ch-{n:02d}.mp4")
    build_full(cuts)


PLAYER = r"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
  :root{--deep:#0c2a24;--panel:#12332c;--card:#163a32;--cream:#f4f1e3;--gold:#e8c368;--mint:#74c39a;--rule:#2c4a43;--dim:#93ab9f}
  *{box-sizing:border-box}
  body{margin:0;background:var(--deep);color:var(--cream);
       font-family:"Noto Sans JP","Hiragino Sans","Yu Gothic",system-ui,sans-serif}
  .wrap{max-width:1180px;margin:0 auto;padding:18px 16px 48px}
  .top{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:12px}
  .top h1{font-size:19px;margin:0;letter-spacing:1px}
  .top small{color:var(--mint);font-size:12px;letter-spacing:2px}
  .stage{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}
  @media (max-width:900px){.stage{grid-template-columns:1fr}}
  .screen{position:relative}
  video{width:100%;aspect-ratio:16/9;background:#000;border-radius:14px;display:block;box-shadow:0 20px 60px #0008}
  .next{position:absolute;inset:auto 14px 60px auto;display:none;background:#0c2a24ee;border:1px solid var(--gold);
        border-radius:14px;padding:12px 14px;max-width:320px}
  .next.show{display:block}
  .next p{margin:0 0 8px;font-size:12px;color:var(--dim)}
  .next b{display:block;font-size:15px;margin-bottom:10px}
  .playing{margin:12px 0 4px;font-size:13px;color:var(--mint);letter-spacing:1px}
  .playing strong{display:block;color:var(--cream);font-size:18px;letter-spacing:0;margin-top:2px}
  button{font:inherit;color:inherit;background:#1d4239;border:1px solid var(--rule);border-radius:11px;
         padding:9px 14px;cursor:pointer}
  button:hover{border-color:var(--mint)}
  button.gold{background:var(--gold);color:#22372f;border-color:var(--gold);font-weight:700}
  .side{background:var(--panel);border:1px solid var(--rule);border-radius:14px;padding:14px}
  .side h2{font-size:13px;margin:0 0 8px;color:var(--gold);letter-spacing:1px}
  .scenes{list-style:none;margin:0;padding:0;display:grid;gap:4px;max-height:320px;overflow:auto}
  .scenes button{width:100%;text-align:left;display:flex;gap:10px;align-items:baseline;background:transparent;
                 border-color:transparent;padding:6px 8px;font-size:13px}
  .scenes button.now{background:#1f4a3c;border-color:var(--mint)}
  .scenes em{font-style:normal;color:var(--dim);font-size:11px;font-variant-numeric:tabular-nums;flex:none}
  .side .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  .side a{color:var(--mint);font-size:13px}
  h2.sec{font-size:17px;margin:30px 0 4px}
  .hint{color:var(--dim);font-size:13px;margin:0 0 12px;line-height:1.7}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
  .chips button{border-radius:999px;padding:7px 14px;font-size:13px}
  .chips button.on{background:var(--mint);color:#0c2a24;border-color:var(--mint);font-weight:700}
  .grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
  .card{display:flex;flex-direction:column;width:100%;height:100%;padding:0;text-align:left;overflow:hidden;
        background:var(--card);border-radius:14px}
  .card.now{border-color:var(--gold);box-shadow:0 0 0 2px var(--gold) inset}
  .card.dim{opacity:.38}
  .thumb{position:relative;aspect-ratio:16/10;background:#000 center/cover no-repeat}
  .thumb .len{position:absolute;right:8px;bottom:8px;background:#000c;border-radius:6px;padding:2px 7px;font-size:12px;
              font-variant-numeric:tabular-nums}
  .thumb .num{position:absolute;left:8px;top:8px;background:var(--gold);color:#22372f;border-radius:6px;padding:2px 8px;
              font-size:12px;font-weight:700}
  .thumb .seen{position:absolute;right:8px;top:8px;background:var(--mint);color:#0c2a24;border-radius:6px;padding:2px 7px;
               font-size:12px;font-weight:700;display:none}
  .card.watched .seen{display:block}
  .body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px;flex:1}
  .body b{font-size:15px}
  .body span{font-size:13px;color:var(--dim);line-height:1.6}
  .tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}
  .tags i{font-style:normal;font-size:11px;border:1px solid var(--rule);border-radius:999px;padding:1px 8px;color:var(--mint)}
  .toc{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:6px}
  .toc button{width:100%;text-align:left;display:flex;gap:12px;align-items:baseline;background:var(--panel)}
  .toc em{font-style:normal;color:var(--mint);font-variant-numeric:tabular-nums;flex:none;font-weight:700}
  .foot{margin-top:28px;color:var(--dim);font-size:12px;line-height:1.8}
  .foot a{color:var(--mint)}
</style></head><body><div class="wrap">
<div class="top"><h1>__TITLE__</h1><small>U-SPEAK LAB</small></div>

<div class="stage">
  <div class="screen">
    <video id="v" controls playsinline preload="metadata"></video>
    <div class="next" id="next"><p id="nextlabel">つぎの章</p><b id="nexttitle"></b>
      <button class="gold" id="nextgo">▶ つづけて見る</button></div>
    <div class="playing" id="playing"></div>
  </div>
  <aside class="side">
    <h2>この動画の場面</h2>
    <ol class="scenes" id="scenes"></ol>
    <div class="row">
      <button id="digest">▶ まとめを見る</button>
      <button id="all">▶ ぜんぶ通しで</button>
    </div>
    <div class="row"><a id="dl" download>⤓ いま見ている動画をダウンロード</a></div>
  </aside>
</div>

<h2 class="sec">見たいところだけ選ぶ</h2>
<p class="hint">章ごとに1〜3分の動画です。押すと上で再生します。見おわった章には ✓ がつきます。</p>
<div class="chips" id="chips"></div>
<ul class="grid" id="grid"></ul>

<h2 class="sec">ぜんぶ見る方へ ・ 通しの1本のもくじ</h2>
<p class="hint">通しの動画は、最初に このもくじが出ます。時間を押すと、そこから再生します。</p>
<ol class="toc" id="toc"></ol>
<div class="row" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
  <button id="playfull" class="gold">▶ 通しの1本を最初から</button>
  <button id="copytoc">もくじをコピー（メール用）</button>
  <a id="fulldl" download style="color:var(--mint);font-size:13px;align-self:center">⤓ 通しの1本をダウンロード</a>
</div>

<p class="foot">字幕は動画に入っています（音はありません）。mp4 なので、PowerPoint に貼っても、メールで送ってもそのまま再生できます。
通しの1本には動画のチャプターも入っているので、対応するプレーヤー（QuickTime・VLC など）では章を選んで飛べます。</p>
</div>
<script>
const DATA = __DATA__;
const $ = (id) => document.getElementById(id);
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KEY = 'uspeak-tour-seen-v1';
let seen = new Set();
try { seen = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { /* なくても 動く */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...seen])); } catch { /* */ } };

let now = null;        // { kind: 'digest' | 'chapter', i }
let through = false;   // ぜんぶ通し（章を つづけて 自動で）
let filter = 'all';

function load(kind, i, play = true) {
  now = { kind, i };
  const item = kind === 'digest' ? DATA.digest : DATA.chapters[i];
  $('v').src = item.file; $('dl').href = item.file;
  $('playing').innerHTML = kind === 'digest'
    ? `まずはここから<strong>ぜんたいのまとめ（${mmss(item.sec)}）</strong>`
    : `${through ? 'ぜんぶ通し ・ ' : ''}${item.n} / ${DATA.chapters.length} 章<strong>${esc(item.name)}（${mmss(item.sec)}）</strong>`;
  $('scenes').replaceChildren(...item.cuts.map((c) => {
    const li = document.createElement('li'); const b = document.createElement('button');
    b.innerHTML = `<em>${mmss(c.at - item.cuts[0].at)}</em><span>${esc(c.title)}</span>`;
    b.onclick = () => { $('v').currentTime = c.at - item.cuts[0].at + 0.05; $('v').play?.(); };
    li.append(b); return li;
  }));
  $('next').classList.remove('show');
  paintGrid(); follow();
  if (play) $('v').play?.().catch(() => {});
}

function follow() {
  if (!now) return;
  const item = now.kind === 'digest' ? DATA.digest : DATA.chapters[now.i];
  const t = $('v').currentTime + item.cuts[0].at;
  let k = 0;
  while (k + 1 < item.cuts.length && item.cuts[k + 1].at <= t) k += 1;
  [...$('scenes').children].forEach((li, n) => li.firstChild.classList.toggle('now', n === k));
}

function nextChapter() {
  if (now.kind === 'digest') return 0;
  return now.i + 1 < DATA.chapters.length ? now.i + 1 : -1;
}

$('v').addEventListener('timeupdate', follow);
$('v').addEventListener('ended', () => {
  if (!now) return;
  if (now.kind === 'chapter') { seen.add(DATA.chapters[now.i].n); save(); paintGrid(); }
  const n = nextChapter();
  if (n < 0) { through = false; return; }
  if (through) { load('chapter', n); return; }
  $('nextlabel').textContent = now.kind === 'digest' ? 'くわしく見るなら、1章から（下から選ぶこともできます）' : 'つぎの章';
  $('nexttitle').textContent = `${DATA.chapters[n].n}. ${DATA.chapters[n].name}（${mmss(DATA.chapters[n].sec)}）`;
  $('nextgo').onclick = () => load('chapter', n);
  $('next').classList.add('show');
});

function paintGrid() {
  $('grid').replaceChildren(...DATA.chapters.map((c, i) => {
    const li = document.createElement('li'); const b = document.createElement('button');
    const match = filter === 'all' || c.for.includes(filter);
    b.className = `card${seen.has(c.n) ? ' watched' : ''}${now && now.kind === 'chapter' && now.i === i ? ' now' : ''}${match ? '' : ' dim'}`;
    b.innerHTML = `<div class="thumb" style="background-image:url('${c.thumb}')"><span class="num">${c.n}</span>`
      + `<span class="seen">✓ 見た</span><span class="len">${mmss(c.sec)}</span></div>`
      + `<div class="body"><b>${esc(c.name)}</b><span>${esc(c.lead)}</span>`
      + `<div class="tags">${c.for.map((f) => `<i>${esc(f)}</i>`).join('')}</div></div>`;
    b.onclick = () => { through = false; load('chapter', i); $('v').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    li.append(b); return li;
  }));
}

function paintChips() {
  const all = [...new Set(DATA.chapters.flatMap((c) => c.for))];
  $('chips').replaceChildren(...['all', ...all].map((f) => {
    const b = document.createElement('button');
    b.textContent = f === 'all' ? 'すべて' : `${f}むけ`;
    b.className = filter === f ? 'on' : '';
    b.onclick = () => { filter = f; paintChips(); paintGrid(); };
    return b;
  }));
}

$('digest').onclick = () => { through = false; load('digest', 0); };
$('all').onclick = () => { through = true; load('chapter', 0); };
function playFull(at) {
  through = false; now = null;
  $('v').src = DATA.full.file; $('dl').href = DATA.full.file;
  $('playing').innerHTML = `通しの1本<strong>はじめから おわりまで（${mmss(DATA.full.sec)}）</strong>`;
  $('scenes').replaceChildren(...DATA.full.toc.map((c) => {
    const li = document.createElement('li'); const b = document.createElement('button');
    b.innerHTML = `<em>${mmss(c.at)}</em><span>${c.n}. ${esc(c.name)}</span>`;
    b.onclick = () => playFull(c.at);
    li.append(b); return li;
  }));
  $('next').classList.remove('show'); paintGrid();
  const go = () => { $('v').currentTime = at; $('v').play?.().catch(() => {}); };
  if ($('v').readyState >= 1) go(); else $('v').addEventListener('loadedmetadata', go, { once: true });
  $('v').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
const tocText = () => [`${document.title}（通し）もくじ`,
  ...DATA.full.toc.map((c) => `${mmss(c.at)} ${c.n}. ${c.name}`), `（ぜんぶで ${mmss(DATA.full.sec)}）`].join('\n');
$('toc').replaceChildren(...DATA.full.toc.map((c) => {
  const li = document.createElement('li'); const b = document.createElement('button');
  b.innerHTML = `<em>${mmss(c.at)}</em><span>${c.n}. ${esc(c.name)}</span>`;
  b.onclick = () => playFull(c.at);
  li.append(b); return li;
}));
$('playfull').onclick = () => playFull(0);
$('copytoc').onclick = async () => {
  try { await navigator.clipboard.writeText(tocText()); $('copytoc').textContent = 'コピーしました'; }
  catch { prompt('もくじ', tocText()); }
};
$('fulldl').href = DATA.full.file;
$('fulldl').textContent = `⤓ 通しの1本をダウンロード（${mmss(DATA.full.sec)}）`;
paintChips();
load('digest', 0, false);
</script></body></html>
"""


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    title, cuts, meta = load()
    print(f"{title} — {len(cuts)} カット")
    build_player(title, cuts, meta)
    build_script(title, cuts)
    if what == "player":
        return
    if what == "ch":          # 章を えらんで 作る：make-tour.py ch 2,3,4（digest も 書ける）
        OUT.mkdir(exist_ok=True)
        names = chapter_names(cuts)
        for part in sys.argv[2].split(","):
            if part == "digest":
                rows, total = plan(cuts, "digest"); build_video(rows, total, OUT / "digest.mp4"); continue
            n = int(part); rows, total = plan(cuts, names[n - 1]); build_video(rows, total, OUT / f"ch-{n:02d}.mp4")
        return
    if what == "full":        # 章は そのまま、もくじと 通しだけ
        build_full(cuts)
        return
    build_videos(cuts)


if __name__ == "__main__":
    main()

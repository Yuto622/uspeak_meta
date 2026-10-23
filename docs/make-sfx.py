#!/usr/bin/env python3
"""正解・不正解の 効果音（client/dist/assets/sfx/correct.mp3・wrong.mp3）を 作る。

**木の 鍵盤（マリンバ）を 物理モデルで 鳴らした 音。** 前の uisfx「glass」は
ガラスの 合成音で「おかしい」「不自然」と 言われたので、本物の 楽器の しくみで 作りなおした。
外の 音素材は つかって いない（この スクリプトが 音の 出どころ。権利は U-Speak Lab）。

しくみ：
- 鍵盤の 音は 倍音が 1・3.93・9.24 倍（マリンバの 調律）。高い 倍音ほど 早く 消える。
- マレット（ばち）が 当たる 一瞬は、やわらかい パルス＋ごく短い ノイズ。
- 下の 共鳴管が 基音を すこし 長く のばす。
- 小さい 部屋の 残響（0.35 秒）を うすく かける。

正解：ソ → ド（上がる 2 音）＋ 上の オクターブを うすく。「できた！」の 明るい 音。
不正解：ミ → ド（下がる 2 音・低め・短め）。こわくない、やわらかい 木の 音。

Run: python3 docs/make-sfx.py   （ffmpeg が いる）
"""
import hashlib
import json
import pathlib
import subprocess
import tempfile
import wave

import numpy as np

SR = 48000
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'client' / 'dist' / 'assets' / 'sfx'
rng = np.random.default_rng(622)  # いつも 同じ 音に なるように


def note_hz(name):
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    n = names[name[0]] + 12 * (int(name[-1]) + 1)
    return 440.0 * 2 ** ((n - 69) / 12)


def bar(freq, length, *, hard=0.5, damp=1.0, vol=1.0):
    """マリンバの 鍵盤 1 本を 1 回 たたいた 音。hard=ばちの かたさ、damp>1 で 早く 消える。"""
    t = np.arange(int(SR * length)) / SR
    # 低い 音ほど 長く 鳴る（実物と 同じ 向き）
    base = 0.42 * (523.25 / freq) ** 0.6 / damp
    partials = [(1.0, 1.0, base), (3.93, 0.32 * hard, base * 0.22), (9.24, 0.10 * hard, base * 0.07)]
    y = np.zeros_like(t)
    for ratio, amp, tau in partials:
        f = freq * ratio
        if f > SR / 2.2:
            continue
        y += amp * np.sin(2 * np.pi * f * t + rng.uniform(0, 0.3)) * np.exp(-t / tau)
    # 共鳴管：基音を すこし おくれて ふくらませる
    y += 0.35 * np.sin(2 * np.pi * freq * t) * (1 - np.exp(-t / 0.012)) * np.exp(-t / (base * 1.4))
    # ばちが 当たる 一瞬（2〜4ms の やわらかい パルス＋ノイズ）
    contact = int(SR * (0.004 - 0.002 * hard))
    pulse = np.zeros_like(t)
    pulse[:contact] = np.sin(np.linspace(0, np.pi, contact)) ** 2
    noise = rng.standard_normal(len(t)) * np.exp(-t / 0.0025)
    noise = np.convolve(noise, np.ones(6) / 6, mode='same')  # 角を とる
    y = y * (1 - np.exp(-t / 0.0015)) + 0.25 * pulse * np.sin(2 * np.pi * freq * 2 * t) + 0.05 * hard * noise
    end = int(SR * 0.03)  # 切れ目で ぷつっと 鳴らない ように
    y[-end:] *= np.linspace(1, 0, end)
    return vol * y


def room(y, *, wet=0.14, length=0.35):
    """小さい 部屋の 残響（指数で 消える ノイズを たたみこむ）。"""
    t = np.arange(int(SR * length)) / SR
    ir = rng.standard_normal(len(t)) * np.exp(-t / (length / 6))
    ir = np.convolve(ir, np.ones(24) / 24, mode='same')  # 高い 音を すこし 丸く
    ir /= np.sqrt(np.sum(ir ** 2))
    rev = np.convolve(y, ir)[: len(y)]
    return (1 - wet) * y + wet * rev


def mix(parts, length):
    out = np.zeros(int(SR * length))
    for at, y in parts:
        i = int(SR * at)
        n = min(len(y), len(out) - i)
        out[i:i + n] += y[:n]
    return out


def finish(y, peak):
    y = room(y)
    fade = int(SR * 0.08)
    y[-fade:] *= np.linspace(1, 0, fade)
    return y / np.max(np.abs(y)) * peak


def write_mp3(y, path):
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = pathlib.Path(tmp) / 'x.wav'
        pcm = (np.clip(y, -1, 1) * 32767).astype('<i2')
        with wave.open(str(wav_path), 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav_path), '-codec:a', 'libmp3lame',
                        '-b:a', '64k', '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '0', str(path)],
                       check=True)


def main():
    g5, c6, c7 = note_hz('G5'), note_hz('C6'), note_hz('C7')
    correct = finish(mix([
        (0.00, bar(g5, 0.9, hard=0.55)),
        (0.10, bar(c6, 1.0, hard=0.6)),
        (0.10, bar(c7, 0.5, hard=0.4, damp=1.6, vol=0.22)),  # 上の オクターブを うすく（きらっと）
    ], 1.05), 0.89)

    e4, c4 = note_hz('E4'), note_hz('C4')
    wrong = finish(mix([
        (0.00, bar(e4, 0.5, hard=0.3, damp=2.2)),
        (0.16, bar(c4, 0.6, hard=0.3, damp=2.0)),
    ], 0.8), 0.62)  # 正解より 小さく

    info = json.loads((OUT / 'SOURCE.json').read_text(encoding='utf-8'))
    for key, y, name in (('correct', correct, 'correct.mp3'), ('wrong', wrong, 'wrong.mp3')):
        path = OUT / name
        write_mp3(y, path)
        data = path.read_bytes()
        info[key].update({'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        print(f'{name}: {len(data)} bytes')
    (OUT / 'SOURCE.json').write_text(json.dumps(info, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()

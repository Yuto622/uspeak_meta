#!/usr/bin/env python3
"""フォニックスの おと（client/dist/assets/phonics/<id>.mp3）を 作る。

もじの「おと」1 つずつ（/s/ /æ/ /k/ …）の 音の ファイル。合成の 声（TTS）は ことばや もじの なまえは
言えるが、おと 1 つだけは 正しく 言えない（"s" は「エス」、"a" は「エイ」に なる）。だから じぶんで 作る。

しくみ（フォルマント合成・Klatt の 考えかた）：
- 声の もと：声帯の 1 回の ひらき＝Rosenberg の パルス（f0 は 子どもに やさしい 高めの 女性の 声 225→195Hz）。
  ほんの すこしの ゆらぎ（jitter）と 息の 音を まぜて、機械っぽさを へらす。
- のどと 口の かたち：共鳴（フォルマント）5 つを 直列に 通す。ぼいんごとの 値は Hillenbrand ほか（1995）の
  アメリカ英語の 女性の 平均。2 つの ぼいんが つながる おと（eɪ aɪ oʊ aʊ）は 値を なめらかに うごかす。
- こすれる おと（s sh f th h）：白い ノイズを その おとの 帯域で しぼる。z v は ノイズ＋声。
- はじける おと（p t k b d g）：しめる → はじける ノイズ（くちびる＝ひくい、はぐき＝たかい、のど＝まんなか）
  → 息（p t k）か みじかい あいまい母音（b d g。声の ある はじける おとは 母音なしでは 聞こえない）。
  フォニックスの 教えかたどおり、「プ」「ブ」の あとの 母音は できるだけ みじかく、よわく。
外の 音素材は つかって いない（この スクリプトが 音の 出どころ。権利は U-Speak Lab）。
本物の 人の 声には かなわない ので、運営が /admin/abc で ろくおん した 声が あれば そちらが 鳴る。

Run: python3 docs/make-phonics.py   （numpy・scipy・ffmpeg が いる）
"""
import hashlib
import json
import math
import pathlib
import subprocess
import tempfile
import wave

import numpy as np
from scipy.signal import butter, sosfilt

SR = 32000
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'client' / 'dist' / 'assets' / 'phonics'
rng = np.random.default_rng(1001)  # いつも 同じ 音に なるように

# ---- ぼいんの かたち（F1 F2 F3。F4 F5 は きまった 値）----------------------------------
V = {
    'ae': (760, 2250, 2980),   # a  apple   （Hillenbrand の /æ/ を すこし ひらく）
    'eh': (731, 2058, 2979),   # e  egg
    'ih': (483, 2365, 3053),   # i  insect
    'aa': (936, 1551, 2815),   # o  octopus（アメリカしきの hot）
    'ah': (753, 1426, 2933),   # u  up
    'iy': (437, 2761, 3372),   # ee
    'uw': (459, 1105, 2735),   # oo
    'ey0': (580, 2400, 3000), 'ey1': (440, 2650, 3150),   # ay
    'ay0': (880, 1450, 2850), 'ay1': (470, 2350, 3050),   # ie（aɪ）
    'ow0': (590, 1100, 2830), 'ow1': (470, 950, 2700),    # oa（oʊ）
    'aw0': (880, 1450, 2850), 'aw1': (490, 1000, 2750),   # ow（aʊ）
    'eh2': (680, 2050, 2950), 'er': (520, 1500, 1800),    # air（ɛər）
    'yy': (300, 2650, 3300),                               # y の はじまり
    'ww': (320, 720, 2350),                                # w の はじまり
    'schwa': (650, 1350, 2850),
}
F45 = (3900, 4700)
BW = (80, 100, 150, 250, 320)


def smooth(x):
    return x * x * (3 - 2 * x)


def envelope(n, attack=0.03, release=0.06):
    e = np.ones(n)
    a = min(n // 2, int(attack * SR))
    r = min(n // 2, int(release * SR))
    if a:
        e[:a] = 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, a))
    if r:
        e[-r:] = 0.5 + 0.5 * np.cos(np.linspace(0, math.pi, r))
    return e


def glottal(n, f0a=225.0, f0b=195.0):
    """声の もと（Rosenberg パルスの 微分）と、ひらいて いる 時の しるし（息の 音を まぜるため）。"""
    t = np.arange(n) / SR
    f0 = np.linspace(f0a, f0b, n)
    f0 *= 1 + 0.006 * np.sin(2 * math.pi * 4.6 * t)                       # かすかな ビブラート
    jit = np.convolve(rng.standard_normal(n), np.ones(160) / 160, 'same')  # ゆっくりした ゆらぎ
    f0 *= 1 + 0.01 * jit
    phase = np.cumsum(f0 / SR) % 1.0
    op, cp = 0.58, 0.14
    g = np.where(phase < op, 0.5 - 0.5 * np.cos(math.pi * phase / op),
                 np.where(phase < op + cp, np.cos(math.pi * (phase - op) / (2 * cp)), 0.0))
    dg = np.diff(g, prepend=0.0)
    opening = (phase < op + cp).astype(float)
    breath = rng.standard_normal(n) * opening * 0.012
    return dg + breath, opening


def resonate(x, freqs, bws):
    """時間で かわる 共鳴 1 つ（Klatt の 2 次の 共鳴器）。freqs・bws は 1 サンプルごとの 配列。"""
    y = np.zeros_like(x)
    y1 = y2 = 0.0
    T = 1.0 / SR
    for i in range(len(x)):
        f = freqs[i]
        bw = bws[i]
        c = -math.exp(-2 * math.pi * bw * T)
        b = 2 * math.exp(-math.pi * bw * T) * math.cos(2 * math.pi * f * T)
        a = 1 - b - c
        v = a * x[i] + b * y1 + c * y2
        y2 = y1
        y1 = v
        y[i] = v
    return y


def track(n, points):
    """[(とき 0〜1, 値), …] を なめらかに つないだ 配列。"""
    xs = np.linspace(0, 1, n)
    out = np.empty(n)
    for i in range(len(points) - 1):
        (t0, v0), (t1, v1) = points[i], points[i + 1]
        m = (xs >= t0) & (xs <= t1)
        u = (xs[m] - t0) / max(t1 - t0, 1e-9)
        out[m] = v0 + (v1 - v0) * smooth(u)
    out[xs < points[0][0]] = points[0][1]
    out[xs > points[-1][0]] = points[-1][1]
    return out


def tract(src, shapes, bw_scale=1.0):
    """声の もとを 口の かたち（時間で かわる）に 通す。shapes＝[(とき, (F1,F2,F3)), …]。"""
    n = len(src)
    y = src
    for k in range(5):
        if k < 3:
            fr = track(n, [(t, s[k]) for t, s in shapes])
        else:
            fr = np.full(n, F45[k - 3])
        y = resonate(y, fr, np.full(n, BW[k] * bw_scale))
    return y


def voiced(dur, shapes, f0=(225, 195), attack=0.03, release=0.07, bw_scale=1.0):
    n = int(dur * SR)
    src, _ = glottal(n, *f0)
    return tract(src, shapes, bw_scale) * envelope(n, attack, release)


def band(x, lo, hi, order=4):
    hi = min(hi, SR / 2 - 200)
    return sosfilt(butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)


def noise(dur):
    return rng.standard_normal(int(dur * SR))


def fric(dur, lo, hi, peak=None, attack=0.05, release=0.08):
    x = band(noise(dur), lo, hi)
    if peak:
        n = len(x)
        x = x * 0.4 + resonate(x, np.full(n, peak[0]), np.full(n, peak[1])) * 3.0
    return x * envelope(len(x), attack, release)


def rms(x):
    return float(np.sqrt(np.mean(x * x)) + 1e-12)


def level(x, target):
    return x * (target / rms(x))


def cat(*parts):
    return np.concatenate([p for p in parts if p is not None and len(p)])


def silence(dur):
    return np.zeros(int(dur * SR))


# ---- はじける おと --------------------------------------------------------------------
PLACE = {   # はじける ノイズの 帯域・つぎの 母音へ 入る ときの F2 の はじまり
    'lab': ((300, 1600), 900),
    'alv': ((3200, 9000), 1750),
    'vel': ((1400, 3200), 2100),
}


def burst(place, amp=1.0, dur=0.012):
    (lo, hi), _ = PLACE[place]
    x = band(noise(dur), lo, hi, 2)
    x *= np.exp(-np.linspace(0, 5, len(x)))
    return level(x, 0.08 * amp)


def aspiration(place, dur=0.07):
    _, f2 = PLACE[place]
    src = noise(dur) * 0.6
    y = tract(src, [(0, (650, f2, 2800)), (1, V['schwa'])], bw_scale=2.2)
    y *= np.exp(-np.linspace(0, 3.2, len(y))) * envelope(len(y), 0.004, 0.02)
    return level(y, 0.03)


def schwa_from(place, dur=0.085, amp=0.045):
    _, f2 = PLACE[place]
    y = voiced(dur, [(0, (350, f2, 2600)), (0.45, V['schwa']), (1, V['schwa'])], attack=0.006, release=0.05)
    return level(y, amp)


def voice_bar(dur=0.045):
    n = int(dur * SR)
    src, _ = glottal(n, 210, 205)
    y = sosfilt(butter(2, 350, 'lowpass', fs=SR, output='sos'), src)
    return level(y * envelope(n, 0.01, 0.005), 0.008)


def stop_voiceless(place):
    return cat(silence(0.03), burst(place), aspiration(place))


def stop_voiced(place):
    return cat(voice_bar(), burst(place, 0.55, 0.008), schwa_from(place))


# ---- 1 つずつの おと ------------------------------------------------------------------
def vowel(name, dur=0.42):
    return level(voiced(dur, [(0, V[name]), (1, V[name])]), 0.09)


def diph(a, b, dur=0.5):
    return level(voiced(dur, [(0, V[a]), (0.28, V[a]), (0.78, V[b]), (1, V[b])], release=0.09), 0.09)


def nasal(f2, f3, dur=0.45):
    n = int(dur * SR)
    src, _ = glottal(n)
    y = resonate(src, np.full(n, 270), np.full(n, 70))
    y = y + 0.18 * resonate(src, np.full(n, f2), np.full(n, 220)) + 0.08 * resonate(src, np.full(n, f3), np.full(n, 300))
    y = sosfilt(butter(2, 2600, 'lowpass', fs=SR, output='sos'), y)
    return level(y * envelope(n, 0.04, 0.08), 0.08)


def glide(start, dur=0.3, amp=0.08):
    y = voiced(dur, [(0, V[start]), (0.3, V[start]), (0.75, V['schwa']), (1, V['schwa'])], release=0.1)
    return level(y, amp)


def voiced_fric(lo, hi, peak=None, dur=0.42):
    n = int(dur * SR)
    src, opening = glottal(n, 220, 200)
    buzz = sosfilt(butter(2, 400, 'lowpass', fs=SR, output='sos'), src)
    hiss = band(rng.standard_normal(n), lo, hi)
    if peak:
        hiss = hiss * 0.4 + resonate(hiss, np.full(n, peak[0]), np.full(n, peak[1])) * 3.0
    hiss *= 0.55 + 0.45 * opening
    y = level(buzz, 0.035) + level(hiss, 0.05)
    return y * envelope(n, 0.05, 0.08)


SH_PEAK = (2700, 700)


def make(pid):
    if pid in ('a', 'e', 'i', 'o', 'u'):
        return vowel({'a': 'ae', 'e': 'eh', 'i': 'ih', 'o': 'aa', 'u': 'ah'}[pid])
    if pid == 'ee':
        return vowel('iy', 0.48)
    if pid == 'oo':
        return vowel('uw', 0.48)
    if pid == 'ay':
        return diph('ey0', 'ey1')
    if pid == 'ie':
        return diph('ay0', 'ay1')
    if pid == 'oa':
        return diph('ow0', 'ow1')
    if pid == 'ow':
        return diph('aw0', 'aw1')
    if pid == 'yoo':
        return level(voiced(0.52, [(0, V['yy']), (0.22, V['yy']), (0.55, V['uw']), (1, V['uw'])], release=0.09), 0.09)
    if pid == 'air':
        return diph('eh2', 'er', 0.55)
    if pid == 's':
        return level(fric(0.42, 4800, 13000, (7000, 2500)), 0.07)
    if pid == 'sh':
        return level(fric(0.42, 1700, 7000, SH_PEAK), 0.075)
    if pid == 'f':
        return level(fric(0.4, 1200, 12000), 0.05)
    if pid == 'th':
        return level(fric(0.4, 2200, 13000), 0.04)
    if pid == 'h':
        y = tract(noise(0.32) * 0.6, [(0, V['schwa']), (1, V['schwa'])], bw_scale=2.4)
        return level(y * envelope(len(y), 0.03, 0.12), 0.04)
    if pid == 'z':
        return voiced_fric(4800, 13000, (7000, 2500))
    if pid == 'v':
        return voiced_fric(1200, 9000)
    if pid == 'm':
        return nasal(1000, 2300)
    if pid == 'n':
        return nasal(1550, 2600)
    if pid == 'ng':
        return nasal(2000, 2750)
    if pid == 'l':
        return level(voiced(0.42, [(0, (360, 1150, 2750)), (1, (360, 1150, 2750))], bw_scale=1.1), 0.085)
    if pid == 'r':
        return level(voiced(0.42, [(0, (430, 1150, 1620)), (1, (430, 1150, 1620))]), 0.085)
    if pid == 'w':
        return glide('ww')
    if pid == 'y':
        return glide('yy')
    if pid == 'p':
        return stop_voiceless('lab')
    if pid == 't':
        return stop_voiceless('alv')
    if pid == 'k':
        return stop_voiceless('vel')
    if pid == 'b':
        return stop_voiced('lab')
    if pid == 'd':
        return stop_voiced('alv')
    if pid == 'g':
        return stop_voiced('vel')
    if pid == 'ch':
        return cat(silence(0.03), burst('alv', 0.7), level(fric(0.2, 1700, 7000, SH_PEAK, attack=0.008, release=0.07), 0.07))
    if pid == 'j':
        zh = voiced_fric(1700, 7000, SH_PEAK, dur=0.11)
        return cat(voice_bar(0.04), burst('alv', 0.4, 0.006), zh, schwa_from('alv', 0.07, 0.035))
    if pid == 'ks':
        return cat(silence(0.03), burst('vel'), aspiration('vel', 0.04), level(fric(0.3, 4800, 13000, (7000, 2500), attack=0.02), 0.065))
    if pid == 'kw':
        return cat(silence(0.03), burst('vel'), aspiration('vel', 0.03), glide('ww', 0.28, 0.075))
    raise KeyError(pid)


IDS = ['s', 'z', 'f', 'v', 'th', 'sh', 'h', 'm', 'n', 'ng', 'l', 'r', 'w', 'y', 'p', 'b', 't', 'd', 'k', 'g', 'ch', 'j', 'ks', 'kw',
       'a', 'e', 'i', 'o', 'u', 'ay', 'ee', 'ie', 'oa', 'oo', 'yoo', 'ow', 'air']


def finish(x):
    x = cat(silence(0.02), x, silence(0.06))
    x = sosfilt(butter(2, 60, 'highpass', fs=SR, output='sos'), x)
    peak = float(np.max(np.abs(x)))
    if peak > 0.89:
        x *= 0.89 / peak
    return x


def write_mp3(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
    with tempfile.TemporaryDirectory() as d:
        wav = pathlib.Path(d) / 'a.wav'
        with wave.open(str(wav), 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-ac', '1', '-ar', str(SR), '-b:a', '64k',
                        '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '0', str(path)], check=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = {}
    for pid in IDS:
        x = finish(make(pid))
        p = OUT / f'{pid}.mp3'
        write_mp3(p, x)
        b = p.read_bytes()
        files[p.name] = {'sha256': hashlib.sha256(b).hexdigest(), 'bytes': len(b), 'seconds': round(len(x) / SR, 3)}
        print(f'{pid:4s} {len(x) / SR:.2f}s {len(b)}B')
    (OUT / 'SOURCE.json').write_text(json.dumps({
        '_': 'フォニックスの おと（もじ 1 つずつの おと）。docs/make-phonics.py が フォルマント合成で 作った U-Speak Lab の 自作の 音（外の 素材なし）。'
             '作りなおしたら この ファイルも かわる。運営が /admin/abc で ろくおん した 声が あれば /phonics/<id> は そちらを かえす。',
        'generator': 'docs/make-phonics.py', 'sampleRate': SR, 'files': files,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


if __name__ == '__main__':
    main()

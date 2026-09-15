#!/usr/bin/env python3
"""「?」のガイドに出す写真を、docs/figures から client/dist/assets/guide へ作る。

**同じ写真を2つの場所で持たない。** 教室に配る PDF（docs/uspeak-guide.pdf）と、
ゲームの中のガイドは、同じ図を見せる。撮り直すのは capture-figures.mjs の1か所だけで、
ここはそれを「画面用の大きさ」に落とすだけの工程。

紙は 1280px 幅・画質92 が要るが、画面のガイドは横 960px もあれば足りない。
**そのままだと1枚 300KB で、40枚で 7MB になる。** 教室の iPad が25台で開くので、
ここは削る。960px・画質78 で 1枚 60〜110KB、ぜんぶで 3MB ほど。
しかも guide.js は**開いているページの写真しか読まない**ので、実際に落ちるのは数枚。

Run: python3 docs/make-guide-images.py
"""
import json
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIGS = ROOT / 'docs' / 'figures'
OUT = ROOT / 'client' / 'dist' / 'assets' / 'guide'
WIDTH = 960
QUALITY = 78

guide = json.loads((ROOT / 'client' / 'dist' / 'guide.json').read_text(encoding='utf-8'))
shots = []
for chapter in guide['chapters']:
    for step in chapter['steps']:
        if step['shot'] not in shots:
            shots.append(step['shot'])

OUT.mkdir(parents=True, exist_ok=True)
missing, total = [], 0
for name in shots:
    src = FIGS / f'{name}.jpg'
    if not src.exists():
        missing.append(name)
        continue
    im = Image.open(src).convert('RGB')
    if im.width > WIDTH:
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    dest = OUT / f'{name}.jpg'
    im.save(dest, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    total += dest.stat().st_size
    print(f'  {name}.jpg  {im.width}x{im.height}  {dest.stat().st_size/1024:.0f}KB')

# ガイドが指していない写真は置いていかない（消したページの写真が残ると、
# 何のために配信しているのか誰にも分からなくなる）。
for old in OUT.glob('*.jpg'):
    if old.stem not in shots:
        old.unlink()
        print(f'  removed {old.name} (guide.json にもう無い)')

print(f'\n{len(shots) - len(missing)}/{len(shots)} 枚, {total/1e6:.2f} MB → {OUT.relative_to(ROOT)}')
if missing:
    print('MISSING (capture-figures.mjs で撮ってください):', ' '.join(missing))
    sys.exit(1)

#!/usr/bin/env python3
"""Roblox Studio の コマンドバー用：1 行ずつ 貼る セットアップを 作る。

コマンドバーは 1 行の 入力らんで、長い 複数行の ファイル（roblox/setup-*-place.lua）を 貼ると こわれる
（2026-11：`Expected <eof>, got 'elseif'`）。そこで、スクリプト 1 本ごとに「1 行だけの Lua」に する：
  ・コメントも 改行も ない。スクリプトの 中身は "…\\n…" と 書いた 1 つの 文字列（改行は \\n）。
  ・さいごの 1 行が 入口（かんばん／本だな）と HTTP。
サーバーには つながない（貼るだけ）。鍵は 入って いない（鍵は Roblox の Secrets から 読む）。
abc-local は Roblox だけで うごく「ABC と おと」：Web に つなぐ Script（USpeakAbc）を はずし、HTTP も Secrets も さわらない。

  python3 scripts/make-roblox-oneline.py     # roblox/oneline/<place>-<n>.txt を 作りなおす
"""
import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = os.path.join(ROOT, 'roblox')
OUT = os.path.join(R, 'oneline')

PLACES = {
    'abc': {'setup': 'setup-abc-place.lua', 'scripts': [
        ('ServerScriptService', 'Script', 'USpeakAbc', 'USpeakAbc.server.luau'),
        ('StarterPlayerScripts', 'LocalScript', 'USpeakAbcClient', 'USpeakAbcClient.client.luau')]},
    'abc-local': {'setup': 'setup-abc-place.lua', 'local': True, 'remove': [('ServerScriptService', 'USpeakAbc')], 'scripts': [
        ('ServerScriptService', 'Script', 'USpeakAbcLocal', 'USpeakAbcLocal.server.luau'),
        ('StarterPlayerScripts', 'LocalScript', 'USpeakAbcClient', 'USpeakAbcClient.client.luau')]},
    'books': {'setup': 'setup-books-place.lua', 'scripts': [
        ('ServerScriptService', 'Script', 'USpeakBooks', 'USpeakBooks.server.luau'),
        ('ServerScriptService', 'Script', 'USpeakWalletSync', 'USpeakWalletSync.server.luau'),
        ('StarterPlayerScripts', 'LocalScript', 'USpeakBooksClient', 'USpeakBooksClient.client.luau')]},
}

def lua_string(src: str) -> str:
    """1 行の Lua の 文字列（" で かこむ）。"""
    out = []
    for ch in src.replace('\r\n', '\n').replace('\r', '\n'):
        if ch == '\\': out.append('\\\\')
        elif ch == '"': out.append('\\"')
        elif ch == '\n': out.append('\\n')
        elif ch == '\t': out.append('\\t')
        elif ord(ch) < 32: out.append('\\%d' % ord(ch))
        else: out.append(ch)
    return '"' + ''.join(out) + '"'

def slim(src: str) -> str:
    """貼る 行を みじかく：行の あたまの 字下げ・空の 行・コメントだけの 行を すてる（うごきは 同じ。複数行の 文字列 [[ ]] が ない ことが 前提）。"""
    assert '[[' not in src and '[=' not in src
    return '\n'.join(x for x in (l.strip() for l in src.replace('\r\n', '\n').split('\n')) if x and not x.startswith('--')) + '\n'

def parent_expr(where: str) -> str:
    return 'game:GetService("ServerScriptService")' if where == 'ServerScriptService' else 'game:GetService("StarterPlayer"):WaitForChild("StarterPlayerScripts")'

def tail_one_line(setup_text: str) -> str:
    """セットアップの「② HTTP」から 下（入口と おしらせ）を 1 行に。コメントの 行は すてる。"""
    i = setup_text.index('-- ② HTTP')
    lines = []
    for raw in setup_text[i:].split('\n'):
        line = raw.strip()
        if not line or line.startswith('--'): continue
        assert '--' not in re.sub(r'"(?:[^"\\]|\\.)*"', '""', line), f'行の とちゅうに コメント: {line}'
        lines.append(line)
    head = 'local CollectionService = game:GetService("CollectionService");'
    return head + ' ' + ' '.join(lines)

def tail_local(setup_text: str) -> str:
    """Roblox だけで うごく 版の さいごの 1 行：入口（かんばん）だけ。HTTP・Secrets・絵の アップロードには ふれない。"""
    a, b = setup_text.index('-- ③'), setup_text.index('-- ④')
    lines = []
    for raw in setup_text[a:b].split('\n'):
        line = raw.strip()
        if not line or line.startswith('--'): continue
        assert '--' not in re.sub(r'"(?:[^"\\]|\\.)*"', '""', line), f'行の とちゅうに コメント: {line}'
        lines.append(line)
    head = 'local CollectionService = game:GetService("CollectionService");'
    done = 'print("✅ できました：「ABC と おと」が この place だけで うごきます。Play を おすと すぐ はじまります。") print("きろくを のこすには File → Publish to Roblox の あと、Game Settings → Security → Enable Studio Access to API Services を オンに します。")'
    return head + ' ' + ' '.join(lines) + ' ' + done

def main():
    os.makedirs(OUT, exist_ok=True)
    for place, spec in PLACES.items():
        n = len(spec['scripts']) + 1
        for k, (where, cls, name, file) in enumerate(spec['scripts'], 1):
            src = open(os.path.join(R, file), encoding='utf8').read()
            if spec.get('local'): src = slim(src)
            gone = ''.join(f'local x={parent_expr(w)}:FindFirstChild("{nm}"); if x then x:Destroy() end; ' for w, nm in spec.get('remove', [])) if k == 1 else ''
            line = (f'{gone}local p={parent_expr(where)}; local o=p:FindFirstChild("{name}"); if o then o:Destroy() end; '
                    f'local s=Instance.new("{cls}"); s.Name="{name}"; s.Source={lua_string(src)}; s.Parent=p; '
                    f'print("✅ {k}/{n} {name} を 入れました")')
            assert '\n' not in line
            open(os.path.join(OUT, f'{place}-{k}.txt'), 'w', encoding='utf8', newline='').write(line)
        tail = (tail_local if spec.get('local') else tail_one_line)(open(os.path.join(R, spec['setup']), encoding='utf8').read())
        assert '\n' not in tail
        open(os.path.join(OUT, f'{place}-{n}.txt'), 'w', encoding='utf8', newline='').write(tail)
        # ぜんぶを 1 行に まとめた 版（1 回 貼るだけ）。名前が ぶつからない ように 1 つずつ do … end で かこむ。
        parts = [open(os.path.join(OUT, f'{place}-{k}.txt'), encoding='utf8').read() for k in range(1, n + 1)]
        allin = ' '.join(f'do {x} end' for x in parts)
        assert '\n' not in allin
        open(os.path.join(OUT, f'{place}-all.txt'), 'w', encoding='utf8', newline='').write(allin)
        print(place, n, 'files +', f'{place}-all.txt', len(allin), 'chars')

if __name__ == '__main__':
    main()

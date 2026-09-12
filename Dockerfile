# U-Speak multiplayer: one image serves the static client and the Colyseus server.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=2567

WORKDIR /app

# Install server dependencies first so the layer is cached across client-only changes.
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund

# 保護者レポートの PDF。LaTeX(XeLaTeX) と日本語フォントで、1枚の紙のために 500MB ほど
# 積むことになるので、既定では入れません。入れると、レポート画面の「デザインされた PDF」
# ボタンがサーバー側で組み上がります（入れなくても .tex は落とせますし、ブラウザーの
# 印刷でも紙にできます）:
#   fly deploy --build-arg WITH_LATEX=1
#
# ここに書いてあるのは Alpine のパッケージ名で、**この構成では未検証です**（開発コンテナで
# 確認したのは Debian/Ubuntu の
#   apt-get install -y --no-install-recommends texlive-xetex texlive-lang-japanese \
#     texlive-lang-chinese fonts-noto-cjk
# のほう）。ビルドが通らないときは、Alpine をやめて node:22-bookworm-slim にして
# 上の apt-get を使うのが確実です。
ARG WITH_LATEX=0
RUN if [ "$WITH_LATEX" = "1" ]; then \
      apk add --no-cache texlive-xetex texmf-dist-langjapanese texmf-dist-langchinese font-noto-cjk; \
    fi

# Client (static, no build step) and server sources.
COPY client ./client
COPY server ./server

# Run as the unprivileged user shipped with the base image.
RUN mkdir -p /app/server/data && chown -R node:node /app
USER node

EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:2567/healthz >/dev/null || exit 1

WORKDIR /app/server
CMD ["node", "src/index.js"]

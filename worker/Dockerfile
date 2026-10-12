# 保護者レポートの TeX worker。TeX Live（XeLaTeX）＋ Noto Sans CJK JP ＋ poppler（pdftoppm）。
# 本体（../Dockerfile）とは 別の イメージ：本体を 軽く 保つため（README「TeX の 実行環境」）。
# Build/deploy from the repo root (the build context must be the whole repo):
#   fly deploy . -c worker/fly.toml --dockerfile worker/Dockerfile
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends texlive-xetex texlive-latex-extra texlive-pictures fonts-noto-cjk poppler-utils fontconfig \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f
WORKDIR /app
# worker は Node だけで 動く（npm の 依存なし）。組む 関数は 本体と 同じ ファイル。
COPY server/src/parent-report/render.js ./server/src/parent-report/render.js
COPY server/worker/render-server.js ./server/worker/render-server.js
RUN echo '{"type":"module"}' > ./server/package.json && useradd -m tex
USER tex
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/worker/render-server.js"]

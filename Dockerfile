# U-Speak multiplayer: one image serves the static client and the Colyseus server.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=2567

WORKDIR /app

# Install server dependencies first so the layer is cached across client-only changes.
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund

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

FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV STARTER_TRANSPORT=http
ENV PORT=3000
ENV SIDEKICK_HOST=0.0.0.0
ENV SIDEKICK_DB_PATH=/data/sidekick.db

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/build ./build

RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "build/index.js"]

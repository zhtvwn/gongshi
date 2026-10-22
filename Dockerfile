# ---- 构建阶段 ----
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --production

# ---- 运行阶段 ----
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY server.js ./
COPY data/ ./data/
COPY public/ ./public/

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

CMD ["node", "server.js"]

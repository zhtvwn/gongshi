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
CMD ["node", "server.js"]

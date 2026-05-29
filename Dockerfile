# 多阶段构建 Dockerfile，适用于 K8S/PaaS 部署

# ================================
# Stage 1: 安装依赖
# ================================
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./

ARG ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm install

# ================================
# Stage 2: 构建应用
# ================================
FROM node:24-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# draw.io 服务地址（必填，替换为公司内网部署的 draw.io 地址）
ARG NEXT_PUBLIC_DRAWIO_BASE_URL=http://10.250.7.49:39033
ENV NEXT_PUBLIC_DRAWIO_BASE_URL=${NEXT_PUBLIC_DRAWIO_BASE_URL}

# 子目录部署路径（如需部署在子路径下，如 /hdraw，否则留空）
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}

# 自托管模式：隐藏赞助/自托管引导文案
ARG NEXT_PUBLIC_SELFHOSTED="true"
ENV NEXT_PUBLIC_SELFHOSTED=${NEXT_PUBLIC_SELFHOSTED}

# 是否显示 About 和 Notice 入口
ARG NEXT_PUBLIC_SHOW_ABOUT_AND_NOTICE=false
ENV NEXT_PUBLIC_SHOW_ABOUT_AND_NOTICE=${NEXT_PUBLIC_SHOW_ABOUT_AND_NOTICE}

RUN npm run build

# ================================
# Stage 3: 生产运行时
# ================================
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 使用非 root 用户运行，符合 K8S 安全规范
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# 端口可通过 K8S ConfigMap/环境变量覆盖，默认 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

# K8S 健康检查（liveness/readiness probe 可直接使用 /api/health 或 /）
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:${PORT}/ || exit 1

CMD ["node", "server.js"]

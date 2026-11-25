FROM node:22-alpine AS deps
WORKDIR /workspace
COPY package.json package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma apps/api/prisma
RUN npm install --workspaces --include-workspace-root

FROM node:22-alpine AS builder
WORKDIR /workspace
COPY --from=deps /workspace/node_modules ./node_modules
COPY package.json package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web apps/web
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL
RUN npm --workspace apps/web run build

FROM node:22-alpine AS runner
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=builder /workspace/apps/web/.next ./apps/web/.next
COPY --from=builder /workspace/apps/web/public ./apps/web/public
COPY package.json ./package.json
COPY apps/api/package.json ./apps/api/package.json
COPY --from=builder /workspace/apps/web/package.json ./apps/web/package.json
COPY apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=deps /workspace/node_modules ./node_modules
EXPOSE 3000
CMD ["npm", "--workspace", "apps/web", "run", "start"]

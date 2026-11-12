FROM node:22-alpine
WORKDIR /workspace
ENV DATABASE_URL=postgresql://stillgood:stillgood_dev_password@db:5432/stillgood?schema=public
COPY package.json package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspaces --include-workspace-root
COPY apps/api apps/api
RUN npm --workspace apps/api run db:generate
WORKDIR /workspace/apps/api
EXPOSE 4000
CMD ["sh", "-c", "npm run db:deploy && npm run db:seed && npm run start"]

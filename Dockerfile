FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm i -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" pnpm prisma:generate
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
RUN npm i -g pnpm
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/dist ./dist
RUN pnpm install --prod --frozen-lockfile
CMD ["node", "dist/src/main.js"]

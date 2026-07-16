# ── Stage 1: Install dependencies ──
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ──
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY . .

# Generate Prisma client inside the container (correct architecture binaries)
RUN cd packages/server && npx prisma generate
# Build server and web (shared has no build step, exports raw .ts)
RUN pnpm build:server && pnpm build:web
# Materialize only the server's production dependency graph for the runtime
# image. Prisma generates its client next to the workspace installation, so
# copy that generated architecture-specific client into the deployed graph.
RUN pnpm --filter @itatti/server deploy --prod /prod/server --legacy \
  && source_client="$(find /app/node_modules/.pnpm -path '*/node_modules/.prisma/client' -type d -print -quit)" \
  && target_client="$(find /prod/server/node_modules/.pnpm -path '*/node_modules/@prisma/client' -type d -print -quit)" \
  && test -n "$source_client" \
  && test -n "$target_client" \
  && target_generated="$(dirname "$(dirname "$target_client")")/.prisma" \
  && mkdir -p "$target_generated" \
  && cp -R "$(dirname "$source_client")/." "$target_generated/"

# ── Stage 3: Production runtime ──
FROM node:22-alpine AS runtime
# The runtime invokes Prisma's checked-in CLI entry point directly, so package
# managers are unnecessary in production. Remove npm/corepack to reduce both
# image size and the package-management supply-chain attack surface.
RUN rm -rf /usr/local/lib/node_modules/npm \
  /usr/local/lib/node_modules/corepack \
  /usr/local/bin/npm \
  /usr/local/bin/npx \
  /usr/local/bin/corepack \
  /usr/local/bin/pnpm \
  /usr/local/bin/pnpx
RUN apk add --no-cache curl
WORKDIR /app

COPY --from=build /prod/server/node_modules ./packages/server/node_modules
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/prisma ./packages/server/prisma
COPY --from=build /app/packages/web/dist ./packages/web/dist
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh
RUN mkdir -p /app/uploads/images && chown -R node:node /app/uploads

ENV NODE_ENV=production
EXPOSE 3000

USER node
ENTRYPOINT ["./docker-entrypoint.sh"]

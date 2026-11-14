# Phoenix Lead Finder — one image used by both the web app and the background worker.
# The full Debian image already contains OpenSSL and CA certificates (needed by Prisma and HTTPS calls).
FROM node:22-bookworm AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npx next build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/worker ./worker
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json /app/next.config.mjs /app/tsconfig.json ./
RUN chown -R node:node /app
USER node
EXPOSE 3000
# Default command = web app (applies pending database migrations, then starts).
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -H 0.0.0.0 -p 3000"]

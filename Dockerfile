# Public demo image for the Recruiting Dashboard.
#
# Runs the app locked to demo mode (DASHBOARD_MODE=demo) on a Node 24 runtime —
# required by the built-in `node:sqlite` driver the DB layer uses. The demo
# store is re-seeded fresh on every container start (see docker-entrypoint.sh),
# so the public demo self-heals after visitors edit it.

FROM node:24-slim

WORKDIR /app

# Install dependencies against the committed lockfile.
COPY package.json package-lock.json ./
RUN npm ci

# App source.
COPY . .

# Demo-only production build. The build seeds a demo store first because the
# root layout reads the DB at module load and fails loud if DASHBOARD_MODE is
# unset — so a migrated + seeded store must exist for `next build` to succeed.
ENV DASHBOARD_MODE=demo
ENV NODE_ENV=production
RUN npm run db:migrate \
 && npm run db:seed:lookups \
 && npm run db:seed:demo \
 && npm run build

EXPOSE 3000

# Re-seed a clean demo store, then start Next on the host-provided port.
ENTRYPOINT ["/bin/sh", "docker-entrypoint.sh"]

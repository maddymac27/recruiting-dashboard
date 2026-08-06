#!/bin/sh
set -e

# Start every boot from a clean, freshly seeded demo store so the public demo
# self-heals after visitors edit it. The seed scripts are not idempotent, so
# the previous file is removed first (WAL/SHM sidecars included).
rm -f data/demo.sqlite data/demo.sqlite-shm data/demo.sqlite-wal
npm run db:migrate
npm run db:seed:lookups
npm run db:seed:demo

# Bind to the host-provided port (Render/Railway inject $PORT); default 3000.
exec npm run start -- --port "${PORT:-3000}" --hostname 0.0.0.0

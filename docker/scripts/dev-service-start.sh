#!/bin/sh
set -e

if [ -z "$1" ]; then
  echo "Usage: dev-service-start.sh <pnpm-filter>" >&2
  exit 1
fi

FILTER="$1"
LOCKFILE="/workspace/pnpm-lock.yaml"
STAMP="/workspace/node_modules/.pnpm-install-stamp"

if [ ! -f "$STAMP" ] || [ "$LOCKFILE" -nt "$STAMP" ]; then
  echo "dev-service-start: running pnpm install (first start or lockfile changed)..."
  corepack pnpm install --frozen-lockfile --store-dir /pnpm/store
  touch "$STAMP"
else
  echo "dev-service-start: skipping pnpm install (dependencies unchanged)."
fi

exec corepack pnpm --filter "$FILTER" dev

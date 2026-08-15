#!/bin/sh
set -eu

pnpm db:migrate
exec node .next/standalone/server.js

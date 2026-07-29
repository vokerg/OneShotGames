#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

find "$project_root/src" "$project_root/scripts" -type f \( -name '*.js' -o -name '*.mjs' \) -print0 |
  while IFS= read -r -d '' file; do
    node --check "$file"
  done

node "$project_root/scripts/verify-task-queue.test.mjs"
node "$project_root/scripts/verify-task-queue.mjs"
node "$project_root/scripts/verify-content-schema.mjs"
node "$project_root/scripts/verify-seeded-random.mjs"
node "$project_root/scripts/verify-architecture.mjs"

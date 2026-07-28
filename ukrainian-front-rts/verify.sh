#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while IFS= read -r -d '' file; do
  node --check "$file"
done < <(find "$project_root/src" "$project_root/scripts" -type f \( -name '*.js' -o -name '*.mjs' \) -print0)

node "$project_root/scripts/verify-architecture.mjs"
node "$project_root/scripts/verify-interactions.mjs"

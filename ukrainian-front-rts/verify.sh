#!/usr/bin/env bash
set -euo pipefail

# Keep this entrypoint LF-only; ukrainian-front-rts/.gitattributes enforces it on checkout.
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$project_root/scripts/run-verification.mjs"
node "$project_root/scripts/release-automation-check.mjs"

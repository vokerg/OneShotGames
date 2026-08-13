#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$project_root/scripts/run-verification.mjs"
node "$project_root/scripts/release-automation-check.mjs"

#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
bash scripts/bootstrap.sh
runtime/node scripts/check.mjs
runtime/node scripts/test.mjs
runtime/node src/install.mjs

#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
bash scripts/bootstrap.sh
runtime/node src/install.mjs "$@"

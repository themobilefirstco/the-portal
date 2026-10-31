#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x runtime/node ]; then echo 'Run setup.command first.'; exit 1; fi
runtime/node src/open.mjs

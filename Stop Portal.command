#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
runtime/node src/install.mjs --stop

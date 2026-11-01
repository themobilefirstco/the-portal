#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

# Help must not download Node or compile the Keychain helper.
for arg in "$@"; do
  if [ "$arg" = "--help" ] || [ "$arg" = "-h" ]; then
    echo 'Usage: setup.command [--non-interactive] [--no-open] [--skip-tests] [--uninstall|--stop]'
    echo 'Non-interactive never opens setup. Google consent and macOS permissions still require a human. Uninstall preserves state and credentials.'
    exit 0
  fi
done

bash scripts/bootstrap.sh
runtime/node src/install.mjs "$@"

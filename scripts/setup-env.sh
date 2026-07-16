#!/usr/bin/env bash
set -euo pipefail

echo "Using Node: $(node --version)"
echo "Using npm: $(npm --version)"

cd "$(git rev-parse --show-toplevel)"

echo "Installing npm dependencies from lockfile..."
npm ci --cache ~/.npm --prefer-offline

echo "Verifying project setup..."
npm run typecheck
npm run build

echo "Environment setup completed successfully."

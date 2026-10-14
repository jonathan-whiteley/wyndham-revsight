#!/bin/zsh
# Run the backend locally against your workspace (uses your CLI profile, not the app's service principal).
#   scripts/run_local.sh          serve the built UI + API on http://localhost:8000
#   scripts/run_local.sh --dev    also start Vite on http://localhost:5173 with hot reload (proxies /api)
set -euo pipefail
source "${0:A:h}/_config.sh"
export DATABRICKS_CONFIG_PROFILE=$DATABRICKS_PROFILE DATABRICKS_WAREHOUSE_ID=$WAREHOUSE_ID

cd "$ROOT/app"
[[ -d frontend/node_modules ]] || (cd frontend && npm install)
if [[ ${1:-} == --dev ]]; then
  (cd frontend && npm run dev) &
  trap 'kill %1 2>/dev/null' EXIT
else
  (cd frontend && npm run build >/dev/null)
fi
uvicorn main:app --reload --port 8000

#!/bin/zsh
# Deploy RevSight IQ: build the UI, stage only runtime files, upload, deploy.
# Stages into a temp dir so .gitignore never drops frontend/dist and no
# package.json/node_modules reaches the app (that triggers a Node build).
#   scripts/deploy.sh            build, upload and deploy
#   scripts/deploy.sh --stage    build and stage only; prints the staging folder (no workspace calls)
set -euo pipefail
source "${0:A:h}/_config.sh"
APP=$ROOT/app
STAGE=$(mktemp -d)
(cd "$APP/frontend" && npm run build >/dev/null)
rsync -a --exclude '__pycache__' "$APP/main.py" "$APP/requirements.txt" "$APP/api" "$APP/services" "$APP/config" "$STAGE/"
mkdir -p "$STAGE/frontend" && rsync -a "$APP/frontend/dist" "$STAGE/frontend/"
# app.yaml gets the catalog and schema from config.env
sed -e "s/\"{{UC_CATALOG}}\"/\"$UC_CATALOG\"/" -e "s/\"{{UC_SCHEMA}}\"/\"$UC_SCHEMA\"/" "$APP/app.yaml" > "$STAGE/app.yaml"
if [[ ${1:-} == --stage ]]; then echo "$STAGE"; exit 0; fi

WS=$(app_path)
databricks workspace delete "$WS" --recursive "${P[@]}" 2>/dev/null || true
databricks workspace mkdirs "$WS" "${P[@]}"
databricks workspace import-dir "$STAGE" "$WS" --overwrite "${P[@]}" >/dev/null
echo "uploaded: $(databricks workspace list "$WS/frontend/dist/assets" "${P[@]}" | grep -o 'index-[A-Za-z0-9_-]*\.js')  local: $(ls "$APP/frontend/dist/assets" | grep '\.js$')"
databricks apps deploy "$APP_NAME" --source-code-path "$WS" "${P[@]}" -o json | python3 -c "import sys,json;d=json.load(sys.stdin);print('deployment', d.get('deployment_id'), d.get('status',{}).get('state'), d.get('status',{}).get('message',''))"
rm -rf "$STAGE"
databricks apps get "$APP_NAME" "${P[@]}" -o json | python3 -c "import sys,json;print('open:', json.load(sys.stdin).get('url'))"

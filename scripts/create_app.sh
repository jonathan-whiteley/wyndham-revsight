#!/bin/zsh
# Create the Databricks App (first run) and set its user authorization scopes. No app resources:
# the app runs as each viewer, so its service principal needs no warehouse or Genie access.
# Re-running also detaches resources an older version bound (warehouse + Genie spaces).
# Run scripts/deploy.sh afterwards.
set -euo pipefail
source "${0:A:h}/_config.sh"
SCOPES=$(<"$ROOT/setup/user_api_scopes.json")
DESC="RevSight IQ: Genie revenue explorer on UC metric views"

if ! databricks apps get "$APP_NAME" "${P[@]}" >/dev/null 2>&1; then
  echo "Creating app $APP_NAME (waits until its compute is ACTIVE, a few minutes)..."
  databricks apps create "${P[@]}" -o json --json "{\"name\": \"$APP_NAME\", \"description\": \"$DESC\", \"user_api_scopes\": $SCOPES}" >/dev/null
fi
# update_mask changes only these fields: scopes on, resources off.
if ! out=$(databricks apps create-update "$APP_NAME" "${P[@]}" -o json --json "{\"update_mask\": \"user_api_scopes,resources\", \"app\": {\"user_api_scopes\": $SCOPES, \"resources\": []}}" 2>&1); then
  echo "$out" >&2
  [[ $out == *passthrough* || $out == *scope* ]] && echo "The workspace may not allow these scopes for apps: $SCOPES. Ask a workspace admin to check Settings > Development > Apps, then re-run." >&2
  exit 1
fi
databricks apps get "$APP_NAME" "${P[@]}" -o json | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('user api scopes:', ', '.join(d.get('user_api_scopes') or []))
print('resources:', ', '.join(r['name'] for r in d.get('resources') or []) or 'none')
print('url:', d.get('url'))"

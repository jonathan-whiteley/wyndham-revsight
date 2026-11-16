#!/bin/zsh
# Create the Databricks App (first run) or re-bind its resources: SQL warehouse + both Genie spaces.
# `apps update` replaces the whole resources list, so this always sends the FULL array.
# Run scripts/deploy.sh afterwards: a deploy is what grants the app's service principal CAN_USE
# on the warehouse and fills the valueFrom env vars in app.yaml.
set -euo pipefail
source "${0:A:h}/_config.sh"
: ${GENIE_SPACE_NT:?run scripts/create_genie_spaces.sh first} ${GENIE_SPACE_STR:?run scripts/create_genie_spaces.sh first}

RESOURCES=$(python3 - <<'PY'
import json, os
print(json.dumps([
    {"name": "sql_warehouse", "sql_warehouse": {"id": os.environ["WAREHOUSE_ID"], "permission": "CAN_USE"}},
    {"name": "genie_space_nt", "genie_space": {"space_id": os.environ["GENIE_SPACE_NT"], "permission": "CAN_RUN"}},
    {"name": "genie_space_str", "genie_space": {"space_id": os.environ["GENIE_SPACE_STR"], "permission": "CAN_RUN"}},
]))
PY
)

# On-behalf-of-user scopes: the app calls Genie and the warehouse as each viewer.
# Sent on every update, since an update without them drops them.
SCOPES='"user_api_scopes": ["sql", "genie"]'
DESC='"description": "RevSight IQ: Genie revenue explorer on UC metric views"'

# apps create/update with the scopes; if user authorization is off in the workspace, again without them.
send() {
  local out
  if ! out=$(databricks "$@" "${P[@]}" -o json --json "{$BODY, $SCOPES}" 2>&1); then
    [[ $out == *passthrough* ]] || { echo "$out" >&2; exit 1; }
    echo "User authorization is off in this workspace; the app will run as its service principal."
    echo "Ask a workspace admin to enable it, then re-run this script."
    databricks "$@" "${P[@]}" -o json --json "{$BODY}" >/dev/null
  fi
}

if databricks apps get "$APP_NAME" "${P[@]}" >/dev/null 2>&1; then
  BODY="\"resources\": $RESOURCES"
  send apps update "$APP_NAME"
  echo "Updated resources on $APP_NAME"
else
  echo "Creating app $APP_NAME (waits until its compute is ACTIVE, a few minutes)..."
  BODY="\"name\": \"$APP_NAME\", $DESC, \"resources\": $RESOURCES"
  send apps create
  echo "Created $APP_NAME"
fi
databricks apps get "$APP_NAME" "${P[@]}" -o json | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('resources:', ', '.join(r['name'] for r in d.get('resources') or []))
print('user api scopes:', ', '.join(d.get('user_api_scopes') or []) or 'none (runs as the service principal)')
print('service principal client id:', d.get('service_principal_client_id'))
print('url:', d.get('url'))"

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

if databricks apps get "$APP_NAME" "${P[@]}" >/dev/null 2>&1; then
  databricks apps update "$APP_NAME" "${P[@]}" -o json --json "{\"resources\": $RESOURCES}" >/dev/null
  echo "Updated resources on $APP_NAME"
else
  echo "Creating app $APP_NAME (waits until its compute is ACTIVE, a few minutes)..."
  databricks apps create "${P[@]}" -o json --json "{\"name\": \"$APP_NAME\", \"description\": \"RevSight IQ: Genie revenue explorer on UC metric views\", \"resources\": $RESOURCES}" >/dev/null
  echo "Created $APP_NAME"
fi
databricks apps get "$APP_NAME" "${P[@]}" -o json | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('resources:', ', '.join(r['name'] for r in d.get('resources') or []))
print('service principal client id:', d.get('service_principal_client_id'))
print('url:', d.get('url'))"

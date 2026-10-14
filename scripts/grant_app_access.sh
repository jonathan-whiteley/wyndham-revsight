#!/bin/zsh
# Give the app's service principal read access to the data and the Genie spaces.
#   - Unity Catalog: USE CATALOG, USE SCHEMA, SELECT on UC_CATALOG.UC_SCHEMA
#   - Genie: CAN_RUN on each space's own ACL (Genie spaces are not covered by app resource grants)
# Needs a user who can GRANT on the schema (owner or MANAGE) and CAN_MANAGE on the Genie spaces.
# If that is not you, send this script and your config.env to your schema owner.
set -euo pipefail
source "${0:A:h}/_config.sh"

SP=$(databricks apps get "$APP_NAME" "${P[@]}" -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['service_principal_client_id'])")
echo "App service principal: $SP"

for stmt in \
  "GRANT USE CATALOG ON CATALOG \`$UC_CATALOG\` TO \`$SP\`" \
  "GRANT USE SCHEMA, SELECT ON SCHEMA \`$UC_CATALOG\`.\`$UC_SCHEMA\` TO \`$SP\`"; do
  echo "  $stmt"
  run_sql "$stmt"
done

for space in "$GENIE_SPACE_NT" "$GENIE_SPACE_STR"; do
  databricks api patch "/api/2.0/permissions/genie/$space" "${P[@]}" \
    --json "{\"access_control_list\": [{\"service_principal_name\": \"$SP\", \"permission_level\": \"CAN_RUN\"}]}" >/dev/null
  echo "  CAN_RUN on Genie space $space"
done
echo "Access granted."

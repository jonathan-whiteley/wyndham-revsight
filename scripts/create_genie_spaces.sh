#!/bin/zsh
# Create the two Genie agents (NT Performance, STR Comp Set) on your metric views.
#   scripts/create_genie_spaces.sh            create NEW spaces, then paste the printed IDs into config.env
#   scripts/create_genie_spaces.sh --update   push the current definitions to the spaces already in config.env
# Definitions live in setup/genie/build_agents.py (instructions, sample questions, example SQL).
set -euo pipefail
source "${0:A:h}/_config.sh"
MODE=${1:-create}

(cd "$ROOT/setup/genie" && python3 build_agents.py)

body() {  # body <agent json> <title> <description> [parent path]
  python3 - "$@" <<'PY'
import json, os, sys
spec, title, desc = open(sys.argv[1]).read(), sys.argv[2], sys.argv[3]
b = {"warehouse_id": os.environ["WAREHOUSE_ID"], "title": title, "description": desc, "serialized_space": spec}
if len(sys.argv) > 4:
    b["parent_path"] = sys.argv[4]
print(json.dumps(b))
PY
}
NT=("$ROOT/setup/genie/nt_agent.json" "Wyndham NT Performance" "Daily occupancy, ADR and RevPAR for Wyndham sites (RevSight IQ)")
STR=("$ROOT/setup/genie/str_agent.json" "Wyndham STR Comp Set" "Weekly comp-set benchmarking: RGI, MPI, ARI (RevSight IQ)")

if [[ $MODE == --update ]]; then
  : ${GENIE_SPACE_NT:?} ${GENIE_SPACE_STR:?}
  databricks genie update-space "$GENIE_SPACE_NT" "${P[@]}" --json "$(body "${NT[@]}")" >/dev/null
  databricks genie update-space "$GENIE_SPACE_STR" "${P[@]}" --json "$(body "${STR[@]}")" >/dev/null
  echo "Updated $GENIE_SPACE_NT and $GENIE_SPACE_STR"
  exit 0
fi

PARENT=$(genie_parent_path)
databricks workspace mkdirs "$PARENT" "${P[@]}"
space_id() { python3 -c "import json,sys;print(json.load(sys.stdin)['space_id'])"; }
NT_ID=$(databricks genie create-space "${P[@]}" -o json --json "$(body "${NT[@]}" "$PARENT")" | space_id)
STR_ID=$(databricks genie create-space "${P[@]}" -o json --json "$(body "${STR[@]}" "$PARENT")" | space_id)
cat <<EOF
Created two Genie spaces in $PARENT. Paste these into config.env:

GENIE_SPACE_NT=$NT_ID
GENIE_SPACE_STR=$STR_ID
EOF

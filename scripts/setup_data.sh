#!/bin/zsh
# Build the synthetic demo data in UC_CATALOG.UC_SCHEMA: runs setup/sql/*.sql in order.
# Creates 7 tables (one is staging) and 2 metric views (556M reservation rows; the reservation step is the slow one).
#   scripts/setup_data.sh                  run everything
#   scripts/setup_data.sh --from 09        resume at a step after a failure
#   scripts/setup_data.sh --render DIR     only write the rendered SQL to DIR (no warehouse calls)
set -euo pipefail
source "${0:A:h}/_config.sh"

FROM=00 RENDER=
while (( $# )); do
  case $1 in
    --from) FROM=$2; shift 2 ;;
    --render) RENDER=$2; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done

render() { sed -e "s/{{catalog}}/$UC_CATALOG/g" -e "s/{{schema}}/$UC_SCHEMA/g" -e "s/{{data_start}}/${DATA_START:-2019-01-01}/g" "$1"; }

for f in "$ROOT"/setup/sql/*.sql; do
  step=${${f:t}[1,2]}
  [[ $step < $FROM ]] && continue
  if [[ -n $RENDER ]]; then
    mkdir -p "$RENDER" && render "$f" > "$RENDER/${f:t}"
    continue
  fi
  print -n "[$step] ${f:t} ... "
  SECONDS=0
  run_sql "$(render "$f")"
  echo "done in ${SECONDS}s"
done
[[ -n $RENDER ]] && echo "rendered to $RENDER" || echo "Data ready in $UC_CATALOG.$UC_SCHEMA"

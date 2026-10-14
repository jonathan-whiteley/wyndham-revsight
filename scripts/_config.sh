# Shared by every script: loads config.env and derives the workspace paths.
# Usage (zsh): source "${0:A:h}/_config.sh"
ROOT=${${(%):-%x}:A:h:h}
set -a; source "$ROOT/config.env"; set +a
: ${DATABRICKS_PROFILE:?set DATABRICKS_PROFILE in config.env}
: ${APP_NAME:?set APP_NAME in config.env}
: ${UC_CATALOG:?set UC_CATALOG in config.env}
: ${UC_SCHEMA:?set UC_SCHEMA in config.env}
: ${WAREHOUSE_ID:?set WAREHOUSE_ID in config.env}
P=(--profile "$DATABRICKS_PROFILE")

# Workspace user, looked up once and only when a path needs it.
me() { databricks current-user me "${P[@]}" -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['userName'])"; }
app_path() { echo "${WORKSPACE_APP_PATH:-/Workspace/Users/$(me)/apps/$APP_NAME}"; }
genie_parent_path() { echo "${GENIE_PARENT_PATH:-/Workspace/Users/$(me)/genie_spaces}"; }

# Run one SQL statement on the warehouse and wait for it. Uses the Statement Execution
# API directly: `databricks experimental aitools` strips indentation, which breaks metric view YAML.
run_sql() {
  python3 - "$1" <<'PY'
import json, subprocess, sys, time, os
sql = sys.argv[1]
prof = ["--profile", os.environ["DATABRICKS_PROFILE"]]
def api(method, path, body=None):
    cmd = ["databricks", "api", method, path, *prof]
    if body is not None:
        cmd += ["--json", json.dumps(body)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr.strip()[-600:])
    return json.loads(r.stdout)
d = api("post", "/api/2.0/sql/statements",
        {"warehouse_id": os.environ["WAREHOUSE_ID"], "statement": sql, "wait_timeout": "50s"})
while d["status"]["state"] in ("PENDING", "RUNNING"):
    time.sleep(5)
    d = api("get", f"/api/2.0/sql/statements/{d['statement_id']}")
if d["status"]["state"] != "SUCCEEDED":
    sys.exit(f"{d['status']['state']}: {d['status'].get('error', {}).get('message', '')[:600]}")
PY
}

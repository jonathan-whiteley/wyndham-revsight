# Databricks notebook source
# MAGIC %md
# MAGIC # 🚀 Deploy RevSight IQ from your workspace
# MAGIC
# MAGIC This notebook does everything `scripts/` does from a laptop, using your own workspace login. No CLI, no local tools.
# MAGIC
# MAGIC | Step | What happens |
# MAGIC |---|---|
# MAGIC | 1 | Read `config.env` (the one file you edit) |
# MAGIC | 2 | Preflight: warehouse, catalog, schema, and that you can create tables there |
# MAGIC | 3 | Build the synthetic demo data (skipped automatically if it's already there) |
# MAGIC | 4 | Create or update the two Genie agents, and save their IDs back into `config.env` |
# MAGIC | 5 | Create the app and bind its resources (warehouse + both Genie spaces) |
# MAGIC | 6 | Give the app's service principal read access |
# MAGIC | 7 | Upload the app source and deploy, then print the URL |
# MAGIC
# MAGIC **How to run:** edit `config.env` in this folder, attach to **Serverless**, then **Run all**. Every step is safe to re-run.

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Read `config.env`
# MAGIC The **data** option: `auto` builds the data only if some tables are missing, `rebuild` always rebuilds it, `skip` never touches it.

# COMMAND ----------

import base64, json, os, re, time
from pathlib import Path
from databricks.sdk import WorkspaceClient

dbutils.widgets.dropdown("data", "auto", ["auto", "rebuild", "skip"], "Demo data")

w = WorkspaceClient()
api = w.api_client.do


def repo_root():
    """The folder that holds this notebook (the Git folder root)."""
    here = Path(os.getcwd())
    if (here / "config.env").exists():
        return here
    nb = dbutils.notebook.entry_point.getDbutils().notebook().getContext().notebookPath().get()
    return Path("/Workspace" + nb).parent


ROOT = repo_root()
CONFIG_FILE = ROOT / "config.env"
import sys
sys.path.insert(0, str(ROOT / "setup"))
import deploy_lib as lib  # shared with the bundle's setup_data job


def read_config():
    """KEY=VALUE lines from config.env, same rules as scripts/_config.sh (comments and blank lines ignored)."""
    cfg = {}
    for line in CONFIG_FILE.read_text().splitlines():
        m = re.match(r"\s*([A-Z_][A-Z0-9_]*)=(.*)$", line)
        if m:
            cfg[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return cfg


def save_config(**values):
    """Rewrite only the given KEY= lines in config.env, keeping comments and order."""
    text = CONFIG_FILE.read_text()
    for key, value in values.items():
        text, n = re.subn(rf"(?m)^{key}=.*$", f"{key}={value}", text)
        if not n:
            text += f"\n{key}={value}\n"
    CONFIG_FILE.write_text(text)


cfg = read_config()
REQUIRED = ["APP_NAME", "UC_CATALOG", "UC_SCHEMA", "WAREHOUSE_ID"]
bad = [k for k in REQUIRED if not cfg.get(k) or "<" in cfg[k] or "CHANGE" in cfg[k].upper()]
if bad:
    raise ValueError(f"Set {', '.join(bad)} in {CONFIG_FILE} first (see the README table 'What to change').")

ME = w.current_user.me().user_name
APP_NAME, CATALOG, SCHEMA, WAREHOUSE_ID = (cfg[k] for k in REQUIRED)
FQ = f"{CATALOG}.{SCHEMA}"
DATA_START = cfg.get("DATA_START") or "2019-01-01"
APP_PATH = cfg.get("WORKSPACE_APP_PATH") or f"/Workspace/Users/{ME}/apps/{APP_NAME}"
GENIE_PARENT = cfg.get("GENIE_PARENT_PATH") or f"/Workspace/Users/{ME}/genie_spaces"
DATA_MODE = dbutils.widgets.get("data")

print(f"""Repo folder : {ROOT}
You         : {ME}
App         : {APP_NAME}  (source -> {APP_PATH})
Data        : {FQ}  (history from {DATA_START}, mode: {DATA_MODE})
Warehouse   : {WAREHOUSE_ID}
Genie folder: {GENIE_PARENT}""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Preflight
# MAGIC Checks the warehouse, the catalog and schema, and that you can create a table there. Nothing is changed (a test table is created and dropped).

# COMMAND ----------

StatementError = lib.StatementError


def run_sql(sql):
    return lib.run_sql(w, WAREHOUSE_ID, sql)


PRIVS = "See the README section 'Privileges' for what you need."
try:
    wh = api("GET", f"/api/2.0/sql/warehouses/{WAREHOUSE_ID}")
except Exception as e:
    raise RuntimeError(f"Warehouse {WAREHOUSE_ID} not found or not visible to you. Pick one under SQL Warehouses. ({e})")
print(f"✅ Warehouse: {wh['name']} ({wh.get('cluster_size')}, {wh['state']}; it starts automatically if stopped)")

try:
    api("GET", f"/api/2.1/unity-catalog/schemas/{FQ}")
except Exception as e:
    raise RuntimeError(f"Schema {FQ} not found or not visible. The scripts never create catalogs or schemas; use one you can write to. {PRIVS} ({e})")
print(f"✅ Schema {FQ} exists")

try:
    run_sql(f"CREATE TABLE IF NOT EXISTS {FQ}.__revsight_preflight (ok INT)")
    run_sql(f"DROP TABLE IF EXISTS {FQ}.__revsight_preflight")
except StatementError as e:
    raise RuntimeError(f"You can't create tables in {FQ}: you need USE CATALOG, USE SCHEMA and CREATE TABLE. {PRIVS}\n{e}")
print(f"✅ You can create tables in {FQ}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Build the demo data
# MAGIC Runs `setup/sql/01..14` in order: 7 tables, 2 metric views and the planted anomalies. With the full history (`DATA_START=2019-01-01`) the reservation step builds 556M rows, so use a serverless warehouse or a later `DATA_START`.

# COMMAND ----------

_ = lib.build_data(w, WAREHOUSE_ID, CATALOG, SCHEMA, DATA_START, DATA_MODE)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Genie agents
# MAGIC Creates **Wyndham NT Performance** and **Wyndham STR Comp Set** on your metric views (definitions in `setup/genie/build_agents.py`). If `config.env` already holds IDs for spaces that read **your** schema, they're updated in place; otherwise new spaces are created and their IDs are written back into `config.env`.

# COMMAND ----------

import runpy

os.environ["UC_CATALOG"], os.environ["UC_SCHEMA"] = CATALOG, SCHEMA
runpy.run_path(str(ROOT / "setup" / "genie" / "build_agents.py"))

AGENTS = {
    "GENIE_SPACE_NT": ("nt_agent.json", "Wyndham NT Performance", "Daily occupancy, ADR and RevPAR for Wyndham sites (RevSight IQ)"),
    "GENIE_SPACE_STR": ("str_agent.json", "Wyndham STR Comp Set", "Weekly comp-set benchmarking: RGI, MPI, ARI (RevSight IQ)"),
}


def space_reads_my_schema(space_id):
    """True only if the space exists, you can read it, and every table it uses lives in FQ."""
    if not space_id:
        return False
    try:
        s = api("GET", f"/api/2.0/genie/spaces/{space_id}", query={"include_serialized_space": "true"})
        tables = [t["identifier"] for t in json.loads(s["serialized_space"])["data_sources"].get("tables", [])]
    except Exception:
        return False
    return bool(tables) and all(t.startswith(f"{FQ}.") for t in tables)


w.workspace.mkdirs(GENIE_PARENT)
space_ids = {}
for key, (file, title, desc) in AGENTS.items():
    body = {"warehouse_id": WAREHOUSE_ID, "title": title, "description": desc,
            "serialized_space": (ROOT / "setup" / "genie" / file).read_text()}
    current = cfg.get(key, "")
    if space_reads_my_schema(current):
        api("PATCH", f"/api/2.0/genie/spaces/{current}", body=body)
        space_ids[key] = current
        print(f"🔁 Updated {title}: {current}")
    else:
        sid = api("POST", "/api/2.0/genie/spaces", body={**body, "parent_path": GENIE_PARENT})["space_id"]
        space_ids[key] = sid
        print(f"✨ Created {title}: {sid}" + (f"  (config.env had {current}, which doesn't read {FQ})" if current else ""))

save_config(**space_ids)
cfg.update(space_ids)
print(f"✅ Saved the Genie IDs to {CONFIG_FILE.name}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 5. Create the app and bind its resources
# MAGIC The first run creates the app and waits for its compute (a few minutes). Every run then sends the **full** resource list in one update: a partial update would drop the others.

# COMMAND ----------

def get_app():
    try:
        return api("GET", f"/api/2.0/apps/{APP_NAME}")
    except Exception as e:
        if "does not exist" in str(e) or "NOT_FOUND" in str(e) or "404" in str(e):
            return None
        raise


def wait_compute(target="ACTIVE", minutes=20):
    for _ in range(minutes * 6):
        state = (get_app().get("compute_status") or {}).get("state")
        if state == target:
            return
        if state in ("ERROR",):
            raise RuntimeError(f"App compute is {state}: {get_app().get('compute_status')}")
        time.sleep(10)
    raise TimeoutError(f"App compute not {target} after {minutes} minutes")


app = get_app()
if app is None:
    print(f"Creating app {APP_NAME} ...")
    api("POST", "/api/2.0/apps", body={"name": APP_NAME, "description": "RevSight IQ: Genie revenue explorer on UC metric views"})
elif app.get("creator") and app["creator"] != ME:
    raise RuntimeError(f"An app named {APP_NAME} already exists and belongs to {app['creator']}. Pick another APP_NAME in config.env.")
else:
    print(f"App {APP_NAME} already exists")

state = (get_app().get("compute_status") or {}).get("state")
if state in ("STOPPED",):
    print("Starting app compute ...")
    api("POST", f"/api/2.0/apps/{APP_NAME}/start")
wait_compute("ACTIVE")

resources = [
    {"name": "sql_warehouse", "sql_warehouse": {"id": WAREHOUSE_ID, "permission": "CAN_USE"}},
    {"name": "genie_space_nt", "genie_space": {"space_id": cfg["GENIE_SPACE_NT"], "permission": "CAN_RUN"}},
    {"name": "genie_space_str", "genie_space": {"space_id": cfg["GENIE_SPACE_STR"], "permission": "CAN_RUN"}},
]
app = api("PATCH", f"/api/2.0/apps/{APP_NAME}",
          body={"name": APP_NAME, "description": "RevSight IQ: Genie revenue explorer on UC metric views", "resources": resources})
SP = app["service_principal_client_id"]
print(f"✅ Resources bound: {', '.join(r['name'] for r in app.get('resources') or [])}")
print(f"   App service principal: {SP}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 6. Give the app read access
# MAGIC `USE CATALOG`, `USE SCHEMA` and `SELECT` on your schema, and `CAN_RUN` on both Genie spaces. If you can't grant on the schema, this prints the exact statements to send to your schema owner and carries on.

# COMMAND ----------

_ = lib.grant_app_access(w, WAREHOUSE_ID, CATALOG, SCHEMA, SP, [cfg[k] for k in AGENTS])

# COMMAND ----------

# MAGIC %md
# MAGIC ## 7. Upload and deploy
# MAGIC Copies only the runtime files (no frontend sources, `package.json` or `node_modules`, which would trigger a slow Node build) to the app source folder, fills your catalog and schema into `app.yaml`, and deploys. The UI ships prebuilt in `app/frontend/dist`.

# COMMAND ----------

SRC = ROOT / "app"
if not (SRC / "frontend" / "dist" / "index.html").exists():
    raise RuntimeError("app/frontend/dist is missing. It's committed to the repo; pull the latest version of the Git folder.")

# Runtime files only, same set as scripts/deploy.sh.
files = {"main.py": SRC / "main.py", "requirements.txt": SRC / "requirements.txt"}
for folder in ["api", "services", "config", "frontend/dist"]:
    for p in sorted((SRC / folder).rglob("*")):
        if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc":
            files[str(p.relative_to(SRC))] = p
app_yaml = (SRC / "app.yaml").read_text().replace('"{{UC_CATALOG}}"', f'"{CATALOG}"').replace('"{{UC_SCHEMA}}"', f'"{SCHEMA}"')

# Upload through the Workspace API (not the /Workspace file system): the deployment snapshot
# only sees files the API has committed, so file-system writes can be missed.
try:
    api("POST", "/api/2.0/workspace/delete", body={"path": APP_PATH, "recursive": True})
except Exception:
    pass  # first run: nothing to delete


def upload(rel, content):
    target = f"{APP_PATH}/{rel}"
    api("POST", "/api/2.0/workspace/mkdirs", body={"path": target.rsplit("/", 1)[0]})
    api("POST", "/api/2.0/workspace/import", body={"path": target, "format": "AUTO", "overwrite": True,
                                                   "content": base64.b64encode(content).decode()})


for rel, p in files.items():
    upload(rel, p.read_bytes())
upload("app.yaml", app_yaml.encode())
print(f"Uploaded {len(files) + 1} files to {APP_PATH}")

dep = api("POST", f"/api/2.0/apps/{APP_NAME}/deployments", body={"source_code_path": APP_PATH, "mode": "SNAPSHOT"})
for _ in range(120):
    dep = api("GET", f"/api/2.0/apps/{APP_NAME}/deployments/{dep['deployment_id']}")
    if dep["status"]["state"] in ("SUCCEEDED", "FAILED", "CANCELLED"):
        break
    time.sleep(10)
if dep["status"]["state"] != "SUCCEEDED":
    raise RuntimeError(f"Deployment {dep['status']['state']}: {dep['status'].get('message')}. Open Compute > Apps > {APP_NAME} > Logs.")

url = get_app().get("url")
print(f"✅ Deployed ({dep['deployment_id']})\n\n🎉 Open {url}\n   The first visit asks you to approve access; that's expected.")
dbutils.notebook.exit(json.dumps({"url": url, "deployment_id": dep["deployment_id"], **space_ids}))

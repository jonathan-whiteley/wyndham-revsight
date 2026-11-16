"""Shared setup steps for RevSight IQ, used by workspace_deploy (notebook) and the bundle jobs (setup/jobs/).

Everything goes through the REST API (`w.api_client.do`) so an older preinstalled databricks-sdk works.
The laptop scripts in scripts/ do the same steps with the CLI.
"""
import time
from pathlib import Path

SQL_DIR = Path(__file__).resolve().parent / "sql"  # works from the repo, a Git folder or either bundle
OBJECTS = ["dim_site", "fact_sales_occupancy", "fact_str_weekly_compset", "fact_site_week_compset",
           "fact_reservation", "mv_nt_performance", "mv_str_compset", "anomaly_site_day"]


class StatementError(Exception):
    pass


def run_sql(w, warehouse_id, sql):
    """Run one statement with the Statement Execution API and wait for it."""
    api = w.api_client.do
    d = api("POST", "/api/2.0/sql/statements", body={"warehouse_id": warehouse_id, "statement": sql, "wait_timeout": "50s"})
    while d["status"]["state"] in ("PENDING", "RUNNING"):
        time.sleep(5)
        d = api("GET", f"/api/2.0/sql/statements/{d['statement_id']}")
    if d["status"]["state"] != "SUCCEEDED":
        raise StatementError(f"{d['status']['state']}: {d['status'].get('error', {}).get('message', '')[:800]}")
    return d.get("result", {}).get("data_array", [])


def render(sql, catalog, schema, data_start):
    return sql.replace("{{catalog}}", catalog).replace("{{schema}}", schema).replace("{{data_start}}", data_start)


def existing_objects(w, warehouse_id, catalog, schema):
    rows = run_sql(w, warehouse_id, f"SELECT table_name FROM {catalog}.information_schema.tables WHERE table_schema = '{schema}'")
    return {r[0] for r in rows}


def build_data(w, warehouse_id, catalog, schema, data_start="2019-01-01", mode="auto"):
    """Run setup/sql/01..14 in order. mode: auto (only if objects are missing), rebuild, skip."""
    fq = f"{catalog}.{schema}"
    missing = [o for o in OBJECTS if o not in existing_objects(w, warehouse_id, catalog, schema)]
    if mode == "skip" or (mode == "auto" and not missing):
        print(f"⏭️  Skipping the data build (mode {mode}; {len(OBJECTS) - len(missing)}/{len(OBJECTS)} objects already in {fq}).")
        return False
    print(f"Building data in {fq} from {data_start} (missing: {', '.join(missing) or 'none, rebuild requested'})")
    for f in sorted(SQL_DIR.glob("*.sql")):
        t0 = time.time()
        run_sql(w, warehouse_id, render(f.read_text(), catalog, schema, data_start))
        print(f"  [{f.name[:2]}] {f.name:<28} {time.time() - t0:6.0f}s")
    still = [o for o in OBJECTS if o not in existing_objects(w, warehouse_id, catalog, schema)]
    if still:
        raise RuntimeError(f"Data build finished but these are missing: {still}")
    print(f"✅ Data ready in {fq}")
    return True


# ---- App: user authorization only, no resources -------------------------------------------------

USER_API_SCOPES = __import__("json").loads((Path(__file__).resolve().parent / "user_api_scopes.json").read_text())


def ensure_app(w, name, description="RevSight IQ: Genie revenue explorer on UC metric views"):
    """Create the app if needed, then set its user_api_scopes and detach any resources (update_mask: only those fields).
    Returns the app. The app's service principal ends up with no grants from this app."""
    api = w.api_client.do
    try:
        api("GET", f"/api/2.0/apps/{name}")
    except Exception as e:
        if "does not exist" not in str(e) and "NOT_FOUND" not in str(e) and "404" not in str(e):
            raise
        print(f"Creating app {name} ...")
        api("POST", "/api/2.0/apps", body={"name": name, "description": description, "user_api_scopes": USER_API_SCOPES})
    try:
        api("POST", f"/api/2.0/apps/{name}/update",
            body={"update_mask": "user_api_scopes,resources", "app": {"user_api_scopes": USER_API_SCOPES, "resources": []}})
    except Exception as e:
        if "passthrough" in str(e).lower():
            raise RuntimeError("User authorization is off in this workspace. Ask a workspace admin to turn on "
                               "Databricks Apps user authorization (Previews), then re-run.") from e
        raise
    for _ in range(60):  # the update is asynchronous
        u = api("GET", f"/api/2.0/apps/{name}/update")
        if (u.get("status") or {}).get("state") not in ("IN_PROGRESS", "PENDING", None):
            break
        time.sleep(5)
    return api("GET", f"/api/2.0/apps/{name}")


def render_app_yaml(text, cfg):
    """Fill each "{{KEY}}" in app/app.yaml with KEY from config.env (empty if unset)."""
    import re
    return re.sub(r"\{\{([A-Z_][A-Z0-9_]*)\}\}", lambda m: cfg.get(m.group(1), ""), text)


def check_agents(w, agents_file, cfg):
    """Preflight for agents.yaml, as you (the deployer): each Genie agent opens and each metric view exists.
    ${VAR}s are filled from config.env, like the app does at runtime. Returns the agents; raises on problems."""
    import re
    import yaml
    api = w.api_client.do
    expand = lambda v: re.sub(r"\$\{([A-Z_][A-Z0-9_]*)\}", lambda m: cfg.get(m.group(1), ""), v) if isinstance(v, str) else v
    doc = yaml.safe_load(Path(agents_file).read_text()) or {}
    agents = [{k: expand(v) for k, v in a.items()} for a in doc.get("agents") or []]
    if not agents:
        raise RuntimeError(f"{agents_file} has no agents.")
    problems = []
    for a in agents:
        sid, mv = a.get("space_id"), a.get("metric_view")
        try:
            s = api("GET", f"/api/2.0/genie/spaces/{sid}")
            print(f"✅ {a['key']}: Genie agent '{s.get('title')}' ({sid})")
        except Exception as e:
            problems.append(f"{a['key']}: Genie agent {sid!r} doesn't open for you ({str(e)[:160]})")
        if mv:
            try:
                t = api("GET", f"/api/2.1/unity-catalog/tables/{mv}")
                print(f"   metric view {mv} ({t.get('table_type')}, {len(t.get('columns') or [])} columns)")
            except Exception as e:
                problems.append(f"{a['key']}: metric view {mv!r} not found or not visible ({str(e)[:160]})")
    if problems:
        raise RuntimeError("Fix agents.yaml:\n- " + "\n- ".join(problems))
    return agents


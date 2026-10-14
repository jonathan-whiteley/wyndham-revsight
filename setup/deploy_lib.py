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


def grant_app_access(w, warehouse_id, catalog, schema, sp, genie_space_ids=()):
    """USE CATALOG, USE SCHEMA, SELECT for the app SP, and CAN_RUN on each Genie space.
    Returns the GRANT statements that failed (to send to the schema owner)."""
    grants = [f"GRANT USE CATALOG ON CATALOG `{catalog}` TO `{sp}`",
              f"GRANT USE SCHEMA, SELECT ON SCHEMA `{catalog}`.`{schema}` TO `{sp}`"]
    for_owner = []
    for g in grants:
        try:
            run_sql(w, warehouse_id, g)
            print(f"✅ {g}")
        except StatementError as e:
            for_owner.append(g)
            print(f"⚠️  Couldn't run: {g}\n    {str(e)[:300]}")
    for sid in genie_space_ids:
        w.api_client.do("PATCH", f"/api/2.0/permissions/genie/{sid}",
                        body={"access_control_list": [{"service_principal_name": sp, "permission_level": "CAN_RUN"}]})
        print(f"✅ CAN_RUN on Genie space {sid}")
    if for_owner:
        print("\n👉 Ask your schema owner (or anyone with MANAGE on it) to run:\n\n" + ";\n".join(for_owner) + ";\n")
        print("The app deploys either way, but it can't read the data until these are granted.")
    return for_owner

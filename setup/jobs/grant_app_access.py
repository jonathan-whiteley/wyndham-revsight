# Databricks notebook source
# MAGIC %md
# MAGIC ## Give the app read access
# MAGIC `USE CATALOG`, `USE SCHEMA` and `SELECT` on the schema for the app's service principal. Genie `CAN_RUN` is set by the bundle itself (`resources/revsight.genie_spaces.yml`).

# COMMAND ----------

import os, sys
from pathlib import Path
from databricks.sdk import WorkspaceClient

setup_dir = next(p for p in [Path(os.getcwd()), *Path(os.getcwd()).parents] if (p / "deploy_lib.py").exists())
sys.path.insert(0, str(setup_dir))
import deploy_lib as lib

p = {k: dbutils.widgets.get(k) for k in ["catalog", "schema", "warehouse_id", "app_name"]}
w = WorkspaceClient()
sp = w.api_client.do("GET", f"/api/2.0/apps/{p['app_name']}")["service_principal_client_id"]
print(f"App {p['app_name']} service principal: {sp}")
_ = lib.grant_app_access(w, p["warehouse_id"], p["catalog"], p["schema"], sp)

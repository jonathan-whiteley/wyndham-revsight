# Databricks notebook source
# MAGIC %md
# MAGIC ## Build the RevSight IQ demo data
# MAGIC Runs `setup/sql/01..14` through `setup/deploy_lib.py` (the same code the `workspace_deploy` notebook uses). Parameters come from the bundle job.

# COMMAND ----------

import os, sys
from pathlib import Path
from databricks.sdk import WorkspaceClient

setup_dir = next(p for p in [Path(os.getcwd()), *Path(os.getcwd()).parents] if (p / "deploy_lib.py").exists())
sys.path.insert(0, str(setup_dir))
import deploy_lib as lib

p = {k: dbutils.widgets.get(k) for k in ["catalog", "schema", "warehouse_id", "data_start", "data_mode"]}
_ = lib.build_data(WorkspaceClient(), p["warehouse_id"], p["catalog"], p["schema"], p["data_start"] or "2019-01-01", p["data_mode"] or "auto")

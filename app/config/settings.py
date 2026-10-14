"""Runtime settings, read from env.

In Databricks Apps these come from app.yaml (values filled from config.env by
scripts/deploy.sh); locally scripts/run_local.sh exports them from config.env.
"""
import os


def _env(name: str) -> str:
    value = os.getenv(name, "")
    if not value:
        raise RuntimeError(f"{name} is not set. Set it in config.env and start the app with scripts/run_local.sh or scripts/deploy.sh.")
    return value


def catalog() -> str:
    return _env("UC_CATALOG")


def schema() -> str:
    return _env("UC_SCHEMA")


def fq(table: str) -> str:
    """Fully qualified name of a table or metric view in the demo schema."""
    return f"{catalog()}.{schema()}.{table}"


def warehouse_id() -> str:
    return _env("DATABRICKS_WAREHOUSE_ID")


def genie_space(model: str) -> str:
    return _env({"nt": "GENIE_SPACE_NT", "str": "GENIE_SPACE_STR"}[model])

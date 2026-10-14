"""SQL service for executing queries against Databricks SQL Warehouse."""

import logging
from typing import List, Dict, Any, Optional
from databricks.sdk.core import Config
from databricks.sql import connect

from config import settings

logger = logging.getLogger(__name__)


_cfg: Optional[Config] = None


def _config() -> Config:
    """SDK config: app service principal (OAuth M2M) in Apps, CLI profile locally."""
    global _cfg
    if _cfg is None:
        _cfg = Config()
    return _cfg


def get_sql_connection():
    """Get a connection to the Databricks SQL Warehouse."""
    warehouse_id = settings.warehouse_id()
    cfg = _config()

    # credentials_provider works for every SDK auth type; a static token is
    # empty for OAuth M2M and makes the connector fall back to a browser login.
    conn = connect(
        server_hostname=cfg.host.replace("https://", "").rstrip("/"),
        http_path=f"/sql/1.0/warehouses/{warehouse_id}",
        credentials_provider=lambda: cfg.authenticate,
    )
    return conn


def execute_query(sql: str, params: Optional[Dict[str, Any]] = None) -> tuple[List[Dict[str, Any]], List[str]]:
    """
    Execute a SQL query and return rows and column names.

    Returns:
        tuple: (rows as list of dicts, column names)
    """
    try:
        conn = get_sql_connection()
        cursor = conn.cursor()

        if params:
            # Use parameterized query
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)

        # Get column names
        columns = [desc[0] for desc in cursor.description]

        # Fetch all rows
        rows = cursor.fetchall()

        # Convert to list of dicts
        result = [dict(zip(columns, row)) for row in rows]

        cursor.close()
        conn.close()

        return result, columns
    except Exception as e:
        logger.error(f"SQL execution error: {e}")
        raise


def get_table_stats(catalog: str, schema: str, table: str) -> Dict[str, Any]:
    """Row count (Delta count(*) is answered from metadata) plus DESCRIBE DETAIL size and files."""
    fq = f"{catalog}.{schema}.{table}"
    try:
        detail, _ = execute_query(f"DESCRIBE DETAIL {fq}")
        count, _ = execute_query(f"SELECT count(*) AS n FROM {fq}")
        d = detail[0] if detail else {}
        return {"row_count": count[0]["n"] if count else None,
                "size_in_bytes": d.get("sizeInBytes"), "num_files": d.get("numFiles")}
    except Exception as e:
        logger.error(f"Error getting table stats: {e}")
        return {"row_count": None, "size_in_bytes": None, "num_files": None}


def get_max_date(catalog: str, schema: str, table: str, date_column: str) -> Optional[str]:
    """Get the maximum date value from a table column."""
    try:
        sql = f"SELECT MAX({date_column}) as max_date FROM {catalog}.{schema}.{table}"
        result, _ = execute_query(sql)

        if result and result[0].get("max_date"):
            return str(result[0]["max_date"])
        return None
    except Exception as e:
        logger.error(f"Error getting max date: {e}")
        return None

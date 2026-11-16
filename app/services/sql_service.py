"""SQL service for executing queries against Databricks SQL Warehouse."""

import logging
from typing import List, Dict, Any, Optional
from databricks.sql import connect

from config import settings
from services import user_auth

logger = logging.getLogger(__name__)


def get_sql_connection():
    """Connection to the app's SQL warehouse as the viewer (Apps) or your CLI profile (local)."""
    warehouse_id = settings.warehouse_id()
    if not warehouse_id:
        raise RuntimeError("No warehouse_id in agents.yaml: the 'data as of' date is off.")
    conn_args = dict(
        server_hostname=user_auth.host().replace("https://", "").rstrip("/"),
        http_path=f"/sql/1.0/warehouses/{warehouse_id}",
    )
    token = user_auth.user_token()
    if token:
        return connect(**conn_args, access_token=token)
    # Local: credentials_provider works for every SDK auth type; a static token is
    # empty for OAuth and makes the connector fall back to a browser login.
    cfg = user_auth.local_config()
    return connect(**conn_args, credentials_provider=lambda: cfg.authenticate)


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

"""Query performance metrics from the SQL Query History API (never fabricated)."""

import logging
import time
from typing import Dict, Any
from databricks.sdk import WorkspaceClient

logger = logging.getLogger(__name__)

EMPTY = {"duration_ms": None, "execution_ms": None, "rows_scanned": None, "rows_read": None,
         "files_read": None, "files_pruned": None, "bytes_pruned": None, "bytes_read": None,
         "cache_hit": None, "found": False}


class PerfService:
    def __init__(self):
        self.client = WorkspaceClient()

    def get_query_perf(self, statement_id: str, attempts: int = 8, delay: float = 2.0) -> Dict[str, Any]:
        """Query History lags a few seconds behind completion, so retry briefly."""
        for i in range(attempts):
            try:
                # Raw REST (not the SDK dataclass) so metrics like rows_scanned are kept.
                res = self.client.api_client.do("GET", "/api/2.0/sql/history/queries", query={
                    "include_metrics": "true", "max_results": 1, "filter_by.statement_ids": statement_id})
                q = (res.get("res") or [None])[0]
                if q is not None:
                    m = q.get("metrics") or {}
                    return {
                        "duration_ms": q.get("duration"),
                        "execution_ms": m.get("execution_time_ms"),
                        "rows_scanned": m.get("rows_scanned"),
                        "rows_read": m.get("rows_read_count"),
                        "files_read": m.get("read_files_count"),
                        "files_pruned": m.get("pruned_files_count"),
                        "bytes_pruned": m.get("pruned_bytes"),
                        "bytes_read": m.get("read_bytes"),
                        "cache_hit": m.get("result_from_cache"),
                        "found": True,
                    }
            except Exception as e:
                logger.warning(f"Query history lookup failed ({i + 1}/{attempts}): {e}")
            time.sleep(delay)
        return dict(EMPTY)


perf_service = PerfService()

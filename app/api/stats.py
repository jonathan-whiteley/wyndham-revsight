"""Statistics endpoints."""

import logging
from fastapi import APIRouter, HTTPException
from config import settings
from services.sql_service import get_table_stats, get_max_date

logger = logging.getLogger(__name__)
router = APIRouter()
_res_stats = None  # table stats are static for the demo; cache after first read


@router.get("/stats/reservations")
def get_reservation_stats():
    """Get statistics for the fact_reservation table."""
    try:
        global _res_stats
        if _res_stats is None or _res_stats.get("row_count") is None:
            _res_stats = get_table_stats(settings.catalog(), settings.schema(), "fact_reservation")
        stats = _res_stats
        return {
            "row_count": stats.get("row_count"),
            "size_in_bytes": stats.get("size_in_bytes"),
            "num_files": stats.get("num_files"),
        }
    except Exception as e:
        logger.error(f"Error getting reservation stats: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get("/stats/data-as-of")
def get_data_as_of():
    """Get the latest date in the data."""
    try:
        date = get_max_date(settings.catalog(), settings.schema(), "fact_sales_occupancy", "stay_date")
        return {"date": date}
    except Exception as e:
        logger.error(f"Error getting data as of date: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

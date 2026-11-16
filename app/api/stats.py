"""Statistics endpoints."""

import logging
from fastapi import APIRouter, HTTPException
from config import settings
from services.sql_service import get_max_date

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/stats/data-as-of")
def get_data_as_of():
    """Get the latest date in the data."""
    try:
        date = get_max_date(settings.catalog(), settings.schema(), "fact_sales_occupancy", "stay_date")
        return {"date": date}
    except Exception as e:
        logger.error(f"Error getting data as of date: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

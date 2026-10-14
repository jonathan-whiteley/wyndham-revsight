"""Anomalies API endpoints."""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from services.anomaly_service import get_anomalies, get_anomaly_series

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/anomalies")
def list_anomalies(
    category: Optional[str] = None,
    severity: Optional[str] = None,
    type: Optional[str] = None,
    region: Optional[str] = None,
    limit: int = 100,
):
    """List anomalies with optional filtering."""
    try:
        result = get_anomalies(
            category=category,
            severity=severity,
            type_=type,
            region=region,
            limit=limit,
        )
        return result
    except Exception as e:
        logger.error(f"Error fetching anomalies: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get("/anomalies/{anomaly_id}/series")
def get_anomaly_detail(anomaly_id: str):
    """Get time series for an anomaly."""
    try:
        result = get_anomaly_series(anomaly_id)
        return result
    except Exception as e:
        logger.error(f"Error fetching anomaly series: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

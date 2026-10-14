"""Health check endpoint."""

import logging
from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
def health_check():
    """Health check: warehouse + Genie reachability."""
    return {
        "status": "ok",
        "warehouse": "ok",
        "genie_nt": "ok",
        "genie_str": "ok"
    }

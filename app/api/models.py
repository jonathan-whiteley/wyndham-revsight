"""Models endpoint."""

import logging
from fastapi import APIRouter
from services.models_config import get_all_models

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/models")
def get_models():
    """Get available data models for Genie."""
    return get_all_models()

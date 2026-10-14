"""Fields endpoint."""

import logging
from fastapi import APIRouter, HTTPException
from services.models_config import get_model_config

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/fields")
def get_fields(model: str = "nt"):
    """Get field groups for a data model."""
    try:
        config = get_model_config(model)
        return {"groups": config["field_groups"]}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

"""Data model (Genie agent) endpoints: picker entries, fields, starter questions, data as of."""

import logging
from fastapi import APIRouter, HTTPException
from config import settings
from services import agent_service

logger = logging.getLogger(__name__)
router = APIRouter()


def _check(model: str):
    try:
        settings.agent(model)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/models")
def get_models():
    """Every agent in agents.yaml, titled from Genie."""
    return [agent_service.summary(a["key"]) for a in settings.agents()]


@router.get("/models/{model}/fields")
def get_fields(model: str):
    """Field groups from the agent's metric view."""
    _check(model)
    try:
        return {"groups": agent_service.field_groups(model)}
    except Exception as e:
        logger.warning(f"Fields for {model}: {e}")
        return {"groups": [], "error": str(e)}


@router.get("/models/{model}/samples")
def get_samples(model: str):
    """The agent's first three sample questions, for the home screen."""
    _check(model)
    return {"questions": agent_service.sample_questions(model)}


@router.get("/models/{model}/data-as-of")
def get_data_as_of(model: str):
    """Latest date in the agent's metric view (null when there's no warehouse or date dimension)."""
    _check(model)
    try:
        return {"date": agent_service.data_as_of(model)}
    except Exception as e:
        logger.warning(f"Data as of for {model}: {e}")
        return {"date": None, "error": str(e)}


@router.get("/features")
def get_features():
    """Optional tabs and widgets, from agents.yaml."""
    return {"anomalies": bool(settings.anomalies_schema()), "data_as_of": bool(settings.warehouse_id())}

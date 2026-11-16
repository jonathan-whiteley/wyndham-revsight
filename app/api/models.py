"""Data model (Genie agent) endpoints: picker entries, fields, starter questions, data as of."""

import contextvars
import logging
from concurrent.futures import ThreadPoolExecutor
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


def _failure(what: str, model: str, e: Exception) -> dict:
    """Error payload shown in the UI (the SDK's config dump trimmed off)."""
    logger.warning(f"{what} for {model}: {e}")
    return {"error": str(e).split(" Config:")[0]}


@router.get("/models")
def get_models():
    """Every agent in agents.yaml, titled from Genie (looked up in parallel)."""
    keys = [a["key"] for a in settings.agents()]
    # Copy the request context here (not in the worker), once per task, so each lookup runs as the viewer.
    contexts = [contextvars.copy_context() for _ in keys]
    with ThreadPoolExecutor(max_workers=min(8, len(keys))) as pool:
        return list(pool.map(lambda ctx, k: ctx.run(agent_service.summary, k), contexts, keys))


@router.get("/models/{model}/fields")
def get_fields(model: str):
    """Field groups from the agent's metric view."""
    _check(model)
    try:
        return {"groups": agent_service.field_groups(model)}
    except Exception as e:
        return {"groups": [], **_failure("Fields", model, e)}


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
        return {"date": None, **_failure("Data as of", model, e)}


@router.get("/features")
def get_features():
    """Optional widgets, from agents.yaml."""
    return {"data_as_of": bool(settings.warehouse_id())}

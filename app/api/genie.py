"""Genie API endpoints."""

import logging
from typing import Literal, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from services.genie_service import genie_service
from services.perf_service import perf_service
from config.settings import agent as get_model_config

logger = logging.getLogger(__name__)
router = APIRouter()


class AskRequest(BaseModel):
    model: str
    question: str
    conversation_id: Optional[str] = None


class AskResponse(BaseModel):
    model: str
    conversation_id: str
    message_id: str


class FeedbackRequest(BaseModel):
    model: str
    conversation_id: str
    message_id: str
    rating: Literal["POSITIVE", "NEGATIVE", "NONE"]
    comment: Optional[str] = Field(default=None, max_length=2000)


@router.post("/genie/ask")
def genie_ask(request: AskRequest):
    """Ask a question to a Genie agent."""
    try:
        # Validate model
        get_model_config(request.model)

        # Ask Genie
        result = genie_service.ask(request.model, request.question, request.conversation_id)
        return AskResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error asking Genie: {e}")
        raise HTTPException(status_code=500, detail=f"Genie error: {str(e)}")


@router.get("/genie/message/{model}/{conversation_id}/{message_id}")
def get_message(model: str, conversation_id: str, message_id: str):
    """Poll for a Genie message response."""
    try:
        # Validate model
        get_model_config(model)

        # Get message
        result = genie_service.get_message(model, conversation_id, message_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting message: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.post("/genie/feedback")
def send_feedback(request: FeedbackRequest):
    """Send thumbs up/down and an optional comment to Genie for one answer."""
    try:
        get_model_config(request.model)
        genie_service.send_feedback(request.model, request.conversation_id, request.message_id, request.rating, request.comment)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error sending feedback: {e}")
        raise HTTPException(status_code=500, detail=f"Feedback error: {str(e)}")


@router.get("/genie/perf/{statement_id}")
def get_perf(statement_id: str):
    """Get query performance metrics."""
    try:
        result = perf_service.get_query_perf(statement_id)
        return result
    except Exception as e:
        logger.error(f"Error getting perf: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

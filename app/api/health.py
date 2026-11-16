"""Health check endpoint."""

from fastapi import APIRouter
from config import settings

router = APIRouter()


@router.get("/health")
def health_check():
    """The app is up and agents.yaml loads. Genie and warehouse access are checked per viewer, not here."""
    return {"status": "ok", "agents": [a["key"] for a in settings.agents()]}

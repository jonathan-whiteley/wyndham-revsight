"""API router for RevSight IQ."""

from fastapi import APIRouter

router = APIRouter(prefix="/api")

# Import and register endpoint modules
from . import health, models, genie, anomalies, export

router.include_router(health.router)
router.include_router(models.router)
router.include_router(genie.router)
router.include_router(anomalies.router)
router.include_router(export.router)

"""
RevSight IQ - Wyndham Revenue Explorer
Main FastAPI Application

A Databricks App for revenue performance analysis featuring:
- Real-time hotel performance data via Genie agents
- Revenue, occupancy, and comp set analysis
- Anomaly detection and investigation
- Excel export with pivot tables
"""

import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn

from api import router as api_router
from services import user_auth

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """App lifecycle management."""
    # Startup. No data queries here: there's no viewer yet, so they'd need the
    # service principal's grants. The UI fetches "data as of" per request.
    logger.info("RevSight IQ backend starting...")

    yield

    # Shutdown
    logger.info("RevSight IQ backend shutting down...")


# Create FastAPI app
app = FastAPI(
    title="RevSight IQ",
    description="Wyndham Revenue Explorer powered by Genie",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def forward_user(request: Request, call_next):
    """Run this request's Databricks calls as the viewer (see services/user_auth.py)."""
    user_auth.set_request_user(request.headers.get("x-forwarded-access-token"),
                               request.headers.get("x-forwarded-email") or request.headers.get("x-forwarded-user"))
    return await call_next(request)


# Include API router
app.include_router(api_router)


# Mount static files for React frontend
# The frontend is built to frontend/dist/
# In Databricks Apps, we serve it from /api prefix
try:
    frontend_path = os.path.join(os.path.dirname(__file__), "frontend", "dist")
    if os.path.isdir(frontend_path):
        app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
        logger.info("Frontend mounted successfully")
    else:
        logger.warning(f"Frontend dist directory not found: {frontend_path}")
except Exception as e:
    logger.warning(f"Could not mount frontend: {e}")


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )

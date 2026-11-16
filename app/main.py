"""
RevSight IQ - Wyndham Revenue Explorer
Main FastAPI Application

A Databricks App for revenue performance analysis featuring:
- Real-time hotel performance data via Genie agents
- Revenue, occupancy, and comp set analysis
- Excel export with pivot tables
"""

import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
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
    try:
        from config import settings
        logger.info("Genie agents: " + ", ".join(f"{a['key']} -> {a['space_id']}" for a in settings.agents()))
    except Exception as e:
        logger.error(f"agents.yaml: {e}")

    yield

    # Shutdown
    logger.info("RevSight IQ backend shutting down...")


# Create FastAPI app
app = FastAPI(
    title="RevSight IQ",
    description="Revenue explorer powered by Genie",
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
    token = request.headers.get("x-forwarded-access-token")
    if user_auth.IN_APPS and not token and request.url.path.startswith("/api/") and request.url.path != "/api/health":
        # Never fall back to the app's service principal: it has no grants by design.
        return JSONResponse(status_code=401, content={"detail": "No user token. Give the app its user_api_scopes (see the README) and "
                                                                "check the workspace allows them (Settings > Development > Apps), then reload."})
    user_auth.set_request_user(token, request.headers.get("x-forwarded-email") or request.headers.get("x-forwarded-user"))
    return await call_next(request)


# Include API router
app.include_router(api_router)


@app.get("/reauth")
def reauth(request: Request):
    """Sign in to the app again: clears the Databricks Apps session cookies so the next page load
    re-runs OAuth and asks for any scopes added since the viewer last approved the app."""
    response = RedirectResponse("/", status_code=302)
    # The Apps proxy doesn't forward its session cookie, so expire it by name (plus any CSRF cookies we can see).
    names = {"__Host-databricksapps"} | {n for n in request.cookies if n.startswith("__Host-databricksapps")}
    for name in names:
        response.delete_cookie(name, path="/", secure=True, httponly=True, samesite="lax")
    return response


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

"""On-behalf-of-user auth: every Databricks call runs as the signed-in user.

With user authorization on, Databricks Apps forwards the viewer's token in
x-forwarded-access-token, limited to the scopes declared on the app (sql,
genie). Without that header (OBO off in the workspace, or a local
run), calls fall back to the default SDK config: the app's service principal
in Apps, your CLI profile locally.
"""

import logging
from contextvars import ContextVar
from typing import Optional

from databricks.sdk import WorkspaceClient
from databricks.sdk.core import Config

logger = logging.getLogger(__name__)

_token: ContextVar[Optional[str]] = ContextVar("user_token", default=None)
_user: ContextVar[Optional[str]] = ContextVar("user_name", default=None)
_default_cfg: Optional[Config] = None
_default_client: Optional[WorkspaceClient] = None
_warned = False


def set_request_user(token: Optional[str], user: Optional[str]) -> None:
    """Called once per request by the middleware in main.py."""
    global _warned
    _token.set(token or None)
    _user.set(user or None)
    if not token and user and not _warned:
        # A forwarded user without a token means the app runs in Apps but OBO is off.
        logger.warning("No x-forwarded-access-token: running as the app's service principal. "
                       "Enable user authorization and add user_api_scopes to run as the viewer.")
        _warned = True


def default_config() -> Config:
    global _default_cfg
    if _default_cfg is None:
        _default_cfg = Config()
    return _default_cfg


def host() -> str:
    return default_config().host


def user_token() -> Optional[str]:
    return _token.get()


def cache_key() -> str:
    """Partition per-user caches so one viewer never sees another's results."""
    return _user.get() or "app"


def workspace_client() -> WorkspaceClient:
    """Client for the current viewer, or the default identity when no token was forwarded."""
    token = _token.get()
    if token:
        # auth_type pins PAT auth: the app's DATABRICKS_CLIENT_ID/SECRET env would otherwise also match.
        return WorkspaceClient(host=host(), token=token, auth_type="pat")
    global _default_client
    if _default_client is None:
        _default_client = WorkspaceClient(config=default_config())
    return _default_client

"""On-behalf-of-user auth: every Databricks call runs as the signed-in user.

In Databricks Apps the viewer's token arrives in x-forwarded-access-token, limited to the
app's user_api_scopes. The app's service principal is never used for data, Genie or metadata,
so it needs no grants. Locally (no DATABRICKS_APP_NAME) calls use your CLI profile.
"""

import hashlib
import os
from contextvars import ContextVar
from typing import Optional

from databricks.sdk import WorkspaceClient
from databricks.sdk.core import Config

_token: ContextVar[Optional[str]] = ContextVar("user_token", default=None)
_user: ContextVar[Optional[str]] = ContextVar("user_name", default=None)
_local_cfg: Optional[Config] = None
_local_client: Optional[WorkspaceClient] = None

IN_APPS = bool(os.getenv("DATABRICKS_APP_NAME"))


class NoUserToken(Exception):
    """In Databricks Apps without a forwarded user token: user authorization is off or the app has no scopes."""


def set_request_user(token: Optional[str], user: Optional[str]) -> None:
    """Called once per request by the middleware in main.py."""
    _token.set(token or None)
    _user.set(user or None)


def _local_config() -> Config:
    global _local_cfg
    if _local_cfg is None:
        _local_cfg = Config()
    return _local_cfg


def host() -> str:
    if IN_APPS:
        h = os.environ["DATABRICKS_HOST"]
        return h if h.startswith("http") else f"https://{h}"
    return _local_config().host


def user_token() -> Optional[str]:
    """The viewer's token in Apps; None locally (use the CLI profile)."""
    token = _token.get()
    if IN_APPS and not token:
        raise NoUserToken("No user token: turn on user authorization for Databricks Apps and give the app its "
                          "user_api_scopes (see the README), then reload the page.")
    return token


def cache_key() -> str:
    """Partitions per-user caches so one viewer never sees another's results."""
    token = _token.get()
    return _user.get() or (hashlib.sha256(token.encode()).hexdigest()[:16] if token else "local")


def local_config() -> Config:
    return _local_config()


def workspace_client() -> WorkspaceClient:
    """Client for the current viewer (Apps) or your CLI profile (local)."""
    token = user_token()
    if token:
        # auth_type pins PAT auth: the app's DATABRICKS_CLIENT_ID/SECRET env would otherwise also match.
        return WorkspaceClient(host=host(), token=token, auth_type="pat")
    global _local_client
    if _local_client is None:
        _local_client = WorkspaceClient(config=_local_config())
    return _local_client

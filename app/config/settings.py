"""Runtime settings: the Genie agents and optional features, read from agents.yaml.

agents.yaml is the one file to edit to point the app at other Genie agents and metric views.
${VAR} placeholders in it are filled from the environment: in Databricks Apps from app.yaml
(scripts/deploy.sh and the workspace_deploy notebook fill those from config.env), locally from
config.env via scripts/run_local.sh. An unset ${VAR} becomes empty.
"""
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

AGENTS_FILE = Path(os.getenv("AGENTS_FILE") or Path(__file__).resolve().parent.parent / "agents.yaml")
_VAR = re.compile(r"\$\{([A-Z_][A-Z0-9_]*)\}")


def _expand(value: Any) -> Any:
    if isinstance(value, str):
        return _VAR.sub(lambda m: os.getenv(m.group(1), ""), value).strip()
    if isinstance(value, list):
        return [_expand(v) for v in value]
    if isinstance(value, dict):
        return {k: _expand(v) for k, v in value.items()}
    return value


@lru_cache(maxsize=1)
def config() -> Dict[str, Any]:
    raw = yaml.safe_load(AGENTS_FILE.read_text()) or {}
    cfg = _expand(raw)
    agents = cfg.get("agents") or []
    if not agents:
        raise RuntimeError(f"No agents in {AGENTS_FILE}. Add at least one Genie agent (see the README).")
    for a in agents:
        missing = [k for k in ("key", "space_id") if not a.get(k)]
        if missing:
            raise RuntimeError(f"Agent {a.get('key') or a.get('label') or '?'} in {AGENTS_FILE} is missing {', '.join(missing)} "
                               "(an empty value usually means a ${VAR} isn't set).")
    return cfg


def agents() -> List[Dict[str, Any]]:
    return config()["agents"]


def agent(key: str) -> Dict[str, Any]:
    for a in agents():
        if a["key"] == key:
            return a
    raise ValueError(f"Unknown model: {key}")


def warehouse_id() -> Optional[str]:
    """Warehouse for the app's own SQL (the "data as of" date). Genie uses its agent's warehouse."""
    return config().get("warehouse_id") or None


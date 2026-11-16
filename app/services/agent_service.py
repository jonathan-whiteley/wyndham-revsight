"""What the UI needs to know about each Genie agent, read as the viewer and cached per viewer.

- Title and description: Genie get_space.
- Sample questions (home-screen starters): the agent's serialized_space when the viewer can edit it,
  else the curated-questions endpoint the Genie UI uses for viewers (not in the public API docs).
- Fields: the metric view's columns from Unity Catalog (dimension or measure, plus comments).
- Data as of: MAX of the metric view's first date dimension, on the app's warehouse.
"""

import json
import logging
import time
from typing import Any, Dict, List, Optional

from config import settings
from services import user_auth
from services.sql_service import execute_query

logger = logging.getLogger(__name__)

TTL_S = 600
_cache: Dict[tuple, tuple] = {}
DATE_TYPES = {"DATE", "TIMESTAMP", "TIMESTAMP_NTZ"}
NUMERIC_TYPES = {"BYTE", "SHORT", "INT", "LONG", "FLOAT", "DOUBLE", "DECIMAL"}
TIME_NAMES = {"year", "quarter", "month", "week", "day", "day_of_week", "date"}


def _cached(what: str, key: str, fn):
    k = (user_auth.cache_key(), what, key)
    hit = _cache.get(k)
    if hit and time.time() - hit[0] < TTL_S:
        return hit[1]
    value = fn()
    if len(_cache) > 500:
        _cache.clear()
    _cache[k] = (time.time(), value)
    return value


ACRONYMS = {"adr", "ari", "id", "kpi", "mpi", "rgi", "ytd", "yoy"}


def _label(a: Dict[str, Any], name: str) -> str:
    """Configured label, else the column name in words: chain_scale -> Chain scale, site_id -> Site ID."""
    labels = a.get("labels") or {}
    if name in labels:
        return labels[name]
    text = " ".join("RevPAR" if w == "revpar" else w.upper() if w in ACRONYMS else w for w in name.split("_"))
    return text[:1].upper() + text[1:]


def _space(key: str):
    a = settings.agent(key)
    return _cached("space", key, lambda: user_auth.workspace_client().genie.get_space(a["space_id"]))


def summary(key: str) -> Dict[str, Any]:
    """Picker entry for one agent. Title comes from Genie; a Genie error leaves the configured label."""
    a = settings.agent(key)
    title, description, error = None, None, None
    try:
        s = _space(key)
        title, description = s.title, s.description
    except Exception as e:
        error = str(e)
        logger.warning(f"Genie agent {a['space_id']} ({key}) not readable: {e}")
    return {
        "key": key,
        "label": a.get("label") or title or key,
        "agent_name": title or a.get("label") or key,
        "description": description,
        "metric_view": a.get("metric_view"),
        "grain": a.get("grain"),
        "starter_measure": a.get("starter_measure"),
        "starter_dimension": a.get("starter_dimension"),
        "error": error.split(" Config:")[0] if error else None,
    }


def sample_questions(key: str, n: int = 3) -> List[str]:
    a = settings.agent(key)

    def load() -> List[str]:
        client = user_auth.workspace_client()
        try:  # documented, needs CAN EDIT on the agent
            s = client.genie.get_space(a["space_id"], include_serialized_space=True)
            if s.serialized_space:
                qs = json.loads(s.serialized_space).get("config", {}).get("sample_questions", [])
                out = [" ".join(q.get("question") or []).strip() for q in sorted(qs, key=lambda q: q.get("id", ""))]
                if any(out):
                    return [q for q in out if q]
        except Exception as e:
            logger.info(f"get_space with serialized_space failed for {key} ({e}); trying curated questions")
        try:  # what the Genie UI uses for viewers; not in the public API reference
            res = client.api_client.do("GET", f"/api/2.0/data-rooms/{a['space_id']}/curated-questions",
                                       query={"question_type": "SAMPLE_QUESTION"})
            qs = [q for q in res.get("curated_questions", []) if not q.get("is_deprecated")]
            return [q["question_text"] for q in sorted(qs, key=lambda q: q.get("id", "")) if q.get("question_text")]
        except Exception as e:
            logger.warning(f"No sample questions for {key}: {e}")
            return []

    return _cached("samples", key, load)[:n]


def _columns(key: str) -> List[Dict[str, Any]]:
    """Metric view columns: name, type, comment, and dimension/measure from the metric view metadata."""
    a = settings.agent(key)
    if not a.get("metric_view"):
        return []

    def load():
        t = user_auth.workspace_client().tables.get(a["metric_view"])
        cols = []
        for c in t.columns or []:
            meta = {}
            try:
                meta = json.loads(c.type_json or "{}").get("metadata", {})
            except ValueError:
                pass
            type_name = c.type_name.value if hasattr(c.type_name, "value") else str(c.type_name or "")
            mv_type = meta.get("metric_view.type")
            kind = "measure" if mv_type == "measure" or (not mv_type and type_name in NUMERIC_TYPES) else "dimension"
            cols.append({"name": c.name, "type": type_name, "kind": kind, "comment": c.comment or meta.get("comment")})
        return cols

    return _cached("columns", key, load)


def field_groups(key: str) -> List[Dict[str, Any]]:
    """Field rail groups: the configured field_groups in order, then anything unlisted."""
    a = settings.agent(key)
    cols = {c["name"]: c for c in _columns(key)}

    def field(c):
        label = _label(a, c["name"])
        follow = "Add {label}" if c["kind"] == "measure" else "Break that down by {label}"
        return {"name": c["name"], "label": label, "kind": c["kind"], "followup": follow, "description": c["comment"]}

    groups, used = [], set()
    for title, names in (a.get("field_groups") or {}).items():
        fs = [field(cols[n]) for n in names or [] if n in cols]
        used.update(n for n in names or [] if n in cols)
        if fs:
            groups.append({"label": title, "kind": fs[0]["kind"], "fields": fs})
    rest = [c for n, c in cols.items() if n not in used]
    time_dims = [c for c in rest if c["kind"] == "dimension" and (c["type"] in DATE_TYPES or c["name"] in TIME_NAMES)]
    for title, kind, cs in [("Measures", "measure", [c for c in rest if c["kind"] == "measure"]),
                            ("Time", "dimension", time_dims),
                            ("Dimensions", "dimension", [c for c in rest if c["kind"] == "dimension" and c not in time_dims])]:
        if cs:
            groups.append({"label": title, "kind": kind, "fields": [field(c) for c in cs]})
    return groups


def data_as_of(key: str) -> Optional[str]:
    """Latest value of the metric view's first date dimension, or None without a warehouse or date column."""
    a = settings.agent(key)
    if not settings.warehouse_id():
        return None
    date_col = a.get("date_field") or next((c["name"] for c in _columns(key) if c["kind"] == "dimension" and c["type"] in DATE_TYPES), None)
    if not date_col:
        return None

    def load():
        rows, _ = execute_query(f"SELECT MAX(`{date_col}`) AS d FROM {a['metric_view']}")
        d = rows[0]["d"] if rows else None
        return str(d)[:10] if d else None

    return _cached("asof", key, load)

"""Genie service: routes questions to the Genie agent for a data model (NT or STR)."""

import logging
from typing import Optional, Dict, Any, List
from databricks.sdk import WorkspaceClient

from config import settings

logger = logging.getLogger(__name__)

TERMINAL = {"COMPLETED", "FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED"}
# Still running the SQL: rows can't exist yet.
QUERYING = {"SUBMITTED", "FILTERING_CONTEXT", "EXECUTING_QUERY", "PENDING_WAREHOUSE", "FETCHING_METADATA"}
MAX_ROWS = 5000
CACHE_MAX = 200


class GenieService:
    def __init__(self):
        self.client = WorkspaceClient()
        # Query results by (message, attachment, statement): polled every 1.5s, fetched once.
        self._results: Dict[tuple, Dict[str, Any]] = {}

    def _space(self, model: str) -> str:
        if model not in ("nt", "str"):
            raise ValueError(f"Unknown model: {model}")
        return settings.genie_space(model)

    def ask(self, model: str, question: str, conversation_id: Optional[str] = None) -> Dict[str, Any]:
        """Start a conversation (or continue one) without waiting for the answer."""
        space_id = self._space(model)
        if conversation_id:
            msg = self.client.genie.create_message(space_id=space_id, conversation_id=conversation_id, content=question).response
        else:
            msg = self.client.genie.start_conversation(space_id=space_id, content=question).response
        return {"model": model, "conversation_id": msg.conversation_id, "message_id": msg.message_id or msg.id}

    def _fetch_result(self, space_id: str, conversation_id: str, message_id: str, att) -> Optional[Dict[str, Any]]:
        key = (message_id, att.attachment_id, getattr(att.query, "statement_id", None))
        if key in self._results:
            return self._results[key]
        res = self.client.genie.get_message_attachment_query_result(
            space_id=space_id, conversation_id=conversation_id, message_id=message_id, attachment_id=att.attachment_id,
        ).statement_response
        if not res or not res.manifest or not res.manifest.schema or not res.result:
            return None  # SQL not finished yet
        cols = res.manifest.schema.columns or []
        rows = res.result.data_array or []
        out = {
            "columns": [{"name": c.name, "type": (c.type_name.value if hasattr(c.type_name, "value") else str(c.type_name))} for c in cols],
            "row_count": res.manifest.total_row_count or len(rows),
            "truncated": bool(res.manifest.truncated) or len(rows) > MAX_ROWS,
            "rows": rows[:MAX_ROWS],
            "statement_id": res.statement_id,
        }
        if len(self._results) >= CACHE_MAX:
            self._results.pop(next(iter(self._results)))
        self._results[key] = out
        return out

    def get_message(self, model: str, conversation_id: str, message_id: str) -> Dict[str, Any]:
        """Current state of a message. Rows are returned as soon as the SQL finishes, while Genie
        is still writing its summary (partial=True), so the table can render ~10s before the text."""
        space_id = self._space(model)
        m = self.client.genie.get_message(space_id=space_id, conversation_id=conversation_id, message_id=message_id)
        status = m.status.value if hasattr(m.status, "value") else str(m.status)
        out: Dict[str, Any] = {
            "status": status, "partial": status not in TERMINAL, "text": "", "sql": "", "description": "", "columns": [], "rows": [],
            "row_count": 0, "truncated": False, "suggested_questions": [], "statement_id": None, "error": None,
        }
        if m.error and status in TERMINAL:
            out["error"] = getattr(m.error, "error", None) or str(m.error)

        texts: List[str] = []
        query_att = None
        for a in m.attachments or []:
            text, query, sq = getattr(a, 'text', None), getattr(a, 'query', None), getattr(a, 'suggested_questions', None)
            if text and getattr(text, 'content', None):
                texts.append(text.content)
            if query and query_att is None:
                query_att = a
            if sq and getattr(sq, 'questions', None):
                out["suggested_questions"] = list(sq.questions)
        if status in TERMINAL:
            out["text"] = "\n\n".join(texts)

        if query_att:
            q = query_att.query
            out["sql"] = q.query or ""
            out["description"] = q.description or ""
            out["statement_id"] = getattr(q, "statement_id", None)
            if status in TERMINAL and not out["text"] and q.description:
                out["text"] = q.description
            if status == "COMPLETED" or (status not in TERMINAL and status not in QUERYING):
                try:
                    res = self._fetch_result(space_id, conversation_id, message_id, query_att)
                    if res:
                        out.update(res)
                        out["statement_id"] = res["statement_id"] or out["statement_id"]
                except Exception as e:
                    if status == "COMPLETED":
                        logger.warning(f"Query result fetch failed: {e}")
                        out["error"] = out["error"] or f"Could not fetch query result: {e}"
        return out


genie_service = GenieService()

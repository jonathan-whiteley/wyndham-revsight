"""Export endpoints."""

import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.excel_service import export_to_excel

logger = logging.getLogger(__name__)
router = APIRouter()


class ExportRequest(BaseModel):
    question: str
    sql: str
    agent_name: str
    columns: List[str]
    rows: List[List[Any]]
    data_as_of: str
    pivot: Optional[Dict[str, Any]] = None
    truncated: bool = False


@router.post("/export/xlsx")
def export_xlsx(request: ExportRequest):
    """Export data to Excel."""
    try:
        excel_data = export_to_excel(
            question=request.question,
            sql=request.sql,
            agent_name=request.agent_name,
            columns=request.columns,
            rows=request.rows,
            data_as_of=request.data_as_of,
            pivot_spec=request.pivot,
            truncated=request.truncated,
        )

        return StreamingResponse(
            iter([excel_data.getvalue()]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=export.xlsx"}
        )
    except Exception as e:
        logger.error(f"Error exporting to Excel: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

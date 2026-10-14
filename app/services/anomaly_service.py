"""Anomaly service for fetching and filtering anomalies."""

import logging
from datetime import date, timedelta
from typing import List, Dict, Any, Optional
from config.settings import fq
from services.sql_service import execute_query

logger = logging.getLogger(__name__)

# Allowlist valid filter values
VALID_CATEGORIES = ["performance", "data_quality"]
VALID_TYPES = ["rgi_drop", "baseline_deviation", "implausible_value", "capacity_violation", "missing_data"]
VALID_SEVERITIES = ["high", "medium", "low"]
VALID_REGIONS = ["Northeast", "Southeast", "South Central", "Midwest", "West", "Canada"]


def get_anomalies(
    category: Optional[str] = None,
    severity: Optional[str] = None,
    type_: Optional[str] = None,
    region: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Fetch anomalies with optional filtering.

    All filters are allowlisted for safety.
    """
    # Validate filters
    filters = []

    if category:
        if category not in VALID_CATEGORIES:
            logger.warning(f"Invalid category: {category}")
            category = None
        elif category == "performance":
            filters.append("a.category = 'performance'")
        elif category == "data_quality":
            filters.append("a.category = 'data_quality'")

    if severity:
        if severity not in VALID_SEVERITIES:
            logger.warning(f"Invalid severity: {severity}")
            severity = None
        elif severity in VALID_SEVERITIES:
            filters.append(f"a.severity = '{severity}'")

    if type_:
        if type_ not in VALID_TYPES:
            logger.warning(f"Invalid type: {type_}")
            type_ = None
        elif type_ in VALID_TYPES:
            filters.append(f"a.anomaly_type = '{type_}'")

    if region:
        if region not in VALID_REGIONS:
            logger.warning(f"Invalid region: {region}")
        else:
            filters.append(f"s.region = '{region}'")

    where_clause = " AND ".join(filters) if filters else "1=1"

    sql = f"""
    SELECT
        a.anomaly_id,
        a.site_id,
        coalesce(s.property_name, a.market) AS property_name,
        s.brand,
        s.chain_scale,
        coalesce(s.market, a.market) AS market,
        a.site_count,
        s.region,
        a.anomaly_type,
        a.category,
        a.start_date,
        a.end_date,
        a.metric,
        a.observed,
        a.expected,
        a.deviation_pct,
        a.zscore,
        a.severity,
        a.description,
        a.suggested_question,
        a.model,
        a.detected_ts
    FROM {fq("anomaly_site_day")} a
    LEFT JOIN {fq("dim_site")} s ON a.site_id = s.site_id
    WHERE {where_clause}
    ORDER BY CASE a.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, a.category DESC, ABS(coalesce(a.deviation_pct, 0)) DESC
    LIMIT {int(limit)}
    """

    try:
        rows, _ = execute_query(sql)
        logger.info(f"Fetched {len(rows)} anomalies")
        return rows
    except Exception as e:
        logger.error(f"Error fetching anomalies: {e}")
        return []


def get_anomaly_series(anomaly_id: str, lookback_days: int = 30, lookahead_days: int = 21) -> Dict[str, Any]:
    """Daily series around an anomaly plus an expected band (trailing 28-day median +/- 20%).

    Site anomalies plot daily RevPAR; market-level missing_data plots NT rows per day.
    """
    rows, _ = execute_query(
        f"SELECT site_id, market, anomaly_type, start_date, end_date FROM {fq('anomaly_site_day')} WHERE anomaly_id = :id",
        {"id": anomaly_id})
    if not rows:
        return {"series": [], "anomaly": None, "metric": None, "error": "Anomaly not found"}
    a = rows[0]
    params = {"start": str(a["start_date"]), "end": str(a["end_date"]),
              "back": lookback_days + 28, "fwd": lookahead_days}
    if a["site_id"]:
        params["site"] = a["site_id"]
        metric = "RevPAR"
        sql = f"""
        SELECT stay_date AS d, CAST(room_revenue / rooms_available AS DOUBLE) AS v
        FROM {fq("fact_sales_occupancy")}
        WHERE site_id = :site AND stay_date BETWEEN date_sub(:start, :back) AND date_add(:end, :fwd)
        ORDER BY stay_date"""
    else:
        params["market"] = a["market"]
        metric = "NT rows reported"
        sql = f"""
        SELECT f.stay_date AS d, CAST(count(*) AS DOUBLE) AS v
        FROM {fq("fact_sales_occupancy")} f JOIN {fq("dim_site")} s USING (site_id)
        WHERE s.market = :market AND f.stay_date BETWEEN date_sub(:start, :back) AND date_add(:end, :fwd)
        GROUP BY f.stay_date ORDER BY f.stay_date"""
    data, _ = execute_query(sql, params)
    pts = [{"date": str(r["d"]), "value": r["v"]} for r in data]
    # Expected = trailing 28-day median of non-anomalous days (computed before the window)
    start = str(a["start_date"]); end = str(a["end_date"])
    import statistics
    out = []
    for i, p in enumerate(pts):
        hist = [q["value"] for q in pts[max(0, i - 28):i] if q["value"] is not None and not (start <= q["date"] <= end)]
        exp = statistics.median(hist) if len(hist) >= 7 else None
        p.update({"expected": exp, "lower": exp * 0.8 if exp is not None else None,
                  "upper": exp * 1.2 if exp is not None else None,
                  "in_window": start <= p["date"] <= end})
        out.append(p)
    first_shown = (date.fromisoformat(start) - timedelta(days=lookback_days)).isoformat()
    out = [p for p in out if p["date"] >= first_shown]
    return {"series": out, "metric": metric,
            "anomaly": {"site_id": a["site_id"], "market": a["market"], "type": a["anomaly_type"], "start_date": start, "end_date": end}}

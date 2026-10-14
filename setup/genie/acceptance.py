"""Runs the demo prompts against both Genie agents and records answers + timings.

Usage: set -a; source config.env; set +a; python3 setup/genie/acceptance.py
Writes docs/design/genie-acceptance-run.json.
"""
import json, os, subprocess, time, pathlib, sys
HERE = pathlib.Path(__file__).parent
OUT = HERE.parent.parent / "docs" / "design" / "genie-acceptance-run.json"
PROFILE = os.environ.get("DATABRICKS_PROFILE", "DEFAULT")
IDS = {"nt": os.environ["GENIE_SPACE_NT"], "str": os.environ["GENIE_SPACE_STR"]}
CHAINS = [
    ("nt", ["RevPAR, ADR and occupancy by chain scale for September 2026 vs September 2025",
            "Split economy by hurricane vs non-hurricane markets",
            "Show RGI vs comp set for that"]),
    ("str", ["Weekly RGI vs comp set by chain scale, hurricane vs non-hurricane, Aug-Sep 2026",
             "Now by brand, Gulf Coast states only, weekly for Aug-Sep 2026",
             "Show it with brands in rows and weeks in columns"]),
    ("str", ["Booking channel by STR comp set"]),
    ("str", ["Which sites had the largest RevPAR index drop vs comp set in the last 8 weeks?"]),
    ("nt", ["Anything that looks like a data issue in September?"]),
    ("nt", ["Show reservations driving pickup at S05512 for Sep 1-15 2026 with channel and travel agent",
            "Pickup by channel for that site, booking date by week"]),
]
def cli(*a):
    r = subprocess.run(["databricks", "genie", *a, "--profile", PROFILE, "-o", "json"], capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr[-400:])
    return json.loads(r.stdout)
def wait(space, conv, msg):
    while True:
        m = cli("get-message", space, conv, msg)
        if m["status"] in ("COMPLETED", "FAILED", "CANCELLED"): return m
        time.sleep(2)
out = []
for model, prompts in CHAINS:
    space, conv = IDS[model], None
    for p in prompts:
        t0 = time.time()
        r = cli("start-conversation", "--no-wait", space, p) if conv is None else cli("create-message", "--no-wait", space, conv, p)
        conv = r.get("conversation_id", conv); mid = r.get("message_id") or r.get("id")
        m = wait(space, conv, mid); dt = round(time.time() - t0, 1)
        rec = {"model": model, "prompt": p, "status": m["status"], "seconds": dt, "sql": None, "text": None, "rows": None}
        for a in m.get("attachments") or []:
            if a.get("query"):
                rec["sql"] = a["query"].get("query"); rec["description"] = a["query"].get("description")
                try:
                    res = cli("get-message-attachment-query-result", space, conv, mid, a["attachment_id"])
                    sr = res["statement_response"]; cols = [c["name"] for c in sr["manifest"]["schema"]["columns"]]
                    rec["rows"] = [dict(zip(cols, row)) for row in (sr.get("result", {}).get("data_array") or [])[:8]]
                    rec["row_count"] = sr["manifest"].get("total_row_count")
                except Exception as e: rec["rows_error"] = str(e)[:200]
            if a.get("text"): rec["text"] = a["text"].get("content")
        if m.get("error"): rec["error"] = m["error"]
        out.append(rec); print(json.dumps(rec)[:1200], flush=True)
OUT.write_text(json.dumps(out, indent=2))

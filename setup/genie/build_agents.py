"""Builds the serialized Genie agent definitions for RevSight IQ (one per metric view). One source for every path:

  - scripts/create_genie_spaces.sh and workspace_deploy set UC_CATALOG/UC_SCHEMA and get nt_agent.json + str_agent.json
  - `python3 setup/genie/build_agents.py --bundle` regenerates resources/revsight.genie_spaces.yml for the bundle,
    with ${var.catalog}.${var.schema} in place of a real schema (run it after editing this file)
"""
import json, os, pathlib, sys

BUNDLE = "--bundle" in sys.argv
C = "${var.catalog}.${var.schema}" if BUNDLE else f"{os.environ['UC_CATALOG']}.{os.environ['UC_SCHEMA']}"
HERE = pathlib.Path(__file__).parent

GLOSSARY = """Wyndham glossary: NT = Nightly Transmission (daily PMS performance per site). STR = Smith Travel Research (CoStar) comp-set benchmarking, weekly, weeks start Sunday. Comp set = the competitor hotels STR benchmarks a site against. Occupancy = rooms sold / rooms available (show as %). ADR = room revenue / rooms sold. RevPAR = room revenue / rooms available. MPI (occupancy index), ARI (ADR index), RGI (RevPAR index): 100 = fair share vs comp set. Chain scale: Economy, Midscale, Upper Midscale, Upscale, Upper Upscale. Hurricane market = Gulf and Atlantic coastal markets (dim column hurricane_market). "Gulf Coast states" means state IN ('FL','TX','LA','MS','AL'). Pickup = reservations booked for a stay window, analyzed by booking_date. Site = a property, ids like S04217.
Follow-ups: a follow-up question ("split that by", "now by brand", "add X", "show it as") keeps ALL filters and time windows from the previous question in the conversation (for example the same months or weeks and the same year-over-year comparison) unless the user changes them. Never drop the time filter on a follow-up. If no time window is given at all, default to the latest complete month (September 2026) compared with the same month last year (September 2025); never aggregate across all years.
Answer style: return the table, then at most 2 short sentences of insight. Never list individual rows, records, reservations or confirmation numbers in the text; the table already shows them. Never use em dashes or en dashes in answers; use colons, commas or parentheses. When a question matches an example query, answer it directly; do not end with a clarifying question (offer one alternative at most). Round currency to 2 decimals, occupancy as a percentage with 1 decimal, indices with 1 decimal. Always compute ratio KPIs with MEASURE() on the metric view, never by averaging site-level ratios. Data runs through 2026-10-04; "last 8 weeks" means the 8 complete weeks ending 2026-10-03; "this year" means 2026."""

NT_TEXT = GLOSSARY + """

You are the Wyndham NT Performance agent (daily grain).
Table guide:
- {C}.mv_nt_performance (metric view): daily site performance. Query with MEASURE(occupancy), MEASURE(adr), MEASURE(revpar), MEASURE(room_revenue), MEASURE(rooms_sold), MEASURE(rooms_available), MEASURE(site_count). Dimensions: stay_date, week_start, month (first day of month, DATE), quarter, year (INT), day_of_week, site_id, property_name, brand, chain_scale, ownership, state, city, market, region, hurricane_market. Filter months with month = DATE'2026-08-01'.
- {C}.fact_reservation: one row per reservation (confirmation_number), 556M rows. Columns: site_id, booking_date, arrival_date, departure_date, nights, rooms, room_revenue, channel (Brand.com, App, OTA-Expedia, OTA-Booking, GDS/Travel Agent, Call Center, Walk-in, Group), travel_agent_iata (only for GDS/Travel Agent), rate_plan, wyndham_rewards_member, status (Stayed, Cancelled, No-show). ALWAYS filter by site_id and/or an arrival_date range (the table is clustered on arrival_date, site_id). Exclude status = 'Cancelled' for pickup unless asked. Limit confirmation-level lists to 500 rows ordered by booking_date.
- {C}.dim_site: site attributes (rooms, open_date, latitude, longitude).
- {C}.anomaly_site_day: detected anomalies (anomaly_type, category performance or data_quality, start_date, end_date, observed, expected, severity, description). Use it for "data issues", "outliers", "anomalies".
Scope: comp-set metrics (comp RevPAR, MPI, ARI, RGI, "vs comp set", "fair share") are NOT in this model. If asked, do not approximate them from NT data. Answer in two sentences: (1) comp-set metrics such as RGI, MPI and ARI come from STR weekly benchmarking, which is not in the NT Performance model; (2) "Switch the Data model to STR Comp Set (weekly) to see this vs the comp set." Always include that second sentence.
Data quality: site S04217 has a known implausible room_revenue on 2026-09-12; when a result looks inflated, mention anomalies in anomaly_site_day."""

STR_TEXT = GLOSSARY + """

You are the Wyndham STR Comp Set agent (weekly grain).
Table guide:
- {C}.mv_str_compset (metric view): own vs comp set per site per week (week_start = Sunday). Measures: MEASURE(occupancy), MEASURE(adr), MEASURE(revpar), MEASURE(comp_occupancy), MEASURE(comp_adr), MEASURE(comp_revpar), MEASURE(mpi), MEASURE(ari), MEASURE(rgi), MEASURE(site_count). Dimensions: week_start, month, year, site_id, property_name, brand, chain_scale, state, market, region, hurricane_market. Incomplete comp weeks are already excluded by the view; never re-add them.
- {C}.dim_site: site attributes.
- {C}.anomaly_site_day: detected anomalies; rgi_drop rows are comp-set performance declines.
Grain rule: compare at week grain only. If the user asks for daily figures, explain STR is weekly and suggest the NT Performance model.
Guardrail: booking channel, rate plan, travel agent / IATA, reservations and pickup do NOT exist at comp-set grain (STR only reports aggregate supply, demand and revenue for the comp set). If asked for any of them "by comp set", do not join or guess. Answer in two sentences: (1) STR reports only aggregate supply, demand and revenue for the comp set, so channel, rate plan and IATA do not exist at that grain; (2) "For your own properties' channel mix, switch the Data model to NT Performance (daily)." Always include that second sentence."""

NT_TEXT, STR_TEXT = NT_TEXT.replace("{C}", C), STR_TEXT.replace("{C}", C)

def ids(prefix):
    n = 0
    while True:
        n += 1
        yield f"{prefix}{n:031x}"

def agent(tables, text, samples, examples):
    sq, ex = ids("1"), ids("2")
    return {
        "version": 2,
        "config": {"sample_questions": [{"id": next(sq), "question": [q]} for q in samples]},
        "data_sources": {"tables": [{"identifier": t} for t in sorted(tables)]},
        "instructions": {
            "text_instructions": [{"id": "3" + "0" * 30 + "1", "content": [text]}],
            "example_question_sqls": [{"id": next(ex), "question": [q], "sql": [s]} for q, s in examples],
        },
    }

NT = agent(
    [f"{C}.mv_nt_performance", f"{C}.fact_reservation", f"{C}.dim_site", f"{C}.anomaly_site_day"],
    NT_TEXT,
    [
        "RevPAR, ADR and occupancy by chain scale for September 2026 vs September 2025",
        "Split economy by hurricane vs non-hurricane markets",
        "Anything that looks like a data issue in September?",
        "Show reservations driving pickup at S05512 for Sep 1-15 2026 with channel and travel agent",
    ],
    [
        ("RevPAR, ADR and occupancy by chain scale for September 2026 vs September 2025",
         f"SELECT chain_scale, year, MEASURE(occupancy) AS occupancy, MEASURE(adr) AS adr, MEASURE(revpar) AS revpar\nFROM {C}.mv_nt_performance\nWHERE month IN (DATE'2025-09-01', DATE'2026-09-01')\nGROUP BY ALL ORDER BY chain_scale, year"),
        ("Split economy by hurricane vs non-hurricane markets",
         f"SELECT hurricane_market, year, MEASURE(occupancy) AS occupancy, MEASURE(adr) AS adr, MEASURE(revpar) AS revpar\nFROM {C}.mv_nt_performance\nWHERE chain_scale = 'Economy' AND month IN (DATE'2025-09-01', DATE'2026-09-01')\nGROUP BY ALL ORDER BY hurricane_market DESC, year"),
        ("Weekly RevPAR by brand for Gulf Coast states, Aug-Sep 2026",
         f"SELECT week_start, brand, MEASURE(revpar) AS revpar, MEASURE(occupancy) AS occupancy\nFROM {C}.mv_nt_performance\nWHERE state IN ('FL','TX','LA','MS','AL') AND stay_date BETWEEN DATE'2026-08-02' AND DATE'2026-09-26'\nGROUP BY ALL ORDER BY week_start, brand"),
        ("Show reservations driving pickup at S05512 for Sep 1-15 2026 with channel and travel agent",
         f"SELECT confirmation_number, booking_date, arrival_date, nights, rooms, channel, travel_agent_iata, rate_plan, room_revenue\nFROM {C}.fact_reservation\nWHERE site_id = 'S05512' AND arrival_date BETWEEN DATE'2026-09-01' AND DATE'2026-09-15' AND status <> 'Cancelled'\nORDER BY booking_date LIMIT 500"),
        ("Pickup by channel for S05512, booking date by week, for arrivals Sep 1-15 2026",
         f"SELECT date_sub(booking_date, dayofweek(booking_date) - 1) AS booking_week, channel, count(*) AS reservations, sum(rooms * nights) AS room_nights, sum(room_revenue) AS revenue\nFROM {C}.fact_reservation\nWHERE site_id = 'S05512' AND arrival_date BETWEEN DATE'2026-09-01' AND DATE'2026-09-15' AND status <> 'Cancelled'\nGROUP BY ALL ORDER BY booking_week, reservations DESC"),
        ("Anything that looks like a data issue in September?",
         f"SELECT a.anomaly_type, a.severity, a.site_id, a.property_name, a.market, a.start_date, a.end_date, a.description\nFROM {C}.anomaly_site_day a\nWHERE a.category = 'data_quality' AND a.start_date <= DATE'2026-09-30' AND a.end_date >= DATE'2026-09-01'\nORDER BY CASE a.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, a.start_date"),
        ("Which hurricane-market sites had the biggest RevPAR decline in September 2026 vs September 2025?",
         f"WITH s AS (\n  SELECT site_id, property_name, market, year, MEASURE(revpar) AS revpar\n  FROM {C}.mv_nt_performance\n  WHERE hurricane_market AND month IN (DATE'2025-09-01', DATE'2026-09-01')\n  GROUP BY ALL)\nSELECT site_id, property_name, market,\n  max(CASE WHEN year = 2025 THEN revpar END) AS revpar_2025,\n  max(CASE WHEN year = 2026 THEN revpar END) AS revpar_2026,\n  max(CASE WHEN year = 2026 THEN revpar END) / max(CASE WHEN year = 2025 THEN revpar END) - 1 AS yoy_change\nFROM s GROUP BY ALL ORDER BY yoy_change ASC LIMIT 20"),
    ],
)

STR = agent(
    [f"{C}.mv_str_compset", f"{C}.dim_site", f"{C}.anomaly_site_day"],
    STR_TEXT,
    [
        "Weekly RGI vs comp set by chain scale, hurricane vs non-hurricane, Aug-Sep 2026",
        "Now by brand, Gulf Coast states only, weekly for Aug-Sep 2026",
        "Which sites had the largest RevPAR index drop vs comp set in the last 8 weeks?",
        "Booking channel by STR comp set",
    ],
    [
        ("Weekly RGI vs comp set by chain scale, hurricane vs non-hurricane, Aug-Sep 2026",
         f"SELECT week_start, chain_scale, hurricane_market, MEASURE(rgi) AS rgi, MEASURE(mpi) AS mpi, MEASURE(ari) AS ari\nFROM {C}.mv_str_compset\nWHERE week_start BETWEEN DATE'2026-08-02' AND DATE'2026-09-27'\nGROUP BY ALL ORDER BY week_start, chain_scale, hurricane_market"),
        ("Weekly RGI vs comp set by brand for Gulf Coast states, Aug-Sep 2026",
         f"SELECT week_start, brand, chain_scale, MEASURE(occupancy) AS occupancy, MEASURE(adr) AS adr, MEASURE(revpar) AS revpar, MEASURE(comp_revpar) AS comp_revpar, MEASURE(rgi) AS rgi\nFROM {C}.mv_str_compset\nWHERE state IN ('FL','TX','LA','MS','AL') AND week_start BETWEEN DATE'2026-08-02' AND DATE'2026-09-27'\nGROUP BY ALL ORDER BY week_start, chain_scale, brand"),
        ("Which sites had the largest RevPAR index drop vs comp set in the last 8 weeks?",
         f"WITH w AS (\n  SELECT site_id, property_name, market,\n    CASE WHEN week_start >= DATE'2026-08-09' THEN 'recent' ELSE 'prior' END AS period,\n    MEASURE(rgi) AS rgi\n  FROM {C}.mv_str_compset\n  WHERE week_start BETWEEN DATE'2026-06-14' AND DATE'2026-09-27'\n  GROUP BY ALL)\nSELECT site_id, property_name, market,\n  max(CASE WHEN period = 'prior' THEN rgi END) AS rgi_prior_8wk,\n  max(CASE WHEN period = 'recent' THEN rgi END) AS rgi_last_8wk,\n  max(CASE WHEN period = 'recent' THEN rgi END) - max(CASE WHEN period = 'prior' THEN rgi END) AS rgi_change\nFROM w GROUP BY ALL ORDER BY rgi_change ASC LIMIT 15"),
        ("Show weekly RGI, MPI and ARI for S01188 vs its comp set from June to September 2026",
         f"SELECT week_start, MEASURE(revpar) AS revpar, MEASURE(comp_revpar) AS comp_revpar, MEASURE(mpi) AS mpi, MEASURE(ari) AS ari, MEASURE(rgi) AS rgi\nFROM {C}.mv_str_compset\nWHERE site_id = 'S01188' AND week_start BETWEEN DATE'2026-06-07' AND DATE'2026-09-27'\nGROUP BY ALL ORDER BY week_start"),
        ("RGI by region for September 2026",
         f"SELECT region, MEASURE(rgi) AS rgi, MEASURE(mpi) AS mpi, MEASURE(ari) AS ari, MEASURE(site_count) AS sites\nFROM {C}.mv_str_compset\nWHERE month = DATE'2026-09-01'\nGROUP BY ALL ORDER BY rgi DESC"),
    ],
)

TITLES = {
    "nt": ("Wyndham NT Performance", "Daily occupancy, ADR and RevPAR for Wyndham sites (RevSight IQ)"),
    "str": ("Wyndham STR Comp Set", "Weekly comp-set benchmarking: RGI, MPI, ARI (RevSight IQ)"),
}

if BUNDLE:
    lines = ["# GENERATED by `python3 setup/genie/build_agents.py --bundle`. Edit build_agents.py, then regenerate.",
             "resources:", "  genie_spaces:"]
    for key, spec in (("nt", NT), ("str", STR)):
        title, desc = TITLES[key]
        lines += [f"    {key}:",
                  f"      title: {json.dumps(title)}",
                  f"      description: {json.dumps(desc)}",
                  "      warehouse_id: ${var.warehouse_id}",
                  "      parent_path: ${workspace.root_path}",
                  f"      serialized_space: {json.dumps(json.dumps(spec))}",
                  "      permissions:",
                  "        - service_principal_name: ${resources.apps.revsight.service_principal_client_id}",
                  "          level: CAN_RUN"]
    out = HERE.parent.parent / "resources" / "revsight.genie_spaces.yml"
    out.parent.mkdir(exist_ok=True)
    out.write_text("\n".join(lines) + "\n")
    print("wrote", out.relative_to(HERE.parent.parent))
else:
    for name, spec in (("nt_agent", NT), ("str_agent", STR)):
        (HERE / f"{name}.json").write_text(json.dumps(spec, indent=2))
        print(name, len(spec["instructions"]["example_question_sqls"]), "examples")

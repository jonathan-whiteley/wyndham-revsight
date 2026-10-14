# Genie acceptance: RevSight IQ (2026-10-06)

Agents: Wyndham NT Performance `01f1c1f3a12c135681e35099eb87cb2a`, Wyndham STR Comp Set `01f1c1f3a21d1a338438c5a06ca2573b`.
Run via `genie/acceptance.py` (Conversation API, follow-ups chained). Raw output: `genie/acceptance_run.json`.

| # | Agent | Prompt | Result | Time |
|---|---|---|---|---|
| 1 | NT | RevPAR, ADR and occupancy by chain scale for September 2026 vs September 2025 | Pass: 10 rows, MEASURE() on mv_nt_performance | 23s |
| 2 | NT | Split economy by hurricane vs non-hurricane markets (follow-up) | Pass after fix: keeps Sep 2026 vs 2025; hurricane RevPAR down, non-hurricane up | 16s |
| 3 | NT | Show RGI vs comp set for that | Pass after fix: redirects "Switch the Data model to STR Comp Set (weekly)" | 6s |
| 4 | STR | Weekly RGI vs comp set by chain scale, hurricane vs non-hurricane, Aug-Sep 2026 | Pass: economy hurricane RGI rises (119.7 wk of Sep 6), midscale falls (~92) | 16s |
| 5 | STR | Now by brand, Gulf Coast states only, weekly | Pass: keeps Aug-Sep window + Gulf states | 16s |
| 6 | STR | Show it with brands in rows and weeks in columns | Pass: pivoted SQL, 20 brands; Days Inn 126.3 high | 23s |
| 7 | STR | Booking channel by STR comp set | Pass after fix: explains grain, points to NT Performance | 6s |
| 8 | STR | Largest RevPAR index drop vs comp set, last 8 weeks | Pass: S01188 Plano first (106.0 to 92.8) | 19s |
| 9 | NT | Anything that looks like a data issue in September? | Pass: S04217 $2.1M night, S02750 capacity, Tampa 43-site gap | 13s |
| 10 | NT | Reservations driving pickup at S05512, Sep 1-15 2026, with channel and travel agent | Pass: 500-row confirmation list from 556M-row table | 16s |
| 11 | NT | Pickup by channel for that site, booking date by week | Pass: Group-led crew pickup | 16s |

Fixes applied during acceptance: no em/en dashes in answers; follow-ups inherit filters; default window = Sep 2026 vs Sep 2025; fixed two-sentence scope redirects in both agents; answer instead of clarifying question when an example matches.

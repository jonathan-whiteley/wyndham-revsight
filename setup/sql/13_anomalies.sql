CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.anomaly_site_day
COMMENT 'Detected performance and data-quality anomalies, last 120 days. model = which Genie agent investigates (nt or str).'
AS
WITH params AS (SELECT DATE'2026-10-04' AS as_of, DATE'2026-06-07' AS win_start),
nt AS (
  SELECT f.*, s.market, s.chain_scale, s.property_name, dayofweek(f.stay_date) AS dow,
         f.room_revenue / f.rooms_available AS revpar,
         f.room_revenue / nullif(f.rooms_sold, 0) AS adr
  FROM {{catalog}}.{{schema}}.fact_sales_occupancy f JOIN {{catalog}}.{{schema}}.dim_site s USING (site_id)
  WHERE f.stay_date >= DATE'2025-10-01'
),
-- 1. implausible values (one row per site-day)
p99 AS (SELECT site_id, percentile_approx(room_revenue, 0.99) AS p99_rev FROM nt GROUP BY site_id),
implausible AS (
  SELECT nt.site_id, nt.market, 'implausible_value' AS anomaly_type, 'data_quality' AS category,
    nt.stay_date AS start_date, nt.stay_date AS end_date, 'room_revenue' AS metric,
    cast(nt.room_revenue AS double) AS observed, cast(p99.p99_rev AS double) AS expected,
    NULL AS zscore, 1 AS site_count
  FROM nt JOIN p99 USING (site_id), params
  WHERE nt.stay_date >= params.win_start AND nt.rooms_sold > 0
    AND (nt.adr > 2000 OR nt.adr < 10 OR nt.room_revenue > 50 * p99.p99_rev)
),
-- 2. capacity violations (grouped per site + week)
capacity AS (
  SELECT site_id, first(market) AS market, 'capacity_violation' AS anomaly_type, 'data_quality' AS category,
    min(stay_date) AS start_date, max(stay_date) AS end_date, 'rooms_sold' AS metric,
    cast(max(rooms_sold) AS double) AS observed, cast(max(rooms_available) AS double) AS expected,
    NULL AS zscore, 1 AS site_count
  FROM nt, params WHERE stay_date >= params.win_start AND rooms_sold > rooms_available
  GROUP BY site_id
),
-- 3. missing NT rows (grouped per market)
spine AS (
  SELECT s.site_id, s.market, d.stay_date
  FROM {{catalog}}.{{schema}}.dim_site s
  CROSS JOIN (SELECT explode(sequence(DATE'2026-06-07', DATE'2026-10-04')) AS stay_date) d
  WHERE d.stay_date >= s.open_date
),
missing_rows AS (
  SELECT sp.* FROM spine sp LEFT ANTI JOIN {{catalog}}.{{schema}}.fact_sales_occupancy f
    ON f.site_id = sp.site_id AND f.stay_date = sp.stay_date
),
missing AS (
  SELECT NULL AS site_id, market, 'missing_data' AS anomaly_type, 'data_quality' AS category,
    min(stay_date) AS start_date, max(stay_date) AS end_date, 'nt_rows' AS metric,
    cast(count(*) AS double) AS observed, cast(0 AS double) AS expected, NULL AS zscore,
    count(DISTINCT site_id) AS site_count
  FROM missing_rows GROUP BY market
),
-- 4. baseline deviation of site RevPAR relative to its market (storm-proof)
mkt AS (SELECT market, chain_scale, stay_date, sum(room_revenue) / sum(rooms_available) AS mkt_revpar FROM nt GROUP BY 1, 2, 3),
rel AS (
  SELECT nt.site_id, nt.market, nt.stay_date, nt.dow, nt.revpar / nullif(m.mkt_revpar, 0) AS r
  FROM nt JOIN mkt m ON m.market = nt.market AND m.chain_scale = nt.chain_scale AND m.stay_date = nt.stay_date
  WHERE nt.adr BETWEEN 10 AND 2000 AND nt.rooms_sold <= nt.rooms_available
),
z AS (
  SELECT *,
    avg(r) OVER w AS mu, stddev(r) OVER w AS sd
  FROM rel
  WINDOW w AS (PARTITION BY site_id, dow ORDER BY stay_date ROWS BETWEEN 8 PRECEDING AND 1 PRECEDING)
),
zf AS (
  SELECT *, (r - mu) / greatest(sd, 0.03) AS zs FROM z, params
  WHERE stay_date >= params.win_start AND abs((r - mu) / greatest(sd, 0.03)) >= 3.5
),
isl AS (
  SELECT *, date_sub(stay_date, cast(row_number() OVER (PARTITION BY site_id, sign(zs) ORDER BY stay_date) AS int)) AS grp FROM zf
),
baseline AS (
  SELECT site_id, first(market) AS market, 'baseline_deviation' AS anomaly_type, 'performance' AS category,
    min(stay_date) AS start_date, max(stay_date) AS end_date, 'revpar_vs_market' AS metric,
    avg(r) AS observed, avg(mu) AS expected, avg(zs) AS zscore, 1 AS site_count
  FROM isl GROUP BY site_id, sign(zs), grp HAVING count(*) >= 3
),
-- 5. RGI drop: last 8 complete weeks vs prior 8
wk AS (
  SELECT site_id, week_start,
    (room_revenue / rooms_available) / (comp_room_revenue / comp_rooms_available) * 100 AS rgi
  FROM {{catalog}}.{{schema}}.fact_site_week_compset
  WHERE complete_data_flag = 'Y' AND week_start BETWEEN DATE'2026-06-07' AND DATE'2026-09-27'
),
rg AS (
  SELECT site_id,
    avg(CASE WHEN week_start >= DATE'2026-08-09' THEN rgi END) AS rgi_recent,
    avg(CASE WHEN week_start < DATE'2026-08-09' THEN rgi END) AS rgi_prior,
    avg(CASE WHEN week_start >= DATE'2026-09-06' THEN rgi END) AS rgi_last4
  FROM wk GROUP BY site_id
),
rgi_drop AS (
  SELECT rg.site_id, s.market, 'rgi_drop' AS anomaly_type, 'performance' AS category,
    DATE'2026-08-09' AS start_date, DATE'2026-10-03' AS end_date, 'rgi' AS metric,
    rgi_recent AS observed, rgi_prior AS expected, NULL AS zscore, 1 AS site_count
  FROM rg JOIN {{catalog}}.{{schema}}.dim_site s USING (site_id)
  WHERE rgi_prior - rgi_recent >= 10 AND rgi_prior - rgi_last4 >= 14
),
allx AS (
  SELECT * FROM implausible UNION ALL SELECT * FROM capacity UNION ALL SELECT * FROM missing
  UNION ALL SELECT * FROM baseline UNION ALL SELECT * FROM rgi_drop
)
SELECT
  md5(concat_ws('|', anomaly_type, coalesce(a.site_id, a.market), cast(start_date AS string))) AS anomaly_id,
  a.site_id, a.market, s.property_name, s.brand, s.chain_scale, s.state, s.region,
  anomaly_type, category, start_date, end_date, metric, observed, expected,
  CASE WHEN expected IS NULL OR expected = 0 THEN NULL ELSE (observed - expected) / expected END AS deviation_pct,
  zscore, site_count,
  CASE
    WHEN anomaly_type IN ('implausible_value','capacity_violation') THEN 'high'
    WHEN anomaly_type = 'missing_data' THEN 'medium'
    WHEN anomaly_type = 'rgi_drop' AND expected - observed >= 12 THEN 'high'
    WHEN anomaly_type = 'rgi_drop' THEN 'medium'
    WHEN anomaly_type = 'baseline_deviation' AND zscore <= -5 THEN 'high'
    WHEN anomaly_type = 'baseline_deviation' AND (zscore < 0 OR zscore >= 10) THEN 'medium'
    ELSE 'low' END AS severity,
  CASE anomaly_type
    WHEN 'implausible_value' THEN concat('Implausible room revenue of $', format_number(observed, 0), ' on one night (site p99 is $', format_number(expected, 0), ')')
    WHEN 'capacity_violation' THEN concat('Rooms sold exceed rooms available (', cast(cast(observed AS int) AS string), ' / ', cast(cast(expected AS int) AS string), ')')
    WHEN 'missing_data' THEN concat('NT missing for ', cast(datediff(end_date, start_date) + 1 AS string), ' days across ', cast(site_count AS string), ' sites')
    WHEN 'rgi_drop' THEN concat('RGI down ', format_number(expected - observed, 1), ' pts over 8 weeks (', format_number(expected, 1), ' to ', format_number(observed, 1), ')')
    ELSE concat('RevPAR vs market ', format_number(abs(zscore), 1), CASE WHEN zscore < 0 THEN ' sigma below' ELSE ' sigma above' END, ' baseline for ', cast(datediff(end_date, start_date) + 1 AS string), ' days')
  END AS description,
  CASE anomaly_type
    WHEN 'implausible_value' THEN concat('Show daily rooms sold, room revenue and ADR for ', a.site_id, ' from ', cast(date_sub(start_date, 7) AS string), ' to ', cast(date_add(end_date, 7) AS string), ', and how much ', cast(start_date AS string), ' changes ', a.market, ' RevPAR for that month')
    WHEN 'capacity_violation' THEN concat('Show daily rooms available and rooms sold for ', a.site_id, ' from ', cast(date_sub(start_date, 7) AS string), ' to ', cast(date_add(end_date, 7) AS string))
    WHEN 'missing_data' THEN concat('Which sites in ', a.market, ' have no NT data between ', cast(start_date AS string), ' and ', cast(end_date AS string), '?')
    WHEN 'rgi_drop' THEN concat('Show weekly RGI, MPI and ARI for ', a.site_id, ' vs its comp set from June to September 2026')
    ELSE concat('Show daily occupancy, ADR and RevPAR for ', a.site_id, ' vs the ', a.market, ' market from ', cast(date_sub(start_date, 14) AS string), ' to ', cast(date_add(end_date, 14) AS string))
  END AS suggested_question,
  CASE WHEN anomaly_type = 'rgi_drop' THEN 'str' ELSE 'nt' END AS model,
  current_timestamp() AS detected_ts
FROM allx a LEFT JOIN {{catalog}}.{{schema}}.dim_site s ON s.site_id = a.site_id;

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.stg_revsight_daily CLUSTER BY (stay_date, site_id) AS
WITH d AS (SELECT explode(sequence(DATE'{{data_start}}', DATE'2026-10-04')) AS stay_date),
x AS (
  SELECT s.site_id, s.chain_scale, s.state, s.hurricane_market, s.rooms, s._adr_2019, s._occ_factor, d.stay_date,
    month(d.stay_date) AS mo, dayofweek(d.stay_date) AS dow, year(d.stay_date) AS yr,
    (pmod(xxhash64(s.site_id, d.stay_date, 'no'), 1000) - 500) / 5000.0 AS n_own,
    (pmod(xxhash64(s.site_id, d.stay_date, 'nc'), 1000) - 500) / 12500.0 AS n_comp,
    (pmod(xxhash64(s.site_id, d.stay_date, 'na'), 1000) - 500) / 12500.0 AS n_adr,
    0.96 + pmod(xxhash64(s.site_id, 'cf'), 1000) / 12500.0 AS comp_f,
    0.97 + pmod(xxhash64(s.site_id, 'ca'), 1000) / 12500.0 AS comp_adr_f,
    (s.hurricane_market AND s.state IN ('FL','TX','LA','MS','AL') AND d.stay_date BETWEEN DATE'2026-08-25' AND DATE'2026-09-20') AS in_storm
  FROM {{catalog}}.{{schema}}.dim_site s CROSS JOIN d
  WHERE d.stay_date >= s.open_date
),
f AS (
  SELECT *,
    CASE chain_scale WHEN 'Economy' THEN 0.60 WHEN 'Midscale' THEN 0.64 WHEN 'Upper Midscale' THEN 0.67 WHEN 'Upscale' THEN 0.70 ELSE 0.72 END AS base_occ,
    CASE WHEN state = 'FL' THEN element_at(array(1.18,1.22,1.25,1.12,0.98,0.95,1.00,0.97,0.85,0.90,0.97,1.05), mo)
         ELSE element_at(array(0.80,0.86,0.96,1.00,1.05,1.12,1.15,1.12,1.02,1.00,0.90,0.82), mo) END AS season,
    CASE WHEN dow IN (6,7) THEN 1.10 WHEN dow = 1 THEN 0.88 ELSE 0.98 END AS dowf,
    CASE WHEN stay_date < DATE'2020-03-15' THEN 1.0 WHEN stay_date < DATE'2020-07-01' THEN 0.40
         WHEN stay_date < DATE'2021-01-01' THEN 0.62 WHEN stay_date < DATE'2021-07-01' THEN 0.78
         WHEN stay_date < DATE'2022-01-01' THEN 0.90 ELSE 1.0 END AS covid_raw,
    CASE WHEN NOT in_storm THEN 0.0
         WHEN stay_date BETWEEN DATE'2026-08-31' AND DATE'2026-09-13' THEN 1.0
         WHEN stay_date < DATE'2026-08-31' THEN datediff(stay_date, DATE'2026-08-24') / 7.0
         ELSE datediff(DATE'2026-09-21', stay_date) / 8.0 END AS ramp,
    CASE WHEN site_id IN ('S01188','S03391','S07425') AND stay_date >= DATE'2026-08-10'
         THEN 1 - 0.22 * least(1.0, datediff(stay_date, DATE'2026-08-10') / 55.0) ELSE 1.0 END AS decline
  FROM x
),
g AS (
  SELECT *,
    CASE WHEN chain_scale = 'Economy' THEN sqrt(covid_raw) ELSE covid_raw END AS covid,
    1 + 0.01 * greatest(0, yr - 2022) AS trend,
    1 - CASE chain_scale WHEN 'Economy' THEN 0.30 WHEN 'Midscale' THEN 0.44 ELSE 0.40 END * ramp AS own_h,
    1 - 0.38 * ramp AS comp_h,
    CASE WHEN yr = 2020 THEN 0.82 WHEN yr = 2021 THEN 0.92 ELSE 1.0 END AS covid_adr
  FROM f
)
SELECT site_id, stay_date, rooms,
  CASE WHEN site_id = 'S05512' AND stay_date BETWEEN DATE'2026-09-01' AND DATE'2026-09-15' THEN 0.97
       WHEN site_id = 'S07711' AND stay_date BETWEEN DATE'2026-09-26' AND DATE'2026-09-28' THEN 0.97
       ELSE least(0.99, greatest(0.05, base_occ * season * dowf * covid * trend * _occ_factor * (1 + n_own) * own_h * decline)) END AS occ_own,
  _adr_2019 * pow(1.035, yr - 2019) * (1 + (season - 1) * 0.5) * CASE WHEN dow IN (6,7) THEN 1.06 ELSE 1.0 END
    * covid_adr * (1 + n_adr) * (1 - 0.06 * ramp)
    * CASE WHEN site_id = 'S07711' AND stay_date BETWEEN DATE'2026-09-26' AND DATE'2026-09-28' THEN 1.6
           WHEN site_id = 'S05512' AND stay_date BETWEEN DATE'2026-09-01' AND DATE'2026-09-15' THEN 1.25 ELSE 1.0 END AS adr_own,
  least(0.99, greatest(0.05, base_occ * season * dowf * covid * trend * comp_f * (1 + n_comp) * comp_h)) AS occ_comp,
  _adr_2019 * comp_adr_f * pow(1.035, yr - 2019) * (1 + (season - 1) * 0.5) * CASE WHEN dow IN (6,7) THEN 1.06 ELSE 1.0 END
    * covid_adr * (1 - 0.06 * ramp) AS adr_comp
FROM g;

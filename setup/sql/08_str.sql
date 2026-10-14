CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.fact_str_weekly_compset CLUSTER BY (week_start, site_id) AS
SELECT site_id, week_start,
  cast(sum(rooms) * k AS bigint) AS comp_rooms_available,
  cast(round(sum(rooms * occ_comp) * k) AS bigint) AS comp_rooms_sold,
  cast(sum(rooms * occ_comp * adr_comp) * k AS decimal(18,2)) AS comp_room_revenue,
  CASE WHEN pmod(xxhash64(site_id, week_start, 'cdf'), 100) < 3 THEN 'N' ELSE 'Y' END AS complete_data_flag
FROM (
  SELECT *, date_sub(stay_date, dayofweek(stay_date) - 1) AS week_start, 4 + pmod(xxhash64(site_id, 'k'), 6) AS k
  FROM {{catalog}}.{{schema}}.stg_revsight_daily
)
GROUP BY site_id, week_start, k
HAVING count(*) = 7;

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.fact_sales_occupancy CLUSTER BY (stay_date, site_id) AS
SELECT site_id, stay_date,
  rooms AS rooms_available,
  cast(least(rooms, round(rooms * occ_own)) AS int) AS rooms_sold,
  cast(least(rooms, round(rooms * occ_own)) * adr_own AS decimal(18,2)) AS room_revenue,
  'Y' AS complete_data_flag,
  cast(date_add(stay_date, 1) AS timestamp) + INTERVAL 2 HOURS AS load_ts
FROM {{catalog}}.{{schema}}.stg_revsight_daily;

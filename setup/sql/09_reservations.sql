CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.fact_reservation CLUSTER BY (arrival_date, site_id) AS
WITH base AS (
  SELECT site_id, stay_date AS arrival_date, adr_own,
    (site_id = 'S05512' AND stay_date BETWEEN DATE'2026-09-01' AND DATE'2026-09-15') AS spike,
    cast(round(rooms * occ_own * 0.38) AS int) AS n
  FROM {{catalog}}.{{schema}}.stg_revsight_daily
),
e AS (
  SELECT site_id, arrival_date, adr_own, spike, k, xxhash64(site_id, arrival_date, k) AS h
  FROM base LATERAL VIEW explode(sequence(1, greatest(n, 1))) t AS k
  WHERE n > 0
),
u AS (
  SELECT *,
    pmod(xxhash64(h, 1), 10000) / 10000.0 AS u1,
    pmod(xxhash64(h, 2), 10000) / 10000.0 AS u2,
    pmod(xxhash64(h, 3), 10000) / 10000.0 AS u3,
    pmod(xxhash64(h, 4), 10000) / 10000.0 AS u4,
    pmod(xxhash64(h, 5), 10000) / 10000.0 AS u5,
    pmod(xxhash64(h, 6), 10000) / 10000.0 AS u6
  FROM e
),
c AS (
  SELECT *,
    CASE WHEN spike THEN CASE WHEN u3 < 0.41 THEN 'Group' WHEN u3 < 0.58 THEN 'OTA-Expedia' WHEN u3 < 0.74 THEN 'OTA-Booking'
                              WHEN u3 < 0.86 THEN 'GDS/Travel Agent' WHEN u3 < 0.93 THEN 'Brand.com' ELSE 'Call Center' END
         ELSE CASE WHEN u3 < 0.22 THEN 'Brand.com' WHEN u3 < 0.32 THEN 'App' WHEN u3 < 0.50 THEN 'OTA-Expedia'
                   WHEN u3 < 0.60 THEN 'OTA-Booking' WHEN u3 < 0.70 THEN 'GDS/Travel Agent' WHEN u3 < 0.78 THEN 'Call Center'
                   WHEN u3 < 0.85 THEN 'Walk-in' ELSE 'Group' END END AS channel,
    CASE WHEN u1 < 0.38 THEN 1 WHEN u1 < 0.70 THEN 2 WHEN u1 < 0.86 THEN 3 WHEN u1 < 0.94 THEN 4 WHEN u1 < 0.98 THEN 5 ELSE 7 END
      + CASE WHEN spike THEN 2 ELSE 0 END AS nights,
    CASE WHEN spike THEN cast(floor(u2 * 7) AS int) ELSE cast(floor(u2 * u2 * 90) AS int) END AS lead_days
  FROM u
)
SELECT
  concat('WY', upper(lpad(conv(cast(pmod(h, 3656158440062976) AS string), 10, 36), 10, '0'))) AS confirmation_number,
  site_id,
  date_sub(arrival_date, CASE WHEN channel = 'Walk-in' THEN 0 ELSE lead_days END) AS booking_date,
  arrival_date,
  date_add(arrival_date, nights) AS departure_date,
  nights,
  CASE WHEN channel = 'Group' THEN 1 + cast(floor(u4 * 6) AS int) WHEN u4 < 0.95 THEN 1 ELSE 2 END AS rooms,
  cast(adr_own * nights * (CASE WHEN channel = 'Group' THEN 1 + cast(floor(u4 * 6) AS int) WHEN u4 < 0.95 THEN 1 ELSE 2 END)
       * CASE WHEN channel = 'Group' THEN 0.85 WHEN channel LIKE 'OTA%' THEN 1.03 ELSE 1.0 END AS decimal(18,2)) AS room_revenue,
  channel,
  CASE WHEN channel = 'GDS/Travel Agent' THEN concat(lpad(cast(pmod(h, 90) + 10 AS string), 2, '0'), '-', cast(pmod(xxhash64(h, 9), 10) AS string), ' ', lpad(cast(pmod(xxhash64(h, 8), 10000) AS string), 4, '0')) END AS travel_agent_iata,
  CASE WHEN channel = 'Group' THEN 'Group'
       WHEN channel = 'GDS/Travel Agent' THEN CASE WHEN spike OR u5 < 0.25 THEN 'Gov' ELSE 'Corporate' END
       WHEN u5 < 0.45 THEN 'BAR' WHEN u5 < 0.55 THEN 'AAA' WHEN u5 < 0.80 THEN 'Wyndham Rewards'
       WHEN u5 < 0.85 THEN 'Package' WHEN u5 < 0.95 THEN 'Corporate' ELSE 'Gov' END AS rate_plan,
  (u5 BETWEEN 0.55 AND 0.80) OR u6 < 0.20 AS wyndham_rewards_member,
  CASE WHEN u6 > 0.89 AND channel <> 'Walk-in' THEN 'Cancelled' WHEN u6 > 0.87 AND channel <> 'Walk-in' THEN 'No-show' ELSE 'Stayed' END AS status,
  cast(date_sub(arrival_date, CASE WHEN channel = 'Walk-in' THEN 0 ELSE lead_days END) AS timestamp) + make_interval(0,0,0,0, cast(u6 * 23 AS int), cast(u2 * 59 AS int), 0) AS last_modified_ts
FROM c;

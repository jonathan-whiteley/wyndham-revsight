DELETE FROM {{catalog}}.{{schema}}.fact_sales_occupancy WHERE stay_date BETWEEN DATE'2026-09-09' AND DATE'2026-09-13'
  AND site_id IN (SELECT site_id FROM {{catalog}}.{{schema}}.dim_site WHERE market = 'Tampa / St Petersburg' AND pmod(xxhash64(site_id, 'gap'), 5) = 0);

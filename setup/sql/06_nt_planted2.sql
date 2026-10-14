UPDATE {{catalog}}.{{schema}}.fact_sales_occupancy SET rooms_sold = rooms_available + 16 WHERE site_id = 'S02750' AND stay_date BETWEEN DATE'2026-09-14' AND DATE'2026-09-20';

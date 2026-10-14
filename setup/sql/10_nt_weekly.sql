CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.fact_site_week_compset CLUSTER BY (week_start, site_id)
COMMENT 'Own NT performance rolled to STR week grain (Sunday start), side by side with the STR comp set'
AS
SELECT c.site_id, c.week_start,
  n.rooms_available, n.rooms_sold, n.room_revenue,
  c.comp_rooms_available, c.comp_rooms_sold, c.comp_room_revenue, c.complete_data_flag
FROM {{catalog}}.{{schema}}.fact_str_weekly_compset c
JOIN (
  SELECT site_id, date_sub(stay_date, dayofweek(stay_date) - 1) AS week_start,
         sum(rooms_available) rooms_available, sum(rooms_sold) rooms_sold, sum(room_revenue) room_revenue
  FROM {{catalog}}.{{schema}}.fact_sales_occupancy GROUP BY 1, 2
) n ON n.site_id = c.site_id AND n.week_start = c.week_start;

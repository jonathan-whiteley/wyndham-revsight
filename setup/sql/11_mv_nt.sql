CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.mv_nt_performance
WITH METRICS LANGUAGE YAML
COMMENT 'NT (Nightly Transmission) daily property performance: occupancy, ADR, RevPAR at any grain'
AS $$
version: 1.1
comment: "NT (Nightly Transmission) daily site performance from the PMS. Grain: site x stay_date. Ratio measures re-aggregate correctly at any grain."
source: {{catalog}}.{{schema}}.fact_sales_occupancy
joins:
  - name: site
    source: {{catalog}}.{{schema}}.dim_site
    on: source.site_id = site.site_id
dimensions:
  - name: stay_date
    expr: source.stay_date
    comment: "Night of stay"
  - name: week_start
    expr: date_sub(source.stay_date, dayofweek(source.stay_date) - 1)
    comment: "Week starting Sunday (STR convention)"
  - name: month
    expr: DATE_TRUNC('MONTH', source.stay_date)
  - name: quarter
    expr: DATE_TRUNC('QUARTER', source.stay_date)
  - name: year
    expr: year(source.stay_date)
  - name: day_of_week
    expr: date_format(source.stay_date, 'EEEE')
  - name: site_id
    expr: source.site_id
  - name: property_name
    expr: site.property_name
  - name: brand
    expr: site.brand
  - name: chain_scale
    expr: site.chain_scale
    comment: "Economy, Midscale, Upper Midscale, Upscale, Upper Upscale"
  - name: ownership
    expr: site.ownership
  - name: state
    expr: site.state
  - name: city
    expr: site.city
  - name: market
    expr: site.market
    comment: "STR-style market"
  - name: region
    expr: site.region
  - name: hurricane_market
    expr: site.hurricane_market
    comment: "True for Gulf and Atlantic coastal markets exposed to hurricanes"
measures:
  - name: rooms_available
    expr: SUM(source.rooms_available)
  - name: rooms_sold
    expr: SUM(source.rooms_sold)
  - name: room_revenue
    expr: SUM(source.room_revenue)
  - name: occupancy
    expr: SUM(source.rooms_sold) / SUM(source.rooms_available)
    comment: "Rooms sold / rooms available (0-1)"
  - name: adr
    expr: SUM(source.room_revenue) / NULLIF(SUM(source.rooms_sold), 0)
    comment: "Average daily rate: room revenue / rooms sold"
  - name: revpar
    expr: SUM(source.room_revenue) / SUM(source.rooms_available)
    comment: "Revenue per available room: room revenue / rooms available"
  - name: site_count
    expr: COUNT(DISTINCT source.site_id)
$$;

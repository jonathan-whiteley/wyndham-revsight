CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.mv_str_compset
WITH METRICS LANGUAGE YAML
COMMENT 'STR comp set weekly benchmarking: own vs comp set occupancy, ADR, RevPAR and MPI/ARI/RGI indices'
AS $$
version: 1.1
comment: "STR weekly comp-set benchmarking. Grain: site x week_start (Sunday). Incomplete comp weeks (complete_data_flag = 'N') are excluded automatically."
source: {{catalog}}.{{schema}}.fact_site_week_compset
filter: complete_data_flag = 'Y'
joins:
  - name: site
    source: {{catalog}}.{{schema}}.dim_site
    on: source.site_id = site.site_id
dimensions:
  - name: week_start
    expr: source.week_start
    comment: "Week starting Sunday"
  - name: month
    expr: DATE_TRUNC('MONTH', source.week_start)
  - name: year
    expr: year(source.week_start)
  - name: site_id
    expr: source.site_id
  - name: property_name
    expr: site.property_name
  - name: brand
    expr: site.brand
  - name: chain_scale
    expr: site.chain_scale
  - name: state
    expr: site.state
  - name: market
    expr: site.market
  - name: region
    expr: site.region
  - name: hurricane_market
    expr: site.hurricane_market
measures:
  - name: occupancy
    expr: SUM(source.rooms_sold) / SUM(source.rooms_available)
  - name: adr
    expr: SUM(source.room_revenue) / NULLIF(SUM(source.rooms_sold), 0)
  - name: revpar
    expr: SUM(source.room_revenue) / SUM(source.rooms_available)
  - name: comp_occupancy
    expr: SUM(source.comp_rooms_sold) / SUM(source.comp_rooms_available)
  - name: comp_adr
    expr: SUM(source.comp_room_revenue) / NULLIF(SUM(source.comp_rooms_sold), 0)
  - name: comp_revpar
    expr: SUM(source.comp_room_revenue) / SUM(source.comp_rooms_available)
  - name: mpi
    expr: 100 * (SUM(source.rooms_sold) / SUM(source.rooms_available)) / (SUM(source.comp_rooms_sold) / SUM(source.comp_rooms_available))
    comment: "Market Penetration Index (occupancy index), 100 = fair share"
  - name: ari
    expr: 100 * (SUM(source.room_revenue) / NULLIF(SUM(source.rooms_sold), 0)) / (SUM(source.comp_room_revenue) / NULLIF(SUM(source.comp_rooms_sold), 0))
    comment: "Average Rate Index (ADR index), 100 = parity"
  - name: rgi
    expr: 100 * (SUM(source.room_revenue) / SUM(source.rooms_available)) / (SUM(source.comp_room_revenue) / SUM(source.comp_rooms_available))
    comment: "Revenue Generation Index (RevPAR index), 100 = fair share"
  - name: site_count
    expr: COUNT(DISTINCT source.site_id)
$$;

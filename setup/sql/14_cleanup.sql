CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.dim_site COMMENT 'Wyndham site (property) dimension: brand, chain scale, geography, hurricane-market flag' AS
SELECT site_id, property_name, brand, chain_scale, state, city, market, region, hurricane_market, rooms, open_date, ownership, latitude, longitude
FROM {{catalog}}.{{schema}}.dim_site;

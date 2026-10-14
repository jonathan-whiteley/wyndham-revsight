MERGE INTO {{catalog}}.{{schema}}.dim_site t
USING (SELECT * FROM VALUES
  ('S04217','Days Inn by Wyndham Gulfport','Days Inn','Economy','MS','Gulfport','Biloxi-Gulfport','Southeast',true,84,30.37,-89.09,74.0),
  ('S06034','Wyndham Garden Fort Walton Beach','Wyndham Garden','Upscale','FL','Fort Walton Beach','Florida Panhandle','Southeast',true,140,30.42,-86.62,150.0),
  ('S05512','Days Inn by Wyndham Lake Charles','Days Inn','Economy','LA','Lake Charles','Lake Charles','South Central',true,110,30.23,-93.22,70.0),
  ('S01188','La Quinta Inn & Suites by Wyndham Plano','La Quinta','Midscale','TX','Plano','Dallas','South Central',false,120,33.02,-96.70,104.0),
  ('S03391','Baymont by Wyndham Columbus North','Baymont','Midscale','OH','Columbus','Columbus','Midwest',false,90,40.06,-83.00,84.0),
  ('S07425','Ramada by Wyndham Phoenix West','Ramada','Upper Midscale','AZ','Phoenix','Phoenix','West',false,150,33.45,-112.20,108.0),
  ('S02750','Super 8 by Wyndham Lafayette','Super 8','Economy','LA','Lafayette','Lafayette','South Central',true,96,30.22,-92.02,66.0),
  ('S07711','Ramada by Wyndham Nashville Downtown','Ramada','Upper Midscale','TN','Nashville','Nashville','Southeast',false,160,36.16,-86.78,135.0)
  AS s(site_id, property_name, brand, chain_scale, state, city, market, region, hurricane_market, rooms, latitude, longitude, adr)) s
ON t.site_id = s.site_id
WHEN MATCHED THEN UPDATE SET property_name=s.property_name, brand=s.brand, chain_scale=s.chain_scale, state=s.state, city=s.city,
  market=s.market, region=s.region, hurricane_market=s.hurricane_market, rooms=s.rooms, latitude=s.latitude, longitude=s.longitude,
  _adr_2019=s.adr, open_date=DATE'2005-06-01';

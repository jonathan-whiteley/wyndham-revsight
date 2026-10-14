CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.dim_site AS
WITH m AS (
  SELECT * FROM VALUES
  -- market, city, state, region, hurricane, lat, lng, weight, adr_factor
  ('Houston','Houston','TX','South Central',true,29.76,-95.37,260,1.00),
  ('Galveston','Galveston','TX','South Central',true,29.30,-94.80,60,1.05),
  ('Corpus Christi','Corpus Christi','TX','South Central',true,27.80,-97.40,90,0.95),
  ('Beaumont / Port Arthur','Beaumont','TX','South Central',true,30.08,-94.13,70,0.88),
  ('Lake Charles','Lake Charles','LA','South Central',true,30.23,-93.22,70,0.90),
  ('Lafayette','Lafayette','LA','South Central',true,30.22,-92.02,80,0.88),
  ('New Orleans','New Orleans','LA','South Central',true,29.95,-90.07,160,1.20),
  ('Baton Rouge','Baton Rouge','LA','South Central',true,30.45,-91.15,90,0.92),
  ('Biloxi-Gulfport','Gulfport','MS','Southeast',true,30.37,-89.09,90,0.92),
  ('Mobile','Mobile','AL','Southeast',true,30.69,-88.04,80,0.90),
  ('Gulf Shores','Gulf Shores','AL','Southeast',true,30.25,-87.70,50,1.10),
  ('Pensacola','Pensacola','FL','Southeast',true,30.42,-87.22,80,1.00),
  ('Florida Panhandle','Fort Walton Beach','FL','Southeast',true,30.42,-86.62,90,1.10),
  ('Tampa / St Petersburg','Tampa','FL','Southeast',true,27.95,-82.46,200,1.05),
  ('Sarasota / Bradenton','Sarasota','FL','Southeast',true,27.34,-82.53,70,1.10),
  ('Fort Myers / Naples','Fort Myers','FL','Southeast',true,26.64,-81.87,90,1.15),
  ('Miami','Miami','FL','Southeast',true,25.76,-80.19,220,1.35),
  ('Fort Lauderdale','Fort Lauderdale','FL','Southeast',true,26.12,-80.14,120,1.20),
  ('Jacksonville','Jacksonville','FL','Southeast',true,30.33,-81.66,130,0.95),
  ('Savannah','Savannah','GA','Southeast',true,32.08,-81.09,70,1.05),
  ('Charleston','Charleston','SC','Southeast',true,32.78,-79.93,80,1.20),
  ('Myrtle Beach','Myrtle Beach','SC','Southeast',true,33.69,-78.89,110,1.00),
  ('Wilmington','Wilmington','NC','Southeast',true,34.23,-77.94,60,1.00),
  ('Orlando','Orlando','FL','Southeast',false,28.54,-81.38,300,1.10),
  ('Dallas','Dallas','TX','South Central',false,32.78,-96.80,280,1.00),
  ('Austin','Austin','TX','South Central',false,30.27,-97.74,150,1.10),
  ('San Antonio','San Antonio','TX','South Central',false,29.42,-98.49,170,0.98),
  ('Oklahoma City','Oklahoma City','OK','South Central',false,35.47,-97.52,110,0.85),
  ('Little Rock','Little Rock','AR','South Central',false,34.75,-92.29,70,0.85),
  ('Atlanta','Atlanta','GA','Southeast',false,33.75,-84.39,280,1.05),
  ('Nashville','Nashville','TN','Southeast',false,36.16,-86.78,170,1.25),
  ('Memphis','Memphis','TN','Southeast',false,35.15,-90.05,100,0.88),
  ('Charlotte','Charlotte','NC','Southeast',false,35.23,-80.84,150,1.00),
  ('Raleigh-Durham','Raleigh','NC','Southeast',false,35.78,-78.64,110,1.00),
  ('Birmingham','Birmingham','AL','Southeast',false,33.52,-86.80,90,0.88),
  ('Louisville','Louisville','KY','Southeast',false,38.25,-85.76,90,0.92),
  ('Richmond','Richmond','VA','Northeast',false,37.54,-77.44,90,0.95),
  ('Washington DC','Washington','DC','Northeast',false,38.91,-77.04,220,1.35),
  ('Baltimore','Baltimore','MD','Northeast',false,39.29,-76.61,110,1.05),
  ('Philadelphia','Philadelphia','PA','Northeast',false,39.95,-75.17,160,1.15),
  ('Pittsburgh','Pittsburgh','PA','Northeast',false,40.44,-79.99,90,0.95),
  ('New York','New York','NY','Northeast',false,40.71,-74.01,260,1.70),
  ('Boston','Boston','MA','Northeast',false,42.36,-71.06,150,1.45),
  ('Hartford','Hartford','CT','Northeast',false,41.76,-72.69,60,1.00),
  ('Chicago','Chicago','IL','Midwest',false,41.88,-87.63,280,1.20),
  ('Detroit','Detroit','MI','Midwest',false,42.33,-83.05,140,0.92),
  ('Columbus','Columbus','OH','Midwest',false,39.96,-83.00,110,0.92),
  ('Cleveland','Cleveland','OH','Midwest',false,41.50,-81.69,100,0.90),
  ('Cincinnati','Cincinnati','OH','Midwest',false,39.10,-84.51,90,0.92),
  ('Indianapolis','Indianapolis','IN','Midwest',false,39.77,-86.16,110,0.92),
  ('St Louis','St Louis','MO','Midwest',false,38.63,-90.20,120,0.92),
  ('Kansas City','Kansas City','MO','Midwest',false,39.10,-94.58,110,0.92),
  ('Minneapolis-St Paul','Minneapolis','MN','Midwest',false,44.98,-93.27,140,1.00),
  ('Milwaukee','Milwaukee','WI','Midwest',false,43.04,-87.91,80,0.92),
  ('Omaha','Omaha','NE','Midwest',false,41.26,-95.93,70,0.88),
  ('Des Moines','Des Moines','IA','Midwest',false,41.59,-93.62,60,0.86),
  ('Denver','Denver','CO','West',false,39.74,-104.99,170,1.10),
  ('Phoenix','Phoenix','AZ','West',false,33.45,-112.07,220,1.00),
  ('Tucson','Tucson','AZ','West',false,32.22,-110.97,80,0.92),
  ('Las Vegas','Las Vegas','NV','West',false,36.17,-115.14,180,1.15),
  ('Salt Lake City','Salt Lake City','UT','West',false,40.76,-111.89,100,1.00),
  ('Albuquerque','Albuquerque','NM','West',false,35.08,-106.65,80,0.88),
  ('Boise','Boise','ID','West',false,43.62,-116.20,50,0.95),
  ('Los Angeles','Los Angeles','CA','West',false,34.05,-118.24,260,1.40),
  ('San Diego','San Diego','CA','West',false,32.72,-117.16,150,1.35),
  ('San Francisco Bay','San Francisco','CA','West',false,37.77,-122.42,170,1.55),
  ('Sacramento','Sacramento','CA','West',false,38.58,-121.49,90,1.05),
  ('Seattle','Seattle','WA','West',false,47.61,-122.33,140,1.30),
  ('Portland','Portland','OR','West',false,45.52,-122.68,100,1.10),
  ('Toronto','Toronto','ON','Canada',false,43.65,-79.38,120,1.20),
  ('Calgary','Calgary','AB','Canada',false,51.05,-114.07,60,1.00),
  ('Vancouver','Vancouver','BC','Canada',false,49.28,-123.12,70,1.30)
  AS t(market, city, state, region, hurricane_market, lat, lng, weight, adr_factor)
),
mw AS (
  SELECT *, SUM(weight) OVER (ORDER BY market ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_hi,
         SUM(weight) OVER () AS total_w FROM m
),
b AS (
  SELECT * FROM VALUES
  ('Days Inn','Economy',180,70,75), ('Super 8','Economy',170,70,65), ('Microtel','Economy',70,75,72),
  ('Travelodge','Economy',60,65,66), ('Howard Johnson','Economy',40,80,70), ('Echo Suites','Economy',15,124,78),
  ('La Quinta','Midscale',150,110,98), ('Baymont','Midscale',90,80,86), ('AmericInn','Midscale',60,75,95),
  ('Wingate','Midscale',50,95,102), ('Hawthorn Suites','Midscale',25,90,104),
  ('Ramada','Upper Midscale',60,140,112), ('Trademark','Upper Midscale',30,110,118), ('WaterWalk','Upper Midscale',8,120,125),
  ('Wyndham Garden','Upscale',40,150,135), ('Wyndham','Upscale',30,220,160), ('Registry','Upper Upscale',10,180,215),
  ('Wyndham Grand','Upper Upscale',12,300,230), ('Dolce','Upper Upscale',6,220,240), ('Esplendor','Upper Upscale',4,120,210)
  AS t(brand, chain_scale, weight, rooms_avg, adr_base)
),
bw AS (SELECT *, SUM(weight) OVER (ORDER BY brand ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_hi, SUM(weight) OVER () AS total_w FROM b),
n AS (SELECT id FROM (SELECT explode(sequence(1, 9000)) AS id)),
r AS (
  SELECT id,
    pmod(xxhash64('mkt', id), 1000000) / 1000000.0 AS um,
    pmod(xxhash64('brd', id), 1000000) / 1000000.0 AS ub,
    pmod(xxhash64('rms', id), 1000000) / 1000000.0 AS ur,
    pmod(xxhash64('opn', id), 1000000) / 1000000.0 AS uo,
    pmod(xxhash64('own', id), 1000000) / 1000000.0 AS uw,
    pmod(xxhash64('sfx', id), 8) AS sfx
  FROM n
),
s AS (
  SELECT r.*, mw.market, mw.city, mw.state, mw.region, mw.hurricane_market, mw.lat, mw.lng, mw.adr_factor,
         bw.brand, bw.chain_scale, bw.rooms_avg, bw.adr_base
  FROM r
  JOIN mw ON r.um * mw.total_w < mw.cum_hi AND r.um * mw.total_w >= mw.cum_hi - mw.weight
  JOIN bw ON r.ub * bw.total_w < bw.cum_hi AND r.ub * bw.total_w >= bw.cum_hi - bw.weight
)
SELECT
  concat('S', lpad(cast(id AS string), 5, '0')) AS site_id,
  concat(CASE WHEN brand IN ('Wyndham','Wyndham Garden','Wyndham Grand') THEN brand
              WHEN brand = 'La Quinta' THEN 'La Quinta Inn & Suites by Wyndham'
              ELSE concat(brand, ' by Wyndham') END,
         ' ', city,
         element_at(array('', ' Airport', ' Downtown', ' North', ' West', ' Convention Center', ' I-10', ' East'), cast(sfx AS int) + 1)) AS property_name,
  brand, chain_scale, state, city, market, region, hurricane_market,
  cast(greatest(30, round(rooms_avg * (0.6 + ur * 0.8))) AS int) AS rooms,
  date_add(DATE'1985-01-01', cast(CASE WHEN uo < 0.93 THEN uo / 0.93 * 12000 ELSE 12053 + (uo - 0.93) / 0.07 * 2400 END AS int)) AS open_date,
  CASE WHEN uw < 0.88 THEN 'franchised' ELSE 'managed' END AS ownership,
  round(lat + (pmod(xxhash64('la', id), 1000) - 500) / 5000.0, 5) AS latitude,
  round(lng + (pmod(xxhash64('lo', id), 1000) - 500) / 5000.0, 5) AS longitude,
  cast(adr_base * adr_factor * (0.88 + pmod(xxhash64('adr', id), 1000) / 4000.0) AS double) AS _adr_2019,
  cast(0.92 + pmod(xxhash64('occ', id), 1000) / 6250.0 AS double) AS _occ_factor
FROM s;

SELECT
  valley_id,
  valley_name,
  purpose,
  ST_AREA(geom) / 1000000 AS area_km2
FROM
  `gcp-geoai-sandbox.drr_poc.v_yakatabaru_valley_aoi`;
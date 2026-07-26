SELECT
  phenomenon_type_ja,
  zone_type_ja,
  COUNT(*) AS n_zones,
  SUM(ST_AREA(geom)) / 1000000 AS zone_area_km2
FROM
  `gcp-geoai-sandbox.drr_poc.v_yakatabaru_sediment_hazard`
GROUP BY
  phenomenon_type_ja,
  zone_type_ja
ORDER BY
  phenomenon_type_ja,
  zone_type_ja;
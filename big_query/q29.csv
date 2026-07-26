SELECT
  COUNT(*) AS n_zones,
  COUNTIF(geom IS NOT NULL) AS n_valid_geom,
  phenomenon_type_ja,
  zone_type_ja,
  COUNT(*) AS n
FROM
  `gcp-geoai-sandbox.drr_poc.v_ref_sediment_hazard_kitagawa`
GROUP BY
  phenomenon_type_ja,
  zone_type_ja
ORDER BY
  phenomenon_type_ja,
  zone_type_ja;
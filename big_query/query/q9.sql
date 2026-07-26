SELECT
  COUNT(*) AS n,
  COUNTIF(wkt IS NOT NULL) AS n_wkt,
  phenomenon_type_ja,
  zone_type_ja,
  COUNT(*) AS n_by_type
FROM
  `gcp-geoai-sandbox.drr_poc.qgis_sediment_hazard_export_v1`
GROUP BY
  phenomenon_type_ja,
  zone_type_ja
ORDER BY
  phenomenon_type_ja,
  zone_type_ja;
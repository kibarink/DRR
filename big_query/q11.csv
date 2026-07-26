SELECT
  COUNT(*) AS n,
  COUNTIF(wkt IS NOT NULL) AS n_wkt,
  validation_status,
  COUNT(*) AS n_by_status
FROM
  `gcp-geoai-sandbox.drr_poc.qgis_candidate_validation_export_v1`
GROUP BY
  validation_status;
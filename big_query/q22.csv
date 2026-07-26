SELECT
  cluster_id,
  validation_status,
  COUNT(*) AS candidate_count,
  SUM(overlap_area_km2) AS overlap_area_km2,
  AVG(overlap_ratio) AS avg_overlap_ratio
FROM
  `gcp-geoai-sandbox.drr_poc.v_candidate_hazard_validation_status_v1`
GROUP BY
  cluster_id,
  validation_status
ORDER BY
  cluster_id,
  validation_status;
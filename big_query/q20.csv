SELECT
  validation_status,
  validation_label_ja,
  COUNT(*) AS candidate_count,
  AVG(overlap_ratio) AS avg_overlap_ratio
FROM
  `gcp-geoai-sandbox.drr_poc.v_map_candidate_validation_v1`
GROUP BY
  validation_status,
  validation_label_ja
ORDER BY
  validation_status;
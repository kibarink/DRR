SELECT
  cluster_id,
  COUNT(DISTINCT candidate_id) AS candidates_with_overlap,
  SUM(hazard_zone_count) AS total_hazard_zone_intersections,
  SUM(special_warning_zone_count) AS total_special_warning_zone_intersections,
  SUM(overlap_area_km2) AS overlap_area_km2,
  AVG(overlap_ratio) AS avg_overlap_ratio,
  STRING_AGG(DISTINCT phenomenon_types, ' / ' LIMIT 10) AS phenomenon_type_summary
FROM
  `gcp-geoai-sandbox.drr_poc.v_candidate_sediment_hazard_overlap_v1`
GROUP BY
  cluster_id
ORDER BY
  overlap_area_km2 DESC;
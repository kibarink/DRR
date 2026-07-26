CREATE OR REPLACE VIEW
  `gcp-geoai-sandbox.drr_poc.v_map_candidate_validation_v1`
AS
SELECT
  candidate_id,
  cluster_id,
  geom,
  centroid_geom,

  validation_status,
  hazard_zone_count,
  warning_zone_count,
  special_warning_zone_count,
  overlap_area_km2,
  overlap_ratio,

  phenomenon_types,
  zone_types,
  zone_names,
  location_names,

  CASE
    WHEN validation_status = 'known_risk_aligned'
      THEN '既存警戒区域と高整合'
    WHEN validation_status = 'partial_overlap'
      THEN '既存警戒区域と一部重複'
    WHEN validation_status = 'outside_existing_hazard_zone'
      THEN '既存警戒区域外の確認候補'
    ELSE '未分類'
  END AS validation_label_ja
FROM
  `gcp-geoai-sandbox.drr_poc.v_candidate_hazard_validation_status_v1`;
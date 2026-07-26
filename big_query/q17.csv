CREATE OR REPLACE VIEW
  `gcp-geoai-sandbox.drr_poc.v_map_candidate_and_hazard_overlay_v1`
AS

-- 1. GPP/GeoAI candidate polygons
SELECT
  geom,
  'candidate' AS map_layer,
  validation_status AS style_class,
  validation_label_ja AS label_ja,
  CAST(candidate_id AS STRING) AS feature_id,
  CAST(cluster_id AS STRING) AS cluster_id,
  overlap_ratio,
  phenomenon_types,
  zone_types,
  zone_names,
  location_names
FROM
  `gcp-geoai-sandbox.drr_poc.v_map_candidate_validation_v1`

UNION ALL

-- 2. Existing sediment hazard zones
SELECT
  geom,
  'sediment_hazard_zone' AS map_layer,
  zone_type_ja AS style_class,
  zone_type_ja AS label_ja,
  zone_id AS feature_id,
  NULL AS cluster_id,
  NULL AS overlap_ratio,
  phenomenon_type_ja AS phenomenon_types,
  zone_type_ja AS zone_types,
  zone_name AS zone_names,
  location_name AS location_names
FROM
  `gcp-geoai-sandbox.drr_poc.v_ref_sediment_hazard_kitagawa`;
EXPORT DATA OPTIONS(
  uri = 'gs://gcp-geoai-sandbox-drr-export/qgis_candidate_validation_export_v1_*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT
  candidate_id,
  cluster_id,
  validation_status,
  validation_label_ja,
  hazard_zone_count,
  warning_zone_count,
  special_warning_zone_count,
  overlap_area_km2,
  overlap_ratio,
  phenomenon_types,
  zone_types,
  zone_names,
  location_names,
  ST_ASTEXT(geom) AS wkt
FROM
  `gcp-geoai-sandbox.drr_poc.v_map_candidate_validation_v1`
WHERE
  geom IS NOT NULL;
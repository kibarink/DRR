SELECT
  target_id,
  area_id,
  source_id,
  fixed_reservoir_id,
  best_transform,
  target_type,
  is_confirmed_fault,
  is_confirmed_prospect,
  requires_geologic_validation,
  final_direction_score,
  explanation,
  source_geom,
  virtual_path_geom,
  fixed_reservoir_geom,
  migration_direction_geom
FROM `gcp-geoai-sandbox.gpp_demo.overlooked_validation_targets`;
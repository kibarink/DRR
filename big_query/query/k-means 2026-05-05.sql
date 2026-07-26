SELECT
  candidate_id,

  -- Keep geometry for later mapping, but do not use it directly in ML training.
  geom,

  -- Size / shape features
  LOG(1 + area_km2) AS log_area_km2,
  LOG(1 + perimeter_km) AS log_perimeter_km,
  compactness,
  shape_index,

  -- Spatial arrangement features
  LOG(1 + neighbor_count_500m) AS log_neighbor_count_500m,
  LOG(1 + neighbor_count_1000m) AS log_neighbor_count_1000m,
  LOG(1 + neighbor_count_1500m) AS log_neighbor_count_1500m,

  -- Nearest-neighbor distance.
  -- If isolated and null, assign a large value.
  LOG(1 + COALESCE(nearest_neighbor_m, 5000)) AS log_nearest_neighbor_m,

  -- Geology relation features
  geology_lithology_count,
  COALESCE(dominant_lithology_share, 0) AS dominant_lithology_share,

  -- Reference attributes, not used directly in the first ML model
  dominant_lithology_ja,
  dominant_lithology_en,
  method,
  ndvi_threshold_max,
  slope_threshold_min_deg,
  confidence

FROM
  `gcp-geoai-sandbox.drr_poc.kitagawa_candidate_spatial_features_v1`
WHERE
  area_km2 IS NOT NULL
  AND area_km2 > 0
  AND perimeter_km IS NOT NULL
  AND perimeter_km > 0
  AND compactness IS NOT NULL
  AND shape_index IS NOT NULL
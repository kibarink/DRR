SELECT * EXCEPT(`geom`),
                     ST_AsGeoJson(`geom`) as `geom`
            FROM (
                   --__USER__QUERY__START__
                   SELECT
  geom,
  map_layer,
  style_class,
  label_ja,
  feature_id,
  cluster_id,
  overlap_ratio,
  phenomenon_types,
  zone_types,
  zone_names,
  location_names
FROM
  `gcp-geoai-sandbox.drr_poc.v_map_candidate_and_hazard_overlay_v1`
LIMIT 5000
                   --__USER__QUERY__END__
            );
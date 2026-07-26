SELECT * EXCEPT(`geom`),
                     ST_AsGeoJson(`geom`) as `geom`
            FROM (
                   --__USER__QUERY__START__
                   SELECT
  geom,
  candidate_id,
  cluster_id,
  validation_status,
  validation_label_ja,
  overlap_ratio,
  phenomenon_types,
  zone_types,
  zone_names,
  location_names
FROM
  `gcp-geoai-sandbox.drr_poc.v_map_candidate_validation_v1`
LIMIT 1000
                   --__USER__QUERY__END__
            );
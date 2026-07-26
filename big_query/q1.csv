EXPORT DATA OPTIONS(
  uri = 'gs://gcp-geoai-sandbox-drr-export/yakatabaru_sediment_hazard_*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT
  phenomenon_code,
  phenomenon_type_ja,
  zone_code,
  zone_type_ja,
  prefecture_code,
  prefecture_ja,
  zone_id,
  zone_name,
  location_name,
  announcement_date_raw,
  special_warning_not_designated_flag,
  special_warning_status,
  ST_ASTEXT(geom) AS wkt
FROM
  `gcp-geoai-sandbox.drr_poc.v_yakatabaru_sediment_hazard`
WHERE
  geom IS NOT NULL;
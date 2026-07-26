CREATE OR REPLACE VIEW
  `gcp-geoai-sandbox.drr_poc.v_ref_sediment_hazard_kitagawa`
AS
SELECT
  ST_GEOGFROMTEXT(wkt, make_valid => TRUE) AS geom,

  CAST(A33_001 AS INT64) AS phenomenon_code,
  phenomenon_type_ja,

  CAST(A33_002 AS INT64) AS zone_code,
  zone_type_ja,

  CAST(A33_003 AS INT64) AS prefecture_code,
  prefecture_ja,

  CAST(A33_004 AS STRING) AS zone_id,
  CAST(A33_005 AS STRING) AS zone_name,
  CAST(A33_006 AS STRING) AS location_name,
  CAST(A33_007 AS STRING) AS announcement_date_raw,
  CAST(A33_008 AS INT64) AS special_warning_not_designated_flag,
  special_warning_status,

  properties_json
FROM
  `gcp-geoai-sandbox.drr_poc.ref_sediment_hazard_kitagawa_raw`
WHERE
  wkt IS NOT NULL;
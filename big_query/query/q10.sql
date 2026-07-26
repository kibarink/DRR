CREATE OR REPLACE TABLE
  `gcp-geoai-sandbox.drr_poc.qgis_sediment_hazard_export_v1`
AS
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
  `gcp-geoai-sandbox.drr_poc.v_ref_sediment_hazard_kitagawa`
WHERE
  geom IS NOT NULL;
CREATE OR REPLACE VIEW
  `gcp-geoai-sandbox.drr_poc.v_yakatabaru_valley_aoi`
AS
SELECT
  string_field_0 AS valley_id,
  string_field_1 AS valley_name,
  string_field_2 AS purpose,
  string_field_3 AS properties_json,
  ST_GEOGFROMTEXT(string_field_4, make_valid => TRUE) AS geom
FROM
  `gcp-geoai-sandbox.drr_poc.yakatabaru_valley_aoi_raw`
WHERE
  string_field_4 IS NOT NULL;
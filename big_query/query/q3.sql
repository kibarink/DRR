CREATE OR REPLACE VIEW
  `gcp-geoai-sandbox.drr_poc.v_yakatabaru_sediment_hazard`
AS
SELECT
  h.*
FROM
  `gcp-geoai-sandbox.drr_poc.v_ref_sediment_hazard_kitagawa` h
JOIN
  `gcp-geoai-sandbox.drr_poc.v_yakatabaru_valley_aoi` a
ON
  ST_INTERSECTS(h.geom, a.geom);
CREATE OR REPLACE VIEW
  `gcp-geoai-sandbox.drr_poc.v_candidate_sediment_hazard_overlap_v1`
AS
WITH c_base AS (
  SELECT
    candidate_id,
    cluster_id,
    geom,
    ST_AREA(geom) AS candidate_area_m2
  FROM
    `gcp-geoai-sandbox.drr_poc.kitagawa_candidate_clustered_v1`
  WHERE
    geom IS NOT NULL
)

SELECT
  c.candidate_id,
  c.cluster_id,

  COUNT(*) AS hazard_zone_count,

  COUNTIF(h.zone_type_ja = '土砂災害警戒区域') AS warning_zone_count,
  COUNTIF(h.zone_type_ja = '土砂災害特別警戒区域') AS special_warning_zone_count,

  STRING_AGG(DISTINCT h.phenomenon_type_ja, ', ') AS phenomenon_types,
  STRING_AGG(DISTINCT h.zone_type_ja, ', ') AS zone_types,
  STRING_AGG(DISTINCT h.zone_name, ', ' LIMIT 10) AS zone_names,
  STRING_AGG(DISTINCT h.location_name, ', ' LIMIT 10) AS location_names,

  SUM(ST_AREA(ST_INTERSECTION(c.geom, h.geom))) / 1000000 AS overlap_area_km2,

  SAFE_DIVIDE(
    SUM(ST_AREA(ST_INTERSECTION(c.geom, h.geom))),
    c.candidate_area_m2
  ) AS overlap_ratio

FROM
  c_base c
JOIN
  `gcp-geoai-sandbox.drr_poc.v_ref_sediment_hazard_kitagawa` h
ON
  ST_INTERSECTS(c.geom, h.geom)
GROUP BY
  c.candidate_id,
  c.cluster_id,
  c.candidate_area_m2;
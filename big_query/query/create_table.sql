INSERT INTO `gcp-geoai-sandbox.gpp_demo.rstc_polygons`
  (polygon_id, project_id, study_name, area_name, element_type, sub_type, confidence, source_name, geom)
VALUES
  (
    'R001',
    'gpp_sandbox',
    'Demo_Basin_A',
    'Area_1',
    'Reservoir',
    'High_porosity_sand',
    0.80,
    'dummy_rstc_map_v1',
    ST_GEOGFROMTEXT('POLYGON((139.700 35.650, 139.760 35.650, 139.760 35.700, 139.700 35.700, 139.700 35.650))')
  ),
  (
    'S001',
    'gpp_sandbox',
    'Demo_Basin_A',
    'Area_1',
    'Seal',
    'Regional_shale',
    0.75,
    'dummy_rstc_map_v1',
    ST_GEOGFROMTEXT('POLYGON((139.730 35.670, 139.790 35.670, 139.790 35.720, 139.730 35.720, 139.730 35.670))')
  ),
  (
    'T001',
    'gpp_sandbox',
    'Demo_Basin_A',
    'Area_1',
    'Trap',
    'Fault_closure',
    0.65,
    'dummy_rstc_map_v1',
    ST_GEOGFROMTEXT('POLYGON((139.720 35.660, 139.775 35.660, 139.775 35.705, 139.720 35.705, 139.720 35.660))')
  ),
  (
    'C001',
    'gpp_sandbox',
    'Demo_Basin_A',
    'Area_1',
    'Charge',
    'Mature_source_kitchen',
    0.70,
    'dummy_charge_model_v1',
    ST_GEOGFROMTEXT('POLYGON((139.680 35.640, 139.740 35.640, 139.740 35.690, 139.680 35.690, 139.680 35.640))')
  );
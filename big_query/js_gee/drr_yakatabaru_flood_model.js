// ============================================================
// Step G
// Yakatabaru DRR PoC
// Flood hazard proxy model preparation
//
// Current policy:
// 1. Use yakatabaru_flood_aoi as hydroAOI
// 2. Clip all inputs by hydroAOI first
// 3. Treat artificial ditch as 5m DEM-pixel stream cells
// 4. Create effective stream = natural stream + artificial ditch
// 5. Use only essential Map.addLayer outputs
// ============================================================


// ============================================================
// 0. Input paths and Asset IDs
// ============================================================

var f6OutputPrefix = 'gs://gcp-geoai-sandbox-drr-export/yakatabaru_f6_outputs_clip/';

var hydroAOI = ee.FeatureCollection(
  'projects/gcp-geoai-sandbox/assets/yakatabaru_flood_aoi'
);

var housesRaw = ee.FeatureCollection(
  'projects/gcp-geoai-sandbox/assets/yakatabaru_house'
);

var artificialDitchRaw = ee.FeatureCollection(
  'projects/gcp-geoai-sandbox/assets/yakatabaru_artificial_ditch'
);

var hydroGeom = hydroAOI.geometry();


// ============================================================
// 1. Load raster layers
// ============================================================

var demFilledRaw = ee.Image.loadGeoTIFF(
  f6OutputPrefix + 'dem_filled_cog.tif'
).rename('dem_filled');

var flowAccumRaw = ee.Image.loadGeoTIFF(
  f6OutputPrefix + 'flow_accumulation_cog.tif'
).rename('flow_accumulation');

var streamRasterRaw = ee.Image.loadGeoTIFF(
  f6OutputPrefix + 'stream_raster_cog.tif'
).rename('stream_raster');


// ============================================================
// 2. Clip raster layers by hydroAOI
// ============================================================

var demHydro = demFilledRaw
  .clip(hydroGeom)
  .rename('dem_filled');

var flowHydro = flowAccumRaw
  .clip(hydroGeom)
  .rename('flow_accumulation');

var streamHydro = streamRasterRaw
  .clip(hydroGeom)
  .rename('stream_raster');


// ============================================================
// 3. Clip building polygons by hydroAOI
// ============================================================

var housesInHydroAOI = housesRaw.filterBounds(hydroGeom);

var housesClipped = housesInHydroAOI.map(function(feature) {
  return feature.intersection(hydroGeom, ee.ErrorMargin(1));
});


// ============================================================
// 4. Create village evaluation area from clipped buildings
// ============================================================
// hydroAOI:
//   Hydrologic analysis domain.
// villageArea:
//   Settlement-scale display / evaluation domain.

var villageBufferMeters = 100;

var villageArea = housesClipped
  .geometry()
  .buffer(villageBufferMeters)
  .simplify(5);

var demVillage = demHydro.clip(villageArea);
var flowVillage = flowHydro.clip(villageArea);
var streamVillage = streamHydro.clip(villageArea);


// ============================================================
// 5. Step G-1b
// Create flow accumulation factor
// ============================================================
// flow_factor:
//   0–1 normalized log10(flow_accumulation)
//   Statistics are calculated only inside yakatabaru_flood_aoi.

var flowLog10 = flowHydro
  .add(1)
  .log10()
  .rename('flow_accumulation_log10');

var flowLogStats = flowLog10.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: hydroGeom,
  scale: 5,
  maxPixels: 1e9,
  bestEffort: true
});

print('G-1b flowLogStats over yakatabaru_flood_aoi:', flowLogStats);

var flowLogMin = ee.Number(flowLogStats.get('flow_accumulation_log10_min'));
var flowLogMax = ee.Number(flowLogStats.get('flow_accumulation_log10_max'));
var flowLogDenom = flowLogMax.subtract(flowLogMin).max(0.000001);

var flowFactor = flowLog10
  .subtract(flowLogMin)
  .divide(flowLogDenom)
  .clamp(0, 1)
  .rename('flow_factor');

var flowFactorHydro = flowFactor.clip(hydroGeom);
var flowFactorVillage = flowFactor.clip(villageArea);


// ============================================================
// 6. Step G-1c
// Create low elevation factor
// ============================================================
// low_elevation_factor:
//   Low elevation in hydroAOI -> high value.
//   This is still a simple AOI-relative elevation proxy,
//   not yet valley-outlet-relative elevation.

var demStats = demHydro.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: hydroGeom,
  scale: 5,
  maxPixels: 1e9,
  bestEffort: true
});

print('G-1c demStats over yakatabaru_flood_aoi:', demStats);

var demMin = ee.Number(demStats.get('dem_filled_min'));
var demMax = ee.Number(demStats.get('dem_filled_max'));
var demDenom = demMax.subtract(demMin).max(0.000001);

var highElevationNorm = demHydro
  .subtract(demMin)
  .divide(demDenom)
  .clamp(0, 1)
  .rename('high_elevation_norm');

var lowElevationFactor = ee.Image(1)
  .subtract(highElevationNorm)
  .rename('low_elevation_factor');

var lowElevationFactorHydro = lowElevationFactor.clip(hydroGeom);
var lowElevationFactorVillage = lowElevationFactor.clip(villageArea);


// ============================================================
// 7. Step G-1d
// Create effective stream using natural stream + artificial ditch
// ============================================================
// natural_stream:
//   DEM-derived stream_raster.
// artificial_ditch:
//   manually digitized ditch, rasterized as 5m stream pixels.
// effective_stream:
//   natural stream OR artificial ditch.
// stream_proximity_factor:
//   30m influence zone from effective stream.

var analysisScale = 5;

// If DEM projection behaves unexpectedly, replace this line with:
// var analysisProj = ee.Projection('EPSG:3857').atScale(analysisScale);
var analysisProj = demHydro
  .projection()
  .atScale(analysisScale);


// ------------------------------------------------------------
// 7.1 Natural stream raster
// ------------------------------------------------------------

var naturalStreamRaster = streamHydro
  .gt(0)
  .unmask(0)
  .rename('natural_stream_raster')
  .reproject({
    crs: analysisProj
  })
  .clip(hydroGeom);

var naturalStreamMask = naturalStreamRaster
  .gt(0)
  .selfMask()
  .rename('natural_stream_mask');


// ------------------------------------------------------------
// 7.2 Artificial ditch clipped by hydroAOI
// ------------------------------------------------------------

var artificialDitch = artificialDitchRaw
  .filterBounds(hydroGeom)
  .map(function(feature) {
    return feature.intersection(hydroGeom, ee.ErrorMargin(1));
  });


// ------------------------------------------------------------
// 7.3 Rasterize artificial ditch as 5m DEM-pixel stream cells
// ------------------------------------------------------------

var artificialDitchPixels = ee.Image(0)
  .byte()
  .paint({
    featureCollection: artificialDitch,
    color: 1,
    width: 1
  })
  .rename('artificial_ditch_5m_pixel')
  .reproject({
    crs: analysisProj
  })
  .clip(hydroGeom)
  .selfMask();

var artificialDitchRaster = artificialDitchPixels
  .unmask(0)
  .rename('artificial_ditch_raster')
  .reproject({
    crs: analysisProj
  })
  .clip(hydroGeom);


// ------------------------------------------------------------
// 7.4 Effective stream raster
// ------------------------------------------------------------
// From here onward, artificial ditch is treated as stream.

var effectiveStreamRaster = naturalStreamRaster
  .max(artificialDitchRaster)
  .rename('effective_stream_raster')
  .reproject({
    crs: analysisProj
  })
  .clip(hydroGeom);

var effectiveStreamMask = effectiveStreamRaster
  .gt(0)
  .selfMask()
  .rename('effective_stream_mask');


// ------------------------------------------------------------
// 7.5 Distance from effective stream
// ------------------------------------------------------------

var effectiveStreamMask5m = effectiveStreamRaster
  .gt(0)
  .unmask(0)
  .reproject({
    crs: analysisProj
  });

var effectiveStreamDistanceMeters = effectiveStreamMask5m
  .fastDistanceTransform(512)
  .sqrt()
  .multiply(analysisScale)
  .rename('effective_stream_distance_m')
  .reproject({
    crs: analysisProj
  })
  .clip(hydroGeom);


// ------------------------------------------------------------
// 7.6 Stream proximity factor, 30m influence
// ------------------------------------------------------------

var maxStreamInfluenceMeters = 30;

var streamProximityFactor = ee.Image(1)
  .subtract(
    effectiveStreamDistanceMeters.divide(maxStreamInfluenceMeters)
  )
  .clamp(0, 1)
  .rename('stream_proximity_factor')
  .reproject({
    crs: analysisProj
  });

var streamProximityFactorHydro = streamProximityFactor.clip(hydroGeom);
var streamProximityFactorVillage = streamProximityFactor.clip(villageArea);


// ------------------------------------------------------------
// 7.7 Explicit stream influence mask for checking
// ------------------------------------------------------------

var streamInfluence30mMask = effectiveStreamDistanceMeters
  .lte(maxStreamInfluenceMeters)
  .selfMask()
  .rename('stream_influence_30m_mask');


// ------------------------------------------------------------
// 7.8 Ditch boost factor for runoff pathway
// ------------------------------------------------------------
// This compensates for the fact that the DEM-derived flow_accumulation
// may not recognize the artificial ditch.

var ditchStreamFactor = artificialDitchRaster
  .rename('ditch_stream_factor')
  .clip(hydroGeom);

var ditchBoostValue = 1.0;

var ditchBoostFactor = ditchStreamFactor
  .multiply(ditchBoostValue)
  .rename('ditch_boost_factor');

var flowFactorForRunoff = flowFactorHydro
  .max(ditchBoostFactor)
  .rename('flow_factor_for_runoff')
  .clip(hydroGeom);


// Diagnostics for G-1d
var effectiveStreamDistanceStats = effectiveStreamDistanceMeters.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: hydroGeom,
  scale: 5,
  maxPixels: 1e9,
  bestEffort: true
});

print('G-1d artificialDitch count:', artificialDitch.size());
print('G-1d effectiveStreamDistanceStats:', effectiveStreamDistanceStats);
print('G-1d maxStreamInfluenceMeters:', maxStreamInfluenceMeters);

// ============================================================
// 8. Step G-1e revised
// Create peak runoff factor and 24h accumulated runoff factor
// ============================================================
// This replaces the previous simple rain_runoff_factor.
//
// Two rainfall controls are separated:
//
// 1. peak_q_factor
//    - short-duration rainfall intensity [mm/h]
//    - controls instantaneous runoff concentration / peak discharge proxy
//
// 2. accumulated_volume_factor
//    - 24h accumulated rainfall [mm/24h]
//    - controls total runoff volume / drainage stress / persistence proxy
//
// Both are calculated using effective_flow_accumulation,
// which includes DEM-derived flow accumulation and artificial ditch boost.


// ------------------------------------------------------------
// 8.1 Effective flow accumulation
// ------------------------------------------------------------
// Original flow_accumulation may not recognize the artificial ditch.
// Therefore, ditch cells are given a minimum accumulation boost.
// This is a PoC correction, not a replacement for burned-in DEM recalculation.

var ditchAccumBoost = 100;

var effectiveFlowAccum = flowHydro
  .max(artificialDitchRaster.multiply(ditchAccumBoost))
  .rename('effective_flow_accumulation')
  .clip(hydroGeom);


// ------------------------------------------------------------
// 8.2 Common hydrologic parameters
// ------------------------------------------------------------

var cellAreaM2 = ee.Number(analysisScale).multiply(analysisScale);

// Initial runoff coefficient.
// PoC value for steep, thin-soil, mudstone-dominated small catchment
// under heavy rainfall.
// Later calibration target: 0.4–0.8 depending on antecedent wetness.
var runoffCoeff = 0.6;


// ============================================================
// 8A. Peak runoff proxy from rainfall intensity [mm/h]
// ============================================================

// ------------------------------------------------------------
// 8A.1 Peak rainfall intensity scenarios
// ------------------------------------------------------------

var peakRain50mmh = 50;
var peakRain100mmh = 100;
var peakRain150mmh = 150;

// Convert mm/h to m/s
var peakRain50_mps = ee.Number(peakRain50mmh).divide(1000).divide(3600);
var peakRain100_mps = ee.Number(peakRain100mmh).divide(1000).divide(3600);
var peakRain150_mps = ee.Number(peakRain150mmh).divide(1000).divide(3600);


// ------------------------------------------------------------
// 8A.2 Peak discharge-like proxy
// ------------------------------------------------------------
// q_peak_proxy ≈ rainfall_intensity_mps
//              × cell_area_m2
//              × runoff_coeff
//              × upstream_cell_count
//
// Unit is m3/s-like.
// This is not calibrated discharge, but physically interpretable.

var qPeakProxy50 = effectiveFlowAccum
  .multiply(peakRain50_mps)
  .multiply(cellAreaM2)
  .multiply(runoffCoeff)
  .rename('q_peak_proxy_50mmh');

var qPeakProxy100 = effectiveFlowAccum
  .multiply(peakRain100_mps)
  .multiply(cellAreaM2)
  .multiply(runoffCoeff)
  .rename('q_peak_proxy_100mmh');

var qPeakProxy150 = effectiveFlowAccum
  .multiply(peakRain150_mps)
  .multiply(cellAreaM2)
  .multiply(runoffCoeff)
  .rename('q_peak_proxy_150mmh');


// ------------------------------------------------------------
// 8A.3 Log-transform peak proxy
// ------------------------------------------------------------

var qPeakLog50 = qPeakProxy50
  .add(1)
  .log10()
  .rename('q_peak_log_50mmh');

var qPeakLog100 = qPeakProxy100
  .add(1)
  .log10()
  .rename('q_peak_log_100mmh');

var qPeakLog150 = qPeakProxy150
  .add(1)
  .log10()
  .rename('q_peak_log_150mmh');


// ------------------------------------------------------------
// 8A.4 Normalize peak proxy using 150 mm/h scenario
// ------------------------------------------------------------

var qPeakLog150Stats = qPeakLog150.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: hydroGeom,
  scale: 5,
  maxPixels: 1e9,
  bestEffort: true
});

print('G-1e revised qPeakLog150Stats:', qPeakLog150Stats);

var qPeakLogMin = ee.Number(qPeakLog150Stats.get('q_peak_log_150mmh_min'));
var qPeakLogMax = ee.Number(qPeakLog150Stats.get('q_peak_log_150mmh_max'));
var qPeakLogDenom = qPeakLogMax.subtract(qPeakLogMin).max(0.000001);

var peakQFactor50 = qPeakLog50
  .subtract(qPeakLogMin)
  .divide(qPeakLogDenom)
  .clamp(0, 1)
  .rename('peak_q_factor_50mmh');

var peakQFactor100 = qPeakLog100
  .subtract(qPeakLogMin)
  .divide(qPeakLogDenom)
  .clamp(0, 1)
  .rename('peak_q_factor_100mmh');

var peakQFactor150 = qPeakLog150
  .subtract(qPeakLogMin)
  .divide(qPeakLogDenom)
  .clamp(0, 1)
  .rename('peak_q_factor_150mmh');

var peakQFactor50Village = peakQFactor50.clip(villageArea);
var peakQFactor100Village = peakQFactor100.clip(villageArea);
var peakQFactor150Village = peakQFactor150.clip(villageArea);


// ============================================================
// 8B. Accumulated runoff volume proxy from 24h rainfall [mm]
// ============================================================

// ------------------------------------------------------------
// 8B.1 24h accumulated rainfall scenarios
// ------------------------------------------------------------
// These are total rainfall amounts over 24 hours.

var accumRain200mm24h = 200;
var accumRain400mm24h = 400;
var accumRain600mm24h = 600;
var accumRain800mm24h = 800;

// Convert mm to m
var accumRain200_m = ee.Number(accumRain200mm24h).divide(1000);
var accumRain400_m = ee.Number(accumRain400mm24h).divide(1000);
var accumRain600_m = ee.Number(accumRain600mm24h).divide(1000);
var accumRain800_m = ee.Number(accumRain800mm24h).divide(1000);


// ------------------------------------------------------------
// 8B.2 Accumulated runoff volume-like proxy
// ------------------------------------------------------------
// accumulated_volume_proxy ≈ accumulated_rain_m
//                          × cell_area_m2
//                          × runoff_coeff
//                          × upstream_cell_count
//
// Unit is m3-like.
// This represents total runoff volume stress, not peak discharge.

var accumVolumeProxy200 = effectiveFlowAccum
  .multiply(accumRain200_m)
  .multiply(cellAreaM2)
  .multiply(runoffCoeff)
  .rename('accum_volume_proxy_200mm24h');

var accumVolumeProxy400 = effectiveFlowAccum
  .multiply(accumRain400_m)
  .multiply(cellAreaM2)
  .multiply(runoffCoeff)
  .rename('accum_volume_proxy_400mm24h');

var accumVolumeProxy600 = effectiveFlowAccum
  .multiply(accumRain600_m)
  .multiply(cellAreaM2)
  .multiply(runoffCoeff)
  .rename('accum_volume_proxy_600mm24h');

var accumVolumeProxy800 = effectiveFlowAccum
  .multiply(accumRain800_m)
  .multiply(cellAreaM2)
  .multiply(runoffCoeff)
  .rename('accum_volume_proxy_800mm24h');


// ------------------------------------------------------------
// 8B.3 Log-transform accumulated volume proxy
// ------------------------------------------------------------

var accumVolumeLog200 = accumVolumeProxy200
  .add(1)
  .log10()
  .rename('accum_volume_log_200mm24h');

var accumVolumeLog400 = accumVolumeProxy400
  .add(1)
  .log10()
  .rename('accum_volume_log_400mm24h');

var accumVolumeLog600 = accumVolumeProxy600
  .add(1)
  .log10()
  .rename('accum_volume_log_600mm24h');

var accumVolumeLog800 = accumVolumeProxy800
  .add(1)
  .log10()
  .rename('accum_volume_log_800mm24h');


// ------------------------------------------------------------
// 8B.4 Normalize accumulated volume proxy using 800 mm/24h scenario
// ------------------------------------------------------------

var accumVolumeLog800Stats = accumVolumeLog800.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: hydroGeom,
  scale: 5,
  maxPixels: 1e9,
  bestEffort: true
});

print('G-1e revised accumVolumeLog800Stats:', accumVolumeLog800Stats);

var accumLogMin = ee.Number(accumVolumeLog800Stats.get('accum_volume_log_800mm24h_min'));
var accumLogMax = ee.Number(accumVolumeLog800Stats.get('accum_volume_log_800mm24h_max'));
var accumLogDenom = accumLogMax.subtract(accumLogMin).max(0.000001);

var accumVolumeFactor200 = accumVolumeLog200
  .subtract(accumLogMin)
  .divide(accumLogDenom)
  .clamp(0, 1)
  .rename('accum_volume_factor_200mm24h');

var accumVolumeFactor400 = accumVolumeLog400
  .subtract(accumLogMin)
  .divide(accumLogDenom)
  .clamp(0, 1)
  .rename('accum_volume_factor_400mm24h');

var accumVolumeFactor600 = accumVolumeLog600
  .subtract(accumLogMin)
  .divide(accumLogDenom)
  .clamp(0, 1)
  .rename('accum_volume_factor_600mm24h');

var accumVolumeFactor800 = accumVolumeLog800
  .subtract(accumLogMin)
  .divide(accumLogDenom)
  .clamp(0, 1)
  .rename('accum_volume_factor_800mm24h');

var accumVolumeFactor200Village = accumVolumeFactor200.clip(villageArea);
var accumVolumeFactor400Village = accumVolumeFactor400.clip(villageArea);
var accumVolumeFactor600Village = accumVolumeFactor600.clip(villageArea);
var accumVolumeFactor800Village = accumVolumeFactor800.clip(villageArea);


// ============================================================
// 8C. Diagnostics
// ============================================================

var qPeakProxy150Stats = qPeakProxy150.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: hydroGeom,
  scale: 5,
  maxPixels: 1e9,
  bestEffort: true
});

var accumVolumeProxy800Stats = accumVolumeProxy800.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: hydroGeom,
  scale: 5,
  maxPixels: 1e9,
  bestEffort: true
});

print('G-1e qPeakProxy150Stats m3/s-like:', qPeakProxy150Stats);
print('G-1e accumVolumeProxy800Stats m3-like:', accumVolumeProxy800Stats);
print('G-1e runoffCoeff:', runoffCoeff);
print('G-1e ditchAccumBoost:', ditchAccumBoost);
print('G-1e cellAreaM2:', cellAreaM2);

// ============================================================
// 8b. Step G-1f revised
// Create stage-based virtual Kitagawa backwater factors
// ============================================================
// Revised concept:
//   Virtual Kitagawa stage = outlet_elevation + water_level_rise
//   backwater_depth_proxy = max(stage - DEM, 0)
//   backwater_factor = normalized_depth_proxy * stream_proximity_factor
//
// This makes water-level scenarios change spatial patterns,
// not only intensity.



// ------------------------------------------------------------
// 8b.1 Define outlet elevation from known outlet point
// ------------------------------------------------------------
// Outlet point:
//   Longitude: 131.67991195905557
//   Latitude : 32.70525776831408
//   Elevation: 18 m
//
// This point represents the drainage / confluence outlet
// from the Yakatabaru valley system to the Kitagawa main river side.

var outletPoint = ee.Geometry.Point([
  131.67991195905557,
  32.70525776831408
]);

var outletElevation = ee.Number(18);

Map.addLayer(
  outletPoint,
  {color: 'yellow'},
  'G outlet point elevation 18m'
);

print('G-1f outletPoint:', outletPoint);
print('G-1f outletElevation fixed m:', outletElevation);


// ------------------------------------------------------------
// 8b.2 Virtual Kitagawa water level rise scenarios
// ------------------------------------------------------------
// These are virtual relative rises above outletElevation.
// Unit: meters.

var kitagawaWL1m = 1;
var kitagawaWL3m = 3;
var kitagawaWL5m = 5;
var kitagawaWL10m = 10;


// ------------------------------------------------------------
// 8b.3 Create virtual absolute water stages
// ------------------------------------------------------------

var stage1m = outletElevation.add(kitagawaWL1m);
var stage3m = outletElevation.add(kitagawaWL3m);
var stage5m = outletElevation.add(kitagawaWL5m);
var stage10m = outletElevation.add(kitagawaWL10m);

print('G-1f stage1m:', stage1m);
print('G-1f stage3m:', stage3m);
print('G-1f stage5m:', stage5m);
print('G-1f stage10m:', stage10m);


// ------------------------------------------------------------
// 8b.4 Backwater depth proxy
// ------------------------------------------------------------
// Positive only where virtual stage exceeds DEM.
// This is not hydraulic depth; it is a vertical susceptibility proxy.

var backwaterDepth1m = ee.Image(stage1m)
  .subtract(demHydro)
  .max(0)
  .rename('backwater_depth_proxy_1m')
  .clip(hydroGeom);

var backwaterDepth3m = ee.Image(stage3m)
  .subtract(demHydro)
  .max(0)
  .rename('backwater_depth_proxy_3m')
  .clip(hydroGeom);

var backwaterDepth5m = ee.Image(stage5m)
  .subtract(demHydro)
  .max(0)
  .rename('backwater_depth_proxy_5m')
  .clip(hydroGeom);

var backwaterDepth10m = ee.Image(stage10m)
  .subtract(demHydro)
  .max(0)
  .rename('backwater_depth_proxy_10m')
  .clip(hydroGeom);


// ------------------------------------------------------------
// 8b.5 Normalize depth proxy by max scenario, 10m
// ------------------------------------------------------------
// This keeps all scenarios in a comparable 0–1 scale.

var backwaterDepthFactor1m = backwaterDepth1m
  .divide(kitagawaWL10m)
  .clamp(0, 1)
  .rename('backwater_depth_factor_1m');

var backwaterDepthFactor3m = backwaterDepth3m
  .divide(kitagawaWL10m)
  .clamp(0, 1)
  .rename('backwater_depth_factor_3m');

var backwaterDepthFactor5m = backwaterDepth5m
  .divide(kitagawaWL10m)
  .clamp(0, 1)
  .rename('backwater_depth_factor_5m');

var backwaterDepthFactor10m = backwaterDepth10m
  .divide(kitagawaWL10m)
  .clamp(0, 1)
  .rename('backwater_depth_factor_10m');


// ------------------------------------------------------------
// 8b.6 Combine with stream proximity
// ------------------------------------------------------------
// Backwater affects low areas hydraulically connected to
// effective stream / artificial ditch corridor.

var backwaterFactor1m = backwaterDepthFactor1m
  .multiply(streamProximityFactorHydro)
  .rename('backwater_factor_wl_1m')
  .clip(hydroGeom);

var backwaterFactor3m = backwaterDepthFactor3m
  .multiply(streamProximityFactorHydro)
  .rename('backwater_factor_wl_3m')
  .clip(hydroGeom);

var backwaterFactor5m = backwaterDepthFactor5m
  .multiply(streamProximityFactorHydro)
  .rename('backwater_factor_wl_5m')
  .clip(hydroGeom);

var backwaterFactor10m = backwaterDepthFactor10m
  .multiply(streamProximityFactorHydro)
  .rename('backwater_factor_wl_10m')
  .clip(hydroGeom);


// Village-scale layers

var backwaterFactor1mVillage = backwaterFactor1m.clip(villageArea);
var backwaterFactor3mVillage = backwaterFactor3m.clip(villageArea);
var backwaterFactor5mVillage = backwaterFactor5m.clip(villageArea);
var backwaterFactor10mVillage = backwaterFactor10m.clip(villageArea);


// ------------------------------------------------------------
// 8b.7 Diagnostics
// ------------------------------------------------------------

var backwater10mStats = backwaterFactor10m.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: hydroGeom,
  scale: 5,
  maxPixels: 1e9,
  bestEffort: true
});

print('G-1f revised backwater10mStats over hydroAOI:', backwater10mStats);

// ============================================================
// 9. Visualization parameters
// ============================================================

var demVis = {
  min: 0,
  max: 100,
  palette: ['08306b', '4292c6', 'ffffcc', 'fd8d3c', '800026']
};

var flowFactorVis = {
  min: 0,
  max: 1,
  palette: ['ffffff', 'c6dbef', '6baed6', '2171b5', '08306b']
};

var lowElevationVis = {
  min: 0,
  max: 1,
  palette: ['ffffff', 'ffffb2', 'fecc5c', 'fd8d3c', 'e31a1c']
};

var streamProximityVis = {
  min: 0,
  max: 1,
  palette: ['ffffff', 'c7e9c0', '74c476', '238b45', '00441b']
};

var peakQVis = {
  min: 0,
  max: 1,
  palette: ['ffffff', 'deebf7', '9ecae1', '3182bd', '08519c']
};

var accumVolumeVis = {
  min: 0,
  max: 1,
  palette: ['ffffff', 'e5f5e0', 'a1d99b', '31a354', '006d2c']
};

var streamMaskVis = {
  palette: ['000000']
};

var ditchVis = {
  palette: ['ff00ff']
};

var backwaterVis = {
  min: 0,
  max: 1,
  palette: ['ffffff', 'fee8c8', 'fdbb84', 'e34a33', '7f0000']
};


// ============================================================
// 10. Essential map layers only
// ============================================================

Map.centerObject(hydroAOI, 15);

// 1. AOI and buildings
Map.addLayer(
  hydroAOI,
  {color: 'cyan'},
  'G hydroAOI: yakatabaru_flood_aoi'
);

Map.addLayer(
  housesClipped,
  {color: 'red'},
  'G houses clipped by hydroAOI'
);

// 2. DEM context
Map.addLayer(
  demHydro,
  demVis,
  'G dem_filled clipped by hydroAOI',
  false
);

// 3. Effective stream and artificial ditch
Map.addLayer(
  artificialDitchPixels,
  ditchVis,
  'G artificial ditch as 5m stream pixels'
);

Map.addLayer(
  effectiveStreamMask,
  streamMaskVis,
  'G effective stream: natural stream + artificial ditch'
);

// 4. 30m influence check
Map.addLayer(
  streamInfluence30mMask,
  {palette: ['ff0000']},
  'G stream influence <= 30m'
);

// 5. Core model factors
Map.addLayer(
  flowFactorForRunoff.clip(villageArea),
  flowFactorVis,
  'G flow_factor_for_runoff with artificial ditch'
);

Map.addLayer(
  lowElevationFactorVillage,
  lowElevationVis,
  'G low_elevation_factor clipped to villageArea',
  false
);

Map.addLayer(
  streamProximityFactorVillage,
  streamProximityVis,
  'G stream_proximity_factor 30m clipped to villageArea'
);

// 6. Rainfall scenario output
// Peak rainfall proxy
Map.addLayer(
  peakQFactor100Village,
  peakQVis,
  'G peak_q_factor 100mmh clipped to villageArea',
  false
);

Map.addLayer(
  peakQFactor150Village,
  peakQVis,
  'G peak_q_factor 150mmh clipped to villageArea'
);

// 24h accumulated rainfall proxy
Map.addLayer(
  accumVolumeFactor400Village,
  accumVolumeVis,
  'G accum_volume_factor 400mm24h clipped to villageArea',
  false
);

Map.addLayer(
  accumVolumeFactor800Village,
  accumVolumeVis,
  'G accum_volume_factor 800mm24h clipped to villageArea'
);

Map.addLayer(
  backwaterFactor3mVillage,
  backwaterVis,
  'G backwater_factor Kitagawa WL +3m clipped to villageArea',
  false
);

Map.addLayer(
  backwaterFactor10mVillage,
  backwaterVis,
  'G backwater_factor Kitagawa WL +10m clipped to villageArea'
);

// ============================================================
// 11. Final diagnostics
// ============================================================

print('hydroAOI:', hydroAOI);
print('housesRaw count:', housesRaw.size());
print('housesInHydroAOI count:', housesInHydroAOI.size());
print('housesClipped count:', housesClipped.size());
print('villageBufferMeters:', villageBufferMeters);
print('analysisScale:', analysisScale);
print('analysisProj:', analysisProj);

print('demHydro projection:', demHydro.projection());
print('flowHydro projection:', flowHydro.projection());
print('streamHydro projection:', streamHydro.projection());

print('demHydro nominal scale:', demHydro.projection().nominalScale());
print('flowHydro nominal scale:', flowHydro.projection().nominalScale());
print('streamHydro nominal scale:', streamHydro.projection().nominalScale());
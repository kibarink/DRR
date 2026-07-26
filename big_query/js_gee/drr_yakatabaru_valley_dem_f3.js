// ======================================================
// Step F5: Yakatabaru valley terrain model with GSI 5m DEM
// Purpose:
//   DEM / slope / terrain proxy check for valley-scale sediment screening
//   using GSI 5m DEM instead of ALOS AW3D30.
// Note:
//   This is still a terrain-proxy model, not a dynamic debris-flow simulation.
// ======================================================


// ------------------------------
// 1. Yakatabaru valley AOI
// ------------------------------
var yakatabaruAoiBase = ee.Geometry.Polygon([[
  [131.677246, 32.706732],
  [131.678738, 32.707990],
  [131.680158, 32.708883],
  [131.681270, 32.709453],
  [131.684211, 32.709614],
  [131.685250, 32.709190],
  [131.685367, 32.708561],
  [131.683596, 32.707273],
  [131.682265, 32.706351],
  [131.681752, 32.705415],
  [131.680611, 32.704669],
  [131.677158, 32.705751],
  [131.677246, 32.706732]
]]);

// Expand AOI by approximately 200 m in all directions.
var yakatabaruAoi = yakatabaruAoiBase.buffer(200);

Map.centerObject(yakatabaruAoi, 16);
Map.addLayer(yakatabaruAoi, {color: 'red'}, 'Yakatabaru valley AOI');


// ------------------------------
// 2. GSI 5m DEM
// ------------------------------
// Replace this with your actual uploaded GSI DEM asset ID.
var gsiDemAssetId = 'projects/gcp-geoai-sandbox/assets/yakatabaru_gsi_dem5m';

var dem = ee.Image(gsiDemAssetId)
  .clip(yakatabaruAoi)
  .rename('GSI_DEM');

// If the uploaded GeoTIFF has multiple bands, use the first band explicitly.
// Uncomment this block if needed.
// var dem = ee.Image(gsiDemAssetId)
//   .select(0)
//   .clip(yakatabaruAoi)
//   .rename('GSI_DEM');

var slope = ee.Terrain.slope(dem).rename('slope_deg');

Map.addLayer(
  dem,
  {min: 0, max: 500, palette: ['green', 'yellow', 'brown', 'white']},
  'GSI 5m DEM clipped'
);

Map.addLayer(
  slope,
  {min: 0, max: 45, palette: ['white', 'orange', 'red']},
  'Slope from GSI 5m DEM'
);


// ------------------------------
// 3. Simple terrain masks
// ------------------------------
var steep20 = slope.gte(20).selfMask();
var steep30 = slope.gte(30).selfMask();

Map.addLayer(
  steep20,
  {palette: ['orange']},
  'Slope >= 20 deg'
);

Map.addLayer(
  steep30,
  {palette: ['red']},
  'Slope >= 30 deg'
);


// ------------------------------
// 4. Print diagnostics
// ------------------------------
print('AOI area km2:', yakatabaruAoi.area(1).divide(1e6));
print('GSI DEM asset ID:', gsiDemAssetId);
print('GSI DEM projection:', dem.projection());

var demStats = dem.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: yakatabaruAoi,
  scale: 5,
  maxPixels: 1e8,
  bestEffort: true
});

var slopeStats = slope.reduceRegion({
  reducer: ee.Reducer.percentile([5, 25, 50, 75, 90, 95])
    .combine({
      reducer2: ee.Reducer.minMax(),
      sharedInputs: true
    }),
  geometry: yakatabaruAoi,
  scale: 5,
  maxPixels: 1e8,
  bestEffort: true
});

print('GSI DEM stats:', demStats);
print('Slope stats from GSI DEM:', slopeStats);


// ======================================================
// F5-2: Simple valley-floor / downslope screening
// Purpose:
//   Approximate valley axis and downslope tendency from GSI 5m DEM.
//   This is not a hydrological flow-routing model.
// ======================================================


// ------------------------------
// 5. Relative elevation within AOI
// ------------------------------
var demMin = ee.Number(
  dem.reduceRegion({
    reducer: ee.Reducer.min(),
    geometry: yakatabaruAoi,
    scale: 5,
    maxPixels: 1e8,
    bestEffort: true
  }).get('GSI_DEM')
);

var relativeElevation = dem
  .subtract(demMin)
  .rename('relative_elevation_m');

Map.addLayer(
  relativeElevation,
  {min: 0, max: 200, palette: ['blue', 'cyan', 'green', 'yellow', 'red']},
  'Relative elevation from valley outlet'
);


// ------------------------------
// 6. Approximate valley-floor candidate
// ------------------------------
// Low relative elevation inside the AOI is used as a rough valley-floor proxy.
// With GSI 5m DEM, this should better follow the actual small valley floor.
var valleyFloorCandidate = relativeElevation.lte(60)
  .and(slope.lte(25))
  .selfMask();

Map.addLayer(
  valleyFloorCandidate,
  {palette: ['00FFFF']},
  'Approx valley floor candidate'
);


// ------------------------------
// 7. Potential source-slope candidate
// ------------------------------
// Steep slope in the upper/middle part of the small valley.
var sourceSlopeCandidate = slope.gte(25)
  .and(relativeElevation.gte(40))
  .selfMask();

Map.addLayer(
  sourceSlopeCandidate,
  {palette: ['FF0000']},
  'Potential source slope: steep and elevated'
);


// ------------------------------
// 8. Simple runout attention zone
// ------------------------------
// Low to middle relative elevation zone connecting valley floor to outlet.
// This is a conceptual runout attention zone, not a dynamic simulation.
var runoutAttentionZone = relativeElevation.lte(100)
  .and(slope.lte(30))
  .selfMask();

Map.addLayer(
  runoutAttentionZone,
  {palette: ['FFFF00']},
  'Conceptual runout attention zone'
);


// ------------------------------
// 9. Diagnostics for relative elevation
// ------------------------------
print('DEM min within AOI:', demMin);

var relStats = relativeElevation.reduceRegion({
  reducer: ee.Reducer.percentile([5, 25, 50, 75, 90, 95])
    .combine({
      reducer2: ee.Reducer.minMax(),
      sharedInputs: true
    }),
  geometry: yakatabaruAoi,
  scale: 5,
  maxPixels: 1e8,
  bestEffort: true
});

print('Relative elevation stats:', relStats);


// ======================================================
// F3-3c / F5-3: Load A33 sediment hazard zones from Earth Engine Asset
// ======================================================

// Replace this with your actual uploaded table asset ID if different.
var a33AssetId = 'projects/gcp-geoai-sandbox/assets/yakatabaru_sediment_hazard';

var a33Hazard = ee.FeatureCollection(a33AssetId);

Map.addLayer(
  a33Hazard.style({
    color: '0000FF',
    fillColor: '0000FF33',
    width: 2
  }),
  {},
  'A33 sediment hazard zones'
);

print('A33 hazard feature count:', a33Hazard.size());
print('A33 hazard sample:', a33Hazard.limit(5));


// ======================================================
// F5-4: Optional combined interpretation layers
// Purpose:
//   Quick visual comparison between terrain proxy and A33 zones.
// ======================================================

// Source slope inside A33 hazard zones.
// This is a visual proxy for possible sediment source areas within official zones.
var sourceInA33 = sourceSlopeCandidate.clipToCollection(a33Hazard).selfMask();

Map.addLayer(
  sourceInA33,
  {palette: ['FF00FF']},
  'Source slope candidate inside A33'
);

// Runout attention zone inside A33 hazard zones.
var runoutInA33 = runoutAttentionZone.clipToCollection(a33Hazard).selfMask();

Map.addLayer(
  runoutInA33,
  {palette: ['0000FF']},
  'Runout attention zone inside A33'
);

print('F5 complete: GSI 5m DEM terrain proxy layers created.');

// ======================================================
// F6-7R: Load clipped Cloud Run hydrology outputs from Cloud Storage
// Requires Cloud Optimized GeoTIFF outputs.
// ======================================================

var f6OutputPrefix = 'gs://gcp-geoai-sandbox-drr-export/yakatabaru_f6_outputs_clip/';

var demFilled = ee.Image.loadGeoTIFF(
  f6OutputPrefix + 'dem_filled_cog.tif'
).rename('dem_filled');

var flowAccum = ee.Image.loadGeoTIFF(
  f6OutputPrefix + 'flow_accumulation_cog.tif'
).rename('flow_accumulation');

var streamRaster = ee.Image.loadGeoTIFF(
  f6OutputPrefix + 'stream_raster_cog.tif'
).rename('stream_raster');

Map.addLayer(
  demFilled.clip(yakatabaruAoi),
  {min: 0, max: 500, palette: ['green', 'yellow', 'brown', 'white']},
  'F6 clipped DEM filled'
);

var flowAccumLog = flowAccum.add(1).log10();

Map.addLayer(
  flowAccumLog.clip(yakatabaruAoi),
  {min: 0, max: 5, palette: ['white', 'cyan', 'blue', 'purple', 'black']},
  'F6 clipped flow accumulation log10'
);

Map.addLayer(
  streamRaster.selfMask().clip(yakatabaruAoi),
  {palette: ['0000FF']},
  'F6 clipped extracted stream raster'
);

print('F6 clipped dem_filled projection:', demFilled.projection());
print('F6 clipped flow accumulation projection:', flowAccum.projection());
print('F6 clipped stream raster projection:', streamRaster.projection());
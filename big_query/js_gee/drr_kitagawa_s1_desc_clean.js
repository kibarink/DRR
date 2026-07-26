// ======================================================
// DRR PoC: Kitagawa River Basin - Sentinel-1 DESC clean test
// Project: gcp-geoai-sandbox
// Event: Typhoon 16, September 2016
// ======================================================

// ------------------------------
// A1. AOI
// ------------------------------
var kitagawaAoi = ee.Geometry.Rectangle([
  131.35,  // west
  32.45,   // south
  131.95,  // east
  32.95    // north
]);

Map.centerObject(kitagawaAoi, 10);
Map.addLayer(
  kitagawaAoi,
  {color: 'red'},
  'Kitagawa AOI'
);

// ------------------------------
// A2. DEM / slope / water reference
// ------------------------------
var dem = ee.Image('USGS/SRTMGL1_003').clip(kitagawaAoi);
var slope = ee.Terrain.slope(dem);

Map.addLayer(
  dem,
  {min: 0, max: 1500, palette: ['green', 'yellow', 'brown', 'white']},
  'SRTM DEM'
);

Map.addLayer(
  slope,
  {min: 0, max: 40, palette: ['white', 'orange', 'red']},
  'Slope'
);

var waterOccurrence = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('occurrence')
  .clip(kitagawaAoi);

Map.addLayer(
  waterOccurrence,
  {min: 0, max: 100, palette: ['white', 'lightblue', 'blue']},
  'JRC water occurrence'
);

// Lowland mask candidates.
// Start with stricter condition to suppress mountain-slope noise.
var strictLowlandMask = dem.lt(80).and(slope.lt(3));

Map.addLayer(
  strictLowlandMask.selfMask(),
  {palette: ['yellow']},
  'Strict lowland mask: DEM<80m slope<3deg'
);

// ------------------------------
// A3. Sentinel-1 setup
// ------------------------------
var preStart  = '2016-09-01';
var preEnd    = '2016-09-18';

var postStart = '2016-09-20';
var postEnd   = '2016-10-05';

var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(kitagawaAoi)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
  .select('VV');

var s1Pre = s1
  .filterDate(preStart, preEnd)
  .median()
  .clip(kitagawaAoi);

var s1Post = s1
  .filterDate(postStart, postEnd)
  .median()
  .clip(kitagawaAoi);

var s1Diff = s1Post.subtract(s1Pre);

// ------------------------------
// A3. Display
// ------------------------------
Map.addLayer(
  s1Pre.updateMask(strictLowlandMask),
  {min: -25, max: 0},
  'DESC S1 pre masked'
);

Map.addLayer(
  s1Post.updateMask(strictLowlandMask),
  {min: -25, max: 0},
  'DESC S1 post masked'
);

Map.addLayer(
  s1Diff.updateMask(strictLowlandMask),
  {min: -8, max: 3, palette: ['blue', 'white', 'red']},
  'DESC S1 diff masked'
);

// ------------------------------
// A4-preview. First-pass flood candidate
// ------------------------------
// Candidate logic:
// 1. post-event VV is dark
// 2. post-event VV decreased from pre-event
// 3. lowland/gentle slope only
// 4. exclude frequent water
var floodCandidate = s1Post.lt(-17)
  .and(s1Diff.lt(-2))
  .and(strictLowlandMask)
  .and(waterOccurrence.lt(50))
  .selfMask();

Map.addLayer(
  floodCandidate,
  {palette: ['00FFFF']},
  'Flood candidate DESC clean'
);

var floodArea = floodCandidate
  .multiply(ee.Image.pixelArea())
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: kitagawaAoi,
    scale: 30,
    maxPixels: 1e9
  });

print('AOI area km2:', kitagawaAoi.area().divide(1e6));
print('DESC pre count:', s1.filterDate(preStart, preEnd).size());
print('DESC post count:', s1.filterDate(postStart, postEnd).size());
print('Flood candidate area m2:', floodArea);
print(
  'Flood candidate area km2:',
  ee.Number(floodArea.values().get(0)).divide(1e6)
);

print('DESC pre images:', s1.filterDate(preStart, preEnd));
print('DESC post images:', s1.filterDate(postStart, postEnd));

// ======================================================
// A4-1: Threshold tuning for flood candidate extraction
// Purpose: compare conservative / moderate / broad candidates
// ======================================================

// 1. Slightly relaxed lowland masks.
var lowlandMask_80m_3deg = dem.lt(80).and(slope.lt(3));
var lowlandMask_120m_5deg = dem.lt(120).and(slope.lt(5));
var lowlandMask_150m_7deg = dem.lt(150).and(slope.lt(7));

// 2. Conservative candidate.
// Similar to previous logic.
var floodConservative = s1Post.lt(-17)
  .and(s1Diff.lt(-2.0))
  .and(lowlandMask_80m_3deg)
  .and(waterOccurrence.lt(50))
  .selfMask();

// 3. Moderate candidate.
// Less strict VV and difference thresholds.
// This is likely the main working layer for Kitagawa.
var floodModerate = s1Post.lt(-15)
  .and(s1Diff.lt(-1.0))
  .and(lowlandMask_120m_5deg)
  .and(waterOccurrence.lt(80))
  .selfMask();

// 4. Broad candidate.
// This is intentionally permissive.
// Use it to see whether plausible floodplain zones appear.
var floodBroad = s1Post.lt(-13)
  .and(s1Diff.lt(-0.5))
  .and(lowlandMask_150m_7deg)
  .and(waterOccurrence.lt(90))
  .selfMask();

// 5. Display layers.
Map.addLayer(
  floodConservative,
  {palette: ['00FFFF']},
  'A4 flood candidate conservative'
);

Map.addLayer(
  floodModerate,
  {palette: ['FF00FF']},
  'A4 flood candidate moderate'
);

Map.addLayer(
  floodBroad,
  {palette: ['FFFF00']},
  'A4 flood candidate broad'
);

// 6. Area estimates.
var areaConservative = floodConservative
  .multiply(ee.Image.pixelArea())
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: kitagawaAoi,
    scale: 30,
    maxPixels: 1e9
  });

var areaModerate = floodModerate
  .multiply(ee.Image.pixelArea())
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: kitagawaAoi,
    scale: 30,
    maxPixels: 1e9
  });

var areaBroad = floodBroad
  .multiply(ee.Image.pixelArea())
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: kitagawaAoi,
    scale: 30,
    maxPixels: 1e9
  });

print('A4 conservative area m2:', areaConservative);
print('A4 conservative area km2:', ee.Number(areaConservative.values().get(0)).divide(1e6));

print('A4 moderate area m2:', areaModerate);
print('A4 moderate area km2:', ee.Number(areaModerate.values().get(0)).divide(1e6));

print('A4 broad area m2:', areaBroad);
print('A4 broad area km2:', ee.Number(areaBroad.values().get(0)).divide(1e6));

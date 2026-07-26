// ======================================================
// DRR PoC: Kitagawa River Basin AOI - Step A1
// Project: gcp-geoai-sandbox
// Target: Kitagawa River Basin, Miyazaki/Oita, Japan
// ======================================================

// 1. Approximate bounding box for the Kitagawa River basin.
// This is a first-pass rectangular AOI, not the exact watershed boundary.
// Coordinates are [longitude, latitude].
var kitagawaAoi = ee.Geometry.Rectangle([
  131.35,  // west
  32.45,   // south
  131.95,  // east
  32.95    // north
]);

// 2. Display settings.
Map.centerObject(kitagawaAoi, 10);
Map.addLayer(
  kitagawaAoi,
  {color: 'red'},
  'Kitagawa AOI - first-pass rectangle'
);

// 3. Add administrative boundary reference.
// GAUL is useful for a quick regional context.
var admin2 = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filterBounds(kitagawaAoi);

Map.addLayer(
  admin2.style({
    color: 'blue',
    fillColor: '00000000',
    width: 1
  }),
  {},
  'Admin boundary reference'
);

// 4. Add SRTM DEM for terrain context.
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

// 5. Print basic AOI information.
print('Kitagawa AOI:', kitagawaAoi);
print('AOI area km2:', kitagawaAoi.area().divide(1e6));
print('Admin2 intersecting AOI:', admin2);

// ======================================================
// Step A2: Terrain-derived flood-prone screening
// ======================================================

// 6. Low elevation mask.
// This is a simple screening layer for lowland / floodplain candidates.
// Threshold can be adjusted later.
var lowElevation = dem.lt(100).selfMask();

Map.addLayer(
  lowElevation,
  {palette: ['cyan']},
  'Low elevation area < 100m'
);

// 7. Gentle slope mask.
// Floodplain candidates are more likely in low-slope areas.
var gentleSlope = slope.lt(5).selfMask();

Map.addLayer(
  gentleSlope,
  {palette: ['purple']},
  'Gentle slope area < 5 deg'
);

// 8. Combined preliminary floodplain candidate.
// This is not a flood map. It is a terrain-screening layer.
var floodplainCandidate = dem.lt(100).and(slope.lt(5)).selfMask();

Map.addLayer(
  floodplainCandidate,
  {palette: ['blue']},
  'Preliminary floodplain candidate'
);

// 9. Add river/water reference using JRC Global Surface Water occurrence.
var waterOccurrence = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('occurrence')
  .clip(kitagawaAoi);

Map.addLayer(
  waterOccurrence,
  {min: 0, max: 100, palette: ['white', 'lightblue', 'blue']},
  'JRC water occurrence'
);

// 10. Permanent / frequent water mask.
// occurrence > 50 means water was observed frequently in the historical record.
var frequentWater = waterOccurrence.gt(50).selfMask();

Map.addLayer(
  frequentWater,
  {palette: ['navy']},
  'Frequent water occurrence > 50%'
);

// 11. Print simple area estimates.
print('Low elevation <100m area km2:', lowElevation.multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: kitagawaAoi,
  scale: 30,
  maxPixels: 1e9
}).get('elevation'));

print('Gentle slope <5deg area km2:', gentleSlope.multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: kitagawaAoi,
  scale: 30,
  maxPixels: 1e9
}).get('slope'));

print('Floodplain candidate area m2:', floodplainCandidate.multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: kitagawaAoi,
  scale: 30,
  maxPixels: 1e9
}));
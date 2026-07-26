// ======================================================
// DRR PoC: Kitagawa River Basin - Sentinel-1 diff clean
// Target: Kitagawa River Basin, Miyazaki/Oita, Japan
// Event: Typhoon 16, September 2016
// Purpose:
//   1. Check actual Sentinel-1 DESC acquisition dates
//   2. Show pre/post VV difference
//   3. Separate darkening / brightening / absolute change
// ======================================================


// ------------------------------
// 1. AOI
// ------------------------------
var aoi = ee.Geometry.Rectangle([
  131.35,  // west
  32.45,   // south
  131.95,  // east
  32.95    // north
]);

Map.centerObject(aoi, 10);
Map.addLayer(aoi, {color: 'red'}, 'AOI');


// ------------------------------
// 2. Terrain mask
// ------------------------------
var dem = ee.Image('USGS/SRTMGL1_003').clip(aoi);
var slope = ee.Terrain.slope(dem);

// Main mask for Kitagawa floodplain screening.
// Adjust later if needed.
var lowlandMask = dem.lt(80).and(slope.lt(3));

Map.addLayer(
  lowlandMask.selfMask(),
  {palette: ['yellow']},
  'Lowland mask: DEM<80m slope<3deg'
);


// ------------------------------
// 3. Water occurrence reference
// ------------------------------
var waterOccurrence = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('occurrence')
  .clip(aoi);

// Use only as reference, not as proof of flooding.
Map.addLayer(
  waterOccurrence,
  {min: 0, max: 100, palette: ['white', 'lightblue', 'blue']},
  'JRC water occurrence'
);


// ------------------------------
// 4. Sentinel-1 DESC setup
// ------------------------------
var preStart  = '2016-09-01';
var preEnd    = '2016-09-18';

var postStart = '2016-09-20';
var postEnd   = '2016-10-05';

var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(aoi)
  .filterDate(preStart, postEnd)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
  .select('VV');

var preCol = s1.filterDate(preStart, preEnd);
var postCol = s1.filterDate(postStart, postEnd);

var pre = preCol.median().clip(aoi);
var post = postCol.median().clip(aoi);

var diff = post.subtract(pre);


// ------------------------------
// 5. Display pre/post/diff
// ------------------------------
Map.addLayer(
  pre.updateMask(lowlandMask),
  {min: -25, max: 0},
  'Pre VV DESC masked'
);

Map.addLayer(
  post.updateMask(lowlandMask),
  {min: -25, max: 0},
  'Post VV DESC masked'
);

Map.addLayer(
  diff.updateMask(lowlandMask),
  {min: -5, max: 5, palette: ['blue', 'white', 'red']},
  'Diff VV DESC masked: post - pre'
);


// ------------------------------
// 6. Change classes
// ------------------------------
// Negative diff: post darker than pre.
// Possible open water / smooth inundation surface.
var darkening = diff.lt(-1.0)
  .and(lowlandMask)
  .and(waterOccurrence.lt(90))
  .selfMask();

// Positive diff: post brighter than pre.
// Possible flooded vegetation, urban double-bounce,
// wet rough surface, sediment/debris, or post-flood surface change.
var brightening = diff.gt(1.0)
  .and(lowlandMask)
  .and(waterOccurrence.lt(90))
  .selfMask();

// Absolute change regardless of sign.
// Possible flood-affected lowland change zone.
var absChange = diff.abs().gt(1.0)
  .and(lowlandMask)
  .and(waterOccurrence.lt(90))
  .selfMask();

Map.addLayer(
  darkening,
  {palette: ['0000FF']},
  'Darkening diff<-1: possible open water'
);

Map.addLayer(
  brightening,
  {palette: ['FF0000']},
  'Brightening diff>1: possible flood-affected rough/veg/urban'
);

Map.addLayer(
  absChange,
  {palette: ['FFFF00']},
  'Absolute change |diff|>1: possible flood-affected zone'
);


// ------------------------------
// 7. Area estimates
// ------------------------------
function areaKm2(maskImage, label) {
  var area = maskImage
    .multiply(ee.Image.pixelArea())
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: aoi,
      scale: 30,
      maxPixels: 1e9
    });

  print(label + ' area m2:', area);
  print(label + ' area km2:', ee.Number(area.values().get(0)).divide(1e6));
}

areaKm2(darkening, 'Darkening');
areaKm2(brightening, 'Brightening');
areaKm2(absChange, 'Absolute change');


// ------------------------------
// 8. Acquisition date check
// ------------------------------
var preDates = preCol
  .aggregate_array('system:time_start')
  .map(function(t) {
    return ee.Date(t).format('YYYY-MM-dd HH:mm');
  });

var postDates = postCol
  .aggregate_array('system:time_start')
  .map(function(t) {
    return ee.Date(t).format('YYYY-MM-dd HH:mm');
  });

print('DESC pre count:', preCol.size());
print('DESC post count:', postCol.size());
print('DESC pre acquisition dates:', preDates);
print('DESC post acquisition dates:', postDates);
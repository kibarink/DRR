// ------------------------------------------------------------
// Hydro AOI polygon
// 屋形原北側小谷の谷地形全体
// ------------------------------------------------------------

var hydroAOI = ee.FeatureCollection(
  'projects/gcp-geoai-sandbox/assets/yakatabaru_flood_aoi'
);

var hydroGeom = hydroAOI.geometry();

// ------------------------------------------------------------
// House polygons
// 元Assetには屋形原以外の建物が含まれる可能性があるため、
// hydroAOIで抽出・clipする
// ------------------------------------------------------------

var housesRaw = ee.FeatureCollection(
  'projects/gcp-geoai-sandbox/assets/yakatabaru_house'
);

// AOIと交差する建物だけ選択
var housesInHydroAOI = housesRaw.filterBounds(hydroGeom);

// 建物ポリゴンをAOI境界でclip
var housesClipped = housesInHydroAOI.map(function(feature) {
  return feature.intersection(hydroGeom, ee.ErrorMargin(1));
});

// ------------------------------------------------------------
// Village evaluation area
// 建物clip後のポリゴンから評価範囲を作る
// ------------------------------------------------------------

var villageArea = housesClipped.geometry().buffer(100).simplify(5);

// ------------------------------------------------------------
// Clip rasters
// ------------------------------------------------------------

var demHydro = demFilled.clip(hydroGeom);
var flowHydro = flowAccum.clip(hydroGeom);
var streamHydro = streamRaster.clip(hydroGeom);

var demVillage = demFilled.clip(villageArea);
var flowVillage = flowAccum.clip(villageArea);
var streamVillage = streamRaster.clip(villageArea);

// ------------------------------------------------------------
// Display
// ------------------------------------------------------------

Map.centerObject(hydroAOI, 15);

Map.addLayer(hydroAOI, {color: 'cyan'}, 'hydroAOI');
Map.addLayer(villageArea, {color: 'yellow'}, 'villageArea from clipped houses');
Map.addLayer(housesClipped, {color: 'red'}, 'houses clipped by hydroAOI');
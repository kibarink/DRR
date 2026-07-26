import rasterio
from rasterio import features
import geopandas as gpd
import numpy as np
from pathlib import Path

# ----------------------------
# 入力
# ----------------------------
# 建物ポリゴン（MultiPolygon / Polygon 混在OK）
poly_file = Path(".") / "QGIS" / "geopackage" / "shiraishi_bld_poly.gpkg" # geojson or .gpkg
# poly_file = Path("..") / "geopackage" / "shiraishi_bld_poly.gpkg" # geojson or .gpkg

# 参照用ラスタ（DEM や slope など）
ref_raster = Path(".") / "QGIS" / "slope_analysis" / "risk_slope_0_1.tif"
# ref_raster = Path("..") / "slope_analysis" / "risk_slope_0_1.tif"

# 出力ラスタ
out_tif = Path(".") / "QGIS" / "slope_analysis" / "houses_bninary.tif"

# ----------------------------
# ポリゴン読み込み
# ----------------------------
gdf = gpd.read_file(poly_file)

# 念のため geometry が空のものを除外
gdf = gdf[~gdf.geometry.is_empty]
gdf = gdf[gdf.geometry.notnull()]

print("polygon feature count:", len(gdf))

# ----------------------------
# 参照ラスタ情報取得
# ----------------------------
with rasterio.open(ref_raster) as src:
    transform = src.transform
    crs = src.crs
    width = src.width
    height = src.height
    dtype = rasterio.uint8

# CRS チェック（重要）
if gdf.crs != crs:
    print("⚠ CRS mismatch: reprojecting polygons")
    gdf = gdf.to_crs(crs)

# ----------------------------
# ラスタ化（ここが核心）
# ----------------------------
# geometry を (geom, value) の形にする
shapes = ((geom, 1) for geom in gdf.geometry)

binary = features.rasterize(
    shapes=shapes,
    out_shape=(height, width),
    transform=transform,
    fill=0,                 # ポリゴン外 = 0
    dtype=dtype,
    all_touched=False       # True にすると境界を太らせる
)

# QC
vals, counts = np.unique(binary, return_counts=True)
print("unique values:", list(zip(vals.tolist(), counts.tolist())))

# ----------------------------
# GeoTIFF 書き出し
# ----------------------------
with rasterio.open(
    out_tif,
    "w",
    driver="GTiff",
    height=height,
    width=width,
    count=1,
    dtype=dtype,
    crs=crs,
    transform=transform,
    nodata=0,
) as dst:
    dst.write(binary, 1)

print("✅ exported:", out_tif)

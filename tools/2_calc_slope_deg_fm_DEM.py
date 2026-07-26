import rasterio
import numpy as np
from pathlib import Path
# ----------------------------
# 入出力
# ----------------------------
dem_tif = Path(".") / "QGIS" / "地理院DEM" / "DEM_Nobeoka25_493105.tif"
out_slope_tif = Path(".") / "QGIS" / "slope_analysis" / "DEM_Nobeoka25_slope_deg.tif"

# ----------------------------
# DEM 読み込み
# ----------------------------
with rasterio.open(dem_tif) as src:
    dem = src.read(1).astype(np.float64)
    transform = src.transform
    crs = src.crs
    nodata = src.nodata
    profile = src.profile

# NoData マスク
if nodata is not None:
    dem = np.where(dem == nodata, np.nan, dem)

# ----------------------------
# ピクセルサイズ取得（m）
# ----------------------------
dx = transform.a              # pixel width
dy = -transform.e             # pixel height（負なので符号反転）

print(f"pixel size: dx={dx}, dy={dy}")

# ----------------------------
# Horn 法による勾配計算
# ----------------------------
# 周囲8セルを使う
z1 = dem[:-2, :-2]
z2 = dem[:-2, 1:-1]
z3 = dem[:-2, 2:]
z4 = dem[1:-1, :-2]
z5 = dem[1:-1, 1:-1]
z6 = dem[1:-1, 2:]
z7 = dem[2:, :-2]
z8 = dem[2:, 1:-1]
z9 = dem[2:, 2:]

dzdx = (
    (z3 + 2*z6 + z9) - (z1 + 2*z4 + z7)
) / (8 * dx)

dzdy = (
    (z7 + 2*z8 + z9) - (z1 + 2*z2 + z3)
) / (8 * dy)

# ----------------------------
# 傾斜角（degree）
# ----------------------------
slope_rad = np.arctan(np.sqrt(dzdx**2 + dzdy**2))
slope_deg = np.degrees(slope_rad)

# 出力配列（サイズを元に戻す）
slope = np.full(dem.shape, np.nan)
slope[1:-1, 1:-1] = slope_deg

# NoData を戻す
if nodata is not None:
    slope = np.where(np.isnan(slope), nodata, slope)

# ----------------------------
# GeoTIFF 出力
# ----------------------------
profile.update(
    dtype=rasterio.float32,
    count=1,
    nodata=nodata,
    compress="lzw"
)

with rasterio.open(out_slope_tif, "w", **profile) as dst:
    dst.write(slope.astype(rasterio.float32), 1)

print("✅ slope raster exported:", out_slope_tif)

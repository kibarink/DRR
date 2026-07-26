import rasterio
import numpy as np
from pathlib import Path

# ----------------------------
# 入出力
# ----------------------------
slope_tif = Path(".") / "QGIS" / "slope_analysis" / "DEM_Nobeoka25_slope_deg.tif"
# slope_tif = Path(".") / "QGIS" / "slope_analysis" / "DEM_25.tif"
out_bin_tif = Path(".") / "QGIS" / "slope_analysis" / "DEM_Nobeoka25_slope_deg_bin.tif"

SLOPE_THRESHOLD = 30

# ----------------------------
# 読み込み
# ----------------------------
with rasterio.open(slope_tif) as src:
    slope = src.read(1).astype(np.float32)
    profile = src.profile
    nodata = src.nodata

print("input nodata:", nodata)

# ----------------------------
# 有効マスク
# ----------------------------
if nodata is not None:
    valid_mask = slope != nodata
else:
    valid_mask = np.ones(slope.shape, dtype=bool)

# ----------------------------
# 2値化
# ----------------------------
binary = np.zeros(slope.shape, dtype=np.uint8)
binary[(slope >= SLOPE_THRESHOLD) & valid_mask] = 1

# 👉 NoData は作らない（DEM外 = 0 扱い）

# ----------------------------
# QC
# ----------------------------
vals, counts = np.unique(binary, return_counts=True)
print("binary unique values:", list(zip(vals.tolist(), counts.tolist())))

# ----------------------------
# 出力設定
# ----------------------------
profile.update(
    dtype=rasterio.uint8,
    count=1,
    nodata=None,          # ← ここが重要
    compress="lzw"
)

with rasterio.open(out_bin_tif, "w", **profile) as dst:
    dst.write(binary, 1)

print("✅ binary slope raster exported:", out_bin_tif)

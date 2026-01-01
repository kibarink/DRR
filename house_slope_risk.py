import rasterio
import numpy as np
from scipy.ndimage import distance_transform_edt
from pathlib import Path

# ----------------------------
# 入力
# ----------------------------
house_tif = Path(".") / "QGIS" / "slope_analysis" / "houses_binary.tif"         # house = 1
slope_tif = Path(".") / "QGIS" / "slope_analysis" / "DEM_Nobeoka25_slope_deg_bin.tif"        # slope >=30deg = 1
out_tif   = Path(".") / "QGIS" / "slope_analysis" / "house_highrisk_5m.tif"

RISK_RADIUS_M = 10.0  # ← 半径（m）

# ----------------------------
# ラスタ読み込み
# ----------------------------
with rasterio.open(house_tif) as src:
    house = src.read(1).astype(np.uint8)
    profile = src.profile
    transform = src.transform

with rasterio.open(slope_tif) as src:
    slope = src.read(1).astype(np.uint8)

# ----------------------------
# ピクセルサイズ（m）
# ----------------------------
dx = transform.a
dy = -transform.e
pixel_size = (dx + dy) / 2.0

print(f"pixel size = {pixel_size} m")

# ----------------------------
# slope=1 からの距離計算
# ----------------------------
# distance_transform_edt は「0からの距離」を返す
# → slope=1 を 0、その他を 1 に反転
slope_mask = slope == 1
dist_pix = distance_transform_edt(~slope_mask)

# メートルに変換
dist_m = dist_pix * pixel_size

# ----------------------------
# ハイリスク判定
# ----------------------------
highrisk = np.zeros(house.shape, dtype=np.uint8)

# 条件：
# 1) house = 1
# 2) slope >=30deg までの距離 <= 5m
highrisk[(house == 1) & (dist_m <= RISK_RADIUS_M)] = 1

# ----------------------------
# 可視化用：家の周囲5mを塗る
# ----------------------------
# house=1 を起点に距離計算
house_mask = house == 1
house_dist_pix = distance_transform_edt(~house_mask)
house_dist_m = house_dist_pix * pixel_size

# 家の周囲5m
risk_zone = np.zeros(house.shape, dtype=np.uint8)
risk_zone[(house_dist_m <= RISK_RADIUS_M) & (highrisk == 1)] = 1

# ----------------------------
# 出力
# ----------------------------
profile.update(
    dtype=rasterio.uint8,
    count=1,
    nodata=0,
    compress="lzw"
)

with rasterio.open(out_tif, "w", **profile) as dst:
    dst.write(risk_zone, 1)

print("✅ exported:", out_tif)

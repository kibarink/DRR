import rioxarray as rxr
import xarray as xr
from rasterio.enums import Resampling
from pathlib import Path
from rasterio.warp import reproject
import numpy as np


dem = rxr.open_rasterio(
    "地理院DEM\DEM_Nobeoka25_493105.tif",
    masked=True
).squeeze()

alos = rxr.open_rasterio(
    "Jaxa_alos\\2024JPN_v25.04\\LC_N32E131.tif",
    masked=True
).squeeze()

out_tif = Path(".") / "slope_analysis" / "ALOS_on_DEM_Nobeoka25.tif"


# ALOSをまずDEMと同じCRSへ（ここは通常通り）
alos_6670 = alos.rio.reproject("EPSG:6670", resampling=Resampling.nearest)

# DEMのグリッド定義（ここが核）
dst_transform = dem.rio.transform()
dst_crs = dem.rio.crs
dst_height, dst_width = dem.shape

# 出力配列をDEMと同じ形で用意
dst = np.full((dst_height, dst_width), np.nan, dtype=alos_6670.dtype)

# rasterioで transform を強制して再投影（カテゴリなので nearest）
reproject(
    source=alos_6670.values,
    destination=dst,
    src_transform=alos_6670.rio.transform(),
    src_crs=alos_6670.rio.crs,
    dst_transform=dst_transform,
    dst_crs=dst_crs,
    resampling=Resampling.nearest,
    src_nodata=alos_6670.rio.nodata,
    dst_nodata=np.nan
)

# xarrayに戻して、DEMと同じ座標を付与
alos_on_dem = xr.DataArray(
    dst,
    dims=("y", "x"),
    coords={"y": dem["y"], "x": dem["x"]},
    name="ALOS_LULC_on_DEM"
).rio.write_crs(dst_crs).rio.write_transform(dst_transform)

# 最終確認（ここがTrueになれば勝ち）
print("transform equal?:", alos_on_dem.rio.transform() == dem.rio.transform())
print("bounds equal?:", np.allclose(alos_on_dem.rio.bounds(), dem.rio.bounds()))
print("shape equal?:", alos_on_dem.shape == dem.shape)

alos_on_dem.rio.to_raster(out_tif)


# import matplotlib.pyplot as plt

# fig, ax = plt.subplots(figsize=(7, 7))

# # 下地：DEM（グレー）
# dem.plot(ax=ax, cmap="gray", add_colorbar=False)

# # 上：ALOS（カテゴリなので colormap は後で変える。まずは半透明で確認）
# alos_on_dem.plot(ax=ax, alpha=0.6, add_colorbar=False)

# ax.set_aspect("equal")
# ax.set_title("DEM + ALOS LULC (overlay)")
# plt.show()



import numpy as np
import rasterio

# ==========================
#  DRR Simple Flow (D8)
# ==========================

# ---- 設定（ここだけ変えればOK） ----
DEM_TIF = "QGIS/地理院DEM/DEM_Nobeoka25_493105.tif"
OUT_FLOWDIR = "flow_analysis/flow_dir_d8.tif"
OUT_ACC = "flow_analysis/flow_acc.tif"
OUT_STREAMS = "flow_analysis/streams_bin.tif"

# 「流路」とみなす集水面積（セル数）閾値
# 例：10m DEMなら 1000セル=約0.1km^2
STREAM_ACC_THRESHOLD = 500

# -----------------------------------
# D8方向定義（ESRI/一般のD8とは符号が違うので、ここは自前定義）
# 方向コード: 1=E,2=NE,3=N,4=NW,5=W,6=SW,7=S,8=SE
# -----------------------------------
DIRS = [
    (0,  1),   # 1 E
    (-1, 1),   # 2 NE
    (-1, 0),   # 3 N
    (-1, -1),  # 4 NW
    (0, -1),   # 5 W
    (1, -1),   # 6 SW
    (1,  0),   # 7 S
    (1,  1)    # 8 SE
]

def d8_flow_direction(dem: np.ndarray, nodata_mask: np.ndarray) -> np.ndarray:
    """最急降下方向に1..8のコードを付与。流れ先なしは0。"""
    nrows, ncols = dem.shape
    fdir = np.zeros((nrows, ncols), dtype=np.uint8)

    # 近傍差分を全方向で評価
    for r in range(1, nrows - 1):
        for c in range(1, ncols - 1):
            if nodata_mask[r, c]:
                continue

            z0 = dem[r, c]
            best_drop = 0.0
            best_code = 0

            # 8近傍
            for code, (dr, dc) in enumerate(DIRS, start=1):
                rr, cc = r + dr, c + dc
                if nodata_mask[rr, cc]:
                    continue
                dz = z0 - dem[rr, cc]  # drop (>0 なら下り)
                if dz <= 0:
                    continue

                # 対角は距離sqrt(2)、直交は1
                dist = 1.41421356 if (dr != 0 and dc != 0) else 1.0
                slope = dz / dist

                if slope > best_drop:
                    best_drop = slope
                    best_code = code

            fdir[r, c] = best_code  # 0なら流れ先なし
    return fdir

def flow_accumulation(fdir: np.ndarray, nodata_mask: np.ndarray) -> np.ndarray:
    """各セルに流入する上流セル数（簡易集水面積）を計算。"""
    nrows, ncols = fdir.shape
    acc = np.ones((nrows, ncols), dtype=np.int32)  # 自分自身を1
    acc[nodata_mask] = 0

    # 各セルの「流れ先」を作る
    to_r = np.full((nrows, ncols), -1, dtype=np.int32)
    to_c = np.full((nrows, ncols), -1, dtype=np.int32)
    indeg = np.zeros((nrows, ncols), dtype=np.int32)

    for r in range(nrows):
        for c in range(ncols):
            if nodata_mask[r, c]:
                continue
            code = int(fdir[r, c])
            if code == 0:
                continue
            dr, dc = DIRS[code - 1]
            rr, cc = r + dr, c + dc
            if rr < 0 or rr >= nrows or cc < 0 or cc >= ncols:
                continue
            if nodata_mask[rr, cc]:
                continue
            to_r[r, c] = rr
            to_c[r, c] = cc
            indeg[rr, cc] += 1

    # トポロジカル順（上流から下流へ）
    from collections import deque
    q = deque()
    for r in range(nrows):
        for c in range(ncols):
            if nodata_mask[r, c]:
                continue
            if indeg[r, c] == 0:
                q.append((r, c))

    while q:
        r, c = q.popleft()
        rr, cc = to_r[r, c], to_c[r, c]
        if rr == -1:
            continue
        acc[rr, cc] += acc[r, c]
        indeg[rr, cc] -= 1
        if indeg[rr, cc] == 0:
            q.append((rr, cc))

    return acc

def main():
    with rasterio.open(DEM_TIF) as src:
        dem = src.read(1).astype(np.float32)
        profile = src.profile
        nodata = src.nodata

    if nodata is None:
        nodata_mask = ~np.isfinite(dem)
    else:
        nodata_mask = (dem == nodata) | (~np.isfinite(dem))

    # 1) D8流向
    fdir = d8_flow_direction(dem, nodata_mask)

    # 2) 集水面積（セル数）
    acc = flow_accumulation(fdir, nodata_mask)

    # 3) 流路（閾値）
    streams = (acc >= STREAM_ACC_THRESHOLD).astype(np.uint8)
    streams[nodata_mask] = 0

    # 出力
    prof_u8 = profile.copy()
    prof_u8.update(dtype=rasterio.uint8, count=1, nodata=0, compress="lzw")

    with rasterio.open(OUT_FLOWDIR, "w", **prof_u8) as dst:
        dst.write(fdir.astype(np.uint8), 1)

    prof_i32 = profile.copy()
    prof_i32.update(dtype=rasterio.int32, count=1, nodata=0, compress="lzw")

    with rasterio.open(OUT_ACC, "w", **prof_i32) as dst:
        dst.write(acc.astype(np.int32), 1)

    with rasterio.open(OUT_STREAMS, "w", **prof_u8) as dst:
        dst.write(streams, 1)

    print("✅ Exported:")
    print(" -", OUT_FLOWDIR)
    print(" -", OUT_ACC)
    print(" -", OUT_STREAMS)

if __name__ == "__main__":
    main()

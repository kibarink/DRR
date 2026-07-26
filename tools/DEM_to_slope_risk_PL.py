"""
建物ポリゴン × 斜面危険度 による家屋リスク抽出パイプライン
- Step1: 建物ポリゴン → バイナリラスタ
- Step2: DEM → 傾斜角（degree）
- Step3: 傾斜角 → 2値化ラスタ
- Step4: 建物 × 危険斜面 → ハイリスク家屋ゾーン
"""

from dataclasses import dataclass
from pathlib import Path
import geopandas as gpd
import numpy as np
import rasterio
from rasterio import features
from scipy.ndimage import distance_transform_edt
import yaml


# ============================
# dataclass による設定管理
# ============================

@dataclass
class IOConfig:
    """ファイル入出力のパス設定"""

    # Step1: 建物ポリゴン → バイナリラスタ
    poly_file: Path
    ref_raster: Path
    bld_bin_tif: Path

    # Step2: DEM → 傾斜角ラスタ
    dem_tif: Path
    slope_deg_tif: Path

    # Step3: 傾斜角ラスタ → 2値化ラスタ
    slope_bin_tif: Path

    # Step4: 建物 × 危険斜面 → リスクラスタ
    bld_risk_tif: Path


@dataclass
class Params:
    """解析パラメータ"""

    slope_threshold: float  # 斜面の危険閾値（度）
    risk_radius_m: float    # 危険斜面からの距離閾値（m）


@dataclass
class Config:
    """パイプライン全体の設定"""

    io: IOConfig
    params: Params


# ============================
# デフォルト設定（直接実行用）
# ============================

def load_config_from_yaml(yaml_path: Path) -> Config:
    with open(yaml_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    # --- Params の構築 ---
    params = Params(
        slope_threshold=float(data["params"]["slope_threshold"]),
        risk_radius_m=float(data["params"]["risk_radius_m"]),
    )

    # --- bld_risk_tif のテンプレート展開 ---
    radius_int = int(params.risk_radius_m)
    bld_risk_tif_str = data["io"]["bld_risk_tif"].format(
        risk_radius_m=radius_int
    )


    # --- IOConfig の構築 ---
    io = IOConfig(
        poly_file=Path(data["io"]["poly_file"]),
        ref_raster=Path(data["io"]["ref_raster"]),
        bld_bin_tif=Path(data["io"]["bld_bin_tif"]),
        dem_tif=Path(data["io"]["dem_tif"]),
        slope_deg_tif=Path(data["io"]["slope_deg_tif"]),
        slope_bin_tif=Path(data["io"]["slope_bin_tif"]),
        bld_risk_tif=Path(bld_risk_tif_str),
    )

    return Config(io=io, params=params)

# ============================
# Step1: 建物ポリゴン → バイナリラスタ
# ============================

def rasterize_buildings(poly_file: Path, ref_raster: Path, out_tif: Path) -> Path:
    """建物ポリゴンを参照ラスタに合わせてラスタ化する"""

    # ポリゴン読み込み
    gdf = gpd.read_file(poly_file)

    # 空ジオメトリ除外
    gdf = gdf[~gdf.geometry.is_empty]
    gdf = gdf[gdf.geometry.notnull()]

    print("[Step1] polygon feature count:", len(gdf))

    # 参照ラスタ情報取得
    with rasterio.open(ref_raster) as src:
        transform = src.transform
        crs = src.crs
        width = src.width
        height = src.height
        dtype = rasterio.uint8

    # CRS チェック
    if gdf.crs != crs:
        print("[Step1] ⚠ CRS mismatch: reprojecting polygons")
        gdf = gdf.to_crs(crs)

    # ラスタ化
    shapes = ((geom, 1) for geom in gdf.geometry)

    binary = features.rasterize(
        shapes=shapes,
        out_shape=(height, width),
        transform=transform,
        fill=0,           # 建物外 = 0
        dtype=dtype,
        all_touched=False # True で境界を太らせる
    )

    # QC
    vals, counts = np.unique(binary, return_counts=True)
    print("[Step1] unique values:", list(zip(vals.tolist(), counts.tolist())))

    # GeoTIFF 書き出し
    out_tif.parent.mkdir(parents=True, exist_ok=True)
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
        compress="lzw",
    ) as dst:
        dst.write(binary, 1)

    print("[Step1] ✅ exported:", out_tif)
    return out_tif


# ============================
# Step2: DEM → 傾斜角ラスタ
# ============================

def compute_slope(dem_tif: Path, out_slope_tif: Path) -> Path:
    """DEM から Horn 法で傾斜角（degree）を計算する"""

    with rasterio.open(dem_tif) as src:
        dem = src.read(1).astype(np.float64)
        transform = src.transform
        crs = src.crs
        nodata = src.nodata
        profile = src.profile

    # NoData マスク
    if nodata is not None:
        dem = np.where(dem == nodata, np.nan, dem)

    # ピクセルサイズ（m）
    dx = transform.a           # pixel width
    dy = -transform.e          # pixel height（負なので反転）
    print(f"[Step2] pixel size: dx={dx}, dy={dy}")

    # Horn 法（8近傍）
    z1 = dem[:-2, :-2]
    z2 = dem[:-2, 1:-1]
    z3 = dem[:-2, 2:]
    z4 = dem[1:-1, :-2]
    z5 = dem[1:-1, 1:-1]
    z6 = dem[1:-1, 2:]
    z7 = dem[2:, :-2]
    z8 = dem[2:, 1:-1]
    z9 = dem[2:, 2:]

    dzdx = ((z3 + 2 * z6 + z9) - (z1 + 2 * z4 + z7)) / (8 * dx)
    dzdy = ((z7 + 2 * z8 + z9) - (z1 + 2 * z2 + z3)) / (8 * dy)

    # 傾斜角（degree）
    slope_rad = np.arctan(np.sqrt(dzdx ** 2 + dzdy ** 2))
    slope_deg = np.degrees(slope_rad)

    slope = np.full(dem.shape, np.nan)
    slope[1:-1, 1:-1] = slope_deg

    # NoData を戻す
    if nodata is not None:
        slope = np.where(np.isnan(slope), nodata, slope)

    # GeoTIFF 出力
    profile.update(
        dtype=rasterio.float32,
        count=1,
        nodata=nodata,
        crs=crs,
        transform=transform,
        compress="lzw",
    )

    out_slope_tif.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(out_slope_tif, "w", **profile) as dst:
        dst.write(slope.astype(rasterio.float32), 1)

    print("[Step2] ✅ slope raster exported:", out_slope_tif)
    return out_slope_tif


# ============================
# Step3: 傾斜角 → 2値化ラスタ
# ============================

def binarize_slope(slope_tif: Path, slope_threshold: float, out_bin_tif: Path) -> Path:
    """傾斜角ラスタを閾値で2値化する"""

    with rasterio.open(slope_tif) as src:
        slope = src.read(1).astype(np.float32)
        profile = src.profile
        nodata = src.nodata

    print("[Step3] input nodata:", nodata)

    # 有効マスク
    if nodata is not None:
        valid_mask = slope != nodata
    else:
        valid_mask = np.ones(slope.shape, dtype=bool)

    # 2値化
    binary = np.zeros(slope.shape, dtype=np.uint8)
    binary[(slope >= slope_threshold) & valid_mask] = 1

    # QC
    vals, counts = np.unique(binary, return_counts=True)
    print("[Step3] binary unique values:", list(zip(vals.tolist(), counts.tolist())))

    # 出力設定
    profile.update(
        dtype=rasterio.uint8,
        count=1,
        nodata=None,   # DEM 外も 0 として扱う
        compress="lzw",
    )

    out_bin_tif.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(out_bin_tif, "w", **profile) as dst:
        dst.write(binary, 1)

    print("[Step3] ✅ binary slope raster exported:", out_bin_tif)
    return out_bin_tif


# ============================
# Step4: 建物 × 危険斜面 → リスクラスタ
# ============================

def compute_highrisk(
    bld_bin_tif: Path,
    slope_bin_tif: Path,
    risk_radius_m: float,
    out_tif: Path,
) -> Path:
    """建物と危険斜面の距離からハイリスク領域を計算する"""

    # ラスタ読み込み
    with rasterio.open(bld_bin_tif) as src:
        house = src.read(1).astype(np.uint8)
        profile = src.profile
        transform = src.transform

    with rasterio.open(slope_bin_tif) as src:
        slope = src.read(1).astype(np.uint8)

    # ピクセルサイズ（m）
    dx = transform.a
    dy = -transform.e
    pixel_size = (dx + dy) / 2.0
    print(f"[Step4] pixel size = {pixel_size} m")

    # slope=1 からの距離（distance_transform_edt は 0 からの距離を返す）
    slope_mask = slope == 1
    dist_pix = distance_transform_edt(~slope_mask)
    dist_m = dist_pix * pixel_size

    # ハイリスク判定
    highrisk = np.zeros(house.shape, dtype=np.uint8)
    highrisk[(house == 1) & (dist_m <= risk_radius_m)] = 1

    # 可視化用：家の周囲 risk_radius_m m で、かつ highrisk=1 の領域
    house_mask = house == 1
    house_dist_pix = distance_transform_edt(~house_mask)
    house_dist_m = house_dist_pix * pixel_size

    risk_zone = np.zeros(house.shape, dtype=np.uint8)
    risk_zone[(house_dist_m <= risk_radius_m) & (highrisk == 1)] = 1

    # 出力
    profile.update(
        dtype=rasterio.uint8,
        count=1,
        nodata=0,
        compress="lzw",
    )

    out_tif.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(out_tif, "w", **profile) as dst:
        dst.write(risk_zone, 1)

    print("[Step4] ✅ exported:", out_tif)
    return out_tif


# ============================
# パイプライン本体
# ============================

def run_pipeline(config: Config) -> None:
    """4 ステップを順に実行するパイプライン"""

    io = config.io
    p = config.params

    rasterize_buildings(io.poly_file, io.ref_raster, io.bld_bin_tif)
    compute_slope(io.dem_tif, io.slope_deg_tif)
    binarize_slope(io.slope_deg_tif, p.slope_threshold, io.slope_bin_tif)
    compute_highrisk(io.bld_bin_tif, io.slope_bin_tif, p.risk_radius_m, io.bld_risk_tif)


if __name__ == "__main__":
    config = load_config_from_yaml(Path("config/slope_risk.yaml"))
    run_pipeline(config)


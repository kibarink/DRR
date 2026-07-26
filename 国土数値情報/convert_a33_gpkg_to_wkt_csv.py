from pathlib import Path
import json
import pandas as pd
import geopandas as gpd

# 入力・出力ファイル
input_gpkg = Path("A33_kitagawa_clip.gpkg")
output_csv = Path("A33_kitagawa_clip_wkt.csv")

# GeoPackageを読む
gdf = gpd.read_file(input_gpkg)

print("input features:", len(gdf))
print("input crs:", gdf.crs)
print("columns:", list(gdf.columns))

# BigQuery用にEPSG:4326へ変換
if gdf.crs is None:
    raise ValueError("CRS is undefined. Please set CRS in QGIS before running this script.")

gdf = gdf.to_crs(epsg=4326)

# 不正ジオメトリの簡易修復
gdf["geometry"] = gdf["geometry"].buffer(0)

# 空ジオメトリ除外
gdf = gdf[~gdf.geometry.is_empty & gdf.geometry.notnull()].copy()

# WKT列を作成
gdf["wkt"] = gdf.geometry.to_wkt()

# 人間可読ラベルを追加
def phenomenon_label(code):
    try:
        code = int(code)
    except Exception:
        return "不明"

    return {
        1: "急傾斜地の崩壊",
        2: "土石流",
        3: "地すべり",
    }.get(code, "不明")


def zone_label(code):
    try:
        code = int(code)
    except Exception:
        return "不明"

    return {
        1: "土砂災害警戒区域",
        2: "土砂災害特別警戒区域",
    }.get(code, "不明")


def prefecture_label(code):
    try:
        code = int(code)
    except Exception:
        return "その他"

    return {
        44: "大分県",
        45: "宮崎県",
    }.get(code, "その他")


def special_warning_status(code):
    try:
        code = int(code)
    except Exception:
        return "不明"

    return {
        0: "特別警戒区域指定済み",
        1: "特別警戒区域未指定",
    }.get(code, "不明")


gdf["phenomenon_type_ja"] = gdf["A33_001"].apply(phenomenon_label)
gdf["zone_type_ja"] = gdf["A33_002"].apply(zone_label)
gdf["prefecture_ja"] = gdf["A33_003"].apply(prefecture_label)
gdf["special_warning_status"] = gdf["A33_008"].apply(special_warning_status)

# 元属性をJSONでも保存しておく
attr_cols = [c for c in gdf.columns if c != "geometry"]
gdf["properties_json"] = gdf[attr_cols].drop(columns=["wkt"], errors="ignore").apply(
    lambda row: json.dumps(row.to_dict(), ensure_ascii=False, default=str),
    axis=1
)

# BigQuery投入用の列だけ選ぶ
out_cols = [
    "A33_001",
    "A33_002",
    "A33_003",
    "A33_004",
    "A33_005",
    "A33_006",
    "A33_007",
    "A33_008",
    "phenomenon_type_ja",
    "zone_type_ja",
    "prefecture_ja",
    "special_warning_status",
    "properties_json",
    "wkt",
]

# 存在する列だけに絞る
out_cols = [c for c in out_cols if c in gdf.columns]

out = gdf[out_cols].copy()

# CSV出力
out.to_csv(output_csv, index=False, encoding="utf-8-sig")

print("output:", output_csv)
print("output features:", len(out))
print(out.head())
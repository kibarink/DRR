from pathlib import Path
import json
import geopandas as gpd

input_gpkg = Path("kitagawa_valley_yakatabaru_aoi.gpkg")
output_csv = Path("yakatabaru_valley_aoi_wkt.csv")

gdf = gpd.read_file(input_gpkg)

print("input features:", len(gdf))
print("input crs:", gdf.crs)
print("columns:", list(gdf.columns))

if gdf.crs is None:
    raise ValueError("CRS is undefined. Please set CRS in QGIS before running this script.")

gdf = gdf.to_crs(epsg=4326)

gdf["geometry"] = gdf["geometry"].buffer(0)
gdf = gdf[~gdf.geometry.is_empty & gdf.geometry.notnull()].copy()

gdf["valley_id"] = gdf.get("valley_id", "yakatabaru_valley_01")
gdf["valley_name"] = gdf.get("valley_name", "屋形原北側小谷")
gdf["purpose"] = gdf.get("purpose", "valley_scale_sediment_runout_screening")

gdf["wkt"] = gdf.geometry.to_wkt()

attr_cols = [c for c in gdf.columns if c != "geometry"]
gdf["properties_json"] = gdf[attr_cols].drop(columns=["wkt"], errors="ignore").apply(
    lambda row: json.dumps(row.to_dict(), ensure_ascii=False, default=str),
    axis=1
)

out = gdf[
    [
        "valley_id",
        "valley_name",
        "purpose",
        "properties_json",
        "wkt",
    ]
].copy()

out.to_csv(output_csv, index=False, encoding="utf-8-sig")

print("output:", output_csv)
print("output features:", len(out))
print(out.head())
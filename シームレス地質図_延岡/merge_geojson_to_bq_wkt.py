import json
import csv
from pathlib import Path
from shapely.geometry import shape

input_files = [
    Path("4831_poly.geojson"),
    Path("4931_poly.geojson"),
]

output_csv = Path("kitagawa_geology_wkt.csv")

rows = []
skipped = 0

for src in input_files:
    print(f"reading: {src}")
    with src.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if data.get("type") == "FeatureCollection":
        features = data.get("features", [])
    elif data.get("type") == "Feature":
        features = [data]
    else:
        raise ValueError(f"{src}: unsupported GeoJSON root type: {data.get('type')}")

    for i, feat in enumerate(features):
        geom_json = feat.get("geometry")
        props = feat.get("properties") or {}

        if not geom_json:
            skipped += 1
            continue

        symbol = props.get("symbol")
        if symbol is None:
            skipped += 1
            continue

        try:
            geom = shape(geom_json)

            # invalid geometry の簡易修復
            if not geom.is_valid:
                geom = geom.buffer(0)

            if geom.is_empty:
                skipped += 1
                continue

            rows.append({
                "source_file": src.name,
                "feature_index": i,
                "symbol": str(symbol),
                "wkt": geom.wkt,
                "properties_json": json.dumps(props, ensure_ascii=False),
            })

        except Exception as e:
            print(f"skip {src.name} feature {i}: {e}")
            skipped += 1

with output_csv.open("w", encoding="utf-8-sig", newline="") as f:
    writer = csv.DictWriter(
        f,
        fieldnames=["source_file", "feature_index", "symbol", "wkt", "properties_json"]
    )
    writer.writeheader()
    writer.writerows(rows)

print("done")
print(f"output: {output_csv}")
print(f"valid rows: {len(rows)}")
print(f"skipped rows: {skipped}")
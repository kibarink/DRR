import json
from pathlib import Path

input_files = [
    Path("4831_poly.geojson"),
    Path("4931_poly.geojson"),
]

output_file = Path("kitagawa_geology_bq.ndgeojson")

valid = 0
skipped = 0

with output_file.open("w", encoding="utf-8") as out:
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

        for feat in features:
            if feat.get("type") != "Feature":
                skipped += 1
                continue

            geom = feat.get("geometry")
            props = feat.get("properties") or {}

            if geom is None:
                skipped += 1
                continue

            # symbol がないFeatureはBigQuery上で凡例JOINできないので警告だけ出して残します
            if "symbol" not in props:
                print(f"warning: {src} feature has no properties.symbol")

            out_feature = {
                "type": "Feature",
                "geometry": geom,
                "properties": props,
            }

            if "id" in feat:
                out_feature["id"] = feat["id"]

            out.write(
                json.dumps(out_feature, ensure_ascii=False, separators=(",", ":"))
                + "\n"
            )
            valid += 1

print("done")
print(f"output: {output_file}")
print(f"valid features: {valid}")
print(f"skipped features: {skipped}")
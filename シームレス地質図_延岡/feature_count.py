import json
from pathlib import Path

for name in ["4831_poly.geojson", "4931_poly.geojson"]:
    with Path(name).open("r", encoding="utf-8") as f:
        data = json.load(f)

    if data.get("type") == "FeatureCollection":
        n = len(data.get("features", []))
    elif data.get("type") == "Feature":
        n = 1
    else:
        n = None

    print(name, n)
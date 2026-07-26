from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import rasterio
from matplotlib.axes import Axes
from matplotlib.colors import ListedColormap


BASE_DIR = Path(__file__).resolve().parent
DEM_PATH = BASE_DIR / "\u5730\u7406\u9662DEM" / "DEM_Nobeoka25_493105.tif"
SLOPE_DEG_PATH = BASE_DIR / "slope_analysis" / "DEM_Nobeoka25_slope_deg.tif"
SLOPE_BIN_PATH = BASE_DIR / "slope_analysis" / "DEM_Nobeoka25_slope_deg_bin.tif"
HIGHRISK_PATH = BASE_DIR / "slope_analysis" / "house_highrisk_20m.tif"
BUILDING_PATH = BASE_DIR / "slope_analysis" / "shiraishi_bld_poly.gpkg"
OUTPUT_PATH = BASE_DIR / "outputs" / "nobeoka_map_tiles.png"
BUILDING_TYPE_LABELS = {
    "\u5805\u308d\u3046\u5efa\u7269": "reinforced",
    "\u666e\u901a\u5efa\u7269": "standard",
    "\u666e\u901a\u7121\u58c1\u820e": "open-sided",
}


@dataclass
class RasterLayer:
    title: str
    path: Path
    cmap: str | ListedColormap
    stats_label: str
    alpha: float = 1.0


def read_raster(path: Path) -> tuple[np.ma.MaskedArray, tuple[float, float, float, float]]:
    with rasterio.open(path) as src:
        data = src.read(1, masked=True)
        bounds = src.bounds
    extent = (bounds.left, bounds.right, bounds.bottom, bounds.top)
    return data, extent


def plot_raster(ax: Axes, layer: RasterLayer) -> None:
    data, extent = read_raster(layer.path)
    image = ax.imshow(
        data,
        cmap=layer.cmap,
        extent=extent,
        origin="upper",
        alpha=layer.alpha,
    )
    ax.set_title(layer.title)
    ax.set_xlabel("X")
    ax.set_ylabel("Y")
    plt.colorbar(image, ax=ax, fraction=0.046, pad=0.04, label=layer.stats_label)


def load_buildings() -> gpd.GeoDataFrame:
    buildings = gpd.read_file(BUILDING_PATH, layer="shiraishi_bld_poly")
    buildings["type_label"] = (
        buildings["type"].fillna("unknown").map(BUILDING_TYPE_LABELS).fillna("unknown")
    )
    return buildings


def plot_buildings(ax: Axes, buildings: gpd.GeoDataFrame) -> None:
    buildings.plot(
        ax=ax,
        column="type_label",
        categorical=True,
        linewidth=0.15,
        edgecolor="black",
        legend=True,
    )
    ax.set_title("Building polygons")
    ax.set_xlabel("Longitude")
    ax.set_ylabel("Latitude")


def summarise_buildings(buildings: gpd.GeoDataFrame) -> list[str]:
    type_counts = buildings["type_label"].value_counts().sort_values(ascending=False)
    devdate_counts = buildings["devDate"].fillna("unknown").value_counts().sort_values(ascending=False)
    bounds = buildings.total_bounds

    lines = [
        "Building attributes",
        f"count: {len(buildings):,}",
        f"crs: {buildings.crs}",
        (
            "bounds(lon/lat): "
            f"{bounds[0]:.6f}, {bounds[1]:.6f}, {bounds[2]:.6f}, {bounds[3]:.6f}"
        ),
        "",
        "type counts:",
    ]
    lines.extend(f"- {name}: {count:,}" for name, count in type_counts.head(5).items())
    lines.append("")
    lines.append("devDate counts:")
    lines.extend(f"- {name}: {count:,}" for name, count in devdate_counts.head(5).items())
    return lines


def plot_summary(ax: Axes, lines: list[str]) -> None:
    ax.set_title("Attribute summary")
    ax.axis("off")
    ax.text(
        0.02,
        0.98,
        "\n".join(lines),
        va="top",
        ha="left",
        family="monospace",
        fontsize=10,
    )


def render_tile_figure(output_path: Path = OUTPUT_PATH) -> Path:
    buildings = load_buildings()
    layers = [
        RasterLayer("DEM", DEM_PATH, "terrain", "elevation"),
        RasterLayer("Slope (deg)", SLOPE_DEG_PATH, "magma", "degree"),
        RasterLayer(
            "Slope >= 30 deg",
            SLOPE_BIN_PATH,
            ListedColormap(["#f2f2f2", "#d7301f"]),
            "binary",
        ),
        RasterLayer(
            "House high risk (20 m)",
            HIGHRISK_PATH,
            ListedColormap(["#f7f7f7", "#08519c"]),
            "binary",
        ),
    ]

    fig, axes = plt.subplots(2, 3, figsize=(18, 12), constrained_layout=True)
    flat_axes = axes.ravel()

    for ax, layer in zip(flat_axes, layers):
        plot_raster(ax, layer)

    plot_buildings(flat_axes[4], buildings)
    plot_summary(flat_axes[5], summarise_buildings(buildings))

    fig.suptitle("Nobeoka area map tiles and attributes", fontsize=16)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    return output_path


if __name__ == "__main__":
    saved_path = render_tile_figure()
    print(f"saved: {saved_path}")

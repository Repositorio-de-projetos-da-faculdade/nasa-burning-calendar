"""Official boundaries (INPE/TerraBrasilis, PRODES): Amazon biome, states and municipalities.

Builds:
  data/boundaries/amazonia.geojson  biome boundary at full resolution (used by the ingest clip)
  data/processed/regions.geojson    simplified biome + states + municipalities (API/map)
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import shapely
from shapely.geometry import mapping, shape

WFS = (
    "https://terrabrasilis.dpi.inpe.br/geoserver/ows?service=WFS&version=1.0.0"
    "&request=GetFeature&typeName={layer}&outputFormat=application/json&srsName=EPSG:4326"
)
LAYERS = {
    "biome": "prodes-amazon-nb:amazon_biome_border",
    "states": "prodes-amazon-nb:states_amazon_biome",
    "municipalities": "prodes-amazon-nb:municipalities_amazon_biome",
}
STATE_BY_CODE = {
    "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP",
    "17": "TO", "21": "MA", "51": "MT",
}


def _fetch(boundaries: Path) -> dict[str, dict]:
    boundaries.mkdir(parents=True, exist_ok=True)
    out = {}
    with httpx.Client(timeout=httpx.Timeout(60, read=300)) as client:
        for key, layer in LAYERS.items():
            f = boundaries / f"{layer.split(':')[1]}.geojson"
            if not f.exists() or f.stat().st_size == 0:
                r = client.get(WFS.format(layer=layer))
                r.raise_for_status()
                f.write_bytes(r.content)
            out[key] = json.loads(f.read_text("utf-8"))
    return out


def _feat(rid: str, name: str, kind: str, geom, tol: float, state: str | None = None) -> dict:
    g = shapely.simplify(geom, tol, preserve_topology=True)
    g = shapely.set_precision(g, 1e-4)
    return {
        "type": "Feature",
        "id": rid,
        "properties": {
            "id": rid, "name": name, "kind": kind, "state": state,
            "bbox": [round(v, 4) for v in geom.bounds],
        },
        "geometry": mapping(g),
    }


def build_regions(data_dir: Path) -> int:
    boundaries, processed = data_dir / "boundaries", data_dir / "processed"
    src = _fetch(boundaries)

    biome = shapely.union_all(
        [shapely.make_valid(shape(f["geometry"])) for f in src["biome"]["features"]]
    )
    biome = shapely.make_valid(biome)
    (boundaries / "amazonia.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {"name": "Amazonia"}, "geometry": mapping(biome)}
        ]}),
        "utf-8",
    )

    feats = [_feat("amazonia", "Amazon biome", "biome", biome, 0.02)]
    for f in src["states"]["features"]:
        p = f["properties"]  # INPE's own (Portuguese) attribute names: sigla = state code, nome = name
        feats.append(_feat(f"state-{p['sigla']}", p["nome"], "state",
                           shapely.make_valid(shape(f["geometry"])), 0.01, p["sigla"]))
    for f in src["municipalities"]["features"]:
        p = f["properties"]
        code = str(p["geocodigo"])
        feats.append(_feat(f"mun-{code}", p["nome"], "municipality",
                           shapely.make_valid(shape(f["geometry"])), 0.005,
                           STATE_BY_CODE.get(code[:2])))

    processed.mkdir(parents=True, exist_ok=True)
    (processed / "regions.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), "utf-8"
    )
    return len(feats)

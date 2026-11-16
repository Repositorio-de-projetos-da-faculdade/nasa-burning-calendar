"""Official regions (biome, states, municipalities) loaded from data/processed/regions.geojson."""

from __future__ import annotations

import json
from functools import lru_cache

import shapely
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

from .config import get_settings


@lru_cache
def _load() -> dict[str, tuple[dict, dict, BaseGeometry]]:
    f = get_settings().processed_dir / "regions.geojson"
    if not f.exists():
        return {}
    out = {}
    for feat in json.loads(f.read_text("utf-8"))["features"]:
        _upgrade(feat)
        geom = shape(feat["geometry"])
        shapely.prepare(geom)
        out[feat["id"]] = (feat["properties"], feat, geom)
    return out


def _upgrade(feat: dict) -> None:
    """Files written before the English rename used the "uf" key and "uf-XX" ids; read them the new way."""
    props = feat["properties"]
    if "uf" in props:
        props["state"] = props.pop("uf")
    if str(feat.get("id", "")).startswith("uf-"):
        feat["id"] = props["id"] = "state-" + feat["id"][3:]


def list_regions() -> list[dict]:
    return [p for p, _, _ in _load().values()]


def get_feature(rid: str) -> dict | None:
    r = _load().get(rid)
    return r[1] if r else None


def get_geom(rid: str) -> tuple[dict, BaseGeometry] | None:
    r = _load().get(rid)
    return (r[0], r[2]) if r else None


def outlines() -> dict:
    """Biome + states, drawn on the map."""
    feats = [f for p, f, _ in _load().values() if p["kind"] in ("biome", "state")]
    return {"type": "FeatureCollection", "features": feats}


def region_at(lon: float, lat: float, kind: str = "municipality") -> dict | None:
    pt = shapely.Point(lon, lat)
    for props, _, geom in _load().values():
        if props["kind"] == kind and geom.contains(pt):
            return props
    return None

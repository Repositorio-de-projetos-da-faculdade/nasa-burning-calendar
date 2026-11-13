"""Regioes oficiais (bioma, UFs, municipios) carregadas de data/processed/regions.geojson."""

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
        geom = shape(feat["geometry"])
        shapely.prepare(geom)
        out[feat["id"]] = (feat["properties"], feat, geom)
    return out


def list_regions() -> list[dict]:
    return [p for p, _, _ in _load().values()]


def get_feature(rid: str) -> dict | None:
    r = _load().get(rid)
    return r[1] if r else None


def get_geom(rid: str) -> tuple[dict, BaseGeometry] | None:
    r = _load().get(rid)
    return (r[0], r[2]) if r else None


def outlines() -> dict:
    """Bioma + UFs para desenhar no mapa."""
    feats = [f for p, f, _ in _load().values() if p["kind"] in ("biome", "state")]
    return {"type": "FeatureCollection", "features": feats}


def region_at(lon: float, lat: float, kind: str = "municipality") -> dict | None:
    pt = shapely.Point(lon, lat)
    for props, _, geom in _load().values():
        if props["kind"] == kind and geom.contains(pt):
            return props
    return None

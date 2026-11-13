"""Area de interesse: regiao oficial, GeoJSON desenhado, bbox ou ponto + raio."""

from __future__ import annotations

import math

import numpy as np
import shapely
import shapely.affinity
from fastapi import HTTPException
from pydantic import BaseModel, Field, model_validator
from shapely.geometry import box, shape
from shapely.geometry.base import BaseGeometry

from .. import regions


class AreaQuery(BaseModel):
    region: str | None = Field(None, description="id de /api/regions (ex.: amazonia, uf-PA)")
    geometry: dict | None = Field(None, description="GeoJSON Polygon/MultiPolygon (ou Feature)")
    bbox: tuple[float, float, float, float] | None = Field(None, description="w,s,e,n")
    lat: float | None = None
    lon: float | None = None
    radius_km: float | None = Field(None, gt=0, le=500)

    @model_validator(mode="after")
    def _one_area(self):
        has_point = self.lat is not None and self.lon is not None and self.radius_km
        if not (self.region or self.geometry or self.bbox or has_point):
            raise ValueError("Informe region, geometry, bbox ou lat/lon/radius_km")
        return self

    def cache_key(self) -> str:
        return self.region or self.model_dump_json(exclude={"region"})

    def resolve(self) -> tuple[dict, BaseGeometry]:
        """(metadados da area, geometria preparada)."""
        if self.region:
            r = regions.get_geom(self.region)
            if r is None:
                raise HTTPException(404, f"Regiao '{self.region}' nao encontrada")
            props, geom = r
            return {"name": props["name"], "kind": props["kind"], "uf": props.get("uf")}, geom

        if self.geometry:
            geom = shape(self.geometry.get("geometry", self.geometry))
            meta = {"name": "Área desenhada", "kind": "drawn"}
        elif self.bbox:
            geom = box(*self.bbox)
            meta = {"name": "Retângulo", "kind": "bbox"}
        else:
            dlat = self.radius_km / 111.32
            dlon = self.radius_km / (111.32 * max(math.cos(math.radians(self.lat)), 1e-6))
            circle = shapely.Point(0, 0).buffer(1.0, quad_segs=32)
            geom = shapely.affinity.scale(circle, dlon, dlat, origin=(0, 0))
            geom = shapely.affinity.translate(geom, self.lon, self.lat)
            meta = {"name": f"Raio de {self.radius_km:g} km", "kind": "point"}
        if not geom.is_valid:
            geom = shapely.make_valid(geom)
        shapely.prepare(geom)
        return meta, geom

    def to_geom(self) -> BaseGeometry:
        return self.resolve()[1]


def area_km2(geom: BaseGeometry) -> float:
    """Area aproximada (projecao equiretangular local) - suficiente para exibicao."""
    lat0 = geom.centroid.y
    kx, ky = 111.32 * math.cos(math.radians(lat0)), 110.57
    return shapely.affinity.scale(geom, kx, ky, origin=(0, 0)).area


def mask_points(geom: BaseGeometry, lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
    return shapely.contains_xy(geom, lon, lat)

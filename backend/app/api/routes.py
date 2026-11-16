from __future__ import annotations

import csv
import io
from collections.abc import Iterator
from datetime import date

import numpy as np
from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .. import analytics, db, regions
from ..config import get_settings
from .area import AreaQuery, area_km2, mask_points

router = APIRouter(prefix="/api")


def _require(name: str) -> None:
    if not db.available()[name]:
        raise HTTPException(503, f"Data '{name}' not generated yet. Run the pipeline (firecal all).")


@router.get("/health")
def health():
    return {"status": "ok", "data": db.available()}


@router.get("/meta")
def meta():
    s = get_settings()
    out: dict = {"region_bbox": s.bbox, "grid_deg": s.grid_deg, "data": db.available()}
    if out["data"]["hotspots"]:
        rows = db.cursor().execute("""
            SELECT sensor, satellite, min(acq_date), max(acq_date), count(*)
            FROM hotspots GROUP BY ALL ORDER BY ALL
        """).fetchall()
        out["sources"] = [
            {"sensor": r[0], "satellite": r[1], "first": r[2], "last": r[3], "count": r[4]}
            for r in rows
        ]
    if out["data"]["monthly_cells"]:
        first, last = analytics.coverage(analytics.stamp())
        out["coverage"] = {"from": first, "until": last}
    return out


# ---------- regions ----------

@router.get("/regions")
def list_regions():
    return regions.list_regions()


@router.get("/regions/outlines")
def region_outlines():
    return regions.outlines()


@router.get("/regions/at")
def region_at(lon: float, lat: float, kind: str = "municipality"):
    r = regions.region_at(lon, lat, kind)
    if r is None:
        raise HTTPException(404, "Outside the Amazon")
    return r


@router.get("/regions/{rid}")
def region_feature(rid: str):
    f = regions.get_feature(rid)
    if f is None:
        raise HTTPException(404, "Region not found")
    return f


# ---------- calendar ----------

@router.post("/calendar")
def calendar(q: AreaQuery):
    """Harmonized year x month matrix, climatology, anomalies and indicators for the area."""
    _require("monthly_cells")
    meta_, geom = q.resolve()

    def compute():
        out = analytics.build_calendar(geom)
        out["area"] = {**meta_, "area_km2": round(area_km2(geom)), "bbox": list(geom.bounds)}
        return out

    return analytics.calendar_cache.get_or((q.cache_key(), analytics.stamp()), compute)


@router.get("/version")
def version():
    """Version of the processed data; changes whenever the pipeline runs again."""
    return {"version": str(analytics.stamp())}


@router.get("/grid")
def grid(
    response: Response,
    year: int | None = Query(None),
    month: int | None = Query(None, ge=1, le=12),
    v: str | None = Query(None),
):
    """Harmonized hotspots per cell (map layer). Without a year: annual mean."""
    _require("monthly_cells")
    stamp = analytics.stamp()
    # URL with the current version: the browser may cache it forever; new data changes the URL
    if v == str(stamp):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return analytics.grid(stamp, year, month)


# ---------- CSV ----------

class HotspotsQuery(AreaQuery):
    start: date
    end: date
    sensor: str | None = None  # MODIS | VIIRS


@router.post("/hotspots.csv")
def hotspots_csv(q: HotspotsQuery):
    """CSV of the raw hotspots (all satellites) inside the area and period."""
    _require("hotspots")
    if q.end < q.start:
        raise HTTPException(400, "End date is before the start date")
    geom = q.to_geom()
    w, s, e, n = geom.bounds
    params = [w, e, s, n, q.start, q.end, q.start.year, q.end.year]
    sensor_sql = ""
    if q.sensor:
        sensor_sql, params = "AND sensor = ?", [*params, q.sensor.upper()]
    reader = db.cursor().sql(
        f"""
        SELECT lat, lon, acq_date, acq_time, sensor, satellite, confidence_raw, conf_class,
               frp, daynight, type, origin
        FROM hotspots
        WHERE lon BETWEEN ? AND ? AND lat BETWEEN ? AND ?
          AND acq_date BETWEEN ? AND ? AND year BETWEEN ? AND ? {sensor_sql}
        ORDER BY acq_date, acq_time
        """,
        params=params,
    ).to_arrow_reader(100_000)

    cols = ["latitude", "longitude", "acq_date", "acq_time", "sensor", "satellite",
            "confidence", "confidence_class", "frp", "daynight", "type", "origin"]

    def gen() -> Iterator[str]:
        buf = io.StringIO()
        wr = csv.writer(buf)
        wr.writerow(cols)
        for batch in reader:
            d = batch.to_pydict()
            keep = mask_points(geom, np.asarray(d["lon"]), np.asarray(d["lat"]))
            names = batch.schema.names
            for i in np.nonzero(keep)[0]:
                wr.writerow([d[c][i] for c in names])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate()
        yield buf.getvalue()

    fname = f"hotspots_{q.region or 'area'}_{q.start}_{q.end}.csv"
    return StreamingResponse(
        gen(), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.post("/calendar.csv")
def calendar_csv(q: AreaQuery):
    """Harmonized monthly series for the area (the calendar as CSV)."""
    data = calendar(q)
    clim = {c["month"]: c for c in data["climatology"]}
    buf = io.StringIO()
    wr = csv.writer(buf)
    wr.writerow(["year", "month", "harmonized_hotspots", "modis_aqua_raw", "viirs_snpp_raw",
                 "source", "median_baseline", "anomaly_pct", "partial_month"])
    for r in data["series"]:
        wr.writerow([r["year"], r["month"], r["harmonized"], r["modis_raw"], r["viirs_raw"],
                     r["source"], clim[r["month"]]["median"], r["anomaly_pct"], r["partial"]])
    name = (q.region or "area") + "_calendar.csv"
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------- validation ----------

class ValidationRow(BaseModel):
    year: int
    month: int
    modis_raw: float
    viirs_raw: float
    modis_harmonized: float


@router.get("/validation")
def validation():
    """2012+ overlap: raw MODIS x VIIRS x harmonized MODIS + metrics."""
    _require("validation")
    s = get_settings()
    c0, c1 = s.calib_range
    rows = db.cursor().execute("SELECT * FROM validation ORDER BY year, month").fetchall()
    data = [ValidationRow(year=r[0], month=r[1], modis_raw=r[2], viirs_raw=r[3],
                          modis_harmonized=r[4]) for r in rows]
    _, last = analytics.coverage(analytics.stamp())
    full = [r for r in data if (r.year, r.month) < (last.year, last.month)]
    v = np.array([r.viirs_raw for r in full])
    mh = np.array([r.modis_harmonized for r in full])
    mr = np.array([r.modis_raw for r in full])
    oos = np.array([r.year > c1 for r in full])

    def corr(a, b):
        return round(float(np.corrcoef(a, b)[0, 1]), 3) if len(a) > 2 else None

    def bias(a, b):
        return round(float(100 * (a.sum() / b.sum() - 1)), 1) if b.sum() else None

    return {
        "rows": data,
        "calibration_years": [c0, c1],
        "metrics": {
            "corr_harmonized": corr(mh, v),
            "corr_out_of_sample": corr(mh[oos], v[oos]),
            "bias_raw_pct": bias(mr, v),
            "bias_harmonized_pct": bias(mh, v),
            "bias_out_of_sample_pct": bias(mh[oos], v[oos]),
            "ratio_viirs_modis": round(float(v.sum() / mr.sum()), 2) if mr.sum() else None,
        },
    }

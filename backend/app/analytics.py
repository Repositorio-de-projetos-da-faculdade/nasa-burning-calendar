"""Calculos do calendario: agregacao por area, climatologia, anomalias e indicadores."""

from __future__ import annotations

import calendar as cal
from collections import OrderedDict
from datetime import date
from functools import lru_cache

import numpy as np
import pyarrow as pa
import shapely
from shapely.geometry.base import BaseGeometry

from . import db
from .config import get_settings

BASELINE_FIRST_YEAR = 2003  # primeiro ano completo com MODIS Aqua


def stamp() -> float:
    f = get_settings().processed_dir / "monthly_cells.parquet"
    return f.stat().st_mtime if f.exists() else 0.0


@lru_cache(maxsize=2)
def _cells(_stamp: float) -> dict[str, np.ndarray]:
    d = db.cursor().sql(
        "SELECT DISTINCT cell_x, cell_y, lon_c, lat_c FROM monthly_cells"
    ).fetchnumpy()
    return {k: np.asarray(v) for k, v in d.items()}


@lru_cache(maxsize=2)
def coverage(_stamp: float) -> tuple[date, date]:
    """(primeiro mes com dados, ultimo dia com dados)."""
    cur = db.cursor()
    y, m = cur.execute("SELECT year, month FROM monthly_cells ORDER BY year, month LIMIT 1").fetchone()
    last = cur.execute("SELECT max(acq_date) FROM hotspots").fetchone()[0]
    return date(int(y), int(m), 1), last


def select_cells(geom: BaseGeometry) -> pa.Table:
    c = _cells(stamp())
    keep = shapely.contains_xy(geom, c["lon_c"], c["lat_c"])
    if keep.sum() < 4:  # areas pequenas: usa celulas que tocam a area
        g = get_settings().grid_deg
        boxes = shapely.box(c["cell_x"] * g, c["cell_y"] * g, (c["cell_x"] + 1) * g, (c["cell_y"] + 1) * g)
        keep = shapely.intersects(geom, boxes)
    return pa.table({"cell_x": c["cell_x"][keep], "cell_y": c["cell_y"][keep]})


def monthly(geom: BaseGeometry) -> dict[str, np.ndarray]:
    cur = db.cursor()
    cur.register("sel", select_cells(geom))
    d = cur.sql("""
        SELECT year, month, sum(harmonized) AS h, sum(modis_n) AS m, sum(viirs_n) AS v
        FROM monthly_cells JOIN sel USING (cell_x, cell_y)
        GROUP BY year, month
    """).fetchnumpy()
    return {k: np.asarray(v) for k, v in d.items()}


def _r(x, nd=1):
    return None if x is None or not np.isfinite(x) else round(float(x), nd)


def build_calendar(geom: BaseGeometry) -> dict:
    first, last = coverage(stamp())
    years = list(range(first.year, last.year + 1))
    ny = len(years)
    H, M, V = (np.zeros((ny, 12)) for _ in range(3))
    d = monthly(geom)
    if len(d["year"]):
        yi, mi = d["year"].astype(int) - years[0], d["month"].astype(int) - 1
        ok = (yi >= 0) & (yi < ny)
        np.add.at(H, (yi[ok], mi[ok]), np.nan_to_num(d["h"][ok]))
        np.add.at(M, (yi[ok], mi[ok]), d["m"][ok])
        np.add.at(V, (yi[ok], mi[ok]), d["v"][ok])

    # meses cobertos pelos dados
    valid = np.zeros((ny, 12), bool)
    for i, y in enumerate(years):
        for m in range(12):
            valid[i, m] = date(y, m + 1, 1) >= first and date(y, m + 1, 1) <= last
    partial_month = (last.year, last.month) if last.day < cal.monthrange(last.year, last.month)[1] else None

    last_full = last.year - 1  # o ano mais recente e sempre comparado contra os anteriores
    base_rows = [i for i, y in enumerate(years) if BASELINE_FIRST_YEAR <= y <= last_full]
    B = H[base_rows] if base_rows else H[:0]
    median = np.median(B, axis=0) if len(B) else np.zeros(12)
    p25, p75 = (np.percentile(B, q, axis=0) if len(B) else np.zeros(12) for q in (25, 75))
    pmax = B.max(axis=0) if len(B) else np.zeros(12)
    pmax_year = [years[base_rows[int(i)]] for i in B.argmax(axis=0)] if len(B) else [None] * 12
    iqr = p75 - p25

    series = []
    for i, y in enumerate(years):
        for m in range(12):
            if not valid[i, m]:
                continue
            v = H[i, m]
            is_partial = partial_month == (y, m + 1)
            ref = median[m]
            if is_partial:
                ref = median[m] * last.day / cal.monthrange(y, m + 1)[1]
            series.append({
                "year": y, "month": m + 1,
                "harmonized": _r(v), "modis_raw": int(M[i, m]), "viirs_raw": int(V[i, m]),
                "source": "VIIRS" if y >= 2012 else "MODIS→VIIRS",
                "partial": is_partial,
                "anomaly_pct": None if ref <= 0 else _r(100 * (v / ref - 1)),
                "anomaly_iqr": None if iqr[m] <= 0 else _r((v - ref) / iqr[m], 2),
            })

    annual = []
    for i, y in enumerate(years):
        months = int(valid[i].sum())
        annual.append({
            "year": y, "total": _r(H[i][valid[i]].sum(), 0), "months": months,
            "partial": months < 12 or (y == last.year and (last.month, last.day) != (12, 31)),
            "converted": y < 2012,
        })

    # mes corrente (ultimo com dados) vs mediana proporcional
    li, lm = years.index(last.year), last.month - 1
    frac = last.day / cal.monthrange(last.year, last.month)[1]
    cur_ref = median[lm] * frac
    # acumulado no ano vs mediana do acumulado ate a mesma data
    ytd = H[li, :lm].sum() + H[li, lm]
    ytd_ref = median[:lm].sum() + cur_ref
    hist_ytd = (B[:, :lm].sum(axis=1) + B[:, lm] * frac) if len(B) else np.zeros(1)
    rank = int((hist_ytd > ytd).sum()) + 1

    complete = [a for a in annual if not a["partial"] and a["year"] >= BASELINE_FIRST_YEAR]
    peak = max(complete, key=lambda a: a["total"]) if complete else None
    share = median / median.sum() if median.sum() > 0 else np.zeros(12)
    vi = [(H[i, m], years[i], m + 1) for i in range(ny) for m in range(12) if valid[i, m]]
    rec = max(vi) if vi else (0, None, None)

    return {
        "data_from": first.isoformat(),
        "data_until": last.isoformat(),
        "baseline": [BASELINE_FIRST_YEAR, last_full],
        "years": years,
        "series": series,
        "climatology": [
            {"month": m + 1, "median": _r(median[m]), "p25": _r(p25[m]), "p75": _r(p75[m]),
             "max": _r(pmax[m]), "max_year": pmax_year[m]}
            for m in range(12)
        ],
        "annual": annual,
        "current": {
            "year": last.year, "month": last.month, "day": last.day,
            "value": _r(H[li, lm]), "expected": _r(cur_ref),
            "anomaly_pct": None if cur_ref <= 0 else _r(100 * (H[li, lm] / cur_ref - 1)),
        },
        "ytd": {
            "year": last.year, "value": _r(ytd, 0), "expected": _r(ytd_ref, 0),
            "anomaly_pct": None if ytd_ref <= 0 else _r(100 * (ytd / ytd_ref - 1)),
            "rank": rank, "of": len(hist_ytd) + 1,
        },
        "summary": {
            "total": _r(H[valid].sum(), 0),
            "peak_year": peak["year"] if peak else None,
            "peak_year_total": peak["total"] if peak else None,
            "record_month": {"year": rec[1], "month": rec[2], "value": _r(rec[0], 0)},
            "critical_months": [int(m + 1) for m in np.argsort(-median)[:3]],
            "fire_season_months": [int(m + 1) for m in np.where(share >= 1 / 12)[0]],
            "season_share": _r(100 * share[share >= 1 / 12].sum()),
        },
        "unit": "focos equivalentes VIIRS S-NPP",
    }


class LRU(OrderedDict):
    def __init__(self, size: int = 128):
        super().__init__()
        self.size = size

    def get_or(self, key, fn):
        if key in self:
            self.move_to_end(key)
            return self[key]
        val = self[key] = fn()
        if len(self) > self.size:
            self.popitem(last=False)
        return val


calendar_cache = LRU(256)


@lru_cache(maxsize=64)
def grid(_stamp: float, year: int | None, month: int | None) -> dict:
    where, params = [], []
    if year:
        where.append("year = ?")
        params.append(year)
    if month:
        where.append("month = ?")
        params.append(month)
    w = ("WHERE " + " AND ".join(where)) if where else ""
    div = "" if year else f"/ {max(1, len(range(BASELINE_FIRST_YEAR, coverage(_stamp)[1].year)))}"
    rows = db.cursor().sql(
        f"SELECT round(lon_c, 3), round(lat_c, 3), round(sum(harmonized) {div}, 1) AS v "
        f"FROM monthly_cells {w} GROUP BY ALL HAVING v > 0",
        params=params,
    ).fetchall()
    vals = np.array([r[2] for r in rows]) if rows else np.zeros(1)
    return {
        "cells": rows,
        "p95": round(float(np.percentile(vals, 95)), 1),
        "max": round(float(vals.max()), 1),
        "per_year_mean": not year,
    }

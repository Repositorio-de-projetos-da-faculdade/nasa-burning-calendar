"""Raw CSVs -> normalized Parquet (data/processed/hotspots/sensor=*/year=*)."""

from __future__ import annotations

import json
import math
import shutil
import time
from pathlib import Path

import duckdb
import numpy as np
import pyarrow as pa
import shapely
from shapely.geometry import shape

from app.config import Settings

from .sources import SATELLITE_NAMES, SOURCES


def _files(raw_dir: Path, key: str) -> list[str]:
    files = sorted((raw_dir / "country" / key).glob("*/*.csv"))
    files += sorted((raw_dir / "api" / key).glob("*.csv"))
    files += sorted((raw_dir / "live" / key).glob("*.csv"))
    return [f.as_posix() for f in files if f.stat().st_size > 0]


def _sat_case() -> str:
    whens = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in SATELLITE_NAMES.items())
    return f"CASE trim(satellite) {whens} ELSE trim(satellite) END"


CLIP_DEG = 0.02  # clip resolution (~2 km)


def _clip_to_boundary(con: duckdb.DuckDBPyConnection, boundary: Path, t0: float) -> None:
    """Clip to the boundary: mark a fine grid (~2 km) as inside/outside by the cell
    center and filter the hotspots with a single integer join."""
    feats = json.loads(boundary.read_text("utf-8"))["features"]
    aoi = shapely.make_valid(shapely.union_all([shape(f["geometry"]) for f in feats]))
    shapely.prepare(aoi)
    c = CLIP_DEG
    w, s, e, n = aoi.bounds
    xs = np.arange(math.floor(w / c), math.floor(e / c) + 1, dtype="int32")
    ys = np.arange(math.floor(s / c), math.floor(n / c) + 1, dtype="int32")
    cx, cy = (a.ravel() for a in np.meshgrid(xs, ys))
    keep = shapely.contains_xy(aoi, (cx + 0.5) * c, (cy + 0.5) * c)
    _log(t0, f"biome mask: {int(keep.sum()):,} of {len(keep):,} cells of {c} degrees")
    con.register("mask_src", pa.table({"mx": cx[keep], "my": cy[keep]}))
    con.execute("CREATE TEMP TABLE mask AS SELECT * FROM mask_src")
    con.execute(f"""
        CREATE TEMP TABLE hs_in AS
        SELECT h.* FROM hs h SEMI JOIN mask m
          ON m.mx = CAST(floor(h.lon / {c}) AS INTEGER)
         AND m.my = CAST(floor(h.lat / {c}) AS INTEGER)
    """)
    con.execute("DROP TABLE hs")
    con.execute("ALTER TABLE hs_in RENAME TO hs")


def _log(t0: float, msg: str) -> None:
    print(f"[ingest {time.perf_counter() - t0:6.1f}s] {msg}", flush=True)


def ingest(settings: Settings) -> dict[str, int]:
    t0 = time.perf_counter()
    raw, out = settings.raw_dir, settings.processed_dir / "hotspots"
    w, s, e, n = settings.bbox
    g = settings.grid_deg

    con = duckdb.connect()
    con.execute("SET preserve_insertion_order = false")
    tmp = settings.processed_dir / ".duckdb_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    con.execute(f"SET temp_directory = '{tmp.as_posix()}'")

    selects = []
    for key, src in SOURCES.items():
        files = _files(raw, key)
        if not files:
            continue
        list_sql = "[" + ",".join(f"'{f}'" for f in files) + "]"
        conf = (
            "CASE WHEN TRY_CAST(confidence AS INT) >= 80 THEN 'high' "
            "WHEN TRY_CAST(confidence AS INT) >= 30 THEN 'nominal' ELSE 'low' END"
            if src.sensor == "MODIS"
            else "CASE lower(left(trim(confidence), 1)) WHEN 'h' THEN 'high' "
            "WHEN 'n' THEN 'nominal' ELSE 'low' END"
        )
        selects.append(f"""
            SELECT
                CAST(latitude AS DOUBLE)  AS lat,
                CAST(longitude AS DOUBLE) AS lon,
                CAST(acq_date AS DATE)    AS acq_date,
                CAST(acq_time AS SMALLINT) AS acq_time,
                '{src.sensor}'            AS sensor,
                {_sat_case()}             AS satellite,
                trim(confidence)          AS confidence_raw,
                {conf}                    AS conf_class,
                TRY_CAST(frp AS DOUBLE)   AS frp,
                daynight,
                TRY_CAST(type AS TINYINT) AS type,
                CASE WHEN replace(filename, '\\', '/') LIKE '%/api/%' THEN 'api'
                     WHEN replace(filename, '\\', '/') LIKE '%/live/%' THEN 'live'
                     ELSE 'country' END AS origin
            FROM read_csv({list_sql}, union_by_name = true, all_varchar = true,
                          filename = true, header = true)
        """)
    if not selects:
        raise RuntimeError(f"No CSV in {raw}. Run `firecal download` first.")

    con.execute(f"""
        CREATE TEMP TABLE hs AS
        SELECT * FROM ({' UNION ALL BY NAME '.join(selects)})
        WHERE lon BETWEEN {w} AND {e} AND lat BETWEEN {s} AND {n}
    """)

    _log(t0, f"csv read: {con.execute('SELECT count(*) FROM hs').fetchone()[0]:,} hotspots in the bbox")
    # The API only fills in what the yearly files do not cover yet
    con.execute("""
        DELETE FROM hs USING (
            SELECT sensor, max(acq_date) AS d FROM hs WHERE origin = 'country' GROUP BY sensor
        ) c
        WHERE hs.sensor = c.sensor AND hs.origin <> 'country' AND hs.acq_date <= c.d
    """)
    # api and live (and live snapshots among themselves) overlap: keep a single detection
    con.execute("""
        CREATE OR REPLACE TEMP TABLE hs AS
        SELECT * FROM hs WHERE origin = 'country'
        UNION ALL
        (SELECT DISTINCT ON (sensor, satellite, lat, lon, acq_date, acq_time) *
         FROM hs WHERE origin <> 'country' ORDER BY origin)
    """)

    if settings.boundary_path:
        _clip_to_boundary(con, settings.boundary_path, t0)
        _log(t0, f"clipped to the biome: {con.execute('SELECT count(*) FROM hs').fetchone()[0]:,} hotspots")

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    con.execute(f"""
        COPY (
            SELECT *,
                CAST(floor(lon / {g}) AS INTEGER) AS cell_x,
                CAST(floor(lat / {g}) AS INTEGER) AS cell_y,
                year(acq_date)  AS year,
                month(acq_date) AS month
            FROM hs
        ) TO '{out.as_posix()}' (FORMAT parquet, PARTITION_BY (sensor, year), COMPRESSION zstd)
    """)
    _log(t0, "parquet written")
    rows = con.execute(
        "SELECT sensor, count(*) FROM hs GROUP BY sensor ORDER BY sensor"
    ).fetchall()
    return dict(rows)

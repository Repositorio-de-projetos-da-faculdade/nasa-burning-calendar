"""Read-only access to the processed Parquet files via DuckDB."""

from __future__ import annotations

import threading
from functools import lru_cache

import duckdb

from .config import get_settings

_lock = threading.Lock()


@lru_cache
def _root() -> duckdb.DuckDBPyConnection:
    return duckdb.connect()


def cursor() -> duckdb.DuckDBPyConnection:
    """Per-request cursor (thread-safe) with the available views registered."""
    with _lock:
        cur = _root().cursor()
    p = get_settings().processed_dir
    if (p / "hotspots").exists():
        cur.execute(
            f"CREATE OR REPLACE TEMP VIEW hotspots AS SELECT * FROM read_parquet("
            f"'{(p / 'hotspots').as_posix()}/**/*.parquet', hive_partitioning = true)"
        )
    for name in ("monthly_cells", "calibration", "validation"):
        f = p / f"{name}.parquet"
        if f.exists():
            cur.execute(f"CREATE OR REPLACE TEMP VIEW {name} AS SELECT * FROM '{f.as_posix()}'")
    return cur


def available() -> dict[str, bool]:
    p = get_settings().processed_dir
    return {
        "hotspots": (p / "hotspots").exists(),
        "monthly_cells": (p / "monthly_cells.parquet").exists(),
        "validation": (p / "validation.parquet").exists(),
    }

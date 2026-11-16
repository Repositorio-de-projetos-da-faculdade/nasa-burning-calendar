"""Harmonization of three sensor generations into a single "VIIRS S-NPP equivalent" series.

    MODIS Aqua (2002-)  --k-->   VIIRS S-NPP (2012-, reference)   <--k2--  VIIRS NOAA-20 (2018-)

Approach:
  1. Keep vegetation hotspots (type 0 or missing) with nominal/high confidence.
  2. One satellite per generation, all with a ~13:30 overpass (Aqua, S-NPP, NOAA-20), so the
     same fire is not counted several times.
  3. Aggregate on a common grid (cell x day).
  4. In the overlap periods, fit factors per spatial tile and month of the year, with
     shrinkage towards the regional factor when the tile has little data:
        k  = S-NPP / Aqua      (calibrated over CALIB_YEARS)
        k2 = S-NPP / NOAA-20   (calibrated over the whole overlap)
  5. Harmonized series, day by day:
        before S-NPP            -> Aqua * k
        while S-NPP operates    -> measured S-NPP
        after S-NPP ends        -> NOAA-20 * k2

Outputs in data/processed/:
  daily_cells.parquet    cell x day (harmonized)
  monthly_cells.parquet  cell x year x month (raw, converted and harmonized)
  coverage.parquet       days with data and the source used
  calibration.parquet    k and k2 per tile x month of the year
  validation.parquet     monthly regional totals (validation chart)
"""

from __future__ import annotations

import duckdb

from app.config import Settings

SHRINK_ALPHA = 50.0  # "pseudo-hotspots" that pull the tile factor towards the regional factor


def _calib_sql(name: str, num: str, den: str, where: str) -> str:
    return f"""
        CREATE TEMP TABLE {name} AS
        WITH t AS (
            SELECT tile_x, tile_y, month, sum({den}) AS D, sum({num}) AS N
            FROM m WHERE {where} GROUP BY ALL
        ), gm AS (
            SELECT month, sum(N) / nullif(sum(D), 0) AS k_region FROM t GROUP BY month
        )
        SELECT t.tile_x, t.tile_y, t.month, t.D AS den_sum, t.N AS num_sum, gm.k_region,
               (t.N + {SHRINK_ALPHA} * gm.k_region) / (t.D + {SHRINK_ALPHA}) AS k
        FROM t JOIN gm USING (month)
    """


def harmonize(settings: Settings) -> dict[str, float | str | None]:
    proc = settings.processed_dir
    g, tile = settings.grid_deg, settings.calib_tile_deg
    c0, c1 = settings.calib_range
    per_tile = round(tile / g)

    con = duckdb.connect()
    con.execute(f"""
        CREATE TEMP TABLE d AS
        SELECT cell_x, cell_y, acq_date AS date,
            count(*) FILTER (WHERE sensor = 'MODIS' AND satellite = 'Aqua')    AS modis_n,
            count(*) FILTER (WHERE sensor = 'VIIRS' AND satellite = 'S-NPP')   AS viirs_n,
            count(*) FILTER (WHERE sensor = 'VIIRS' AND satellite = 'NOAA-20') AS n20_n
        FROM read_parquet('{(proc / 'hotspots').as_posix()}/**/*.parquet', hive_partitioning = true)
        WHERE (type IS NULL OR type = 0) AND conf_class IN ('nominal', 'high')
          AND satellite IN ('Aqua', 'S-NPP', 'NOAA-20')
        GROUP BY ALL
    """)
    snpp0, snpp1, n20_0 = con.execute("""
        SELECT min(date) FILTER (WHERE viirs_n > 0), max(date) FILTER (WHERE viirs_n > 0),
               min(date) FILTER (WHERE n20_n > 0) FROM d
    """).fetchone()
    if snpp0 is None:
        raise RuntimeError("No VIIRS S-NPP data: there is no reference to harmonize against.")
    era = f"""CASE WHEN date < DATE '{snpp0}' THEN 'modis'
                   WHEN date <= DATE '{snpp1}' THEN 'snpp' ELSE 'n20' END"""

    con.execute(f"""
        CREATE TEMP TABLE m AS
        SELECT cell_x, cell_y, year(date) AS year, month(date) AS month,
               sum(modis_n) AS modis_n, sum(viirs_n) AS viirs_n, sum(n20_n) AS n20_n,
               -- only days when both sensors coexisted go into the NOAA-20 calibration
               sum(viirs_n) FILTER (WHERE date >= DATE '{n20_0 or '9999-12-31'}') AS viirs_ov,
               sum(n20_n)   FILTER (WHERE date <= DATE '{snpp1}')                AS n20_ov,
               CAST(floor(cell_x / {per_tile}) AS INTEGER) AS tile_x,
               CAST(floor(cell_y / {per_tile}) AS INTEGER) AS tile_y
        FROM d GROUP BY cell_x, cell_y, year(date), month(date)
    """)
    con.execute(_calib_sql("calib", "viirs_n", "modis_n", f"year BETWEEN {c0} AND {c1}"))
    con.execute(_calib_sql("calib2", "coalesce(viirs_ov, 0)", "coalesce(n20_ov, 0)", "true"))
    for t in ("calib", "calib2"):
        con.execute(f"CREATE TEMP TABLE g_{t} AS SELECT DISTINCT month, k_region FROM {t}")

    factors = """
        LEFT JOIN calib  c1 ON c1.tile_x = x.tile_x AND c1.tile_y = x.tile_y AND c1.month = x.month
        LEFT JOIN calib2 c2 ON c2.tile_x = x.tile_x AND c2.tile_y = x.tile_y AND c2.month = x.month
        LEFT JOIN g_calib  g1 ON g1.month = x.month
        LEFT JOIN g_calib2 g2 ON g2.month = x.month
    """
    k1, k2 = "coalesce(c1.k, g1.k_region)", "coalesce(c2.k, g2.k_region, 1.0)"

    con.execute(f"""
        CREATE TEMP TABLE daily AS
        SELECT x.cell_x, x.cell_y, x.date,
               CASE {era} WHEN 'modis' THEN x.modis_n * {k1}
                          WHEN 'snpp'  THEN x.viirs_n::DOUBLE
                          ELSE x.n20_n * {k2} END AS h
        FROM (SELECT *, month(date) AS month,
                     CAST(floor(cell_x / {per_tile}) AS INTEGER) AS tile_x,
                     CAST(floor(cell_y / {per_tile}) AS INTEGER) AS tile_y FROM d) x
        {factors}
    """)
    con.execute("DELETE FROM daily WHERE h IS NULL OR h <= 0")

    con.execute(f"""
        CREATE TEMP TABLE monthly AS
        SELECT x.cell_x, x.cell_y,
               (x.cell_x + 0.5) * {g} AS lon_c, (x.cell_y + 0.5) * {g} AS lat_c,
               x.year, x.month, x.modis_n, x.viirs_n, x.n20_n,
               x.modis_n * {k1} AS modis_h, x.n20_n * {k2} AS n20_h,
               coalesce(dm.h, 0) AS harmonized
        FROM m x
        LEFT JOIN (SELECT cell_x, cell_y, year(date) AS year, month(date) AS month, sum(h) AS h
                   FROM daily GROUP BY ALL) dm USING (cell_x, cell_y, year, month)
        {factors}
    """)

    con.execute(f"""
        CREATE TEMP TABLE coverage AS
        SELECT date, {era} AS source FROM d
        GROUP BY date
        HAVING sum(CASE {era} WHEN 'modis' THEN modis_n WHEN 'snpp' THEN viirs_n ELSE n20_n END) > 0
    """)

    def out(name: str, sql: str) -> None:
        con.execute(f"COPY ({sql}) TO '{(proc / name).as_posix()}' (FORMAT parquet, COMPRESSION zstd)")

    out("daily_cells.parquet", "SELECT * FROM daily ORDER BY date")
    out("monthly_cells.parquet", "SELECT * FROM monthly")
    out("coverage.parquet", "SELECT * FROM coverage ORDER BY date")
    out("calibration.parquet", """
        SELECT 'modis' AS pair, * FROM calib UNION ALL SELECT 'noaa20' AS pair, * FROM calib2
    """)
    out("validation.parquet", f"""
        SELECT year, month, sum(modis_n) AS modis_raw, sum(viirs_n) AS viirs_raw,
               sum(modis_h) AS modis_harmonized, sum(n20_n) AS n20_raw, sum(n20_h) AS n20_harmonized
        FROM monthly
        WHERE make_date(year, month, 1) > DATE '{snpp0}' AND make_date(year, month, 1) <= DATE '{snpp1}'
        GROUP BY ALL ORDER BY ALL
    """)

    r = con.execute(f"""
        WITH v AS (
            SELECT year, month, sum(viirs_n) AS v, sum(modis_h) AS mh, sum(modis_n) AS mr,
                   sum(n20_h) AS nh, sum(n20_n) AS nr
            FROM monthly
            WHERE make_date(year, month, 1) > DATE '{snpp0}' AND make_date(year, month, 1) <= DATE '{snpp1}'
            GROUP BY ALL
        )
        SELECT corr(v, mh), avg(abs(v - mh)) / nullif(avg(v), 0), sum(v) / nullif(sum(mr), 0),
               corr(v, mh) FILTER (WHERE year > {c1}),
               corr(v, nh) FILTER (WHERE nr > 0),
               sum(v) FILTER (WHERE nr > 0) / nullif(sum(nr), 0)
        FROM v
    """).fetchone()
    return {
        "snpp_period": f"{snpp0} .. {snpp1}",
        "noaa20_since": str(n20_0),
        "corr_monthly": r[0],
        "rel_mae": r[1],
        "global_ratio_viirs_modis": r[2],
        "corr_out_of_sample": r[3],
        "corr_noaa20": r[4],
        "ratio_snpp_noaa20": r[5],
    }

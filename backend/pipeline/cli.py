"""Pipeline CLI: `uv run firecal --help`."""

from __future__ import annotations

from datetime import date, timedelta

import typer

from app.config import get_settings

from . import download as dl
from .harmonize import harmonize as run_harmonize
from .ingest import ingest as run_ingest
from .regions import build_regions
from .sources import SOURCES

app = typer.Typer(help="FIRMS pipeline -> harmonized hotspot calendar (Amazon).")


@app.command()
def download(
    start: int = typer.Option(2000, help="First year"),
    end: int = typer.Option(date.today().year, help="Last year"),
    source: list[str] = typer.Option(list(SOURCES), help="modis, viirs-snpp"),
    country: list[str] = typer.Option(None, help="Default: all Amazon countries"),
    workers: int = 4,
):
    """Downloads the yearly per-country files (history, no MAP_KEY)."""
    s = get_settings()
    stats = dl.download_country_files(s.raw_dir, range(start, end + 1), source, country, workers)
    typer.echo(stats)


@app.command("download-recent")
def download_recent(
    source: list[str] = typer.Option(list(SOURCES)),
    until: str = typer.Option(None, help="YYYY-MM-DD (default: today)"),
):
    """Fills the period after the last yearly file via the Area API (needs MAP_KEY)."""
    s = get_settings()
    end = date.fromisoformat(until) if until else date.today()
    for key in source:
        last = dl.last_country_date(s.raw_dir, key)
        if last is None:
            typer.echo(f"{key}: no yearly files; run `firecal download` first.")
            continue
        start = last + timedelta(days=1)
        typer.echo(f"{key}: {start} -> {end}")
        n = dl.download_api_gap(s.raw_dir, s.firms_map_key, s.bbox, start, end, key)
        typer.echo(f"{key}: {n} windows downloaded")


@app.command()
def live():
    """Snapshot of the last 7 days (public FIRMS feeds, no MAP_KEY)."""
    typer.echo(dl.download_live(get_settings().raw_dir))


@app.command()
def context():
    """Downloads NOAA's ONI index (El Nino/La Nina)."""
    typer.echo(dl.download_context(get_settings().raw_dir))


@app.command()
def ingest():
    """Raw CSVs -> normalized Parquet clipped to the region."""
    typer.echo(run_ingest(get_settings()))


@app.command()
def harmonize():
    """Builds the harmonized monthly series + calibration/validation tables."""
    for k, v in run_harmonize(get_settings()).items():
        typer.echo(f"{k:28s} {round(v, 4) if isinstance(v, float) else v}")


@app.command()
def regions():
    """Downloads the official (INPE) biome, state and municipality boundaries and builds regions.geojson."""
    typer.echo(f"{build_regions(get_settings().data_path)} regions")


@app.command("all")
def run_all(start: int = 2000):
    """regions -> download -> download-recent -> ingest -> harmonize."""
    regions()
    download(start=start, end=date.today().year, source=list(SOURCES), country=None, workers=4)
    if get_settings().firms_map_key:
        download_recent(source=list(SOURCES), until=None)
    else:
        typer.echo("FIRMS_MAP_KEY is empty: skipping recent data from the API.")
    live()
    context()
    ingest()
    harmonize()


if __name__ == "__main__":
    app()

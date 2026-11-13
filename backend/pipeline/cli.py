"""CLI do pipeline: `uv run firecal --help`."""

from __future__ import annotations

from datetime import date, timedelta

import typer

from app.config import get_settings

from . import download as dl
from .harmonize import harmonize as run_harmonize
from .ingest import ingest as run_ingest
from .regions import build_regions
from .sources import SOURCES

app = typer.Typer(help="Pipeline FIRMS -> calendario harmonizado de focos (Amazonia).")


@app.command()
def download(
    start: int = typer.Option(2000, help="Primeiro ano"),
    end: int = typer.Option(date.today().year, help="Ultimo ano"),
    source: list[str] = typer.Option(list(SOURCES), help="modis, viirs-snpp"),
    country: list[str] = typer.Option(None, help="Padrao: todos os paises amazonicos"),
    workers: int = 4,
):
    """Baixa os arquivos anuais por pais (historico, sem MAP_KEY)."""
    s = get_settings()
    stats = dl.download_country_files(s.raw_dir, range(start, end + 1), source, country, workers)
    typer.echo(stats)


@app.command("download-recent")
def download_recent(
    source: list[str] = typer.Option(list(SOURCES)),
    until: str = typer.Option(None, help="AAAA-MM-DD (padrao: hoje)"),
):
    """Preenche via Area API o periodo apos o ultimo arquivo anual (precisa de MAP_KEY)."""
    s = get_settings()
    end = date.fromisoformat(until) if until else date.today()
    for key in source:
        last = dl.last_country_date(s.raw_dir, key)
        if last is None:
            typer.echo(f"{key}: sem arquivos anuais; rode `firecal download` antes.")
            continue
        start = last + timedelta(days=1)
        typer.echo(f"{key}: {start} -> {end}")
        n = dl.download_api_gap(s.raw_dir, s.firms_map_key, s.bbox, start, end, key)
        typer.echo(f"{key}: {n} janelas baixadas")


@app.command()
def live():
    """Snapshot dos ultimos 7 dias (feeds publicos FIRMS, sem MAP_KEY)."""
    typer.echo(dl.download_live(get_settings().raw_dir))


@app.command()
def context():
    """Baixa o indice ONI (El Nino/La Nina) da NOAA."""
    typer.echo(dl.download_context(get_settings().raw_dir))


@app.command()
def ingest():
    """CSV brutos -> Parquet normalizado e recortado para a regiao."""
    typer.echo(run_ingest(get_settings()))


@app.command()
def harmonize():
    """Gera a serie mensal harmonizada + tabelas de calibracao/validacao."""
    for k, v in run_harmonize(get_settings()).items():
        typer.echo(f"{k:28s} {round(v, 4) if isinstance(v, float) else v}")


@app.command()
def regions():
    """Baixa limites oficiais (INPE) do bioma, UFs e municipios e gera regions.geojson."""
    typer.echo(f"{build_regions(get_settings().data_path)} regioes")


@app.command("all")
def run_all(start: int = 2000):
    """regions -> download -> download-recent -> ingest -> harmonize."""
    regions()
    download(start=start, end=date.today().year, source=list(SOURCES), country=None, workers=4)
    if get_settings().firms_map_key:
        download_recent(source=list(SOURCES), until=None)
    else:
        typer.echo("FIRMS_MAP_KEY vazio: pulando dados recentes da API.")
    live()
    context()
    ingest()
    harmonize()


if __name__ == "__main__":
    app()

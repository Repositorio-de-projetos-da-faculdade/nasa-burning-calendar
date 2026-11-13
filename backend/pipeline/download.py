"""Download dos focos FIRMS.

1. Historico: arquivos anuais por pais (sem MAP_KEY), 2000 ate o ultimo ano consolidado.
2. Lacuna recente: Area API (precisa de MAP_KEY), em janelas de 5 dias, SP quando
   disponivel e NRT para o periodo ainda nao consolidado.
"""

from __future__ import annotations

import csv
import io
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

import httpx
from tqdm import tqdm

from .sources import (
    AMAZON_COUNTRIES,
    API_MAX_DAYS,
    AREA_API_URL,
    AVAILABILITY_URL,
    COUNTRY_URL,
    LIVE_PATHS,
    LIVE_URL,
    ONI_URL,
    SOURCES,
)

TIMEOUT = httpx.Timeout(60.0, read=300.0)


def _stream_to_file(client: httpx.Client, url: str, dest: Path) -> str:
    """Baixa url -> dest de forma atomica. Retorna 'ok', 'skip' ou 'missing'."""
    if dest.exists() and dest.stat().st_size > 0:
        return "skip"
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with client.stream("GET", url) as r:
        if r.status_code == 404:
            return "missing"
        r.raise_for_status()
        with tmp.open("wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk)
    tmp.replace(dest)
    return "ok"


def download_country_files(
    raw_dir: Path,
    years: range,
    sources: list[str] | None = None,
    countries: list[str] | None = None,
    workers: int = 4,
) -> dict[str, int]:
    sources = sources or list(SOURCES)
    countries = countries or AMAZON_COUNTRIES
    jobs = []
    for key in sources:
        src = SOURCES[key]
        for year in years:
            if year < src.first_year:
                continue
            for country in countries:
                url = COUNTRY_URL.format(key=key, year=year, country=country)
                dest = raw_dir / "country" / key / str(year) / f"{key}_{year}_{country}.csv"
                jobs.append((url, dest))

    stats = {"ok": 0, "skip": 0, "missing": 0, "error": 0}
    with httpx.Client(timeout=TIMEOUT, follow_redirects=True) as client:
        with ThreadPoolExecutor(workers) as pool:
            futs = {pool.submit(_stream_to_file, client, u, d): (u, d) for u, d in jobs}
            for fut in tqdm(as_completed(futs), total=len(futs), desc="country files"):
                try:
                    stats[fut.result()] += 1
                except Exception as exc:  # noqa: BLE001
                    stats["error"] += 1
                    tqdm.write(f"ERRO {futs[fut][0]}: {exc}")
    return stats


def last_country_date(raw_dir: Path, key: str) -> date | None:
    """Ultima data presente nos arquivos anuais (le so o fim do arquivo mais recente)."""
    base = raw_dir / "country" / key
    if not base.exists():
        return None
    latest: date | None = None
    years = sorted((p for p in base.iterdir() if p.is_dir()), key=lambda p: int(p.name))
    for ydir in reversed(years):
        for f in ydir.glob("*.csv"):
            with f.open("rb") as fh:
                fh.seek(0, 2)
                size = fh.tell()
                fh.seek(max(0, size - 4096))
                tail = fh.read().decode("utf-8", "ignore").strip().splitlines()
            if len(tail) < 2:
                continue
            d = date.fromisoformat(tail[-1].split(",")[5])
            latest = d if latest is None or d > latest else latest
        if latest:
            return latest
    return None


def api_availability(client: httpx.Client, map_key: str) -> dict[str, tuple[date, date]]:
    r = client.get(AVAILABILITY_URL.format(map_key=map_key))
    r.raise_for_status()
    out = {}
    for row in csv.DictReader(io.StringIO(r.text)):
        try:
            out[row["data_id"]] = (
                date.fromisoformat(row["min_date"]),
                date.fromisoformat(row["max_date"]),
            )
        except (KeyError, ValueError):
            continue
    return out


def download_api_gap(
    raw_dir: Path,
    map_key: str,
    bbox: tuple[float, float, float, float],
    start: date,
    end: date,
    source_key: str,
    pause_s: float = 0.5,
) -> int:
    """Baixa [start, end] via Area API em janelas de 5 dias. Retorna n de janelas baixadas."""
    if not map_key:
        raise RuntimeError("FIRMS_MAP_KEY vazio: defina no .env")
    src = SOURCES[source_key]
    bbox_s = ",".join(f"{v:g}" for v in bbox)
    n = 0
    with httpx.Client(timeout=TIMEOUT, follow_redirects=True) as client:
        avail = api_availability(client, map_key)
        sp_max = avail.get(src.api_sp, (None, date.min))[1]
        cur = start
        total = (end - start).days // API_MAX_DAYS + 1
        with tqdm(total=total, desc=f"api {source_key}") as bar:
            while cur <= end:
                days = min(API_MAX_DAYS, (end - cur).days + 1)
                api_source = src.api_sp if cur + timedelta(days=days - 1) <= sp_max else src.api_nrt
                dest = raw_dir / "api" / source_key / f"{api_source}_{cur.isoformat()}_{days}d.csv"
                # NRT muda ate consolidar: sempre rebaixa janelas NRT
                if api_source == src.api_nrt and dest.exists():
                    dest.unlink()
                url = AREA_API_URL.format(
                    map_key=map_key, source=api_source, bbox=bbox_s, days=days, date=cur.isoformat()
                )
                if _stream_to_file(client, url, dest) == "ok":
                    n += 1
                    head = dest.read_text("utf-8", "ignore")[:200]
                    if not head.startswith("latitude"):
                        dest.unlink()
                        raise RuntimeError(f"Resposta inesperada da API ({api_source} {cur}): {head}")
                    time.sleep(pause_s)
                cur += timedelta(days=days)
                bar.update(1)
    return n


def download_live(raw_dir: Path) -> dict[str, int]:
    """Snapshot dos feeds publicos de 7 dias (sem MAP_KEY). Rodando todo dia, a serie
    recente se constroi sozinha; o ingest remove as duplicatas entre snapshots."""
    out = {}
    stamp = date.today().isoformat()
    with httpx.Client(timeout=TIMEOUT, follow_redirects=True) as client:
        for key, path in LIVE_PATHS.items():
            r = client.get(LIVE_URL.format(path=path))
            r.raise_for_status()
            rows = r.text.count("\n") - 1
            out[key] = max(rows, 0)
            if rows > 0:
                dest = raw_dir / "live" / key / f"{stamp}.csv"
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(r.text, "utf-8")
    return out


def download_context(raw_dir: Path) -> Path:
    """Indice ONI (El Nino / La Nina) da NOAA."""
    dest = raw_dir / "context" / "oni.txt"
    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=TIMEOUT, follow_redirects=True) as client:
        r = client.get(ONI_URL)
        r.raise_for_status()
        dest.write_text(r.text, "utf-8")
    return dest

# FireCal Amazonia

**A harmonized burning-activity calendar for the Brazilian Amazon, built from more than two decades of
NASA FIRMS fire hotspots.**

Satellites have tracked active fires since 2000, but the record is split between two sensor generations that
cannot be compared directly: MODIS (1 km pixels, since 2000) and VIIRS (375 m pixels, since 2012). Over the
Amazon biome, VIIRS detects about **6.1×** more hotspots than MODIS over the same months, so stitching the two
records together produces a false jump in 2012.

FireCal Amazonia converts MODIS into **VIIRS S-NPP equivalent hotspots** with locally fitted factors, so the whole
record from 2002 to today reads on one scale. A web monitor turns it into a calendar of when and where the Amazon
burns, for any area: the biome, a state, a municipality, a drawn polygon, a radius or a pair of coordinates.

Built for the NASA challenge on harmonizing active-fire records into a burning-activity calendar for early warning
and emergency responders, scientists and land managers.

## Contents

- [What the monitor does](#what-the-monitor-does)
- [How the harmonization works](#how-the-harmonization-works)
- [Validation](#validation)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Building the data](#building-the-data)
- [Running locally](#running-locally)
- [Building for production](#building-for-production)
- [Deploying with Docker](#deploying-with-docker)
- [Configuration](#configuration)
- [API](#api)
- [Testing and code quality](#testing-and-code-quality)
- [Project status and roadmap](#project-status-and-roadmap)
- [Data sources and acknowledgements](#data-sources-and-acknowledgements)

## What the monitor does

- **Map:** harmonized hotspots per 0.1° cell (about 11 km), for any month, any year or the mean of all years.
- **Timeline:** one bar per month for the selected area; drag it to move the map through time, or play it as a
  timelapse. A side-by-side mode compares two periods, and a relief mode shows hotspots as 3D columns.
- **Calendar:** a year × month grid on one scale, in hotspot counts or as anomalies against the median of past
  complete years and its typical p25–p75 range.
- **Indicators:** the current month against the median prorated to today, the year-to-date total and its rank
  against every past year, the fire season and its peak month, and the worst year on record.
- **Method tab:** the validation chart and metrics, so anyone can inspect the harmonization.
- **Area selection:** search for a municipality or state, click the map, draw a rectangle or polygon, set a radius,
  or type coordinates.
- **Export and sharing:** the monthly series and the raw hotspots as CSV, and a link that keeps the area and period.

## How the harmonization works

The pipeline lives in [`backend/pipeline/harmonize.py`](backend/pipeline/harmonize.py).

1. **Filter.** Keep vegetation fires (`type` 0 or missing) with nominal or high confidence. Industrial and volcanic
   heat sources are dropped.
2. **Align.** Use one satellite per sensor with the same overpass time, about 13:30: **Aqua** for MODIS and
   **S-NPP** for VIIRS. Both see each fire at the same hour of the day, and no fire is counted twice by a second
   satellite.
3. **Grid.** Count hotspots on a common 0.1° grid, per day and per month.
4. **Calibrate.** For each 2° tile and month of the year, fit a factor on the 2012–2021 overlap, with shrinkage
   towards the biome-wide factor `K` for that month:

   ```
   k = (N + α·K) / (D + α)        N = VIIRS hotspots, D = MODIS hotspots, α = 50
   ```

   The 50 pseudo-hotspots keep tiles with little fire from getting a noisy factor.
5. **Convert.** Before 2012 the series is MODIS × k; from 2012 on it is measured VIIRS. The unit is
   **VIIRS S-NPP equivalent hotspots**.

A third generation, **NOAA-20** (VIIRS, since 2018), is calibrated against S-NPP the same way (`k2`), so the record
can continue now that S-NPP has stopped sending data. See [Project status](#project-status-and-roadmap).

## Validation

On the full dataset (Amazon biome, July 2002 to December 2025, 13.4 million hotspots):

| Metric | Result |
|---|---|
| Monthly correlation, harmonized MODIS vs. VIIRS (2012+ overlap) | **0.99** |
| Out-of-sample correlation (2022+, never used to fit `k`) | **0.99** |
| Total bias against VIIRS, raw MODIS | −83% |
| Total bias against VIIRS, after harmonizing | **+0.6%** |

The same metrics and the month-by-month chart are served by `GET /api/validation` and shown in the monitor's Method
tab. An automated end-to-end test ([`backend/tests/test_pipeline.py`](backend/tests/test_pipeline.py)) builds
synthetic fires with a known 3× VIIRS/MODIS ratio and checks that the pipeline recovers it within 1%, that converted
pre-2012 months match measured post-2012 months within 5%, and that the three most critical months come out as
August to October.

## Architecture

```
NASA FIRMS ──► firecal pipeline ──► Parquet ──► FastAPI + DuckDB ──► React monitor
INPE        (download, ingest,     (data/      (backend/app)        (frontend)
             harmonize)            processed)
```

```
backend/
  app/            FastAPI + DuckDB API, reads the Parquet files (read-only)
  pipeline/       `firecal` CLI: regions -> download -> ingest -> harmonize
  tests/          end-to-end test with synthetic data
frontend/         React 19 + Vite + MapLibre GL + Terra Draw + ECharts + TanStack Query
data/             created by the pipeline, not versioned
  raw/            FIRMS CSV files
  processed/      Parquet files and regions.geojson
  boundaries/     INPE boundaries (amazonia.geojson and others)
docker-compose.yml
```

The API computes each calendar on request, for any geometry, with DuckDB over the processed Parquet files and
Shapely for the area masks. The frontend calls it on the same origin under `/api` (Vite proxies it in
development; nginx proxies it in production).

## Getting started

### Prerequisites

- **Python 3.12+** and [**uv**](https://docs.astral.sh/uv/)
- **Node.js 24** and npm (other recent versions may work; 24 is what the Docker image uses)
- **Several GB of free disk** for the full FIRMS history of the Amazon countries (much less for a quick test)
- Optional: a free **FIRMS MAP_KEY** from <https://firms.modaps.eosdis.nasa.gov/api/map_key/>, needed only to fill
  the most recent months through the FIRMS Area API
- Optional: **Docker** with Docker Compose, to deploy

### Install

```bash
git clone https://github.com/Repositorio-de-projetos-da-faculdade/nasa-burning-calendar.git
cd nasa-burning-calendar
cp .env.example .env            # then add your FIRMS_MAP_KEY (optional)

cd backend
uv sync                         # creates the virtual environment with Python 3.12

cd ../frontend
npm install
```

> **Windows:** if the project path is long, `shapely` can fail to load its DLLs. Clone into a short folder
> (for example `C:\dev\firecal`) or set `UV_PROJECT_ENVIRONMENT=C:\venvs\firecal`.

## Building the data

The data is not in the repository: the pipeline downloads it from NASA FIRMS and INPE and builds it locally. Run the
commands from `backend/`.

```bash
uv run firecal regions          # INPE boundaries: biome, states, municipalities -> regions.geojson
uv run firecal download         # yearly per-country FIRMS files, 2000 to today (several GB)
uv run firecal download-recent  # recent gap through the Area API (needs FIRMS_MAP_KEY)
uv run firecal live             # snapshot of the public 7-day feeds (no key needed)
uv run firecal ingest           # CSV -> data/processed/hotspots/sensor=*/year=*
uv run firecal harmonize        # -> monthly_cells, daily_cells, coverage, calibration, validation
```

Or all of it in one go: `uv run firecal all`. Run `uv run firecal --help` for every option.

**Quick test with little data** (a few minutes instead of hours):

```bash
uv run firecal regions
uv run firecal download --start 2011 --end 2013 --country Suriname --country French_Guiana
uv run firecal ingest
uv run firecal harmonize
```

`harmonize` prints its metrics at the end (monthly correlation, out-of-sample correlation, VIIRS/MODIS ratio).

## Running locally

In two terminals:

```bash
# terminal 1: API on http://localhost:8000 (docs at /docs)
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

```bash
# terminal 2: monitor on http://localhost:5173, proxying /api to port 8000
cd frontend
npm run dev
```

Set `VITE_API_PROXY` to point the dev server at another API, for example
`VITE_API_PROXY=https://your-server npm run dev`.

## Building for production

```bash
cd frontend
npm run build                   # type-checks, then writes the static site to frontend/dist
npm run preview                 # serves dist locally to check the build
```

`frontend/dist` is a static site, but it needs the API on the same origin under `/api`. In production, nginx serves
the site and proxies `/api` to the backend ([`frontend/nginx.conf`](frontend/nginx.conf)).

## Deploying with Docker

`docker-compose.yml` defines three services: `web` (nginx with the built frontend, port 80), `api` (FastAPI) and
`pipeline` (the `firecal` CLI, run on demand). All of them share `./data` on the host.

```bash
cp .env.example .env && nano .env
docker compose up -d --build                  # starts web + api
docker compose run --rm pipeline all          # first data load (long)
```

Set `WEB_PORT` in `.env` to publish the site on a port other than 80.

**Keeping the data current**, for example from a daily cron job:

```bash
docker compose run --rm pipeline live
docker compose run --rm pipeline ingest
docker compose run --rm pipeline harmonize
```

The API notices new data on its own: the Parquet timestamp is part of every cache key, and the map layer URL carries
the data version, so browsers fetch fresh tiles after each run.

## Configuration

All settings are environment variables, read from `.env` at the repository root (see
[`.env.example`](.env.example)) or from the environment.

| Variable | Default | What it does |
|---|---|---|
| `FIRMS_MAP_KEY` | empty | FIRMS key for `download-recent`; leave empty to skip it |
| `DATA_DIR` | `./data` | data folder, relative to the repo root or absolute |
| `REGION_BBOX` | `-80,-20,-44,10.5` | bounding box (west,south,east,north) applied at ingest |
| `REGION_BOUNDARY` | `./data/boundaries/amazonia.geojson` | exact boundary used to clip hotspots, if the file exists |
| `CORS_ORIGINS` | `http://localhost:5173` | allowed origins, comma-separated |
| `GRID_DEG` | `0.1` | common grid cell size, in degrees (the map layer assumes 0.1) |
| `CALIB_TILE_DEG` | `2.0` | calibration tile size, in degrees |
| `CALIB_YEARS` | `2012-2021` | years used to fit the MODIS→VIIRS factor |
| `WEB_PORT` | `80` | host port of the `web` container |
| `VITE_API_PROXY` | `http://localhost:8000` | API the Vite dev server proxies to |

## API

Interactive docs are served at `/docs` when the API is running.

| Method | Route | Returns |
|---|---|---|
| GET | `/api/health`, `/api/meta` | status, data coverage and hotspot count per satellite |
| GET | `/api/version` | version of the processed data |
| GET | `/api/regions` | list of regions (biome, states, municipalities) |
| GET | `/api/regions/{id}`, `/api/regions/outlines`, `/api/regions/at?lon&lat` | region geometry, map outlines, municipality at a point |
| POST | `/api/calendar` | year × month matrix, climatology, anomalies, current month, year to date, summary |
| GET | `/api/grid?year&month` | harmonized hotspots per cell (map layer); no year = annual mean |
| POST | `/api/calendar.csv` | the harmonized monthly series of the area |
| POST | `/api/hotspots.csv` | raw hotspots in the area and period, streamed |
| GET | `/api/validation` | raw MODIS × VIIRS × harmonized MODIS per month, plus metrics |

The POST endpoints take an area as one of:

```json
{"region": "state-PA"}
{"geometry": {"type": "Polygon", "coordinates": [...]}}
{"bbox": [-61, -11, -54, -4]}
{"lat": -7.5, "lon": -57.5, "radius_km": 50}
```

`/api/hotspots.csv` also takes `"start"` and `"end"` (`YYYY-MM-DD`) and an optional `"sensor"` (`MODIS` or `VIIRS`).

## Testing and code quality

```bash
cd backend
uv run pytest                   # end-to-end test on synthetic data
uv run ruff check .
```

```bash
cd frontend
npx tsc -b                      # type check
npm run lint                    # oxlint
npm run build
```

Chart and map colors live in [`frontend/src/lib/scales.ts`](frontend/src/lib/scales.ts): a single-hue heat ramp for
counts, a blue–red diverging scale for anomalies and fixed colors per sensor. Check any change for color blindness.

## Project status and roadmap

**Working today:** the full pipeline on the biome (13.4 million hotspots, July 2002 to December 2025), the API and
the monitor described above.

**In progress:**

- **NOAA-20 continuity.** VIIRS S-NPP stopped sending data (its public 7-day feed was empty on November 10, 2026).
  The three-generation harmonization (Aqua → S-NPP ← NOAA-20), the `firecal live` snapshots and the NOAA-20 source
  are in the pipeline but not yet validated on the full record, and the API does not use `coverage.parquet` yet.
- **Recent months.** Without a FIRMS MAP_KEY there is a gap between the last yearly file and the 7-day feeds; run
  `firecal download-recent` with a key to fill it.

**Planned:**

1. Daily coverage in the calendar: partial months shown as partial, missing months as gaps.
2. An alert radar for all 559 municipalities: where it is worst right now, against each one's own history.
3. A daily series with the cumulative curve of the year against past years.
4. Live hotspots on the map (last 24 h, 48 h or 7 days).
5. Harmonization uncertainty for the selected area.
6. Trend (Theil–Sen, Mann–Kendall) and El Niño phase per year.

**Known limits:** the study area is the Brazilian Amazon biome (INPE boundary); the clip is precise to about 2 km at
the edge; the frontend bundle is about 2.6 MB and could be split.

## Data sources and acknowledgements

- **Fire hotspots:** NASA Fire Information for Resource Management System
  ([FIRMS](https://firms.modaps.eosdis.nasa.gov/)), MODIS Collection 6.1 and VIIRS 375 m active fire products,
  Standard Processing and Near Real-Time. We acknowledge the use of data from NASA's FIRMS, part of NASA's Earth
  Science Data and Information System (ESDIS).
- **Boundaries:** INPE [TerraBrasilis](https://terrabrasilis.dpi.inpe.br/) (PRODES Amazon biome, states and
  municipalities).
- **Climate context:** NOAA Climate Prediction Center, Oceanic Niño Index (ONI).
- **Basemap:** © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, © [CARTO](https://carto.com/attributions).

Hotspots mark active fire at the moment of the satellite overpass; clouds and thick smoke can hide detections, and a
hotspot is not a measure of burned area.

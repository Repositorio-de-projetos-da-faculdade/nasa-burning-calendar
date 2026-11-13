# FireCal Amazônia

Calendário harmonizado de focos de calor (MODIS + VIIRS, NASA FIRMS) para o bioma Amazônia
(limites oficiais INPE/TerraBrasilis: bioma, 9 estados e 559 municípios).
Desafio NASA: *harmonizar os registros para que o sensor de origem deixe de importar*.

## Estrutura

```
backend/
  app/            API FastAPI + DuckDB (lê Parquet)
  pipeline/       CLI `firecal`: download -> ingest -> harmonize
  tests/          teste ponta a ponta com dados sintéticos
frontend/         React + Vite + MapLibre + Terra Draw + ECharts
data/
  raw/            CSVs do FIRMS (gitignored)
  processed/      Parquets (gitignored)
  boundaries/     amazonia.geojson opcional (limite RAISG / bioma IBGE)
docker-compose.yml
```

## Setup local (Windows/Linux)

```bash
cp .env.example .env            # coloque sua FIRMS_MAP_KEY
cd backend && uv sync           # Python 3.12
uv run pytest                   # 3 testes
cd ../frontend && npm install
```

> Windows: se o caminho do projeto for muito longo, o `shapely` falha ao carregar DLLs.
> Use uma pasta curta (ex.: `C:\dev\firecal`) ou `UV_PROJECT_ENVIRONMENT=C:\venvs\firecal`.

### Pipeline de dados

```bash
cd backend
uv run firecal regions                  # limites INPE: bioma, UFs, municípios
uv run firecal download                 # histórico 2000..hoje, arquivos anuais por país (~GBs)
uv run firecal download-recent          # lacuna recente via Area API (precisa MAP_KEY)
uv run firecal ingest                   # -> data/processed/hotspots/sensor=*/year=*
uv run firecal harmonize                # -> monthly_cells / calibration / validation.parquet
# ou tudo: uv run firecal all
```

Teste rápido com pouco dado: `uv run firecal download --start 2011 --end 2013 --country Suriname --country French_Guiana`.

### Dev servers

```bash
cd backend  && uv run uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev              # http://localhost:5173 (proxy /api -> :8000)
```

## Deploy na VM (Docker)

```bash
cp .env.example .env && nano .env
docker compose up -d --build                    # web (nginx :80) + api
docker compose run --rm pipeline all            # primeira carga de dados
```

Atualização diária (cron): `docker compose run --rm pipeline download-recent && docker compose run --rm pipeline ingest && docker compose run --rm pipeline harmonize`.

## API

| Método | Rota | O quê |
|---|---|---|
| GET | `/api/health`, `/api/meta` | status, cobertura e contagem por satélite |
| GET | `/api/regions` | lista de regiões (bioma, UFs, municípios) |
| GET | `/api/regions/{id}`, `/api/regions/outlines`, `/api/regions/at?lon&lat` | geometria, contornos do mapa, município num ponto |
| POST | `/api/calendar` | matriz ano×mês harmonizada, climatologia, anomalias, mês atual, acumulado, resumo |
| GET | `/api/grid?year&month` | focos harmonizados por célula (camada do mapa) |
| POST | `/api/calendar.csv` | série mensal harmonizada da área |
| POST | `/api/hotspots.csv` | focos brutos (área + período), em streaming |
| GET | `/api/validation` | MODIS bruto × VIIRS × MODIS harmonizado + métricas |

Área: `{"region": "uf-PA"}` ou `{"geometry": GeoJSON}` ou `{"bbox": [w,s,e,n]}` ou `{"lat", "lon", "radius_km"}`.

## Harmonização (v0)

1. Filtra vegetação (`type = 0`/ausente) e confiança nominal/alta.
2. Um satélite por sensor: **Aqua** (MODIS) e **S-NPP** (VIIRS), ambos ~13h30.
3. Grade comum de 0,1° × mês.
4. Fator `k = VIIRS/MODIS` por bloco de 2° × mês do ano, calibrado em 2012–2021, com
   *shrinkage* para o fator regional do mês.
5. Série = VIIRS a partir de 2012; antes disso, MODIS × k ("focos equivalentes VIIRS").

Parâmetros em `.env` (`GRID_DEG`, `CALIB_TILE_DEG`, `CALIB_YEARS`, `MODIS_SATELLITES`...).
Ideias para v1: quantile mapping, presença diária por célula, correção por cobertura de nuvem,
incluir Terra (2000–2002) e NOAA-20/21 com fatores próprios.

Resultado na base completa (bioma, 2002–2025, 13,4 mi de focos): VIIRS detecta ~6,1× mais que o
MODIS; após harmonizar, correlação mensal 0,99 (0,99 fora da amostra, 2022+) e viés de −83% → +0,6%.

## Frontend

Mapa (MapLibre) com camada de focos por célula ligada ao calendário, seleção por município (clique
ou busca), retângulo, polígono, raio e coordenadas; indicadores, calendário ano×mês (contagem ou
anomalia), ano corrente vs. histórico, totais anuais e seção de metodologia com a validação.

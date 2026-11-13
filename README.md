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

---

# Estado atual e melhorias planejadas

Esta seção é o guia para quem for ajudar. Prazo de submissão: **15/11**.

## O que já funciona

- Pipeline completo (`firecal regions | download | ingest | harmonize`) na base do bioma:
  13,4 milhões de focos, jul/2002 a dez/2025.
- API e tela: mapa com focos por célula, seleção de área (município, estado, desenho, raio,
  coordenadas), indicadores, calendário ano × mês (contagem e anomalia), ano atual contra o
  histórico, totais anuais, seção de metodologia com validação, exportação CSV.

## Duas descobertas que mudaram o escopo

1. **O VIIRS S-NPP parou de enviar dados.** O feed público de 7 dias dele está vazio
   (verificado em 10/11/2026). A série precisa de uma terceira geração: **NOAA-20**.
   Arquivos anuais por país existem com o prefixo `viirs-jpss1` (2018 em diante).
2. **Super El Niño em curso.** O índice ONI da NOAA está em +2,46 (trimestre ASO 2026).
   É o contexto que torna o "mês atual contra o histórico" relevante agora.

## Feito pela metade (prioridade 1)

O pipeline novo já está no repositório, mas a API e a tela ainda não o usam, e ele **ainda
não foi rodado na base completa** (só nos testes sintéticos, que não têm NOAA-20).

| Peça | Arquivo | Estado |
|---|---|---|
| Fonte NOAA-20 (`viirs-jpss1`) | `backend/pipeline/sources.py` | pronto; histórico Brasil 2018–2025 baixado localmente |
| Harmonização em 3 gerações (Aqua → S-NPP ← NOAA-20), dia a dia | `backend/pipeline/harmonize.py` | escrito, falta validar na base real |
| `firecal live`: snapshot dos últimos 7 dias, sem MAP_KEY | `backend/pipeline/download.py`, `cli.py` | pronto |
| `firecal context`: índice ONI (El Niño) | idem | pronto |
| Ingest lê `raw/live/` e remove duplicatas entre snapshots | `backend/pipeline/ingest.py` | escrito, falta rodar |

Saídas novas do `harmonize` em `data/processed/`:

- `daily_cells.parquet`: célula × dia, valor harmonizado `h`.
- `monthly_cells.parquet`: agora com `n20_n`, `modis_h`, `n20_h` (brutos e convertidos).
- `coverage.parquet`: quais dias têm dados e de qual geração (`modis`, `snpp`, `n20`).
- `calibration.parquet`: fatores `k` (Aqua→S-NPP) e `k2` (NOAA-20→S-NPP).

**Próximo passo imediato:** rodar `firecal ingest` e `firecal harmonize`, conferir as métricas
impressas (`corr_noaa20`, `ratio_snpp_noaa20` devem ficar perto de 1) e então adaptar a API.

Atenção: o `backend/app/analytics.py` atual ainda usa a lógica antiga (data final = último
foco; ano parcial = ano corrente). Com dados de novembro/2026 vindos do `live` e um buraco de
janeiro a outubro sem MAP_KEY, ele precisa passar a usar `coverage.parquet`.

## Melhorias planejadas (API + tela)

Em ordem de valor para o usuário final (gestor de emergência). Cada item diz o que entregar.

### 1. Cobertura por dia no calendário
- **Backend:** `build_calendar` usa `coverage.parquet`. Mês sem nenhum dia coberto vira célula
  vazia; mês com cobertura parcial tem o valor esperado proporcional aos dias cobertos.
  Rótulo de fonte por mês: `VIIRS`, `MODIS→VIIRS` ou `NOAA-20→VIIRS`.
- **Tela:** terceira cor de era no calendário (NOAA-20), hachura em meses parciais.
- **Pronto quando:** novembro/2026 aparece como mês parcial e jan–out/2026 como "sem dados".

### 2. Radar de alerta por município
- **Backend:** `GET /api/radar?window=7d|month|year`. Para cada um dos 559 municípios: valor
  na janela, mediana e p90 históricos da mesma janela, razão, excesso e nível
  (`critical`, `high`, `normal`, `low`). Mapear célula → município com `shapely.STRtree`.
- **Tela:** lista "onde está pior agora" ordenada por excesso, e o mapa pintado por nível.
  Clicar num item abre o município.
- **Pronto quando:** dá para responder "quais municípios estão acima do normal esta semana".

### 3. Série diária e curva acumulada
- **Backend:** `POST /api/daily` (área + ano). Focos por dia, mediana e p90 diários, curva
  acumulada do ano contra p10/p50/p90 históricos, datas típicas de início, pico e fim da
  temporada, e "últimos 7 dias contra a mesma semana nos outros anos".
- **Tela:** faixa de dias do ano (estilo calendário de contribuições) e gráfico acumulado.
- **Pronto quando:** o indicador "últimos 7 dias" funciona mesmo sem MAP_KEY.

### 4. Focos ao vivo no mapa
- **Backend:** `GET /api/live`, que busca os feeds públicos de 7 dias (MODIS, NOAA-20,
  NOAA-21), recorta pelo bioma e guarda em cache por ~15 minutos.
- **Tela:** camada de pontos com filtro 24 h / 48 h / 7 dias.

### 5. Incerteza da harmonização por área
- **Backend:** na resposta do calendário, comparar MODIS convertido com VIIRS medido nos meses
  de sobreposição **da área selecionada**: erro mediano mensal e anual, faixa mínima e máxima.
- **Tela:** barras de erro nos anos convertidos (2002–2011) e um selo "confiabilidade nesta área".

### 6. Tendência e El Niño
- **Backend:** inclinação de Theil–Sen e teste de Mann–Kendall nos totais anuais; fase do ENSO
  por ano a partir de `data/raw/context/oni.txt`.
- **Tela:** indicador de tendência (% por década, significativa ou não) e marcação dos anos de
  El Niño / La Niña no gráfico anual.

### 7. Apresentação
- Texto de situação gerado automaticamente ("briefing") com botão de copiar.
- Link compartilhável (área e modo na URL) e CSS de impressão para gerar PDF.
- **Inglês:** os jurados são da NASA. Alternância PT/EN em toda a tela.

## Pendências operacionais

- **`FIRMS_MAP_KEY`:** sem ela não há dados de 1/jan a 2/nov de 2026 (o `live` só cobre os
  últimos 7 dias). Com a chave: `firecal download-recent`, depois `ingest` e `harmonize`.
  O `download-recent` precisa ser conferido para a fonte `viirs-jpss1`.
- **Docker:** reconstruir as imagens (`docker compose up -d --build`); as atuais têm o frontend antigo.
- **Agendamento na VM:** rodar `firecal live && firecal ingest && firecal harmonize` todo dia.
- **Região:** hoje é o bioma Amazônia brasileiro (limite INPE). Os CSVs dos outros países
  amazônicos são baixados, mas ficam fora do recorte.
- **Recorte do bioma:** precisão de ~2 km na borda (`CLIP_DEG` em `ingest.py`).
- **Tamanho do bundle:** o JS do frontend tem ~2,6 MB; dá para dividir ECharts e MapLibre.

## Convenções

- Backend: `uv run pytest` e `uv run ruff check .` antes de enviar.
- Frontend: `npx tsc -b` e `npm run build`.
- Cores dos gráficos: ver `frontend/src/lib/scales.ts`. Sequencial de um matiz para contagem,
  divergente azul–cinza–vermelho para anomalia, e três cores fixas por sensor. Não trocar sem
  validar para daltonismo.
- No Windows, use uma pasta de caminho curto: caminhos longos quebram o `shapely`.

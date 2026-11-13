"""Fontes de dados FIRMS usadas no projeto."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Source:
    key: str  # prefixo dos arquivos anuais por pais
    sensor: str  # MODIS | VIIRS
    first_year: int
    api_sp: str  # Standard Processing (historico consolidado)
    api_nrt: str  # Near Real-Time (ultimos meses)


SOURCES: dict[str, Source] = {
    "modis": Source("modis", "MODIS", 2000, "MODIS_SP", "MODIS_NRT"),
    "viirs-snpp": Source("viirs-snpp", "VIIRS", 2012, "VIIRS_SNPP_SP", "VIIRS_SNPP_NRT"),
    # NOAA-20 (JPSS-1): continuidade do VIIRS depois do S-NPP
    "viirs-jpss1": Source("viirs-jpss1", "VIIRS", 2018, "VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT"),
}

# Paises com territorio na Pan-Amazonia (nomes exatamente como no FIRMS)
AMAZON_COUNTRIES = [
    "Brazil",
    "Bolivia",
    "Peru",
    "Colombia",
    "Venezuela",
    "Ecuador",
    "Guyana",
    "Suriname",
    "French_Guiana",
]

COUNTRY_URL = "https://firms.modaps.eosdis.nasa.gov/data/country/{key}/{year}/{key}_{year}_{country}.csv"
AREA_API_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{map_key}/{source}/{bbox}/{days}/{date}"
AVAILABILITY_URL = "https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/{map_key}/all"

# Codigos de satelite nos CSVs -> nome legivel
SATELLITE_NAMES = {
    "Terra": "Terra",
    "Aqua": "Aqua",
    "T": "Terra",
    "A": "Aqua",
    "N": "S-NPP",
    "1": "NOAA-20",
    "N20": "NOAA-20",
    "2": "NOAA-21",
    "N21": "NOAA-21",
}

API_MAX_DAYS = 5  # limite do DAY_RANGE da Area API

# Feeds publicos dos ultimos 7 dias (nao exigem MAP_KEY)
LIVE_URL = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/{path}_South_America_7d.csv"
LIVE_PATHS = {
    "modis": "modis-c6.1/csv/MODIS_C6_1",
    "viirs-snpp": "suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2",
    "viirs-jpss1": "noaa-20-viirs-c2/csv/J1_VIIRS_C2",
}
ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"

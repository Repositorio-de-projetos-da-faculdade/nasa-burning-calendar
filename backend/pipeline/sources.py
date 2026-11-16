"""FIRMS data sources used in the project."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Source:
    key: str  # prefix of the yearly per-country files
    sensor: str  # MODIS | VIIRS
    first_year: int
    api_sp: str  # Standard Processing (consolidated history)
    api_nrt: str  # Near Real-Time (latest months)


SOURCES: dict[str, Source] = {
    "modis": Source("modis", "MODIS", 2000, "MODIS_SP", "MODIS_NRT"),
    "viirs-snpp": Source("viirs-snpp", "VIIRS", 2012, "VIIRS_SNPP_SP", "VIIRS_SNPP_NRT"),
    # NOAA-20 (JPSS-1): VIIRS continuity after S-NPP
    "viirs-jpss1": Source("viirs-jpss1", "VIIRS", 2018, "VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT"),
}

# Countries with territory in the Pan-Amazon (names exactly as in FIRMS)
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

# Satellite codes in the CSVs -> readable name
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

API_MAX_DAYS = 5  # DAY_RANGE limit of the Area API

# Public feeds for the last 7 days (no MAP_KEY needed)
LIVE_URL = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/{path}_South_America_7d.csv"
LIVE_PATHS = {
    "modis": "modis-c6.1/csv/MODIS_C6_1",
    "viirs-snpp": "suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2",
    "viirs-jpss1": "noaa-20-viirs-c2/csv/J1_VIIRS_C2",
}
ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"

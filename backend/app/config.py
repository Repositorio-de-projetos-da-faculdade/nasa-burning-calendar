"""Configuracao central (lida do .env na raiz do repo ou de variaveis de ambiente)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    firms_map_key: str = ""
    data_dir: Path = Path("./data")
    region_bbox: str = "-80.0,-20.0,-44.0,10.5"
    region_boundary: Path | None = Path("./data/boundaries/amazonia.geojson")
    cors_origins: str = "http://localhost:5173"

    # Harmonizacao
    grid_deg: float = 0.1  # celula da grade comum (graus)
    calib_tile_deg: float = 2.0  # bloco espacial onde o fator MODIS->VIIRS e ajustado
    calib_years: str = "2012-2021"  # sobreposicao com orbitas ainda estaveis
    modis_satellites: str = "Aqua"  # Aqua passa ~13h30, como o S-NPP
    viirs_satellites: str = "S-NPP"

    @staticmethod
    def _resolve(p: Path) -> Path:
        return p if p.is_absolute() else (REPO_ROOT / p).resolve()

    @property
    def data_path(self) -> Path:
        return self._resolve(self.data_dir)

    @property
    def raw_dir(self) -> Path:
        return self.data_path / "raw"

    @property
    def processed_dir(self) -> Path:
        return self.data_path / "processed"

    @property
    def boundary_path(self) -> Path | None:
        if self.region_boundary is None:
            return None
        p = self._resolve(self.region_boundary)
        return p if p.exists() else None

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        w, s, e, n = (float(x) for x in self.region_bbox.split(","))
        return w, s, e, n

    @property
    def calib_range(self) -> tuple[int, int]:
        a, b = self.calib_years.split("-")
        return int(a), int(b)

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @staticmethod
    def as_list(value: str) -> list[str]:
        return [v.strip() for v in value.split(",") if v.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

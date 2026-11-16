"""End-to-end test with synthetic data: CSV -> ingest -> harmonize -> API."""

import random

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings

MODIS_HDR = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type"
VIIRS_HDR = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type"


def _write(path, header, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(header + "\n" + "\n".join(rows) + "\n")


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    data = tmp_path_factory.mktemp("data")
    rnd = random.Random(42)
    for year in range(2008, 2016):
        modis, viirs = [], []
        for month in range(1, 13):
            season = 5 if month in (8, 9, 10) else 1
            for _ in range(10 * season):
                lat, lon = rnd.uniform(-10, -5), rnd.uniform(-60, -55)
                d = f"{year}-{month:02d}-{rnd.randint(1, 28):02d}"
                modis.append(f"{lat},{lon},320,1,1,{d},1330,Aqua,MODIS,70,6.1,290,10,D,0")
                if year >= 2012:
                    for _ in range(3):  # VIIRS sees ~3x more
                        viirs.append(f"{lat},{lon},330,0.4,0.4,{d},1330,N,VIIRS,n,2,290,3,D,0")
        _write(data / f"raw/country/modis/{year}/modis_{year}_Brazil.csv", MODIS_HDR, modis)
        if viirs:
            _write(data / f"raw/country/viirs-snpp/{year}/viirs-snpp_{year}_Brazil.csv", VIIRS_HDR, viirs)

    import os

    os.environ["DATA_DIR"] = str(data)
    os.environ["REGION_BOUNDARY"] = str(data / "does_not_exist.geojson")
    os.environ["CALIB_YEARS"] = "2012-2014"
    get_settings.cache_clear()

    from pipeline.harmonize import harmonize
    from pipeline.ingest import ingest

    counts = ingest(get_settings())
    assert counts["MODIS"] > 0 and counts["VIIRS"] > 0
    metrics = harmonize(get_settings())
    assert metrics["global_ratio_viirs_modis"] == pytest.approx(3.0, rel=0.01)

    from app.main import app

    return TestClient(app)


def test_health(client):
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and all(r["data"].values())


def test_calendar_is_harmonized(client):
    r = client.post("/api/calendar", json={"bbox": [-61, -11, -54, -4]}).json()
    assert r["years"] == list(range(2008, 2016))
    by = {(x["year"], x["month"]): x for x in r["series"]}
    # pre-2012 MODIS converted to "VIIRS equivalent" must match the post-2012 VIIRS level
    assert by[(2010, 9)]["harmonized"] == pytest.approx(by[(2013, 9)]["harmonized"], rel=0.05)
    assert set(r["summary"]["critical_months"]) == {8, 9, 10}


def test_point_radius_and_csv(client):
    r = client.post(
        "/api/hotspots.csv",
        json={"lat": -7.5, "lon": -57.5, "radius_km": 100, "start": "2013-08-01", "end": "2013-08-31"},
    )
    assert r.status_code == 200
    lines = r.text.strip().splitlines()
    assert lines[0].startswith("latitude,longitude") and len(lines) > 1

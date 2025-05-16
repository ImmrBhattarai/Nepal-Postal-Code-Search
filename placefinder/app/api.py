from fastapi import APIRouter, Request, Query, HTTPException, status, Body
from fastapi.responses import JSONResponse
from fastapi.templating import Jinja2Templates
from pathlib import Path
import httpx
import logging
from fastapi.openapi.utils import get_openapi
from fastapi import Depends
from starlette.requests import Request as StarletteRequest
import time
import sqlite3
from contextlib import contextmanager
from fastapi.middleware.cors import CORSMiddleware
import csv
from functools import lru_cache

router = APIRouter()

# In-memory favorites store (for demo)
favorites_store = {}

# Simple in-memory rate limiter (per IP)
rate_limit_window = 60  # seconds
rate_limit_max = 60  # max requests per window
rate_limit_data = {}


def rate_limiter(request: StarletteRequest):
    ip = request.client.host
    now = int(time.time())
    window = now // rate_limit_window
    key = f"{ip}:{window}"
    count = rate_limit_data.get(key, 0)
    if count >= rate_limit_max:
        raise HTTPException(
            status_code=429, detail="Rate limit exceeded. Try again later."
        )
    rate_limit_data[key] = count + 1


# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("placefinder")

# Template setup
BASE_DIR = Path(__file__).resolve().parent
TEMPLATE_DIR = BASE_DIR / "templates"
templates = Jinja2Templates(directory=TEMPLATE_DIR)

DB_PATH = BASE_DIR / "favorites.db"
CSV_PATH = BASE_DIR.parent / "PostalCodeNepal.csv"


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            name TEXT,
            postal_code TEXT,
            lat TEXT,
            lon TEXT,
            district TEXT
        )"""
        )


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()


init_db()


# CORS middleware
def add_cors_middleware(app):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# Load and cache the CSV data on startup
@lru_cache(maxsize=1)
def load_postal_data():
    data = []
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Parse lat/lon as float if present, else None
            lat = None
            lon = None
            try:
                lat = float(row["Latitude"]) if row.get("Latitude") else None
            except Exception:
                lat = None
            try:
                lon = float(row["Longitude"]) if row.get("Longitude") else None
            except Exception:
                lon = None
            data.append(
                {
                    "name": f"{row['Post Office']}, {row['District']}",
                    "postal_code": row["Postal/Pin Code"],
                    "district": row["District"],
                    "lat": lat,
                    "lon": lon,
                }
            )
    return data


# ========== ROUTES ==========


@router.get("/")
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@router.get(
    "/search",
    tags=["Search"],
    summary="Search for places by name or postal code",
    response_description="List of places",
)
async def search(
    q: str = Query(
        ..., min_length=2, description="Place name or postal code to search for"
    ),
    limit: int = Query(5, ge=1, le=50, description="Max results to return"),
    offset: int = Query(0, ge=0, description="Result offset for pagination"),
    request: Request = None,
    _=Depends(rate_limiter),
):
    """
    Search places and postal codes from PostalCodeNepal.csv only.
    """
    q_lower = q.lower()
    data = load_postal_data()
    filtered = [
        item
        for item in data
        if q_lower in item["name"].lower()
        or q_lower in (item["district"] or "").lower()
        or q_lower in (item["postal_code"] or "")
    ]
    filtered = filtered[offset: offset + limit]
    return JSONResponse(content=filtered)


@router.get(
    "/autocomplete",
    tags=["Autocomplete"],
    summary="Get place name suggestions",
    response_description="List of suggestions",
)
async def autocomplete(
    q: str = Query(..., min_length=2, description="Partial place name"),
    limit: int = Query(5, ge=1, le=20),
):
    """
    Return place name suggestions from PostalCodeNepal.csv only.
    """
    q_lower = q.lower()
    data = load_postal_data()
    suggestions = [
        item["name"]
        for item in data
        if q_lower in item["name"].lower()
        or q_lower in (item["district"] or "").lower()
        or q_lower in (item["postal_code"] or "")
    ]
    # Remove duplicates, keep order
    seen = set()
    unique = []
    for s in suggestions:
        if s not in seen:
            unique.append(s)
            seen.add(s)
    return JSONResponse(content=unique[:limit])


@router.get(
    "/favorites",
    tags=["Favorites"],
    summary="Get all favorites",
    response_description="List of favorite places",
)
async def get_favorites(request: Request, _=Depends(rate_limiter)):
    user_id = request.client.host
    with get_db() as conn:
        rows = conn.execute(
            "SELECT name, postal_code, lat, lon, district FROM favorites WHERE user_id = ?",
            (user_id,),
        ).fetchall()
        favs = [
            dict(zip(["name", "postal_code", "lat", "lon", "district"], row))
            for row in rows
        ]
    return favs


@router.post(
    "/favorites",
    tags=["Favorites"],
    summary="Add a favorite",
    status_code=status.HTTP_201_CREATED,
)
async def add_favorite(
    item: dict = Body(...), request: Request = None, _=Depends(rate_limiter)
):
    user_id = request.client.host
    with get_db() as conn:
        exists = conn.execute(
            "SELECT 1 FROM favorites WHERE user_id = ? AND postal_code = ?",
            (user_id, item.get("postal_code")),
        ).fetchone()
        if not exists:
            conn.execute(
                "INSERT INTO favorites (user_id, name, postal_code, lat, lon, district) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    user_id,
                    item.get("name"),
                    item.get("postal_code"),
                    item.get("lat"),
                    item.get("lon"),
                    item.get("district"),
                ),
            )
            conn.commit()
        rows = conn.execute(
            "SELECT name, postal_code, lat, lon, district FROM favorites WHERE user_id = ?",
            (user_id,),
        ).fetchall()
        favs = [
            dict(zip(["name", "postal_code", "lat", "lon", "district"], row))
            for row in rows
        ]
    return {"ok": True, "favorites": favs}


@router.delete(
    "/favorites/{postal_code}", tags=["Favorites"], summary="Remove a favorite"
)
async def remove_favorite(
    postal_code: str, request: Request = None, _=Depends(rate_limiter)
):
    user_id = request.client.host
    with get_db() as conn:
        conn.execute(
            "DELETE FROM favorites WHERE user_id = ? AND postal_code = ?",
            (user_id, postal_code),
        )
        conn.commit()
        rows = conn.execute(
            "SELECT name, postal_code, lat, lon, district FROM favorites WHERE user_id = ?",
            (user_id,),
        ).fetchall()
        favs = [
            dict(zip(["name", "postal_code", "lat", "lon", "district"], row))
            for row in rows
        ]
    return {"ok": True, "favorites": favs}


@router.get("/location")
async def get_location(request: Request):
    """
    Get approximate location based on client IP using ip-api.
    """
    client_ip = request.client.host
    async with httpx.AsyncClient() as client:
        response = await client.get(f"http://ip-api.com/json/{client_ip}")
    data = response.json()
    return {
        "ip": client_ip,
        "city": data.get("city"),
        "region": data.get("regionName"),
        "country": data.get("country"),
        "lat": data.get("lat"),
        "lon": data.get("lon"),
    }


@router.get("/weather")
async def get_weather(lat: float, lon: float):
    """
    Get weather forecast using Open-Meteo.
    """
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode",
        "timezone": "auto",
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params)
    if response.status_code != 200:
        return {"error": "Weather data not available."}

    return response.json()


@router.get("/nearby")
async def get_nearby(lat: float, lon: float):
    """
    Dummy nearby results.
    """
    return {
        "location": {"lat": lat, "lon": lon},
        "nearby": [
            {"name": "Museum of History", "type": "Attraction", "distance_km": 0.5},
            {"name": "Central Coffee House", "type": "Cafe", "distance_km": 0.3},
        ],
    }


# Health check endpoint
@router.get("/health", tags=["Health"], summary="Health check endpoint")
async def health():
    return {"status": "ok", "date": "2025-05-15"}


# Advanced filtering and sorting for /search
@router.get(
    "/search-advanced",
    tags=["Search"],
    summary="Advanced search for places",
    response_description="List of places",
)
async def search_advanced(
    q: str = Query(
        None, min_length=2, description="Place name or postal code to search for"
    ),
    district: str = Query(None, description="Filter by district/county/state"),
    sort_by: str = Query(
        "name", description="Sort by field: name, postal_code, district"
    ),
    sort_order: str = Query("asc", description="Sort order: asc or desc"),
    limit: int = Query(5, ge=1, le=50, description="Max results to return"),
    offset: int = Query(0, ge=0, description="Result offset for pagination"),
    request: Request = None,
    _=Depends(rate_limiter),
):
    """
    Advanced search with filtering and sorting.
    """
    logger.info(
        f"/search-advanced: q={q} district={district} sort_by={sort_by} "
        f"sort_order={sort_order} limit={limit} offset={offset} "
        f"from {request.client.host if request else 'unknown'}"
    )
    nominatim_url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": q or "",
        "format": "json",
        "addressdetails": 1,
        "limit": limit + offset,
    }
    headers = {"User-Agent": "PostalCodeFinderApp"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(nominatim_url, params=params, headers=headers)
            response.raise_for_status()
    except httpx.RequestError as e:
        logger.error(f"Nominatim request failed: {str(e)}")
        raise HTTPException(
            status_code=503, detail=f"Nominatim request failed: {str(e)}"
        )
    results = response.json()
    filtered = []
    for item in results:
        address = item.get("address", {})
        postal_code = item.get("postcode") or address.get("postcode")
        district_val = address.get("county") or address.get("state") or "N/A"
        if postal_code and (
            not q
            or (q.isdigit() and postal_code.startswith(q))
            or (q and q.lower() in item.get("display_name", "").lower())
        ):
            if not district or (
                district and district.lower() in (district_val or "").lower()
            ):
                filtered.append(
                    {
                        "name": item.get("display_name", "Unknown"),
                        "postal_code": postal_code,
                        "lat": item.get("lat"),
                        "lon": item.get("lon"),
                        "district": district_val,
                    }
                )
    # Sorting
    reverse = sort_order == "desc"
    if sort_by in ["name", "postal_code", "district"]:
        filtered.sort(key=lambda x: (x.get(sort_by) or "").lower(), reverse=reverse)
    filtered = filtered[offset: offset + limit]
    return JSONResponse(content=filtered)


def custom_openapi():
    if router.openapi_schema:
        return router.openapi_schema
    openapi_schema = get_openapi(
        title="PlaceFinder API",
        version="1.0.0",
        description="API for searching places, postal codes, and managing favorites.",
        routes=router.routes,
    )
    router.openapi_schema = openapi_schema
    return router.openapi_schema

import os

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI()

token = os.getenv("TMDB_TOKEN")


def get_tmdb_headers() -> dict[str, str]:
    if not token:
        raise HTTPException(
            status_code=500,
            detail="La variable d'environnement TMDB_TOKEN est manquante.",
        )

    return {
        "Authorization": f"Bearer {token}",
        "accept": "application/json",
    }


def fetch_tmdb_data(url: str, params: dict | None = None):
    try:
        response = requests.get(
            url,
            headers=get_tmdb_headers(),
            params=params,
            timeout=15,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur de communication avec TMDB : {exc}",
        ) from exc


app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def read_root():
    return {"Hello": "World"}


@app.get("/films")
def get_films():
    data = fetch_tmdb_data(
        "https://api.themoviedb.org/3/movie/popular",
        params={"language": "fr-FR"},
    )
    return data.get("results", [])


@app.get("/series")
def get_series():
    data = fetch_tmdb_data(
        "https://api.themoviedb.org/3/tv/popular",
        params={"language": "fr-FR"},
    )
    return data.get("results", [])


@app.get("/films/{film_id}")
def get_film_details(film_id: int):
    data = fetch_tmdb_data(
        f"https://api.themoviedb.org/3/movie/{film_id}",
        params={"language": "fr-FR"},
    )
    return data


@app.get("/series/{serie_id}")
def get_serie_details(serie_id: int):
    data = fetch_tmdb_data(
        f"https://api.themoviedb.org/3/tv/{serie_id}",
        params={"language": "fr-FR"},
    )
    return data

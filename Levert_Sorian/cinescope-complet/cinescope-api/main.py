import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# Charger le jeton depuis le fichier .env
load_dotenv(Path(__file__).with_name(".env"))

app = FastAPI(title="CineScope API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://127.0.0.1:4200"
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"]
)


@app.get("/")
def accueil():
    return {"message": "Bienvenue sur l'API CineScope !"}


# Notre ancienne route de test
@app.get("/api/films")
def recuperer_films():
    return [
        {
            "id": 1,
            "titre": "Evil Dead Burn",
            "annee": 2026,
            "genre": "Horreur"
        },
        {
            "id": 17,
            "titre": "The Batman",
            "annee": 2022,
            "genre": "Action"
        }
    ]


# Nouvelle route : recherche sur TMDB
@app.get("/api/recherche")
async def rechercher_films(titre: str = Query(min_length=1)):

    token = os.getenv("TMDB_TOKEN")

    if not token:
        raise HTTPException(
            status_code=500,
            detail="Le jeton TMDB est introuvable dans .env"
        )

    url = "https://api.themoviedb.org/3/search/movie"

    headers = {
        "Authorization": f"Bearer {token}",
        "accept": "application/json"
    }

    params = {
        "query": titre,
        "language": "fr-FR",
        "include_adult": "false"
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            reponse = await client.get(
                url,
                headers=headers,
                params=params
            )
            reponse.raise_for_status()

    except httpx.HTTPStatusError as erreur:
        raise HTTPException(
            status_code=502,
            detail=f"TMDB a renvoyé une erreur HTTP "
                   f"{erreur.response.status_code}"
        )

    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Impossible de contacter TMDB"
        )

    donnees = reponse.json()

    films = []

    for film in donnees.get("results", []):

        date = film.get("release_date") or ""
        poster = film.get("poster_path")

        films.append({
            "id": film["id"],
            "titre": film.get("title", ""),
            "annee": int(date[:4]) if date else None,
            "affiche": (
                f"https://image.tmdb.org/t/p/w500{poster}"
                if poster else None
            ),
            "synopsis": film.get("overview", "")
        })

    return {
        "nombre_total": donnees.get("total_results", 0),
        "films": films
    }


# ==========================================
# CINESCOPE - FICHES DETAILLEES
# ==========================================

async def appeler_tmdb(chemin: str, params: dict):

    token = os.getenv("TMDB_TOKEN")

    if not token:
        raise HTTPException(
            status_code=500,
            detail="Jeton TMDB introuvable"
        )

    url = f"https://api.themoviedb.org/3{chemin}"

    headers = {
        "Authorization": f"Bearer {token}",
        "accept": "application/json"
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            reponse = await client.get(
                url,
                headers=headers,
                params=params
            )

            if reponse.status_code == 404:
                raise HTTPException(
                    status_code=404,
                    detail="Film introuvable sur TMDB"
                )

            reponse.raise_for_status()
            return reponse.json()

    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="Erreur de réponse de TMDB"
        )

    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Impossible de contacter TMDB"
        )


# ==========================================
# RETROUVER UN FILM LOCAL SUR TMDB
# ==========================================

@app.get("/api/fiche-locale")
async def fiche_locale(titre: str, annee: int):

    donnees = await appeler_tmdb(
        "/search/movie",
        {
            "query": titre,
            "year": annee,
            "language": "fr-FR",
            "include_adult": False
        }
    )

    resultats = donnees.get("results", [])

    # Vérifier que l'année correspond
    film = next(
        (
            f for f in resultats
            if (f.get("release_date") or "")
            .startswith(str(annee))
        ),
        None
    )

    if film is None:
        raise HTTPException(
            status_code=404,
            detail="Correspondance TMDB introuvable"
        )

    return await fiche_tmdb(film["id"])


# ==========================================
# FICHE DETAILLEE D'UN FILM TMDB
# ==========================================

@app.get("/api/fiche/{tmdb_id}")
async def fiche_tmdb(tmdb_id: int):

    donnees = await appeler_tmdb(
        f"/movie/{tmdb_id}",
        {
            "language": "fr-FR",
            "append_to_response": "credits,videos"
        }
    )

    # Réalisateur
    equipe = donnees.get("credits", {}).get("crew", [])

    realisateur = next(
        (
            personne["name"]
            for personne in equipe
            if personne.get("job") == "Director"
        ),
        None
    )

    # Acteurs principaux
    casting = donnees.get("credits", {}).get("cast", [])

    acteurs = [
        personne["name"]
        for personne in casting[:5]
    ]

    # Bande-annonce
    videos = donnees.get("videos", {}).get("results", [])

    # Si aucune bande-annonce française n'existe,
    # rechercher les vidéos anglaises.
    if not any(
        v.get("site") == "YouTube"
        and v.get("type") == "Trailer"
        for v in videos
    ):
        try:
            videos_anglais = await appeler_tmdb(
                f"/movie/{tmdb_id}/videos",
                {"language": "en-US"}
            )
            videos = videos_anglais.get("results", [])
        except HTTPException:
            pass

    bande_annonce = next(
        (
            video
            for video in videos
            if video.get("site") == "YouTube"
            and video.get("type") == "Trailer"
        ),
        None
    )

    lien_bande_annonce = None

    if bande_annonce:
        cle = bande_annonce["key"]
        lien_bande_annonce = (
            f"https://www.youtube.com/watch?v={cle}"
        )

    # Genres
    genres = [
        genre["name"]
        for genre in donnees.get("genres", [])
    ]

    # Affiche
    poster = donnees.get("poster_path")

    affiche = (
        f"https://image.tmdb.org/t/p/w500{poster}"
        if poster else None
    )

    # Année
    date_sortie = donnees.get("release_date") or ""

    annee = (
        int(date_sortie[:4])
        if len(date_sortie) >= 4
        and date_sortie[:4].isdigit()
        else None
    )

    return {
        "id": donnees["id"],
        "titre": donnees.get("title", ""),
        "annee": annee,
        "genre": ", ".join(genres),
        "affiche": affiche,
        "synopsis": donnees.get("overview") or "",
        "duree": donnees.get("runtime"),
        "realisateur": realisateur,
        "acteurs": acteurs,
        "note": donnees.get("vote_average"),
        "bandeAnnonce": lien_bande_annonce
    }

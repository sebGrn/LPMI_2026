import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FilmsService } from '../services/films';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';

interface FilmTMDB {
  id: number;
  titre: string;
  annee: number | null;
  affiche: string | null;
  synopsis: string;
}

interface ReponseTMDB {
  nombre_total: number;
  films: FilmTMDB[];
}

interface FilmAffiche {
  id: number;
  titre: string;
  annee: number | null;
  genre: string;
  affiche: string | null;
  source: 'local' | 'tmdb';
}

@Component({
  selector: 'app-catalogue',
  imports: [FormsModule, RouterLink],
  templateUrl: './catalogue.html',
  styleUrl: './catalogue.scss'
})
export class Catalogue {

  films = inject(FilmsService).films;

  // ===== RECHERCHE ET CATÉGORIES =====

  recherche = '';
  genreSelectionne = 'Tous';

  get genres(): string[] {
    return [
      'Tous',
      'Horreur',
      'Thriller',
      'Action',
      'Science-fiction',
      'Animation',
      'Comédie',
      'Drame',
      'Fantastique'
    ];
  }

  get filmsFiltres() {
    const terme = this.recherche.trim().toLowerCase();

    return this.films.filter(film => {

      const correspondAuTitre =
        film.titre.toLowerCase().includes(terme);

      const correspondAuGenre =
        this.genreSelectionne === 'Tous' ||
        film.genre === this.genreSelectionne;

      return correspondAuTitre && correspondAuGenre;
    });
  }

  private http = inject(HttpClient);

  resultatsTMDB = signal<FilmTMDB[]>([]);
  chargementTMDB = signal(false);
  erreurTMDB = signal('');
  rechercheEffectueeTMDB = signal(false);

  chercherSurTMDB() {
    const titre = this.recherche.trim();

    if (!titre) return;

    this.chargementTMDB.set(true);
    this.erreurTMDB.set('');
    this.resultatsTMDB.set([]);
    this.rechercheEffectueeTMDB.set(true);

    this.http.get<ReponseTMDB>(
      '/api/recherche',
      {
        params: { titre }
      }
    ).subscribe({
      next: (reponse) => {
        this.resultatsTMDB.set(reponse.films);
        this.chargementTMDB.set(false);
      },

      error: () => {
        this.erreurTMDB.set(
          "Impossible de contacter l'API Python."
        );
        this.chargementTMDB.set(false);
      }
    });
  }

  reinitialiserRechercheTMDB() {
    this.resultatsTMDB.set([]);
    this.rechercheEffectueeTMDB.set(false);
    this.erreurTMDB.set('');
  }

  get filmsAffiches(): FilmAffiche[] {

    // Films provenant de notre catalogue
    const locaux: FilmAffiche[] = this.filmsFiltres.map(film => ({
      ...film,
      source: 'local'
    }));

    // Pour le moment, les catégories filtrent
    // uniquement les films de notre catalogue.
    if (
      !this.rechercheEffectueeTMDB() ||
      this.chargementTMDB() ||
      this.erreurTMDB() ||
      this.genreSelectionne !== 'Tous'
    ) {
      return locaux;
    }

    // Empêcher l'affichage de doublons
    const filmsConnus = new Set(
      locaux.map(film => this.cleFilm(film))
    );

    const distants: FilmAffiche[] = [];

    for (const film of this.resultatsTMDB()) {
      const cle = this.cleFilm(film);

      if (filmsConnus.has(cle)) {
        continue;
      }

      filmsConnus.add(cle);

      distants.push({
        id: film.id,
        titre: film.titre,
        annee: film.annee,
        genre: 'TMDB',
        affiche: film.affiche,
        source: 'tmdb'
      });
    }

    return [...locaux, ...distants];
  }

  private cleFilm(film: { 
    titre: string;
    annee: number | null;
  }): string {

    const titre = film.titre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    return `${titre}-${film.annee ?? 'inconnue'}`;
  }

}

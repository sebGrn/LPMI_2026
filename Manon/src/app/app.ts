import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, of } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DecimalPipe, DatePipe, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly title = signal('catalogue');

  readonly apiBaseUrl = 'http://127.0.0.1:8000';

  films: any[] = [];
  series: any[] = [];
  loadingFilms = false;
  loadingSeries = false;
  errorMessage = '';
  commentaire = '';

  selectedItem: any = null;
  selectedType: 'film' | 'serie' | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadFilms();
    this.loadSeries();
  }

  private loadFilms() {
    this.loadingFilms = true;
    this.http
      .get<any[]>(`${this.apiBaseUrl}/films`)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          this.errorMessage = 'Impossible de charger les films. Vérifie le backend et la configuration TMDB.';
          console.error('Erreur lors de la récupération des films :', error);
          return of([]);
        }),
        finalize(() => {
          this.loadingFilms = false;
        })
      )
      .subscribe((data) => {
        this.films = Array.isArray(data) ? data : [];
      });
  }

  private loadSeries() {
    this.loadingSeries = true;
    this.http
      .get<any[]>(`${this.apiBaseUrl}/series`)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          this.errorMessage = 'Impossible de charger les séries. Vérifie le backend et la configuration TMDB.';
          console.error('Erreur lors de la récupération des séries :', error);
          return of([]);
        }),
        finalize(() => {
          this.loadingSeries = false;
        })
      )
      .subscribe((data) => {
        this.series = Array.isArray(data) ? data : [];
      });
  }

  afficherFilm(film: any) {
    if (!film?.id) {
      return;
    }

    this.http
      .get<any>(`${this.apiBaseUrl}/films/${film.id}`)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          this.errorMessage = 'Impossible de charger les détails du film.';
          console.error('Erreur lors de la récupération du film :', error);
          return of(null);
        })
      )
      .subscribe((data) => {
        if (!data) {
          return;
        }

        this.selectedItem = data;
        this.selectedType = 'film';
      });
  }

  afficherSerie(serie: any) {
    if (!serie?.id) {
      return;
    }

    this.http
      .get<any>(`${this.apiBaseUrl}/series/${serie.id}`)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          this.errorMessage = 'Impossible de charger les détails de la série.';
          console.error('Erreur lors de la récupération de la série :', error);
          return of(null);
        })
      )
      .subscribe((data) => {
        if (!data) {
          return;
        }

        this.selectedItem = data;
        this.selectedType = 'serie';
      });
  }

  fermerFiche() {
    this.selectedItem = null;
    this.selectedType = null;
    this.commentaire = '';
  }

  posterUrl(posterPath: string | null | undefined): string {
    return posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : 'assets/no-poster.png';
  }

  ajouterCommentaire() {
    if (!this.commentaire.trim()) {
      return;
    }

    console.log('Nouveau commentaire :', this.commentaire.trim());
    this.commentaire = '';
  }
}

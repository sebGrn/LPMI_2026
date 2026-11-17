import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Catalogue } from '../catalogue/catalogue';
import { FilmsService } from '../services/films';
import { CarrouselFilms } from '../carrousel-films/carrousel-films';

@Component({
  selector: 'app-accueil',
  imports: [Catalogue, RouterLink, CarrouselFilms],
  templateUrl: './accueil.html',
  styleUrl: './accueil.scss'
})
export class Accueil {

  private filmsService = inject(FilmsService);

  films = this.filmsService.films;

  // Film mis en avant sur l'accueil
  filmVedette = this.films.find(film => film.id === 1);

  // Statistiques du catalogue
  totalFilms = this.films.length;

  totalHorreur = this.films.filter(
    film => film.genre === 'Horreur'
  ).length;

  
  filmsHorreur = this.films
    .filter(film =>
      film.genre.toLowerCase().includes('horreur')
    )
    .slice(0, 12);

  filmsScienceFiction = this.films
    .filter(film =>
      film.genre.toLowerCase().includes('science-fiction')
    )
    .slice(0, 12);


}
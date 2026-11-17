import { Routes } from '@angular/router';
import { Accueil } from './accueil/accueil';
import { FicheFilm } from './fiche-film/fiche-film';

export const routes: Routes = [
  {
    path: '',
    component: Accueil
  },
  {
    path: 'film/tmdb/:id',
    component: FicheFilm
  },
  {
    path: 'film/:id',
    component: FicheFilm
  },
  {
    path: '**',
    redirectTo: ''
  }
];
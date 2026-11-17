import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./tableau-de-bord/tableau-de-bord').then(m => m.TableauDeBord) },
  { path: '**', redirectTo: '' },
];

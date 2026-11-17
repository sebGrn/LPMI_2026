import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component'; // On importe bien notre composant racine

// Démarre l’application dans le navigateur puis affiche toute erreur de démarrage.
bootstrapApplication(AppComponent, appConfig) // On l'injecte ici au démarrage
  .catch((err) => console.error(err));

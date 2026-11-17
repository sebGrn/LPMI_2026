import { RenderMode, ServerRoute } from '@angular/ssr';

// Rendu dans le navigateur, comme une application Angular classique du cours
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];

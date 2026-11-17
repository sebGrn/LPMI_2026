import { Routes } from '@angular/router';
import { CatalogueComponent } from './catalogue/catalogue.component';
import { ChatbotComponent } from './chatbot/chatbot.component';
import { MediaDetailComponent } from './media-detail/media-detail.component';
import { WelcomeComponent } from './welcome/welcome.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: WelcomeComponent },
  { path: 'catalogue', pathMatch: 'full', component: CatalogueComponent },
  { path: 'catalogue/:id', component: MediaDetailComponent },
  { path: 'chatbot', component: ChatbotComponent },
];

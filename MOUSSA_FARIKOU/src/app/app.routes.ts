import { Routes } from '@angular/router';

import { TrackerCryptomonnaies } from './tracker-cryptomonnaies/tracker-cryptomonnaies';
import { Home } from './home/home';
import { About } from './about/about';
import { Contact } from './contact/contact';
import { CryptoDetail } from './crypto-detail/crypto-detail';

export const routes: Routes = [
  { path: 'home', component: Home },
  { path: 'cryptos', component: TrackerCryptomonnaies },
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: 'aboutus', component: About },
  { path: 'contactus', component: Contact },
  { path: 'cryptodetail/:id', component: CryptoDetail },
];

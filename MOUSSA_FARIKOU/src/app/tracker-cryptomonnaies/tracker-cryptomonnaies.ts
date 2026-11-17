import { ChangeDetectionStrategy, Component, Inject, OnInit } from '@angular/core';
import { baseURL } from '../shared/baseurl';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { Crypto } from '../shared/crypto';
import { CRYPTOS } from '../shared/cryptos';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs/operators';
import { CryptoService } from '../services/crypto.service';
import { PriceService } from '../services/price.service';

@Component({
  imports: [
    MatListModule,
    MatGridListModule,
    MatCardModule,
    MatButtonModule,
    CommonModule,
    RouterLink],
  providers: [
    {provide: 'baseURL', useValue: baseURL}
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-tracker-cryptomonnaies',
  styleUrl: './tracker-cryptomonnaies.css',
  templateUrl: './tracker-cryptomonnaies.html',
})
export class TrackerCryptomonnaies implements OnInit {

  cryptos: Crypto[] = CRYPTOS;
  selectedCrypto: Crypto = CRYPTOS[0];

  constructor(private cryptoService: CryptoService, private priceService: PriceService, @Inject('baseURL') protected baseURL: string = "") { }

  ngOnInit() {
    this.cryptoService.getCryptos()
      .pipe(switchMap(cryptos => this.priceService.withLivePrices(cryptos)))
      .subscribe(cryptos => this.cryptos = cryptos);
  }

  onSelect(crypto: Crypto) {
    this.selectedCrypto = crypto;
  }
}

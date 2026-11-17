import { ChangeDetectionStrategy, Component, Inject, OnInit } from '@angular/core';
import { baseURL } from '../shared/baseurl';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Params, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs/operators';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CryptoService } from '../services/crypto.service';
import { PriceService } from '../services/price.service';
import { Crypto } from '../shared/crypto';

@Component({
  imports: [
    MatCardModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    CommonModule,
    RouterLink],
  providers: [
    {provide: 'baseURL', useValue: baseURL}
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-crypto-detail',
  styleUrl: './crypto-detail.css',
  templateUrl: './crypto-detail.html',
})
export class CryptoDetail implements OnInit {

  crypto?: Crypto;
  cryptoIds: string[] = [];
  prev: string = "";
  next: string = "";

  constructor(private cryptoservice: CryptoService, private priceService: PriceService, private route: ActivatedRoute, private location: Location,
    @Inject('baseURL') protected baseURL: string = "") {
  }

  ngOnInit() {
    this.cryptoservice.getCryptoIds().subscribe(cryptoIds => {
      this.cryptoIds = cryptoIds;
      // the ids can arrive after the crypto (server delay): compute prev/next again
      if (this.crypto) { this.setPrevNext(this.crypto.id); }
    });

    this.route.params.pipe(switchMap((params: Params) => this.cryptoservice.getCrypto(params['id'])),
      switchMap((crypto: Crypto) => this.priceService.withLivePrice(crypto)))
      .subscribe(crypto => { this.crypto = crypto; this.setPrevNext(crypto.id); });
  }

  setPrevNext(cryptoId: string) {
    const index = this.cryptoIds.indexOf(cryptoId);
    this.prev = this.cryptoIds[(this.cryptoIds.length + index - 1) % this.cryptoIds.length];
    this.next = this.cryptoIds[(this.cryptoIds.length + index + 1) % this.cryptoIds.length];
  }

  goBack(): void {
    this.location.back();
  }
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { Crypto } from '../shared/crypto';
import { coingeckoURL } from '../shared/apiurl';

@Injectable({
  providedIn: 'root'
})
export class PriceService {

  // L'API gratuite limite le nombre de requêtes : on garde les prix 1 minute en mémoire
  private cache = new Map<string, { time: number, prices$: Observable<any> }>();
  private cacheDuration = 60000;

  constructor(private http: HttpClient) { }

  // Prix en euros et variation sur 24h, renvoyés par l'API externe CoinGecko
  getLivePrices(apiIds: string[]): Observable<any> {
    const url = coingeckoURL + 'simple/price?ids=' + apiIds.join(',')
      + '&vs_currencies=eur&include_24hr_change=true';
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.time < this.cacheDuration) {
      return cached.prices$;
    }
    const prices$ = this.http.get<any>(url).pipe(
      // en cas d'erreur, on ne garde pas la réponse en mémoire
      catchError(error => { this.cache.delete(url); return throwError(() => error); }),
      shareReplay(1)
    );
    this.cache.set(url, { time: Date.now(), prices$ });
    return prices$;
  }

  // Remplace le prix stocké par le prix en direct.
  // Si l'API ne répond pas, on garde le prix du serveur JSON (live = false).
  withLivePrices(cryptos: Crypto[]): Observable<Crypto[]> {
    return this.getLivePrices(cryptos.map(crypto => crypto.apiId)).pipe(
      map(prices => cryptos.map(crypto => prices[crypto.apiId]
        ? { ...crypto, price: prices[crypto.apiId].eur, change24h: prices[crypto.apiId].eur_24h_change, live: true }
        : crypto)),
      catchError(error => {
        console.error("Erreur lors de la récupération des prix en direct", error);
        return of(cryptos);
      })
    );
  }

  withLivePrice(crypto: Crypto): Observable<Crypto> {
    return this.withLivePrices([crypto]).pipe(map(cryptos => cryptos[0]));
  }
}

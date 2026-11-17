import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Crypto } from '../shared/crypto';
import { baseURL } from '../shared/baseurl';

@Injectable({
  providedIn: 'root'
})
export class CryptoService {

  constructor(private http: HttpClient) {
  }

  getCryptos(): Observable<Crypto[]> {
    return this.http.get<Crypto[]>(baseURL + 'cryptos');
  }

  getCrypto(id: string): Observable<Crypto> {
    return this.http.get<Crypto>(baseURL + 'cryptos/' + id);
  }

  getFeaturedCrypto(): Observable<Crypto> {
    return this.http.get<Crypto[]>(baseURL + 'cryptos?featured=true').pipe(map(cryptos => cryptos[0]));
  }

  getCryptoIds(): Observable<string[] | any> {
    return this.getCryptos().pipe(map(cryptos => cryptos.map(crypto => crypto.id)));
  }
}

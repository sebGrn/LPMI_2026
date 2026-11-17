import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  // L'URL correspond à celle du serveur Flask
  private backendUrl = 'http://localhost:5000/api/valeur';

  // Injection du HttpClient
  constructor(private http: HttpClient) { }

  // Méthode qui retourne un Observable
  getValeurDuServeur(): Observable<any> {
    return this.http.get<any>(this.backendUrl);
  }
}

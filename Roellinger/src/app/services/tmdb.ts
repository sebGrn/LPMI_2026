import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Media, TmdbResponse } from '../models/media.model';

@Injectable({
  providedIn: 'root'
})
export class TmdbService {
  private baseUrl = 'https://api.themoviedb.org/3';
  private apiKey = 'efec76aa9df4beda8f28ed0d141bbc0e'; 

  constructor(private http: HttpClient) {}

  getPopularMovies(): Observable<TmdbResponse> {
    return this.http.get<TmdbResponse>(`${this.baseUrl}/movie/popular?api_key=${this.apiKey}&language=fr-FR`);
  }

  getPopularSeries(): Observable<TmdbResponse> {
    return this.http.get<TmdbResponse>(`${this.baseUrl}/tv/popular?api_key=${this.apiKey}&language=fr-FR`);
  }

  searchMedia(query: string): Observable<TmdbResponse> {
    return this.http.get<TmdbResponse>(`${this.baseUrl}/search/multi?api_key=${this.apiKey}&language=fr-FR&query=${encodeURIComponent(query)}`);
  }

  getMediaDetails(id: number, type: 'movie' | 'tv'): Observable<Media> {
    return this.http.get<Media>(`${this.baseUrl}/${type}/${id}?api_key=${this.apiKey}&language=fr-FR`);
  }
}
export class Tmdb {}
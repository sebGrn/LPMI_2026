import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Language } from './language.service';

interface TranslationResponse {
  translation: string;
}

@Injectable({ providedIn: 'root' })
export class SynopsisTranslationService {
  /** Reçoit le client HTTP utilisé pour appeler le service de traduction. */
  constructor(private readonly http: HttpClient) {}

  /** Demande la traduction d’un texte dans la langue cible. */
  translate(text: string, target: Language): Observable<TranslationResponse> {
    return this.http.post<TranslationResponse>('/translate-synopsis', { text, target });
  }
}

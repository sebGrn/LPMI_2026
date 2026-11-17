
import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap, timeout } from 'rxjs';

import { FilmsService } from '../services/films';

// ==========================================
// STRUCTURE DES DONNEES D'UN FILM
// ==========================================

interface DetailsFilm {
  id: number;
  titre: string;
  annee: number | null;
  genre: string;
  affiche: string | null;
  synopsis: string;
  duree: number | null;
  realisateur: string | null;
  acteurs: string[];
  note: number | null;
  bandeAnnonce: string | null;
}

@Component({
  selector: 'app-fiche-film',
  imports: [RouterLink],
  templateUrl: './fiche-film.html',
  styleUrl: './fiche-film.scss'
})
export class FicheFilm {

  // ==========================================
  // SERVICES ANGULAR
  // ==========================================

  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private filmsService = inject(FilmsService);

  private apiUrl = '/api';

  // ==========================================
  // SIGNALS : ETAT DE NOTRE INTERFACE
  // ==========================================

  film = signal<DetailsFilm | null>(null);
  chargement = signal(true);
  erreur = signal('');


  // ==========================================
  // AJOUT 1 : CREATION DE LA LISTE DE COMMENTAIRES
  // ==========================================

  // On crée une liste vide de commentaires.
  // string[] signifie que la liste contient du texte.
  // signal() permet à Angular de mettre à jour l'affichage
  // lorsque cette liste change.

  commentaires = signal<string[]>([]);


  // ==========================================
  // AJOUT 2 : FONCTION POUR AJOUTER UN COMMENTAIRE
  // ==========================================

  // Cette fonction est appelée lorsque l'utilisateur
  // clique sur le bouton "Ajouter un commentaire".

  // Le paramètre "champ" représente le textarea
  // présent dans notre fichier HTML.

  ajouterCommentaire(champ: HTMLTextAreaElement) {

    // On récupère le texte écrit par l'utilisateur.
    // trim() supprime les espaces au début et à la fin.

    const texte = champ.value.trim();

    // Si le champ est vide, on arrête la fonction.
    // Cela évite d'ajouter un commentaire vide.

    if (texte === '') {
      return;
    }

    // On ajoute le commentaire à notre liste.
    // update() permet de modifier le signal.
    // ...liste récupère les anciens commentaires.
    // texte ajoute le nouveau commentaire à la fin.

    this.commentaires.update(liste => [...liste, texte]);

    // On vide le champ après avoir ajouté le commentaire.

    champ.value = '';
  }


  // ==========================================
  // CODE EXISTANT : CHARGEMENT DES FILMS
  // ==========================================

  constructor() {

    this.route.paramMap.pipe(

      switchMap(params => {

        // Réinitialiser l'affichage
        this.chargement.set(true);
        this.erreur.set('');
        this.film.set(null);


        // ==========================================
        // AJOUT 3 : REINITIALISER LES COMMENTAIRES
        // ==========================================

        // Quand on change de film, on vide la liste.
        // Cela évite de retrouver les commentaires
        // du film précédent sur le nouveau film.

        this.commentaires.set([]);



        const id = Number(params.get('id'));

        console.log('Identifiant demandé :', id);

        // Vérifier l'identifiant
        if (!Number.isSafeInteger(id) || id <= 0) {
          return of({
            film: null as DetailsFilm | null,
            erreur: 'Identifiant de film invalide.'
          });
        }

        // ======================================
        // CAS 1 : FILM PROVENANT DE TMDB
        // ======================================

        const estTMDB =
          this.route.snapshot.routeConfig?.path
          === 'film/tmdb/:id';

        if (estTMDB) {

          console.log('Chargement depuis TMDB...');

          return this.http.get<DetailsFilm>(
            `${this.apiUrl}/fiche/${id}`
          ).pipe(

            // FastAPI peut faire plusieurs appels TMDB pour une fiche.
            timeout(60000),

            map(film => ({
              film,
              erreur: ''
            })),

            catchError(err => {

              console.error('Erreur API TMDB :', err);

              return of({
                film: null as DetailsFilm | null,
                erreur:
                  'Impossible de récupérer les informations ' +
                  'du film depuis le serveur Python.'
              });

            })

          );
        }

        // ======================================
        // CAS 2 : FILM DE NOTRE CATALOGUE
        // ======================================

        console.log('Chargement film local...');

        const local = this.filmsService.trouverFilm(id);

        if (!local) {
          return of({
            film: null as DetailsFilm | null,
            erreur: 'Film introuvable dans le catalogue.'
          });
        }

        // Informations de secours si TMDB échoue
        const secours: DetailsFilm = {
          id: local.id,
          titre: local.titre,
          annee: local.annee,
          genre: local.genre,
          affiche: local.affiche,
          synopsis: 'Synopsis indisponible pour le moment.',
          duree: null,
          realisateur: null,
          acteurs: [],
          note: null,
          bandeAnnonce: null
        };

        return this.http.get<DetailsFilm>(
          `${this.apiUrl}/fiche-locale`,
          {
            params: {
              titre: local.titre,
              annee: String(local.annee)
            }
          }
        ).pipe(

          timeout(60000),

          map(details => ({
            film: {
              ...details,
              affiche: details.affiche ?? local.affiche
            },
            erreur: ''
          })),

          catchError(err => {

            console.error('Erreur fiche locale :', err);

            return of({
              film: secours,
              erreur:
                'Les informations complètes sont ' +
                'temporairement indisponibles.'
            });

          })

        );

      }),

      takeUntilDestroyed()

    ).subscribe({

      // ======================================
      // REQUETE TERMINEE
      // ======================================

      next: resultat => {

        console.log('Résultat reçu :', resultat);

        this.film.set(resultat.film);
        this.erreur.set(resultat.erreur);
        this.chargement.set(false);

      },

      // ======================================
      // ERREUR IMPREVUE
      // ======================================

      error: err => {

        console.error('Erreur inattendue :', err);

        this.film.set(null);

        this.erreur.set(
          'Une erreur est survenue pendant le chargement.'
        );

        this.chargement.set(false);

      }

    });

  }
}


import {
  Component,
  ElementRef,
  Input,
  ViewChild
} from '@angular/core';

import { RouterLink } from '@angular/router';

interface FilmCarrousel {
  id: number;
  titre: string;
  annee: number;
  genre: string;
  affiche: string;
}

@Component({
  selector: 'app-carrousel-films',
  imports: [RouterLink],
  templateUrl: './carrousel-films.html',
  styleUrl: './carrousel-films.scss'
})
export class CarrouselFilms {

  @Input() titre = '';
  @Input() films: FilmCarrousel[] = [];

  @ViewChild('piste')
  piste?: ElementRef<HTMLDivElement>;

  defiler(direction: number): void {

    const element = this.piste?.nativeElement;

    if (!element) return;

    const distance = element.clientWidth * 0.75;

    const mouvementReduit = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    element.scrollBy({
      left: direction * distance,
      behavior: mouvementReduit ? 'auto' : 'smooth'
    });
  }
}

import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { LanguageService } from '../services/language.service';
import { Media } from './media';

@Component({
  selector: 'app-catalogue-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './catalogue-banner.component.html',
  styleUrl: './catalogue-banner.component.scss',
})
export class CatalogueBannerComponent implements OnInit {
  readonly medias = input<Media[]>([]);
  readonly i18n = inject(LanguageService);
  readonly index = signal(0);
  /** Renvoie le média actuellement mis en avant dans la bannière. */
  readonly featured = computed(() => {
    const medias = this.medias();
    return medias.length ? medias[this.index() % medias.length] : undefined;
  });
  private readonly destroyRef = inject(DestroyRef);

  /** Lance la rotation automatique des médias de la bannière. */
  ngOnInit(): void {
    interval(6500).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.move(1));
  }

  /** Déplace la sélection d’un média dans la direction demandée. */
  move(direction: number): void {
    const count = this.medias().length;
    if (count > 1) this.index.update((index) => (index + direction + count) % count);
  }

  /** Traduit les genres affichés dans la bannière. */
  displayGenre(value: string): string {
    if (value === 'Non renseigné') return this.i18n.t('unavailable');
    return value.split(',').map((part) => this.i18n.genre(part.trim())).join(', ');
  }
}

import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { LanguageService } from '../services/language.service';
import { MediaService } from '../services/media.service';
import { Media } from '../shared/media';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss',
})
export class WelcomeComponent implements OnInit {
  readonly i18n = inject(LanguageService);
  readonly featuredPosters = signal<Media[]>([]);

  private readonly mediaService = inject(MediaService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private eligiblePosters: Media[] = [];

  /** Charge les affiches bien notées et démarre leur rotation périodique. */
  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.mediaService.getFeaturedMedias().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (medias) => {
        this.eligiblePosters = medias.filter((media) => this.isAboveFourOutOfFive(media));
        this.shuffleFeaturedPosters();
      },
    });

    interval(15000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.shuffleFeaturedPosters());
  }

  /** Vérifie si la note du média dépasse quatre sur cinq. */
  private isAboveFourOutOfFive(media: Media): boolean {
    const rating = Number(media.rating);
    const scale = Number(media.ratingScale ?? 5);
    return Number.isFinite(rating) && Number.isFinite(scale) && scale > 0 && rating / scale > 0.8;
  }

  /** Mélange les médias éligibles et choisit jusqu’à six affiches à montrer. */
  private shuffleFeaturedPosters(): void {
    if (this.eligiblePosters.length === 0) return;

    const shuffled = [...this.eligiblePosters];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }

    this.featuredPosters.set(shuffled.slice(0, Math.min(6, shuffled.length)));
  }
}

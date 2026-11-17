import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, Inject, inject, OnDestroy, OnInit, PLATFORM_ID, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RouterLink } from '@angular/router';
import { Media } from '../shared/media';
import { MediaService } from '../services/media.service';
import { Language, LanguageService } from '../services/language.service';
import { SynopsisTranslationService } from '../services/synopsis-translation.service';
import { CatalogueBannerComponent } from '../shared/catalogue-banner.component';

@Component({
  selector: 'app-catalogue',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CatalogueBannerComponent],
  templateUrl: './catalogue.component.html',
  styleUrl: './catalogue.component.scss'
})
export class CatalogueComponent implements OnInit, OnDestroy {

  readonly i18n = inject(LanguageService);
  private readonly allMedias = signal<Media[]>([]);
  readonly searchTerm = signal('');
  readonly isSearchOpen = signal(false);
  readonly typeFilter = signal('all');
  readonly genreFilter = signal('all');
  readonly yearFilter = signal('all');
  readonly ratingFilter = signal('all');
  readonly isLoading = signal(true);
  readonly isPageLoading = signal(false);
  readonly isCatalogueBuilding = signal(false);
  readonly errorMessage = signal('');
  readonly currentPage = signal(1);
  readonly totalPages = signal(1);
  readonly totalResults = signal(0);
  private readonly availableGenres = signal<string[]>([]);
  private readonly availableYears = signal<string[]>([]);
  private readonly translatedSynopses = signal<Record<string, string>>({});
  private translationRun = 0;
  private catalogueRequestRun = 0;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private buildStatusTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly pageStartCursors = new Map<number, number>();

  readonly ratingOptions = Array.from({ length: 11 }, (_, index) => index / 2);

  /** Expose les genres disponibles comme valeur réactive pour le template. */
  readonly genreOptions = computed(() => this.availableGenres());

  /** Expose les années disponibles comme valeur réactive pour le template. */
  readonly yearOptions = computed(() => this.availableYears());

  /** Déduit les décennies disponibles à partir des années du catalogue. */
  readonly decadeOptions = computed(() => [...new Set(
    this.yearOptions().map((year) => Math.floor(Number(year) / 10) * 10)
  )].sort((first, second) => second - first));

  /** Filtre les médias chargés selon le texte saisi dans la recherche. */
  readonly medias = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase();
    return this.allMedias().filter((media) => !query || media.title.toLocaleLowerCase().includes(query));
  });

  /** Configure la traduction réactive des synopsis du catalogue. */
  constructor(
    private mediaService: MediaService,
    private readonly synopsisTranslationService: SynopsisTranslationService,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    effect(() => {
      const language = this.i18n.language();
      const medias = this.allMedias();
      if (medias.length) untracked(() => void this.translateMedias(medias, language));
      else this.translationRun++;
    });
  }

  /** Charge la première page lorsque le composant s’ouvre dans le navigateur. */
  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadPage(1);
  }

  /** Libère les minuteries lorsque l’utilisateur quitte le catalogue. */
  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.buildStatusTimer) clearTimeout(this.buildStatusTimer);
  }

  /** Renvoie le libellé de chargement utilisé par le template. */
  loadingEstimateLabel(): string {
    return '';
  }

  /** Ouvre ou ferme la recherche et efface son filtre à la fermeture. */
  toggleSearch() {
    this.isSearchOpen.update((isOpen) => !isOpen);
    if (!this.isSearchOpen()) {
      this.onSearchChange('');
    }
  }

  /** Efface le texte de recherche et recharge les résultats. */
  clearSearch() {
    this.onSearchChange('');
  }

  /** Met à jour la recherche avec un court délai pour éviter trop de requêtes. */
  onSearchChange(value: string): void {
    this.searchTerm.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadPage(1), value.trim().length >= 2 || !value.trim() ? 300 : 0);
  }

  /** Applique le filtre de type et recharge la première page. */
  onTypeFilterChange(value: string): void {
    this.typeFilter.set(value);
    this.loadPage(1);
  }

  /** Applique le filtre de genre et recharge la première page. */
  onGenreFilterChange(value: string): void {
    this.genreFilter.set(value);
    this.loadPage(1);
  }

  /** Applique le filtre d’année et recharge la première page. */
  onYearFilterChange(value: string): void {
    this.yearFilter.set(value);
    this.loadPage(1);
  }

  /** Applique le filtre de note et recharge la première page. */
  onRatingFilterChange(value: string): void {
    this.ratingFilter.set(value);
    this.loadPage(1);
  }

  /** Charge une page du catalogue avec les filtres et enrichit ses affiches. */
  loadPage(page: number): void {
    if (page === 1) this.pageStartCursors.clear();
    const requestRun = ++this.catalogueRequestRun;
    this.errorMessage.set('');
    if (this.allMedias().length === 0) this.isLoading.set(true);
    else this.isPageLoading.set(true);

    this.mediaService.getCataloguePage({
      page,
      query: this.searchTerm().trim().length >= 2 ? this.searchTerm().trim() : '',
      type: this.typeFilter(),
      genre: this.genreFilter(),
      year: this.yearFilter(),
      rating: this.ratingFilter(),
      cursor: page > 1 ? this.pageStartCursors.get(page) : undefined,
    }).subscribe({
      next: (result) => {
        if (requestRun !== this.catalogueRequestRun) return;
        if (result.nextCursor !== undefined && result.nextCursor !== null && result.page < result.totalPages) {
          this.pageStartCursors.set(result.page + 1, result.nextCursor);
        }
        this.allMedias.set(result.items);
        this.availableGenres.set(result.genres);
        this.availableYears.set(result.years);
        this.currentPage.set(result.page);
        this.totalPages.set(result.totalPages);
        this.totalResults.set(result.total);
        this.isLoading.set(false);
        this.isPageLoading.set(false);
        this.setCatalogueBuilding(result.isBuilding);
        this.mediaService.getMediaArtwork(result.items).subscribe({
          next: (artwork) => {
            if (requestRun !== this.catalogueRequestRun) return;
            const artworkById = new Map(artwork.map((item) => [item.id, item]));
            this.allMedias.update((current) => current.map((media) => {
              const details = artworkById.get(media.id);
              if (!details) return media;
              const poster = media.posterUrl || details.poster || '';
              return {
                ...media,
                poster,
                posterUrl: poster,
                rating: media.rating.startsWith('Non') && details.rating ? details.rating : media.rating,
                ratingScale: media.ratingScale || details.ratingScale,
                ratingSource: media.ratingSource || details.ratingSource,
              };
            }));
          },
          error: () => undefined,
        });
      },
      error: (_error: HttpErrorResponse) => {
        if (requestRun !== this.catalogueRequestRun) return;
        this.errorMessage.set(this.i18n.t('loadError'));
        this.isLoading.set(false);
        this.isPageLoading.set(false);
      },
    });
  }

  /** Suit la construction du catalogue et recharge les résultats à sa fin. */
  private setCatalogueBuilding(isBuilding: boolean): void {
    this.isCatalogueBuilding.set(isBuilding);
    if (this.buildStatusTimer) clearTimeout(this.buildStatusTimer);
    if (!isBuilding) return;

    this.buildStatusTimer = setTimeout(() => {
      this.mediaService.getCatalogueBuildStatus().subscribe({
        next: (status) => {
          if (status.ready) {
            this.isCatalogueBuilding.set(false);
            this.loadPage(1);
          } else if (status.building) {
            this.setCatalogueBuilding(true);
          } else {
            this.isCatalogueBuilding.set(false);
          }
        },
        error: () => this.setCatalogueBuilding(true),
      });
    }, 2500);
  }

  /** Formate la note sur cinq ou affiche le texte de note indisponible. */
  displayRating(media: Media): string {
    const rating = this.getRatingOnFivePointScale(media);
    return rating === null ? this.i18n.t('unrated') : `${rating.toFixed(1)} / 5`;
  }

  /** Traduit les genres séparés par des virgules dans la langue choisie. */
  displayGenre(genre: string): string {
    if (genre === 'Non renseigné') return this.i18n.t('unavailable');
    return genre.split(',').map((part) => this.i18n.genre(part.trim())).join(', ');
  }

  /** Renvoie le synopsis traduit s’il existe, sinon le synopsis d’origine. */
  displaySynopsis(media: Media): string {
    return this.translatedSynopses()[`${this.i18n.language()}:${media.id}`] ?? media.synopsis;
  }

  /** Traduit les synopsis de la page en limitant le nombre d’appels simultanés. */
  private async translateMedias(medias: Media[], language: Language): Promise<void> {
    const run = ++this.translationRun;
    let index = 0;
    const workers = Array.from({ length: 3 }, async () => {
      while (index < medias.length && run === this.translationRun) {
        const media = medias[index++];
        if (!media.synopsis || media.synopsis === 'Synopsis non disponible.') continue;
        const key = `${language}:${media.id}`;
        if (this.translatedSynopses()[key]) continue;
        try {
          const result = await firstValueFrom(this.synopsisTranslationService.translate(media.synopsis, language));
          if (run !== this.translationRun) return;
          if (result.translation) this.translatedSynopses.update((translations) => ({ ...translations, [key]: result.translation }));
        } catch {
          // Keep the original synopsis if the public translation service is unavailable.
        }
      }
    });
    await Promise.all(workers);
  }

  /** Convertit une note de sa propre échelle vers une note sur cinq. */
  private getRatingOnFivePointScale(media: Media): number | null {
    const rating = Number(media.rating);
    const scale = Number(media.ratingScale || 5);
    if (!Number.isFinite(rating) || !Number.isFinite(scale) || scale <= 0 || media.rating.startsWith('Non')) {
      return null;
    }
    return Math.round((rating / scale) * 10) / 2;
  }
}

import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, computed, effect, inject, OnInit, PLATFORM_ID, signal, untracked } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CatalogueBannerComponent } from '../shared/catalogue-banner.component';
import { Media, MediaExtra, MediaSoundtrackPlaylist, MediaTrailer, MediaWikipediaBio, SpotifyTrack } from '../shared/media';
import { Language, LanguageService } from '../services/language.service';
import { MediaService } from '../services/media.service';
import { SynopsisTranslationService } from '../services/synopsis-translation.service';
import { CommentsSectionComponent } from './comments-section/comments-section';

@Component({
  selector: 'app-media-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, CatalogueBannerComponent, CommentsSectionComponent],
  templateUrl: './media-detail.component.html',
  styleUrl: './media-detail.component.scss',
})
export class MediaDetailComponent implements OnInit {
  readonly i18n = inject(LanguageService);
  readonly media = signal<Media | undefined>(undefined);
  readonly catalogue = signal<Media[]>([]);
  readonly isLoading = signal(true);
  readonly hasError = signal(false);
  readonly translatedSynopsis = signal('');
  readonly synopsisLookupLoading = signal(false);
  readonly wikipediaBiography = signal<MediaWikipediaBio | null>(null);
  readonly wikipediaBiographyLoading = signal(false);
  readonly mediaExtra = signal<MediaExtra>({});
  readonly trailers = signal<MediaTrailer[]>([]);
  readonly trailersLoading = signal(false);
  readonly trailersConfigured = signal(true);
  readonly soundtrackTracks = signal<SpotifyTrack[]>([]);
  readonly soundtrackLoading = signal(false);
  readonly soundtrackPlaylist = signal<MediaSoundtrackPlaylist | null>(null);
  readonly activeTrackUrl = signal<string | null>(null);
  private translationRun = 0;
  private synopsisLookupRun = 0;
  private mediaExtraRun = 0;
  private wikipediaBiographyRun = 0;
  private trailerRun = 0;
  private soundtrackRun = 0;
  private soundtrackAudio: HTMLAudioElement | null = null;
  private readonly safeTrailerUrls = new Map<string, SafeResourceUrl>();
  private readonly safePlaylistUrls = new Map<string, SafeResourceUrl>();
  private readonly synopsisLookupAttempted = new Set<string>();
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly mediaService = inject(MediaService);
  private readonly translator = inject(SynopsisTranslationService);
  private readonly sanitizer = inject(DomSanitizer);

  /** Réagit aux changements de média ou de langue pour charger ses informations. */
  constructor() {
    effect(() => {
      const media = this.media();
      const language = this.i18n.language();
      this.translatedSynopsis.set('');
      if (media) untracked(() => {
        if (this.isMissingSynopsis(media.synopsis)) this.findAlternateSynopsis(media, language);
        else void this.translateSynopsis(media.synopsis, language);
        this.loadMediaExtra(media, language);
        this.loadWikipediaBiography(media, language);
        this.loadTrailers(media);
      });
    });
  }

  /** Charge les médias à la une et la fiche dont l’identifiant est dans l’URL. */
  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.mediaService.getFeaturedMedias().subscribe({
      next: (medias) => this.catalogue.set(medias),
      error: () => undefined,
    });

    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      this.isLoading.set(true);
      this.hasError.set(false);
      if (!id) {
        this.media.set(undefined);
        this.hasError.set(true);
        this.isLoading.set(false);
        return;
      }

      // The catalogue is paginated and may contain only the first page. Fetch
      // the selected item by ID so detail links work on every catalogue page.
      this.mediaService.getMedia(id).subscribe({
        next: (media) => {
          this.media.set(media);
          this.hasError.set(!media);
          this.isLoading.set(false);
        },
        error: () => {
          this.hasError.set(true);
          this.isLoading.set(false);
        },
      });
    });
  }

  /** Fournit le synopsis traduit ou un message adapté si celui-ci manque. */
  readonly synopsis = computed(() => {
    const synopsis = this.translatedSynopsis().trim() || this.media()?.synopsis?.trim() || '';
    if (this.isMissingSynopsis(synopsis)) {
      return this.i18n.t(this.synopsisLookupLoading() ? 'synopsisLoading' : 'synopsisUnavailable');
    }
    return synopsis;
  });

  /** Traduit les genres d’un média pour l’affichage. */
  displayGenre(genre: string): string {
    if (genre === 'Non renseigné') return this.i18n.t('unavailable');
    return genre.split(',').map((part) => this.i18n.genre(part.trim())).join(', ');
  }

  /** Formate la note sur cinq ou renvoie le libellé « non noté ». */
  displayRating(media: Media): string {
    const rating = Number(media.rating);
    const scale = Number(media.ratingScale || 5);
    if (!Number.isFinite(rating) || !Number.isFinite(scale) || scale <= 0 || media.rating.startsWith('Non')) {
      return this.i18n.t('unrated');
    }
    return `${(rating / scale).toFixed(1)} / 5`;
  }

  /** Choisit le réalisateur ou le créateur à afficher pour le média. */
  personName(media: Media): string | undefined {
    const extra = this.mediaExtra();
    return media.type === 'Film' ? extra.director : extra.director || extra.creator;
  }

  /** Renvoie la photo associée au réalisateur ou au créateur. */
  personPhoto(media: Media): string | undefined {
    const extra = this.mediaExtra();
    if (media.type === 'Film' || extra.director) return extra.directorPhoto;
    return extra.creatorPhoto;
  }

  /** Renvoie le libellé du rôle affiché, selon les informations disponibles. */
  personLabel(media: Media): string {
    return media.type === 'Film' || this.mediaExtra().director
      ? this.i18n.t('director')
      : this.i18n.t('creator');
  }

  /** Construit une recherche YouTube de bande-annonce pour le média. */
  youtubeSearchUrl(media: Media, language: 'fr' | 'en'): string {
    const search = language === 'fr' ? 'bande annonce officielle' : 'official trailer';
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${media.title} ${search}`)}`;
  }

  /** Crée et mémorise une URL intégrable pour une vidéo YouTube. */
  youtubeEmbedUrl(key: string): SafeResourceUrl {
    const existing = this.safeTrailerUrls.get(key);
    if (existing) return existing;
    const url = this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent(key)}?rel=0`
    );
    this.safeTrailerUrls.set(key, url);
    return url;
  }

  /** Crée et mémorise une URL intégrable pour une playlist YouTube. */
  playlistEmbedUrl(playlistId: string): SafeResourceUrl {
    const existing = this.safePlaylistUrls.get(playlistId);
    if (existing) return existing;
    const url = this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(playlistId)}`
    );
    this.safePlaylistUrls.set(playlistId, url);
    return url;
  }

  /** Sélectionne la bande-annonce correspondant à la langue demandée. */
  trailerFor(language: 'fr' | 'en'): MediaTrailer | undefined {
    return this.trailers().find((trailer) => trailer.language === language);
  }

  /** Convertit une durée en millisecondes au format minutes:secondes. */
  formatTrackDuration(durationMs?: number): string {
    if (!Number.isFinite(durationMs) || durationMs === undefined) return '—';
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /** Lance l’aperçu audio d’un morceau ou arrête sa lecture en cours. */
  toggleTrackPreview(track: SpotifyTrack): void {
    const previewUrl = track.previewUrl;
    if (!previewUrl) return;

    if (this.soundtrackAudio && this.activeTrackUrl() === previewUrl) {
      this.soundtrackAudio.pause();
      this.soundtrackAudio = null;
      this.activeTrackUrl.set(null);
      return;
    }

    if (this.soundtrackAudio) {
      this.soundtrackAudio.pause();
      this.soundtrackAudio = null;
    }

    const audio = new Audio(previewUrl);
    audio.play().catch(() => undefined);
    this.soundtrackAudio = audio;
    this.activeTrackUrl.set(previewUrl);
  }

  /** Traduit un synopsis et ignore les réponses d’anciennes requêtes. */
  private async translateSynopsis(synopsis: string, language: Language): Promise<void> {
    const run = ++this.translationRun;
    if (!synopsis) return;
    try {
      const result = await firstValueFrom(this.translator.translate(synopsis, language));
      if (run === this.translationRun) this.translatedSynopsis.set(result.translation);
    } catch {
      // Keep the source synopsis visible if the public translation service is unavailable.
    }
  }

  /** Indique si un synopsis est vide ou contient un message d’indisponibilité. */
  private isMissingSynopsis(synopsis: string | undefined): boolean {
    return !synopsis?.trim() || /^(?:synopsis|sinopsis|plot|description)\s+(?:non disponible|not available|unavailable|no disponible)\.?$/i.test(synopsis.trim());
  }

  /** Recherche un synopsis de remplacement quand la fiche n’en fournit pas. */
  private findAlternateSynopsis(media: Media, language: Language): void {
    const lookupKey = `${media.id}:${language}`;
    if (this.synopsisLookupAttempted.has(lookupKey)) return;
    this.synopsisLookupAttempted.add(lookupKey);
    const run = ++this.synopsisLookupRun;
    this.synopsisLookupLoading.set(true);
    this.mediaService.getMediaSynopsis(media, language).subscribe({
      next: ({ synopsis }) => {
        if (run !== this.synopsisLookupRun) return;
        this.synopsisLookupLoading.set(false);
        const candidate = synopsis?.trim();
        if (!candidate || this.isMissingSynopsis(candidate)) return;
        this.media.update((current) => current?.id === media.id ? { ...current, synopsis: candidate } : current);
      },
      error: () => {
        if (run !== this.synopsisLookupRun) return;
        this.synopsisLookupLoading.set(false);
        // Keep the unavailable message if no public source can provide a synopsis.
      },
    });
  }

  /** Charge les informations complémentaires sur l’équipe et le pays du média. */
  private loadMediaExtra(media: Media, language: Language): void {
    const run = ++this.mediaExtraRun;
    this.mediaExtra.set({
      director: media.director,
      directorPhoto: media.directorPhoto,
      creator: media.creator,
      creatorPhoto: media.creatorPhoto,
      country: media.country,
      countryFlag: media.countryFlag,
    });
    this.mediaService.getMediaExtra(media, language).subscribe({
      next: (extra) => {
        if (run === this.mediaExtraRun) this.mediaExtra.set(extra);
      },
      error: () => {
        if (run === this.mediaExtraRun) this.mediaExtra.set({});
      },
    });
  }

  /** Recherche une biographie Wikipédia liée au réalisateur ou au créateur. */
  private loadWikipediaBiography(media: Media, language: Language): void {
    const run = ++this.wikipediaBiographyRun;
    this.wikipediaBiography.set(null);
    this.wikipediaBiographyLoading.set(true);
    this.mediaService.getMediaWikipediaBio(media, language).subscribe({
      next: (biography) => {
        if (run !== this.wikipediaBiographyRun) return;
        this.wikipediaBiography.set(biography);
        this.wikipediaBiographyLoading.set(false);
      },
      error: () => {
        if (run !== this.wikipediaBiographyRun) return;
        this.wikipediaBiographyLoading.set(false);
      },
    });
  }

  /** Charge les bandes-annonces disponibles et leur état de configuration. */
  private loadTrailers(media: Media): void {
    const run = ++this.trailerRun;
    this.trailers.set([]);
    this.trailersLoading.set(true);
    this.mediaService.getMediaTrailers(media).subscribe({
      next: (result) => {
        if (run !== this.trailerRun) return;
        this.trailersConfigured.set(result.configured);
        this.trailers.set(result.trailers);
        this.trailersLoading.set(false);
      },
      error: () => {
        if (run !== this.trailerRun) return;
        this.trailersConfigured.set(false);
        this.trailersLoading.set(false);
      },
    });
  }

  /** Charge les morceaux de la bande originale, avec une playlist en secours. */
  private loadSoundtrack(media: Media): void {
    const run = ++this.soundtrackRun;
    this.soundtrackTracks.set([]);
    this.soundtrackPlaylist.set(null);
    this.soundtrackLoading.set(true);

    this.mediaService.getMediaSoundtrack(media).subscribe({
      next: (tracks) => {
        if (run !== this.soundtrackRun) return;
        this.soundtrackTracks.set(tracks);
        if (tracks.length) {
          this.soundtrackLoading.set(false);
          return;
        }

        this.mediaService.getYouTubeSoundtrackPlaylist(media).subscribe({
          next: (playlist) => {
            if (run !== this.soundtrackRun) return;
            this.soundtrackPlaylist.set(playlist);
            this.soundtrackLoading.set(false);
          },
          error: () => {
            if (run !== this.soundtrackRun) return;
            this.soundtrackLoading.set(false);
          },
        });
      },
      error: () => {
        if (run !== this.soundtrackRun) return;
        this.soundtrackTracks.set([]);
        this.soundtrackLoading.set(false);
      },
    });
  }

}



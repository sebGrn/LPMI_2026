import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { from, map, Observable } from 'rxjs';
import { Media, MediaArtwork, MediaExtra, MediaSoundtrackPlaylist, MediaTrailer, MediaWikipediaBio, SourceMedia, SpotifyTrack } from '../shared/media';
import { Language } from './language.service';

export interface CataloguePageResponse {
  items: Media[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  genres: string[];
  years: string[];
  isBuilding: boolean;
  nextCursor?: number | null;
}

export interface CataloguePageRequest {
  page: number;
  query: string;
  type: string;
  genre: string;
  year: string;
  rating: string;
  cursor?: number;
}

type SpotifyApiArtist = { name?: string };
type SpotifyApiAlbum = { name?: string };
type SpotifyApiTrack = {
  name?: string;
  artists?: SpotifyApiArtist[];
  album?: SpotifyApiAlbum;
  duration_ms?: number;
  preview_url?: string | null;
  external_urls?: { spotify?: string };
};
type SpotifyApiPlaylistItem = { track?: SpotifyApiTrack | null };
type SpotifyApiPlaylist = { id?: string; name?: string; tracks?: { total?: number } };
type WikipediaApiPage = {
  title: string;
  extract?: string;
  categories?: { title: string }[];
  pageprops?: { ['wikibase-shortdesc']?: string; wikibase_item?: string };
};

@Injectable({
  providedIn: 'root',
})
export class MediaService {
  private readonly catalogueUrl = '/catalogue-data';
  private readonly featuredPostersUrl = '/featured-posters';
  private readonly spotifyClientId = '';
  private readonly spotifyClientSecret = '';

  /** Reçoit le client HTTP qui communique avec l’API du catalogue. */
  constructor(private readonly http: HttpClient) {}

  /** Récupère la liste complète des médias et harmonise leur format. */
  getMedias(): Observable<Media[]> {
    return this.http.get<SourceMedia[]>(this.catalogueUrl).pipe(map((medias) => medias.map(toMedia)));
  }

  /** Récupère une page du catalogue avec ses filtres et son curseur éventuel. */
  getCataloguePage(request: CataloguePageRequest): Observable<CataloguePageResponse> {
    const type = request.type === 'Film' ? 'film' : request.type === 'Série' ? 'series' : 'all';
    let params = new HttpParams()
      .set('page', String(request.page))
      .set('q', request.query)
      .set('type', type)
      .set('genre', request.genre)
      .set('year', request.year)
      .set('rating', request.rating);
    if (request.cursor !== undefined) params = params.set('cursor', String(request.cursor));
    return this.http.get<Omit<CataloguePageResponse, 'items'> & { items: SourceMedia[] }>(this.catalogueUrl, { params }).pipe(
      map((result) => ({ ...result, items: result.items.map(toMedia) }))
    );
  }

  /** Indique si la préparation du catalogue est en cours ou terminée. */
  getCatalogueBuildStatus(): Observable<{ building: boolean; ready: boolean }> {
    return this.http.get<{ building: boolean; ready: boolean }>('/catalogue-status');
  }

  /** Demande des affiches et des notes complémentaires pour plusieurs médias. */
  getMediaArtwork(medias: Media[]): Observable<MediaArtwork[]> {
    return this.http.post<MediaArtwork[]>('/catalogue-wikipedia-artwork', {
      medias: medias.map((media) => ({
        id: media.id,
        title: media.title,
        type: media.type,
        hasPoster: Boolean(media.posterUrl),
        hasRating: Number.isFinite(Number(media.rating)) && Boolean(media.ratingScale),
      })),
    });
  }

  /** Récupère les médias choisis pour les affiches mises en avant. */
  getFeaturedMedias(): Observable<Media[]> {
    return this.http.get<SourceMedia[]>(this.featuredPostersUrl).pipe(map((medias) => medias.map(toMedia)));
  }

  /** Recherche des médias par texte dans le catalogue. */
  searchMedias(query: string): Observable<Media[]> {
    const params = new HttpParams().set('q', query);
    return this.http
      .get<SourceMedia[]>(this.catalogueUrl, { params })
      .pipe(map((medias) => medias.map(toMedia)));
  }

  /** Récupère une fiche précise à partir de son identifiant. */
  getMedia(id: string): Observable<Media | undefined> {
    return this.http.get<SourceMedia>(`/catalogue-item/${encodeURIComponent(id)}`).pipe(map(toMedia));
  }

  /** Demande les informations complémentaires d’un média dans une langue. */
  getMediaExtra(media: Media, language: Language): Observable<MediaExtra> {
    return this.http.post<MediaExtra>('/media-extra', {
      id: media.id,
      title: media.title,
      type: media.type,
      language,
    });
  }

  /** Recherche un synopsis pour le média dans la langue demandée. */
  getMediaSynopsis(media: Media, language: Language): Observable<{ synopsis?: string }> {
    return this.http.post<{ synopsis?: string }>('/media-synopsis', {
      id: media.id,
      title: media.title,
      type: media.type,
      language,
    });
  }

  /** Recherche une biographie associée au média sur Wikipédia. */
  getMediaWikipediaBio(media: Media, language: Language): Observable<MediaWikipediaBio | null> {
    return from(this.fetchWikipediaBiography(media, language));
  }

  /** Récupère les bandes-annonces disponibles pour le média. */
  getMediaTrailers(media: Media): Observable<{ configured: boolean; trailers: MediaTrailer[] }> {
    return this.http.post<{ configured: boolean; trailers: MediaTrailer[] }>('/media-trailers', {
      title: media.title,
      type: media.type,
      year: media.releaseYear,
    });
  }

  /** Recherche des morceaux de la bande originale sur Spotify. */
  getMediaSoundtrack(media: Media): Observable<SpotifyTrack[]> {
    return from(this.fetchSpotifyTracks(media));
  }

  /** Recherche une playlist YouTube de bande originale pour le média. */
  getYouTubeSoundtrackPlaylist(media: Media): Observable<MediaSoundtrackPlaylist | null> {
    return this.http.post<{ configured: boolean; playlist?: MediaSoundtrackPlaylist | null }>(
      '/media-soundtrack-playlist',
      { title: media.title, type: media.type }
    ).pipe(map((result) => result.playlist ?? null));
  }

  /** Cherche une page Wikipédia correspondant au titre et au type du média. */
  private async fetchWikipediaBiography(media: Media, language: Language): Promise<MediaWikipediaBio | null> {
    const languages = [...new Set([language, 'fr', 'en'])];
    const normalizedTitle = normalizeWikipediaTitle(media.title);

    for (const candidateLanguage of languages) {
      const params = new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrsearch: `intitle:${media.title}`,
        gsrnamespace: '0',
        gsrlimit: '8',
        prop: 'extracts|categories|pageprops',
        exintro: '1',
        explaintext: '1',
        cllimit: 'max',
        format: 'json',
        origin: '*',
      });

      try {
        const response = await fetch(`https://${candidateLanguage}.wikipedia.org/w/api.php?${params}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) continue;

        const data = await response.json();
        const pages = Object.values(data?.query?.pages ?? {}) as WikipediaApiPage[];
        const matchingPages = pages.filter((page) => {
          const extract = page.extract?.trim() ?? '';
          if (extract.length < 120 || /may refer to|peut faire référence à|puede referirse a/i.test(extract.slice(0, 250))) return false;
          const typeText = normalizeWikipediaTitle(`${page.pageprops?.['wikibase-shortdesc'] ?? ''} ${page.categories?.map((category) => category.title).join(' ') ?? ''}`);
          const pageTitle = normalizeWikipediaTitle(page.title.replace(/\s*\([^)]*\)$/, ''));
          if (!pageTitle || !(pageTitle === normalizedTitle || pageTitle.startsWith(normalizedTitle))) return false;
          return media.type === 'Film'
            ? /\b(film|movie|cinema|pelicula|cine)\b/.test(typeText)
            : /\b(series?|serie|television|tv show|tv series)\b/.test(typeText);
        });
        matchingPages.sort((first, second) => {
          const firstTitle = normalizeWikipediaTitle(first.title.replace(/\s*\([^)]*\)$/, ''));
          const secondTitle = normalizeWikipediaTitle(second.title.replace(/\s*\([^)]*\)$/, ''));
          return Number(firstTitle !== normalizedTitle) - Number(secondTitle !== normalizedTitle);
        });

        const page = matchingPages[0];
        const extract = page?.extract?.trim();
        if (page && extract) {
          return {
            title: page.title,
            extract,
            url: `https://${candidateLanguage}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
          };
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /** Cherche une playlist ou des morceaux Spotify liés au média. */
  private async fetchSpotifyTracks(media: Media): Promise<SpotifyTrack[]> {
    const clientId = this.spotifyClientId.trim();
    const clientSecret = this.spotifyClientSecret.trim();
    if (!clientId || !clientSecret) {
      return [];
    }

    try {
      const token = await this.getSpotifyToken(clientId, clientSecret);
      if (!token) return [];

      const playlistQuery = `${media.title} ${media.type === 'Film' ? 'film soundtrack' : 'series soundtrack'}`;
      const playlistResponse = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(playlistQuery)}&type=playlist&limit=5`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (playlistResponse.ok) {
        const playlistData = await playlistResponse.json();
        const playlist = playlistData?.playlists?.items?.find((item: SpotifyApiPlaylist) => {
          const name = (item?.name ?? '').toLowerCase();
          return name.includes(media.title.toLowerCase()) || name.includes('soundtrack') || name.includes('ost');
        }) ?? playlistData?.playlists?.items?.[0];

        if (playlist?.id) {
          const playlistTracksResponse = await fetch(
            `https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=50`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (playlistTracksResponse.ok) {
            const playlistTracksData = await playlistTracksResponse.json();
            const tracks = (playlistTracksData?.items ?? [])
              .map((item: SpotifyApiPlaylistItem) => item.track)
              .filter((track: SpotifyApiTrack | null | undefined): track is SpotifyApiTrack => !!track)
              .map((track: SpotifyApiTrack, index: number) => ({
                title: track.name ?? 'Track',
                artist: track.artists?.map((artist) => artist.name).join(', ') ?? 'Artiste inconnu',
                album: track.album?.name,
                durationMs: track.duration_ms,
                previewUrl: track.preview_url ?? undefined,
                externalUrl: track.external_urls?.spotify,
                position: index + 1,
              }));

            if (tracks.length) return tracks;
          }
        }
      }

      const searchResponse = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(`${media.title} ${media.type === 'Film' ? 'movie' : 'series'} soundtrack`)}&type=track&limit=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!searchResponse.ok) return [];

      const searchData = await searchResponse.json();
      const tracks = (searchData?.tracks?.items ?? [])
        .map((track: SpotifyApiTrack) => ({
          title: track.name ?? 'Track',
          artist: track.artists?.map((artist) => artist.name).join(', ') ?? 'Artiste inconnu',
          album: track.album?.name,
          durationMs: track.duration_ms,
          previewUrl: track.preview_url ?? undefined,
          externalUrl: track.external_urls?.spotify,
        }))
        .sort((first: SpotifyTrack, second: SpotifyTrack) => first.title.localeCompare(second.title, 'fr'));

      return tracks.map((track: SpotifyTrack, index: number) => ({ ...track, position: index + 1 }));
    } catch {
      return [];
    }
  }

  /** Obtient un jeton temporaire pour interroger l’API Spotify. */
  private async getSpotifyToken(clientId: string, clientSecret: string): Promise<string | null> {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.access_token ?? null;
  }

}

/** Normalise un titre pour comparer les noms de pages Wikipédia. */
function normalizeWikipediaTitle(title: string): string {
  return title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Convertit une réponse de l’API vers le format utilisé par l’interface. */
function toMedia(media: SourceMedia): Media {
  return {
    ...media,
    posterUrl: media.poster,
    ratingScale: media.ratingScale ? Number(media.ratingScale) : undefined,
  };
}

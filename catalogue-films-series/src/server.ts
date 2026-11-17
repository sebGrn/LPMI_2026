import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { load } from 'cheerio';
import express from 'express';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import type { DatabaseSync as SqliteDatabase } from 'node:sqlite';

type SupportedLanguage = 'fr' | 'en' | 'es' | 'zh' | 'hi' | 'ar' | 'bn' | 'pt' | 'id' | 'ur' | 'ru' | 'de' | 'it' | 'pl' | 'uk';
const supportedLanguages: readonly SupportedLanguage[] = ['fr', 'en', 'es', 'zh', 'hi', 'ar', 'bn', 'pt', 'id', 'ur', 'ru', 'de', 'it', 'pl', 'uk'];

/** Vérifie qu’une valeur correspond à l’une des langues gérées par le serveur. */
function isSupportedLanguage(language: unknown): language is SupportedLanguage {
  return typeof language === 'string' && supportedLanguages.includes(language as SupportedLanguage);
}

for (const key of ['TMDB_API_READ_ACCESS_TOKEN', 'TMDB_API_KEY', 'YOUTUBE_API_KEY']) {
  if (!process.env[key]?.trim()) delete process.env[key];
}

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
app.use(express.json({ limit: '64kb' }));
const angularApp = new AngularNodeAppEngine();
const require = createRequire(import.meta.url);
let imdbDatabase: SqliteDatabase | undefined;

/** Ouvre l’index IMDb local une seule fois et le renvoie s’il existe. */
function getImdbDatabase(): SqliteDatabase | undefined {
  if (imdbDatabase) return imdbDatabase;
  const databasePath = join(process.cwd(), 'data', 'imdb', 'catalogue.sqlite');
  if (!existsSync(databasePath)) return undefined;
  try {
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    imdbDatabase = new DatabaseSync(databasePath, { readOnly: true });
    return imdbDatabase;
  } catch (error) {
    console.error('Unable to open the local IMDb index:', error);
    return undefined;
  }
}

interface CatalogueMedia {
  id: string;
  title: string;
  poster: string;
  type: string;
  featured: boolean;
  genre: string;
  releaseYear: string;
  rating: string;
  ratingScale: string;
  ratingSource?: string;
  synopsis: string;
  officialUrl: string;
  wikidataId?: string;
  director?: string;
  directorPhoto?: string;
  creator?: string;
  creatorPhoto?: string;
  country?: string;
  countryFlag?: string;
}

interface TvMazeShow {
  id: number;
  name: string;
  type: string;
  genres: string[];
  premiered: string | null;
  rating: { average: number | null };
  image: { original: string; medium: string } | null;
  summary: string | null;
  url: string;
  officialSite: string | null;
  network?: { country?: { name?: string; code?: string | null } | null } | null;
  webChannel?: { country?: { name?: string; code?: string | null } | null } | null;
}

interface TvMazeCrewMember {
  type: string;
  person: {
    name: string;
    image: { original?: string; medium?: string } | null;
  };
}

interface TmdbMediaResult {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
}

interface TmdbPersonCredit {
  name?: string;
  profile_path?: string | null;
  job?: string;
  jobs?: { job: string }[];
}

interface TmdbMediaDetails {
  production_countries?: { iso_3166_1?: string; name?: string }[];
  created_by?: TmdbPersonCredit[];
  credits?: { crew?: TmdbPersonCredit[] };
  aggregate_credits?: { crew?: TmdbPersonCredit[] };
}

interface TmdbListResponse {
  results?: TmdbMediaResult[];
}

interface TmdbGenreResponse {
  genres?: { id: number; name: string }[];
}

interface WikiPage {
  pageid: number;
  title: string;
  extract?: string;
  thumbnail?: { source: string };
  categories?: { title: string }[];
  pageprops?: { ['wikibase-shortdesc']?: string; page_image?: string; wikibase_item?: string };
}

interface WikiSearchResponse {
  query?: { pages?: Record<string, WikiPage> };
}

interface WikiLinksResponse {
  query?: { pages?: Record<string, WikiPage & { links?: { ns: number; title: string }[] }> };
}

interface WikiRevisionResponse {
  query?: {
    pages?: Record<string, {
      title: string;
      revisions?: { slots?: { main?: { content?: string; ['*']?: string } } }[];
    }>;
  };
}

interface WikidataSearchResult {
  id: string;
  label: string;
  description?: string;
}

interface WikidataEntity {
  labels?: Record<string, { value: string }>;
  aliases?: Record<string, { value: string }[]>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, WikidataClaim[]>;
  sitelinks?: Record<string, { title: string }>;
}

interface WikidataClaim {
  rank?: string;
  mainsnak?: { datavalue?: { value?: unknown } };
  qualifiers?: Record<string, { datavalue?: { value?: unknown } }[]>;
}

interface WikidataResponse {
  search?: WikidataSearchResult[];
  entities?: Record<string, WikidataEntity>;
}

const searchCache = new Map<string, { expiresAt: number; medias: CatalogueMedia[] }>();
let defaultCatalogueBuild: Promise<CatalogueMedia[]> | undefined;
let defaultCataloguePreview: Promise<CatalogueMedia[]> | undefined;
let featuredPostersCache: { expiresAt: number; medias: CatalogueMedia[] } | undefined;
let featuredPostersRequest: Promise<CatalogueMedia[]> | undefined;
const synopsisTranslationCache = new Map<string, string>();
const mediaExtraCache = new Map<string, { expiresAt: number; extra: WikidataFilmMetadata }>();
const mediaSynopsisCache = new Map<string, { expiresAt: number; synopsis?: string }>();
const mediaTrailersCache = new Map<string, { expiresAt: number; trailers: MediaTrailer[] }>();
const mediaSoundtrackPlaylistCache = new Map<string, { expiresAt: number; playlist: MediaSoundtrackPlaylist | null }>();
const geminiRateLimits = new Map<string, { count: number; resetAt: number }>();

interface MediaTrailer {
  key: string;
  language: 'fr' | 'en';
  title: string;
}

interface MediaSoundtrackPlaylist {
  id: string;
  title: string;
  channelTitle?: string;
}

interface YouTubeSearchItem {
  id?: { videoId?: string; playlistId?: string };
  snippet?: { title?: string; description?: string; channelTitle?: string };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
}

/** Recherche une bande-annonce YouTube officielle pour un titre et une année. */
async function searchYouTubeTrailer(
  title: string,
  year: string,
  language: 'fr' | 'en',
  apiKey: string,
): Promise<MediaTrailer | undefined> {
  const query = language === 'fr' ? 'bande annonce officielle' : 'official trailer';
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '10',
    relevanceLanguage: language,
    regionCode: language === 'fr' ? 'FR' : 'US',
    q: `${title} ${year} ${query}`.trim(),
    key: apiKey,
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
    signal: AbortSignal.timeout(12000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`YouTube Data API responded with ${response.status}`);
  const data = await response.json() as YouTubeSearchResponse;
  const item = (data.items ?? []).find((result) => /^[\w-]{11}$/.test(result.id?.videoId ?? ''));
  const videoId = item?.id?.videoId;
  if (!item || !videoId) return undefined;
  return { key: videoId, language, title: item.snippet?.title || title };
}

/** Cherche les bandes-annonces YouTube en français et en anglais. */
async function findYouTubeTrailers(title: string, year: string): Promise<MediaTrailer[]> {
  const apiKey = process.env['YOUTUBE_API_KEY']?.trim() || process.env['TMDB_API_KEY']?.trim();
  if (!apiKey) throw new Error('YouTube API key is not configured');
  const results = await Promise.all([
    searchYouTubeTrailer(title, year, 'fr', apiKey),
    searchYouTubeTrailer(title, year, 'en', apiKey),
  ]);
  return results.filter((trailer): trailer is MediaTrailer => Boolean(trailer));
}

/** Recherche une playlist YouTube de bande originale pour un titre. */
async function findYouTubeSoundtrackPlaylist(title: string, type: string, apiKey: string): Promise<MediaSoundtrackPlaylist | null> {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'playlist',
    maxResults: '5',
    q: `${title} ${type === 'Film' ? 'film' : 'series'} original soundtrack`,
    key: apiKey,
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
    signal: AbortSignal.timeout(12000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`YouTube Data API responded with ${response.status}`);

  const data = await response.json() as YouTubeSearchResponse;
  const items = data.items ?? [];
  const titleMatch = title.toLocaleLowerCase();
  const playlist = items.find((item) => {
    const playlistTitle = item.snippet?.title?.toLocaleLowerCase() ?? '';
    return playlistTitle.includes(titleMatch) && /soundtrack|original score|ost/i.test(playlistTitle);
  }) ?? items.find((item) => (item.snippet?.title?.toLocaleLowerCase() ?? '').includes(titleMatch));
  const id = playlist?.id?.playlistId;
  if (!playlist || !id || !playlist.snippet?.title) return null;

  return { id, title: playlist.snippet.title, channelTitle: playlist.snippet.channelTitle };
}

/** Traduit un synopsis en le découpant si le service limite la longueur. */
async function translateSynopsis(text: string, target: SupportedLanguage): Promise<string> {
  const cacheKey = `${target}:${text}`;
  const cached = synopsisTranslationCache.get(cacheKey);
  if (cached) return cached;

  const chunks = text.match(/[\s\S]{1,450}/g) ?? [text];
  const translatedChunks: string[] = [];
  for (const chunk of chunks) {
    const targetCode = target === 'zh' ? 'zh-CN' : target;
    const params = new URLSearchParams({ q: chunk, langpair: `autodetect|${targetCode}` });
    const response = await fetch(`https://api.mymemory.translated.net/get?${params}`, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
    });
    if (!response.ok) throw new Error(`MyMemory responded with ${response.status}`);
    const result = await response.json() as {
      responseStatus?: number;
      responseData?: { translatedText?: string };
    };
    const translated = result.responseData?.translatedText;
    if (result.responseStatus !== 200 || !translated) throw new Error('MyMemory returned no translation');
    translatedChunks.push(load(translated).text());
  }

  const translatedText = translatedChunks.join('');
  synopsisTranslationCache.set(cacheKey, translatedText);
  return translatedText;
}
/** Normalise un titre pour faciliter les recherches et comparaisons. */
function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Exécute une fonction asynchrone sur une liste avec un nombre limité de tâches. */
async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

/** Construit une clé stable pour dédupliquer un média du catalogue. */
function catalogueMediaKey(media: CatalogueMedia): string {
  const title = media.title.replace(/\s+\([^)]*\b(?:film|movie|tv series|television series|web series)\b[^)]*\)$/i, '');
  return `${normalizeTitle(media.type)}:${normalizeTitle(title)}`;
}

/** Interroge Wikipédia avec une limite de temps et quelques tentatives. */
async function fetchWikipedia(url: string | URL, timeoutMs = 15000): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
    });
    if (response.status !== 429 || attempt === 2) return response;
    const retryAfter = Number(response.headers.get('Retry-After'));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 2000)
      : (attempt + 1) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Wikipedia request retries were exhausted.');
}

/** Vérifie si un titre normalisé correspond à la requête. */
function titleMatches(title: string, query: string): boolean {
  return normalizeTitle(title).includes(normalizeTitle(query));
}

/** Attribue un score de correspondance à un titre pour classer les résultats. */
function titleRank(title: string, query: string): number {
  const normalizedTitle = normalizeTitle(title);
  const normalizedQuery = normalizeTitle(query);
  if (normalizedTitle === normalizedQuery) return 0;
  if (normalizedTitle.startsWith(normalizedQuery)) return 1;
  return 2;
}

/** Extrait les valeurs d’une propriété depuis une entité Wikidata. */
function getWikidataValues(entity: WikidataEntity, property: string): unknown[] {
  return (entity.claims?.[property] ?? [])
    .map((claim) => claim.mainsnak?.datavalue?.value)
    .filter((value) => value !== undefined);
}

interface WikidataFilmMetadata {
  genres: string[];
  poster?: string;
  awards?: { name: string; type: 'received' | 'nomination'; year?: string }[];
  rating?: string;
  ratingSource?: string;
  director?: string;
  directorPhoto?: string;
  creator?: string;
  creatorPhoto?: string;
  country?: string;
  countryFlag?: string;
}

/** Convertit une note de critique en texte exploitable par le catalogue. */
function parseReviewRating(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const text = value.replace(/,/g, '.');
  const ratio = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  const percentage = text.match(/(\d+(?:\.\d+)?)\s*%/);
  const score = ratio
    ? Number(ratio[1]) / Number(ratio[2]) * 10
    : percentage
      ? Number(percentage[1]) / 10
      : NaN;

  return Number.isFinite(score) && score >= 0 && score <= 10 ? score.toFixed(1) : undefined;
}

/** Lit et normalise une note connue sur l’entité Wikidata. */
function getWikidataRating(entity: WikidataEntity): { rating: string; sourceId?: string } | undefined {
  const scores = (entity.claims?.['P444'] ?? []).filter((claim) => claim.rank !== 'deprecated');
  const fromImdb = scores.filter((claim) =>
    claim.qualifiers?.['P447']?.some((qualifier) =>
      (qualifier.datavalue?.value as { id?: string } | undefined)?.id === 'Q37312'
    )
  );
  const candidates = fromImdb.length ? fromImdb : scores;

  for (const claim of candidates) {
    const rating = parseReviewRating(claim.mainsnak?.datavalue?.value);
    if (!rating) continue;
    const sourceId = (claim.qualifiers?.['P447']?.[0]?.datavalue?.value as { id?: string } | undefined)?.id;
    return { rating, sourceId };
  }

  return undefined;
}

/** Récupère en lot les informations Wikidata des films demandés. */
async function getWikidataFilmMetadata(itemIds: string[], preferredLanguage: SupportedLanguage = 'fr'): Promise<Map<string, WikidataFilmMetadata>> {
  const uniqueIds = [...new Set(itemIds.filter((id) => /^Q\d+$/.test(id)))];
  const entities = new Map<string, WikidataEntity>();

  for (let index = 0; index < uniqueIds.length; index += 50) {
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: uniqueIds.slice(index, index + 50).join('|'),
      props: 'claims',
      format: 'json',
    });
    try {
      const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
      });
      if (!response.ok) continue;
      const data = await response.json() as WikidataResponse;
      for (const [id, entity] of Object.entries(data.entities ?? {})) entities.set(id, entity);
    } catch (error) {
      console.warn('Wikidata metadata request failed:', error);
    }
  }

  const relationshipIds = new Set([...entities.values()].flatMap((entity) => [
    ...getWikidataValues(entity, 'P57').map((value) => (value as { id?: string })?.id),
    ...getWikidataValues(entity, 'P170').map((value) => (value as { id?: string })?.id),
    ...getWikidataValues(entity, 'P495').map((value) => (value as { id?: string })?.id),
  ]).filter((id): id is string => Boolean(id)));
  const labelIds = [...new Set([...relationshipIds, ...[...entities.values()].flatMap((entity) => [
    ...getWikidataValues(entity, 'P136').map((value) => (value as { id?: string })?.id),
    ...getWikidataValues(entity, 'P31').map((value) => (value as { id?: string })?.id),
    ...getWikidataValues(entity, 'P166').map((value) => (value as { id?: string })?.id),
    ...getWikidataValues(entity, 'P1411').map((value) => (value as { id?: string })?.id),
    ...(entity.claims?.['P444'] ?? []).flatMap((claim) =>
      claim.qualifiers?.['P447']?.map((qualifier) =>
        (qualifier.datavalue?.value as { id?: string } | undefined)?.id
      ) ?? []
    ),
  ])].filter((id): id is string => Boolean(id)))];
  const labels = new Map<string, string>();
  const relatedEntities = new Map<string, WikidataEntity>();

  for (let index = 0; index < labelIds.length; index += 50) {
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: labelIds.slice(index, index + 50).join('|'),
      props: 'labels|claims',
      languages: `${preferredLanguage}|fr|en|es`,
      format: 'json',
    });
    try {
      const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
      });
      if (!response.ok) continue;
      const data = await response.json() as WikidataResponse;
      for (const [id, entity] of Object.entries(data.entities ?? {})) {
        if (relationshipIds.has(id)) relatedEntities.set(id, entity);
        const label = entity.labels?.[preferredLanguage]?.value
          || entity.labels?.['fr']?.value
          || entity.labels?.['en']?.value
          || entity.labels?.['es']?.value;
        if (label) labels.set(id, label);
      }
    } catch (error) {
      console.warn('Wikidata label request failed:', error);
    }
  }

  const metadata = new Map<string, WikidataFilmMetadata>();
  for (const [id, entity] of entities) {
    const explicitGenres = getWikidataValues(entity, 'P136')
      .map((value) => (value as { id?: string })?.id)
      .map((genreId) => genreId ? labels.get(genreId) : undefined)
      .filter((genre): genre is string => Boolean(genre))
      .map(translateGenre);
    const instanceLabels = getWikidataValues(entity, 'P31')
      .map((value) => (value as { id?: string })?.id)
      .map((instanceId) => instanceId ? labels.get(instanceId) : undefined)
      .filter((label): label is string => Boolean(label));
    const genres = [...new Set([...explicitGenres, ...inferGenresFromLabels(instanceLabels)])];
    const awards = (['P166', 'P1411'] as const).flatMap((property) =>
      (entity.claims?.[property] ?? [])
        .filter((claim) => claim.rank !== 'deprecated')
        .flatMap((claim) => {
          const awardId = (claim.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id;
          const name = awardId ? labels.get(awardId) : undefined;
          if (!name) return [];

          const pointInTime = claim.qualifiers?.['P585']?.[0]?.datavalue?.value as { time?: string } | undefined;
          const year = pointInTime?.time?.match(/[+-](\d{4})-/)?.[1];
          return [{ name, type: property === 'P166' ? 'received' as const : 'nomination' as const, year }];
        })
    );
    const rating = getWikidataRating(entity);
    const directorId = (getWikidataValues(entity, 'P57')[0] as { id?: string } | undefined)?.id;
    const creatorId = (getWikidataValues(entity, 'P170')[0] as { id?: string } | undefined)?.id;
    const countryId = (getWikidataValues(entity, 'P495')[0] as { id?: string } | undefined)?.id;
    const posterImage = getWikidataValues(entity, 'P18')[0];
    const directorImage = directorId
      ? getWikidataValues(relatedEntities.get(directorId) ?? {}, 'P18')[0]
      : undefined;
    const creatorImage = creatorId
      ? getWikidataValues(relatedEntities.get(creatorId) ?? {}, 'P18')[0]
      : undefined;
    const flagImage = countryId
      ? getWikidataValues(relatedEntities.get(countryId) ?? {}, 'P41')[0]
      : undefined;
    const commonsImageUrl = (file: unknown, width: number) => typeof file === 'string'
      ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`
      : undefined;
    metadata.set(id, {
      genres,
      poster: commonsImageUrl(posterImage, 500),
      awards: [...new Map(awards.map((award) => [`${award.type}:${award.name}:${award.year ?? ''}`, award])).values()],
      rating: rating?.rating,
      ratingSource: rating?.sourceId === 'Q37312'
        ? 'IMDb (Wikidata)'
        : rating?.sourceId && labels.has(rating.sourceId)
          ? `${labels.get(rating.sourceId)} (Wikidata)`
          : 'Wikidata',
      director: directorId ? labels.get(directorId) : undefined,
      directorPhoto: commonsImageUrl(directorImage, 240),
      creator: creatorId ? labels.get(creatorId) : undefined,
      creatorPhoto: commonsImageUrl(creatorImage, 240),
      country: countryId ? labels.get(countryId) : undefined,
      countryFlag: commonsImageUrl(flagImage, 100),
    });
  }

  return metadata;
}

/** Recherche l’identifiant Wikidata correspondant au titre et au type du média. */
async function findWikidataMediaId(title: string, type: 'Film' | 'Série', language: SupportedLanguage): Promise<string | undefined> {
  for (const searchLanguage of [...new Set([language, 'en' as const, 'fr' as const])]) {
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      search: title,
      language: searchLanguage,
      uselang: searchLanguage,
      type: 'item',
      limit: '10',
      format: 'json',
    });
    const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
    });
    if (!response.ok) continue;
    const data = await response.json() as WikidataResponse;
    const exactMatches = (data.search ?? []).filter((item) => normalizeTitle(item.label) === normalizeTitle(title));
    const typeHint = type === 'Film'
      ? /film|movie|cinema/i
      : /tv series|television series|television program|tv show|s.rie|s.rie t.l.vis.e/i;
    const typedMatch = exactMatches.find((item) => typeHint.test(item.description ?? ''));
    const match = typedMatch ?? exactMatches[0];
    if (match) return match.id;
  }
  return undefined;
}

/** Assemble les informations détaillées d’un média depuis les sources disponibles. */
async function getMediaExtra(id: string, title: string, type: 'Film' | 'Série', language: SupportedLanguage): Promise<WikidataFilmMetadata> {
  let itemId = id.match(/^wikidata-(Q\d+)$/)?.[1];
  const pageId = id.match(/^film-(\d+)$/)?.[1];
  if (!itemId && pageId) {
    const params = new URLSearchParams({
      action: 'query',
      pageids: pageId,
      prop: 'pageprops',
      format: 'json',
    });
    const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
    });
    if (response.ok) {
      const data = await response.json() as WikiSearchResponse;
      itemId = Object.values(data.query?.pages ?? {})[0]?.pageprops?.wikibase_item;
    }
  }
  itemId ??= await findWikidataMediaId(title, type, language);
  if (!itemId) return { genres: [] };
  return (await getWikidataFilmMetadata([itemId], language)).get(itemId) ?? { genres: [] };
}

/** Récupère les détails d’un film ou d’une série depuis TMDb. */
async function getTmdbMediaExtra(id: string, title: string, type: 'Film' | 'Série'): Promise<Partial<WikidataFilmMetadata>> {
  if (!hasTmdbCredentials()) return {};

  const kind = type === 'Film' ? 'movie' : 'tv';
  let tmdbId = id.match(/^tmdb-(?:movie|series)-(\d+)$/)?.[1];
  if (!tmdbId) {
    const searchPath = kind === 'movie' ? 'search/movie' : 'search/tv';
    const search = await fetchTmdb<TmdbListResponse>(searchPath, new URLSearchParams({
      query: title,
      language: 'fr-FR',
      include_adult: 'false',
      page: '1',
    }), 7000);
    const match = (search.results ?? []).find((item) => {
      const resultTitle = kind === 'movie' ? item.title : item.name;
      return resultTitle && normalizeTitle(resultTitle) === normalizeTitle(title);
    });
    if (!match) return {};
    tmdbId = String(match.id);
  }

  const creditsKey = kind === 'movie' ? 'credits' : 'aggregate_credits';
  const details = await fetchTmdb<TmdbMediaDetails>(`${kind}/${tmdbId}`, new URLSearchParams({
    language: 'fr-FR',
    append_to_response: creditsKey,
  }), 7000);
  const crew = kind === 'movie' ? details.credits?.crew ?? [] : details.aggregate_credits?.crew ?? [];
  const director = crew.find((person) => kind === 'movie'
    ? person.job === 'Director'
    : person.jobs?.some((job) => job.job === 'Director'));
  const creator = kind === 'tv' ? details.created_by?.[0] : undefined;
  const countries = details.production_countries ?? [];
  const country = countries.map((entry) => entry.name).filter((name): name is string => Boolean(name));
  const countryCode = countries.find((entry) => entry.iso_3166_1)?.iso_3166_1?.toLowerCase();
  const personPhoto = (path?: string | null) => path ? `https://image.tmdb.org/t/p/w185${path}` : undefined;

  return {
    director: director?.name,
    directorPhoto: personPhoto(director?.profile_path),
    creator: creator?.name,
    creatorPhoto: personPhoto(creator?.profile_path),
    country: country.length ? [...new Set(country)].join(', ') : undefined,
    countryFlag: countryCode ? `https://flagcdn.com/w80/${countryCode}.png` : undefined,
  };
}

/** Récupère les détails d’une série depuis TVmaze. */
async function getTvMazeMediaExtra(id: string, title: string): Promise<Partial<WikidataFilmMetadata>> {
  let showId = id.match(/^series-(\d+)$/)?.[1];
  if (!showId) {
    const searchResponse = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(title)}`, {
      signal: AbortSignal.timeout(7000),
    });
    if (!searchResponse.ok) return {};
    const results = await searchResponse.json() as { show: TvMazeShow }[];
    const exactMatch = results.find(({ show }) => normalizeTitle(show.name) === normalizeTitle(title));
    if (!exactMatch) return {};
    showId = String(exactMatch.show.id);
  }

  const [showResult, crewResult] = await Promise.allSettled([
    fetch(`https://api.tvmaze.com/shows/${showId}`, { signal: AbortSignal.timeout(7000) })
      .then(async (response) => response.ok ? await response.json() as TvMazeShow : undefined),
    fetch(`https://api.tvmaze.com/shows/${showId}/crew`, { signal: AbortSignal.timeout(7000) })
      .then(async (response) => response.ok ? await response.json() as TvMazeCrewMember[] : []),
  ]);
  const show = showResult.status === 'fulfilled' ? showResult.value : undefined;
  const crew = crewResult.status === 'fulfilled' ? crewResult.value : [];
  const director = crew.find((member) => normalizeTitle(member.type) === 'director');
  const creator = crew.find((member) => ['creator', 'showrunner'].includes(normalizeTitle(member.type)));
  const country = show?.network?.country ?? show?.webChannel?.country;
  const photo = (member?: TvMazeCrewMember) => member?.person.image?.original || member?.person.image?.medium;

  return {
    director: director?.person.name,
    directorPhoto: photo(director),
    creator: creator?.person.name,
    creatorPhoto: photo(creator),
    country: country?.name,
    countryFlag: country?.code ? `https://flagcdn.com/w80/${country.code.toLowerCase()}.png` : undefined,
  };
}

/** Complète les détails d’un média en combinant plusieurs sources externes. */
async function getCompleteMediaExtra(id: string, title: string, type: 'Film' | 'Série', language: SupportedLanguage): Promise<WikidataFilmMetadata> {
  const tvMazeDetails: Promise<Partial<WikidataFilmMetadata>> = type === 'Film'
    ? Promise.resolve({})
    : getTvMazeMediaExtra(id, title);
  const [wikidataResult, tmdbResult, tvMazeResult] = await Promise.allSettled([
    getMediaExtra(id, title, type, language),
    getTmdbMediaExtra(id, title, type),
    tvMazeDetails,
  ]);
  const wikidata = wikidataResult.status === 'fulfilled' ? wikidataResult.value : { genres: [] };
  const tmdb = tmdbResult.status === 'fulfilled' ? tmdbResult.value : {};
  const tvMaze = tvMazeResult.status === 'fulfilled' ? tvMazeResult.value : {};

  return {
    ...wikidata,
    director: tmdb.director || wikidata.director || tvMaze.director,
    directorPhoto: tmdb.directorPhoto || wikidata.directorPhoto || tvMaze.directorPhoto,
    creator: tmdb.creator || wikidata.creator || tvMaze.creator,
    creatorPhoto: tmdb.creatorPhoto || wikidata.creatorPhoto || tvMaze.creatorPhoto,
    country: tmdb.country || wikidata.country || tvMaze.country,
    countryFlag: tmdb.countryFlag || wikidata.countryFlag || tvMaze.countryFlag,
  };
}

/** Récupère l’introduction d’une page Wikipédia dans la langue choisie. */
async function getWikipediaExtract(language: SupportedLanguage, pageTitle: string): Promise<string | undefined> {
  const params = new URLSearchParams({
    action: 'query',
    titles: pageTitle,
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    redirects: '1',
    format: 'json',
  });
  const response = await fetch(`https://${language}.wikipedia.org/w/api.php?${params}`, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
  });
  if (!response.ok) return undefined;
  const data = await response.json() as WikiSearchResponse;
  return Object.values(data.query?.pages ?? {})[0]?.extract?.trim() || undefined;
}

/** Cherche un synopsis sur Wikipédia en vérifiant que la page correspond au média. */
async function searchWikipediaSynopsis(
  language: SupportedLanguage,
  title: string,
  type: 'Film' | 'Série',
): Promise<string | undefined> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `intitle:${title}`,
    gsrnamespace: '0',
    gsrlimit: '8',
    prop: 'extracts|categories|pageprops',
    exintro: '1',
    explaintext: '1',
    cllimit: 'max',
    format: 'json',
  });
  const response = await fetch(`https://${language}.wikipedia.org/w/api.php?${params}`, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
  });
  if (!response.ok) return undefined;
  const data = await response.json() as WikiSearchResponse;
  const pages = Object.values(data.query?.pages ?? []).filter((page) => {
    const extract = page.extract?.trim() ?? '';
    if (extract.length < 120 || /may refer to|peut faire référence à|puede referirse a/i.test(extract.slice(0, 250))) return false;
    const description = page.pageprops?.['wikibase-shortdesc'] ?? '';
    const categories = page.categories?.map((category) => category.title).join(' ') ?? '';
    const typeText = normalizeTitle(`${description} ${categories}`);
    if (titleRank(page.title.replace(/\s+\([^)]*\)$/, ''), title) > 1) return false;
    return type === 'Film'
      ? /\b(film|movie|cinema|pelicula|cine)\b/.test(typeText)
      : /\b(series?|programa de television|television program|television series|tv show|tv series)\b/.test(typeText);
  });
  pages.sort((first, second) => titleRank(first.title.replace(/\s+\([^)]*\)$/, ''), title)
    - titleRank(second.title.replace(/\s+\([^)]*\)$/, ''), title));
  return pages[0]?.extract?.trim() || undefined;
}

const curatedSynopsisFallbacks = new Map<string, string>([
  ['zootopia 2', 'Les jeunes policiers Judy Hopps et Nick Wilde suivent la piste d’un nouveau mystère après l’arrivée de Gary De’Snake, un serpent qui bouleverse la métropole animale. Leur enquête les entraîne dans des quartiers inconnus et met leur partenariat à l’épreuve.'],
  ['toy story 4', 'Installé chez Bonnie avec ses amis, Woody rencontre Fourchette, un bricolage que la petite fille considère comme un jouet mais qui refuse cette nouvelle identité. Une escapade en camping-car devient une aventure qui conduit Woody à retrouver Bo Peep et à réfléchir à la place qu’il veut occuper dans la vie des jouets.'],
  ['toy story 3', 'Alors qu’Andy s’apprête à partir à l’université, Woody, Buzz et les autres jouets ignorent ce qu’ils vont devenir. Une erreur les conduit dans une garderie pleine d’enfants turbulents, où ils doivent rester unis et trouver le moyen de rejoindre Andy.'],
  ['transformers age of extinction', 'Après la bataille de Chicago, les Autobots sont traqués par les humains. Le mécanicien Cade Yeager découvre Optimus Prime et se retrouve entraîné, avec sa fille, dans la lutte des Autobots contre Lockdown et les forces qui veulent contrôler leur technologie.'],
  ['transformers dark of the moon', 'La découverte d’un vaisseau Cybertronien caché sur la Lune révèle un secret lié aux missions spatiales humaines. Sam Witwicky et les Autobots doivent empêcher les Decepticons d’utiliser cette découverte pour déclencher une nouvelle guerre sur Terre.'],
]);

/** Renvoie le synopsis local d’un titre s’il figure dans la sélection éditoriale. */
function getCuratedSynopsis(title: string): string | undefined {
  return curatedSynopsisFallbacks.get(normalizeTitle(title));
}

/** Cherche un synopsis disponible pour un média et sa langue d’affichage. */
async function getMediaSynopsis(id: string, title: string, type: 'Film' | 'Série', language: SupportedLanguage): Promise<string | undefined> {
  if (type === 'Série') {
    const showId = id.match(/^series-(\d+)$/)?.[1];
    if (showId) {
      try {
        const response = await fetch(`https://api.tvmaze.com/shows/${showId}`, { signal: AbortSignal.timeout(10000) });
        if (response.ok) {
          const show = await response.json() as TvMazeShow;
          const synopsis = load(show.summary || '').text().trim();
          if (synopsis) return synopsis;
        }
      } catch {
        // Try Wikipedia when TVmaze has no synopsis or is unavailable.
      }
    }
  }

  let itemId = id.match(/^wikidata-(Q\d+)$/)?.[1];
  const pageId = id.match(/^film-(\d+)$/)?.[1];
  if (!itemId && pageId) {
    try {
      const params = new URLSearchParams({ action: 'query', pageids: pageId, prop: 'pageprops', format: 'json' });
      const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
      });
      if (response.ok) {
        const data = await response.json() as WikiSearchResponse;
        itemId = Object.values(data.query?.pages ?? {})[0]?.pageprops?.wikibase_item;
      }
    } catch {
      // Continue with a title-based Wikidata search.
    }
  }

  if (!itemId) {
    try {
      itemId = await findWikidataMediaId(title, type, language);
    } catch {
      // Try the same title in the available Wikipedia language editions below.
    }
  }

  const languages = [...new Set([language, 'fr', 'en', 'es'])] as SupportedLanguage[];
  let entity: WikidataEntity | undefined;
  if (itemId) {
    try {
      const params = new URLSearchParams({
        action: 'wbgetentities',
        ids: itemId,
        props: 'descriptions|sitelinks|labels|aliases',
        languages: languages.join('|'),
        sitefilter: 'frwiki|enwiki|eswiki',
        format: 'json',
      });
      const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
      });
      if (response.ok) {
        entity = (await response.json() as WikidataResponse).entities?.[itemId];
        for (const candidateLanguage of languages) {
          const pageTitle = entity?.sitelinks?.[`${candidateLanguage}wiki`]?.title;
          if (!pageTitle) continue;
          const synopsis = await getWikipediaExtract(candidateLanguage, pageTitle).catch(() => undefined);
          if (synopsis) return synopsis;
        }
        const description = languages.map((candidateLanguage) => entity?.descriptions?.[candidateLanguage]?.value)
          .find((value): value is string => Boolean(value && value.length > 80));
        if (description) return description;
      }
    } catch {
      // Fall through to direct title lookups.
    }
  }

  for (const candidateLanguage of languages) {
    try {
      const synopsis = await getWikipediaExtract(candidateLanguage, title);
      if (synopsis) return synopsis;
    } catch {
      // Continue with the next language edition.
    }
  }

  const alternateTitles = languages.map((candidateLanguage) =>
    entity?.labels?.[candidateLanguage]?.value
      || entity?.aliases?.[candidateLanguage]?.[0]?.value
      || title
  );
  const searchedExtracts = await Promise.all(languages.map((candidateLanguage, index) =>
    searchWikipediaSynopsis(candidateLanguage, alternateTitles[index], type).catch(() => undefined)
  ));
  const searchedSynopsis = searchedExtracts.find((synopsis) => synopsis && synopsis.length > 80);
  if (searchedSynopsis) return searchedSynopsis;
  return getCuratedSynopsis(title);
}

const wikipediaGenreLabels: Record<string, string> = {
  action: 'Action',
  adventure: 'Aventure',
  animation: 'Animation',
  comedy: 'Comédie',
  crime: 'Crime',
  documentary: 'Documentaire',
  drama: 'Drame',
  family: 'Famille',
  fantasy: 'Fantastique',
  food: 'Cuisine',
  history: 'Historique',
  horror: 'Horreur',
  legal: 'Judiciaire',
  medical: 'Médical',
  music: 'Musical',
  mystery: 'Mystère',
  nature: 'Nature',
  romance: 'Romance',
  'science fiction': 'Science-fiction',
  'science-fiction': 'Science-fiction',
  children: 'Jeunesse',
  anime: 'Animation',
  espionage: 'Espionnage',
  sports: 'Sport',
  supernatural: 'Surnaturel',
  thriller: 'Thriller',
  travel: 'Voyage',
  war: 'Guerre',
  western: 'Western',
};

/** Traduit ou normalise un genre reçu depuis une source externe. */
function translateGenre(genre: string): string {
  const normalized = normalizeTitle(genre);
  const rules: [RegExp, string][] = [
    [/action|super hero|martial arts/, 'Action'],
    [/adventure|aventure/, 'Aventure'],
    [/animation|anime/, 'Animation'],
    [/comedy|comedie|parody|satire/, 'Comédie'],
    [/crime|policier|detective|gangster|heist|film noir/, 'Crime'],
    [/documentary|documentaire/, 'Documentaire'],
    [/drama|drame/, 'Drame'],
    [/family|familial|famille|children|enfants/, 'Famille'],
    [/fantasy|fantastique|mytholog/, 'Fantastique'],
    [/historical|history|historique/, 'Historique'],
    [/horror|horreur|slasher|zombie|vampire|monster|epouvante/, 'Horreur'],
    [/musical|music|musique/, 'Musical'],
    [/mystery|mystere|whodunit/, 'Mystère'],
    [/romance|romantique/, 'Romance'],
    [/science fiction|sci fi|science-fiction|space opera/, 'Science-fiction'],
    [/thriller|suspense/, 'Thriller'],
    [/war|guerre/, 'Guerre'],
    [/western/, 'Western'],
  ];
  const canonicalGenre = rules.find(([pattern]) => pattern.test(normalized))?.[1];
  return canonicalGenre ?? wikipediaGenreLabels[genre.trim().toLocaleLowerCase()] ?? genre;
}

/** Déduit les genres d’un média à partir de ses libellés descriptifs. */
function inferGenresFromLabels(labels: string[]): string[] {
  const text = labels.map(normalizeTitle).join(' ');
  const rules: [RegExp, string][] = [
    [/\baction\b|martial arts|superhero/, 'Action'],
    [/\badventure\b/, 'Aventure'],
    [/animation|animated/, 'Animation'],
    [/comedy|parody|satire/, 'Comédie'],
    [/crime|detective|gangster|heist|noir/, 'Crime'],
    [/documentary/, 'Documentaire'],
    [/\bdrama\b/, 'Drame'],
    [/family|children/, 'Famille'],
    [/fantasy|mytholog/, 'Fantastique'],
    [/historical|history/, 'Historique'],
    [/horror|slasher|zombie|vampire|monster/, 'Horreur'],
    [/musical|\bmusic\b/, 'Musical'],
    [/mystery|whodunit/, 'Mystère'],
    [/romance|romantic/, 'Romance'],
    [/science fiction|sci fi|space opera/, 'Science-fiction'],
    [/thriller|suspense/, 'Thriller'],
    [/\bwar\b/, 'Guerre'],
    [/western/, 'Western'],
  ];
  return rules.filter(([pattern]) => pattern.test(text)).map(([, genre]) => genre);
}

/** Extrait des genres depuis les catégories d’une page Wikipédia. */
function getWikipediaGenres(categories: string[]): string[] {
  const categoryText = categories.join(' ').toLocaleLowerCase();
  return Object.entries(wikipediaGenreLabels)
    .filter(([genre]) => new RegExp(`\\b${genre.replace(/ /g, '\\s+')}\\b`, 'i').test(categoryText))
    .map(([, label]) => label);
}

/** Récupère les genres Wikipédia de plusieurs pages à partir de leurs catégories. */
async function getWikipediaCategoryGenres(titles: string[]): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();
  const uniqueTitles = [...new Set(titles.filter(Boolean))];
  for (let index = 0; index < uniqueTitles.length; index += 50) {
    const params = new URLSearchParams({
      action: 'query',
      titles: uniqueTitles.slice(index, index + 50).join('|'),
      prop: 'categories',
      cllimit: 'max',
      format: 'json',
    });
    try {
      const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
      });
      if (!response.ok) continue;
      const data = await response.json() as WikiSearchResponse;
      for (const page of Object.values(data.query?.pages ?? {})) {
        const categories = page.categories?.map((category) => category.title.replace(/^Category:/i, '')) ?? [];
        const genres = getWikipediaGenres(categories);
        if (genres.length) results.set(normalizeTitle(page.title), [...new Set(genres)]);
      }
    } catch {
      // Category data is an optional fallback; keep the rest of the catalogue available.
    }
  }
  return results;
}

/** Cherche les genres dans les infobox Wikipédia des pages fournies. */
async function getWikipediaInfoboxGenres(titles: string[]): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();
  for (let index = 0; index < titles.length; index += 50) {
    const params = new URLSearchParams({
      action: 'query',
      titles: titles.slice(index, index + 50).join('|'),
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      format: 'json',
    });
    try {
      let response: Response | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
          signal: AbortSignal.timeout(15000),
          headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
        });
        if (response.status !== 429 || attempt === 2) break;
        const retryAfter = Number(response.headers.get('Retry-After'));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 10000)
          : (attempt + 1) * 1500;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      if (!response?.ok) {
        console.warn(`Wikipedia genre lookup returned HTTP ${response?.status ?? 'no response'}`);
        continue;
      }
      const data = await response.json() as WikiRevisionResponse;
      for (const page of Object.values(data.query?.pages ?? {})) {
        const wikitext = page.revisions?.[0]?.slots?.main?.content
          ?? page.revisions?.[0]?.slots?.main?.['*']
          ?? '';
        const genreField = wikitext.match(/^\s*\|\s*genres?\s*=\s*([\s\S]*?)(?=\n\s*\|\s*[\w -]+\s*=|\n\s*\}\}|$)/im)?.[1];
        if (!genreField) continue;
        const genreText = genreField
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi, '')
          .replace(/<ref\b[^/]*\/>/gi, '')
          .replace(/<br\s*\/?\s*>/gi, ', ')
          .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
          .replace(/\[([^\s\]]+)\s+([^\]]+)\]/g, '$2')
          .replace(/''+/g, '')
          .replace(/<[^>]+>/g, ' ');
        const genres = getWikipediaGenres([genreText]);
        if (genres.length) results.set(normalizeTitle(page.title), [...new Set(genres)]);
      }
    } catch (error) {
      console.warn('Wikipedia infobox genre lookup failed:', error);
    }
  }
  return results;
}

/** Recherche des films dans Wikidata et convertit les résultats en médias. */
async function searchWikidataFilms(query: string): Promise<CatalogueMedia[]> {
  const searchParams = new URLSearchParams({
    action: 'wbsearchentities',
    search: query,
    language: 'fr',
    uselang: 'fr',
    type: 'item',
    limit: '12',
    format: 'json',
  });
  const headers = { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' };
  const searchResponse = await fetch(`https://www.wikidata.org/w/api.php?${searchParams}`, {
    signal: AbortSignal.timeout(12000),
    headers,
  });
  if (!searchResponse.ok) throw new Error(`Wikidata search returned HTTP ${searchResponse.status}`);

  const searchData = await searchResponse.json() as WikidataResponse;
  const candidates = (searchData.search ?? [])
    .filter((result) => titleMatches(result.label, query))
    .sort((first, second) => titleRank(first.label, query) - titleRank(second.label, query))
    .slice(0, 10);
  if (candidates.length === 0) return [];

  const entityParams = new URLSearchParams({
    action: 'wbgetentities',
    ids: candidates.map((candidate) => candidate.id).join('|'),
    props: 'labels|descriptions|claims|sitelinks',
    languages: 'fr|en',
    sitefilter: 'frwiki|enwiki',
    format: 'json',
  });
  const entityResponse = await fetch(`https://www.wikidata.org/w/api.php?${entityParams}`, {
    signal: AbortSignal.timeout(12000),
    headers,
  });
  if (!entityResponse.ok) throw new Error(`Wikidata entities returned HTTP ${entityResponse.status}`);

  const entityData = await entityResponse.json() as WikidataResponse;
  const entities = Object.entries(entityData.entities ?? {});
  const filmEntities = entities.filter(([, entity]) =>
    getWikidataValues(entity, 'P31').some((value) => (value as { id?: string })?.id === 'Q11424')
  );
  const genreIds = [...new Set(filmEntities.flatMap(([, entity]) =>
    getWikidataValues(entity, 'P136')
      .map((value) => (value as { id?: string })?.id)
      .filter((id): id is string => Boolean(id))
  ))];
  const ratingSourceIds = filmEntities.flatMap(([, entity]) =>
    (entity.claims?.['P444'] ?? []).flatMap((claim) =>
      claim.qualifiers?.['P447']?.map((qualifier) =>
        (qualifier.datavalue?.value as { id?: string } | undefined)?.id
      ) ?? []
    )
  ).filter((id): id is string => Boolean(id));
  const labelIds = [...new Set([...genreIds, ...ratingSourceIds])];
  const genreLabels = new Map<string, string>();

  for (let index = 0; index < labelIds.length; index += 50) {
    const genreParams = new URLSearchParams({
      action: 'wbgetentities',
      ids: labelIds.slice(index, index + 50).join('|'),
      props: 'labels',
      languages: 'fr|en',
      format: 'json',
    });
    const genreResponse = await fetch(`https://www.wikidata.org/w/api.php?${genreParams}`, {
      signal: AbortSignal.timeout(12000),
      headers,
    });
    if (genreResponse.ok) {
      const genreData = await genreResponse.json() as WikidataResponse;
      for (const [id, entity] of Object.entries(genreData.entities ?? {})) {
        const label = entity.labels?.['fr']?.value || entity.labels?.['en']?.value;
        if (label) genreLabels.set(id, label);
      }
    }
  }

  const mediaResults: (CatalogueMedia | undefined)[] = await Promise.all(filmEntities.map(async ([id, entity]) => {
    const label = entity.labels?.['fr']?.value || entity.labels?.['en']?.value;
    const page = entity.sitelinks?.['frwiki'] || entity.sitelinks?.['enwiki'];
    if (!label || !page) return undefined;

    const language = entity.sitelinks?.['frwiki'] ? 'fr' : 'en';
    const synopsisUrl = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title)}`;
    let synopsis = entity.descriptions?.['fr']?.value || entity.descriptions?.['en']?.value || 'Synopsis non disponible.';
    try {
      const synopsisResponse = await fetch(synopsisUrl, { signal: AbortSignal.timeout(10000), headers });
      if (synopsisResponse.ok) {
        const summary = await synopsisResponse.json() as { extract?: string; thumbnail?: { source: string } };
        synopsis = summary.extract || synopsis;
      }
    } catch {
      // Keep the Wikidata description if Wikipedia is unavailable.
    }

    const release = getWikidataValues(entity, 'P577')[0] as { time?: string } | undefined;
    const posterName = getWikidataValues(entity, 'P18')[0];
    const image = typeof posterName === 'string'
      ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(posterName)}?width=500`
      : '';
    const genres = getWikidataValues(entity, 'P136')
      .map((value) => (value as { id?: string })?.id)
      .map((genreId) => genreId ? genreLabels.get(genreId) : undefined)
      .filter((genre): genre is string => Boolean(genre))
      .map(translateGenre);
    const rating = getWikidataRating(entity);

    return {
      id: `wikidata-${id}`,
      title: label,
      poster: image,
      type: 'Film',
      featured: false,
      genre: genres.join(', ') || 'Non renseigné',
      releaseYear: release?.time?.match(/\b(?:18|19|20)\d{2}\b/)?.[0] || 'Inconnue',
      rating: rating?.rating ?? 'Non notée',
      ratingScale: rating ? '10' : '',
      ratingSource: rating?.sourceId === 'Q37312'
        ? 'IMDb (Wikidata)'
        : rating?.sourceId && genreLabels.has(rating.sourceId)
          ? `${genreLabels.get(rating.sourceId)} (Wikidata)`
          : rating ? 'Wikidata' : undefined,
      synopsis,
      officialUrl: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    } satisfies CatalogueMedia;
  }));

  return mediaResults.filter((media): media is CatalogueMedia => Boolean(media));
}

/** Recherche des séries dans Wikipédia et convertit les résultats trouvés. */
async function searchWikipediaSeries(query: string): Promise<CatalogueMedia[]> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${query} television series`,
    gsrnamespace: '0',
    gsrlimit: '20',
    prop: 'pageimages|extracts|categories|pageprops',
    piprop: 'thumbnail',
    pithumbsize: '500',
    exintro: '1',
    explaintext: '1',
    cllimit: 'max',
    format: 'json',
  });
  const response = await fetchWikipedia(`https://en.wikipedia.org/w/api.php?${params}`);
  if (!response.ok) throw new Error(`Wikipedia series search returned HTTP ${response.status}`);

  const data = await response.json() as WikiSearchResponse;
  return Object.values(data.query?.pages ?? [])
    .filter((page) => {
      const baseTitle = page.title.replace(/\s+\([^)]*\)$/, '');
      const description = page.pageprops?.['wikibase-shortdesc'] ?? '';
      const categories = page.categories?.map((category) => category.title.replace(/^Category:/, '')) ?? [];
      const typeText = normalizeTitle(`${description} ${categories.join(' ')}`);
      const hasSeriesType = /\b(?:television|tv|web|anime)\b/.test(typeText)
        && /\b(?:series|show|program|sitcom|drama|comedy|soap opera|miniseries)\b/.test(typeText);
      return titleMatches(baseTitle, query) && hasSeriesType
        && Boolean(page.thumbnail?.source || page.pageprops?.page_image);
    })
    .sort((first, second) => titleRank(first.title.replace(/\s+\([^)]*\)$/, ''), query)
      - titleRank(second.title.replace(/\s+\([^)]*\)$/, ''), query))
    .slice(0, 20)
    .map((page) => {
      const categories = page.categories?.map((category) => category.title.replace(/^Category:/, '')) ?? [];
      const description = page.pageprops?.['wikibase-shortdesc'] ?? '';
      const poster = page.thumbnail?.source || `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(page.pageprops!.page_image!)}?width=500`;
      const year = description.match(/\b(?:19|20)\d{2}\b/)?.[0]
        ?? categories.join(' ').match(/\b(?:19|20)\d{2}\b/)?.[0]
        ?? 'Inconnue';
      return {
        id: `series-wiki-${page.pageid}`,
        title: page.title.replace(/\s+\([^)]*\)$/, ''),
        poster,
        type: 'Série',
        featured: false,
        genre: getWikipediaGenres(categories).join(', ') || 'Non renseigné',
        releaseYear: year,
        rating: 'Non notée',
        ratingScale: '',
        synopsis: page.extract?.trim() || description || 'Synopsis non disponible.',
        officialUrl: `https://en.wikipedia.org/?curid=${page.pageid}`,
        wikidataId: page.pageprops?.wikibase_item,
      } satisfies CatalogueMedia;
    });
}

/** Combine plusieurs sources pour trouver des séries correspondant à la requête. */
async function searchSeries(query: string): Promise<CatalogueMedia[]> {
  const [tvmazeResult, wikipediaResult] = await Promise.allSettled([
    (async () => {
  const url = new URL('https://api.tvmaze.com/search/shows');
  url.searchParams.set('q', query);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`TVmaze returned HTTP ${response.status}`);

  const results = await response.json() as { show: TvMazeShow }[];
  return results
    .filter(({ show }) => titleMatches(show.name, query))
    .sort((first, second) => titleRank(first.show.name, query) - titleRank(second.show.name, query))
    .slice(0, 20)
    .map(({ show }) => ({
      id: `series-${show.id}`,
      title: show.name,
      poster: show.image?.original || show.image?.medium || '',
      type: 'Série',
      featured: false,
      genre: show.genres.map(translateGenre).join(', ') || 'Non renseigné',
      releaseYear: show.premiered?.slice(0, 4) || 'Inconnue',
      rating: show.rating.average?.toFixed(1) || 'Non notée',
      ratingScale: '10',
      ratingSource: 'TVmaze',
      synopsis: load(show.summary || '').text().trim() || 'Synopsis non disponible.',
      officialUrl: show.officialSite || show.url,
    }));
    })(),
    searchWikipediaSeries(query),
  ]);
  const results = [
    ...(tvmazeResult.status === 'fulfilled' ? tvmazeResult.value : []),
    ...(wikipediaResult.status === 'fulfilled' ? wikipediaResult.value : []),
  ];
  return [...new Map(results.map((media) => [catalogueMediaKey(media), media])).values()];
}

/** Combine plusieurs sources pour trouver des films correspondant à la requête. */
async function searchFilms(query: string): Promise<CatalogueMedia[]> {
  try {
    const wikidataResults = await searchWikidataFilms(query);
    if (wikidataResults.length > 0) return wikidataResults;
  } catch (error) {
    console.warn('Wikidata search failed; using MediaWiki search instead.', error);
  }

  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${query} film`,
    gsrnamespace: '0',
    gsrlimit: '20',
    prop: 'extracts|categories|pageprops',
    exintro: '1',
    explaintext: '1',
    cllimit: 'max',
    format: 'json',
  });
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (local educational catalogue)' },
  });
  if (!response.ok) throw new Error(`Wikipedia returned HTTP ${response.status}`);

  const data = await response.json() as WikiSearchResponse;
  const pages = Object.values(data.query?.pages ?? {})
    .filter((page) => {
      const description = page.pageprops?.['wikibase-shortdesc'] ?? '';
      const categories = page.categories?.map((category) => category.title.toLowerCase()).join(' ') ?? '';
      const baseTitle = page.title.replace(/\s+\([^)]*\)$/, '');
      return titleMatches(baseTitle, query)
        && /^\d{4}\s+.*\bfilm\b/i.test(description)
        && /category:.*\bfilms?\b/.test(categories);
    })
    .sort((first, second) => titleRank(first.title.replace(/\s+\([^)]*\)$/, ''), query)
      - titleRank(second.title.replace(/\s+\([^)]*\)$/, ''), query));

  const resultPages = pages.slice(0, 12);
  const wikidataMetadata = await getWikidataFilmMetadata(resultPages
    .map((page) => page.pageprops?.wikibase_item)
    .filter((id): id is string => Boolean(id)));
  const infoboxGenres = await getWikipediaInfoboxGenres(resultPages
    .filter((page) => {
      const wikidata = page.pageprops?.wikibase_item
        ? wikidataMetadata.get(page.pageprops.wikibase_item)
        : undefined;
      const categories = page.categories?.map((category) => category.title.replace(/^Category:/, '')) ?? [];
      return !wikidata?.genres.length && !getWikipediaGenres(categories).length;
    })
    .map((page) => page.title));

  return resultPages.map((page) => {
    const description = page.pageprops?.['wikibase-shortdesc'] ?? '';
    const categoryNames = page.categories?.map((category) => category.title.replace(/^Category:/, '')) ?? [];
    const categoryText = categoryNames.join(' ').toLowerCase();
    const wikidata = page.pageprops?.wikibase_item
      ? wikidataMetadata.get(page.pageprops.wikibase_item)
      : undefined;
    const genres = [...new Set([
      ...(wikidata?.genres ?? []),
      ...getWikipediaGenres(categoryNames),
      ...(infoboxGenres.get(normalizeTitle(page.title)) ?? []),
    ])];
    const releaseYear = description.match(/\b(?:18|19|20)\d{2}\b/)?.[0]
      ?? categoryText.match(/\b(?:18|19|20)\d{2}\b/)?.[0]
      ?? 'Inconnue';
    const imageName = page.pageprops?.page_image;

    return {
      id: `film-${page.pageid}`,
      title: page.title,
      poster: imageName
        ? `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(imageName)}?width=500`
        : '',
      type: 'Film',
      featured: false,
      genre: genres.join(', ') || 'Non renseigné',
      releaseYear,
      rating: wikidata?.rating ?? 'Non notée',
      ratingScale: wikidata?.rating ? '10' : '',
      ratingSource: wikidata?.ratingSource,
      synopsis: page.extract?.trim() || 'Synopsis non disponible.',
      officialUrl: `https://en.wikipedia.org/?curid=${page.pageid}`,
    };
  });
}

/** Charge une sélection de films populaires depuis les sources configurées. */
async function getPopularFilms(): Promise<CatalogueMedia[]> {
  const listUrl = new URL('https://en.wikipedia.org/w/api.php');
  listUrl.search = new URLSearchParams({
    action: 'parse',
    page: 'List_of_highest-grossing_films',
    prop: 'text',
    format: 'json',
  }).toString();
  const listResponse = await fetchWikipedia(listUrl);
  if (!listResponse.ok) throw new Error(`Wikipedia returned HTTP ${listResponse.status}`);

  const listData = await listResponse.json() as { parse: { text: { ['*']: string } } };
  const $ = load(listData.parse.text['*']);
  const rankingTable = $('table.wikitable')
    .filter((_, table) => $(table).text().includes('Worldwide gross') && $(table).text().includes('Avengers: Endgame'))
    .first();
  const rankedFilms = rankingTable.find('tr').slice(1).map((_, row) => {
    const cells = $(row).children('td, th');
    const link = cells.eq(2).find('a[href^="/wiki/"]').first();
    const year = Number(cells.eq(4).text().trim());
    return {
      title: link.text().replace(/\s*†\s*$/, '').trim(),
      year,
      unreleased: cells.eq(2).text().includes('†'),
    };
  }).get().filter((film) => film.title && !film.unreleased && film.year > 1800 && film.year <= new Date().getFullYear()).slice(0, 50);
  const rankedFilmKeys = new Set(rankedFilms.map((film) => normalizeTitle(film.title)));
  rankedFilms.push(...[
    { title: 'The Devil Wears Prada 2', year: 2026 },
    { title: 'The Odyssey (2026 film)', year: 2026 },
    { title: 'Spider-Man: Brand New Day', year: 2026 },
    { title: 'Whiplash', year: 2014 },
  ].filter((film) => !rankedFilmKeys.has(normalizeTitle(film.title)))
    .map((film) => ({ ...film, unreleased: false })));

  const detailParams = new URLSearchParams({
    action: 'query',
    titles: rankedFilms.map((film) => film.title).join('|'),
    prop: 'pageimages|extracts|categories|pageprops',
    piprop: 'thumbnail',
    pithumbsize: '500',
    exintro: '1',
    explaintext: '1',
    cllimit: 'max',
    format: 'json',
  });
  const detailsResponse = await fetchWikipedia(`https://en.wikipedia.org/w/api.php?${detailParams}`);
  if (!detailsResponse.ok) throw new Error(`Wikipedia returned HTTP ${detailsResponse.status}`);

  const details = await detailsResponse.json() as WikiSearchResponse;
  const pages = Object.values(details.query?.pages ?? {});
  const pagesByTitle = new Map(pages.map((page) => [normalizeTitle(page.title), page]));
  const wikidataMetadata = await getWikidataFilmMetadata(pages
    .map((page) => page.pageprops?.wikibase_item)
    .filter((id): id is string => Boolean(id)));
  return rankedFilms.flatMap((film) => {
    const page = pagesByTitle.get(normalizeTitle(film.title));
    if (!page) return [];

    const categoryNames = page.categories?.map((category) => category.title.replace(/^Category:/, '')) ?? [];
    const wikidata = page.pageprops?.wikibase_item
      ? wikidataMetadata.get(page.pageprops.wikibase_item)
      : undefined;
    const genres = [...new Set([
      ...(wikidata?.genres ?? []),
      ...getWikipediaGenres(categoryNames),
    ])];
    const poster = page.thumbnail?.source || (page.pageprops?.page_image
      ? `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(page.pageprops.page_image)}?width=500`
      : '');

    if (!poster) return [];

    return [{
      id: `film-${page.pageid}`,
      title: page.title.replace(/\s+\(2026 film\)$/i, ''),
      poster,
      type: 'Film',
      featured: false,
      genre: genres.join(', ') || 'Non renseigné',
      releaseYear: String(film.year),
      rating: wikidata?.rating ?? 'Non notée',
      ratingScale: wikidata?.rating ? '10' : '',
      ratingSource: wikidata?.ratingSource,
      synopsis: page.extract?.trim() || 'Synopsis non disponible.',
      officialUrl: `https://en.wikipedia.org/?curid=${page.pageid}`,
    }];
  });
}

/** Charge des films moins connus pour diversifier le catalogue. */
async function getNicheFilms(): Promise<CatalogueMedia[]> {
  const lists = [
    'List_of_science_fiction_films',
    'List_of_horror_films',
    'List_of_cult_films',
    'List_of_action_films',
    'List_of_comedy_films',
    'List_of_drama_films',
    'List_of_thriller_films',
    'List_of_romance_films',
    'List_of_adventure_films',
    'List_of_mystery_films',
    'List_of_animated_feature_films',
    'List_of_documentary_films',
  ];
  const listParams = new URLSearchParams({
    action: 'query',
    titles: lists.join('|'),
    prop: 'links',
    plnamespace: '0',
    pllimit: 'max',
    format: 'json',
  });
  const headers = { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' };
  const listResponse = await fetchWikipedia(`https://en.wikipedia.org/w/api.php?${listParams}`);
  if (!listResponse.ok) throw new Error(`Wikipedia returned HTTP ${listResponse.status} for genre lists`);

  const listData = await listResponse.json() as WikiLinksResponse;
  const sourceGenreByList: Record<string, string> = {
    List_of_science_fiction_films: 'Science-fiction',
    List_of_horror_films: 'Horreur',
    List_of_action_films: 'Action',
    List_of_comedy_films: 'Comédie',
    List_of_drama_films: 'Drame',
    List_of_thriller_films: 'Thriller',
    List_of_romance_films: 'Romance',
    List_of_adventure_films: 'Aventure',
    List_of_mystery_films: 'Mystère',
    List_of_animated_feature_films: 'Animation',
    List_of_documentary_films: 'Documentaire',
  };
  const genresByTitle = new Map<string, Set<string>>();
  const titleByKey = new Map<string, string>();
  for (const listPage of Object.values(listData.query?.pages ?? {})) {
    const sourceGenre = sourceGenreByList[listPage.title.replace(/ /g, '_')];
    for (const link of listPage.links ?? []) {
      if (link.ns !== 0 || /^(List of|Category:|\d{4} in film)/i.test(link.title)) continue;
      const titleKey = normalizeTitle(link.title);
      titleByKey.set(titleKey, link.title);
      const genres = genresByTitle.get(titleKey) ?? new Set<string>();
      if (sourceGenre) genres.add(sourceGenre);
      genresByTitle.set(titleKey, genres);
    }
  }
  const titles = [...titleByKey.values()].slice(0, 1000);
  if (titles.length === 0) return [];

  const titleBatches = Array.from({ length: Math.ceil(titles.length / 50) }, (_, index) =>
    titles.slice(index * 50, (index + 1) * 50)
  );
  const filmsByBatch = await mapConcurrent(titleBatches, 3, async (titleBatch) => {
    const params = new URLSearchParams({
      action: 'query',
      titles: titleBatch.join('|'),
      prop: 'pageimages|extracts|categories|pageprops',
      piprop: 'thumbnail',
      pithumbsize: '500',
      exintro: '1',
      explaintext: '1',
      cllimit: 'max',
      format: 'json',
    });
    const detailsResponse = await fetchWikipedia(`https://en.wikipedia.org/w/api.php?${params}`);
    if (!detailsResponse.ok) {
      console.warn(`Wikipedia genre batch returned HTTP ${detailsResponse.status}`);
      return [];
    }

    const details = await detailsResponse.json() as WikiSearchResponse;
    const pages = Object.values(details.query?.pages ?? {});
    const wikidataMetadata = await getWikidataFilmMetadata(pages
      .map((page) => page.pageprops?.wikibase_item)
      .filter((id): id is string => Boolean(id)));
    const batchFilms: CatalogueMedia[] = [];

    for (const page of pages) {
      const description = page.pageprops?.['wikibase-shortdesc'] ?? '';
      const hasFilmDescription = /^\d{4}\b.*\bfilm\b/i.test(description);
      const hasFilmCategory = page.categories?.some(({ title }) =>
        /\bfilms\b|\bmovies\b/i.test(title) && !/\b(?:award|awards|festival|lists?)\b/i.test(title)
      ) ?? false;
      const isGenreArticle = /^(?:action|adventure|animation|comedy|crime|drama|fantasy|horror|mystery|romance|science fiction|thriller|war|western) film$/i.test(page.title);
      const isFilm = (hasFilmDescription || hasFilmCategory) && !isGenreArticle;
      if (!isFilm || !(page.thumbnail?.source || page.pageprops?.page_image)) continue;

      const categories = page.categories?.map((category) => category.title.replace(/^Category:/, '')) ?? [];
      const categoryText = categories.join(' ').toLowerCase();
      const wikidata = page.pageprops?.wikibase_item
        ? wikidataMetadata.get(page.pageprops.wikibase_item)
        : undefined;
      const listedGenres = [...(genresByTitle.get(normalizeTitle(page.title)) ?? [])];
      const genres = [...new Set([
        ...(wikidata?.genres ?? []),
        ...getWikipediaGenres(categories),
        ...listedGenres,
      ])];
      const poster = page.thumbnail?.source || `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(page.pageprops!.page_image!)}?width=500`;
      batchFilms.push({
        id: `film-${page.pageid}`,
        title: page.title,
        poster,
        type: 'Film',
        featured: false,
        genre: genres.join(', ') || 'Non renseigné',
        releaseYear: description.match(/\b(?:18|19|20)\d{2}\b/)?.[0]
          ?? categoryText.match(/\b(?:18|19|20)\d{2}\b/)?.[0]
          ?? 'Inconnue',
        rating: wikidata?.rating ?? 'Non notée',
        ratingScale: wikidata?.rating ? '10' : '',
        ratingSource: wikidata?.ratingSource,
        synopsis: page.extract?.trim() || description,
        officialUrl: `https://en.wikipedia.org/?curid=${page.pageid}`,
      });
    }
    return batchFilms;
  });

  return [...new Map(filmsByBatch.flat().map((film) => [film.id, film])).values()];
}

/** Charge des films récents référencés par Wikipédia. */
async function getRecentWikipediaFilms(): Promise<CatalogueMedia[]> {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: Math.min(10, currentYear - 2014) }, (_, index) => currentYear - index);
  const entries: { year: number; page: WikiPage }[] = [];
  for (const year of years) {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: `Category:${year} films`,
      gcmnamespace: '0',
      gcmlimit: 'max',
      prop: 'pageimages|extracts|categories|pageprops',
      piprop: 'thumbnail',
      pithumbsize: '500',
      exintro: '1',
      explaintext: '1',
      cllimit: 'max',
      format: 'json',
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
          signal: AbortSignal.timeout(15000),
          headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
        });
        if (response.status === 429 && attempt < 1) {
          const retryAfter = Number(response.headers.get('Retry-After'));
          await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 2000)
            : 1000));
          continue;
        }
        if (!response.ok) break;
        const data = await response.json() as WikiSearchResponse;
        entries.push(...Object.values(data.query?.pages ?? {})
          .filter((page) => page.thumbnail?.source || page.pageprops?.page_image)
          .slice(0, 30)
          .map((page) => ({ year, page })));
        break;
      } catch {
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (!entries.length) return [];

  const metadata = await getWikidataFilmMetadata(entries
    .map(({ page }) => page.pageprops?.wikibase_item)
    .filter((id): id is string => Boolean(id)));
  return entries.map(({ year, page }) => {
    const categoryNames = page.categories?.map((category) => category.title.replace(/^Category:/, '')) ?? [];
    const wikidata = page.pageprops?.wikibase_item ? metadata.get(page.pageprops.wikibase_item) : undefined;
    const genres = [...new Set([...(wikidata?.genres ?? []), ...getWikipediaGenres(categoryNames)])];
    const poster = page.thumbnail?.source || `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(page.pageprops!.page_image!)}?width=500`;
    return {
      id: `film-${page.pageid}`,
      title: page.title.replace(/\s+\(\d{4} film\)$/i, ''),
      poster,
      type: 'Film',
      featured: false,
      genre: genres.join(', ') || 'Non renseigné',
      releaseYear: String(year),
      rating: wikidata?.rating ?? 'Non notée',
      ratingScale: wikidata?.rating ? '10' : '',
      ratingSource: wikidata?.ratingSource,
      synopsis: page.extract?.trim() || 'Synopsis non disponible.',
      officialUrl: `https://en.wikipedia.org/?curid=${page.pageid}`,
    } satisfies CatalogueMedia;
  });
}

/** Charge des séries répertoriées par Wikipédia. */
async function getWikipediaSeries(): Promise<CatalogueMedia[]> {
  const lists = [
    'List of American television series',
    'List of British television series',
    'List of Canadian television series',
    'List of Australian television series',
    'List of French television series',
    'List of Japanese television series',
    'List of South Korean television series',
  ];
  const listParams = new URLSearchParams({
    action: 'query',
    titles: lists.join('|'),
    prop: 'links',
    plnamespace: '0',
    pllimit: 'max',
    format: 'json',
  });
  const listResponse = await fetchWikipedia(`https://en.wikipedia.org/w/api.php?${listParams}`);
  if (!listResponse.ok) throw new Error(`Wikipedia returned HTTP ${listResponse.status} for television series lists`);

  const listData = await listResponse.json() as WikiLinksResponse;
  const candidateTitles = new Map<string, string>();
  for (const listPage of Object.values(listData.query?.pages ?? {})) {
    const titles = (listPage.links ?? [])
      .filter((link) => link.ns === 0 && !/^(?:list of|category:|\d{4} in television)|\b(?:episodes?|seasons?|soundtracks?|characters?)\b/i.test(link.title))
      .map((link) => link.title);
    for (const title of titles.slice(0, 100)) candidateTitles.set(normalizeTitle(title), title);
  }

  const titles = [...candidateTitles.values()];
  const series: CatalogueMedia[] = [];
  for (let index = 0; index < titles.length; index += 50) {
    const params = new URLSearchParams({
      action: 'query',
      titles: titles.slice(index, index + 50).join('|'),
      prop: 'pageimages|extracts|categories|pageprops',
      piprop: 'thumbnail',
      pithumbsize: '500',
      exintro: '1',
      explaintext: '1',
      cllimit: 'max',
      format: 'json',
    });
    const response = await fetchWikipedia(`https://en.wikipedia.org/w/api.php?${params}`);
    if (!response.ok) continue;

    const data = await response.json() as WikiSearchResponse;
    for (const page of Object.values(data.query?.pages ?? {})) {
      const description = page.pageprops?.['wikibase-shortdesc'] ?? '';
      const categories = page.categories?.map((category) => category.title.replace(/^Category:/, '')) ?? [];
      const typeText = normalizeTitle(`${description} ${categories.join(' ')}`);
      const isSeries = /\b(?:television|tv|web)\b/.test(typeText)
        && /\b(?:series|show|program|sitcom|drama|comedy|soap opera|miniseries)\b/.test(typeText)
        && !/\b(?:episode|season|list|character|soundtrack|award|awards)\b/.test(typeText);
      const poster = page.thumbnail?.source || (page.pageprops?.page_image
        ? `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(page.pageprops.page_image)}?width=500`
        : '');
      if (!isSeries || !poster) continue;

      const genre = getWikipediaGenres(categories);
      const title = page.title.replace(/\s+\((?:[^)]*\s)?(?:TV|television|web) series\)$/i, '');
      const year = description.match(/\b(?:19|20)\d{2}\b/)?.[0]
        ?? categories.join(' ').match(/\b(?:19|20)\d{2}\b/)?.[0]
        ?? 'Inconnue';
      series.push({
        id: `series-wiki-${page.pageid}`,
        title,
        poster,
        type: 'Série',
        featured: false,
        genre: genre.join(', ') || 'Non renseigné',
        releaseYear: year,
        rating: 'Non notée',
        ratingScale: '',
        synopsis: page.extract?.trim() || description || 'Synopsis non disponible.',
        officialUrl: `https://en.wikipedia.org/?curid=${page.pageid}`,
        wikidataId: page.pageprops?.wikibase_item,
      });
    }
  }

  return [...new Map(series.map((media) => [catalogueMediaKey(media), media])).values()];
}

/** Charge une sélection de séries populaires depuis les sources configurées. */
async function getPopularSeries(): Promise<CatalogueMedia[]> {
  const responses = await Promise.all(Array.from({ length: 12 }, (_, page) =>
    fetch(`https://api.tvmaze.com/shows?page=${page}`, { signal: AbortSignal.timeout(15000) })
  ));
  if (responses.some((response) => !response.ok)) throw new Error('TVmaze popular list request failed.');

  const shows = (await Promise.all(responses.map((response) => response.json()))) as TvMazeShow[][];
  const featured2026Ids = [56862, 67765, 77427, 79916];
  const featuredResponses = await Promise.all(featured2026Ids.map((id) =>
    fetch(`https://api.tvmaze.com/shows/${id}`, { signal: AbortSignal.timeout(15000) })
  ));
  const featured2026Shows = await Promise.all(featuredResponses.map(async (response) =>
    response.ok ? await response.json() as TvMazeShow : undefined
  ));

  const rankedShows = shows.flat()
    .filter((show) => show.image && show.premiered && show.rating.average)
    .sort((first, second) => (second.rating.average ?? 0) - (first.rating.average ?? 0))
    .slice(0, 700);
  const recentSeries = featured2026Shows.filter((show): show is TvMazeShow =>
    Boolean(show?.premiered?.startsWith('2026') && show.image && show.rating.average)
  );
  const selectedShows = [...new Map(
    [...rankedShows, ...recentSeries].map((show) => [show.id, show])
  ).values()];

  return selectedShows.map((show) => ({
      id: `series-${show.id}`,
      title: show.name,
      poster: show.image?.original || show.image?.medium || '',
      type: 'Série',
      featured: false,
      genre: show.genres.map(translateGenre).join(', ') || 'Non renseigné',
      releaseYear: show.premiered?.slice(0, 4) || 'Inconnue',
      rating: show.rating.average?.toFixed(1) || 'Non notée',
      ratingScale: '10',
      ratingSource: 'TVmaze',
      synopsis: load(show.summary || '').text().trim() || 'Synopsis non disponible.',
      officialUrl: show.officialSite || show.url,
    }));
}

/** Complète les synopsis manquants des médias du catalogue. */
async function fillMissingCatalogSynopses(catalogue: CatalogueMedia[]): Promise<void> {
  const missing = catalogue.filter((media) =>
    !media.synopsis?.trim() || /^(?:synopsis|sinopsis|plot|description)\s+(?:non disponible|not available|unavailable|no disponible)\.?$/i.test(media.synopsis.trim())
  );
  if (!missing.length) return;

  const pageIds = missing.map((media) => media.id.match(/^film-(\d+)$/)?.[1]).filter((id): id is string => Boolean(id));
  const wikidataIds = new Map<string, string>();
  for (const media of missing) {
    const id = media.id.match(/^wikidata-(Q\d+)$/)?.[1];
    if (id) wikidataIds.set(media.id, id);
  }
  for (const media of missing.filter((item) => item.type === 'Série' && item.id.startsWith('series-'))) {
    try {
      const itemId = await findWikidataMediaId(media.title, 'Série', 'fr');
      if (itemId) wikidataIds.set(media.id, itemId);
    } catch {
      // Try TVMaze and its existing series ID if Wikidata search is unavailable.
    }
  }

  if (pageIds.length) {
    try {
      const params = new URLSearchParams({ action: 'query', pageids: pageIds.join('|'), prop: 'pageprops', format: 'json' });
      const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
      });
      if (response.ok) {
        const data = await response.json() as WikiSearchResponse;
        for (const media of missing) {
          const pageId = media.id.match(/^film-(\d+)$/)?.[1];
          const page = Object.values(data.query?.pages ?? {}).find((candidate) => String(candidate.pageid) === pageId);
          const itemId = page?.pageprops?.wikibase_item;
          if (itemId) wikidataIds.set(media.id, itemId);
        }
      }
    } catch {
      // Continue with the synopsis sources that do not need page IDs.
    }
  }

  const entityByMediaId = new Map<string, WikidataEntity>();
  const uniqueWikidataIds = [...new Set(wikidataIds.values())];
  for (let index = 0; index < uniqueWikidataIds.length; index += 50) {
    try {
      const params = new URLSearchParams({
        action: 'wbgetentities',
        ids: uniqueWikidataIds.slice(index, index + 50).join('|'),
        props: 'sitelinks',
        sitefilter: 'frwiki|enwiki|eswiki',
        format: 'json',
      });
      const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
      });
      if (!response.ok) continue;
      const entities = (await response.json() as WikidataResponse).entities ?? {};
      for (const [mediaId, itemId] of wikidataIds) {
        const entity = entities[itemId];
        if (entity) entityByMediaId.set(mediaId, entity);
      }
    } catch {
      // Keep the catalogue usable when Wikidata is unavailable.
    }
  }

  for (const language of supportedLanguages) {
    const stillMissing = missing.filter((media) => !media.synopsis
      || /^(?:synopsis|sinopsis|plot|description)\s+(?:non disponible|not available|unavailable|no disponible)\.?$/i.test(media.synopsis.trim()));
    if (!stillMissing.length) break;
    const titles = [...new Set(stillMissing.map((media) =>
      entityByMediaId.get(media.id)?.sitelinks?.[`${language}wiki`]?.title
    ).filter((title): title is string => Boolean(title)))];
    if (!titles.length) continue;
    try {
      const params = new URLSearchParams({
        action: 'query',
        titles: titles.join('|'),
        prop: 'extracts',
        exintro: '1',
        explaintext: '1',
        redirects: '1',
        format: 'json',
      });
      const response = await fetch(`https://${language}.wikipedia.org/w/api.php?${params}`, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
      });
      if (!response.ok) continue;
      const pages = Object.values((await response.json() as WikiSearchResponse).query?.pages ?? {});
      const extracts = new Map(pages.map((page) => [normalizeTitle(page.title), page.extract?.trim() || '']));
      for (const media of stillMissing) {
        if (media.synopsis && !/^(?:synopsis|sinopsis|plot|description)\s+(?:non disponible|not available|unavailable|no disponible)\.?$/i.test(media.synopsis.trim())) continue;
        const title = entityByMediaId.get(media.id)?.sitelinks?.[`${language}wiki`]?.title;
        const synopsis = title ? extracts.get(normalizeTitle(title)) : undefined;
        if (synopsis && synopsis.length > 80) media.synopsis = synopsis;
      }
    } catch {
      // Other language editions are tried independently.
    }
  }

  for (const media of missing) {
    if (media.synopsis && !/^(?:synopsis|sinopsis|plot|description)\s+(?:non disponible|not available|unavailable|no disponible)\.?$/i.test(media.synopsis.trim())) continue;
    const showId = media.id.match(/^series-(\d+)$/)?.[1];
    if (!showId) continue;
    try {
      const response = await fetch(`https://api.tvmaze.com/shows/${showId}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) continue;
      const show = await response.json() as TvMazeShow;
      const synopsis = load(show.summary || '').text().trim();
      if (synopsis.length > 80) media.synopsis = synopsis;
    } catch {
      // The visible fallback message is used if every public source is unavailable.
    }
  }

  for (const media of missing) {
    if (!media.synopsis || /^(?:synopsis|sinopsis|plot|description)\s+(?:non disponible|not available|unavailable|no disponible)\.?$/i.test(media.synopsis.trim())) {
      const synopsis = getCuratedSynopsis(media.title);
      if (synopsis) media.synopsis = synopsis;
    }
  }
}

/** Complète les genres manquants des médias du catalogue. */
async function fillMissingCatalogGenres(catalogue: CatalogueMedia[]): Promise<void> {
  const isMissingGenre = (genre: string | undefined) => !genre?.trim()
    || /^(?:non renseign|not specified|unknown|desconocido)/i.test(genre.trim());
  const missing = catalogue.filter((media) => isMissingGenre(media.genre));
  if (!missing.length) return;

  const itemIdsByMedia = new Map<string, string>();
  const pageIds = missing
    .map((media) => media.id.match(/^film-(\d+)$/)?.[1])
    .filter((id): id is string => Boolean(id));
  for (const media of missing) {
    const itemId = media.id.match(/^wikidata-(Q\d+)$/)?.[1];
    if (itemId) itemIdsByMedia.set(media.id, itemId);
  }

  if (pageIds.length) {
    try {
      const params = new URLSearchParams({ action: 'query', pageids: pageIds.join('|'), prop: 'pageprops', format: 'json' });
      const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'CatalogueFilmsSeries/1.0 (educational project)' },
      });
      if (response.ok) {
        const data = await response.json() as WikiSearchResponse;
        for (const media of missing) {
          const pageId = media.id.match(/^film-(\d+)$/)?.[1];
          const page = Object.values(data.query?.pages ?? {}).find((candidate) => String(candidate.pageid) === pageId);
          const itemId = page?.pageprops?.wikibase_item;
          if (itemId) itemIdsByMedia.set(media.id, itemId);
        }
      }
    } catch {
      // Continue with title based Wikidata searches if Wikipedia is unavailable.
    }
  }

  for (const media of missing.filter((candidate) => !itemIdsByMedia.has(candidate.id))) {
    try {
      const itemId = await findWikidataMediaId(media.title, media.type === 'Film' ? 'Film' : 'Série', 'fr');
      if (itemId) itemIdsByMedia.set(media.id, itemId);
    } catch {
      // Keep the other media lookups independent.
    }
  }

  const metadata = await getWikidataFilmMetadata([...itemIdsByMedia.values()], 'fr');
  for (const media of missing) {
    const itemId = itemIdsByMedia.get(media.id);
    const genres = itemId ? metadata.get(itemId)?.genres : undefined;
    if (genres?.length) media.genre = [...new Set(genres)].join(', ');
  }

  const stillMissing = missing.filter((media) => isMissingGenre(media.genre));
  if (stillMissing.length) {
    const categoryGenres = await getWikipediaCategoryGenres(stillMissing.map((media) => media.title));
    for (const media of stillMissing) {
      const genres = categoryGenres.get(normalizeTitle(media.title));
      if (genres?.length) media.genre = [...new Set(genres)].join(', ');
    }
  }

  const missingFilmGenres = missing.filter((media) => media.type === 'Film' && isMissingGenre(media.genre));
  if (missingFilmGenres.length) {
    const infoboxGenres = await getWikipediaInfoboxGenres(missingFilmGenres.map((media) => media.title));
    for (const media of missingFilmGenres) {
      const genres = infoboxGenres.get(normalizeTitle(media.title));
      if (genres?.length) media.genre = [...new Set(genres)].join(', ');
    }
  }
}

/** Renvoie le jeton d’accès TMDb configuré, s’il est disponible. */
function getTmdbToken(): string | undefined {
  return process.env['TMDB_API_READ_ACCESS_TOKEN']?.trim() || undefined;
}

/** Indique si les identifiants TMDb nécessaires sont configurés. */
function hasTmdbCredentials(): boolean {
  return Boolean(getTmdbToken() || process.env['TMDB_API_KEY']?.trim());
}

/** Effectue une requête typée vers l’API TMDb avec un délai maximal. */
async function fetchTmdb<T>(path: string, params: URLSearchParams, timeoutMs = 15000): Promise<T> {
  const token = getTmdbToken();
  const apiKey = process.env['TMDB_API_KEY']?.trim();
  if (!token && !apiKey) throw new Error('TMDB API credentials are not configured.');

  const request = (auth: 'token' | 'apiKey') => {
    const requestParams = new URLSearchParams(params);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (auth === 'token' && token) headers['Authorization'] = `Bearer ${token}`;
    if (auth === 'apiKey' && apiKey) requestParams.set('api_key', apiKey);
    return fetch(`https://api.themoviedb.org/3/${path}?${requestParams}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers,
    });
  };

  let response = await request(token ? 'token' : 'apiKey');
  if ((response.status === 401 || response.status === 403) && token && apiKey) {
    response = await request('apiKey');
  }
  if (!response.ok) throw new Error(`TMDB ${path} returned HTTP ${response.status}`);
  return await response.json() as T;
}

/** Récupère la correspondance des identifiants de genres TMDb. */
async function getTmdbGenres(kind: 'movie' | 'tv'): Promise<Map<number, string>> {
  const result = await fetchTmdb<TmdbGenreResponse>(`genre/${kind}/list`, new URLSearchParams({ language: 'fr-FR' }));
  return new Map((result.genres ?? []).map((genre) => [genre.id, translateGenre(genre.name)]));
}

/** Convertit un résultat TMDb au format utilisé par le catalogue. */
function mapTmdbMedia(item: TmdbMediaResult, kind: 'movie' | 'tv', genres: Map<number, string>): CatalogueMedia | undefined {
  const title = (kind === 'movie' ? item.title : item.name)?.trim();
  if (!title || !item.poster_path) return undefined;
  const date = kind === 'movie' ? item.release_date : item.first_air_date;
  const genreNames = (item.genre_ids ?? []).map((id) => genres.get(id)).filter((genre): genre is string => Boolean(genre));
  const id = `${kind === 'movie' ? 'tmdb-movie' : 'tmdb-series'}-${item.id}`;
  return {
    id,
    title,
    poster: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
    type: kind === 'movie' ? 'Film' : 'Série',
    featured: false,
    genre: [...new Set(genreNames)].join(', ') || 'Non renseigné',
    releaseYear: date?.slice(0, 4) || 'Inconnue',
    rating: item.vote_average ? item.vote_average.toFixed(1) : 'Non notée',
    ratingScale: item.vote_average ? '10' : '',
    ratingSource: item.vote_average ? 'TMDB' : undefined,
    synopsis: item.overview?.trim() || 'Synopsis non disponible.',
    officialUrl: `https://www.themoviedb.org/${kind}/${item.id}`,
  };
}

/** Charge plusieurs pages de titres populaires depuis TMDb. */
async function getTmdbPopular(kind: 'movie' | 'tv', pages = 10): Promise<CatalogueMedia[]> {
  if (!hasTmdbCredentials()) return [];
  const path = kind === 'movie' ? 'movie/popular' : 'tv/popular';
  const [genreMap, pageResults] = await Promise.all([
    getTmdbGenres(kind),
    Promise.all(Array.from({ length: pages }, (_, index) =>
      fetchTmdb<TmdbListResponse>(path, new URLSearchParams({ language: 'fr-FR', page: String(index + 1) }))
    )),
  ]);
  return pageResults.flatMap((page) => (page.results ?? [])
    .map((item) => mapTmdbMedia(item, kind, genreMap))
    .filter((media): media is CatalogueMedia => Boolean(media)));
}

/** Recherche des films ou séries par titre dans TMDb. */
async function searchTmdb(query: string, kind: 'movie' | 'tv'): Promise<CatalogueMedia[]> {
  if (!hasTmdbCredentials()) return [];
  const path = kind === 'movie' ? 'search/movie' : 'search/tv';
  const [genreMap, results] = await Promise.all([
    getTmdbGenres(kind),
    fetchTmdb<TmdbListResponse>(path, new URLSearchParams({ query, language: 'fr-FR', include_adult: 'false', page: '1' })),
  ]);
  return (results.results ?? [])
    .filter((item) => {
      const title = kind === 'movie' ? item.title : item.name;
      return Boolean(title && titleMatches(title, query));
    })
    .slice(0, 20)
    .map((item) => mapTmdbMedia(item, kind, genreMap))
    .filter((media): media is CatalogueMedia => Boolean(media));
}

/** Construit la sélection locale de films choisie pour enrichir le catalogue. */
function getCuratedFilms(): CatalogueMedia[] {
  return [{
    id: 'tmdb-movie-244786',
    title: 'Whiplash',
    poster: 'https://image.tmdb.org/t/p/w500/7fn624j5lj3xTme2SgiLCeuedmO.jpg',
    type: 'Film',
    featured: false,
    genre: 'Drame, Musique',
    releaseYear: '2014',
    rating: '8.4',
    ratingScale: '10',
    ratingSource: 'TMDB',
    synopsis: 'Andrew, jeune batteur de jazz ambitieux, rejoint un prestigieux conservatoire où il subit les méthodes exigeantes de Terence Fletcher, un professeur déterminé à pousser ses élèves au maximum.',
    officialUrl: 'https://www.themoviedb.org/movie/244786-whiplash',
  }];
}

/** Ajoute au catalogue les films sélectionnés qui n’y figurent pas encore. */
function ensureCuratedFilms(catalogue: CatalogueMedia[]): CatalogueMedia[] {
  const byTitle = new Map(catalogue.map((media) => [
    catalogueMediaKey(media),
    media,
  ]));
  for (const media of getCuratedFilms()) {
    const key = catalogueMediaKey(media);
    if (!byTitle.has(key)) byTitle.set(key, media);
  }
  return [...byTitle.values()];
}

/** Construit le catalogue par défaut en combinant les sources de médias. */
async function getDefaultCatalogue(): Promise<CatalogueMedia[]> {
  const sourceNames = [
    'Wikipedia: films populaires',
    'Wikipedia: films par genre',
    'Wikipedia: films récents',
    'Wikipedia: séries internationales',
    'TVmaze: séries',
    'TMDB: films populaires',
    'TMDB: séries populaires',
    'TMDB: recherche Whiplash',
    'Catalogue local',
  ];
  const results = await Promise.allSettled([
    getPopularFilms(),
    getNicheFilms(),
    getRecentWikipediaFilms(),
    getWikipediaSeries(),
    getPopularSeries(),
    getTmdbPopular('movie'),
    getTmdbPopular('tv'),
    searchTmdb('Whiplash', 'movie'),
    Promise.resolve(getCuratedFilms()),
  ]);
  const failedSources = results.flatMap((result, index) => {
    if (result.status !== 'rejected') return [];
    const reason = result.reason as Error & { cause?: { code?: string } };
    const detail = reason.cause?.code || reason.message || 'erreur inconnue';
    return [`${sourceNames[index]} (${detail})`];
  });
  if (failedSources.length) {
    console.warn(`Sources du catalogue indisponibles : ${failedSources.join('; ')}`);
  }
  const medias = results
    .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
    .reduce((unique, media) => {
      const key = catalogueMediaKey(media);
      const existing = unique.get(key);
      if (!existing) {
        unique.set(key, media);
        return unique;
      }

      const genres = [...new Set([
        ...(existing.genre === 'Non renseigné' ? [] : existing.genre.split(', ')),
        ...(media.genre === 'Non renseigné' ? [] : media.genre.split(', ')),
      ])];
      const hasExistingRating = Number.isFinite(Number(existing.rating)) && Boolean(existing.ratingScale);
      const hasNewRating = Number.isFinite(Number(media.rating)) && Boolean(media.ratingScale);
      const ratingMedia = hasExistingRating ? existing : hasNewRating ? media : existing;
      unique.set(key, {
        ...existing,
        poster: existing.poster || media.poster,
        genre: genres.join(', ') || 'Non renseigné',
        rating: ratingMedia.rating,
        ratingScale: ratingMedia.ratingScale,
        ratingSource: ratingMedia.ratingSource,
        synopsis: existing.synopsis && !/^(?:synopsis|sinopsis|plot|description)\s+(?:non disponible|not available|unavailable|no disponible)\.?$/i.test(existing.synopsis.trim())
          ? existing.synopsis
          : media.synopsis,
        officialUrl: existing.officialUrl || media.officialUrl,
      });
      return unique;
    }, new Map<string, CatalogueMedia>());

  const catalogue = [...medias.values()];
  const missingFilmGenres = catalogue
    .filter((media) => media.type === 'Film' && media.genre === 'Non renseigné')
    .map((media) => media.title);
  const infoboxGenres = await getWikipediaInfoboxGenres(missingFilmGenres);
  for (const media of catalogue) {
    const genres = infoboxGenres.get(normalizeTitle(media.title));
    if (media.type === 'Film' && media.genre === 'Non renseigné' && genres?.length) {
      media.genre = genres.join(', ');
    }
  }

  return catalogue.sort((first, second) => second.releaseYear.localeCompare(first.releaseYear));
}

/** Construit rapidement un petit catalogue temporaire pour l’affichage initial. */
async function getQuickCatalogue(): Promise<CatalogueMedia[]> {
  const seriesPage = async (): Promise<CatalogueMedia[]> => {
    const response = await fetch('https://api.tvmaze.com/shows?page=0', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`TVmaze returned HTTP ${response.status}`);
    const shows = await response.json() as TvMazeShow[];
    return shows
      .filter((show) => show.image && show.premiered)
      .sort((first, second) => (second.rating.average ?? 0) - (first.rating.average ?? 0))
      .slice(0, 250)
      .map((show) => ({
        id: `series-${show.id}`,
        title: show.name,
        poster: show.image?.original || show.image?.medium || '',
        type: 'Série',
        featured: false,
        genre: show.genres.map(translateGenre).join(', ') || 'Non renseigné',
        releaseYear: show.premiered?.slice(0, 4) || 'Inconnue',
        rating: show.rating.average?.toFixed(1) || 'Non notée',
        ratingScale: '10',
        ratingSource: 'TVmaze',
        synopsis: load(show.summary || '').text().trim() || 'Synopsis non disponible.',
        officialUrl: show.officialSite || show.url,
      }));
  };

  const results = await Promise.allSettled([
    seriesPage(),
    getTmdbPopular('movie', 1),
    getTmdbPopular('tv', 1),
    Promise.resolve(getCuratedFilms()),
  ]);
  const medias = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  return ensureCuratedFilms([...new Map(medias.map((media) => [catalogueMediaKey(media), media])).values()])
    .sort((first, second) => second.releaseYear.localeCompare(first.releaseYear));
}

/** Lance une seule fois la construction complète du catalogue par défaut. */
function beginDefaultCatalogueBuild(): Promise<CatalogueMedia[]> {
  if (!defaultCatalogueBuild) {
    defaultCatalogueBuild = getDefaultCatalogue()
      .then((items) => {
        const medias = ensureCuratedFilms(items);
        if (medias.length) searchCache.set('default:all', { medias, expiresAt: Date.now() + 10 * 60 * 1000 });
        return medias;
      })
      .catch((error) => {
        console.error('Unable to build the complete catalogue in the background:', error);
        return [];
      })
      .finally(() => {
        defaultCatalogueBuild = undefined;
      });
  }
  return defaultCatalogueBuild;
}

/** Filtre et pagine un catalogue en mémoire avant de répondre à l’API. */
function cataloguePagePayload(
  medias: CatalogueMedia[],
  page: number,
  type: string,
  genre: string,
  year: string,
  rating: string,
  isBuilding = false,
) {
  const genres = [...new Set(medias.flatMap((media) => media.genre.split(',').map((item) => item.trim())))]
    .filter((item) => item && item !== 'Non renseigné')
    .sort((first, second) => first.localeCompare(second));
  const years = [...new Set(medias.map((media) => media.releaseYear).filter((value) => /^\d{4}$/.test(value)))]
    .sort((first, second) => Number(second) - Number(first));
  const filtered = medias.filter((media) => {
    if (type === 'film' && media.type !== 'Film') return false;
    if (type === 'series' && media.type !== 'Série') return false;
    if (genre !== 'all' && !media.genre.split(',').some((item) => normalizeTitle(item) === normalizeTitle(genre))) return false;

    const releaseYear = Number(media.releaseYear);
    if (year.startsWith('year:') && releaseYear !== Number(year.slice(5))) return false;
    if (year.startsWith('decade:')) {
      const decade = Number(year.slice(7));
      if (releaseYear < decade || releaseYear > decade + 9) return false;
    }

    if (rating !== 'all') {
      const value = Number(media.rating);
      const scale = Number(media.ratingScale || 5);
      if (!Number.isFinite(value) || !Number.isFinite(scale) || scale <= 0
        || Math.round((value / scale) * 10) / 2 !== Number(rating)) return false;
    }
    return true;
  });
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    items: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    total: filtered.length,
    page: safePage,
    pageSize,
    totalPages,
    genres,
    years,
    isBuilding,
  };
}

interface ImdbMediaRow {
  tconst: string;
  title: string;
  type: 'Film' | 'Série';
  release_year: number | null;
  genres: string;
  rating: number | null;
  votes: number | null;
  sort_order?: number;
}

/** Convertit une ligne SQLite IMDb en média affichable dans le catalogue. */
function mapImdbRow(row: ImdbMediaRow): CatalogueMedia {
  return {
    id: `imdb-${row.tconst}`,
    title: row.title,
    poster: '',
    type: row.type,
    featured: false,
    genre: row.genres.split(',').filter(Boolean).join(', ') || 'Non renseigné',
    releaseYear: row.release_year ? String(row.release_year) : 'Inconnue',
    rating: row.rating === null ? 'Non notée' : row.rating.toFixed(1),
    ratingScale: row.rating === null ? '' : '10',
    ratingSource: row.rating === null ? undefined : 'IMDb',
    synopsis: 'Synopsis non disponible.',
    officialUrl: `https://www.imdb.com/title/${row.tconst}/`,
  };
}

/** Filtre et pagine les résultats directement dans l’index SQLite IMDb. */
function imdbCataloguePagePayload(
  database: SqliteDatabase,
  page: number,
  type: string,
  genre: string,
  year: string,
  rating: string,
  query: string,
  cursor?: number,
) {
  const clauses = ['1 = 1'];
  const parameters: (string | number)[] = [];
  if (type === 'film') clauses.push("t.type = 'Film'");
  if (type === 'series') clauses.push("t.type = 'Série'");
  if (genre !== 'all') {
    clauses.push("instr(',' || t.genres || ',', ',' || ? || ',') > 0");
    parameters.push(genre);
  }
  if (year.startsWith('year:')) {
    clauses.push('t.release_year = ?');
    parameters.push(Number(year.slice(5)));
  } else if (year.startsWith('decade:')) {
    const decade = Number(year.slice(7));
    clauses.push('t.release_year BETWEEN ? AND ?');
    parameters.push(decade, decade + 9);
  }
  if (rating !== 'all') {
    clauses.push('ROUND(t.rating / 2.0) / 2.0 = ?');
    parameters.push(Number(rating));
  }

  const normalizedQuery = normalizeTitle(query);
  const ftsQuery = normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(' ');
  if (ftsQuery) {
    clauses.push('t.tconst IN (SELECT tconst FROM title_search WHERE title_search MATCH ?)');
    parameters.push(ftsQuery);
  }

  const whereClause = clauses.join(' AND ');
  const total = Number((database.prepare(`SELECT COUNT(*) AS count FROM titles t WHERE ${whereClause}`).get(...parameters) as { count: number }).count);
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const cursorClause = cursor === undefined ? '' : 'AND o.sort_order > ?';
  const rowParameters = cursor === undefined ? [...parameters] : [...parameters, cursor];
  const selectedRows = database.prepare(`
    SELECT t.tconst, t.title, t.type, t.release_year, t.genres, t.rating, t.votes, o.sort_order
    FROM titles t
    JOIN title_order o ON o.tconst = t.tconst
    WHERE ${whereClause} ${cursorClause}
    ORDER BY o.sort_order
    LIMIT ?
  `).all(...rowParameters, pageSize + 1) as unknown as ImdbMediaRow[];
  const hasNext = selectedRows.length > pageSize;
  const rows = selectedRows.slice(0, pageSize);

  const genreRows = database.prepare("SELECT DISTINCT genres FROM titles WHERE genres <> ''").all() as { genres: string }[];
  const genres = [...new Set(genreRows.flatMap((row) => row.genres.split(',').filter(Boolean)))].sort((first, second) => first.localeCompare(second));
  const yearRows = database.prepare('SELECT DISTINCT release_year FROM titles WHERE release_year IS NOT NULL ORDER BY release_year DESC').all() as { release_year: number }[];
  return {
    items: rows.map(mapImdbRow),
    total,
    page: safePage,
    pageSize,
    totalPages,
    genres,
    years: yearRows.map((row) => String(row.release_year)),
    isBuilding: false,
    nextCursor: hasNext ? rows.at(-1)?.sort_order ?? null : null,
  };
}

/** Répond sur l’état de préparation du catalogue. */
app.get('/catalogue-status', (_req, res) => {
  const cached = searchCache.get('default:all');
  res.json({
    building: Boolean(defaultCatalogueBuild),
    ready: Boolean(getImdbDatabase() || cached && cached.expiresAt > Date.now()),
  });
});

/** Renvoie la fiche d’un média à partir de son identifiant. */
app.get('/catalogue-item/:id', async (req, res) => {
  const id = typeof req.params['id'] === 'string' ? req.params['id'] : '';
  if (id.startsWith('imdb-')) {
    const database = getImdbDatabase();
    if (!database) {
      res.status(404).json({ error: 'Index IMDb absent.' });
      return;
    }
    const row = database.prepare(`
      SELECT tconst, title, type, release_year, genres, rating, votes
      FROM titles WHERE tconst = ?
    `).get(id.slice(5)) as unknown as ImdbMediaRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'Média introuvable.' });
      return;
    }
    res.json(mapImdbRow(row));
    return;
  }

  const cachedMedia = [...searchCache.values()]
    .flatMap((cached) => cached.medias)
    .find((media) => media.id === id);
  if (cachedMedia) {
    res.json(cachedMedia);
    return;
  }
  const preview = await (defaultCataloguePreview ??= getQuickCatalogue());
  const media = preview.find((item) => item.id === id);
  if (media) res.json(media);
  else res.status(404).json({ error: 'Média introuvable.' });
});

interface WikipediaArtworkRequest {
  id: string;
  title: string;
  type: string;
  hasPoster: boolean;
  hasRating: boolean;
}

interface WikipediaArtwork {
  id: string;
  poster?: string;
  rating?: string;
  ratingScale?: number;
  ratingSource?: string;
}

const wikipediaArtworkCache = new Map<string, { expiresAt: number; artwork: WikipediaArtwork | null }>();

/** Complète les médias reçus avec leurs affiches et notes Wikipédia. */
app.post('/catalogue-wikipedia-artwork', async (req, res) => {
  const requested = req.body?.medias;
  if (!Array.isArray(requested) || requested.length > 50 || requested.some((item) =>
    typeof item?.id !== 'string' || item.id.length > 120
    || typeof item?.title !== 'string' || !item.title.trim() || item.title.length > 200
    || typeof item?.type !== 'string' || item.type.length > 16
    || typeof item.hasPoster !== 'boolean'
    || typeof item.hasRating !== 'boolean'
  )) {
    res.status(400).json({ error: 'Liste de médias invalide.' });
    return;
  }

  const items = requested as WikipediaArtworkRequest[];
  const now = Date.now();
  const results = new Map<string, WikipediaArtwork>();
  const uncached = items.filter((item) => {
    const cached = wikipediaArtworkCache.get(item.id);
    if (!cached || cached.expiresAt <= now) return true;
    if (cached.artwork) results.set(item.id, cached.artwork);
    return false;
  });
  const needsWikipedia = uncached.filter((item) => !item.hasPoster || !item.hasRating);
  const batches = Array.from({ length: Math.ceil(needsWikipedia.length / 20) }, (_, index) =>
    needsWikipedia.slice(index * 20, (index + 1) * 20)
  );

  try {
    const batchResults = await mapConcurrent(batches, 2, async (batch) => {
      const params = new URLSearchParams({
        action: 'query',
        titles: batch.map((item) => item.title).join('|'),
        prop: 'pageimages|pageprops',
        piprop: 'thumbnail',
        pithumbsize: '500',
        redirects: '1',
        format: 'json',
      });
      const response = await fetchWikipedia(`https://en.wikipedia.org/w/api.php?${params}`, 10000);
      if (!response.ok) return [];

      const data = await response.json() as WikiSearchResponse;
      const pages = Object.values(data.query?.pages ?? {});
      const findPage = (title: string) => pages.find((page) => {
        const pageTitle = normalizeTitle(page.title.replace(/\s+\([^)]*\)$/, ''));
        return pageTitle === normalizeTitle(title);
      });
      const missingDataItems = batch
        .filter((item) => !item.hasRating || !item.hasPoster)
        .map((item) => ({ item, pageId: findPage(item.title)?.pageprops?.wikibase_item }));
      const wikidataIds = await mapConcurrent(missingDataItems, 3, async ({ item, pageId }) => {
        if (pageId) return pageId;
        const type = (item.type === 'Film' ? 'Film' : 'Série') as 'Film' | 'Série';
        return await findWikidataMediaId(item.title, type, 'en').catch(() => undefined);
      });
      const missingDataWikidataIds = wikidataIds.filter((id): id is string => Boolean(id));
      const wikidataMetadata = missingDataWikidataIds.length
        ? await getWikidataFilmMetadata(missingDataWikidataIds, 'en').catch(() => new Map())
        : new Map();

      return batch.map((item) => {
        const page = findPage(item.title);
        const poster = page?.thumbnail?.source || (page?.pageprops?.page_image
          ? `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(page.pageprops.page_image)}?width=500`
          : undefined);
        const itemIndex = batch.indexOf(item);
        const wikidataId = page?.pageprops?.wikibase_item || wikidataIds[itemIndex];
        const metadata = wikidataId ? wikidataMetadata.get(wikidataId) : undefined;
        const posterUrl = poster || metadata?.poster;
        const artwork: WikipediaArtwork = {
          id: item.id,
          ...(!item.hasPoster && posterUrl ? { poster: posterUrl } : {}),
          ...(!item.hasRating && metadata?.rating ? {
            rating: metadata.rating,
            ratingScale: 10,
            ratingSource: metadata.ratingSource || 'Wikidata',
          } : {}),
        };
        const hasArtwork = Boolean(artwork.poster || artwork.rating);
        wikipediaArtworkCache.set(item.id, {
          artwork: hasArtwork ? artwork : null,
          expiresAt: now + (hasArtwork ? 30 : 3) * 24 * 60 * 60 * 1000,
        });
        return hasArtwork ? artwork : undefined;
      }).filter((artwork): artwork is WikipediaArtwork => Boolean(artwork));
    });

    for (const artwork of batchResults.flat()) results.set(artwork.id, artwork);
    while (wikipediaArtworkCache.size > 10000) {
      const oldest = wikipediaArtworkCache.keys().next().value;
      if (oldest === undefined) break;
      wikipediaArtworkCache.delete(oldest);
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.json([...results.values()]);
  } catch (error) {
    console.warn('Unable to enrich IMDb page from Wikipedia:', error);
    res.json([...results.values()]);
  }
});

/** Sert les médias du catalogue, avec recherche, filtres et pagination. */
app.get('/catalogue-data', async (req, res) => {
  const query = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';
  const requestedType = typeof req.query['type'] === 'string' ? req.query['type'] : 'all';
  const paginated = req.query['page'] !== undefined;
  const requestedPage = Math.max(1, Number.parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const requestedGenre = typeof req.query['genre'] === 'string' ? req.query['genre'] : 'all';
  const requestedYear = typeof req.query['year'] === 'string' ? req.query['year'] : 'all';
  const requestedRating = typeof req.query['rating'] === 'string' ? req.query['rating'] : 'all';
  const cursorValue = typeof req.query['cursor'] === 'string' ? Number(req.query['cursor']) : undefined;
  const requestedCursor = Number.isSafeInteger(cursorValue) && Number(cursorValue) > 0 ? Number(cursorValue) : undefined;
  if (query && query.length < 2) {
    res.status(400).json({ error: 'Saisis au moins deux caractères pour rechercher.' });
    return;
  }

  const imdbDatabase = paginated ? getImdbDatabase() : undefined;
  if (imdbDatabase) {
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json(imdbCataloguePagePayload(
      imdbDatabase,
      requestedPage,
      requestedType,
      requestedGenre,
      requestedYear,
      requestedRating,
      query,
      requestedCursor,
    ));
    return;
  }

  if (!query) {
    const cachedCatalogue = searchCache.get('default:all');
    if (cachedCatalogue && cachedCatalogue.expiresAt > Date.now()) {
      const medias = ensureCuratedFilms(cachedCatalogue.medias);
      searchCache.set('default:all', { medias, expiresAt: cachedCatalogue.expiresAt });
      res.setHeader('Cache-Control', 'no-store');
      res.json(paginated
        ? cataloguePagePayload(medias, requestedPage, requestedType, requestedGenre, requestedYear, requestedRating, false)
        : medias);
      return;
    }

    try {
      if (paginated) {
        void beginDefaultCatalogueBuild();
        defaultCataloguePreview ??= getQuickCatalogue();
        const preview = ensureCuratedFilms(await defaultCataloguePreview);
        const completedCatalogue = searchCache.get('default:all');
        const fullCatalogueReady = Boolean(completedCatalogue && completedCatalogue.expiresAt > Date.now());
        const medias = fullCatalogueReady ? completedCatalogue!.medias : preview;
        res.setHeader('Cache-Control', 'no-store');
        res.json(cataloguePagePayload(
          medias,
          requestedPage,
          requestedType,
          requestedGenre,
          requestedYear,
          requestedRating,
          !fullCatalogueReady,
        ));
        return;
      }

      const medias = ensureCuratedFilms(await getDefaultCatalogue());
      if (medias.some((media) => media.type === 'Film')) {
        searchCache.set('default:all', { medias, expiresAt: Date.now() + 10 * 60 * 1000 });
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json(paginated
        ? cataloguePagePayload(medias, requestedPage, requestedType, requestedGenre, requestedYear, requestedRating, false)
        : medias);
    } catch (error) {
      console.error('Unable to load default catalogue:', error);
      res.status(502).json({ error: 'Impossible de charger le catalogue depuis les API publiques.' });
    }
    return;
  }

  const type = ['film', 'series'].includes(requestedType) ? requestedType : 'all';
  const cacheKey = `${type}:${query.toLocaleLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.medias);
    return;
  }

  try {
    const tasks: Promise<CatalogueMedia[]>[] = [];
    if (type !== 'film') tasks.push(searchSeries(query));
    if (type !== 'series') tasks.push(searchFilms(query));
    if (type !== 'film') tasks.push(searchTmdb(query, 'tv'));
    if (type !== 'series') tasks.push(searchTmdb(query, 'movie'));
    const results = await Promise.allSettled(tasks);
    const foundMedias = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    const medias = [...new Map(foundMedias.map((media) => [
      catalogueMediaKey(media),
      media,
    ])).values()];
    if (medias.length === 0) {
      res.status(502).json({ error: 'Aucun résultat accessible depuis les sources publiques.' });
      return;
    }

    await fillMissingCatalogGenres(medias);
    await fillMissingCatalogSynopses(medias);
    searchCache.set(cacheKey, { medias, expiresAt: Date.now() + 5 * 60 * 1000 });
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(paginated
      ? cataloguePagePayload(medias, requestedPage, requestedType, requestedGenre, requestedYear, requestedRating, false)
      : medias);
  } catch (error) {
    console.error('Public catalog search failed:', error);
    res.status(502).json({ error: 'Les sources publiques sont momentanément indisponibles.' });
  }
});

/** Renvoie la sélection de médias utilisée pour les affiches mises en avant. */
app.get('/featured-posters', async (_req, res) => {
  if (featuredPostersCache && featuredPostersCache.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(featuredPostersCache.medias);
    return;
  }

  try {
    featuredPostersRequest ??= (async () => {
      const tmdbPage = (kind: 'movie' | 'tv') => hasTmdbCredentials()
        ? fetchTmdb<TmdbListResponse>(`${kind}/popular`, new URLSearchParams({ language: 'fr-FR', page: '1' }), 5000)
        : Promise.resolve({ results: [] });
      const tvmazePage = fetch('https://api.tvmaze.com/shows?page=0', { signal: AbortSignal.timeout(8000) })
        .then(async (response) => {
          if (!response.ok) throw new Error(`TVmaze returned HTTP ${response.status}`);
          return await response.json() as TvMazeShow[];
        });

      const [moviesResult, seriesResult, tvmazeResult] = await Promise.allSettled([
        tmdbPage('movie'),
        tmdbPage('tv'),
        tvmazePage,
      ]);
      const candidates: CatalogueMedia[] = [];
      for (const [kind, result] of [['movie', moviesResult], ['tv', seriesResult]] as const) {
        if (result.status !== 'fulfilled') continue;
        candidates.push(...(result.value.results ?? [])
          .filter((item) => Number(item.vote_average) > 8)
          .map((item) => mapTmdbMedia(item, kind, new Map()))
          .filter((media): media is CatalogueMedia => Boolean(media))
          .map((media) => ({ ...media, poster: media.poster.replace('/w500/', '/w342/') })));
      }
      if (tvmazeResult.status === 'fulfilled') {
        candidates.push(...tvmazeResult.value
          .filter((show) => Number(show.rating.average) > 8 && Boolean(show.image?.medium || show.image?.original))
          .map((show) => ({
            id: `series-${show.id}`,
            title: show.name,
            poster: show.image?.medium || show.image?.original || '',
            type: 'Série',
            featured: false,
            genre: '',
            releaseYear: show.premiered?.slice(0, 4) || 'Inconnue',
            rating: show.rating.average?.toFixed(1) || '',
            ratingScale: '10',
            ratingSource: 'TVmaze',
            synopsis: '',
            officialUrl: show.officialSite || show.url,
          })));
      }

      candidates.push(...getCuratedFilms());
      return [...new Map(candidates
        .filter((media) => media.poster && Number(media.rating) / Number(media.ratingScale || 10) > 0.8)
        .map((media) => [catalogueMediaKey(media), media])).values()];
    })();

    const medias = await featuredPostersRequest;
    featuredPostersCache = { medias, expiresAt: Date.now() + 5 * 60 * 1000 };
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(medias);
  } catch (error) {
    console.error('Unable to load homepage posters:', error);
    res.status(502).json({ error: 'Impossible de charger les affiches de la page d’accueil.' });
  } finally {
    featuredPostersRequest = undefined;
  }
});

/** Envoie une demande Gemini au serveur sans exposer la clé API au navigateur. */
app.post('/chatbot-gemini', async (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  const apiKey = process.env['GOOGLE_STUDIO_API_KEY']?.trim();
  if (!prompt || prompt.length > 30000) {
    res.status(400).json({ error: 'Prompt invalide.' });
    return;
  }
  if (!apiKey) {
    res.status(503).json({ error: 'Le service de recommandations IA n’est pas configuré.' });
    return;
  }

  const now = Date.now();
  const clientId = req.ip || req.socket.remoteAddress || 'unknown';
  if (geminiRateLimits.size > 1000) {
    for (const [id, entry] of geminiRateLimits) {
      if (entry.resetAt <= now) geminiRateLimits.delete(id);
    }
  }
  const limit = geminiRateLimits.get(clientId);
  if (!limit || limit.resetAt <= now) {
    geminiRateLimits.set(clientId, { count: 1, resetAt: now + 60_000 });
  } else if (limit.count >= 10) {
    res.setHeader('Retry-After', String(Math.ceil((limit.resetAt - now) / 1000)));
    res.status(429).json({ error: 'Trop de demandes. Réessaie dans une minute.' });
    return;
  } else {
    limit.count++;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 700 },
        }),
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!response.ok) {
      res.status(502).json({ error: 'Le service de recommandations IA est indisponible.' });
      return;
    }

    const payload = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    res.setHeader('Cache-Control', 'no-store');
    res.json({ text });
  } catch (error) {
    console.error('Gemini recommendation request failed:', error);
    res.status(502).json({ error: 'Le service de recommandations IA est momentanément indisponible.' });
  }
});

app.post('/media-trailers', async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const type = req.body?.type;
  const year = typeof req.body?.year === 'string' ? req.body.year : '';
  if (!title || title.length > 200 || !['Film', 'Série'].includes(type)) {
    res.status(400).json({ error: 'Film ou série invalide.' });
    return;
  }

  if (!process.env['YOUTUBE_API_KEY']?.trim() && !process.env['TMDB_API_KEY']?.trim()) {
    res.json({ configured: false, trailers: [] });
    return;
  }

  const cacheKey = `${type}:${title}:${year}`;
  const cached = mediaTrailersCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json({ configured: true, trailers: cached.trailers });
    return;
  }

  try {
    const trailers = await findYouTubeTrailers(title, year);
    mediaTrailersCache.set(cacheKey, { trailers, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.json({ configured: true, trailers });
  } catch (error) {
    console.error('Unable to load trailers from TMDB:', error);
    res.status(502).json({ error: 'Les bandes-annonces sont momentanément indisponibles.' });
  }
});

/** Cherche une playlist YouTube de bande originale pour un média. */
app.post('/media-soundtrack-playlist', async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const type = typeof req.body?.type === 'string' ? req.body.type : '';
  if (!title || title.length > 200 || type.length > 16) {
    res.status(400).json({ error: 'Film ou série invalide.' });
    return;
  }

  const apiKey = process.env['YOUTUBE_API_KEY']?.trim() || process.env['TMDB_API_KEY']?.trim();
  if (!apiKey) {
    res.json({ configured: false, playlist: null });
    return;
  }

  const cacheKey = `${type}:${title}`;
  const cached = mediaSoundtrackPlaylistCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json({ configured: true, playlist: cached.playlist });
    return;
  }

  try {
    const playlist = await findYouTubeSoundtrackPlaylist(title, type, apiKey);
    mediaSoundtrackPlaylistCache.set(cacheKey, { playlist, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.json({ configured: true, playlist });
  } catch (error) {
    console.error('Unable to load soundtrack playlist from YouTube:', error);
    res.status(502).json({ error: 'La recherche de playlist YouTube est momentanément indisponible.' });
  }
});

/** Renvoie les informations complémentaires d’un film ou d’une série. */
app.post('/media-extra', async (req, res) => {
  const id = typeof req.body?.id === 'string' ? req.body.id : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const type = req.body?.type;
  const language = req.body?.language;
  const mediaType = type === 'Film'
    ? 'Film'
    : typeof type === 'string' && type.length <= 16 && /^s.*rie$/iu.test(type)
      ? 'Série'
      : undefined;
  if (!title || title.length > 200 || id.length > 120
    || !mediaType
    || !isSupportedLanguage(language)) {
    res.status(400).json({ error: 'Film, série ou langue invalide.' });
    return;
  }

  const cacheKey = `details-v2:${id}:${title}:${mediaType}:${language}`;
  const cached = mediaExtraCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.extra);
    return;
  }

  try {
    const extra = await getCompleteMediaExtra(id, title, mediaType, language);
    const hasUsefulDetails = Boolean(extra.director || extra.creator || extra.country || extra.awards?.length);
    const maxAge = hasUsefulDetails ? 24 * 60 * 60 : 5 * 60;
    mediaExtraCache.set(cacheKey, { extra, expiresAt: Date.now() + maxAge * 1000 });
    res.setHeader('Cache-Control', `private, max-age=${maxAge}`);
    res.json(extra);
  } catch (error) {
    console.error('Unable to load film details from Wikidata:', error);
    res.status(502).json({ error: 'Les informations complémentaires sont indisponibles.' });
  }
});

/** Recherche un synopsis pour un média dans la langue demandée. */
app.post('/media-synopsis', async (req, res) => {
  const id = typeof req.body?.id === 'string' ? req.body.id : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const type = req.body?.type;
  const language = req.body?.language;
  if (!title || title.length > 200 || id.length > 120
    || !['Film', 'Série'].includes(type)
    || !isSupportedLanguage(language)) {
    res.status(400).json({ error: 'Film, série ou langue invalide.' });
    return;
  }

  const cacheKey = `${id}:${title}:${type}:${language}`;
  const cached = mediaSynopsisCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json({ synopsis: cached.synopsis });
    return;
  }

  try {
    const synopsis = await getMediaSynopsis(id, title, type as 'Film' | 'Série', language);
    mediaSynopsisCache.set(cacheKey, {
      synopsis,
      expiresAt: Date.now() + (synopsis ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000),
    });
    res.setHeader('Cache-Control', synopsis ? 'private, max-age=86400' : 'private, max-age=300');
    res.json({ synopsis });
  } catch (error) {
    console.error('Unable to find an alternate-language synopsis:', error);
    res.status(502).json({ error: 'Le synopsis est momentanément indisponible.' });
  }
});

/** Traduit le texte reçu et renvoie le résultat au navigateur. */
app.post('/translate-synopsis', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const target = req.body?.target;
  if (!text || text.length > 3000 || !isSupportedLanguage(target)) {
    res.status(400).json({ error: 'Synopsis ou langue invalide.' });
    return;
  }

  try {
    const translation = await translateSynopsis(text, target);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.json({ translation });
  } catch (error) {
    console.error('Synopsis translation failed:', error);
    res.status(502).json({ error: 'La traduction du synopsis est momentanément indisponible.' });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

export interface Media {
  id: string;
  title: string;
  posterUrl: string;
  poster: string;
  officialUrl: string;
  genre: string;
  releaseYear: string;
  rating: string;
  ratingScale?: number;
  ratingSource?: string;
  wikidataId?: string;
  director?: string;
  directorPhoto?: string;
  creator?: string;
  creatorPhoto?: string;
  country?: string;
  countryFlag?: string;
  type: 'Film' | 'Série';
  synopsis: string;
}

export interface MediaAward {
  name: string;
  type: 'received' | 'nomination';
  year?: string;
}

export interface MediaTrailer {
  key: string;
  language: 'fr' | 'en';
  title: string;
}

export interface SpotifyTrack {
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  previewUrl?: string;
  externalUrl?: string;
  position?: number;
}

export interface MediaSoundtrackPlaylist {
  id: string;
  title: string;
  channelTitle?: string;
}

export interface MediaWikipediaBio {
  title: string;
  extract: string;
  url: string;
}

export interface MediaArtwork {
  id: string;
  poster?: string;
  rating?: string;
  ratingScale?: number;
  ratingSource?: string;
}

export interface SourceMedia extends Omit<Media, 'posterUrl' | 'ratingScale'> {
  ratingScale: string;
}

export type MediaExtra = Pick<Media, 'director' | 'directorPhoto' | 'creator' | 'creatorPhoto' | 'country' | 'countryFlag'> & {
  awards?: MediaAward[];
};

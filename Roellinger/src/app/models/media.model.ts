export interface Media {
  id: number;
  title?: string;       // Titre pour les films
  name?: string;        // Titre pour les séries
  overview: string;
  poster_path: string;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  media_type?: 'movie' | 'tv';
}

export interface TmdbResponse {
  page: number;
  results: Media[];
  total_pages: number;
  total_results: number;
}
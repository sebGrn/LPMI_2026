import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TmdbService } from '../../services/tmdb';
import { Media } from '../../models/media.model';

@Component({
  selector: 'app-media-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './media-list.html',
  styleUrls: ['./media-list.css']
})
export class MediaListComponent implements OnInit {
  medias: Media[] = [];
  searchQuery: string = '';
  activeFilter: 'movies' | 'series' = 'movies';

  constructor(private tmdbService: TmdbService) {}

  ngOnInit(): void {
    this.loadMovies();
  }

  loadMovies(): void {
    this.activeFilter = 'movies';
    this.tmdbService.getPopularMovies().subscribe(res => {
      this.medias = res.results.map(m => ({ ...m, media_type: 'movie' }));
    });
  }

  loadSeries(): void {
    this.activeFilter = 'series';
    this.tmdbService.getPopularSeries().subscribe(res => {
      this.medias = res.results.map(m => ({ ...m, media_type: 'tv' }));
    });
  }

  onSearch(): void {
    if (this.searchQuery.trim() === '') {
      this.loadMovies();
      return;
    }
    this.tmdbService.searchMedia(this.searchQuery).subscribe(res => {
      this.medias = res.results.filter(item => item.poster_path != null);
    });
  }

  getImageUrl(posterPath: string): string {
    return posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : 'https://via.placeholder.com/500x750?text=Pas+d+image';
  }
}
export class MediaList {}

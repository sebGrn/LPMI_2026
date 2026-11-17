import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TmdbService } from '../../services/tmdb';
import { Media } from '../../models/media.model';

@Component({
  selector: 'app-media-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './media-detail.html',
  styleUrls: ['./media-detail.css']
})
export class MediaDetailComponent implements OnInit {
  media: Media | null = null;
  isLoading = true;
  errorMessage: string | null = null;
  canRetry = false;

  private mediaId: number | null = null;
  private mediaType: 'movie' | 'tv' = 'movie';

  constructor(
    private route: ActivatedRoute,
    private tmdbService: TmdbService
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const type = this.route.snapshot.paramMap.get('type');

    if (!Number.isInteger(id) || id <= 0 || (type !== 'movie' && type !== 'tv')) {
      this.isLoading = false;
      this.errorMessage = 'Les détails de ce film ou de cette série ne sont pas disponibles.';
      return;
    }

    this.mediaId = id;
    this.mediaType = type;
    this.loadDetails();
  }

  loadDetails(): void {
    if (this.mediaId === null) return;

    this.isLoading = true;
    this.errorMessage = null;
    this.canRetry = false;
    this.media = null;

    this.tmdbService.getMediaDetails(this.mediaId, this.mediaType).subscribe({
      next: data => {
        this.media = data;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.canRetry = true;
        this.errorMessage = 'Impossible de charger les détails. Vérifiez votre connexion puis réessayez.';
      }
    });
  }

  getImageUrl(posterPath: string | undefined): string {
    return posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : '';
  }
}
export class MediaDetail {}

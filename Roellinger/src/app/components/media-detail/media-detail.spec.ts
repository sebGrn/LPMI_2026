import { ComponentFixture, TestBed } from '@angular/core/testing';
import { convertToParamMap, ActivatedRoute } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { Media } from '../../models/media.model';
import { TmdbService } from '../../services/tmdb';
import { MediaDetailComponent } from './media-detail';

describe('MediaDetailComponent', () => {
  let fixture: ComponentFixture<MediaDetailComponent>;
  let detailsResult: Observable<Media>;

  const media: Media = {
    id: 42,
    title: 'Film de test',
    overview: 'Un synopsis.',
    poster_path: '/poster.jpg',
    vote_average: 8.2
  };

  beforeEach(async () => {
    detailsResult = of(media);

    await TestBed.configureTestingModule({
      imports: [MediaDetailComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '42', type: 'movie' }) } }
        },
        { provide: TmdbService, useValue: { getMediaDetails: () => detailsResult } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MediaDetailComponent);
  });

  it('shows the film details after they load', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Film de test');
    expect(fixture.nativeElement.textContent).toContain('Un synopsis.');
  });

  it('shows an error instead of leaving a blank screen when loading fails', () => {
    detailsResult = throwError(() => new Error('Network error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Impossible de charger les détails');
  });
});

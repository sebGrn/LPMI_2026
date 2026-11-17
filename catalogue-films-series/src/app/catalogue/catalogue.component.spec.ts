import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CatalogueComponent } from './catalogue.component';
import { MediaService } from '../services/media.service';
import { LanguageService } from '../services/language.service';
import { SynopsisTranslationService } from '../services/synopsis-translation.service';

describe('CatalogueComponent', () => {
  let fixture: ComponentFixture<CatalogueComponent>;
  let component: CatalogueComponent;
  let mediaService: {
    getCataloguePage: ReturnType<typeof vi.fn>;
    getMediaArtwork: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mediaService = { getCataloguePage: vi.fn().mockReturnValue(of({
      items: [{
        id: 'film-1',
        title: 'Test Movie',
        posterUrl: 'https://example.com/poster.jpg',
        poster: 'https://example.com/poster.jpg',
        officialUrl: 'https://example.com',
        genre: 'Action, Drama',
        releaseYear: '2024',
        rating: '4.5',
        ratingScale: 5,
        type: 'Film',
        synopsis: 'A short synopsis.'
      }],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
      genres: ['Action', 'Drama'],
      years: ['2024'],
      isBuilding: false,
    })), getMediaArtwork: vi.fn().mockReturnValue(of([])) };

    await TestBed.configureTestingModule({
      imports: [CatalogueComponent],
      providers: [
        { provide: MediaService, useValue: mediaService },
        {
          provide: LanguageService,
          useValue: {
            language: signal<'fr' | 'en'>('fr'),
            t: (key: string) => key,
            genre: (value: string) => value,
            mediaType: (value: string) => value,
          },
        },
        {
          provide: SynopsisTranslationService,
          useValue: {
            translate: vi.fn().mockReturnValue(of({ translation: 'Translated synopsis.' })),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CatalogueComponent);
    component = fixture.componentInstance;
  });

  it('should not simulate a fake loading delay on the catalogue', () => {
    component.ngOnInit();

    expect(component.loadingEstimateLabel()).toBe('');
  });
});

describe('MediaService pagination cursor', () => {
  let service: MediaService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MediaService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MediaService);
    http = TestBed.inject(HttpTestingController);
  });

  it('sends the cursor with the next page request', () => {
    service.getCataloguePage({
      page: 2,
      query: '',
      type: 'all',
      genre: 'all',
      year: 'all',
      rating: 'all',
      cursor: 50,
    }).subscribe();

    const request = http.expectOne((candidate) => candidate.url === '/catalogue-data');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('cursor')).toBe('50');
    request.flush({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 1, genres: [], years: [], isBuilding: false });
    http.verify();
  });
});

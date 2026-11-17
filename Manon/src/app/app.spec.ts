import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { App } from './app';

describe('App', () => {
  let httpTestingController: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the main title after loading data', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const filmsRequest = httpTestingController.expectOne('http://127.0.0.1:8000/films');
    filmsRequest.flush([
      {
        id: 1,
        title: 'Inception',
        release_date: '2010-07-16',
        vote_average: 8.8,
        poster_path: null,
      },
    ]);

    const seriesRequest = httpTestingController.expectOne('http://127.0.0.1:8000/series');
    seriesRequest.flush([
      {
        id: 2,
        name: 'Dark',
        first_air_date: '2017-12-01',
        vote_average: 8.7,
        poster_path: null,
      },
    ]);

    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Mon Catalogue');
  });
});

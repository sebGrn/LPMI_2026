
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { FicheFilm } from './fiche-film';

describe('FicheFilm', () => {
  let component: FicheFilm;
  let fixture: ComponentFixture<FicheFilm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FicheFilm],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FicheFilm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

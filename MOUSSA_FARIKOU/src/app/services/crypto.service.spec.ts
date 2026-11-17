import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CryptoService } from './crypto.service';
import { baseURL } from '../shared/baseurl';
import { CRYPTOS } from '../shared/cryptos';

describe('CryptoService', () => {
  let service: CryptoService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CryptoService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getCryptos() asks the JSON server for the cryptos', () => {
    let result: any;
    service.getCryptos().subscribe(cryptos => result = cryptos);
    httpMock.expectOne(baseURL + 'cryptos').flush(CRYPTOS);
    expect(result.length).toBe(4);
  });

  it('getFeaturedCrypto() returns the first featured crypto', () => {
    let result: any;
    service.getFeaturedCrypto().subscribe(crypto => result = crypto);
    httpMock.expectOne(baseURL + 'cryptos?featured=true').flush([CRYPTOS[1]]);
    expect(result.name).toBe('Ethereum');
  });

  it('getCryptoIds() returns the ids of all cryptos', () => {
    let result: any;
    service.getCryptoIds().subscribe(ids => result = ids);
    httpMock.expectOne(baseURL + 'cryptos').flush(CRYPTOS);
    expect(result).toEqual(['0', '1', '2', '3']);
  });
});

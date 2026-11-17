import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PriceService } from './price.service';
import { CRYPTOS } from '../shared/cryptos';

describe('PriceService', () => {
  let service: PriceService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PriceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('withLivePrices() replaces the stored price by the CoinGecko price', () => {
    let result: any;
    service.withLivePrices(CRYPTOS).subscribe(cryptos => result = cryptos);
    const req = httpMock.expectOne(r => r.url.includes('simple/price') && r.url.includes('bitcoin,ethereum,solana,cardano'));
    req.flush({ bitcoin: { eur: 50000, eur_24h_change: -1.5 } });
    expect(result[0].price).toBe(50000);
    expect(result[0].change24h).toBe(-1.5);
    expect(result[0].live).toBe(true);
    // no price received for Ethereum: the stored price is kept
    expect(result[1].price).toBe(2400);
    expect(result[1].live).toBeUndefined();
  });

  it('getLivePrices() calls the API only once per minute for the same cryptos', () => {
    service.getLivePrices(['bitcoin']).subscribe();
    service.getLivePrices(['bitcoin']).subscribe();
    httpMock.expectOne(r => r.url.includes('ids=bitcoin&')).flush({ bitcoin: { eur: 1, eur_24h_change: 0 } });
  });

  it('withLivePrices() keeps the stored prices when the API fails', () => {
    let result: any;
    service.withLivePrices(CRYPTOS).subscribe(cryptos => result = cryptos);
    httpMock.expectOne(r => r.url.includes('simple/price'))
      .flush('error', { status: 500, statusText: 'Server Error' });
    expect(result).toEqual(CRYPTOS);
  });
});

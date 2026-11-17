import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { CryptoService } from '../crypto.service';
import { CoinChart, PriceHistory } from './coin-chart';

const mocks = vi.hoisted(() => ({ charts: [] as any[] }));
vi.mock('chart.js', () => ({
  Chart: class {
    static register() {}
    data: any;
    options: any;
    update = vi.fn();
    destroy = vi.fn();
    constructor(_canvas: unknown, config: any) {
      this.data = config.data;
      this.options = config.options;
      mocks.charts.push(this);
    }
  },
  Filler: {}, LineController: {}, LineElement: {}, LinearScale: {}, PointElement: {}, Tooltip: {},
}));

const coin = {
  product_id: 'BTC-EUR', name: 'Bitcoin', symbol: 'BTC', price: 60000,
  change_24h: 2.5, high_24h: 61000, low_24h: 59000, updated_at: '2026-10-19T07:00:00Z',
};
const history: PriceHistory = {
  product_id: 'BTC-EUR', period: 'day', start: 1792360800, end: 1792393200,
  granularity: 300, points: [{ time: 1792361100, price: 58000 }, { time: 1792393200, price: 60000 }],
};

describe('Coin chart', () => {
  let fixture: ComponentFixture<CoinChart>;
  let http: HttpTestingController;
  const crypto = { coins: signal([coin]), status: signal('live') };

  beforeEach(async () => {
    mocks.charts.length = 0;
    crypto.coins.set([coin]);
    await TestBed.configureTestingModule({
      imports: [CoinChart],
      providers: [provideHttpClient(), provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: coin }, { provide: CryptoService, useValue: crypto }],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CoinChart);
    fixture.detectChanges();
  });

  afterEach(() => { fixture.destroy(); http.verify(); });

  it('requests today in the browser timezone and renders the returned prices', async () => {
    const request = http.expectOne(r => r.url === '/api/history/BTC-EUR');
    expect(request.request.params.get('period')).toBe('day');
    expect(request.request.params.get('timezone')).toBeTruthy();
    request.flush(history);
    await fixture.whenStable();
    expect(fixture.componentInstance.points().length).toBe(2);
    expect(mocks.charts[0].data.datasets[0].data[0].y).toBe(58000);
    expect(fixture.nativeElement.querySelectorAll('.periods button').length).toBe(5);
  });

  it('cancels stale requests when switching periods quickly', async () => {
    const day = http.expectOne(r => r.params.get('period') === 'day');
    fixture.componentInstance.selectPeriod('week');
    expect(day.cancelled).toBe(true);
    const week = http.expectOne(r => r.params.get('period') === 'week');
    fixture.componentInstance.selectPeriod('max');
    expect(week.cancelled).toBe(true);
    http.expectOne(r => r.params.get('period') === 'max').flush({ ...history, period: 'max' });
    await fixture.whenStable();
    expect(fixture.componentInstance.period()).toBe('max');
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('shows upstream errors and allows retrying', async () => {
    http.expectOne(r => r.params.get('period') === 'day').flush(
      { detail: 'Historique Coinbase indisponible.' }, { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Historique Coinbase indisponible.');
    fixture.componentInstance.load();
    http.expectOne(r => r.params.get('period') === 'day').flush({ ...history, points: [] });
    await fixture.whenStable();
    expect(fixture.componentInstance.error()).toBe('');
  });

  it('keeps live closes across intervals without duplicating timestamps', async () => {
    http.expectOne(r => r.params.get('period') === 'day').flush(history);
    await fixture.whenStable();
    const end = history.end;
    const tick = async (offset: number, price: number) => {
      crypto.coins.set([{ ...coin, price, updated_at: new Date((end + offset) * 1000).toISOString() }]);
      await fixture.whenStable();
    };
    await tick(10, 60010);
    await tick(20, 60020);
    await tick(320, 60320);
    const points = fixture.componentInstance.points();
    expect(points.slice(-2).map(p => p.price)).toEqual([60020, 60320]);
    expect(new Set(points.map(p => p.time)).size).toBe(points.length);
  });

  it('destroys the chart when the dialog closes', () => {
    http.expectOne(r => r.params.get('period') === 'day').flush(history);
    fixture.destroy();
    expect(mocks.charts[0].destroy).toHaveBeenCalled();
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { signal } from '@angular/core';
import { App } from './app';
import { CryptoService } from './crypto.service';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

const bitcoin = {
  product_id: 'BTC-EUR', name: 'Bitcoin', symbol: 'BTC', price: 60000,
  change_24h: 2.5, high_24h: 61000, low_24h: 59000,
  updated_at: '2026-10-19T07:00:00Z',
};

describe('Crypto dashboard', () => {
  const crypto = { coins: signal([bitcoin]), status: signal('live'), reconnect: vi.fn() };

  beforeEach(async () => {
    crypto.coins.set([bitcoin]);
    crypto.status.set('live');
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(), { provide: CryptoService, useValue: crypto }],
    }).compileComponents();
  });

  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    http.match('/api/assistant/status').forEach(request => request.flush({
      available: false, model: 'qwen3:4b-instruct', message: 'Ollama arrêté.',
    }));
    http.verify();
  });

  it('displays a received price and filters the table', async () => {
    const harness = await RouterTestingHarness.create('/');
    const view = harness.routeNativeElement!;
    expect(view.querySelector('h1')?.textContent).toContain('Le marché, en direct.');
    expect(view.querySelector('table')?.textContent).toContain('Bitcoin');
    const search = view.querySelector('input')!;
    search.value = 'solana';
    search.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(view.querySelector('table')?.textContent).toContain('Aucune crypto');
    expect(view.querySelector('table')?.textContent).not.toContain('Bitcoin');
  });

  it('marks cached prices as disconnected when the feed stops', async () => {
    const harness = await RouterTestingHarness.create('/');
    crypto.status.set('reconnecting');
    harness.detectChanges();
    const view = harness.routeNativeElement!;
    expect(view.querySelector('.connection')?.textContent).toContain('Reconnexion');
    expect(view.querySelector('.notice')?.textContent).toContain('dernières valeurs reçues');
    expect(view.querySelector('table')?.textContent).toContain('Bitcoin');
  });
});

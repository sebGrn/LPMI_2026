import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MarketAssistant } from './market-assistant';

const ready = { available: true, model: 'qwen3:4b-instruct', message: 'Prêt.' };
const result = {
  answer: 'BTC : recul observé. <img src=x onerror=alert(1)>', model: 'qwen3:4b-instruct',
  generated_at: '2026-10-20T07:00:00Z', truncated: false,
  evidence: {
    source: 'Coinbase Exchange', collected_at: '2026-10-20T06:59:50Z',
    period: 'month', feed_status: 'live', assets: [],
  },
};

describe('Market assistant', () => {
  let fixture: ComponentFixture<MarketAssistant>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarketAssistant], providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MarketAssistant);
    fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });

  it('disables analysis when the local model is unavailable and can refresh status', async () => {
    http.expectOne('/api/assistant/status').flush({ available: false, model: 'qwen3:4b-instruct', message: 'Ollama arrêté.' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Ollama arrêté.');
    fixture.componentInstance.checkStatus();
    http.expectOne('/api/assistant/status').flush(ready);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(false);
  });

  it('sends a question and period, prevents duplicate submissions and renders model text safely', async () => {
    http.expectOne('/api/assistant/status').flush(ready);
    fixture.componentInstance.question = '  Compare BTC et ETH.  ';
    fixture.componentInstance.analyze();
    fixture.componentInstance.analyze();
    const request = http.expectOne('/api/assistant/analyze');
    expect(request.request.body.question).toBe('Compare BTC et ETH.');
    expect(request.request.body.period).toBe('month');
    expect(request.request.body.model).toBeUndefined();
    request.flush(result);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.answer').textContent).toContain('<img');
    expect(fixture.nativeElement.querySelector('.answer img')).toBeNull();
    expect(fixture.componentInstance.busy()).toBe(false);
    // Changing the form must not relabel an already generated answer.
    fixture.componentInstance.period = 'year';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.result-heading').textContent).toContain('Dernier mois');
  });

  it('shows a failed analysis without breaking the form', async () => {
    http.expectOne('/api/assistant/status').flush(ready);
    fixture.componentInstance.analyze();
    http.expectOne('/api/assistant/analyze').flush({ detail: 'Modèle indisponible.' }, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Modèle indisponible.');
    expect(fixture.componentInstance.busy()).toBe(false);
    expect(fixture.componentInstance.result()).toBeNull();
  });
});

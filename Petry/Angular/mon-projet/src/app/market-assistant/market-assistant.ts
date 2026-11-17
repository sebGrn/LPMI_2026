import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Subscription, timeout } from 'rxjs';

interface AssistantStatus { available: boolean; model: string; message: string; }
interface AssetEvidence {
  product_id: string;
  name: string;
  symbol: string;
  last_quote: { price_eur: number; received_at: string; stale: boolean } | null;
  history: {
    available: boolean; reason?: string; samples?: number; start?: number; end?: number;
    return_pct?: number; max_drawdown_pct?: number; volatility_pct_per_interval?: number;
    interval_seconds?: number; gap_count?: number;
  };
}
export interface AnalysisResult {
  answer: string; model: string; generated_at: string; truncated: boolean;
  evidence: { source: string; collected_at: string; period: string; feed_status: string; assets: AssetEvidence[] };
}

@Component({
  selector: 'app-market-assistant',
  imports: [FormsModule, CurrencyPipe, DatePipe, DecimalPipe, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './market-assistant.html',
  styleUrl: './market-assistant.scss',
})
export class MarketAssistant implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  readonly status = signal<AssistantStatus | null>(null);
  readonly checking = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly result = signal<AnalysisResult | null>(null);
  readonly answeredQuestion = signal('');
  question = 'Compare les quatre cryptomonnaies : tendances observées, risques et points à vérifier avant un investissement.';
  period = 'month';
  readonly periodLabels: Record<string, string> = { week: '7 derniers jours', month: 'Dernier mois', year: 'Dernière année' };
  private statusRequest?: Subscription;
  private analysisRequest?: Subscription;

  ngOnInit(): void { this.checkStatus(); }

  checkStatus(): void {
    this.statusRequest?.unsubscribe();
    this.checking.set(true);
    this.statusRequest = this.http.get<AssistantStatus>('/api/assistant/status').pipe(timeout(8000)).subscribe({
      next: status => { this.status.set(status); this.checking.set(false); },
      error: () => {
        this.status.set({ available: false, model: '', message: 'Serveur Python inaccessible. Vérifiez son démarrage puis actualisez.' });
        this.checking.set(false);
      },
    });
  }

  analyze(): void {
    const question = this.question.trim();
    if (this.busy() || !this.status()?.available || question.length < 3 || question.length > 2000) return;
    this.busy.set(true);
    this.error.set('');
    this.result.set(null);
    this.answeredQuestion.set(question);
    this.analysisRequest = this.http.post<AnalysisResult>('/api/assistant/analyze', {
      question, period: this.period, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    }).pipe(timeout(260000)).subscribe({
      next: result => { this.result.set(result); this.busy.set(false); },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(typeof error.error?.detail === 'string' ? error.error.detail :
          'L’analyse n’a pas abouti. Vérifiez Ollama et le serveur Python puis réessayez.');
      },
    });
  }

  ngOnDestroy(): void {
    this.statusRequest?.unsubscribe();
    this.analysisRequest?.unsubscribe();
  }
}

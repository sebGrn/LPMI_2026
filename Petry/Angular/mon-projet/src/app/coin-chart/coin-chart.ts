import {
  AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, effect, inject, signal, untracked,
} from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Subscription } from 'rxjs';
import {
  Chart, Filler, LineController, LineElement, LinearScale, PointElement, Tooltip,
} from 'chart.js';
import { Coin, CryptoService } from '../crypto.service';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Filler);

export type HistoryPeriod = 'day' | 'week' | 'month' | 'year' | 'max';
export interface HistoryPoint { time: number; price: number; }
export interface PriceHistory {
  product_id: string;
  period: HistoryPeriod;
  start: number;
  end: number;
  granularity: number;
  points: HistoryPoint[];
}

@Component({
  selector: 'app-coin-chart',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, MatDialogModule, MatButtonModule],
  templateUrl: './coin-chart.html',
  styleUrl: './coin-chart.scss',
})
export class CoinChart implements AfterViewInit, OnDestroy {
  readonly coin = inject<Coin>(MAT_DIALOG_DATA);
  readonly crypto = inject(CryptoService);
  private readonly http = inject(HttpClient);
  readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  readonly periods: { value: HistoryPeriod; label: string }[] = [
    { value: 'day', label: 'Aujourd’hui' }, { value: 'week', label: '7 jours' },
    { value: 'month', label: '1 mois' }, { value: 'year', label: '1 an' },
    { value: 'max', label: 'Max' },
  ];
  readonly period = signal<HistoryPeriod>('day');
  readonly history = signal<PriceHistory | null>(null);
  private readonly livePoints = signal<HistoryPoint[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly showData = signal(false);
  readonly currentCoin = computed(() => this.crypto.coins().find(c => c.product_id === this.coin.product_id) ?? this.coin);
  readonly points = computed(() => {
    const history = this.history();
    if (!history) return [];
    const points = [...history.points];
    for (const point of this.livePoints()) {
      const last = points.at(-1);
      if (last && last.time === point.time) points[points.length - 1] = point;
      else if (!last || point.time > last.time) points.push(point);
    }
    return points;
  });
  readonly change = computed(() => {
    const points = this.points();
    return points.length > 1 ? (points.at(-1)!.price / points[0].price - 1) * 100 : null;
  });
  readonly intervalLabel = computed(() => ({
    300: '5 minutes', 3600: '1 heure', 21600: '6 heures', 86400: '1 jour',
  })[this.history()?.granularity ?? 300]);
  @ViewChild('canvas', { static: true }) private canvas!: ElementRef<HTMLCanvasElement>;
  private chart?: Chart<'line', { x: number; y: number }[]>;
  private request?: Subscription;
  private dayTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const history = this.history();
      const coin = this.currentCoin();
      if (!history) return;
      const time = Math.floor(Date.parse(coin.updated_at) / 1000);
      if (time < history.start || time < (history.points.at(-1)?.time ?? 0)) return;
      untracked(() => this.livePoints.update(points => {
        const last = points.at(-1);
        if (last && time < last.time) return points;
        const point = { time, price: coin.price };
        // Keep one close per live interval while the dialog remains open.
        return last && Math.floor(last.time / history.granularity) === Math.floor(time / history.granularity)
          ? [...points.slice(0, -1), point] : [...points, point];
      }));
    });
    effect(() => {
      const points = this.points();
      const history = this.history();
      const period = this.period();
      if (this.chart) this.updateChart(points, history, period);
    });
  }

  ngAfterViewInit(): void {
    this.chart = new Chart(this.canvas.nativeElement, {
      type: 'line',
      data: { datasets: [{
        label: 'Cours en EUR', data: [], borderColor: '#137d70',
        backgroundColor: 'rgba(19,125,112,0.08)', fill: true,
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0,
      }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        parsing: false, normalized: true,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: { tooltip: { callbacks: {
          title: items => items.length ? new Intl.DateTimeFormat('fr-FR', {
            dateStyle: 'medium', timeStyle: 'short', timeZone: this.timezone,
          }).format(items[0].parsed.x!) : '',
          label: item => new Intl.NumberFormat('fr-FR', {
            style: 'currency', currency: 'EUR', maximumFractionDigits: 4,
          }).format(item.parsed.y!),
        } } },
        scales: {
          x: { type: 'linear', grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
          y: { grace: '5%', grid: { color: '#edf1f3' }, border: { display: false }, ticks: {
            maxTicksLimit: 6, includeBounds: false,
            callback: value => new Intl.NumberFormat('fr-FR', {
              style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 2,
            }).format(Number(value)),
          } },
        },
      },
    });
    this.load();
    this.scheduleNewDay();
  }

  selectPeriod(period: HistoryPeriod): void {
    if (this.period() === period) return;
    this.period.set(period);
    this.load();
  }

  load(): void {
    this.request?.unsubscribe();
    this.history.set(null);
    this.livePoints.set([]);
    this.loading.set(true);
    this.error.set('');
    this.showData.set(false);
    this.request = this.http.get<PriceHistory>(`/api/history/${encodeURIComponent(this.coin.product_id)}`, {
      params: { period: this.period(), timezone: this.timezone },
    }).subscribe({
      next: history => { this.history.set(history); this.loading.set(false); },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(typeof error.error?.detail === 'string' ? error.error.detail :
          'Impossible de charger l’historique. Vérifiez la connexion au serveur puis réessayez.');
      },
    });
  }

  private updateChart(points: HistoryPoint[], history: PriceHistory | null, period: HistoryPeriod): void {
    const chart = this.chart!;
    chart.data.datasets[0].data = points.map(p => ({ x: p.time * 1000, y: p.price }));
    chart.data.datasets[0].pointRadius = points.length === 1 ? 3 : 0;
    chart.data.datasets[0].spanGaps = (history?.granularity ?? 300) * 1500;
    const x = chart.options.scales!['x']!;
    // Max starts at the first actual Coinbase quote, rather than at the search floor.
    x.min = history ? (period === 'max' && points.length ? points[0].time : history.start) * 1000 : undefined;
    x.max = history ? Math.max(history.end, points.at(-1)?.time ?? 0) * 1000 : undefined;
    const y = chart.options.scales!['y']!;
    const prices = points.map(point => point.price);
    if (prices.length) {
      const low = Math.min(...prices), high = Math.max(...prices);
      const padding = (high - low || high * 0.02) * 0.05;
      y.min = Math.max(0, low - padding);
      y.max = high + padding;
    } else {
      y.min = undefined;
      y.max = undefined;
    }
    x.ticks!.callback = value => new Intl.DateTimeFormat('fr-FR', {
      ...(period === 'day' ? { hour: '2-digit', minute: '2-digit' } :
        period === 'max' ? { year: 'numeric' } : { day: '2-digit', month: 'short' }),
      timeZone: this.timezone,
    }).format(Number(value));
    chart.update('none');
  }

  private scheduleNewDay(): void {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    this.dayTimer = setTimeout(() => {
      if (this.period() === 'day') this.load();
      this.scheduleNewDay();
    }, midnight.getTime() - Date.now() + 1000);
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
    clearTimeout(this.dayTimer);
    this.chart?.destroy();
  }
}

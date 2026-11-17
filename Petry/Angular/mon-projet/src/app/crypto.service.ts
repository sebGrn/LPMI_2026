import { Injectable, OnDestroy, signal } from '@angular/core';

export interface Coin {
  product_id: string;
  name: string;
  symbol: string;
  price: number;
  change_24h: number | null;
  high_24h: number | null;
  low_24h: number | null;
  updated_at: string;
}

interface Snapshot {
  status: 'live' | 'reconnecting';
  coins: Coin[];
}

@Injectable({ providedIn: 'root' })
export class CryptoService implements OnDestroy {
  readonly coins = signal<Coin[]>([]);
  readonly status = signal<'connecting' | 'live' | 'reconnecting'>('connecting');
  private socket?: WebSocket;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setTimeout>;
  private delay = 1000;
  private destroyed = false;

  constructor() {
    this.connect();
  }

  reconnect(): void {
    this.delay = 1000;
    this.connect();
  }

  private connect(): void {
    this.cleanup();
    this.status.set(this.coins().length ? 'reconnecting' : 'connecting');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws/prices`);
    this.socket = socket;
    const watch = () => {
      clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => socket.close(), 10000);
    };
    watch();
    socket.onmessage = (event) => {
      try {
        const snapshot = JSON.parse(event.data) as Snapshot;
        if (!Array.isArray(snapshot.coins) || !['live', 'reconnecting'].includes(snapshot.status)) {
          throw new Error('Invalid market snapshot');
        }
        this.coins.set(snapshot.coins);
        this.status.set(snapshot.status);
        this.delay = 1000;
        watch();
      } catch {
        socket.close();
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      clearTimeout(this.watchdog);
      this.status.set('reconnecting');
      if (!this.destroyed) {
        this.retryTimer = setTimeout(() => this.connect(), this.delay);
        this.delay = Math.min(this.delay * 2, 30000);
      }
    };
  }

  private cleanup(): void {
    clearTimeout(this.retryTimer);
    clearTimeout(this.watchdog);
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.close();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cleanup();
  }
}

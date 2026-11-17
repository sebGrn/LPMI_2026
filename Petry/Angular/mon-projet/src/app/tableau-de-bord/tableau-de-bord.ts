import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { Coin, CryptoService } from '../crypto.service';
import { MatDialog } from '@angular/material/dialog';
import { MarketAssistant } from '../market-assistant/market-assistant';

@Component({
  selector: 'app-tableau-de-bord',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, MatButtonModule, MatFormFieldModule, MatInputModule, MatTableModule, MarketAssistant],
  templateUrl: './tableau-de-bord.html',
  styleUrl: './tableau-de-bord.scss',
})
export class TableauDeBord {
  readonly crypto = inject(CryptoService);
  private readonly dialog = inject(MatDialog);
  readonly search = signal('');
  readonly columns = ['asset', 'price', 'change', 'low', 'high', 'updated'];
  readonly filteredCoins = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('fr');
    return this.crypto.coins().filter(coin =>
      `${coin.name} ${coin.symbol}`.toLocaleLowerCase('fr').includes(query));
  });
  async openChart(coin: Coin): Promise<void> {
    const { CoinChart } = await import('../coin-chart/coin-chart');
    this.dialog.open(CoinChart, {
      data: coin, width: '1040px', maxWidth: '96vw', autoFocus: 'first-tabbable',
      ariaLabel: `Historique du cours de ${coin.name}`,
    });
  }

  readonly statusLabel = computed(() => ({
    connecting: 'Connexion en cours',
    live: 'Flux connecté',
    reconnecting: 'Reconnexion en cours',
  })[this.crypto.status()]);
}

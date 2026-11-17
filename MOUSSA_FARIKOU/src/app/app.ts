import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Header } from './header/header';
import { Footer } from './footer/footer';

@Component({
  imports: [RouterOutlet, MatToolbarModule, Header, Footer],
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('cours-angular');
}

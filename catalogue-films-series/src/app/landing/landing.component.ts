import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-landing',
  standalone: true,
  template: `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; text-align: center;">
      <h1 style="font-size: 2.5rem; margin-bottom: 2rem;">Catalogue de Films et Séries</h1>
      <button type="button" (click)="onEnter.emit()" style="padding: 12px 32px; font-size: 1.2rem; cursor: pointer; border-radius: 6px; border: none; background-color: #007bff; color: white; font-weight: bold;">
        Entrer
      </button>
    </div>
  `
})
export class LandingComponent {
  @Output() onEnter = new EventEmitter<void>();
}
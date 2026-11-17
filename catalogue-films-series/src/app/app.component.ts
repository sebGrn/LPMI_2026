import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Language, LanguageService } from './services/language.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'catalogue-films-series';
  readonly i18n = inject(LanguageService);
  isLanguageMenuOpen = false;
  readonly languageOptions: { code: Language; label: string; flag: string }[] = [
    { code: 'en', label: 'English', flag: '/language-flags/en.svg' },
    { code: 'zh', label: '中文 (普通话)', flag: '/language-flags/zh.svg' },
    { code: 'hi', label: 'हिन्दी', flag: '/language-flags/hi.svg' },
    { code: 'es', label: 'Español', flag: '/language-flags/es.svg' },
    { code: 'ar', label: 'العربية', flag: '/language-flags/ar.svg' },
    { code: 'fr', label: 'Français', flag: '/language-flags/fr.svg' },
    { code: 'bn', label: 'বাংলা', flag: '/language-flags/bn.svg' },
    { code: 'pt', label: 'Português', flag: '/language-flags/pt.svg' },
    { code: 'id', label: 'Bahasa Indonesia', flag: '/language-flags/id.svg' },
    { code: 'ur', label: 'اردو', flag: '/language-flags/ur.svg' },
    { code: 'ru', label: 'Русский', flag: '/language-flags/ru.svg' },
    { code: 'de', label: 'Deutsch', flag: '/language-flags/de.svg' },
    { code: 'it', label: 'Italiano', flag: '/language-flags/it.svg' },
    { code: 'pl', label: 'Polski', flag: '/language-flags/pl.svg' },
    { code: 'uk', label: 'Українська', flag: '/language-flags/ua.svg' },
  ];

  /** Renvoie les informations du bouton correspondant à la langue active. */
  get selectedLanguage(): { code: Language; label: string; flag: string } {
    return this.languageOptions.find(({ code }) => code === this.i18n.language())!;
  }

  /** Change la langue de l’interface et ferme le menu de sélection. */
  setLanguage(language: string): void {
    this.i18n.setLanguage(language);
    this.isLanguageMenuOpen = false;
  }

  @HostListener('document:click')
  /** Ferme le menu de langue après un clic dans la page. */
  closeLanguageMenu(): void {
    this.isLanguageMenuOpen = false;
  }

  @HostListener('document:keydown.escape')
  /** Ferme le menu de langue lorsque l’utilisateur appuie sur Échap. */
  closeLanguageMenuOnEscape(): void {
    this.isLanguageMenuOpen = false;
  }
}

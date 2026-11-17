import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MediaService } from '../services/media.service';
import { ChatMessage, ChatRecommendation, ChatbotService } from '../services/chatbot.service';
import { Media } from '../shared/media';

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './chatbot.component.html',
  styleUrl: './chatbot.component.scss',
})
export class ChatbotComponent implements OnInit {
  private readonly mediaService = inject(MediaService);
  private readonly chatbotService = inject(ChatbotService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly allMedias = signal<Media[]>([]);
  readonly isLoading = signal(true);
  readonly isThinking = signal(false);
  readonly recommendations = signal<ChatRecommendation[]>([]);
  readonly draft = signal('');
  readonly messages = signal<ChatMessage[]>([
    {
      role: 'bot',
      text: 'Salut ! Je peux t’aider à choisir un film ou une série. Donne-moi ton humeur, le type de contenu ou des mots-clés comme “mystère”, “rire”, “aventure” ou “amour”.',
    },
  ]);

  /** Charge les titres disponibles pour que le chatbot puisse les recommander. */
  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.mediaService.getMedias().subscribe({
      next: (medias) => {
        this.allMedias.set(medias);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  /** Envoie le message saisi et affiche la réponse et les recommandations. */
  async sendMessage(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.isThinking()) return;

    const conversation = this.messages();
    this.messages.update((current) => [...current, { role: 'user', text }]);
    this.draft.set('');
    this.isThinking.set(true);

    try {
      const result = await this.chatbotService.answerWithRecommendations(this.allMedias(), text, conversation);
      this.messages.update((current) => [...current, { role: 'bot', text: result.reply }]);
      this.recommendations.set(result.recommendations);
    } catch {
      this.messages.update((current) => [...current, {
        role: 'bot',
        text: 'Je n’arrive pas à traiter ta demande pour le moment. Réessaie dans un instant.',
      }]);
      this.recommendations.set([]);
    } finally {
      this.isThinking.set(false);
    }
  }

  /** Remplit le champ avec une suggestion puis l’envoie au chatbot. */
  quickPrompt(value: string): void {
    this.draft.set(value);
    void this.sendMessage();
  }
}

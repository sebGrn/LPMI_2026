import { Component, Input, signal, effect, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface CommentItem {
  id: string;
  mediaId: string;
  author: string;
  avatar: string; // URL ou image base64
  content: string;
  date: string;
}

@Component({
  selector: 'app-comments-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './comments-section.html',
  styleUrl: './comments-section.scss'
})
export class CommentsSectionComponent {
  @Input({ required: true }) mediaId!: string;

  readonly comments = signal<CommentItem[]>([]);
  authorInput = '';
  contentInput = '';

  // Avatars proposés par le site
  defaultAvatars: string[] = [
    'assets/images/inception.jpg',
    'https://api.dicebear.com/7.x/bottts/svg?seed=popcorn',
    'https://api.dicebear.com/7.x/bottts/svg?seed=cinema',
    'https://api.dicebear.com/7.x/bottts/svg?seed=movie'
  ];

  selectedAvatar: string = this.defaultAvatars[0];
  customAvatarPreview: string | null = null;
  errorMessage: string = '';

  private platformId = inject(PLATFORM_ID);

  /** Recharge les commentaires quand l’identifiant du média change. */
  constructor() {
    effect(() => {
      const currentMediaId = this.mediaId;
      if (currentMediaId && isPlatformBrowser(this.platformId)) {
        this.loadComments(currentMediaId);
      }
    });
  }

  /** Récupère les commentaires du média dans le stockage local du navigateur. */
  loadComments(mediaId: string) {
    const saved = localStorage.getItem(`media_comments_${mediaId}`);
    if (saved) {
      try {
        this.comments.set(JSON.parse(saved));
      } catch {
        this.comments.set([]);
      }
    } else {
      this.comments.set([]);
    }
  }

  /** Sélectionne un avatar fourni et efface l’aperçu personnalisé. */
  selectAvatar(avatarUrl: string) {
    this.selectedAvatar = avatarUrl;
    this.customAvatarPreview = null;
    this.errorMessage = '';
  }

  /** Valide le fichier choisi et prépare son aperçu comme avatar. */
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const maxSizeBytes = 2 * 1024 * 1024; // Limit à 2 Mo

    if (file.size > maxSizeBytes) {
      this.errorMessage = 'L\'image dépasse la taille maximale autorisée de 2 Mo.';
      input.value = '';
      return;
    }

    this.errorMessage = '';
    const reader = new FileReader();
    reader.onload = () => {
      this.customAvatarPreview = reader.result as string;
      this.selectedAvatar = this.customAvatarPreview;
    };
    reader.readAsDataURL(file);
  }

  /** Valide, enregistre et affiche le nouveau commentaire du média. */
  addComment(event: Event) {
    event.preventDefault();
    if (!this.authorInput.trim() || !this.contentInput.trim() || !this.mediaId) return;

    const newComment: CommentItem = {
      id: Date.now().toString(),
      mediaId: this.mediaId,
      author: this.authorInput.trim(),
      avatar: this.selectedAvatar,
      content: this.contentInput.trim(),
      date: new Date().toLocaleDateString() + ' à ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedComments = [newComment, ...this.comments()];
    this.comments.set(updatedComments);

    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(`media_comments_${this.mediaId}`, JSON.stringify(updatedComments));
    }

    this.authorInput = '';
    this.contentInput = '';
    this.customAvatarPreview = null;
    this.selectedAvatar = this.defaultAvatars[0];
  }
}

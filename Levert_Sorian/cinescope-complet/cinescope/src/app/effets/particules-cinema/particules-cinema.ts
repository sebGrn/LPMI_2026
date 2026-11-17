
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild
} from '@angular/core';

interface Braise {
  x: number;
  y: number;
  rayon: number;
  vitesse: number;
  opacite: number;
  phase: number;
}

@Component({
  selector: 'app-particules-cinema',
  imports: [],
  templateUrl: './particules-cinema.html',
  styleUrl: './particules-cinema.scss'
})
export class ParticulesCinema
  implements AfterViewInit, OnDestroy {

  @ViewChild('surface', { static: true })
  surface!: ElementRef<HTMLCanvasElement>;

  private contexte: CanvasRenderingContext2D | null = null;

  private largeur = 0;
  private hauteur = 0;
  private braises: Braise[] = [];

  private animationId: number | null = null;
  private derniereImage = 0;
  private enCours = false;
  private visible = false;

  private observeurTaille?: ResizeObserver;
  private observeurVisibilite?: IntersectionObserver;
  private mediaMouvement?: MediaQueryList;

  private changementVisibilite = () => this.gererAnimation();
  private changementMouvement = () => this.gererAnimation();

  ngAfterViewInit(): void {
    const canvas = this.surface.nativeElement;
    this.contexte = canvas.getContext('2d');

    if (!this.contexte) {
      return;
    }

    this.redimensionner();

    // Adapter le Canvas à la taille de l'écran
    this.observeurTaille = new ResizeObserver(() => {
      this.redimensionner();
    });

    this.observeurTaille.observe(canvas);

    // Animer uniquement quand le catalogue est visible
    this.observeurVisibilite = new IntersectionObserver(
      (entrees) => {
        this.visible = entrees[0]?.isIntersecting ?? false;
        this.gererAnimation();
      },
      { threshold: 0 }
    );

    this.observeurVisibilite.observe(
      canvas.parentElement ?? canvas
    );

    // Respecter les préférences d'accessibilité
    this.mediaMouvement = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    );

    this.mediaMouvement.addEventListener(
      'change',
      this.changementMouvement
    );

    document.addEventListener(
      'visibilitychange',
      this.changementVisibilite
    );

    this.gererAnimation();
  }

  private redimensionner(): void {
    const canvas = this.surface.nativeElement;

    const largeur = canvas.clientWidth;
    const hauteur = canvas.clientHeight;

    if (!largeur || !hauteur || !this.contexte) {
      return;
    }

    this.largeur = largeur;
    this.hauteur = hauteur;

    // Limiter la résolution pour conserver de bonnes performances
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      1.5
    );

    canvas.width = Math.round(largeur * ratio);
    canvas.height = Math.round(hauteur * ratio);

    this.contexte.setTransform(
      ratio, 0, 0, ratio, 0, 0
    );

    this.creerBraises();
    this.dessiner(0);
  }

  private creerBraises(): void {
    const nombre = Math.min(
      110,
      Math.max(40, Math.floor(this.largeur / 15))
    );

    this.braises = Array.from(
      { length: nombre },
      () => ({
        x: Math.random() * this.largeur,
        y: Math.random() * this.hauteur,
        rayon: 0.7 + Math.random() * 2,
        vitesse: 8 + Math.random() * 22,
        opacite: 0.25 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2
      })
    );
  }

  private gererAnimation(): void {
    const autorisee =
      this.visible &&
      !document.hidden &&
      !this.mediaMouvement?.matches;

    if (autorisee && !this.enCours) {
      this.enCours = true;
      this.derniereImage = 0;

      this.animationId = requestAnimationFrame(
        temps => this.animer(temps)
      );
    }

    if (!autorisee && this.enCours) {
      this.enCours = false;

      if (this.animationId !== null) {
        cancelAnimationFrame(this.animationId);
      }

      this.animationId = null;
    }

    if (this.mediaMouvement?.matches) {
      this.dessiner(0);
    }
  }

  private animer(temps: number): void {
    if (!this.enCours) {
      return;
    }

    const ecart = this.derniereImage
      ? temps - this.derniereImage
      : 34;

    // Environ 30 images par seconde
    if (ecart >= 32) {
      const delta = Math.min(ecart, 80) / 1000;

      for (const braise of this.braises) {
        braise.y -= braise.vitesse * delta;

        braise.x += Math.sin(
          temps * 0.0005 + braise.phase
        ) * 0.35;

        if (braise.y < -15) {
          braise.y = this.hauteur + 15;
          braise.x = Math.random() * this.largeur;
        }
      }

      this.dessiner(temps / 1000);
      this.derniereImage = temps;
    }

    this.animationId = requestAnimationFrame(
      t => this.animer(t)
    );
  }

  private dessiner(temps: number): void {
    const ctx = this.contexte;

    if (!ctx) {
      return;
    }

    ctx.clearRect(
      0, 0,
      this.largeur,
      this.hauteur
    );

    // ==================================
    // BRUME ROUGE ANIMEE
    // ==================================

    const brumes = [
      {
        x: this.largeur * 0.15,
        y: this.hauteur * 0.35,
        rayon: 270,
        couleur: 'rgba(210, 12, 45, 0.11)'
      },
      {
        x: this.largeur * 0.85,
        y: this.hauteur * 0.65,
        rayon: 320,
        couleur: 'rgba(135, 18, 85, 0.12)'
      }
    ];

    for (let i = 0; i < brumes.length; i++) {
      const brume = brumes[i];

      const x = brume.x +
        Math.sin(temps * 0.35 + i) * 90;

      const y = brume.y +
        Math.cos(temps * 0.27 + i) * 65;

      const gradient = ctx.createRadialGradient(
        x, y, 0,
        x, y, brume.rayon
      );

      gradient.addColorStop(0, brume.couleur);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient;

      ctx.fillRect(
        x - brume.rayon,
        y - brume.rayon,
        brume.rayon * 2,
        brume.rayon * 2
      );
    }

    // ==================================
    // BRAISES LUMINEUSES
    // ==================================

    ctx.globalCompositeOperation = 'lighter';

    for (const braise of this.braises) {
      const scintillement =
        0.8 + Math.sin(temps * 2 + braise.phase) * 0.2;

      ctx.globalAlpha =
        braise.opacite * scintillement;

      ctx.beginPath();

      ctx.arc(
        braise.x,
        braise.y,
        braise.rayon,
        0,
        Math.PI * 2
      );

      ctx.fillStyle = '#ff4555';
      ctx.shadowColor = '#ff283f';
      ctx.shadowBlur = 12;

      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  ngOnDestroy(): void {
    this.enCours = false;

    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }

    this.observeurTaille?.disconnect();
    this.observeurVisibilite?.disconnect();

    this.mediaMouvement?.removeEventListener(
      'change',
      this.changementMouvement
    );

    document.removeEventListener(
      'visibilitychange',
      this.changementVisibilite
    );
  }
}

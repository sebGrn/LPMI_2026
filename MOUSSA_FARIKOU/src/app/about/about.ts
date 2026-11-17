import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { ApiService } from '../services/api.service';

@Component({
  imports: [MatCardModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-about',
  styleUrl: './about.css',
  templateUrl: './about.html',
})
export class About implements OnInit {
  // Variable qui va stocker la donnée reçue
  donneeRecue: string = 'Chargement...';

  // Injection du service dans le constructeur
  constructor(private apiService: ApiService) {}

  ngOnInit() {
    // On s'abonne à l'Observable lors de l'initialisation du composant
    this.apiService.getValeurDuServeur().subscribe(
      (response) => {
        // On assigne la valeur du message JSON à notre variable
        this.donneeRecue = response.message;
      },
      (error) => {
        console.error("Erreur lors de la communication avec le serveur", error);
        this.donneeRecue = "Erreur de connexion au serveur.";
      }
    );
  }
}

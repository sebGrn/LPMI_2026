import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class FilmsService {

  films = [

    // ===== HORREUR : NOUVEAUTÉS =====

    {
      id: 1,
      titre: 'Evil Dead Burn',
      annee: 2026,
      genre: 'Horreur',
      affiche: 'https://m.media-amazon.com/images/M/MV5BN2ViOGVhMmQtNzY1OS00YzNhLTk0NmEtZDVjNDA2M2NkOWY5XkEyXkFqcGc%40._V1_.jpg'
    },
    {
      id: 2,
      titre: 'Malfaisante',
      annee: 2026,
      genre: 'Horreur',
      affiche: 'https://files.offi.fr/evenement/108052/images/1000/13d2f1bddc79799fafcc02790c9b25e8.jpg'
    },
    {
      id: 3,
      titre: 'Scream 7',
      annee: 2026,
      genre: 'Horreur',
      affiche: 'https://cdn.kinocheck.com/i/w%3D325/dpe4r68nui.jpg'
    },
    {
      id: 4,
      titre: 'Weapons',
      annee: 2025,
      genre: 'Horreur',
      affiche: 'https://i0.wp.com/tommygirard.wordpress.com/wp-content/uploads/2025/08/weapons-poster.jpg?fit=960%2C1200&ssl=1'
    },
    {
      id: 5,
      titre: "Conjuring : L'heure du jugement",
      annee: 2025,
      genre: 'Horreur',
      affiche: 'https://m.media-amazon.com/images/M/MV5BOGRhNWVhZWUtNWUzMi00ZWQ0LWI3YmUtNTk5YTNiNDRlNDEwXkEyXkFqcGc%40._V1_.jpg'
    },
    {
      id: 6,
      titre: 'Destination finale : Bloodlines',
      annee: 2025,
      genre: 'Horreur',
      affiche: 'https://images.squarespace-cdn.com/content/v1/5f6cf1a893e35255d4d7e89d/05c33f90-3a53-4d54-a739-c7318e92eebe/FNLBLO_INSTA_VERT_MAIN_1638x2048_DOM.jpg'
    },
    {
      id: 7,
      titre: 'Terrifier 3',
      annee: 2024,
      genre: 'Horreur',
      affiche: 'https://hips.hearstapps.com/hmg-prod/images/terrifier-3-cineverse-3-694aa06a55bdd.jpg'
    },
    {
      id: 8,
      titre: 'Smile 2',
      annee: 2024,
      genre: 'Horreur',
      affiche: 'https://www.horrorstock.com/cdn/shop/files/Smile_2_2024_Original_US_One_Sheet_Movie_Poster.jpg?v=1774526154'
    },
    {
      id: 9,
      titre: 'The Substance',
      annee: 2024,
      genre: 'Horreur',
      affiche: 'https://metrofilms.com/media/120x160-The-Substance-Elisabeth-25_09-HD.a61ba22f-3cb7-4f7f-8c7b-bbf647173bec.jpg'
    },
    {
      id: 10,
      titre: 'Longlegs',
      annee: 2024,
      genre: 'Horreur',
      affiche: 'https://www.movieposters.com/cdn/shop/files/scan_777c29d6-990d-4004-a93b-60c8e06a13bf_1024x1024.jpg?v=1762976772'
    },

    // ===== HORREUR : SAGAS ET CLASSIQUES =====

    {
      id: 11,
      titre: 'Evil Dead Rise',
      annee: 2023,
      genre: 'Horreur',
      affiche: 'https://m.media-amazon.com/images/M/MV5BMjM1ZmViMmYtOGYzZC00YzhmLWE0MTMtMzNjYzcyNjEwYWRkXkEyXkFqcGc%40._V1_.jpg'
    },
    {
      id: 12,
      titre: 'Saw X',
      annee: 2023,
      genre: 'Horreur',
      affiche: 'https://image.tmdb.org/t/p/w500/aQPeznSu7XDTrrdCtT5eLiu52Yu.jpg'
    },
    {
      id: 13,
      titre: 'Scream',
      annee: 1996,
      genre: 'Horreur',
      affiche: 'https://filmartgallery.com/cdn/shop/files/Scream-Vintage-Movie-Poster-Original_60fc0d45_5000x.jpg?v=1744686556'
    },
    {
      id: 14,
      titre: 'Insidious',
      annee: 2010,
      genre: 'Horreur',
      affiche: 'https://image.tmdb.org/t/p/w500/tmlDFIUpGRKiuWm9Ixc6CYDk4y0.jpg'
    },

    // ===== AUTRES GENRES =====

    {
      id: 15,
      titre: 'Interstellar',
      annee: 2014,
      genre: 'Science-fiction',
      affiche: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'
    },
    {
      id: 16,
      titre: 'Inception',
      annee: 2010,
      genre: 'Science-fiction',
      affiche: 'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg'
    },
    {
      id: 17,
      titre: 'The Batman',
      annee: 2022,
      genre: 'Action',
      affiche: 'https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg'
    },
    {
      id: 18,
      titre: 'Dune : Deuxième partie',
      annee: 2024,
      genre: 'Science-fiction',
      affiche: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg'
    },
    {
      id: 19,
      titre: 'Parasite',
      annee: 2019,
      genre: 'Thriller',
      affiche: 'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg'
    },
    {
      id: 20,
      titre: 'Spider-Man: Across the Spider-Verse',
      annee: 2023,
      genre: 'Animation',
      affiche: 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg'
    },
    
    // ===== ACTION =====

    {
      id: 21,
      titre: 'The Dark Knight',
      annee: 2008,
      genre: 'Action',
      affiche: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg'
    },
    {
      id: 22,
      titre: 'Avengers: Endgame',
      annee: 2019,
      genre: 'Action',
      affiche: 'https://image.tmdb.org/t/p/w500/ulzhLuWrPK07P1YkdWQLZnQh1JL.jpg'
    },
    {
      id: 23,
      titre: 'John Wick: Chapter 3 - Parabellum',
      annee: 2019,
      genre: 'Action',
      affiche: 'https://image.tmdb.org/t/p/w500/ziEuG1essDuWuC5lpWUaw1uXY2O.jpg'
    },
    {
      id: 24,
      titre: 'Mad Max: Fury Road',
      annee: 2015,
      genre: 'Action',
      affiche: 'https://image.tmdb.org/t/p/w500/8tZYtuWezp8JbcsvHYO0O46tFbo.jpg'
    },
    {
      id: 25,
      titre: 'Top Gun: Maverick',
      annee: 2022,
      genre: 'Action',
      affiche: 'https://image.tmdb.org/t/p/w500/62HCnUTziyWcpDaBO2i1DX17ljH.jpg'
    },
    {
      id: 26,
      titre: 'Gladiator',
      annee: 2000,
      genre: 'Action',
      affiche: 'https://image.tmdb.org/t/p/w500/ty8TGRuvJLPUmAR1H1nRIsgwvim.jpg'
    },

    // ===== THRILLER =====

    {
      id: 27,
      titre: 'Joker',
      annee: 2019,
      genre: 'Thriller',
      affiche: 'https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg'
    },
    {
      id: 28,
      titre: 'Fight Club',
      annee: 1999,
      genre: 'Thriller',
      affiche: 'https://image.tmdb.org/t/p/w500/2lECpi35Hnbpa4y46JX0aY3AWTy.jpg'
    },
    {
      id: 29,
      titre: 'Seven',
      annee: 1995,
      genre: 'Thriller',
      affiche: 'https://image.tmdb.org/t/p/w500/191nKfP0ehp3uIvWqgPbFmI4lv9.jpg'
    },
    {
      id: 30,
      titre: 'Le Prestige',
      annee: 2006,
      genre: 'Thriller',
      affiche: 'https://image.tmdb.org/t/p/w500/Ag2B2KHKQPukjH7WutmgnnSNurZ.jpg'
    },

    // ===== SCIENCE-FICTION =====

    {
      id: 31,
      titre: 'Seul sur Mars',
      annee: 2015,
      genre: 'Science-fiction',
      affiche: 'https://image.tmdb.org/t/p/w500/5BHuvQ6p9kfc091Z8RiFNhCwL4b.jpg'
    },
    {
      id: 32,
      titre: 'Blade Runner 2049',
      annee: 2017,
      genre: 'Science-fiction',
      affiche: 'https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg'
    },
    {
      id: 33,
      titre: 'Matrix',
      annee: 1999,
      genre: 'Science-fiction',
      affiche: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg'
    },
    {
      id: 34,
      titre: 'Avatar',
      annee: 2009,
      genre: 'Science-fiction',
      affiche: 'https://image.tmdb.org/t/p/w500/kyeqWdyUXW608qlYkRqosgbbJyK.jpg'
    },
    {
      id: 35,
      titre: 'Ready Player One',
      annee: 2018,
      genre: 'Science-fiction',
      affiche: 'https://image.tmdb.org/t/p/w500/pU1ULUq8D3iRxl1fdX2lZIzdHuI.jpg'
    },

    // ===== ANIMATION =====

    {
      id: 36,
      titre: 'Soul',
      annee: 2020,
      genre: 'Animation',
      affiche: 'https://image.tmdb.org/t/p/w500/hm58Jw4Lw8OIeECIq5qyPYhAeRJ.jpg'
    },
    {
      id: 37,
      titre: 'Coco',
      annee: 2017,
      genre: 'Animation',
      affiche: 'https://image.tmdb.org/t/p/w500/gGEsBPAijhVUFoiNpgZXqRVWJt2.jpg'
    },
    {
      id: 38,
      titre: 'Vice-Versa',
      annee: 2015,
      genre: 'Animation',
      affiche: 'https://image.tmdb.org/t/p/w500/2H1TmgdfNtsKlU9jKdeNyYL5y8T.jpg'
    },
    {
      id: 39,
      titre: 'Zootopie',
      annee: 2016,
      genre: 'Animation',
      affiche: 'https://image.tmdb.org/t/p/w500/hlK0e0wAQ3VLuJcsfIYPvb4JVud.jpg'
    },
    {
      id: 40,
      titre: 'Toy Story 4',
      annee: 2019,
      genre: 'Animation',
      affiche: 'https://image.tmdb.org/t/p/w500/w9kR8qbmQ01HwnvK4alvnQ2ca0L.jpg'
    },
    {
      id: 41,
      titre: 'Ratatouille',
      annee: 2007,
      genre: 'Animation',
      affiche: 'https://image.tmdb.org/t/p/w500/t3vaWRPSf6WjDSamIkKDs1iQWna.jpg'
    },

    // ===== DRAME =====

    {
      id: 42,
      titre: 'Forrest Gump',
      annee: 1994,
      genre: 'Drame',
      affiche: 'https://image.tmdb.org/t/p/w500/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg'
    },
    {
      id: 43,
      titre: 'Whiplash',
      annee: 2014,
      genre: 'Drame',
      affiche: 'https://image.tmdb.org/t/p/w500/7fn624j5lj3xTme2SgiLCeuedmO.jpg'
    },
    {
      id: 44,
      titre: 'La La Land',
      annee: 2016,
      genre: 'Drame',
      affiche: 'https://image.tmdb.org/t/p/w500/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg'
    },
    {
      id: 45,
      titre: 'La Ligne verte',
      annee: 1999,
      genre: 'Drame',
      affiche: 'https://image.tmdb.org/t/p/w500/8VG8fDNiy50H4FedGwdSVUPoaJe.jpg'
    },

    // ===== COMÉDIE =====

    {
      id: 46,
      titre: 'The Grand Budapest Hotel',
      annee: 2014,
      genre: 'Comédie',
      affiche: 'https://image.tmdb.org/t/p/w500/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg'
    },
    {
      id: 47,
      titre: 'Very Bad Trip',
      annee: 2009,
      genre: 'Comédie',
      affiche: 'https://image.tmdb.org/t/p/w500/uluhlXubGu1VxU63X9VHCLWDAYP.jpg'
    },

    // ===== FANTASTIQUE =====

    {
      id: 48,
      titre: "Harry Potter à l'école des sorciers",
      annee: 2001,
      genre: 'Fantastique',
      affiche: 'https://image.tmdb.org/t/p/w500/wuMc08IPKEatf9rnMNXvIDxqP4W.jpg'
    },
    {
      id: 49,
      titre: 'Le Seigneur des anneaux : La Communauté de l’anneau',
      annee: 2001,
      genre: 'Fantastique',
      affiche: 'https://image.tmdb.org/t/p/w500/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg'
    },
    {
      id: 50,
      titre: 'Pirates des Caraïbes : La Malédiction du Black Pearl',
      annee: 2003,
      genre: 'Fantastique',
      affiche: 'https://image.tmdb.org/t/p/w500/z8onk7LV9Mmw6zKz4hT6pzzvmvl.jpg'
    }

  ];

  trouverFilm(id: number) {
    return this.films.find(film => film.id === id);
  }

}
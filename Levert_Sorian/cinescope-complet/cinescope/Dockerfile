
# ETAPE 1 : Construire notre application Angular

FROM node:24-alpine AS construction

# Créer un dossier de travail
WORKDIR /app

# Copier les fichiers des dépendances
COPY package*.json ./

# Installer les dépendances Angular
RUN npm ci

# Copier notre projet
COPY . .

# Compiler Angular
RUN npm run build


# ETAPE 2 : Afficher le site avec Nginx

FROM nginx:alpine

# Copier notre configuration Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier le site Angular compilé
COPY --from=construction /app/dist/cinescope/browser /usr/share/nginx/html

# Le serveur utilise le port 80
EXPOSE 80

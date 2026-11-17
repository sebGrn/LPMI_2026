import { Injectable } from '@angular/core';
import { Media } from '../shared/media';

export interface ChatRecommendation {
  media: Media;
  score: number;
  reason: string;
}

interface RecommendationCriteria {
  type?: 'film' | 'serie';
  genres: string[];
  excludedGenres: string[];
  years: number[];
  yearMin?: number;
  yearMax?: number;
  yearPreference?: 'newer' | 'older';
  minimumRating?: number;
}

export interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}

interface WikipediaArticle {
  title: string;
  extract: string;
  wikidataId?: string;
}

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  /** Produit une réponse et des recommandations à partir du message de l’utilisateur. */
  async answerWithRecommendations(
    medias: Media[],
    userText: string,
    conversation: ChatMessage[] = [],
  ): Promise<{ reply: string; recommendations: ChatRecommendation[] }> {
    const previousMessages = conversation.filter((message) => message.role === 'user').slice(-4);
    const conversationText = [...previousMessages.map((message) => message.text), userText].join(' ');
    const wikipediaArticles = await this.searchWikipedia(userText);
    const wikipediaMatch = this.findWikipediaTitleMatch(medias, userText, wikipediaArticles);
    const normalizedRequest = this.normalizeSearchText(userText);
    const isInformationRequest = /\b(qui est|infos? sur|information sur|resume|synopsis de|date de sortie|realisateur de|acteurs de)\b/.test(normalizedRequest);
    const isExactCatalogueTitle = medias.some((media) => this.normalizeSearchText(media.title) === normalizedRequest);
    if (wikipediaMatch && (isInformationRequest || isExactCatalogueTitle)) {
      return {
        reply: `J’ai retrouvé ce titre grâce à Wikipedia : ${wikipediaMatch.media.title}.`,
        recommendations: [{
          media: wikipediaMatch.media,
          score: 100,
          reason: `Correspond au titre de l’article Wikipedia « ${wikipediaMatch.article.title} ».`,
        }],
      };
    }

    try {
      const aiReply = await this.askGemini(medias, userText, wikipediaArticles, conversation);
      if (aiReply) return aiReply;
    } catch {
      // Fallback local sans casser le chatbot.
    }

    const fallback = this.fallbackReply(medias, userText, conversationText);
    return {
      reply: fallback.reply,
      recommendations: fallback.recommendations,
    };
  }

  /** Cherche des articles Wikipédia correspondant à la demande. */
  private async searchWikipedia(query: string): Promise<WikipediaArticle[]> {
    try {
      const params = new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrsearch: query,
        gsrnamespace: '0',
        gsrlimit: '8',
        prop: 'extracts|pageprops',
        exintro: '1',
        explaintext: '1',
        exchars: '600',
        format: 'json',
        origin: '*',
      });
      const response = await fetch(`https://fr.wikipedia.org/w/api.php?${params}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return [];
      const result = await response.json();
      return Object.values(result?.query?.pages ?? {})
        .filter((page: any) => typeof page.extract === 'string' && page.extract.trim())
        .map((page: any) => ({
          title: page.title as string,
          extract: (page.extract as string).trim().slice(0, 600),
          wikidataId: page.pageprops?.wikibase_item as string | undefined,
        }));
    } catch {
      return [];
    }
  }

  /** Repère un média du catalogue correspondant exactement à un article Wikipédia. */
  private findWikipediaTitleMatch(
    medias: Media[],
    userText: string,
    articles: WikipediaArticle[],
  ): { media: Media; article: WikipediaArticle } | undefined {
    const query = this.normalizeSearchText(userText);
    for (const article of articles) {
      const articleTitle = this.normalizeSearchText(article.title.replace(/\s*\([^)]*\)$/, ''));
      if (!articleTitle || !query.includes(articleTitle)) continue;

      const media = medias.find((candidate) => {
        const candidateId = candidate.wikidataId?.match(/Q\d+/)?.[0];
        return Boolean(candidateId && article.wikidataId === candidateId)
          || this.normalizeSearchText(candidate.title) === articleTitle;
      });
      if (media) return { media, article };
    }
    return undefined;
  }

  /** Normalise le texte pour comparer titres et mots sans accents ni ponctuation. */
  private normalizeSearchText(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /** Demande à Gemini une réponse fondée sur les médias et articles trouvés. */
  private async askGemini(
    medias: Media[],
    userText: string,
    wikipediaArticles: WikipediaArticle[],
    conversation: ChatMessage[],
  ): Promise<{ reply: string; recommendations: ChatRecommendation[] } | null> {
    const prompt = this.buildPrompt(medias, userText, wikipediaArticles, conversation);
    const adaptivePrompt = `${prompt}

Échange récent :
${conversation.slice(-8).map((message) => `${message.role === 'user' ? 'Utilisateur' : 'Assistant'} : ${message.text}`).join('\n') || 'Aucun échange précédent.'}

Sois flexible : le dernier souhait peut remplacer les précédents. Comprends les demandes de suivi courtes en contexte, respecte les détails précis, signale les critères incompatibles et demande une précision quand le catalogue ne contient pas une information. Varie tes réponses et termine par une question courte pour poursuivre l’échange.`;
    const response = await fetch('/chatbot-gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: adaptivePrompt }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('Gemini request failed');

    const payload = await response.json() as { text?: string };
    const text = payload.text ?? '';
    if (!text.trim()) return null;

    const priorUserText = conversation.filter((message) => message.role === 'user').slice(-4).map((message) => message.text).join(' ');
    const criteria = this.extractCriteria(`${priorUserText} ${userText}`, userText);
    const aiRecommendations = this.parseGeminiRecommendations(text, medias)
      .filter((item) => this.matchesCriteria(item.media, criteria));
    const localRecommendations = this.fallbackReply(medias, userText, priorUserText).recommendations;
    const recommendations = aiRecommendations.length ? aiRecommendations : localRecommendations;
    return {
      reply: recommendations.length ? text : this.fallbackReply(medias, userText, priorUserText).reply,
      recommendations,
    };
  }

  /** Construit le prompt avec les titres pertinents et le contexte Wikipédia. */
  private buildPrompt(
    medias: Media[],
    userText: string,
    wikipediaArticles: WikipediaArticle[],
    conversation: ChatMessage[],
  ): string {
    const conversationContext = conversation.slice(-8).map((message) =>
      `${message.role === 'user' ? 'Utilisateur' : 'Assistant'} : ${message.text}`
    ).join('\n');
    const previousPreferences = conversation.filter((message) => message.role === 'user').slice(-4).map((message) => message.text).join(' ');
    const rankedMedias = this.rankMedias(medias, userText, wikipediaArticles, previousPreferences);
    const samples = rankedMedias.slice(0, 40).map((media) => {
      const synopsis = media.synopsis?.replace(/\s+/g, ' ').slice(0, 180) ?? '';
      return `${media.title} | ${media.type} | ${media.genre} | ${media.releaseYear} | note ${media.rating}/${media.ratingScale ?? 5} | ${media.country ?? ''} | ${media.director ?? media.creator ?? ''} | ${synopsis}`;
    }).join('\n');
    const wikipediaContext = wikipediaArticles.slice(0, 5).map((article) =>
      `${article.title}: ${article.extract}`
    ).join('\n');

    return `Tu es un assistant de recommandation cinéma/séries. L'utilisateur demande : "${userText}".
Utilise les résultats Wikipedia ci-dessous pour identifier le film ou la série recherché, lever les ambiguïtés de titre et mieux comprendre les descriptions. Ne recommande que des titres présents dans le catalogue.

Résultats Wikipedia :
${wikipediaContext || 'Aucun résultat Wikipedia pertinent.'}

Titres du catalogue les plus pertinents :
${samples}

Réponds en français. Donne 3 recommandations précises, avec pour chaque recommandation :
- titre
- pourquoi c'est adapté
- type

Format attendu :
1. Titre : ...
Pourquoi : ...
Type : ...

2. Titre : ...
Pourquoi : ...
Type : ...`;
  }

  /** Extrait jusqu’à trois médias du catalogue cités dans la réponse de Gemini. */
  private parseGeminiRecommendations(text: string, medias: Media[]): ChatRecommendation[] {
    const lines = text.split(/\n|\r/).map((line) => line.trim()).filter(Boolean);
    const recommendations: ChatRecommendation[] = [];

    for (const media of medias) {
      const normalizedTitle = this.normalizeSearchText(media.title);
      const mention = lines.find((line) => this.normalizeSearchText(line).includes(normalizedTitle));
      if (mention && !recommendations.some((item) => item.media.id === media.id)) {
        recommendations.push({
          media,
          score: 90,
          reason: mention,
        });
      }
    }

    return recommendations.slice(0, 3);
  }

  /** Classe les médias selon la demande et le contexte des articles trouvés. */
  private rankMedias(medias: Media[], userText: string, articles: WikipediaArticle[], context = ''): Media[] {
    const criteria = this.extractCriteria(`${context} ${userText}`, userText);
    const rankingText = criteria.yearPreference ? `${context} ${userText}`.replace(/\b(?:19|20)\d{2}\b/g, '') : `${context} ${userText}`;
    const queryTokens = this.searchTokens(rankingText);
    const articleTitles = articles.map((article) => this.normalizeSearchText(article.title.replace(/\s*\([^)]*\)$/, '')));
    const articleTokens = this.searchTokens(articles.map((article) => `${article.title} ${article.extract}`).join(' '));
    const normalizedQuery = this.normalizeSearchText(userText);

    return medias.map((media) => {
      const title = this.normalizeSearchText(media.title);
      const titleTokens = this.searchTokens(media.title);
      const metadataText = `${media.title} ${media.genre} ${media.synopsis} ${media.country ?? ''} ${media.director ?? ''} ${media.creator ?? ''}`;
      const normalizedMetadata = this.normalizeSearchText(metadataText);
      const metadata = this.searchTokens(metadataText);
      let score = articleTitles.some((articleTitle) => articleTitle === title) ? 100 : 0;
      if (title && normalizedQuery.includes(title)) score += 80;
      if (criteria.type) score += this.normalizeSearchText(media.type).startsWith(criteria.type) ? 45 : -100;
      for (const genre of criteria.genres) {
        if (this.genreMatches(normalizedMetadata, genre)) score += 30;
      }
      for (const genre of criteria.excludedGenres) {
        if (this.genreMatches(normalizedMetadata, genre)) score -= 60;
      }
      for (const year of criteria.years) {
        const releaseYear = Number(media.releaseYear);
        if (releaseYear === year) score += 35;
        else if (Number.isFinite(releaseYear)) score -= Math.min(20, Math.abs(releaseYear - year) / 2);
      }
      const releaseYear = Number(media.releaseYear);
      if (criteria.yearMin !== undefined) score += releaseYear >= criteria.yearMin ? 30 : -45;
      if (criteria.yearMax !== undefined) score += releaseYear <= criteria.yearMax ? 30 : -45;
      if (criteria.yearPreference === 'newer' && Number.isFinite(releaseYear)) score += releaseYear / 100;
      if (criteria.yearPreference === 'older' && Number.isFinite(releaseYear)) score -= releaseYear / 100;
      if (criteria.minimumRating !== undefined) {
        const rating = Number(media.rating);
        const scale = Number(media.ratingScale ?? 5);
        const ratingOnFive = Number.isFinite(rating) && Number.isFinite(scale) && scale > 0 ? rating * 5 / scale : null;
        score += ratingOnFive !== null && ratingOnFive >= criteria.minimumRating ? 20 : -15;
      }
      for (const token of queryTokens) {
        if (titleTokens.includes(token)) score += 12;
        else if (metadata.includes(token)) score += 4;
      }
      for (const token of articleTokens) {
        if (titleTokens.includes(token)) score += 5;
        else if (metadata.includes(token)) score += 1;
      }
      return { media, score };
    }).sort((first, second) => second.score - first.score)
      .map((item) => item.media);
  }

  /** Vérifie un genre avec ses variantes françaises et anglaises courantes. */
  private genreMatches(normalizedText: string, genre: string): boolean {
    const aliases: Record<string, string[]> = {
      'science fiction': ['science fiction', 'sci fi', 'sf'],
      action: ['action', 'combat'],
      aventure: ['aventure', 'adventure', 'exploration'],
      comedie: ['comedie', 'comedy', 'humour', 'fun'],
      drame: ['drame', 'drama', 'dramatic', 'emouvant'],
      horreur: ['horreur', 'horror', 'epouvante', 'peur'],
      thriller: ['thriller', 'suspense', 'tension'],
      mystere: ['mystere', 'mystery', 'enquete', 'enigme'],
      romance: ['romance', 'romantique', 'amour', 'love'],
      animation: ['animation', 'anime', 'animated'],
      fantastique: ['fantastique', 'fantasy', 'magie'],
      crime: ['crime', 'policier', 'police', 'gangster'],
      documentaire: ['documentaire', 'documentary'],
    };
    return (aliases[genre] ?? [genre]).some((alias) => normalizedText.includes(alias));
  }

  /** Vérifie qu’une recommandation respecte les critères explicites du dialogue. */
  private matchesCriteria(media: Media, criteria: RecommendationCriteria): boolean {
    const normalizedType = this.normalizeSearchText(media.type);
    const normalizedMedia = this.normalizeSearchText(`${media.genre} ${media.synopsis} ${media.country ?? ''} ${media.director ?? ''} ${media.creator ?? ''}`);
    const releaseYear = Number(media.releaseYear);
    if (criteria.type && !normalizedType.startsWith(criteria.type)) return false;
    if (criteria.genres.length && !criteria.genres.some((genre) => this.genreMatches(normalizedMedia, genre))) return false;
    if (criteria.excludedGenres.some((genre) => this.genreMatches(normalizedMedia, genre))) return false;
    if (criteria.years.length && !criteria.years.includes(releaseYear)) return false;
    if (criteria.yearMin !== undefined && (!Number.isFinite(releaseYear) || releaseYear < criteria.yearMin)) return false;
    if (criteria.yearMax !== undefined && (!Number.isFinite(releaseYear) || releaseYear > criteria.yearMax)) return false;
    if (criteria.minimumRating !== undefined) {
      const rating = Number(media.rating);
      const scale = Number(media.ratingScale ?? 5);
      if (!Number.isFinite(rating) || !Number.isFinite(scale) || scale <= 0 || rating * 5 / scale < criteria.minimumRating) return false;
    }
    return true;
  }

  /** Repère le type, les genres à inclure ou éviter, l’année et la note demandés. */
  private extractCriteria(text: string, latestRequest = ''): RecommendationCriteria {
    const normalized = this.normalizeSearchText(text);
    const normalizedLatest = this.normalizeSearchText(latestRequest);
    const typeMatches = [...normalized.matchAll(/\b(film|films|serie|series)\b/g)];
    const lastType = typeMatches.at(-1)?.[1];
    const genreAliases: [string, string[]][] = [
      ['science fiction', ['science fiction', 'sci fi', 'futuriste']],
      ['action', ['action', 'combat']],
      ['aventure', ['aventure', 'exploration']],
      ['comedie', ['comedie', 'humour', 'drole', 'rire']],
      ['drame', ['drame', 'dramatique', 'emouvant']],
      ['horreur', ['horreur', 'epouvante', 'peur', 'effrayant']],
      ['thriller', ['thriller', 'suspense', 'tension']],
      ['mystere', ['mystere', 'enquete', 'enigme']],
      ['romance', ['romance', 'romantique', 'amour']],
      ['animation', ['animation', 'anime', 'dessin anime']],
      ['fantastique', ['fantastique', 'fantasy', 'magie']],
      ['crime', ['crime', 'policier', 'gangster']],
      ['documentaire', ['documentaire']],
    ];
    const contextGenres = genreAliases
      .filter(([, aliases]) => aliases.some((alias) => normalized.includes(alias)))
      .map(([genre]) => genre);
    const latestGenres = genreAliases
      .filter(([, aliases]) => aliases.some((alias) => normalizedLatest.includes(alias)))
      .map(([genre]) => genre);
    const foundGenres = /autre genre|change de genre|changer de genre/.test(normalizedLatest)
      ? []
      : latestGenres.length ? latestGenres : contextGenres;
    const excludedGenres = foundGenres.filter((genre) => {
      const aliases = genreAliases.find(([candidate]) => candidate === genre)?.[1] ?? [];
      return aliases.some((alias) => {
        const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        return new RegExp(`(?:sans|pas de|evite|eviter)\\s+(?:genre\\s+)?${escapedAlias}`).test(normalized);
      });
    });
    const contextYears = [...normalized.matchAll(/\b(?:19|20)\d{2}\b/g)].map((match) => Number(match[0]));
    const latestYears = [...normalizedLatest.matchAll(/\b(?:19|20)\d{2}\b/g)].map((match) => Number(match[0]));
    let years = latestYears.length ? latestYears : contextYears;
    let yearMin: number | undefined;
    let yearMax: number | undefined;
    let yearPreference: RecommendationCriteria['yearPreference'];
    const decadeMatch = normalizedLatest.match(/(?:annees?\s+(?:19|20)?(\d0)|\b(\d0)s\b)/);
    if (decadeMatch) {
      const decade = Number(decadeMatch[1] ?? decadeMatch[2]);
      const decadeStart = decade >= 30 ? 1900 + decade : 2000 + decade;
      yearMin = decadeStart;
      yearMax = decadeStart + 9;
      years = [];
    }
    const yearAnchor = latestYears.at(-1) ?? contextYears.at(-1);
    if (!decadeMatch && /\b(apres|depuis|plus recent que)\b/.test(normalizedLatest) && yearAnchor) {
      yearMin = yearAnchor + 1;
      years = [];
    } else if (!decadeMatch && /\b(avant|jusqu a|plus ancien que)\b/.test(normalizedLatest) && yearAnchor) {
      yearMax = yearAnchor - 1;
      years = [];
    } else if (!decadeMatch && /plus recent|plus actuel|recent/.test(normalizedLatest)) {
      years = [];
      yearPreference = 'newer';
    } else if (!decadeMatch && /plus ancien|classique|ancienne epoque/.test(normalizedLatest)) {
      years = [];
      yearPreference = 'older';
    }
    const contextRatingMatch = normalized.match(/(?:note|score|minimum|au moins|plus de)\s*(\d(?:[.,]\d)?)\s*(?:sur\s*5|sur\s*10|\/\s*5|\/\s*10)?/);
    const latestRatingMatch = normalizedLatest.match(/(?:note|score|minimum|au moins|plus de)\s*(\d(?:[.,]\d)?)\s*(?:sur\s*5|sur\s*10|\/\s*5|\/\s*10)?/);
    const ratingMatch = latestRatingMatch ?? contextRatingMatch;
    let minimumRating = ratingMatch ? Number(ratingMatch[1].replace(',', '.')) : undefined;
    if (minimumRating !== undefined && /sur\s*10|\/\s*10/.test(normalized)) minimumRating /= 2;

    return {
      type: lastType ? (lastType.startsWith('serie') ? 'serie' : 'film') : undefined,
      genres: foundGenres.filter((genre) => !excludedGenres.includes(genre)),
      excludedGenres,
      years,
      yearMin,
      yearMax,
      yearPreference,
      minimumRating,
    };
  }

  /** Extrait les mots utiles d’un texte en retirant les mots courants. */
  private searchTokens(value: string): string[] {
    const stopWords = new Set(['avec', 'dans', 'pour', 'film', 'films', 'serie', 'series', 'une', 'des', 'les', 'sur', 'qui', 'que', 'the', 'and', 'for', 'from']);
    return [...new Set(this.normalizeSearchText(value).split(/\s+/).filter((word) => word.length > 2 && !stopWords.has(word)))];
  }

  /** Génère une réponse locale et des recommandations si l’IA est indisponible. */
  private fallbackReply(medias: Media[], userText: string, context = ''): { reply: string; recommendations: ChatRecommendation[] } {
    const criteria = this.extractCriteria(`${context} ${userText}`, userText);
    const rankedMedias = this.rankMedias(medias, userText, [], context);
    const normalized = this.normalizeSearchText(`${context} ${userText}`);
    const keywords = normalized
      .replace(/[^a-zA-Z0-9À-ÿ\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .slice(0, 8);

    const scored = rankedMedias
      .map((media) => {
        const haystack = `${media.title} ${media.genre} ${media.synopsis} ${media.country ?? ''} ${media.director ?? ''} ${media.creator ?? ''}`.toLowerCase();
        const hits = keywords.filter((keyword) => haystack.includes(keyword));
        let score = hits.length * 20 + Math.max(0, 30 - rankedMedias.indexOf(media));

        for (const genre of criteria.genres) {
          if (this.genreMatches(this.normalizeSearchText(haystack), genre)) score += 20;
        }

        const normalizedMedia = this.normalizeSearchText(haystack);
        if (criteria.type && !this.normalizeSearchText(media.type).startsWith(criteria.type)) return null;
        if (criteria.excludedGenres.some((genre) => this.genreMatches(normalizedMedia, genre))) return null;
        if (criteria.years.length && !criteria.years.includes(Number(media.releaseYear))) return null;
        if (criteria.yearMin !== undefined && Number(media.releaseYear) < criteria.yearMin) return null;
        if (criteria.yearMax !== undefined && Number(media.releaseYear) > criteria.yearMax) return null;
        if (criteria.genres.length && !criteria.genres.some((genre) => this.genreMatches(normalizedMedia, genre))) return null;
        if (criteria.minimumRating !== undefined) {
          const rating = Number(media.rating);
          const scale = Number(media.ratingScale ?? 5);
          if (!Number.isFinite(rating) || !Number.isFinite(scale) || scale <= 0 || rating * 5 / scale < criteria.minimumRating) return null;
        }
        if (score <= 0 && !criteria.genres.length && !criteria.years.length && criteria.minimumRating === undefined) return null;

        return {
          media,
          score,
          reason: this.recommendationReason(media, criteria, hits),
        };
      })
      .filter((item): item is ChatRecommendation => Boolean(item))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return {
      reply: scored.length
        ? `J’ai retenu ${scored.map((item) => item.media.title).join(', ')} selon tes critères. Tu peux me demander plus récent, un autre genre, un film ou une série, ou ajouter un détail comme le pays ou le réalisateur.`
        : 'Je n’ai pas trouvé de titre qui réponde clairement à ces critères. Tu peux assouplir un détail ou me donner un autre genre, une période, une ambiance ou un type de média.',
      recommendations: scored,
    };
  }

  /** Explique en quelques mots les critères qui rapprochent le média de la demande. */
  private recommendationReason(media: Media, criteria: RecommendationCriteria, hits: string[]): string {
    const reasons: string[] = [];
    if (criteria.type && this.normalizeSearchText(media.type).startsWith(criteria.type)) reasons.push(criteria.type);
    const mediaText = this.normalizeSearchText(`${media.genre} ${media.synopsis}`);
    const matchingGenre = criteria.genres.find((genre) => this.genreMatches(mediaText, genre));
    if (matchingGenre) reasons.push(`genre ${matchingGenre}`);
    const matchingYear = criteria.years.find((year) => year === Number(media.releaseYear));
    if (matchingYear) reasons.push(`sorti en ${matchingYear}`);
    if (criteria.minimumRating !== undefined) reasons.push(`note d’au moins ${criteria.minimumRating}/5`);
    if (hits.length) reasons.push(`correspond à ${hits.slice(0, 2).join(', ')}`);
    return reasons.length ? `Choisi car ${reasons.join(' et ')}.` : 'Une suggestion proche de ta demande, à affiner selon tes préférences.';
  }
}

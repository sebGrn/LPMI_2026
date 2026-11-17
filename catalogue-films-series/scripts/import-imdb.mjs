import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

const dataDirectory = join(process.cwd(), 'data', 'imdb');
const downloadDirectory = join(dataDirectory, 'downloads');
const databasePath = join(dataDirectory, 'catalogue.sqlite');
const temporaryDatabasePath = join(dataDirectory, 'catalogue-building.sqlite');
const forceDownload = process.argv.includes('--refresh');

mkdirSync(downloadDirectory, { recursive: true });

/** Télécharge le fichier IMDb s’il n’est pas déjà présent localement. */
async function ensureDownload(name, url) {
  const filePath = join(downloadDirectory, name);
  if (!forceDownload && existsSync(filePath) && statSync(filePath).size > 0) return filePath;

  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok || !response.body) throw new Error(`IMDb download failed (${response.status}): ${name}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
  process.stdout.write(`Downloaded ${name} (${Math.round(statSync(filePath).size / 1024 / 1024)} MB)\n`);
  return filePath;
}

/** Parcourt un fichier TSV IMDb ligne par ligne sans le charger entièrement. */
async function* readTsv(filePath) {
  const lines = createInterface({
    input: createReadStream(filePath).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of lines) yield line.split('\t');
}

/** Démarre une transaction pour insérer un lot de données dans SQLite. */
function beginBatch(database) {
  database.exec('BEGIN');
}

/** Termine et valide la transaction SQLite en cours. */
function finishBatch(database) {
  database.exec('COMMIT');
}

const basicsPath = await ensureDownload('title.basics.tsv.gz', 'https://datasets.imdbws.com/title.basics.tsv.gz');
const ratingsPath = await ensureDownload('title.ratings.tsv.gz', 'https://datasets.imdbws.com/title.ratings.tsv.gz');
rmSync(temporaryDatabasePath, { force: true });

const database = new DatabaseSync(temporaryDatabasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA temp_store = MEMORY;
  PRAGMA cache_size = -65536;
  CREATE TABLE ratings (
    tconst TEXT PRIMARY KEY,
    average_rating REAL NOT NULL,
    num_votes INTEGER NOT NULL
  ) WITHOUT ROWID;
  CREATE TABLE titles (
    tconst TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    release_year INTEGER,
    genres TEXT NOT NULL DEFAULT '',
    rating REAL,
    votes INTEGER
  ) WITHOUT ROWID;
`);

const insertRating = database.prepare('INSERT OR REPLACE INTO ratings (tconst, average_rating, num_votes) VALUES (?, ?, ?)');
let ratingsCount = 0;
beginBatch(database);
for await (const row of readTsv(ratingsPath)) {
  if (row[0] === 'tconst') continue;
  insertRating.run(row[0], Number(row[1]), Number(row[2]));
  ratingsCount++;
  if (ratingsCount % 100000 === 0) {
    finishBatch(database);
    beginBatch(database);
    process.stdout.write(`Imported ${ratingsCount.toLocaleString()} ratings\n`);
  }
}
finishBatch(database);

database.exec('CREATE INDEX idx_titles_type_year ON titles (type, release_year DESC, rating DESC)');
database.exec('CREATE INDEX idx_titles_title ON titles (title COLLATE NOCASE)');
database.exec('CREATE INDEX idx_titles_genres ON titles (genres)');
database.exec('CREATE INDEX idx_titles_default_order ON titles (votes DESC, rating DESC, release_year DESC, title COLLATE NOCASE)');
database.exec('CREATE INDEX idx_titles_type_order ON titles (type, votes DESC, rating DESC, release_year DESC, title COLLATE NOCASE)');

const insertTitle = database.prepare(`
  INSERT OR IGNORE INTO titles (tconst, title, type, release_year, genres, rating, votes)
  VALUES (
    ?, ?, ?, ?, ?,
    (SELECT average_rating FROM ratings WHERE tconst = ?),
    (SELECT num_votes FROM ratings WHERE tconst = ?)
  )
`);
const supportedTypes = new Map([
  ['movie', 'Film'],
  ['tvMovie', 'Film'],
  ['short', 'Film'],
  ['tvShort', 'Film'],
  ['video', 'Film'],
  ['tvSpecial', 'Film'],
  ['tvSeries', 'Série'],
  ['tvMiniSeries', 'Série'],
]);

let titlesCount = 0;
beginBatch(database);
for await (const row of readTsv(basicsPath)) {
  if (row[0] === 'tconst') continue;
  const mediaType = supportedTypes.get(row[1]);
  if (!mediaType || row[4] !== '0') continue;

  const title = row[2] === '\\N' ? row[3] : row[2];
  if (!title || title === '\\N') continue;
  const year = row[5] === '\\N' ? null : Number(row[5]);
  const genres = row[8] === '\\N' ? '' : row[8];
  insertTitle.run(row[0], title, mediaType, Number.isInteger(year) ? year : null, genres, row[0], row[0]);
  titlesCount++;
  if (titlesCount % 100000 === 0) {
    finishBatch(database);
    beginBatch(database);
    process.stdout.write(`Imported ${titlesCount.toLocaleString()} film/series titles\n`);
  }
}
finishBatch(database);

database.exec('DROP TABLE ratings; VACUUM; ANALYZE;');
database.exec(`
  CREATE VIRTUAL TABLE title_search USING fts5(
    tconst UNINDEXED,
    title,
    tokenize = 'unicode61 remove_diacritics 2'
  );
  INSERT INTO title_search (tconst, title) SELECT tconst, title FROM titles;
  CREATE TABLE title_order (
    tconst TEXT PRIMARY KEY,
    sort_order INTEGER NOT NULL UNIQUE
  ) WITHOUT ROWID;
  INSERT INTO title_order (tconst, sort_order)
  SELECT tconst, ROW_NUMBER() OVER (
      ORDER BY votes DESC NULLS LAST, rating DESC NULLS LAST, release_year DESC NULLS LAST, title COLLATE NOCASE, tconst
  )
  FROM titles;
`);
database.close();
renameSync(temporaryDatabasePath, databasePath);
process.stdout.write(`IMDb index ready: ${titlesCount.toLocaleString()} film/series titles at ${databasePath}\n`);

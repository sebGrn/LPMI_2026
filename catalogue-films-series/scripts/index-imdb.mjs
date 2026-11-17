import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const databasePath = join(process.cwd(), 'data', 'imdb', 'catalogue.sqlite');
if (!existsSync(databasePath)) {
  throw new Error('IMDb index not found. Run npm run import:imdb first.');
}

const database = new DatabaseSync(databasePath);
const rowCount = Number(database.prepare('SELECT COUNT(*) AS count FROM titles').get().count);
if (rowCount > 0) {
  database.exec(`
    DROP TABLE IF EXISTS title_order;
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
}

database.close();
console.log(`IMDb page order ready for ${rowCount.toLocaleString()} titles.`);
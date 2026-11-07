// Imports server/content/categories.json into the database and (re)generates the
// placeholder cards. Run after editing the catalog: pnpm content:import
import path from 'node:path';
import { config } from '../src/config';
import { catalogToContent, readCatalog, writeCards } from '../src/content/catalog';
import { PgRepo } from '../src/repo/pg';

const catalog = await readCatalog(config.contentDir);
const written = await writeCards(path.join(config.contentDir, 'cards'), catalog, true);
const content = catalogToContent(catalog);
const items = content.reduce((n, c) => n + c.items.length, 0);
console.log(`catalog: ${content.length} categories, ${items} items, ${written} cards written`);

const small = content.filter((c) => c.items.length < 60);
if (small.length) {
  console.warn(`below the 60-item target: ${small.map((c) => `${c.id} (${c.items.length})`).join(', ')}`);
}

if (!config.databaseUrl) {
  console.log('DATABASE_URL is not set: skipped the database import');
  process.exit(0);
}

const repo = new PgRepo(config.databaseUrl);
await repo.migrate(config.migrationsDir);
await repo.upsertContent(content);
await repo.close();
console.log('content imported');

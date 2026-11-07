import { config } from '../src/config';
import { PgRepo } from '../src/repo/pg';

if (!config.databaseUrl) {
  console.error('DATABASE_URL is not set (see server/.env.example)');
  process.exit(1);
}

const repo = new PgRepo(config.databaseUrl);
await repo.migrate(config.migrationsDir);
await repo.close();
console.log('migrations applied');

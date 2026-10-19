import { loadConfig } from './config.ts';

// Checks the whole env, not just DATABASE_URL, so deploy.sh stops on a bad .env while the
// old container is still serving.
loadConfig();
await import('@repo/db/migrate');

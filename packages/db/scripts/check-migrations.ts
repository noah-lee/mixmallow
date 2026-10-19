// Fails if src/schema.ts has changes no committed migration covers: runs drizzle-kit
// generate against a scratch copy of migrations/ and checks that it wrote nothing.
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const pkgRoot = path.resolve(import.meta.dirname, '..');
// Relative and inside the package: drizzle-kit mangles absolute Windows paths for --out.
const scratch = '.migrations-check';
const scratchAbs = path.join(pkgRoot, scratch);

const journalEntries = (dir: string): number =>
  JSON.parse(readFileSync(path.join(dir, 'meta/_journal.json'), 'utf8')).entries
    .length;

rmSync(scratchAbs, { recursive: true, force: true });
cpSync(path.join(pkgRoot, 'migrations'), scratchAbs, { recursive: true });

try {
  const before = journalEntries(scratchAbs);
  // No --config: drizzle.config.ts demands DATABASE_URL, which generate doesn't need.
  const result = spawnSync(
    process.execPath,
    [
      path.join(pkgRoot, 'node_modules/drizzle-kit/bin.cjs'),
      'generate',
      '--dialect=postgresql',
      '--schema=./src/schema.ts',
      `--out=./${scratch}`,
    ],
    {
      cwd: pkgRoot,
      encoding: 'utf8',
      // Closed stdin: an interactive prompt (e.g. "is this column renamed?") ends the run
      // instead of hanging it.
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  // drizzle-kit exits 0 even on some errors, so require its explicit "no changes" line.
  if (
    result.status === 0 &&
    journalEntries(scratchAbs) === before &&
    output.includes('No schema changes')
  ) {
    console.log('migrations match packages/db/src/schema.ts');
  } else {
    console.error(output.trim());
    console.error(
      '\nschema.ts and packages/db/migrations are out of sync. Run `pnpm db:generate`, review the SQL, and commit it.',
    );
    process.exitCode = 1;
  }
} finally {
  rmSync(scratchAbs, { recursive: true, force: true });
}

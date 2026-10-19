// `pnpm verify` (add --full for e2e): runs each check in order and stops at the first
// failure, printing only that check's output and the command to rerun it.
import { spawnSync } from 'node:child_process';

const steps = [
  ['lint', 'pnpm lint'],
  ['migrations in sync', 'pnpm db:check'],
  ['typecheck', 'pnpm turbo run typecheck --output-logs=errors-only'],
  ['unit + integration tests', 'pnpm turbo run test --output-logs=errors-only'],
  ['build', 'pnpm turbo run build --output-logs=errors-only'],
];
if (process.argv.includes('--full')) steps.push(['e2e', 'pnpm test:e2e']);

const MAX_LINES = 150;

for (const [name, command] of steps) {
  const started = Date.now();
  const result = spawnSync(`${command} 2>&1`, {
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status === 0) {
    console.log(`✓ ${name} (${seconds}s)`);
    continue;
  }
  const lines = (result.stdout ?? '').trimEnd().split(/\r?\n/);
  if (lines.length > MAX_LINES) {
    console.log(`… ${lines.length - MAX_LINES} earlier lines omitted`);
  }
  console.log(lines.slice(-MAX_LINES).join('\n'));
  console.log(`\n✗ ${name} failed (${seconds}s). Rerun: ${command}`);
  process.exit(1);
}
console.log('verify passed');

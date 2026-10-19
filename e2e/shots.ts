// pnpm e2e:shots <route...> [--signed-out] [--project mobile|desktop]   (e.g. `account`, `/account`)
// Screenshots each route (signed in as the e2e user unless --signed-out) into
// e2e/screenshots/. The run also fails on page/console errors, like the e2e suite.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const args = process.argv.slice(2);
const routes: string[] = [];
const playwrightArgs: string[] = [];
let signedOut = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i] ?? '';
  if (arg === '--signed-out') signedOut = true;
  else if (arg === '--project') playwrightArgs.push(`--project=${args[++i]}`);
  else if (arg.startsWith('--project=')) playwrightArgs.push(arg);
  else if (/^[a-z]:[\\/]/i.test(arg)) {
    // Git Bash rewrites a leading-slash argument into a Windows path.
    console.error(
      `"${arg}" looks like a route Git Bash turned into a path. Drop the leading slash (account, not /account) or set MSYS_NO_PATHCONV=1.`,
    );
    process.exit(2);
  } else if (arg.startsWith('--')) {
    console.error(
      `Unknown option "${arg}". Usage: pnpm e2e:shots <route...> [--signed-out] [--project mobile|desktop]`,
    );
    process.exit(2);
  } else routes.push(arg.startsWith('/') ? arg : `/${arg}`);
}

const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const result = spawnSync(process.execPath, [cli, 'test', ...playwrightArgs], {
  cwd: path.resolve(import.meta.dirname),
  stdio: 'inherit',
  env: {
    ...process.env,
    SHOT_ROUTES: (routes.length > 0 ? routes : ['/']).join(','),
    ...(signedOut && { SHOT_SIGNED_OUT: '1' }),
  },
});
process.exit(result.status ?? 1);

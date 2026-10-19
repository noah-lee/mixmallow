import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    // Resolves its migrations folder as `../migrations` from dist/; the Dockerfile copies it there.
    migrate: 'src/migrate.ts',
  },
  platform: 'node',
  target: 'node24',
  fixedExtension: false,
  sourcemap: true,
  deps: {
    // Node won't type-strip the raw `.ts` these export once `pnpm deploy` puts them under node_modules.
    alwaysBundle: [/^@repo\//],
    // Fail the build if an npm package would be bundled: an npm dep of a @repo/* package must be in
    // this package's dependencies so it stays external and gets installed in the image.
    onlyBundle: [],
  },
});

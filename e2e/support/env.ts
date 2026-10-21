import path from 'node:path';

// Ports differ from `pnpm dev` (5173/3000) so e2e can run beside a dev server.
export const API_PORT = 3100;
export const WEB_PORT = 5174;
export const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;

// No storage runs here: tests answer the browser's PUTs with page.route, and the api's own
// calls (HEAD, DELETE) must fail at once. *.localhost resolves to loopback without a DNS
// query and nothing listens on port 9; a made-up domain can take seconds to fail to resolve.
export const S3_ENDPOINT = 'https://localhost:9';
export const STORAGE_ORIGIN = 'https://test-bucket.localhost:9';

const root = path.resolve(import.meta.dirname, '..');
export const STORAGE_STATE = path.join(root, '.auth/user.json');
export const SCREENSHOT_DIR = path.join(root, 'screenshots');

export const SIGNED_OUT = { cookies: [], origins: [] };

export const E2E_USER = { email: 'e2e@example.com', name: 'E2E User' };

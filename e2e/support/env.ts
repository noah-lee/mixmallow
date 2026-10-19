import path from 'node:path';

// Ports differ from `pnpm dev` (5173/3000) so e2e can run beside a dev server.
export const API_PORT = 3100;
export const WEB_PORT = 5174;
export const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;

const root = path.resolve(import.meta.dirname, '..');
export const STORAGE_STATE = path.join(root, '.auth/user.json');
export const SCREENSHOT_DIR = path.join(root, 'screenshots');

export const SIGNED_OUT = { cookies: [], origins: [] };

export const E2E_USER = { email: 'e2e@example.com', name: 'E2E User' };

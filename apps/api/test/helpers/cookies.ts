import type { LightMyRequestResponse } from 'fastify';

export function responseCookie(res: LightMyRequestResponse, name: string) {
  return res.cookies.find((c) => c.name === name);
}

// clearCookie sends an empty value that expired at the epoch.
export function isCleared(res: LightMyRequestResponse, name: string): boolean {
  const cookie = responseCookie(res, name);
  return (
    cookie !== undefined &&
    cookie.value === '' &&
    cookie.expires instanceof Date &&
    cookie.expires.getTime() <= Date.now()
  );
}

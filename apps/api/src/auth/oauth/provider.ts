import type { AuthProvider } from '@repo/shared/schemas';

export type OAuthProfile = {
  // The provider's stable user id (e.g. the OIDC `sub`), never the email.
  providerId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
};

// What `oauthRoutes` needs from a provider; the state, PKCE, callback and session
// handling are shared.
export type OAuthProvider = {
  id: AuthProvider;
  authorizationEndpoint: string;
  clientId: string;
  scope: string;
  extraAuthorizationParams?: Record<string, string>;
  // Trades the callback's code for the user's profile. Throws on any failure.
  fetchProfile: (input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }) => Promise<OAuthProfile>;
};

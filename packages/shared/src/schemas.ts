import { z } from 'zod';

// Each value is an api route segment (`/api/auth/<provider>/start`) and the value of
// `users.auth_provider`.
export const authProviderSchema = z.enum(['google']);

export type AuthProvider = z.infer<typeof authProviderSchema>;

export const meResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().nullable(),
  picture: z.url().nullable(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

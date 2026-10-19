export type OmitUndefined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

// Zod types optional fields as `?: T | undefined`, which
// exactOptionalPropertyTypes won't pass to Drizzle's `?: T`. It also makes a
// PATCH write only the fields that were sent.
export function omitUndefined<T extends object>(value: T): OmitUndefined<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as OmitUndefined<T>;
}

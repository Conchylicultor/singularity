import { z } from "zod";

/**
 * Zod schema for Drizzle `timestamp` columns in endpoint response schemas.
 *
 * Drizzle returns `Date`; `Response.json()` serializes it to an ISO string;
 * the client receives a plain string.  Use `dateString()` instead of
 * `z.string()` to communicate that intent — the schema is identical at
 * runtime, but `JsonCompat<T>` (in `implement.ts`) widens `string` to
 * `string | Date` so handlers can return Drizzle rows without manual
 * `.toISOString()` mapping.
 */
export function dateString() {
  return z.string();
}

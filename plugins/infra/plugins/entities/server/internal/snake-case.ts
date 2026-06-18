// Local snake_case for JS-prop → DB-column-name mapping. No global drizzle
// `casing` is configured (`plugins/database/server/internal/client.ts` is a
// plain `drizzle(pool)`), and no reusable snake util exists, so `defineEntity`
// owns this tiny one. Covers the entity adopters' shapes:
// `operationKind→operation_kind`, `totalMs→total_ms`, `firstSeenAt→first_seen_at`.
// (If someone later sets `casing: 'snake_case'` on the drizzle client, this
// becomes redundant — re-check before relying on it.)
export function snakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
}

// The public Zod schemas + types now live in `core/internal/schema.ts`, derived
// from the per-table field records — off the server-only `defineEntity` path so
// the browser can evaluate them. This shim keeps every server importer
// (`../schema` / `./schema`) resolving unchanged.
export * from "../../core/internal/schema";

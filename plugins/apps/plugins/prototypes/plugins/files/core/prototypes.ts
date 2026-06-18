import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

/**
 * Metadata for a single prototype, read from `prototypes/<name>/meta.json`.
 * `name` is the directory name (injected by the server; not stored in the file).
 */
// All fields required: this is the wire/output shape (the resource + endpoint
// broadcast fully-populated metas). `list.ts` fills defaults for keys a
// half-authored `meta.json` omits before parsing, so input === output here.
export const PrototypeMetaSchema = z.object({
  name: z.string(),
  blurb: z.string(),
  theme: z.string(),
  viewport: z.object({ w: z.number(), h: z.number() }),
  scripts: z.array(z.string()),
  styles: z.array(z.string()),
});
export type PrototypeMeta = z.infer<typeof PrototypeMetaSchema>;

/**
 * The list of all prototypes. Re-broadcast (push) whenever a file under
 * `prototypes/` changes, so the gallery reflects new/edited mocks live.
 */
export const prototypesResource = resourceDescriptor<PrototypeMeta[]>(
  "prototypes.list",
  z.array(PrototypeMetaSchema),
  [],
);

/**
 * A monotonically increasing version (a timestamp) bumped on every file change
 * under `prototypes/`. Open iframes append it to their `src` so an agent's edit
 * cache-busts and reloads the iframe automatically (watcher → bump → re-render).
 */
export const prototypesVersionResource = resourceDescriptor<number>(
  "prototypes.version",
  z.number(),
  0,
);

/** Base path for the raw file-serving routes. */
export const PROTOTYPES_API_BASE = "/api/prototypes";

/**
 * Typed list endpoint. JSON, so it goes through `implement()` (raw JSON
 * handlers are banned by `endpoints:no-raw-json-handlers`). The `:name` file
 * routes stay raw handlers — they return per-file bytes/html with a custom
 * Content-Type, which `implement()`'s 200/204 JSON contract doesn't fit.
 */
export const listPrototypes = defineEndpoint({
  route: "GET /api/prototypes",
  response: z.array(PrototypeMetaSchema),
});

/**
 * Build the URL the iframe loads. With no `path`, the server serves the shared
 * harness (`_shared/harness.html`) which derives the prototype name from the
 * URL. `v` cache-busts on edit.
 */
export function prototypeUrl(
  name: string,
  opts: { path?: string; v?: number } = {},
): string {
  const params = new URLSearchParams();
  if (opts.path !== undefined) params.set("path", opts.path);
  if (opts.v !== undefined) params.set("v", String(opts.v));
  const qs = params.toString();
  return `${PROTOTYPES_API_BASE}/${encodeURIComponent(name)}${qs ? `?${qs}` : ""}`;
}

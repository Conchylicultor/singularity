import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

/**
 * Metadata for a single prototype, parsed out of `prototypes/<name>/index.html`.
 * There is no `meta.json`: a prototype is one self-contained HTML file, so its
 * metadata is expressed the way HTML already expresses metadata.
 *
 * - `name` — the directory slug (injected by the server; what URLs address)
 * - `title` — `<title>`, the display name (falls back to `name`)
 * - `blurb` — `<meta name="description">` (defaults to `""`)
 * - `viewport` — `<meta name="prototype-viewport" content="1320x868">`
 *   (defaults to 1280x800)
 */
// All fields required: this is the wire/output shape (the resource + endpoint
// broadcast fully-populated metas). `list.ts` supplies a default for every key
// the HTML omits before constructing one, so input === output here.
export const PrototypeMetaSchema = z.object({
  name: z.string(),
  title: z.string(),
  blurb: z.string(),
  viewport: z.object({ w: z.number(), h: z.number() }),
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
 * Route key for the bare per-prototype route. Kept as a named const (not a
 * string literal in `httpRoutes`) because the response is a redirect, not JSON —
 * it can't go through `defineEndpoint`/`implement()`. Same pattern as
 * asset-mirror's `MIRROR_ROUTE_KEY`.
 */
export const PROTOTYPE_FILE_ROUTE = "GET /api/prototypes/:name";

/**
 * Route key for one file inside a prototype folder. The trailing segment is what
 * makes a prototype self-contained: because the document is served at
 * `/api/prototypes/<name>/index.html`, a relative `href="styles.css"` inside it
 * resolves to `/api/prototypes/<name>/styles.css` — the same relative reference
 * that works when the file is opened straight off disk with `file://`.
 *
 * The router matches each `:param` as exactly one segment and has no wildcard,
 * so a prototype folder is flat by construction (`<name>/assets/x.svg` is
 * unserveable — the `prototypes:self-contained` check enforces that).
 */
export const PROTOTYPE_ASSET_ROUTE = "GET /api/prototypes/:name/:file";

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
 * Build the URL the iframe loads: the prototype's own `index.html`, addressed
 * through the folder so its relative sub-resources resolve. `v` cache-busts on
 * edit.
 */
export function prototypeUrl(name: string, opts: { v?: number } = {}): string {
  const qs =
    opts.v === undefined ? "" : `?v=${encodeURIComponent(String(opts.v))}`;
  return `${PROTOTYPES_API_BASE}/${encodeURIComponent(name)}/index.html${qs}`;
}

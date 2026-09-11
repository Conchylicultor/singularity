import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { PrototypeProblemSchema } from "./validate";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import type { MocksDeclaration } from "./mocks";
import type { OptionPicks, PrototypeOption } from "./options";

/**
 * The wire shape of a parsed `mocks` declaration. Mirrors `MocksDeclaration`
 * exactly — the `satisfies` below is what keeps the two from drifting.
 */
export const MocksDeclarationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({
    kind: z.literal("malformed"),
    raw: z.string(),
    reason: z.string(),
  }),
  z.object({ kind: z.literal("declared"), tag: z.string(), ref: z.string() }),
]) satisfies ZodParser<MocksDeclaration>;

/** The wire shape of one valid option. Mirrors `PrototypeOption` exactly. */
export const PrototypeOptionSchema = z.object({
  name: z.string(),
  values: z.tuple([z.string(), z.string()]).rest(z.string()).readonly(),
  default: z.string(),
}) satisfies ZodParser<PrototypeOption>;

/**
 * Metadata for a single prototype, parsed out of `<slug>/index.html` under the
 * host-global prototypes dir. There is no `meta.json`: a prototype is one
 * self-contained HTML file, so its metadata is expressed the way HTML already
 * expresses metadata.
 *
 * - `name` — the directory slug (injected by the server; what URLs address)
 * - `title` — `<title>`, the display name (falls back to `UNTITLED_PROTOTYPE`,
 *   never to `name`, which is an opaque id)
 * - `blurb` — `<meta name="description">` (defaults to `""`)
 * - `viewport` — `<meta name="prototype-viewport" content="1320x868">`
 *   (defaults to 1280x800)
 * - `mocks` — `<meta name="mocks" content="<kind>:<ref>">`, the real app thing
 *   this prototype is a mockup OF (`fixture:control-panel/setting-rail`,
 *   `route:/agents/c/123`), so the Compare stage can show the two side by
 *   side. Parsed by `parseMocks` into a three-way value: `none` (the ordinary
 *   case — most prototypes mock nothing), `malformed` (also a `problems[]`
 *   entry), or `declared` with the kind tag and the ref. The tag is carried
 *   unjudged: kinds are an open set contributed on the web, and the ref is
 *   resolved only there — a fixture catalog is per-worktree while prototypes
 *   are host-global, so the pairing can only ever be a runtime lookup.
 * - `options` — every valid `<meta name="prototype-option">`, in picker order,
 *   each with its default read off the page's own `<html data-<name>>` (see
 *   `options.ts`). A line that cannot be an option is left out here and
 *   reported in `problems`. Empty for most prototypes.
 * - `problems` — every way the folder breaks the self-contained contract, empty
 *   when it holds. Prototypes are user content, not code, so this rides the
 *   wire to the gallery card instead of gating a push.
 */
// All fields required: this is the wire/output shape (the resource + endpoint
// broadcast fully-populated metas). `list.ts` supplies a default for every key
// the HTML omits before constructing one, so input === output here.
export const PrototypeMetaSchema = z.object({
  name: z.string(),
  title: z.string(),
  blurb: z.string(),
  viewport: z.object({ w: z.number(), h: z.number() }),
  mocks: MocksDeclarationSchema,
  options: z.array(PrototypeOptionSchema),
  problems: z.array(PrototypeProblemSchema),
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
 * Route key for one file of one recorded VERSION of a prototype. A path prefix
 * per version, for the same reason the live route has one: a relative
 * `href="styles.css"` inside that version's `index.html` resolves to the same
 * version's `styles.css`. The sha addresses the content, so the response is
 * immutable. Raw handler, like the live file route. Built by
 * {@link prototypeVersionUrl}.
 *
 * Six segments against the live route's four, and the router matches on the
 * segment count, so the two never compete for a URL.
 */
export const PROTOTYPE_VERSION_FILE_ROUTE =
  "GET /api/prototypes/:name/versions/:sha/:file";

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
 * edit; `picks` become `?<option>=<value>`, which the server stamps onto the
 * page's `<html data-<option>>` — so a frame reloaded by an edit comes back on
 * the variant it was showing, and the URL on its own is a link to that variant.
 */
export function prototypeUrl(
  name: string,
  opts: { v?: number; picks?: OptionPicks } = {},
): string {
  const params = new URLSearchParams();
  if (opts.v !== undefined) params.set("v", String(opts.v));
  for (const [option, value] of Object.entries(opts.picks ?? {})) {
    params.set(option, value);
  }
  const qs = params.size === 0 ? "" : `?${params.toString()}`;
  return `${PROTOTYPES_API_BASE}/${encodeURIComponent(name)}/index.html${qs}`;
}

/**
 * Build the URL of a recorded version's document — the one builder for
 * {@link PROTOTYPE_VERSION_FILE_ROUTE}. No `v` (a version never changes) and no
 * picks: a past version is shown exactly as it was saved, and the live page's
 * declared options may not exist in it.
 */
export function prototypeVersionUrl(name: string, sha: string): string {
  return `${PROTOTYPES_API_BASE}/${encodeURIComponent(name)}/versions/${sha}/index.html`;
}

/**
 * Mint a prototype: create a freshly id'd folder holding the blank template,
 * and answer with its id.
 *
 * The gallery's New prototype flow calls this BEFORE it launches the agent, so
 * the agent is handed a folder that already exists and is never asked to name
 * anything — which is what stops it from naming it wrong. `title` is optional
 * because at that moment nobody knows the name yet; the agent's first save is
 * what fills the card in.
 *
 * A POST, so it does not share the list route's handler: the keys in
 * `httpRoutes` carry the method.
 */
export const createPrototype = defineEndpoint({
  route: "POST /api/prototypes",
  body: z.object({ title: z.string().optional() }),
  response: z.object({ id: z.string() }),
});

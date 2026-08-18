import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { isNamespace } from "@plugins/infra/plugins/namespace/core";

// Shared endpoint contracts for the serve capability — imported by BOTH this
// plugin's own web (the controls) and its server (the handlers). A plugin
// importing its own `shared/` is boundary-legal.
export const ResetCompositionBodySchema = z.object({ id: z.string() });
export type ResetCompositionBody = z.infer<typeof ResetCompositionBodySchema>;

export const resetCompositionData = defineEndpoint({
  route: "POST /api/build/serve/reset",
  body: ResetCompositionBodySchema,
  response: z.object({ ok: z.boolean() }),
});

/**
 * Whether a namespace is *actually being served right now* — a discriminated
 * union rather than one flat object with nullable fields, so a caller cannot
 * read a missing commit as a live serve.
 */
export const ServeLivenessSchema = z.discriminatedUnion("served", [
  z.object({ served: z.literal(false) }),
  z.object({
    served: z.literal(true),
    /**
     * The commit `compose-serve` composed this namespace from. `null` for a
     * marker written before the field existed, or for a build whose HEAD did not
     * resolve — unknown, never guessed.
     */
    commit: z.string().nullable(),
    builtAt: z.string(),
  }),
]);
export type ServeLiveness = z.infer<typeof ServeLivenessSchema>;

export const ServeStatusResponseSchema = z.object({
  /**
   * Whether a serve build can be STARTED from this backend at all: the
   * `compose-serve` stage reads MAIN's config and runs inside MAIN's build, so
   * every other namespace can only observe. Server truth (`isMain()`) rather
   * than a hostname the client sniffs, so a surface can refuse up front instead
   * of after the POST that would be refused anyway.
   */
  canServe: z.boolean(),
  liveness: ServeLivenessSchema,
});
export type ServeStatusResponse = z.infer<typeof ServeStatusResponseSchema>;

/**
 * The *truth* about a served composition, as opposed to the `autoBuild` intent
 * stored in config: the `composition.json` marker `compose-serve` writes into
 * the namespace dir. Intent can be on with nothing built yet (the enabling build
 * has not run, or it failed), so a surface reading `autoBuild` as liveness
 * offers links to namespaces that 502.
 *
 * `composition` is the manifest item's **id** — the namespace `compose-serve`
 * owns and serves at `http://<id>.localhost:9000` — not the item's display name,
 * which diverges from the id for UI-created compositions.
 */
export const serveStatusEndpoint = defineEndpoint({
  route: "GET /api/build/serve/status",
  // A served composition id IS a namespace, so the wire schema validates it as
  // one: a malformed name is a 400 here rather than a throw in the handler.
  query: z.object({
    composition: z.string().refine(isNamespace, "not a valid namespace"),
  }),
  response: ServeStatusResponseSchema,
  // Every deployment row and every composition row of the same namespace asks
  // the identical question; the answer is a stat + a small JSON read, so
  // collapsing a burst onto one handler run is free.
  dedupe: true,
});

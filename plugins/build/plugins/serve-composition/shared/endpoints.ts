import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import {
  isNamespace,
  NAMESPACE_LABEL_RE,
} from "@plugins/infra/plugins/namespace/core";

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
   * WHERE this composition is — or would be — served from the backend that
   * answered: `namespaceFor(composition, <this backend's checkout>)`. Server
   * truth, and it has to be: a namespace is `<composition>.<checkout>` with both
   * sentinels elided, and the browser knows only the namespace it is talking to,
   * which does not decompose back into a checkout. A client that composed this
   * itself would name `sonata` from every worktree and link at main's namespace.
   */
  namespace: z.string().refine(isNamespace, "not a valid namespace"),
  /** `http://<namespace>.localhost:9000` — resolved beside the namespace it belongs to. */
  url: z.string(),
  liveness: ServeLivenessSchema,
});
export type ServeStatusResponse = z.infer<typeof ServeStatusResponseSchema>;

/**
 * The *truth* about a served composition, as opposed to the `autoBuild` intent
 * stored in config: the `composition.json` marker a serve build writes into the
 * namespace dir. Intent can be on with nothing built yet (the enabling build has
 * not run, or it failed), so a surface reading `autoBuild` as liveness offers
 * links to namespaces that 502.
 *
 * `composition` is the manifest item's **id**, not its display name (the two
 * diverge for UI-created compositions) and no longer the namespace either: a
 * composition is served from whichever checkout built it, so the namespace is
 * the ANSWER this endpoint returns rather than the question it is asked.
 */
export const serveStatusEndpoint = defineEndpoint({
  route: "GET /api/build/serve/status",
  // A composition id is one LABEL of a namespace — validated as such here, so a
  // malformed id is a 400 rather than a throw inside `namespaceFor`.
  query: z.object({
    composition: z
      .string()
      .refine((v) => NAMESPACE_LABEL_RE.test(v), "not a valid composition id"),
  }),
  response: ServeStatusResponseSchema,
  // Every deployment row and every composition row of the same namespace asks
  // the identical question; the answer is a stat + a small JSON read, so
  // collapsing a burst onto one handler run is free.
  dedupe: true,
});

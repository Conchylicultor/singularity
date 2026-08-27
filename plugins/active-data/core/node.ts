import { defineInlineTokenNode } from "@plugins/primitives/plugins/text-editor/plugins/token-extension/plugins/node/core";

/**
 * A `type` alias, never an `interface`: TypeScript grants an implicit index
 * signature to the former only, and without it this does not satisfy the
 * `F extends TokenFields` constraint — `defineInlineTokenNode` rejects it.
 */
export type ActiveDataInlineFields = { text: string };

/**
 * ONE generic inline decorator for every active-data inline token. It stores the
 * raw matched substring and resolves which chip renders it at decorate time —
 * so declaring a chip lights it up in the editor with zero per-chip Lexical
 * wiring, and there is exactly one node type to register however many chips
 * exist.
 *
 * It lives in `core/` — not beside the chip that decorates it — because BOTH
 * runtimes need this same object, and they must not each name their own. The
 * browser's decorated twin extends the class minted here (`.decorated({…})` in
 * `web/internal/active-data-inline-node.tsx`), and the server contributes THIS
 * object to `Editor.InlineToken` so a page block holding a chip can be read and
 * rewritten headlessly. Same type string, same field names, same token format,
 * because they come from one declaration rather than from two literals that
 * happen to agree today.
 *
 * It is headless by construction — `defineInlineTokenNode` mints a class whose
 * `decorate()` returns null and whose `createDOM()` throws — so this module
 * imports no React and is safe on a server.
 *
 * `textContent: "token"` is a decision, not an accident. Lexical builds the
 * `text/plain` clipboard payload from each node's text content, and a bare
 * decorator contributes `""` — which would drop the chip on copy. Emitting the
 * raw token lets any editor reconstruct it on paste (pinned by
 * `web/__tests__/active-data-inline-copy.test.tsx`).
 */
export const activeDataInlineNode =
  defineInlineTokenNode<ActiveDataInlineFields>({
    type: "active-data-inline",
    fields: ["text"],
    token: (fields) => fields.text,
    // The union pattern's alternatives carry their own capture groups, so only
    // the whole match is meaningful.
    fieldsOf: (match) => ({ text: match[0] }),
    textContent: "token",
  });

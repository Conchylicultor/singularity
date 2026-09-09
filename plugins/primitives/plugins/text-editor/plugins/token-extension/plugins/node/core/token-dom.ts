import type { TokenFields } from "@plugins/primitives/plugins/text-editor/plugins/token-extension/core";

/**
 * A token family's HTML spelling — the one encoding `exportDOM` writes and
 * `importDOM` reads back.
 *
 * ## Why a token needs an HTML spelling at all
 *
 * A decorator node's content is painted by `decorate()`, which React runs at
 * RENDER time. HTML serialization never calls it — it calls `createDOM()`, which
 * for these families returns an empty host `<span>`. So without this module a
 * chip's `text/html` flavour is `<span class="…"></span>`: markup that is
 * non-empty (so Lexical's paste takes that arm) and carries nothing (so the
 * paste lands blank).
 *
 * That arm is not exotic — it is the ORDINARY one for a copy between two page
 * blocks. Lexical only accepts its own `application/x-lexical-editor` payload
 * when `payload.namespace === editor._config.namespace`
 * (`@lexical/clipboard`'s `$insertDataTransferForRichText`), and every block is
 * its own editor with its own namespace (`block-text-<blockId>`). Two blocks
 * therefore NEVER share a namespace, and every cross-block copy falls through to
 * `text/html`.
 *
 * ## The encoding
 *
 * Two attributes plus the token as the element's text, and each of the three
 * carries its own weight:
 *
 * - {@link TOKEN_TYPE_ATTR} is the family's own `type`, so a family claims only
 *   its own spans and never another family's.
 * - {@link TOKEN_FIELDS_ATTR} is the field record verbatim, which is what makes
 *   the round-trip EXACT: `null` stays `null` (a date mention with no reminder)
 *   rather than collapsing into `""`, and a field name keeps its case — an
 *   attribute name per field would not, since the DOM lowercases them and
 *   `pageId` / `reminderId` / `attachmentId` all have some.
 * - the element's TEXT is the token itself, and it is the degraded arm: a target
 *   that has not registered this family (another app, or an editor composed
 *   without the plugin) reads the characters the token is made of instead of a
 *   blank. Lexical drops a converted decorator's children
 *   (`$createNodesFromDOM` appends them only when the conversion produced an
 *   ElementNode), so when the family IS registered that text costs nothing.
 */

/** The family this element stands for — its `InlineTokenNodeSpec.type`. */
export const TOKEN_TYPE_ATTR = "data-lexical-inline-token";

/** The field record this element carries, as JSON. */
export const TOKEN_FIELDS_ATTR = "data-lexical-inline-token-fields";

/** Write one token instance as the element {@link tokenDomFields} reads back. */
export function tokenDomElement(
  type: string,
  fields: TokenFields,
  token: string,
): HTMLElement {
  const element = document.createElement("span");
  element.setAttribute(TOKEN_TYPE_ATTR, type);
  element.setAttribute(TOKEN_FIELDS_ATTR, JSON.stringify(fields));
  // See the module header: the fallback for a reader that cannot rebuild the
  // node, and inert for one that can.
  element.textContent = token;
  return element;
}

/**
 * The field record `element` carries for the family `type`, or `null` when it
 * carries none.
 *
 * `null` is the same "not one of mine after all" answer `fieldsOf` gives a regex
 * match, and it has the same consequence: the caller declines the conversion and
 * the element falls back to its own text — which this encoding made the token.
 * So a foreign span, a span from another family, and markup mangled in transit
 * all degrade to the token's characters rather than to nothing.
 */
export function tokenDomFields(
  element: HTMLElement,
  type: string,
  fieldNames: readonly string[],
): TokenFields | null {
  if (element.getAttribute(TOKEN_TYPE_ATTR) !== type) return null;
  const raw = element.getAttribute(TOKEN_FIELDS_ATTR);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Only a malformed attribute is expected here; anything else is a real bug.
    if (!(err instanceof SyntaxError)) throw err;
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const fields: TokenFields = {};
  for (const name of fieldNames) {
    const value = record[name];
    if (typeof value !== "string" && value !== null) return null;
    fields[name] = value;
  }
  return fields;
}

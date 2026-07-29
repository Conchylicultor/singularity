import { decodeHTML } from "entities";

/**
 * Minimal structural shape of an `HTMLRewriter` element handler's element.
 * Typed structurally rather than against Bun's ambient `HTMLRewriterTypes`
 * global so this primitive does not depend on that type's name (and can be
 * unit-tested with a plain object).
 */
export interface AttributeSource {
  getAttribute(name: string): string | null;
}

/**
 * Decode HTML character references in raw markup source text.
 *
 * Decodes EXACTLY ONCE — `&amp;#x27;` becomes `&#x27;`, never `'`. That is the
 * correct behavior: the source really did encode a literal `&#x27;`.
 */
export function decodeHtmlText(raw: string): string {
  return decodeHTML(raw);
}

/**
 * Read an attribute off an HTMLRewriter element handler, decoded.
 * `undefined` when the attribute is absent.
 */
export function readHtmlAttr(el: AttributeSource, name: string): string | undefined {
  const raw = el.getAttribute(name);
  return raw === null ? undefined : decodeHtmlText(raw);
}

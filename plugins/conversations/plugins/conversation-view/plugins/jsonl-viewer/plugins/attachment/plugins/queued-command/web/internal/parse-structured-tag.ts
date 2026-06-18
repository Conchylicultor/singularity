export interface StructuredTagField {
  /** Child element name, verbatim — e.g. "task-id", "output-file". */
  key: string;
  /** Flattened text content of the child element. */
  value: string;
}

export interface StructuredTag {
  /** Root element name, e.g. "task-notification". */
  tag: string;
  /** Direct child elements as key/value pairs, in document order. */
  fields: StructuredTagField[];
}

/**
 * Parses a harness payload that is a single XML-like tag block — e.g. the
 * `<task-notification>…</task-notification>` notice the Claude Code harness
 * queues into the transcript — into its root tag plus an ordered list of child
 * fields.
 *
 * Deliberately field-agnostic: it reads whatever child elements are present, in
 * order, with no knowledge of specific tag or field names. A new field (or a
 * changed format) surfaces automatically instead of being silently dropped —
 * the whole point of the generic display. Returns `null` when the text is not a
 * clean single-root block (surrounding prose, malformed XML, or a bare tag with
 * no child fields), so callers fall back to rendering the raw text untouched.
 */
export function parseStructuredTag(text: string): StructuredTag | null {
  const trimmed = text.trim();
  // Cheap pre-check: a structured block is exactly one element, so it must open
  // and close with angle brackets. Skips the parser for ordinary prose.
  if (!trimmed.startsWith("<") || !trimmed.endsWith(">")) return null;

  const doc = new DOMParser().parseFromString(trimmed, "application/xml");
  // A malformed document yields a <parsererror> node rather than throwing.
  if (doc.querySelector("parsererror")) return null;

  const root = doc.documentElement;
  if (!root) return null;

  const fields: StructuredTagField[] = Array.from(root.children).map((child) => ({
    key: child.tagName,
    value: (child.textContent ?? "").trim(),
  }));

  // A bare tag wrapping plain text (no child elements) is not a structured
  // block — render it raw rather than collapsing its content to nothing.
  if (fields.length === 0) return null;

  return { tag: root.tagName, fields };
}

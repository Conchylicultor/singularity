import { existsSync } from "fs";
import {
  matchBracket,
  walkFiles,
  readIfExists,
  parseStringField,
  findImports,
  maskSource,
  markerCallSpans,
} from "@plugins/plugin-meta/plugins/parse-utils/core";

// ── Types ──────────────────────────────────────────────────────────

export interface PaneDefinition {
  id: string;
  path?: string;
}

export interface ImportBinding {
  local: string;
  original: string;
  module: string;
}

// ── Helpers ────────────────────────────────────────────────────────

export function parseImports(src: string): Map<string, ImportBinding> {
  const map = new Map<string, ImportBinding>();
  // `findImports` masks strings/comments/regex fully and reads each specifier
  // back by offset, so an import written inside a string can never register a
  // phantom binding. The old namedRe/defRe were `import`-only and never matched
  // a whole-statement `import type …` or a namespace `import * as X`, so those
  // are filtered out to keep behavior identical.
  for (const imp of findImports(src)) {
    if (imp.keyword !== "import") continue;
    if (imp.sideEffect) continue;
    if (imp.typeOnly) continue;
    const clause = imp.clause;
    if (/^\s*\*\s/.test(clause)) continue; // namespace `import * as X`
    const mod = imp.specifier;
    const braceIdx = clause.indexOf("{");
    if (braceIdx < 0) {
      // Default-only `import Foo from` — the whole clause is the local id (defRe).
      const head = clause.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(head)) {
        map.set(head, { local: head, original: "default", module: mod });
      }
      continue;
    }
    // Default alongside named (`import Foo, { … } from`) — the namedRe m[1] branch.
    const defMatch = clause.slice(0, braceIdx).match(/([A-Za-z_$][\w$]*)\s*,/);
    if (defMatch) {
      const defLocal = defMatch[1]!;
      map.set(defLocal, { local: defLocal, original: "default", module: mod });
    }
    const closeIdx = clause.indexOf("}", braceIdx);
    const names = clause.slice(braceIdx + 1, closeIdx < 0 ? clause.length : closeIdx);
    for (const raw of names.split(",")) {
      let s = raw.trim();
      if (!s) continue;
      s = s.replace(/^type\s+/, "");
      const asMatch = s.match(/^(\w+)\s+as\s+(\w+)$/);
      if (asMatch) map.set(asMatch[2]!, { local: asMatch[2]!, original: asMatch[1]!, module: mod });
      else if (/^\w+$/.test(s)) map.set(s, { local: s, original: s, module: mod });
    }
  }
  return map;
}

/** Inner offsets of the `contributions: [ … ]` array body (into the buffer). */
export interface ContributionsBlock {
  /** Offset of the first char *inside* the `[`. */
  start: number;
  /** Offset of the closing `]`. */
  end: number;
}

/**
 * Locate the `contributions: [ … ]` array over a FULLY-MASKED buffer (string /
 * comment / regex interiors blanked) so a `contributions: [` written inside a
 * string or template literal can never match. `maskSource` preserves every
 * offset 1:1, so the returned bounds index straight back into the original.
 */
export function extractContributionsBlock(masked: string): ContributionsBlock | null {
  const idx = masked.search(/\bcontributions\s*:\s*\[/);
  if (idx < 0) return null;
  const start = masked.indexOf("[", idx);
  const end = matchBracket(masked, start, "[", "]");
  if (end < 0) return null;
  return { start: start + 1, end };
}

/**
 * Find each top-level `Head.member(...)` contribution call inside the block,
 * regardless of argument shape — an inline object literal (`Cell({ … })`), a
 * pre-built const (`DataViewSlots.Filter(textOperatorSet)`), a helper call, or a
 * spread. The call is *located* over `maskedBlock` (fully masked, so a call
 * written inside a string literal in a fixture/docs snippet has vanished, and
 * matchBracket never trips on a bracket inside a string), while `callee` and
 * `argsBody` are *sliced from `origBlock`* at the matched offsets — so a real
 * call's blanked string args (`{ pane: "editorPane" }`) are recovered intact.
 * `maskedBlock` and `origBlock` are the same slice of the masked / original
 * buffers, so their offsets align 1:1.
 *
 * `argsBody` is the inline object-literal body when the first argument is `{ … }`
 * (fed to `parsePropsBlock`), else "" — the slot identity comes from the callee,
 * not the argument. Requiring an inline literal here is exactly what dropped every
 * `DataViewSlots.Filter(<const>)` contribution from the closure graph. Nested
 * dotted calls inside an argument are skipped by resuming the scan past each
 * call's balanced `)`.
 */
export function findCalls(
  maskedBlock: string,
  origBlock: string,
): { callee: string; argsBody: string }[] {
  const out: { callee: string; argsBody: string }[] = [];
  const re = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s*\(/g; // no `{` requirement
  let m: RegExpExecArray | null;
  while ((m = re.exec(maskedBlock))) {
    const callee = origBlock.slice(m.index, m.index + m[1]!.length);
    const openIdx = m.index + m[0].length - 1; // index of "("
    const closeParen = matchBracket(maskedBlock, openIdx, "(", ")");
    if (closeParen < 0) continue;
    // Inline object-literal argument → keep its body for parsePropsBlock.
    let argsBody = "";
    let j = openIdx + 1;
    while (j < maskedBlock.length && /\s/.test(maskedBlock[j]!)) j++;
    if (maskedBlock[j] === "{") {
      const closeBrace = matchBracket(maskedBlock, j, "{", "}");
      if (closeBrace >= 0) argsBody = origBlock.slice(j + 1, closeBrace);
    }
    out.push({ callee, argsBody });
    re.lastIndex = closeParen + 1; // resume AFTER this call → skip nested dotted calls in args
  }
  return out;
}

export function parsePropsBlock(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  const len = body.length;
  const skipWs = () => {
    while (i < len && /\s/.test(body[i]!)) i++;
  };
  const skipString = (quote: string) => {
    i++;
    while (i < len && body[i] !== quote) {
      if (body[i] === "\\") i++;
      i++;
    }
    i++;
  };
  const parseValue = (): string => {
    skipWs();
    if (i >= len) return "";
    const c = body[i]!;
    if (c === '"' || c === "'" || c === "`") {
      const start = i;
      skipString(c);
      return body.slice(start, i);
    }
    if (c === "{" || c === "[") {
      const open = c;
      const close = c === "{" ? "}" : "]";
      const start = i;
      const end = matchBracket(body, i, open, close);
      i = end < 0 ? len : end + 1;
      return body.slice(start, i);
    }
    let depth = 0;
    const start = i;
    while (i < len) {
      const ch = body[i]!;
      if (depth === 0 && ch === ",") break;
      if (ch === "{" || ch === "[" || ch === "(") depth++;
      else if (ch === "}" || ch === "]" || ch === ")") depth--;
      else if (ch === '"' || ch === "'" || ch === "`") {
        skipString(ch);
        continue;
      }
      i++;
    }
    return body.slice(start, i).trim();
  };
  while (i < len) {
    skipWs();
    const rest = body.slice(i);
    const keyMatch = /^([A-Za-z_$][\w$]*)\s*:/.exec(rest);
    if (!keyMatch) break;
    const key = keyMatch[1]!;
    i += keyMatch[0].length;
    const val = parseValue();
    out[key] = val;
    skipWs();
    if (body[i] === ",") i++;
  }
  return out;
}

export function parsePaneDefinitions(webDir: string): Map<string, PaneDefinition> {
  const out = new Map<string, PaneDefinition>();
  if (!existsSync(webDir)) return out;
  const files: string[] = [];
  walkFiles(webDir, files);
  for (const f of files) {
    const src = readIfExists(f);
    if (!src) continue;
    // FULL-mask so a `Pane.define(` written inside a comment, string, or
    // template literal (a test fixture, docs snippet, codegen template) can't
    // register a phantom pane. Genuine calls are located over the mask; the var
    // name and the object body are read back from the ORIGINAL by offset (the
    // mask preserves every offset 1:1). Routes through `markerCallSpans` rather
    // than a hand-rolled `const X = Pane.define(` regex over raw source.
    const masked = maskSource(src);
    for (const span of markerCallSpans(masked, "Pane.define")) {
      // `const <VarName> = ` immediately before the call identifier.
      const decl = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*$/.exec(
        masked.slice(0, span.identifier),
      );
      if (!decl) continue;
      // The single object-literal argument: `Pane.define({ … })`. The first
      // non-space char after `(` must be `{` (faithful to the old `\(\s*\{`).
      let braceStart = span.open + 1;
      while (braceStart < span.close && /\s/.test(masked[braceStart]!)) braceStart++;
      if (masked[braceStart] !== "{") continue;
      const braceEnd = matchBracket(masked, braceStart, "{", "}");
      if (braceEnd < 0) continue;
      const body = src.slice(braceStart + 1, braceEnd);
      // A dynamically-built pane id/path/segment is out of scope for this static
      // scanner: treat `dynamic` as `absent` (preserving prior behavior). The
      // `path ?? segment` fallback holds — only a literal value is kept.
      const idField = parseStringField(body, "id");
      const pathField = parseStringField(body, "path");
      const segmentField = parseStringField(body, "segment");
      const id = idField.kind === "value" ? idField.value : undefined;
      const path =
        pathField.kind === "value"
          ? pathField.value
          : segmentField.kind === "value"
            ? segmentField.value
            : undefined;
      if (id) out.set(decl[1]!, { id, path });
    }
  }
  return out;
}

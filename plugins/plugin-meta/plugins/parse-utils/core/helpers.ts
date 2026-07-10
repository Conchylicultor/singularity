import { existsSync, readdirSync, readFileSync, type Dirent } from "fs";
import { dirname, join } from "path";
import { maskSource } from "./mask-source";
import { markerCallSpans } from "./find-marker-calls";

// ── Types ──────────────────────────────────────────────────────────

export interface BarrelExport {
  name: string;
  kind: "type" | "value";
}

/**
 * Build-scoped, read-once in-memory filesystem snapshot.
 *
 * A facet-extraction pass over the whole plugin tree re-reads every source file
 * multiple times (once per file-walking facet) via synchronous `readFileSync` /
 * `readdirSync`, monopolizing the single event loop. When a snapshot is in
 * effect (see `runWithFsSnapshot`), `readIfExists` / `walkFiles` read from these
 * maps instead of disk — so the (still-synchronous) facet `extract()` functions
 * touch zero disk. The snapshot is built once, asynchronously and in parallel,
 * before the extract loop.
 *
 * - `files`: absolute path → file content. Only *existing* files are present.
 * - `dirs`:  absolute directory path → its `readdir(withFileTypes)` entries.
 *            Presence of a directory key means "this directory was scanned", so a
 *            path whose directory is keyed but whose file is absent resolves to
 *            `null` with no syscall.
 */
export interface FsSnapshot {
  files: Map<string, string>;
  dirs: Map<string, Dirent[]>;
}

// ── Helpers ────────────────────────────────────────────────────────

// Ambient snapshot, set synchronously around each (synchronous) facet
// extract/relate call by `runWithFsSnapshot`. Build-time callers that invoke the
// scanners directly (codegen/checks) never set it, so they keep the byte-for-byte
// sync-disk behavior below.
let activeSnapshot: FsSnapshot | null = null;

/**
 * Run `fn` with `snapshot` as the ambient FS snapshot consulted by `readIfExists`
 * / `walkFiles`. `fn` MUST be synchronous (no `await`) — the ambient is restored
 * synchronously on return, so even interleaved concurrent builds never observe
 * each other's snapshot. Pass `null` to force the sync-disk path.
 */
export function runWithFsSnapshot<T>(snapshot: FsSnapshot | null, fn: () => T): T {
  const prev = activeSnapshot;
  activeSnapshot = snapshot;
  try {
    return fn();
  } finally {
    activeSnapshot = prev;
  }
}

export function readIfExists(path: string): string | null {
  if (activeSnapshot) {
    const cached = activeSnapshot.files.get(path);
    if (cached !== undefined) return cached;
    // The directory was scanned but the file is absent → definitively null, no
    // syscall. Otherwise the directory is outside the snapshot's scope → disk.
    if (activeSnapshot.dirs.has(dirname(path))) return null;
  }
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

const transpiler = new Bun.Transpiler({ loader: "ts" });

export function stripTypes(src: string): string {
  try {
    return transpiler.transformSync(src);
  } catch (err) {
    if (!(err instanceof SyntaxError) && !(err instanceof TypeError)) throw err;
    return src;
  }
}

// ── Static string-literal reading ──────────────────────────────────
//
// These readers exist because a source value must NEVER be recovered by
// re-parsing transpiler output: Bun's transpiler re-quotes string literals (a
// `"…\"…\"…"` re-emits single-quoted, a mixed-quote literal re-emits as a
// backtick), so any regex over transpiled text silently loses or corrupts the
// value. The correct idiom is to mask the ORIGINAL source (offsets preserved
// 1:1, quote delimiters kept verbatim) and read the value back by offset — which
// is exactly what `parseStringField` / `parseBoolField` / `defaultExportObjectBody`
// do below via `readStringLiteral`.

export type StringLiteralResult =
  | { kind: "value"; value: string; end: number } // `end` = index just past the closing quote
  | { kind: "dynamic"; expr: string } // e.g. a template with an unescaped `${`
  | { kind: "none" }; // src[at] is not a quote char

export type StringFieldResult =
  | { kind: "value"; value: string }
  | { kind: "absent" } // key not present in real code
  | { kind: "dynamic"; expr: string }; // key present, value is not a static string literal

export type DefaultExportObject =
  | { kind: "object"; body: string } // text strictly between the `{` and its matching `}`
  | { kind: "absent" };

const CLOSERS: Record<string, string> = { "{": "}", "[": "]", "(": ")" };

/**
 * Cook a single escape sequence starting at `src[i]` (which is `\`). Returns the
 * decoded string (possibly empty, for a line continuation) and the index just
 * past the sequence. An unrecognized escape yields the escaped char itself
 * (`\q` → `q`), matching JS semantics.
 */
function cookEscape(src: string, i: number): { text: string; next: number } {
  const e = src[i + 1];
  if (e === undefined) return { text: "", next: i + 1 }; // trailing backslash
  switch (e) {
    case "n":
      return { text: "\n", next: i + 2 };
    case "r":
      return { text: "\r", next: i + 2 };
    case "t":
      return { text: "\t", next: i + 2 };
    case "b":
      return { text: "\b", next: i + 2 };
    case "f":
      return { text: "\f", next: i + 2 };
    case "v":
      return { text: "\v", next: i + 2 };
    case "0":
      return { text: "\0", next: i + 2 };
    case "\\":
      return { text: "\\", next: i + 2 };
    case "'":
      return { text: "'", next: i + 2 };
    case '"':
      return { text: '"', next: i + 2 };
    case "`":
      return { text: "`", next: i + 2 };
    // Line continuation: backslash + a real newline decodes to nothing.
    case "\n":
      return { text: "", next: i + 2 };
    case "\r":
      return { text: "", next: src[i + 2] === "\n" ? i + 3 : i + 2 };
    case "x": {
      const hex = src.slice(i + 2, i + 4);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        return { text: String.fromCharCode(parseInt(hex, 16)), next: i + 4 };
      }
      return { text: "x", next: i + 2 }; // malformed → char itself
    }
    case "u": {
      if (src[i + 2] === "{") {
        const close = src.indexOf("}", i + 3);
        if (close > 0) {
          const hex = src.slice(i + 3, close);
          if (/^[0-9a-fA-F]+$/.test(hex)) {
            return { text: String.fromCodePoint(parseInt(hex, 16)), next: close + 1 };
          }
        }
        return { text: "u", next: i + 2 }; // malformed → char itself
      }
      const hex = src.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        return { text: String.fromCharCode(parseInt(hex, 16)), next: i + 6 };
      }
      return { text: "u", next: i + 2 }; // malformed → char itself
    }
    default:
      return { text: e, next: i + 2 };
  }
}

/** A short, whitespace-collapsed snippet from `src[at..]`, capped at ~60 chars. */
function snippetFrom(src: string, at: number): string {
  const end = Math.min(src.length, at + 60);
  let s = src.slice(at, end).replace(/\s+/g, " ").trim();
  if (end < src.length) s += "…";
  return s;
}

/**
 * Read the string literal beginning at offset `at` in ORIGINAL (unmasked) source.
 * Handles all three quote forms and cooks escapes. A backtick literal with an
 * UNESCAPED `${` is `dynamic`; otherwise a backtick's cooked value gets today's
 * whitespace collapse (a deliberate affordance for prose wrapped across source
 * lines — author-written backticks only). `"`/`'` literals are cooked with NO
 * collapse. An unterminated literal is `dynamic` (never hangs, never throws).
 */
export function readStringLiteral(src: string, at: number): StringLiteralResult {
  const quote = src[at];
  if (quote !== '"' && quote !== "'" && quote !== "`") return { kind: "none" };
  const isTemplate = quote === "`";
  let cooked = "";
  let i = at + 1;
  while (i < src.length) {
    const c = src[i]!;
    if (c === quote) {
      const value = isTemplate ? cooked.replace(/\s+/g, " ").trim() : cooked;
      return { kind: "value", value, end: i + 1 };
    }
    if (c === "\\") {
      const { text, next } = cookEscape(src, i);
      cooked += text;
      i = next;
      continue;
    }
    // An unescaped `${` in a backtick makes the value a runtime expression.
    if (isTemplate && c === "$" && src[i + 1] === "{") {
      return { kind: "dynamic", expr: snippetFrom(src, at) };
    }
    cooked += c;
    i++;
  }
  return { kind: "dynamic", expr: snippetFrom(src, at) }; // unterminated
}

/** Escape a plain identifier for embedding in a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Value offset (index just past `field\s*:\s*`) of a key in already-MASKED text.
 * With `depth0`, `masked` is an object body and only top-level keys count —
 * nested `{}`/`[]`/`()` blocks are skipped via `matchBracket` so a nested
 * contribution's key never shadows a top-level one. Without `depth0`, the first
 * match anywhere wins (today's behavior). Returns `null` when the key is absent.
 */
function keyValueOffset(masked: string, field: string, depth0: boolean): number | null {
  const pattern = `\\b${escapeRe(field)}\\s*:\\s*`;
  if (!depth0) {
    const m = new RegExp(pattern).exec(masked);
    return m ? m.index + m[0].length : null;
  }
  const re = new RegExp(pattern, "y");
  let i = 0;
  while (i < masked.length) {
    const c = masked[i]!;
    if (c === "{" || c === "[" || c === "(") {
      const close = matchBracket(masked, i, c, CLOSERS[c]!);
      if (close < 0) return null; // unbalanced → give up
      i = close + 1;
      continue;
    }
    re.lastIndex = i;
    if (re.test(masked)) return re.lastIndex; // sticky match advances lastIndex to value offset
    i++;
  }
  return null;
}

/**
 * The value expression text from `at` up to the next depth-0 `,` or `}`, trimmed
 * and capped at ~60 chars. Read from the MASKED text so a string's interior can
 * never leak into the snippet.
 */
function exprSnippet(masked: string, at: number): string {
  let i = at;
  while (i < masked.length) {
    const c = masked[i]!;
    if (c === "{" || c === "[" || c === "(") {
      const close = matchBracket(masked, i, c, CLOSERS[c]!);
      if (close < 0) break;
      i = close + 1;
      continue;
    }
    if (c === "," || c === "}") break;
    i++;
  }
  let text = masked.slice(at, i).trim();
  if (text.length > 60) text = text.slice(0, 60) + "…";
  return text;
}

/**
 * Read a static string field. Masks `src` INTERNALLY (so a `field:` inside a
 * comment or string is never matched — safe on a raw buffer), locates the key,
 * then reads the literal from the ORIGINAL by offset. A key whose value is not a
 * static string literal (identifier / call / concat / interpolated template) is
 * `dynamic`, never silently `absent`.
 */
export function parseStringField(
  src: string,
  field: string,
  opts?: { depth0?: boolean },
): StringFieldResult {
  const masked = maskSource(src);
  const at = keyValueOffset(masked, field, opts?.depth0 ?? false);
  if (at === null) return { kind: "absent" };
  const lit = readStringLiteral(src, at);
  if (lit.kind === "value") return { kind: "value", value: lit.value };
  if (lit.kind === "dynamic") return { kind: "dynamic", expr: lit.expr };
  // Key present but the value doesn't start with a quote (identifier/call/concat).
  return { kind: "dynamic", expr: exprSnippet(masked, at) };
}

/**
 * Read a static boolean field. Same masking + `depth0` scoping as
 * `parseStringField`. A boolean field's only valid literal forms are the bare
 * `true`/`false` tokens, so the return stays a plain `boolean`.
 */
export function parseBoolField(src: string, field: string, opts?: { depth0?: boolean }): boolean {
  const masked = maskSource(src);
  const at = keyValueOffset(masked, field, opts?.depth0 ?? false);
  if (at === null) return false;
  return /^true\b/.test(masked.slice(at));
}

/**
 * Isolate a barrel's `export default { … }` object body. Masks `src`, finds
 * `export default` as real code (never in a comment/string), and — only if the
 * next non-space char is `{` — `matchBracket`es to its close, returning the text
 * strictly between the braces sliced from the ORIGINAL. A union (not
 * `string | null`) because `export default {}` is a legitimate EMPTY body,
 * distinct from `absent`.
 */
export function defaultExportObjectBody(src: string): DefaultExportObject {
  const masked = maskSource(src);
  const m = /\bexport\s+default\b/.exec(masked);
  if (!m) return { kind: "absent" };
  let i = m.index + m[0].length;
  while (i < masked.length && /\s/.test(masked[i]!)) i++;
  if (masked[i] !== "{") return { kind: "absent" }; // default export is not an object literal
  const close = matchBracket(masked, i, "{", "}");
  if (close < 0) return { kind: "absent" };
  return { kind: "object", body: src.slice(i + 1, close) };
}

export function matchBracket(src: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    // Skip comments before quote handling: a stray apostrophe or bracket inside a
    // `// ...` or `/* ... */` comment must not be treated as a string delimiter or
    // affect nesting depth (e.g. a comment mentioning a schema's row would
    // otherwise open an unterminated single-quote string and swallow the closer).
    if (c === "/" && src[i + 1] === "/") {
      i += 2;
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i++; // sits on '/'; the loop's i++ steps past it
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function parseDefineGroup<T>(
  src: string,
  builder: "defineSlot" | "defineDispatchSlot",
  make: (memberName: string, id: string, groupName: string) => T,
): T[] {
  const out: T[] = [];
  // FULL-mask the source so a `defineSlot("x")` written inside a comment,
  // string, or template literal (a test fixture, docs snippet, codegen template)
  // is blanked away and never matched; each real id is read back from the
  // ORIGINAL `src` by offset. The mask is the same length as `src`, so every
  // offset aligns 1:1 — this is what makes the scan string-embedding-safe
  // regardless of the buffer the caller hands in.
  const masked = maskSource(src);
  const spans = markerCallSpans(masked, builder);
  const groupRe = /export\s+const\s+([A-Z]\w*)\s*=\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = groupRe.exec(masked))) {
    const groupName = m[1]!;
    const braceStart = masked.indexOf("{", m.index);
    const braceEnd = matchBracket(masked, braceStart, "{", "}");
    if (braceEnd < 0) continue;
    // Each `Member: builder(...)` call inside this group's body: located over the
    // masked text, id read from the original at the call's arg span.
    for (const span of spans) {
      if (span.identifier < braceStart || span.close > braceEnd) continue;
      // Member name: the nearest `Word:` immediately before the builder call.
      const memberMatch = /([A-Z]\w*)\s*:\s*$/.exec(masked.slice(0, span.identifier));
      if (!memberMatch) continue;
      const args = src.slice(span.open + 1, span.close);
      const idMatch = /^\s*"([^"]+)"|^\s*'([^']+)'|^\s*`([^`]+)`/.exec(args);
      const id = idMatch ? (idMatch[1] ?? idMatch[2] ?? idMatch[3]) : undefined;
      if (!id) continue;
      out.push(make(memberMatch[1]!, id, groupName));
    }
  }
  return out;
}

export function parseBarrelExports(src: string): BarrelExport[] {
  const map = new Map<string, "type" | "value">();
  const setIfUnset = (name: string, kind: "type" | "value") => {
    if (!map.has(name)) map.set(name, kind);
  };

  const declRe =
    /export\s+(?!default\b)(?:async\s+)?(const|let|var|function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(src))) {
    const keyword = m[1]!;
    const name = m[2]!;
    const kind: "type" | "value" =
      keyword === "type" || keyword === "interface" ? "type" : "value";
    setIfUnset(name, kind);
  }

  const listRe = /export\s+(type\s+)?\{([^}]+)\}/g;
  while ((m = listRe.exec(src))) {
    const blockIsType = !!m[1];
    const inner = m[2]!;
    for (const raw of inner.split(",")) {
      let s = raw.trim();
      if (!s) continue;
      let itemIsType = false;
      if (/^type\s+/.test(s)) {
        itemIsType = true;
        s = s.replace(/^type\s+/, "");
      }
      const asMatch = s.match(/^(\w+)\s+as\s+(\w+)$/);
      const name = asMatch ? asMatch[2]! : s;
      if (name === "default") continue;
      if (!/^\w+$/.test(name)) continue;
      const kind: "type" | "value" = blockIsType || itemIsType ? "type" : "value";
      setIfUnset(name, kind);
    }
  }

  return Array.from(map, ([name, kind]) => ({ name, kind })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function isSkippedWalkDir(name: string): boolean {
  // `plugins` = sub-plugin trees (scanned as their own plugins); `__tests__`
  // = co-located test files, which are not part of a plugin's API/dep
  // surface and must not pollute its facets (Uses, exports, routes, …).
  return name === "node_modules" || name === "plugins" || name === "__tests__";
}

// A plugin's API/dep surface excludes co-located bun:test files (`*.test.ts(x)`,
// which the convention co-locates next to source rather than under `__tests__`) —
// the same rationale as the `__tests__` dir skip. Since `walkFiles` is the shared
// source-file enumerator for every facet + codegen scan, excluding them here keeps
// a test fixture (e.g. a `queryResourceDescriptor("qr-mismatch-test", …)` in a
// `*.test.ts`) or a test-only import from leaking into a plugin's docs.
function isSourceFile(name: string): boolean {
  return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name);
}

export function walkFiles(dir: string, out: string[]): void {
  // Snapshot fast-path: traverse the in-memory directory map. Any subdirectory
  // not covered by the snapshot re-dispatches through `walkFiles`, which falls
  // back to disk for that subtree — so the result is identical to a pure-disk
  // walk regardless of snapshot coverage.
  if (activeSnapshot) {
    const entries = activeSnapshot.dirs.get(dir);
    if (entries) {
      for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          if (isSkippedWalkDir(e.name)) continue;
          walkFiles(p, out);
        } else if (e.isFile() && isSourceFile(e.name)) {
          out.push(p);
        }
      }
      return;
    }
    // dir not in snapshot → fall through to disk below.
  }

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code == null) throw err;
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (isSkippedWalkDir(e.name)) continue;
      walkFiles(p, out);
    } else if (e.isFile() && isSourceFile(e.name)) {
      out.push(p);
    }
  }
}

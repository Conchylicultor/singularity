import { existsSync } from "fs";
import { join } from "path";
import type { PluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  matchBracket,
  maskSource,
  readIfExists,
  walkFiles,
} from "@plugins/plugin-meta/plugins/parse-utils/core";

/**
 * Static, factory-aware reorderable-render-slot scanner.
 *
 * This is the deterministic replacement for the live-barrel-walk slot discovery
 * used by the reorderable-slots manifest. It is a **pure function of committed
 * source text** — it never imports a barrel, so the slot set cannot depend on
 * which barrels happen to evaluate in a given environment (the non-determinism
 * the old runtime walk introduced).
 *
 * It discovers two kinds of `defineRenderSlot` (= reorderable) slots:
 *
 *  1. **Direct literal ids** — `defineRenderSlot("literal.id", …)` written in any
 *     web source file (typically `web/slots.ts`). Recorded verbatim.
 *  2. **Factory-produced ids** — a factory file exports a function whose body
 *     calls `defineRenderSlot(` ${param}.<suffix>` )` (or `defineRenderSlot(param)`
 *     for a passthrough id). The factory's id parameter and the static
 *     `<suffix>` tails are read FROM THE FACTORY SOURCE, then every call site
 *     `defineX("literal", …)` expands to `literal + suffix` for each suffix.
 *
 * The suffix set is derived from the factory source — never enumerated in this
 * scanner — so a NEW slot-producing factory works with zero scanner edits.
 */

export interface StaticRenderSlot {
  slotId: string;
  /** Hierarchy id of the plugin that OWNS the call site / literal definition. */
  pluginId: string;
}

const RENDER_SLOT_MARKER = "defineRenderSlot";

/** Extract the leading string-literal of an args/expression text, if any. */
function leadingStringLiteral(text: string): string | undefined {
  const m = /^\s*"([^"]*)"|^\s*'([^']*)'|^\s*`([^`$\\]*)`/.exec(text);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/**
 * Match `marker` followed by an optional balanced `<…>` type-argument block and
 * then `(`, returning the body between the matched `(` and its balanced `)`.
 *
 * `masked` must be a comment/regex-masked copy of `src` with string interiors
 * KEPT (`maskSource(src, { strings: false })`) so the leading string literal
 * survives for the caller to read. Offsets in `masked` and `src` line up 1:1.
 */
interface MarkerCall {
  /** Index of the marker identifier's first char. */
  index: number;
  /** Text between the call's `(` and its balanced `)`. */
  argsText: string;
}

/**
 * From `<` at `masked[start]`, return the index just past the matching `>` of a
 * TypeScript type-argument block, or -1 if unbalanced. Counts `<`/`>` nesting but
 * ignores the `>` in arrow tokens (`=>`) — type args routinely contain function
 * types like `() => void`, whose `>` is not an angle-bracket closer. (`{}` and
 * `()` inside don't affect angle depth.) `masked` must have comments/regex blanked
 * so a `<` in a comment can't open a phantom block.
 */
function skipTypeArgs(masked: string, start: number): number {
  let depth = 0;
  for (let i = start; i < masked.length; i++) {
    const c = masked[i];
    if (c === "<") depth++;
    else if (c === ">" && masked[i - 1] !== "=") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function findCallsWithOptionalGeneric(
  src: string,
  masked: string,
  marker: string,
): MarkerCall[] {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "g");
  const out: MarkerCall[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    let i = m.index + marker.length;
    // Skip whitespace.
    while (i < masked.length && /\s/.test(masked[i]!)) i++;
    // Optional balanced `<…>` type-argument block (TS generics may span lines and
    // contain nested generics, object types, and arrow function types).
    if (masked[i] === "<") {
      const after = skipTypeArgs(masked, i);
      if (after < 0) continue;
      i = after;
      while (i < masked.length && /\s/.test(masked[i]!)) i++;
    }
    if (masked[i] !== "(") continue;
    const closeParen = matchBracket(masked, i, "(", ")");
    if (closeParen < 0) continue;
    out.push({ index: m.index, argsText: src.slice(i + 1, closeParen) });
  }
  return out;
}

interface FactoryProducer {
  /** Exported factory function name, e.g. `defineDetailSections`. */
  name: string;
  /**
   * The static suffix appended to the id parameter for each `defineRenderSlot`
   * call inside the factory body, e.g. `.section` or `.start`. An empty string
   * means the factory passes its id parameter through unchanged.
   */
  suffixes: string[];
}

/**
 * From one factory source file, find each exported function that produces
 * reorderable slots and the suffix(es) it appends to its first parameter.
 *
 * Recognised body shapes (inside an `export function NAME(PARAM…)`):
 *   defineRenderSlot(`${PARAM}.<suffix>`, …)   → suffix = ".<suffix>"
 *   defineRenderSlot(PARAM, …)                 → suffix = ""        (passthrough)
 *
 * Only template literals whose interpolation is exactly the factory's first
 * parameter (a bare identifier) and whose tail is a STATIC string are accepted —
 * anything else is not statically resolvable and is intentionally skipped.
 */
function collectFactoryProducers(masked: string): FactoryProducer[] {
  const out: FactoryProducer[] = [];
  // Each `export function NAME(` opens a factory candidate. We read its first
  // parameter name and the slice of source spanning its body, then scan the body
  // for `defineRenderSlot` template/passthrough ids referencing that parameter.
  const fnRe = /export\s+function\s+([A-Za-z_$][\w$]*)/g;
  let fm: RegExpExecArray | null;
  while ((fm = fnRe.exec(masked))) {
    const name = fm[1]!;
    let i = fm.index + fm[0].length;
    while (i < masked.length && /\s/.test(masked[i]!)) i++;
    // Optional generic type parameters (may contain nested generics).
    if (masked[i] === "<") {
      const after = skipTypeArgs(masked, i);
      if (after < 0) continue;
      i = after;
      while (i < masked.length && /\s/.test(masked[i]!)) i++;
    }
    if (masked[i] !== "(") continue;
    const parenStart = i;
    const parenEnd = matchBracket(masked, parenStart, "(", ")");
    if (parenEnd < 0) continue;
    const paramsText = masked.slice(parenStart + 1, parenEnd);
    const firstParam = /^\s*([A-Za-z_$][\w$]*)/.exec(paramsText)?.[1];
    if (!firstParam) continue;

    // Body: from the `{` after the params to its balanced `}`.
    let bodyStart = parenEnd + 1;
    // Skip a return-type annotation `: T` up to the opening brace.
    const braceIdx = masked.indexOf("{", bodyStart);
    if (braceIdx < 0) continue;
    bodyStart = braceIdx;
    const bodyEnd = matchBracket(masked, bodyStart, "{", "}");
    if (bodyEnd < 0) continue;
    const body = masked.slice(bodyStart, bodyEnd + 1);

    const suffixes = new Set<string>();
    const calls = findCallsWithOptionalGeneric(body, body, RENDER_SLOT_MARKER);
    for (const call of calls) {
      const idExpr = call.argsText;
      // Template literal: `${firstParam}.<static-suffix>`
      const tmpl = /^\s*`\$\{\s*([A-Za-z_$][\w$]*)\s*\}([^`]*)`/.exec(idExpr);
      if (tmpl) {
        if (tmpl[1] !== firstParam) continue; // not the id param → not resolvable
        const tail = tmpl[2]!;
        // Tail must be fully static (no further interpolation).
        if (tail.includes("${")) continue;
        suffixes.add(tail);
        continue;
      }
      // Passthrough: `defineRenderSlot(firstParam, …)` — id is the param itself.
      const ident = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(idExpr);
      if (ident && ident[1] === firstParam) {
        suffixes.add("");
      }
      // A literal-id `defineRenderSlot("x")` inside a factory body is a real
      // direct slot, handled by the literal pass — not a factory suffix.
    }
    if (suffixes.size > 0) {
      out.push({ name, suffixes: [...suffixes].sort() });
    }
  }
  return out;
}

/** Web source files OWNED by a node (excludes nested child plugins via walkFiles). */
function nodeWebFiles(dir: string): string[] {
  const webDir = join(dir, "web");
  if (!existsSync(webDir)) return [];
  const files: string[] = [];
  walkFiles(webDir, files);
  return files;
}

/**
 * Collect every reorderable (`defineRenderSlot`) slot id across the tree, keyed
 * to its DEFINING plugin (the node that owns the literal definition or the
 * factory call site). Pure function of source text — no barrel imports.
 *
 * Deduped by slotId, FIRST definer wins (stable, since `tree.byDir` iteration is
 * deterministic and the output is sorted by slotId by the caller).
 */
export function collectRenderSlotsStatic(tree: PluginTree): StaticRenderSlot[] {
  // Pass 1: discover slot-producing factories from ALL web source. A factory and
  // its call sites can live in different plugins, so producers are global.
  const producersByName = new Map<string, FactoryProducer>();
  // Cache masked source per file (reused by pass 2).
  const maskedByFile = new Map<string, string>();
  const rawByFile = new Map<string, string>();
  const filesByDir = new Map<string, string[]>();

  for (const node of tree.byDir.values()) {
    const files = nodeWebFiles(node.dir);
    filesByDir.set(node.dir, files);
    for (const file of files) {
      const raw = readIfExists(file);
      if (raw == null) continue;
      rawByFile.set(file, raw);
      // `{ strings: false }`: ids we extract live INSIDE string literals, so keep
      // string interiors; mask only comments / regex literals.
      const masked = maskSource(raw, { strings: false });
      maskedByFile.set(file, masked);
      if (!raw.includes(RENDER_SLOT_MARKER)) continue;
      for (const producer of collectFactoryProducers(masked)) {
        // First definition of a factory name wins (deterministic).
        if (!producersByName.has(producer.name)) {
          producersByName.set(producer.name, producer);
        }
      }
    }
  }

  // Pass 2: collect literal `defineRenderSlot("id")` and every factory call site.
  const definingPath = new Map<string, string>();
  const record = (slotId: string, pluginId: string): void => {
    if (!definingPath.has(slotId)) definingPath.set(slotId, pluginId);
  };

  for (const node of tree.byDir.values()) {
    const files = filesByDir.get(node.dir) ?? [];
    for (const file of files) {
      const raw = rawByFile.get(file);
      const masked = maskedByFile.get(file);
      if (raw == null || masked == null) continue;

      // Direct literal render slots.
      if (raw.includes(RENDER_SLOT_MARKER)) {
        for (const call of findCallsWithOptionalGeneric(raw, masked, RENDER_SLOT_MARKER)) {
          const id = leadingStringLiteral(call.argsText);
          // Skip template/identifier ids (factory-internal, not resolvable here).
          if (id) record(id, node.id);
        }
      }

      // Factory call sites: defineX("literal", …) → literal + suffix.
      for (const producer of producersByName.values()) {
        if (!raw.includes(producer.name)) continue;
        for (const call of findCallsWithOptionalGeneric(raw, masked, producer.name)) {
          const base = leadingStringLiteral(call.argsText);
          if (base === undefined) continue;
          for (const suffix of producer.suffixes) record(base + suffix, node.id);
        }
      }
    }
  }

  return [...definingPath.entries()]
    .map(([slotId, pluginId]) => ({ slotId, pluginId }))
    .sort((a, b) => a.slotId.localeCompare(b.slotId));
}

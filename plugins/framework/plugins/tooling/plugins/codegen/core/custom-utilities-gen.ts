import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Generates `custom-utilities.generated.ts` — the twMerge registry consumed by
 * `cn()` (lib/utils.ts) — from the `/* twmerge: … *\/` markers in app.css.
 *
 * app.css is the SINGLE SOURCE OF TRUTH for both membership (which custom
 * `@utility` classes exist) and classification (how tailwind-merge must treat
 * each). Adding a custom `@utility` is then ONE edit at the declaration site; the
 * old hand-maintained name-mirroring registry (custom-utilities.ts) is deleted,
 * so the membership-drift bug class becomes structurally impossible.
 *
 * Mirrors the token-group-vars-gen trio: `renderCustomUtilities` (in-memory),
 * `generateCustomUtilities` (write-on-diff), `customUtilitiesManifestPath`.
 *
 * The generator reads app.css by PATH via fs — it must NOT statically import the
 * ui-kit plugin (that would be an illegal framework→ui cross-plugin edge), so it
 * owns its own copy of the builtin-group-id allow-list (kept in sync with
 * `BuiltinGroupId` in custom-utilities-types.ts).
 */

const APP_CSS_REL_PATH =
  "plugins/primitives/plugins/css/plugins/ui-kit/web/theme/app.css";

const MANIFEST_REL_PATH =
  "plugins/primitives/plugins/css/plugins/ui-kit/web/theme/custom-utilities.generated.ts";

// The fixed allow-list of built-in tailwind-merge group ids the project extends.
// Keep in sync with `BuiltinGroupId` in
// plugins/primitives/plugins/css/plugins/ui-kit/web/theme/custom-utilities-types.ts.
const BUILTIN_GROUP_IDS = new Set([
  "font-size", "z", "h", "w", "size", "min-h",
  "p", "px", "py", "pt", "pr", "pb", "pl",
  "gap", "gap-x", "gap-y", "rounded",
]);

const MANIFEST_HEADER = [
  "// AUTO-GENERATED from app.css @utility `/* twmerge: … */` markers. Do not edit.",
  "// Run `./singularity build` to regenerate.",
  "// (see plugins/framework/plugins/tooling/plugins/codegen/core/custom-utilities-gen.ts).",
  "//",
  "// The twMerge registry consumed by cn() (lib/utils.ts), derived from app.css —",
  "// the single source of truth for which custom @utility classes exist and how",
  "// tailwind-merge must classify each.",
  "//",
  "// The `app-css-utilities-in-sync` check fails on drift.",
].join("\n");

type Marker =
  | { kind: "extend"; builtin: string }
  | { kind: "group"; group: string }
  | { kind: "standalone"; reason: string };

type RegistryEntry =
  | { classes: string[]; extend: string }
  | { classes: string[]; group: string; conflictsWith: string[] }
  | { classes: string[]; standalone: true; reason: string };

/** A synthetic-group declaration scanned file-wide from a section header. */
interface GroupDecl {
  id: string;
  conflicts: string[];
}

/**
 * Parse a single `/* twmerge: <ref> *\/` marker body into a structured Marker.
 * Throws on an unknown ref shape, an unknown builtin id, or an empty standalone
 * reason. `where` names the `@utility` for the error message.
 */
function parseMarker(ref: string, where: string): Marker {
  const trimmed = ref.trim();
  const extendMatch = /^extend\s+([\w-]+)$/.exec(trimmed);
  if (extendMatch) {
    const builtin = extendMatch[1]!;
    if (!BUILTIN_GROUP_IDS.has(builtin)) {
      throw new Error(
        `app.css @utility ${where}: unknown built-in tailwind-merge group "${builtin}" in marker "extend ${builtin}". ` +
          `Allowed: ${[...BUILTIN_GROUP_IDS].join(", ")}.`,
      );
    }
    return { kind: "extend", builtin };
  }
  const standaloneMatch = /^standalone\s*--\s*(.+)$/s.exec(trimmed);
  if (standaloneMatch) {
    const reason = standaloneMatch[1]!.trim();
    if (!reason) {
      throw new Error(
        `app.css @utility ${where}: marker "standalone" requires a non-empty reason ("standalone -- <reason>").`,
      );
    }
    return { kind: "standalone", reason };
  }
  // Anything else is a synthetic-group id reference; validity (must match a group
  // decl) is checked after group decls are collected.
  if (/^[\w-]+$/.test(trimmed)) {
    return { kind: "group", group: trimmed };
  }
  throw new Error(
    `app.css @utility ${where}: unrecognized twmerge marker "${trimmed}". ` +
      `Expected "extend <builtin>", "<sg-id>", or "standalone -- <reason>".`,
  );
}

/** Scan every `/* @twmerge group <id> conflicts: <ids…> *\/` decl file-wide. */
function collectGroupDecls(css: string): Map<string, GroupDecl> {
  const decls = new Map<string, GroupDecl>();
  const re = /@twmerge\s+group\s+([\w-]+)\s+conflicts:\s*([^*]+?)\s*(?:\*\/|\n|$)/g;
  for (const m of css.matchAll(re)) {
    const id = m[1]!;
    const conflicts = m[2]!.trim().split(/\s+/).filter(Boolean);
    for (const c of conflicts) {
      if (!BUILTIN_GROUP_IDS.has(c)) {
        throw new Error(
          `app.css @twmerge group ${id}: unknown built-in tailwind-merge group "${c}" in conflicts list. ` +
            `Allowed: ${[...BUILTIN_GROUP_IDS].join(", ")}.`,
        );
      }
    }
    decls.set(id, { id, conflicts });
  }
  return decls;
}

/**
 * Replace every CSS block-comment's *body* with same-length spaces, leaving the
 * `/*` `*\/` delimiters and all non-comment text at their original byte offsets.
 * Used to locate REAL `@utility` declarations (an `@utility …` mention inside a
 * prose comment must not be mistaken for one) while preserving indices so the
 * original text can still be sliced for the markers (which ARE comments).
 */
function maskCommentBodies(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => "/*" + " ".repeat(m.length - 4) + "*/");
}

/**
 * Parse app.css into the ordered registry. Brace-counting-free: locate each real
 * `@utility` declaration (ignoring prose mentions inside comments), then read its
 * marker as the first `/* twmerge: … *\/` comment in the slice between that
 * declaration and the next one (or EOF). Consecutive records sharing an identical
 * marker coalesce into one entry, preserving file order.
 */
export function parseCustomUtilities(css: string): RegistryEntry[] {
  const groupDecls = collectGroupDecls(css);

  // Find real @utility declaration offsets on the comment-masked text, then slice
  // the ORIGINAL css between consecutive declarations to recover each marker.
  const masked = maskCommentBodies(css);
  const decls: Array<{ name: string; start: number }> = [];
  for (const m of masked.matchAll(/@utility\s+([\w-]+)/g)) {
    decls.push({ name: m[1]!, start: m.index! });
  }

  type Record = { name: string; marker: Marker };
  const records: Record[] = [];

  for (let i = 0; i < decls.length; i++) {
    const { name, start } = decls[i]!;
    const end = i + 1 < decls.length ? decls[i + 1]!.start : css.length;
    const slice = css.slice(start, end);
    const markerMatch = /\/\*\s*twmerge:\s*([\s\S]*?)\*\//.exec(slice);
    if (!markerMatch) {
      throw new Error(
        `app.css @utility ${name}: missing a "/* twmerge: <ref> */" marker. ` +
          `Add one of: "/* twmerge: extend <builtin> */", "/* twmerge: <sg-id> */", ` +
          `or "/* twmerge: standalone -- <reason> */" co-located with the declaration.`,
      );
    }
    records.push({ name, marker: parseMarker(markerMatch[1]!, name) });
  }

  // Validate every sg-id reference has a matching group decl.
  for (const rec of records) {
    if (rec.marker.kind === "group" && !groupDecls.has(rec.marker.group)) {
      throw new Error(
        `app.css @utility ${rec.name}: twmerge marker "${rec.marker.group}" has no ` +
          `matching "/* @twmerge group ${rec.marker.group} conflicts: … */" declaration.`,
      );
    }
  }

  // Coalesce consecutive records with an identical marker into one entry.
  const entries: RegistryEntry[] = [];
  let current: { key: string; entry: RegistryEntry } | null = null;
  const markerKey = (m: Marker): string =>
    m.kind === "extend"
      ? `extend:${m.builtin}`
      : m.kind === "group"
        ? `group:${m.group}`
        : `standalone:${m.reason}`;

  for (const rec of records) {
    const key = markerKey(rec.marker);
    if (current && current.key === key) {
      current.entry.classes.push(rec.name);
      continue;
    }
    let entry: RegistryEntry;
    if (rec.marker.kind === "extend") {
      entry = { classes: [rec.name], extend: rec.marker.builtin };
    } else if (rec.marker.kind === "group") {
      entry = {
        classes: [rec.name],
        group: rec.marker.group,
        conflictsWith: groupDecls.get(rec.marker.group)!.conflicts,
      };
    } else {
      entry = { classes: [rec.name], standalone: true, reason: rec.marker.reason };
    }
    entries.push(entry);
    current = { key, entry };
  }

  return entries;
}

function renderEntry(entry: RegistryEntry): string {
  const classes = entry.classes.map((c) => JSON.stringify(c)).join(", ");
  if ("extend" in entry) {
    return `  { classes: [${classes}], extend: ${JSON.stringify(entry.extend)} },`;
  }
  if ("group" in entry) {
    const conflicts = entry.conflictsWith.map((c) => JSON.stringify(c)).join(", ");
    return `  { classes: [${classes}], group: ${JSON.stringify(entry.group)}, conflictsWith: [${conflicts}] },`;
  }
  return `  { classes: [${classes}], standalone: true, reason: ${JSON.stringify(entry.reason)} },`;
}

function renderManifest(entries: RegistryEntry[]): string {
  const lines: string[] = [];
  lines.push(MANIFEST_HEADER);
  lines.push("");
  lines.push('import type { RegistryEntry } from "./custom-utilities-types";');
  lines.push("");
  lines.push("export const CUSTOM_UTILITY_REGISTRY = [");
  for (const entry of entries) lines.push(renderEntry(entry));
  lines.push("] as const satisfies readonly RegistryEntry[];");
  lines.push("");
  lines.push("// Synthetic group ids (for extendTailwindMerge's generic type parameter).");
  lines.push(
    'export type CustomGroupId = Extract<(typeof CUSTOM_UTILITY_REGISTRY)[number], { group: string }>["group"];',
  );
  lines.push("");
  return lines.join("\n");
}

/** Path to the app.css source the registry is derived from. */
export function appCssPath(root: string): string {
  return join(root, APP_CSS_REL_PATH);
}

/** Path to the committed generated manifest file. */
export function customUtilitiesManifestPath(root: string): string {
  return join(root, MANIFEST_REL_PATH);
}

/** Render the manifest file contents in-memory (used by the in-sync check). */
export function renderCustomUtilities(root: string): string {
  const css = readFileSync(appCssPath(root), "utf8");
  const entries = parseCustomUtilities(css);
  return renderManifest(entries);
}

/** Regenerate `custom-utilities.generated.ts` if it drifted. */
export function generateCustomUtilities(opts: { root: string }): void {
  const next = renderCustomUtilities(opts.root);
  const file = customUtilitiesManifestPath(opts.root);
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (next !== existing) writeFileSync(file, next);
}

import { sep } from "path";
import {
  walkFiles,
  readIfExists,
  findMarkerCalls,
  parseStringField,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import type { ResourceDef, ResourceFacetData } from "../core";

// A resource's identity (`key`) and keyed-ness are declared at a DESCRIPTOR
// FACTORY call — `resourceDescriptor("key", …)` (push), `keyedResourceDescriptor`
// / `queryResourceDescriptor` (keyed) — which lives in the plugin's `core/` or
// `shared/`. The resource is SERVED where a REGISTER call references that
// descriptor: `defineResource(descriptor, opts)` / `defineExternalResource(…)` /
// `queryResource(descriptor, spec)` (in `server/` or `central/`). The legacy flat
// form `defineResource({ key, mode })` inlines the key at the register site.
//
// The old scanner only handled the flat form and only looked for `defineResource`,
// so every two-arg descriptor-form resource (most of the repo — all tasks-core
// resources, every `queryResource` migration, mail, agents, …) and every
// `defineExternalResource` was invisible in the docs. This resolves the key across
// files the way the `routes` facet resolves `[endpoint.route]` computed keys: a
// per-plugin extract-time `name → descriptor` map, no import graph needed since a
// descriptor is always declared in the same plugin that serves it.

// Descriptor factory marker → whether the resource it declares is keyed.
const DESCRIPTOR_FACTORIES: Record<string, boolean> = {
  resourceDescriptor: false,
  keyedResourceDescriptor: true,
  queryResourceDescriptor: true,
};

// A call that serves a resource on a runtime. All three read the key/keyed-ness
// off a descriptor (or, for the flat `defineResource`/`defineExternalResource`
// object form, inline).
const REGISTER_MARKERS = ["defineResource", "defineExternalResource", "queryResource"] as const;

export interface DescriptorInfo {
  key: string;
  keyed: boolean;
}

/**
 * Scan sources for descriptor factory calls and map each declared const name to
 * its `{ key, keyed }`. Pass the WHOLE plugin's sources: a descriptor is declared
 * in `core/`/`shared/` but referenced by the register call in `server/`/`central/`.
 */
export function buildDescriptorIndex(sources: string[]): Map<string, DescriptorInfo> {
  const index = new Map<string, DescriptorInfo>();
  for (const src of sources) {
    for (const marker of Object.keys(DESCRIPTOR_FACTORIES)) {
      const keyed = DESCRIPTOR_FACTORIES[marker]!;
      for (const call of findMarkerCalls(src, marker)) {
        const name = declaredConstName(src, call.index);
        const key = firstStringArg(call.argsText);
        if (name && key) index.set(name, { key, keyed });
      }
    }
  }
  return index;
}

/**
 * Map each locally-bound identifier to the name it was exported under, from
 * `import { A as B } from "…"` statements. A plain (unaliased) specifier keeps its
 * name, so it needs no entry — resolution falls back to the identifier itself.
 */
export function parseImportAliases(src: string): Map<string, string> {
  const map = new Map<string, string>();
  const importRe = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'][^"']+["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src))) {
    for (const raw of m[1]!.split(",")) {
      const spec = raw.trim().replace(/^type\s+/, "");
      const aliased = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(spec);
      if (aliased) map.set(aliased[2]!, aliased[1]!);
    }
  }
  return map;
}

/**
 * Resolve one register call's `argsText` to a `ResourceDef`, or `null` when it
 * carries no statically-resolvable key — the flat form with no `key:`, or a
 * generic wrapper whose first arg is a runtime value (e.g. `queryResource`'s own
 * `defineResource(descriptor, …)` inside the compiler, where `descriptor` is a
 * function parameter, not an imported/declared descriptor).
 */
export function resolveRegisterCall(
  argsText: string,
  imports: Map<string, string>,
  index: Map<string, DescriptorInfo>,
): ResourceDef | null {
  const head = stripLeadingTrivia(argsText);
  if (head.startsWith("{")) {
    // Flat inline object form: key + optional mode live in the object literal.
    const key = parseStringField(argsText, "key");
    if (!key) return null;
    return { key, mode: parseStringField(argsText, "mode") ?? "push" };
  }
  // Descriptor form: the first arg is an identifier bound to a descriptor.
  const idMatch = /^([A-Za-z_$][\w$]*)/.exec(head);
  if (!idMatch) return null;
  const exported = imports.get(idMatch[1]!) ?? idMatch[1]!;
  const info = index.get(exported);
  if (!info) return null; // dynamic/generic reference — no static key
  // A keyed descriptor fixes the mode; otherwise server opts may set it explicitly
  // (only serverOpts carries `mode:`, so scanning the whole argsText is safe).
  const mode = parseStringField(argsText, "mode") ?? (info.keyed ? "keyed" : "push");
  return { key: info.key, mode };
}

/** Parse every register call in `sources` (one runtime), resolving keys via `index`. */
export function parseRegisterCalls(
  sources: string[],
  index: Map<string, DescriptorInfo>,
): ResourceDef[] {
  const out: ResourceDef[] = [];
  const seen = new Set<string>();
  for (const src of sources) {
    const imports = parseImportAliases(src);
    for (const marker of REGISTER_MARKERS) {
      for (const call of findMarkerCalls(src, marker)) {
        const def = resolveRegisterCall(call.argsText, imports, index);
        if (def && !seen.has(def.key)) {
          seen.add(def.key);
          out.push(def);
        }
      }
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** Extract the server + central resources served by the plugin rooted at `pluginDir`. */
export function parseResources(pluginDir: string): ResourceFacetData {
  const serverPrefix = pluginDir + sep + "server" + sep;
  const centralPrefix = pluginDir + sep + "central" + sep;

  const files: string[] = [];
  walkFiles(pluginDir, files);

  const all: string[] = [];
  const serverSources: string[] = [];
  const centralSources: string[] = [];
  for (const f of files) {
    const src = readIfExists(f);
    if (!src) continue;
    all.push(src);
    if (f.startsWith(serverPrefix)) serverSources.push(src);
    else if (f.startsWith(centralPrefix)) centralSources.push(src);
  }

  const index = buildDescriptorIndex(all);
  return {
    server: parseRegisterCalls(serverSources, index),
    central: parseRegisterCalls(centralSources, index),
  };
}

// ── low-level text helpers ─────────────────────────────────────────────────

/** Name in the `(export) const <name> = ` that immediately precedes a marker call. */
function declaredConstName(src: string, markerIdx: number): string | null {
  const before = src.slice(0, markerIdx);
  const m = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*$/.exec(before);
  return m ? m[1]! : null;
}

/** First positional string-literal argument in a call's `argsText`, unquoted. */
function firstStringArg(argsText: string): string | null {
  const head = stripLeadingTrivia(argsText);
  const m = /^("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/.exec(head);
  return m ? m[1]!.slice(1, -1) : null;
}

/** Drop leading whitespace and line/block comments (offsets are irrelevant here). */
function stripLeadingTrivia(s: string): string {
  let i = 0;
  for (;;) {
    while (i < s.length && /\s/.test(s[i]!)) i++;
    if (s[i] === "/" && s[i + 1] === "/") {
      i += 2;
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    if (s[i] === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    break;
  }
  return s.slice(i);
}

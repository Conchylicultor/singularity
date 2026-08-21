import { sep } from "path";
import {
  walkFiles,
  readIfExists,
  findImports,
  findMarkerCalls,
  markerCallSpans,
  maskSource,
  lineAt,
  parseStringField,
  parseStaticCallId,
  unresolvableCallIdMessage,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import {
  resourceDescriptorFactories,
  resourceRegisterMarkers,
  isResourceVocabularyOwner,
  type ResourceMembership,
} from "@plugins/framework/plugins/tooling/plugins/resource-vocabulary/core";
import type { ResourceDef, ResourceFacetData } from "../core";

// A resource's identity (`key`), keyed-ness and bounded membership are declared
// at a DESCRIPTOR FACTORY call — `resourceDescriptor("key", …)` (push),
// `windowQueryResourceDescriptor` (bounded window), … — which lives in a
// plugin's `core/` or `shared/`. The resource is SERVED where a REGISTER call
// references that descriptor: `defineResource(descriptor, opts)` /
// `windowQueryResource(descriptor, spec)` (in `server/` or `central/`). The
// legacy flat form `defineResource({ key, mode })` inlines the key at the
// register site. The key is resolved across files the way the `routes` facet
// resolves `[endpoint.route]` computed keys: an extract-time
// `name → descriptor` map, built over the serving plugin's own sources and, for
// a descriptor imported from another plugin's barrel, over that plugin's.
//
// WHICH NAMES COUNT IS NOT DECIDED HERE. This scanner used to keep its own list
// of three factory names and three marker names, and the eager-tier generator
// kept a second, different list. Neither knew the five bounded-membership
// factories, so ~10 plugins served a resource the docs said they didn't — and
// nothing noticed, because an unrecognised factory produces no match and
// therefore no facet data, which reads exactly like a plugin that declares
// nothing. Both lists are now one derived vocabulary
// (`tooling/resource-vocabulary/core`), whose key set `tsc` checks against the
// barrels themselves.
//
// AND WHAT IT CANNOT RESOLVE, IT REFUSES. Every miss below either resolves or
// throws, naming file, line and the offending expression — the same contract
// `scanDataViewIds` (codegen) and the `contributions` facet already hold. The
// one legitimate unresolvable shape is a runtime descriptor value (a function
// parameter inside the query compiler), and it is exempted by NAME BINDING
// rather than by silence: an identifier that is neither imported nor a
// module-level const in the file is not something this scanner ever could have
// resolved.

/** One source file of the plugin being scanned. */
export interface SourceFile {
  /** Path as walked — quoted in error messages, so it must be openable. */
  path: string;
  src: string;
}

export interface DescriptorInfo {
  key: string;
  keyed: boolean;
  membership: ResourceMembership | null;
}

/** How one local identifier got into a file. */
interface Binding {
  /** The name it was exported under (`import { A as B }` binds B to A). */
  exported: string;
  /** Module specifier it came from, or null for a module-level `const`. */
  specifier: string | null;
}

/** Every identifier of one file a descriptor argument could resolve through. */
export type FileBindings = Map<string, Binding>;

/**
 * Resolve a descriptor imported from ANOTHER plugin's barrel — `null` when the
 * specifier names no plugin this resolver can read.
 *
 * Cross-plugin descriptors are rare but real: `mail/sync` serves
 * `mail-sync-state`, whose descriptor is declared in `mail/mail-core`. The old
 * scanner assumed a descriptor is always declared in the plugin that serves it
 * and silently dropped those; they are exactly the resources this facet exists
 * to report.
 */
export type ImportedDescriptorResolver = (
  specifier: string,
  exportedName: string,
) => DescriptorInfo | null;

/**
 * Scan sources for descriptor factory calls and map each declared const name to
 * its `{ key, keyed, membership }`. Pass the WHOLE plugin's sources: a descriptor
 * is declared in `core/`/`shared/` but referenced by the register call in
 * `server/`/`central/`.
 *
 * THROWS on a `const x = <factory>(…)` whose key is not a static string literal,
 * unless the plugin owns the factory (see `isResourceVocabularyOwner`: inside
 * `live-state` / `query-resource` a factory call is the wrapper IMPLEMENTING it,
 * called with a computed key, not a plugin declaring a resource). A call not
 * bound to a `const` is skipped rather than raised — it is a wrapper's internal
 * use or a `return` expression, with no name for a register call to reference;
 * if a register call somehow does reference it, that call raises instead.
 */
export function buildDescriptorIndex(
  files: SourceFile[],
  opts: { ownerPlugin: boolean },
): Map<string, DescriptorInfo> {
  const index = new Map<string, DescriptorInfo>();
  for (const { path, src } of files) {
    let masked: string | null = null;
    for (const [factory, entry] of Object.entries(
      resourceDescriptorFactories,
    )) {
      if (!src.includes(factory)) continue; // cheap fast-path
      // `markerCallSpans` needs a FULL mask, so a factory call written inside a
      // string or comment is never matched; the key is read back from the
      // ORIGINAL at the call's arg span.
      masked ??= maskSource(src);
      for (const span of markerCallSpans(masked, factory)) {
        const name = declaredConstName(masked, span.identifier);
        if (!name) continue;
        const id = parseStaticCallId(src, span);
        if (id.kind !== "value") {
          if (opts.ownerPlugin) continue;
          throw new Error(
            unresolvableCallIdMessage({
              marker: factory,
              file: path,
              line: lineAt(src, span.identifier),
              expr: id.kind === "dynamic" ? id.expr : "",
              hint:
                "A resource's key is read from source text by the docs facet and by " +
                "the eager-tier generator, so it must be a literal at the declaration " +
                "site — a descriptor whose key neither can read would silently vanish " +
                "from docs/plugins-details.md and never pin its plugin eager. Inline " +
                "the literal instead of hoisting or interpolating it.",
            }),
          );
        }
        index.set(name, {
          key: id.value,
          keyed: entry.keyed,
          membership: entry.membership,
        });
      }
    }
  }
  return index;
}

/**
 * The identifier bindings of one file: every imported name (with the specifier
 * it came from) and every module-level `const`.
 *
 * `findImports` masks strings/comments/regex fully and reads each specifier back
 * by offset, so an import written inside a string/template literal can never
 * register a phantom binding. The import half mirrors the original alias regex:
 * keep `import` (not `export`), keep type-only, and only parse a clause whose
 * post-`type` head is the named block.
 */
export function parseFileBindings(src: string): FileBindings {
  const bindings: FileBindings = new Map();
  for (const imp of findImports(src)) {
    if (imp.keyword !== "import" || imp.sideEffect) continue;
    const clause = imp.clause.replace(/^\s*type\s+/, "");
    const braceIdx = clause.indexOf("{");
    if (braceIdx < 0 || clause.slice(0, braceIdx).trim() !== "") continue;
    const closeIdx = clause.indexOf("}", braceIdx);
    const names = clause.slice(
      braceIdx + 1,
      closeIdx < 0 ? clause.length : closeIdx,
    );
    for (const raw of names.split(",")) {
      const spec = raw.trim().replace(/^type\s+/, "");
      const aliased = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(
        spec,
      );
      if (aliased) {
        bindings.set(aliased[2]!, {
          exported: aliased[1]!,
          specifier: imp.specifier,
        });
      } else if (/^[A-Za-z_$][\w$]*$/.test(spec)) {
        bindings.set(spec, { exported: spec, specifier: imp.specifier });
      }
    }
  }

  // Module scope only: the `const` must start its line with no indentation, so a
  // `const` inside a function body (or a destructured parameter) is not one. An
  // import binding of the same name wins — it carries the specifier.
  //
  // Column 0 rather than brace tracking, and a miss here is harmless in both
  // directions: a descriptor declared in the same file is found through the
  // INDEX regardless of indentation, and an identifier this misses is treated as
  // a runtime value — dropped rather than raised, which is the conservative
  // direction for a rule that decides whether to fail the build.
  const constRe = /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)/gm;
  const masked = maskSource(src);
  let m: RegExpExecArray | null;
  while ((m = constRe.exec(masked))) {
    const name = m[1]!;
    if (!bindings.has(name))
      bindings.set(name, { exported: name, specifier: null });
  }

  return bindings;
}

/**
 * Resolve one register call's `argsText` to a `ResourceDef`.
 *
 * `null` only for a shape this scanner could never have resolved: the flat form
 * with no literal `key:`, or a descriptor argument that is a RUNTIME VALUE — an
 * identifier bound by neither an import nor a module-level const, i.e. a
 * function parameter, which is how the query compiler calls
 * `defineResource(descriptor, …)` on a descriptor handed to it.
 *
 * THROWS when the identifier IS bound in the file but resolves to no descriptor.
 * That is the shape that used to disappear silently, and it is exactly what a
 * descriptor minted by an unknown factory looks like from here.
 */
export function resolveRegisterCall(
  marker: string,
  argsText: string,
  bindings: FileBindings,
  index: Map<string, DescriptorInfo>,
  where: { file: string; line: number },
  resolveImported: ImportedDescriptorResolver,
): ResourceDef | null {
  const head = stripLeadingTrivia(argsText);
  if (head.startsWith("{")) {
    // Flat inline object form: key + optional mode live in the object literal.
    const keyField = parseStringField(argsText, "key");
    // `absent`/`dynamic` → no statically-resolvable key: a non-literal key is
    // exactly the runtime-value case the descriptor-index path exists to handle,
    // so fall through to `null` (drop from the static resource list).
    if (keyField.kind !== "value") return null;
    const modeField = parseStringField(argsText, "mode");
    const mode = modeField.kind === "value" ? modeField.value : "push";
    return { key: keyField.value, mode };
  }
  // Descriptor form: the first arg is an identifier bound to a descriptor.
  const idMatch = /^([A-Za-z_$][\w$]*)/.exec(head);
  if (!idMatch) return null;
  const local = idMatch[1]!;
  const binding = bindings.get(local);
  const info =
    index.get(binding?.exported ?? local) ??
    (binding?.specifier != null
      ? resolveImported(binding.specifier, binding.exported)
      : null);
  if (!info) {
    if (!binding) return null; // runtime value — a parameter, never resolvable from text
    throw new Error(
      unresolvableCallIdMessage({
        marker,
        file: where.file,
        line: where.line,
        expr: local,
        hint:
          `\`${local}\` is bound in this file but is not a descriptor this scanner ` +
          "can resolve. If it comes from a descriptor factory the vocabulary does " +
          "not know, add that factory to " +
          "plugins/framework/plugins/tooling/plugins/resource-vocabulary/core — " +
          "until it is listed, this resource is invisible to docs/plugins-details.md " +
          "and to the eager-tier generator. Otherwise declare the descriptor as a " +
          "module-level const with a literal key and pass that identifier.",
      }),
    );
  }
  // A keyed descriptor fixes the mode; otherwise server opts may set it explicitly
  // (only serverOpts carries `mode:`, so scanning the whole argsText is safe). A
  // non-literal `mode:` is the runtime-value case the descriptor already resolves,
  // so `absent`/`dynamic` both fall through to the descriptor-implied default.
  const modeField = parseStringField(argsText, "mode");
  const mode =
    modeField.kind === "value"
      ? modeField.value
      : info.keyed
        ? "keyed"
        : "push";
  return info.membership
    ? { key: info.key, mode, membership: info.membership }
    : { key: info.key, mode };
}

/** Parse every register call in `files` (one runtime), resolving keys via `index`. */
export function parseRegisterCalls(
  files: SourceFile[],
  index: Map<string, DescriptorInfo>,
  resolveImported: ImportedDescriptorResolver,
): ResourceDef[] {
  const out: ResourceDef[] = [];
  const seen = new Set<string>();
  for (const { path, src } of files) {
    const bindings = parseFileBindings(src);
    for (const marker of Object.keys(resourceRegisterMarkers)) {
      if (!src.includes(marker)) continue; // cheap fast-path
      for (const call of findMarkerCalls(src, marker)) {
        const def = resolveRegisterCall(
          marker,
          call.argsText,
          bindings,
          index,
          { file: path, line: lineAt(src, call.index) },
          resolveImported,
        );
        if (def && !seen.has(def.key)) {
          seen.add(def.key);
          out.push(def);
        }
      }
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** Read every file under `dir` as a `SourceFile`. */
function readPluginSources(dir: string): SourceFile[] {
  const paths: string[] = [];
  walkFiles(dir, paths);
  const files: SourceFile[] = [];
  for (const path of paths) {
    const src = readIfExists(path);
    if (src) files.push({ path, src });
  }
  return files;
}

/**
 * Repo root of an absolute plugin dir — everything before its FIRST `plugins/`
 * segment, which is where a plugin's repo-relative path always starts. `null`
 * when `dir` has none (a test fixture under a temp dir), which disables
 * cross-plugin descriptor resolution rather than guessing at a root.
 */
function repoRootOf(dir: string): string | null {
  const marker = sep + "plugins" + sep;
  const idx = dir.indexOf(marker);
  return idx < 0 ? null : dir.slice(0, idx);
}

/** Extract the server + central resources served by the plugin rooted at `pluginDir`. */
export function parseResources(pluginDir: string): ResourceFacetData {
  const serverPrefix = pluginDir + sep + "server" + sep;
  const centralPrefix = pluginDir + sep + "central" + sep;

  const all = readPluginSources(pluginDir);
  const serverSources = all.filter((f) => f.path.startsWith(serverPrefix));
  const centralSources = all.filter((f) => f.path.startsWith(centralPrefix));

  const index = buildDescriptorIndex(all, {
    ownerPlugin: isResourceVocabularyOwner(pluginDir),
  });

  // Cross-plugin descriptors are rare (a handful repo-wide), so the other
  // plugin's index is built ON DEMAND rather than cached: a module-level cache
  // would outlive the build-scoped FS snapshot each extraction pass runs under
  // and could answer a later pass from an older tree.
  const repoRoot = repoRootOf(pluginDir);
  const resolveImported: ImportedDescriptorResolver = (
    specifier,
    exportedName,
  ) => {
    if (repoRoot == null || !specifier.startsWith("@plugins/")) return null;
    // "@plugins/apps/plugins/mail/plugins/mail-core/core" → that plugin's dir.
    const withoutRuntime = specifier
      .replace(/^@plugins\//, "")
      .replace(/\/[^/]+$/, "");
    if (withoutRuntime === "") return null;
    const dir =
      repoRoot + sep + "plugins" + sep + withoutRuntime.split("/").join(sep);
    const files = readPluginSources(dir);
    if (files.length === 0) return null;
    return (
      buildDescriptorIndex(files, {
        ownerPlugin: isResourceVocabularyOwner(dir),
      }).get(exportedName) ?? null
    );
  };

  return {
    server: parseRegisterCalls(serverSources, index, resolveImported),
    central: parseRegisterCalls(centralSources, index, resolveImported),
  };
}

// ── low-level text helpers ─────────────────────────────────────────────────

/** Name in the `(export) const <name> = ` that immediately precedes a marker call. */
function declaredConstName(src: string, markerIdx: number): string | null {
  const before = src.slice(0, markerIdx);
  const m = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*$/.exec(
    before,
  );
  return m ? m[1]! : null;
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

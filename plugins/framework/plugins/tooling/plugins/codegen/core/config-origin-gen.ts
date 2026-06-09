import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
import { dirname, join } from "path";
import { parse as parseJsonc } from "jsonc-parser";
import { buildEnrichedTree } from "./docgen";
import { computeHash, effective, propagate, readonlyProxy, stringifyConfigValue } from "@plugins/config_v2/core";
import type { ConfigDescriptor, ConfigProxy, FieldDef, JsonValue } from "@plugins/config_v2/core";
import {
  registerBarrelStubs,
  importBarrel,
} from "@plugins/plugin-meta/plugins/barrel-import/core";
import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";

interface DiscoveredConfig {
  hierarchyPath: string;
  descriptor: ConfigDescriptor;
}

function isConfigDescriptor(v: unknown): v is ConfigDescriptor {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.name === "string" &&
    typeof obj.fields === "object" &&
    obj.fields !== null &&
    typeof obj.defaults === "object" &&
    obj.defaults !== null
  );
}

async function discoverConfigs(root: string): Promise<DiscoveredConfig[]> {
  const tree = await buildEnrichedTree(root);
  registerBarrelStubs(root);

  const results: DiscoveredConfig[] = [];

  for (const node of tree.byDir.values()) {
    const barrelPath = join(node.dir, "server", "index.ts");
    if (!existsSync(barrelPath)) continue;

    let mod: Record<string, unknown>;
    try {
      mod = await importBarrel(barrelPath);
    } catch (err) {
      // A server barrel that fails to import is a real defect — silently
      // skipping it would drop its config origins from generation and the
      // breakage would only surface later as a mysterious missing-config. Fail
      // loudly with the offending path.
      throw new Error(
        `Failed to import server barrel for config-origin discovery: ${barrelPath}`,
        { cause: err },
      );
    }

    // Reading `.default` off the imported module record cannot throw, so no
    // guard is needed — a missing default is simply `undefined`.
    const def = mod.default as Record<string, unknown> | undefined;
    if (!def) continue;

    const contributions = def.contributions as unknown[] | undefined;
    if (!Array.isArray(contributions)) continue;

    for (const c of contributions) {
      if (!c || typeof c !== "object") continue;
      const contrib = c as Record<string, unknown>;
      if (isConfigDescriptor(contrib.descriptor)) {
        // An explicit `pluginId` on the registration wins over the node the
        // descriptor was discovered in — this lets a plugin register a descriptor
        // that belongs under a *different* defining plugin's tree. The override is
        // a dotted PluginId; config files live under the slash path, via asPath.
        const explicit =
          typeof contrib.pluginId === "string" ? contrib.pluginId : undefined;
        const id = explicit ? asPluginId(explicit) : node.id;
        results.push({ hierarchyPath: asPath(id), descriptor: contrib.descriptor });
      }
    }
  }

  return results;
}

function renderFieldLines(
  fields: Record<string, FieldDef>,
  defaults: Record<string, unknown>,
  indent: string,
): string[] {
  const lines: string[] = [];
  const entries = Object.entries(fields);
  for (let i = 0; i < entries.length; i++) {
    const [key, field] = entries[i]! as [string, FieldDef];
    const isLast = i === entries.length - 1;
    const comma = isLast ? "" : ",";
    const value = defaults[key];

    if (field.meta.description) {
      lines.push(`${indent}// ${field.meta.description}`);
    }
    if (field.meta.typeHint) {
      lines.push(`${indent}// ${field.meta.typeHint}`);
    }

    if ("subFields" in field && typeof field.subFields === "object") {
      const subFields = field.subFields as Record<string, FieldDef>;
      const subDefaults =
        value != null && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : Object.fromEntries(
              Object.entries(subFields).map(([k, f]) => [k, f.defaultValue]),
            );
      lines.push(`${indent}"${key}": {`);
      lines.push(...renderFieldLines(subFields, subDefaults, `${indent}  `));
      lines.push(`${indent}}${comma}`);
    } else {
      lines.push(`${indent}"${key}": ${stringifyConfigValue(value, indent)}${comma}`);
    }
  }
  return lines;
}

/**
 * Build-time hook that injects extra JSONC comment lines into a generated
 * `.origin.jsonc`. Each returned string is one comment's *text* (the renderer
 * prefixes `// `). Comments do not affect the config hash, so annotations can
 * change every build for free (e.g. a live catalog of available contributions).
 */
export type OriginAnnotationsProvider = (
  descriptor: ConfigDescriptor,
  hierarchyPath: string,
) => string[];

/**
 * Process-wide default annotations provider. Both the build step and the
 * `config-origins-in-sync` check resolve their provider through
 * {@link resolveOriginAnnotations}, so whatever the build wiring registers here
 * is applied identically on both sides — keeping the committed origin text and
 * the check's expected text byte-for-byte equal. Defaults to `undefined`
 * (no annotations → output identical to before this hook existed).
 */
let defaultOriginAnnotations: OriginAnnotationsProvider | undefined;

export function setDefaultOriginAnnotations(
  provider: OriginAnnotationsProvider | undefined,
): void {
  defaultOriginAnnotations = provider;
}

/** Explicit provider wins; otherwise fall back to the registered default. */
export function resolveOriginAnnotations(
  explicit?: OriginAnnotationsProvider,
): OriginAnnotationsProvider | undefined {
  return explicit ?? defaultOriginAnnotations;
}

/**
 * Async, root-aware default-annotations *preparer*. Some annotation providers
 * (e.g. reorder's contribution catalog) can only be built after walking the
 * enriched plugin tree — an async operation. A sync `OriginAnnotationsProvider`
 * can't do that itself, so a preparer module registers a function here that,
 * given the repo root, builds whatever it needs (the tree is already cached by
 * the time `renderConfigOriginContent` runs) and returns the resolved sync
 * provider.
 *
 * Critical for build↔check symmetry: `./singularity build` and the standalone
 * `./singularity check` run in SEPARATE processes, so a `setDefaultOriginAnnotations`
 * call made inside the build command is invisible to the check. The preparer is
 * instead registered as a side effect of *importing* a shared module that BOTH
 * the build step and the `config-origins-in-sync` check import — so both
 * processes resolve identical annotation comments.
 */
export type OriginAnnotationsPreparer = (
  root: string,
) => Promise<OriginAnnotationsProvider | undefined>;

let defaultOriginAnnotationsPreparer: OriginAnnotationsPreparer | undefined;

export function setDefaultOriginAnnotationsPreparer(
  preparer: OriginAnnotationsPreparer | undefined,
): void {
  defaultOriginAnnotationsPreparer = preparer;
}

/**
 * Build-time hook that *overrides* a generated origin's default value. Unlike
 * annotations (pure comments), the returned defaults feed BOTH the JSON body and
 * the `@hash`, so changing them shifts the committed origin and marks existing
 * overrides stale. Returning `undefined` (the no-provider path) falls back to
 * `descriptor.defaults` — byte-identical to before this hook existed. Used by
 * reorder to materialize each slot's full contribution catalog as the default.
 */
export type OriginDefaultsProvider = (
  descriptor: ConfigDescriptor,
  hierarchyPath: string,
) => Record<string, unknown> | undefined;

/**
 * Process-wide default defaults provider. Mirrors {@link defaultOriginAnnotations}:
 * both the build step and the `config-origins-in-sync` check resolve their
 * provider through {@link resolveOriginDefaults}, so whatever the build wiring
 * registers here is applied identically on both sides — keeping the committed
 * origin defaults/hash and the check's expected ones byte-for-byte equal.
 * Defaults to `undefined` (→ uses `descriptor.defaults`, identical to before
 * this hook existed).
 */
let defaultOriginDefaults: OriginDefaultsProvider | undefined;

export function setDefaultOriginDefaults(
  provider: OriginDefaultsProvider | undefined,
): void {
  defaultOriginDefaults = provider;
}

/** Explicit provider wins; otherwise fall back to the registered default. */
export function resolveOriginDefaults(
  explicit?: OriginDefaultsProvider,
): OriginDefaultsProvider | undefined {
  return explicit ?? defaultOriginDefaults;
}

/**
 * Async, root-aware default-defaults *preparer*, symmetric to
 * {@link OriginAnnotationsPreparer}. Reorder's materialized catalog can only be
 * built after walking the enriched plugin tree (async), so a preparer module
 * registers a function here that, given the repo root, builds the provider. As
 * with annotations, the preparer must be registered as a side effect of
 * *importing* a shared module that BOTH the build step and the
 * `config-origins-in-sync` check import, so both separate processes resolve
 * identical defaults.
 */
export type OriginDefaultsPreparer = (
  root: string,
) => Promise<OriginDefaultsProvider | undefined>;

let defaultOriginDefaultsPreparer: OriginDefaultsPreparer | undefined;

export function setDefaultOriginDefaultsPreparer(
  preparer: OriginDefaultsPreparer | undefined,
): void {
  defaultOriginDefaultsPreparer = preparer;
}

function renderOriginJsonc(
  descriptor: ConfigDescriptor,
  hierarchyPath: string,
  originAnnotations?: OriginAnnotationsProvider,
  originDefaults?: OriginDefaultsProvider,
): string {
  // An override provider supplies the materialized defaults; with no provider
  // this is `descriptor.defaults` — same value for both the body and the hash,
  // byte-identical to before the hook existed.
  const defaults =
    originDefaults?.(descriptor, hierarchyPath) ?? descriptor.defaults;
  const hash = computeHash(defaults as unknown as JsonValue);
  const lines: string[] = [];
  lines.push(`// @hash ${hash}`);
  lines.push("{");

  // Annotation comments live inside the object, before the fields. They are
  // pure comments so they never alter the parsed JSON or its hash.
  if (originAnnotations) {
    for (const line of originAnnotations(descriptor, hierarchyPath)) {
      lines.push(`  // ${line}`);
    }
  }

  lines.push(
    ...renderFieldLines(
      descriptor.fields as Record<string, FieldDef>,
      defaults as Record<string, unknown>,
      "  ",
    ),
  );

  lines.push("}");
  return lines.join("\n") + "\n";
}

export async function renderConfigOriginContent(opts: {
  root: string;
  originAnnotations?: OriginAnnotationsProvider;
  originDefaults?: OriginDefaultsProvider;
}): Promise<Map<string, string>> {
  const configs = await discoverConfigs(opts.root);
  const result = new Map<string, string>();
  // Prefer an explicit/sync default provider; otherwise, if an async preparer
  // is registered (e.g. reorder's catalog), build the provider now. The
  // enriched tree `discoverConfigs` just walked is cached, so the preparer is
  // cheap. Resolving here — the single shared entry point for both the build
  // step and the in-sync check — keeps the emitted comments byte-identical.
  let annotations = resolveOriginAnnotations(opts.originAnnotations);
  if (!annotations && defaultOriginAnnotationsPreparer) {
    annotations = await defaultOriginAnnotationsPreparer(opts.root);
  }
  // Same explicit→sync→async-preparer chain for the defaults override. With no
  // provider registered this stays `undefined`, so `renderOriginJsonc` falls
  // back to `descriptor.defaults` — byte-identical to today.
  let originDefaults = resolveOriginDefaults(opts.originDefaults);
  if (!originDefaults && defaultOriginDefaultsPreparer) {
    originDefaults = await defaultOriginDefaultsPreparer(opts.root);
  }

  for (const { hierarchyPath, descriptor } of configs) {
    const relPath = `${hierarchyPath}/${descriptor.name}.origin.jsonc`;
    result.set(
      relPath,
      renderOriginJsonc(descriptor, hierarchyPath, annotations, originDefaults),
    );
  }

  return result;
}

export async function generateConfigOrigins(opts: {
  root: string;
  originAnnotations?: OriginAnnotationsProvider;
  originDefaults?: OriginDefaultsProvider;
}): Promise<void> {
  const rendered = await renderConfigOriginContent(opts);
  const configDir = join(opts.root, "config");

  for (const [relPath, content] of rendered) {
    const filePath = join(configDir, relPath);
    const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
    if (content !== existing) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
    }
  }
}

const HASH_RE = /^\/\/ @hash ([a-f0-9]+)\n/;

function fileConfigProxy(filePath: string): ConfigProxy {
  return {
    read() {
      if (!existsSync(filePath)) return null;
      const raw = readFileSync(filePath, "utf-8");
      const match = HASH_RE.exec(raw);
      const hash = match ? match[1]! : null;
      const body = match ? raw.slice(match[0].length) : raw;
      const content = parseJsonc(body) as JsonValue;
      return { content, hash };
    },
    write(content: JsonValue, hash: string | null) {
      let str = "";
      if (hash !== null) str += `// @hash ${hash}\n`;
      str += JSON.stringify(content, null, 2) + "\n";
      const tmp = `${filePath}.tmp-${randomUUID()}`;
      try {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(tmp, str, "utf-8");
        renameSync(tmp, filePath);
      } catch (err) {
        try {
          unlinkSync(tmp);
        } catch (unlinkErr: unknown) {
          if ((unlinkErr as NodeJS.ErrnoException).code !== "ENOENT")
            throw unlinkErr;
        }
        throw err;
      }
    },
    exists() {
      return existsSync(filePath);
    },
  };
}

export async function propagateConfigToUser(opts: {
  root: string;
  worktreeName: string;
  singularityDir: string;
}): Promise<void> {
  const configs = await discoverConfigs(opts.root);
  const userConfigDir = join(opts.singularityDir, "config", opts.worktreeName);

  for (const { hierarchyPath, descriptor } of configs) {
    const gitOrigin = fileConfigProxy(
      join(opts.root, "config", hierarchyPath, `${descriptor.name}.origin.jsonc`),
    );
    const gitOverwrites = fileConfigProxy(
      join(opts.root, "config", hierarchyPath, `${descriptor.name}.jsonc`),
    );

    const gitEff = effective(gitOrigin, gitOverwrites);
    if (gitEff === undefined) continue;

    const gitEffProxy = readonlyProxy(gitEff);
    const userOrigin = fileConfigProxy(
      join(userConfigDir, hierarchyPath, `${descriptor.name}.origin.jsonc`),
    );
    const userOverwrites = fileConfigProxy(
      join(userConfigDir, hierarchyPath, `${descriptor.name}.jsonc`),
    );

    const { conflict } = propagate(gitEffProxy, userOrigin, userOverwrites);
    if (conflict) {
      console.warn(
        `[config-v2] conflict: user overwrites for "${descriptor.name}" at ${hierarchyPath} ` +
        `were based on a different upstream. Review ${join(userConfigDir, hierarchyPath, `${descriptor.name}.jsonc`)}`,
      );
    }
  }
}

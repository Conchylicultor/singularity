import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
import { dirname, join } from "path";
import { parse as parseJsonc } from "jsonc-parser";
import { buildEnrichedTree } from "./docgen";
import { computeHash, effective, propagate, readonlyProxy } from "@plugins/config_v2/core";
import type { ConfigDescriptor, ConfigProxy, FieldDef, JsonValue } from "@plugins/config_v2/core";
import {
  registerBarrelStubs,
  importBarrel,
} from "@plugins/plugin-meta/plugins/barrel-import/core";

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
    } catch {
      continue;
    }

    let def: Record<string, unknown> | undefined;
    try {
      def = mod.default as Record<string, unknown> | undefined;
    } catch {
      continue;
    }
    if (!def) continue;

    const contributions = def.contributions as unknown[] | undefined;
    if (!Array.isArray(contributions)) continue;

    for (const c of contributions) {
      if (!c || typeof c !== "object") continue;
      const contrib = c as Record<string, unknown>;
      if (isConfigDescriptor(contrib.descriptor)) {
        const hierarchyPath = node.hierarchyId.replace(/\./g, "/");
        results.push({ hierarchyPath, descriptor: contrib.descriptor });
      }
    }
  }

  return results;
}

function renderOriginJsonc(descriptor: ConfigDescriptor): string {
  const hash = computeHash(descriptor.defaults as unknown as JsonValue);
  const lines: string[] = [];
  lines.push(`// @hash ${hash}`);
  lines.push("{");

  const entries = Object.entries(descriptor.fields);
  for (let i = 0; i < entries.length; i++) {
    const [key, field] = entries[i]! as [string, FieldDef];
    const isLast = i === entries.length - 1;
    const comma = isLast ? "" : ",";
    const value = JSON.stringify((descriptor.defaults as Record<string, unknown>)[key]);

    if (field.meta.description) {
      lines.push(`  // ${field.meta.description}`);
    }
    if (field.meta.typeHint) {
      lines.push(`  // ${field.meta.typeHint}`);
    }
    lines.push(`  "${key}": ${value}${comma}`);
  }

  lines.push("}");
  return lines.join("\n") + "\n";
}

export async function renderConfigOriginContent(opts: {
  root: string;
}): Promise<Map<string, string>> {
  const configs = await discoverConfigs(opts.root);
  const result = new Map<string, string>();

  for (const { hierarchyPath, descriptor } of configs) {
    const relPath = `${hierarchyPath}/${descriptor.name}.origin.jsonc`;
    result.set(relPath, renderOriginJsonc(descriptor));
  }

  return result;
}

export async function generateConfigOrigins(opts: {
  root: string;
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

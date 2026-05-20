import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { buildEnrichedTree } from "./docgen";
import { computeHash } from "@plugins/config_v2/core";
import type { ConfigDescriptor, FieldDef } from "@plugins/config_v2/core";
import type { JsonValue } from "@plugins/config_v2/core";
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

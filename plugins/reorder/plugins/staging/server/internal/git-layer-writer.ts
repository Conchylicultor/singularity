import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import {
  computeHash,
  stringifyConfigValue,
  type JsonValue,
} from "@plugins/config_v2/core";

const HASH_RE = /^\/\/ @hash ([a-f0-9]+)\n/;

/**
 * Write a reorder layout into the committed git config layer for a slot:
 * `config/<plugin-tree>/<slotId>.jsonc`, restamped against the live
 * `<slotId>.origin.jsonc` body so the override is born in-sync.
 *
 * Mirrors `jsoncConfigProxy.write` (atomic tmp + rename, `mkdirSync` recursive)
 * but is a *runtime* writer (no runtime git config writer exists today).
 *
 * CRITICAL: the override's `// @hash` must equal the hash of the **origin
 * body**, not of the override document — this is exactly what
 * `config-origins-in-sync` compares. Restamping against the live origin means
 * the override stays green.
 */
export function writeGitLayerOverride(args: {
  slotId: string;
  pluginId: string; // dot-form
  items: unknown[];
}): void {
  const { slotId, pluginId, items } = args;
  const hierarchyPath = asPath(asPluginId(pluginId));
  const dir = join(REPO_ROOT, "config", hierarchyPath);
  const originPath = join(dir, `${slotId}.origin.jsonc`);
  const overridePath = join(dir, `${slotId}.jsonc`);

  if (!existsSync(originPath)) {
    throw new Error(
      `Cannot stage a reorder default: origin file is missing (${originPath}). ` +
        `Run ./singularity build to generate it first.`,
    );
  }

  const originRaw = readFileSync(originPath, "utf-8");
  const match = HASH_RE.exec(originRaw);
  // The origin body is everything after the `// @hash` header. We hash that
  // body (matching the origin's own recorded hash) so the override anchors to
  // the current origin.
  const originBody = match ? originRaw.slice(match[0].length) : originRaw;
  const parsedOriginBody = parseJsonc(originBody) as JsonValue;
  const hash = computeHash(parsedOriginBody);

  const fullDoc: JsonValue = { items: items as JsonValue };
  const str = `// @hash ${hash}\n` + stringifyConfigValue(fullDoc) + "\n";

  const tmp = `${overridePath}.tmp-${randomUUID()}`;
  try {
    mkdirSync(dirname(overridePath), { recursive: true });
    writeFileSync(tmp, str, "utf-8");
    renameSync(tmp, overridePath);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch (unlinkErr: unknown) {
      if ((unlinkErr as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkErr;
    }
    throw err;
  }
}

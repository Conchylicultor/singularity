import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { loadConfigDescriptorsByOriginPath } from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { isListFieldDef } from "@plugins/fields/plugins/list/plugins/config/core";
import { APP_SCOPE_DIR } from "@plugins/config_v2/core";
import { parse as parseJsonc } from "jsonc-parser";
import type { FieldDef } from "@plugins/fields/core";

// A scoped override (config/<hier>/@app/<id>/<name>.jsonc) is a base-anchored
// delta: its schema anchors to the BASE origin (config/<hier>/<name>.origin.jsonc).
// No scoped origin is ever committed. Strip a trailing "@app/<id>/" segment to
// recover that base anchor; a non-scoped path is returned unchanged. Mirrors the
// sibling `config-origins-in-sync` check.
const SCOPE_SEG_RE = new RegExp(`/${APP_SCOPE_DIR}/[^/]+/([^/]+)$`);
function stripScopeSegment(p: string): string {
  return p.replace(SCOPE_SEG_RE, "/$1");
}

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const HASH_RE = /^\/\/ @hash ([a-f0-9]+)\n/;

const HINT =
  'Identity-bearing list rows need a stable, content-independent id so external ' +
  'state (e.g. saved row order) survives edits. Add a bare slug id, e.g. "id": "online".';

const check: Check = {
  id: "config-stable-list-ids",
  description:
    'Every identity-bearing config listField (stableIdentity) row carries an explicit, unique id',
  async run() {
    const root = await getRoot();
    const configDir = join(root, "config");
    if (!existsSync(configDir)) return { ok: true };

    // Map <hier>/<name>.origin.jsonc → ConfigDescriptor. Same discovery the
    // sibling check reuses.
    const descriptorsByOriginRel = await loadConfigDescriptorsByOriginPath({ root });

    const proc = Bun.spawn(["git", "ls-files", "--others", "--cached", "--", "config/"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const allConfigFiles = (await new Response(proc.stdout).text())
      .trim()
      .split("\n")
      .filter(Boolean);

    for (const relFromRoot of allConfigFiles) {
      if (!relFromRoot.endsWith(".jsonc")) continue;
      const filePath = join(root, relFromRoot);
      if (!existsSync(filePath)) continue;

      // Resolve the file to its owning descriptor via the same anchor trick the
      // sibling uses: a base override, an @app/<id>/ scoped delta, and an origin
      // all anchor to the base origin.
      const originRel = stripScopeSegment(relFromRoot)
        .replace(/^config\//, "")
        .replace(/\.jsonc$/, ".origin.jsonc");
      const descriptor = descriptorsByOriginRel.get(originRel);
      if (!descriptor) continue;

      // Top-level identity-bearing list fields only (views are top-level). Nested
      // objectField/listField are out of scope.
      const stableKeys: string[] = [];
      for (const [key, field] of Object.entries(
        descriptor.fields as Record<string, FieldDef>,
      )) {
        if (isListFieldDef(field) && field.stableIdentity === true) stableKeys.push(key);
      }
      if (stableKeys.length === 0) continue;

      const raw = readFileSync(filePath, "utf8");
      const match = HASH_RE.exec(raw);
      const body = match ? raw.slice(match[0].length) : raw;
      const doc = parseJsonc(body) as Record<string, unknown> | undefined;
      if (!doc || typeof doc !== "object") continue;

      for (const key of stableKeys) {
        const value = doc[key];
        // A file that omits the key, or whose value isn't an array, passes.
        if (!Array.isArray(value)) continue;

        const seen = new Set<string>();
        for (let index = 0; index < value.length; index++) {
          const row = value[index];
          if (!row || typeof row !== "object" || Array.isArray(row)) continue;
          const record = row as Record<string, unknown>;
          const id = record.id;
          const label =
            typeof record.name === "string" && record.name.length > 0
              ? `"${record.name}"`
              : `#${index}`;

          if (typeof id !== "string" || id.length === 0) {
            return {
              ok: false,
              message: `${relFromRoot}: row ${label} in list "${key}" has no explicit "id"`,
              hint: HINT,
            };
          }
          if (seen.has(id)) {
            return {
              ok: false,
              message: `${relFromRoot}: two rows in list "${key}" share id "${id}"`,
              hint: HINT,
            };
          }
          seen.add(id);
        }
      }
    }

    return { ok: true };
  },
};

export default check;

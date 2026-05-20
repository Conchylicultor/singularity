import { existsSync, readFileSync } from "fs";
import { join, relative } from "path";
import { renderConfigOriginContent } from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { computeHash } from "@plugins/config_v2/core";
import { parse as parseJsonc } from "jsonc-parser";
import type { JsonValue } from "@plugins/config_v2/plugins/store/core";

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

const check: Check = {
  id: "config-origins-in-sync",
  description:
    "config/ origin files match defineConfig defaults and overwrite hashes are consistent",
  async run() {
    const root = await getRoot();
    const configDir = join(root, "config");
    const expected = await renderConfigOriginContent({ root });

    for (const [relPath, content] of expected) {
      const filePath = join(configDir, relPath);
      const rel = `config/${relPath}`;
      if (!existsSync(filePath)) {
        return {
          ok: false,
          message: `${rel} is missing`,
          hint: "Run `./singularity build` to generate it.",
        };
      }
      if (readFileSync(filePath, "utf8") !== content) {
        return {
          ok: false,
          message: `${rel} is out of sync with defineConfig defaults`,
          hint: "Run `./singularity build` and commit the regenerated file.",
        };
      }
    }

    if (!existsSync(configDir)) return { ok: true };

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
      if (!relFromRoot.endsWith(".jsonc") || relFromRoot.endsWith(".origin.jsonc")) continue;

      const filePath = join(root, relFromRoot);
      if (!existsSync(filePath)) continue;

      const raw = readFileSync(filePath, "utf8");
      const match = HASH_RE.exec(raw);
      if (!match) {
        return {
          ok: false,
          message: `${relFromRoot} is missing a // @hash line`,
          hint: "Re-generate the file via `./singularity build`.",
        };
      }
      const hash = match[1]!;

      const originPath = filePath.replace(/\.jsonc$/, ".origin.jsonc");
      const originRel = relative(root, originPath);
      if (!existsSync(originPath)) {
        return {
          ok: false,
          message: `${relFromRoot} references a hash but ${originRel} does not exist`,
          hint: "Run `./singularity build` to regenerate origin files.",
        };
      }

      const originRaw = readFileSync(originPath, "utf8");
      const originMatch = HASH_RE.exec(originRaw);
      const originBody = originMatch ? originRaw.slice(originMatch[0].length) : originRaw;
      const originContent = parseJsonc(originBody) as JsonValue;
      const expectedHash = computeHash(originContent);

      if (hash !== expectedHash) {
        return {
          ok: false,
          message: `${relFromRoot} has a stale @hash (got ${hash}, expected ${expectedHash})`,
          hint: `The origin defaults changed. Review ${originRel}, update the overwrites, and set // @hash ${expectedHash} to acknowledge.`,
        };
      }
    }

    return { ok: true };
  },
};

export default check;

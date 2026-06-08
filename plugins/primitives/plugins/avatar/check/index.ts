import { createHash } from "crypto";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const HERE = dirname(new URL(import.meta.url).pathname);
const SERVER_INTERNAL = resolve(HERE, "../server/internal");
const WEB_INTERNAL = resolve(HERE, "../web/internal");
const GENERATED_PATH = join(SERVER_INTERNAL, "icon-svg-map.generated.ts");
const METADATA_PATH = join(WEB_INTERNAL, "icon-metadata.json");

function computeInputsHash(metadataContent: string, reactIconsVersion: string): string {
  const h = createHash("sha256");
  h.update(metadataContent);
  h.update(reactIconsVersion);
  return h.digest("hex").slice(0, 16);
}

const check: Check = {
  id: "icon-svg-map-in-sync",
  description: "icon-svg-map.generated.ts matches current react-icons/md + icon-metadata.json",
  async run() {
    let generated: string;
    try {
      generated = readFileSync(GENERATED_PATH, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return {
        ok: false,
        message: "icon-svg-map.generated.ts does not exist",
        hint: "Run: bun run plugins/primitives/plugins/avatar/server/internal/gen-icon-svg-map.ts",
      };
    }

    const hashMatch = generated.match(/\/\/ @inputs-hash ([a-f0-9]+)/);
    if (!hashMatch) {
      return {
        ok: false,
        message: "icon-svg-map.generated.ts is missing the @inputs-hash header",
        hint: "Regenerate: bun run plugins/primitives/plugins/avatar/server/internal/gen-icon-svg-map.ts",
      };
    }
    const fileHash = hashMatch[1];

    const metadataContent = readFileSync(METADATA_PATH, "utf-8");
    const pkgPath = require.resolve("react-icons/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const expectedHash = computeInputsHash(metadataContent, pkg.version);

    if (fileHash !== expectedHash) {
      return {
        ok: false,
        message: `icon-svg-map.generated.ts is stale (file=${fileHash}, expected=${expectedHash})`,
        hint: "Regenerate: bun run plugins/primitives/plugins/avatar/server/internal/gen-icon-svg-map.ts",
      };
    }

    return { ok: true };
  },
};

export default check;

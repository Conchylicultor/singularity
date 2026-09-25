import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { versionMismatches, type PackagePins } from "./internal/version-match";

// Inlined minimal Check shape (mirrors the other plugin-contributed checks) to
// avoid a cross-plugin import of the framework Check type from a check file.
type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  alwaysRun?: boolean;
  run(): Promise<CheckResult>;
  cacheSignature?(): string | null;
};

const CLIENT_PKG = "plugins/database/plugins/client-tools/package.json";
const SERVER_PKG = "plugins/database/plugins/embedded/package.json";

async function readPins(
  root: string,
  file: string,
  prefix: string,
): Promise<PackagePins> {
  const pkg = JSON.parse(await readFile(join(root, file), "utf8")) as {
    optionalDependencies?: Record<string, string>;
  };
  const pins = Object.fromEntries(
    Object.entries(pkg.optionalDependencies ?? {}).filter(([name]) =>
      name.startsWith(prefix),
    ),
  );
  return { file, pins };
}

const check: Check = {
  id: "database-client-tools:version-matches-server",
  description:
    "the vendored pg_dump / pg_restore come from the same Postgres release (major.minor) as the embedded server",
  // Two small file reads: guard even `./singularity build --skip-checks`.
  alwaysRun: true,
  cacheSignature: () => null,
  async run() {
    const root = await getWorktreeRoot();
    const problems = versionMismatches(
      await readPins(root, CLIENT_PKG, "@equin/pg-client-"),
      await readPins(root, SERVER_PKG, "@embedded-postgres/"),
    );
    if (problems.length === 0) return { ok: true };
    return {
      ok: false,
      message: problems.join("\n"),
      hint:
        "Bump @equin/pg-client-* and @embedded-postgres/* together. A new client release is " +
        "published from github.com/equinai/pg-client-embedded (bump PG_VERSION in scripts/build.sh " +
        "and EMBEDDED_POSTGRES_VERSION in the workflow, then tag v<major>.<minor>.0).",
    };
  },
};

export default check;

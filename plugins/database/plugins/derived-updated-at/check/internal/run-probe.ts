import { resolve } from "path";
import { MIGRATIONS_PLUGIN_DIR } from "@plugins/database/plugins/migrations/core";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";

export type ProbeResult =
  | {
      readonly kind: "ok";
      readonly undeclared: readonly { table: string; file: string }[];
      readonly loadFailures: readonly { file: string; error: string }[];
    }
  | { readonly kind: "probe-failed"; readonly message: string };

/**
 * Run `declared-probe.ts` over `absFiles` in one subprocess — the same way the
 * `schema-files-loadable` probe does: from the migrations plugin dir (drizzle-kit's
 * cwd) with drizzle-kit's own environment, so a schema file is loaded exactly as
 * migration generation loads it, and registrations land in a fresh registry
 * holding nothing but what those files declare.
 */
export async function runDeclaredProbe(
  root: string,
  absFiles: readonly string[],
): Promise<ProbeResult> {
  const result = await spawnCaptured(
    [
      process.execPath,
      "--bun",
      resolve(import.meta.dir, "declared-probe.ts"),
      ...absFiles,
    ],
    {
      cwd: resolve(root, MIGRATIONS_PLUGIN_DIR),
      env: { ...process.env, NO_COLOR: "1" },
      // Seconds of module loading; three minutes only bounds a schema file whose
      // module scope never returns (same bound as schema-files-loadable).
      timeoutMs: 180_000,
    },
  );
  try {
    const parsed = JSON.parse(result.stdout) as Omit<
      Extract<ProbeResult, { kind: "ok" }>,
      "kind"
    >;
    if (result.exitCode !== 0) throw new Error(`exit code ${result.exitCode}`);
    return { kind: "ok", ...parsed };
  } catch (err) {
    return {
      kind: "probe-failed",
      message:
        `derived-updated-at:declared probe failed (${String(err)}).\n` +
        `exit code: ${result.exitCode}\nstderr:\n${result.stderr}\nstdout:\n${result.stdout}`,
    };
  }
}

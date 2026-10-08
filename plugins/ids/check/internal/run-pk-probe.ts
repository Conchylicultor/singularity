import { resolve } from "path";
import { MIGRATIONS_PLUGIN_DIR } from "@plugins/database/plugins/migrations/core";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";

export type PkProbeResult =
  | {
      readonly kind: "ok";
      readonly undeclared: readonly { table: string; file: string }[];
      readonly loadFailures: readonly { file: string; error: string }[];
    }
  | { readonly kind: "probe-failed"; readonly message: string };

/**
 * Run `pk-probe.ts` over `absFiles` in one subprocess, from the migrations
 * plugin dir (drizzle-kit's cwd) — the same way `derived-updated-at:declared`
 * runs its probe — so a schema file loads exactly as migration generation
 * loads it, into a fresh process holding nothing else.
 */
export async function runPkProbe(
  root: string,
  absFiles: readonly string[],
): Promise<PkProbeResult> {
  const result = await spawnCaptured(
    [
      process.execPath,
      "--bun",
      resolve(import.meta.dir, "pk-probe.ts"),
      ...absFiles,
    ],
    {
      cwd: resolve(root, MIGRATIONS_PLUGIN_DIR),
      env: { ...process.env, NO_COLOR: "1" },
      // Seconds of module loading; three minutes only bounds a schema file
      // whose module scope never returns.
      timeoutMs: 180_000,
    },
  );
  try {
    const parsed = JSON.parse(result.stdout) as Omit<
      Extract<PkProbeResult, { kind: "ok" }>,
      "kind"
    >;
    if (result.exitCode !== 0) throw new Error(`exit code ${result.exitCode}`);
    return { kind: "ok", ...parsed };
  } catch (err) {
    return {
      kind: "probe-failed",
      message:
        `ids:pk-declared probe failed (${String(err)}).\n` +
        `exit code: ${result.exitCode}\nstderr:\n${result.stderr}\nstdout:\n${result.stdout}`,
    };
  }
}

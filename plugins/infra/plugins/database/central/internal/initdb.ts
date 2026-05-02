import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pgBin } from "./binaries";
import { PG_DATA_DIR, PG_DIR, PG_SOCKET_DIR, PG_USER } from "./paths";

/**
 * `initdb` writes `PG_VERSION` last; its presence means the cluster is
 * fully initialized. A partial initdb (interrupted, dyld error, etc.)
 * leaves the dir present but unusable — caller should treat that as
 * "doesn't exist" and re-init.
 */
export function dataDirValid(): boolean {
  return existsSync(join(PG_DATA_DIR, "PG_VERSION"));
}

export function dataDirPartial(): boolean {
  return existsSync(PG_DATA_DIR) && !dataDirValid();
}

/** Remove a half-baked data dir so we can re-initdb cleanly. */
export function clearPartialDataDir(): void {
  rmSync(PG_DATA_DIR, { recursive: true, force: true });
}

/**
 * Run `initdb` on `PG_DATA_DIR`. Caller must have already established that
 * `dataDirExists()` is false. Creates parent dirs as needed.
 */
export async function initdb(): Promise<void> {
  mkdirSync(PG_DIR, { recursive: true });
  mkdirSync(PG_SOCKET_DIR, { recursive: true, mode: 0o700 });

  console.log(`[database] running initdb at ${PG_DATA_DIR}`);
  const proc = Bun.spawn(
    [
      pgBin("initdb"),
      "-D",
      PG_DATA_DIR,
      "-U",
      PG_USER,
      "-A",
      "trust",
      "--no-locale",
      "--encoding",
      "UTF8",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`initdb failed (exit ${code}): ${stderr || stdout}`);
  }
}

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOME_DIR } from "@plugins/infra/plugins/paths/core";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";

/**
 * `readDatabaseConfig()` resolves its path ONCE, at module load, from
 * `SINGULARITY_DIR` — which `@plugins/infra/plugins/paths/core` itself freezes at
 * ITS module load — and then memoizes the parsed result for the process lifetime.
 *
 * That is a real constraint, not an accident: every consumer in a backend or a
 * CLI process wants one stable answer. It does mean an in-process test cannot
 * point the reader at a different directory — by the time a `bun test` file runs,
 * `test/bun-preload.ts` has already imported the paths barrel and frozen
 * `SINGULARITY_DIR` to the developer's real `~/.singularity`, which on any dev
 * host DOES contain `database.json`. The tolerant no-file fallback would then
 * never be exercised.
 *
 * So the probe runs in a CHILD process with `SINGULARITY_DIR` pointed at an empty
 * temp dir — the same technique the plan's bare-host simulation uses. The probe
 * script is written INSIDE the repo tree so Bun resolves the `@plugins/*` alias
 * from the repo tsconfig exactly as it does for the module under test.
 */
const CONFIG_MODULE = join(import.meta.dir, "config.ts");

const probeDir = mkdtempSync(join(import.meta.dir, ".config-test-"));
const emptySingularityDir = mkdtempSync(join(tmpdir(), "singularity-empty-"));

afterAll(() => {
  rmSync(probeDir, { recursive: true, force: true });
  rmSync(emptySingularityDir, { recursive: true, force: true });
});

interface Probe {
  config: { connection: { host: string; port: number; user: string }; services: unknown[] };
  env: Record<string, string>;
}

/**
 * Run `readDatabaseConfig()` + `libpqEnv()` in a child with a fully controlled
 * environment and return both results. Throws on a non-zero exit — a crash IS
 * the failure this test exists to detect (the deleted CLI copy threw ENOENT here).
 */
async function probe(env: Record<string, string>): Promise<Probe> {
  const file = join(probeDir, `probe-${Math.random().toString(36).slice(2)}.ts`);
  writeFileSync(
    file,
    `import { readDatabaseConfig, libpqEnv } from ${JSON.stringify(CONFIG_MODULE)};\n` +
      `console.log(JSON.stringify({ config: readDatabaseConfig(), env: libpqEnv() }));\n`,
  );
  const result = await spawnCaptured([process.execPath, "run", file], {
    cwd: import.meta.dir,
    env,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `probe exited ${result.exitCode}\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`,
    );
  }
  return JSON.parse(result.stdout.trim()) as Probe;
}

// A deliberately minimal, PG*-free base environment: PATH so Bun can exec, and
// the empty SINGULARITY_DIR. Anything the dev's shell exports (PGHOST, a real
// SINGULARITY_DIR, USER) must NOT leak in, or the assertions below stop meaning
// what they say.
const baseEnv = {
  PATH: process.env.PATH ?? "",
  // Bun wants a home for its own caches; HOME_DIR is the sanctioned source.
  HOME: HOME_DIR,
  SINGULARITY_DIR: emptySingularityDir,
};

describe("readDatabaseConfig / libpqEnv with no database.json", () => {
  test("falls back to the system-Postgres defaults instead of throwing", async () => {
    const { config } = await probe({ ...baseEnv, USER: "probe-user" });

    expect(config.connection).toEqual({ host: "localhost", port: 5432, user: "probe-user" });
    // An empty services list is what makes callers treat the DB as externally
    // managed (build.ts's waitForPg returns early on it) rather than crash.
    expect(config.services).toEqual([]);
  });

  test("USER-less environment still resolves a user rather than undefined", async () => {
    const { config, env } = await probe(baseEnv);
    expect(config.connection.user).toBe("postgres");
    expect(env.PGUSER).toBe("postgres");
  });

  test("libpqEnv derives PGHOST/PGPORT/PGUSER from the fallback config", async () => {
    const { env } = await probe({ ...baseEnv, USER: "probe-user" });
    expect(env).toEqual({ PGHOST: "localhost", PGPORT: "5432", PGUSER: "probe-user" });
  });

  test("an explicit PG* in the ambient environment wins over the config", async () => {
    const { env } = await probe({
      ...baseEnv,
      USER: "probe-user",
      PGHOST: "/tmp/pg-sockets",
      PGPORT: "6543",
      PGUSER: "someone-else",
    });
    expect(env).toEqual({
      PGHOST: "/tmp/pg-sockets",
      PGPORT: "6543",
      PGUSER: "someone-else",
    });
  });
});

describe("readDatabaseConfig with a real database.json", () => {
  test("reads the file when it exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "singularity-cfg-"));
    try {
      writeFileSync(
        join(dir, "database.json"),
        JSON.stringify({
          connection: { host: "/var/run/pg", port: 5433, user: "singularity" },
          services: [{ name: "postgres", start: ["true"], ready: { unix: "/var/run/pg/.s" } }],
        }),
      );
      const { config, env } = await probe({ ...baseEnv, SINGULARITY_DIR: dir });
      expect(config.connection).toEqual({ host: "/var/run/pg", port: 5433, user: "singularity" });
      expect(config.services).toHaveLength(1);
      expect(env).toEqual({ PGHOST: "/var/run/pg", PGPORT: "5433", PGUSER: "singularity" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("malformed JSON is tolerated the same way a missing file is", async () => {
    const dir = mkdtempSync(join(tmpdir(), "singularity-bad-"));
    try {
      writeFileSync(join(dir, "database.json"), "{ not json");
      const { config } = await probe({ ...baseEnv, USER: "probe-user", SINGULARITY_DIR: dir });
      expect(config.connection).toEqual({ host: "localhost", port: 5432, user: "probe-user" });
      expect(config.services).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

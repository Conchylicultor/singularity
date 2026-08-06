import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import { REEXEC_ENV, reexecAfterInstall } from "./reexec";

const fixtures: string[] = [];
afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

/** Records what the child WOULD have been, so the argv/env hand-off is assertable. */
function recordingSpawn(exitCode = 0) {
  const calls: { argv: string[]; env: Record<string, string | undefined> }[] = [];
  return {
    calls,
    spawn: (argv: string[], env: Record<string, string | undefined>) => {
      calls.push({ argv, env });
      return Promise.resolve({ exitCode });
    },
  };
}

test("re-execs the same entry and args, and marks the child as generation 1", async () => {
  const { calls, spawn } = recordingSpawn();

  const outcome = await reexecAfterInstall("/repo/bin/index.ts", {
    args: ["push", "-m", "msg with spaces"],
    env: { PATH: "/usr/bin" },
    spawn,
  });

  expect(outcome).toEqual({ reexeced: true, exitCode: 0 });
  expect(calls).toHaveLength(1);
  expect(calls[0]!.argv).toEqual(["/repo/bin/index.ts", "push", "-m", "msg with spaces"]);
  // The child must still see the invoking environment — the push flow hands its
  // host CPU grant down through env, and `build` reads its detached marker.
  expect(calls[0]!.env.PATH).toBe("/usr/bin");
  expect(calls[0]!.env[REEXEC_ENV]).toBe("1");
});

test("propagates the child's exit code so the wrapper's status is the command's", async () => {
  const { spawn } = recordingSpawn(17);
  const outcome = await reexecAfterInstall("/repo/bin/index.ts", { args: ["check"], env: {}, spawn });
  expect(outcome).toEqual({ reexeced: true, exitCode: 17 });
});

test("a second install in a re-exec'd process re-execs once more", async () => {
  const { calls, spawn } = recordingSpawn();
  const outcome = await reexecAfterInstall("/repo/bin/index.ts", {
    args: ["build"],
    env: { [REEXEC_ENV]: "1" },
    spawn,
  });
  expect(outcome.reexeced).toBe(true);
  expect(calls[0]!.env[REEXEC_ENV]).toBe("2");
});

test("the budget is bounded — a checkout whose inputs keep churning cannot fork-bomb", async () => {
  const { calls, spawn } = recordingSpawn();
  const outcome = await reexecAfterInstall("/repo/bin/index.ts", {
    args: ["build"],
    env: { [REEXEC_ENV]: "2" },
    spawn,
  });
  expect(calls).toHaveLength(0);
  expect(outcome.reexeced).toBe(false);
  if (outcome.reexeced) throw new Error("unreachable");
  expect(outcome.reason).toContain("not re-exec'ing further");
});

test("a garbled counter spends the budget rather than granting an unbounded one", async () => {
  const { calls, spawn } = recordingSpawn();
  for (const raw of ["nonsense", "-1", ""]) {
    const outcome = await reexecAfterInstall("/repo/bin/index.ts", {
      args: ["build"],
      env: { [REEXEC_ENV]: raw },
      spawn,
    });
    expect(outcome.reexeced).toBe(false);
  }
  expect(calls).toHaveLength(0);
});

/**
 * End-to-end, on a fixture mirroring the real bootstrap: a `bin/index.ts` that
 * installs a WORKSPACE-LOCAL `node_modules` from a subprocess (as `ensureDeps`
 * does) and then dynamically imports a module needing that package (as
 * `bin/cli.ts` is).
 *
 * The package is deliberately placed at `pkg/node_modules/…` rather than the
 * repo root's, because that is the shape that actually broke: `commander` is a
 * dependency of `plugins/framework/plugins/cli`, so the directory Bun cached as
 * absent while resolving the bootstrap's own imports is the very one the install
 * creates.
 *
 * Runs real `bun`, so it is a statement about the runtime rather than about our
 * mock of it — the point being that the fix holds for the actual resolver.
 */
test("a bootstrap that installs can run a command needing the installed package", async () => {
  const root = mkdtempSync(join(os.tmpdir(), "cli-reexec-"));
  fixtures.push(root);
  const bin = join(root, "pkg", "bin");

  write(
    join(root, "staged", "fixture-pkg", "package.json"),
    JSON.stringify({ name: "fixture-pkg", version: "1.0.0", main: "index.js" }),
  );
  write(join(root, "staged", "fixture-pkg", "index.js"), "module.exports = { ok: true };\n");

  // Stands in for ensure-deps: installs from a subprocess, reports whether it did.
  write(
    join(bin, "install.ts"),
    `export async function ensureDeps(root: string): Promise<{ installed: boolean }> {
       if (await Bun.file(root + "/node_modules/fixture-pkg/package.json").exists()) {
         return { installed: false };
       }
       const p = Bun.spawn(["sh", "-c",
         "mkdir -p " + root + "/node_modules && cp -R " + root + "/../staged/fixture-pkg " + root + "/node_modules/"],
         { stdout: "inherit", stderr: "inherit" });
       await p.exited;
       return { installed: true };
     }\n`,
  );
  // Stands in for cli.ts: the module whose npm import must resolve.
  write(
    join(bin, "cli.ts"),
    `import pkg from "fixture-pkg";
     console.log("COMMAND RAN", JSON.stringify(pkg), process.argv.slice(2).join(" "));\n`,
  );
  // Stands in for bin/index.ts, steps 2-4.
  write(
    join(bin, "index.ts"),
    `import { ensureDeps } from "./install";
     const root = import.meta.dir + "/..";
     const { installed } = await ensureDeps(root);
     if (installed && process.env.${REEXEC_ENV} === undefined) {
       const child = Bun.spawn([process.execPath, import.meta.path, ...process.argv.slice(2)], {
         stdio: ["inherit", "inherit", "inherit"],
         env: { ...process.env, ${REEXEC_ENV}: "1" },
       });
       process.exit(await child.exited);
     }
     await import("./cli");\n`,
  );

  // Explicitly cleared: when this suite is itself run through `./singularity
  // test` on a checkout that installed, the CLI's own re-exec marker is in our
  // environment, and inheriting it would make the fixture skip the very step
  // under test.
  const env = { ...process.env };
  delete env[REEXEC_ENV];
  const result = await spawnCaptured([process.execPath, join(bin, "index.ts"), "some-command"], {
    cwd: join(root, "pkg"),
    env,
  });

  expect(result.stderr).not.toContain("Cannot find package");
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('COMMAND RAN {"ok":true} some-command');
});

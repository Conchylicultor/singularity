import { readFileSync } from "fs";
import { join } from "path";
import {
  getWorktreeRoot,
  spawnCaptured,
} from "@plugins/infra/plugins/spawn/core";
import { normalizeRuntimePath } from "@plugins/infra/plugins/launcher/core";
import type {
  Check,
  CheckResult,
} from "@plugins/framework/plugins/tooling/core";
import {
  TOOLS,
  lockProblems,
  parseMiseLock,
  parseMiseToolRequests,
} from "@plugins/toolchain/core";

/** `rustc --version` goes through rustup's proxy; a cold one takes a moment. */
const PROBE_TIMEOUT_MS = 30_000;

/**
 * `mise.toml` asks for the latest of every tool, `mise.lock` records exactly
 * which release that is, and the tool the runtime would run IS that release.
 *
 * Tree-scoped with `cacheSignature: () => null`, like `bun-runtime`: the last
 * arm reads installed binaries, which no tree hash covers, so no PASS may
 * transfer to a machine (or a moment) running something else.
 */
const check: Check = {
  id: "toolchain:resolved",
  cacheSignature: () => null,
  description:
    "mise.toml requests every tool at latest, mise.lock records one exact release per tool within its floor and holds, and the runtime resolves each tool to that release",
  async run(): Promise<CheckResult> {
    const root = await getWorktreeRoot();
    const requests = parseMiseToolRequests(
      readFileSync(join(root, "mise.toml"), "utf8"),
    );
    let lockText: string;
    try {
      lockText = readFileSync(join(root, "mise.lock"), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return {
        ok: false,
        message:
          "mise.lock is missing. Without it `latest` is resolved once, at install time, and never again — the drift this repo exists to prevent.",
        hint: "Restore the committed mise.lock (`git checkout -- mise.lock`).",
      };
    }
    const locked = parseMiseLock(lockText);

    const problems = lockProblems(requests, locked);
    if (problems.length > 0) {
      return {
        ok: false,
        message: problems.join("\n"),
        hint: "Move a tool only with `./singularity toolchain upgrade`; floors and holds live in plugins/toolchain/core.",
      };
    }

    // The runtime's PATH, not this process's: the gateway hands every backend
    // `normalizeRuntimePath(PATH)`, which puts mise's shims first. Probing the
    // raw PATH would ask a developer's shell, where Homebrew may come first.
    const env = {
      ...process.env,
      PATH: normalizeRuntimePath(process.env.PATH ?? ""),
    };
    const mismatches: string[] = [];
    for (const spec of TOOLS) {
      const want = locked.get(spec.name)?.[0];
      const probe = await spawnCaptured([...spec.versionArgv], {
        cwd: root,
        env,
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      const said = `${probe.stdout}\n${probe.stderr}`.trim();
      const got =
        probe.exitCode === 0
          ? (spec.versionPattern.exec(probe.stdout.trim())?.[1] ?? null)
          : null;
      if (got === null) {
        mismatches.push(
          `\`${spec.versionArgv.join(" ")}\` did not report a version (exit ${probe.exitCode}${probe.timedOut ? ", timed out" : ""}): ${said.split("\n")[0]}`,
        );
      } else if (got !== want) {
        mismatches.push(
          `${spec.name}: mise.lock records ${want}, but the runtime resolves \`${spec.versionArgv[0]}\` to ${got}.`,
        );
      }
    }
    if (mismatches.length > 0) {
      return {
        ok: false,
        message: mismatches.join("\n"),
        hint:
          "Run `mise install` in this checkout to install the locked releases. If a tool still resolves elsewhere, " +
          "something ahead of mise's shims on PATH is shadowing it.",
      };
    }
    return { ok: true };
  },
};

export default check;

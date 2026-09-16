import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import {
  worktreeArtifacts,
  worktreeDataDir,
} from "@plugins/infra/plugins/paths/core";
import type { Namespace } from "@plugins/infra/plugins/namespace/core";

export type TestRunnerName = "bun:test" | "vitest";

export interface TestRunnerOutcome {
  runner: TestRunnerName;
  exitCode: number;
  /** How many test files this runner was given. */
  files: number;
  /**
   * Every failure this runner is known to have had, each a stable identity:
   * `<file> > <suite> > <case>` for a failing case, and `(<runner> exited
   * <code>)` when the runner failed and no failing case explains it — so a
   * failed runner always contributes at least one entry.
   */
  failures: string[];
  /**
   * Files this runner was given that its report never mentions. JUnit cannot
   * say why: the file threw while loading, OR it recorded no test cases at all
   * (an ESLint `RuleTester` file asserts at load time and registers none). Not
   * failures, then — but a file moving INTO this list between two runs is how a
   * new load crash shows up, so a comparison should diff it too.
   */
  unreported: string[];
}

/**
 * This checkout's last `./singularity test`, at `worktreeArtifacts.testStatus`.
 * Written when the run starts and again when it ends; see that path's doc.
 */
export interface TestStatus {
  opId: string;
  pid: number;
  startedAt: string;
  targets: string[];
  status: "running" | "passed" | "failed";
  finishedAt: string | null;
  runners: TestRunnerOutcome[];
}

export function writeTestStatus(name: Namespace, status: TestStatus): void {
  mkdirSync(worktreeDataDir(name), { recursive: true });
  const path = worktreeArtifacts.testStatus(name);
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(status, null, 2) + "\n");
  renameSync(tmp, path);
}

/** The last run's status, or `null` when this checkout has never run tests. */
export function readTestStatus(name: Namespace): TestStatus | null {
  const path = worktreeArtifacts.testStatus(name);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return JSON.parse(raw) as TestStatus;
}

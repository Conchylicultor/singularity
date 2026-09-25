import { join } from "path";
import {
  getWorktreeRoot,
  spawnCaptured,
} from "@plugins/infra/plugins/spawn/core";

/** The doctor itself — one file, shared with `mise run doctor` (mise.toml). */
const DOCTOR = join(import.meta.dir, "..", "doctor.sh");

/** Well above its ~0.5 s: `claude auth status` starts a Node process. */
const DOCTOR_TIMEOUT_MS = 60_000;

/**
 * Run the prerequisite doctor for this checkout and stop the command if
 * anything is missing, printing the doctor's full report — every missing
 * prerequisite at once, each with its fix — rather than letting the first one
 * surface minutes later as an unrelated failure.
 *
 * The first step of the commands that stand the app up (`start`, a deploying
 * `build`). Not the release launcher or a hermetic build: a bundle needs no dev
 * toolchain, and a hermetic build launches no agent.
 */
export async function assertPrerequisites(): Promise<void> {
  const root = await getWorktreeRoot();
  const result = await spawnCaptured(["sh", DOCTOR], {
    cwd: root,
    timeoutMs: DOCTOR_TIMEOUT_MS,
  });
  if (result.exitCode === 0) return;
  console.error(
    `${result.stdout}${result.stderr}`.trim() ||
      `prerequisite doctor exited ${result.exitCode}${result.timedOut ? " (timed out)" : ""} with no output: sh ${DOCTOR}`,
  );
  process.exit(1);
}

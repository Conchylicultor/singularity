/**
 * The build's supervised-run kind id — the filename prefix of every build
 * transcript and exit marker (`build-<buildId>.log` / `.exit-code`, under the
 * worktree's `runs/` dir).
 *
 * **A second constant, deliberately, even though it currently equals
 * {@link BUILD_RUN_KIND}.** They name two unrelated identity spaces that happen
 * to have picked the same word:
 *
 * - `BUILD_RUN_KIND` is the DISCRIMINATOR of a row in the merged runs surface —
 *   the `kind` half of a `{ kind, id }` selection, and a display-facing choice.
 * - this is a FILENAME PREFIX, and the artifact prune reaps a kind's family by
 *   it. Aliasing the two would mean a rename made for how a run reads in a list
 *   silently renamed every build's artifacts, orphaning the ones already on
 *   disk. That is not a cost worth paying to save a line.
 *
 * It lives in `run-ledger` for the reason {@link BUILD_RUN_KIND} does: it is
 * needed on both sides of an import edge that cannot close a cycle. `build/
 * server` defines the supervised-run kind with it, and `build/build-logs/server`
 * reads a transcript by it when the CLI's own step artifact is missing; the
 * ledger leaf imports nothing from `build`, so both can reach it and there is no
 * path back.
 *
 * Lowercase alphanumeric with no separator, which `assertRunKindId` enforces at
 * module eval where the kind is defined — a kind id containing a `-` would make
 * the artifact prune of one kind reap another's transcripts.
 */
export const BUILD_RUN_KIND_ID = "build";

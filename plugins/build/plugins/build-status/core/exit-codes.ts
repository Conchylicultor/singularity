/**
 * A build of main reads the shared main worktree for minutes (codegen, checks,
 * vite) while `./singularity push` is free to merge into that same tree. When a
 * merge lands mid-build, every source read after it answers for a different
 * commit than the reads before it — so the build's verdict is about no coherent
 * tree at all, and whichever `*-in-sync` check straddles the swap reports drift
 * on a tree that is perfectly in sync.
 *
 * That is not a failure, and must never be reported as one: the build simply no
 * longer has a subject. It exits with this code, which the run ledger renders as
 * its own `superseded` status rather than red. The rebuild is guaranteed
 * separately — `reconcileDeployment` (build/server) re-derives "is this
 * checkout's HEAD what is deployed" the moment any build reaches terminal.
 *
 * 75 is EX_TEMPFAIL from sysexits.h: "temporary failure, the user is invited to
 * retry" — exactly this. Deliberately not 0 (nothing was deployed, so a caller
 * that reads 0 as "my change is live" would be wrong) and not -1, which the
 * ledger already spends on a hard-killed owner of unknown outcome.
 */
export const BUILD_EXIT_SUPERSEDED = 75;

/**
 * The exit code the ledger writes for a run whose owning process was hard-killed
 * by a newer build's restart. Deliberately outside the 0-255 wait status range,
 * so it can never collide with a code the build itself chose.
 */
export const BUILD_EXIT_HARD_KILLED = -1;

/**
 * POSIX shell convention: a process terminated by signal N reports 128 + N. The
 * CLI's own fatal-signal handlers already produce exactly this (SIGHUP → 129,
 * SIGINT → 130, SIGQUIT → 131, SIGTERM → 143), so no new constant is needed to
 * recognise an externally-killed build.
 *
 * Exported alongside the other two because `buildStatusOf` is not the only place
 * the rule is written any more: the `runs` build arm compiles the SAME rule into
 * SQL, and the one thing that must never differ between the two encodings is the
 * numbers they compare against.
 */
export const BUILD_EXIT_SIGNAL_BASE = 128;

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

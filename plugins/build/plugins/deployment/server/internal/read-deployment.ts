import {
  REPO_ROOT,
  currentWorktreeName,
} from "@plugins/infra/plugins/paths/server";
import { createSignedMemo } from "@plugins/infra/plugins/git-read-cache/server";
import {
  resolved,
  unresolved,
  type Resolvable,
} from "@plugins/primitives/plugins/live-state/core";
import {
  LOG_FORMAT,
  parseGitLog,
  runGit,
  tryRunGit,
  WorktreeGoneError,
} from "@plugins/primitives/plugins/commit-list/server";
import type { CommitRow } from "@plugins/primitives/plugins/commit-list/core";
import {
  getServerCommit,
  getServerGraphHash,
} from "@plugins/build/plugins/server-build-id/server";
import {
  convergenceOf,
  deploymentOf,
  sameCommit,
  type Carrier,
  type Deployment,
  type DeploymentState,
} from "../../core";
import { serverPin } from "./server-pin";

/**
 * This checkout's HEAD — the commit everything should converge ON.
 *
 * No namespace branching is needed: main's checkout is on `main` and a worktree
 * checkout is on its own branch, so `HEAD` of `REPO_ROOT` is the target in both.
 * (`computeTrackedRefs` in git-watcher already watches both refs, so the
 * resource's `dependsOn` fires either way.)
 *
 * A checkout that git cannot answer for is `unresolved`, not an error: a release
 * bundle's `REPO_ROOT` resolves into the compiled binary's virtual FS, where
 * there is no repository and the question is genuinely unanswerable.
 */
async function readTarget(): Promise<Resolvable<string>> {
  const result = await tryRunGit(["rev-parse", "HEAD"], REPO_ROOT).catch(
    (err: unknown) => {
      // The one determinate arm worth folding in here: no directory at all is
      // the same answer as no repository. Anything else is a real fault.
      if (err instanceof WorktreeGoneError) return null;
      throw err;
    },
  );
  if (result === null || !result.ok) return unresolved("no checkout");
  const sha = result.stdout.trim();
  return sha ? resolved(sha) : unresolved("no checkout");
}

/**
 * Is `commit` on the line leading to `target`? Answered by git, once, on the
 * server, and carried onto the carrier as a plain fact so `convergenceOf` /
 * `wantsBuild` stay pure.
 *
 * `merge-base --is-ancestor` is an exit-code-as-signal command — 0 yes, 1 no —
 * which is exactly the case `tryRunGit`'s docstring names. Any OTHER exit code
 * means git could not answer the question at all (typically 128: the commit is
 * not an object in this checkout, e.g. a dist built in a worktree whose branch
 * has since been pruned), and that is a determinate "cannot tell", never a
 * silent `false` that would read as divergence.
 */
async function isAncestor(
  commit: string,
  target: string,
): Promise<Resolvable<boolean>> {
  // Free answer, and it saves a subprocess on the common converged path.
  if (sameCommit(commit, target)) return resolved(true);
  const result = await tryRunGit(
    ["merge-base", "--is-ancestor", commit, target],
    REPO_ROOT,
  );
  if (result.ok) return resolved(true);
  if (result.exitCode === 1) return resolved(false);
  return unresolved(`git cannot place ${commit.slice(0, 9)} in this checkout`);
}

/** Attach the ancestry fact to a carrier whose pin has just been read. */
async function withAncestry(
  carrier: Omit<Carrier, "ancestorOfTarget">,
  target: Resolvable<string>,
): Promise<Carrier> {
  if (!target.resolved)
    return { ...carrier, ancestorOfTarget: unresolved("no target") };
  if (!carrier.commit.resolved)
    return {
      ...carrier,
      ancestorOfTarget: unresolved(carrier.commit.reason),
    };
  return {
    ...carrier,
    ancestorOfTarget: await isAncestor(carrier.commit.value, target.value),
  };
}

/**
 * The raw facts: where this checkout's HEAD is, and where each DEPLOYABLE
 * carrier — the backend process and the frontend bundle it serves — stands
 * relative to it. The `tab` carrier is deliberately absent: only a browser can
 * report which bundle it is running, and only a reload can move it.
 */
async function readCarriers(): Promise<Deployment> {
  const target = await readTarget();

  const distCommit = getServerCommit();
  const distGraph = getServerGraphHash();

  const [server, web] = await Promise.all([
    withAncestry(
      {
        id: "server",
        commit: serverPin(),
        // Not a failure: a server process carries no web module graph, so the
        // determinate answer is "there is nothing to determine".
        graph: unresolved("a backend process carries no web graph"),
      },
      target,
    ),
    withAncestry(
      {
        id: "web",
        commit:
          distCommit === null
            ? unresolved("the served dist carries no .build-commit")
            : resolved(distCommit),
        graph:
          distGraph === null
            ? unresolved("the served dist carries no .build-graph")
            : resolved(distGraph),
      },
      target,
    ),
  ]);

  return { target, deployable: [server, web] };
}

/**
 * Among the deployable pins, the one furthest back. On a `behind` deployment
 * every pin is an ancestor of the same target, so they are totally ordered and
 * one `merge-base --is-ancestor` per extra pin settles it. If two pins turn out
 * not to be comparable the first is kept — the deployment is already `diverged`
 * in that case and this chain is not what gets rendered.
 */
async function oldestPin(shas: string[]): Promise<string | null> {
  let oldest = shas[0] ?? null;
  if (oldest === null) return null;
  for (const sha of shas.slice(1)) {
    const result = await tryRunGit(
      ["merge-base", "--is-ancestor", sha, oldest],
      REPO_ROOT,
    );
    if (result.ok) oldest = sha;
  }
  return oldest;
}

/**
 * The commit chain the Build button draws: every commit from the oldest
 * deployable pin up to `target`, newest first, INCLUSIVE of that pin's own
 * commit so a carrier badge has a row to sit on.
 *
 * Two logs rather than one range expression: `<base>..<target>` excludes `base`
 * itself, and the spellings that include it (`<base>^..`, `<base>~1..`) break on
 * a root commit. Two exact reads have no edge case.
 *
 * `runGit` (not `tryRunGit`): reaching here means both shas were already placed
 * in this checkout, so a failure now is a genuine fault and belongs in the
 * resource's error channel — a retry may succeed — rather than being absorbed
 * into an empty chain that would render as "nothing to deploy".
 */
async function chainTo(base: string, target: string): Promise<CommitRow[]> {
  const [ahead, baseRow] = await Promise.all([
    runGit(["log", `--format=${LOG_FORMAT}`, `${base}..${target}`], REPO_ROOT),
    runGit(["log", `--format=${LOG_FORMAT}`, "-1", base], REPO_ROOT),
  ]);
  return [...parseGitLog(ahead), ...parseGitLog(baseRow)];
}

/**
 * The wire payload: `readDeployment`'s facts, plus the one derived answer and
 * the evidence that answer's arm carries. The `kind` IS `convergenceOf`'s
 * verdict, so the badge a user sees and the decision the reconciler makes are
 * the same function of the same state.
 *
 * The expensive half — up to three `merge-base --is-ancestor` probes and two
 * `git log` walks. Always reached through the memo below, never called directly.
 */
async function computeDeploymentState(): Promise<DeploymentState> {
  const deployment = await readCarriers();
  const { deployable } = deployment;
  const kind = convergenceOf(deployment);

  if (kind === "unknown" || !deployment.target.resolved) {
    return {
      kind: "unknown",
      reason: deployment.target.resolved
        ? "no deployable carrier"
        : deployment.target.reason,
      deployable,
    };
  }

  const target = deployment.target.value;
  if (kind !== "behind") return { kind, target, deployable };

  const pins = deployable.flatMap((c) =>
    c.commit.resolved ? [c.commit.value] : [],
  );
  const base = await oldestPin(pins);
  return {
    kind: "behind",
    target,
    deployable,
    // No readable pin at all (a fresh checkout with no dist, or a mixed boot on
    // both carriers) means there is no line to draw from — behind is still the
    // right verdict, but the chain is genuinely empty rather than truncated.
    commits: base === null ? [] : await chainTo(base, target),
  };
}

/**
 * The cheap, ungated signature: the four inputs the whole answer is a function
 * of. One `git rev-parse` plus a module constant and two tiny dotfile reads —
 * the ~sub-millisecond probe `createGitStateMemo` asks for.
 *
 * It is a conservative over-approximation by construction, because it is not an
 * approximation at all: `computeDeploymentState` reads exactly these four values
 * and nothing else (the ancestry probes and the log walk are pure functions of
 * the target and the pins over immutable history). An unresolved input is folded
 * in by its REASON, so "no checkout" and "mixed boot" are distinct signatures —
 * a pin that changes only its reason still invalidates.
 */
async function deploymentSignature(): Promise<string> {
  const target = await readTarget();
  const pin = serverPin();
  return [
    target.resolved ? target.value : `!${target.reason}`,
    pin.resolved ? pin.value : `!${pin.reason}`,
    getServerCommit() ?? "!no-commit",
    getServerGraphHash() ?? "!no-graph",
  ].join("\0");
}

/**
 * `refHeadResource` fires in EVERY backend on every advance of a ref it tracks,
 * and `refs/heads/main` is tracked everywhere — so on this host a single push to
 * main wakes this loader in 100+ worktree backends at once. In all but one of
 * them the target is that worktree's OWN branch, which did not move, so the
 * signature is unchanged and the recompute collapses to the one `rev-parse` the
 * probe already costs. That is what makes the fan-out affordable: the resource
 * this replaced ran a full `git log` in every one of those backends.
 *
 * Deliberately NOT behind `withHeavyReadSlot`. Post-memo the compute runs at
 * most once per distinct (target, pins) tuple per backend — i.e. once per build
 * or per advance of this checkout's own branch — and its body is two
 * `merge-base` probes plus a log walk bounded by how far a checkout drifts
 * between builds (single digits). `host-read-pool` deliberately leaves cheap
 * interactive git ungated, and this is on the path that paints the Build button.
 *
 * `signature` also feeds the resource's `revalidate`, which is the point of
 * `createSignedMemo`: bound together at construction, the ETag and the loader
 * cannot come to disagree about what "current" means.
 */
const deploymentMemo = createSignedMemo<DeploymentState>({
  name: "build:deployment",
  signature: deploymentSignature,
  compute: computeDeploymentState,
});

// One backend serves exactly one namespace, so the memo holds a single entry.
// It is still keyed (rather than a bare module variable) because that is what
// buys the per-key single-flight: the boot snapshot, a subscriber's first read
// and a post-build notify can land together, and only one of them does the git
// work.
const MEMO_KEY = currentWorktreeName();

/** The bound signature probe, for the resource's `revalidate`. */
export function deploymentEtag(): Promise<string> {
  return deploymentMemo.signature(MEMO_KEY);
}

/** The wire payload, memoized. Feeds the resource loader. */
export function readDeploymentState(): Promise<DeploymentState> {
  return deploymentMemo.get(MEMO_KEY);
}

/**
 * The raw facts, for the reconciler — which passes them straight to
 * `wantsBuild`. Projected back out of the same memoized state the resource
 * serves, so the decision and the badge are literally one read: the reconciler
 * pays no git at all when nothing has moved since the last recompute.
 *
 * Takes no baseline and remembers nothing across calls — that is the whole
 * point: a build that kills this process cannot lose a request that was never
 * held anywhere.
 */
export async function readDeployment(): Promise<Deployment> {
  return deploymentOf(await readDeploymentState());
}

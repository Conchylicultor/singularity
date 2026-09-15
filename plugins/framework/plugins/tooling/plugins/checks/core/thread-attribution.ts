import { realpathSync } from "node:fs";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/core";
import {
  frameKey,
  type StackFrame,
} from "@plugins/infra/plugins/stack-sampler/core";

/**
 * Who a stack sample's slice of thread time belongs to.
 *
 * Four kinds, because a JSC sample can only tell us so much. The probes (Bun
 * 1.3.13) found three stack shapes, and each needs its own rule:
 *
 * - sync code a check runs itself keeps the check's frame on the stack
 *   (`spin ← checkRun`) — `check`;
 * - a shared async helper resumed after an `await` has LOST its caller
 *   (`spin ← helper`, no `checkRun`) — `shared`, named by the helper;
 * - module evaluation from `await import()` has no importer at all
 *   (`(module) ← evaluate ← moduleEvaluation ← requestImportModule`) — `import`.
 *
 * Anything with no source frame at all is `native`. A `shared` owner does not
 * say which check called it; the stall record's `running` list is that link.
 */
export type ThreadOwner =
  | { kind: "check"; module: string }
  /**
   * `plugin` is the evaluated module's plugin, kept as a DETAIL rather than as
   * part of the owner. ~800 barrels would otherwise each own a sliver, and a
   * large import chain — the suspect this exists to catch — would look like
   * nothing at all.
   */
  | { kind: "import"; plugin: string | null }
  | { kind: "shared"; site: string }
  | { kind: "native"; leaf: string };

/**
 * The roots a frame path is made relative to: `root` and its realpath.
 *
 * Both, because JSC hands back FULLY RESOLVED paths (`/private/tmp/…` for a
 * checkout at `/tmp/…`). Stripping the plain root alone would turn every frame
 * of a checkout reached through a symlink into "outside the repo" — no check
 * would ever own a sample, and nothing would say so.
 */
export function repoRoots(root: string = REPO_ROOT): string[] {
  const real = realpathSync(root);
  return real === root ? [root] : [root, real];
}

/** `path` relative to the first root that prefixes it, or null when none does. */
function relativize(path: string, roots: readonly string[]): string | null {
  for (const root of roots) {
    if (path.startsWith(`${root}/`)) return path.slice(root.length + 1);
  }
  return null;
}

/**
 * The npm package a path sits in (`pg`, `@scope/name`), or null. Taken after the
 * LAST `node_modules/`, so bun's nested `.bun/<pkg>@<v>/node_modules/<pkg>`
 * layout still names the package rather than the store.
 */
function packageOf(path: string): string | null {
  const at = path.lastIndexOf("/node_modules/");
  if (at === -1) return null;
  const [first, second] = path.slice(at + "/node_modules/".length).split("/");
  if (!first) return null;
  return first.startsWith("@") && second ? `${first}/${second}` : first;
}

/**
 * A check module's frame: a file under a `check/` directory that sits DIRECTLY
 * under a plugin directory. No registry is needed — `./singularity check`
 * discovers checks from exactly this folder name, and the runner's own files
 * live under `checks/core/`, so they never match.
 *
 * Spelled segment by segment rather than `^plugins/(.+)/check/`: the looser
 * form also matches a plugin NAMED `check` —
 * `plugins/framework/plugins/cli/plugins/check/cli/run.ts`, the command that
 * calls the runner, would have owned the run's own sync prologue.
 */
const CHECK_MODULE = /^plugins\/((?:[^/]+\/plugins\/)*[^/]+)\/check\//;

/** The plugin a repo-relative path belongs to (`database/plugins/migrations/…` → its dir). */
const PLUGIN_PATH = /^plugins\/((?:[^/]+\/plugins\/)*[^/]+)\//;

/** `database/plugins/migrations` → `database/migrations`: the id the docs use. */
function collapsePluginPath(path: string): string {
  return path.split("/plugins/").join("/");
}

/** A frame the runtime attributes to a source file, i.e. not a native frame. */
function sourceOf(frame: StackFrame): string | null {
  return frame.sourceURL !== null && frame.sourceURL !== ""
    ? frame.sourceURL
    : null;
}

function nameOf(frame: StackFrame): string {
  return frame.name !== "" ? frame.name : "(anonymous)";
}

/**
 * The frames that mean "a module's top level is being evaluated". The two named
 * native frames are what an `await import()` puts under the evaluated module;
 * `(module)` is the module body itself, which is all a top-level-await
 * continuation leaves on the stack.
 */
const MODULE_EVALUATION = new Set([
  "requestImportModule",
  "moduleEvaluation",
  "(module)",
]);

/**
 * Render a source path for a frame key: repo-relative when it is in the repo,
 * `node_modules/<rest>` when it is a dependency, verbatim otherwise.
 */
export function shortenSource(
  sourceURL: string,
  roots: readonly string[],
): string {
  const rel = relativize(sourceURL, roots);
  if (rel !== null) return rel;
  const at = sourceURL.lastIndexOf("/node_modules/");
  return at === -1 ? sourceURL : sourceURL.slice(at + 1);
}

/** The detail an `import` sample keeps: the evaluated module's plugin or package. */
function moduleOwnerOf(path: string, roots: readonly string[]): string {
  const pkg = packageOf(path);
  if (pkg !== null) return pkg;
  const rel = relativize(path, roots);
  if (rel === null) return path;
  const plugin = PLUGIN_PATH.exec(rel);
  return plugin?.[1] ? collapsePluginPath(plugin[1]) : rel;
}

/**
 * Attribute one sample. PURE: the only input besides the frames is `roots`,
 * which `repoRoots()` computes once per run. Rules, in order:
 *
 * 1. **A frame from a check module** (anywhere on the stack, innermost first)
 *    → `check`. Beneath a runner frame or a shared helper it still wins: sync
 *    work a check started is that check's.
 * 2. **Module evaluation** → `import`, keeping the evaluated module's plugin as
 *    the detail.
 * 3. **The outermost frame with a source file** → `shared`, named by it. That is
 *    the async function that resumed, and it owns this slice. A frame IN THE
 *    REPO is preferred over a dependency's: when a library dispatches a repo
 *    callback (commander calling an action, an emitter calling a listener) the
 *    library is outermost but the callback is the work. With no repo frame, a
 *    `node_modules` frame collapses to its package name.
 * 4. **Native frames only** → `native`, named by the leaf.
 *
 * One more frame the stack can lose (measured on Bun 1.3.13): JSC
 * implements PROPER TAIL CALLS, and ES modules are strict, so a SYNC function
 * whose last act is `return heavy()` is gone from the stack while `heavy` runs.
 * A sync check body written that way hands its samples to the next frame out
 * (the runner, or whatever called it). An `async` function's `return heavy()` is
 * not a tail call, so a check's `async run()` keeps its frame; only a sync
 * wrapper returning straight into the heavy call loses it.
 */
export function ownerOf(
  frames: readonly StackFrame[],
  roots: readonly string[],
): ThreadOwner {
  for (const frame of frames) {
    const source = sourceOf(frame);
    // A dependency's own `check/` directory is not one of ours.
    if (source === null || packageOf(source) !== null) continue;
    const rel = relativize(source, roots);
    const check = rel === null ? null : CHECK_MODULE.exec(rel);
    if (check?.[1]) {
      return { kind: "check", module: collapsePluginPath(check[1]) };
    }
  }

  if (frames.some((frame) => MODULE_EVALUATION.has(frame.name))) {
    const evaluated =
      frames.find(
        (frame) => frame.name === "(module)" && sourceOf(frame) !== null,
      ) ?? frames.find((frame) => sourceOf(frame) !== null);
    const source = evaluated ? sourceOf(evaluated) : null;
    return {
      kind: "import",
      plugin: source === null ? null : moduleOwnerOf(source, roots),
    };
  }

  let outermostRepo: { frame: StackFrame; rel: string } | null = null;
  let outermostSource: StackFrame | null = null;
  for (const frame of frames) {
    const source = sourceOf(frame);
    if (source === null) continue;
    outermostSource = frame;
    const rel = packageOf(source) === null ? relativize(source, roots) : null;
    if (rel !== null) outermostRepo = { frame, rel };
  }
  if (outermostRepo !== null) {
    return {
      kind: "shared",
      site: `${nameOf(outermostRepo.frame)} @ ${outermostRepo.rel}`,
    };
  }
  if (outermostSource !== null) {
    const source = sourceOf(outermostSource) ?? "";
    return {
      kind: "shared",
      site: packageOf(source) ?? `${nameOf(outermostSource)} @ ${source}`,
    };
  }

  const leaf = frames[0];
  return { kind: "native", leaf: leaf ? frameKey(leaf) : "(no frames)" };
}

/**
 * An owner's label, which is also its identity in every tally. An `import`
 * owner's plugin is deliberately NOT part of it — see `ThreadOwner`.
 */
export function ownerLabel(owner: ThreadOwner): string {
  switch (owner.kind) {
    case "check":
      return `check ${owner.module}`;
    case "import":
      return "import";
    case "shared":
      return `shared ${owner.site}`;
    case "native":
      return `native ${owner.leaf}`;
  }
}

/** One owner's share of a set of samples. */
export interface OwnerShare {
  owner: string;
  samples: number;
  /**
   * ONE representative sample's stack, innermost first, as frame keys — the
   * first sample seen for this owner. `frame.line` is the EXECUTING line, so
   * read it as "a" position on the owner's path, not "the" position.
   */
  example: string[];
  /**
   * What an owner that pools many sources was made of (an `import` owner's
   * evaluated plugins), busiest first. Empty for every other owner.
   */
  detail: { name: string; samples: number }[];
}

/** How many frames an example keeps — the transcript's depth; records cut it further. */
export const EXAMPLE_FRAMES = 8;

/** How many entries an owner's `detail` keeps. */
const DETAIL_ENTRIES = 3;

/** A running per-owner sample count. */
export interface OwnerTally {
  readonly samples: number;
  add(owner: ThreadOwner, frames: readonly StackFrame[]): void;
  /** The `n` busiest owners, busiest first. */
  top(n: number): OwnerShare[];
}

/**
 * Count samples per owner. The owner is computed by the CALLER and handed in,
 * so one sample can land in several tallies (the whole run, one stall, all
 * stalls) for one attribution.
 */
export function createOwnerTally(roots: readonly string[]): OwnerTally {
  const buckets = new Map<
    string,
    { samples: number; example: string[]; detail: Map<string, number> }
  >();
  let samples = 0;
  const shorten = (sourceURL: string): string =>
    shortenSource(sourceURL, roots);

  return {
    get samples() {
      return samples;
    },
    add(owner, frames) {
      samples += 1;
      const key = ownerLabel(owner);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          samples: 0,
          example: frames
            .slice(0, EXAMPLE_FRAMES)
            .map((frame) => frameKey(frame, shorten)),
          detail: new Map(),
        };
        buckets.set(key, bucket);
      }
      bucket.samples += 1;
      if (owner.kind === "import" && owner.plugin !== null) {
        bucket.detail.set(
          owner.plugin,
          (bucket.detail.get(owner.plugin) ?? 0) + 1,
        );
      }
    },
    top(n) {
      return [...buckets.entries()]
        .sort((a, b) => b[1].samples - a[1].samples)
        .slice(0, n)
        .map(([owner, bucket]) => ({
          owner,
          samples: bucket.samples,
          example: bucket.example,
          detail: [...bucket.detail.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, DETAIL_ENTRIES)
            .map(([name, count]) => ({ name, samples: count })),
        }));
    },
  };
}

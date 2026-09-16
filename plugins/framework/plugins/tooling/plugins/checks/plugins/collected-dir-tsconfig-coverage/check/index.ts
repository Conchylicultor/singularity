import type TS from "typescript";
import type {
  Check,
  CheckContext,
  RepoFiles,
} from "@plugins/framework/plugins/tooling/core";
import {
  discoverCollectedDirsIn,
  type DiscoveredCollectedDir,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";

// `typescript` is loaded when the check runs, not when the check registry
// loads every check module at the start of a pass. The module object is the
// same for the whole process, so one memo per process is exact.
let tsPromise: Promise<typeof TS> | undefined;
function loadTypescript(): Promise<typeof TS> {
  return (tsPromise ??= import("typescript").then((m) => m.default));
}

// Every tsconfig in the run's file set — git's `*tsconfig*.json` pathspec,
// whose `*` crosses `/`. Sidequests are independent projects with their own
// tsconfigs.
const TSCONFIG_RE = /tsconfig.*\.json$/;

function listTsconfigs(repo: RepoFiles): string[] {
  return repo
    .all()
    .filter((p) => TSCONFIG_RE.test(p) && !p.startsWith("sidequests/"));
}

// Literal (single-file) `include` entries — `parseConfigFileTextToJson` parses
// JSONC but does NOT resolve `extends`, so this is exactly the local
// declaration, which is the only place a collected-dir glob can legitimately be
// added. (It is what `ts.readConfigFile` runs after reading the file.)
async function declaredIncludes(
  ts: typeof TS,
  repo: RepoFiles,
  rel: string,
): Promise<string[]> {
  const text = await repo.read(rel);
  if (text === null) {
    throw new Error(
      `${rel} is in the repo's file set but could not be read — it was removed after the set was listed.`,
    );
  }
  const { config } = ts.parseConfigFileTextToJson(`${repo.root}/${rel}`, text);
  const include = config?.include;
  return Array.isArray(include) ? (include as string[]) : [];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const check: Check = {
  id: "collected-dir-tsconfig-coverage",
  description:
    "Every collected-dir runtime folder (web, server, check, facet, composition, …) must be covered by some tsconfig `include`, so its files type-check instead of being orphaned",
  async run(ctx: CheckContext) {
    const repo = await ctx.repo();
    const { root } = repo;

    // Single source of truth: the same scan codegen, plugin-boundaries, and
    // plugins-registry-in-sync derive from. Keep one declarer per dir for the
    // failure message (`ownerDir` cites where `defineCollectedDir` lives).
    const declaredBy = new Map<string, DiscoveredCollectedDir>();
    for (const def of await discoverCollectedDirsIn(repo)) {
      if (!declaredBy.has(def.dir)) declaredBy.set(def.dir, def);
    }

    // Every literal `include` glob across all (non-sidequest) tsconfigs.
    const ts = await loadTypescript();
    const includes = (
      await Promise.all(
        listTsconfigs(repo).map((rel) => declaredIncludes(ts, repo, rel)),
      )
    ).flat();

    // A folder `X` is covered if any include glob touches a `.../X/...` (or bare
    // `X`) path segment. The `(/|$)` boundary recognizes every shape in use —
    // folder globs (`**/plugins/*/composition`), bare folders (`web`), and file
    // globs (`plugins/**/lint/*.ts`) — without false-matching `check` against
    // `.../checks/...`.
    const offenders: string[] = [];
    for (const [dir, def] of declaredBy) {
      const re = new RegExp(`(^|/)${escapeRegExp(dir)}(/|$)`);
      if (includes.some((inc) => re.test(inc))) continue;
      const declarer = relativeOwner(root, def);
      offenders.push(
        `  ${dir}/  (declared in ${declarer}) → add glob **/plugins/*/${dir}`,
      );
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `${offenders.length} collected-dir folder(s) are covered by no tsconfig \`include\` — their files type-check as orphaned ("belong to no tsconfig program"):\n${offenders.join("\n")}`,
      hint: "Add `**/plugins/*/<dir>` to the `include` of the tsconfig for the runtime where the folder's code runs: plugins/framework/plugins/server-core/tsconfig.json for node/build-time code (alongside check/facet/composition), plugins/framework/plugins/web-core/tsconfig.app.json for browser code, plugins/framework/plugins/central-core/tsconfig.json for central code.",
    };
  },
};

function relativeOwner(root: string, def: DiscoveredCollectedDir): string {
  return def.ownerDir.startsWith(root)
    ? def.ownerDir.slice(root.length + 1)
    : def.ownerDir;
}

export default check;

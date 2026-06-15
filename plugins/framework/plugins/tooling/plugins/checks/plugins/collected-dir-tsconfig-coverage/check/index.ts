import ts from "typescript";
import {
  discoverCollectedDirs,
  type DiscoveredCollectedDir,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

async function listTsconfigs(root: string): Promise<string[]> {
  const proc = Bun.spawn(["git", "ls-files", "*tsconfig*.json"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = (await new Response(proc.stdout).text()).trim();
  if (!out) return [];
  return out
    .split("\n")
    // Sidequests are independent projects with their own tsconfigs.
    .filter((p) => p && !p.startsWith("sidequests/"));
}

// Literal (single-file) `include` entries — `readConfigFile` parses JSONC but
// does NOT resolve `extends`, so this is exactly the local declaration, which is
// the only place a collected-dir glob can legitimately be added.
function declaredIncludes(root: string, rel: string): string[] {
  const { config } = ts.readConfigFile(`${root}/${rel}`, ts.sys.readFile);
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
  async run() {
    const root = await getRoot();

    // Single source of truth: the same scan codegen, plugin-boundaries, and
    // plugins-registry-in-sync derive from. Keep one declarer per dir for the
    // failure message (`ownerDir` cites where `defineCollectedDir` lives).
    const declaredBy = new Map<string, DiscoveredCollectedDir>();
    for (const def of discoverCollectedDirs(root)) {
      if (!declaredBy.has(def.dir)) declaredBy.set(def.dir, def);
    }

    // Every literal `include` glob across all (non-sidequest) tsconfigs.
    const includes: string[] = [];
    for (const rel of await listTsconfigs(root)) {
      includes.push(...declaredIncludes(root, rel));
    }

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
      offenders.push(`  ${dir}/  (declared in ${declarer}) → add glob **/plugins/*/${dir}`);
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
  return def.ownerDir.startsWith(root) ? def.ownerDir.slice(root.length + 1) : def.ownerDir;
}

export default check;

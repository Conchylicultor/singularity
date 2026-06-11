import ts from "typescript";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// The root base config is the single owner of repo-wide path aliases. Every
// other tsconfig must inherit them via `extends`, never redeclare a local copy
// (a child's `paths` fully replaces the parent's, and the per-config relative
// target silently rots when files move or a new config is added).
const BASE = "tsconfig.base.json";

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

// Raw (single-file) `paths` keys — `readConfigFile` parses JSONC but does NOT
// resolve `extends`, so this is exactly the literal declaration, which is what
// we want to forbid in non-base configs.
function declaredPathAliases(root: string, rel: string): string[] {
  const { config } = ts.readConfigFile(`${root}/${rel}`, ts.sys.readFile);
  const paths = config?.compilerOptions?.paths;
  return paths && typeof paths === "object" ? Object.keys(paths) : [];
}

const check: Check = {
  id: "tsconfig-alias-single-owner",
  description:
    "Path aliases (e.g. @plugins/*) must be declared once in tsconfig.base.json and inherited via `extends` — no tsconfig may redeclare a base-owned alias",
  async run() {
    const root = await getRoot();
    const owned = new Set(declaredPathAliases(root, BASE));
    if (owned.size === 0) {
      return {
        ok: false,
        message: `${BASE} declares no path aliases — it must own the repo-wide aliases (e.g. "@plugins/*": ["./plugins/*"]).`,
        hint: `Add the shared aliases to ${BASE} so every other tsconfig can inherit them via \`extends\`.`,
      };
    }

    const offenders: string[] = [];
    for (const rel of await listTsconfigs(root)) {
      if (rel === BASE) continue;
      const dupes = declaredPathAliases(root, rel).filter((a) => owned.has(a));
      if (dupes.length > 0) offenders.push(`  ${rel} → ${dupes.join(", ")}`);
    }

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `${offenders.length} tsconfig(s) redeclare a base-owned path alias:\n${offenders.join("\n")}`,
      hint: `Remove the local \`paths\` entry; it is inherited from ${BASE} (which resolves it relative to the base file, i.e. <repo-root>/plugins/*, correct at every depth). If a config doesn't yet \`extends\` ${BASE}, add that instead of redeclaring the alias.`,
    };
  },
};

export default check;

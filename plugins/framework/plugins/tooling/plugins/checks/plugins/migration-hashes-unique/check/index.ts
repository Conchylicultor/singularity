import { readdirSync } from "fs";
import { resolve } from "path";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
  cacheSignature?(): string | null;
};

// <ts>_<sha8>__<slug>.sql — the runner (server/internal/runner.ts) keys applied
// state by the sha8 hash token, which is the PRIMARY KEY of __singularity_migrations.
const MIGRATION_RE = /^(\d{8})_(\d{6})_([0-9a-f]{8})__(.+)\.sql$/;
const MIGRATIONS_SUBDIR = "plugins/database/plugins/migrations/data";

async function git(root: string, args: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  return { code: await proc.exited, out };
}

async function getRoot(): Promise<string> {
  return (await git(process.cwd(), ["rev-parse", "--show-toplevel"])).out.trim();
}

// Migrations present on origin/main (or local main) are immutable: their hash is
// recorded in every deployed DB's __singularity_migrations, so they can never be
// rehashed. A collision among only such files is frozen history with no safe fix,
// so we never flag it — flagging it would make this check impossible to satisfy.
async function trackedBasenames(root: string): Promise<Set<string>> {
  for (const ref of ["origin/main", "main"]) {
    if ((await git(root, ["rev-parse", "--verify", ref])).code !== 0) continue;
    const { out } = await git(root, [
      "ls-tree", "-r", "--name-only", ref, "--", MIGRATIONS_SUBDIR,
    ]);
    return new Set(out.split("\n").filter(Boolean).map((p) => p.split("/").pop()!));
  }
  return new Set();
}

const check: Check = {
  id: "migration-hashes-unique",
  description:
    "every migration filename carries a distinct sha8 (the runner's applied-state key)",
  // Not a pure function of the working tree: trackedBasenames() reads
  // origin/main / main via git ls-tree, so the result can change while the tree
  // is byte-identical. Never cache.
  cacheSignature: () => null,
  async run() {
    const root = await getRoot();
    const dir = resolve(root, MIGRATIONS_SUBDIR);
    const tracked = await trackedBasenames(root);

    // The runner identifies applied migrations by the filename sha8 alone. Two
    // files sharing a hash means the second is silently skipped: it inherits the
    // first's __singularity_migrations row and never runs. Catch the collision
    // here so it fails loudly instead of dropping a backfill on the floor — but
    // only when a branch-local file is involved (the agent can regenerate it).
    const byHash = new Map<string, string[]>();
    for (const f of readdirSync(dir)) {
      const m = MIGRATION_RE.exec(f);
      if (!m) continue;
      const list = byHash.get(m[3]!) ?? [];
      list.push(f);
      byHash.set(m[3]!, list);
    }

    const collisions = [...byHash.entries()].filter(
      ([, files]) => files.length > 1 && files.some((f) => !tracked.has(f)),
    );
    if (collisions.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        "migration filename hash collision (the runner would silently skip all but the first):\n" +
        collisions
          .map(([hash, files]) => `  ${hash}:\n${files.map((f) => `    ${f}`).join("\n")}`)
          .join("\n"),
      hint:
        "Each migration's sha8 must be unique. Custom/backfill migrations once all hashed to " +
        "the empty drizzle placeholder (b3cc75fa); renameMigrations now uniquifies the body at " +
        "generate time. If a branch-local migration has byte-identical content to an existing " +
        "one, rebase onto origin/main and re-run `./singularity build --reset-migration " +
        "--migration-name <slug>` to regenerate it with a distinct hash.",
    };
  },
};

export default check;

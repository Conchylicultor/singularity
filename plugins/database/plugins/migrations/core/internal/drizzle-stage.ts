/**
 * drizzle-kit's view of `data/`: a throwaway out-dir holding only the journal
 * and the snapshot DAG's single tip.
 *
 * drizzle-kit must never read `data/` directly. Its `prepareMigrationFolder`
 * groups every `meta/*.json` by `prevId` and, when two snapshots share one,
 * prints "… is a collision" and exits 0 having written nothing. A merged history
 * always has such a pair — both sides of an upstream update descend from the
 * merge base, and published snapshots are immutable — so every generate after
 * the first merge would silently do nothing. It also only ever uses the last
 * snapshot (`preparePrevSnapshot`), so the tip alone is its whole input; and it
 * no longer schema-validates every one of hundreds of ~250 KB snapshots per run.
 *
 * Both sanctioned invocations stage through this: the CLI's `generateMigration`
 * (which moves what drizzle emitted back into `data/`) and the
 * `migrations-in-sync` check (which only looks at whether anything was emitted).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join, relative, resolve } from "path";
import { DRIZZLE_CONFIG_PATH } from "./drizzle-cli";
import { analyzeSnapshotDag, readSnapshotNodes } from "./snapshot-dag";

/** The prefix of a stage dir under the migrations plugin dir (gitignored). */
export const DRIZZLE_STAGE_PREFIX = ".drizzle-stage-";

/** The snapshot DAG has more than one tip, so drizzle-kit has nothing single to diff against. */
export class UnjoinedSnapshotTipsError extends Error {}

/** A staged out-dir for one `drizzle-kit generate` run. */
export interface DrizzleStage {
  /** `--config` for `drizzleGenerateArgv`, relative to the plugin dir (the cwd). */
  configPath: string;
  /** What drizzle-kit wrote: new `.sql` basenames and new `meta/` snapshot basenames. */
  emitted(): { sql: string[]; snapshots: string[] };
  /** Move everything emitted into `dataDir`, refusing to overwrite. Returns the `.sql` basenames. */
  moveEmittedInto(dataDir: string): string[];
  /** Remove the stage. Always call it (`finally`). */
  dispose(): void;
}

/**
 * Stage `dataDir` for drizzle-kit. `pluginDir` is the absolute migrations
 * plugin dir — drizzle-kit's cwd — under which the stage is created.
 *
 * Throws when the snapshot DAG has more than one tip: which one drizzle should
 * diff against is exactly the question a merge node answers, and the CLI writes
 * one (`joinSnapshotTips`) before it stages.
 */
export async function stageDrizzleOut(
  pluginDir: string,
  dataDir: string,
): Promise<DrizzleStage> {
  const dag = analyzeSnapshotDag(await readSnapshotNodes(dataDir));
  if (dag.tips.length > 1) {
    throw new UnjoinedSnapshotTipsError(
      `the migration snapshot DAG has ${dag.tips.length} tips — drizzle-kit has no single snapshot to diff against:\n` +
        dag.tips.map((t) => `  meta/${t.file}`).join("\n") +
        "\nRun `./singularity build` (it joins published tips with a merge node; a branch-local tip needs `--reset-migration`).",
    );
  }

  const stage = mkdtempSync(join(pluginDir, DRIZZLE_STAGE_PREFIX));
  const out = join(stage, "data");
  const meta = join(out, "meta");
  mkdirSync(meta, { recursive: true });
  const journal = join(dataDir, "meta", "_journal.json");
  if (existsSync(journal)) copyFileSync(journal, join(meta, "_journal.json"));
  const tip = dag.tips[0];
  if (tip) copyFileSync(join(dataDir, "meta", tip.file), join(meta, tip.file));

  const config = join(stage, "drizzle.config.ts");
  writeFileSync(
    config,
    `import base from ${JSON.stringify(resolve(pluginDir, DRIZZLE_CONFIG_PATH))};\n` +
      // RELATIVE to the cwd (the plugin dir), never absolute: drizzle-kit reads
      // each snapshot as `./${"$"}{path}`, so an absolute out-dir becomes
      // `.//abs/...` — ENOENT, and it still exits 0 having written nothing.
      `export default { ...base, out: ${JSON.stringify(`./${relative(pluginDir, out)}`)} };\n`,
  );

  const staged = new Set(tip ? [tip.file] : []);
  const emitted = () => ({
    sql: readdirSync(out)
      .filter((f) => f.endsWith(".sql"))
      .sort(),
    snapshots: readdirSync(meta)
      .filter((f) => f.endsWith("_snapshot.json") && !staged.has(f))
      .sort(),
  });

  return {
    configPath: relative(pluginDir, config),
    emitted,
    moveEmittedInto(target) {
      const { sql, snapshots } = emitted();
      const moves = [
        ...sql.map((f) => [join(out, f), join(target, f)] as const),
        ...snapshots.map(
          (f) => [join(meta, f), join(target, "meta", f)] as const,
        ),
      ];
      for (const [, to] of moves) {
        if (existsSync(to))
          throw new Error(`drizzle-kit emitted ${to}, which already exists`);
      }
      for (const [from, to] of moves) renameSync(from, to);
      return sql;
    },
    dispose() {
      rmSync(stage, { recursive: true, force: true });
    },
  };
}

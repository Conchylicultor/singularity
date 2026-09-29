import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import type {
  Move,
  Outdated,
  Updater,
  UpdaterHold,
  UpdaterSmoke,
} from "@plugins/infra/plugins/deps/plugins/updates/core";
import { uvEnv } from "./uv";

const MINUTE = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a release must have been public before the updater adopts it. The
 * cheapest defence against a hijacked fresh release, while still landing
 * security fixes within days.
 */
export const UV_COOLDOWN_DAYS = 3;

/**
 * Releases not to move to, each with the upstream issue that makes it broken.
 * Added by the agent running a `uv` upgrade when a new release regresses
 * something that is not ours to fix; remove it once a newer release ships past
 * it. The updater never plans a move onto a held release.
 */
export const UV_HOLDS: readonly UpdaterHold[] = [];

/**
 * The newest upload a resolution may use: the start of today (UTC) minus the
 * cooldown. Day-granular, so a `plan` and the `apply` after it agree.
 */
export function uvCutoff(now: Date): string {
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return new Date(today - UV_COOLDOWN_DAYS * DAY_MS).toISOString();
}

/** One uv project, found by its tracked `python/pyproject.toml`. */
interface UvProject {
  /** Repo-relative dir, e.g. `plugins/<…>/hello-python/python`. */
  dir: string;
  /** The owning plugin's folder name — the prefix of a move's name. */
  label: string;
}

/** Every `python/` project in the checkout (tracked, or new and not ignored). */
export async function uvProjects(root: string): Promise<UvProject[]> {
  const result = await spawnCaptured(
    [
      "git",
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ":(glob)plugins/**/python/pyproject.toml",
    ],
    { cwd: root, timeoutMs: MINUTE },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `git ls-files failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
    );
  }
  return result.stdout
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((file) => {
      const dir = dirname(file);
      return { dir, label: basename(dirname(dir)) };
    });
}

/** `Update numpy v2.5.3 -> v2.5.4` lines of a `uv lock` run. */
export function parseLockUpdates(
  output: string,
): Array<{ pkg: string; from: string; to: string }> {
  const out: Array<{ pkg: string; from: string; to: string }> = [];
  for (const line of output.split("\n")) {
    const m = /^Update (\S+) v(\S+) -> v(\S+)$/.exec(line.trim());
    if (m !== null) out.push({ pkg: m[1]!, from: m[2]!, to: m[3]! });
  }
  return out;
}

/** Every `[[package]]`'s version in a `uv.lock`, by name. */
export function parseUvLockVersions(text: string): Map<string, string> {
  const versions = new Map<string, string>();
  let name: string | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("[[package]]")) {
      name = null;
      continue;
    }
    const n = /^name = "([^"]+)"/.exec(line)?.[1];
    if (n !== undefined) {
      name = n;
      continue;
    }
    const v = /^version = "([^"]+)"/.exec(line)?.[1];
    if (v !== undefined && name !== null) versions.set(name, v);
  }
  return versions;
}

async function uvLock(
  root: string,
  project: UvProject,
  args: readonly string[],
): Promise<string> {
  const argv = ["uv", "lock", "--project", join(root, project.dir), ...args];
  const result = await spawnCaptured(argv, {
    cwd: root,
    env: uvEnv(),
    mergeStderr: true,
    timeoutMs: 10 * MINUTE,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `\`${argv.join(" ")}\` failed (exit ${result.exitCode}${result.timedOut ? ", timed out" : ""}):\n${result.stdout.trim()}`,
    );
  }
  return result.stdout;
}

/**
 * Whether `to` is a newer release than `from`, by their leading dotted
 * numbers. A resolution under a cutoff older than the lock's own can propose a
 * DOWNGRADE (same `Update` line); that is never an upgrade. Anything the
 * numbers cannot order counts as newer, so a move is never silently dropped;
 * equal numbers (a pre-release suffix aside) are not newer.
 */
export function isNewerRelease(to: string, from: string): boolean {
  const nums = (v: string) =>
    (/^\d+(?:\.\d+)*/.exec(v)?.[0] ?? "")
      .split(".")
      .filter(Boolean)
      .map(Number);
  const a = nums(to);
  const b = nums(from);
  if (a.length === 0 || b.length === 0) return true;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

const isHeld = (pkg: string, version: string): boolean =>
  UV_HOLDS.some((h) => h.name === pkg && h.version === version);

/** A move's name: `<plugin>:<package>`, e.g. `hello-python:numpy`. */
const moveName = (project: UvProject, pkg: string): string =>
  `${project.label}:${pkg}`;

/**
 * Every `python/` project's `uv.lock`, moved with `uv lock` under a
 * {@link UV_COOLDOWN_DAYS}-day `exclude-newer` cooldown. Each move is one
 * package, pinned to the exact version planned (`--upgrade-package
 * name==version`), so the apply lands exactly what the plan named and a held
 * release is never adopted.
 */
export const uvUpdater: Updater = {
  id: "uv",
  description: `Every python/ project's uv.lock (uv lock, ${UV_COOLDOWN_DAYS}-day release cooldown)`,

  files: async (root) =>
    (await uvProjects(root)).map((p) => join(p.dir, "uv.lock")),

  async detect(root): Promise<Outdated[]> {
    const cutoff = uvCutoff(new Date());
    const out: Outdated[] = [];
    for (const project of await uvProjects(root)) {
      const output = await uvLock(root, project, [
        "--upgrade",
        "--dry-run",
        "--exclude-newer",
        cutoff,
      ]);
      for (const u of parseLockUpdates(output)) {
        if (isHeld(u.pkg, u.to) || !isNewerRelease(u.to, u.from)) continue;
        out.push({
          name: moveName(project, u.pkg),
          current: u.from,
          latest: u.to,
        });
      }
    }
    return out;
  },

  async plan(root, only): Promise<Move[]> {
    const outdated = await uvUpdater.detect(root);
    if (only !== undefined) {
      const known = new Set(
        outdated.flatMap((o) => [o.name, o.name.split(":")[1] ?? o.name]),
      );
      const unknown = only.filter((n) => !known.has(n));
      if (unknown.length > 0) {
        throw new Error(
          `Nothing to move named ${unknown.join(", ")}. Outdated now: ${outdated.map((o) => o.name).join(", ") || "none"}.`,
        );
      }
    }
    return outdated
      .filter(
        (o) =>
          only === undefined ||
          only.includes(o.name) ||
          only.includes(o.name.split(":")[1] ?? ""),
      )
      .map((o) => ({ name: o.name, from: o.current, to: o.latest }));
  },

  async apply(root, moves, log) {
    const cutoff = uvCutoff(new Date());
    for (const project of await uvProjects(root)) {
      const mine = moves.filter((m) => m.name.startsWith(`${project.label}:`));
      if (mine.length === 0) continue;
      const pins = mine.flatMap((m) => [
        "--upgrade-package",
        `${m.name.slice(project.label.length + 1)}==${m.to}`,
      ]);
      log(`  uv lock ${project.dir} (${mine.map((m) => m.name).join(", ")})`);
      await uvLock(root, project, ["--exclude-newer", cutoff, ...pins]);
      const locked = parseUvLockVersions(
        readFileSync(join(root, project.dir, "uv.lock"), "utf8"),
      );
      for (const m of mine) {
        const pkg = m.name.slice(project.label.length + 1);
        if (locked.get(pkg) !== m.to) {
          throw new Error(
            `\`uv lock\` recorded ${pkg} as ${locked.get(pkg) ?? "(absent)"} instead of ${m.to} in ${project.dir}/uv.lock.`,
          );
        }
      }
    }
  },

  // The moved lock must still install: a throwaway `uv sync --frozen` of each
  // touched project, into a temp env removed afterwards.
  async smoke(root, moves): Promise<UpdaterSmoke[]> {
    const env = uvEnv();
    const cacheEnv = {
      UV_CACHE_DIR: env.UV_CACHE_DIR ?? "",
      UV_PYTHON_INSTALL_DIR: env.UV_PYTHON_INSTALL_DIR ?? "",
      UV_PYTHON_PREFERENCE: env.UV_PYTHON_PREFERENCE ?? "",
    };
    return (await uvProjects(root))
      .filter((p) => moves.some((m) => m.name.startsWith(`${p.label}:`)))
      .map((p) => ({
        name: `uv sync (${p.label})`,
        argv: [
          "sh",
          "-c",
          'd=$(mktemp -d) && UV_PROJECT_ENVIRONMENT="$d" uv sync --frozen --no-install-project --no-dev --project "$0"; s=$?; rm -rf "$d"; exit $s',
          p.dir,
        ],
        env: cacheEnv,
        timeoutMs: 30 * MINUTE,
      }));
  },

  holds: {
    entries: UV_HOLDS,
    file: "plugins/infra/plugins/deps/plugins/python/server/internal/uv-updater.ts",
  },
};

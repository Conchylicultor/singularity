#!/usr/bin/env bun
/**
 * Provisions the Node-24 runtime the supervised zero-cache service runs under
 * (resolveNode in start.ts requires major ZERO_NODE_MAJOR; @rocicorp/zero-sqlite3's
 * native addon is built for exactly that ABI). zero-cache CANNOT run under Bun,
 * and the dev host may run a different Node major — so we download the official
 * Node tarball from nodejs.org, checksum-verify, and cache it under SINGULARITY_DIR.
 *
 * Invoked via the cache-service `provision/index.ts` contribution, which the
 * framework provisioning runner drives from the root `postinstall`. Modeled on
 * ensure-zero-sqlite3.ts: ALIAS-FREE (node builtins + relative imports only,
 * because it runs in the `bun install` postinstall context where @plugins doesn't
 * resolve), idempotent (stat-first early return), and fail-loud (throws with an
 * actionable message naming SINGULARITY_ZERO_NODE as the offline/proxy escape
 * hatch). Steady state is a noop when a compatible Node is already cached or on
 * PATH — only hosts lacking Node 24 pay the ~35 MB download, once.
 */
import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/core";
import {
  ZERO_NODE_BUILD_TARGET,
  ZERO_NODE_MAJOR,
  zeroNodeCacheDir,
} from "../shared/internal/node-runtime";

/** Probe a `node` executable's major version. Returns NaN if it can't be run. */
function nodeMajor(bin: string): number {
  const probe = spawnSync(bin, ["--version"], { encoding: "utf-8" });
  if (probe.status !== 0 || typeof probe.stdout !== "string") return NaN;
  return Number.parseInt(probe.stdout.trim().replace(/^v/, "").split(".")[0] ?? "", 10);
}

/**
 * Best-effort removal of a temp artifact during cleanup. A failure to delete a
 * leftover temp file must NOT mask the real provisioning error, so we drop it —
 * this is the sanctioned last-resort swallow (best-effort teardown).
 */
async function bestEffortRemove(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
    // Best-effort cleanup of a temp artifact during teardown: any propagation
    // here would mask the real provisioning error we are already throwing, so a
    // delete failure is dropped on purpose (the sanctioned last-resort swallow).
    // eslint-disable-next-line promise-safety/no-bare-catch -- best-effort temp-artifact cleanup; a delete failure must not mask the real provisioning error
  } catch {
    /* ignore */
  }
}

export async function ensureZeroNode(): Promise<void> {
  const cacheDir = zeroNodeCacheDir(SINGULARITY_DIR);
  const cachedNode = join(cacheDir, "bin", "node");

  // 1. Already cached and compatible → noop.
  if (existsSync(cachedNode) && nodeMajor(cachedNode) === ZERO_NODE_MAJOR) return;

  // 2. Host `node` on PATH already satisfies → no download.
  if (nodeMajor("node") === ZERO_NODE_MAJOR) return;

  // 3. Download + verify + extract the official Node tarball.
  const plat = process.platform;
  if (plat !== "darwin" && plat !== "linux") {
    throw new Error(
      `ensure-zero-node: unsupported platform '${plat}'. zero-cache needs Node ` +
        `v${ZERO_NODE_MAJOR}; no managed download is available here. Install Node ` +
        `${ZERO_NODE_MAJOR} and set SINGULARITY_ZERO_NODE to its absolute path.`,
    );
  }
  const archMap: Record<string, string> = { arm64: "arm64", x64: "x64" };
  const arch = archMap[process.arch];
  if (!arch) {
    throw new Error(
      `ensure-zero-node: unsupported arch '${process.arch}'. zero-cache needs Node ` +
        `v${ZERO_NODE_MAJOR}; no managed download is available here. Install Node ` +
        `${ZERO_NODE_MAJOR} and set SINGULARITY_ZERO_NODE to its absolute path.`,
    );
  }

  const tarball = `node-v${ZERO_NODE_BUILD_TARGET}-${plat}-${arch}.tar.gz`;
  const baseUrl = `https://nodejs.org/dist/v${ZERO_NODE_BUILD_TARGET}/`;
  const tarUrl = `${baseUrl}${tarball}`;
  const shaUrl = `${baseUrl}SHASUMS256.txt`;

  const tarTmp = `${cacheDir}.download.tmp.tar.gz`;
  const extractTmp = `${cacheDir}.extract.tmp`;

  try {
    // Download the tarball (global fetch honors HTTP(S)_PROXY env).
    console.log(`ensure-zero-node: downloading ${tarUrl}`);
    const tarRes = await fetch(tarUrl);
    if (!tarRes.ok) {
      throw new Error(`GET ${tarUrl} → ${tarRes.status} ${tarRes.statusText}`);
    }
    const tarBytes = new Uint8Array(await tarRes.arrayBuffer());

    // Fetch + parse the checksum manifest, find the line for our tarball.
    console.log(`ensure-zero-node: verifying sha256 (${shaUrl})`);
    const shaRes = await fetch(shaUrl);
    if (!shaRes.ok) {
      throw new Error(`GET ${shaUrl} → ${shaRes.status} ${shaRes.statusText}`);
    }
    const shaText = await shaRes.text();
    // SHASUMS256.txt lines are `<sha256>  <filename>` (two spaces) or, for
    // binary mode, `<sha256> *<filename>`. Match on the whitespace/`*`-delimited
    // filename so a tarball name can't be a suffix of an unrelated one.
    const shaLine = shaText
      .split("\n")
      .find((line) => /[\s*]/.test(line) && line.trim().split(/[\s*]+/).pop() === tarball);
    if (!shaLine) {
      throw new Error(`no SHASUMS256 entry for ${tarball}`);
    }
    const expected = shaLine.trim().split(/\s+/)[0] ?? "";
    const got = createHash("sha256").update(tarBytes).digest("hex");
    if (expected !== got) {
      throw new Error(
        `sha256 mismatch for ${tarball} (expected ${expected}, got ${got})`,
      );
    }

    // Extract to a temp dir, then atomically rename into place.
    console.log(`ensure-zero-node: extracting to ${cacheDir}`);
    await rm(tarTmp, { force: true });
    await rm(extractTmp, { recursive: true, force: true });
    await mkdir(dirname(tarTmp), { recursive: true });
    await writeFile(tarTmp, tarBytes);
    await mkdir(extractTmp, { recursive: true });
    // --strip-components=1 drops the top-level `node-v.../` dir so `bin/node`
    // lands directly in the dir we rename to cacheDir.
    const tar = spawnSync(
      "tar",
      ["-xzf", tarTmp, "-C", extractTmp, "--strip-components=1"],
      { stdio: "inherit" },
    );
    if (tar.status !== 0) {
      throw new Error(
        `tar extract failed (exit ${tar.status ?? "signal " + tar.signal}) for ${tarTmp}`,
      );
    }

    await rm(cacheDir, { recursive: true, force: true });
    await mkdir(dirname(cacheDir), { recursive: true });
    await rename(extractTmp, cacheDir);
  } catch (err) {
    // Clean up partial artifacts so a retry starts fresh.
    await bestEffortRemove(tarTmp);
    await bestEffortRemove(extractTmp);
    throw new Error(
      `ensure-zero-node: failed to provision Node v${ZERO_NODE_BUILD_TARGET} ` +
        `(${plat}-${arch}): ${err instanceof Error ? err.message : String(err)}. ` +
        `If offline or behind a proxy, install Node ${ZERO_NODE_MAJOR} manually ` +
        `and set SINGULARITY_ZERO_NODE to its absolute path.`,
    );
  } finally {
    await bestEffortRemove(tarTmp);
  }

  // Verify the extracted runtime is actually usable + the right major.
  if (!existsSync(cachedNode) || nodeMajor(cachedNode) !== ZERO_NODE_MAJOR) {
    throw new Error(
      `ensure-zero-node: extracted runtime at ${cachedNode} is missing or not ` +
        `Node v${ZERO_NODE_MAJOR}. Set SINGULARITY_ZERO_NODE to a Node ` +
        `${ZERO_NODE_MAJOR} binary's absolute path.`,
    );
  }
  console.log(`ensure-zero-node: provisioned Node v${ZERO_NODE_BUILD_TARGET} at ${cachedNode}`);
}

import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { ReleaseManifestSchema } from "../../core";
import type { BundleResolution } from "../../core";
import { bundleRoot, isPointerName, latestPointerName, latestPointerPath } from "./pointer";

/**
 * Resolve which bundle to ship for `(composition, platform)`.
 *
 * The canonical filesystem layout IS the registry (see
 * `plugins/release/CLAUDE.md`, §Discovery) — there is no DB query: run dirs
 * under {@link bundleRoot}, a `latest-<platform>` symlink at the current packed
 * one, and a self-describing `RELEASE.json` inside each.
 *
 * Every manifest field is cross-checked against something ELSE that knows it, so
 * a mismatch is caught here — loudly, by name — rather than at `systemctl
 * start`, where it would present as a crash loop.
 *
 * Failure is a `{ ok: false, refusal }` value, not an exit: this is asked both
 * by the CLI (which prints and exits) and by an HTTP handler (which cannot).
 * A *corrupt* RELEASE.json is not in that union — `ReleaseManifestSchema.parse`
 * throws, because a broken artifact is not a refusal a user can act on.
 */
export function resolveBundle(opts: {
  composition: string;
  platform: string;
  release?: string;
}): BundleResolution {
  const { composition, platform } = opts;
  const { namespace, compDir } = bundleRoot(composition);
  if (!existsSync(compDir)) {
    return {
      ok: false,
      refusal: { kind: "no-releases", composition, platform, compDir, namespace },
    };
  }

  let runDir: string;
  if (opts.release !== undefined) {
    runDir = join(compDir, opts.release);
    if (!existsSync(runDir)) {
      return {
        ok: false,
        refusal: {
          kind: "no-such-run",
          release: opts.release,
          runDir,
          compDir,
          available: readdirSync(compDir).filter((d) => !isPointerName(d)),
          namespace,
        },
      };
    }
  } else {
    const pointerPath = latestPointerPath(compDir, platform);
    if (!existsSync(pointerPath)) {
      return {
        ok: false,
        refusal: {
          kind: "no-pointer",
          pointer: latestPointerName(platform),
          pointerPath,
          namespace,
        },
      };
    }
    runDir = realpathSync(pointerPath);
  }

  const manifestPath = join(runDir, "RELEASE.json");
  if (!existsSync(manifestPath)) {
    return { ok: false, refusal: { kind: "no-manifest", runDir } };
  }
  const manifest = ReleaseManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));

  if (manifest.composition !== composition) {
    return {
      ok: false,
      refusal: {
        kind: "wrong-composition",
        manifestPath,
        found: manifest.composition,
        expected: composition,
      },
    };
  }
  if (manifest.target !== "web") {
    return {
      ok: false,
      refusal: { kind: "wrong-target", manifestPath, found: manifest.target },
    };
  }
  // The platform is DISCOVERED on both sides — the release's own record of what
  // it built, and the server's own `uname`. Comparing two observed facts leaves
  // no third place for a human to have typed it wrong.
  if (manifest.platform !== platform) {
    return {
      ok: false,
      refusal: {
        kind: "platform-mismatch",
        manifestPath,
        found: manifest.platform,
        expected: platform,
      },
    };
  }
  const runId = basename(runDir);
  if (manifest.runId !== runId) {
    return {
      ok: false,
      refusal: {
        kind: "inconsistent-run-id",
        manifestPath,
        declared: manifest.runId,
        runId,
      },
    };
  }

  const binaryName = `${composition}-web-${platform}`;
  const localPath = join(runDir, "dist", binaryName);
  if (!existsSync(localPath)) {
    return { ok: false, refusal: { kind: "not-packed", localPath } };
  }
  return { ok: true, runId, localPath, binaryName, manifest };
}

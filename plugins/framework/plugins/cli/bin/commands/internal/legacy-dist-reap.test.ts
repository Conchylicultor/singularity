/**
 * Gate arms for the legacy in-checkout dist reaper. The gate is destructive and
 * the ONE dangerous thing in this module, so each arm is exercised against a
 * real HTTP server speaking the gateway's actual `GET /gateway/worktrees` shape
 * — the fetch/parse path is part of what must be right, not a mock boundary.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { worktreeArtifacts } from "@plugins/infra/plugins/paths/server";
import { asNamespace } from "@plugins/infra/plugins/namespace/core";
import { reapLegacyCheckoutDist } from "./legacy-dist-reap";

const tmp = mkdtempSync(join(tmpdir(), "legacy-dist-reap-test-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const NAMESPACE = asNamespace("reap-test-ns");
const NEW_PATH = worktreeArtifacts.webDist(NAMESPACE);
const LEGACY_PATH = "/some/checkout/plugins/framework/plugins/web-core/dist";

/** A checkout web-core dir carrying the pre-S4 legacy trees plus real sources. */
function makeWebDir(label: string): string {
  const webDir = join(tmp, label);
  for (const entry of [
    "dist",
    "dist.live.42",
    "dist.staging.7",
    "dist.old.1",
    "core",
    "web",
  ]) {
    mkdirSync(join(webDir, entry), { recursive: true });
  }
  writeFileSync(join(webDir, "package.json"), "{}");
  return webDir;
}

/** A stand-in gateway serving one canned `/gateway/worktrees` body. */
async function withGateway<T>(
  body: unknown,
  fn: (origin: string) => Promise<T>,
): Promise<T> {
  const server = Bun.serve({
    port: 0,
    fetch: (req) =>
      new URL(req.url).pathname === "/gateway/worktrees"
        ? Response.json(body)
        : new Response("not found", { status: 404 }),
  });
  try {
    return await fn(`http://localhost:${server.port}`);
  } finally {
    await server.stop(true);
  }
}

function entry(name: string, web: string) {
  return {
    name,
    state: "running",
    server: "/somewhere/server-core",
    web,
    lastSpawnErr: "",
  };
}

describe("reapLegacyCheckoutDist gate", () => {
  test("gateway reports the NEW path ⇒ reaps the legacy trees, keeps sources", async () => {
    const webDir = makeWebDir("open");
    const result = await withGateway(
      [entry("other-ns", LEGACY_PATH), entry(NAMESPACE, NEW_PATH)],
      (origin) =>
        reapLegacyCheckoutDist({
          webDir,
          namespace: NAMESPACE,
          gatewayOrigin: origin,
        }),
    );

    expect(result.kind).toBe("reaped");
    if (result.kind !== "reaped") throw new Error("unreachable");
    expect(result.entries.sort()).toEqual([
      "dist",
      "dist.live.42",
      "dist.old.1",
      "dist.staging.7",
    ]);
    expect(existsSync(join(webDir, "dist"))).toBe(false);
    // Non-dist siblings are untouched — the reaper only knows dist-family names.
    expect(existsSync(join(webDir, "core"))).toBe(true);
    expect(existsSync(join(webDir, "web"))).toBe(true);
    expect(existsSync(join(webDir, "package.json"))).toBe(true);
  });

  test("gateway still reports the OLD path ⇒ skips, naming the live tree", async () => {
    const webDir = makeWebDir("stale");
    const result = await withGateway(
      [entry(NAMESPACE, LEGACY_PATH)],
      (origin) =>
        reapLegacyCheckoutDist({
          webDir,
          namespace: NAMESPACE,
          gatewayOrigin: origin,
        }),
    );

    expect(result.kind).toBe("skipped");
    if (result.kind !== "skipped") throw new Error("unreachable");
    expect(result.reason).toContain(LEGACY_PATH);
    expect(result.reason).toContain("would delete the live tree");
    expect(existsSync(join(webDir, "dist"))).toBe(true);
    expect(existsSync(join(webDir, "dist.live.42"))).toBe(true);
  });

  test("namespace unknown to the gateway ⇒ skips", async () => {
    const webDir = makeWebDir("unknown");
    const result = await withGateway(
      [entry("someone-else", NEW_PATH)],
      (origin) =>
        reapLegacyCheckoutDist({
          webDir,
          namespace: NAMESPACE,
          gatewayOrigin: origin,
        }),
    );

    expect(result.kind).toBe("skipped");
    if (result.kind !== "skipped") throw new Error("unreachable");
    expect(result.reason).toContain(`does not know namespace "${NAMESPACE}"`);
    expect(existsSync(join(webDir, "dist"))).toBe(true);
  });

  test("gateway unreachable (bare release host) ⇒ skips, does not throw", async () => {
    const webDir = makeWebDir("unreachable");
    // Bind an ephemeral port, then release it: nothing is listening there.
    const probe = Bun.serve({ port: 0, fetch: () => new Response("x") });
    const deadOrigin = `http://localhost:${probe.port}`;
    await probe.stop(true);

    const result = await reapLegacyCheckoutDist({
      webDir,
      namespace: NAMESPACE,
      gatewayOrigin: deadOrigin,
    });

    expect(result.kind).toBe("skipped");
    if (result.kind !== "skipped") throw new Error("unreachable");
    expect(result.reason).toContain("gateway unreachable");
    expect(existsSync(join(webDir, "dist"))).toBe(true);
  });

  test("malformed answer (entry without a web field) ⇒ skips", async () => {
    const webDir = makeWebDir("malformed");
    const result = await withGateway(
      [{ name: NAMESPACE, state: "running" }],
      (origin) =>
        reapLegacyCheckoutDist({
          webDir,
          namespace: NAMESPACE,
          gatewayOrigin: origin,
        }),
    );

    expect(result.kind).toBe("skipped");
    if (result.kind !== "skipped") throw new Error("unreachable");
    expect(result.reason).toContain("has no web path");
    expect(existsSync(join(webDir, "dist"))).toBe(true);
  });

  test("gate open on an already-clean checkout ⇒ reaped with zero entries", async () => {
    const webDir = join(tmp, "already-clean");
    mkdirSync(join(webDir, "core"), { recursive: true });
    const result = await withGateway([entry(NAMESPACE, NEW_PATH)], (origin) =>
      reapLegacyCheckoutDist({
        webDir,
        namespace: NAMESPACE,
        gatewayOrigin: origin,
      }),
    );

    // The steady state, and NOT the same fact as a refusal — that distinction is
    // exactly why the result is discriminated.
    expect(result).toEqual({ kind: "reaped", entries: [] });
  });
});

import { z } from "zod";
import { pickHostEnv } from "@plugins/infra/plugins/launcher/core";
import { resolveClaudeBin } from "@plugins/infra/plugins/paths/server";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import type { ClaudeCodeStatus } from "../../core";

/** Each probe starts a Node process (~0.5 s); this is a ceiling, not an estimate. */
const PROBE_TIMEOUT_MS = 20_000;

/**
 * The fields of `claude auth status --json` this reads. Signed in (Claude Code
 * 2.1.282): `{"loggedIn":true,"authMethod":"claude.ai",…,"email":"…"}`.
 */
const AuthStatusSchema = z.object({
  loggedIn: z.boolean(),
  authMethod: z.string().optional(),
  email: z.string().optional(),
});

/**
 * Run the probes with the same closed host environment an agent pane and a
 * one-shot `claude --print` get (`pickHostEnv`), so the answer is about the
 * account THEY would use — not whatever this backend happened to inherit.
 */
const env = pickHostEnv(process.env);

async function run(bin: string, args: string[]) {
  return spawnCaptured([bin, ...args], {
    cwd: "/tmp",
    env,
    timeoutMs: PROBE_TIMEOUT_MS,
  });
}

function failure(what: string, r: Awaited<ReturnType<typeof run>>): string {
  if (r.timedOut)
    return `\`${what}\` did not answer within ${PROBE_TIMEOUT_MS / 1000}s`;
  const detail = (r.stderr.trim() || r.stdout.trim() || "no output").slice(
    0,
    300,
  );
  return `\`${what}\` exited ${r.exitCode}: ${detail}`;
}

/**
 * Ask the machine, now: is Claude Code installed, and is it signed in?
 *
 * Never throws for a Claude Code problem — every way the answer can come out is
 * an arm of {@link ClaudeCodeStatus}. `claude auth status` is read for its
 * JSON whatever its exit code, since a signed-out CLI may exit non-zero.
 */
export async function probeClaudeCode(): Promise<ClaudeCodeStatus> {
  const bin = resolveClaudeBin();
  if (bin.kind === "missing")
    return { kind: "missing", searched: bin.searched };

  const [version, auth] = await Promise.all([
    run(bin.path, ["--version"]),
    run(bin.path, ["auth", "status", "--json"]),
  ]);

  if (version.timedOut || version.exitCode !== 0) {
    return { kind: "unreadable", error: failure("claude --version", version) };
  }
  // "2.1.282 (Claude Code)" → "2.1.282".
  const versionText = version.stdout.trim().split(/\s+/)[0] ?? "";

  if (auth.timedOut) {
    return { kind: "unreadable", error: failure("claude auth status", auth) };
  }
  let json: unknown;
  try {
    json = JSON.parse(auth.stdout);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return {
      kind: "unreadable",
      error: failure("claude auth status --json", auth),
    };
  }
  const parsed = AuthStatusSchema.safeParse(json);
  if (!parsed.success) {
    return {
      kind: "unreadable",
      error: `\`claude auth status --json\` printed an unexpected shape: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    };
  }
  if (!parsed.data.loggedIn)
    return { kind: "signed-out", version: versionText };
  return {
    kind: "ready",
    version: versionText,
    authMethod: parsed.data.authMethod ?? null,
    email: parsed.data.email ?? null,
  };
}

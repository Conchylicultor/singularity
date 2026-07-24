/**
 * Run one command on a remote host over SSH, hermetically.
 *
 * "Hermetically" is the whole point: the connection is made with EXACTLY the
 * host, port, user and private key the caller passed, and with nothing else the
 * machine happens to have lying around. See the argv comments below — the
 * isolation flags are security-critical, not hygiene.
 *
 * The key is materialized into a `mkdtemp` scratch dir at mode 0600 and the
 * whole dir is `rm -rf`'d in `finally`, the same shape (and the same lifetime
 * discipline) as the existing `ssh-keygen` helper in deploy/servers.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import { classify, failureMessage } from "./classify";
import type { SshRunResult, SshTarget } from "./types";

/** Wall-clock ceiling for a whole attempt when the caller doesn't set one. */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * What fraction of the total budget OpenSSH's own `ConnectTimeout` gets.
 *
 * Strictly less than 1 on purpose. The two bounds cover different failures —
 * `ConnectTimeout` bounds the TCP connect, the spawn deadline bounds everything
 * (a handshake that wedges past connect) — but if they expired together the
 * race would usually be won by our SIGTERM, leaving an empty stderr and a
 * killed child. Giving ssh the earlier deadline lets it lose first and *say so*
 * ("Operation timed out"), so the classified failure carries OpenSSH's own
 * diagnostic instead of nothing. The spawn deadline stays the real backstop.
 */
const CONNECT_TIMEOUT_FRACTION = 0.6;

/**
 * Open an SSH session to `target`, run `command`, and return a discriminated
 * result. Never throws for a remote-side problem — an unreachable host, a
 * rejected key and a changed host key are all expected states of a machine the
 * user is still setting up, so they come back as `{ ok: false, kind }` for the
 * caller to render. A local fault (cannot write the scratch key) still throws.
 *
 * `command` is an argv array, joined with spaces for the remote login shell —
 * OpenSSH has no argv-preserving remote exec, so callers should keep commands
 * simple and shell-metacharacter-free.
 */
export async function sshRun(target: SshTarget, command: string[]): Promise<SshRunResult> {
  const timeoutMs = target.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const dir = await mkdtemp(join(tmpdir(), "sg-ssh-"));
  try {
    const keyPath = join(dir, "id");
    const knownHostsPath = join(dir, "known_hosts");
    await Promise.all([
      // OpenSSH refuses a private key readable by anyone else, and requires the
      // file to end in a newline.
      writeFile(keyPath, ensureTrailingNewline(target.privateKey), { mode: 0o600 }),
      // In `learn` mode this starts empty and ssh appends what it accepts.
      writeFile(
        knownHostsPath,
        target.hostKey.mode === "pinned"
          ? ensureTrailingNewline(target.hostKey.knownHostsLine)
          : "",
        { mode: 0o600 },
      ),
    ]);

    const argv = [
      "ssh",
      // Never prompt for anything: no password, no passphrase, no
      // host-key confirmation. A prompt would block on a TTY read forever.
      "-o",
      "BatchMode=yes",
      // === The isolation flags: load-bearing, NOT hygiene. ===
      // Without these, the machine's own ambient SSH credentials could
      // authenticate the session, and a "test this key works" check would pass
      // green while proving nothing about the key we were handed.
      //   IdentitiesOnly  — offer ONLY the -i key, no other configured identity.
      //   IdentityAgent   — ignore the host's ssh-agent entirely.
      //   -F /dev/null    — ignore ~/.ssh/config AND the system-wide config, so
      //                     no ambient IdentityFile / ProxyJump / ControlMaster
      //                     (a live multiplexed session is the same leak as an
      //                     agent key) can influence or short-circuit the dial.
      "-o",
      "IdentitiesOnly=yes",
      "-o",
      "IdentityAgent=none",
      "-F",
      "/dev/null",
      "-o",
      "PasswordAuthentication=no",
      // The pin is ours alone: the only known_hosts that counts is the scratch
      // file, never the machine's.
      "-o",
      "GlobalKnownHostsFile=/dev/null",
      "-o",
      `UserKnownHostsFile=${knownHostsPath}`,
      // Learned lines must be readable back out to be persisted and pinned.
      "-o",
      "HashKnownHosts=no",
      // There is deliberately no "off" here — an unverified host is never a
      // successful connection. `accept-new` is trust-on-first-use; `yes`
      // requires an exact match against the line we pinned.
      "-o",
      `StrictHostKeyChecking=${target.hostKey.mode === "pinned" ? "yes" : "accept-new"}`,
      // Bounds the TCP connect only, and deliberately expires BEFORE the spawn
      // deadline (see CONNECT_TIMEOUT_FRACTION) so ssh gets to report the
      // timeout itself. The handshake past connect is bounded by the spawn
      // deadline below — which is why that deadline exists.
      "-o",
      `ConnectTimeout=${Math.max(1, Math.round((timeoutMs * CONNECT_TIMEOUT_FRACTION) / 1000))}`,
      "-i",
      keyPath,
      "-p",
      String(target.port),
      "-l",
      target.user,
      // End of options BEFORE the host: everything after the hostname is the
      // remote command, so a `--` placed after it would be sent to the remote
      // shell as a literal word.
      "--",
      target.host,
      ...command,
    ];

    const result = await spawnCaptured(argv, { timeoutMs });
    // A signal-killed child (including our own deadline) has no exit status of
    // its own — reporting one would be inventing it.
    const exitCode = result.signalCode === null ? result.exitCode : null;

    if (result.exitCode === 0 && !result.timedOut) {
      return {
        ok: true,
        stdout: result.stdout,
        stderr: result.stderr,
        learnedHostKey:
          target.hostKey.mode === "learn" ? await readLearnedHostKey(knownHostsPath) : null,
      };
    }

    const kind = classify(exitCode, result.signalCode, result.stderr, result.timedOut);
    return {
      ok: false,
      kind,
      message: failureMessage(kind, result.stderr),
      stderr: result.stderr,
      exitCode,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Read back the host key `accept-new` just learned. `HashKnownHosts=no` keeps
 * the line plain, so the caller can store it and pin it on the next attempt.
 * Returns `null` when ssh wrote nothing — possible for a host that presented no
 * new key (already pinned by a caller that passed `learn` anyway), which is a
 * legitimately-empty success rather than a failure.
 */
async function readLearnedHostKey(knownHostsPath: string): Promise<string | null> {
  const contents = await readFile(knownHostsPath, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (trimmed !== "" && !trimmed.startsWith("#")) return trimmed;
  }
  return null;
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}
